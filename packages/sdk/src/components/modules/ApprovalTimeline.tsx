import React, { useMemo } from 'react';
import {
  ApiOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  CloseCircleFilled,
  CodeOutlined,
  CopyOutlined,
  EditOutlined,
  FileTextOutlined,
  LoadingOutlined,
  NotificationOutlined,
  ReloadOutlined,
  RollbackOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { ProcessTask, StatusMeta } from '../types';
import { TASK_STATUS_META } from '../core/constants';

export interface ApprovalTimelineProps {
  tasks: ProcessTask[];
  className?: string;
  renderNode?: (task: ProcessTask, index: number) => React.ReactNode;
  showRemarks?: boolean;
  compactMode?: boolean;
  showApproverInfo?: boolean;
}

type VisualState =
  | 'completed'
  | 'current'
  | 'waiting'
  | 'future'
  | 'rejected'
  | 'returned'
  | 'neutral';

const systemNodeTypes = new Set([
  'condition',
  'condition_branch',
  'js_code',
  'data_retrieve_single',
  'data_retrieve_batch',
  'data_create',
  'data_update',
  'connector_call',
  'loop_container',
  'work_notification',
  'dingtalk_card',
  'system',
]);

const systemLabels: Record<string, string> = {
  condition: '条件判断',
  condition_branch: '条件分支',
  js_code: 'JS 代码',
  data_retrieve_single: '数据读取',
  data_retrieve_batch: '批量读取',
  data_create: '数据创建',
  data_update: '数据更新',
  connector_call: '连接器调用',
  loop_container: '循环节点',
  work_notification: '工作通知',
  dingtalk_card: '钉钉卡片',
  system: '系统动作',
};

const toneClasses: Record<StatusMeta['tone'] | 'return' | 'future', string> = {
  brand: 'bg-blue-600 text-white border-blue-600',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  neutral: 'bg-gray-50 text-gray-600 border-gray-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  return: 'bg-amber-50 text-amber-700 border-amber-200',
  future: 'bg-gray-50 text-gray-400 border-gray-200',
};

function groupTasks(tasks: ProcessTask[]) {
  const groups = new Map<string, ProcessTask[]>();
  tasks.forEach((task, index) => {
    const key = task.nodeVisitId || `${task.nodeId || 'node'}-${task.id || task.taskId || index}`;
    const group = groups.get(key) || [];
    group.push(task);
    groups.set(key, group);
  });
  return Array.from(groups.values()).map((group) => {
    const hasOrSignResult = group.some(
      (task) =>
        task.nodeType === 'approval' &&
        task.multiApproveMode === 'or' &&
        !task.isSimulated &&
        ['approved', 'rejected', 'returned'].includes(task.status),
    );
    if (!hasOrSignResult) return group;
    const outcome = group.filter(
      (task) => !task.isSimulated && ['approved', 'rejected', 'returned'].includes(task.status),
    );
    return outcome.length > 0 ? outcome : group;
  });
}

function isCompactNode(task: ProcessTask) {
  return (
    task.nodeType === 'start' ||
    task.nodeType === 'copy' ||
    task.nodeType === 'end' ||
    systemNodeTypes.has(task.nodeType)
  );
}

function getNodeTitle(task: ProcessTask) {
  if (task.nodeType === 'start') return task.title || task.nodeName || '流程提交';
  if (task.nodeType === 'originator_return') return task.title || task.nodeName || '发起人修改';
  if (task.nodeType === 'copy') return task.title || task.nodeName || '抄送通知';
  if (task.nodeType === 'callback_wait') return task.title || task.nodeName || '等待第三方回调';
  if (task.nodeType === 'end') return task.title || task.nodeName || '流程完成';
  if (systemNodeTypes.has(task.nodeType))
    return task.title || task.nodeName || systemLabels[task.nodeType] || '系统动作';
  return task.title || task.nodeName || '审批';
}

function getVisualState(task: ProcessTask, isFutureGroup: boolean): VisualState {
  if (isFutureGroup || task.isSimulated || task.status === 'simulated') return 'future';
  if (task.status === 'rejected') return 'rejected';
  if (task.status === 'returned') return 'returned';
  if (task.status === 'pending' || task.status === 'waiting' || task.canApprove)
    return task.canApprove ? 'current' : 'waiting';
  if (
    task.status === 'approved' ||
    task.status === 'copied' ||
    task.nodeType === 'start' ||
    task.nodeType === 'end'
  ) {
    return 'completed';
  }
  return 'neutral';
}

function getStatusMeta(task: ProcessTask, state: VisualState, compact: boolean): StatusMeta {
  if (state === 'future') return { label: '未开始', tone: 'neutral' };
  if (state === 'current')
    return { label: task.nodeType === 'callback_wait' ? '等待回调' : '审批中', tone: 'brand' };
  if (state === 'waiting') return { label: '等待处理中', tone: 'neutral' };
  if (state === 'rejected') return TASK_STATUS_META.rejected;
  if (state === 'returned') return TASK_STATUS_META.returned;
  if (task.nodeType === 'copy' || task.status === 'copied') return TASK_STATUS_META.copied;
  if (compact) return { label: '已完成', tone: 'neutral' };
  return TASK_STATUS_META[task.status] || TASK_STATUS_META.approved;
}

function getIcon(task: ProcessTask, state: VisualState) {
  if (state === 'current')
    return task.nodeType === 'callback_wait' ? <ClockCircleOutlined /> : <LoadingOutlined />;
  if (state === 'future' || state === 'waiting')
    return task.nodeType === 'approval' ? <UserOutlined /> : <ClockCircleOutlined />;
  if (state === 'rejected') return <CloseCircleFilled />;
  if (state === 'returned') return <RollbackOutlined />;
  switch (task.nodeType as string) {
    case 'start':
      return <FileTextOutlined />;
    case 'approval':
      return <CheckCircleFilled />;
    case 'originator_return':
      return <EditOutlined />;
    case 'copy':
      return <CopyOutlined />;
    case 'callback_wait':
      return <ClockCircleOutlined />;
    case 'js_code':
      return <CodeOutlined />;
    case 'connector_call':
      return <ApiOutlined />;
    case 'work_notification':
    case 'dingtalk_card':
      return <NotificationOutlined />;
    case 'data_retrieve_single':
    case 'data_retrieve_batch':
    case 'data_create':
    case 'data_update':
    case 'loop_container':
      return <ReloadOutlined />;
    default:
      return <CheckCircleFilled />;
  }
}

function getDotClass(state: VisualState) {
  const map: Record<VisualState, string> = {
    completed: 'border-emerald-500 text-emerald-600 bg-white',
    current: 'border-blue-600 bg-blue-600 text-white',
    waiting: 'border-gray-200 text-gray-300 bg-white',
    future: 'border-dashed border-gray-300 text-gray-300 bg-white',
    rejected: 'border-red-500 text-red-600 bg-white',
    returned: 'border-amber-500 text-amber-600 bg-white',
    neutral: 'border-gray-200 text-gray-400 bg-white',
  };
  return map[state];
}

export const ApprovalTimeline: React.FC<ApprovalTimelineProps> = ({
  tasks,
  className = '',
  renderNode,
  showRemarks = true,
  compactMode = false,
  showApproverInfo = true,
}) => {
  const taskList = useMemo(() => (Array.isArray(tasks) ? tasks : []), [tasks]);
  const groups = useMemo(() => groupTasks(taskList), [taskList]);

  if (taskList.length === 0) {
    return (
      <div
        className={`rounded-lg border border-ant-border-secondary bg-ant-bg-container p-6 ${className}`}
      >
        <p className="m-0 text-center text-sm text-ant-text-tertiary">暂无审批记录</p>
      </div>
    );
  }

  if (renderNode) {
    return (
      <div className={className}>
        {taskList.map((task, index) => (
          <div key={task.taskId || task.id || index}>{renderNode(task, index)}</div>
        ))}
      </div>
    );
  }

  return (
    <div className={`approval-timeline ${className}`}>
      {groups.map((group, index) => {
        const node = group[0];
        const isLast = index === groups.length - 1;
        const isFutureGroup = group.some((task) => task.isSimulated || task.status === 'simulated');
        const compact = compactMode || isCompactNode(node);
        const state = getVisualState(node, isFutureGroup);
        const statusMeta = getStatusMeta(node, state, compact);
        const title = getNodeTitle(node);
        const time = node.actionAt || node.createdAt;

        return (
          <div
            key={node.nodeVisitId || `${node.nodeId}-${node.taskId}-${index}`}
            className={`relative flex gap-4 pb-5 ${isLast ? 'pb-0' : ''}`}
          >
            {!isLast && (
              <div
                className={`absolute bottom-0 left-[21px] top-11 w-px ${
                  state === 'future'
                    ? 'border-l border-dashed border-gray-300'
                    : 'bg-ant-border-secondary'
                }`}
              />
            )}
            <div
              className={`relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 shadow-[0_0_0_4px_var(--ant-color-bg-layout,#f5f5f5)] ${getDotClass(state)}`}
            >
              {getIcon(node, state)}
            </div>
            <div className="min-w-0 flex-1">
              <div
                className={`rounded-lg border p-4 ${
                  state === 'current'
                    ? 'border-blue-300 bg-blue-50/60'
                    : state === 'future'
                      ? 'border-dashed border-gray-200 bg-gray-50/70'
                      : 'border-ant-border-secondary bg-ant-bg-container'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-medium text-ant-text">{title}</span>
                    <span
                      className={`inline-flex min-h-6 items-center rounded-md border px-2 text-xs font-medium ${
                        state === 'future' ? toneClasses.future : toneClasses[statusMeta.tone]
                      }`}
                    >
                      {statusMeta.label}
                    </span>
                    {node.nodeType === 'originator_return' && (
                      <span className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">
                        发起人操作
                      </span>
                    )}
                  </div>
                  {!isFutureGroup && time && (
                    <span className="text-xs text-ant-text-tertiary">{time}</span>
                  )}
                </div>

                {showApproverInfo && !compact && group.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    <span className="w-full text-xs font-medium text-ant-text-tertiary">
                      {state === 'current' || state === 'waiting' ? '当前审批人' : '处理人'}
                    </span>
                    {group.map((assignee) => (
                      <span
                        key={assignee.taskId || assignee.id}
                        className="inline-flex min-w-0 items-center gap-2"
                      >
                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
                          {assignee.assigneeName?.slice(0, 1) || '?'}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-ant-text">
                            {assignee.assigneeName || '系统'}
                          </span>
                          <span className="block text-xs text-ant-text-tertiary">
                            {assignee.departmentName ||
                              assignee.actionAt ||
                              assignee.createdAt ||
                              ''}
                          </span>
                        </span>
                      </span>
                    ))}
                  </div>
                )}

                {showApproverInfo && compact && (
                  <div className="mt-2 text-sm text-ant-text-secondary">
                    {group
                      .map((item) => item.assigneeName)
                      .filter(Boolean)
                      .join('、') ||
                      (node.nodeType === 'start'
                        ? '提交申请'
                        : systemNodeTypes.has(node.nodeType)
                          ? node.comments || '系统自动处理'
                          : '')}
                  </div>
                )}

                {showRemarks && node.comments && (
                  <div
                    className={`mt-3 border-l-2 pl-3 text-sm leading-6 ${
                      state === 'rejected'
                        ? 'border-red-300 text-red-700'
                        : state === 'returned'
                          ? 'border-amber-300 text-amber-700'
                          : 'border-ant-border-secondary text-ant-text-secondary'
                    }`}
                  >
                    {node.comments}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
