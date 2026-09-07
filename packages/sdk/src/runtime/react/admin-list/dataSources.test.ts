import { describe, expect, it, vi } from "vitest"

import {
  createDataViewAdminListSource,
  createFormAdminListSource,
  createFunctionAdminListSource,
} from "./dataSources"

const query = {
  currentPage: 2,
  pageSize: 50,
  filters: { name: "光谱", status: ["enabled"] },
  sorts: [{ field: "createdAt", direction: "descend" as const }],
}

describe("AdminList built-in data sources", () => {
  it("includes the caller listKey in every source identity", () => {
    const sdk = {
      context: { app: { appType: "APP_TEST" } },
      dataView: { query: vi.fn() },
      form: { advancedSearch: vi.fn() },
      function: { invoke: vi.fn() },
      request: vi.fn(),
    } as any

    expect(
      createFormAdminListSource({
        sdk,
        listKey: "organization-module-owners:0",
        formUuid: "owners",
      }).key,
    ).not.toBe(
      createFormAdminListSource({
        sdk,
        listKey: "organization-module-owners:1",
        formUuid: "owners",
      }).key,
    )
    expect(
      createDataViewAdminListSource({
        sdk,
        listKey: "owners:0",
        dataViewCode: "owners",
      }).key,
    ).not.toBe(
      createDataViewAdminListSource({
        sdk,
        listKey: "owners:1",
        dataViewCode: "owners",
      }).key,
    )
    expect(
      createFunctionAdminListSource({
        sdk,
        listKey: "owners:0",
        functionCode: "owners",
      }).key,
    ).not.toBe(
      createFunctionAdminListSource({
        sdk,
        listKey: "owners:1",
        functionCode: "owners",
      }).key,
    )
  })

  it("maps form pagination, filters and multi-sort to the public SDK", async () => {
    const advancedSearch = vi.fn().mockResolvedValue({
      result: {
        result: {
          data: [{ formInstId: "1" }],
          totalCount: 1,
          currentPage: 2,
          pageSize: 50,
        },
        success: true,
        code: 200,
        total: 999,
      },
    })
    const sdk = {
      context: { app: { appType: "APP_TEST" } },
      form: { advancedSearch },
      request: vi.fn(),
    } as any
    const source = createFormAdminListSource({
      sdk,
      listKey: "instrument.orders",
      formUuid: "orders",
      fixedFilters: { tenantStatus: "active" },
    })

    await expect(source.query(query)).resolves.toMatchObject({
      rows: [{ formInstId: "1" }],
      total: 1,
      currentPage: 2,
      pageSize: 50,
    })
    expect(advancedSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        appType: "APP_TEST",
        formUuid: "orders",
        currentPage: 2,
        pageSize: 50,
        order: [{ id: "createdAt", isAsc: "n" }],
        filters: expect.objectContaining({
          logic: "AND",
          rules: expect.arrayContaining([
            expect.objectContaining({ key: "name", operator: "EQ" }),
            expect.objectContaining({ key: "status", operator: "IN" }),
          ]),
        }),
      }),
    )
  })

  it("keeps all supported row aliases across nested result envelopes", async () => {
    for (const key of ["rows", "records", "list", "items"] as const) {
      const advancedSearch = vi.fn().mockResolvedValue({
        result: { result: { [key]: [{ formInstId: key }], totalCount: 1 } },
      })
      const sdk = {
        context: { app: { appType: "APP_TEST" } },
        form: { advancedSearch },
        request: vi.fn(),
      } as any

      await expect(
        createFormAdminListSource({
          sdk,
          listKey: `orders.${key}`,
          formUuid: "orders",
        }).query(query),
      ).resolves.toMatchObject({
        rows: [{ formInstId: key }],
        total: 1,
      })
    }
  })

  it("uses the data-view and admin_list_v1 function contracts", async () => {
    const dataViewQuery = vi.fn().mockResolvedValue({
      result: { data: [{ id: "dv-1" }], totalCount: 1 },
    })
    const invoke = vi.fn().mockResolvedValue({
      result: { result: { rows: [{ id: "fn-1" }], total: 1 } },
    })
    const sdk = {
      context: { app: { appType: "APP_TEST" } },
      dataView: { query: dataViewQuery },
      function: { invoke },
      request: vi.fn(),
    } as any

    await createDataViewAdminListSource({
      sdk,
      listKey: "dv",
      dataViewCode: "orders_view",
    }).query(query)
    expect(dataViewQuery).toHaveBeenCalledWith(
      "orders_view",
      expect.objectContaining({ appType: "APP_TEST", currentPage: 2 }),
    )

    await createFunctionAdminListSource({
      sdk,
      listKey: "fn",
      functionCode: "query_orders",
    }).query(query)
    expect(invoke).toHaveBeenCalledWith(
      "query_orders",
      expect.objectContaining({
        input: expect.objectContaining({ contract: "admin_list_v1" }),
      }),
    )
  })

  it("creates selected and all export tasks without sending display rows", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        result: { id: "task-1", status: "pending" },
      })
      .mockResolvedValueOnce({
        result: {
          id: "task-1",
          status: "completed",
          downloadUrl: "/file/download",
        },
      })
    const sdk = {
      context: { app: { appType: "APP_TEST" } },
      form: { advancedSearch: vi.fn() },
      request,
    } as any
    const source = createFormAdminListSource({
      sdk,
      listKey: "orders",
      formUuid: "orders",
    })

    await source.createExportTask?.({
      scope: "selected",
      query,
      rowIds: ["1", "2"],
      fieldKeys: ["name"],
    })
    expect(request.mock.calls[0][0].body).toMatchObject({
      listKey: "orders",
      scope: "selected",
      rowIds: ["1", "2"],
      fieldKeys: ["name"],
      source: { type: "form", formUuid: "orders" },
    })
    expect(request.mock.calls[0][0].body.rows).toBeUndefined()

    await source.getExportTask?.("task-1")
    expect(request.mock.calls[1][0].path).toContain("/task-1")
  })

  it("downloads relative export tickets through PageSdk transport and saves the blob", async () => {
    const createObjectURL = vi.fn(() => "blob:admin-list-export")
    const revokeObjectURL = vi.fn()
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    })
    Object.defineProperty(window.URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    })
    let clickedAnchor: HTMLAnchorElement | undefined
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clickedAnchor = this
      })
    const download = vi.fn().mockResolvedValue({
      blob: new Blob(["report"], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      fileName:
        "attachment; filename*=UTF-8''%E5%90%8D%E5%86%8C.xlsx",
      headers: {
        "content-disposition":
          "attachment; filename*=UTF-8''%E5%90%8D%E5%86%8C.xlsx",
      },
    })
    const sdk = {
      context: { app: { appType: "APP_TEST" } },
      form: { advancedSearch: vi.fn() },
      request: vi.fn(),
      transport: { download },
    } as any
    const source = createFormAdminListSource({
      sdk,
      listKey: "orders",
      formUuid: "orders",
    })

    await source.downloadExportTask?.({
      id: "task-relative",
      status: "completed",
      downloadUrl: "/file/download-by-ticket?ticket=ticket-1",
    })

    expect(download).toHaveBeenCalledWith({
      path: "/file/download-by-ticket?ticket=ticket-1",
      method: "get",
    })
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(clickedAnchor?.download).toBe("名册.xlsx")
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:admin-list-export")
    click.mockRestore()
  })

  it("uses the structured export SDK and a server-defined provider", async () => {
    const create = vi.fn().mockResolvedValue({
      result: { id: "task-2", status: "pending" },
    })
    const get = vi.fn().mockResolvedValue({
      result: { id: "task-2", status: "completed" },
    })
    const sdk = {
      context: { app: { appType: "APP_TEST" } },
      form: { advancedSearch: vi.fn() },
      export: { create, get },
      request: vi.fn(),
    } as any
    const source = createFormAdminListSource({
      sdk,
      listKey: "orders",
      formUuid: "orders",
      exportDefinitionCode: "orders_export",
      exportDefinitionInput: { variant: "finance" },
    })

    await source.createExportTask?.({
      scope: "selected",
      query,
      rowIds: [1n],
      fieldKeys: ["name"],
      columns: [
        { key: "name", title: "名称", valuePath: "name" },
      ],
    })
    await source.getExportTask?.("task-2")

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        appType: "APP_TEST",
        exportKey: "orders",
        definitionCode: "orders_export",
        definitionInput: { variant: "finance" },
        rowIds: ["1"],
      }),
    )
    expect(get).toHaveBeenCalledWith("task-2", { appType: "APP_TEST" })
  })
})
