import { Layout, Menu, Typography } from "antd";
import { useNavigation, usePageRoute } from "openxiangda/runtime";

import { pcPortalRoutes, parsePcPortalRoute } from "./routes";
import { HomeModule } from "./modules/HomeModule";
import { TicketsModule } from "./modules/TicketsModule";

const { Content, Sider } = Layout;

export function PcPortalShell() {
  const route = parsePcPortalRoute(usePageRoute().query.route as string);
  const navigation = useNavigation();

  return (
    <Layout className="bp-pc-shell">
      <Sider width={220} className="bp-pc-shell__sider">
        <Typography.Title level={4} className="bp-pc-shell__brand">
          运营门户
        </Typography.Title>
        <Menu
          mode="inline"
          selectedKeys={[route]}
          items={pcPortalRoutes.map((item) => ({
            key: item.key,
            label: item.label,
          }))}
          onClick={(item) => navigation.replaceRoute(String(item.key))}
        />
      </Sider>
      <Content className="bp-pc-shell__content">
        {route === "home" ? <HomeModule /> : <TicketsModule route={route} />}
      </Content>
    </Layout>
  );
}
