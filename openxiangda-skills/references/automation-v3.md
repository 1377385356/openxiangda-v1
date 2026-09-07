# Automation V3 Reference

Automations have two files:

- `trigger.json`: when the automation runs.
- `automation.json`: what the automation does.

## Trigger Config

Automation can run from form events, workflow events, fixed cron schedules, or a form date field reaching a configured time. Pair these triggers with JS_CODE when the action must execute on the backend and cannot be handled reliably by a frontend page.

AI-authored automations must use `trigger_v2`. The CLI passes this JSON through unchanged and only fills the root `appType` and `formUuid` when they are missing and can be resolved from the active workspace/profile.

Form submit trigger:

```json
{
  "version": "trigger_v2",
  "mode": "event",
  "appType": "APP_XXX",
  "formUuid": "FORM_XXX",
  "enabled": true,
  "event": {
    "source": "form_data",
    "action": "submitted"
  },
  "filters": {
    "conditions": []
  }
}
```

Form update/delete triggers use the same shape with `event.action` set to `updated` or `deleted`. Update events expose `ctx.formData.current`, `ctx.formData.previous`, `ctx.formData.changes`, and `ctx.triggerEvent.data.metadata.changeRecords`.

Form field change trigger:

```json
{
  "version": "trigger_v2",
  "mode": "event",
  "appType": "APP_XXX",
  "formUuid": "FORM_XXX",
  "enabled": true,
  "event": {
    "source": "form_field",
    "action": "changed"
  },
  "filters": {
    "fieldChange": {
      "fieldId": "status",
      "changeType": "to_value",
      "toValue": "approved"
    }
  }
}
```

`fieldChange.changeType` can be `any`, `from_to`, `to_value`, or `from_value`.

Workflow task trigger:

```json
{
  "version": "trigger_v2",
  "mode": "event",
  "appType": "APP_XXX",
  "formUuid": "FORM_XXX",
  "enabled": true,
  "event": {
    "source": "workflow_task",
    "action": "approved"
  },
  "filters": {
    "workflow": {
      "processDefinitionId": "workflow-id",
      "nodeId": "approval-node-id",
      "operatorId": "",
      "assigneeId": "",
      "previousAssigneeId": ""
    }
  }
}
```

Workflow task actions are `approved`, `rejected`, `returned`, `transferred`, and `cancelled`. Returned task events include `ctx.workflowData.targetNodeId` and `ctx.workflowData.targetNodeName` when the platform can resolve the target node.

Workflow process trigger:

```json
{
  "version": "trigger_v2",
  "mode": "event",
  "appType": "APP_XXX",
  "formUuid": "FORM_XXX",
  "enabled": true,
  "event": {
    "source": "workflow_process",
    "action": "rejected"
  },
  "filters": {
    "workflow": {
      "processDefinitionId": "workflow-id",
      "finalResult": "rejected"
    }
  }
}
```

Workflow process actions are `started`, `approved`, `rejected`, `terminated`, and `withdrawn`. Final approval is backed by `workflow_process_completed`; final rejection is backed by `workflow_process_terminated` with `finalResult: "rejected"`; manual termination uses `finalResult: "terminated"`.

Fixed-time scheduled trigger:

```json
{
  "version": "trigger_v2",
  "mode": "scheduled",
  "appType": "APP_XXX",
  "enabled": true,
  "schedule": {
    "type": "fixed_time",
    "fixedTime": {
      "startTime": "2026-05-21T09:00:00+08:00",
      "cronExpression": "0 0 9 * * *",
      "maxExecutions": 1
    }
  }
}
```

Form date-field scheduled trigger:

```json
{
  "version": "trigger_v2",
  "mode": "scheduled",
  "appType": "APP_XXX",
  "formUuid": "FORM_XXX",
  "enabled": true,
  "schedule": {
    "type": "form_date_field",
    "formDateField": {
      "fieldId": "dueAt",
      "startOffset": {
        "type": "before",
        "days": 1,
        "time": "09:00:00"
      },
      "endFieldId": "",
      "cronExpression": "0 0 9 * * *",
      "maxExecutions": 1
    }
  }
}
```

Use CLI flags such as `--form-code customer` so the CLI can fill `formUuid` from the current profile. Do not hardcode IDs from another profile.

## Definition JSON

AI-authored automations should prefer code-first definitions when the logic is mainly backend orchestration and does not need a visual editable canvas.

Code automation definition:

```json
{
  "kind": "automation_code_ts",
  "version": "code_v1",
  "runtimeMode": "trusted_node",
  "sourceType": "file_snapshot",
  "scriptCode": "daily_ticket_digest",
  "sourceFile": {
    "localPath": "src/automations/daily_ticket_digest/index.ts"
  },
  "timeoutMs": 30000
}
```

Author source in `src/automations/<resourceCode>/index.ts`. During validate/create/publish, the CLI runs `pnpm build-js-code --script <resourceCode> --source automations`, uploads `dist/automations/<resourceCode>/index.cjs`, and replaces `sourceFile.localPath` with immutable snapshot metadata.

Pair it with a structured preview file:

```json
{
  "kind": "automation_code_preview",
  "version": "preview_v1",
  "steps": [
    { "id": "load", "type": "data_read", "label": "查询待处理数据" },
    { "id": "notify", "type": "notification", "label": "发送提醒" }
  ],
  "edges": [{ "source": "load", "target": "notify" }]
}
```

Resource manifest shape:

```json
{
  "code": "daily_ticket_digest",
  "name": "每日工单摘要",
  "triggerConfig": {
    "version": "trigger_v2",
    "mode": "scheduled",
    "enabled": true,
    "schedule": {
      "type": "fixed_time",
      "fixedTime": {
        "startTime": "2026-05-21T09:00:00+08:00",
        "cronExpression": "0 0 9 * * *"
      }
    }
  },
  "definitionFile": "definition.code.json",
  "previewFile": "preview.json",
  "publish": true,
  "enable": true
}
```

Minimum shape:

```json
{
  "version": "v3",
  "nodes": [
    { "id": "start", "type": "start", "data": { "label": "开始" } },
    { "id": "notify", "type": "work_notification", "data": { "label": "通知" } },
    { "id": "end", "type": "end", "data": { "label": "结束" } }
  ],
  "edges": [
    { "id": "e1", "source": "start", "target": "notify" },
    { "id": "e2", "source": "notify", "target": "end" }
  ]
}
```

Supported node types:

- `start`
- `end`
- `condition`
- `condition_branch`
- `branch`
- `js_code`
- `data_retrieve_single`
- `data_retrieve_batch`
- `data_create`
- `data_update`
- `connector_call`
- `callback_wait`
- `work_notification`
- `dingtalk_card`

## JS_CODE V2

Use trusted Node JS_CODE nodes for AI/admin automation logic that runs after an automation trigger. Typical cases include scheduled data cleanup, date-field reminders, cross-form synchronization after submit/update/delete, workflow-completed follow-up writes, calling internal platform APIs, calling external HTTP services, and other backend-only orchestration.

For reusable backend logic that should be shared by pages, multiple automations, and workflows, prefer an App Function under `src/functions/<functionCode>/index.ts` plus `src/resources/functions/<functionCode>.json`. Automation graphs can call it with a `function_call` node:

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

Use JS_CODE V2 when the script is local to one automation graph node.

```json
{
  "id": "sync_customer",
  "type": "js_code",
  "data": {
    "label": "同步客户",
    "runtimeMode": "trusted_node",
    "sourceType": "file_snapshot",
    "scriptCode": "sync_customer",
    "sourceFile": {
      "localPath": "src/js-code-nodes/sync_customer/index.ts"
    },
    "timeout": 30000
  }
}
```

Author source in `src/js-code-nodes/<scriptCode>/index.ts`. AI-authored source must be TypeScript. Build with `pnpm build-js-code --script <scriptCode>`; the explicit selector typechecks only that entry plus its transitive/shared/ambient dependencies before bundling, while an unscoped build validates the whole workspace. During validate/create, the CLI uploads the generated bundle, replaces `sourceFile.localPath` with `{ bucketName, objectName, sha256, ... }`, and the backend verifies sha256 before execution.

The backend runs the snapshot in the trusted Node runtime, applies the node timeout (`30000` ms by default), stores execution logs, and writes the returned value to the node output and `variables.node_<nodeId>`. Scripts may use `export default async function (ctx) {}`, `module.exports = async (ctx) => {}`, `require`, `process`, `Buffer`, arbitrary HTTP, and `platform.api` for `/openxiangda-api/v1`.

Runtime context includes `ctx.triggerEvent`, `ctx.formData`, `ctx.workflowData`, `ctx.operator`, `ctx.app`, `ctx.variables`, and `ctx.node`. Prefer the higher-level resource helpers when available: `ctx.resources.resolveForm/resolveDataView/resolveConnector`, `ctx.form.queryOne/queryMany/getById/createOne/updateOne/updateById`, `ctx.files.readAsBase64`, `ctx.dataView.query/stats`, `ctx.connector.call/invoke`, `ctx.notification.*`, `ctx.platform.roles.*`, and `ctx.platform.api.*`. `ctx.files.readAsBase64` reads only server-authorized image attachments from current form data or an explicit form record/field reference, never an arbitrary URL; the file limit is 10 MiB and its Base64 result must not be logged or persisted. Use `ctx.platform.roles.findByCode/addUsers/removeUser` for app role member synchronization; raw `ctx.platform.api.*` returns an HTTP response and platform envelope. Published App Function and trusted-node code may write forms in its current tenant/application; per-resource declarations are mapping and audit metadata, not an application-internal allowlist. This does not grant page users direct submit access, so keep internal forms closed to raw user submission unless the business requires it. Legacy data/process bridge methods remain available as `ctx.methods.queryOneData`, `queryManyData`, `getDataByFormInstanceId`, `updateOneData`, `updateDataByFormInstanceId`, `updateManyData`, `createOneData`, `terminateProcess`, and `getAllParentDepartments`.

Code automation also exposes `ctx.logger.debug/info/warn/error(message, data?)`. AI-authored code should log input parsing, query conditions, external calls, writes, branch decisions, and caught errors. Logs are stored as full raw execution data by default. Use CLI diagnosis commands:

```bash
openxiangda automation executions daily_ticket_digest --status failed --profile dev
openxiangda automation logs <instanceId> --automation daily_ticket_digest --profile dev
openxiangda automation diagnose daily_ticket_digest --profile dev
```

Notification bridge methods include `ctx.notification.sendByType`, `batchSendByType`, `findConfig`, and `previewTemplate`. For custom business messages, create `src/resources/notifications/` first and use its `notificationType`; do not call legacy `/api/notification-config/*` endpoints directly.

Example `src/js-code-nodes/scheduled_reconcile/index.ts`:

```ts
export default async function scheduledReconcile(ctx) {
  const appType = ctx.app.appType;
  const current = ctx.formData?.current || {};
  const formInstanceId =
    ctx.triggerEvent?.data?.formInstanceId ||
    current.formInstanceId ||
    current.formInstId;

  const pendingRows = await ctx.methods.queryManyData(appType, "FORM_ORDER", {
    status: "pending",
  });

  if (formInstanceId) {
    await ctx.methods.updateDataByFormInstanceId(
      appType,
      "FORM_ORDER",
      formInstanceId,
      { last_checked_at: new Date().toISOString() }
    );
  }

  const log = await ctx.methods.createOneData(appType, "FORM_JOB_LOG", {
    trigger_type: ctx.triggerEvent?.type || "scheduled",
    processed_count: Array.isArray(pendingRows) ? pendingRows.length : 0,
  });

  return {
    processedCount: pendingRows?.length || 0,
    logId: log?.formInstanceId || log?.id,
  };
}
```

Validation rules:

- `version` must be `v3`.
- `nodes` and `edges` must be arrays.
- Exactly one `start` node is required.
- Each node needs `id`, `type`, and object `data`.
- Each edge needs `id`, `source`, and `target`.
- Use `openxiangda automation validate --strict` before publishing.
