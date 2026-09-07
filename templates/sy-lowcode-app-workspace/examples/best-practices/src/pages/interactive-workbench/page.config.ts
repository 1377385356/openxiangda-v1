import { definePageConfig } from "@/types/app-workspace.types";

export default definePageConfig({
  code: "interactive_workbench",
  name: "交互工作台",
  description: "纯复杂交互页面示例",
  route: { pathKey: "interactive_workbench" },
  menu: { name: "交互工作台" },
});
