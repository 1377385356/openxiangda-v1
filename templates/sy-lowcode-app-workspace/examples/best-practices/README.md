# OpenXiangda Best Practices

These examples are intentionally placed under `examples/best-practices/`.
They are copied by `workspace init`, but they are not scanned by
`lowcode-workspace build` or `openxiangda workspace publish`.

Copy the pieces you need into `src/`:

```bash
cp -R examples/best-practices/src/shared/components/admin-ui-templates src/shared/components/
cp -R examples/best-practices/src/pages/work-order-list-drawer src/pages/
cp -R examples/best-practices/src/domain/service-ticket src/domain/
cp -R examples/best-practices/src/shared/services/service-ticket.ts src/shared/services/
cp -R examples/best-practices/src/pages/service-ticket-ops src/pages/
cp -R examples/best-practices/src/forms/service-ticket src/forms/
```

Run `pnpm examples:check` after editing examples, and run the normal
`pnpm check` after copying code into `src/`.

## Core Rules

- Keep view code thin. Pages compose components, hooks, and services.
- Put business rules in `domain/`; keep it free of React, SDK, and UI imports.
- Put platform calls in `shared/services/`.
- Put reusable loading, empty, error, status, and confirmation UI in
  `shared/components/`.
- Use state fields and operation logs for business lifecycle flows.
- Use workflow only for real approval tasks.
- For account, role, data scope, organization-account, RBAC, or query-param
  authorization work, run `openxiangda design gates --topic permissions --json`
  and choose an access governance mode before copying examples.
- Query with pagination and structured conditions. Avoid large page sizes,
  client-side filtering, and broad `searchKeyWord` queries.
- For admin UI, choose one optional default from `glass-home-dashboard`,
  `mint-analytics-dashboard`, `ops-monitor-dashboard`, or
  `work-order-list-drawer`; use `work-order-list-drawer` as the default CRUD
  list pattern.
- Keep record detail and all create/edit/process forms in drawers or modals;
  do not keep a permanent right-side detail column on data-management pages.

Read `decision-guide.md`, `module-structure.md`, and `design-style.md` before
using any template.
