# Notification Resources

Use notification resources when an App Function, workflow, or automation needs reusable message templates.

AI generation rule: declare notification resources first, then send only from trusted runtime code through `ctx.notification`. Code pages call a named App Function with a business identifier through `sdk.function.invoke`; they never choose effective recipients, rendered content, or channels. Do not hardcode `/api/notification-config/*` or store channel credentials in source.

## Resource Files

Place JSON under `src/resources/notifications/`.

```json
{
  "templates": [
    {
      "code": "reservation_reminder",
      "name": "预约提醒",
      "content": "{{title}}",
      "variables": ["title", "instrumentName", "startTime"],
      "channelsConfig": {
        "inapp": {
          "enabled": true,
          "content": "{{instrumentName}} 将于 {{startTime}} 开始"
        },
        "dingding": {
          "enabled": true,
          "content": "{{title}}"
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

For form-level notifications, add `level: "form"` and `formCode` to both the template and type config. Prefer `formCode`; the CLI resolves `formUuid` per profile.

Allowed channels: `inapp`, `email`, `dingding`, `wechat`, `thirdparty_todo`.

Do not include `token`, `secret`, `password`, `authorization`, `auth`, `credential`, or `headers` fields. Platform admins configure channel credentials outside resources.

## DingTalk Cards

DingTalk notifications prefer cards by default when the tenant has a default card template configured. Application resources should not include `appKey`, `appSecret`, or `agentId`; only override non-secret card settings when the app owns a custom DingTalk card.

Standard card example:

```json
{
  "channelsConfig": {
    "dingding": {
      "enabled": true,
      "content": "{{title}}",
      "config": {
        "deliveryMode": "card_preferred",
        "fallbackToWorkNotice": true,
        "card": {
          "mode": "standard",
          "cardTemplateId": "${DINGTALK_CARD_TEMPLATE_ID}",
          "title": "{{title}}",
          "summary": "{{content}}",
          "jumpUrl": "{{detailUrl}}",
          "fieldConfigs": [
            { "fieldId": "ticketNo", "label": "工单号", "order": 1, "required": false }
          ]
        }
      }
    }
  }
}
```

Delivery modes:

- `card_preferred`: send a DingTalk card first, then fallback to a work notification if card delivery fails.
- `card_only`: card failure is a send failure.
- `work_notice_only`: send only a DingTalk work notification.

Custom cards use the variables defined in the DingTalk developer console:

```json
{
  "deliveryMode": "card_only",
  "card": {
    "mode": "custom",
    "cardTemplateId": "${DINGTALK_TICKET_CARD_ID}",
    "paramMap": {
      "title": "{{title}}",
      "ticketNo": "{{ticketNo}}",
      "status": "{{status}}"
    }
  }
}
```

For DingTalk card components that expect structured JSON, map the card variable
directly to one exact payload placeholder. Arrays and objects are preserved and
serialized as JSON instead of being formatted as display text:

```json
{
  "card": {
    "mode": "custom",
    "cardTemplateId": "${DINGTALK_CARD_TEMPLATE_ID}",
    "paramMap": {
      "title": "{{title}}",
      "contentList": "{{contentList}}"
    }
  }
}
```

```json
{
  "payload": {
    "title": "预约通知",
    "contentList": [
      { "text": "**预约单号：** Y202607130001" },
      { "text": "**仪器名称：** 场发射扫描电镜" }
    ]
  }
}
```

Keep the placeholder as the complete value (`"{{contentList}}"`). Mixing it
with surrounding text intentionally converts the value to display text.

Standard card payload variables include `title`, `lastMessage`, `content`, `contentList`, `jumpUrl`, `createTime`, `status`, `operator`, `currentUser`, `formData.current`, `workflowData`, `variables`, and `app`. General notifications do not show approval buttons by default.

## Runtime Calls

Code pages invoke a named business action. Pass business identifiers, not an
effective recipient, rendered message, or channel list:

```ts
await sdk.function.invoke("send_reservation_reminder", {
  input: { reservationId },
});
```

The App Function checks the operator and current reservation state, resolves the
recipient and template variables from authoritative data, then sends through the
trusted runtime bridge:

```ts
export default async function sendReservationReminder(ctx) {
  const reservation = await loadAuthorizedReservation(ctx.input.reservationId, ctx);
  await ctx.notification.sendByType({
    notificationType: "reservation_reminder",
    recipientId: reservation.ownerUserId,
    payload: {
      title: "预约提醒",
      instrumentName: reservation.instrumentName,
      startTime: reservation.startTime,
    },
  });
}
```

DingTalk-specific read and preview helpers remain available to pages:

```ts
const capabilities = await sdk.notification.capabilities();

const preview = await sdk.notification.previewDingTalk({
  notificationType: "reservation_reminder",
  payload: {
    title: "预约提醒",
  },
});

```

User-facing in-app message centers should read the platform inbox instead of
creating app-specific message/log forms:

```ts
const inbox = await sdk.notification.listInbox({
  page: 1,
  limit: 20,
  readStatus: "unread",
});

await sdk.notification.markRead(messageId);
await sdk.notification.markAllRead();

const unread = await sdk.notification.getUnreadCount();
```

Inbox APIs are app-scoped and only return the current logged-in user's `inapp`
messages. Use `keyword`, `templateCode`, and `readStatus` for server-side
filtering. Do not expose `/api/message/history` to normal users; it is an
administrative send-history surface.

CLI smoke tests:

```bash
openxiangda notification preview reservation_reminder --body-json '{"payload":{"title":"测试"}}'
openxiangda notification capabilities --json
openxiangda notification dingding-preview reservation_reminder --body-json '{"payload":{"title":"测试"}}'
openxiangda notification dingding-preview --template-code reservation_reminder --body-json '{"payload":{"title":"测试"}}'
openxiangda function invoke send_reservation_reminder --body-json '{"input":{"reservationId":"RESERVATION_ID"}}'
```

App Function, Automation, or workflow JS_CODE:

```ts
export default async function notify(ctx) {
  await ctx.notification.sendByType({
    notificationType: "reservation_reminder",
    recipientId: ctx.operator.userId,
    payload: {
      title: "预约提醒",
      instrumentName: ctx.formData.current.instrument_name,
      startTime: ctx.formData.current.start_time,
    },
  });

  await ctx.notification.previewDingTalk({
    notificationType: "reservation_reminder",
    payload: { title: "预约提醒" },
  });
}
```

Use `work_notification` for simple declarative notifications. Use JS_CODE only for dynamic recipients, conditional sending, or payload assembly.
