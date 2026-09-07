import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import type {
  FormSchema,
  FormEngineConfig,
  FieldBehavior,
  FieldDefinition,
  ValidationRule,
  FormRuntimeConfig,
  OptionSourceConfig,
  OptionItem,
  SubFormColumn,
  RuntimeDataQueryParams,
} from '../types';
import { FormContext } from './FormContext';
import type { FormContextValue } from './FormContext';
import { ComponentRegistryProvider } from './ComponentRegistry';
import { defaultComponentRegistry } from './defaultRegistry';
import {
  evaluateEffects,
  evaluateFieldOverrides,
  evaluateLayoutBehaviors,
  getValueActions,
} from './effects';
import { validateField as validateFieldUtil, validateAllFields } from './validation';
import { createFormRuntimeApi } from './runtimeApi';
import { resolveOptions, resolveDefaultValueLinkage } from './optionSource';
import {
  normalizeDepartmentArray,
  normalizeUser,
  normalizeUserArray,
} from '../fields/shared/fieldFormat';

const LINKAGE_DEBOUNCE_MS = 500;

export interface FormProviderProps {
  schema: FormSchema;
  config: FormEngineConfig;
  initialValues?: Record<string, any>;
  components?: Record<string, React.ComponentType<any>>;
  runtime?: FormRuntimeConfig;
  children: React.ReactNode;
}

type ScopedSubFormField = {
  parent: FieldDefinition;
  rowIndex: number;
  column: SubFormColumn;
  scopedFieldId: string;
};

function isInactiveBehavior(behavior?: FieldBehavior) {
  return behavior === 'HIDDEN' || behavior === 'DISABLED';
}

function buildValidationRules(
  label: string,
  required?: boolean,
  rules?: ValidationRule[],
): ValidationRule[] {
  const result: ValidationRule[] = [];
  if (required) {
    result.push({ required: true, message: `${label}为必填项` });
  }
  if (rules) {
    result.push(...rules);
  }
  return result;
}

function getSubFormRows(formData: Record<string, any>, fieldId: string): Record<string, any>[] {
  const rows = formData[fieldId];
  return Array.isArray(rows) ? rows : [];
}

function getSubFormColumns(field: FieldDefinition): SubFormColumn[] {
  return Array.isArray(field.columns) ? field.columns : [];
}

function getScopedSubFormField(
  fields: FieldDefinition[],
  scopedFieldId: string,
): ScopedSubFormField | null {
  const [parentFieldId, rowIndexText, ...columnParts] = scopedFieldId.split('.');
  if (!parentFieldId || !rowIndexText || columnParts.length === 0) return null;

  const rowIndex = Number(rowIndexText);
  if (!Number.isInteger(rowIndex) || rowIndex < 0) return null;

  const parent = fields.find(
    (field) => field.fieldId === parentFieldId && field.componentName === 'SubFormField',
  );
  if (!parent) return null;

  const columnFieldId = columnParts.join('.');
  const column = getSubFormColumns(parent).find((item) => item.fieldId === columnFieldId);
  if (!column) return null;

  return {
    parent,
    rowIndex,
    column,
    scopedFieldId,
  };
}

function clearFieldAndChildrenErrors(
  errors: Record<string, string>,
  fieldId: string,
): Record<string, string> {
  let changed = false;
  const next = { ...errors };
  for (const key of Object.keys(next)) {
    if (key === fieldId || key.startsWith(`${fieldId}.`)) {
      delete next[key];
      changed = true;
    }
  }
  return changed ? next : errors;
}

function replaceFieldAndChildrenErrors(
  errors: Record<string, string>,
  fieldId: string,
  nextErrors: Record<string, string>,
): Record<string, string> {
  return {
    ...clearFieldAndChildrenErrors(errors, fieldId),
    ...nextErrors,
  };
}

function replaceSingleFieldError(
  errors: Record<string, string>,
  fieldId: string,
  error: string | null,
): Record<string, string> {
  if (error) {
    return { ...errors, [fieldId]: error };
  }
  if (!errors[fieldId]) return errors;
  const next = { ...errors };
  delete next[fieldId];
  return next;
}

function collectSubFormValidationRules(
  field: FieldDefinition,
  formData: Record<string, any>,
  validationData: Record<string, any>,
  fieldRules: Record<string, ValidationRule[]>,
) {
  const rows = getSubFormRows(formData, field.fieldId);
  if (rows.length === 0) return;

  for (const [rowIndex, row] of rows.entries()) {
    for (const column of getSubFormColumns(field)) {
      if (isInactiveBehavior(column.behavior)) continue;
      const rules = buildValidationRules(column.label, column.required, column.rules);
      if (rules.length === 0) continue;

      const scopedFieldId = `${field.fieldId}.${rowIndex}.${column.fieldId}`;
      validationData[scopedFieldId] = row?.[column.fieldId];
      fieldRules[scopedFieldId] = rules;
    }
  }
}

function mapRuntimeOperatorToAdvanced(operator?: string) {
  const normalized = String(operator || 'eq').toLowerCase();
  const map: Record<string, string> = {
    eq: 'EQ',
    ne: 'NEQ',
    neq: 'NEQ',
    contains: 'CONTAINS',
    like: 'LIKE',
    gt: 'GT',
    gte: 'GTE',
    lt: 'LT',
    lte: 'LTE',
    in: 'IN',
    notin: 'NOT_IN',
    empty: 'IS_NULL',
    notempty: 'IS_NOT_NULL',
  };
  return map[normalized] || normalized.toUpperCase();
}

async function fetchRuntimeFormData(
  api: ReturnType<typeof createFormRuntimeApi>,
  appType: string,
  params: RuntimeDataQueryParams,
) {
  const filters = (params.filters || [])
    .filter((filter) => filter.fieldId)
    .map((filter) => ({
      key: filter.fieldId,
      value: filter.value,
      operator: mapRuntimeOperatorToAdvanced(filter.operator),
    }));
  const order = params.sort
    ? [{ id: params.sort.field, isAsc: params.sort.order === 'asc' ? 'y' : 'n' }]
    : undefined;
  const response = await api.request<any>({
    url: `/${params.appType || appType}/v1/form/advancedSearch.json`,
    method: 'get',
    params: {
      formUuid: params.formUuid,
      pageSize: params.pageSize ?? 200,
      currentPage: params.currentPage ?? 1,
      filters: filters.length > 0 ? JSON.stringify(filters) : undefined,
      conditionType: params.conditionLogic?.toUpperCase(),
      order: order ? JSON.stringify(order) : undefined,
    },
  });
  const payload = unwrapRuntimePayload(response);
  const data = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  return {
    data,
    totalCount: Number(payload?.totalCount ?? payload?.total ?? payload?.count ?? data.length),
  };
}

export function FormProvider({
  schema,
  config,
  initialValues,
  components,
  runtime,
  children,
}: FormProviderProps) {
  const api = useMemo(() => createFormRuntimeApi(config.api), [config.api]);
  const [runtimeDefaults, setRuntimeDefaults] = useState<FormRuntimeConfig>({});
  const effects = useMemo(
    () => [
      ...(schema.rules ?? []),
      ...schema.fields.flatMap((field) => field.optionEffects ?? []),
      ...(config.effects ?? []),
    ],
    [schema.rules, schema.fields, config.effects],
  );

  // Merge runtime from schema and props (props take precedence)
  const defaultRuntime = useMemo<FormRuntimeConfig>(
    () => ({
      appType: config.appType,
      fetchFormData: (params) => fetchRuntimeFormData(api, config.appType, params),
    }),
    [api, config.appType],
  );
  const mergedRuntime = useMemo(
    () => ({ ...defaultRuntime, ...schema.runtime, ...runtimeDefaults, ...runtime }),
    [defaultRuntime, schema.runtime, runtimeDefaults, runtime],
  );

  // Build initial values from schema defaults + explicit initial values
  const computedInitialValues = useMemo(() => {
    const values: Record<string, any> = {};
    for (const field of schema.fields) {
      const defaultValue = resolveDefaultValue(field, mergedRuntime);
      if (defaultValue !== undefined) {
        values[field.fieldId] = defaultValue;
      }
    }
    return { ...values, ...initialValues };
  }, [schema, initialValues, mergedRuntime]);

  const initialValuesRef = useRef(computedInitialValues);
  const [formData, setFormData] = useState<Record<string, any>>({ ...computedInitialValues });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [componentFieldErrors, setComponentFieldErrors] = useState<Record<string, string>>({});
  const [registeredFields] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!schema.fields.some((field) => needsCurrentUserRuntime(field.defaultShortcut?.type)))
      return;
    if (mergedRuntime.currentUser && mergedRuntime.currentDepartment) return;
    let cancelled = false;
    api
      .getUserById('current')
      .then((payload) => {
        if (cancelled || !payload) return;
        const currentUser = normalizeUser(unwrapRuntimePayload(payload));
        const departments = normalizeDepartmentArray((currentUser as any).departments);
        const currentDepartment = departments[0];
        const currentUserManagers = normalizeUserArray(
          (currentUser as any).managers ||
            (currentUser as any).managerUsers ||
            (currentUser as any).leaders ||
            (currentUser as any).supervisors,
        );
        setRuntimeDefaults((prev) => ({
          ...prev,
          currentUser: prev.currentUser || currentUser,
          currentDepartment: prev.currentDepartment || currentDepartment,
          currentUserManagers: prev.currentUserManagers || currentUserManagers,
        }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api, mergedRuntime.currentDepartment, mergedRuntime.currentUser, schema.fields]);

  useEffect(() => {
    setFormData((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const field of schema.fields) {
        if (!field.defaultShortcut?.type || !isBlankFormValue(next[field.fieldId])) continue;
        const defaultValue = resolveDefaultValue(field, mergedRuntime);
        if (isBlankFormValue(defaultValue)) continue;
        next[field.fieldId] = defaultValue;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [mergedRuntime, schema.fields]);

  // Compute field behaviors
  const fieldBehaviors = useMemo(() => {
    const baseBehaviors: Record<string, FieldBehavior> = {};
    for (const field of schema.fields) {
      baseBehaviors[field.fieldId] = field.behavior || 'NORMAL';
    }

    let computed = baseBehaviors;
    if (effects.length > 0) {
      computed = evaluateEffects(effects, formData, baseBehaviors);
    }

    if (config.permissions?.fieldPermissions) {
      for (const [fieldId, behavior] of Object.entries(config.permissions.fieldPermissions)) {
        computed[fieldId] = behavior;
      }
    }

    if (config.mode === 'readonly') {
      for (const fieldId of Object.keys(computed)) {
        if (computed[fieldId] !== 'HIDDEN') {
          computed[fieldId] = 'READONLY';
        }
      }
    }

    return computed;
  }, [schema, effects, config.permissions, config.mode, formData]);

  const fieldOverrides = useMemo(
    () => evaluateFieldOverrides(effects, formData),
    [effects, formData],
  );

  const layoutBehaviors = useMemo(
    () => evaluateLayoutBehaviors(effects, formData),
    [effects, formData],
  );

  useEffect(() => {
    const valueActions = getValueActions(effects, formData);
    if (valueActions.length === 0) return;

    let changed = false;
    const nextData = { ...formData };
    const nextErrors = { ...fieldErrors };

    for (const action of valueActions) {
      const nextValue = action.action === 'clearValue' ? undefined : action.value;
      if (!isSameValue(nextData[action.fieldId], nextValue)) {
        changed = true;
        if (action.action === 'clearValue') {
          delete nextData[action.fieldId];
        } else {
          nextData[action.fieldId] = nextValue;
        }
        delete nextErrors[action.fieldId];
      }
    }

    if (changed) {
      setFormData(nextData);
      setFieldErrors(nextErrors);
      setComponentFieldErrors((prev) => {
        const next = { ...prev };
        for (const action of valueActions) delete next[action.fieldId];
        return next;
      });
    }
  }, [effects, formData, fieldErrors]);

  const setFieldValue = useCallback((fieldId: string, value: any) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
    setComponentFieldErrors((prev) => replaceSingleFieldError(prev, fieldId, null));
    setFieldErrors((prev) => {
      if (prev[fieldId]) {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      }
      return prev;
    });
  }, []);

  const setFieldError = useCallback((fieldId: string, error?: string | null) => {
    setComponentFieldErrors((prev) => replaceSingleFieldError(prev, fieldId, error || null));
    setFieldErrors((prev) => replaceSingleFieldError(prev, fieldId, error || null));
  }, []);

  const getFieldValue = useCallback((fieldId: string) => formData[fieldId], [formData]);

  const getFormData = useCallback(() => ({ ...formData }), [formData]);

  const validateFieldById = useCallback(
    async (fieldId: string): Promise<boolean> => {
      const field = schema.fields.find((f) => f.fieldId === fieldId);
      if (!field) {
        const scopedField = getScopedSubFormField(schema.fields, fieldId);
        if (!scopedField) return true;

        const parentBehavior =
          fieldBehaviors[scopedField.parent.fieldId] ?? scopedField.parent.behavior ?? 'NORMAL';
        if (isInactiveBehavior(parentBehavior) || isInactiveBehavior(scopedField.column.behavior)) {
          setComponentFieldErrors((prev) =>
            replaceSingleFieldError(prev, scopedField.scopedFieldId, null),
          );
          setFieldErrors((prev) => replaceSingleFieldError(prev, scopedField.scopedFieldId, null));
          return true;
        }

        const rows = getSubFormRows(formData, scopedField.parent.fieldId);
        const rules = buildValidationRules(
          scopedField.column.label,
          scopedField.column.required,
          scopedField.column.rules,
        );
        if (rules.length === 0) return true;

        const error = await validateFieldUtil(
          rows[scopedField.rowIndex]?.[scopedField.column.fieldId],
          rules,
        );
        setFieldErrors((prev) => replaceSingleFieldError(prev, scopedField.scopedFieldId, error));
        return !error;
      }

      const behavior = fieldBehaviors[fieldId] ?? field.behavior ?? 'NORMAL';
      if (isInactiveBehavior(behavior)) {
        setComponentFieldErrors((prev) => clearFieldAndChildrenErrors(prev, fieldId));
        setFieldErrors((prev) => {
          return clearFieldAndChildrenErrors(prev, fieldId);
        });
        return true;
      }

      const rules = buildValidationRules(
        field.label,
        fieldOverrides[fieldId]?.required ?? field.required,
        field.rules,
      );
      const errors: Record<string, string> = {};

      if (rules.length > 0) {
        const error = await validateFieldUtil(formData[fieldId], rules);
        if (error) errors[fieldId] = error;
      }

      if (field.componentName === 'SubFormField') {
        const validationData = { ...formData };
        const subFormRules: Record<string, ValidationRule[]> = {};
        collectSubFormValidationRules(field, formData, validationData, subFormRules);
        const subFormErrors = await validateAllFields(validationData, subFormRules);
        Object.assign(errors, subFormErrors);
      }

      if (rules.length === 0 && Object.keys(errors).length === 0) {
        if (field.componentName !== 'SubFormField') {
          return !componentFieldErrors[fieldId];
        }
      }

      setFieldErrors((prev) => {
        return replaceFieldAndChildrenErrors(prev, fieldId, errors);
      });
      return Object.keys(errors).length === 0;
    },
    [schema, formData, fieldBehaviors, componentFieldErrors, fieldOverrides],
  );

  const validateAllWithErrors = useCallback(async (): Promise<Record<string, string>> => {
    const fieldRules: Record<string, ValidationRule[]> = {};
    const validationData = { ...formData };
    const activeFieldIds = new Set<string>();

    for (const field of schema.fields) {
      const behavior = fieldBehaviors[field.fieldId] ?? field.behavior ?? 'NORMAL';
      if (isInactiveBehavior(behavior)) {
        continue;
      }
      activeFieldIds.add(field.fieldId);

      const rules = buildValidationRules(
        field.label,
        fieldOverrides[field.fieldId]?.required ?? field.required,
        field.rules,
      );
      if (rules.length > 0) {
        fieldRules[field.fieldId] = rules;
      }

      if (field.componentName === 'SubFormField') {
        collectSubFormValidationRules(field, formData, validationData, fieldRules);
      }
    }

    const componentErrors = Object.fromEntries(
      Object.entries(componentFieldErrors).filter(([fieldId]) =>
        [...activeFieldIds].some(
          (activeFieldId) => fieldId === activeFieldId || fieldId.startsWith(`${activeFieldId}.`),
        ),
      ),
    );
    const errors = {
      ...componentErrors,
      ...(await validateAllFields(validationData, fieldRules)),
    };
    setFieldErrors(errors);
    return errors;
  }, [schema, formData, fieldBehaviors, componentFieldErrors, fieldOverrides]);

  const validateAll = useCallback(async (): Promise<boolean> => {
    const errors = await validateAllWithErrors();
    return Object.keys(errors).length === 0;
  }, [validateAllWithErrors]);

  const resetForm = useCallback(() => {
    setFormData({ ...initialValuesRef.current });
    setFieldErrors({});
    setComponentFieldErrors({});
  }, []);

  const registerField = useCallback(
    (fieldId: string) => {
      registeredFields.add(fieldId);
    },
    [registeredFields],
  );

  const unregisterField = useCallback(
    (fieldId: string) => {
      registeredFields.delete(fieldId);
    },
    [registeredFields],
  );

  // Dynamic options state for fields with optionSource
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, OptionItem[]>>({});

  // Load dynamic options for fields with optionSource config
  useEffect(() => {
    const loadDynamicOptions = async () => {
      const updates: Record<string, OptionItem[]> = {};
      for (const field of schema.fields) {
        const optionSource = (field as any).optionSource as OptionSourceConfig | undefined;
        if (optionSource && optionSource.type !== 'custom') {
          // Skip dataLinkage on initial load - it will be handled by dependency watching
          if (optionSource.type === 'linkedForm') {
            const options = await resolveOptions(optionSource, mergedRuntime, formData);
            updates[field.fieldId] = options;
          }
        }
      }
      if (Object.keys(updates).length > 0) {
        setDynamicOptions((prev) => ({ ...prev, ...updates }));
      }
    };
    loadDynamicOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema.fields, mergedRuntime]);

  // Watch for data linkage dependencies - reload options when condition fields change
  useEffect(() => {
    let cancelled = false;
    const loadDataLinkageOptions = async () => {
      const updates: Record<string, OptionItem[]> = {};
      for (const field of schema.fields) {
        const optionSource = (field as any).optionSource as OptionSourceConfig | undefined;
        if (optionSource && optionSource.type === 'dataLinkage' && optionSource.dataLinkage) {
          // Check if any condition field has a value
          const hasConditionValues = optionSource.dataLinkage.conditions.some(
            (condition) =>
              formData[condition.localFieldId] !== undefined &&
              formData[condition.localFieldId] !== '',
          );
          if (hasConditionValues) {
            const options = await resolveOptions(optionSource, mergedRuntime, formData);
            updates[field.fieldId] = options;
          }
        }
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setDynamicOptions((prev) => ({ ...prev, ...updates }));
      }
    };
    const timer = window.setTimeout(loadDataLinkageOptions, LINKAGE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [schema.fields, mergedRuntime, formData]);

  // Resolve data-linkage default values for fields that should be auto-filled from another form.
  useEffect(() => {
    let cancelled = false;

    const loadDefaultValueLinkages = async () => {
      const fields = schema.fields.filter((field) => (field as any).defaultValueLinkage);
      if (fields.length === 0) return;

      const updates: Record<string, any> = {};
      for (const field of fields) {
        const linkage = (field as any).defaultValueLinkage;
        if (!hasLinkageConditionValues(linkage, formData)) continue;
        const rawValue = await resolveDefaultValueLinkage(linkage, mergedRuntime, formData);
        const nextValue = coerceLinkedDefaultValue(field, rawValue);
        if (nextValue !== undefined && !isSameValue(formData[field.fieldId], nextValue)) {
          updates[field.fieldId] = nextValue;
        }
      }

      if (cancelled || Object.keys(updates).length === 0) return;
      setFormData((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [fieldId, value] of Object.entries(updates)) {
          if (!isSameValue(next[fieldId], value)) {
            next[fieldId] = value;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    };

    const timer = window.setTimeout(loadDefaultValueLinkages, LINKAGE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [schema.fields, mergedRuntime, formData]);

  const contextValue: FormContextValue = useMemo(
    () => ({
      mode: config.mode,
      schema,
      formData,
      fieldErrors,
      fieldBehaviors,
      fieldOverrides,
      layoutBehaviors,
      dynamicOptions,
      api,
      runtime: mergedRuntime,
      config: {
        mode: config.mode,
        formUuid: config.formUuid,
        appType: config.appType,
        formInstanceId: config.formInstanceId,
        submit: config.submit,
      },
      setFieldValue,
      setFieldError,
      getFieldValue,
      getFormData,
      validateField: validateFieldById,
      validateAll,
      validateAllWithErrors,
      resetForm,
      registerField,
      unregisterField,
    }),
    [
      config.mode,
      config.formUuid,
      schema,
      formData,
      fieldErrors,
      fieldBehaviors,
      fieldOverrides,
      layoutBehaviors,
      dynamicOptions,
      api,
      mergedRuntime,
      config.appType,
      config.formInstanceId,
      config.submit,
      setFieldValue,
      setFieldError,
      getFieldValue,
      getFormData,
      validateFieldById,
      validateAll,
      validateAllWithErrors,
      resetForm,
      registerField,
      unregisterField,
    ],
  );

  const registryComponents = useMemo(
    () => (components ? { ...defaultComponentRegistry, ...components } : defaultComponentRegistry),
    [components],
  );

  return React.createElement(
    FormContext.Provider,
    { value: contextValue },
    React.createElement(ComponentRegistryProvider, { components: registryComponents, children }),
  );
}

function resolveDefaultValue(field: Record<string, any>, runtime?: FormRuntimeConfig) {
  if (field.defaultValue !== undefined) {
    return field.defaultValue;
  }

  if (!field.defaultShortcut?.type) {
    return undefined;
  }

  const shortcut = field.defaultShortcut;

  if (shortcut.type === 'fixed') {
    return shortcut.values;
  }

  // Date shortcuts
  if (
    shortcut.type === 'today' ||
    shortcut.type === 'yesterday' ||
    shortcut.type === 'tomorrow' ||
    shortcut.type === 'pastDays' ||
    shortcut.type === 'futureDays'
  ) {
    return resolveDateShortcut(shortcut);
  }

  // Text shortcuts (TextShortcutConfig)
  if (shortcut.type === 'currentUserName') {
    return runtime?.currentUser?.name ?? '';
  }
  if (shortcut.type === 'currentUserJobNumber') {
    return runtime?.currentUser?.jobNumber ?? '';
  }
  if (shortcut.type === 'currentDeptName') {
    return runtime?.currentDepartment?.name ?? '';
  }
  if (shortcut.type === 'uuid') {
    return typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  // People shortcuts (PeopleShortcutConfig)
  if (shortcut.type === 'currentUser') {
    return runtime?.currentUser ? [runtime.currentUser] : [];
  }
  if (shortcut.type === 'currentDepartment') {
    return runtime?.currentDepartment ? [runtime.currentDepartment] : [];
  }
  if (shortcut.type === 'currentUserManager') {
    return runtime?.currentUserManagers?.[0] ? [runtime.currentUserManagers[0]] : [];
  }
  if (shortcut.type === 'currentUserManager2') {
    return runtime?.currentUserManagers?.[1] ? [runtime.currentUserManagers[1]] : [];
  }

  return undefined;
}

function needsCurrentUserRuntime(shortcutType?: string) {
  return Boolean(
    shortcutType &&
    [
      'currentUser',
      'currentDepartment',
      'currentUserManager',
      'currentUserManager2',
      'currentUserName',
      'currentUserJobNumber',
      'currentDeptName',
    ].includes(shortcutType),
  );
}

function unwrapRuntimePayload(payload: any) {
  return payload?.data || payload?.result || payload?.user || payload;
}

function isBlankFormValue(value: any) {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function resolveDateShortcut(shortcut: {
  type: string;
  amount?: number;
  format?: string;
  includeTime?: boolean;
}) {
  const date = new Date();
  const amount = shortcut.amount ?? 0;

  if (shortcut.type === 'yesterday') {
    date.setDate(date.getDate() - 1);
  } else if (shortcut.type === 'tomorrow') {
    date.setDate(date.getDate() + 1);
  } else if (shortcut.type === 'pastDays') {
    date.setDate(date.getDate() - amount);
  } else if (shortcut.type === 'futureDays') {
    date.setDate(date.getDate() + amount);
  }

  const format = shortcut.format || (shortcut.includeTime ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD');
  return formatDate(date, format);
}

function formatDate(date: Date, format: string) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return format
    .replace('YYYY', String(date.getFullYear()))
    .replace('MM', pad(date.getMonth() + 1))
    .replace('DD', pad(date.getDate()))
    .replace('HH', pad(date.getHours()))
    .replace('mm', pad(date.getMinutes()))
    .replace('ss', pad(date.getSeconds()));
}

function isSameValue(left: any, right: any): boolean {
  if (left === right) return true;
  if (typeof left === 'object' || typeof right === 'object') {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return false;
}

function hasLinkageConditionValues(
  linkage: { conditions?: Array<{ localFieldId?: string }> } | undefined,
  formData: Record<string, any>,
) {
  const conditions = linkage?.conditions || [];
  if (conditions.length === 0) return false;
  return conditions.every((condition) => {
    const value = condition.localFieldId ? formData[condition.localFieldId] : undefined;
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      ('start' in value || 'end' in value)
    ) {
      return Boolean((value as any).start && (value as any).end);
    }
    return (
      value !== undefined &&
      value !== null &&
      value !== '' &&
      !(Array.isArray(value) && value.length === 0)
    );
  });
}

function coerceLinkedDefaultValue(
  field: { componentName?: string; options?: OptionItem[] },
  value: any,
) {
  if (value === undefined) return undefined;
  if (field.componentName === 'SelectField' || field.componentName === 'RadioField') {
    if (typeof value === 'object' && value?.value !== undefined && value?.label !== undefined)
      return value;
    const matched = (field.options || []).find((option) => String(option.value) === String(value));
    return matched || { label: String(value), value: String(value) };
  }
  return value;
}
