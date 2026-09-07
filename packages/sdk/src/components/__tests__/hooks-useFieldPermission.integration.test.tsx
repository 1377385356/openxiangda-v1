import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFieldPermission } from '../hooks/useFieldPermission';
import type { ViewPermissionSummary, ProcessDefinition, ProcessTask } from '../types';

describe('useFieldPermission', () => {
  const baseViewPermissions: ViewPermissionSummary = {
    fieldPermissions: {
      field1: 'FORM_FILED_EDIT',
      field2: 'FORM_FILED_VIEW',
      field3: 'FORM_FILED_HIDDEN',
    },
    operations: [],
  };

  describe('初始状态', () => {
    it('should return empty behaviors when no options provided', () => {
      const { result } = renderHook(() => useFieldPermission({ mode: 'edit' }));
      expect(result.current.fieldBehaviors).toEqual({});
      expect(typeof result.current.computeBehaviors).toBe('function');
    });
  });

  describe('场景1: 普通详情页 (no currentTask)', () => {
    it('should map permissions correctly in edit mode', () => {
      const { result } = renderHook(() =>
        useFieldPermission({
          viewPermissions: baseViewPermissions,
          mode: 'edit',
        }),
      );
      expect(result.current.fieldBehaviors).toEqual({
        field1: 'NORMAL',
        field2: 'READONLY',
        field3: 'HIDDEN',
      });
    });

    it('should map all non-hidden to READONLY in readonly mode', () => {
      const { result } = renderHook(() =>
        useFieldPermission({
          viewPermissions: baseViewPermissions,
          mode: 'readonly',
        }),
      );
      expect(result.current.fieldBehaviors).toEqual({
        field1: 'READONLY',
        field2: 'READONLY',
        field3: 'HIDDEN',
      });
    });
  });

  describe('场景2: 流程-非审批人', () => {
    const currentTask: ProcessTask = {
      taskId: 'task1',
      nodeId: 'node1',
      nodeType: 'approval',
      nodeName: '审批节点',
      status: 'pending',
      assignee: 'user1',
    };

    it('should set all visible fields to READONLY for non-approver', () => {
      const { result } = renderHook(() =>
        useFieldPermission({
          viewPermissions: baseViewPermissions,
          currentTask,
          isApprover: false,
          mode: 'edit',
        }),
      );
      expect(result.current.fieldBehaviors).toEqual({
        field1: 'READONLY',
        field2: 'READONLY',
        field3: 'HIDDEN',
      });
    });
  });

  describe('场景3: 流程-发起人修改 (originator_return)', () => {
    const returnTask: ProcessTask = {
      taskId: 'task1',
      nodeId: 'return_node',
      nodeType: 'originator_return',
      nodeName: '发起人修改',
      status: 'pending',
      assignee: 'user1',
    };

    it('should use startNode config when available in edit mode', () => {
      const processDefinition: ProcessDefinition = {
        processId: 'proc1',
        startNodeId: 'start1',
        flowConfig: {
          start1: { field1: 'NORMAL', field2: 'READONLY', field3: 'HIDDEN' },
        },
      };

      const { result } = renderHook(() =>
        useFieldPermission({
          viewPermissions: baseViewPermissions,
          processDefinition,
          currentTask: returnTask,
          isApprover: true,
          mode: 'edit',
        }),
      );
      expect(result.current.fieldBehaviors).toEqual({
        field1: 'NORMAL',
        field2: 'READONLY',
        field3: 'HIDDEN',
      });
    });

    it('should set all to READONLY when mode is readonly', () => {
      const processDefinition: ProcessDefinition = {
        processId: 'proc1',
        startNodeId: 'start1',
        flowConfig: {
          start1: { field1: 'NORMAL', field2: 'READONLY' },
        },
      };

      const { result } = renderHook(() =>
        useFieldPermission({
          viewPermissions: baseViewPermissions,
          processDefinition,
          currentTask: returnTask,
          isApprover: true,
          mode: 'readonly',
        }),
      );
      expect(result.current.fieldBehaviors).toEqual({
        field1: 'READONLY',
        field2: 'READONLY',
      });
    });

    it('should fallback to viewPermissions when no startNode config', () => {
      const processDefinition: ProcessDefinition = {
        processId: 'proc1',
        flowConfig: {},
      };

      const { result } = renderHook(() =>
        useFieldPermission({
          viewPermissions: baseViewPermissions,
          processDefinition,
          currentTask: returnTask,
          isApprover: true,
          mode: 'edit',
        }),
      );
      expect(result.current.fieldBehaviors).toEqual({
        field1: 'NORMAL',
        field2: 'NORMAL',
        field3: 'HIDDEN',
      });
    });

    it('should fallback when processDefinition has no flowConfig', () => {
      const processDefinition: ProcessDefinition = {
        processId: 'proc1',
      };

      const { result } = renderHook(() =>
        useFieldPermission({
          viewPermissions: baseViewPermissions,
          processDefinition,
          currentTask: returnTask,
          isApprover: true,
          mode: 'edit',
        }),
      );
      expect(result.current.fieldBehaviors).toEqual({
        field1: 'NORMAL',
        field2: 'NORMAL',
        field3: 'HIDDEN',
      });
    });
  });

  describe('场景4: 流程-审批人使用 nodeId 对应的 fieldConfig', () => {
    const approvalTask: ProcessTask = {
      taskId: 'task1',
      nodeId: 'approval_node',
      nodeType: 'approval',
      nodeName: '审批节点',
      status: 'pending',
      assignee: 'user1',
    };

    it('should use node-level config for approver in edit mode', () => {
      const processDefinition: ProcessDefinition = {
        processId: 'proc1',
        flowConfig: {
          approval_node: { field1: 'NORMAL', field2: 'HIDDEN' },
        },
      };

      const { result } = renderHook(() =>
        useFieldPermission({
          viewPermissions: baseViewPermissions,
          processDefinition,
          currentTask: approvalTask,
          isApprover: true,
          mode: 'edit',
        }),
      );
      expect(result.current.fieldBehaviors).toEqual({
        field1: 'NORMAL',
        field2: 'HIDDEN',
      });
    });

    it('should set all to READONLY when mode is readonly', () => {
      const processDefinition: ProcessDefinition = {
        processId: 'proc1',
        flowConfig: {
          approval_node: { field1: 'NORMAL', field2: 'HIDDEN' },
        },
      };

      const { result } = renderHook(() =>
        useFieldPermission({
          viewPermissions: baseViewPermissions,
          processDefinition,
          currentTask: approvalTask,
          isApprover: true,
          mode: 'readonly',
        }),
      );
      expect(result.current.fieldBehaviors).toEqual({
        field1: 'READONLY',
        field2: 'READONLY',
      });
    });
  });

  describe('兜底逻辑', () => {
    it('should fallback to viewPermissions when approver but no matching nodeConfig', () => {
      const approvalTask: ProcessTask = {
        taskId: 'task1',
        nodeId: 'unknown_node',
        nodeType: 'approval',
        nodeName: '审批节点',
        status: 'pending',
        assignee: 'user1',
      };
      const processDefinition: ProcessDefinition = {
        processId: 'proc1',
        flowConfig: {
          other_node: { field1: 'NORMAL' },
        },
      };

      const { result } = renderHook(() =>
        useFieldPermission({
          viewPermissions: baseViewPermissions,
          processDefinition,
          currentTask: approvalTask,
          isApprover: true,
          mode: 'edit',
        }),
      );
      expect(result.current.fieldBehaviors).toEqual({
        field1: 'NORMAL',
        field2: 'READONLY',
        field3: 'HIDDEN',
      });
    });
  });

  describe('computeBehaviors 稳定性', () => {
    it('should return same reference when inputs do not change', () => {
      const { result, rerender } = renderHook(() =>
        useFieldPermission({
          viewPermissions: baseViewPermissions,
          mode: 'edit',
        }),
      );
      const first = result.current.fieldBehaviors;
      rerender();
      expect(result.current.fieldBehaviors).toBe(first);
    });
  });
});
