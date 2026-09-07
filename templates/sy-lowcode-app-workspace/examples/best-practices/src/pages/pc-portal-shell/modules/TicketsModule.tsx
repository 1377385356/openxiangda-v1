import { Card, Typography } from "antd";

import type { PcPortalRoute } from "../routes";

export function TicketsModule({ route }: { route: PcPortalRoute }) {
  return (
    <section className="bp-pc-shell__module">
      <Typography.Title level={3}>{route === "tickets" ? "工单" : "模块"}</Typography.Title>
      <Card>
        复制模板到真实项目后，在这里组合 `service-ticket-ops` 或角色治理模块。
      </Card>
    </section>
  );
}
