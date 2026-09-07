---
name: openxiangda-architecture-design
description: Design OpenXiangda / 享搭 / 私有化低代码 applications before implementation. Use when the user asks for 架构设计 / 详细设计 / 开发方案 / 技术方案 / 应用设计 / 新应用 / 空应用 / 需求文档转享搭应用 / PRD 转开发计划 / form-page-workflow-permission-data-view planning, or when a non-trivial OpenXiangda app should be planned before coding. Produces an OpenXiangda-specific architecture document, detailed design, and task plan; repeatedly asks design-gate questions; challenges bad product assumptions such as fetching 1000 rows then local filtering, workflow forms for ordinary status changes, frontend-only permissions, or unbounded dashboard queries.
---

# OpenXiangda Architecture Design

Use this skill before building a non-trivial OpenXiangda app or turning product requirements into implementation tasks.

This is an architecture gate, not a generic PRD writer. Convert the user's material into OpenXiangda resources: forms, fields, pages, menus, permissions, data views, workflows, automations, JS_CODE nodes, App Functions, notifications, connectors, and publish/test tasks.

## Required Reference

Before producing a final architecture document, read:

- `references/architecture-design.md`

Read these supporting references when the design touches the topic:

- `references/best-practices.md`
- `references/architecture-patterns.md`
- `references/data-views.md`
- `references/permissions-settings.md`
- `references/permission-design-patterns.md`
- `references/workflow-v3.md`
- `references/automation-v3.md`
- `references/notifications.md`
- `references/pages/page-sdk.md`
- `references/forms/form-schema.md`

## Operating Mode

Be the technical architect. Do not passively accept product requirements when they conflict with platform constraints, performance, permissions, or maintainability.

Keep the tone direct and critical about the design, but do not insult the person. Acceptable: "这个方案不能这样做，会把查询压力和权限风险推到前端。" Not acceptable: personal attacks.

## Plan-Gate Hard Rule

Architecture-class requests are planning-only until the user explicitly confirms the design.

This includes new apps, complex pages, login/register, public/no-login access, roles/data scopes, workflow/automation, App Function, connector, notification, and external integration work.

Before confirmation you may only:

- read files and docs
- inspect `.openxiangda/state.json`
- run read-only snapshots/doctor commands
- run `openxiangda design gates --topic <code> --json`
- run `openxiangda resource validate|plan` or other dry-run commands
- ask focused design-gate questions
- output or write the design artifact

Before confirmation you must not:

- edit app source files
- create/update/delete platform resources
- publish workspace/resources/runtime
- send notifications
- call live write/delete endpoints
- start implementation subskills

Once the user confirms, hand execution to the relevant implementation skill and use the resource commands documented in `references/resource-manifest-cheatsheet.md`.

## Non-Negotiable Rules

- Do not design list pages, option searches, linked-form choices, or report drill-downs that fetch 1000 rows and filter in local state. Use paginated queries, explicit filters, sort, and server-side search fields.
- Do not default to `searchKeyWord` for broad fuzzy search. Prefer explicit searchable fields and structured `filterGroup` conditions.
- Do not use workflow forms for ordinary business lifecycles. Use normal forms, status fields, state machines, responsibility fields, action logs, permissions, and automations. Use workflow only for real approval semantics.
- Do not put sensitive authorization in page conditions only. Use page permission groups, form permission groups, backend data scope, and field access policy when data is sensitive.
- Do not design account/role/permission requirements without choosing a permission mode first: `managed-platform-account`, `existing-platform-user-assignment`, `static-role-permission`, or `query-param-context`.
- Do not treat query parameters as sensitive authorization. They may provide context, filters, or ticket input only; sensitive reads/writes still need public-access grants, roles, form permission groups, or App Function checks.
- Public guest upload must use a structured `grants.forms` entry with the logical form code, explicit `upload`/`preview`/`download` actions, and optional field IDs. Never whitelist `/file/upload`; `AttachmentField` / `ImageField` supply form context that the backend compares with the signed guest claim and current live policy.
- Do not put repeated multi-form joins or fixed dashboard metrics into page-side loops. Use Data View when the query is reusable and read-only; choose `live` or `materialized` deliberately.
- Do not scatter reusable backend logic in pages or JS_CODE nodes. Use App Functions for logic shared by pages, automations, and workflows. Use JS_CODE V2 for node-local backend trigger logic.
- Do not design raw native form controls for AI-authored workspace code. Use OpenXiangda platform form components first, then Ant Design / antd-mobile wrappers.

## Workflow

1. Ground in the current state:
   - If a workspace exists, inspect `.openxiangda/state.json`, `app-workspace.config.ts`, and relevant `src/` resources before designing.
   - If this is an existing app, use snapshots/read-only inspection before proposing changes.
   - If this is a blank app, explicitly state that the design is greenfield.
   - Run `openxiangda doctor --json` when the CLI/workspace is available.
2. Extract the domain:
   - Actors and roles.
   - Business objects that should become forms.
   - Status lifecycles versus true approval workflows.
   - Pages, menus, PC/mobile entrances, and reporting surfaces.
   - Backend logic, notifications, integrations, and scheduled work.
3. Build an OpenXiangda resource map:
   - Forms and fields.
   - Pages and routes.
   - Roles, permission groups, data scopes, and field permissions.
   - Data Views with mode, query shape, freshness, indexes, and permissions.
   - Workflows, automations, JS_CODE nodes, App Functions, notifications, connectors, and settings.
4. Ask design-gate questions in rounds. Do not produce the final design while high-impact unknowns remain.
   Use `openxiangda design gates --topic <code> --json` to get the current question matrix and recommended defaults.
5. Challenge bad assumptions. Give the cost, reject the unsafe implementation path, and propose the OpenXiangda-native alternative.
6. For frontend-heavy pages, ask whether a visual/interaction design pass is needed. If Product Design or another UI design skill is available, route design work there before page implementation.
7. Write the final artifact by default when a workspace exists:
   - `docs/architecture/<app-slug>-openxiangda-design.md`
   If there is no workspace or safe target path, output the document in the conversation and ask for the destination before writing files.

## Design Gates To Resolve

Resolve these before finalizing:

- Data volume, pagination, searchable fields, sort fields, and expected indexes.
- Role model, data sensitivity, backend-enforced data scope, and field visibility.
- Account source, role membership source, permission design mode, and whether platform accounts/departments are created by the app.
- Which roles can manage roles, assign role members, grant role API permissions, maintain permission groups, or manage organization accounts; list the required `apiPermissionCodes`.
- Permission matrix for pages/routes, form submit/view/manage, data scope, field access policy, backend App Function checks, and query parameter tamper-deny tests.
- Which flows are status machines and which are real approvals.
- Report freshness: real-time live view, materialized refresh cadence, or manual snapshot.
- Whether dashboards and joins are bounded enough for Data View.
- Which logic belongs in page services, App Function, automation, workflow, or JS_CODE V2.
- Notification channels, recipients, trigger timing, and template payloads.
- PC/mobile split and whether Product Design / visual mockups are required.
- Publish profile, acceptance criteria, and demo/test path.

## Final Output

The final design must be decision-complete. Include:

- Architecture overview and OpenXiangda resource map.
- Form and field design with storage shape, hidden scope keys, searchable fields, and pagination strategy.
- Permission design with page groups, form groups, data scope, and field access policy.
- Permission mode decision with account source, role assignment source, business scope fields, hidden scalar keys, query-parameter boundary, and backend role/scope checks.
- Delegated role-setting design: which administrator role is first granted by a platform/app admin, which `apiPermissionCodes` it receives, and whether roles it creates can further delegate management.
- Page/menu/UX design, including PC/mobile and design mockup decisions.
- Data access and Data View plan with `live` / `materialized`, refresh, indexes, and runtime SDK calls.
- Status machine, workflow, automation, JS_CODE V2, and App Function plan.
- Notification and connector plan.
- Development task table with order, files/resources, validation, and publish steps.
- Open questions and confirmed assumptions.

After the design is accepted, hand off execution to the relevant OpenXiangda subskills. Do not skip the design gate for complex applications.
