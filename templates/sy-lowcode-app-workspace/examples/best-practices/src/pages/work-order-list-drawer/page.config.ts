import { definePageConfig } from "@/types/app-workspace.types";

export default definePageConfig({
  code: "work_order_list_drawer",
  name: "工单列表抽屉模板",
  description: "后台管理 CRUD 列表页与右侧覆盖式抽屉模板",
  route: { pathKey: "work_order_list_drawer" },
  entry: {
    mode: "app-shell",
    hidePlatformNav: true,
    defaultRoute: "ticket-list",
  },
  menu: { name: "工单列表抽屉模板" },
});
