import { definePageConfig } from "@/types/app-workspace.types";

export default definePageConfig({
  code: "service_ticket_ops",
  name: "工单运营台",
  description: "状态流转型业务的数据管理页示例",
  route: { pathKey: "service_ticket_ops" },
  menu: { name: "工单运营台" },
});
