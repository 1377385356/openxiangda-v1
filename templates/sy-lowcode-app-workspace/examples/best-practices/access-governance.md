# Access Governance Pattern

This example is a generic account and permission governance skeleton. Copy only
the parts required by the selected permission mode. Do not publish this example
directly without changing codes, names, roles, and data scopes.

Start with:

```bash
openxiangda design gates --topic permissions --json
```

Choose one mode:

- `managed-platform-account`: app creates/maintains platform departments,
  accounts, and role members.
- `existing-platform-user-assignment`: app assigns existing platform users to
  app roles and business scopes.
- `static-role-permission`: fixed roles and permission groups only.
- `query-param-context`: query parameters are only context, filters, or ticket
  input; they do not grant sensitive data access.

## Resource Closure

```text
src/forms/organization_unit/schema.ts
src/forms/system_account/schema.ts
src/forms/role_assignment/schema.ts
src/functions/sync_access_governance/index.ts
src/resources/roles/access-roles.json
src/resources/permissions/page-groups/access-admin-pages.json
src/resources/permissions/form-groups/role_assignment/access-admin.json
```

## Form Skeletons

`organization_unit` stores business organization units and the platform
department sync result:

```ts
export const organizationUnitFields = [
  { fieldId: "unitName", label: "组织名称", componentName: "TextField", placeholder: "请输入组织名称" },
  { fieldId: "unitCode", label: "组织编码", componentName: "TextField", placeholder: "请输入稳定组织编码" },
  { fieldId: "parentUnit", label: "上级组织", componentName: "SelectField", placeholder: "请选择上级组织", options: [] },
  { fieldId: "manager", label: "负责人", componentName: "UserSelectField", placeholder: "请选择负责人" },
  { fieldId: "platformDeptId", label: "平台部门ID", componentName: "TextField", behavior: "HIDDEN" },
  {
    fieldId: "syncStatus",
    label: "同步状态",
    componentName: "SelectField",
    behavior: "HIDDEN",
    options: [
      { label: "待同步", value: "pending" },
      { label: "已同步", value: "synced" },
      { label: "同步失败", value: "failed" },
    ],
  },
  { fieldId: "syncMessage", label: "同步说明", componentName: "TextAreaField", behavior: "HIDDEN" },
  { fieldId: "lastSyncedAt", label: "最后同步时间", componentName: "DateField", behavior: "HIDDEN" },
];
```

`system_account` stores the app-owned account record and the platform user sync
result:

```ts
export const systemAccountFields = [
  { fieldId: "displayName", label: "姓名", componentName: "TextField", placeholder: "请输入姓名" },
  { fieldId: "loginName", label: "登录名", componentName: "TextField", placeholder: "请输入登录名" },
  { fieldId: "phone", label: "手机号", componentName: "TextField", placeholder: "请输入手机号" },
  { fieldId: "unitCode", label: "所属组织", componentName: "SelectField", placeholder: "请选择所属组织", options: [] },
  {
    fieldId: "enabled",
    label: "账号状态",
    componentName: "RadioField",
    placeholder: "请选择账号状态",
    options: [
      { label: "启用", value: "enabled" },
      { label: "停用", value: "disabled" },
    ],
  },
  { fieldId: "platformUserId", label: "平台用户ID", componentName: "TextField", behavior: "HIDDEN" },
  { fieldId: "platformDeptId", label: "平台部门ID", componentName: "TextField", behavior: "HIDDEN" },
  {
    fieldId: "syncStatus",
    label: "同步状态",
    componentName: "SelectField",
    behavior: "HIDDEN",
    options: [
      { label: "待同步", value: "pending" },
      { label: "已同步", value: "synced" },
      { label: "同步失败", value: "failed" },
    ],
  },
  { fieldId: "lastSyncedAt", label: "最后同步时间", componentName: "DateField", behavior: "HIDDEN" },
];
```

`role_assignment` maps accounts or existing platform users to roles and business
scope keys:

```ts
export const roleAssignmentFields = [
  { fieldId: "account", label: "账号", componentName: "SelectField", placeholder: "请选择账号", options: [] },
  { fieldId: "platformUser", label: "平台用户", componentName: "UserSelectField", placeholder: "请选择平台用户" },
  {
    fieldId: "roleCodes",
    label: "角色",
    componentName: "CheckboxField",
    placeholder: "请选择角色",
    options: [
      { label: "权限管理员", value: "access_admin" },
      { label: "范围内经办人", value: "scope_operator" },
    ],
  },
  { fieldId: "businessUnit", label: "业务组织", componentName: "SelectField", placeholder: "请选择业务组织", options: [] },
  { fieldId: "businessScopeKey", label: "业务范围键", componentName: "TextField", behavior: "HIDDEN" },
  {
    fieldId: "syncStatus",
    label: "同步状态",
    componentName: "SelectField",
    behavior: "HIDDEN",
    options: [
      { label: "待同步", value: "pending" },
      { label: "已同步", value: "synced" },
      { label: "同步失败", value: "failed" },
    ],
  },
  { fieldId: "syncMessage", label: "同步说明", componentName: "TextAreaField", behavior: "HIDDEN" },
];
```

## Sync App Function Skeleton

```ts
export default async function syncAccessGovernance(ctx, input) {
  const roleCodes = ctx.operator?.roleCodes || [];
  if (!roleCodes.includes("access_admin") && !ctx.operator?.hasFullAccess) {
    throw new Error("ACCESS_DENIED");
  }

  if (input.action === "syncAccount") {
    if (!ctx.organization?.accounts) throw new Error("ORGANIZATION_API_UNAVAILABLE");
    // Current operator must have app:organization:manage.
    return ctx.organization.accounts.create({
      name: input.displayName,
      loginName: input.loginName,
      phone: input.phone,
      departmentId: input.platformDeptId,
    });
  }

  if (input.action === "syncRoleMembers") {
    // Read role_assignment records, resolve platformUserId values, and update
    // app role members through the platform role API exposed by OpenXiangda.
    return { ok: true };
  }

  throw new Error("UNKNOWN_ACTION");
}
```

## Role Resource

```json
[
  {
    "code": "access_admin",
    "name": "权限管理员",
    "description": "维护组织、账号、角色和权限资源",
    "apiPermissionMode": "merge",
    "apiPermissionCodes": [
      "app:role:manage",
      "app:page-permission-group:manage",
      "app:form-permission-group:manage",
      "app:organization:manage"
    ]
  },
  {
    "code": "scope_operator",
    "name": "范围内经办人",
    "description": "只能访问授权业务范围内的数据"
  }
]
```

The initial grant of `access_admin` is normally done by a platform administrator
or an existing app administrator. If `access_admin` creates another role that
also manages accounts, roles, or permission groups, publish that new role with
its own `apiPermissionCodes`; management power is not inherited from the
creator.

## Page Permission Group

```json
{
  "code": "access_admin_pages",
  "name": "权限管理员页面",
  "roles": ["access_admin"],
  "menuCodes": ["access_governance"],
  "routeCodes": ["access.governance"],
  "pathPatterns": ["/view/:appType/admin/access/*"]
}
```

## Form Permission Group

```json
{
  "code": "role_assignment_admin",
  "formCode": "role_assignment",
  "name": "角色分配管理员",
  "type": "view",
  "roles": ["access_admin"],
  "operations": ["view", "edit", "delete"],
  "dataScope": [{ "type": "all" }],
  "fieldAccessPolicy": {
    "defaultAccess": "edit",
    "fields": [
      { "fieldId": "syncMessage", "access": "readonly" }
    ]
  }
}
```

For `scope_operator`, use condition data permission against hidden scalar keys,
for example `businessScopeKey = ${CURRENT_USER_SCOPE}`. Do not fetch all rows
and filter them in the page.

## Acceptance

- Permission mode and matrix are written in the SDD change or design document.
- `openxiangda permission audit --json` has no high-risk gaps.
- Allowed and denied role paths are both tested.
- Query parameter tampering does not expand sensitive access.
- Managed account writes are executed only by a user with
  `app:organization:manage`.
- Roles that create roles, assign members, or maintain permission groups include
  `apiPermissionCodes` such as `app:role:manage`.
