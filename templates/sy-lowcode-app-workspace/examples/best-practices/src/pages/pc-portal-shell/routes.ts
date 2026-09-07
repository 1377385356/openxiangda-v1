export type PcPortalRoute = "home" | "tickets" | "roles" | "settings";

export const defaultPcPortalRoute: PcPortalRoute = "home";

export const pcPortalRoutes: Array<{
  key: PcPortalRoute;
  label: string;
}> = [
  { key: "home", label: "工作台" },
  { key: "tickets", label: "工单" },
  { key: "roles", label: "角色治理" },
  { key: "settings", label: "设置" },
];

export function parsePcPortalRoute(value?: string): PcPortalRoute {
  return pcPortalRoutes.some((item) => item.key === value)
    ? (value as PcPortalRoute)
    : defaultPcPortalRoute;
}
