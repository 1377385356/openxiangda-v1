import type {
  PageApiResponse,
  PageContext,
  PageListResult,
} from "../../runtime/core/types"

export interface CustomerRecord {
  id: string
  customerName: string
  status: string
}

export const customerListResult: PageListResult<CustomerRecord> = {
  currentPage: 1,
  totalCount: 3,
  data: [
    {
      id: "customer-1",
      customerName: "杭州星云科技",
      status: "active",
    },
    {
      id: "customer-2",
      customerName: "苏州明川智能",
      status: "active",
    },
    {
      id: "customer-3",
      customerName: "深圳云启制造",
      status: "active",
    },
  ],
}

export const customerListResponse: PageApiResponse<
  PageListResult<CustomerRecord>
> = {
  code: 200,
  success: true,
  message: "success",
  result: customerListResult,
  data: customerListResult,
}

export interface CreatePageContextFixtureOptions {
  userType?: "normal" | "guest"
  bridgeInvoke?: PageContext["bridge"]["invoke"]
}

export function createPageContextFixture(
  options: CreatePageContextFixtureOptions = {},
): PageContext {
  const userType = options.userType || "normal"
  const defaultBridgeInvoke: PageContext["bridge"]["invoke"] = async <
    T = unknown,
  >() =>
    ({
      code: 200,
      success: true,
      result: null,
    }) as T

  return {
    protocolVersion: "1.0",
    app: {
      appType: "APP_DEMO",
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
          formUuid: "FORM_BF7A097684894AACB63721A46B694C78",
        },
      ],
      capabilities: {},
    },
    user: {
      id: userType === "guest" ? "guest-1" : "user-1",
      username: userType === "guest" ? "游客_000001" : "demo.user",
      name: userType === "guest" ? "游客_000001" : "演示用户",
      jobNumber: userType === "guest" ? "guest-1" : "10001",
      phone: userType === "guest" ? null : "13800000000",
      tenantId: "demo-tenant",
      userType,
      isGuest: userType === "guest",
      departments: [
        {
          id: "dept-1",
          name: "信息中心",
        },
      ],
    },
    route: {
      pathname: "/view/APP_DEMO/admin",
      fullPath: "/view/APP_DEMO/admin",
      params: {
        appType: "APP_DEMO",
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
        success: () => undefined,
        error: () => undefined,
        warning: () => undefined,
        info: () => undefined,
        loading: () => () => undefined,
      },
      modal: {
        confirm: async () => true,
      },
    },
    navigation: {
      pushPage: () => undefined,
      replacePage: () => undefined,
      pushRoute: () => undefined,
      replaceRoute: () => undefined,
      updateQuery: () => undefined,
      setHash: () => undefined,
      back: () => undefined,
    },
    bridge: {
      invoke: options.bridgeInvoke || defaultBridgeInvoke,
    },
  }
}
