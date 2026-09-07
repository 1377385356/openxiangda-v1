---
name: openxiangda-workflow-automation
description: "Build, validate, publish, enable, and inspect OpenXiangda workflows and automations: approval flows, v3 graphs, JS_CODE trusted_node, App Function function_call, cron, form events, field changes, workflow events, and notifications. Includes the workflow versus status-machine boundary, code-first workflows, code-first automations, JS_CODE node scripts, and reusable App Functions. Trigger on 审批, 流程, workflow, automation, cron, JS_CODE, trusted_node, App Function, src/js-code-nodes, or src/functions."
---

# OpenXiangda Workflow And Automation

## When to use this skill

- User asks for **approval workflows / 审批 / 流程 / approve / reject / transfer / withdraw / process records / approval-node side effects**.
- User asks for **automation / 自动化 / cron / 定时 / form-data-submitted/updated/deleted / field-changed / workflow-task-approved / message notification triggers**.
- User asks for **JS_CODE backend script** (cross-form query, batch update, terminate process, external HTTP, complex orchestration that frontend can't handle).
- User asks for **App Function / function_call** reusable backend logic that pages, automations, and workflows should share.
- User wants **code-first workflow / automation** (TypeScript source under `src/workflows/` or `src/automations/`).

## Boundary — workflow vs. status field

**Most business lifecycle flows are NOT workflows.** For ordinary `pending → processing → resolved → closed`, use a normal form + `status` field + responsibility fields + action-log form + state machine + automation/JS_CODE.

Create a workflow only when the scenario has **real approval semantics**: approvers, approval tasks, agree/reject actions, opinions, node-level field permissions, process records, approval-node side effects.

## DO / DO NOT

- ✅ New AI-authored automations: prefer **code-first** `automation_code_ts` (`src/automations/<code>/index.ts` + `definition.code.json` + `preview.json`).
- ✅ New AI-authored workflows: prefer **semantic DSL** `src/workflows/<code>/workflow.ts` using `defineWorkflow`; compile it to v3 designer JSON with `openxiangda workflow compile`.
- ✅ Runtime workflow pages: use `sdk.process.resolveCapabilities(...)` or `ProcessActionBar` / `ProcessTimeline` from `openxiangda/runtime/react`; do not hard-code buttons.
- ✅ Runtime task centers: use `sdk.workCenter.listItems({ boxType: "todo" | "done" | "cc" | "initiated" })` and `sdk.workCenter.getStats()` for current-user lists/counts; do not read workflow logs, automation logs, or raw process-task tables for end-user todo pages.
- ✅ Before custom workflow UI or delayed approval work, read `references/workflow-v3.md` sections **Cookbook: draft, start, return, resubmit** and **Capability action reference** for payloads, required IDs, and refresh rules.
- ✅ Delayed approval start: save the process-form record first with `StandardFormPage submitBehavior="save-draft"` or `sdk.form.create({ formUuid, data, saveAsDraft: true, startProcess: false })`, then start approval in place with `sdk.process.startFromExistingInstance({ formUuid, formInstId })` or `StandardFormPage submitBehavior="start-existing-process"`.
- ✅ Return-to-initiator flows: use `returnPolicy: { scopeType: "initiator", resubmitMode: "resume_current" | "replay" }` or `flow.action.returnToInitiator()`. The runtime capabilities protocol exposes `resubmit` only for pending `originator_return` tasks; return to a previous approval node continues through the normal `approve` action.
- ✅ Reusable backend business logic: prefer **App Function** (`src/functions/<functionCode>/index.ts` + `src/resources/functions/<functionCode>.json`), then call it from page `sdk.function.invoke` or automation/workflow `function_call`.
- ✅ JS_CODE V2 trusted_node: source in TypeScript under `src/js-code-nodes/<scriptCode>/index.ts`, `src/automations/<resourceCode>/index.ts`, or `src/functions/<functionCode>/index.ts`. Run `pnpm build-js-code --script <code>`; an explicit selector validates/builds only that entry plus its transitive/shared/ambient dependencies, while an unscoped command validates the whole workspace.
- ✅ Use `trigger_v2` for new automation triggers; CLI fills root `appType` / `formUuid` from active profile when `--form-code` is provided.
- ✅ Use logical `workflowCode` / `automationCode` locally; live IDs are profile-isolated under `.openxiangda/state.json`.
- ✅ `ctx.logger.debug/info/warn/error(message, data?)` at every important step — inspect via `automation executions` / `automation logs` / `automation diagnose`.
- ❌ JS_CODE for simple UI interactions, ordinary form validation, display-only logic, or backend logic that should be reused outside one graph node.
- ❌ Workflow definitions for non-approval status changes — use a status field instead.
- ❌ Copy `workflowId` / `automationId` across profiles. Always create/bind separately for each profile.
- ❌ Inline large JS code blobs in v3 JSON for new work — use trusted_node TypeScript snapshots.

## Architecture Boundary

Most business lifecycle flows are not workflows. For ordinary status changes such as `pending -> processing -> resolved -> closed`, use a normal form, a `status` field, redundant responsibility fields, an action-log form, a domain state machine, a service method, and optional automation / JS_CODE.

Create workflow definitions only when the scenario has real approval semantics: approvers, approval tasks, agree/reject actions, approval opinions, node-level permissions, process records, or approval-node side effects.

## Required Context

Before any write:

```bash
openxiangda env --profile dev
openxiangda auth status --profile dev
openxiangda workspace bind --profile dev --app-type APP_XXX
```

Resolve logical form codes through `.openxiangda/state.json`:

```bash
openxiangda form list --profile dev
openxiangda form bind customer --form-uuid FORM_XXX --profile dev
```

## Workflow Flow

1. Create or update `src/workflows/<workflowCode>/workflow.ts` with `defineWorkflow`.
2. Compile and check it:
   ```bash
   openxiangda workflow compile src/workflows/customer_approval/workflow.ts --check
   openxiangda workflow compile src/workflows/customer_approval/workflow.ts \
     --out-definition src/resources/workflows/customer_approval/definition.v3.json \
     --out-preview src/resources/workflows/customer_approval/preview.json
   ```
3. Prefer resource manifests:
   ```json
   {
     "code": "customer_approval",
     "formCode": "customer",
     "workflowFile": "../../../workflows/customer_approval/workflow.ts",
     "definitionFile": "definition.v3.json",
     "previewFile": "preview.json",
     "publish": true
   }
   ```
   Then run `openxiangda resource validate --profile dev`, `openxiangda resource publish --profile dev --dry-run`, and finally `openxiangda resource publish --profile dev`.
4. For low-level repair, validate compiled or pulled JSON:
   ```bash
   openxiangda workflow validate --definition-json workflow.json --publish --profile dev
   ```
5. Low-level create and bind:
   ```bash
   openxiangda workflow create customer_approval --form-code customer --definition-json workflow.json --profile dev
   ```
6. Publish:
   ```bash
   openxiangda workflow publish customer_approval --profile dev
   openxiangda workflow list --profile dev --json
   ```

Use `workflow pull` to inspect the live definition. Use `workflow list --json` after publishing and confirm the target shows `isPublished: true`; resource publish can create/update a draft without activating it. `workflow list` hides platform shell workflows with empty `resourceCode` by default; use `--all` only for raw platform diagnostics. Use logical workflow codes locally; never copy a workflow ID from one profile to another.

## JS_CODE V2

JS_CODE is the backend execution escape hatch for workflow and automation. Use it when the logic must run on the server after a backend trigger, such as a fixed cron schedule, a form date-field schedule, a form submit/update/delete/field-change event, or a workflow approval/process event. It is appropriate for cross-form data queries, create/update/batch update operations, process termination, platform API calls, external HTTP calls, and complex orchestration that the frontend cannot handle reliably.

App Function is the reusable backend execution model. Use it when the logic should be called by custom pages, multiple automations, workflows, or the runtime API. Source lives in `src/functions/<functionCode>/index.ts`; manifest lives in `src/resources/functions/<functionCode>.json`. Call it from pages with `sdk.function.invoke(code, { input })`, from graph definitions with `function_call`, or from the runtime endpoint `/:appType/v1/functions/:code/invoke.json`. Direct runtime invocation defaults to app automation management permission; ordinary page callers must declare `definitionJson.runtimeInvoke.audience` (`authenticated`, `page_permission_group`, `app_roles`, or `scope_policy`). Prefer `export default async function(ctx, input) {}` for App Function source; the second argument is the invoke input and the same value is available as `ctx.input`. Current MVP exposes controlled helpers only and does not expose raw SQL or Redis. App Functions and trusted-node Automation scripts can call `ctx.files.readAsBase64` with an attachment from the current `ctx.formData`, or with a server-verified form record/field reference. This helper reads platform storage without a browser session, rejects arbitrary URLs and non-images, caps files at 10 MiB, and must be used without logging or persisting the Base64. App Functions can call `ctx.process.startFromExistingInstance`, `resolveCapabilities`, `resubmitTask`, `withdraw`, and `transferTask`; published trusted code may access resources in its current tenant/application, while workflow/task authorization, audit, event, replay, cross-app, and cross-tenant boundaries remain enforced. `resources` is optional mapping/audit metadata rather than an application-internal authorization list. Keep internal forms closed to direct user submit unless the business explicitly needs raw form submission; use `runtimeWrite.mode="function_only"` for function-only forms.

For third-party credentials, use top-level metadata-only `secretRefs` plus `definitionJson.version="function_v2"` and `runtimeContractVersion="trusted_node_v2"`; read a declared value with `await ctx.secrets.get(name)` and call public business APIs through `ctx.utils.http`. Never use `process.env` for platform secrets. Values are managed with `openxiangda secret create|rotate --value-stdin --change <change> --profile <name>` and never appear in Git, build output, snapshots, plan diffs, logs, exceptions, or traces. Local tests may use `function test --secret-from-env logical=ENV` only; the value is passed to an isolated child over stdin and is never written to workspace/cache/state. For a Root App transaction, use exact-scope `resource publish function --only <code> --stage-only` and include its verified `stagedResource` in `release app-finalize`.

For new AI-authored automations, prefer code-first `automation_code_ts` resources instead of visual v3 graph definitions. Put the source in `src/automations/<resourceCode>/index.ts`, define `definition.code.json` with `kind: "automation_code_ts"`, and provide `preview.json` for read-only frontend display. Use `ctx.logger.debug/info/warn/error(message, data?)` at every important step; OpenXiangda can inspect logs with `automation executions`, `automation logs`, and `automation diagnose`.

For new AI-authored workflows where users do not need canvas editing, prefer compile-time `workflow.ts` using `openxiangda/workflow`. The CLI compiles it to v3 `definitionJson` and `preview.json`; the backend still runs the normal workflow engine for approval tasks, copy tasks, callback waits, branch advancement, and process records.

Do not use JS_CODE for simple UI interactions, ordinary form validation, display-only page behavior, or logic that belongs in a normal React code page. For non-trivial backend logic, prefer JS_CODE V2 trusted Node scripts over large inline snippets. AI-authored JS_CODE source must be TypeScript:

1. Put source in `src/js-code-nodes/<scriptCode>/index.ts`.
2. Run `pnpm build-js-code --script <scriptCode>`. In a refreshed workspace this command typechecks only the selected entry and its transitive/shared/ambient dependencies, then bundles after validation passes; omit the selector only for an intentional full-workspace validation. Installed CLI resource commands independently use their packaged canonical scoped builder, including against standard older workspaces.
3. In workflow or automation JSON, use:
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

The CLI requires `sourceFile.localPath` to point to TypeScript source in `src/js-code-nodes/<scriptCode>/index.ts`, `src/automations/<resourceCode>/index.ts`, or `src/functions/<functionCode>/index.ts`. During validate/create it runs `pnpm build-js-code --script <scriptCode>`, uploads the generated bundle to `/file/js-code-snapshot/upload`, verifies the server snapshot metadata, and replaces it with `{ bucketName, objectName, sha256, ... }`.

The backend verifies the uploaded snapshot sha256 before execution, runs it in the trusted Node runtime, applies the node timeout (`30000` ms by default), stores console/runtime logs in the execution record, and writes the returned value to the node output and `variables.node_<nodeId>`.

Inside the TypeScript script, prefer `export default async function (ctx) {}` or `module.exports = async (ctx) => {}`. The runtime exposes:

- Context: `ctx.triggerEvent`, `ctx.formData`, `ctx.workflowData`, `ctx.operator`, `ctx.app`, `ctx.variables`, and `ctx.node`.
- Data/process methods: `ctx.methods.queryOneData`, `queryManyData`, `getDataByFormInstanceId`, `updateOneData`, `updateDataByFormInstanceId`, `updateManyData`, `createOneData`, `terminateProcess`, and `getAllParentDepartments`.
- Notification bridge: `ctx.notification.sendByType`, `batchSendByType`, `findConfig`, and `previewTemplate`. Declare templates in `src/resources/notifications/` before using custom `notificationType`.
- Platform API bridge: `ctx.platform.api.get/post/put/patch/delete/request` for `/openxiangda-api/v1`; role helpers: `ctx.platform.roles.list/findByCode/addUsers/removeUser`.
- Resource helpers: `ctx.resources.resolveForm/resolveDataView/resolveConnector`, `ctx.form.queryOne/queryMany/getById/createOne/updateOne/updateById`, `ctx.files.readAsBase64`, `ctx.process.startFromExistingInstance/resolveCapabilities/resubmitTask/withdraw/transferTask` for App Functions, `ctx.dataView.query/stats`, and `ctx.connector.call/invoke`.
- Node runtime helpers: `require`, `process`, `Buffer`, `ctx.utils`, `ctx.utils.http`, and `ctx.console`.

Example `function_call` node:

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

## Automation Flow

New automation triggers must use `trigger_v2`.

Use these v2 event sources and actions:

- Form data: `event.source: "form_data"` with `submitted`, `updated`, or `deleted`.
- Form field: `event.source: "form_field"`, `event.action: "changed"`, and `filters.fieldChange` with `fieldId` plus `changeType: "any" | "from_to" | "to_value" | "from_value"`.
- Workflow task: `event.source: "workflow_task"` with `approved`, `rejected`, `returned`, `transferred`, or `cancelled`; use `filters.workflow.nodeId`, `operatorId`, `assigneeId`, and `previousAssigneeId` when needed.
- Workflow process: `event.source: "workflow_process"` with `started`, `approved`, `rejected`, `terminated`, or `withdrawn`; set `filters.workflow.finalResult` for final outcomes.
- Scheduled: `mode: "scheduled"` with `schedule.type: "fixed_time"` or `"form_date_field"`.

The CLI passes `trigger_v2` through unchanged and fills root `appType`/`formUuid` from the active profile when omitted and resolvable, for example with `--form-code customer`. Do not put profile-specific IDs into reusable examples unless they are resolved from local workspace state.

1. Create a trigger JSON and automation v3 definition JSON locally.
2. Validate:
   ```bash
   openxiangda automation validate --trigger-json trigger.json --definition-json automation.json --strict --profile dev
   ```
3. Create and bind:
   ```bash
   openxiangda automation create notify_on_submit --name "提交后通知" --form-code customer --trigger-json trigger.json --definition-json automation.json --profile dev
   ```
4. Publish and enable:
   ```bash
   openxiangda automation publish notify_on_submit --profile dev
   openxiangda automation enable notify_on_submit --profile dev
   ```

Use `automation disable` before risky edits. Published automations create a draft version when updated.

## References

- Best-practice architecture and status-flow boundary: `references/best-practices.md`
- Workflow v3 JSON, semantic DSL, delayed-start cookbook, and capability action payloads: `references/workflow-v3.md`
- Automation v3 JSON and triggers: `references/automation-v3.md`
- Notification resources and runtime calls: `references/notifications.md`
- API fields: `references/openxiangda-api.md`
- Profile-isolated IDs: `references/workspace-state.md`
