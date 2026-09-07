import type { ComponentType, SVGProps } from "react";
import { BriefcaseBusiness, Home, ShieldCheck } from "lucide-react";

export type StarterNavigationItem = {
  code?: string;
  hint?: string;
  icon: ComponentType<
    SVGProps<SVGSVGElement> & { size?: string | number; strokeWidth?: string | number }
  >;
  name: string;
  path: string;
  routeCode?: string;
};

export type StarterNavigationGroup = {
  icon: ComponentType<
    SVGProps<SVGSVGElement> & { size?: string | number; strokeWidth?: string | number }
  >;
  title: string;
  items: StarterNavigationItem[];
};

export type BuildStarterNavigationOptions = {
  appType: string;
};

export const viewPath = (appType: string, path: string) =>
  `/view/${appType}/${path}`.replace(/\/{2,}/g, "/");

export function buildStarterAdminNavigation({
  appType,
}: BuildStarterNavigationOptions): StarterNavigationGroup[] {
  return [
    {
      icon: BriefcaseBusiness,
      title: "应用工作台",
      items: [
        {
          code: "admin_dashboard",
          icon: Home,
          name: "工作台",
          path: viewPath(appType, "admin"),
          routeCode: "admin.dashboard",
        },
        {
          code: "admin_login_logs",
          icon: ShieldCheck,
          name: "登录日志",
          path: viewPath(appType, "admin/login-logs"),
          routeCode: "admin.login_logs",
        },
      ],
    },
  ];
}

export function filterNavigationByMenuCodes(
  groups: StarterNavigationGroup[],
  menuCodes: Set<string>,
) {
  if (!menuCodes.size) return groups;
  return groups
    .map(group => ({
      ...group,
      items: group.items.filter(
        item =>
          (!item.code && !item.routeCode) ||
          Boolean(item.code && menuCodes.has(item.code)) ||
          Boolean(item.routeCode && menuCodes.has(item.routeCode)),
      ),
    }))
    .filter(group => group.items.length > 0);
}
