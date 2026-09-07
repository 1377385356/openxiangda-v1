import { createReactPage, useDataSource, useMessage, usePageSdk } from "./react"

import type {
  FieldPermissionDto,
  FormPermissionGroup,
  PageBinaryResponse,
  PageDataManagementConfig,
  PageListResult,
  PagePermissionGroup,
  PageRoleRecord,
  PageSdk,
  PageUiPermissionRecord,
  PageUserRecord,
  SearchGroup,
  SearchSortItem,
  ViewFieldPermissionValue,
} from "./core"

type CustomerRecord = {
  formInstanceId: string
  customerName: string
  owner: string
  status: string
  level: string
}

type ProcessInstanceDetail = {
  instanceId: string
  status: string
  title: string
}

type ImportPreviewResult = {
  successCount: number
  failedCount: number
  rows: Array<Record<string, unknown>>
}

export const readmeCustomerFilters: SearchGroup = {
  logic: "AND",
  rules: [
    {
      key: "status",
      componentName: "SelectField",
      operator: "EQ",
      value: "active",
    },
    {
      key: "detailList",
      componentName: "SubFormField",
      operator: "EXISTS",
      value: {
        logic: "AND",
        rules: [
          {
            key: "sku",
            componentName: "TextField",
            operator: "CONTAINS",
            value: "license",
          },
        ],
      },
    },
  ],
  conditions: [
    {
      logic: "OR",
      rules: [
        {
          key: "level",
          componentName: "SelectField",
          operator: "EQ",
          value: "A",
        },
        {
          key: "owner",
          componentName: "TextField",
          operator: "EQ",
          value: "Alice",
        },
      ],
    },
  ],
}

export const readmeCustomerOrder: SearchSortItem[] = [
  { id: "modifiedTime", isAsc: "n" },
  { id: "customerName", isAsc: "y" },
]

export const queryCustomersExample = (sdk: PageSdk) =>
  sdk.form.advancedSearch<CustomerRecord>({
    formUuid: "FORM_CUSTOMER",
    currentPage: 1,
    pageSize: 20,
    filters: readmeCustomerFilters,
    order: readmeCustomerOrder,
    instanceStatus: "running",
  })

export const searchCustomerIdsExample = (sdk: PageSdk) =>
  sdk.form.searchIds<string>({
    formUuid: "FORM_CUSTOMER",
    currentPage: 1,
    pageSize: 50,
    search: {
      logic: "AND",
      rules: [
        {
          key: "customerName",
          componentName: "TextField",
          operator: "CONTAINS",
          value: "星云",
        },
      ],
    },
    dynamicOrder: {
      id: "modifiedTime",
      isAsc: "n",
    },
  })

export const currentUserDepartmentParentsExample = async (sdk: PageSdk) => {
  const chains = await sdk.department.getCurrentUserParentDepartments()

  return chains.map((item) => ({
    departmentId: item.department.id,
    departmentName: item.department.name,
    path: item.parents.map((department) => department.name).join(" / "),
  }))
}

export const currentUserAffiliatedDepartmentExample = async (sdk: PageSdk) => {
  const currentUser = await sdk.user.getCurrent<PageUserRecord>()
  const user = currentUser.result
  const affiliatedDepartment = user?.affiliatedDepartment || null

  return {
    userId: user?.id,
    name: user?.name || user?.username,
    affiliatedDepartmentId: user?.affiliatedDepartmentId || null,
    affiliatedDepartmentName: affiliatedDepartment?.name || null,
    affiliatedDepartmentExternalId: affiliatedDepartment?.externalId || null,
    membershipDepartmentNames:
      user?.departments?.map((department) => department.name).filter(Boolean) ||
      [],
  }
}

export const userRolePermissionExample = async (sdk: PageSdk) => {
  const users = await sdk.user.search<PageUserRecord[]>("alice")
  const role = await sdk.role.create<PageRoleRecord>({
    name: "客户经理",
    code: "customer-manager",
    scope: "app",
    description: "README 示例角色",
  })

  const targetUserId = users.result?.[0]?.id
  const roleId = role.result?.id

  if (targetUserId && roleId) {
    await sdk.role.assignRoles({
      userId: targetUserId,
      roleIds: [roleId],
    })
    await sdk.permission.ui.assign({
      roleId,
      permissionIds: ["perm_customer_dashboard"],
    })
  }

  const myPermissions =
    await sdk.permission.ui.getMyApp<PageUiPermissionRecord[]>()

  return {
    myPermissions,
    role,
    users,
  }
}

export const logoutExample = (sdk: PageSdk) => sdk.auth.logout()

export const logoutAndRedirectExample = (sdk: PageSdk, loginUrl: string) =>
  sdk.auth.logoutAndRedirect({
    loginUrl,
  })

export const switchAppRoleExample = (sdk: PageSdk, roleId: string | null) =>
  sdk.role.switchAppRole({
    roleId: roleId || "",
  })

export const switchPlatformRoleExample = (sdk: PageSdk, roleId: string) =>
  sdk.role.switchPlatformRole({
    roleId,
  })

export const formPermissionGroupExample = async (sdk: PageSdk) => {
  const fieldPermissions: FieldPermissionDto[] = [
    {
      componentName: "TextField",
      fieldName: "customerName",
      label: "客户名称",
      value: "FORM_FILED_VIEW",
    },
    {
      componentName: "TextField",
      fieldName: "owner",
      label: "负责人",
      value: "FORM_FILED_EDIT",
    },
  ]

  const group = await sdk.permission.formGroup.create<FormPermissionGroup>({
    appType: sdk.context.app.appType,
    formUuid: "FORM_CUSTOMER",
    name: "客户表单查看组",
    type: "view",
    roles: ["role-app-admin"],
    dataScope: "all",
    fieldPermissions,
  })

  const viewFieldPermissions =
    await sdk.permission.formGroup.getViewFieldPermissions<
      Record<string, ViewFieldPermissionValue>
    >({
      formUuid: "FORM_CUSTOMER",
    })

  return {
    group,
    viewFieldPermissions,
  }
}

export const pagePermissionGroupExample = async (sdk: PageSdk) => {
  const group = await sdk.permission.pageGroup.create<PagePermissionGroup>({
    appType: sdk.context.app.appType,
    name: "客户总览菜单组",
    roles: ["role-app-admin"],
    menuFormUuids: ["customer-dashboard"],
  })

  const userMenuPermissions =
    await sdk.permission.pageGroup.getUserMenuPermissions(
      sdk.context.app.appType,
    )

  return {
    group,
    userMenuPermissions,
  }
}

export const processExample = async (sdk: PageSdk) => {
  const instance = await sdk.process.getInstance<ProcessInstanceDetail>({
    instanceId: "PROC-2026-0001",
  })

  await sdk.process.approveTask({
    instanceId: "PROC-2026-0001",
    formUuid: "FORM_CUSTOMER",
    action: "approved",
    comments: "README 示例审批通过",
  })

  await sdk.process.triggerCallbackTask({
    taskId: "TASK-CALLBACK-001",
    payload: {
      source: "readme-example",
    },
  })

  return instance
}

export const dataManagementExample = async (sdk: PageSdk) => {
  const current =
    await sdk.form.getDataManagementConfig<PageDataManagementConfig>({
      formUuid: "FORM_CUSTOMER",
    })

  return sdk.form.saveDataManagementConfig({
    formUuid: "FORM_CUSTOMER",
    config: {
      ...current.result,
      sort: readmeCustomerOrder,
      showFields: ["customerName", "owner", "status", "level"],
    },
  })
}

export const fileFlowExample = async (sdk: PageSdk, fileBase64: string) => {
  const preview = await sdk.form.importPreview<ImportPreviewResult>({
    formUuid: "FORM_CUSTOMER",
    fileBase64,
    fileName: "customers.xlsx",
  })

  const exportFile = await sdk.form.advancedExport({
    formUuid: "FORM_CUSTOMER",
    filters: readmeCustomerFilters,
    order: readmeCustomerOrder,
    exportAll: "y",
  })

  const failedFile = await sdk.form.downloadImportFailed({
    recordId: "IMP-2026-0001",
  })

  return {
    exportFile,
    failedFile,
    preview,
  }
}

export const createObjectUrl = (file: PageBinaryResponse) =>
  URL.createObjectURL(file.blob)

export function ReadmeExamplePage() {
  const sdk = usePageSdk()
  const message = useMessage()
  const { data, loading, refresh } = useDataSource<
    PageListResult<CustomerRecord>
  >("customerList", {
    immediate: true,
    params: {
      currentPage: 1,
      pageSize: 20,
      filters: readmeCustomerFilters,
      order: readmeCustomerOrder,
    },
  })

  const handleSyncRoles = async () => {
    const result = await userRolePermissionExample(sdk)
    const permissionCount = result.myPermissions.result?.length || 0
    message.success(`角色与权限同步完成，当前权限数 ${permissionCount}`)
  }

  return (
    <section>
      <h1>README Example</h1>
      <button type="button" onClick={() => refresh()}>
        刷新
      </button>
      <button type="button" onClick={() => void handleSyncRoles()}>
        同步角色权限
      </button>
      <div>{loading ? "loading" : `count: ${data?.totalCount || 0}`}</div>
    </section>
  )
}

export const readmeExamplePage = createReactPage(ReadmeExamplePage)
