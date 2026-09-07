import { useState, useEffect, useCallback, useRef } from 'react';
import type { FieldBehavior, FormInstanceData, ViewPermissionSummary } from '../types';
import { getFormData, getViewPermission, deleteFormData } from '../core/processApi';
import { useFormContext } from '../core/FormContext';
import { extractFormValues, normalizeFormInstanceInfo } from '../utils/formInstanceData';
import { hasViewOperation, normalizeFieldBehaviors } from '../utils/permissions';

export interface UseFormDetailOptions {
  formUuid: string;
  appType: string;
  formInstanceId: string;
  fieldIds?: readonly string[];
  onPermissionDenied?: () => void;
}

export interface UseFormDetailReturn {
  loading: boolean;
  mode: 'readonly' | 'edit';
  formData: Record<string, any> | null;
  instanceInfo: FormInstanceData | null;
  permissions: ViewPermissionSummary | null;
  fieldBehaviors: Record<string, FieldBehavior>;

  switchToEdit: () => void;
  switchToReadonly: () => void;
  saveChanges: (values: Record<string, any>) => Promise<boolean>;
  deleteInstance: () => Promise<boolean>;

  canEdit: boolean;
  canDelete: boolean;
  canViewChangeRecords: boolean;
}

/**
 * 详情页核心逻辑 hook
 * 处理数据加载、权限计算、模式切换、保存和删除
 */
export function useFormDetail(options: UseFormDetailOptions): UseFormDetailReturn {
  const { formUuid, appType, formInstanceId, fieldIds, onPermissionDenied } = options;
  const { api } = useFormContext();
  const request = api.request;

  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'readonly' | 'edit'>('readonly');
  const [formData, setFormData] = useState<Record<string, any> | null>(null);
  const [instanceInfo, setInstanceInfo] = useState<FormInstanceData | null>(null);
  const [permissions, setPermissions] = useState<ViewPermissionSummary | null>(null);

  const mountedRef = useRef(true);
  const onPermissionDeniedRef = useRef(onPermissionDenied);
  const fieldIdsKey = fieldIds?.join('\u0001') ?? '';

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    onPermissionDeniedRef.current = onPermissionDenied;
  }, [onPermissionDenied]);

  const loadData = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    try {
      const [permResult, formResult] = await Promise.all([
        getViewPermission(request, { formUuid, appType, formInstanceId }),
        getFormData(request, { formInstanceId, appType, formUuid }),
      ]);

      if (!mountedRef.current) return;

      // 检查是否有权限
      if (!permResult || !hasViewOperation(permResult.operations, 'view')) {
        onPermissionDeniedRef.current?.();
      }

      const normalizedInfo = normalizeFormInstanceInfo(formResult, {
        formUuid,
        appType,
        formInstanceId,
      });
      setPermissions(permResult);
      setInstanceInfo(normalizedInfo);
      setFormData(
        extractFormValues(formResult, fieldIdsKey ? fieldIdsKey.split('\u0001') : undefined),
      );
    } catch (error) {
      console.error('[useFormDetail] Failed to load data:', error);
      if (mountedRef.current) {
        setPermissions(null);
        setInstanceInfo(null);
        setFormData(null);
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

  const fieldBehaviors = normalizeFieldBehaviors(permissions, mode);

  const canEdit = hasViewOperation(permissions?.operations, 'edit');
  const canDelete = hasViewOperation(permissions?.operations, 'delete');
  const canViewChangeRecords = hasViewOperation(permissions?.operations, 'change_records');

  const switchToEdit = useCallback(() => {
    // 切换到编辑模式时重新加载最新数据
    setMode('edit');
    loadData();
  }, [loadData]);

  const switchToReadonly = useCallback(() => {
    setMode('readonly');
  }, []);

  const saveChanges = useCallback(
    async (values: Record<string, any>): Promise<boolean> => {
      try {
        await api.updateFormData({
          formInstanceId,
          formUuid,
          appType,
          updateFormDataJson: JSON.stringify(values),
        });
        if (mountedRef.current) {
          setFormData(values);
          setMode('readonly');
        }
        return true;
      } catch (error) {
        console.error('[useFormDetail] Failed to save changes:', error);
        return false;
      }
    },
    [api, formInstanceId, formUuid, appType],
  );

  const deleteInstance = useCallback(async (): Promise<boolean> => {
    try {
      await deleteFormData(request, { formInstanceId, appType, formUuid });
      return true;
    } catch (error) {
      console.error('[useFormDetail] Failed to delete instance:', error);
      return false;
    }
  }, [request, formInstanceId, appType, formUuid]);

  return {
    loading,
    mode,
    formData,
    instanceInfo,
    permissions,
    fieldBehaviors,
    switchToEdit,
    switchToReadonly,
    saveChanges,
    deleteInstance,
    canEdit,
    canDelete,
    canViewChangeRecords,
  };
}
