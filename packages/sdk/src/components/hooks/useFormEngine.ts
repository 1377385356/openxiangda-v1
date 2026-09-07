import { useState, useCallback, useMemo, useRef } from 'react';
import type { FieldBehavior, FormSchema, FormEngineConfig, ValidationRule } from '../types';
import { evaluateEffects } from '../core/effects';
import { validateAllFields } from '../core/validation';

export interface UseFormEngineReturn {
  formData: Record<string, any>;
  setFieldValue: (fieldId: string, value: any) => void;
  getFieldValue: (fieldId: string) => any;
  getFormData: () => Record<string, any>;
  validateAll: () => Promise<boolean>;
  resetForm: () => void;
  mode: string;
  fieldBehaviors: Record<string, FieldBehavior>;
  fieldErrors: Record<string, string>;
}

export function useFormEngine(schema: FormSchema, config: FormEngineConfig): UseFormEngineReturn {
  // Build initial values from schema defaults
  const initialValues = useMemo(() => {
    const values: Record<string, any> = {};
    for (const field of schema.fields) {
      if (field.defaultValue !== undefined) {
        values[field.fieldId] = field.defaultValue;
      }
    }
    return values;
  }, [schema]);

  const initialValuesRef = useRef(initialValues);
  const [formData, setFormData] = useState<Record<string, any>>({ ...initialValues });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Compute field behaviors based on permissions and effects
  const fieldBehaviors = useMemo(() => {
    // Start with default behaviors from schema
    const baseBehaviors: Record<string, FieldBehavior> = {};
    for (const field of schema.fields) {
      baseBehaviors[field.fieldId] = field.behavior || 'NORMAL';
    }

    // Apply effects
    let computed = baseBehaviors;
    if (config.effects && config.effects.length > 0) {
      computed = evaluateEffects(config.effects, formData, baseBehaviors);
    }

    // Apply permissions (override effects)
    if (config.permissions?.fieldPermissions) {
      for (const [fieldId, behavior] of Object.entries(config.permissions.fieldPermissions)) {
        computed[fieldId] = behavior;
      }
    }

    // In readonly mode, all fields become READONLY unless HIDDEN
    if (config.mode === 'readonly') {
      for (const fieldId of Object.keys(computed)) {
        if (computed[fieldId] !== 'HIDDEN') {
          computed[fieldId] = 'READONLY';
        }
      }
    }

    return computed;
  }, [schema, config.effects, config.permissions, config.mode, formData]);

  const setFieldValue = useCallback((fieldId: string, value: any) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
    // Clear error when value changes
    setFieldErrors((prev) => {
      if (prev[fieldId]) {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      }
      return prev;
    });
  }, []);

  const getFieldValue = useCallback((fieldId: string) => formData[fieldId], [formData]);

  const getFormData = useCallback(() => ({ ...formData }), [formData]);

  const validateAll = useCallback(async () => {
    const fieldRules: Record<string, ValidationRule[]> = {};
    for (const field of schema.fields) {
      const rules: ValidationRule[] = [];
      if (field.required) {
        rules.push({ required: true, message: `${field.label}为必填项` });
      }
      if (field.rules) {
        rules.push(...field.rules);
      }
      if (rules.length > 0) {
        fieldRules[field.fieldId] = rules;
      }
    }

    const errors = await validateAllFields(formData, fieldRules);
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [schema, formData]);

  const resetForm = useCallback(() => {
    setFormData({ ...initialValuesRef.current });
    setFieldErrors({});
  }, []);

  return {
    formData,
    setFieldValue,
    getFieldValue,
    getFormData,
    validateAll,
    resetForm,
    mode: config.mode,
    fieldBehaviors,
    fieldErrors,
  };
}
