import { definePageConfig } from "@/types/app-workspace.types";

export default definePageConfig({
  code: "glass_home_dashboard",
  name: "浅蓝玻璃经营首页",
  description: "后台管理浅蓝玻璃拟态首页模板",
  route: { pathKey: "glass_home_dashboard" },
  entry: {
    mode: "app-shell",
    hidePlatformNav: true,
    defaultRoute: "home",
  },
  menu: { name: "浅蓝玻璃经营首页" },
});
