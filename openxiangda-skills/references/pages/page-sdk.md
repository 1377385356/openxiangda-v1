# Page Runtime SDK

Use `openxiangda/runtime` for platform data access in code pages.

Guidelines:

- Do not hardcode `/openxiangda-api` calls inside end-user page components unless the page is explicitly an admin tool.
- Prefer SDK modules for form data, user context, permissions, and platform navigation.
- Use `sdk.dataView.query` for published read-only multi-form row data views. Use `sdk.dataView.stats` for aggregate data views declared with `viewType: "aggregate"`.
- Data views can be `storageMode: "materialized"` for refreshed report/list data or `storageMode: "live"` for bounded real-time joins. Page code calls the same SDK methods for both modes and should inspect `response.storageMode` / `response.lastRefreshedAt` when freshness is visible to users.
- Data view runtime queries can filter, sort, paginate, and select only output aliases.
- Keep data view page calls paginated and field-scoped. Runtime filters/order should use aliases that the data view indexes, especially for aggregate dimensions and date buckets.
- Runtime data view filters may use `{ key, operator, value }` or `{ field, operator, value }`. Prefer `key` in new page code to match search-expression style.
- If a data view exposes a full option-like JSON field, runtime string `EQ` and `IN` filters can match it for compatibility. New pages should prefer scalar output aliases such as `statusValue` or `statusLabel` declared by the data view.
- Use `sdk.dataSource.run()` with a page data source descriptor when the page config should own the data view code, default fields, or default filters.
- Use `sdk.function.invoke(code, { input })` for reusable backend business logic declared under `src/resources/functions/` and `src/functions/`. Do not implement multi-form orchestration, connector fan-out, notification orchestration, or permission-sensitive backend rules directly in a page component.
- Use `sdk.connector.invoke`, `sdk.connector.call("connector.api")`, or `sdk.connector.download` for external services. The SDK calls the platform runtime connector endpoint; it must not call third-party domains directly.
- Use `sdk.notification.sendByType` and `batchSendByType` for reusable business messages. Custom notification types must be declared in `src/resources/notifications/` and published with `openxiangda resource publish`.
- Use `sdk.export.create` and `sdk.export.get` for asynchronous XLSX exports. Simple pages may send a declarative workbook definition. Complex or reusable exports should send only a published App Function `definitionCode`, the current query snapshot, export scope, and stable selected row IDs. The server executes `structured_export_provider_v1` with fresh user permissions; never upload executable rendering code from the browser. See `docs/structured-export-v1.md`.
- Use `AttachmentPreviewList`, `ImagePreviewGrid`, or `useFilePreview` from `openxiangda/runtime/react` for in-page attachment previews in a custom React SPA page. They use the current PageSdk context and enforce the platform capability and ticket contracts. Use `sdk.createFileAccessTicket(bucketName, objectName, fileName, "preview", { appType })` only when the page needs a shareable or new-window preview link. `appType` defaults to the current page context. Open `response.result.previewPageUrl`; do not use `previewUrl` or `/service/file/preview-by-ticket/:ticket` as the page entry.
- Use `sdk.organization.departments.*` and `sdk.organization.accounts.*` only for intentional organization pages. Read-only list/detail pages need `app:organization:read` or `app:organization:manage`; writes and password operations need `app:organization:manage`. Do not call legacy `/user` or `/department` endpoints from pages.
- Use `sdk.organization.schoolContact.*` for synchronized guardian/student and teacher/class relationships. `SCHOOL_HEAD_TEACHER` identifies a user who currently heads at least one class; use `teachers.list({ classId, isHeadTeacher: true })` to resolve the exact class. Authenticated non-guest users default to all relationships in the current tenant without an app-role permission binding. Use the optional `self:read` or `class:read` permission only when the product explicitly needs a narrower data scope. The response intentionally includes platform user ID, mobile, DingTalk userid, and name. Read `references/school-contact-relations.md` before building a family or class page.
- Synchronized school-contact users also receive platform identity codes: `SCHOOL_GUARDIAN`, `SCHOOL_STUDENT`, and `SCHOOL_TEACHER`. Page permission groups select them with `platformRoleCodes` (additive to app `roles`), and runtime permissions expose them in `permissions.platformRoleCodes`. App Functions can use a `platform_roles` invocation audience and trusted `ctx.operator.platformRoleCodes`; these roles are maintained only by the daily organization sync.
- Use `sdk.workCenter.listItems({ boxType })` and `sdk.workCenter.getStats()` for current-user work center lists and counts. `boxType` is one of `todo`, `done`, `cc`, or `initiated`. This is the end-user task/handled/cc/initiated surface; do not build todo pages by reading workflow operation logs, automation logs, or raw process-task tables.
- `sdk.form.create` returns identifiers and generated serial number values only. Treat `formInstId` / `formInstanceId` as the required success contract; `serialNumber` / `serialNumbers` are present only when the form has `SerialNumberField`. Do not expect the save response to contain the full row, formula results, or other server-generated field values. Call `sdk.form.getDetail` explicitly after create when those values are needed.
- Missing `formInstId` / `formInstanceId` is a real error in strict mode. Do not create fake IDs, mock rows, or fallback display data to hide it.
- `lookupAfterCreate` is legacy compatibility only. New pages should save, read the returned instance ID, then explicitly query detail if needed.
- Use `createAuthClient` from `openxiangda/runtime` or `LoginPage` / `useAuth` from `openxiangda/runtime/react` for application login pages. Auth provider App Functions return identity assertions only; platform auth owns create/bind/reject/token decisions.
- Use `PublicAccessGate` from `openxiangda/runtime/react` or `createPublicAccessClient` from `openxiangda/runtime` for React SPA public pages under `/view/:appType/public/*`. Do not append old `?publicAccess=guest` links in new apps.
- In React SPA apps, wrap route children with `OpenXiangdaPageProvider` inside `OpenXiangdaProvider` before using `usePageSdk()`, `usePageContext()`, `useDataSource()`, or `useFormViewPermissions()`. `OpenXiangdaProvider` alone is not enough and missing the page provider causes `usePageSdkStore 必须在 PageProvider 内使用`.
- For the current user's department hierarchy, use `sdk.department.getCurrentUserParentDepartments()`; do not hardcode `GET /department/:id/parentDepartments` in page code.
- Use `sdk.auth.logoutAndRedirect({ loginUrl })` for user logout when the page should return after login. It calls the platform logout endpoint, appends the current page URL as `callback`, and redirects to the login URL. Use `sdk.auth.logout()` only when the page wants to handle redirect itself.
- Use `sdk.role.getMyRoles()`, `sdk.role.getCurrentRole()`, and `sdk.role.switchAppRole()` for current-user app role switching. Pass `roleId: ""` to switch back to all app roles.
- Keep API calls behind small local functions so generated UI stays testable.
- Treat user context and tenant context as runtime-provided values.

When the SDK lacks a capability, document the fallback and keep it isolated.

Data view query:

```ts
const response = await sdk.dataView.query("ticket_with_customer", {
  fields: ["ticketId", "ticketTitle", "customerName"],
  filters: [
    { key: "customerName", operator: "contains", value: keyword },
    { key: "statusValue", operator: "EQ", value: "已发布" },
  ],
  order: [{ field: "ticketTitle", isAsc: "y" }],
  currentPage: 1,
  pageSize: 20,
})
```

Data view stats:

```ts
const response = await sdk.dataView.stats("ticket_stats_by_customer", {
  fields: ["customerName", "ticketCount", "totalAmount"],
  filters: [
    { key: "customerName", operator: "contains", value: keyword },
  ],
  having: [
    { key: "ticketCount", operator: ">", value: 0 },
  ],
  order: [{ field: "ticketCount", isAsc: "n" }],
  currentPage: 1,
  pageSize: 20,
})
```

Data view data source descriptor:

```ts
export default {
  dataSources: [
    {
      key: "tickets",
      type: "dataView.query",
      code: "ticket_with_customer",
      fields: ["ticketId", "ticketTitle", "customerName"],
      defaultFilter: [
        { key: "ticketTitle", operator: "isNotEmpty" }
      ]
    },
    {
      key: "ticketStats",
      type: "dataView.stats",
      code: "ticket_stats_by_customer",
      fields: ["customerName", "ticketCount"],
      defaultHaving: [
        { key: "ticketCount", operator: ">", value: 0 }
      ]
    }
  ]
}

const response = await sdk.dataSource.run("tickets", {
  filters: [
    { key: "customerName", operator: "contains", value: keyword }
  ],
  pageSize: 20,
})
```

Data view filters, having, and fields use output aliases such as `customerName` or `ticketCount`, not source references such as `customer.name`. For option-like fields, prefer scalar aliases such as `statusValue` in the view definition and page filters. If the page only needs one form, prefer `sdk.form.advancedSearch`. If the page only needs a simple one-form dropdown, prefer linkedForm options.

Standalone in-page file preview:

```tsx
import { EyeOutlined } from "@ant-design/icons"
import { Button } from "antd"
import {
  AttachmentPreviewList,
  ImagePreviewGrid,
  useFilePreview,
} from "openxiangda/runtime/react"

export function RecordFiles({ record }) {
  const files = record.attachments || []
  const preview = useFilePreview({ items: files })
  const primary = files[0]

  return (
    <>
      <AttachmentPreviewList items={files} />
      <ImagePreviewGrid items={record.photos || []} />
      {primary && preview.canPreview(primary) ? (
        <Button icon={<EyeOutlined />} onClick={() => void preview.open(primary)}>
          Preview primary file
        </Button>
      ) : null}
      {preview.host}
    </>
  )
}
```

These APIs must render below `OpenXiangdaProvider` and `OpenXiangdaPageProvider`. `useFilePreview` returns `canPreview`, `getCapability`, `open`, `download`, `isOpening`, and `host`. Render `host` once in the component tree. Do not import the internal `FilePreviewContent` or `useFilePreviewController`, create a fake `FormProvider`, or keep a local previewable-extension list.

For a real custom edit surface that embeds platform form fields, adapt PageSdk with the public form runtime API instead of hand-writing a request bridge:

```tsx
import { AttachmentField, FormProvider } from "openxiangda"
import { usePageFormRuntimeApi } from "openxiangda/runtime/react"

const api = usePageFormRuntimeApi()

<FormProvider
  config={{ api, appType, formUuid: "training_lesson", mode: "edit" }}
  schema={schema}
  initialValues={values}
>
  <AttachmentField fieldId="materials" label="Materials" />
</FormProvider>
```

Use `createPageFormRuntimeApi(sdk)` when hooks are unavailable. Both APIs preserve JSON envelopes, route `responseType: "blob"` through `sdk.transport.download`, and normalize ticket content URLs such as `/file/download-by-ticket/*` with the current PageSdk `servicePrefix`. They do not rewrite `/view/*` page URLs or absolute storage URLs. Never forward every form request to `sdk.request`, and never prepend `/service` in application code.

Shareable file preview ticket:

```ts
const ticketResponse = await sdk.createFileAccessTicket(
  "lowcode",
  "attachments/contracts/demo.docx",
  "demo.docx",
  "preview",
  { appType: sdk.context.app.appType },
)

const previewPageUrl = ticketResponse.result?.previewPageUrl
if (previewPageUrl) {
  window.open(previewPageUrl, "_blank")
}
```

`previewPageUrl` is the final browser page URL, normally `/view/:appType/file-preview?ticket=...`. `previewUrl` is the file content stream for the preview renderer and should not be used as the user-facing page entry. The request contract calls this fourth argument `purpose`; supported values are `preview`, `download`, and `onlyoffice`.

App Function invocation:

```ts
const result = await sdk.function.invoke("reservation_reminder_summary", {
  input: {
    scope: "today",
    keyword,
  },
})
```

App Function source should prefer `export default async function(ctx, input) {}`.
The second argument is the `input` passed by `sdk.function.invoke`, and the
same value is also available as `ctx.input` for compatibility.

Use App Functions when the logic must run server-side and be reusable by pages, automations, or workflows. Runtime invocation requires app automation management permission by default. To let ordinary app users call a function from a page, declare `definitionJson.runtimeInvoke.audience` with `authenticated`, `page_permission_group`, `app_roles`, `platform_roles`, or `scope_policy`; use `roleCodes` only for current app-role grants and `platformRoleCodes` for synchronized identities. Do not use `"*"` or `"all-app-roles"` as role codes. Inside the function, authorize sensitive actions with trusted runtime context such as `ctx.operator.roleCodes`, `ctx.operator.platformRoleCodes`, `ctx.operator.currentRoleCode`, `ctx.operator.hasFullAccess`, `ctx.currentUser`, or `ctx.permissions`; do not trust role codes sent in the page input. Published trusted code may write any form in its current tenant/application; per-function `resources.forms` is optional mapping and audit metadata, not an authorization allowlist. Do not open direct submit permission on internal forms just for that page action.

Server-defined export:

```ts
const response = await sdk.export.create({
  exportKey: "orders",
  definitionCode: "order_export_provider",
  definitionInput: { variant: "finance" },
  query: {
    filters,
    sorts: [{ field: "createTime", direction: "descend" }],
  },
  scope: selectedIds.length ? "selected" : "all",
  rowIds: selectedIds,
})

const task = response.result
const latest = task ? await sdk.export.get(task.id) : null
```

`definitionCode` must identify a published, permission-scoped App Function
implementing `structured_export_provider_v1`. Its `describe` phase owns the
workbook and column definition; its paged `query` phase owns trusted data
selection and custom computed fields. The platform owns the queue, permission
revalidation, XLSX generation, formula hardening, storage, and download ticket.

Organization management:

```ts
const capabilities = await sdk.organization.capabilities()
if (!capabilities.result?.canManage) {
  throw new Error("当前用户缺少组织账号管理权限")
}

await sdk.organization.departments.create({
  name: "销售部",
  parentId: rootDepartmentId,
})

const accounts = await sdk.organization.accounts.list({
  keyword,
  departmentIds: [rootDepartmentId],
  page: 1,
  pageSize: 20,
})

await sdk.organization.accounts.create({
  username: "alice",
  password: initialPassword,
  name: "Alice",
  jobNumber: "E001",
  departmentIds: [rootDepartmentId],
  affiliatedDepartmentId: rootDepartmentId,
})

await sdk.organization.accounts.resetPassword("alice", {
  newPassword,
})
```

Use `ctx.organization.departments.*` and `ctx.organization.accounts.*` inside App Functions or trusted JS nodes for the same capability. Runtime service principals must resolve a real operator/audit actor; permission is checked against that user, not against the runtime service account. Keep password changes on dedicated endpoints: update account metadata with `update`, reset another user's password with `resetPassword`, and change the current user's password with `changeMyPassword({ oldPassword, newPassword })`.

For synchronized school-contact relationships, use `sdk.organization.schoolContact.relations.list`, `teachers.list`, `children.list`, `guardians.list`, or `myFamily.get`; App Functions use the same paths under `ctx.organization.schoolContact`. Do not infer a family relationship from class membership, infer a specific head-teacher class from the global role, or persist a second relationship master inside application forms. See `references/school-contact-relations.md` for permission codes, filters, response fields, and examples.

Work center:

```ts
const todoList = await sdk.workCenter.listItems({
  boxType: "todo",
  page: 1,
  limit: 20,
  keyword,
  appType,
})

const stats = await sdk.workCenter.getStats({ appType })
```

Use `actionUrl` from a work-center item when present; otherwise link workflow items with both `formUuid` and `formInstanceId` to the app's process detail route. Keep lists paginated and role-scoped by the platform current user.

Application auth:

```tsx
import { LoginPage, useAuth, useLoginMethods } from "openxiangda/runtime/react";

export function DefaultLogin() {
  return <LoginPage dingtalkFlow="auto" />;
}

export function CustomPhoneLogin() {
  const auth = useAuth();
  const methods = useLoginMethods();

  async function submit(phone: string, code: string, challengeId: string) {
    await auth.phoneCodeLogin({ phone, code, challengeId });
  }

  return null;
}
```

Standalone client:

```ts
import { createAuthClient } from "openxiangda/runtime";

const auth = createAuthClient({ appType, servicePrefix: "/service" });
const methods = await auth.getMethods();

async function startDingTalkLogin() {
  const { loginUrl } = await auth.getDingTalkOAuthUrl({
    returnUrl: `/view/${encodeURIComponent(appType)}/admin`,
  });
  window.location.assign(loginUrl);
}

const sent = await auth.sendPhoneCode({ phone, purpose: "login" });
const result = await auth.phoneCodeLogin({
  phone,
  code,
  challengeId: sent.challengeId,
});
```

`dingtalkFlow="auto"` is the default. It uses DingTalk JSAPI only when both the container and `requestAuthCode` are available; otherwise it starts browser OAuth. Explicit `dingtalkFlow="jsapi"` or `"oauth"` overrides the auth method's `flow` setting. Browser OAuth is a full-page redirect whose callback is handled by the platform, so custom pages should pass an app-local `/view/:appType/*` return URL and must not implement their own callback or OAuth `state`. `LoginPage` normalizes a same-origin absolute guard callback to that relative form and rejects cross-origin or other-app callbacks before making the OAuth start request.

For phone-code auth, the App Function provider receives `event`, `appType`, `method`, `credential`, `requestId`, `request`, and `challenge`. It may return `{ ok, providerState }` for send and `{ ok, identity }` for verify. It must not return `token`, `accessToken`, `refreshToken`, cookies, or mutate platform account tables.

Public access route:

```tsx
import {
  OpenXiangdaPageProvider,
  OpenXiangdaProvider,
  PublicAccessGate,
} from "openxiangda/runtime/react";

const PublicLoading = () => <div role="status">正在进入公开页面</div>;
const PublicAccessError = ({ error }: { error: { message?: string } }) => (
  <div role="alert">{error.message || "公开链接不可用或已过期"}</div>
);

export function PublicRegisterRoute() {
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
  );
}
```

Standalone public session client:

```ts
import { createPublicAccessClient } from "openxiangda/runtime";

const publicAccess = createPublicAccessClient({ appType, servicePrefix: "/service" });

await publicAccess.startSession({
  policyCode: "public_register",
  routeCode: "public.register",
  path: window.location.pathname,
  ticket: new URLSearchParams(window.location.search).get("ticket") || undefined,
});
```

`PublicAccessGate` stores the returned bearer token in the runtime provider and injects it into follow-up SDK requests. It does not replace `OpenXiangdaPageProvider`. Always provide `fallback` and `errorFallback` so slow networks, missing tickets, or expired tickets do not render a blank public page. If you call `createPublicAccessClient` directly outside the provider, pass the returned `accessToken` as `Authorization: Bearer <token>` for follow-up APIs. The matching resources must exist under `src/resources/routes/` and `src/resources/public-access/`. Public guest access to forms, data views, functions, and connectors is denied unless the policy `grants` explicitly names that resource.

When testing public pages or writing direct fetch wrappers, check the JSON envelope, not only `response.ok`. Platform runtime APIs can return HTTP 200 with `code: "PUBLIC_GRANT_DENIED"`; this is a failed request. Treat only `code === 200`, `code === "200"`, or compatible success code `0` as success, and fail on `success: false`.

Logout and current-user role switching:

```ts
await sdk.auth.logoutAndRedirect({
  loginUrl: "/login",
})

await sdk.auth.logoutAndRedirect({
  loginUrl: "/login",
  callbackParamName: "redirect",
})

await sdk.auth.logout()

const roles = await sdk.role.getMyRoles({ scope: "app" })
const currentRole = await sdk.role.getCurrentRole({ scope: "app" })

await sdk.role.switchAppRole({
  roleId: roles.result?.[0]?.id || "",
})

await sdk.role.switchAppRole({
  roleId: "",
})

await sdk.role.switchPlatformRole({
  roleId: "platform-admin",
})
```
