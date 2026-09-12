# OpenXiangda 1.x Inbound Webhooks

Inbound Webhook 用于让门禁、支付、IoT 等外部系统主动调用 OpenXiangda
应用。平台只负责通用接入：接收和保存原始请求、限制大小、按幂等键串行化、
调用唯一绑定的 App Function，并把 Function 的处理结果映射为稳定 HTTP 状态。
供应商签名规则、事件筛选和业务写入始终属于应用 Function。

## 声明 Webhook

在 `src/resources/webhooks/<code>.json` 创建 Manifest：

```json
{
  "code": "yuquan_access",
  "name": "玉泉门禁开门事件",
  "description": "接收 REC_SUCCESS 事件并匹配琴房预约",
  "targetFunctionCode": "qfyy_access_event",
  "idempotencyQueryParam": "nonce",
  "maxBodyBytes": 262144,
  "status": "active"
}
```

- `targetFunctionCode` 必须是同一租户、同一应用内已经启用的 Function。
- `idempotencyQueryParam` 默认是 `nonce`。该参数为空时，平台使用请求摘要。
- `maxBodyBytes` 默认 256 KiB，允许范围为 1 KiB 到 1 MiB。
- 平台网关对公开入口统一限制 1 MiB，并按来源 IP 限制 100 请求/秒、突发
  200；超限返回 429。该限制不代替验签和业务幂等。
- Manifest 不得包含 Webhook Secret、签名算法或供应商凭据。
- 发布后从 `.openxiangda/state.json` 的
  `resources.webhooks.<code>.callbackUrl` 取得完整回调地址；`callbackPath` 是相对
  当前 profile API base（通常为 `<origin>/service`）的路径。不要自行用 `appType`
  拼接公开 URL。

## 声明和配置 Secret

Webhook Secret 使用现有 App Function Secret。Function 必须使用
`function_v2 + trusted_node_v2`，并在 Manifest 顶层声明引用：

```json
{
  "code": "qfyy_access_event",
  "name": "处理玉泉门禁事件",
  "secretRefs": [
    { "name": "yuquan_webhook_secret", "required": true }
  ],
  "definitionJson": {
    "version": "function_v2",
    "runtimeMode": "trusted_node",
    "runtimeContractVersion": "trusted_node_v2",
    "timeoutMs": 30000,
    "sourceFile": {
      "localPath": "src/functions/qfyy_access_event/index.ts"
    }
  },
  "status": "active"
}
```

Webhook Function 的 `timeoutMs` 必须在 1 到 120000 毫秒之间。平台在配置和
每次调用时都会重新校验运行时契约，Function 后续被禁用、降级为旧运行时或把
超时调到上限之外时，Webhook 会返回可重试的非 2xx，而不会以宽权限身份执行。

Secret 值只通过隐藏输入或标准输入写入平台：

```bash
openxiangda secret create yuquan_webhook_secret \
  --value-stdin --change <change-id> --profile <name>
```

禁止把值写进 Webhook/Function Manifest、源码、`.env`、日志、异常或函数返回值。

## Function 输入

Function 的第二个参数和 `ctx.input` 都是以下对象：

```ts
interface WebhookInput {
  deliveryId: string;
  idempotencyKey: string;
  webhookCode: string;
  receivedAt: string;
  rawBody: string;
  rawBodyBase64: string;
  rawQueryString: string;
  query: Record<string, string[]>;
  headers: Record<string, string[]>;
  body: unknown;
  request: { method: "POST"; path: string };
}
```

`query` 保留重复参数及其顺序。`rawBody` 是签名使用的原始 UTF-8 文本；
`body` 只用于验签成功后的业务解析。平台会从 `headers` 中移除 Authorization、
Cookie、代理凭据和客户端证书头。

## 验签顺序

验签、时间窗和事件来源检查必须发生在任何 `ctx.form`、`ctx.dataView`、
`ctx.connector`、`ctx.notification`、`ctx.platform` 或 `ctx.utils.http` 调用之前。
永远不要对 `input.body` 再 `JSON.stringify` 后验签，空格、字段顺序或转义变化会
使签名失真。

下面展示 HMAC-SHA1 和常量时间比较。`buildCanonicalText` 只是结构示例；必须按
供应商正式文档确认字段顺序、分隔符、URL 编码和 hex/base64 输出格式：

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import type { AppFunctionContextV2 } from "openxiangda/runtime";

type WebhookInput = {
  deliveryId: string;
  idempotencyKey: string;
  rawBody: string;
  query: Record<string, string[]>;
  body: unknown;
};

function first(query: Record<string, string[]>, name: string) {
  return String(query[name]?.[0] || "");
}

function equalEncodedSignature(actual: string, expected: string) {
  const left = Buffer.from(actual.trim().toLowerCase(), "utf8");
  const right = Buffer.from(expected.trim().toLowerCase(), "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function buildCanonicalText(input: WebhookInput) {
  // Replace this illustrative order with the provider's exact contract.
  return [
    first(input.query, "nonce"),
    first(input.query, "timestamp"),
    first(input.query, "orgId"),
    input.rawBody,
  ].join("");
}

export default async function handleWebhook(
  ctx: AppFunctionContextV2,
  input: WebhookInput,
) {
  const secret = await ctx.secrets.get("yuquan_webhook_secret");
  const expected = createHmac("sha1", secret)
    .update(buildCanonicalText(input), "utf8")
    .digest("hex");
  const actual = first(input.query, "signature");
  if (!actual || !equalEncodedSignature(actual, expected)) {
    return { webhook: { outcome: "rejected", status: 401 } };
  }

  const timestamp = Number(first(input.query, "timestamp"));
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 5 * 60_000) {
    return { webhook: { outcome: "rejected", status: 401 } };
  }

  const event = input.body as {
    callbackTag?: string;
    data?: {
      isAuth?: boolean;
      deviceSn?: string;
      jobNum?: string;
      recognizeTime?: string;
      recognizeType?: number;
      memberId?: string;
      personType?: number;
    };
  };
  if (event.callbackTag !== "REC_SUCCESS" || event.data?.isAuth !== true) {
    return { webhook: { outcome: "ignored" } };
  }

  // The application must atomically claim input.idempotencyKey in its own
  // business record before creating/updating reservation data.
  await processAccessEventIdempotently(ctx, input.idempotencyKey, event.data);
  return { webhook: { outcome: "accepted" } };
}
```

`processAccessEventIdempotently` 是应用函数中的业务实现，不是平台内置 API。应把
`idempotencyKey` 写入带唯一约束或等价原子保护的业务记录，然后再执行副作用。
平台提供 at-least-once 投递；如果 Function 已产生副作用，但进程在成功回执落库前
中断，同一事件会再次执行。

## 返回契约

- 普通返回，或 `{ webhook: { outcome: "accepted" } }`：HTTP 200。
- `{ webhook: { outcome: "ignored" } }`：HTTP 200，适合已验签但无需处理的事件。
- `{ webhook: { outcome: "rejected", status: 400|401|403|409|422 } }`：指定 4xx。
- `{ webhook: { outcome: "retry" } }` 或抛出异常：HTTP 503，通知供应商重试。

平台不会把 Function 返回值、日志、异常详情或 Secret 回显给外部调用方。
投递原始请求和审计信息默认保留 180 天，由平台部署环境统一配置；应用不应把
Webhook 投递表当作永久业务档案，需要长期保存的字段应在验签后写入自己的表单。

## 校验、发布和诊断

```bash
openxiangda resource validate webhook --profile <name>
openxiangda resource plan webhook --only yuquan_access --profile <name> --json
openxiangda resource publish webhook --only yuquan_access \
  --change <change-id> --profile <name>

openxiangda webhook list --profile <name> --json
openxiangda webhook get yuquan_access --profile <name> --json
openxiangda webhook deliveries yuquan_access --profile <name> --json
openxiangda webhook delivery yuquan_access <delivery-id> --profile <name> --json
openxiangda webhook disable yuquan_access \
  --change <change-id> --profile <name>
```

先发布并验证 Function，再启用 Webhook。新 Function 与 Webhook 同轮交付时，可以
先以 `status: "disabled"` 发布 Webhook，验证 Function 后再把状态改为 `active`。
