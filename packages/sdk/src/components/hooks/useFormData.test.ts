import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFormData } from './useFormData';

describe('useFormData', () => {
  it('initializes with empty object by default', () => {
    const { result } = renderHook(() => useFormData());
    expect(result.current.formData).toEqual({});
  });

  it('initializes with provided initialValues', () => {
    const { result } = renderHook(() => useFormData({ name: 'John', age: 25 }));
    expect(result.current.formData).toEqual({ name: 'John', age: 25 });
  });

  describe('setFieldValue', () => {
    it('updates a field value', () => {
      const { result } = renderHook(() => useFormData({ name: '' }));

      act(() => {
        result.current.setFieldValue('name', 'Alice');
      });

      expect(result.current.formData.name).toBe('Alice');
    });

    it('adds new field if not existing', () => {
      const { result } = renderHook(() => useFormData({}));

      act(() => {
        result.current.setFieldValue('newField', 'value');
      });

      expect(result.current.formData.newField).toBe('value');
    });

    it('marks field as dirty', () => {
      const { result } = renderHook(() => useFormData({ name: '' }));

      expect(result.current.dirtyFields.has('name')).toBe(false);

      act(() => {
        result.current.setFieldValue('name', 'Alice');
      });

      expect(result.current.dirtyFields.has('name')).toBe(true);
    });
  });

  describe('getFieldValue', () => {
    it('returns the current field value', () => {
      const { result } = renderHook(() => useFormData({ name: 'Bob' }));
      expect(result.current.getFieldValue('name')).toBe('Bob');
    });

    it('returns undefined for non-existent field', () => {
      const { result } = renderHook(() => useFormData({}));
      expect(result.current.getFieldValue('missing')).toBeUndefined();
    });
  });

  describe('getFormData', () => {
    it('returns a copy of formData', () => {
      const { result } = renderHook(() => useFormData({ a: 1, b: 2 }));
      const data = result.current.getFormData();
      expect(data).toEqual({ a: 1, b: 2 });
      // Should be a copy, not the same reference
      expect(data).not.toBe(result.current.formData);
    });
  });

  describe('resetForm', () => {
    it('resets to initial values', () => {
      const { result } = renderHook(() => useFormData({ name: 'original' }));

      act(() => {
        result.current.setFieldValue('name', 'changed');
      });
      expect(result.current.formData.name).toBe('changed');

      act(() => {
        result.current.resetForm();
      });
      expect(result.current.formData.name).toBe('original');
    });

    it('clears dirty fields', () => {
      const { result } = renderHook(() => useFormData({ name: '' }));

      act(() => {
        result.current.setFieldValue('name', 'dirty');
      });
      expect(result.current.dirtyFields.has('name')).toBe(true);

      act(() => {
        result.current.resetForm();
      });
      expect(result.current.dirtyFields.size).toBe(0);
    });
  });

  describe('dirtyFields', () => {
    it('starts empty', () => {
      const { result } = renderHook(() => useFormData({ x: 1 }));
      expect(result.current.dirtyFields.size).toBe(0);
    });

    it('tracks multiple dirty fields', () => {
      const { result } = renderHook(() => useFormData({ a: '', b: '' }));

      act(() => {
        result.current.setFieldValue('a', '1');
      });
      act(() => {
        result.current.setFieldValue('b', '2');
      });

      expect(result.current.dirtyFields.has('a')).toBe(true);
      expect(result.current.dirtyFields.has('b')).toBe(true);
    });
  });
});
