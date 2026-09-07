import type { PageSdk } from "openxiangda/runtime";

import { buildRoleCode, type AppRoleRecord } from "@/domain/role-governance";

export const APP_ROLE_FORM_UUID = "FORM_APP_ROLE";

export async function queryEnabledBusinessRoles(sdk: PageSdk) {
  const response = await sdk.form.advancedSearch<AppRoleRecord>({
    formUuid: APP_ROLE_FORM_UUID,
    currentPage: 1,
    pageSize: 100,
    filters: {
      id: "enabled_roles",
      logic: "AND",
      rules: [
        {
          id: "enabled_EQ",
          key: "enabled",
          componentName: "RadioField",
          operator: "EQ",
          value: "enabled",
        },
      ],
      conditions: [],
    } as never,
  });
  return response.result?.data || [];
}

export async function syncBusinessRoleToPlatform(sdk: PageSdk, role: AppRoleRecord) {
  const roleCode = buildRoleCode(role);
  const platformRole = await sdk.role.create({
    code: roleCode,
    name: role.roleName,
    scope: "app",
    description: "由业务角色维护表同步",
  });
  const roleId = platformRole.result?.id;
  if (!roleId) return platformRole;

  for (const member of role.members || []) {
    await sdk.role.assignRoles({
      userId: member.value,
      roleIds: [roleId],
    });
  }
  return platformRole;
}
