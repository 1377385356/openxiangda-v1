import type { ProcessStatus, StatusMeta, TaskStatus } from '../types';

/** 流程状态元映射 */
export const PROCESS_STATUS_META: Record<ProcessStatus, StatusMeta> = {
  running: { label: '审批中', tone: 'brand' },
  waiting: { label: '等待中', tone: 'neutral' },
  exception: { label: '流程异常', tone: 'danger' },
  completed: { label: '已完成', tone: 'success' },
  terminated: { label: '已拒绝', tone: 'danger' },
  withdrawn: { label: '已撤销', tone: 'neutral' },
  pending: { label: '待处理', tone: 'brand' },
  cancelled: { label: '已取消', tone: 'neutral' },
};

/** 任务状态元映射 */
export const TASK_STATUS_META: Record<TaskStatus, StatusMeta> = {
  pending: { label: '待处理', tone: 'brand' },
  approved: { label: '已同意', tone: 'success' },
  rejected: { label: '已拒绝', tone: 'danger' },
  returned: { label: '已退回', tone: 'warning' },
  suspended: { label: '已挂起', tone: 'neutral' },
  cancelled: { label: '已取消', tone: 'neutral' },
  copied: { label: '已抄送', tone: 'neutral' },
  waiting: { label: '等待中', tone: 'neutral' },
  simulated: { label: '未开始', tone: 'neutral' },
};
