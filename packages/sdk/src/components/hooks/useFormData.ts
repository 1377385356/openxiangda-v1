import { useState, useCallback, useRef } from 'react';

export interface UseFormDataReturn {
  formData: Record<string, any>;
  setFieldValue: (fieldId: string, value: any) => void;
  getFieldValue: (fieldId: string) => any;
  getFormData: () => Record<string, any>;
  resetForm: () => void;
  dirtyFields: Set<string>;
}

export function useFormData(initialValues: Record<string, any> = {}): UseFormDataReturn {
  const [formData, setFormData] = useState<Record<string, any>>({ ...initialValues });
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());
  const initialValuesRef = useRef(initialValues);

  const setFieldValue = useCallback((fieldId: string, value: any) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
    setDirtyFields((prev) => {
      const next = new Set(prev);
      next.add(fieldId);
      return next;
    });
  }, []);

  const getFieldValue = useCallback(
    (fieldId: string) => {
      return formData[fieldId];
    },
    [formData],
  );

  const getFormData = useCallback(() => {
    return { ...formData };
  }, [formData]);

  const resetForm = useCallback(() => {
    setFormData({ ...initialValuesRef.current });
    setDirtyFields(new Set());
  }, []);

  return {
    formData,
    setFieldValue,
    getFieldValue,
    getFormData,
    resetForm,
    dirtyFields,
  };
}
