import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type {
  FieldBehavior,
  FormInstanceData,
  ProcessAction,
  ProcessBasicInfo,
  ProcessDefinition,
  ProcessStatus,
  ProcessTask,
  ViewPermissionSummary,
} from '../types';
import {
  getProcessBasic,
  getProcessProgress,
  checkUserApproval,
  getViewPermission,
  getFormData,
  getProcessDefinition,
  deleteFormData,
} from '../core/processApi';
import { useFormContext } from '../core/FormContext';
import { useFieldPermission } from './useFieldPermission';
import { extractFormValues } from '../utils/formInstanceData';
import { hasViewOperation, hasViewPermission } from '../utils/permissions';

export interface UseProcessDetailOptions {
  formUuid: string;
  appType: string;
  formInstanceId: string;
  fieldIds?: readonly string[];
}

export interface UseProcessDetailReturn {
  loading: boolean;
  processInfo: ProcessBasicInfo | null;
  processStatus: ProcessStatus | null;
  currentTask: ProcessTask | null;
  progressList: ProcessTask[];
  formData: Record<string, any> | null;
  instanceInfo: FormInstanceData | null;
  accessDenied: boolean;
  loadError: string | null;

  isApprover: boolean;
  activeActions: ProcessAction[];
  fieldBehaviors: Record<string, FieldBehavior>;
  mode: 'readonly' | 'edit';

  isOriginatorReturn: boolean;
  isProcessCompleted: boolean;
  canWithdraw: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canViewWorkflow: boolean;
  canViewChangeRecords: boolean;
  dataVersion: number;

  switchToEdit: () => void;
  switchToReadonly: () => void;
  saveChanges: (values: Record<string, any>) => Promise<boolean>;
  deleteInstance: () => Promise<boolean>;
  refreshDetail: () => Promise<void>;
  refreshProgress: () => Promise<void>;
}

const DEFAULT_APPROVAL_ACTIONS: ProcessAction[] = [
  { action: 'agree', name: { zh_CN: '同意' } },
  { action: 'rejected', name: { zh_CN: '拒绝' } },
];

const WITHDRAW_ACTION: ProcessAction = { action: 'withdraw', name: { zh_CN: '撤销' } };
const FINAL_PROCESS_STATUSES = new Set<ProcessStatus>([
  'completed',
  'terminated',
  'withdrawn',
  'cancelled',
]);
const EDITABLE_COMPLETED_STATUSES = new Set<ProcessStatus>(['completed', 'terminated']);

function mergeCurrentTask(
  processTask: ProcessTask | null | undefined,
  approvalTask: ProcessTask | null | undefined,
): ProcessTask | null {
  if (!approvalTask) return processTask ?? null;
  if (!processTask) return approvalTask;

  return {
    ...processTask,
    ...approvalTask,
    nodeName: processTask.nodeName || approvalTask.nodeName,
    title: processTask.title || approvalTask.title,
    actions: processTask.actions ?? approvalTask.actions,
  };
}

/**
 * 流程详情核心逻辑 hook
 */
export function useProcessDetail(options: UseProcessDetailOptions): UseProcessDetailReturn {
  const { formUuid, appType, formInstanceId, fieldIds } = options;
  const { api } = useFormContext();
  const request = api.request;

  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'readonly' | 'edit'>('readonly');
  const [processInfo, setProcessInfo] = useState<ProcessBasicInfo | null>(null);
  const [progressList, setProgressList] = useState<ProcessTask[]>([]);
  const [formData, setFormData] = useState<Record<string, any> | null>(null);
  const [instanceInfo, setInstanceInfo] = useState<FormInstanceData | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isApprover, setIsApprover] = useState(false);
  const [canWithdraw, setCanWithdraw] = useState(false);
  const [approvalTasks, setApprovalTasks] = useState<ProcessTask[]>([]);
  const [permissions, setPermissions] = useState<ViewPermissionSummary | null>(null);
  const [processDefinition, setProcessDefinition] = useState<ProcessDefinition | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  const mountedRef = useRef(true);
  const fieldIdsKey = fieldIds?.join('\u0001') ?? '';

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const currentTask = useMemo(
    () => mergeCurrentTask(processInfo?.currentTask, approvalTasks[0]),
    [processInfo?.currentTask, approvalTasks],
  );
  const processStatus = processInfo?.processStatus ?? null;

  const isProcessFinal = processStatus ? FINAL_PROCESS_STATUSES.has(processStatus) : false;
  const isOriginatorReturn = !isProcessFinal && currentTask?.nodeType === 'originator_return';
  const isProcessCompleted = processStatus ? EDITABLE_COMPLETED_STATUSES.has(processStatus) : false;
  const canEdit = hasViewOperation(permissions?.operations, 'edit');
  const canDelete = hasViewOperation(permissions?.operations, 'delete');
  const canViewWorkflow = hasViewOperation(permissions?.operations, 'workflow');
  const canViewChangeRecords = hasViewOperation(permissions?.operations, 'change_records');
  const fieldPermissionTask = isProcessFinal ? undefined : (currentTask ?? undefined);

  // 使用 useFieldPermission 计算字段行为
  const { fieldBehaviors } = useFieldPermission({
    viewPermissions: permissions ?? undefined,
    processDefinition: processDefinition ?? undefined,
    currentTask: fieldPermissionTask,
    isApprover: isProcessFinal ? false : isApprover,
    mode,
  });

  // 当前任务可执行的操作
  const activeActions: ProcessAction[] = useMemo(() => {
    if (!isApprover || isProcessFinal) return [];

    const actions =
      currentTask?.actions && currentTask.actions.length > 0
        ? [...currentTask.actions]
        : [...DEFAULT_APPROVAL_ACTIONS];

    if (canWithdraw && !actions.some((action) => action.action === 'withdraw')) {
      actions.push(WITHDRAW_ACTION);
    }

    return actions;
  }, [isApprover, isProcessFinal, currentTask?.actions, canWithdraw]);

  const loadData = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    setAccessDenied(false);
    setLoadError(null);
    try {
      // 并行调用基础数据
      const [basicResult, approvalResult, permResult, formResult] = await Promise.all([
        getProcessBasic(request, formInstanceId),
        checkUserApproval(request, formInstanceId),
        getViewPermission(request, { formUuid, appType, formInstanceId }),
        getFormData(request, { formInstanceId, appType, formUuid }),
      ]);

      if (!mountedRef.current) return;

      if (!hasViewPermission(permResult)) {
        setAccessDenied(true);
        setProcessInfo(null);
        setIsApprover(false);
        setCanWithdraw(false);
        setApprovalTasks([]);
        setPermissions(permResult);
        setInstanceInfo(null);
        setFormData(null);
        setProgressList([]);
        setProcessDefinition(null);
        return;
      }

      setProcessInfo(basicResult);
      const nextProcessStatus = basicResult?.processStatus ?? null;
      const nextIsProcessFinal = nextProcessStatus
        ? FINAL_PROCESS_STATUSES.has(nextProcessStatus)
        : false;
      const nextCanWithdraw = Boolean(
        approvalResult?.canUndo &&
        nextProcessStatus === 'running' &&
        basicResult?.isExecuting !== true,
      );
      setIsApprover(nextIsProcessFinal ? false : (approvalResult?.isApprover ?? false));
      setCanWithdraw(nextCanWithdraw);
      setApprovalTasks(nextIsProcessFinal ? [] : (approvalResult?.currentTasks ?? []));
      setPermissions(permResult);
      setInstanceInfo(formResult);
      setFormData(
        extractFormValues(formResult, fieldIdsKey ? fieldIdsKey.split('\u0001') : undefined),
      );
      setDataVersion((version) => version + 1);

      // 如果有流程查看权限，加载进度
      if (hasViewOperation(permResult?.operations, 'workflow')) {
        try {
          const progress = await getProcessProgress(request, formInstanceId);
          if (mountedRef.current) {
            setProgressList(progress);
          }
        } catch (error) {
          console.error('[useProcessDetail] Failed to load progress:', error);
        }
      }

      // 如果是审批人且需要字段配置，加载流程定义
      const task = mergeCurrentTask(basicResult?.currentTask, approvalResult?.currentTasks?.[0]);
      if (
        !nextIsProcessFinal &&
        approvalResult?.isApprover &&
        task &&
        (task.nodeType === 'originator_return' || task.nodeType === 'approval')
      ) {
        try {
          const definition = await getProcessDefinition(request, formUuid);
          if (mountedRef.current) {
            setProcessDefinition(definition);
          }
        } catch (error) {
          console.error('[useProcessDetail] Failed to load process definition:', error);
        }
      } else if (mountedRef.current) {
        setProcessDefinition(null);
      }
    } catch (error) {
      console.error('[useProcessDetail] Failed to load data:', error);
      if (mountedRef.current) {
        setLoadError(error instanceof Error ? error.message : '页面加载失败');
        setAccessDenied(false);
        setProcessInfo(null);
        setFormData(null);
        setInstanceInfo(null);
        setApprovalTasks([]);
        setProgressList([]);
        setProcessDefinition(null);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [request, formUuid, appType, formInstanceId, fieldIdsKey]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const switchToEdit = useCallback(() => {
    setMode('edit');
    void loadData();
  }, [loadData]);

  const switchToReadonly = useCallback(() => {
    setMode('readonly');
  }, []);

  const refreshDetail = useCallback(async () => {
    setMode('readonly');
    await loadData();
  }, [loadData]);

  const refreshProgress = useCallback(async () => {
    await refreshDetail();
  }, [refreshDetail]);

  const saveChanges = useCallback(
    async (values: Record<string, any>): Promise<boolean> => {
      try {
        await api.updateFormData({
          formInstanceId,
          formUuid,
          appType,
          updateFormDataJson: JSON.stringify(values),
        });
        setMode('readonly');
        await loadData();
        return true;
      } catch (error) {
        console.error('[useProcessDetail] Failed to save changes:', error);
        return false;
      }
    },
    [api, formInstanceId, formUuid, appType, loadData],
  );

  const deleteInstance = useCallback(async (): Promise<boolean> => {
    try {
      await deleteFormData(request, { formInstanceId, appType, formUuid });
      return true;
    } catch (error) {
      console.error('[useProcessDetail] Failed to delete instance:', error);
      return false;
    }
  }, [request, formInstanceId, appType, formUuid]);

  return {
    loading,
    processInfo,
    processStatus,
    currentTask,
    progressList,
    formData,
    instanceInfo,
    accessDenied,
    loadError,
    isApprover,
    activeActions,
    fieldBehaviors,
    mode,
    isOriginatorReturn,
    isProcessCompleted,
    canWithdraw,
    canEdit,
    canDelete,
    canViewWorkflow,
    canViewChangeRecords,
    dataVersion,
    switchToEdit,
    switchToReadonly,
    saveChanges,
    deleteInstance,
    refreshDetail,
    refreshProgress,
  };
}
