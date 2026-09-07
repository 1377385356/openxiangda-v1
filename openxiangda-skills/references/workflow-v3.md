# Workflow V3 Reference

Workflow definitions are v3 graph JSON objects saved by `openxiangda workflow create`.

AI-authored workflows should prefer the compile-time TypeScript DSL. The SDK compiles local `workflow.ts` into the current v3 graph JSON, so the backend still uses the existing workflow engine for approval tasks, copy tasks, return/resubmit, transfer, callback waits, branch advancement, operation logs, notifications, and process completion events. Write raw JSON only when repairing a pulled designer definition.

Example `src/workflows/expense_approval/workflow.ts`:

```ts
import { defineWorkflow } from "openxiangda/workflow";

export default defineWorkflow({
  build(flow) {
    const start = flow.start();
    const approve = flow.approval("manager_approval", {
      label: "主管审批",
      approverType: "ext_target_approval",
      approvals: ["USER_MANAGER"],
      approvalNames: ["主管"],
      multiApprove: "or",
      actions: [
        flow.action.approve("通过"),
        flow.action.reject("驳回"),
        flow.action.transfer(),
        flow.action.return(),
      ],
      returnPolicy: { scopeType: "initiator", resubmitMode: "resume_current" },
      fieldPermissions: [{ fieldId: "amount", fieldBehavior: "READONLY" }],
    });
    const sync = flow.functionCall("sync_budget", {
      functionCode: "sync_budget",
      input: { amount: "{{form.amount}}" },
      saveResponseTo: "budgetResult",
    });
    const copy = flow.copy("copy_finance", {
      label: "抄送财务",
      approverType: "ext_target_approval",
      approvals: ["USER_FINANCE"],
      approvalNames: ["财务"],
    });
    const end = flow.end();
    flow.sequence(start, approve, sync, copy, end);
  },
});
```

For compact AI-authored drafts, `flow.define` is also exported. It accepts
declarative node and edge helpers, then compiles to the same v3 JSON:

```ts
import { flow } from "openxiangda/workflow";

export default flow.define({
  name: "费用审批",
  formUuid: "FORM_UUID",
  nodes: [
    flow.start("start"),
    flow.approval("manager_approval", {
      label: "主管审批",
      assignees: [flow.assignee.initiator()],
      actions: [
        flow.action.approve("通过"),
        flow.action.returnToInitiator(),
        flow.action.transfer(),
      ],
      fieldPermissions: { amount: "readonly" },
    }),
    flow.functionCall("sync_budget", {
      functionName: "sync_budget",
      input: { amount: "${amount}" },
    }),
    flow.end("end"),
  ],
  edges: [
    flow.connect("start", "manager_approval"),
    flow.connect("manager_approval", "sync_budget"),
    flow.connect("sync_budget", "end"),
  ],
});
```

Resource manifest:

```json
{
  "code": "expense_approval",
  "formCode": "expense",
  "workflowFile": "../../../workflows/expense_approval/workflow.ts",
  "definitionFile": "definition.v3.json",
  "previewFile": "preview.json",
  "publish": true
}
```

During `openxiangda resource validate`, `resource plan`, and `resource publish --dry-run`, the CLI compiles `workflowFile` without writing generated files or platform resources. During real `openxiangda resource publish`, the CLI compiles `workflowFile`, writes `definitionFile` and `previewFile` when configured, sends v3 `definitionJson` to the backend, and stores the preview in `viewJson` for read-only frontend display.

Compile locally before publishing:

```bash
openxiangda workflow compile src/workflows/expense_approval/workflow.ts --check
openxiangda workflow compile src/workflows/expense_approval/workflow.ts --stdout
openxiangda workflow compile src/workflows/expense_approval/workflow.ts \
  --out-definition src/resources/workflows/expense_approval/definition.v3.json \
  --out-preview src/resources/workflows/expense_approval/preview.json
```

Runtime pages should not guess buttons. Use `sdk.process.resolveCapabilities(...)` or the React helpers from `openxiangda/runtime/react`: `useProcessCapabilities`, `useProcessActions`, `ProcessActionBar`, `ProcessTimeline`, `ProcessPreviewPanel`, and `InitiatorApproverSelector`. The capability protocol returns `visible`, `enabled`, `disabledReason`, `paramsSchema`, `uiSchema`, return candidates, field permissions, and refresh hints for operations such as approve, reject, transfer, return, save, withdraw, resubmit, callback, retryException, and adminTransfer.

Runtime todo, done, cc, and initiated lists should use `sdk.workCenter.listItems({ boxType })` plus `sdk.workCenter.getStats()`. These APIs return the current user's projected work-center items with pagination, app/form filters, status/result filters, `actionUrl`, `formUuid`, `formInstanceId`, `taskId`, and node/title snapshots. Do not query workflow operation logs, automation logs, or raw process task tables for end-user task-center pages.

For delayed approval start, do not submit a process form and then delete/recreate records. Save the process-form instance without starting workflow via `StandardFormPage submitBehavior="save-draft"` or `sdk.form.create({ formUuid, data, saveAsDraft: true, startProcess: false })`. Later start approval on that same `formInstId` with `sdk.process.startFromExistingInstance({ formUuid, formInstId })` or `StandardFormPage submitBehavior="start-existing-process"`.

For return-to-initiator workflows, prefer `returnPolicy: { scopeType: "initiator", resubmitMode: "resume_current" }` or `flow.action.returnToInitiator()`. The runtime capabilities protocol exposes `resubmit` only on pending `originator_return` tasks. If a user returns to a previous approval node, continuing the flow is a normal `approve` action on that returned approval task.

## Cookbook: draft, start, return, resubmit

Use this pattern when the business user creates real data first and starts approval later from the same form instance. Do not copy the draft into a new process record.

1. Define a semantic workflow with an approval node that can save, return to the initiator, and resume the current approval after resubmission:

   ```ts
   import { defineWorkflow } from "openxiangda/workflow";

   export default defineWorkflow({
     build(flow) {
       const start = flow.start();
       const approval = flow.approval("manager_approval", {
         label: "Manager approval",
         approverType: "ext_target_approval",
         approvals: ["USER_MANAGER"],
         approvalNames: ["Manager"],
         actions: [
           flow.action.approve("Approve"),
           flow.action.reject("Reject"),
           flow.action.save("Save"),
           flow.action.transfer("Transfer"),
           flow.action.returnToInitiator("Return to initiator", {
             resubmitMode: "resume_current",
           }),
         ],
         returnPolicy: {
           scopeType: "initiator",
           resubmitMode: "resume_current",
         },
       });
       flow.sequence(start, approval, flow.end());
     },
   });
   ```

2. Publish the process form before publishing the workflow resource. The form publish initializes the process-form storage table used by delayed starts:

   ```bash
   openxiangda workspace publish --form expense --profile dev
   openxiangda workflow compile src/workflows/expense_approval/workflow.ts --check
   openxiangda resource publish --profile dev --dry-run
   openxiangda resource publish --profile dev
   openxiangda workflow list --profile dev --json
   ```

   If the target workflow is a draft after resource publish, run `openxiangda workflow publish <workflowCode> --profile dev` until `isPublished: true` is visible.

3. Save the process-form record without starting approval:

   ```tsx
   await sdk.form.create({
     formUuid,
     data: draftValues,
     saveAsDraft: true,
     startProcess: false,
   });
   ```

   Standard form pages can use the built-in behavior:

   ```tsx
   <StandardFormPage
     schema={schema}
     mode="submit"
     submitBehavior="save-draft"
   />
   ```

4. Later, start approval on the same `formInstId`. The current operator becomes the workflow initiator by default:

   ```tsx
   await sdk.process.startFromExistingInstance({
     formUuid,
     formInstId,
     updateFormDataJson: JSON.stringify(finalValues),
     submissionDepartmentId,
     selectedApprovers,
   });
   ```

   Standard form pages can start approval in place:

   ```tsx
   <StandardFormPage
     schema={schema}
     mode="submit"
     formInstanceId={formInstId}
     submitBehavior="start-existing-process"
   />
   ```

5. In a custom detail page, render operations from capabilities instead of hard-coded buttons:

   ```tsx
   import {
     ProcessActionBar,
     ProcessTimeline,
     useProcessCapabilities,
   } from "openxiangda/runtime/react";

   export function ContractApprovalPanel({ formUuid, formInstId, getValues }) {
     const capabilityParams = { formUuid, formInstId };
     const process = useProcessCapabilities(capabilityParams);

     return (
       <>
         <ProcessActionBar
           capabilities={process.capabilities}
           formUuid={formUuid}
           getFormValues={getValues}
           onRefreshCapabilities={process.refresh}
         />
         <ProcessTimeline capabilities={process.capabilities} />
       </>
     );
   }
   ```

6. Return-to-initiator flow:

   - Approver executes the `return` operation. For initiator return, the return candidate normally has `nodeId: "__originator__"` or equivalent initiator metadata.
   - Initiator resolves capabilities for the same `formInstId` or returned `taskId`; the current task should be `nodeType: "originator_return"`.
   - Initiator executes `resubmit` with updated form data.
   - With `resubmitMode: "resume_current"`, the engine restores the source approval task. The next capabilities response should show an approval task again, often with `taskKind: "resume"`.
   - The approver then uses the normal `approve` action. Final form search snapshots should show `processInstanceStatus: "completed"` and `approvalResult: "approved"`.

## Capability action reference

Always call `sdk.process.resolveCapabilities(...)` first. It returns instance state, current task, field permissions, timeline, and `operations`. Each operation includes `key`, `label`, `visible`, `enabled`, `disabledReason`, `taskId`, `instanceId`, `nodeId`, `paramsSchema`, `uiSchema`, `returnableNodes`, and `refreshHints`. Render only operations where `visible !== false`; if `enabled === false`, show `disabledReason`.

Use `paramsSchema` and `uiSchema` as the source of truth for dialogs. Do not hard-code which operation needs a modal or which fields are required.

| Operation | When it appears | SDK method | Required IDs | Common params |
| --- | --- | --- | --- | --- |
| `startProcess` | Saved process-form instance that has no workflow instance yet | `sdk.process.startFromExistingInstance` | `formUuid`, `formInstId` / `formInstanceId` | `updateFormDataJson`, `submissionDepartmentId`, `selectedApprovers`, `initiatorSelectedApprovers` |
| `approve` | Current user has a pending approval task | `sdk.process.approve` | `instanceId` (process instance ID, not task ID) | `comments`, `updateFormDataJson` |
| `reject` | Current user can reject the pending approval task | `sdk.process.reject` | `instanceId` (process instance ID, not task ID) | `comments`, `updateFormDataJson` |
| `save` | Current task allows editing without advancing the workflow | `sdk.process.saveTask` | `instanceId`, `formUuid` | `updateFormDataJson`, `comments` |
| `transfer` | Current user can transfer the current task | `sdk.process.transferTask` | `taskId` | `newAssignee`, `reason` |
| `return` | Current approval task has return candidates | `sdk.process.returnTask` | `taskId`, `targetNodeId` | `reason`; choose `targetNodeId` from `operation.returnableNodes` |
| `withdraw` | Initiator can withdraw a running process | `sdk.process.withdraw` | `instanceId` | `reason` |
| `resubmit` | Initiator is handling an `originator_return` task | `sdk.process.resubmitTask` | `taskId`, `formUuid` | `updateFormDataJson`, `comments`, `selectedApprovers`, `initiatorSelectedApprovers` |
| `callback` | Process is waiting on a callback task | `sdk.process.triggerCallback` | `taskId` | `payload` |
| `retryException` | Process instance is in exception state and user can retry | `sdk.process.retryException` | `instanceId` | none |
| `adminTransfer` | App/platform admin can reassign a task | `sdk.process.adminTransferTask` | `taskId` | `newAssignee`, `reason` |

Recommended custom dispatcher:

```ts
const caps = await sdk.process.resolveCapabilities({ formUuid, formInstId });
const op = caps.result.operations.find((item) => item.key === "return");
if (!op?.enabled) throw new Error(op?.disabledReason || "return unavailable");

await sdk.process.returnTask({
  taskId: String(op.taskId),
  targetNodeId: String(op.returnableNodes?.[0]?.nodeId),
  reason: "Need more information",
});
```

After every successful action, refresh the surfaces listed by `operation.refreshHints`. In most pages this means reloading capabilities, process basic/progress, timeline, and form data. `ProcessActionBar` does this when `onRefreshCapabilities` or `capabilityParams` is provided.

Troubleshooting:

- If `approve` or `reject` returns "process instance not found", check that the request used `instanceId`, not `taskId`.
- If `return` has no valid target, inspect `operation.returnableNodes` and the workflow node `returnPolicy`; do not invent a node ID.
- If `resubmit` is missing, make sure the active task is `originator_return`; a task returned to a previous approval node continues with normal `approve`.
- If a workflow created by `resource publish` is not active, run `openxiangda workflow list --profile <name> --json` and publish the workflow until `isPublished: true`.
- If `workflow list` shows a row with empty `resourceCode`, it is a platform shell workflow. The default list hides those rows; use `--all` only for raw diagnostics.

Minimum shape:

```json
{
  "version": "v3",
  "nodes": [
    { "id": "start", "type": "start", "data": { "label": "开始" } },
    { "id": "approve", "type": "approval", "data": { "label": "审批" } },
    { "id": "end", "type": "end", "data": { "label": "结束" } }
  ],
  "edges": [
    { "id": "e1", "source": "start", "target": "approve" },
    { "id": "e2", "source": "approve", "target": "end" }
  ],
  "flowConfig": {}
}
```

Rules:

- `nodes` and `edges` must be arrays.
- `version` must be `v3`.
- Publishing requires one `start` node and at least one `end` node.
- Each node needs `id`, `type`, and object `data`.
- Edges must reference existing node IDs.
- Keep live platform IDs out of the JSON when possible. Resolve `formUuid` and `workflowId` through CLI state.
- JS_CODE V2 supports trusted Node execution. For AI/admin logic use `runtimeMode: "trusted_node"`.

Supported node types:

- `start`
- `approval`
- `condition`
- `condition_branch`
- `end`
- `copy`
- `js_code`
- `branch`
- `data_retrieve_single`
- `data_retrieve_batch`
- `data_create`
- `data_update`
- `loop_container`
- `connector_call`
- `function_call`
- `callback_wait`
- `work_notification`
- `dingtalk_card`

## JS_CODE V2

Workflow JS_CODE runs on the backend when the process reaches the `js_code` node. Use it before or after approval nodes, in branches, or before ending a process when the workflow needs server-side side effects such as cross-form synchronization, audit record creation, external API calls, or terminating a related process. Do not use it for frontend-only behavior.

Inline:

```json
{
  "id": "calc",
  "type": "js_code",
  "data": {
    "label": "计算",
    "runtimeMode": "trusted_node",
    "sourceType": "inline",
    "code": "const crypto = require('crypto'); variables.hash = crypto.createHash('sha256').update('x').digest('hex'); return variables.hash;",
    "timeout": 30000
  }
}
```

File snapshot:

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

AI-authored JS_CODE source must be TypeScript under `src/js-code-nodes/<scriptCode>/index.ts`. When validating or creating, the CLI runs `pnpm build-js-code --script <scriptCode>`, which typechecks only the selected entry plus its transitive/shared/ambient dependencies, bundles to `dist/js-code-nodes/<scriptCode>/index.cjs`, uploads the bundle, and replaces `sourceFile.localPath` with immutable snapshot metadata. An intentionally unscoped build retains full-workspace TypeScript validation. The backend verifies snapshot `sha256`, runs it in the trusted Node runtime, applies the node timeout (`30000` ms by default), stores console/runtime logs in the execution record, and writes the returned value to the node output and `variables.node_<nodeId>`.

For reusable backend logic that should be shared by pages, automations, and workflows, prefer an App Function under `src/functions/<functionCode>/index.ts` plus `src/resources/functions/<functionCode>.json`. Workflow graphs that support App Function nodes can call it with:

```json
{
  "id": "call_summary",
  "type": "function_call",
  "data": {
    "functionCode": "reservation_reminder_summary",
    "input": { "scope": "process" },
    "saveResponseTo": "summary"
  }
}
```

Use JS_CODE V2 when the script is local to one workflow node.

Scripts can export `export default async function (ctx) {}` or `module.exports = async (ctx) => {}`. The runtime exposes `ctx.triggerEvent`, `ctx.formData`, `ctx.workflowData`, `ctx.operator`, `ctx.app`, `ctx.variables`, `ctx.resources`, `ctx.form`, `ctx.dataView`, `ctx.connector`, `ctx.notification`, `ctx.organization`, `ctx.platform.roles.*`, `ctx.platform.api.*`, `ctx.utils`, `require`, `process`, and `Buffer`. App Functions additionally expose `ctx.process.startFromExistingInstance/resolveCapabilities/resubmitTask/withdraw/transferTask`; trusted code is scoped to its current tenant/application and reuses the real operator's official workflow permission, operation-log, event, idempotency, and replay paths. Per-resource declarations are optional mapping/audit metadata, not an application-internal authorization list. Prefer `ctx.resources.resolveForm/resolveDataView/resolveConnector`, `ctx.form.queryOne/queryMany/getById/createOne/updateOne/updateById`, `ctx.dataView.query/stats`, `ctx.connector.call/invoke`, and `ctx.platform.roles.findByCode/addUsers/removeUser` for platform-side work. Use `ctx.organization.departments.*` and `ctx.organization.accounts.*` only for intentional organization-management flows; the real operator/audit actor must hold `app:organization:manage`. App Function and trusted-node form writes are backend operations, not direct page-user submit access; keep internal forms closed to raw user submission unless the business requires it. Raw `ctx.platform.api.*` calls return HTTP response plus platform envelope. Legacy data/process bridge methods remain available as `ctx.methods.queryOneData/queryManyData/getDataByFormInstanceId/updateOneData/updateDataByFormInstanceId/updateManyData/createOneData/terminateProcess/getAllParentDepartments`.

Example `src/js-code-nodes/sync_customer/index.ts`:

```ts
export default async function syncCustomer(ctx) {
  const current = ctx.formData?.current || {};
  const appType = ctx.app.appType;
  const customerNo = current.customer_no;

  const customer = await ctx.methods.queryOneData(appType, "FORM_CUSTOMER", {
    customer_no: customerNo,
  });

  if (customer) {
    await ctx.methods.updateOneData(
      appType,
      "FORM_CUSTOMER",
      { customer_no: customerNo },
      { last_approved_at: new Date().toISOString() }
    );
  }

  const log = await ctx.methods.createOneData(appType, "FORM_SYNC_LOG", {
    source: "workflow",
    customer_no: customerNo,
    result: customer ? "updated" : "missing",
  });

  return {
    customerFound: Boolean(customer),
    logId: log?.formInstanceId || log?.id,
  };
}
```

Field permission config lives in `flowConfig` by node ID:

```json
{
  "flowConfig": {
    "approve": [
      { "fieldId": "amount", "fieldBehavior": "READONLY" },
      { "fieldId": "remark", "fieldBehavior": "NORMAL" }
    ]
  }
}
```

Allowed `fieldBehavior` values: `NORMAL`, `READONLY`, `HIDDEN`.
