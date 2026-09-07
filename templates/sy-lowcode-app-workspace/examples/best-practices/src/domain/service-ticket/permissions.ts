import type { TicketOperator, TicketRecord } from "./types";
import { getAvailableTicketActions } from "./state-machine";

export function canViewTicket(ticket: TicketRecord, operator: TicketOperator) {
  if (operator.roleCodes.includes("app_admin")) return true;
  if (ticket.ownerUserScopeKey === operator.userId) return true;
  if (ticket.collegeScopeKey && operator.collegeScopeKeys?.includes(ticket.collegeScopeKey)) {
    return true;
  }
  if (ticket.classScopeKey && operator.classScopeKeys?.includes(ticket.classScopeKey)) return true;
  if (
    ticket.ownerDeptScopeKey &&
    operator.departmentIds?.includes(ticket.ownerDeptScopeKey)
  ) {
    return true;
  }
  return false;
}

export function getTicketUiPermissions(ticket: TicketRecord, operator: TicketOperator) {
  return {
    canView: canViewTicket(ticket, operator),
    actions: getAvailableTicketActions(ticket, operator),
  };
}
