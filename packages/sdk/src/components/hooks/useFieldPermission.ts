import { useMemo, useCallback } from 'react';
import type {
  FieldBehavior,
  ProcessDefinition,
  ProcessTask,
  ViewPermissionSummary,
} from '../types';
import { normalizeFieldBehaviors } from '../utils/permissions';

export interface UseFieldPermissionOptions {
  viewPermissions?: ViewPermissionSummary;
  processDefinition?: ProcessDefinition;
  currentTask?: ProcessTask;
  isApprover?: boolean;
  mode: 'readonly' | 'edit';
}

export interface UseFieldPermissionReturn {
  fieldBehaviors: Record<string, FieldBehavior>;
  computeBehaviors: () => Record<string, FieldBehavior>;
}

const normalizeBehavior = (value?: string): FieldBehavior => {
  if (value === 'EDITABLE') return 'NORMAL';
  if (value === 'READ_ONLY') return 'READONLY';
  if (value === 'DISABLED') return 'DISABLED';
  if (value === 'HIDDEN') return 'HIDDEN';
  if (value === 'NORMAL' || value === 'READONLY') return value;
  return 'READONLY';
};

const normalizeFlowConfig = (config: any): Record<string, FieldBehavior> | null => {
  if (!config) return null;
  if (Array.isArray(config)) {
    const result: Record<string, FieldBehavior> = {};
    config.forEach((item) => {
      const fieldId = item?.fieldId || item?.field_id || item?.id;
      if (!fieldId) return;
      result[fieldId] = normalizeBehavior(item?.fieldBehavior || item?.behavior || item?.value);
    });
    return Object.keys(result).length > 0 ? result : null;
  }
  if (typeof config === 'object') {
    const result: Record<string, FieldBehavior> = {};
    Object.entries(config).forEach(([fieldId, value]) => {
      result[fieldId] = normalizeBehavior(
        typeof value === 'string'
          ? value
          : (value as any)?.fieldBehavior || (value as any)?.behavior,
      );
    });
    return result;
  }
  return null;
};

/**
 * 字段权限计算 hook
 * 根据不同场景（普通详情、流程审批等）计算字段行为映射
 */
export function useFieldPermission(options: UseFieldPermissionOptions): UseFieldPermissionReturn {
  const { viewPermissions, processDefinition, currentTask, isApprover, mode } = options;

  const computeBehaviors = useCallback((): Record<string, FieldBehavior> => {
    const behaviors: Record<string, FieldBehavior> = {};

    // 场景1：普通详情页，基于 viewPermissions + mode
    if (!currentTask && viewPermissions) {
      return normalizeFieldBehaviors(viewPermissions, mode);
    }

    // 场景2：流程-非审批人，全部 READONLY（除 HIDDEN 外）
    if (currentTask && !isApprover && viewPermissions) {
      return normalizeFieldBehaviors(viewPermissions, 'readonly');
    }

    // 场景3：流程-发起人修改（originator_return 节点）
    if (currentTask && isApprover && currentTask.nodeType === 'originator_return') {
      if (processDefinition?.flowConfig && processDefinition.startNodeId) {
        const startConfig = normalizeFlowConfig(
          processDefinition.flowConfig[processDefinition.startNodeId],
        );
        if (startConfig) {
          for (const [fieldId, behavior] of Object.entries(startConfig)) {
            behaviors[fieldId] = mode === 'edit' ? behavior : 'READONLY';
          }
          return behaviors;
        }
      }
      // 降级：如果无法获取 startNode 配置，全部可编辑
      if (viewPermissions) {
        for (const fieldId of Object.keys(viewPermissions.fieldPermissions)) {
          if (viewPermissions.fieldPermissions[fieldId] === 'FORM_FILED_HIDDEN') {
            behaviors[fieldId] = 'HIDDEN';
          } else {
            behaviors[fieldId] = mode === 'edit' ? 'NORMAL' : 'READONLY';
          }
        }
      }
      return behaviors;
    }

    // 场景4：流程-审批人，使用 currentTask.nodeId 对应的 fieldConfig
    if (currentTask && isApprover && processDefinition?.flowConfig) {
      const nodeConfig = normalizeFlowConfig(processDefinition.flowConfig[currentTask.nodeId]);
      if (nodeConfig) {
        for (const [fieldId, behavior] of Object.entries(nodeConfig)) {
          behaviors[fieldId] = mode === 'edit' ? behavior : 'READONLY';
        }
        return behaviors;
      }
    }

    // 兜底：基于 viewPermissions
    if (viewPermissions) {
      return normalizeFieldBehaviors(viewPermissions, mode);
    }

    return behaviors;
  }, [viewPermissions, processDefinition, currentTask, isApprover, mode]);

  const fieldBehaviors = useMemo(() => computeBehaviors(), [computeBehaviors]);

  return { fieldBehaviors, computeBehaviors };
}
