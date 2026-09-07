import type { DataManagementRowAction } from "openxiangda";

import {
  getAvailableTicketActions,
  ticketActionLabels,
  type TicketAction,
  type TicketOperator,
  type TicketRecord,
} from "@/domain/service-ticket";

const normalizeTicket = (record: any): TicketRecord => ({
  formInstanceId:
    record.formInstanceId || record.formInstId || record.id || record.formData?.formInstanceId,
  title: record.title || record.formData?.title || "未命名工单",
  status: record.status || record.formData?.status?.value || record.formData?.status || "new",
  priority: record.priority?.value || record.formData?.priority?.value,
  ownerUserScopeKey: record.ownerUserScopeKey || record.formData?.ownerUserScopeKey,
  ownerDeptScopeKey: record.ownerDeptScopeKey || record.formData?.ownerDeptScopeKey,
  collegeScopeKey: record.collegeScopeKey || record.formData?.collegeScopeKey,
  classScopeKey: record.classScopeKey || record.formData?.classScopeKey,
  college: record.college || record.formData?.college,
  classGroup: record.classGroup || record.formData?.classGroup,
  requester: record.requester || record.formData?.requester,
  currentOwner: record.currentOwner || record.formData?.currentOwner,
  description: record.description || record.formData?.description,
  lastActionAt: record.lastActionAt || record.formData?.lastActionAt,
});

export function buildTicketRowActions(options: {
  operator: TicketOperator;
  submittingAction: TicketAction | null;
  onAction: (ticket: TicketRecord, action: TicketAction) => Promise<void>;
  onDetail: (ticket: TicketRecord) => void;
}): DataManagementRowAction[] {
  return [
    {
      key: "detail",
      label: "详情",
      onClick: (record) => options.onDetail(normalizeTicket(record)),
    },
    ...(["accept", "start", "pause", "resume", "resolve", "close", "cancel"] as TicketAction[]).map(
      (action) => ({
        key: action,
        label:
          options.submittingAction === action
            ? `${ticketActionLabels[action]}中`
            : ticketActionLabels[action],
        danger: action === "cancel",
        onClick: (record: any) => {
          const ticket = normalizeTicket(record);
          if (!getAvailableTicketActions(ticket, options.operator).includes(action)) return;
          void options.onAction(ticket, action);
        },
      }),
    ),
  ];
}
