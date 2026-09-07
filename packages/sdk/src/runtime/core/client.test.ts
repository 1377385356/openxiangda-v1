import { describe, expect, it, vi } from "vitest"

import { createPageSdk } from "./client"

import type { PageApiResponse, PageContext, PageListResult } from "./types"

const createContextFixture = (): PageContext => ({
  protocolVersion: "1.0",
  app: {
    appType: "crm",
    tenantId: "demo-tenant",
  },
  page: {
    id: "page-1",
    code: "customer-dashboard",
    name: "客户总览",
    type: "custom_code_page",
    rendererType: "custom_bundle",
    routeKey: "customer-dashboard",
    status: "active",
    props: {},
    route: {},
    dataSources: [
      {
        key: "customerList",
        type: "form.list",
        formUuid: "FORM_001",
        defaultFilter: {
          key: "status",
          operator: "EQ",
          value: "active",
        },
      },
    ],
    capabilities: {},
  },
  user: {
    id: "user-1",
    tenantId: "demo-tenant",
    username: "demo.user",
  },
  route: {
    pathname: "/page/customer-dashboard",
    fullPath: "/page/customer-dashboard",
    params: {
      pageKey: "customer-dashboard",
    },
    query: {},
    hash: "",
  },
  env: {},
  permissions: {
    canView: true,
    hasFullAccess: true,
  },
  capabilities: [],
  ui: {
    message: {
      error: () => undefined,
      info: () => undefined,
      loading: () => () => undefined,
      success: () => undefined,
      warning: () => undefined,
    },
    modal: {
      confirm: async () => true,
    },
  },
  navigation: {
    back: () => undefined,
    pushPage: () => undefined,
    pushRoute: () => undefined,
    replacePage: () => undefined,
    replaceRoute: () => undefined,
    setHash: () => undefined,
    updateQuery: () => undefined,
  },
  bridge: {
    invoke: vi.fn(async () => ({
      code: 200,
      result: null,
      success: true,
    })) as PageContext["bridge"]["invoke"],
  },
})

const readQuery = (value?: string) => new URLSearchParams(value || "")

describe("createPageSdk", () => {
  it("serializes query params for transport.request and normalizes envelopes", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    ;(context.bridge.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      code: 200,
      data: [{ id: "user-1" }],
      message: "ok",
    })

    const response = await sdk.request<{ id: string }[]>({
      path: "/user/list",
      method: "get",
      query: {
        ids: ["user-1", "user-2"],
        page: 2,
      },
    })

    expect(response.result).toEqual([{ id: "user-1" }])
    expect(context.bridge.invoke).toHaveBeenCalledWith("transport.request", {
      body: undefined,
      headers: undefined,
      method: "get",
      path: "/user/list",
      query: "ids=user-1&ids=user-2&page=2",
    })
  })

  it("rejects HTTP 200 envelopes with string business error codes", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    ;(context.bridge.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      code: "PUBLIC_GRANT_DENIED",
      message: "公开访问未授权调用该资源",
      data: null,
    })

    await expect(sdk.request({ path: "/crm/v1/functions/private/invoke.json" }))
      .rejects
      .toMatchObject({
        message: "公开访问未授权调用该资源",
        response: {
          code: "PUBLIC_GRANT_DENIED",
          success: false,
        },
      })
  })

  it("normalizes transport.download responses and parses file names", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    ;(context.bridge.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: new Blob(["demo"], { type: "text/plain" }),
      headers: {
        "content-disposition": `attachment; filename*=UTF-8''demo-report.xlsx`,
        "content-type": "text/plain",
      },
    })

    const response = await sdk.download({
      path: "/download/report",
      method: "get",
    })

    expect(response.fileName).toBe("demo-report.xlsx")
    expect(response.contentType).toBe("text/plain")
    expect(response.blob).toBeInstanceOf(Blob)
    expect(context.bridge.invoke).toHaveBeenCalledWith("transport.download", {
      body: undefined,
      headers: undefined,
      method: "get",
      path: "/download/report",
      query: undefined,
    })
  })

  it("creates file access tickets with the current appType by default", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    ;(context.bridge.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      code: 200,
      success: true,
      result: {
        ticket: "ticket-1",
        appType: "crm",
        previewPageUrl: "/view/crm/file-preview?ticket=ticket-1",
      },
    })

    const response = await sdk.createFileAccessTicket(
      "lowcode",
      "contracts/demo.docx",
      "demo.docx",
    )

    expect(response.result?.previewPageUrl).toBe(
      "/view/crm/file-preview?ticket=ticket-1",
    )
    expect(context.bridge.invoke).toHaveBeenCalledWith("transport.request", {
      body: {
        bucketName: "lowcode",
        objectName: "contracts/demo.docx",
        fileName: "demo.docx",
        purpose: "preview",
        appType: "crm",
      },
      headers: undefined,
      method: "post",
      path: "/file/access-ticket",
      query: undefined,
    })
  })

  it("invokes connectors through the app runtime endpoint", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    ;(context.bridge.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      code: 200,
      success: true,
      data: {
        status: 200,
        duration: 12,
        data: { id: "customer-1" },
      },
    })

    const response = await sdk.connector.call("crm.getCustomer", {
      appType: "sales",
      query: { id: "customer-1" },
      headers: { "X-Trace-Id": "trace-1" },
    })

    expect(response.result?.data).toEqual({ id: "customer-1" })
    expect(context.bridge.invoke).toHaveBeenCalledWith("transport.request", {
      body: {
        connector: "crm",
        api: "getCustomer",
        pathParams: undefined,
        query: { id: "customer-1" },
        body: undefined,
        headers: { "X-Trace-Id": "trace-1" },
        requestBodyType: undefined,
        responseType: undefined,
      },
      headers: undefined,
      method: "post",
      path: "/sales/v1/connectors/actions/invoke",
      query: undefined,
    })
  })

  it("downloads connector binary responses through transport.download", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    ;(context.bridge.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: new Blob(["hello"], { type: "text/plain" }),
      headers: {
        "content-disposition": "attachment; filename=hello.txt",
        "content-type": "text/plain",
      },
    })

    const response = await sdk.connector.download({
      connector: "crm",
      api: "exportCustomers",
    })

    expect(response.fileName).toBe("hello.txt")
    expect(response.contentType).toBe("text/plain")
    expect(await response.blob.text()).toBe("hello")
    expect(context.bridge.invoke).toHaveBeenCalledWith(
      "transport.download",
      expect.objectContaining({
        body: expect.objectContaining({
          connector: "crm",
          api: "exportCustomers",
          responseType: "binary",
        }),
        method: "post",
        path: "/crm/v1/connectors/actions/download",
      }),
    )
  })

  it("serializes advanced search and simple search payloads", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    ;(context.bridge.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      code: 200,
      success: true,
      result: {
        currentPage: 1,
        data: [],
        totalCount: 0,
      },
    } satisfies PageApiResponse<PageListResult>)

    await sdk.form.advancedSearch({
      formUuid: "FORM_001",
      filters: {
        key: "detailList",
        componentName: "SubFormField",
        operator: "EXISTS",
        value: {
          logic: "AND",
          rules: [
            {
              key: "sku",
              componentName: "TextField",
              operator: "EQ",
              value: "A100",
            },
          ],
        },
      },
      order: [{ id: "createTime", isAsc: "n" }],
      searchKeyWord: "星云",
    })

    await sdk.form.search({
      formUuid: "FORM_001",
      search: {
        key: "owner",
        operator: "EQ",
        value: "Alice",
      },
      dynamicOrder: {
        id: "created_at",
        isAsc: "n",
      },
    })

    const advancedPayload = (context.bridge.invoke as ReturnType<typeof vi.fn>)
      .mock.calls[0][1]
    const searchPayload = (context.bridge.invoke as ReturnType<typeof vi.fn>)
      .mock.calls[1][1]

    expect(advancedPayload.path).toBe("/crm/v1/form/advancedSearch.json")
    expect(
      JSON.parse(String(readQuery(advancedPayload.query).get("filters"))),
    ).toMatchObject({
      logic: "AND",
      rules: [
        {
          key: "detailList",
          componentName: "SubFormField",
          operator: "EXISTS",
        },
      ],
    })
    expect(
      JSON.parse(String(readQuery(advancedPayload.query).get("order"))),
    ).toEqual([{ id: "createTime", isAsc: "n" }])

    expect(searchPayload.path).toBe("/crm/v1/form/searchFormDatas.json")
    expect(readQuery(searchPayload.query).get("dynamicOrder")).toBe(
      "created_at:-",
    )
    expect(
      JSON.parse(String(readQuery(searchPayload.query).get("searchFieldJson"))),
    ).toMatchObject({
      logic: "AND",
      rules: [
        {
          key: "owner",
          operator: "EQ",
          value: "Alice",
        },
      ],
    })
  })

  it("keeps the returned form instance id when saveFormData provides one", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    ;(context.bridge.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      code: 200,
      success: true,
      result: { formInstId: "inst-direct" },
    })

    const response = await sdk.form.create({
      formUuid: "FORM_001",
      data: { title: "合同A" },
    })

    expect((response as any).formInstId).toBe("inst-direct")
    expect(response.result).toMatchObject({ formInstId: "inst-direct" })
    expect(context.bridge.invoke).toHaveBeenCalledTimes(1)
  })

  it("preserves zero, false, empty string, and null in form write payloads", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    ;(context.bridge.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      code: 200,
      success: true,
      result: { formInstId: "inst-falsy-values" },
    })
    const data = {
      zeroAmount: 0,
      disabled: false,
      emptyText: "",
      clearedValue: null,
    }

    await sdk.form.create({
      formUuid: "FORM_001",
      data,
    })
    await sdk.form.update({
      formUuid: "FORM_001",
      formInstId: "inst-falsy-values",
      data,
    })

    const calls = (context.bridge.invoke as ReturnType<typeof vi.fn>).mock.calls
    expect(JSON.parse(calls[0][1].body.formDataJson)).toEqual(data)
    expect(JSON.parse(calls[1][1].body.updateFormDataJson)).toEqual(data)
  })

  it("normalizes string create results into a FormCreateResult object", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    ;(context.bridge.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      code: 200,
      success: true,
      result: "inst-string",
      serialNumber: "SN-001",
      serialNumbers: { serial_no: "SN-001" },
    })

    const response = await sdk.form.create({
      formUuid: "FORM_001",
      data: { title: "合同A" },
    })

    expect((response as any).formInstId).toBe("inst-string")
    expect((response as any).serialNumber).toBe("SN-001")
    expect(response.result).toMatchObject({
      formInstId: "inst-string",
      formInstanceId: "inst-string",
      result: "inst-string",
      serialNumber: "SN-001",
      serialNumbers: { serial_no: "SN-001" },
    })
    expect(typeof response.result).toBe("object")
  })

  it("keeps top-level form ids from raw envelopes when data has no id", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    ;(context.bridge.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      code: 200,
      success: true,
      formInstId: "inst-top-level",
      data: { ok: true },
    })

    const response = await sdk.form.create({
      formUuid: "FORM_001",
      data: { title: "合同A" },
    })

    expect((response as any).formInstId).toBe("inst-top-level")
    expect(response.result).toMatchObject({
      formInstId: "inst-top-level",
      formInstanceId: "inst-top-level",
    })
  })

  it("passes draft controls when creating a process form draft", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    ;(context.bridge.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      code: 200,
      success: true,
      formInstId: "draft-1",
    })

    await sdk.form.create({
      formUuid: "FORM_001",
      data: { title: "合同草稿" },
      saveAsDraft: true,
      startProcess: false,
      processStartMode: "manual",
    })

    expect(context.bridge.invoke).toHaveBeenCalledWith(
      "transport.request",
      expect.objectContaining({
        method: "post",
        path: "/crm/v1/form/saveFormData.json",
        body: expect.objectContaining({
          formUuid: "FORM_001",
          saveAsDraft: true,
          startProcess: false,
          processStartMode: "manual",
        }),
      }),
    )
  })

  it("rejects create responses that do not contain a form instance id by default", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    ;(context.bridge.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      code: 200,
      success: true,
      result: { ok: true },
    })

    await expect(
      sdk.form.create({
        formUuid: "FORM_001",
        data: { title: "合同A" },
      }),
    ).rejects.toThrow("保存接口未返回 formInstId/formInstanceId")
    expect(context.bridge.invoke).toHaveBeenCalledTimes(1)
  })

  it("looks up the created form instance id only when legacy lookup is explicit", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    ;(context.bridge.invoke as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        code: 200,
        success: true,
        result: { ok: true },
      })
      .mockResolvedValueOnce({
        code: 200,
        success: true,
        result: {
          currentPage: 1,
          data: [{ formInstId: "inst-lookup", title: "合同A" }],
          totalCount: 1,
        },
      })

    const response = await sdk.form.create({
      formUuid: "FORM_001",
      data: {
        title: "合同A",
        amount: 100,
        detailList: [{ sku: "A100" }],
      },
      lookupAfterCreate: true,
    })

    expect((response as any).formInstId).toBe("inst-lookup")
    expect(response.result).toMatchObject({
      ok: true,
      formInstId: "inst-lookup",
      formInstanceId: "inst-lookup",
    })

    const lookupPayload = (context.bridge.invoke as ReturnType<typeof vi.fn>)
      .mock.calls[1][1]
    const lookupQuery = readQuery(lookupPayload.query)
    expect(lookupPayload.path).toBe("/crm/v1/form/advancedSearch.json")
    expect(lookupQuery.get("formUuid")).toBe("FORM_001")
    expect(Number(lookupQuery.get("currentPage"))).toBe(1)
    expect(Number(lookupQuery.get("pageSize"))).toBe(1)
    expect(JSON.parse(String(lookupQuery.get("filters")))).toMatchObject({
      logic: "AND",
      rules: [
        { key: "title", operator: "EQ", value: "合同A" },
        { key: "amount", operator: "EQ", value: 100 },
      ],
    })
    expect(JSON.parse(String(lookupQuery.get("order")))).toEqual([
      { id: "createTime", isAsc: "n" },
    ])
  })

  it("dedupes identical in-flight GET requests", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    let resolveResponse: (value: unknown) => void = () => undefined
    ;(context.bridge.invoke as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveResponse = resolve
      }),
    )

    const first = sdk.request({ path: "/user/current", method: "get" })
    const second = sdk.request({ path: "/user/current", method: "get" })
    resolveResponse({ code: 200, success: true, data: { id: "u1" } })

    await expect(first).resolves.toMatchObject({ result: { id: "u1" } })
    await expect(second).resolves.toMatchObject({ result: { id: "u1" } })
    expect(context.bridge.invoke).toHaveBeenCalledTimes(1)
  })

  it("defaults appType for scoped role and process calls", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    ;(context.bridge.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      code: 200,
      success: true,
      result: true,
    })

    await sdk.role.list({
      scope: "app",
    })

    await sdk.process.approveTask({
      instanceId: "proc-1",
      action: "approved",
      formUuid: "FORM_001",
    })

    const rolePayload = (context.bridge.invoke as ReturnType<typeof vi.fn>).mock
      .calls[0][1]
    const processPayload = (context.bridge.invoke as ReturnType<typeof vi.fn>)
      .mock.calls[1][1]

    expect(readQuery(rolePayload.query).get("appType")).toBe("crm")
    expect(processPayload.path).toBe("/crm/v1/process/approveTask.json")
    expect(processPayload.body).toMatchObject({
      appType: "crm",
      formUuid: "FORM_001",
      instanceId: "proc-1",
    })
  })

  it("calls workflow capability and task operation endpoints", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    ;(context.bridge.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      code: 200,
      success: true,
      data: {},
    })

    await sdk.process.resolveCapabilities({
      formInstanceId: "form-inst-1",
      formUuid: "FORM_001",
    })
    await sdk.process.startFromExistingInstance({
      formUuid: "FORM_001",
      formInstId: "form-inst-1",
      updateFormDataJson: '{"amount":100}',
      selectedApprovers: { approval_1: ["user-3"] },
    })
    await sdk.process.transferTask({
      taskId: "task-1",
      newAssignee: "user-2",
      reason: "请协助审批",
    })
    await sdk.process.returnTask({
      taskId: "task-1",
      targetNodeId: "start",
      reason: "补充材料",
    })
    await sdk.process.saveTask({
      instanceId: "proc-1",
      formUuid: "FORM_001",
      updateFormDataJson: '{"amount":120}',
      comments: "暂存说明",
    })
    await sdk.process.preview({
      formUuid: "FORM_001",
      data: { amount: 100 },
      selectedApprovers: { approval_1: ["user-3"] },
    })

    const calls = (context.bridge.invoke as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => call[1])

    expect(calls[0]).toMatchObject({
      method: "post",
      path: "/workflow/capabilities/resolve",
      body: {
        appType: "crm",
        formInstanceId: "form-inst-1",
        formUuid: "FORM_001",
      },
    })
    expect(calls[1]).toMatchObject({
      method: "post",
      path: "/workflow/start-from-form-instance",
      body: {
        appType: "crm",
        formUuid: "FORM_001",
        formInstId: "form-inst-1",
        updateFormDataJson: '{"amount":100}',
        selectedApprovers: { approval_1: ["user-3"] },
        initiatorSelectedApprovers: { approval_1: ["user-3"] },
      },
    })
    expect(calls[2]).toMatchObject({
      method: "post",
      path: "/workflow/task/task-1/transfer",
      body: {
        newAssignee: "user-2",
        reason: "请协助审批",
      },
    })
    expect(calls[3]).toMatchObject({
      method: "post",
      path: "/workflow/task/task-1/return",
      body: {
        targetNodeId: "start",
        reason: "补充材料",
      },
    })
    expect(calls[4]).toMatchObject({
      method: "post",
      path: "/workflow/task/save",
      body: {
        appType: "crm",
        instanceId: "proc-1",
        formUuid: "FORM_001",
        updateFormDataJson: '{"amount":120}',
        comments: "暂存说明",
      },
    })
    expect(calls[5]).toMatchObject({
      method: "post",
      path: "/workflow/preview",
      body: {
        appType: "crm",
        formUuid: "FORM_001",
        data: { amount: 100 },
        selectedApprovers: { approval_1: ["user-3"] },
        initiatorSelectedApprovers: { approval_1: ["user-3"] },
      },
    })
  })

  it("supports auth logout and current role switching helpers", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    const invokeMock = context.bridge.invoke as ReturnType<typeof vi.fn>
    invokeMock.mockResolvedValue({
      code: 200,
      success: true,
      result: true,
    })

    await sdk.auth.logout()
    await sdk.role.switchAppRole({ roleId: "role-sales" })
    await sdk.role.switchAppRole({ roleId: "" })
    await sdk.role.switchPlatformRole({ roleId: "role-platform-admin" })

    expect(invokeMock).toHaveBeenNthCalledWith(1, "transport.request", {
      body: undefined,
      headers: undefined,
      method: "post",
      path: "/api/auth/logout",
      query: undefined,
    })
    expect(invokeMock).toHaveBeenNthCalledWith(2, "transport.request", {
      body: {
        appType: "crm",
        roleId: "role-sales",
      },
      headers: undefined,
      method: "post",
      path: "/role/switch/app",
      query: undefined,
    })
    expect(invokeMock).toHaveBeenNthCalledWith(3, "transport.request", {
      body: {
        appType: "crm",
        roleId: "",
      },
      headers: undefined,
      method: "post",
      path: "/role/switch/app",
      query: undefined,
    })
    expect(invokeMock).toHaveBeenNthCalledWith(4, "transport.request", {
      body: {
        roleId: "role-platform-admin",
      },
      headers: undefined,
      method: "post",
      path: "/role/switch/platform",
      query: undefined,
    })
  })

  it("logs out and redirects to login with the current page callback", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    const invokeMock = context.bridge.invoke as ReturnType<typeof vi.fn>
    const redirect = vi.fn()

    window.history.pushState(
      {},
      "",
      "/view/crm/workbench/customer-dashboard?tab=list#filters",
    )

    invokeMock.mockResolvedValue({
      code: 200,
      success: true,
      result: true,
    })

    const currentUrl = window.location.href
    const response = await sdk.auth.logoutAndRedirect({
      loginUrl: "/login?tenant=demo#auth",
      redirect,
    })

    expect(response?.result).toBe(true)
    expect(redirect).toHaveBeenCalledWith(
      `/login?tenant=demo&callback=${encodeURIComponent(currentUrl)}#auth`,
    )
    expect(invokeMock).toHaveBeenCalledWith("transport.request", {
      body: undefined,
      headers: undefined,
      method: "post",
      path: "/api/auth/logout",
      query: undefined,
    })

    window.history.pushState({}, "", "/")
  })

  it("defaults logout redirect to the platform login page", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    const invokeMock = context.bridge.invoke as ReturnType<typeof vi.fn>
    const redirect = vi.fn()

    window.history.pushState({}, "", "/view/crm/workbench/customer-dashboard")

    invokeMock.mockResolvedValue({
      code: 200,
      success: true,
      result: true,
    })

    const currentUrl = window.location.href
    await sdk.auth.logoutAndRedirect({ redirect })

    expect(redirect).toHaveBeenCalledWith(
      `/platform/login?callback=${encodeURIComponent(currentUrl)}`,
    )

    window.history.pushState({}, "", "/")
  })

  it("continues redirecting to login when logout fails by default", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    const invokeMock = context.bridge.invoke as ReturnType<typeof vi.fn>
    const redirect = vi.fn()

    invokeMock.mockRejectedValueOnce({
      code: 500,
      message: "logout failed",
    })

    const response = await sdk.auth.logoutAndRedirect({
      loginUrl: "/login",
      callbackUrl: "https://example.com/view/customer",
      redirect,
    })

    expect(response).toBeNull()
    expect(redirect).toHaveBeenCalledWith(
      "/login?callback=https%3A%2F%2Fexample.com%2Fview%2Fcustomer",
    )
  })

  it("supports formGroup and pageGroup permission wrappers", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    const invokeMock = context.bridge.invoke as ReturnType<typeof vi.fn>

    invokeMock
      .mockResolvedValueOnce({
        code: 200,
        success: true,
        result: {
          id: "form-group-1",
          appType: "crm",
          formUuid: "FORM_001",
          name: "客户查看组",
          type: "view",
          roles: ["role-app-admin"],
        },
      })
      .mockResolvedValueOnce({
        code: 200,
        success: true,
        result: {
          items: [
            {
              id: "form-group-1",
              appType: "crm",
              formUuid: "FORM_001",
              name: "客户查看组",
              type: "view",
              roles: ["role-app-admin"],
            },
          ],
          total: 1,
          page: 1,
          limit: 20,
        },
      })
      .mockResolvedValueOnce({
        code: 200,
        success: true,
        result: {
          fieldPermissions: {
            customerName: "FORM_FILED_VIEW",
          },
          operations: ["view", "edit"],
        },
      })
      .mockResolvedValueOnce({
        code: 200,
        success: true,
        result: {
          appType: "crm",
          menuFormUuids: ["FORM_001"],
          hasFullAccess: true,
        },
      })

    await sdk.permission.formGroup.create({
      appType: "crm",
      formUuid: "FORM_001",
      name: "客户查看组",
      type: "view",
      roles: ["role-app-admin"],
    })

    await sdk.permission.formGroup.list({
      formUuid: "FORM_001",
    })

    await sdk.permission.formGroup.getViewPermissionSummary({
      formUuid: "FORM_001",
    })

    await sdk.permission.pageGroup.getUserMenuPermissions()

    expect(invokeMock).toHaveBeenNthCalledWith(1, "transport.request", {
      body: {
        appType: "crm",
        formUuid: "FORM_001",
        name: "客户查看组",
        roles: ["role-app-admin"],
        type: "view",
      },
      headers: undefined,
      method: "post",
      path: "/permission/form-group/",
      query: undefined,
    })
    expect(invokeMock).toHaveBeenNthCalledWith(2, "transport.request", {
      body: undefined,
      headers: undefined,
      method: "get",
      path: "/permission/form-group/",
      query: "formUuid=FORM_001&appType=crm",
    })
    expect(invokeMock).toHaveBeenNthCalledWith(3, "transport.request", {
      body: undefined,
      headers: undefined,
      method: "get",
      path: "/permission/form-group/view-permissions",
      query: "appType=crm&formUuid=FORM_001",
    })
    expect(invokeMock).toHaveBeenNthCalledWith(4, "transport.request", {
      body: undefined,
      headers: undefined,
      method: "get",
      path: "/permission/page-group/user-menu-permissions",
      query: "appType=crm",
    })
  })

  it("reads department parent departments with includeSelf enabled by default", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    const invokeMock = context.bridge.invoke as ReturnType<typeof vi.fn>
    invokeMock.mockResolvedValueOnce({
      code: 200,
      success: true,
      result: [
        { id: "dept-root", name: "集团" },
        { id: "dept-1", name: "销售部", parentId: "dept-root" },
      ],
    })

    const response = await sdk.department.getParentDepartments("dept-1")

    expect(response.result).toEqual([
      { id: "dept-root", name: "集团" },
      { id: "dept-1", name: "销售部", parentId: "dept-root" },
    ])
    expect(invokeMock).toHaveBeenCalledWith("transport.request", {
      body: undefined,
      headers: undefined,
      method: "get",
      path: "/department/dept-1/parentDepartments",
      query: "includeSelf=true",
    })
  })

  it("reads department parent departments without current department when includeSelf is false", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    const invokeMock = context.bridge.invoke as ReturnType<typeof vi.fn>
    invokeMock.mockResolvedValueOnce({
      code: 200,
      success: true,
      result: [{ id: "dept-root", name: "集团" }],
    })

    await sdk.department.getParentDepartments("dept-1", {
      includeSelf: false,
    })

    expect(invokeMock).toHaveBeenCalledWith("transport.request", {
      body: undefined,
      headers: undefined,
      method: "get",
      path: "/department/dept-1/parentDepartments",
      query: "includeSelf=false",
    })
  })

  it("reads parent department chains for every current user department", async () => {
    const context = createContextFixture()
    context.user.departments = [
      { id: "dept-sales", name: "销售部" },
      { id: "dept-delivery", name: "交付部" },
    ]
    const sdk = createPageSdk(context)
    const invokeMock = context.bridge.invoke as ReturnType<typeof vi.fn>
    invokeMock
      .mockResolvedValueOnce({
        code: 200,
        success: true,
        result: [
          { id: "dept-root", name: "集团" },
          { id: "dept-sales", name: "销售部", parentId: "dept-root" },
        ],
      })
      .mockResolvedValueOnce({
        code: 200,
        success: true,
        result: [
          { id: "dept-root", name: "集团" },
          { id: "dept-delivery", name: "交付部", parentId: "dept-root" },
        ],
      })

    const chains = await sdk.department.getCurrentUserParentDepartments()

    expect(chains).toEqual([
      {
        department: { id: "dept-sales", name: "销售部" },
        parents: [
          { id: "dept-root", name: "集团" },
          { id: "dept-sales", name: "销售部", parentId: "dept-root" },
        ],
      },
      {
        department: { id: "dept-delivery", name: "交付部" },
        parents: [
          { id: "dept-root", name: "集团" },
          { id: "dept-delivery", name: "交付部", parentId: "dept-root" },
        ],
      },
    ])
    expect(invokeMock).toHaveBeenNthCalledWith(1, "transport.request", {
      body: undefined,
      headers: undefined,
      method: "get",
      path: "/department/dept-sales/parentDepartments",
      query: "includeSelf=true",
    })
    expect(invokeMock).toHaveBeenNthCalledWith(2, "transport.request", {
      body: undefined,
      headers: undefined,
      method: "get",
      path: "/department/dept-delivery/parentDepartments",
      query: "includeSelf=true",
    })
  })

  it("returns no current user department chains when context has no departments", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    const invokeMock = context.bridge.invoke as ReturnType<typeof vi.fn>

    await expect(
      sdk.department.getCurrentUserParentDepartments(),
    ).resolves.toEqual([])
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it("serializes notification helpers through app-scoped OpenXiangda notification endpoints", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    ;(context.bridge.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      code: 200,
      success: true,
      result: {
        messages: [],
      },
    })

    await sdk.notification.sendByType({
      notificationType: "custom_reminder",
      recipientId: "user-1",
      payload: {
        title: "待处理事项",
      },
      channels: ["inapp"],
    })

    await sdk.notification.batchSendByType({
      notificationType: "custom_reminder",
      recipients: [
        {
          recipientId: "user-1",
          payload: {
            title: "待处理事项",
          },
        },
      ],
    })

    await sdk.notification.findConfig("custom_reminder", {
      formUuid: "FORM_001",
    })

    await sdk.notification.previewTemplate({
      templateCode: "custom_reminder",
      payload: {
        title: "待处理事项",
      },
    })

    await sdk.notification.listInbox({
      page: 1,
      limit: 20,
      readStatus: "unread",
      keyword: "福利",
      templateCode: "benefit_reminder",
    })

    await sdk.notification.getUnreadCount()

    await sdk.notification.markRead("msg/1")

    await sdk.notification.markAllRead()

    const invokeMock = context.bridge.invoke as ReturnType<typeof vi.fn>
    expect(invokeMock).toHaveBeenNthCalledWith(1, "transport.request", {
      body: {
        appType: "crm",
        channels: ["inapp"],
        notificationType: "custom_reminder",
        payload: {
          title: "待处理事项",
        },
        recipientId: "user-1",
      },
      headers: undefined,
      method: "post",
      path: "/openxiangda-api/v1/apps/crm/notifications/send-by-type",
      query: undefined,
    })
    expect(invokeMock).toHaveBeenNthCalledWith(
      2,
      "transport.request",
      expect.objectContaining({
        body: expect.objectContaining({
          appType: "crm",
          notificationType: "custom_reminder",
          recipients: [
            {
              payload: {
                title: "待处理事项",
              },
              recipientId: "user-1",
            },
          ],
        }),
        method: "post",
        path: "/openxiangda-api/v1/apps/crm/notifications/batch-send-by-type",
      }),
    )
    expect(invokeMock).toHaveBeenNthCalledWith(3, "transport.request", {
      body: undefined,
      headers: undefined,
      method: "get",
      path: "/openxiangda-api/v1/apps/crm/notifications/type-configs/custom_reminder",
      query: "formUuid=FORM_001",
    })
    expect(invokeMock).toHaveBeenNthCalledWith(4, "transport.request", {
      body: {
        appType: "crm",
        payload: {
          title: "待处理事项",
        },
        templateCode: "custom_reminder",
      },
      headers: undefined,
      method: "post",
      path: "/openxiangda-api/v1/apps/crm/notifications/templates/preview",
      query: undefined,
    })
    expect(invokeMock).toHaveBeenNthCalledWith(5, "transport.request", {
      body: undefined,
      headers: undefined,
      method: "get",
      path: "/openxiangda-api/v1/apps/crm/notifications/inbox",
      query:
        "page=1&limit=20&readStatus=unread&keyword=%E7%A6%8F%E5%88%A9&templateCode=benefit_reminder",
    })
    expect(invokeMock).toHaveBeenNthCalledWith(6, "transport.request", {
      body: undefined,
      headers: undefined,
      method: "get",
      path: "/openxiangda-api/v1/apps/crm/notifications/inbox/unread-count",
      query: undefined,
    })
    expect(invokeMock).toHaveBeenNthCalledWith(7, "transport.request", {
      body: undefined,
      headers: undefined,
      method: "post",
      path: "/openxiangda-api/v1/apps/crm/notifications/inbox/msg%2F1/read",
      query: undefined,
    })
    expect(invokeMock).toHaveBeenNthCalledWith(8, "transport.request", {
      body: undefined,
      headers: undefined,
      method: "post",
      path: "/openxiangda-api/v1/apps/crm/notifications/inbox/read-all",
      query: undefined,
    })
  })

  it("serializes DingTalk notification helpers through app-scoped endpoints", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    ;(context.bridge.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      code: 200,
      success: true,
      result: {},
    })

    await sdk.notification.capabilities()
    await sdk.notification.previewDingTalk({
      notificationType: "custom_reminder",
      payload: {
        title: "待处理事项",
      },
    })
    await sdk.notification.sendDingTalk({
      notificationType: "custom_reminder",
      recipientId: "user-1",
      payload: {
        title: "待处理事项",
      },
    })

    const invokeMock = context.bridge.invoke as ReturnType<typeof vi.fn>
    expect(invokeMock).toHaveBeenNthCalledWith(1, "transport.request", {
      body: undefined,
      headers: undefined,
      method: "get",
      path: "/openxiangda-api/v1/apps/crm/notifications/dingtalk/capabilities",
      query: undefined,
    })
    expect(invokeMock).toHaveBeenNthCalledWith(2, "transport.request", {
      body: {
        appType: "crm",
        notificationType: "custom_reminder",
        payload: {
          title: "待处理事项",
        },
      },
      headers: undefined,
      method: "post",
      path: "/openxiangda-api/v1/apps/crm/notifications/dingtalk/preview",
      query: undefined,
    })
    expect(invokeMock).toHaveBeenNthCalledWith(3, "transport.request", {
      body: {
        appType: "crm",
        notificationType: "custom_reminder",
        payload: {
          title: "待处理事项",
        },
        recipientId: "user-1",
      },
      headers: undefined,
      method: "post",
      path: "/openxiangda-api/v1/apps/crm/notifications/dingtalk/send",
      query: undefined,
    })
  })

  it("serializes organization helpers through app-scoped endpoints", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    const invokeMock = context.bridge.invoke as ReturnType<typeof vi.fn>
    invokeMock.mockResolvedValue({
      code: 200,
      success: true,
      result: {},
    })

    await sdk.organization.capabilities()
    await sdk.organization.departments.list()
    await sdk.organization.departments.get("dept/1")
    await sdk.organization.departments.create({
      name: "销售部",
      externalId: "dept-ext-1",
    })
    await sdk.organization.departments.update("dept/1", {
      name: "华东销售",
    })
    await sdk.organization.accounts.list({
      ids: ["user-1", "user-2"],
      departmentIds: ["dept/1"],
      keyword: "张",
      page: 2,
      pageSize: 50,
    })
    await sdk.organization.accounts.get("user/1")
    await sdk.organization.accounts.create({
      username: "u1",
      password: "P@ssw0rd",
      name: "张三",
      jobNumber: "E001",
      departmentIds: ["dept/1"],
      affiliatedDepartmentId: "dept/1",
    })
    await sdk.organization.accounts.update("user/1", {
      name: "张三",
      jobNumber: "E002",
    })
    await sdk.organization.accounts.resetPassword("user/1", {
      newPassword: "P@ssw0rd2",
    })
    await sdk.organization.accounts.changeMyPassword({
      oldPassword: "old-pass",
      newPassword: "new-pass",
    })

    expect(invokeMock).toHaveBeenNthCalledWith(1, "transport.request", {
      body: undefined,
      headers: undefined,
      method: "get",
      path: "/openxiangda-api/v1/apps/crm/organization/capabilities",
      query: undefined,
    })
    expect(invokeMock).toHaveBeenNthCalledWith(2, "transport.request", {
      body: undefined,
      headers: undefined,
      method: "get",
      path: "/openxiangda-api/v1/apps/crm/organization/departments",
      query: undefined,
    })
    expect(invokeMock).toHaveBeenNthCalledWith(3, "transport.request", {
      body: undefined,
      headers: undefined,
      method: "get",
      path: "/openxiangda-api/v1/apps/crm/organization/departments/dept%2F1",
      query: undefined,
    })
    expect(invokeMock).toHaveBeenNthCalledWith(4, "transport.request", {
      body: {
        appType: "crm",
        externalId: "dept-ext-1",
        name: "销售部",
      },
      headers: undefined,
      method: "post",
      path: "/openxiangda-api/v1/apps/crm/organization/departments",
      query: undefined,
    })
    expect(invokeMock).toHaveBeenNthCalledWith(5, "transport.request", {
      body: {
        appType: "crm",
        name: "华东销售",
      },
      headers: undefined,
      method: "post",
      path: "/openxiangda-api/v1/apps/crm/organization/departments/dept%2F1",
      query: undefined,
    })
    expect(invokeMock).toHaveBeenNthCalledWith(6, "transport.request", {
      body: undefined,
      headers: undefined,
      method: "get",
      path: "/openxiangda-api/v1/apps/crm/organization/accounts",
      query:
        "ids=user-1%2Cuser-2&departmentIds=dept%2F1&keyword=%E5%BC%A0&page=2&pageSize=50",
    })
    expect(invokeMock).toHaveBeenNthCalledWith(7, "transport.request", {
      body: undefined,
      headers: undefined,
      method: "get",
      path: "/openxiangda-api/v1/apps/crm/organization/accounts/user%2F1",
      query: undefined,
    })
    expect(invokeMock).toHaveBeenNthCalledWith(
      8,
      "transport.request",
      expect.objectContaining({
        body: expect.objectContaining({
          appType: "crm",
          username: "u1",
          password: "P@ssw0rd",
          jobNumber: "E001",
          affiliatedDepartmentId: "dept/1",
        }),
        method: "post",
        path: "/openxiangda-api/v1/apps/crm/organization/accounts",
      }),
    )
    expect(invokeMock).toHaveBeenNthCalledWith(9, "transport.request", {
      body: {
        appType: "crm",
        jobNumber: "E002",
        name: "张三",
      },
      headers: undefined,
      method: "post",
      path: "/openxiangda-api/v1/apps/crm/organization/accounts/user%2F1",
      query: undefined,
    })
    expect(invokeMock).toHaveBeenNthCalledWith(10, "transport.request", {
      body: {
        appType: "crm",
        newPassword: "P@ssw0rd2",
      },
      headers: undefined,
      method: "post",
      path: "/openxiangda-api/v1/apps/crm/organization/accounts/user%2F1/password/reset",
      query: undefined,
    })
    expect(invokeMock).toHaveBeenNthCalledWith(11, "transport.request", {
      body: {
        appType: "crm",
        oldPassword: "old-pass",
        newPassword: "new-pass",
      },
      headers: undefined,
      method: "post",
      path: "/openxiangda-api/v1/apps/crm/organization/accounts/me/password/change",
      query: undefined,
    })
  })

  it("serializes school-contact relationship helpers through organization endpoints", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    const invokeMock = context.bridge.invoke as ReturnType<typeof vi.fn>
    invokeMock.mockResolvedValue({
      code: 200,
      success: true,
      result: { items: [], total: 0, page: 1, pageSize: 20 },
    })

    await sdk.organization.schoolContact.relations.list({
      dingtalkUserId: "guardian-dd",
      mobile: "13800138000",
      name: "张",
      classId: "class-1",
      page: 2,
      pageSize: 25,
    })
    await sdk.organization.schoolContact.teachers.list({
      classId: "class/1",
      isHeadTeacher: true,
      page: 2,
    })
    await sdk.organization.schoolContact.children.list("guardian/1", {
      page: 1,
      pageSize: 10,
    })
    await sdk.organization.schoolContact.guardians.list("student/1")
    await sdk.organization.schoolContact.myFamily.get({ pageSize: 50 })

    expect(invokeMock).toHaveBeenNthCalledWith(1, "transport.request", {
      body: undefined,
      headers: undefined,
      method: "get",
      path: "/openxiangda-api/v1/apps/crm/organization/school-contact/relations",
      query:
        "dingtalkUserId=guardian-dd&mobile=13800138000&name=%E5%BC%A0&classId=class-1&page=2&pageSize=25",
    })
    expect(invokeMock).toHaveBeenNthCalledWith(2, "transport.request", {
      body: undefined,
      headers: undefined,
      method: "get",
      path: "/openxiangda-api/v1/apps/crm/organization/school-contact/teachers",
      query: "classId=class%2F1&isHeadTeacher=true&page=2",
    })
    expect(invokeMock).toHaveBeenNthCalledWith(3, "transport.request", {
      body: undefined,
      headers: undefined,
      method: "get",
      path: "/openxiangda-api/v1/apps/crm/organization/school-contact/users/guardian%2F1/children",
      query: "page=1&pageSize=10",
    })
    expect(invokeMock).toHaveBeenNthCalledWith(4, "transport.request", {
      body: undefined,
      headers: undefined,
      method: "get",
      path: "/openxiangda-api/v1/apps/crm/organization/school-contact/users/student%2F1/guardians",
      query: undefined,
    })
    expect(invokeMock).toHaveBeenNthCalledWith(5, "transport.request", {
      body: undefined,
      headers: undefined,
      method: "get",
      path: "/openxiangda-api/v1/apps/crm/organization/school-contact/me/family",
      query: "pageSize=50",
    })
  })

  it("serializes work center helpers through platform work-center endpoints", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    ;(context.bridge.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      code: 200,
      success: true,
      result: {
        items: [],
        total: 0,
        pagination: {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 0,
        },
      },
    })

    await sdk.workCenter.listItems({
      boxType: "todo",
      page: 1,
      limit: 10,
      keyword: "入会",
      status: "active",
      formUuid: "FORM_001",
      startAt: new Date("2026-06-01T00:00:00.000Z"),
    })

    await sdk.workCenter.getStats({
      formUuid: "FORM_001",
      endAt: "2026-06-30T23:59:59.000Z",
    })

    const invokeMock = context.bridge.invoke as ReturnType<typeof vi.fn>
    expect(invokeMock).toHaveBeenNthCalledWith(1, "transport.request", {
      body: undefined,
      headers: undefined,
      method: "get",
      path: "/work-center/items",
      query:
        "boxType=todo&page=1&limit=10&keyword=%E5%85%A5%E4%BC%9A&status=active&formUuid=FORM_001&startAt=2026-06-01T00%3A00%3A00.000Z&appType=crm",
    })
    expect(invokeMock).toHaveBeenNthCalledWith(2, "transport.request", {
      body: undefined,
      headers: undefined,
      method: "get",
      path: "/work-center/stats",
      query:
        "formUuid=FORM_001&endAt=2026-06-30T23%3A59%3A59.000Z&appType=crm",
    })
  })

  it("routes dataSource.run through advanced search and merges descriptor filters", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    ;(context.bridge.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      code: 200,
      success: true,
      result: {
        currentPage: 1,
        data: [],
        totalCount: 0,
      },
    })

    await sdk.dataSource.run("customerList", {
      filters: {
        key: "owner",
        operator: "EQ",
        value: "Alice",
      },
    })

    const payload = (context.bridge.invoke as ReturnType<typeof vi.fn>).mock
      .calls[0][1]
    const filters = JSON.parse(String(readQuery(payload.query).get("filters")))

    expect(payload.path).toBe("/crm/v1/form/advancedSearch.json")
    expect(filters).toMatchObject({
      logic: "AND",
      conditions: [
        {
          logic: "AND",
          rules: [{ key: "status", operator: "EQ", value: "active" }],
        },
        {
          logic: "AND",
          rules: [{ key: "owner", operator: "EQ", value: "Alice" }],
        },
      ],
    })
  })

  it("queries data views through the app runtime endpoint", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    ;(context.bridge.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      code: 200,
      success: true,
      result: {
        currentPage: 1,
        data: [{ ticketId: "T-1" }],
        lastRefreshedAt: "2026-06-05T00:00:00.000Z",
        pageSize: 10,
        totalCount: 1,
      },
    })

    const response = await sdk.dataView.query("ticket_with_customer", {
      fields: ["ticketId", "customerName"],
      filters: {
        key: "customerName",
        operator: "LIKE",
        value: "Acme",
      },
      order: { field: "ticketId", isAsc: "n" },
      pageSize: 10,
    })

    expect(response.result.data).toEqual([{ ticketId: "T-1" }])
    expect(context.bridge.invoke).toHaveBeenCalledWith("transport.request", {
      body: {
        conditionType: undefined,
        currentPage: undefined,
        fields: ["ticketId", "customerName"],
        filters: JSON.stringify({
          logic: "AND",
          rules: [{ key: "customerName", operator: "LIKE", value: "Acme" }],
        }),
        order: [{ field: "ticketId", isAsc: "n" }],
        pageSize: 10,
        searchKeyWord: undefined,
      },
      headers: undefined,
      method: "post",
      path: "/crm/v1/data-views/ticket_with_customer/query.json",
      query: undefined,
    })
  })

  it("queries aggregate data view stats through the app runtime endpoint", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    ;(context.bridge.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      code: 200,
      success: true,
      result: {
        currentPage: 1,
        data: [{ customerName: "Acme", ticketCount: 3 }],
        lastRefreshedAt: "2026-06-05T00:00:00.000Z",
        pageSize: 10,
        totalCount: 1,
      },
    })

    const response = await sdk.dataView.stats("ticket_stats_by_customer", {
      fields: ["customerName", "ticketCount"],
      filters: {
        key: "customerName",
        operator: "LIKE",
        value: "Acme",
      },
      having: {
        key: "ticketCount",
        operator: "GT",
        value: 0,
      },
      order: { field: "ticketCount", isAsc: "n" },
      pageSize: 10,
    })

    expect(response.result.data).toEqual([
      { customerName: "Acme", ticketCount: 3 },
    ])
    expect(context.bridge.invoke).toHaveBeenCalledWith("transport.request", {
      body: {
        conditionType: undefined,
        currentPage: undefined,
        fields: ["customerName", "ticketCount"],
        filters: JSON.stringify({
          logic: "AND",
          rules: [{ key: "customerName", operator: "LIKE", value: "Acme" }],
        }),
        having: JSON.stringify({
          logic: "AND",
          rules: [{ key: "ticketCount", operator: "GT", value: 0 }],
        }),
        order: [{ field: "ticketCount", isAsc: "n" }],
        pageSize: 10,
        searchKeyWord: undefined,
      },
      headers: undefined,
      method: "post",
      path: "/crm/v1/data-views/ticket_stats_by_customer/stats.json",
      query: undefined,
    })
  })

  it("invokes app functions through the app runtime endpoint", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    ;(context.bridge.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      code: 200,
      success: true,
      result: {
        invocationId: "inv-1",
        functionCode: "reservation_reminder_summary",
        result: { total: 3 },
        output: { total: 3 },
        variables: {},
        logs: [],
        duration: 12,
      },
    })

    const response = await sdk.function.invoke<{ total: number }>(
      "reservation_reminder_summary",
      {
        input: {
          day: "2026-06-15",
        },
      },
    )

    expect(response.result.result).toEqual({ total: 3 })
    expect(context.bridge.invoke).toHaveBeenCalledWith("transport.request", {
      body: {
        input: {
          day: "2026-06-15",
        },
      },
      headers: undefined,
      method: "post",
      path: "/crm/v1/functions/reservation_reminder_summary/invoke.json",
      query: undefined,
    })
  })

  it("routes dataSource.run to data view descriptors", async () => {
    const context = createContextFixture()
    context.page.dataSources.push({
      key: "ticketCustomer",
      type: "dataView.query",
      code: "ticket_with_customer",
      fields: ["ticketId", "customerName"],
      defaultFilter: {
        key: "status",
        operator: "EQ",
        value: "open",
      },
    })
    const sdk = createPageSdk(context)
    ;(context.bridge.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      code: 200,
      success: true,
      result: {
        currentPage: 2,
        data: [],
        pageSize: 20,
        totalCount: 0,
      },
    })

    await sdk.dataSource.run("ticketCustomer", {
      currentPage: 2,
      filters: {
        key: "ownerName",
        operator: "EQ",
        value: "Alice",
      },
    })

    const payload = (context.bridge.invoke as ReturnType<typeof vi.fn>).mock
      .calls[0][1]
    const filters = JSON.parse(String(payload.body.filters))

    expect(payload.path).toBe("/crm/v1/data-views/ticket_with_customer/query.json")
    expect(payload.body.fields).toEqual(["ticketId", "customerName"])
    expect(payload.body.currentPage).toBe(2)
    expect(filters).toMatchObject({
      logic: "AND",
      conditions: [
        {
          logic: "AND",
          rules: [{ key: "status", operator: "EQ", value: "open" }],
        },
        {
          logic: "AND",
          rules: [{ key: "ownerName", operator: "EQ", value: "Alice" }],
        },
      ],
    })
  })

  it("routes dataSource.run to aggregate data view stats descriptors", async () => {
    const context = createContextFixture()
    context.page.dataSources.push({
      key: "ticketStats",
      type: "dataView.stats",
      code: "ticket_stats_by_customer",
      fields: ["customerName", "ticketCount"],
      defaultFilter: {
        key: "customerName",
        operator: "IS_NOT_EMPTY",
      },
      defaultHaving: {
        key: "ticketCount",
        operator: "GT",
        value: 0,
      },
    })
    const sdk = createPageSdk(context)
    ;(context.bridge.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      code: 200,
      success: true,
      result: {
        currentPage: 1,
        data: [],
        pageSize: 20,
        totalCount: 0,
      },
    })

    await sdk.dataSource.run("ticketStats", {
      having: {
        key: "ticketCount",
        operator: "LT",
        value: 10,
      },
    })

    const payload = (context.bridge.invoke as ReturnType<typeof vi.fn>).mock
      .calls[0][1]
    const having = JSON.parse(String(payload.body.having))

    expect(payload.path).toBe(
      "/crm/v1/data-views/ticket_stats_by_customer/stats.json",
    )
    expect(payload.body.fields).toEqual(["customerName", "ticketCount"])
    expect(having).toMatchObject({
      logic: "AND",
      conditions: [
        {
          logic: "AND",
          rules: [{ key: "ticketCount", operator: "GT", value: 0 }],
        },
        {
          logic: "AND",
          rules: [{ key: "ticketCount", operator: "LT", value: 10 }],
        },
      ],
    })
  })

  it("creates and reads server-defined structured export tasks", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)

    await sdk.export.create({
      exportKey: "orders",
      definitionCode: "orders_export",
      definitionInput: { variant: "finance" },
      query: { filters: { status: "pending" } },
      scope: "selected",
      rowIds: ["order-1"],
    })
    await sdk.export.get("task-1")

    const calls = (context.bridge.invoke as ReturnType<typeof vi.fn>).mock.calls
    expect(calls[0][1]).toMatchObject({
      method: "post",
      path: "/openxiangda-api/v1/apps/crm/exports",
      body: {
        protocol: "structured_export_v1",
        exportKey: "orders",
        definitionCode: "orders_export",
        definitionInput: { variant: "finance" },
        scope: "selected",
        rowIds: ["order-1"],
      },
    })
    expect(calls[1][1]).toMatchObject({
      method: "get",
      path: "/openxiangda-api/v1/apps/crm/exports/task-1",
    })
  })

  it("builds login log requests with app permission context", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)

    await sdk.loginLog.list({
      status: "failure",
      page: 2,
      includeSensitive: true,
      sourceAppType: "crm",
    })
    await sdk.loginLog.get("log-1", { includeSensitive: true })
    await sdk.loginLog.stats({ startAt: "2026-06-01T00:00:00.000Z" })

    const calls = (context.bridge.invoke as ReturnType<typeof vi.fn>).mock.calls
    expect(calls[0][1].path).toBe("/login-log")
    expect(calls[0][1].method).toBe("get")
    const listQuery = readQuery(calls[0][1].query)
    expect(listQuery.get("appType")).toBe("crm")
    expect(listQuery.get("status")).toBe("failure")
    expect(listQuery.get("page")).toBe("2")
    expect(listQuery.get("includeSensitive")).toBe("true")
    expect(listQuery.get("sourceAppType")).toBe("crm")

    expect(calls[1][1].path).toBe("/login-log/log-1")
    const getQuery = readQuery(calls[1][1].query)
    expect(getQuery.get("appType")).toBe("crm")
    expect(getQuery.get("includeSensitive")).toBe("true")

    expect(calls[2][1].path).toBe("/login-log/stats")
    const statsQuery = readQuery(calls[2][1].query)
    expect(statsQuery.get("appType")).toBe("crm")
    expect(statsQuery.get("startAt")).toBe("2026-06-01T00:00:00.000Z")
  })

  it("converts non-Error failures into sdk errors with normalized responses", async () => {
    const context = createContextFixture()
    const sdk = createPageSdk(context)
    ;(context.bridge.invoke as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
      code: 403,
      message: "no permission",
    })

    await expect(sdk.user.list()).rejects.toMatchObject({
      message: "no permission",
      method: "GET",
      path: "/user/list",
      response: {
        code: 403,
        success: false,
        message: "no permission",
      },
    })
  })
})
