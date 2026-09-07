# OpenXiangda Resources And Connectors

`src/resources/` is the local manifest root for app resources that should be recreated idempotently across profiles.

`.openxiangda/state.json` keeps only profile-local platform IDs and runtime aliases. Business configuration and connector secrets belong in `src/resources/`, not state.

Supported resource folders:

- `src/resources/connectors/*.json`
- `src/resources/roles/*.json`
- `src/resources/menus/*.json`
- `src/resources/workflows/*.json`
- `src/resources/automations/*.json`
- `src/resources/data-views/*.json`
- `src/resources/auth/*.json`
- `src/resources/storage/*.json`
- `src/resources/routes/*.json`
- `src/resources/public-access/*.json`
- `src/resources/permissions/page-groups/*.json`
- `src/resources/permissions/form-groups/*.json`
- `src/resources/settings/forms/*.json`

Run:

```bash
openxiangda resource validate --profile dev
openxiangda resource plan --profile dev
openxiangda resource publish --profile dev
```

`workspace publish` builds and registers workspace forms/pages first, then runs resource upsert. Publishing is non-destructive by default. Pass `--prune` explicitly to `resource publish` or `workspace publish` to delete platform resources that are no longer declared by local manifests.

Workflow resources should use semantic DSL source files whenever possible. Put `workflowFile` in `src/resources/workflows/<code>/workflow.json`, implement `src/workflows/<code>/workflow.ts` with `defineWorkflow`, and run `openxiangda workflow compile <workflow.ts> --check` before publishing. Custom React pages can render workflow operations outside the built-in process detail route with `useProcessCapabilities`, `useProcessActions`, `ProcessActionBar`, and `ProcessTimeline` from `openxiangda/runtime/react`.

For the full AI-facing workflow playbook, read `openxiangda-skills/references/workflow-v3.md` before implementing. It includes:

- an end-to-end cookbook for draft save -> start existing instance -> return to initiator -> resubmit -> final approval;
- a capability action table that maps `approve`, `reject`, `transfer`, `return`, `save`, `withdraw`, `resubmit`, `callback`, `retryException`, and `adminTransfer` to SDK methods, required IDs, and common params;
- troubleshooting rules for `instanceId` versus `taskId`, return candidates, draft workflow rows, and refresh hints.

When a business page must save data first and start approval later, keep the existing form instance and explicitly start the workflow in place:

```tsx
await sdk.process.startFromExistingInstance({
  formUuid: "FORM_xxx",
  formInstId: draftFormInstId,
  updateFormDataJson: JSON.stringify(finalValues),
  submissionDepartmentId,
  selectedApprovers,
});
```

For a standard form carrier, use:

```tsx
<StandardFormPage
  schema={schema}
  mode="submit"
  formInstanceId={draftFormInstId}
  submitBehavior="start-existing-process"
/>
```

Do not work around delayed approval by creating a new process instance from copied draft data and deleting the old draft. The platform guards against duplicate starts for the same `formInstId`, and the current operator is used as the workflow initiator.

## Auth

Auth resources configure application-level login methods and are published with the same resource workflow.

```json
{
  "code": "default",
  "name": "Default App Login",
  "status": "active",
  "configJson": {
    "methods": [
      { "type": "password", "enabled": true, "label": "账号密码" },
      { "type": "dingtalk", "enabled": true, "label": "钉钉登录", "flow": "auto" },
      {
        "type": "phone_code",
        "enabled": true,
        "label": "手机号验证码",
        "provider": { "functionCode": "auth_phone_code" },
        "ttlSeconds": 300,
        "sendFrequencySeconds": 60,
        "maxAttempts": 5
      }
    ],
    "registration": { "mode": "reject" },
    "binding": { "mode": "auto" },
    "matching": {
      "keys": ["phone", "email", "externalId", "unionId", "jobNumber", "username"]
    }
  }
}
```

React SPA workspaces include `/view/:appType/login` by default. Custom login pages can use:

```ts
import { createAuthClient } from "openxiangda/runtime"

const auth = createAuthClient({ appType, servicePrefix: "/service" })

async function startDingTalkLogin() {
  const { loginUrl } = await auth.getDingTalkOAuthUrl({
    returnUrl: `/view/${encodeURIComponent(appType)}/admin`,
  })
  window.location.assign(loginUrl)
}

const sent = await auth.sendPhoneCode({ phone, purpose: "login" })
await auth.phoneCodeLogin({ phone, code, challengeId: sent.challengeId })
```

With DingTalk `flow: "auto"`, `LoginPage` uses JSAPI only inside a confirmed DingTalk container and starts platform-managed browser OAuth everywhere else. Custom pages pass only a current-app `/view/:appType/*` return URL; the platform owns the authorization URL, callback, one-time state, cookie, and tokens.

Phone-code and custom login providers are App Functions. They validate external credentials and return identity assertions only. They must not issue tokens, set cookies, or write platform user/binding tables; the platform auth service performs account match, bind/create/reject, role assignment, and token issuance.

## Storage

Storage resources define application-level custom upload targets. The first supported provider is Aliyun OSS. Use them when an `AttachmentField` should store the real OSS URL instead of a platform private-file URL.

`src/resources/storage/<code>.json`:

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
    "maxFileSizeMb": 20,
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
    "accessKeyId": "${APP_OSS_ACCESS_KEY_ID}",
    "accessKeySecret": "${APP_OSS_ACCESS_KEY_SECRET}"
  }
}
```

Credential values in local manifests must be environment references, not literal AK/SK values. `resource publish` resolves the environment variables locally and sends them to the platform backend, where they are stored encrypted. `resource pull` writes only `credentialStatus`, so pulled files can be committed safely after review.

Set `configJson.cors.managed` to `true` when OpenXiangda should also apply the bucket CORS rule needed for browser direct upload. This is a bucket-level OSS operation: the backend reads existing CORS rules, preserves unrelated rules, and appends or updates the rule for the declared origins. If the OSS credentials do not allow `GetBucketCors`/`PutBucketCors`, the storage config is still saved and the publish response includes `corsStatus.applied: false`.

Reference the storage code on an attachment field:

```tsx
<AttachmentField
  fieldId="attachments"
  label="附件"
  uploadProvider="oss"
  storageCode="evaluate_oss"
/>
```

`ImageField` can use the same storage config:

```tsx
<ImageField
  fieldId="photos"
  label="照片"
  uploadProvider="oss"
  storageCode="evaluate_oss"
  imageCompression={{ enabled: true }}
/>
```

OSS uploads call the platform only to create a short-lived signed upload URL, then the browser uploads directly to OSS. Saved file values include `provider`, `storageCode`, and the real OSS URL. Preview and download use that URL directly and do not request a platform file ticket. Fields without `uploadProvider` or `storageCode` keep the original platform upload path.

`AttachmentField` and `ImageField` both support `imageCompression`. It is browser-side compression for image files only: the original image is uploaded first, then optional `thumb` and `preview` variants are uploaded with the same provider and stored under `thumbUrl`, `previewUrl`, and `variants`. Non-image files, GIF, SVG, files below `skipBelowBytes`, and browsers without canvas compression support continue with the original upload only. The default output format is `source`; if you set `format: "webp"` or another explicit format, make sure `configJson.allowedExtensions` includes that extension.

## Public Access

React SPA 新应用的公开访问入口是 `/view/:appType/public/*`。不要为新应用生成旧 `?publicAccess=guest` 链接；该 query 只保留给旧 `sy-lowcode-view` 兼容。

公开访问由两个资源组成：

- `src/resources/routes/*.json`：声明应用路由、`pathPattern`、`publicAccess` 和关联 policy。
- `src/resources/public-access/*.json`：声明公开策略、外部角色、ticket/rateLimit 和 form/dataView/function/connector grant。

Route:

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

Policy:

```json
{
  "code": "public_register",
  "name": "公开报名入口",
  "mode": "guest",
  "routeCode": "public.register",
  "pathPattern": "/view/:appType/public/register",
  "externalRoleCodes": ["external_visitor"],
  "grants": {
    "forms": ["registration_form"],
    "dataViews": ["public_registration_lookup"],
    "functions": ["submit_public_registration"],
    "connectors": ["sms.sendCode"]
  }
}
```

`grants.forms` 可以写本地 `formCode`；`openxiangda resource publish` 会解析成当前 profile 的真实 `formUuid` 后再调用后端。`dataViews`、`functions` 使用资源 code；`connectors` 使用 `connectorCode.apiCode`，也可 grant 整个 `connectorCode`。

公开 guest 默认不能访问任何 form、dataView、function、connector。只有 policy 中显式 grant 的资源才可访问，并且仍要命中对应表单权限组、dataView 权限组等后端权限。公开页面建议创建虚拟外部角色码，例如 `external_visitor`，并在 page/form/dataView 权限组中使用同一角色码。

公开页面展示的文件不要一概走私有附件接口。对设计上本来就可以公开的资产，例如门户 banner、仪器封面图、公开说明书，可以上传到平台公开文件区，默认 bucket 为 `public-assets`。公开资产上传仍需要登录态和页面权限，但读取 URL 为 `/file/public/...`，未登录浏览器可以直接访问。订单报告、结算附件、维保照片、审批材料等仍应留在私有 bucket，通过登录态或受控文件票据访问。

```ts
import { createFormRuntimeApi } from "openxiangda"

const api = createFormRuntimeApi({ baseUrl: "/service" })
const uploaded = await api.uploadPublicFile(file, "public-assets")
// uploaded.url / uploaded.previewUrl / uploaded.downloadUrl 指向 /file/public/...
```

Ticket 模式用于敏感公开入口：

```json
{
  "code": "public_score_lookup",
  "mode": "ticket",
  "routeCode": "public.scoreLookup",
  "pathPattern": "/view/:appType/public/score",
  "externalRoleCodes": ["external_ticket_holder"],
  "ticketConfig": { "ttlSeconds": 1800, "singleUse": true },
  "grants": { "dataViews": ["public_score_lookup"] }
}
```

Ticket 默认 `singleUse: true`，首次换取 public session 后立即失效；只有明确配置 `singleUse: false` 的场景才允许复用。

React:

```tsx
import {
  OpenXiangdaPageProvider,
  OpenXiangdaProvider,
  PublicAccessGate,
} from "openxiangda/runtime/react"

const PublicLoading = () => <div role="status">正在进入公开页面</div>
const PublicAccessError = ({ error }: { error: { message?: string } }) => (
  <div role="alert">{error.message || "公开链接不可用或已过期"}</div>
)

export function PublicRoute() {
  return (
    <OpenXiangdaProvider appType={appType} servicePrefix="/service">
      <OpenXiangdaPageProvider>
        <PublicAccessGate
          errorFallback={error => <PublicAccessError error={error} />}
          fallback={<PublicLoading />}
          policyCode="public_register"
          routeCode="public.register"
        >
          <PublicRegisterPage />
        </PublicAccessGate>
      </OpenXiangdaPageProvider>
    </OpenXiangdaProvider>
  )
}
```

React SPA 路由树必须有 `OpenXiangdaPageProvider`。`PublicAccessGate` 会把 scoped public token 写入 runtime provider，但不会提供 `usePageSdk()` 所需的 PageProvider；缺少时页面会抛出 `usePageSdkStore 必须在 PageProvider 内使用`。公开页面必须给 `PublicAccessGate` 配 `fallback` 和 `errorFallback`，避免慢网、缺 ticket、ticket 过期时出现空白页。

Standalone client:

```ts
import { createPublicAccessClient } from "openxiangda/runtime"

const publicAccess = createPublicAccessClient({ appType, servicePrefix: "/service" })
await publicAccess.startSession({
  policyCode: "public_register",
  routeCode: "public.register",
  path: window.location.pathname,
  ticket: new URLSearchParams(window.location.search).get("ticket") || undefined,
})
```

公开访问和黑盒验证脚本必须检查 JSON envelope。不能只看 `response.ok` 或 HTTP 200；`code: "PUBLIC_GRANT_DENIED"` 是失败响应。成功条件应限定为 `code === 200`、`code === "200"` 或兼容成功码 `0`，且不能有 `success: false`。

## Data Views

Data views are read-only query resources managed by OpenXiangda. They can be materialized PostgreSQL views (`storageMode: "materialized"`, the default) or live logical views (`storageMode: "live"`). Define them when a page, automation, or report repeatedly needs the same joined data from multiple forms.

Use a data view when:

- A list, dashboard, or detail page needs fields from two or more forms, such as ticket plus customer, order plus product, project plus member, or contract plus payment records.
- Several pages or automations need the same joined shape and should share one source of truth.
- For materialized mode, query performance matters more than source-table freshness, and a manual or scheduled refresh delay is acceptable.
- For live mode, source-table changes must appear immediately and the query shape/data volume is bounded.
- You need stable output aliases, field-level permissions, row-level conditions, and indexes on commonly filtered materialized columns.

Do not use a data view when:

- The page only needs one form. Use `sdk.form.advancedSearch` or `DataManagementList`.
- The only need is a simple select option from one form. Use `optionSource.type: "linkedForm"`.
- The user must create, update, or delete source records through this resource. Data views are read-only.
- The UI must show source-table changes immediately after every write and the query is too heavy for live mode.
- You need raw SQL, incremental refresh, source-table trigger refresh, write-back, ad-hoc BI, pivot, or window-function analysis. Data views expose declared row and aggregate query shapes only.

Data view manifests live in `src/resources/data-views/*.json`. Use logical `formCode` values in source files. `openxiangda resource publish` resolves them to profile-local `formUuid` values before calling the platform.

Example:

```json
{
  "code": "ticket_with_customer",
  "name": "Ticket With Customer",
  "storageMode": "materialized",
  "base": { "formCode": "service_ticket", "alias": "ticket" },
  "joins": [
    {
      "type": "left",
      "formCode": "customer",
      "alias": "customer",
      "on": [
        {
          "left": "ticket.customer.value",
          "op": "=",
          "right": "customer.form_instance_id"
        }
      ]
    }
  ],
  "select": [
    { "field": "ticket.form_instance_id", "as": "ticketId" },
    { "field": "ticket.title", "as": "ticketTitle" },
    { "field": "customer.name", "as": "customerName" }
  ],
  "indexes": [{ "fields": ["ticketId"], "unique": true }],
  "refresh": { "mode": "scheduled", "cron": "0 */10 * * * *" },
  "permissionGroups": [
    {
      "code": "ticket_query",
      "name": "Ticket Query",
      "roles": ["manager"],
      "operations": ["query"]
    }
  ]
}
```

### Definition Fields

- `code`: stable resource code. Use lowercase snake_case.
- `name` and `description`: human-readable metadata.
- `storageMode`: `"materialized"` by default, or `"live"` for real-time logical-view queries. `live` does not create a materialized view, ignores `indexes`, and cannot be refreshed.
- `base`: primary form source. Use `{ "formCode": "...", "alias": "..." }`.
- `joins`: optional joined form sources. v1 supports `left` and `inner`.
- `joins[].on`: join conditions. Use field references on both sides and operators `=`, `!=`, `<>`, `>`, `>=`, `<`, `<=`.
- `select`: output fields. Every output needs an explicit `as` alias. Runtime filters, sorting, field permissions, indexes, and SDK `fields` all use these aliases.
- `where`: optional source-level filter applied while building the declared query. Source-level filters use source aliases, for example `ticket.status`.
- `indexes`: indexes created on output aliases in the materialized view. Add indexes for fields commonly filtered or sorted in pages.
- `refresh`: `{ "mode": "manual" }` or `{ "mode": "scheduled", "cron": "0 */10 * * * *" }`.
- `permissionGroups`: role-based runtime access for `query` and optional `refresh`.

Field references are `alias.field`. System fields such as `form_instance_id`, `created_at`, `updated_at`, `created_by`, and `tenant_id` can be selected directly. JSON option-like fields that store `{ label, value }` can use `.value` or `.label`, for example `ticket.customer.value`.

Join example for a linked customer field:

```json
{
  "left": "ticket.customer.value",
  "op": "=",
  "right": "customer.form_instance_id"
}
```

Source-level `where` example:

```json
{
  "logic": "AND",
  "rules": [
    { "field": "ticket.status", "operator": "in", "value": ["open", "processing"] },
    { "field": "customer.name", "operator": "isNotEmpty" }
  ]
}
```

Supported filter operators are `=`, `!=`, `<>`, `>`, `>=`, `<`, `<=`, `contains`, `notContains`, `in`, `isEmpty`, and `isNotEmpty`, with aliases such as `eq`, `neq`, `gte`, `lte`, `like`, `is_null`, and `is_not_null`.

### Permissions

Management APIs require `app:data-view:manage`. Runtime page queries use the data view's own permission groups.

Permission group fields:

- `code`: stable permission group code.
- `roles`: app role codes. Empty or omitted roles match all logged-in users, so use this deliberately.
- `operations`: `query` and/or `refresh`. Omitted operations default to `query`.
- `fieldPermissions`: optional output field visibility. Missing or empty field permissions mean all output fields are visible. If several groups match, field access is most permissive: a field is visible if any matched group allows it.
- `dataPermission`: optional row condition over output aliases. If several matched groups define row conditions, they are ORed. If any matched group has no row condition, rows are unrestricted.

Example with field and row limits:

```json
{
  "code": "sales_ticket_query",
  "name": "Sales Ticket Query",
  "roles": ["sales"],
  "operations": ["query"],
  "fieldPermissions": [
    { "field": "ticketId", "value": "VIEW" },
    { "field": "ticketTitle", "value": "VIEW" },
    { "field": "customerName", "value": "VIEW" }
  ],
  "dataPermission": {
    "rules": [
      { "field": "ownerId", "operator": "=", "value": "${currentUserId}" }
    ]
  }
}
```

### Publishing And Diagnostics

Run the normal resource workflow:

```bash
openxiangda resource validate --profile dev
openxiangda resource plan --profile dev
openxiangda resource publish --profile dev
openxiangda resource pull --profile dev
```

`resource plan` compares the definition, `storageMode`, refresh config, and local `permissionGroups` when permission groups are declared. `resource publish` creates or updates the platform metadata, builds materialized views when needed, applies permission groups, and stores profile-local IDs in `.openxiangda/state.json`.

Use diagnostic commands after publishing:

```bash
openxiangda data-view list --profile dev
openxiangda data-view status ticket_with_customer --profile dev
openxiangda data-view refresh ticket_with_customer --profile dev
openxiangda data-view query ticket_with_customer --profile dev --fields ticketId,customerName
openxiangda data-view query ticket_with_customer --profile dev --query-json query.json
```

`status` returns `storageMode`, refresh status, row count, `lastRefreshedAt`, `nextRefreshAt`, and the materialized view name for administrators. Scheduled refreshes are based on cron for materialized views. Failed scheduled views retry on their next due time; manual refresh is available for diagnosis or after bulk imports. Live views return `lastRefreshedAt: null` and reject refresh requests because every query is current.

### Runtime Query

Pages query data views through the runtime SDK. The SDK calls `/:appType/v1/data-views/:code/query.json` and returns `{ data, totalCount, currentPage, pageSize, storageMode, lastRefreshedAt }`.

```ts
const tickets = await sdk.dataView.query("ticket_with_customer", {
  fields: ["ticketId", "ticketTitle", "customerName"],
  filters: [
    { field: "customerName", operator: "contains", value: "Acme" },
  ],
  order: [{ field: "ticketTitle", isAsc: "y" }],
  currentPage: 1,
  pageSize: 20,
})
```

Runtime filters and sorting can only reference output aliases. If `fields` contains an unknown output alias, the platform rejects the query instead of falling back to all fields.

You can also expose a data view through a page data source descriptor and use `sdk.dataSource.run()`:

```ts
// page config
export default {
  dataSources: [
    {
      key: "tickets",
      type: "dataView.query",
      code: "ticket_with_customer",
      fields: ["ticketId", "ticketTitle", "customerName"],
      defaultFilter: [
        { field: "ticketTitle", operator: "isNotEmpty" }
      ]
    }
  ]
}

// page code
const result = await sdk.dataSource.run("tickets", {
  filters: [
    { field: "customerName", operator: "contains", value: keyword }
  ],
  currentPage: 1,
  pageSize: 20,
})
```

Common query JSON for the CLI:

```json
{
  "fields": ["ticketId", "ticketTitle", "customerName"],
  "filters": [
    { "field": "customerName", "operator": "contains", "value": "Acme" }
  ],
  "conditionType": "AND",
  "order": [{ "field": "ticketTitle", "isAsc": "y" }],
  "currentPage": 1,
  "pageSize": 20
}
```

Troubleshooting tips:

- If `formCode 未绑定` appears during publish, publish or bind the source forms first so `.openxiangda/state.json` contains their `formUuid`.
- If a join returns empty customer fields, confirm whether the source form field stores a scalar value or `{ label, value }`; option-like fields usually need `.value`.
- If query results are stale on a materialized view, check `lastRefreshedAt` and run `openxiangda data-view refresh <code>`. Live views do not refresh.
- If a user sees no rows or fields, inspect matching `permissionGroups`, role codes, `fieldPermissions`, and `dataPermission`.
- If page filters fail, ensure they use output aliases such as `customerName`, not source references such as `customer.name`.

## App Functions

App Functions are code-first backend functions for reusable server-side logic. Put source in `src/functions/<functionCode>/index.ts` and manifest in `src/resources/functions/<functionCode>.json`.

```json
{
  "code": "reservation_reminder_summary",
  "name": "Reservation Reminder Summary",
  "resources": {
    "forms": ["reservation_order", "operation_log"],
    "dataViews": ["instrument_public_catalog"]
  },
  "definitionJson": {
    "kind": "app_function",
    "version": "function_v1",
    "runtimeMode": "trusted_node",
    "sourceType": "file_snapshot",
    "runtimeInvoke": {
      "audience": {
        "type": "page_permission_group",
        "resourceCodes": ["member_portal_pages"]
      }
    },
    "sourceFile": {
      "localPath": "../../functions/reservation_reminder_summary/index.ts"
    }
  },
  "status": "active"
}
```

During publish, the CLI resolves `resources.forms` through the current profile's `.openxiangda/state.json` and writes `resourceBindings` into `definitionJson`. Runtime code should use logical form codes, for example `ctx.resources.resolveForm("reservation_order")`, `ctx.form.queryMany({ formCode: "reservation_order" })`, or `ctx.form.getById({ formCode: "reservation_order", formInstId })`, instead of hard-coded `FORM_...` IDs. Connector aliases can be declared in `resources.connectors` and called with `ctx.connector.call("crm.searchCustomer", { query: { keyword } })`.

`ctx.form.createOne/updateOne/updateById` are trusted backend writes. Their boundary is the function manifest's `resources.forms` binding plus function invocation authorization, not the page user's direct submit permission on the target form. Use this for controlled multi-form writes such as signup, check-in, benefit choices, and workflow-side mutations; do not grant normal users raw submit permission to internal forms just to make a function write work.

Functions can be invoked by automation/workflow `function_call` nodes, custom pages with `sdk.function.invoke(code, { input })`, or directly through `/:appType/v1/functions/:code/invoke.json`. The runtime exposes controlled platform APIs including `ctx.form.queryOne/queryMany/getById/createOne/updateOne/updateById`, `ctx.files.readAsBase64`, and the App Function-only workflow bridge `ctx.process.startFromExistingInstance/resolveCapabilities/resubmitTask/withdraw/transferTask`; it does not expose raw SQL or Redis. `ctx.files.readAsBase64` accepts an attachment already present in the invocation's `ctx.formData`, or a server-verified `{ formCode/formUuid, formInstId/formInstanceId, fieldId, attachmentId/index }` reference. It reads platform MinIO, app OSS, and platform OSS without forwarding a browser session, rejects arbitrary URLs and non-image objects, and limits decoded files to 10 MiB. Do not log, return, or persist the resulting Base64; pass it directly to the downstream image/OCR API. Process calls are restricted to the current app and declared `resources.forms`, and run through the official workflow services with the real operator's task permissions, operation log, events, and replay behavior. Direct runtime API calls require app automation management permission by default. If a normal page user must call the function, declare `definitionJson.runtimeInvoke.audience` with `authenticated`, `page_permission_group`, `app_roles`, or `scope_policy`; `runtimeInvoke.roleCodes` is only for current app-role grants and does not support `"*"` or `"all-app-roles"`. Automation/workflow calls run in a server-controlled context.

For server-side business authorization, read trusted role context from the runtime instead of accepting role codes from page input:

```ts
import type { AppFunctionContext } from "openxiangda/runtime";

export default async function run(ctx: AppFunctionContext, input: unknown) {
  const roleCodes = ctx.operator?.roleCodes || ctx.permissions?.roleCodes || [];
  const currentRoleCode =
    ctx.operator?.currentRoleCode || ctx.permissions?.currentRoleCode;
  const hasFullAccess =
    ctx.operator?.hasFullAccess === true || ctx.permissions?.hasFullAccess === true;
}
```

`ctx.operator`, `ctx.currentUser`, and `ctx.permissions` include `roleCodes`, `currentRoleCode`, `currentRoleName`, `hasFullAccess`, `isAppAdmin`, and `isPlatformAdmin` for runtime page invocations. Treat page-provided role fields as untrusted hints only.

## Connectors

Connector example:

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

Page runtime usage:

```ts
const response = await sdk.connector.call("crm.getCustomer", {
  body: { keyword: "Acme" },
})

const file = await sdk.connector.download({
  connector: "crm",
  api: "exportCustomers",
  body: { status: "active" },
})
```

Secrets may live in internal manifests when that is acceptable for the deployment, but the SDK only calls platform runtime endpoints: `/:appType/v1/connectors/actions/invoke` for normal responses and `/:appType/v1/connectors/actions/download` for binary downloads. Third-party domains and API keys are never placed in the page bundle.
