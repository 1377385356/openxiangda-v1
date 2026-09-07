# Decision Guide

## Page And Data Shape

Use a form when you need a data table. Each form schema defines fields,
validation, storage shape, and generated platform data APIs.

Use a code page when you need a workbench, portal, dashboard, cross-form
composition, custom list actions, or complex interaction.

Use `DataManagementList` for list/search/export/batch-management pages. Extend
it with row actions, custom renderers, and drawers instead of rebuilding
pagination, export, and filters from scratch.

## Default Admin UI Templates

The UI templates are recommended starting points, not mandatory styles. Choose
one based on the page's primary job:

- `work-order-list-drawer`: default for CRUD, approval handling, work orders,
  ticket lists, and data-management pages. Detail, create, edit, and process
  forms use right-side overlay drawers; do not reserve a permanent right detail
  column that squeezes the table.
- `glass-home-dashboard`: default for a friendly PC admin home page, management
  portal, or first-screen business overview.
- `mint-analytics-dashboard`: default for analysis-heavy dashboards, weekly
  business reviews, BI-like reports, and data-summary pages.
- `ops-monitor-dashboard`: default for realtime operations, task execution,
  alerts, system health, and monitoring centers.

When a page combines list management and a dashboard, start from
`work-order-list-drawer` if users spend most time operating rows. Start from a
dashboard template only when the main job is reading metrics.

## State Flow Is Not Workflow

Most business "processes" are lifecycle state changes:

- work tickets: new -> accepted -> processing -> resolved -> closed
- orders: draft -> submitted -> paid -> fulfilled -> completed
- assets: available -> reserved -> in_use -> maintenance -> retired

Use a normal form with a `status` field, maintainable ownership/scope fields,
and an operation-log form. Define allowed transitions in
`domain/<feature>/state-machine.ts`, and execute changes through a service
method that updates state and writes logs.

Use workflow only when the platform must create approval tasks with approvers,
approval comments, agree/reject actions, copy nodes, node field permissions, and
approval history.

## Automation And JS_CODE

Use automation or workflow JS_CODE when logic must run on the backend after a
trigger: scheduled scans, cross-form synchronization, notification fan-out,
external HTTP calls, or platform role synchronization.

Frontend code must not be responsible for data isolation or background jobs.

## Permissions

Run `openxiangda design gates --topic permissions --json` before implementing
account, role, RBAC, organization-account, data-scope, or query-param
authorization requirements.

Choose one pattern:

- `managed-platform-account`: app creates and maintains platform departments,
  accounts, and role members. Start from `access-governance.md`.
- `existing-platform-user-assignment`: app selects existing platform users and
  assigns roles/business scopes. Use a role assignment form with
  `UserSelectField`.
- `static-role-permission`: fixed roles and permission groups only.
- `query-param-context`: query parameters are context, filters, or ticket input
  only; they cannot grant sensitive access.

For dynamic multi-role apps, create a business role table and synchronize it to
platform app roles. User-facing scope fields should be maintainable controls:
personnel/department fields for people and orgs, enum fields for fixed option
sets, and SDK-backed `SelectField` dropdowns for classes, colleges, projects,
customers, and other records maintained by forms. Use `remoteSearch: true` when
the source form can have many records. If the platform permission condition
needs a scalar value, derive a hidden scope key such as `collegeScopeKey` or
`ownerDeptScopeKey`. Use form permission groups with condition-style data
permissions and App Function role/scope checks to enforce data isolation.

When an app role is expected to create roles, assign role members, grant role
API permissions, maintain permission groups, or manage organization accounts,
declare the matching `apiPermissionCodes` on that role. `app:role:manage` is
required for app role creation and member assignment; page/form permission group
maintenance and organization account management use their own permission codes.

Frontend hiding and query parameters are not authorization. They must not be the
only barrier for sensitive data or write actions.
