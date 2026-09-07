import { definePageConfig } from "@/types/app-workspace.types";

export default definePageConfig({
  code: "ops_monitor_dashboard",
  name: "蓝紫运营监控中心",
  description: "后台管理蓝紫运营监控中心模板",
  route: { pathKey: "ops_monitor_dashboard" },
  entry: {
    mode: "app-shell",
    hidePlatformNav: true,
    defaultRoute: "monitor",
  },
  menu: { name: "蓝紫运营监控中心" },
});
