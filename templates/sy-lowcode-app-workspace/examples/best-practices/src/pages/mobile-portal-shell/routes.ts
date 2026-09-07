export type MobilePortalRoute = "home" | "tickets" | "mine";

export const mobilePortalRoutes: Array<{ key: MobilePortalRoute; label: string }> = [
  { key: "home", label: "首页" },
  { key: "tickets", label: "工单" },
  { key: "mine", label: "我的" },
];

export function parseMobilePortalRoute(value?: string): MobilePortalRoute {
  return mobilePortalRoutes.some((item) => item.key === value)
    ? (value as MobilePortalRoute)
    : "home";
}
