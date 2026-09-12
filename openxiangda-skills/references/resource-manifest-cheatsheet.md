# Resource Manifest Cheatsheet

> 1-2 屏速查：`src/resources/` 下各类型 manifest 的最小可用模板与对应运行时调用方式。
> 这里只放"复制即用"的骨架；字段语义详见对应的 reference 文档。

## 通用约定

- **本地用逻辑 code**：所有 manifest 用稳定的 `formCode` / `pageCode` / `workflowCode` / `automationCode` / `connectorCode` / `dataViewCode` / `roleCode` / `notificationType`。
- **平台 ID 由 CLI 解析**：`openxiangda resource publish --profile <name>` 把 code 解析成当前 profile 的真实 ID 并写回 `.openxiangda/state.json`。
- **永远不写密钥**：第三方 API key、token、secret、password、authorization、headers 等绝不出现在 `src/resources/`，平台管理员在后台配置。
- **多 profile 不共享 ID**：`dev` / `prod` 各自维护一份资源 ID 映射，复制 manifest 即可复用，不要复制平台 ID。
- **Auth provider 只返回身份声明**：登录 provider App Function 不能发 token、写 cookie、直接改用户表或绑定表；平台按策略创建/绑定/拒绝。

## 命令

正式多资源开发仍推荐先写 `src/resources/**`，再走声明式发布：

```bash
openxiangda resource validate --profile <name>          # 静态校验所有 manifest
openxiangda resource plan     --profile <name>          # diff：本地 vs. 平台
openxiangda resource publish  --profile <name> --dry-run # 预览 publish 计划，不写平台和本地生成文件
openxiangda resource publish  --profile <name>          # 非破坏性 upsert（不 prune）
openxiangda resource publish  --profile <name> --prune  # 删除 manifest 未声明的平台资源（谨慎）
openxiangda resource pull     --profile <name>          # 拉取平台资源回写到本地（用于初次同步）
openxiangda resource explain public-access --json       # 查看资源目录、最小 manifest、验证命令
```

小步诊断、修复或 AI 自动发现能力时，可以用一等资源 CLI。写命令默认是 live mutation；需要让仓库继续作为来源时加 `--write-manifest`，复杂 DTO 用 `--json-file`，危险动作用 `--force`，先看请求就加 `--dry-run`。

```bash
openxiangda doctor --profile <name> --json
openxiangda design gates --topic public-access --json

openxiangda route upsert --json-file src/resources/routes/public_register.json --dry-run
openxiangda public-access upsert --json-file src/resources/public-access/public_register.json --write-manifest
openxiangda public-access ticket-create public_register --json-file ticket.json
openxiangda public-access session-test public_register --path /view/APP_XXX/public/register --json
openxiangda public-access grant-check public_register --form-code registration_form --json

openxiangda auth-config methods --json
openxiangda auth-config upsert --json-file src/resources/auth/default.json --write-manifest

openxiangda function upsert --json-file src/resources/functions/submit_public_registration.json
openxiangda function invoke submit_public_registration --body-json '{"input":{}}'

openxiangda connector upsert --json-file src/resources/connectors/sms.json
openxiangda connector invoke sms.sendCode --body-json '{"body":{"phone":"13800000000"}}'

openxiangda notification template-upsert --json-file src/resources/notifications/register.json
openxiangda notification type-upsert --json-file src/resources/notifications/register.json
openxiangda notification preview public_register_notice --body-json '{"payload":{"title":"测试"}}'

openxiangda resource plan storage --profile <name>
openxiangda data-view upsert --json-file src/resources/data-views/public_lookup.json
openxiangda scope dimension-upsert college --json-file src/resources/permissions/scope-dimensions/college.json --write-manifest
openxiangda scope grant-source-upsert college_grants --json-file src/resources/permissions/scope-grant-sources/college_grants.json --write-manifest
openxiangda scope policy-upsert college_data --json-file src/resources/permissions/data-scope-policies/college_data.json --write-manifest
openxiangda scope sync college_grants --json
openxiangda scope explain college_data --json
openxiangda menu update public_register --json-file src/resources/menus/public_register.json --write-manifest
openxiangda permission audit --json
openxiangda permission role-update external_visitor --json-file src/resources/roles/external_visitor.json --write-manifest
```

调用和测试类命令会检查 JSON envelope。HTTP 200 但 `code: "PUBLIC_GRANT_DENIED"`、`success: false` 或其他字符串错误码必须当失败，不能只看 HTTP status。

## 0. Auth — `src/resources/auth/<code>.json`

```json
{
  "code": "default",
  "name": "Default App Login",
  "status": "active",
  "configJson": {
    "methods": [
      { "type": "password", "enabled": true, "label": "账号密码" },
      { "type": "dingtalk", "enabled": true, "label": "钉钉登录", "flow": "auto" },
      { "type": "sso", "enabled": true, "label": "CAS", "protocol": "cas" },
      {
        "type": "phone_code",
        "enabled": true,
        "label": "手机号验证码",
        "ttlSeconds": 300,
        "sendFrequencySeconds": 60,
        "maxAttempts": 5,
        "provider": { "functionCode": "auth_phone_code" }
      }
    ],
    "registration": { "mode": "reject" },
    "binding": { "mode": "auto" },
    "matching": {
      "keys": ["phone", "email", "externalId", "unionId", "jobNumber", "username"]
    },
    "defaultRoleCodes": []
  }
}
```

Provider function:

```ts
export default async function authPhoneCodeProvider(ctx, input) {
  if (input.event === "phone_code.send") {
    return { ok: true, providerState: { nonce: "vendor-message-id" } };
  }

  if (input.event === "phone_code.verify") {
    if (input.credential.code !== "123456") {
      return { ok: false, message: "验证码错误" };
    }
    return {
      ok: true,
      identity: {
        phone: input.credential.phone,
        externalId: `phone:${input.credential.phone}`
      }
    };
  }

  return { ok: false, message: "不支持的认证事件" };
}
```

React 默认页：

```tsx
import { LoginPage } from "openxiangda/runtime/react";

export default function AppLogin() {
  return <LoginPage dingtalkFlow="auto" />;
}
```

自定义登录页：

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
await auth.phoneCodeLogin({ phone, code, challengeId: sent.challengeId });
```

钉钉 `flow: "auto"` 会在确认处于钉钉容器且 JSAPI 可用时走免登，否则走平台托管的浏览器 OAuth。`returnUrl` 只能是当前应用的 `/view/:appType/*` 路径；应用不要自行拼装钉钉授权 URL、保存 OAuth `state` 或实现回调页。

设计前必须确认启用方式、注册策略、身份匹配键、provider 边界、默认权限、安全参数、第三方配置归属。

## 1. Storage — `src/resources/storage/<code>.json`

用于给附件字段声明自定义 OSS 上传目标。manifest 里只能写环境变量引用，不能写真实 AK/SK；发布时 CLI 解析环境变量，后端密文保存。

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

表单字段引用：

```tsx
<AttachmentField
  name="attachments"
  label="附件"
  uploadProvider="oss"
  storageCode="evaluate_oss"
/>
```

图片字段也可以引用同一个 storage：

```tsx
<ImageField
  name="photos"
  label="照片"
  uploadProvider="oss"
  storageCode="evaluate_oss"
  imageCompression={{ enabled: true }}
/>
```

默认附件或图片不配置 `uploadProvider`/`storageCode` 时仍走平台上传。OSS 文件保存真实 OSS URL；预览、下载、删除对象都通过 storage 配置对应的运行时接口处理。

`imageCompression` 是浏览器端图片压缩配置，只对 jpg/png/webp/bmp 生效，GIF、SVG 和非图片文件会自动跳过。启用后会在原图之外上传 `thumb` / `preview` 变体，字段值会写入 `thumbUrl`、`previewUrl` 和 `variants`。默认输出格式为 `source`，如果显式设置 `format: "webp"`，storage 的 `allowedExtensions` 必须包含 `webp`。

`configJson.cors.managed: true` 会在发布 storage 配置时顺便设置 OSS bucket CORS。后端会读取现有规则并合并，不覆盖其他系统规则；该操作需要 OSS 凭据具备 bucket CORS 管理权限。未声明 `cors.managed` 时不会修改 bucket 级配置。

## 1. Public Route — `src/resources/routes/<code>.json`

新 React SPA 公开页使用 `/view/:appType/public/*`，不要再使用旧 `?publicAccess=guest`。

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

React Router 中用 `PublicAccessGate` 创建 scoped public session：

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
```

React SPA 中 `OpenXiangdaProvider` 负责 runtime/bootstrap 和 public token 注入，`OpenXiangdaPageProvider` 负责 `usePageSdk()` / `usePageContext()` 的 Page SDK 上下文。缺少 `OpenXiangdaPageProvider` 会抛出 `usePageSdkStore 必须在 PageProvider 内使用`。公开页面必须给 `PublicAccessGate` 配 `fallback` 和 `errorFallback`，避免慢网、缺 ticket、ticket 过期时出现空白页。

公开访问验证必须检查 JSON envelope。HTTP 200 但 `code: "PUBLIC_GRANT_DENIED"` 代表后端已拒绝；只有 `code` 为 `200`、`"200"` 或兼容成功码 `0`，且没有 `success: false` 时才算成功。

## 2. Public Access Policy — `src/resources/public-access/<code>.json`

公开策略声明外部角色和可访问资源。未显式 grant 的 form/dataView/function/connector 默认拒绝；grant 后仍受对应后端权限组控制。

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

Ticket 模式：

```json
{
  "code": "public_score_lookup",
  "name": "公开成绩查询",
  "mode": "ticket",
  "routeCode": "public.scoreLookup",
  "pathPattern": "/view/:appType/public/score",
  "externalRoleCodes": ["external_ticket_holder"],
  "ticketConfig": { "ttlSeconds": 1800, "singleUse": true },
  "grants": {
    "dataViews": ["public_score_lookup"]
  }
}
```

Ticket 默认单次使用，首次换取 public session 后立即失效；只有明确配置 `ticketConfig.singleUse: false` 的业务场景才允许复用。

`grants.forms` 可以写本地 `formCode`，CLI 发布时会解析为真实 `formUuid`。

## Business Scope Permission — `src/resources/permissions/scope-*`

Use this when a form-maintained business authorization relationship controls
row visibility. The pattern replaces "one role / one permission group per
college, class, project, customer, region, store, etc."

Dimension:

```json
{
  "code": "college",
  "name": "学院",
  "sourceFormCode": "college",
  "sourceValueField": "collegeCode",
  "sourceLabelField": "collegeName",
  "hierarchyMode": "flat"
}
```

Grant source:

```json
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

Policy:

```json
{
  "code": "college_data",
  "name": "学院数据",
  "matchMode": "AND",
  "rules": [
    { "dimensionCode": "college", "field": "collegeCode", "operation": "view" }
  ]
}
```

Form permission group reference:

```json
{
  "code": "college_view",
  "formCode": "student",
  "name": "学院查看学生",
  "type": "view",
  "roles": ["college_admin"],
  "operations": ["view"],
  "dataPermission": {
    "type": "scope_policy",
    "policyCode": "college_data"
  }
}
```

Data View permission groups use the same `dataPermission` object inside
`permissionGroups`. Empty grant sets deny; multiple policy rules are AND by
default; large grant sets use DB `EXISTS` instead of huge `IN` SQL. Prefer
hidden scalar target fields such as `collegeCode`; if the target is a JSONB
option/person/department field, set `valuePath: "value"` or `componentType`.
Authorization source form changes are synced by the platform after
create/update/delete/import when the grant source uses the default
`syncMode: "on_write"`. Use `syncMode: "manual"` only for externally maintained
sources or special bulk jobs that explicitly call `openxiangda scope sync`.
Manifest `sync: true` still performs an immediate full sync during resource
publish.

## 3. Connector — `src/resources/connectors/<code>.json`

```json
{
  "code": "crm",
  "name": "CRM Service",
  "url": "https://crm.internal.example.com/api",
  "authType": "apiKey",
  "authConfig": {
    "apiKey": { "key": "X-API-Key", "value": "internal-secret", "in": "header" }
  },
  "userContext": {
    "enabled": true,
    "inject": [
      { "target": "header", "key": "X-User-Id", "value": "userId" },
      { "target": "body",   "key": "operator", "value": "user" }
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

页面调用：

```ts
const data = await sdk.connector.call("crm.getCustomer", { body: { keyword } });
```

不要把 `authConfig` 里的真实 secret 写进 manifest；用 placeholder，由平台管理员在后台覆盖。完整字段见 [`connector-resources.md`](connector-resources.md)。

## 4. Data View — `src/resources/data-views/<code>.json`

选择规则：

- 多表只读联表列表 / lookup / 报表明细：用行级 data view，页面调用 `sdk.dataView.query`。
- 固定口径统计 / 看板指标 / 图表数据源：用 `viewType: "aggregate"`，页面调用 `sdk.dataView.stats`。
- ECharts 或自定义 dashboard 只负责展示；统计口径稳定时，数据源优先沉淀成 aggregate data view。
- 默认 `storageMode: "materialized"`，适合读多写少和可接受刷新延迟的列表/报表；发布前为常用筛选、排序、维度和时间桶声明 `indexes`。
- `storageMode: "live"` 每次查询实时执行，适合强实时但数据量可控的固定复杂查询；live 模式忽略 `indexes` 且不能 refresh。
- 不用于单表 CRUD、简单 `linkedForm` 下拉、写回、无边界重查询或临时 BI 查询。

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
        { "left": "ticket.customer.value", "op": "=", "right": "customer.form_instance_id" }
      ]
    }
  ],
  "select": [
    { "field": "ticket.form_instance_id", "as": "ticketId" },
    { "field": "ticket.title",            "as": "ticketTitle" },
    { "field": "ticket.status.label",     "as": "statusLabel" },
    { "field": "ticket.status.value",     "as": "statusValue" },
    { "field": "customer.name",           "as": "customerName" }
  ],
  "indexes": [{ "fields": ["ticketId"], "unique": true }],
  "refresh": { "mode": "scheduled", "cron": "0 */10 * * * *" },
  "permissionGroups": [
    { "code": "ticket_query", "name": "Ticket Query", "roles": ["manager"], "operations": ["query"] }
  ]
}
```

页面调用：

```ts
const list = await sdk.dataView.query("ticket_with_customer", {
  filters: [{ field: "statusValue", op: "in", values: ["open", "processing"] }],
  order: [{ field: "ticketId", direction: "desc" }],
  page: { current: 1, size: 20 },
});
```

统计聚合视图：

```json
{
  "code": "ticket_stats_by_customer",
  "name": "Ticket Stats By Customer",
  "viewType": "aggregate",
  "base": { "formCode": "service_ticket", "alias": "ticket" },
  "dimensions": [
    { "field": "ticket.customer.value", "as": "customerId" },
    { "field": "ticket.created_at", "as": "createdMonth", "bucket": "month" }
  ],
  "measures": [
    { "type": "count", "as": "ticketCount" },
    { "type": "sum", "field": "ticket.amount", "as": "totalAmount" }
  ],
  "having": { "field": "ticketCount", "op": ">", "value": 0 },
  "indexes": [{ "fields": ["customerId", "createdMonth"] }]
}
```

```ts
const stats = await sdk.dataView.stats("ticket_stats_by_customer", {
  fields: ["customerId", "createdMonth", "ticketCount", "totalAmount"],
  having: [{ field: "ticketCount", op: ">", value: 0 }],
});
```

性能要点：索引只能引用输出 alias；行级视图索引常用 filter/order 字段；聚合视图索引 dimensions/date buckets；`countDistinct` 和高基数维度刷新成本较高；低于 5 分钟的 scheduled refresh 需要用户明确确认时间敏感度。live 视图不刷新、不建索引，必须控制字段、过滤和分页。完整规则见 [`data-views.md`](data-views.md)。

## 3. Notification — `src/resources/notifications/<code>.json`

```json
{
  "templates": [
    {
      "code": "reservation_reminder",
      "name": "预约提醒",
      "content": "{{title}}",
      "variables": ["title", "instrumentName", "startTime"],
      "channelsConfig": {
        "inapp":    { "enabled": true, "content": "{{instrumentName}} 将于 {{startTime}} 开始" },
        "dingding": {
          "enabled": true,
          "content": "{{title}}",
          "config": {
            "deliveryMode": "card_preferred",
            "fallbackToWorkNotice": true,
            "card": {
              "mode": "standard",
              "title": "{{title}}",
              "summary": "{{instrumentName}} 将于 {{startTime}} 开始",
              "jumpUrl": "{{detailUrl}}"
            }
          }
        }
      }
    }
  ],
  "typeConfigs": [
    {
      "notificationType": "reservation_reminder",
      "templateCode": "reservation_reminder",
      "enabled": true,
      "priority": 0
    }
  ]
}
```

页面调用：

```ts
await sdk.notification.sendByType({
  notificationType: "reservation_reminder",
  recipientId: userId,
  payload: { title: "预约提醒", instrumentName, startTime },
});
```

JS_CODE 调用：`ctx.notification.sendByType({ ... })`。允许的 channels：`inapp` / `email` / `dingding` / `wechat` / `thirdparty_todo`。完整规则见 [`notifications.md`](notifications.md)。

钉钉卡片预览/发送：`sdk.notification.previewDingTalk({ notificationType, payload })`、`sdk.notification.sendDingTalk({ notificationType, recipientId, payload })`；CLI 为 `openxiangda notification dingding-preview` 和 `openxiangda notification dingding-send --force`。

## 4. App Function — `src/resources/functions/<functionCode>.json` + `src/functions/<functionCode>/index.ts`

```json
{
  "code": "reservation_reminder_summary",
  "name": "Reservation Reminder Summary",
  "secretRefs": [
    { "name": "notification_provider_token", "required": false }
  ],
  "resources": {
    "forms": ["reservation_order"],
    "dataViews": ["reservation_order_overview"],
    "connectors": ["crm"]
  },
  "definitionJson": {
    "version": "function_v2",
    "runtimeMode": "trusted_node",
    "runtimeContractVersion": "trusted_node_v2",
    "timeout": 30000,
    "runtimeInvoke": {
      "audience": {
        "type": "page_permission_group",
        "resourceCodes": ["member_portal_pages"]
      }
    },
    "sourceFile": {
      "localPath": "src/functions/reservation_reminder_summary/index.ts"
    }
  }
}
```

```ts
// src/functions/reservation_reminder_summary/index.ts
import type { AppFunctionContextV2 } from "openxiangda/runtime";

export default async function reservationReminderSummary(
  ctx: AppFunctionContextV2,
  input: { scope?: string },
) {
  // Only resolve a name declared in top-level secretRefs. Never log or return it.
  const providerToken = await ctx.secrets.get("notification_provider_token");
  const providerResponse = await ctx.utils.http.post(
    "https://api.dingtalk.com/v1.0/example/operation",
    { requestId: input.scope || "default" },
    { headers: { authorization: `Bearer ${providerToken}` } },
  );
  const roleCodes = ctx.operator?.roleCodes || ctx.permissions?.roleCodes || [];
  const platformRoleCodes =
    ctx.operator?.platformRoleCodes || ctx.permissions?.platformRoleCodes || [];
  const canManage =
    ctx.operator?.hasFullAccess === true ||
    ctx.permissions?.hasFullAccess === true ||
    roleCodes.includes("union_admin") ||
    platformRoleCodes.includes("SCHOOL_TEACHER");
  if (!canManage) throw new Error("当前账号无权执行该操作。");

  const orders = await ctx.form.queryMany({
    formCode: "reservation_order",
    filters: [{ field: "status", operator: "=", value: "pending" }],
    pageSize: 50,
  });
  const firstOrder = orders.data?.[0] || orders[0];
  const detail = firstOrder?.formInstId
    ? await ctx.form.getById({
        formCode: "reservation_order",
        formInstId: firstOrder.formInstId,
      })
    : null;

  const overview = await ctx.dataView.query("reservation_order_overview", {
    pageSize: 20,
  });

  return {
    providerStatus: providerResponse.status,
    pendingCount: orders.totalCount || orders.data?.length || 0,
    detail,
    overview: overview.data || [],
    input,
  };
}
```

`ctx.utils.http` is the typed, server-controlled public HTTPS bridge for
`trusted_node_v2`; it never forwards the platform Runtime bearer token and
rejects redirects plus private/reserved network targets. For whole-app atomic
activation, stage the exact backend scope with
`openxiangda resource publish function --only <code> --stage-only`, combine its
verified `stagedResource` with the other changed staged children, and pass that
overlay to `openxiangda release app-finalize --staged-resources-json ...`.
Already-active Backend Releases return `activeResource`, not a staged descriptor.

调用方式：

```ts
const result = await sdk.function.invoke("reservation_reminder_summary", {
  input: { scope: "today" },
});
```

自动化 / 流程图节点调用：

```json
{
  "id": "call_summary",
  "type": "function_call",
  "data": {
    "functionCode": "reservation_reminder_summary",
    "input": { "scope": "today" },
    "saveResponseTo": "summary"
  }
}
```

适用边界：可复用后端业务逻辑、跨页面/自动化/流程共享的查询编排、连接器调用、通知编排、受控平台 API 调用。App Function 支持 `ctx.form.queryOne/queryMany/getById/createOne/updateOne/updateById`、`ctx.dataView`、`ctx.connector`、`ctx.notification`、`ctx.platform.roles`、`ctx.platform.api` 等受控 helper，当前 MVP 不暴露原始 SQL/Redis。应用角色查询和成员维护优先使用 `ctx.platform.roles.list/findByCode/addUsers/removeUser`；底层 `ctx.platform.api` 返回 HTTP 包装与平台 envelope，需要自行解包。已发布可信代码可以访问当前租户、当前应用内的资源；function manifest 的 `resources` 是可选映射、审计和影响分析信息，不再是逐函数权限白名单。页面用户仍不能直接提交内部表单，跨应用和跨租户访问仍被拒绝。运行时接口默认需要应用自动化管理权限；普通用户页面要调用时，用 `definitionJson.runtimeInvoke.audience` 声明 `authenticated`、`page_permission_group`、`app_roles`、`platform_roles` 或 `scope_policy`，使用 `roleCodes` 匹配应用角色、使用 `platformRoleCodes` 匹配同步身份 `SCHOOL_GUARDIAN`、`SCHOOL_STUDENT`、`SCHOOL_TEACHER`，不要把 `"*"`、`"all-app-roles"` 写进角色编码。若表单只能由函数/流程写入，在 `src/resources/settings/forms/<formCode>.json` 设置 `runtimeWrite.mode="function_only"` 关闭原始写入接口。

## 5. Inbound Webhook — `src/resources/webhooks/<code>.json`

```json
{
  "code": "yuquan_access",
  "name": "玉泉门禁开门事件",
  "targetFunctionCode": "qfyy_access_event",
  "idempotencyQueryParam": "nonce",
  "maxBodyBytes": 262144,
  "status": "active"
}
```

Webhook 只声明公开入口到固定 App Function 的映射，不包含 Secret 或验签规则。
供应商 Secret 在目标 Function 顶层 `secretRefs` 声明，源码通过
`await ctx.secrets.get(name)` 读取，并且必须在任何表单查询、写入、连接器或通知
调用之前使用 `input.rawBody` 验签。平台保存原始 UTF-8 Body、Base64 Body、原始
Query 字符串、重复参数数组、解析 JSON 和安全请求头；投递为 at-least-once，应用
还必须用 `input.idempotencyKey` 对业务写入做幂等保护。

```bash
openxiangda resource validate webhook --profile <name>
openxiangda resource plan webhook --only yuquan_access --profile <name> --json
openxiangda resource publish webhook --only yuquan_access --change <id> --profile <name>
openxiangda webhook deliveries yuquan_access --profile <name> --json
```

完整 Function 输入、HMAC-SHA1 常量时间比较、返回状态和玉泉门禁示例见
[`webhooks.md`](webhooks.md)。

## 6. Workflow — `src/resources/workflows/<code>/workflow.json`（manifest）+ `src/workflows/<code>/workflow.ts`（代码优先）

```jsonc
// src/resources/workflows/customer_approval/workflow.json
{
  "code": "customer_approval",
  "formCode": "customer",
  "kind": "workflow_v3",
  "definitionFile": "definition.v3.json",
  "previewFile": "preview.json"
}
```

代码优先（推荐）：

```ts
// src/workflows/customer_approval/workflow.ts
import { defineWorkflow } from "openxiangda/workflow";

export default defineWorkflow({
  name: "客户审批",
  trigger: { type: "form_submit", formCode: "customer" },
  nodes: [
    /* approval / copy / branch / js_code 节点 */
  ],
});
```

CLI 编译为 `definition.v3.json` + `preview.json`，平台运行时仍走标准工作流引擎。完整规则见 [`workflow-v3.md`](workflow-v3.md)。

## 7. Automation — `src/resources/automations/<code>/{definition.code.json,preview.json}` + `src/automations/<code>/index.ts`

```jsonc
// src/resources/automations/notify_on_submit/definition.code.json
{
  "code": "notify_on_submit",
  "name": "提交后通知",
  "kind": "automation_code_ts",
  "trigger": {
    "version": 2,
    "mode": "event",
    "event": { "source": "form_data", "action": "submitted" },
    "filters": { "formCode": "customer" }
  },
  "sourceFile": { "localPath": "src/automations/notify_on_submit/index.ts" },
  "previewFile": "preview.json",
  "timeout": 30000
}
```

```ts
// src/automations/notify_on_submit/index.ts
export default async function (ctx) {
  ctx.logger.info("automation start", { formCode: ctx.formData.current.formCode });
  await ctx.notification.sendByType({
    notificationType: "submission_notice",
    recipientId: ctx.operator.userId,
    payload: { /* ... */ },
  });
}
```

`trigger_v2` 事件源：`form_data` / `form_field` / `workflow_task` / `workflow_process` / `mode: "scheduled"`（fixed_time / form_date_field）。完整规则见 [`automation-v3.md`](automation-v3.md)。

## 7. JS_CODE V2 — `src/js-code-nodes/<scriptCode>/index.ts`

JS_CODE V2 适合自动化/流程图里的节点级脚本。跨页面、跨自动化、需要一个稳定后端入口的可复用逻辑优先写 App Function，再用 `function_call` 节点或 `sdk.function.invoke` 调用。

```ts
export default async function (ctx) {
  const { formData, operator, form, dataView, connector, notification, platform, utils, console } = ctx;
  const result = await form.queryMany({
    formCode: "customer",
    filters: [/* 查询条件 */],
  });
  return { count: result.totalCount || result.data?.length || 0 };
}
```

工作流 / 自动化 v3 JSON 节点引用：

```json
{
  "id": "sync_customer",
  "type": "js_code",
  "data": {
    "label": "同步客户",
    "runtimeMode": "trusted_node",
    "sourceType": "file_snapshot",
    "scriptCode": "sync_customer",
    "sourceFile": { "localPath": "src/js-code-nodes/sync_customer/index.ts" },
    "timeout": 30000
  }
}
```

构建：`pnpm build-js-code --script sync_customer`（只校验该入口及其传递/shared/ambient 依赖，再打包到 `dist/js-code-nodes/<code>/index.cjs`；仅无 selector 时全量校验）。CLI validate/create/publish 时会上传快照、用 `{ bucketName, objectName, sha256 }` 替换 `sourceFile.localPath`。

`ctx.methods.*` 仍可用于兼容旧脚本；新脚本优先使用 `ctx.resources`、`ctx.form.queryOne/queryMany/getById/createOne/updateOne/updateById`、`ctx.dataView`、`ctx.connector`、`ctx.notification`、`ctx.platform.roles` 和 `ctx.platform.api`。

## 8. Role — `src/resources/roles/<code>.json`

Before creating roles or permission groups for account/role/data-scope work,
run `openxiangda design gates --topic permissions --json` and choose a
permission mode: `managed-platform-account`,
`existing-platform-user-assignment`, `static-role-permission`, or
`query-param-context`. Query parameters and `PermissionBoundary` are never
sensitive authorization by themselves.

```json
{
  "code": "sales",
  "name": "销售",
  "description": "销售人员"
}
```

Delegated admin roles that manage roles, role members, permission groups, or
organization accounts must also declare API permissions:

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

`apiPermissionMode` is `merge` by default. Use `replace` only when the manifest
should become the full API permission list for that role. Platform role setup
requires platform-admin authority; app roles can only receive app-scoped API
permission codes.

## 9. Page Permission Group — `src/resources/permissions/page-groups/<code>.json`

```json
{
  "code": "sales_pages",
  "name": "销售页面",
  "roles": ["sales"],
  "formCodes": ["customer", "orders"],
  "pageCodes": ["dashboard"]
}
```

`formCodes` / `pageCodes` / `menuCodes` 留空表示对匹配角色全部可见。

## 10. Form Permission Group — `src/resources/permissions/form-groups/<formCode>/<groupCode>.json`

每个表单权限组必须有稳定、唯一的 `code`。同一张表单通常会有多个查看/提交/管理员权限组，不能把 `formCode` 当成权限组 code，否则本地 state 和平台 `resourceCode` 会把不同组混在一起。

```json
{
  "code": "sales_view",
  "name": "销售查看",
  "type": "view",
  "roles": ["sales"],
  "operations": ["view"],
  "dataScope": {
    "type": "expression",
    "match": "all",
    "conditions": [
      { "field": "ownerScopeKey", "op": "=", "valueRef": "currentUser.id" }
    ]
  },
  "fieldPermissions": {
    "internalNote": "hidden",
    "amount": "readonly"
  }
}
```

## 11. Form Settings — `src/resources/settings/forms/<formCode>.json`

```json
{
  "code": "customer",
  "settings": {
    "submitButtonText": "提交",
    "successMessage": "提交成功",
    "runtimeWrite": {
      "mode": "permission_group"
    }
  },
  "indexes": [
    { "fields": ["customerCode"], "unique": true },
    { "fields": ["status", "ownerDept"] }
  ],
  "dataManagement": { "enabled": true, "default": "list" }
}
```

`runtimeWrite.mode` 可选 `permission_group`、`function_only`、`public_form`。内部业务表单需要强制走 App Function / Workflow 时使用 `function_only`；这会关闭页面原始写入接口，但不影响 `ctx.form.createOne/updateOne/updateById` 等受信后端写入。

`publicAccess` 表单 setting 只用于旧 `sy-lowcode-view` 兼容。新 React SPA 公开页面必须使用 `src/resources/routes/` + `src/resources/public-access/` + `OpenXiangdaProvider` + `OpenXiangdaPageProvider` + `PublicAccessGate`。

## 12. Menu — `src/resources/menus/<code>.json`

菜单可以写成单个资源文件，也可以在 `menus.json` 中用 `children` 声明树形结构；`resource validate|plan|publish` 会把 children 展开成独立菜单资源，并自动给子菜单补 `parentCode`。

```json
{
  "code": "main",
  "name": "主菜单",
  "type": "nav",
  "children": [
    { "code": "customer-entry", "name": "客户信息", "type": "receipt", "formCode": "customer" },
    { "code": "orders-entry",   "name": "订单",     "type": "receipt", "formCode": "orders"   },
    { "code": "dashboard-entry","name": "驾驶舱",   "type": "page",    "pageCode": "dashboard" }
  ]
}
```

## 选型决策树

```text
需要展示数据？
├─ 单表 CRUD     → 表单页 + DataManagementList（不要 data view）
├─ 多表只读联表  → src/resources/data-views/（materialized 或 live）
├─ 表单字段下拉  → SelectField + optionSource.type: "linkedForm"（不要 data view）
└─ 大屏 / 报表    → 原生报表 → ECharts page

需要后端逻辑？
├─ 真有审批      → workflow（src/workflows/<code>/workflow.ts）
├─ 状态流转      → 表单 status 字段 + 状态机 + automation
├─ 可复用服务逻辑 → App Function（src/functions/<code>/index.ts + function_call / sdk.function.invoke）
├─ 提交/字段触发 → automation（trigger_v2 + src/automations/<code>/index.ts）
├─ 定时任务      → automation（mode: "scheduled"）
└─ 流程/自动化节点内脚本 → JS_CODE V2 trusted_node（src/js-code-nodes/<code>/index.ts）

需要外部数据？
├─ 第三方 HTTP    → src/resources/connectors/ + sdk.connector.call
└─ 钉钉 / 飞书等  → 同上，平台后端配置 OAuth/AK，前端只引用 connector code
```

## 常见错误

- ❌ 把 `formUuid` / `pageId` 等平台 ID 写进 manifest。**用 code，CLI 自动解析。**
- ❌ 把 API key、token、密码写进 manifest。**用占位符，平台后台填真实值。**
- ❌ 同时在 manifest 与平台后台编辑同一个资源（漂移源）。**统一以 manifest 为单一来源**，需要看平台版本就 `resource pull`。
- ❌ 用 data view 代替 `linkedForm` 下拉、单表 CRUD 或写回。**data view 是只读；materialized 有刷新延迟，live 要控制查询边界。**
- ❌ 把跨页面/跨流程复用的后端逻辑都塞进 JS_CODE。**优先 App Function，JS_CODE 只做节点内脚本。**
- ❌ 在 page 源码里 hardcode `/api/notification-config/*` 或 `/connectors/actions/invoke`。**用 `sdk.notification` / `sdk.connector`。**
- ❌ 发布 workflow resource 后不检查是否激活。**用 `openxiangda workflow list --profile <name> --json` 确认 `isPublished: true`，需要时再跑 `openxiangda workflow publish <workflowCode>`。**
