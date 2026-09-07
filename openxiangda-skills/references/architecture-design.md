# OpenXiangda Architecture Design Reference

Use this reference to turn product material into an OpenXiangda-specific architecture document and task plan.

## Table Of Contents

- [Purpose](#purpose)
- [Critical Review Stance](#critical-review-stance)
- [Architecture Gate Workflow](#architecture-gate-workflow)
- [Anti-Patterns To Reject](#anti-patterns-to-reject)
- [Question Gates](#question-gates)
- [Resource Design Checklist](#resource-design-checklist)
- [Final Document Template](#final-document-template)
- [Black-Box Demo Scenario](#black-box-demo-scenario)

## Purpose

This design flow is for applications built on OpenXiangda. The output is not a generic PRD. It must tell the implementer exactly which platform resources to create and why:

- forms and fields
- custom pages and menus
- data views
- roles, page permission groups, form permission groups, data scopes, and field access
- status machines or workflows
- automations, JS_CODE V2 nodes, and App Functions
- notifications and connectors
- application login/auth methods, registration policy, identity matching, and provider boundaries
- public access routes, external roles, ticket strategy, and explicit grants
- publish and acceptance steps

The design is complete only when another agent can implement it without deciding major architecture tradeoffs.

## Critical Review Stance

Act as the technical architect. Product requirements are inputs, not orders.

Be direct when a requirement is technically wrong:

- "这个设计不能按你说的实现。把 1000 条数据拉到前端再筛选，会在真实数据量下变慢，也会绕开后端权限边界。这里必须做分页查询和服务端过滤。"
- "这不是审批流，是业务状态流转。硬做成流程表单会让页面、权限、数据修复和后续扩展都变复杂。应该用普通表单 + 状态机。"
- "前端隐藏按钮不是权限控制。敏感数据必须落到表单权限组、数据范围和字段权限。"

Do not insult the person. Criticize the proposal and explain the technical consequence.

## Architecture Gate Workflow

Before any implementation for architecture-class work, run the CLI gate when available:

```bash
openxiangda doctor --profile <name> --json
openxiangda design gates --topic public-access --json
openxiangda design template --topic auth,public-access
```

Until the user confirms the design, only read, inspect, snapshot, dry-run, ask questions, and write/output the architecture document. Do not edit app source, mutate platform resources, publish, deploy, send notifications, or invoke live write/delete endpoints.

1. **Read the input**: user prompt, uploaded requirements, current workspace files, app snapshots, and existing resources.
2. **Classify the app**: admin CRUD, portal, workbench, dashboard, workflow approval, status lifecycle, automation-heavy app, integration-heavy app, or mixed.
3. **Draft the resource map**:
   - forms as data tables
   - pages/routes/menus
   - permissions
   - data views
   - workflow/status/automation/function boundaries
   - notifications/connectors
4. **Ask missing high-impact questions**. Ask in small rounds; do not dump every possible question at once.
5. **Reject bad assumptions** and replace them with OpenXiangda-native patterns.
6. **Confirm UI design needs**. For portals, dashboards, mobile pages, and workbenches, ask whether to run Product Design / visual ideation before implementation.
7. **Write the design artifact**. Default path when a workspace exists:
   `docs/architecture/<app-slug>-openxiangda-design.md`.
8. **Create a development task table** that can be executed by OpenXiangda subskills.

## Design Gate Matrix

Use this matrix to decide what to ask. Ask in small rounds, and recommend the default option when the user is unsure.

| Topic | Trigger examples | Must confirm | Recommended default | Resources to design | Acceptance |
|---|---|---|---|---|---|
| 新应用 / 大版本 | 新应用、从零搭建、门户、管理系统 | actors, core objects, internal/external access, first screen, integrations | React SPA + `src/resources/**` + design doc first | forms, routes, menus, roles, dataViews, auth/public policies | user confirms resource map and permission matrix |
| 复杂页面 / 工作台 | 看板、工作台、详情页、移动端、大屏 | page task, data source, edits/batch actions, role visibility, empty/error states | dataView for repeated reads, App Function for backend orchestration | route/menu, page component, dataView/function, permissions | role-specific UI works; no PageProvider errors |
| 登录 / 注册 | 登录、注册、手机号验证码、SSO、账号绑定 | methods, registration policy, identity match keys, provider function, default roles, rate limits | `registration.mode=reject`; provider returns identity assertion only | `src/resources/auth`, login route/page, App Function provider | methods match SDK DTO; internal route requires auth |
| 公开访问 | 无需登录、外部人员、公开报名、分享链接 | public routes, external roles, guest vs ticket, grants, rate limit, audit/expiry | `/view/:appType/public/*` + route + public-access policy; sensitive lookup uses ticket | `src/resources/routes`, `src/resources/public-access`, external role permission groups, `PublicAccessGate` | no-login public route works; ungranted resources deny |
| 权限 / 数据范围 | 角色、只看自己、部门数据、字段权限 | roles, page/menu groups, form operations, data scope, field access, rejection tests | backend permission groups, not frontend-only filtering | roles, page-groups, form-groups, field access policy | `permission audit` clean; allowed/denied paths verified |
| 流程 / 自动化 / Function | 审批、状态流转、定时、JS_CODE、App Function | trigger, node IO, idempotency, resources, approval vs status machine, logs | normal status machine unless real approval; reusable logic as App Function | workflows, automations, functions, JS_CODE source | invoke/executions/logs verified; duplicate trigger safe |
| 连接器 / 通知 | 第三方接口、Webhook、短信、钉钉、消息 | auth, timeout/retry, secret owner, notification type/template, recipients, failure policy | connector for external HTTP; notification resources before sending | connectors, notifications, App Function wrapper if needed | `connector invoke` and notification preview/send DTOs pass |
| 资源维护 | 补路由、修权限、删除配置、同步 manifest | live mutation or repo source of truth, profile/appType, force/delete/send risk | `resource plan/publish` for formal changes; direct CLI with `--write-manifest` for small fixes | affected manifest and state mapping | dry-run path/body reviewed; no repo/platform drift |

## Anti-Patterns To Reject

| Anti-pattern | Why it is wrong | Required replacement |
|---|---|---|
| Fetch 1000 rows then filter in React state | Breaks at real data volume, wastes network, and may bypass data permission thinking | Paginated query with `currentPage`, `pageSize`, sort, and structured server filters |
| Dropdown options load all records | Large forms become slow and stale | `linkedForm` `SelectField` with `remoteSearch`, explicit `searchFieldId`, and page size |
| Broad `searchKeyWord` for every search | Expensive and imprecise | Explicit searchable fields and `filterGroup` OR conditions |
| Workflow form for normal ticket lifecycle | Adds approval constraints and operational overhead without approval semantics | Normal form + status field + state machine + action log + automations |
| Frontend-only data isolation | Hides UI but does not enforce data access | Page permission groups, form permission groups, data scopes, and field access |
| One large page owns all business logic | Hard to test and change | `domain/`, `shared/services/`, hooks, reusable components |
| Repeated multi-form joins in page code | Duplicated, slow, inconsistent | Data View for read-only reusable row/aggregate queries |
| Materialized view for hard realtime data | Users see stale data | `storageMode: "live"` only for bounded realtime joins, or direct source queries/App Function |
| Live view for unbounded heavy joins | Slow runtime queries | Materialized view with scheduled refresh and indexes |
| JS_CODE for reusable business service | Logic gets duplicated in graph nodes | App Function for shared backend logic; JS_CODE only for node-local trigger logic |
| Auth provider issues tokens or writes users directly | Breaks platform account, binding, permission, and audit boundaries | Provider returns identity assertion only; platform creates/binds/rejects and issues token |
| Phone-code login auto-registers by default | Allows uncontrolled account creation from weak identity proof | Default registration is reject; enable auto-create/whitelist only after explicit confirmation |
| Raw native form controls | Inconsistent with platform runtime and validation | OpenXiangda platform components first, Ant Design wrappers second |
| Multiple form permission groups without stable local codes | CLI state and platform `resourceCode` cannot reliably distinguish groups on the same form | Give every group a unique `code`, for example `ticket_reporter_view` and `ticket_repairer_view` |
| Assuming resource publish means workflow is active | Workflow resources may exist as drafts until explicitly published | Verify `workflow list` shows `isPublished: true`; run `workflow publish <workflowCode>` when needed |

## Question Gates

Ask only what materially changes the design.

### Scope And Actors

- Who are the user roles?
- Which roles create, process, approve, view, export, or administer data?
- Is this PC-only, mobile-only, or both?
- Is the app greenfield or modifying an existing app?

### Forms And Data

- What are the core business objects?
- Which objects need independent lifecycle, permissions, or reporting?
- Which fields are visible to users, hidden scope keys, computed fields, or system-derived fields?
- Which fields will be searched, sorted, grouped, or used for permissions?
- What data volume is expected now and after growth?

### Pagination And Search

- Which list pages need filters?
- Which fields support exact filtering versus fuzzy search?
- Which selectors need remote search?
- What default page size is acceptable?
- Which sorts are business-critical?

Default if the user does not know: design conservative pagination with explicit filters, do not fetch all rows.

### Permissions

- Is data sensitive?
- Is frontend-only filtering acceptable, or must backend data isolation be enforced?
- Does each role see all records, own records, department records, assigned records, or a custom scope?
- Are any fields sensitive enough for backend field access policy?
- Are page permission groups enough for visibility, or do forms also need permission groups?

Default: if the app contains personal data, costs, approval records, or cross-department data, backend-enforced permissions are required.

### Status Machine Or Workflow

- Is there an actual approver task with agree/reject opinion and approval history?
- Does each node require field permissions?
- Is audit history tied to approval tasks, or is a business action log enough?
- Can the process be represented as a normal status transition?

Default: ordinary service, ticket, order, asset, and task lifecycles are status machines, not workflow forms.

### Data Views And Reports

- Is the query single-form CRUD or repeated multi-form read-only logic?
- Is the output row-level or aggregate?
- Must users see source changes immediately?
- What staleness is acceptable: realtime, 10-30 minutes, hourly, daily, manual?
- Which fields are filters, dimensions, measures, drill-down keys, and permission scope aliases?
- What rows can be excluded early by definition `where`?

Default: management dashboards usually use materialized views with scheduled refresh. Operational bounded drill-downs can use live views.

### Automation, JS_CODE, App Function

- What should happen after form submit/update/delete or field change?
- Are there scheduled scans or deadline reminders?
- Does logic need to be reused by pages and multiple backend flows?
- Does it need external HTTP or platform API calls?
- Which logs are needed for diagnosis?

Default: reusable calculations and validations become App Functions; one-off backend trigger orchestration becomes JS_CODE V2 in automation/workflow.

### Notifications And Connectors

- Which channels are required: in-app, email, DingTalk, WeChat, third-party todo?
- Who receives each notification and why?
- Which payload fields are needed?
- Are templates reusable resources?
- Are external credentials needed? If yes, use connectors/resources, never page source secrets.

### Login And Auth

Ask these before generating any login/auth design:

- Which methods are enabled: password, DingTalk browser OAuth/in-app free login, CAS/SSO, phone code, guest?
- What is the phone registration policy: reject, auto-create, bind existing only, whitelist, or manual approval?
- What are the identity match keys and priorities: `phone`, `email`, `externalId`, `unionId`, `jobNumber`, `username`?
- Which App Function provider validates each external credential, and what identity assertion fields must it return?
- Which default app roles/page groups/data scopes should new users receive, if registration is enabled?
- What are the security parameters: code TTL, send frequency, failed attempts, IP/device limits, audit fields, and failure message disclosure?
- Is CAS/DingTalk configured by the platform tenant, or delegated to an app-level provider function?

Default: registration is rejected; provider functions return identity assertions only; platform auth service owns account creation, binding, permission assignment, cookies, and tokens.

### Public Access

Ask these before designing any page or data that external people can access without normal login:

- Which exact routes are public? Use `/view/:appType/public/*` for new React SPA apps.
- What can anonymous/external users do: view a page only, submit a form, query a dataView, invoke a function, or call a connector-backed action?
- Which virtual external role codes should represent these visitors, for example `external_visitor`, `external_applicant`, or `external_ticket_holder`?
- Is ordinary guest mode enough, or does the link need `mode: "ticket"` with expiry/single-use behavior?
- Which forms/dataViews/functions/connectors are explicitly granted? Everything not listed in `grants` is denied.
- Which backend permission groups must also include the external role codes?
- Is the page safe for search/share, or should the URL contain a generated ticket?

Recommended default if the user is unsure:

- Public marketing/info pages: `mode: "guest"`, no data grants.
- Public form submission: `mode: "guest"` plus one form grant and a submit permission group for `external_visitor`.
- Sensitive lookup or status query: `mode: "ticket"` plus one dataView/function grant, short TTL, and a read-only permission group.
- Never use old `?publicAccess=guest` for new React SPA apps; it is legacy `sy-lowcode-view` compatibility only.

### UI Design

Ask whether to use Product Design or another design skill for:

- dashboard
- portal
- mobile entry
- workbench
- dense operation console
- executive report page
- visually important landing/first screen

For simple CRUD/admin lists, design can proceed with the appropriate OpenXiangda template unless the user asks for visual exploration.

## Resource Design Checklist

### Forms

- Use deterministic `formCode`.
- Define visible fields, hidden scope keys, and derived values.
- Use platform field components.
- Use `SelectField` / `RadioField` for enums.
- Use `linkedForm` select with remote search for large source forms.
- Avoid extra system metadata fields unless they represent a separate business concept.

### Pages

- Choose React SPA or classic workspace based on the app mode.
- Use `DataManagementList` for standard management lists.
- Split PC/mobile when workflows differ, but reuse `domain/` and `shared/services/`.
- Keep page components thin.

### Permissions

- App roles use stable local codes.
- Page permission groups control entry/menu visibility.
- Form permission groups enforce data access.
- Form permission group resources use unique stable `code` values. Do not use the same form code for multiple groups.
- Field permissions hide sensitive fields where backend support exists.
- Frontend-only button hiding is UX, not security.

### Data Views

- Use row view for joined lists and drill-downs.
- Use aggregate view for fixed metrics.
- Choose `materialized` for read-heavy reports with staleness tolerance.
- Choose `live` only for bounded realtime joins.
- Index materialized output aliases used for filters, sort, and dimensions.
- Show `lastRefreshedAt` when users care about freshness.

### Status, Workflow, Automation

- Model normal lifecycles as status fields and state machines.
- Use workflow for real approval tasks only.
- Use automation for backend triggers and schedules.
- Use JS_CODE V2 trusted_node for node-local backend logic.
- Use App Function for reusable backend services.
- After publishing workflow resources, verify `workflow list` and record whether `isPublished` is true.
- In React SPA and classic workspaces, JS_CODE/App Function TypeScript lives under `src/js-code-nodes`, `src/automations`, or `src/functions`; build with `pnpm build-js-code`.

### Auth

- Auth resources use stable local codes under `src/resources/auth/`.
- Use `/view/:appType/login` or `LoginPage` from `openxiangda/runtime/react` for default React login.
- Use `createAuthClient({ appType, servicePrefix })` for custom React login pages.
- DingTalk `flow: "auto"` uses JSAPI only in a confirmed DingTalk container and otherwise starts platform-managed browser OAuth. The platform owns callback state and secrets; app code supplies only an app-local `returnUrl` through `getDingTalkOAuthUrl`.
- Phone-code providers are App Functions. They validate send/verify events and return identity assertions; they do not issue tokens or mutate platform users.
- New-user registration must be explicit, with default roles and identity conflict behavior documented.

### Public Access

- Route resources live under `src/resources/routes/` and use `publicAccess: "guest"` or `"ticket"` only for `/view/:appType/public/*` paths.
- Public policies live under `src/resources/public-access/`.
- Policy `externalRoleCodes` are virtual role codes carried by the scoped public token; use the same codes in page/form/dataView permission groups.
- Policy `grants` must list every form/dataView/function/connector the public page can access. Do not rely on broad guest permissions.
- Use `PublicAccessGate` in React routes or `createPublicAccessClient` for custom bootstrapping. If the page uses Page SDK hooks, the route tree must have `OpenXiangdaProvider` plus `OpenXiangdaPageProvider`; `PublicAccessGate` alone is not enough. Public routes must define visible loading and error fallback states so slow networks, missing tickets, or expired tickets do not become blank pages.
- In validation scripts, success requires the JSON envelope success code (`200`, `"200"`, or compatible `0`). HTTP 200 with `code: "PUBLIC_GRANT_DENIED"` is a denied request, not a success.
- Validation must include at least one real browser render check for each public and private route, because API-only E2E can miss provider/runtime crashes such as `usePageSdkStore 必须在 PageProvider 内使用`.
- Old `?publicAccess=guest` and form `publicAccess` settings are legacy compatibility and should not appear in new-app designs.

## Final Document Template

```markdown
# <App Name> OpenXiangda Architecture Design

## 1. Design Decision Summary

- App type:
- Runtime/publish mode:
- Key platform resources:
- Main tradeoffs:
- Rejected unsafe assumptions:

## 2. Actors And Permissions

| Role | Users | Page visibility | Data scope | Field restrictions | Notes |
|---|---|---|---|---|---|

## 3. Forms And Fields

| Form code | Purpose | Key fields | Hidden/scope fields | Search/sort fields | Permission notes |
|---|---|---|---|---|---|

## 4. Pages, Menus, And UX

| Page/route | Audience | Pattern/template | Main actions | Data source | Design mockup needed |
|---|---|---|---|---|---|

## 5. Query, Pagination, And Search

- List pages:
- Remote selectors:
- Server-side filters:
- Default page sizes:
- Index/search-field plan:

## 6. Data Views And Reports

| Data view | Type | Mode | Freshness | Filters/indexes | Permission scope | Runtime call |
|---|---|---|---|---|---|---|

## 7. Status, Workflow, Automation, And Functions

- Status machines:
- Workflow forms:
- Automations:
- JS_CODE V2 nodes:
- App Functions:

## 8. Login And Auth

- Enabled methods:
- Registration policy:
- Identity matching keys:
- Provider functions:
- Default roles/permissions:
- Security parameters:

## 9. Notifications And Connectors

| Scenario | Trigger | Channel | Recipients | Template/resource | Notes |
|---|---|---|---|---|---|

## 10. Development Task Table

| Phase | Task | Resources/files | Validation | Publish step |
|---|---|---|---|---|

## 11. Acceptance Criteria

- Functional checks:
- Permission checks:
- Performance/query checks:
- Report freshness checks:
- Notification/automation checks:
- Workflow checks: real approval flows show `isPublished: true`.

## 12. Open Questions And Confirmed Assumptions

- Confirmed:
- Still open:
```

## Black-Box Demo Scenario

Use this scenario to validate this skill after release. Run it in a fresh Codex session that only has the installed OpenXiangda skills.

Product-manager style prompt:

```text
我要做一个校园综合服务工单与物资审批平台。所有工单列表先拉 1000 条前端筛选就行，普通工单从提交到完成也都走审批流。需要 PC 管理后台、移动端报修、SLA 看板、库存预警、通知和一些自动化。
```

Expected behavior:

- The agent rejects fetching 1000 rows and proposes paginated server queries.
- The agent rejects workflow for ordinary ticket status changes and keeps workflow only for high-value spare-part approval.
- The agent asks about permission strictness, sensitive cost fields, data scope, report freshness, design mockups, searchable fields, and pagination.
- The final design covers normal forms, one workflow form, pages, Data Views, permissions, automations, JS_CODE V2, App Functions, notifications, and task plan.

Coverage target:

- Forms: service ticket, service category, asset equipment, spare-part inventory, satisfaction evaluation, role settings.
- Status machine: submitted, accepted, assigned, processing, pending acceptance, completed, closed.
- Workflow: high-value spare-part approval only.
- Pages: PC admin, mobile report entry, ticket workbench, SLA/inventory/satisfaction dashboard.
- Data Views: live ticket joined detail, materialized SLA aggregate, inventory alert statistics.
- Permissions: reporter self, repairer assigned, supervisor department, admin all, sensitive cost field restrictions.
- Automations: new ticket notification, timeout escalation, completion evaluation reminder, low-stock warning.
- JS_CODE V2: SLA classification, dynamic recipients, message payload assembly.
- App Functions: dispatch rule, inventory deduction validation, SLA calculation.
- Notifications: in-app, DingTalk/third-party todo as required.
