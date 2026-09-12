# OpenXiangda API

Base path: `/openxiangda-api/v1`

OpenXiangda CLI and low-code app workflows use `/openxiangda-api/v1`. External backend and third-party integrations use the separate `openxiangda-open-api` skill and `/dingtalk-api/v1.0`; do not switch workspace publishing, page, form, workflow, or automation work to AK/SK.

Standard private deployment public paths:

- Backend APIs: `<origin>/service/openxiangda-api/v1`
- Platform management and login UI: `<origin>/platform`
- App runtime pages: `<origin>/view`

CLI profiles store the backend API base, usually `<origin>/service`. Do not call `/openxiangda-api/v1` directly at the root origin.

Authentication:

- Normal CLI calls use `Authorization: Bearer <accessToken>`.
- Refresh calls use the `refreshToken` request body.
- `/dingtalk-api/v1.0` AK/SK authentication is not part of this user-token API contract. Read the `openxiangda-open-api` skill for external backend integration.

## Auth

### POST `/auth/cli-sessions`

Creates a one-time CLI login session.

Response data:

```json
{
  "sessionId": "string",
  "loginUrl": "https://platform/service/openxiangda-api/v1/auth/cli-sessions/:id/login",
  "qrText": "string",
  "expireIn": 300
}
```

### GET `/auth/cli-sessions/:sessionId`

Polls login state. Pending response:

```json
{
  "status": "pending",
  "expireIn": 298
}
```

Authorized response:

```json
{
  "status": "authorized",
  "accessToken": "jwt",
  "refreshToken": "jwt",
  "accessTokenExpiresAt": 1770000000000,
  "refreshTokenExpiresAt": 1772000000000,
  "user": {},
  "tenant": {}
}
```

### GET `/auth/whoami`

Requires Bearer token. Returns user, tenant, platform admin status, and manageable app scope.

### POST `/auth/refresh`

Body:

```json
{
  "refreshToken": "jwt"
}
```

### POST `/auth/logout`

Requires Bearer token. Revokes the current CLI token session.

## App Runtime Auth

### POST `/apps/:appType/auth/dingtalk/oauth/start`

Starts platform-managed DingTalk browser OAuth for an application. This endpoint is called without an existing app login session. The platform creates and stores one-time callback state; application code must not build the DingTalk authorization URL itself.

Body:

```json
{
  "returnUrl": "/view/APP_EXAMPLE/admin"
}
```

`returnUrl` is optional and, when present, must stay under the current application's `/view/:appType/*` routes.

Response data:

```json
{
  "loginUrl": "https://login.dingtalk.com/oauth2/auth?...",
  "expiresIn": 600
}
```

The platform-owned callback consumes the one-time state, creates the authenticated platform session, and redirects to the validated `returnUrl`. React applications normally use `LoginPage dingtalkFlow="auto"`; custom login pages call `createAuthClient(...).getDingTalkOAuthUrl({ returnUrl })` and navigate to `loginUrl`.

## App Snapshot

### GET `/apps/`

Requires Bearer token. Returns apps visible to the current user.

### POST `/apps/`

Requires Bearer token. Creates an app with the current user's permissions.

### GET `/apps/:appType`

Requires Bearer token. Returns app detail.

### GET `/apps/:appType/forms`

Requires Bearer token. Returns forms under the app.

### POST `/apps/:appType/forms`

Requires Bearer token. Creates a normal or workflow form shell.

This endpoint is not the AI page generation path. User-facing normal form pages and workflow form pages must be built from `sy-lowcode-app-workspace` and registered through workspace publish; otherwise the platform only has the legacy/default schema page.

### GET `/apps/:appType/forms/:formUuid`

Requires Bearer token. Returns schema, packages, fields, runtime settings, and custom page publish settings.

### PUT `/apps/:appType/forms/:formUuid`

Requires Bearer token. Updates lightweight form metadata such as name.

### PUT `/apps/:appType/forms/:formUuid/schema`

Requires Bearer token. Updates the form schema and packages. The request may pass `schema` and `packages` as JSON values or JSON strings.

### POST `/apps/:appType/forms/:formUuid/publish`

Requires Bearer token. Registers the built form bundle by writing custom page runtime settings to the form.

### GET `/apps/:appType/forms/:formUuid/settings`

Requires Bearer token. Returns normalized form settings.

### PUT `/apps/:appType/forms/:formUuid/settings`

Requires Bearer token. Deep-merges form settings.

### GET `/apps/:appType/forms/:formUuid/field-indexes`

Requires Bearer token. Returns indexable fields, system indexes, and custom field index status.

### PUT `/apps/:appType/forms/:formUuid/field-indexes`

Requires Bearer token. Saves custom field index definitions and reconciles database indexes.

Body:

```json
{
  "indexes": [
    { "id": "idx_customer", "fields": ["customerName"] }
  ]
}
```

### GET `/apps/:appType/forms/:formUuid/data-management`

Requires Bearer token. Returns data management page config.

### PUT `/apps/:appType/forms/:formUuid/data-management`

Requires Bearer token. Saves data management page config.

Body:

```json
{
  "config": {
    "columns": [],
    "filters": [],
    "actions": []
  }
}
```

### GET `/apps/:appType/forms/:formUuid/public-access`

Requires Bearer token. Returns legacy public/guest access config for the form. This endpoint is only for old `sy-lowcode-view` compatibility.

### PUT `/apps/:appType/forms/:formUuid/public-access`

Requires Bearer token. Creates or updates legacy public/guest access config.

Body:

```json
{
  "isPublic": true,
  "description": "公开填报"
}
```

### DELETE `/apps/:appType/forms/:formUuid/public-access`

Requires Bearer token. Deletes legacy public/guest access config for the form.

## React SPA Public Access

New React SPA apps use `/view/:appType/public/*`, route resources, public access policies, and a scoped public session. Do not use `?publicAccess=guest` for new apps.

Runtime APIs use a JSON envelope. Do not treat HTTP 200 alone as success: `code: "PUBLIC_GRANT_DENIED"` and any other string error code is a failure even when the HTTP status is 200. Validation scripts should require `code === 200`, `code === "200"`, or compatible success code `0`, and should also fail on `success: false`.

### GET `/apps/:appType/routes`

Requires Bearer token. Lists route resources.

### POST `/apps/:appType/routes`

Requires Bearer token. Creates a route resource.

Body:

```json
{
  "code": "public.register",
  "title": "公开报名",
  "kind": "page",
  "pathPattern": "/view/:appType/public/register",
  "publicAccess": "guest",
  "publicPolicyCode": "public_register"
}
```

### PUT `/apps/:appType/routes/:code`

Requires Bearer token. Updates a route resource.

### DELETE `/apps/:appType/routes/:code`

Requires Bearer token. Deletes a route resource.

### GET `/apps/:appType/public-access/policies`

Requires Bearer token. Lists public access policies.

### POST `/apps/:appType/public-access/policies`

Requires Bearer token. Creates a public access policy.

Body:

```json
{
  "code": "public_register",
  "name": "公开报名入口",
  "enabled": true,
  "mode": "guest",
  "routeCode": "public.register",
  "pathPattern": "/view/:appType/public/register",
  "externalRoleCodes": ["external_visitor"],
  "grants": {
    "forms": ["FORM_UUID"],
    "dataViews": ["public_registration_lookup"],
    "functions": ["submit_public_registration"],
    "connectors": ["sms.sendCode"]
  }
}
```

### PUT `/apps/:appType/public-access/policies/:code`

Requires Bearer token. Updates a public access policy.

### DELETE `/apps/:appType/public-access/policies/:code`

Requires Bearer token. Deletes a public access policy.

### POST `/apps/:appType/public-access/policies/:code/tickets`

Requires Bearer token. Creates a ticket for a `mode: "ticket"` policy.

Body:

```json
{
  "expiresAt": "2026-06-18T12:00:00.000Z",
  "subject": { "scenario": "score-link" }
}
```

Tickets are single-use by default. Set policy `ticketConfig.singleUse: false` only when the link is intentionally reusable.

### POST `/apps/:appType/public/session`

Does not require an existing login. Creates a scoped public guest session.

Body:

```json
{
  "policyCode": "public_register",
  "routeCode": "public.register",
  "path": "/view/APP_XXX/public/register",
  "ticket": "optional-ticket",
  "guestIdentifier": "public:APP_XXX:browser-id",
  "domain": "example.com",
  "userAgent": "browser"
}
```

The response returns a scoped bearer token. New React SPA apps must use `PublicAccessGate` or `createPublicAccessClient` so follow-up runtime/bootstrap, dataView, function, and connector calls include `Authorization: Bearer <token>`. React SPA route trees still need `OpenXiangdaProvider` plus `OpenXiangdaPageProvider` when pages use Page SDK hooks. Do not depend on auth cookies for public sessions.

Returns the normal guest token payload plus `extra.publicAccess`.

### GET `/apps/:appType/menus`

Requires Bearer token. Returns menu tree under the app.

### POST `/apps/:appType/menus`

Requires Bearer token. Creates a menu item.

### PUT `/apps/:appType/menus/:menuId`

Requires Bearer token. Updates a menu item.

### DELETE `/apps/:appType/menus/:menuId`

Requires Bearer token. Deletes a menu item.

### PUT `/apps/:appType/menus/actions/sort`

Requires Bearer token. Updates menu sorting and parent relationships in batch.

## Notifications

### POST `/apps/:appType/notifications/send-by-type`

Requires Bearer token. Sends a notification in the current app scope.
Each returned message can include `deliveryMeta` with provider message id, outTrackId, card template id, fallback usage, and provider error summary.

```json
{
  "notificationType": "reservation_reminder",
  "recipientId": "user-id",
  "payload": {
    "title": "预约提醒"
  },
  "channels": ["inapp"]
}
```

### POST `/apps/:appType/notifications/batch-send-by-type`

Requires Bearer token. Sends one notification type to multiple recipients.

```json
{
  "notificationType": "reservation_reminder",
  "recipients": [
    {
      "recipientId": "user-id",
      "payload": {
        "title": "预约提醒"
      },
      "channels": ["inapp"]
    }
  ]
}
```

### GET `/apps/:appType/notifications/templates`

Requires Bearer token. Lists app/form notification templates.

### PUT `/apps/:appType/notifications/templates/:code`

Requires app admin permission. Upserts an app/form notification template by code.

### POST `/apps/:appType/notifications/templates/preview`

Requires Bearer token. Body uses `templateCode` or `templateId` plus `payload`. The CLI command is `openxiangda notification preview <templateCode> --body-json '{"payload":{...}}'`.
If DingTalk is enabled, the response includes `dingding.cardPreview` with `resolvedCardTemplateId`, `cardParamMap`, `outTrackId`, `workNoticeContent`, `missingVariables`, and `warnings`.

### GET `/apps/:appType/notifications/dingtalk/capabilities`

Requires Bearer token. Returns whether the tenant DingTalk channel is enabled, whether app credentials/agent/default card template are configured, and supported delivery/card modes.

### POST `/apps/:appType/notifications/dingtalk/preview`

Requires Bearer token. Body can use a notification binding:

```json
{
  "notificationType": "reservation_reminder",
  "payload": {
    "title": "预约提醒"
  }
}
```

or a direct DingTalk config:

```json
{
  "config": {
    "deliveryMode": "card_preferred",
    "card": {
      "mode": "standard",
      "title": "{{title}}"
    }
  },
  "payload": {
    "title": "预约提醒"
  }
}
```

### POST `/apps/:appType/notifications/dingtalk/send`

Requires Bearer token. Sends the resolved `notificationType` through the DingTalk channel only. The CLI command is `openxiangda notification dingding-send <notificationType> --body-json '{"recipientId":"USER_ID","payload":{"title":"测试"}}' --force`.

### GET `/apps/:appType/notifications/type-configs`

Requires Bearer token. Lists notification type bindings.

### GET `/apps/:appType/notifications/type-configs/:notificationType`

Requires Bearer token. Resolves the active binding by notification type and optional `formUuid`.

### PUT `/apps/:appType/notifications/type-configs/:notificationType`

Requires app admin permission. Upserts a binding with `templateCode` or `templateId`.

## Organization

Organization APIs are app-scoped. List/detail operations accept `app:organization:read` or `app:organization:manage`; create/update/password operations require `app:organization:manage`. Platform admins pass through the same permission service. Runtime service principals are not accepted by themselves: trusted runtime calls must carry a real audit actor, and permission is checked against that user.

Use these endpoints for OpenXiangda app-managed platform departments and accounts. Do not use legacy `/user` or `/department` write endpoints for new app organization management.

### GET `/apps/:appType/organization/capabilities`

Requires Bearer token. Returns `canRead`, `canManage`, `readPermissionCode`, `managePermissionCode`, the compatibility `permissionCode`, and supported operations.

CLI:

```bash
openxiangda organization capabilities --json
```

### GET `/apps/:appType/organization/departments`

Requires `app:organization:read` or `app:organization:manage`. Lists platform departments in the current tenant.

### GET `/apps/:appType/organization/departments/:departmentId`

Requires `app:organization:read` or `app:organization:manage`. Returns one platform department.

### POST `/apps/:appType/organization/departments`

Requires `app:organization:manage`. Creates a platform department and runs existing org cache invalidation.

```json
{
  "name": "销售部",
  "parentId": "optional-parent-id",
  "externalId": "optional-external-id",
  "corpId": "optional-corp-id",
  "visibilityScope": "public",
  "memberViewScope": "self_and_children",
  "supervisorUserIds": ["user-1"]
}
```

CLI:

```bash
openxiangda organization department-create --body-json '{"name":"销售部"}' --force
```

### POST `/apps/:appType/organization/departments/:departmentId`

Requires `app:organization:manage`. Updates department metadata, visibility/member scopes, and supervisors.

### GET `/apps/:appType/organization/accounts`

Requires `app:organization:read` or `app:organization:manage`. Lists tenant platform accounts. Supports `ids`, `departmentIds`, `keyword`, `name`, `username`, `phone`, `email`, `jobNumber`, `page`, and `pageSize`.

### GET `/apps/:appType/organization/accounts/:userId`

Requires `app:organization:read` or `app:organization:manage`. Returns one platform account. Password, login failure counters, and lock fields are removed from the response.

### POST `/apps/:appType/organization/accounts`

Requires `app:organization:manage`. Creates a platform account.

```json
{
  "id": "optional-user-id",
  "username": "alice",
  "password": "initial-password",
  "name": "Alice",
  "phone": "13800000000",
  "email": "alice@example.com",
  "jobNumber": "E001",
  "departmentIds": ["dept-1"],
  "affiliatedDepartmentId": "dept-1",
  "validFrom": "2026-07-01T00:00:00.000Z",
  "validTo": null
}
```

### POST `/apps/:appType/organization/accounts/:userId`

Requires `app:organization:manage`. Updates account fields except password. If `password` is present, the request is rejected; use the dedicated password endpoint.

### POST `/apps/:appType/organization/accounts/:userId/password/reset`

Requires `app:organization:manage`. Resets the target account password, writes the existing sha512 password hash, and clears `failedLoginAttempts`, `lockUntil`, and `lockReason`.

```json
{
  "newPassword": "new-password"
}
```

CLI:

```bash
openxiangda organization account-reset-password user-1 --body-json '{"newPassword":"new-password"}' --force
```

### POST `/apps/:appType/organization/accounts/me/password/change`

Requires `app:organization:manage` for the current real user. Validates `oldPassword` before changing the current user's password.

```json
{
  "oldPassword": "old-password",
  "newPassword": "new-password"
}
```

### GET `/apps/:appType/workflows`

Requires Bearer token. Lists workflow definitions in the app. Supports `formUuid`, `isPublished`, `page`, and `pageSize` query parameters.

### POST `/apps/:appType/workflows`

Requires Bearer token. Creates a workflow definition draft for a form.

Body:

```json
{
  "formUuid": "FORM_XXX",
  "definitionJson": { "version": "v3", "nodes": [], "edges": [], "flowConfig": {} },
  "viewJson": {}
}
```

### POST `/apps/:appType/workflows/definition/validate`

Requires Bearer token. Validates workflow v3 JSON before saving or publishing.

### GET `/apps/:appType/workflows/:workflowId`

Requires Bearer token. Returns a workflow definition detail.

### PUT `/apps/:appType/workflows/:workflowId`

Requires Bearer token. Updates a workflow draft. If the workflow is already published, the backend creates a new unpublished version.

### POST `/apps/:appType/workflows/:workflowId/publish`

Requires Bearer token. Publishes the workflow definition. Pass `{ "isPublished": false }` to unpublish.

### DELETE `/apps/:appType/workflows/:workflowId`

Requires Bearer token. Deletes an unpublished workflow definition.

### GET `/apps/:appType/automations`

Requires Bearer token. Lists automations in the app. Supports `formUuid`, `isPublished`, `isEnabled`, `triggerType`, `keyword`, `page`, and `pageSize`.

### POST `/apps/:appType/automations`

Requires Bearer token. Creates an automation draft.

Body:

```json
{
  "name": "客户提交后通知",
  "description": "",
  "formUuid": "FORM_XXX",
  "triggerConfig": {
    "type": "form_data_submitted",
    "appType": "APP_XXX",
    "formUuid": "FORM_XXX",
    "enabled": true
  },
  "definitionJson": { "version": "v3", "nodes": [], "edges": [] },
  "viewJson": {}
}
```

### POST `/apps/:appType/automations/definition/validate`

Requires Bearer token. Validates automation designer-v3 JSON and optional trigger config.

### POST `/apps/:appType/automations/cron/validate`

Requires Bearer token. Validates a cron expression used by scheduled automations.

### GET `/apps/:appType/automations/:automationId`

Requires Bearer token. Returns automation detail.

### PUT `/apps/:appType/automations/:automationId`

Requires Bearer token. Updates automation draft metadata, trigger config, definition JSON, or view JSON. Published automations create a new draft version.

### POST `/apps/:appType/automations/:automationId/publish`

Requires Bearer token. Publishes an automation.

### POST `/apps/:appType/automations/:automationId/unpublish`

Requires Bearer token. Unpublishes and disables an automation.

### POST `/apps/:appType/automations/:automationId/enable`

Requires Bearer token. Enables a published automation.

### POST `/apps/:appType/automations/:automationId/disable`

Requires Bearer token. Disables an automation.

### DELETE `/apps/:appType/automations/:automationId`

Requires Bearer token. Deletes an unpublished automation.

### GET `/apps/:appType/automations/:automationId/versions`

Requires Bearer token. Lists versions in the same automation group.

### GET `/apps/:appType/automations/:automationId/executions`

Requires Bearer token. Lists execution records for diagnosis.

### GET `/apps/:appType/automations/:automationId/executions/:instanceId`

Requires Bearer token. Returns one execution record with raw `nodeExecutionLogs`, `triggerEventData`, `executionContext`, result, and error details for AI diagnosis.

### GET `/apps/:appType/roles`

Requires Bearer token and app role management permission for role-setting
operations. Lists app roles visible to the current user.

### POST `/apps/:appType/roles`

Requires Bearer token with `app:role:manage` on the app. Creates an app-scoped
role.

Body:

```json
{
  "code": "sales",
  "name": "销售",
  "description": ""
}
```

### GET `/apps/:appType/roles/:roleId`

Requires Bearer token. Returns app role detail.

### PUT `/apps/:appType/roles/:roleId`

Requires Bearer token with `app:role:manage` on the app. Updates app role
metadata.

### DELETE `/apps/:appType/roles/:roleId`

Requires Bearer token with `app:role:manage` on the app. Deletes a non-system
app role.

### GET `/apps/:appType/roles/:roleId/users`

Requires Bearer token. Lists users under an app role.

### POST `/apps/:appType/roles/:roleId/users`

Requires Bearer token with `app:role:manage` on the app. Adds users to an app
role.

### DELETE `/apps/:appType/roles/:roleId/users/:userId`

Requires Bearer token with `app:role:manage` on the app. Removes one user from
an app role.

When publishing role resources, OpenXiangda can also assign app-scoped API
permissions to the role:

```json
{
  "code": "campus_admin",
  "name": "校区管理员",
  "apiPermissionMode": "merge",
  "apiPermissionCodes": [
    "app:role:manage",
    "app:page-permission-group:manage",
    "app:form-permission-group:manage"
  ]
}
```

This is required when the role itself should create roles, assign role members,
or maintain permission groups. The first grant is normally done by a platform
administrator or an existing app role that already has `app:role:manage`.

### GET `/apps/:appType/page-permission-groups`

Requires Bearer token. Lists page permission groups.

### POST `/apps/:appType/page-permission-groups`

Requires Bearer token. Creates a page permission group.

Body:

```json
{
  "name": "销售可见页面",
  "roles": ["sales"],
  "platformRoleCodes": ["SCHOOL_TEACHER"],
  "menuFormUuids": ["FORM_XXX", "MENU_ID_FOR_CODE_PAGE"]
}
```

`platformRoleCodes` is optional. It matches synchronized platform identities in addition to
`roles` (OR semantics): `SCHOOL_GUARDIAN`, `SCHOOL_STUDENT`, and `SCHOOL_TEACHER`. Both arrays
empty means unrestricted. These three system roles are maintained by the daily DingTalk
school-contact sync and cannot be assigned through role-management APIs.

An empty `menuFormUuids` array means all menus/pages are visible to the matched roles. For form menus this field can contain form UUIDs. For custom code page menus, the editable permission group should contain the menu ID, which is what the platform permission editor uses for tree check state. OpenXiangda CLI resolves `--page-codes` / `--menu-codes` to an editable menu-ID group and creates a companion `（运行时别名）` group for required page ID, route key, and legacy `PAGE_...` runtime aliases by default. This keeps the main group editable while satisfying `/view` runtime guards. Use `--no-runtime-aliases` only for deployments whose runtime checks menu IDs directly.

### GET `/apps/:appType/page-permission-groups/:groupId`

Requires Bearer token. Returns page permission group detail.

### PUT `/apps/:appType/page-permission-groups/:groupId`

Requires Bearer token. Updates a page permission group.

### DELETE `/apps/:appType/page-permission-groups/:groupId`

Requires Bearer token. Deletes a page permission group.

### GET `/apps/:appType/page-permission-groups/user-menu-permissions`

Requires Bearer token. Returns the current user's menu visibility summary for the app,
including the synchronized `platformRoleCodes`.

### GET `/apps/:appType/forms/:formUuid/permission-groups`

Requires Bearer token. Lists form permission groups.

### POST `/apps/:appType/forms/:formUuid/permission-groups`

Requires Bearer token. Creates a form permission group.

Body:

```json
{
  "name": "销售查看",
  "type": "view",
  "roles": ["sales"],
  "platformRoleCodes": ["SCHOOL_GUARDIAN"],
  "dataScope": [{ "type": "self" }],
  "operations": ["view"],
  "fieldPermissions": [],
  "fieldAccessPolicy": {
    "defaultAccess": "edit",
    "fields": [{ "fieldId": "internalRemark", "access": "readonly" }]
  },
  "dataPermission": null
}
```

`fieldPermissions` is only the frontend display-default state. Use
`fieldAccessPolicy` for backend-enforced field access.

### GET `/apps/:appType/forms/:formUuid/permission-groups/:groupId`

Requires Bearer token. Returns form permission group detail.

### PUT `/apps/:appType/forms/:formUuid/permission-groups/:groupId`

Requires Bearer token. Updates a form permission group.

### DELETE `/apps/:appType/forms/:formUuid/permission-groups/:groupId`

Requires Bearer token. Deletes a form permission group.

### GET `/apps/:appType/forms/:formUuid/permission-summary`

Requires Bearer token. Returns the merged current-user view permission summary for a form.

### GET `/apps/:appType/forms/:formUuid/field-permissions`

Requires Bearer token. Returns merged current-user field permissions for a form.

### GET `/apps/:appType/pages`

Requires Bearer token. Returns code page definitions.

### POST `/apps/:appType/pages/manifest/import`

Requires Bearer token. Imports an application-level code page manifest.

### GET `/apps/:appType/pages/releases`

Requires Bearer token. Returns application-level code page release summaries.

### POST `/apps/:appType/pages/releases/activate`

Requires Bearer token. Activates a release by `version` and `buildId`.

### POST `/apps/:appType/pages/publish`

Requires Bearer token. Publishes one or more code pages directly.

### POST `/apps/:appType/pages/:pageCode/publish`

Requires Bearer token. Publishes one code page directly, using `pageCode` as the stable logical key.

### GET `/apps/:appType/pages/:pageKey/bootstrap`

Requires Bearer token. Returns runtime bootstrap information for an existing code page.

### GET `/apps/:appType/snapshot`

Requires Bearer token. Returns app metadata, forms, menus, code page definitions, code page releases, and permission hints.

## Application Environments

Application environment APIs group two independent app identities under one logical application. They never copy resource IDs or business data between `preproduction` and `production`.

### POST `/environment-sets`

Creates a logical environment set and its first environment. The request includes `code`, `name`, `sourceRepositoryId`, and `initialEnvironment` (`kind`, `appType`, optional display/public URL and side-effect policy).

### GET `/environment-sets` and GET `/environment-sets/:code`

List environment sets or return one set with its bound environments.

### POST `/environment-sets/:code/environments`

Binds the missing `preproduction` or `production` app identity. An appType can belong to only one environment, and one set can contain at most one environment of each kind.

### POST `/environment-sets/:code/environments/swap-roles`

Atomically exchanges the roles of the two existing app identities during an explicitly confirmed commissioning/reclassification operation. The request requires `confirmation=SWAP_PREPRODUCTION_AND_PRODUCTION` and a reason. Application data and Release Heads stay with their appType; local target resources are remapped by appType. Existing side-effect restrictions remain unless the request explicitly supplies replacement policies.

### POST `/environment-sets/:code/environments/:kindOrId/policy`

Updates only one environment's side-effect policy. The request requires `expectedRevision`, `reason`, and a strictly validated `sideEffectPolicy` patch; `fullReplace=true` is the only way to replace rather than merge. Production additionally requires `confirmProduction=true`. A successful transaction increments that environment revision and writes a durable audit containing actor, environment identity, reason, and secret-free before/after policies. It does not change either environment role, business data, or any App/Runtime/Backend/Page/Workflow Release Head. `externalDingTalkDepartmentRootId` accepts a string or safe integer and is stored as a string. `organizationWrites=explicit_capability_only` still requires the normal `app:organization:manage` permission.

### GET `/environment-sets/:code/status`

Returns each target's active heads, latest deployment, side-effect policy, and candidate drift state for the local Developer Center.

### POST/GET `/environment-sets/:code/candidates`

Creates an immutable sealed candidate or lists candidate history. Reusing an existing candidate ID/hash is idempotent only when the canonical source revision, source bundle manifest, test-plan hash, and OpenXiangda version are identical.

### POST/GET `/environment-sets/:code/deployments`

Creates or lists a `deploy`, `promotion`, or `rollback` record. Promotion requires a successful, non-drifted preproduction deployment of the same candidate with fresh passing evidence. A target environment admits one `running` or evidence-pending `deployed` record at a time and returns `APP_DEPLOYMENT_QUEUE_BUSY` with the current deployment ID/status for coordinator polling; rollback may proceed after activation even when the superseded deployment is still awaiting evidence.

### GET `/environment-sets/:code/deployments/:deploymentId`

Returns a deployment and its exact candidate/environment/AppRelease/evidence binding.

### POST `/environment-sets/:code/deployments/:deploymentId/complete`

Completes a deployment only when the canonical evidence hash matches and the evidence binds the exact deployment, environment, appType, AppRelease, candidate, and test plan. Required gates must be `passed` or `not_applicable`; preproduction cleanup must pass with zero residue; evidence validity cannot exceed 24 hours.

### POST `/environment-sets/:code/deployments/:deploymentId/fail`

Records a failed deployment without changing an active application head.

## Storage Configs

Storage config APIs manage application-level custom upload targets. The first provider is Aliyun OSS.

### GET `/apps/:appType/storage-configs`

Requires Bearer token and storage-config manage permission. Lists storage configs.

### POST `/apps/:appType/storage-configs`

Requires Bearer token and storage-config manage permission. Creates or upserts a storage config.

Body:

```json
{
  "code": "evaluate_oss",
  "name": "Evaluate OSS",
  "provider": "oss",
  "status": "active",
  "configJson": {
    "region": "oss-cn-hangzhou",
    "bucket": "evaluate-oss",
    "publicBaseUrl": "https://evaluate-oss.oss-cn-hangzhou.aliyuncs.com",
    "pathPrefix": "openxiangda/{{appType}}/{{yyyy}}/{{MM}}/{{dd}}",
    "allowedExtensions": ["txt", "pdf", "png"],
    "cors": {
      "managed": true,
      "allowedOrigins": ["https://platform.example.com"],
      "allowedMethods": ["PUT", "GET", "HEAD"],
      "allowedHeaders": ["content-type", "x-oss-*"],
      "exposeHeaders": ["ETag", "x-oss-request-id"],
      "maxAgeSeconds": 600
    }
  },
  "credentials": {
    "accessKeyId": "resolved at publish time",
    "accessKeySecret": "resolved at publish time"
  }
}
```

When `configJson.cors.managed` is true, the backend attempts to merge the required OSS bucket CORS rule after saving the storage config. The response may include `corsStatus`; `applied: false` means the storage config was saved but the OSS credentials could not manage bucket CORS.

### GET `/apps/:appType/storage-configs/:code`

Requires Bearer token and storage-config manage permission. Returns the storage config with credential status only, never plaintext AK/SK.

### PUT `/apps/:appType/storage-configs/:code`

Requires Bearer token and storage-config manage permission. Updates the storage config. Omit `credentials` to keep the existing encrypted credentials.

### DELETE `/apps/:appType/storage-configs/:code`

Requires Bearer token and storage-config manage permission. Deletes the storage config metadata; it does not delete existing OSS objects.

### POST `/apps/:appType/storage-configs/:code/cors/apply`

Requires Bearer token and storage-config manage permission. Re-applies the declared managed CORS rule for an existing config.

### POST `/apps/:appType/storage-configs/:code/uploads/initiate`

Requires Bearer token. Creates a short-lived signed OSS upload URL for browser direct upload.

### POST `/apps/:appType/storage-configs/:code/objects/delete`

Requires Bearer token. Deletes an OSS object under the configured `pathPrefix`.
## Inbound Webhook

- Management: `GET|POST /openxiangda-api/v1/apps/:appType/webhooks`
- Detail/update/disable: `GET|POST|PUT|DELETE /openxiangda-api/v1/apps/:appType/webhooks/:code`
- Delivery list/detail: `GET /openxiangda-api/v1/apps/:appType/webhooks/:code/deliveries[/:deliveryId]`
- Public callback: `POST /openxiangda-webhooks/v1/:endpointId`

The public `endpointId` resolves tenant/application ownership and is never
replaced with `appType`. Management calls use normal profile authentication;
the public callback is unauthenticated at the platform edge and the target
Function must verify the provider signature from the exact raw body. See
`webhooks.md` for the declaration and runtime envelope.
