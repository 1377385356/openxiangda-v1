# Permissions And Settings Reference

OpenXiangda permission APIs use ordinary user Bearer tokens. The effective permissions are the same as the current frontend user.

Before implementing account, role, RBAC, organization-account, data-scope, or
query-parameter authorization requirements, run:

```bash
openxiangda design gates --topic permissions --json
```

Then choose one permission mode from
`references/permission-design-patterns.md`:

- `managed-platform-account`: the app creates/maintains platform accounts,
  departments, and role members.
- `existing-platform-user-assignment`: the app selects existing platform users
  and assigns app roles/business scopes.
- `static-role-permission`: fixed roles and permission groups, no account
  governance screens.
- `query-param-context`: query parameters are context, filters, or ticket input
  only; they are not sensitive authorization.

Frontend hiding, `PermissionBoundary`, route guards, and query parameters are
display or context tools. Sensitive data access must be enforced by platform
roles, page permission groups, form permission groups, public-access grants, or
backend App Function role/scope checks.

Role management is permission controlled too. A role such as "校区管理员" that
will create app roles, assign role members, or grant role permissions must be
published with API permissions on the role resource. Use `apiPermissionCodes`
in `src/resources/roles/<code>.json`; otherwise the user may have the business
role but still fail when calling role-setting APIs.

For app-managed platform accounts or departments, use `sdk.organization.*` or
`ctx.organization.*`. The real current operator needs `app:organization:read`
or `app:organization:manage` for list/detail queries and
`app:organization:manage` for writes/password operations; do not bypass
OpenXiangda with legacy user or department APIs.

## Role Codes

Use stable local role codes:

```json
{
  "code": "sales",
  "name": "销售",
  "description": "销售人员"
}
```

Role IDs are platform-specific. Store them only in `.openxiangda/state.json` under the active profile.

For delegated role administrators, include API permission codes on the role:

```json
{
  "code": "campus_admin",
  "name": "校区管理员",
  "description": "维护本校区账号、角色和权限",
  "apiPermissionMode": "merge",
  "apiPermissionCodes": [
    "app:role:manage",
    "app:page-permission-group:manage",
    "app:form-permission-group:manage",
    "app:organization:manage"
  ]
}
```

`app:role:manage` covers app role creation, role member assignment, and assigning
app-scoped API permissions to roles. Page/form permission group maintenance use
their own permission codes. If a delegated administrator creates another role
that should also administer accounts or roles, that new role also needs its own
`apiPermissionCodes`; permissions are not inherited from the creator.

## Page Permission Groups

Page permission groups map role codes to visible menu targets. Form menus use their `FORM_...`
form UUIDs. Custom code page/display menus should include menu IDs because the platform
permission editor uses menu IDs for tree check state. Some `/view` runtime guards also require
page ID, route key, and legacy `PAGE_...` aliases; keep those aliases in the same permission
group so the platform tree can still round-trip the menu selection.

```json
{
  "name": "销售页面",
  "roles": ["sales"],
  "platformRoleCodes": [],
  "menuFormUuids": ["FORM_CUSTOMER", "FORM_ORDER", "MENU_ID_FOR_CODE_PAGE"]
}
```

`platformRoleCodes` is optional and is evaluated alongside `roles` using OR semantics. Use the
daily DingTalk school-contact identity codes `SCHOOL_GUARDIAN`, `SCHOOL_STUDENT`, and
`SCHOOL_TEACHER`; the platform maintains these system roles and applications must not assign
them manually. If both arrays are empty, the group is unrestricted.

For custom code pages, keep the editable menu tree targets separate from runtime aliases. The
platform permission editor only reliably checks real menu IDs, while `/view` runtime guards on
some private deployments still check the code page id, route key, or legacy `PAGE_...` id. When
`--page-codes` or `--menu-codes` is used, OpenXiangda creates an editable group plus a companion
runtime alias group:

```json
{
  "name": "销售页面",
  "roles": ["sales"],
  "menuFormUuids": ["MENU_ID_FOR_CODE_PAGE"]
}
```

```json
{
  "name": "销售页面（运行时别名）",
  "roles": ["sales"],
  "menuFormUuids": ["PAGE_ID_FOR_CODE_PAGE", "CODE_PAGE_ROUTE_KEY", "PAGE_LEGACY_FORM_UUID"]
}
```

Rules:

- `roles: []` means all roles can match.
- `menuFormUuids: []` means all menus/pages are visible to matched roles.
- Prefer `--form-codes` in CLI for form menus so each profile resolves its own form UUIDs.
- Prefer `--page-codes` or `--menu-codes` in CLI for custom code page menus. The primary group remains editable because it contains only menu IDs. Pass `--no-runtime-aliases` only after confirming the target platform checks menu IDs directly at runtime.

## Form Permission Groups

Submit group:

```json
{
  "name": "销售提交",
  "type": "submit",
  "roles": ["sales"],
  "platformRoleCodes": [],
  "operations": ["submit"]
}
```

View group:

```json
{
  "name": "销售查看",
  "type": "view",
  "roles": ["sales"],
  "platformRoleCodes": [],
  "dataScope": [{ "type": "self" }],
  "operations": ["view", "edit"],
  "fieldPermissions": [
    {
      "componentName": "Text",
      "fieldName": "customerName",
      "label": "客户名称",
      "value": "FORM_FILED_VIEW"
    }
  ],
  "fieldAccessPolicy": {
    "defaultAccess": "edit",
    "fields": [
      { "fieldId": "internalRemark", "access": "readonly" },
      { "fieldId": "marginAmount", "access": "hidden" }
    ]
  }
}
```

`fieldPermissions` remains a frontend display-default setting. Do not treat it as real data
read/write permission. Real backend field access is controlled by `fieldAccessPolicy`.

Frontend display-default field permission values:

- `FORM_FILED_EDIT`
- `FORM_FILED_VIEW`
- `FORM_FILED_HIDDEN`

Real field access policy:

- `defaultAccess`: one of `edit`, `readonly`, `hidden`; omitted/null policies are equivalent
  to `{ "defaultAccess": "edit", "fields": [] }`.
- `fields`: exception list keyed by schema field ID, such as `textField_xxx`; only store
  fields whose access differs from `defaultAccess`.
- `edit` means visible and editable.
- `readonly` means visible but not editable.
- `hidden` means not visible and not editable.
- If multiple matched view groups apply to the same user, field access merges by
  `edit > readonly > hidden`.
- App administrators bypass `fieldAccessPolicy`.

Common data scopes:

- `all`
- `self`
- `current_department`
- `sub_departments`
- `same_level_departments`
- `custom_departments`

Condition-style data permission:

```json
{
  "type": "condition",
  "condition": {
    "logic": "AND",
    "rules": [
      {
        "field": "owner",
        "componentType": "Employee",
        "op": "=",
        "value": "${CURRENT_USER_ID}"
      }
    ]
  }
}
```

## Business Scope Policy

Use `scope_policy` when data access follows application-maintained business
relationships such as user/role -> customer, project, region, store, campus,
college, class, merchant, or any other maintained object set.

Recommended boundary:

- Small fixed app: static roles + a few page/form permission groups.
- Platform organization fits the business: department data scope.
- Common complex business scope: authorization form + `scope_policy`.
- Public access: public-access grant + external role + permission groups.
- Sensitive writes: App Function service-side role/scope checks.

Do not create one platform role or one permission group per business object.
Do not force form-maintained business scope into platform departments. Frontend
hiding, query parameters, and page role checks are not sensitive authorization.

Declare scope resources:

```json
// src/resources/permissions/scope-dimensions/college.json
{
  "code": "college",
  "name": "学院",
  "sourceFormCode": "college",
  "sourceValueField": "collegeCode",
  "sourceLabelField": "collegeName",
  "hierarchyMode": "flat"
}
```

```json
// src/resources/permissions/scope-grant-sources/college_grants.json
{
  "code": "college_grants",
  "name": "学院授权",
  "sourceFormCode": "college_grant",
  "subjectMappings": [
    { "subjectType": "user", "field": "userId" },
    { "subjectType": "role", "field": "roleCode" }
  ],
  "dimensionMappings": [
    { "dimensionCode": "college", "field": "collegeCode" }
  ],
  "filterJson": {
    "logic": "AND",
    "rules": [
      { "field": "status", "op": "eq", "value": "enabled" }
    ]
  },
  "syncMode": "on_write",
  "sync": true
}
```

```json
// src/resources/permissions/data-scope-policies/college_data.json
{
  "code": "college_data",
  "name": "学院数据",
  "matchMode": "AND",
  "rules": [
    {
      "dimensionCode": "college",
      "field": "collegeCode",
      "operation": "view"
    }
  ]
}
```

Reference the policy from a form permission group:

```json
{
  "code": "college_view",
  "formCode": "student",
  "name": "学院查看学生",
  "type": "view",
  "roles": ["college_admin"],
  "actions": ["view", "edit", "export"],
  "dataPermission": {
    "type": "scope_policy",
    "policyCode": "college_data"
  }
}
```

Unified permission model:

- `scope_policy` means data range: which rows this user/current app role can
  access.
- `actions` means operation ability: what the role can do to rows in that
  range. Form actions are `view`, `create`, `edit`, `delete`, `export`,
  `import`, `change_records`, and `workflow`.
- The platform still stores actions in the legacy `operations` field. Manifests
  may use either `actions` or `operations`; prefer `actions` in new resources.
- `type: "submit"` is the legacy create group and maps to `actions:["create"]`.
- `export` is independent from `view` for new apps. Old apps may temporarily
  rely on view-to-export compatibility, but `permission audit` should be used to
  migrate to explicit `export`.
- `create` with `scope_policy` validates submitted scope fields; a campus admin
  cannot create a row for another campus just because the create button is
  visible.
- Frontend button hiding is UX only. The backend action check and action-specific
  data range are authoritative.

Create permission with business scope:

```json
{
  "code": "college_student_create",
  "formCode": "student",
  "name": "学院管理员新增本学院学生",
  "type": "submit",
  "roles": ["college_admin"],
  "actions": ["create"],
  "dataPermission": {
    "type": "scope_policy",
    "policyCode": "college_data"
  }
}
```

For Data View permission groups, use the same `dataPermission` shape inside the
view's `permissionGroups`. Data View actions are `query`, `stats`, `export`,
and `refresh`.

Default runtime semantics:

- Effective scope = personal grants + current app role grants.
- Multiple policy rules are explicit `AND` unless `matchMode: "OR"` is set.
- Empty grant sets deny data.
- App administrators still bypass data filtering, but audit/explain should make
  the bypass visible.
- Redis caches per user/current-role/policy summaries with a scope version key;
  large grant sets fall back to DB `EXISTS` checks instead of huge SQL `IN`
  lists.
- Prefer hidden scalar target fields such as `collegeCode` or `projectId`.
  If a policy directly targets a JSONB option/person/department field, declare
  `valuePath: "value"` or a supported `componentType` so the runtime compares
  the stored option value instead of the whole JSON object.
- `filterJson` filters authorization source rows before materializing grants.
  Use it for enabled/approved/effective authorization rows; unsupported filter
  operations do not match.
- Source authorization forms are synced by the platform after create/update/
  delete/import when the grant source uses the default `syncMode: "on_write"`.
  Use `syncMode: "manual"` only for externally maintained sources or unusual
  bulk jobs that explicitly call `openxiangda scope sync`. Publishing with
  `"sync": true` still performs an immediate full sync during resource publish.
- App Function `ctx.form.queryOne/queryMany/getById` enforces the caller's view
  permission when there is a real current user. No matching view permission
  group means deny; backend system automations can still use trusted internal
  paths and should add explicit role/scope checks for sensitive logic.

Useful commands:

```bash
openxiangda scope dimension-upsert college --json-file src/resources/permissions/scope-dimensions/college.json --write-manifest
openxiangda scope grant-source-upsert college_grants --json-file src/resources/permissions/scope-grant-sources/college_grants.json --write-manifest
openxiangda scope policy-upsert college_data --json-file src/resources/permissions/data-scope-policies/college_data.json --write-manifest
openxiangda scope sync college_grants --json
openxiangda scope explain college_data --json
openxiangda permission audit --json
```

## Settings

Form settings are deep-merged:

```json
{
  "customPage": {
    "enabled": true,
    "bundleUrl": "https://cdn.example.com/form.js"
  }
}
```

Field index config:

```json
[
  { "id": "idx_customer_name", "fields": ["customerName"] },
  { "id": "idx_owner", "fields": ["owner"] }
]
```

Data management config is stored as an opaque JSON object by the platform. Keep it profile-neutral and avoid embedding form UUIDs from another platform:

```json
{
  "columns": [
    { "fieldId": "customerName", "title": "客户名称", "visible": true }
  ],
  "filters": [],
  "actions": []
}
```

## Public Access

新 React SPA 应用的公开访问使用应用路由和公开策略资源：

```json
{
  "code": "public.register",
  "pathPattern": "/view/:appType/public/register",
  "publicAccess": "guest",
  "publicPolicyCode": "public_register"
}
```

```json
{
  "code": "public_register",
  "mode": "guest",
  "routeCode": "public.register",
  "externalRoleCodes": ["external_visitor"],
  "grants": {
    "forms": ["registration_form"],
    "dataViews": ["public_registration_lookup"],
    "functions": ["submit_public_registration"],
    "connectors": ["sms.sendCode"]
  }
}
```

Rules:

- Public routes live under `/view/:appType/public/*`.
- Public users get a scoped `publicAccess` claim, not a normal app role assignment.
- Use virtual external role codes, such as `external_visitor`, in page/form/dataView permission groups.
- Form/dataView/function/connector access is denied unless the policy explicitly grants it.
- `mode: "ticket"` requires a valid ticket for sensitive links.
- Do not use `?publicAccess=guest` for new React SPA apps.

Legacy form public access config:

```json
{
  "isPublic": true,
  "description": "公开填报"
}
```

This old form-level setting is resolved by `appType + formUuid` and exists only for old `sy-lowcode-view` compatibility.
