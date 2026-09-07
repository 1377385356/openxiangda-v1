# Permission Design Patterns

Use this reference before implementing OpenXiangda requirements that mention
accounts, roles, permission groups, organization scope, data scope, or query
parameter based access.

The rule is simple: choose the permission mode first, then design forms,
resources, App Functions, pages, and publish order. Do not start by hiding
buttons in the frontend.

## Mode Selection

### `managed-platform-account`

The app owns account governance. Use this for formal admin systems, external
account lifecycle, school/company tenant management, or any workflow where the
app must create, update, disable, reset, or place platform accounts into
departments and roles.

Required design:

- `organization_unit` form: business organization tree, parent key, manager,
  platform department ID, sync status, sync message, last synced time.
- `system_account` form: login name, display name, phone/email, organization
  unit, enabled state, platform user ID, sync status, last synced time.
- `role_assignment` form: account, role codes, business scope fields, hidden
  scalar scope keys, platform role member sync state.
- `src/resources/roles/*.json`: stable app role codes.
- `src/resources/permissions/page-groups/*.json`: menu, route, and page access.
- `src/resources/permissions/form-groups/*.json`: `actions`, data scope or
  `dataPermission.type=scope_policy`, and `fieldAccessPolicy`.
- `apiPermissionCodes` on roles that are allowed to manage roles, role members,
  permission groups, or organization accounts.
- Sync App Functions or trusted JS_CODE: sync organization units, accounts, and
  role assignments to the platform.
- Page `PermissionBoundary` and runtime menus for display control only.
- Backend role/scope checks in App Functions for sensitive writes.

Platform account writes must use `sdk.organization.*` or `ctx.organization.*`.
The real current operator must have `app:organization:manage`. Do not call
legacy `/user` or `/department` write endpoints from app code.

### `existing-platform-user-assignment`

The platform already has users and departments. The app only assigns existing
users to app roles and business scopes.

Required design:

- Role assignment form with `UserSelectField` / department fields for members.
- Business scope fields such as region, department, project, customer, class, or
  college. When the scope object count can grow past a few fixed values, model
  the authorization as `scopeDimensions`, `scopeGrantSources`, and
  `dataScopePolicies` instead of creating one role or permission group per
  object.
- Role sync App Function or automation only updates app role members, not
  account records.
- Roles, page groups, and form groups remain the RBAC enforcement layer.
  `scope_policy` becomes the data-range enforcement layer for dynamic business
  objects.

Use this when HR/IT or the platform admin owns account lifecycle.

### `static-role-permission`

Roles are fixed and membership is maintained by platform admins or resource
manifests. Use this for small internal apps, stable admin roles, and apps where
no in-app role maintenance screen is required.

Required design:

- `roles` resources.
- Page permission groups for menus/routes.
- Form permission groups for submit/view/manage/data scope/field access.
- Optional `PermissionBoundary` for UI display.

Do not create role/account governance forms just because a page has two static
roles.

### `query-param-context`

Query parameters provide context only. Use this for low-risk links, prefilled
filters, external ticket input, public lookup keys, or deep links.

Allowed:

- select an initial tab, filter, date range, organization code, or public ticket
  code
- prefill a form field before the user submits
- carry a signed/expiring ticket that is validated by public-access policy or an
  App Function

Not allowed:

- granting sensitive data access only because `?role=admin` or `?dept=...` is
  present
- deciding form data scope only in the frontend
- bypassing roles, form permission groups, public-access grants, or App
  Function checks

If the page reads sensitive data, performs writes, or exposes internal records,
combine query parameters with real authorization: public-access grants, roles,
form permission groups, or server-side App Function checks.

## Standard Resource Closure

A complete high-governance permission design usually has this closure:

```text
organization_unit
  -> system_account
  -> role_assignment
  -> src/resources/roles
  -> permissions/page-groups
  -> permissions/form-groups
  -> permissions/scope-dimensions
  -> permissions/scope-grant-sources
  -> permissions/data-scope-policies
  -> sync App Functions / JS_CODE
  -> PermissionBoundary for display
  -> backend role/scope checks for sensitive writes
```

Pages may show or hide navigation with `useAppMenus`, `useCanAccessRoute`, and
`PermissionBoundary`, but these are not the authority. Real authority is the
platform permission group, public-access grant, or App Function role/scope
check.

## Business Scope Authorization

Use this layer for application-maintained authorization relationships:

```text
authorization form rows
  -> scope grant source sync
  -> materialized effective grants
  -> Redis summary cache
  -> form/data-view dataPermission.type=scope_policy
```

The platform keeps RBAC and data range separate:

- Roles decide who can enter pages, submit/view forms, use operations, and
  maintain permissions.
- Form `actions` decide what a role can do: `view`, `create`, `edit`, `delete`,
  `export`, `import`, `change_records`, and `workflow`.
- Data View `actions` decide query capabilities: `query`, `stats`, `export`,
  and `refresh`.
- Field access remains `fieldAccessPolicy`.
- Business scope policies decide which rows or submitted scope values a matched
  role/user can access for the current action.
- App Functions must still check role/scope server-side before sensitive
  writes.

Default semantics:

- Effective grants are personal grants plus current app role grants.
- Multi-dimension policies are `AND` by default.
- Empty grants deny.
- Admin bypass remains available, but use `openxiangda scope explain` and audit
  logs to make bypass behavior visible.
- Authorization source rows should include an explicit status/enabled field and
  grant sources should use `filterJson` or `enabledField` so drafts, disabled
  rows, or rejected assignments are not materialized.
- Source authorization forms are synced by the platform after form
  create/update/delete/import when the grant source uses the default
  `syncMode: "on_write"`. Use `syncMode: "manual"` only for externally
  maintained sources or unusual bulk jobs; `sync: true` still performs an
  immediate full sync during resource publish.
- Policy target fields should normally be hidden scalar keys. If targeting a
  JSONB option/person/department field directly, declare `valuePath: "value"` or
  `componentType`; multi-value fields should be normalized into a scalar key or
  a separate authorization row.
- App Function form read helpers enforce view permission for real callers. Do
  not grant broad form read permission and then filter in function/page code.
- `DataManagementList` can hide buttons from the backend action summary, but it
  is not the authority. Sensitive actions must be represented by form actions or
  App Function server checks.

Do not model a dynamic business object set by generating dozens or hundreds of
roles or permission groups. Use a business authorization form and `scope_policy`
when the object set is maintained by users, imported from another system, or
expected to grow.

Recommended action pattern:

```json
{
  "code": "campus_profile_manage",
  "formCode": "student_profile",
  "name": "校区管理员档案权限",
  "type": "view",
  "roles": ["campus_admin"],
  "actions": ["view", "edit", "export"],
  "dataPermission": {
    "type": "scope_policy",
    "policyCode": "campus_row_scope"
  },
  "fieldAccessPolicy": {
    "defaultAccess": "readonly",
    "fields": [{ "fieldId": "remark", "access": "edit" }]
  }
}
```

## Role Setting Delegation

Setting application roles is itself permission controlled. A user can be a
business administrator in the app and still fail to create roles, assign role
members, or grant role permissions unless that user's current app role has the
matching API permission.

Use role `apiPermissionCodes` in `src/resources/roles/<code>.json` for delegated
administrators:

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

Platform behavior to design against:

- `app:role:manage` is required to create/update/delete app roles, assign app
  roles to users, and assign app-scoped API permissions to roles.
- `app:page-permission-group:manage` is required to create/update/delete page
  permission groups.
- `app:form-permission-group:manage` is required to create/update/delete form
  permission groups.
- `app:organization:manage` is required for platform account/department writes.
- Platform roles still require platform-admin authority; delegated app admins
  can only manage app-scoped roles and app-scoped API permissions.

When a platform administrator first grants a role such as `campus_admin`, that
role must include the API permissions needed for its future work. If
`campus_admin` later creates another role that also manages accounts, roles, or
permission groups, the new role must also be published with its own
`apiPermissionCodes`. Do not rely on inherited privilege from the creator.

`apiPermissionMode` defaults to `merge`. Use `replace` only when you explicitly
want the manifest to become the full API permission list for the role.
`openxiangda resource publish` fails if a declared permission code is missing
from the platform seed data, which is preferable to silently creating an
administrator role that cannot administer.

## Design Matrix

Before implementation, write a matrix with at least these columns:

| Area | Decision |
| ---- | -------- |
| Permission mode | `managed-platform-account` / `existing-platform-user-assignment` / `static-role-permission` / `query-param-context` |
| Account source | app-created platform account / existing platform user / static member / public context |
| Role source | role assignment form / platform role admin / roles manifest / public external role |
| Role setting delegation | which roles need `apiPermissionCodes`, who grants them first, and whether delegation can continue |
| Business scope fields | visible fields and hidden scalar keys |
| Business scope policy | dimensions, grant sources, policy code, sync trigger, empty-grant behavior |
| Page access | menu codes, route codes, path patterns, role codes |
| Form access | submit/view/manage operations, data scope, field access policy |
| Backend checks | App Functions that validate role/scope and deny bad input |
| Query parameters | context only, ticket validation, tamper-deny test |
| Publish order | forms -> resources -> functions/runtime |

## Anti-Patterns

- Query parameters as sensitive authorization.
- Frontend-only button hiding or route hiding.
- Hardcoded role strings scattered through pages.
- OR data policies whose role-specific rules omit `roleCodes`; otherwise a
  user's applicant rule can remain active after switching to an administrator
  RoleSession.
- Delegated administrators without `app:role:manage` or required permission
  group management API permissions.
- New roles created by delegated administrators without their own
  `apiPermissionCodes` when they are expected to administer accounts or roles.
- Mock role context, fake account IDs, fake form instance IDs, or empty-array
  fallback displays.
- Giving users all form data and filtering in the browser.
- One platform role or one permission group per customer, project, region,
  store, college, class, or other maintained object.
- Syncing application-maintained business scope into platform departments just
  to reuse department data scope.
- Direct platform account API calls that bypass OpenXiangda organization SDK.
- Reusing public visitor roles as internal admin roles.

## Acceptance

- `openxiangda design gates --topic permissions --json` was run and its open
  questions are answered.
- Permission mode and matrix are recorded in SDD/design docs.
- Admin roles that can manage roles, members, permission groups, or accounts
  declare `apiPermissionCodes`.
- `openxiangda permission audit --json` has no high-risk gaps.
- `openxiangda scope explain <policyCode> --json` explains user, current role,
  matched grants, cache state, and final policy for at least one allow and one
  deny case.
- Allowed role paths and denied role paths are both tested.
- A multi-role user is tested after switching RoleSession, and rules bound to
  the previously selected role no longer contribute to row visibility.
- Query parameter tampering does not expand sensitive access.
- App Functions that mutate sensitive data verify `ctx.operator.roleCodes`,
  `ctx.operator.currentRoleCode`, business scope, or explicit public ticket.
- Managed account flows verify `app:organization:manage` before account or
  department writes.
