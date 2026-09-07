import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FormContext, type FormContextValue } from '../core/FormContext';
import { createFormRuntimeApi } from '../core/runtimeApi';
import type { RuntimeRequestConfig, RuntimeResponse, ViewPermissionSummary } from '../types';
import { useFormDetail } from './useFormDetail';

const basePermission: ViewPermissionSummary = {
  operations: ['EDIT', 'DELETE', 'VIEW_CHANGE_RECORDS'],
  fieldPermissions: {
    hidden: 'FORM_FILED_HIDDEN',
    readonly: 'FORM_FILED_VIEW',
    editable: 'FORM_FILED_EDIT',
  },
};

const formInstance = {
  formInstanceId: 'inst-1',
  formUuid: 'form-1',
  appType: 'APP',
  title: '实例 1',
  data: { hidden: 'secret', readonly: 'locked', editable: 'Alice', extra: 'ignored' },
  createdAt: '2026-01-01T00:00:00Z',
};

function createRequest(
  overrides: {
    permission?: ViewPermissionSummary | null;
    form?: any;
    rejectLoad?: boolean;
    rejectSave?: boolean;
    rejectDelete?: boolean;
  } = {},
) {
  return vi.fn(async (config: RuntimeRequestConfig): Promise<RuntimeResponse<any>> => {
    if (overrides.rejectLoad && config.method === 'get') {
      throw new Error('load failed');
    }
    if (config.url === '/permission/form-group/view-permissions') {
      return { success: true, data: overrides.permission ?? basePermission };
    }
    if (config.url === '/form/queryFormDataByFormInstanceId') {
      return { success: true, data: overrides.form ?? formInstance };
    }
    if (config.url === '/APP/v1/form/updateFormData.json') {
      if (overrides.rejectSave) throw new Error('save failed');
      return { success: true, data: { ok: true } };
    }
    if (config.url === '/APP/v1/form/deleteFormData.json') {
      if (overrides.rejectDelete) throw new Error('delete failed');
      return { success: true, data: { ok: true } };
    }
    return { success: true, data: {} };
  });
}

function renderUseFormDetail(request = createRequest(), onPermissionDenied = vi.fn()) {
  const api = createFormRuntimeApi({ request });
  const context: FormContextValue = {
    mode: 'readonly',
    schema: { formMeta: { formUuid: 'form-1', appType: 'APP' }, fields: [] },
    formData: {},
    fieldErrors: {},
    fieldBehaviors: {},
    api,
    config: { mode: 'readonly', formUuid: 'form-1', appType: 'APP', formInstanceId: 'inst-1' },
    setFieldValue: vi.fn(),
    getFieldValue: vi.fn(),
    getFormData: vi.fn(() => ({})),
    validateField: vi.fn(),
    validateAll: vi.fn(),
    resetForm: vi.fn(),
    registerField: vi.fn(),
    unregisterField: vi.fn(),
  } as any;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <FormContext.Provider value={context}>{children}</FormContext.Provider>
  );
  const options = {
    formUuid: 'form-1',
    appType: 'APP',
    formInstanceId: 'inst-1',
    fieldIds: ['hidden', 'readonly', 'editable'] as const,
    onPermissionDenied,
  };

  return renderHook(() => useFormDetail(options), { wrapper });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useFormDetail', () => {
  it('loads form details, computes permissions and switches edit modes', async () => {
    const request = createRequest();
    const { result } = renderUseFormDetail(request);

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.formData).toEqual({
      hidden: 'secret',
      readonly: 'locked',
      editable: 'Alice',
    });
    expect(result.current.instanceInfo).toMatchObject({ formInstanceId: 'inst-1' });
    expect(result.current.permissions).toEqual(basePermission);
    expect(result.current.fieldBehaviors).toEqual({
      hidden: 'HIDDEN',
      readonly: 'READONLY',
      editable: 'READONLY',
    });
    expect(result.current.canEdit).toBe(true);
    expect(result.current.canDelete).toBe(true);
    expect(result.current.canViewChangeRecords).toBe(true);

    await act(async () => {
      result.current.switchToEdit();
    });
    await waitFor(() => expect(result.current.mode).toBe('edit'));
    expect(result.current.fieldBehaviors.editable).toBe('NORMAL');

    act(() => {
      result.current.switchToReadonly();
    });
    expect(result.current.mode).toBe('readonly');

    let saved = false;
    await act(async () => {
      saved = await result.current.saveChanges({ editable: 'Bob' });
    });
    expect(saved).toBe(true);
    expect(result.current.formData).toEqual({ editable: 'Bob' });
    expect(result.current.mode).toBe('readonly');
    expect(request).toHaveBeenCalledWith({
      url: '/APP/v1/form/updateFormData.json',
      method: 'post',
      data: {
        formUuid: 'form-1',
        appType: 'APP',
        updateFormDataJson: JSON.stringify({ editable: 'Bob' }),
        formInstId: 'inst-1',
      },
    });

    await expect(result.current.deleteInstance()).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith({
      url: '/APP/v1/form/deleteFormData.json',
      method: 'post',
      data: { appType: 'APP', formUuid: 'form-1', formInstId: 'inst-1' },
    });
  });

  it('notifies when no view permission is returned', async () => {
    const onPermissionDenied = vi.fn();
    const request = createRequest({
      permission: { operations: [], fieldPermissions: {} },
      form: {
        ...formInstance,
        data: undefined,
        formDataJson: JSON.stringify({ editable: 'Json Alice' }),
      },
    });
    const { result } = renderUseFormDetail(request, onPermissionDenied);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(onPermissionDenied).toHaveBeenCalledTimes(1);
    expect(result.current.canEdit).toBe(false);
    expect(result.current.canDelete).toBe(false);
    expect(result.current.canViewChangeRecords).toBe(false);
    expect(result.current.fieldBehaviors).toEqual({});
    expect(result.current.formData).toEqual({ editable: 'Json Alice' });
  });

  it('does not reload when callback or equivalent fieldIds references change', async () => {
    const request = createRequest();
    const api = createFormRuntimeApi({ request });
    const context: FormContextValue = {
      mode: 'readonly',
      schema: { formMeta: { formUuid: 'form-1', appType: 'APP' }, fields: [] },
      formData: {},
      fieldErrors: {},
      fieldBehaviors: {},
      api,
      config: { mode: 'readonly', formUuid: 'form-1', appType: 'APP', formInstanceId: 'inst-1' },
      setFieldValue: vi.fn(),
      getFieldValue: vi.fn(),
      getFormData: vi.fn(() => ({})),
      validateField: vi.fn(),
      validateAll: vi.fn(),
      resetForm: vi.fn(),
      registerField: vi.fn(),
      unregisterField: vi.fn(),
    } as any;
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <FormContext.Provider value={context}>{children}</FormContext.Provider>
    );

    const { result, rerender } = renderHook(
      ({
        fieldIds,
        onPermissionDenied,
      }: {
        fieldIds: readonly string[];
        onPermissionDenied: () => void;
      }) =>
        useFormDetail({
          formUuid: 'form-1',
          appType: 'APP',
          formInstanceId: 'inst-1',
          fieldIds,
          onPermissionDenied,
        }),
      {
        wrapper,
        initialProps: {
          fieldIds: ['hidden', 'readonly', 'editable'] as const,
          onPermissionDenied: vi.fn(),
        },
      },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(request).toHaveBeenCalledTimes(2);

    rerender({
      fieldIds: ['hidden', 'readonly', 'editable'] as const,
      onPermissionDenied: vi.fn(),
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(request).toHaveBeenCalledTimes(2);
  });

  it('clears loaded state when detail loading fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderUseFormDetail(createRequest({ rejectLoad: true }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.permissions).toBeNull();
    expect(result.current.instanceInfo).toBeNull();
    expect(result.current.formData).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      '[useFormDetail] Failed to load data:',
      expect.any(Error),
    );
  });

  it('returns false when saving or deleting fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderUseFormDetail(createRequest({ rejectSave: true, rejectDelete: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.saveChanges({ editable: 'Bob' })).resolves.toBe(false);
    await expect(result.current.deleteInstance()).resolves.toBe(false);

    expect(errorSpy).toHaveBeenCalledWith(
      '[useFormDetail] Failed to save changes:',
      expect.any(Error),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      '[useFormDetail] Failed to delete instance:',
      expect.any(Error),
    );
  });
});
