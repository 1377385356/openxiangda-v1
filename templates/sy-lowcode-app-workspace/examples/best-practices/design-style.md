# Design Style

OpenXiangda business apps should feel like focused operational tools.

## Default Admin UI Templates

These templates are polished defaults for B-end admin pages. They are optional
starting points, not hard product constraints.

### `glass-home-dashboard`

- Use for PC admin home pages, management portals, and general business
  dashboards.
- Visual direction: light blue glass surface, soft sidebar, translucent panels,
  welcoming banner, KPI cards with small trends, quick actions, chart blocks,
  ranking, activity feed, and target progress.
- Keep density medium. The first viewport should make the platform identity,
  navigation, search, and key metrics obvious.

### `mint-analytics-dashboard`

- Use for BI-style analysis, business reviews, operational reports, and weekly
  summary pages.
- Visual direction: low-saturation mint green, tighter metric cards, structured
  chart grid, notification and todo panels, business summary, and health score.
- Keep labels short and chart containers stable. Favor comparison, trend, and
  distribution charts over decorative widgets.

### `ops-monitor-dashboard`

- Use for realtime monitoring, operations centers, task execution, system
  health, and alert pages.
- Visual direction: blue-purple accent, stronger status hierarchy, realtime
  traffic chart, task progress bars, system rings, device state, alert list, and
  subtle CSS motion.
- Do not add GSAP or other animation dependencies by default. Use lightweight
  CSS transitions unless a product requirement needs a true timeline engine.

### `work-order-list-drawer`

- Use as the default CRUD/data-management template for tickets, approvals,
  orders, assets, and record operations.
- Layout: fixed app shell, compact filters, toolbar, status stat cards, dense
  table, pagination, and right-side overlay drawer.
- Detail, create, edit, approve, reject, and process forms open in `Drawer` or
  `Modal`. Do not put a permanent form/detail column beside the table, because
  it narrows the main working area and makes table operations less stable.

## Interaction Defaults

- Every async page has loading, refreshing, empty, error, and submit-pending
  states.
- List refresh should keep existing rows visible and show a small refresh state.
- Mutating actions need confirmation, pending feedback, success feedback, and a
  failure refresh or rollback path.
- Detail, create, edit, approval, and processing workflows should use an overlay
  `Drawer` or `Modal` with fixed header, scrollable body, and footer actions.
- Mobile actions should use a bottom action area, drawer, or action sheet; do
  not copy a dense PC table toolbar to mobile.

## Layout Defaults

- Use dense but readable workbench layouts for admin and ops pages.
- Put high-value filters near the list, not in hidden configuration pages.
- Use status tags, responsibility fields, and latest action summaries for
  lifecycle data.
- Do not build marketing-style hero pages for business tools.
- Do not nest cards inside cards. Use panels for page regions, and use cards
  only for repeated items, modals/drawers, or genuinely framed controls.

## Styling Rules

- Use Tailwind native utilities and arbitrary values as the default styling
  vocabulary, plus Ant Design and antd-mobile for mature controls.
- Platform token classes are compatibility helpers for platform components and
  theme overrides. Do not make them the main pattern for business pages.
- Prefer concrete Tailwind classes such as `bg-white`, `border`,
  `border-slate-200`, `text-slate-600`, `shadow-sm`, and
  `grid-cols-[240px_1fr]`. Do not use shadcn token classes such as `bg-card`,
  `text-muted-foreground`, or `text-foreground` unless the workspace explicitly
  configures them.
- Use mature packages for mature interactions: antd controls instead of native
  inputs, ECharts for charts, GSAP for complex animation timelines, and
  maintained drag/drop or virtual-list libraries when those behaviors are
  required.
- Research package docs and current maintenance before adding a new dependency;
  write business adapters instead of copying library internals.
- Keep page styles in `styles.css`; avoid large inline style objects.
- Keep reusable visual states in shared components: status tags, query states,
  confirmation triggers, and operation timelines.
- Do not override private Ant Design class names.
