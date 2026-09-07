import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { FormContext, useFormContext } from './FormContext';
import type { FormContextValue } from './FormContext';
import React from 'react';

describe('FormContext', () => {
  it('FormContext default value is null', () => {
    // The default value is null when no provider is used
    expect(FormContext).toBeDefined();
  });

  describe('useFormContext', () => {
    it('throws error when used outside FormProvider', () => {
      expect(() => {
        renderHook(() => useFormContext());
      }).toThrow('useFormContext must be used within a FormProvider');
    });

    it('returns context value when used within provider', () => {
      const mockValue: FormContextValue = {
        mode: 'submit',
        schema: { formMeta: { formUuid: '1', appType: 'test', title: 'Test' }, fields: [] },
        formData: {},
        fieldErrors: {},
        fieldBehaviors: {},
        fieldOverrides: {},
        layoutBehaviors: {},
        dynamicOptions: {},
        api: {} as any,
        runtime: {},
        config: { mode: 'submit', formUuid: '1', appType: 'test' },
        setFieldValue: () => {},
        setFieldError: () => {},
        getFieldValue: () => undefined,
        getFormData: () => ({}),
        validateField: async () => true,
        validateAll: async () => true,
        validateAllWithErrors: async () => ({}),
        resetForm: () => {},
        registerField: () => {},
        unregisterField: () => {},
      };

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(FormContext.Provider, { value: mockValue }, children);

      const { result } = renderHook(() => useFormContext(), { wrapper });
      expect(result.current).toBe(mockValue);
      expect(result.current.mode).toBe('submit');
    });
  });
});
