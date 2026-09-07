# Connector Resources

OpenXiangda engineering resources live under `src/resources/`.

Common folders:

- `connectors`
- `notifications`
- `roles`
- `menus`
- `workflows`
- `automations`
- `data-views`
- `functions`
- `auth`
- `permissions/page-groups`
- `permissions/form-groups`
- `settings/forms`

Commands:

```bash
openxiangda resource validate --profile dev
openxiangda resource plan --profile dev
openxiangda resource publish --profile dev
openxiangda resource pull --profile dev
```

Connector manifests use stable `code` values. The platform maps connector `code` to the existing connector `methodName`, and API `code` to the existing connector API `methodName`.

Notification manifests live under `src/resources/notifications/` and contain `templates` plus `typeConfigs`. See `notifications.md` before generating reminders or message templates.

Data view manifests live under `src/resources/data-views/` and define read-only joined or aggregate query resources. Use `storageMode: "materialized"` for refreshed lists/reports where lag is acceptable, and `storageMode: "live"` for bounded real-time query shapes. Use row views with `sdk.dataView.query` and aggregate views with `sdk.dataView.stats`. Before generating one, confirm freshness tolerance, query bounds, and indexes for materialized filters/sort fields/dimensions/date buckets. Do not use them for single-form CRUD, simple linkedForm selects, writes, write-back, or ad-hoc BI. See `data-views.md` before generating one.

App Function manifests live under `src/resources/functions/`, with source in `src/functions/<functionCode>/index.ts`. Use them for reusable server-side logic that pages, automations, and workflows can share through `sdk.function.invoke` or `function_call` nodes. App Functions expose controlled runtime helpers such as `ctx.resources`, `ctx.form.queryOne/queryMany/getById/createOne/updateOne/updateById`, `ctx.process.startFromExistingInstance/resolveCapabilities/resubmitTask/withdraw/transferTask`, `ctx.dataView`, `ctx.connector`, `ctx.notification`, `ctx.organization`, `ctx.platform.roles`, and `ctx.platform.api`; they do not expose raw SQL or Redis in the current MVP. Published trusted code may use all application-owned Forms/DataViews in the current tenant/app. Function `resources` remains optional code-to-ID mapping and audit metadata, while cross-app/cross-tenant access stays forbidden. Use `ctx.platform.roles.list/findByCode/addUsers/removeUser` for app role lookup and membership changes; raw `ctx.platform.api` returns an HTTP response plus platform envelope. Runtime page invocations also expose trusted role context on `ctx.operator.roleCodes`, `ctx.operator.platformRoleCodes`, `ctx.operator.currentRoleCode`, `ctx.operator.hasFullAccess`, `ctx.currentUser`, and `ctx.permissions`; `platformRoleCodes` contains the synchronized platform identities `SCHOOL_GUARDIAN`, `SCHOOL_STUDENT`, and `SCHOOL_TEACHER`, while `roleCodes` contains app roles. Use that context for business authorization, and never trust page-submitted role codes for sensitive actions. Page-call grants should use `definitionJson.runtimeInvoke.audience` (`authenticated`, `page_permission_group`, `app_roles`, `platform_roles`, or `scope_policy`); use `roleCodes` for current app-role grants and `platformRoleCodes` for synchronized identities. App Function form writes are trusted backend operations, not direct page-user submit access to the target form. For internal function-only forms, publish form settings with `runtimeWrite.mode="function_only"` so raw write endpoints are closed. App Function organization writes require `app:organization:manage` on the real operator/audit actor. Use JS_CODE V2 only for node-local workflow/automation scripts.

Auth manifests live under `src/resources/auth/`. Use them to enable app-level login methods and bind phone-code/CAS/custom providers to App Functions. Auth provider functions are called only by the platform auth flow. They validate external credentials and return identity assertions such as `phone`, `email`, `externalId`, or `unionId`; they must not issue tokens, set cookies, or mutate platform user/binding tables.

```json
{
  "code": "crm",
  "name": "CRM Service",
  "url": "https://crm.internal.example.com/api",
  "authType": "apiKey",
  "authConfig": {
    "apiKey": {
      "key": "X-API-Key",
      "value": "internal-secret",
      "in": "header"
    }
  },
  "userContext": {
    "enabled": true,
    "inject": [
      { "target": "header", "key": "X-User-Id", "value": "userId" },
      { "target": "body", "key": "operator", "value": "user" }
    ]
  },
  "apis": [
    {
      "code": "getCustomer",
      "name": "Get Customer",
      "method": "POST",
      "path": "/customers/search",
      "requestBodyType": "json",
      "responseType": "json"
    }
  ]
}
```

Runtime page code:

```ts
await sdk.connector.call("crm.getCustomer", {
  body: { keyword: "Acme" },
})
```

Do not put third-party domains or API keys in page source. The runtime page calls `/:appType/v1/connectors/actions/invoke` for normal responses and `/:appType/v1/connectors/actions/download` for binary downloads; the platform backend applies auth, user context, and redaction.
