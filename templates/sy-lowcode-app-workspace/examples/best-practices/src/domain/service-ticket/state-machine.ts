import type { TicketAction, TicketOperator, TicketRecord, TicketStatus } from "./types";

export const ticketStatusLabels: Record<TicketStatus, string> = {
  new: "新建",
  accepted: "已受理",
  processing: "处理中",
  paused: "挂起",
  resolved: "已解决",
  closed: "已关闭",
  cancelled: "已取消",
};

export const ticketActionLabels: Record<TicketAction, string> = {
  accept: "受理",
  start: "开始处理",
  pause: "挂起",
  resume: "恢复",
  resolve: "解决",
  close: "关闭",
  cancel: "取消",
};

const transitionTable: Record<TicketStatus, Partial<Record<TicketAction, TicketStatus>>> = {
  new: { accept: "accepted", cancel: "cancelled" },
  accepted: { start: "processing", cancel: "cancelled" },
  processing: { pause: "paused", resolve: "resolved" },
  paused: { resume: "processing", cancel: "cancelled" },
  resolved: { close: "closed" },
  closed: {},
  cancelled: {},
};

export function getNextTicketStatus(
  status: TicketStatus,
  action: TicketAction,
): TicketStatus | null {
  return transitionTable[status]?.[action] || null;
}

export function canOperateTicket(ticket: TicketRecord, operator: TicketOperator) {
  if (operator.roleCodes.includes("app_admin")) return true;
  if (ticket.ownerUserScopeKey && ticket.ownerUserScopeKey === operator.userId) return true;
  if (
    ticket.ownerDeptScopeKey &&
    operator.departmentIds?.includes(ticket.ownerDeptScopeKey)
  ) {
    return true;
  }
  return false;
}

export function getAvailableTicketActions(
  ticket: TicketRecord,
  operator: TicketOperator,
): TicketAction[] {
  if (!canOperateTicket(ticket, operator)) return [];
  return Object.keys(transitionTable[ticket.status] || {}) as TicketAction[];
}

export function assertTicketTransition(
  ticket: TicketRecord,
  action: TicketAction,
  operator: TicketOperator,
) {
  if (!canOperateTicket(ticket, operator)) {
    throw new Error("当前用户无权操作该工单");
  }
  const nextStatus = getNextTicketStatus(ticket.status, action);
  if (!nextStatus) {
    throw new Error(`状态 ${ticket.status} 不允许执行动作 ${action}`);
  }
  return nextStatus;
}
