import { definePageConfig } from "@/types/app-workspace.types";

export default definePageConfig({
  code: "mobile_portal_shell",
  name: "移动工作门户",
  description: "Mobile app-shell 入口示例",
  route: { pathKey: "mobile_portal_shell" },
  entry: {
    mode: "app-shell",
    hidePlatformNav: true,
    defaultRoute: "home",
  },
  menu: { name: "移动工作门户" },
});
