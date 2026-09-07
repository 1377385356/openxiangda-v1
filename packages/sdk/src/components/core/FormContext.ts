import { createContext, useContext } from 'react';
import type {
  FieldBehavior,
  FormEngineConfig,
  FormRuntimeConfig,
  FormRuntimeApi,
  FormSchema,
  OptionItem,
} from '../types';

export interface FormContextValue {
  mode: FormEngineConfig['mode'];
  schema: FormSchema;
  formData: Record<string, any>;
  fieldErrors: Record<string, string>;
  fieldBehaviors: Record<string, FieldBehavior>;
  fieldOverrides: Record<string, Record<string, any>>;
  layoutBehaviors: Record<string, FieldBehavior>;
  dynamicOptions: Record<string, OptionItem[]>;
  api: FormRuntimeApi;
  runtime: FormRuntimeConfig;
  config: Pick<
    FormEngineConfig,
    'mode' | 'formUuid' | 'appType' | 'formInstanceId' | 'submit' | 'defaultUploadProvider'
  >;
  setFieldValue: (fieldId: string, value: any) => void;
  setFieldError: (fieldId: string, error?: string | null) => void;
  getFieldValue: (fieldId: string) => any;
  getFormData: () => Record<string, any>;
  validateField: (fieldId: string) => Promise<boolean>;
  validateAll: () => Promise<boolean>;
  validateAllWithErrors: () => Promise<Record<string, string>>;
  resetForm: () => void;
  registerField: (fieldId: string) => void;
  unregisterField: (fieldId: string) => void;
}

export const FormContext = createContext<FormContextValue | null>(null);

export function useFormContext(): FormContextValue {
  const context = useContext(FormContext);
  if (!context) {
    throw new Error('useFormContext must be used within a FormProvider');
  }
  return context;
}
