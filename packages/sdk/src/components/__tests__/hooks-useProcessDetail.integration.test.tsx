import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { useProcessDetail } from '../hooks/useProcessDetail';
import { FormContext } from '../core/FormContext';
import type { FormContextValue } from '../core/FormContext';

vi.mock('../core/processApi', () => ({
  getProcessBasic: vi.fn(),
  getProcessProgress: vi.fn(),
  checkUserApproval: vi.fn(),
  getViewPermission: vi.fn(),
  getFormData: vi.fn(),
  getProcessDefinition: vi.fn(),
}));

import {
  getProcessBasic,
  getProcessProgress,
  checkUserApproval,
  getViewPermission,
  getFormData,
  getProcessDefinition,
} from '../core/processApi';

const mockGetProcessBasic = vi.mocked(getProcessBasic);
const mockGetProcessProgress = vi.mocked(getProcessProgress);
const mockCheckUserApproval = vi.mocked(checkUserApproval);
const mockGetViewPermission = vi.mocked(getViewPermission);
const mockGetFormData = vi.mocked(getFormData);
const mockGetProcessDefinition = vi.mocked(getProcessDefinition);

function createWrapper() {
  const contextValue = {
    mode: 'readonly',
    schema: { pages: [], fields: [] },
    formData: {},
    fieldErrors: {},
    fieldBehaviors: {},
    api: { request: vi.fn(), uploadFile: vi.fn(), getFileUrl: vi.fn() },
    config: { mode: 'readonly', formUuid: 'form-1', appType: 'app-1', formInstanceId: 'inst-1' },
    setFieldValue: vi.fn(),
    getFieldValue: vi.fn(),
    getFormData: vi.fn(),
    validateField: vi.fn(),
    validateAll: vi.fn(),
    resetForm: vi.fn(),
    registerField: vi.fn(),
    unregisterField: vi.fn(),
  } as unknown as FormContextValue;

  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(FormContext.Provider, { value: contextValue }, children);
}

describe('useProcessDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows default approval actions when permission has current pending tasks', async () => {
    mockGetProcessBasic.mockResolvedValue({
      instanceId: 'inst-1',
      processStatus: 'running',
      formUuid: 'form-1',
      appType: 'app-1',
      originatorId: 'user-1',
      originatorName: '平台管理员',
      createdAt: '2026-05-13 18:20:07',
      currentTask: {
        id: 'basic-task',
        taskId: 'basic-task',
        nodeId: 'node-1',
        nodeType: 'approval',
        nodeName: '主管审批',
        status: 'pending',
      },
    });
    mockCheckUserApproval.mockResolvedValue({
      hasPermission: true,
      isApprover: true,
      canUndo: true,
      currentTasks: [
        {
          id: 'permission-task',
          taskId: 'permission-task',
          nodeId: 'node-1',
          nodeType: 'approval',
          nodeName: '主管审批',
          status: 'pending',
        },
      ],
    });
    mockGetViewPermission.mockResolvedValue({
      fieldPermissions: {},
      operations: ['VIEW', 'VIEW_PROCESS'],
    });
    mockGetFormData.mockResolvedValue({ formInstanceId: 'inst-1' } as any);
    mockGetProcessProgress.mockResolvedValue([]);
    mockGetProcessDefinition.mockResolvedValue({ processId: 'proc-1' });

    const { result } = renderHook(
      () =>
        useProcessDetail({
          formUuid: 'form-1',
          appType: 'app-1',
          formInstanceId: 'inst-1',
          fieldIds: [],
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isApprover).toBe(true);
    expect(result.current.currentTask?.taskId).toBe('permission-task');
    expect(result.current.activeActions.map((action) => action.action)).toEqual([
      'agree',
      'rejected',
      'withdraw',
    ]);
    expect(result.current.canViewWorkflow).toBe(true);
  });

  it('hides withdraw for final or executing processes', async () => {
    mockCheckUserApproval.mockResolvedValue({
      hasPermission: true,
      isApprover: true,
      canUndo: true,
      currentTasks: [
        {
          id: 'permission-task',
          taskId: 'permission-task',
          nodeId: 'node-1',
          nodeType: 'approval',
          nodeName: '主管审批',
          status: 'pending',
        },
      ],
    });
    mockGetViewPermission.mockResolvedValue({
      fieldPermissions: {},
      operations: ['VIEW', 'VIEW_PROCESS'],
    });
    mockGetFormData.mockResolvedValue({ formInstanceId: 'inst-1' } as any);
    mockGetProcessProgress.mockResolvedValue([]);
    mockGetProcessDefinition.mockResolvedValue({ processId: 'proc-1' });

    for (const status of ['completed', 'terminated', 'withdrawn', 'cancelled'] as const) {
      vi.clearAllMocks();
      mockGetProcessBasic.mockResolvedValue({
        instanceId: 'inst-1',
        processStatus: status,
        formUuid: 'form-1',
        appType: 'app-1',
        originatorId: 'user-1',
        originatorName: '平台管理员',
        createdAt: '2026-05-13 18:20:07',
      });
      mockCheckUserApproval.mockResolvedValue({
        hasPermission: true,
        isApprover: true,
        canUndo: true,
        currentTasks: [],
      });
      mockGetViewPermission.mockResolvedValue({
        fieldPermissions: {},
        operations: ['VIEW', 'VIEW_PROCESS'],
      });
      mockGetFormData.mockResolvedValue({ formInstanceId: 'inst-1' } as any);
      mockGetProcessProgress.mockResolvedValue([]);

      const { result } = renderHook(
        () =>
          useProcessDetail({
            formUuid: 'form-1',
            appType: 'app-1',
            formInstanceId: 'inst-1',
            fieldIds: [],
          }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.canWithdraw).toBe(false);
      expect(result.current.activeActions).toEqual([]);
    }

    mockGetProcessBasic.mockResolvedValue({
      instanceId: 'inst-1',
      processStatus: 'running',
      formUuid: 'form-1',
      appType: 'app-1',
      originatorId: 'user-1',
      originatorName: '平台管理员',
      createdAt: '2026-05-13 18:20:07',
      isExecuting: true,
    });
    mockCheckUserApproval.mockResolvedValue({
      hasPermission: true,
      isApprover: true,
      canUndo: true,
      currentTasks: [],
    });
    mockGetViewPermission.mockResolvedValue({
      fieldPermissions: {},
      operations: ['VIEW', 'VIEW_PROCESS'],
    });
    mockGetFormData.mockResolvedValue({ formInstanceId: 'inst-1' } as any);
    mockGetProcessProgress.mockResolvedValue([]);

    const { result } = renderHook(
      () =>
        useProcessDetail({
          formUuid: 'form-1',
          appType: 'app-1',
          formInstanceId: 'inst-1',
          fieldIds: [],
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.canWithdraw).toBe(false);
  });

  it('marks access denied and load errors explicitly', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGetProcessBasic.mockResolvedValue({} as any);
    mockCheckUserApproval.mockResolvedValue({
      hasPermission: false,
      isApprover: false,
      canUndo: false,
    });
    mockGetViewPermission.mockResolvedValue({ fieldPermissions: {}, operations: [] });
    mockGetFormData.mockResolvedValue({ formInstanceId: 'inst-1' } as any);

    const { result, unmount } = renderHook(
      () =>
        useProcessDetail({
          formUuid: 'form-1',
          appType: 'app-1',
          formInstanceId: 'inst-1',
          fieldIds: [],
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.accessDenied).toBe(true);

    unmount();
    vi.clearAllMocks();
    mockGetProcessBasic.mockRejectedValue(new Error('boom'));
    mockCheckUserApproval.mockResolvedValue({
      hasPermission: false,
      isApprover: false,
      canUndo: false,
    });
    mockGetViewPermission.mockResolvedValue({ fieldPermissions: {}, operations: ['VIEW'] });
    mockGetFormData.mockResolvedValue({ formInstanceId: 'inst-1' } as any);

    const { result: errorResult } = renderHook(
      () =>
        useProcessDetail({
          formUuid: 'form-1',
          appType: 'app-1',
          formInstanceId: 'inst-1',
          fieldIds: [],
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(errorResult.current.loadError).toBe('boom'));
    consoleSpy.mockRestore();
  });
});
