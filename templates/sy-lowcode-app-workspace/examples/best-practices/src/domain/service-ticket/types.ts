export type TicketStatus =
  | "new"
  | "accepted"
  | "processing"
  | "paused"
  | "resolved"
  | "closed"
  | "cancelled";

export type TicketAction =
  | "accept"
  | "start"
  | "pause"
  | "resume"
  | "resolve"
  | "close"
  | "cancel";

export type TicketPriority = "urgent" | "high" | "normal" | "low";

export interface TicketRecord {
  formInstanceId: string;
  title: string;
  status: TicketStatus;
  priority?: TicketPriority;
  ownerUserScopeKey?: string;
  ownerDeptScopeKey?: string;
  collegeScopeKey?: string;
  classScopeKey?: string;
  college?: { label: string; value: string };
  classGroup?: { label: string; value: string };
  requester?: { label: string; value: string };
  currentOwner?: { label: string; value: string };
  description?: string;
  lastActionAt?: string;
}

export interface TicketActionLog {
  ticketId: string;
  action: TicketAction;
  fromStatus?: TicketStatus;
  toStatus: TicketStatus;
  operatorId: string;
  operatorName?: string;
  comment?: string;
  operatedAt: string;
}

export interface TicketOperator {
  userId: string;
  userName?: string;
  roleCodes: string[];
  collegeScopeKeys?: string[];
  classScopeKeys?: string[];
  departmentIds?: string[];
}

export interface TicketSearchState {
  keyword?: string;
  statuses?: TicketStatus[];
  priorities?: TicketPriority[];
  ownerUserScopeKey?: string;
  ownerDeptScopeKey?: string;
  collegeScopeKey?: string;
  classScopeKey?: string;
}
