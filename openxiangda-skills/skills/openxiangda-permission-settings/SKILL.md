---
name: openxiangda-permission-settings
description: Manage OpenXiangda app **roles** (角色), **page permission groups** (页面权限组 / 菜单可见), **form permission groups** (表单权限组 / 提交 / 查看 / 字段权限 / 数据范围 / 数据隔离), account/role governance patterns, query-parameter authorization boundaries, and **form settings** (表单设置 / 索引 / 数据管理页 / 公开访问 / public access / 分享) with profile-isolated IDs and ordinary user token permissions. Trigger on 角色 / role / 权限 / permission / RBAC / 账号权限 / account permission / 组织账号 / organization account / 平台账号 / 数据范围 / data scope / 字段权限 / field permission / 菜单可见 / menu visibility / 公开访问 / public access / 分享 / share, or any work touching `permission ...` / `settings ...` CLI commands or `src/resources/{roles,pagePermissionGroups,formPermissionGroups,formSettings}/`.
---

# OpenXiangda Permission And Settings

## When to use this skill

- User wants to **define / modify roles** for the app.
- User wants to **gate menu / page visibility** (page permission groups).
- User wants to **gate form submit / view / edit / data scope / field permissions** (form permission groups).
- User wants to **publish a form publicly** or change form runtime settings, indexes, data-management page config.
- User asks about **dynamic role governance** (role maintenance form synced to platform via automation).
- User asks about **platform accounts, organization accounts, account-role assignment, RBAC, or query-parameter access**.

## DO / DO NOT

- ✅ Before account/role/permission design, run `openxiangda design gates --topic permissions --json` and choose one mode: `managed-platform-account`, `existing-platform-user-assignment`, `static-role-permission`, or `query-param-context`.
- ✅ Write a permission matrix before implementation: account source, role member source, page groups, form groups, data scope, field access policy, backend checks, query parameter boundary, and publish order.
- ✅ Use logical role / group codes locally; live IDs go under the active profile in `.openxiangda/state.json`.
- ✅ For dynamic multi-role apps, build a role maintenance form + automation/JS_CODE sync, not hardcoded role logic in page code.
- ✅ For permission scope keys, derive hidden scalars (`collegeScopeKey`, `classScopeKey`, `ownerDeptScopeKey`, `ownerUserScopeKey`, `roleCode`) via `valueSync` from visible select/person/department fields.
- ✅ Use page permission groups for entry visibility, form permission groups for real data isolation with condition-based data permissions.
- ✅ For app-managed platform accounts/departments, use `sdk.organization.*` / `ctx.organization.*`. Read-only list/detail operations require `app:organization:read` or `app:organization:manage`; writes and password operations require `app:organization:manage`.
- ✅ For delegated administrators such as 校区管理员, put role-setting API permissions in the role manifest with `apiPermissionCodes`; use `app:role:manage` for app role creation/member assignment/API-permission assignment, and add page/form/organization management permission codes only when needed.
- ✅ If a delegated administrator creates another role that can also manage accounts, roles, or permission groups, publish that new role with its own `apiPermissionCodes`.
- ❌ Expose raw ID text fields to users for permission scopes.
- ❌ Treat query parameters as sensitive authorization. They may carry context, filters, or ticket input only.
- ❌ Treat `PermissionBoundary`, button hiding, route hiding, or frontend role checks as the authority for sensitive data.
- ❌ Hardcode role strings in pages without backing roles/page groups/form groups or App Function checks.
- ❌ Give a user a business admin role but forget to bind `app:role:manage`, then expect role creation or role-member assignment to work.
- ❌ Bypass OpenXiangda SDK and call platform account/organization write APIs directly.
- ❌ Store platform-specific public-access IDs locally; CLI resolves by `appType + formUuid` per profile.
- ❌ Reuse role / permission-group IDs across profiles.
- ❌ Use AK/SK or legacy `/dingtalk-api/v1.0` — the logged-in user must have the matching app permission.

## Required Context

Before changing permissions:

```bash
openxiangda env --profile dev
openxiangda auth status --profile dev
openxiangda workspace bind --profile dev --app-type APP_XXX
```

The logged-in user must have the matching app permission. Do not use AK/SK or legacy `/dingtalk-api/v1.0`.

For design work, also run:

```bash
openxiangda design gates --topic permissions --json
```

Resolve the permission mode before writing resources:

- `managed-platform-account`: the app creates/maintains platform accounts,
  departments, and role members.
- `existing-platform-user-assignment`: the app selects existing platform users
  and assigns app roles/business scopes.
- `static-role-permission`: fixed app roles and permission groups, no in-app
  account governance.
- `query-param-context`: query parameters are only context, filters, or ticket
  input; sensitive authorization still comes from roles, grants, form groups,
  or App Function checks.

## Roles

Create app roles first:

```bash
openxiangda permission role-list --profile dev
openxiangda permission role-create sales --name "销售" --profile dev
```

Use role codes in permission group JSON. Bind existing role IDs only inside the current profile:

```bash
openxiangda permission role-bind sales --role-id <id> --profile dev
```

`role-users` and `role-add-users` accept either a role UUID or a logical role
code. When a code has no profile-local binding, the CLI resolves it from the
current application's role list and requires exactly one matching code; missing
or ambiguous matches fail explicitly instead of sending the code as a role ID.

For dynamic multi-role apps, do not hardcode role behavior only in page code. Create a role maintenance form and sync it to platform roles with automation / JS_CODE. Visible scope fields should be maintainable controls: personnel/department fields for people and orgs, `SelectField` / `RadioField` for enums, and `SelectField` with `optionSource.type: "linkedForm"` for records maintained by other forms. When the source form can have many records, set `remoteSearch: true` and `searchFieldId` so typing in the dropdown triggers an SDK query instead of loading every record. If form permission groups need scalar matching, derive hidden keys such as `collegeScopeKey`, `classScopeKey`, `ownerDeptScopeKey`, `ownerUserScopeKey`, and `roleCode`; do not expose raw ID text fields to users. Use page permission groups for entry visibility and form permission groups with condition-based data permissions for real data isolation.

For managed platform account governance, use organization/account forms and sync
functions as a closed loop: organization units, system accounts, role
assignments, roles resources, page groups, form groups, sync App Functions, and
backend role/scope checks. Platform account access must go through
`sdk.organization` or `ctx.organization`; give read-only operators
`app:organization:read` and require `app:organization:manage` for writes and
password operations.

## Page Permission Groups

Page permission groups control menu/page visibility:

```bash
openxiangda permission page-group-create sales_pages --name "销售页面" --roles sales --form-codes customer,orders --profile dev
openxiangda permission page-group-create portal_pages --name "门户页面" --page-codes portal_pc,portal_mobile --profile dev
```

Use `--page-codes` or `--menu-codes` for custom code page menus; the CLI resolves the permission group to the published menu ID and keeps required page ID, route key, and legacy `PAGE_...` runtime aliases in the same group so the platform editor can still round-trip the selection. Use `--form-codes` for form menus; the CLI resolves forms to profile-local form UUIDs. Empty target lists mean all menus/pages are visible to matched roles. Only pass `--no-runtime-aliases` after confirming the target platform checks menu IDs directly at runtime.

For Phase 6 React SPA apps, define menu visibility and direct route access with
resource codes instead of old platform menu-tree-only targets:

```json
{
  "code": "sales_spa_pages",
  "name": "销售 SPA 页面",
  "roles": ["sales"],
  "menuCodes": ["sales_dashboard", "customer_data"],
  "routeCodes": ["sales.dashboard", "customer.data"],
  "pathPatterns": ["/view/:appType/admin/sales/*"]
}
```

Or create from CLI:

```bash
openxiangda permission page-group-create sales_spa_pages \
  --name "销售 SPA 页面" \
  --roles sales \
  --menu-codes sales_dashboard,customer_data \
  --route-codes sales.dashboard,customer.data \
  --path-patterns '/view/:appType/admin/sales/*' \
  --profile dev
```

Do not hardcode role checks in React pages. Use backend runtime bootstrap,
`useAppMenus()`, `useCanAccessRoute()`, and `PermissionBoundary` from
`openxiangda/runtime/react` for display control. Backend form, field, data,
workflow, file, and connector permissions remain authoritative.

## Form Permission Groups

Form permission groups control submit/view permissions, data scope, operations, and fields:

```bash
openxiangda permission form-group-create sales_view --form-code customer --name "销售查看" --type view --roles sales --operations view --profile dev
```

For advanced field permissions and data permission conditions, pass JSON files:

```bash
openxiangda permission form-group-create sales_limited \
  --form-code customer \
  --name "销售只看自己" \
  --type view \
  --roles sales \
  --data-scope-json data-scope.json \
  --field-permissions-json fields.json \
  --field-access-policy-json field-access-policy.json \
  --data-permission-json data-permission.json \
  --profile dev
```

`fieldPermissions` is the frontend display-default state. Use `fieldAccessPolicy`
for real backend read/write field access (`edit`, `readonly`, `hidden`) with
`defaultAccess` plus field-ID exceptions.

For governed application publishing, declare groups under
`src/resources/formPermissionGroups` and publish them through exact
`resource publish ... --only ... --change ...` scope. The CLI folds changed
groups into the owning Form's immutable FormRelease, freezes a permission-group
parent hash, and keeps live rows unchanged until Root App finalize. The
low-level `permission form-group-create/update/delete` commands are for
intentional maintenance and diagnostics, not an atomic multi-resource release.

## Inspection

```bash
openxiangda permission form-summary --form-code customer --profile dev --json
openxiangda permission menu-permissions --profile dev --json
openxiangda permission snapshot --profile dev --form-codes customer,orders --json
```

When auditing many roles or permission groups, prefer `openxiangda permission
snapshot` over looping `role-list`, `page-group-list`, or `form-group-list`.
The snapshot command uses the platform batch endpoint and returns roles, page
permission groups, and form permission groups in one request.

## Form Settings

Use settings commands for form runtime settings, field indexes, data management pages, and public access:

```bash
openxiangda settings get customer --profile dev --json
openxiangda settings save customer --settings-json settings.json --profile dev
openxiangda settings indexes customer --profile dev --json
openxiangda settings indexes-save customer --indexes-json indexes.json --profile dev
openxiangda settings data-management-save customer --config-json data-management.json --profile dev
openxiangda settings public-access-save customer --public true --description "公开填报" --profile dev
```

Do not store platform-specific public access IDs locally. The CLI resolves by `appType + formUuid` for the current profile.

## References

- Permission model and examples: `references/permissions-settings.md`
- Account/role design modes: `references/permission-design-patterns.md`
- Dynamic role governance and data-isolation pattern: `references/best-practices.md`
- Profile-isolated IDs: `references/workspace-state.md`
- API fields: `references/openxiangda-api.md`
