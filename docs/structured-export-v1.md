# Structured Export v1

`structured_export_v1` is the platform-owned asynchronous XLSX export
protocol. The platform creates the workbook, applies data permissions again
when the worker runs, streams rows into Excel, stores the file, and returns a
short-lived download ticket.

The browser never uploads executable JavaScript. Complex exports reference an
already-published App Function by `definitionCode`; that function is versioned,
reviewable, permission-scoped, and executed by the server.

## Choose an integration mode

Use declarative mode when the list already has all export fields:

```ts
const task = await sdk.export.create({
  exportKey: "instrument.orders",
  source: {
    type: "form",
    formUuid: "instrument_order",
    idField: "formInstId",
  },
  query: {
    filters: { status: ["pending", "completed"] },
    sorts: [{ field: "createTime", direction: "descend" }],
  },
  scope: "all",
  columns: [
    {
      key: "orderNo",
      title: "订单编号",
      value: { type: "field", path: "orderNo" },
    },
    {
      key: "applicant",
      title: "预约人",
      value: { type: "field", path: "applicant" },
      format: { type: "member" },
    },
    {
      key: "status",
      title: "状态",
      value: { type: "field", path: "status" },
      format: {
        type: "enum",
        map: { pending: "待处理", completed: "已完成" },
      },
    },
  ],
});
```

Use provider mode when the workbook needs joined data, multiple worksheets,
business calculations, a stable export schema independent of the page, or
custom display fields:

```ts
const task = await sdk.export.create({
  exportKey: "instrument.orders",
  definitionCode: "instrument_order_export",
  definitionInput: {
    reportVariant: "finance",
  },
  query: {
    filters: { departmentId, status },
    sorts: [{ field: "createTime", direction: "descend" }],
  },
  scope: selectedRowIds.length ? "selected" : "all",
  rowIds: selectedRowIds,
});
```

The browser sends only the export identity, business parameters, current query
snapshot, and optional stable row IDs. It does not send workbook columns or
rendering code in provider mode.

`AdminList` uses the same protocol. A column can declare a server-safe export
representation independently of its React cell renderer:

```tsx
{
  key: "owner",
  title: "预约人 / 课题组",
  dataIndex: "applicantName",
  render: (_, row) => <OwnerCell row={row} />,
  export: {
    value: {
      type: "template",
      template: "{{applicantName}} / {{researchGroupName}}",
    },
    width: 28,
  },
}
```

For a fully server-defined list export, set `exportDefinitionCode` and
optionally `exportDefinitionInput` on
`createFormAdminListSource`, `createDataViewAdminListSource`, or
`createFunctionAdminListSource`. The list still supplies the current query and
cross-page selected IDs, but the provider owns the workbook and exported row
shape.

## Provider contract

Publish an App Function that accepts
`contract: "structured_export_provider_v1"`. The platform invokes it with the
fresh user context of the account that created the task.

The `describe` phase returns the controlled workbook definition:

```ts
export default async function structuredExportProvider(ctx, request) {
  if (request.contract !== "structured_export_provider_v1") {
    throw new Error("Unsupported contract");
  }

  if (request.phase === "describe") {
    // Authorize with ctx.operator / ctx.currentUser. Never trust a role,
    // department, or user ID supplied in request.request.input.
    return {
      workbook: {
        fileName: `仪器订单_${new Date().toISOString().slice(0, 10)}.xlsx`,
        maxRows: 100000,
        sheets: [
          {
            key: "orders",
            name: "订单明细",
            freezeHeader: true,
            autoFilter: true,
            columns: [
              {
                key: "orderNo",
                title: "订单编号",
                value: { type: "field", path: "orderNo" },
                width: 24,
              },
              {
                key: "owner",
                title: "预约人 / 课题组",
                value: {
                  type: "template",
                  template: "{{applicantName}} / {{researchGroupName}}",
                },
                width: 28,
              },
              {
                key: "identityType",
                title: "身份类型",
                value: { type: "field", path: "identityType" },
                format: {
                  type: "enum",
                  map: {
                    inside: "校内",
                    outside: "校外",
                  },
                },
              },
              {
                key: "amount",
                title: "金额",
                value: { type: "field", path: "amount" },
                format: { type: "currency", currency: "CNY" },
                styleRules: [
                  {
                    when: { operator: "gt", value: 10000 },
                    style: { bold: true, fontColor: "#C2410C" },
                  },
                ],
              },
            ],
          },
        ],
      },
    };
  }

  if (request.phase === "query") {
    const { currentPage, pageSize } = request.query;
    const selectedIds =
      request.export.scope === "selected" ? request.export.rowIds : undefined;

    // This example uses a declared form resource. Real implementations may
    // query several declared resources and calculate custom output fields.
    const result = await ctx.form.queryMany({
      formCode: "instrument_order",
      currentPage,
      pageSize,
      filters: buildTrustedFilters({
        pageFilters: request.query.filters,
        selectedIds,
        currentUser: ctx.currentUser,
      }),
      order: buildAllowedOrder(request.query.sorts),
    });

    return {
      rows: result.data.map((row) => ({
        orderNo: row.orderNo,
        applicantName: memberName(row.applicant),
        researchGroupName: row.researchGroupName || "",
        identityType: row.identityType,
        amount: calculatePayableAmount(row),
      })),
      total: result.totalCount,
      // The platform removes any column whose source dependency is not listed.
      allowedColumnKeys: [
        "orderNo",
        "applicantName",
        "researchGroupName",
        "identityType",
        "amount",
      ],
    };
  }

  throw new Error(`Unsupported export phase: ${request.phase}`);
}
```

`describe` receives:

```ts
{
  contract: "structured_export_provider_v1",
  phase: "describe",
  request: {
    exportKey: string,
    query: object,
    scope: "selected" | "all",
    rowIds: Array<string | number>,
    fileName?: string,
    input: object
  }
}
```

`query` receives:

```ts
{
  contract: "structured_export_provider_v1",
  phase: "query",
  sheet: { key: string, name: string },
  query: { currentPage: number, pageSize: number, ...querySnapshot },
  export: {
    scope: "selected" | "all",
    rowIds: Array<string | number>,
    fieldKeys: string[]
  },
  input: object
}
```

The query response accepts `rows` (also `data`, `records`, or `list`),
`total` (also `totalCount`), and `allowedColumnKeys`.

Provider code must:

- declare every form, data view, connector, or function resource it uses;
- authorize from trusted runtime context rather than request parameters;
- apply the selected stable row IDs when `scope === "selected"`;
- whitelist filters and sort fields before building a query;
- paginate with the supplied `currentPage` and `pageSize`;
- return plain JSON values only.

## Optional server transformer

A declarative sheet can reference a published transformer:

```ts
{
  key: "orders",
  name: "订单",
  source: { type: "dataView", dataViewCode: "instrument_order_export_view" },
  columns: [
    {
      key: "displayOwner",
      title: "预约人 / 导师",
      value: { type: "field", path: "displayOwner" }
    }
  ],
  renderer: {
    type: "function",
    functionCode: "instrument_order_export_transform",
    input: { locale: "zh-CN" }
  }
}
```

The transformer receives permission-trimmed source rows page by page:

```ts
{
  contract: "structured_export_transform_v1",
  phase: "transform",
  sheet: { key: string, name: string },
  query: { currentPage: number, pageSize: number, ...querySnapshot },
  rows: object[],
  total: number,
  input: object
}
```

It returns the same page shape as a provider query. Use a transformer for
display-only joins or calculations that cannot be represented by the built-in
value and format specifications. Prefer provider mode when the transformer
would need to re-query most of the source data.

## Built-in cell rendering

Column `value` supports:

- `field`: nested path lookup;
- `coalesce`: first non-empty path;
- `template`: `{{field.path}}` interpolation;
- `constant`: a scalar constant.

Column `format.type` supports `text`, `number`, `currency`, `percent`, `date`,
`datetime`, `boolean`, `enum`, `join`, `member`, `department`, `json`, and
`mask`. Static styles and conditional `styleRules` are also supported.

All text values beginning with `=`, `+`, `-`, or `@` are escaped before being
written to Excel to prevent formula injection.

## Poll and download

```ts
let current = task.result;
while (
  current &&
  current.status !== "completed" &&
  current.status !== "failed"
) {
  await new Promise((resolve) => setTimeout(resolve, 1200));
  current = (await sdk.export.get(current.id)).result;
}

if (current?.status === "failed") {
  throw new Error(current.message || "导出失败");
}

if (current?.downloadUrl) {
  window.location.assign(current.downloadUrl);
}
```

The download URL is a short-lived user-bound ticket. Do not persist it.

## Platform limits

- 10 worksheets per workbook;
- 200 columns per worksheet;
- 100,000 data rows per workbook;
- 10,000 selected stable row IDs;
- 256 KiB normalized workbook definition;
- 128 KiB provider query plus provider input.

Exports use the user's permissions and data scope at worker execution time,
not only at button-click time. A permission removed while a task is waiting
therefore takes effect before data is read.
