import { definePageConfig } from "@/types/app-workspace.types";

export default definePageConfig({
  code: "mint_analytics_dashboard",
  name: "薄荷数据分析首页",
  description: "后台管理薄荷绿色数据分析首页模板",
  route: { pathKey: "mint_analytics_dashboard" },
  entry: {
    mode: "app-shell",
    hidePlatformNav: true,
    defaultRoute: "home",
  },
  menu: { name: "薄荷数据分析首页" },
});
