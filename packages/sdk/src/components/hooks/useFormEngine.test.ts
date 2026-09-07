import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFormEngine } from './useFormEngine';
import type { FormSchema, FormEngineConfig } from '../types';

const createSchema = (overrides?: Partial<FormSchema>): FormSchema => ({
  formMeta: { formUuid: 'test-form', appType: 'test', title: 'Test Form' },
  fields: [
    { fieldId: 'name', componentName: 'Input', label: '姓名', required: true },
    { fieldId: 'age', componentName: 'NumberInput', label: '年龄', rules: [{ min: 0 }] },
  ],
  ...overrides,
});

const createConfig = (overrides?: Partial<FormEngineConfig>): FormEngineConfig => ({
  mode: 'submit',
  formUuid: 'test-form',
  appType: 'test',
  ...overrides,
});

describe('useFormEngine', () => {
  it('initializes with default values from schema', () => {
    const schema = createSchema({
      fields: [
        { fieldId: 'name', componentName: 'Input', label: '姓名', defaultValue: 'default' },
        { fieldId: 'age', componentName: 'NumberInput', label: '年龄', defaultValue: 18 },
      ],
    });
    const { result } = renderHook(() => useFormEngine(schema, createConfig()));
    expect(result.current.formData).toEqual({ name: 'default', age: 18 });
  });

  it('initializes with empty formData when no defaults', () => {
    const { result } = renderHook(() => useFormEngine(createSchema(), createConfig()));
    expect(result.current.formData).toEqual({});
  });

  it('returns the current mode', () => {
    const { result } = renderHook(() =>
      useFormEngine(createSchema(), createConfig({ mode: 'edit' })),
    );
    expect(result.current.mode).toBe('edit');
  });

  describe('setFieldValue', () => {
    it('updates field value', () => {
      const { result } = renderHook(() => useFormEngine(createSchema(), createConfig()));

      act(() => {
        result.current.setFieldValue('name', 'Alice');
      });

      expect(result.current.formData.name).toBe('Alice');
    });

    it('clears field error on value change', async () => {
      const { result } = renderHook(() => useFormEngine(createSchema(), createConfig()));

      // Trigger validation to create errors
      await act(async () => {
        await result.current.validateAll();
      });
      expect(result.current.fieldErrors.name).toBeDefined();

      // Set value to clear error
      act(() => {
        result.current.setFieldValue('name', 'value');
      });
      expect(result.current.fieldErrors.name).toBeUndefined();
    });

    it('does not modify errors for fields without error', () => {
      const { result } = renderHook(() => useFormEngine(createSchema(), createConfig()));

      act(() => {
        result.current.setFieldValue('age', 5);
      });

      expect(result.current.fieldErrors).toEqual({});
    });
  });

  describe('getFieldValue', () => {
    it('returns field value', () => {
      const schema = createSchema({
        fields: [{ fieldId: 'x', componentName: 'Input', label: 'X', defaultValue: 'val' }],
      });
      const { result } = renderHook(() => useFormEngine(schema, createConfig()));
      expect(result.current.getFieldValue('x')).toBe('val');
    });

    it('returns undefined for unset field', () => {
      const { result } = renderHook(() => useFormEngine(createSchema(), createConfig()));
      expect(result.current.getFieldValue('nonexistent')).toBeUndefined();
    });
  });

  describe('getFormData', () => {
    it('returns a copy of form data', () => {
      const schema = createSchema({
        fields: [{ fieldId: 'x', componentName: 'Input', label: 'X', defaultValue: 'a' }],
      });
      const { result } = renderHook(() => useFormEngine(schema, createConfig()));
      const data = result.current.getFormData();
      expect(data).toEqual({ x: 'a' });
      expect(data).not.toBe(result.current.formData);
    });
  });

  describe('validateAll', () => {
    it('returns true when all fields valid', async () => {
      const { result } = renderHook(() => useFormEngine(createSchema(), createConfig()));

      act(() => {
        result.current.setFieldValue('name', 'filled');
        result.current.setFieldValue('age', 5);
      });

      let isValid: boolean = false;
      await act(async () => {
        isValid = await result.current.validateAll();
      });

      expect(isValid).toBe(true);
      expect(result.current.fieldErrors).toEqual({});
    });

    it('returns false with errors when validation fails', async () => {
      const { result } = renderHook(() => useFormEngine(createSchema(), createConfig()));

      let isValid: boolean = true;
      await act(async () => {
        isValid = await result.current.validateAll();
      });

      expect(isValid).toBe(false);
      expect(result.current.fieldErrors.name).toBe('姓名为必填项');
    });

    it('validates rules from field definition', async () => {
      const { result } = renderHook(() => useFormEngine(createSchema(), createConfig()));

      act(() => {
        result.current.setFieldValue('name', 'ok');
        result.current.setFieldValue('age', -1);
      });

      await act(async () => {
        await result.current.validateAll();
      });

      expect(result.current.fieldErrors.age).toBe('不能小于 0');
    });
  });

  describe('resetForm', () => {
    it('resets form data and clears errors', async () => {
      const schema = createSchema({
        fields: [
          {
            fieldId: 'name',
            componentName: 'Input',
            label: '姓名',
            required: true,
            defaultValue: 'init',
          },
        ],
      });
      const { result } = renderHook(() => useFormEngine(schema, createConfig()));

      act(() => {
        result.current.setFieldValue('name', '');
      });

      await act(async () => {
        await result.current.validateAll();
      });
      expect(result.current.fieldErrors.name).toBeDefined();

      act(() => {
        result.current.resetForm();
      });

      expect(result.current.formData).toEqual({ name: 'init' });
      expect(result.current.fieldErrors).toEqual({});
    });
  });

  describe('fieldBehaviors', () => {
    it('defaults to NORMAL for fields without behavior', () => {
      const { result } = renderHook(() => useFormEngine(createSchema(), createConfig()));
      expect(result.current.fieldBehaviors.name).toBe('NORMAL');
    });

    it('uses field default behavior from schema', () => {
      const schema = createSchema({
        fields: [
          { fieldId: 'secret', componentName: 'Input', label: 'Secret', behavior: 'HIDDEN' },
        ],
      });
      const { result } = renderHook(() => useFormEngine(schema, createConfig()));
      expect(result.current.fieldBehaviors.secret).toBe('HIDDEN');
    });

    it('applies effects to behaviors', () => {
      const schema = createSchema({
        fields: [
          { fieldId: 'type', componentName: 'Select', label: '类型', defaultValue: 'special' },
          { fieldId: 'detail', componentName: 'Input', label: '详情' },
        ],
      });
      const config = createConfig({
        effects: [
          {
            when: { field: 'type', operator: 'eq', value: 'special' },
            then: [{ field: 'detail', action: 'hide' }],
          },
        ],
      });
      const { result } = renderHook(() => useFormEngine(schema, config));
      expect(result.current.fieldBehaviors.detail).toBe('HIDDEN');
    });

    it('permissions override effects', () => {
      const schema = createSchema({
        fields: [
          { fieldId: 'type', componentName: 'Select', label: '类型', defaultValue: 'special' },
          { fieldId: 'detail', componentName: 'Input', label: '详情' },
        ],
      });
      const config = createConfig({
        effects: [
          {
            when: { field: 'type', operator: 'eq', value: 'special' },
            then: [{ field: 'detail', action: 'hide' }],
          },
        ],
        permissions: {
          fieldPermissions: { detail: 'NORMAL' },
          operations: [],
        },
      });
      const { result } = renderHook(() => useFormEngine(schema, config));
      expect(result.current.fieldBehaviors.detail).toBe('NORMAL');
    });

    it('readonly mode sets all non-hidden to READONLY', () => {
      const schema = createSchema({
        fields: [
          { fieldId: 'name', componentName: 'Input', label: '姓名' },
          { fieldId: 'secret', componentName: 'Input', label: 'Secret', behavior: 'HIDDEN' },
        ],
      });
      const config = createConfig({ mode: 'readonly' });
      const { result } = renderHook(() => useFormEngine(schema, config));
      expect(result.current.fieldBehaviors.name).toBe('READONLY');
      expect(result.current.fieldBehaviors.secret).toBe('HIDDEN');
    });
  });
});
