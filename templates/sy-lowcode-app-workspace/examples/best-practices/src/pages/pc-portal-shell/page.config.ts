import { definePageConfig } from "@/types/app-workspace.types";

export default definePageConfig({
  code: "pc_portal_shell",
  name: "PC 工作门户",
  description: "PC app-shell 入口示例",
  route: { pathKey: "pc_portal_shell" },
  entry: {
    mode: "app-shell",
    hidePlatformNav: true,
    defaultRoute: "home",
  },
  menu: { name: "PC 工作门户" },
});
