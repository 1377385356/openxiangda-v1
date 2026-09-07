import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFieldBehavior } from './useFieldBehavior';
import type { FormEffect } from '../types';

describe('useFieldBehavior', () => {
  it('returns NORMAL as default behavior', () => {
    const { result } = renderHook(() => useFieldBehavior({ fieldId: 'name', formData: {} }));
    expect(result.current).toBe('NORMAL');
  });

  it('returns custom default behavior', () => {
    const { result } = renderHook(() =>
      useFieldBehavior({ fieldId: 'name', formData: {}, defaultBehavior: 'READONLY' }),
    );
    expect(result.current).toBe('READONLY');
  });

  describe('permissions priority', () => {
    it('returns permission behavior when set', () => {
      const { result } = renderHook(() =>
        useFieldBehavior({
          fieldId: 'name',
          permissions: { name: 'HIDDEN' },
          formData: {},
        }),
      );
      expect(result.current).toBe('HIDDEN');
    });

    it('permissions override effects', () => {
      const effects: FormEffect[] = [
        {
          when: { field: 'type', operator: 'changed' },
          then: [{ field: 'name', action: 'show' }],
        },
      ];
      const { result } = renderHook(() =>
        useFieldBehavior({
          fieldId: 'name',
          permissions: { name: 'DISABLED' },
          effects,
          formData: { type: 'any' },
        }),
      );
      expect(result.current).toBe('DISABLED');
    });

    it('ignores permissions for other fields', () => {
      const { result } = renderHook(() =>
        useFieldBehavior({
          fieldId: 'name',
          permissions: { other: 'HIDDEN' },
          formData: {},
        }),
      );
      expect(result.current).toBe('NORMAL');
    });
  });

  describe('effects evaluation', () => {
    it('applies effect when condition is met', () => {
      const effects: FormEffect[] = [
        {
          when: { field: 'type', operator: 'eq', value: 'special' },
          then: [{ field: 'name', action: 'hide' }],
        },
      ];
      const { result } = renderHook(() =>
        useFieldBehavior({
          fieldId: 'name',
          effects,
          formData: { type: 'special' },
        }),
      );
      expect(result.current).toBe('HIDDEN');
    });

    it('returns default when effect condition not met', () => {
      const effects: FormEffect[] = [
        {
          when: { field: 'type', operator: 'eq', value: 'special' },
          then: [{ field: 'name', action: 'hide' }],
        },
      ];
      const { result } = renderHook(() =>
        useFieldBehavior({
          fieldId: 'name',
          effects,
          formData: { type: 'normal' },
        }),
      );
      expect(result.current).toBe('NORMAL');
    });

    it('uses default behavior when no permissions and empty effects', () => {
      const { result } = renderHook(() =>
        useFieldBehavior({
          fieldId: 'name',
          effects: [],
          formData: {},
          defaultBehavior: 'READONLY',
        }),
      );
      expect(result.current).toBe('READONLY');
    });
  });
});
