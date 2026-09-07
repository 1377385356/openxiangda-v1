import { Card, Col, Row, Typography } from "antd";

import { PortalMetric } from "../components/PortalMetric";

export function HomeModule() {
  return (
    <section className="bp-pc-shell__module">
      <Typography.Title level={3}>工作台</Typography.Title>
      <Row gutter={[16, 16]}>
        <Col span={8}>
          <PortalMetric label="待处理工单" value="18" trend="较昨日 +3" />
        </Col>
        <Col span={8}>
          <PortalMetric label="本周完成" value="64" trend="完成率 92%" />
        </Col>
        <Col span={8}>
          <PortalMetric label="超时风险" value="5" trend="需要关注" />
        </Col>
      </Row>
      <Card className="bp-pc-shell__card" title="设计说明">
        PC 门户只做路由和模块组合，业务查询、权限判断、状态流转复用 domain 和 service。
      </Card>
    </section>
  );
}
