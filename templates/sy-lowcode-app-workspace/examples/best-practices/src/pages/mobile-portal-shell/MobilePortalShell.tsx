import { Card, NavBar, SafeArea, TabBar } from "antd-mobile";
import { useNavigation, usePageRoute } from "openxiangda/runtime";

import { mobilePortalRoutes, parseMobilePortalRoute } from "./routes";
import { MobileHome } from "./modules/MobileHome";

export function MobilePortalShell() {
  const route = parseMobilePortalRoute(usePageRoute().query.route as string);
  const navigation = useNavigation();

  return (
    <main className="bp-mobile-shell">
      <NavBar back={null}>移动工作门户</NavBar>
      <section className="bp-mobile-shell__content">
        {route === "home" ? (
          <MobileHome />
        ) : (
          <Card title={route === "tickets" ? "工单" : "我的"}>
            移动端仅保留高频任务，业务规则复用 PC 的 domain/service。
          </Card>
        )}
      </section>
      <TabBar activeKey={route} onChange={(key) => navigation.replaceRoute(key)}>
        {mobilePortalRoutes.map((item) => (
          <TabBar.Item key={item.key} title={item.label} />
        ))}
      </TabBar>
      <SafeArea position="bottom" />
    </main>
  );
}
