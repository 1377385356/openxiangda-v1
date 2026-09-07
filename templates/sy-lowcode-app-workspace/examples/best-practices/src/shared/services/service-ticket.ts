import type { PageSdk } from "openxiangda/runtime";

import {
  assertTicketTransition,
  buildTicketFilterGroup,
  type TicketAction,
  type TicketActionLog,
  type TicketOperator,
  type TicketRecord,
  type TicketSearchState,
} from "@/domain/service-ticket";

export const SERVICE_TICKET_FORM_UUID = "FORM_SERVICE_TICKET";
export const TICKET_ACTION_LOG_FORM_UUID = "FORM_TICKET_ACTION_LOG";

export interface TicketQueryInput {
  currentPage: number;
  pageSize: number;
  search: TicketSearchState;
}

export interface TicketQueryResult {
  records: TicketRecord[];
  total: number;
}

export async function queryTickets(
  sdk: PageSdk,
  input: TicketQueryInput,
): Promise<TicketQueryResult> {
  const response = await sdk.form.advancedSearch<TicketRecord>({
    formUuid: SERVICE_TICKET_FORM_UUID,
    currentPage: input.currentPage,
    pageSize: input.pageSize,
    filters: buildTicketFilterGroup(input.search) as never,
    order: [{ id: "modifiedTime", isAsc: "n" }],
  });

  return {
    records: response.result?.data || [],
    total: response.result?.totalCount || 0,
  };
}

export async function transitionTicket(
  sdk: PageSdk,
  ticket: TicketRecord,
  action: TicketAction,
  operator: TicketOperator,
  comment?: string,
) {
  const nextStatus = assertTicketTransition(ticket, action, operator);
  const operatedAt = new Date().toISOString();

  await sdk.form.update({
    formUuid: SERVICE_TICKET_FORM_UUID,
    formInstanceId: ticket.formInstanceId,
    data: {
      status: nextStatus,
      lastActionAt: operatedAt,
      ownerUserScopeKey: ticket.ownerUserScopeKey,
      ownerDeptScopeKey: ticket.ownerDeptScopeKey,
      collegeScopeKey: ticket.collegeScopeKey,
      classScopeKey: ticket.classScopeKey,
    },
  } as never);

  const log: TicketActionLog = {
    ticketId: ticket.formInstanceId,
    action,
    fromStatus: ticket.status,
    toStatus: nextStatus,
    operatorId: operator.userId,
    operatorName: operator.userName,
    comment,
    operatedAt,
  };

  await sdk.form.create({
    formUuid: TICKET_ACTION_LOG_FORM_UUID,
    data: log,
  } as never);

  return { nextStatus, operatedAt };
}

export async function queryTicketActionLogs(
  sdk: PageSdk,
  ticketId: string,
): Promise<TicketActionLog[]> {
  const response = await sdk.form.advancedSearch<TicketActionLog>({
    formUuid: TICKET_ACTION_LOG_FORM_UUID,
    currentPage: 1,
    pageSize: 50,
    filters: {
      id: "ticket_log_filters",
      logic: "AND",
      rules: [
        {
          id: "ticketId_EQ",
          key: "ticketId",
          componentName: "TextField",
          operator: "EQ",
          value: ticketId,
        },
      ],
      conditions: [],
    } as never,
    order: [{ id: "createdAt", isAsc: "n" }],
  });

  return response.result?.data || [];
}
