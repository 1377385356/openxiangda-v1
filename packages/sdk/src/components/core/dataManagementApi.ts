import type { FieldDefinition, FormRuntimeApi, FormSchema, RuntimeResponse } from '../types';

export type DataManagementConfigScope = 'global' | 'personal';
export type DataManagementDensity = 'compact' | 'middle' | 'loose';
export type FilterLogic = 'AND' | 'OR';
export type SortDirection = 'ascend' | 'descend' | null;

export interface DataManagementField extends FieldDefinition {
  id: string;
  fieldId: string;
  componentName: string;
  label: string;
  width?: number;
  system?: boolean;
  processOnly?: boolean;
  displayable?: boolean;
}

type PlatformComponentNode = {
  componentName?: string;
  id?: string;
  title?: string;
  fieldId?: string;
  required?: boolean;
  props?: Record<string, any>;
  children?: PlatformComponentNode[];
  [key: string]: any;
};

export interface NormalizeDataManagementFieldsOptions {
  appType?: string;
  formUuid?: string;
}

export interface DataManagementFilterRule {
  id: string;
  key: string;
  operator: string;
  value: any;
  componentName?: string;
}

export interface DataManagementFilterGroup {
  id: string;
  logic: FilterLogic;
  rules: DataManagementFilterRule[];
  conditions: DataManagementFilterGroup[];
}

export interface DataManagementSort {
  id: string;
  isAsc: 'y' | 'n';
}

export interface DataManagementConfig {
  showFields?: string[];
  widths?: Record<string, number>;
  lockFieldIds?: string[];
  sort?: DataManagementSort[];
  filter?: {
    searchKeyWord?: string;
    group?: DataManagementFilterGroup;
  };
  density?: DataManagementDensity;
  detailOpenMode?: 'drawer' | 'newPage';
  pageSize?: number;
  showForcedConfig?: boolean;
  [key: string]: any;
}

export interface DataManagementQuery {
  appType: string;
  formUuid: string;
  filters?: DataManagementFilterGroup;
  rawFilters?: string;
  conditionType?: FilterLogic;
  searchKeyWord?: string;
  currentPage?: number;
  pageSize?: number;
  order?: DataManagementSort[];
  instanceStatus?: string;
}

export interface DataManagementListResult {
  records: any[];
  total: number;
}

export interface DataManagementApiOptions {
  appType: string;
  formUuid: string;
  menuFormUuid?: string;
  scope?: DataManagementConfigScope;
  expectedRevision?: number;
}

export type FormActionPermission =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'export'
  | 'import'
  | 'change_records'
  | 'workflow';

export interface DataManagementActionSummary {
  actions: FormActionPermission[];
  operations: FormActionPermission[];
  can: Record<FormActionPermission, boolean>;
  fieldPermissions?: Record<string, string>;
  fieldAccessPolicy?: unknown;
  hasFullAccess?: boolean;
  resourceType?: string;
  matchedGroupCodes?: string[];
}

export const FORM_ACTION_PERMISSIONS: FormActionPermission[] = [
  'view',
  'create',
  'edit',
  'delete',
  'export',
  'import',
  'change_records',
  'workflow',
];

const unwrap = <T = any>(response: RuntimeResponse<T> | Blob | any): T => {
  if (response instanceof Blob) return response as T;
  if (response?.data?.result !== undefined) return response.data.result as T;
  if (response?.result !== undefined) return response.result as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

const globalConfigRevisions = new WeakMap<
  FormRuntimeApi['request'],
  Map<string, number>
>();

const configRevisionKey = (options: DataManagementApiOptions) =>
  `${options.appType}:${options.menuFormUuid || options.formUuid}`;

const rememberGlobalConfigRevision = (
  request: FormRuntimeApi['request'],
  options: DataManagementApiOptions,
  response: RuntimeResponse<any> | Blob | any,
) => {
  if (options.scope === 'personal' || response instanceof Blob) return;
  const revision = Number(
    response?.releaseControl?.revision ??
      response?.data?.releaseControl?.revision,
  );
  if (!Number.isSafeInteger(revision) || revision < 1) return;
  let revisions = globalConfigRevisions.get(request);
  if (!revisions) {
    revisions = new Map<string, number>();
    globalConfigRevisions.set(request, revisions);
  }
  revisions.set(configRevisionKey(options), revision);
};

const cachedGlobalConfigRevision = (
  request: FormRuntimeApi['request'],
  options: DataManagementApiOptions,
) => globalConfigRevisions.get(request)?.get(configRevisionKey(options));

const pickData = (value: any) => value?.data ?? value?.result ?? value;

const normalizePlatformComponentName = (componentName?: string) => {
  const value = String(componentName || '').trim();
  return value || 'TextField';
};

const extractSlotNodes = (value: any): PlatformComponentNode[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractSlotNodes(item));
  }
  if (typeof value !== 'object') return [];

  if (value.type === 'JSSlot' && value.value) {
    return extractSlotNodes(value.value);
  }
  if (value.componentName || Array.isArray(value.children)) {
    return [value as PlatformComponentNode];
  }
  return Object.values(value).flatMap((item) => extractSlotNodes(item));
};

export const extractFieldsFromComponentsTree = (componentsTree: any): FieldDefinition[] => {
  const roots = Array.isArray(componentsTree) ? componentsTree : [componentsTree];
  const fields: FieldDefinition[] = [];
  const seen = new Set<string>();

  const walk = (components: PlatformComponentNode[]) => {
    if (!Array.isArray(components)) return;

    components.forEach((component) => {
      if (!component || typeof component !== 'object') return;
      const props = component.props || {};
      const fieldId = String(props.fieldId || component.fieldId || component.id || '').trim();

      if (props.isFormComponent === true && fieldId && !seen.has(fieldId)) {
        seen.add(fieldId);
        fields.push({
          ...props,
          id: props.id || component.id || fieldId,
          fieldId,
          componentName: normalizePlatformComponentName(
            props.componentName || component.componentName,
          ),
          label: props.label || component.title || props.title || fieldId,
          title: props.title || component.title || props.label || fieldId,
          required: props.required ?? component.required,
        });
      }

      if (component.componentName === 'SubFormField') return;

      if (Array.isArray(component.children)) {
        walk(component.children);
      }
      Object.values(props).forEach((propValue) => {
        walk(extractSlotNodes(propValue));
      });
    });
  };

  walk(roots);
  return fields;
};

const normalizeActionSummary = (value: any): DataManagementActionSummary => {
  const raw = pickData(value) || {};
  const actions = Array.from(
    new Set([...(raw.actions || []), ...(raw.operations || [])]),
  ).filter((action): action is FormActionPermission =>
    FORM_ACTION_PERMISSIONS.includes(action as FormActionPermission),
  );
  const can = FORM_ACTION_PERMISSIONS.reduce((result, action) => {
    result[action] = Boolean(raw.can?.[action] ?? actions.includes(action));
    return result;
  }, {} as Record<FormActionPermission, boolean>);
  return {
    ...raw,
    actions,
    operations: actions,
    can,
  };
};

const normalizeComponentName = (field: any) =>
  field?.componentName ||
  field?.component_name ||
  field?.component_type ||
  field?.componentType ||
  field?.type ||
  'TextField';

const normalizeField = (key: string, field: any, system = false): DataManagementField => ({
  ...field,
  id: field?.id || field?.fieldId || key,
  fieldId: field?.fieldId || field?.id || key,
  componentName: normalizeComponentName(field),
  label: field?.label || field?.title || field?.name || key,
  width: field?.width,
  system,
});

const createDefaultLayout = (fields: DataManagementField[]) =>
  fields.map((field) => ({
    id: `layout_${field.fieldId}`,
    type: 'field' as const,
    fieldId: field.fieldId,
  }));

const SYSTEM_VALUE_ALIASES: Record<string, string[]> = {
  formInstanceId: ['formInstanceId', 'formInstId', 'form_instance_id', 'processInstanceId'],
  instanceTitle: ['instanceTitle', 'instance_title', 'processInstanceTitle', 'title'],
  createdBy: ['createdBy', 'created_by', 'originator'],
  createdByName: ['createdByName', 'created_by_name', 'originatorName', 'creatorName'],
  createdByDepartmentId: ['createdByDepartmentId', 'created_by_department_id', 'originatorCorp'],
  createdByDepartmentName: [
    'createdByDepartmentName',
    'created_by_department_name',
    'originatorDepartmentName',
    'originatorCorpName',
  ],
  createdAt: ['createdAt', 'created_at', 'createTime', 'gmtCreate'],
  updatedAt: ['updatedAt', 'updated_at', 'modifiedTime', 'modifyTime', 'gmtModified'],
};

const pickAliasValue = (record: any, aliases: string[]) => {
  for (const alias of aliases) {
    const value = record?.[alias];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
};

const normalizeDataManagementRecord = (record: any) => {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
  const normalized = { ...record };
  Object.entries(SYSTEM_VALUE_ALIASES).forEach(([targetKey, aliases]) => {
    if (normalized[targetKey] !== undefined && normalized[targetKey] !== null) return;
    const aliasValue = pickAliasValue(record, aliases);
    if (aliasValue !== undefined) normalized[targetKey] = aliasValue;
  });
  return normalized;
};

export const PROCESS_INSTANCE_STATUS_OPTIONS = [
  { label: '待处理', value: 'pending' },
  { label: '审批中', value: 'running' },
  { label: '等待中', value: 'waiting' },
  { label: '流程异常', value: 'exception' },
  { label: '已完成', value: 'completed' },
  { label: '已拒绝', value: 'terminated' },
  { label: '已撤销', value: 'withdrawn' },
];

export const APPROVAL_RESULT_OPTIONS = [
  { label: '审批中', value: 'processing' },
  { label: '同意', value: 'approved' },
  { label: '拒绝', value: 'rejected' },
  { label: '撤销', value: 'withdrawn' },
  { label: '异常', value: 'exception' },
];

const PROCESS_SYSTEM_FIELDS: DataManagementField[] = [
  normalizeField(
    'currentApprovalNodeName',
    {
      label: '当前审批节点',
      componentName: 'TextField',
      width: 140,
      processOnly: true,
      displayable: true,
    },
    true,
  ),
  normalizeField(
    'processInstanceStatus',
    {
      label: '实例状态',
      componentName: 'SelectField',
      width: 110,
      options: PROCESS_INSTANCE_STATUS_OPTIONS,
      processOnly: true,
      displayable: true,
    },
    true,
  ),
  normalizeField(
    'approvalResult',
    {
      label: '审批结果',
      componentName: 'SelectField',
      width: 110,
      options: APPROVAL_RESULT_OPTIONS,
      processOnly: true,
      displayable: true,
    },
    true,
  ),
];

const BASE_SYSTEM_FIELDS: DataManagementField[] = [
  normalizeField(
    'instanceTitle',
    { label: '实例标题', componentName: 'TextField', width: 220, displayable: true },
    true,
  ),
  normalizeField(
    'createdByName',
    { label: '创建人', componentName: 'TextField', width: 130, displayable: true },
    true,
  ),
  normalizeField(
    'createdByDepartmentName',
    { label: '创建人部门', componentName: 'TextField', width: 150, displayable: true },
    true,
  ),
  normalizeField(
    'createdAt',
    { label: '创建时间', componentName: 'DateField', width: 170, displayable: true },
    true,
  ),
  normalizeField(
    'updatedAt',
    { label: '更新时间', componentName: 'DateField', width: 170, displayable: true },
    true,
  ),
];

export const getSystemFieldsForFormType = (formType?: string) =>
  formType === 'process' ? [...BASE_SYSTEM_FIELDS, ...PROCESS_SYSTEM_FIELDS] : BASE_SYSTEM_FIELDS;

export const normalizeDataManagementFields = (
  payload: any,
  options: NormalizeDataManagementFieldsOptions = {},
): {
  fields: DataManagementField[];
  formType?: string;
  schema?: FormSchema;
} => {
  const data = pickData(payload);
  const rawSchema = data?.schema || data?.formSchema || data?.publishedSchema || data;
  const schemaAppType =
    rawSchema?.formMeta?.appType || rawSchema?.appType || data?.appType || options.appType;
  const schemaFormUuid =
    rawSchema?.formMeta?.formUuid || rawSchema?.formUuid || data?.formUuid || options.formUuid;
  const schemaTitle =
    rawSchema?.formMeta?.title ||
    rawSchema?.title ||
    data?.title ||
    data?.name ||
    data?.formName ||
    schemaFormUuid;
  const formType =
    data?.formType ||
    data?.schema?.formType ||
    data?.schema?.template?.formType ||
    rawSchema?.formType ||
    rawSchema?.template?.formType ||
    data?.type;
  const rawFields =
    data?.formFields ||
    data?.schema?.formFields ||
    rawSchema?.formFields ||
    data?.fields ||
    data?.schema?.fields ||
    data?.formSchema?.fields ||
    rawSchema?.fields ||
    [];

  const extractedFields =
    Array.isArray(rawFields) && rawFields.length === 0 && rawSchema?.componentsTree
      ? extractFieldsFromComponentsTree(rawSchema.componentsTree)
      : rawFields;
  const fields = (
    Array.isArray(extractedFields)
      ? extractedFields.map((field: any) => normalizeField(field?.fieldId || field?.id, field))
      : Object.entries(extractedFields).map(([key, field]) => normalizeField(key, field))
  ).filter((field) => field.componentName !== 'PageSection');
  const schemaFields = Array.isArray(rawSchema?.fields) ? rawSchema.fields : fields;
  const hasSchemaFields = Array.isArray(rawSchema?.fields) || fields.length > 0;

  return {
    fields,
    formType,
    schema:
      rawSchema && hasSchemaFields && schemaAppType && schemaFormUuid
        ? ({
            ...rawSchema,
            fields: schemaFields,
            layout: rawSchema.layout || createDefaultLayout(fields),
            formMeta: {
              formUuid: schemaFormUuid,
              appType: schemaAppType,
              title: schemaTitle,
              ...(rawSchema.formMeta || {}),
            },
            template: {
              type: 'standard',
              ...(rawSchema.template || {}),
              formType: rawSchema.template?.formType || formType,
            },
          } as FormSchema)
        : undefined,
  };
};

const dataManagementListKeys = ['data', 'records', 'list', 'rows', 'items'] as const;
const isDataManagementEnvelope = (value: any): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const resolveDataManagementListEnvelope = (payload: any) => {
  const chain: Record<string, any>[] = [];
  const seen = new Set<Record<string, any>>();
  let current = payload;

  while (isDataManagementEnvelope(current) && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    if (dataManagementListKeys.some((key) => Array.isArray(current[key]))) break;
    current = isDataManagementEnvelope(current.result)
      ? current.result
      : isDataManagementEnvelope(current.data)
        ? current.data
        : undefined;
  }

  const body = chain[chain.length - 1] || {};
  const metadataSources = [body, ...chain.slice(0, -1).reverse()];
  const readMetadata = (...keys: string[]) => {
    for (const source of metadataSources) {
      for (const key of keys) {
        if (source[key] !== undefined && source[key] !== null) return source[key];
      }
    }
    return undefined;
  };

  return { body, readMetadata };
};

export const normalizeDataManagementList = (payload: any): DataManagementListResult => {
  const { body, readMetadata } = resolveDataManagementListEnvelope(payload);
  const records = dataManagementListKeys
    .map((key) => body[key])
    .find((candidate) => Array.isArray(candidate)) || [];
  const total = readMetadata('totalCount', 'total', 'count') ?? records.length;
  return {
    records: Array.isArray(records) ? records.map(normalizeDataManagementRecord) : [],
    total: Number(total) || 0,
  };
};

export const buildFilterPayload = (group?: DataManagementFilterGroup): string | undefined => {
  if (!group) return undefined;
  const normalizeOperator = (operator?: string) => {
    const raw = String(operator || '').trim();
    const aliases: Record<string, string> = {
      contains: 'CONTAINS',
      eq: 'EQ',
      ne: 'NEQ',
      neq: 'NEQ',
      gt: 'GT',
      gte: 'GTE',
      lt: 'LT',
      lte: 'LTE',
      between: 'BETWEEN',
      in: 'IN',
      is_null: 'IS_NULL',
      is_not_null: 'IS_NOT_NULL',
      empty: 'IS_NULL',
      not_empty: 'IS_NOT_NULL',
      notEmpty: 'IS_NOT_NULL',
    };
    return aliases[raw] || aliases[raw.toLowerCase()] || raw.toUpperCase();
  };
  const isNoValueOperator = (operator?: string) =>
    ['IS_NULL', 'IS_NOT_NULL'].includes(normalizeOperator(operator));
  const hasRuleValue = (rule: DataManagementFilterRule) => {
    if (isNoValueOperator(rule.operator)) return true;
    if (Array.isArray(rule.value)) {
      return rule.value.some((item) => item !== undefined && item !== null && item !== '');
    }
    return rule.value !== undefined && rule.value !== null && rule.value !== '';
  };
  const trimGroup = (current: DataManagementFilterGroup): DataManagementFilterGroup => ({
    ...current,
    rules: (current.rules || [])
      .filter((rule) => rule.key && rule.operator && hasRuleValue(rule))
      .map((rule) => ({
        ...rule,
        operator: normalizeOperator(rule.operator),
        value: isNoValueOperator(rule.operator) ? null : rule.value,
      })),
    conditions: (current.conditions || [])
      .map(trimGroup)
      .filter((item) => item.rules.length > 0 || item.conditions.length > 0),
  });
  const payload = trimGroup(group);
  if (payload.rules.length === 0 && payload.conditions.length === 0) return undefined;
  return JSON.stringify(payload);
};

export const normalizeColumnConfig = (
  cfg: DataManagementConfig | undefined,
  fields: DataManagementField[],
): Required<Pick<DataManagementConfig, 'showFields' | 'widths' | 'lockFieldIds' | 'sort'>> & {
  density: DataManagementDensity;
  detailOpenMode: 'drawer' | 'newPage';
  pageSize: number;
} => {
  const allowed = new Set(fields.map((field) => field.fieldId));
  const configured = Array.isArray(cfg?.showFields)
    ? cfg.showFields.filter((fieldId) => allowed.has(fieldId))
    : [];
  const defaultBusinessFields = fields
    .filter((field) => !field.system)
    .slice(0, 8)
    .map((field) => field.fieldId);
  const defaultSystemFields = fields
    .filter((field) => field.system && field.displayable)
    .map((field) => field.fieldId);
  const defaultShow = [...defaultBusinessFields, ...defaultSystemFields];

  return {
    showFields: configured.length > 0 ? configured : defaultShow,
    widths: cfg?.widths || {},
    lockFieldIds: cfg?.lockFieldIds || [],
    sort: Array.isArray(cfg?.sort) ? cfg.sort : [],
    density: cfg?.density || 'middle',
    detailOpenMode: cfg?.detailOpenMode === 'newPage' ? 'newPage' : 'drawer',
    pageSize: cfg?.pageSize || 10,
  };
};

export async function getDataManagementSchema(
  request: FormRuntimeApi['request'],
  params: { appType: string; formUuid: string },
) {
  const response = await request({
    url: '/form/getFormSchemaAndPackages',
    method: 'get',
    params,
  });
  const result = normalizeDataManagementFields(response, params);
  if (result.schema) {
    result.schema = {
      ...result.schema,
      formMeta: {
        ...result.schema.formMeta,
        appType: result.schema.formMeta?.appType || params.appType,
        formUuid: result.schema.formMeta?.formUuid || params.formUuid,
        title: result.schema.formMeta?.title || params.formUuid,
      },
    };
  }
  return result;
}

export async function getDataManagementConfig(
  request: FormRuntimeApi['request'],
  options: DataManagementApiOptions,
): Promise<DataManagementConfig | undefined> {
  const targetFormUuid = options.menuFormUuid || options.formUuid;
  const personal = options.scope === 'personal';
  const response = await request<DataManagementConfig>({
    url: `/${options.appType}/v1/form/dataManagement/config/${personal ? 'personal/' : ''}get.json`,
    method: 'get',
    params: { formUuid: targetFormUuid },
  });
  rememberGlobalConfigRevision(request, options, response);
  return unwrap<DataManagementConfig>(response);
}

export async function getDataManagementActionSummary(
  request: FormRuntimeApi['request'],
  params: { appType: string; formUuid: string },
): Promise<DataManagementActionSummary> {
  const response = await request({
    url: '/permission/form-group/view-permissions',
    method: 'get',
    params,
  });
  return normalizeActionSummary(response);
}

export async function saveDataManagementConfig(
  request: FormRuntimeApi['request'],
  options: DataManagementApiOptions & { config: DataManagementConfig },
) {
  const targetFormUuid = options.menuFormUuid || options.formUuid;
  const personal = options.scope === 'personal';
  const expectedRevision = personal
    ? undefined
    : options.expectedRevision ?? cachedGlobalConfigRevision(request, options);
  if (!personal && !expectedRevision) {
    throw new Error(
      '保存全局数据管理配置前必须先读取配置，或显式传入 expectedRevision',
    );
  }
  const response = await request({
    url: `/${options.appType}/v1/form/dataManagement/config/${personal ? 'personal/' : ''}save.json`,
    method: 'post',
    data: {
      formUuid: targetFormUuid,
      config: options.config,
      ...(!personal ? { expectedRevision } : {}),
    },
  });
  rememberGlobalConfigRevision(request, options, response);
  return unwrap(response);
}

export async function advancedSearchDataManagement(
  request: FormRuntimeApi['request'],
  query: DataManagementQuery,
): Promise<DataManagementListResult> {
  const response = await request({
    url: `/${query.appType}/v1/form/advancedSearch.json`,
    method: 'get',
    params: {
      appType: query.appType,
      formUuid: query.formUuid,
      filters: query.rawFilters ?? buildFilterPayload(query.filters),
      conditionType: query.conditionType,
      searchKeyWord: query.searchKeyWord,
      currentPage: query.currentPage || 1,
      pageSize: query.pageSize || 10,
      order: JSON.stringify(query.order || []),
      instanceStatus: query.instanceStatus,
    },
  });
  return normalizeDataManagementList(response);
}

export async function deleteDataManagementRows(
  request: FormRuntimeApi['request'],
  params: { appType: string; formUuid: string; formInstanceIds: string[] },
) {
  const formInstId =
    params.formInstanceIds.length === 1 ? params.formInstanceIds[0] : params.formInstanceIds;
  const response = await request({
    url: `/${params.appType}/v1/form/deleteFormData.json`,
    method: 'post',
    data: {
      appType: params.appType,
      formUuid: params.formUuid,
      formInstId,
      formInstIds: params.formInstanceIds,
      formInstanceIds: params.formInstanceIds,
    },
  });
  return unwrap(response);
}

export async function batchApproveDataManagementRows(
  request: FormRuntimeApi['request'],
  params: {
    appType: string;
    formUuid: string;
    formInstanceIds: string[];
    action: 'approved' | 'rejected';
    comments?: string;
  },
) {
  const response = await request({
    url: '/workflow/approve/batch',
    method: 'post',
    data: {
      instanceIds: params.formInstanceIds,
      action: params.action,
      comments: params.comments,
    },
  });
  return unwrap(response);
}

export async function exportDataManagementRows(
  request: FormRuntimeApi['request'],
  params: DataManagementQuery & {
    exportAll?: 'y' | 'n';
    embedImages?: 'y' | 'n';
    exportFields?: string[];
  },
) {
  return request({
    url: `/${params.appType}/v1/form/advancedExport.xlsx`,
    method: 'get',
    responseType: 'blob',
    params: {
      appType: params.appType,
      formUuid: params.formUuid,
      filters: params.rawFilters ?? buildFilterPayload(params.filters),
      conditionType: params.conditionType,
      searchKeyWord: params.searchKeyWord,
      currentPage: params.currentPage,
      pageSize: params.pageSize,
      order: JSON.stringify(params.order || []),
      instanceStatus: params.instanceStatus,
      exportAll: params.exportAll || 'n',
      embedImages: params.embedImages || 'n',
      exportFields: (params.exportFields || []).join(','),
    },
  });
}

export async function downloadDataManagementImportTemplate(
  request: FormRuntimeApi['request'],
  params: { appType: string; formUuid: string },
) {
  return request({
    url: `/${params.appType}/v1/form/advancedExportTemplate.xlsx`,
    method: 'get',
    responseType: 'blob',
    params: {
      formUuid: params.formUuid,
    },
  });
}

export async function importPreviewDataManagementRows(
  request: FormRuntimeApi['request'],
  params: { appType: string; formUuid: string; fileBase64: string },
) {
  const response = await request({
    url: `/${params.appType}/v1/form/importPreview.xlsx`,
    method: 'post',
    data: { formUuid: params.formUuid, fileBase64: params.fileBase64 },
  });
  return unwrap(response);
}

export async function importDataManagementRows(
  request: FormRuntimeApi['request'],
  params: { appType: string; formUuid: string; fileBase64: string },
) {
  const response = await request({
    url: `/${params.appType}/v1/form/import.xlsx`,
    method: 'post',
    data: { formUuid: params.formUuid, fileBase64: params.fileBase64 },
  });
  return unwrap(response);
}

export async function getDataManagementTransferRecords(
  request: FormRuntimeApi['request'],
  params: {
    appType: string;
    formUuid: string;
    type: 'import' | 'export';
    currentPage?: number;
    pageSize?: number;
  },
) {
  const response = await request({
    url: `/${params.appType}/v1/form/${params.type}Records.json`,
    method: 'get',
    params,
  });
  return normalizeDataManagementList(response);
}
