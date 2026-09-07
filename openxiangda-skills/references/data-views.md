# Data View Resources

Data views are OpenXiangda-managed read-only query resources under `src/resources/data-views/`. They can run as PostgreSQL materialized views (`storageMode: "materialized"`, the default) or as live logical views (`storageMode: "live"`). Use them to publish repeated multi-form joins and predefined aggregate statistics as reusable app resources.

Use a data view when the app needs read-only joined data from multiple forms, such as:

- Ticket list with customer name, owner, SLA, and status fields.
- Order list with product, customer, and payment fields.
- Project dashboard combining project, member, task, and risk forms.
- Dashboard statistics such as monthly ticket count, order amount by customer, or task count by status.
- Reusable lookup or report data consumed by several pages or automations.
- Large list pages where repeated client-side cross-form joins would be slow or inconsistent.
- Real-time multi-form reads where the query shape is fixed and the source data volume is bounded (`storageMode: "live"`).

Do not use a data view for:

- Single-form CRUD. Use `sdk.form.advancedSearch`, form pages, or `DataManagementList`.
- Simple one-form dropdown options. Use `SelectField` with `optionSource.type: "linkedForm"`.
- Writes or write-back. Data views are read-only.
- Heavy real-time joins that cannot be paginated, indexed, filtered, or otherwise bounded.
- Raw SQL, incremental refresh, source-table trigger refresh, ad-hoc BI/pivot/window analysis, or write-heavy realtime dashboards.

## Authoring

Place manifests in `src/resources/data-views/*.json`. Use logical `formCode` values in source files. The CLI resolves them to the current profile's `formUuid` during `resource publish`.

Two view types are supported:

- `viewType: "row"` or omitted: row-level joined view using `select`.
- `viewType: "aggregate"`: grouped statistics view using `dimensions` and `measures`; query it with `stats`.

Two storage modes are supported:

- `storageMode: "materialized"` or omitted: create a PostgreSQL materialized view. Results may be stale until manual or scheduled refresh. Use `indexes` for common filters, sort fields, aggregate dimensions, and date buckets.
- `storageMode: "live"`: do not create a materialized view. Every query is compiled and executed against source forms in real time. `indexes` are ignored and refresh APIs do not apply. Use it only for bounded real-time query shapes.

Row view example:

```json
{
  "code": "ticket_with_customer",
  "name": "Ticket With Customer",
  "storageMode": "materialized",
  "base": { "formCode": "service_ticket", "alias": "ticket" },
  "joins": [
    {
      "type": "left",
      "formCode": "customer",
      "alias": "customer",
      "on": [
        {
          "left": "ticket.customer.value",
          "op": "=",
          "right": "customer.form_instance_id"
        }
      ]
    }
  ],
  "select": [
    { "field": "ticket.form_instance_id", "as": "ticketId" },
    { "field": "ticket.title", "as": "ticketTitle" },
    { "field": "customer.name", "as": "customerName" }
  ],
  "indexes": [{ "fields": ["ticketId"], "unique": true }],
  "refresh": { "mode": "scheduled", "cron": "0 */10 * * * *" },
  "permissionGroups": [
    {
      "code": "ticket_query",
      "name": "Ticket Query",
      "roles": ["manager"],
      "operations": ["query"]
    }
  ]
}
```

Aggregate statistics example:

```json
{
  "code": "ticket_stats_by_customer",
  "name": "Ticket Stats By Customer",
  "viewType": "aggregate",
  "storageMode": "materialized",
  "base": { "formCode": "service_ticket", "alias": "ticket" },
  "joins": [
    {
      "type": "left",
      "formCode": "customer",
      "alias": "customer",
      "on": [
        {
          "left": "ticket.customer.value",
          "op": "=",
          "right": "customer.form_instance_id"
        }
      ]
    }
  ],
  "dimensions": [
    { "field": "customer.name", "as": "customerName" },
    { "field": "ticket.created_at", "as": "createdMonth", "bucket": "month" }
  ],
  "measures": [
    { "type": "count", "as": "ticketCount" },
    { "type": "sum", "field": "ticket.amount", "as": "totalAmount" },
    { "type": "avg", "field": "ticket.amount", "as": "avgAmount" }
  ],
  "having": { "field": "ticketCount", "op": ">", "value": 0 },
  "indexes": [{ "fields": ["customerName", "createdMonth"] }],
  "refresh": { "mode": "scheduled", "cron": "0 */10 * * * *" },
  "permissionGroups": [
    {
      "code": "ticket_stats_query",
      "name": "Ticket Stats Query",
      "roles": ["manager"],
      "operations": ["query"]
    }
  ]
}
```

Field reference rules:

- Use `alias.field`, for example `ticket.title`.
- Use system fields directly, such as `form_instance_id`, `created_at`, `updated_at`, `created_by`, and `tenant_id`.
- For option-like JSON fields that store `{ label, value }`, use `.value` for joins and `.label` for display when needed.
- Every `select` item must have an explicit output alias in `as`.
- Aggregate `dimensions` and `measures` also need explicit output aliases in `as`.
- Runtime `fields`, `filters`, `having`, `order`, indexes, field permissions, and row permissions reference output aliases, not source field references.

Aggregate rules:

- Measures support `count`, `countDistinct`, `sum`, `avg`, `min`, and `max`.
- `sum` and `avg` only support `NumberField`.
- Date buckets support `hour`, `day`, `week`, `month`, `quarter`, and `year`, and only apply to `DateField`, `created_at`, and `updated_at`.
- `where` filters source rows before grouping; `having` filters aggregate output aliases after grouping.
- Use aggregate views for stable dashboard/query shapes. They are not an ad-hoc BI query engine.

Join rules:

- v1 supports `left` and `inner`.
- Join operators are `=`, `!=`, `<>`, `>`, `>=`, `<`, `<=`.
- The platform automatically constrains sources to the same tenant.

Filters:

- Definition `where` filters source rows before materialization and uses source references such as `ticket.status`.
- Runtime query filters use output aliases such as `ticketTitle`.
- Aggregate definition `having` and runtime stats `having` also use output aliases such as `ticketCount`.
- Supported operators include `=`, `!=`, `<>`, `>`, `>=`, `<`, `<=`, `contains`, `notContains`, `in`, `isEmpty`, and `isNotEmpty`, with aliases such as `eq`, `neq`, `gte`, `lte`, `like`, `is_null`, and `is_not_null`.
- Runtime SDK filters may be a search group/rule object or an array, for example `{ key: "statusValue", operator: "EQ", value: "已发布" }`; `field` is also accepted. Use output aliases, not source references.
- If a row view outputs a full option-like JSON field, runtime string `EQ` and `IN` filters can match the JSON text for compatibility. For new data views, prefer selecting `.value` or `.label` into scalar aliases such as `statusValue` and indexing those aliases for exact, predictable filters.
- Data view `permissionGroups.dataPermission` should use scalar hidden scope aliases such as `ownerUserScopeKey`, `unionGroupScopeKey`, or `departmentScopeKey`. Do not rely on fuzzy JSON option matching for permission boundaries.

Refresh:

- Refresh applies only to materialized data views.
- `manual` means refresh only when an administrator runs refresh or the resource is recreated.
- `scheduled` uses cron, for example `0 */10 * * * *`.
- Materialized query results may be stale. Show or inspect `lastRefreshedAt` when freshness matters.
- Live data views have no refresh state; `lastRefreshedAt` is `null` and refresh requests should be rejected.
- Do not choose a high-frequency schedule by default. Ask or infer how stale the data may be before setting `scheduled`.

Indexes:

- Index output aliases that pages filter or sort by.
- Row views should index stable IDs and common list filters/sort fields.
- Aggregate views should index dimensions and date buckets used by charts, filters, drill-downs, or ordering.
- Do not index every output field or every measure; extra indexes make refresh slower.
- Use `unique: true` only when the output field combination is truly unique.

## Performance And Freshness

Materialized data views move expensive joins and aggregations from page runtime to refresh time. Live data views keep results current by executing the same declared query shape on each request. Both modes reduce repeated page code complexity only when the view shape, data scope, and query bounds are chosen deliberately.

Before creating a data view, confirm these points:

- **Freshness tolerance**: ask whether users need near-real-time data, 10-30 minute freshness, hourly/daily reports, or manual snapshots.
- **Storage mode**: use `materialized` for read-heavy reports that tolerate refresh lag; use `live` for bounded real-time joins where source-table changes must appear immediately.
- **Query shape**: list the fields users will filter, sort, group, or drill down by. These should become output aliases and usually indexes.
- **Data scope**: if the business only needs active, recent, or in-scope records, put that rule in definition `where` so old/source-irrelevant rows are filtered before materialization.
- **Visible fields**: output only fields the page or permission rules need. Use hidden scope aliases for data permissions when needed, but do not build one huge catch-all view.

Refresh cadence guidance:

- Use `manual` for admin diagnostics, imported snapshots, low-change reference data, or data that is refreshed after an intentional operation.
- Use `scheduled` every 10-30 minutes for normal dashboards, joined report lists, and recurring management views.
- Use hourly or daily schedules for leadership reports, historical statistics, and large aggregate views.
- Avoid intervals below 5 minutes unless the user explicitly confirms the time sensitivity and expected source-table volume. High-frequency refreshes can pressure both source tables and the materialized view.
- For strong real-time behavior after each form save, use `storageMode: "live"` only when the query is bounded. If the logic includes writes, side effects, raw platform orchestration, or expensive unbounded joins, use source-form queries, App Functions, or a different backend workflow instead.

Index guidance:

- For materialized mode, index only output aliases, not source references such as `customer.name`.
- Live data views ignore `indexes`; keep their runtime filters and page size conservative.
- For row views, index IDs used in drill-down (`ticketId`, `customerId`) and common filters/order fields (`statusValue`, `ownerId`, `createdAt`).
- For aggregate views, index the dimensions/time buckets used in runtime `filters`, `having` drill-downs, and `order` (`customerId`, `statusValue`, `createdMonth`).
- Keep compound indexes aligned with common query prefixes. For example, dashboard filters by customer then month should use `["customerId", "createdMonth"]`.
- `searchKeyWord` across many text columns is inherently heavier than structured filters. Prefer explicit `filters` on indexed aliases.
- `countDistinct` and high-cardinality dimensions are refresh-heavy. Confirm data volume and avoid very frequent schedules.
- Show `lastRefreshedAt` on pages or in diagnostics when users may notice refresh delay.

## Permissions

Management APIs require `app:data-view:manage`.

Runtime page queries use data view permission groups unless the user has app manage or data view manage runtime bypass permission.

Permission group behavior:

- `operations` can include `query` and `refresh`; omitted operations default to `query`.
- Empty or omitted `roles` match all logged-in users.
- Missing or empty `fieldPermissions` means all output fields are visible.
- When multiple permission groups match, field permissions are most permissive: a field is visible if any matched group allows it.
- `dataPermission` is a row condition over output aliases.
- Hidden output aliases can still be used by `dataPermission`; this is useful for scope keys that should restrict rows but not be returned to pages.
- Multiple matched row conditions are ORed.
- If any matched group has no row condition, rows are unrestricted.

## Commands

Use the standard resource workflow:

```bash
openxiangda resource validate --profile dev
openxiangda resource plan --profile dev
openxiangda resource publish --profile dev
openxiangda resource pull --profile dev
```

Diagnostic commands:

```bash
openxiangda data-view list --profile dev
openxiangda data-view status ticket_with_customer --profile dev
openxiangda data-view refresh ticket_with_customer --profile dev  # materialized only
openxiangda data-view query ticket_with_customer --profile dev --fields ticketId,customerName
openxiangda data-view query ticket_with_customer --profile dev --query-json query.json
openxiangda data-view stats ticket_stats_by_customer --profile dev --fields customerName,ticketCount
openxiangda data-view stats ticket_stats_by_customer --profile dev --query-json stats-query.json
```

## Runtime SDK

`sdk.dataView.query` and `sdk.dataView.stats` work for both materialized and live data views. Responses include `storageMode`; materialized responses may include `lastRefreshedAt`, while live responses return current data and `lastRefreshedAt: null`.

Direct query:

```ts
const response = await sdk.dataView.query("ticket_with_customer", {
  fields: ["ticketId", "ticketTitle", "customerName"],
  filters: [
    { key: "customerName", operator: "contains", value: keyword },
    { key: "statusValue", operator: "EQ", value: "已发布" },
  ],
  order: [{ field: "ticketTitle", isAsc: "y" }],
  currentPage: 1,
  pageSize: 20,
})
```

Aggregate stats query:

```ts
const response = await sdk.dataView.stats("ticket_stats_by_customer", {
  fields: ["customerName", "createdMonth", "ticketCount", "totalAmount"],
  filters: [
    { key: "customerName", operator: "contains", value: keyword },
  ],
  having: [
    { key: "ticketCount", operator: ">", value: 0 },
  ],
  order: [{ field: "ticketCount", isAsc: "n" }],
  currentPage: 1,
  pageSize: 20,
})
```

The response data is:

```ts
{
  data: unknown[]
  totalCount: number
  currentPage: number
  pageSize: number
  lastRefreshedAt?: string | null
}
```

Page data source descriptor:

```ts
export default {
  dataSources: [
    {
      key: "tickets",
      type: "dataView.query",
      code: "ticket_with_customer",
      fields: ["ticketId", "ticketTitle", "customerName"],
      defaultFilter: [
        { key: "ticketTitle", operator: "isNotEmpty" }
      ]
    },
    {
      key: "ticketStats",
      type: "dataView.stats",
      code: "ticket_stats_by_customer",
      fields: ["customerName", "ticketCount"],
      defaultHaving: [
        { key: "ticketCount", operator: ">", value: 0 }
      ]
    }
  ]
}

const response = await sdk.dataSource.run("tickets", {
  filters: [
    { key: "customerName", operator: "contains", value: keyword }
  ],
  pageSize: 20,
})
```

## Common Patterns

List page:

- Define one data view for the list row shape.
- Select only fields shown in the table, filters, and row actions.
- Add indexes for common filters and sorts.
- Query with `sdk.dataView.query`.

Dashboard:

- Use aggregate data views for stable metrics such as counts, totals, averages, status distribution, and time buckets.
- Use row data views for drill-down lists behind those metrics.
- Keep refresh scheduled.
- Show `lastRefreshedAt` when business users care about freshness.

Reusable lookup:

- Use a data view if the display label depends on multiple forms.
- Keep the output small, for example `id`, `label`, `status`, and `owner`.
- For simple one-form lookup, keep using linkedForm instead.

Automation diagnosis:

- Query the data view with `openxiangda data-view query --query-json`.
- Query aggregate views with `openxiangda data-view stats --query-json`.
- Refresh manually after bulk imports or test data resets.

## Troubleshooting

- `formCode 未绑定`: publish or bind the source forms first so `.openxiangda/state.json` has their `formUuid`.
- Empty joined fields: check whether the source field stores a scalar or `{ label, value }`; linked/select fields usually need `.value`.
- Query field rejected: runtime filters and `fields` must use output aliases.
- User sees no data: inspect role codes, permission groups, `fieldPermissions`, and `dataPermission`.
- Data is stale: check `lastRefreshedAt`, scheduled cron, and refresh status.
