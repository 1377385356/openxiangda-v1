import { Descriptions, Drawer, Typography } from "antd";
import type { ReactNode } from "react";

import { StatusTag } from "@/shared/components/StatusTag";
import type { TicketRecord } from "@/domain/service-ticket";

export function TicketDetailDrawer(props: {
  ticket: TicketRecord | null;
  extra?: ReactNode;
  onClose: () => void;
}) {
  return (
    <Drawer
      title="工单详情"
      open={Boolean(props.ticket)}
      width={520}
      onClose={props.onClose}
    >
      {props.ticket ? (
        <div className="bp-ticket-detail">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="标题">{props.ticket.title}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <StatusTag status={props.ticket.status} />
            </Descriptions.Item>
            <Descriptions.Item label="负责人">
              {props.ticket.currentOwner?.label || "-"}
            </Descriptions.Item>
            <Descriptions.Item label="所属学院">
              {props.ticket.college?.label || "-"}
            </Descriptions.Item>
            <Descriptions.Item label="所属班级">
              {props.ticket.classGroup?.label || "-"}
            </Descriptions.Item>
          </Descriptions>
          <Typography.Paragraph className="bp-ticket-detail__description">
            {props.ticket.description || "暂无描述"}
          </Typography.Paragraph>
          {props.extra}
        </div>
      ) : null}
    </Drawer>
  );
}
