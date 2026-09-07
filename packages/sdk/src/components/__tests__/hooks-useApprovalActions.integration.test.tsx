import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { useApprovalActions } from '../hooks/useApprovalActions';
import { FormContext } from '../core/FormContext';
import type { FormContextValue } from '../core/FormContext';

vi.mock('../core/processApi', () => ({
  handleApproval: vi.fn(),
  withdrawProcess: vi.fn(),
  transferTask: vi.fn(),
  returnTask: vi.fn(),
  resubmitTask: vi.fn(),
  saveTask: vi.fn(),
  getReturnableNodeResult: vi.fn(),
}));

import {
  handleApproval,
  withdrawProcess,
  transferTask,
  returnTask,
  resubmitTask,
  saveTask,
  getReturnableNodeResult,
} from '../core/processApi';

const mockHandleApproval = vi.mocked(handleApproval);
const mockWithdrawProcess = vi.mocked(withdrawProcess);
const mockTransferTask = vi.mocked(transferTask);
const mockReturnTask = vi.mocked(returnTask);
const mockResubmitTask = vi.mocked(resubmitTask);
const mockSaveTask = vi.mocked(saveTask);
const mockGetReturnableNodeResult = vi.mocked(getReturnableNodeResult);

function createWrapper() {
  const mockRequest = vi.fn();
  const contextValue = {
    mode: 'edit',
    schema: { pages: [], fields: {} },
    formData: {},
    fieldErrors: {},
    fieldBehaviors: {},
    api: { request: mockRequest, uploadFile: vi.fn(), getFileUrl: vi.fn() },
    config: { mode: 'edit', formUuid: 'uuid', appType: 'app', formInstanceId: 'inst' },
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

describe('useApprovalActions', () => {
  const defaultOptions = {
    formInstanceId: 'inst-123',
    formUuid: 'form-456',
    appType: 'myApp',
    currentTaskId: 'task-789',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('初始状态', () => {
    it('should return initial state', () => {
      const { result } = renderHook(() => useApprovalActions(defaultOptions), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.currentAction).toBeNull();
      expect(result.current.returnableNodes).toEqual([]);
      expect(typeof result.current.approve).toBe('function');
      expect(typeof result.current.reject).toBe('function');
      expect(typeof result.current.transfer).toBe('function');
      expect(typeof result.current.returnTo).toBe('function');
      expect(typeof result.current.withdraw).toBe('function');
      expect(typeof result.current.save).toBe('function');
      expect(typeof result.current.resubmit).toBe('function');
      expect(typeof result.current.loadReturnableNodes).toBe('function');
    });
  });

  describe('approve', () => {
    it('should call handleApproval and return true on success', async () => {
      mockHandleApproval.mockResolvedValue({});
      const onActionComplete = vi.fn();

      const { result } = renderHook(
        () => useApprovalActions({ ...defaultOptions, onActionComplete }),
        { wrapper: createWrapper() },
      );

      let success: boolean = false;
      await act(async () => {
        success = await result.current.approve('Looks good');
      });

      expect(success).toBe(true);
      expect(mockHandleApproval).toHaveBeenCalledWith(expect.any(Function), {
        instanceId: 'inst-123',
        action: 'approved',
        comments: 'Looks good',
        appType: 'myApp',
        formUuid: 'form-456',
        updateFormDataJson: undefined,
      });
      expect(onActionComplete).toHaveBeenCalledWith('approve');
      expect(result.current.isLoading).toBe(false);
    });

    it('should include form values when getFormValues is provided', async () => {
      mockHandleApproval.mockResolvedValue({});
      const getFormValues = vi.fn().mockReturnValue({ name: 'test' });

      const { result } = renderHook(
        () => useApprovalActions({ ...defaultOptions, getFormValues }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await result.current.approve();
      });

      expect(mockHandleApproval).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          updateFormDataJson: JSON.stringify({ name: 'test' }),
        }),
      );
    });

    it('should return false on error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockHandleApproval.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useApprovalActions(defaultOptions), {
        wrapper: createWrapper(),
      });

      let success: boolean = true;
      await act(async () => {
        success = await result.current.approve();
      });

      expect(success).toBe(false);
      expect(result.current.isLoading).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe('reject', () => {
    it('should call handleApproval with rejected action', async () => {
      mockHandleApproval.mockResolvedValue({});
      const onActionComplete = vi.fn();

      const { result } = renderHook(
        () => useApprovalActions({ ...defaultOptions, onActionComplete }),
        { wrapper: createWrapper() },
      );

      let success: boolean = false;
      await act(async () => {
        success = await result.current.reject('Not acceptable');
      });

      expect(success).toBe(true);
      expect(mockHandleApproval).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          action: 'rejected',
          comments: 'Not acceptable',
        }),
      );
      expect(onActionComplete).toHaveBeenCalledWith('reject');
    });

    it('should return false on error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockHandleApproval.mockRejectedValue(new Error('Error'));

      const { result } = renderHook(() => useApprovalActions(defaultOptions), {
        wrapper: createWrapper(),
      });

      let success: boolean = true;
      await act(async () => {
        success = await result.current.reject();
      });

      expect(success).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe('transfer', () => {
    it('should transfer task successfully', async () => {
      mockTransferTask.mockResolvedValue({});
      const onActionComplete = vi.fn();

      const { result } = renderHook(
        () => useApprovalActions({ ...defaultOptions, onActionComplete }),
        { wrapper: createWrapper() },
      );

      let success: boolean = false;
      await act(async () => {
        success = await result.current.transfer('user-2', 'Delegate');
      });

      expect(success).toBe(true);
      expect(mockTransferTask).toHaveBeenCalledWith(expect.any(Function), {
        taskId: 'task-789',
        newAssignee: 'user-2',
        reason: 'Delegate',
      });
      expect(onActionComplete).toHaveBeenCalledWith('transfer');
    });

    it('should return false when no currentTaskId', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(
        () => useApprovalActions({ ...defaultOptions, currentTaskId: undefined }),
        { wrapper: createWrapper() },
      );

      let success: boolean = true;
      await act(async () => {
        success = await result.current.transfer('user-2');
      });

      expect(success).toBe(false);
      expect(mockTransferTask).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should return false on error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockTransferTask.mockRejectedValue(new Error('Error'));

      const { result } = renderHook(() => useApprovalActions(defaultOptions), {
        wrapper: createWrapper(),
      });

      let success: boolean = true;
      await act(async () => {
        success = await result.current.transfer('user-2');
      });

      expect(success).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe('returnTo', () => {
    it('should return task successfully', async () => {
      mockReturnTask.mockResolvedValue({});
      const onActionComplete = vi.fn();

      const { result } = renderHook(
        () => useApprovalActions({ ...defaultOptions, onActionComplete }),
        { wrapper: createWrapper() },
      );

      let success: boolean = false;
      await act(async () => {
        success = await result.current.returnTo('node-1', 'Redo');
      });

      expect(success).toBe(true);
      expect(mockReturnTask).toHaveBeenCalledWith(expect.any(Function), {
        taskId: 'task-789',
        targetNodeId: 'node-1',
        reason: 'Redo',
      });
      expect(onActionComplete).toHaveBeenCalledWith('return');
    });

    it('should return false when no currentTaskId', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(
        () => useApprovalActions({ ...defaultOptions, currentTaskId: undefined }),
        { wrapper: createWrapper() },
      );

      let success: boolean = true;
      await act(async () => {
        success = await result.current.returnTo('node-1');
      });

      expect(success).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe('withdraw', () => {
    it('should withdraw process successfully', async () => {
      mockWithdrawProcess.mockResolvedValue({});
      const onActionComplete = vi.fn();

      const { result } = renderHook(
        () => useApprovalActions({ ...defaultOptions, onActionComplete }),
        { wrapper: createWrapper() },
      );

      let success: boolean = false;
      await act(async () => {
        success = await result.current.withdraw('Changed mind');
      });

      expect(success).toBe(true);
      expect(mockWithdrawProcess).toHaveBeenCalledWith(expect.any(Function), {
        instanceId: 'inst-123',
        reason: 'Changed mind',
      });
      expect(onActionComplete).toHaveBeenCalledWith('withdraw');
    });

    it('should return false on error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockWithdrawProcess.mockRejectedValue(new Error('Error'));

      const { result } = renderHook(() => useApprovalActions(defaultOptions), {
        wrapper: createWrapper(),
      });

      let success: boolean = true;
      await act(async () => {
        success = await result.current.withdraw();
      });

      expect(success).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe('save', () => {
    it('should save task successfully', async () => {
      mockSaveTask.mockResolvedValue({});
      const getFormValues = vi.fn().mockReturnValue({ field1: 'val1' });
      const onActionComplete = vi.fn();

      const { result } = renderHook(
        () => useApprovalActions({ ...defaultOptions, getFormValues, onActionComplete }),
        { wrapper: createWrapper() },
      );

      let success: boolean = false;
      await act(async () => {
        success = await result.current.save();
      });

      expect(success).toBe(true);
      expect(mockSaveTask).toHaveBeenCalledWith(expect.any(Function), {
        instanceId: 'inst-123',
        formUuid: 'form-456',
        appType: 'myApp',
        updateFormDataJson: JSON.stringify({ field1: 'val1' }),
      });
      expect(onActionComplete).toHaveBeenCalledWith('save');
    });

    it('should use empty object when getFormValues returns undefined', async () => {
      mockSaveTask.mockResolvedValue({});

      const { result } = renderHook(() => useApprovalActions({ ...defaultOptions }), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.save();
      });

      expect(mockSaveTask).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          updateFormDataJson: JSON.stringify({}),
        }),
      );
    });

    it('should return false on error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockSaveTask.mockRejectedValue(new Error('Error'));

      const { result } = renderHook(() => useApprovalActions(defaultOptions), {
        wrapper: createWrapper(),
      });

      let success: boolean = true;
      await act(async () => {
        success = await result.current.save();
      });

      expect(success).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe('resubmit', () => {
    it('should resubmit task successfully', async () => {
      mockResubmitTask.mockResolvedValue({});
      const getFormValues = vi.fn().mockReturnValue({ data: 'new' });
      const onActionComplete = vi.fn();

      const { result } = renderHook(
        () => useApprovalActions({ ...defaultOptions, getFormValues, onActionComplete }),
        { wrapper: createWrapper() },
      );

      let success: boolean = false;
      await act(async () => {
        success = await result.current.resubmit('Updated');
      });

      expect(success).toBe(true);
      expect(mockResubmitTask).toHaveBeenCalledWith(expect.any(Function), {
        taskId: 'task-789',
        formUuid: 'form-456',
        appType: 'myApp',
        updateFormDataJson: JSON.stringify({ data: 'new' }),
        comments: 'Updated',
      });
      expect(onActionComplete).toHaveBeenCalledWith('resubmit');
    });

    it('should return false when no currentTaskId', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(
        () => useApprovalActions({ ...defaultOptions, currentTaskId: undefined }),
        { wrapper: createWrapper() },
      );

      let success: boolean = true;
      await act(async () => {
        success = await result.current.resubmit();
      });

      expect(success).toBe(false);
      consoleSpy.mockRestore();
    });

    it('should return false on error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockResubmitTask.mockRejectedValue(new Error('Error'));

      const { result } = renderHook(() => useApprovalActions(defaultOptions), {
        wrapper: createWrapper(),
      });

      let success: boolean = true;
      await act(async () => {
        success = await result.current.resubmit();
      });

      expect(success).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe('loadReturnableNodes', () => {
    it('should load returnable nodes successfully', async () => {
      const nodes = [
        { nodeId: 'node-1', nodeName: 'Start' },
        { nodeId: 'node-2', nodeName: 'Review' },
      ];
      mockGetReturnableNodeResult.mockResolvedValue({
        nodes,
        policy: { resubmitMode: 'resume_current' },
      });

      const { result } = renderHook(() => useApprovalActions(defaultOptions), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.loadReturnableNodes();
      });

      expect(result.current.returnableNodes).toEqual(nodes);
      expect(result.current.returnPolicy).toEqual({ resubmitMode: 'resume_current' });
      expect(mockGetReturnableNodeResult).toHaveBeenCalledWith(expect.any(Function), 'task-789');
    });

    it('should not load when no currentTaskId', async () => {
      const { result } = renderHook(
        () => useApprovalActions({ ...defaultOptions, currentTaskId: undefined }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await result.current.loadReturnableNodes();
      });

      expect(mockGetReturnableNodeResult).not.toHaveBeenCalled();
    });

    it('should handle error gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockGetReturnableNodeResult.mockRejectedValue(new Error('Error'));

      const { result } = renderHook(() => useApprovalActions(defaultOptions), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.loadReturnableNodes();
      });

      expect(result.current.returnableNodes).toEqual([]);
      consoleSpy.mockRestore();
    });
  });

  describe('边界情况', () => {
    it('should throw error when used outside FormProvider', () => {
      expect(() => {
        renderHook(() => useApprovalActions(defaultOptions));
      }).toThrow('useFormContext must be used within a FormProvider');
    });
  });
});
