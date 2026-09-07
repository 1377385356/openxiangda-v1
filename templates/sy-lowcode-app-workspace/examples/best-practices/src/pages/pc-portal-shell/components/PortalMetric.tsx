import { Card, Typography } from "antd";

export function PortalMetric(props: { label: string; value: string; trend: string }) {
  return (
    <Card className="bp-portal-metric">
      <Typography.Text type="secondary">{props.label}</Typography.Text>
      <div className="bp-portal-metric__value">{props.value}</div>
      <Typography.Text type="secondary">{props.trend}</Typography.Text>
    </Card>
  );
}
