import { useState, useCallback, useRef, useEffect } from 'react';
import type { InitiatorSelectedApprovers, ReturnPolicy, ReturnableNode } from '../types';
import {
  handleApproval,
  withdrawProcess,
  transferTask,
  returnTask,
  resubmitTask,
  saveTask,
  getReturnableNodeResult,
  triggerCallbackTask,
} from '../core/processApi';
import { useFormContext } from '../core/FormContext';

export interface UseApprovalActionsOptions {
  formInstanceId: string;
  formUuid: string;
  appType: string;
  currentTaskId?: string;
  onActionComplete?: (action: string) => Promise<void> | void;
  getFormValues?: () => Record<string, any>;
}

export interface UseApprovalActionsReturn {
  approve: (comments?: string) => Promise<boolean>;
  reject: (comments?: string) => Promise<boolean>;
  transfer: (userId: string, reason?: string) => Promise<boolean>;
  returnTo: (nodeId: string, reason?: string) => Promise<boolean>;
  withdraw: (reason?: string) => Promise<boolean>;
  save: () => Promise<boolean>;
  resubmit: (comments?: string, selectedApprovers?: InitiatorSelectedApprovers) => Promise<boolean>;
  callbackTask: (payload?: Record<string, any>) => Promise<boolean>;

  isLoading: boolean;
  currentAction: string | null;
  returnableNodes: ReturnableNode[];
  returnPolicy: ReturnPolicy | null;
  loadReturnableNodes: () => Promise<ReturnableNode[]>;
}

/**
 * 审批操作逻辑 hook
 */
export function useApprovalActions(options: UseApprovalActionsOptions): UseApprovalActionsReturn {
  const { formInstanceId, formUuid, appType, currentTaskId, onActionComplete, getFormValues } =
    options;
  const { api } = useFormContext();
  const request = api.request;

  const [isLoading, setIsLoading] = useState(false);
  const [currentAction, setCurrentAction] = useState<string | null>(null);
  const [returnableNodes, setReturnableNodes] = useState<ReturnableNode[]>([]);
  const [returnPolicy, setReturnPolicy] = useState<ReturnPolicy | null>(null);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const resetLoading = useCallback(() => {
    if (mountedRef.current) {
      setIsLoading(false);
      setCurrentAction(null);
    }
  }, []);

  const approve = useCallback(
    async (comments?: string): Promise<boolean> => {
      setIsLoading(true);
      setCurrentAction('approve');
      try {
        const formValues = getFormValues?.();
        await handleApproval(request, {
          instanceId: formInstanceId,
          action: 'approved',
          comments,
          appType,
          formUuid,
          updateFormDataJson: formValues ? JSON.stringify(formValues) : undefined,
        });
        await onActionComplete?.('approve');
        resetLoading();
        return true;
      } catch (error) {
        console.error('[useApprovalActions] approve failed:', error);
        resetLoading();
        return false;
      }
    },
    [request, formInstanceId, appType, formUuid, getFormValues, onActionComplete, resetLoading],
  );

  const reject = useCallback(
    async (comments?: string): Promise<boolean> => {
      setIsLoading(true);
      setCurrentAction('reject');
      try {
        await handleApproval(request, {
          instanceId: formInstanceId,
          action: 'rejected',
          comments,
        });
        await onActionComplete?.('reject');
        resetLoading();
        return true;
      } catch (error) {
        console.error('[useApprovalActions] reject failed:', error);
        resetLoading();
        return false;
      }
    },
    [request, formInstanceId, onActionComplete, resetLoading],
  );

  const transfer = useCallback(
    async (userId: string, reason?: string): Promise<boolean> => {
      if (!currentTaskId) {
        console.error('[useApprovalActions] transfer failed: no currentTaskId');
        return false;
      }
      setIsLoading(true);
      setCurrentAction('transfer');
      try {
        await transferTask(request, {
          taskId: currentTaskId,
          newAssignee: userId,
          reason,
        });
        await onActionComplete?.('transfer');
        resetLoading();
        return true;
      } catch (error) {
        console.error('[useApprovalActions] transfer failed:', error);
        resetLoading();
        return false;
      }
    },
    [request, currentTaskId, onActionComplete, resetLoading],
  );

  const returnTo = useCallback(
    async (nodeId: string, reason?: string): Promise<boolean> => {
      if (!currentTaskId) {
        console.error('[useApprovalActions] returnTo failed: no currentTaskId');
        return false;
      }
      setIsLoading(true);
      setCurrentAction('return');
      try {
        await returnTask(request, {
          taskId: currentTaskId,
          targetNodeId: nodeId,
          reason,
        });
        await onActionComplete?.('return');
        resetLoading();
        return true;
      } catch (error) {
        console.error('[useApprovalActions] returnTo failed:', error);
        resetLoading();
        return false;
      }
    },
    [request, currentTaskId, onActionComplete, resetLoading],
  );

  const withdraw = useCallback(
    async (reason?: string): Promise<boolean> => {
      setIsLoading(true);
      setCurrentAction('withdraw');
      try {
        await withdrawProcess(request, {
          instanceId: formInstanceId,
          reason,
        });
        await onActionComplete?.('withdraw');
        resetLoading();
        return true;
      } catch (error) {
        console.error('[useApprovalActions] withdraw failed:', error);
        resetLoading();
        return false;
      }
    },
    [request, formInstanceId, onActionComplete, resetLoading],
  );

  const save = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setCurrentAction('save');
    try {
      const formValues = getFormValues?.() ?? {};
      await saveTask(request, {
        instanceId: formInstanceId,
        formUuid,
        appType,
        updateFormDataJson: JSON.stringify(formValues),
      });
      await onActionComplete?.('save');
      resetLoading();
      return true;
    } catch (error) {
      console.error('[useApprovalActions] save failed:', error);
      resetLoading();
      return false;
    }
  }, [request, formInstanceId, formUuid, appType, getFormValues, onActionComplete, resetLoading]);

  const resubmit = useCallback(
    async (comments?: string, selectedApprovers?: InitiatorSelectedApprovers): Promise<boolean> => {
      if (!currentTaskId) {
        console.error('[useApprovalActions] resubmit failed: no currentTaskId');
        return false;
      }
      setIsLoading(true);
      setCurrentAction('resubmit');
      try {
        const formValues = getFormValues?.() ?? {};
        await resubmitTask(request, {
          taskId: currentTaskId,
          formUuid,
          appType,
          updateFormDataJson: JSON.stringify(formValues),
          comments,
          selectedApprovers,
          initiatorSelectedApprovers: selectedApprovers,
        });
        await onActionComplete?.('resubmit');
        resetLoading();
        return true;
      } catch (error) {
        console.error('[useApprovalActions] resubmit failed:', error);
        resetLoading();
        return false;
      }
    },
    [request, currentTaskId, formUuid, appType, getFormValues, onActionComplete, resetLoading],
  );

  const callbackTask = useCallback(
    async (payload?: Record<string, any>): Promise<boolean> => {
      if (!currentTaskId) {
        console.error('[useApprovalActions] callbackTask failed: no currentTaskId');
        return false;
      }
      setIsLoading(true);
      setCurrentAction('callback');
      try {
        await triggerCallbackTask(request, {
          taskId: currentTaskId,
          payload,
        });
        await onActionComplete?.('callback');
        resetLoading();
        return true;
      } catch (error) {
        console.error('[useApprovalActions] callbackTask failed:', error);
        resetLoading();
        return false;
      }
    },
    [request, currentTaskId, onActionComplete, resetLoading],
  );

  const loadReturnableNodes = useCallback(async (): Promise<ReturnableNode[]> => {
    if (!currentTaskId) return [];
    try {
      const result = await getReturnableNodeResult(request, currentTaskId);
      if (mountedRef.current) {
        setReturnableNodes(result.nodes);
        setReturnPolicy(result.policy || null);
      }
      return result.nodes;
    } catch (error) {
      console.error('[useApprovalActions] loadReturnableNodes failed:', error);
      if (mountedRef.current) {
        setReturnableNodes([]);
        setReturnPolicy(null);
      }
      return [];
    }
  }, [request, currentTaskId]);

  return {
    approve,
    reject,
    transfer,
    returnTo,
    withdraw,
    save,
    resubmit,
    callbackTask,
    isLoading,
    currentAction,
    returnableNodes,
    returnPolicy,
    loadReturnableNodes,
  };
}
