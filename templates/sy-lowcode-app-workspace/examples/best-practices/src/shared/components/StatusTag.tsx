import { Tag } from "antd";

import {
  ticketStatusLabels,
  type TicketStatus,
} from "@/domain/service-ticket";

const statusColor: Record<TicketStatus, string> = {
  new: "default",
  accepted: "processing",
  processing: "blue",
  paused: "warning",
  resolved: "success",
  closed: "default",
  cancelled: "error",
};

export function StatusTag({ status }: { status: TicketStatus }) {
  return <Tag color={statusColor[status]}>{ticketStatusLabels[status]}</Tag>;
}
