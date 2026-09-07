# OpenXiangda Best Practices

Use this reference before scaffolding a real app, a complex page, a data
management view, a portal shell, role governance, notification automation, or a
business lifecycle flow.

The workspace template includes examples under:

```text
examples/best-practices/
```

These examples are copied by `openxiangda workspace init`, but they are not
published by default. Copy only the selected pattern into `src/`, then adapt the
form codes, field names, permissions, and page route names.

## AI Development Flow

1. Choose the architecture before writing code:
   - normal form
   - custom form page
   - data management page
   - custom data management page
   - app-shell PC portal
   - app-shell mobile portal
   - pure interactive workbench
   - business status lifecycle
   - real approval workflow
   - automation / JS_CODE
   - access governance / role governance / permissions
   - optional admin UI template:
     `glass-home-dashboard`, `mint-analytics-dashboard`,
     `ops-monitor-dashboard`, or `work-order-list-drawer`
2. Read the matching files in `examples/best-practices/`.
3. Copy the smallest useful slice into `src/`.
4. Keep view code thin; put reusable business logic in `domain/` and platform
   calls in `shared/services/`.
5. Run `pnpm examples:check` while changing examples, and `pnpm check` after
   copying code into the app source.

## State Flow Is Not Workflow

Most business processes are status lifecycles, not approval workflows.

Use a normal form plus:

- a `status` field
- user-facing responsibility fields such as personnel, department, enum, or
  SDK-backed select fields
- hidden permission scope keys only for small fixed data-permission conditions;
  for dynamic customer/project/region/store/college/class-like scopes, use
  business authorization forms plus `scope_policy`
- an action log form
- a pure state machine in `domain/<feature>/state-machine.ts`
- a service method that changes status and writes the log in one path
- optional automation / JS_CODE for timed reminders or backend follow-up

Use workflow only when there are real approval tasks:

- approver assignment
- agree / reject / transfer / countersign behavior
- approval opinions
- node-level permissions
- process task records and audit requirements
- notification or JS_CODE nodes tied to approval nodes

Do not model ordinary "pending -> processing -> resolved -> closed" state
changes as workflow forms.

## Layering Rules

Use this dependency direction:

```text
pages/forms -> shared -> domain
```

- `domain/<feature>/`: pure TypeScript business types, state machine,
  permission predicates, and query condition builders. No React, Ant Design,
  runtime SDK, CSS, or platform IDs.
- `shared/services/<feature>.ts`: SDK/API access, paginated queries, status
  updates, log writes, resource calls.
- `shared/hooks/<feature>/`: loading, refresh, submit pending, error handling,
  optimistic or rollback behavior.
- `shared/components/`: reusable empty, loading, error, status tag,
  confirmation, timeline, and list action components.
- `pages/<feature>/components/`: page-local reusable components.
- `pages/<feature>/styles.css`: page CSS namespace. Do not put all styling in
  TSX.
- `pages/<feature>/index.tsx`: entry and composition only. Avoid large business
  logic blocks here.

PC and mobile pages may have different layout/components, but must reuse the
same `domain/` and `shared/services/` when the business behavior is the same.

## Module Size Rules

- Avoid single-file pages. A page file over about 250 lines should be split.
- Move table columns, filter definitions, route configs, status configs, and
  action visibility rules into separate files.
- Do not let page components assemble complex API payloads directly. Call a hook
  or service.
- Keep shared modules independent from specific page folders.
- Keep domain functions unit-testable without a browser or platform runtime.

## Permission And Data Isolation

For account, role, RBAC, data-scope, or query-parameter authorization
requirements, read `permission-design-patterns.md` and choose one mode before
writing code:

- `managed-platform-account`: the app owns platform account/department lifecycle
  and role synchronization.
- `existing-platform-user-assignment`: the app assigns existing platform users
  to app roles and business scopes.
- `static-role-permission`: roles and permission groups are fixed resources.
- `query-param-context`: query parameters are context, filters, or ticket input
  only; sensitive access still needs real authorization.

For apps with managed accounts or dynamic roles:

1. Create the minimum governance forms required by the chosen mode:
   `organization_unit`, `system_account`, `role_assignment`, or a smaller app
   role maintenance form such as `app-role`.
2. Use App Functions, automation, or JS_CODE to sync organization units,
   platform accounts, and role records to platform departments/accounts/roles.
3. Model visible scope fields with maintainable controls:
   - personnel and departments use platform personnel/department fields
   - enum scopes use `SelectField` / `RadioField` with `options`
   - class, college, project, customer, and similar maintained records use
     `SelectField` with `optionSource.type: "linkedForm"` so the runtime queries
     source form records through the SDK and builds dropdown options
   - when the source form can have many records, set `remoteSearch: true`,
     `searchFieldId`, and a reasonable `pageSize` so typing in the dropdown
     triggers remote search
4. Add hidden derived scope keys only when platform form permission conditions
   require scalar matching in a small fixed app, for example:
   - `collegeScopeKey`
   - `classScopeKey`
   - `ownerDeptScopeKey`
   - `ownerUserScopeKey`
5. Create page permission groups for entry visibility.
6. For dynamic business ranges, declare
   `permissions/scope-dimensions`, `permissions/scope-grant-sources`, and
   `permissions/data-scope-policies`, then reference the policy from form
   permission groups or Data View permission groups with
   `dataPermission.type = "scope_policy"`.
7. Use condition-based data permissions only when the scope values are a small,
   fixed set or map cleanly to platform organization/departments.
8. For delegated administrators, add role API permissions in
   `src/resources/roles/<code>.json` with `apiPermissionCodes`, for example
   `app:role:manage`, `app:page-permission-group:manage`,
   `app:form-permission-group:manage`, and `app:organization:manage`.
9. Put sensitive writes behind App Functions with server-side role/scope checks.

Frontend button hiding is only user experience. It is not permission control.
Every sensitive action must still be protected by platform role/form permission
groups or backend-side JS_CODE checks.

Do not generate one role or one permission group per customer, project, region,
store, college, class, or other maintained business object. That configuration
will not scale and should be replaced with a form-maintained authorization
relationship and `scope_policy`.

Query parameters are not permission control either. They may prefill context,
select filters, or carry a signed/expiring ticket, but tampering with a query
parameter must not expand sensitive data access.

## Form Copy And Field Visibility

- Every visible form field should have a short, user-facing placeholder.
- Do not add tips to every field. Tips are only for special constraints,
  unusual formats, compliance notes, or non-obvious business rules.
- Use select/radio controls for enums. For values maintained by other forms, use
  `SelectField` with SDK-backed `optionSource` options. Do not ask users to type
  raw IDs.
- Hide permission scope keys, computed, sync, and developer/internal fields with
  `behavior: "HIDDEN"` when they must exist in the schema. Scope keys should be
  derived from visible select/person/department fields, not typed by
  users. For select-derived scalar keys, use `valueSync`.
- Do not add separate creator, updater, creator department, updater department,
  created time, or updated time fields unless the user explicitly needs a
  separate business field. The platform creates system metadata for every form.
- All visible copy must be written for end users. Do not put implementation
  notes, schema descriptions, or development explanations in sections, cards,
  labels, tips, helper text, or empty states.

## Query Performance

- Always use paginated APIs with `currentPage`, `pageSize`, sort, and structured
  conditions.
- Do not fetch a huge page and filter in the browser.
- Do not default to `searchKeyWord`. It is broad and expensive.
- For multi-field fuzzy search, build `filterGroup` with `OR` across explicit
  fields.
- Put query construction in `domain/<feature>/ticket-query.ts` or the service
  layer, not inside JSX.
- Keep current table/list data visible during refresh and show local refresh
  state to avoid flicker.

## Interaction Rules

- Every list/detail page needs loading, empty, error, refresh, and submit-pending
  states.
- Destructive or state-changing actions need confirmation.
- Show processing feedback and success/failure feedback.
- On failure, refresh or rollback the affected row instead of leaving stale UI.
- For PC CRUD, ticket, approval, and data-management pages, use overlay drawers
  or modals for detail, create, edit, approve/reject, and process forms. Do not
  keep a permanent right-side detail/form column that narrows the table.
- Keep interaction styles consistent across PC and mobile, but do not force the
  same layout component onto both viewports.

## Library Selection

- Do not hand-write mature controls or engines. Use platform components first
  for form-entry fields, personnel, departments, files, images, rich text,
  signatures, locations, standard forms, and data lists.
- Use `antd` / `antd-mobile` as the fallback for non-platform page controls,
  overlays, tables, steps, tabs, and temporary wrappers for missing platform
  capabilities. AI-authored app/workspace code must not emit raw native form
  controls; native inputs belong inside OpenXiangda SDK/platform component
  internals only.
- Use ECharts for charts and dashboards.
- Use GSAP for complex timeline/scroll/sequence animations; simple transitions
  can stay in CSS. If an animation-specific skill is available, read it before
  implementing.
- For drag/drop, virtual lists, calendars, spreadsheet-like input, QR/barcode,
  or export/import, research maintained packages and official docs before
  writing code.
- New dependencies should have a clear reason and a small adapter layer in the
  app, not copied third-party internals.

## Template Catalog

- `glass-home-dashboard`: optional default for PC admin home pages, management
  portals, and business overviews. Includes sidebar, top search, welcome
  banner, quick actions, KPI cards, charts, ranking, activity feed, query
  states, and drawer form actions.
- `mint-analytics-dashboard`: optional default for data-analysis and BI-like
  dashboards. Includes dense metric cards, line/bar/donut charts, notifications,
  todos, business summary, system health, query states, and drawer form actions.
- `ops-monitor-dashboard`: optional default for realtime operations,
  monitoring, task execution, alerts, system health, and device status. Uses
  lightweight CSS motion by default; do not add GSAP unless a real timeline
  requirement exists.
- `work-order-list-drawer`: default CRUD/list template for tickets, approvals,
  data-management pages, orders, and assets. Includes filters, toolbar, status
  stats, table, loading/empty/error branches, and right-side overlay drawers for
  detail, create, edit, and process forms.
- `customer-profile`: standard form schema with validation, members,
  departments, attachments, and child table.
- `service-ticket-lifecycle`: status lifecycle with ticket form, action-log
  form, state machine, service layer, and operation log.
- `service-ticket-ops`: custom data management page based on
  `DataManagementList`, split into page, components, hook, query builder, and
  detail drawer.
- `access-governance`: account/role permission mode decision, organization,
  account, role assignment, sync function, roles, page-group, and form-group
  skeletons.
- `role-governance`: role maintenance form, role sync JS_CODE, maintainable
  scope fields, hidden permission keys, and permission-group resource examples.
- `pc-portal-shell`: app-shell PC portal with routes, modules, components, and
  services.
- `mobile-portal-shell`: app-shell mobile portal with mobile-only components
  reusing the same domain/service layer.
- `interactive-workbench`: pure interactive page with reducer, modular panels,
  preview, loading/error, and batch operations.
- `expense-approval-workflow`: real approval workflow example; use only for
  approval scenarios.
- `daily-ticket-digest`: automation / JS_CODE example for paginated overdue
  query, notification, and log writing.
