import { Timeline, Typography } from "antd";

export function TicketActionTimeline({ ticketId }: { ticketId: string }) {
  if (!ticketId) return null;
  return (
    <section className="bp-ticket-timeline">
      <Typography.Title level={5}>操作日志</Typography.Title>
      <Timeline
        items={[
          {
            color: "blue",
            children: "复制本模板后，在 service 层调用 queryTicketActionLogs 加载真实日志。",
          },
          {
            color: "gray",
            children: `当前工单实例: ${ticketId}`,
          },
        ]}
      />
    </section>
  );
}
