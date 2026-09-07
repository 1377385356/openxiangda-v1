import type {
  ApiPermissionListParams,
  AuthLogoutRedirectOptions,
  ApproveTaskParams,
  AssignPermissionsParams,
  AssignRolesParams,
  BatchAddUsersToRoleParams,
  BatchSendNotificationByTypeParams,
  ConnectorCallParams,
  ConnectorInvokeParams,
  ConnectorInvokeResult,
  CreateApiPermissionParams,
  CreateOrganizationAccountParams,
  CreateOrganizationDepartmentParams,
  CreateFormPermissionGroupDto,
  CreatePagePermissionGroupDto,
  CreateRoleParams,
  CreateUiPermissionParams,
  CurrentUserDepartmentParents,
  DataManagementConfigParams,
  DataViewQueryParams,
  DataViewQueryResult,
  DataViewStatsParams,
  FileAccessTicketResult,
  FormAdvancedSearchParams,
  FormChangeRecordParams,
  FormCreateParams,
  FormCreateResult,
  FormExportParams,
  FormGetDetailParams,
  FormImportParams,
  FormRemoveParams,
  FormSearchParams,
  FormUpdateParams,
  FunctionInvokeParams,
  FunctionInvokeResult,
  GetParentDepartmentsOptions,
  GetProcessInstanceParams,
  GetUserRolesParams,
  ImportExportRecordDownloadParams,
  ImportExportRecordQuery,
  LoginLogGetParams,
  LoginLogListParams,
  LoginLogRecord,
  LoginLogStats,
  LoginLogStatsParams,
  PageApiResponse,
  PageBinaryResponse,
  PageContext,
  PageDataSourceDescriptor,
  PageDepartmentRecord,
  PageHttpMethod,
  PageListResult,
  PageOffsetListResult,
  PagePermissionGroup,
  PageRequestOptions,
  PageSdk,
  PageSdkError,
  PageUserRecord,
  PageTransportDownloadPayload,
  PageTransportRequestPayload,
  PreviewDingTalkNotificationParams,
  PreviewNotificationTemplateParams,
  ProcessInstanceLookupParams,
  ResetOrganizationAccountPasswordParams,
  ResolveProcessCapabilitiesParams,
  FormPermissionGroup,
  ListNotificationInboxParams,
  ListWorkCenterItemsParams,
  MarkAllNotificationReadResult,
  NotificationInboxListResult,
  NotificationInboxMessage,
  NotificationUnreadCountResult,
  OrganizationAccountListParams,
  SchoolContactRelationListParams,
  SchoolContactTeacherListParams,
  RoleListParams,
  RoleUsersParams,
  SaveDataManagementConfigParams,
  SearchExpression,
  SearchGroup,
  SearchRule,
  SearchSortItem,
  SubFormRule,
  StructuredExportCreateParams,
  StructuredExportGetParams,
  StructuredExportTask,
  SwitchAppRoleParams,
  SwitchPlatformRoleParams,
  TerminateProcessInstanceParams,
  TriggerCallbackTaskParams,
  ChangeOrganizationAccountPasswordParams,
  UiPermissionListParams,
  UpdateApiPermissionParams,
  UpdateFormPermissionGroupDto,
  UpdateOrganizationAccountParams,
  UpdateOrganizationDepartmentParams,
  UpdatePagePermissionGroupDto,
  UpdateRoleParams,
  UpdateUiPermissionParams,
  UpdateUserParams,
  QueryFormPermissionGroupDto,
  QueryPagePermissionGroupDto,
  UserListParams,
  UserMenuPermissionsResponse,
  ValidateUserParams,
  CreateUserParams,
  SendNotificationByTypeParams,
  SendNotificationResult,
  ViewFieldPermissionValue,
  ViewPermissionSummary,
  WorkCenterItem,
  WorkCenterListResult,
  WorkCenterStats,
  WorkCenterStatsParams,
  WorkflowApproveParams,
  WorkflowDefinitionByFormParams,
  WorkflowInitiatorSelectCandidatesParams,
  WorkflowInitiatorSelectRequirementsParams,
  WorkflowPreviewParams,
  WorkflowResubmitInitiatorSelectRequirementsParams,
  WorkflowResubmitParams,
  WorkflowReturnParams,
  WorkflowSaveTaskParams,
  WorkflowStartFromExistingInstanceParams,
  WorkflowTaskParams,
  WorkflowTransferParams,
  WorkflowWithdrawParams,
} from "./types"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isSearchRuleLike = (value: unknown): value is SearchRule | SubFormRule =>
  isRecord(value) &&
  typeof value.key === "string" &&
  (value.componentName === undefined || typeof value.componentName === "string")

const isBlobLike = (value: unknown): value is Blob =>
  typeof Blob !== "undefined" && value instanceof Blob

const nowMs = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now()

let dynamicReadSequence = 0
const nextDynamicReadNonce = () => {
  dynamicReadSequence = (dynamicReadSequence + 1) % Number.MAX_SAFE_INTEGER
  return `${Date.now().toString(36)}-${dynamicReadSequence.toString(36)}`
}

const normalizeMethod = (value: PageHttpMethod | string): PageHttpMethod => {
  const method = String(value || "get").toLowerCase()
  if (
    method === "get" ||
    method === "post" ||
    method === "put" ||
    method === "delete" ||
    method === "patch"
  ) {
    return method
  }
  return "get"
}

const resolveAppType = (
  context: PageContext,
  explicitAppType?: string,
): string => {
  const appType = String(explicitAppType || context.app.appType || "").trim()
  if (!appType) {
    throw new Error("appType 不能为空")
  }
  return appType
}

const buildAppPath = (
  context: PageContext,
  explicitAppType: string | undefined,
  suffix: string,
) => `/${resolveAppType(context, explicitAppType)}${suffix}`

const buildOpenXiangdaAppPath = (
  context: PageContext,
  explicitAppType: string | undefined,
  suffix: string,
) =>
  `/openxiangda-api/v1/apps/${encodePathSegment(
    resolveAppType(context, explicitAppType),
  )}${suffix}`

const encodePathSegment = (value: string) => encodeURIComponent(String(value))

const withPostDeleteAction = (path: string) =>
  path.includes("/delete") ? path : `${path.replace(/\/$/, "")}/delete`

const getHeaderValue = (
  headers: Record<string, unknown> | undefined,
  name: string,
): string | undefined => {
  if (!headers) {
    return undefined
  }
  const target = name.toLowerCase()
  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === target,
  )
  return entry ? String(entry[1]) : undefined
}

const parseContentDispositionFileName = (
  contentDisposition?: string,
): string | undefined => {
  if (!contentDisposition) {
    return undefined
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1])
    } catch {
      return utf8Match[1]
    }
  }

  const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i)
  if (quotedMatch?.[1]) {
    return quotedMatch[1]
  }

  const plainMatch = contentDisposition.match(/filename=([^;]+)/i)
  if (plainMatch?.[1]) {
    return plainMatch[1].trim()
  }

  return undefined
}

const parseConnectorCallName = (name: string) => {
  const value = String(name || "").trim()
  const separatorIndex = value.indexOf(".")
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    throw new Error("连接器调用名必须是 connector.api 格式")
  }

  return {
    connector: value.slice(0, separatorIndex),
    api: value.slice(separatorIndex + 1),
  }
}

const serializeQuery = (query?: Record<string, unknown>) => {
  if (!query) {
    return undefined
  }

  const params = new URLSearchParams()

  const appendValue = (key: string, value: unknown) => {
    if (value === undefined || value === null || value === "") {
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item) => appendValue(key, item))
      return
    }
    if (value instanceof Date) {
      params.append(key, value.toISOString())
      return
    }
    params.append(key, String(value))
  }

  Object.entries(query).forEach(([key, value]) => {
    appendValue(key, value)
  })

  const serialized = params.toString()
  return serialized || undefined
}

const serializeCommaList = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
        .join(",")
    : value

const toLegacyRules = (value: Record<string, unknown>) =>
  Object.entries(value).flatMap(([key, itemValue]) => {
    if (itemValue === undefined) {
      return []
    }
    return [
      {
        key,
        operator: Array.isArray(itemValue) ? "IN" : "EQ",
        value: itemValue,
      },
    ]
  })

const toSearchGroup = (value: unknown): SearchGroup | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined
  }

  if (typeof value === "string") {
    try {
      return toSearchGroup(JSON.parse(value))
    } catch {
      return undefined
    }
  }

  if (Array.isArray(value)) {
    const rules: Array<SearchRule | SubFormRule> = []
    const conditions: SearchGroup[] = []

    value.forEach((item) => {
      const group = toSearchGroup(item)
      if (group) {
        if (group.rules?.length) {
          rules.push(...group.rules)
        }
        if (group.conditions?.length) {
          conditions.push(...group.conditions)
        }
        return
      }

      if (isSearchRuleLike(item)) {
        rules.push(item)
        return
      }

      if (isRecord(item)) {
        rules.push(...(toLegacyRules(item) as SearchRule[]))
      }
    })

    if (rules.length === 0 && conditions.length === 0) {
      return undefined
    }

    return {
      logic: "AND",
      ...(rules.length > 0 ? { rules } : {}),
      ...(conditions.length > 0 ? { conditions } : {}),
    }
  }

  if (isRecord(value)) {
    if (isSearchRuleLike(value)) {
      return {
        logic: "AND",
        rules: [value],
      }
    }

    if ("rules" in value || "conditions" in value || "logic" in value) {
      const nextGroup: SearchGroup = {
        logic:
          value.logic === "OR" || value.logic === "AND" ? value.logic : "AND",
      }

      if (Array.isArray(value.rules)) {
        nextGroup.rules = value.rules.filter(isSearchRuleLike)
      }

      if (Array.isArray(value.conditions)) {
        nextGroup.conditions = value.conditions
          .map((item) => toSearchGroup(item))
          .filter((item): item is SearchGroup => Boolean(item))
      }

      if (!nextGroup.rules?.length && !nextGroup.conditions?.length) {
        return undefined
      }

      return nextGroup
    }

    const rules = toLegacyRules(value)
    if (rules.length === 0) {
      return undefined
    }
    return {
      logic: "AND",
      rules,
    }
  }

  return undefined
}

const mergeSearchExpressions = (base: unknown, extra: unknown) => {
  const baseGroup = toSearchGroup(base)
  const extraGroup = toSearchGroup(extra)

  if (!baseGroup) {
    return extraGroup
  }

  if (!extraGroup) {
    return baseGroup
  }

  return {
    logic: "AND",
    conditions: [baseGroup, extraGroup],
  } satisfies SearchGroup
}

const serializeSearchExpression = (value?: SearchExpression | string) => {
  if (value === undefined || value === null || value === "") {
    return undefined
  }
  if (typeof value === "string") {
    return value
  }
  const group = toSearchGroup(value)
  return group ? JSON.stringify(group) : undefined
}

const normalizeAdvancedOrder = (value?: SearchSortItem | SearchSortItem[]) => {
  if (!value) {
    return undefined
  }
  const nextValue = Array.isArray(value) ? value : [value]
  return JSON.stringify(nextValue)
}

const normalizeDynamicOrder = (value?: string | SearchSortItem) => {
  if (!value) {
    return undefined
  }
  if (typeof value === "string") {
    return value
  }
  return `${value.id}:${value.isAsc === "n" ? "-" : "+"}`
}

const hasOwn = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key)

const normalizeEnvelopeCode = (value: unknown): number | string => {
  if (value === undefined || value === null || value === "") {
    return 200
  }
  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : String(value)
}

const isSuccessCode = (value: unknown) => {
  if (value === undefined || value === null || value === "") {
    return true
  }
  const normalized = Number(value)
  return Number.isFinite(normalized)
    ? normalized === 0 || (normalized >= 200 && normalized < 300)
    : false
}

const getEnvelopeCode = (rawResponse: unknown) => {
  if (isRecord(rawResponse) && hasOwn(rawResponse, "code")) {
    return rawResponse.code
  }
  const nestedData = (rawResponse as { data?: unknown })?.data
  if (isRecord(nestedData) && hasOwn(nestedData, "code")) {
    return nestedData.code
  }
  return undefined
}

const normalizeJsonResponse = <TResult = unknown, TRaw = TResult>(
  rawResponse: unknown,
): PageApiResponse<TResult, TRaw> => {
  const code = normalizeEnvelopeCode(getEnvelopeCode(rawResponse))

  const topLevelResult =
    isRecord(rawResponse) && "result" in rawResponse
      ? (rawResponse.result as TResult)
      : undefined
  const nestedResult =
    isRecord((rawResponse as { data?: unknown })?.data) &&
    "result" in ((rawResponse as { data?: Record<string, unknown> }).data || {})
      ? ((rawResponse as { data?: Record<string, unknown> }).data
          ?.result as TResult)
      : undefined
  const topLevelData =
    isRecord(rawResponse) && "data" in rawResponse
      ? (rawResponse.data as TRaw)
      : undefined

  const result =
    topLevelResult !== undefined
      ? topLevelResult
      : nestedResult !== undefined
        ? nestedResult
        : topLevelData !== undefined
          ? (topLevelData as unknown as TResult)
          : isRecord(rawResponse)
            ? (rawResponse as TResult)
            : null

  const nestedSuccess =
    typeof (rawResponse as { data?: { success?: boolean } })?.data?.success ===
    "boolean"
      ? (rawResponse as { data?: { success?: boolean } }).data?.success
      : undefined

  const success =
    (rawResponse as { success?: boolean })?.success === false ||
    nestedSuccess === false
      ? false
      : isSuccessCode(code)

  return {
    code,
    success,
    message:
      typeof (rawResponse as { message?: string })?.message === "string"
        ? (rawResponse as { message?: string }).message
        : typeof (rawResponse as { data?: { message?: string } })?.data
              ?.message === "string"
          ? (rawResponse as { data?: { message?: string } }).data?.message
          : undefined,
    result,
    data:
      topLevelData !== undefined
        ? topLevelData
        : topLevelResult !== undefined
          ? (topLevelResult as unknown as TRaw)
          : undefined,
    raw: rawResponse,
  }
}

const createMissingFormInstanceIdError = (response: PageApiResponse<unknown>) => {
  const error = new Error(
    "保存接口未返回 formInstId/formInstanceId。保存接口只承诺返回实例标识和已生成的流水号；如需完整行数据、公式回填或其他服务端字段，请在保存成功后显式调用 sdk.form.getDetail。",
  ) as PageSdkError
  error.response = response
  error.raw = response.raw
  return error
}

const isRequestTracingEnabled = (
  context: PageContext,
  options: PageRequestOptions,
) => {
  if (options.trace) return true
  const env = context.env || {}
  const value =
    env.OPENXIANGDA_REQUEST_TRACE ??
    env.openxiangdaRequestTrace ??
    env.requestTrace
  return value === true || value === "true" || value === "1"
}

const buildRequestDedupeKey = (payload: PageTransportRequestPayload) =>
  JSON.stringify({
    path: payload.path,
    method: payload.method,
    query: payload.query || "",
    headers: payload.headers || {},
  })

const normalizeBinaryResponse = (rawResponse: unknown): PageBinaryResponse => {
  if (isRecord(rawResponse) && isBlobLike(rawResponse.blob)) {
    return rawResponse as unknown as PageBinaryResponse
  }

  if (isBlobLike(rawResponse)) {
    return {
      blob: rawResponse,
      raw: rawResponse,
    }
  }

  const responseData = (rawResponse as { data?: unknown })?.data
  const responseHeaders = isRecord(
    (rawResponse as { headers?: unknown })?.headers,
  )
    ? ((rawResponse as { headers?: Record<string, unknown> }).headers as Record<
        string,
        unknown
      >)
    : undefined

  if (!isBlobLike(responseData)) {
    throw new Error("transport.download 未返回 Blob 数据")
  }

  const contentDisposition = getHeaderValue(
    responseHeaders,
    "content-disposition",
  )

  return {
    blob: responseData,
    fileName: parseContentDispositionFileName(contentDisposition),
    contentType:
      getHeaderValue(responseHeaders, "content-type") || responseData.type,
    headers: responseHeaders
      ? Object.fromEntries(
          Object.entries(responseHeaders).map(([key, value]) => [
            key,
            value === undefined ? undefined : String(value),
          ]),
        )
      : undefined,
    raw: rawResponse,
  }
}

const toSdkError = (
  input: unknown,
  payload: PageTransportRequestPayload | PageTransportDownloadPayload,
): PageSdkError => {
  if (input instanceof Error && (input as PageSdkError).response) {
    return input as PageSdkError
  }

  const normalizedResponse = isRecord(input)
    ? normalizeJsonResponse(input)
    : undefined

  const nextError =
    input instanceof Error
      ? input
      : new Error(
          normalizedResponse?.message ||
            `请求失败: ${String(payload.method).toUpperCase()} ${payload.path}`,
        )

  const sdkError = nextError as PageSdkError
  sdkError.method = String(payload.method).toUpperCase()
  sdkError.path = payload.path
  sdkError.response = normalizedResponse
  sdkError.raw = input
  return sdkError
}

const ensureSuccess = <TResult = unknown, TRaw = TResult>(
  response: PageApiResponse<TResult, TRaw>,
  payload: PageTransportRequestPayload,
) => {
  if (!response.success) {
    throw toSdkError(response, payload)
  }
  return response
}

const resolveFormInstanceId = (params: {
  formInstId?: string
  formInstanceId?: string
  instanceId?: string
}) => {
  const formInstanceId = String(
    params.formInstId || params.formInstanceId || params.instanceId || "",
  ).trim()
  if (!formInstanceId) {
    throw new Error("formInstanceId 不能为空")
  }
  return formInstanceId
}

const pickCreatedFormInstanceId = (value: unknown): string | undefined => {
  if (!value) return undefined
  if (typeof value === "string") {
    const text = value.trim()
    return text || undefined
  }
  if (!isRecord(value)) return undefined

  const direct =
    value.formInstId ||
    value.formInstanceId ||
    value.instanceId ||
    value.id
  if (direct !== value && direct !== undefined && direct !== null) {
    const picked = pickCreatedFormInstanceId(direct)
    if (picked) return picked
  }
  for (const candidate of [value.result, value.data, value.raw]) {
    const picked = pickCreatedFormInstanceId(candidate)
    if (picked) return picked
  }
  return undefined
}

const pickCreatedProcessInstanceId = (value: unknown): string | undefined => {
  if (!value || typeof value === "string") return undefined
  if (!isRecord(value)) return undefined
  const direct = value.processInstanceId || value.processInstId
  if (typeof direct === "string" && direct.trim()) return direct.trim()
  for (const candidate of [value.result, value.data, value.raw]) {
    const picked = pickCreatedProcessInstanceId(candidate)
    if (picked) return picked
  }
  return undefined
}

const pickSerialNumbers = (value: unknown): Record<string, string> | undefined => {
  if (!value || typeof value === "string" || !isRecord(value)) return undefined
  const direct = value.serialNumbers
  if (isRecord(direct)) {
    const entries = Object.entries(direct)
      .map(([key, item]) => [key, String(item ?? "").trim()] as const)
      .filter(([, item]) => Boolean(item))
    if (entries.length > 0) return Object.fromEntries(entries)
  }
  for (const candidate of [value.result, value.data, value.raw]) {
    const picked = pickSerialNumbers(candidate)
    if (picked) return picked
  }
  return undefined
}

const pickSerialNumber = (value: unknown): string | undefined => {
  if (!value || typeof value === "string") return undefined
  if (!isRecord(value)) return undefined
  const direct = value.serialNumber || value.serialNo || value.sequenceNo
  if (typeof direct === "string" && direct.trim()) return direct.trim()
  const serialNumbers = pickSerialNumbers(value)
  if (serialNumbers) {
    const first = Object.values(serialNumbers)[0]
    if (first) return first
  }
  for (const candidate of [value.result, value.data, value.raw]) {
    const picked = pickSerialNumber(candidate)
    if (picked) return picked
  }
  return undefined
}

const normalizeFormCreateResponse = <
  TResult = FormCreateResult,
  TRaw = unknown,
>(
  response: PageApiResponse<TResult, TRaw>,
  formInstanceId: string,
): PageApiResponse<TResult, TRaw> => {
  const processInstanceId = pickCreatedProcessInstanceId(response)
  const serialNumbers = pickSerialNumbers(response)
  const serialNumber = pickSerialNumber(response)
  const sourceResult: Record<string, unknown> = isRecord(response.result)
    ? response.result
    : {}
  const normalizedResult = {
    ...sourceResult,
    formInstId: formInstanceId,
    formInstanceId,
    result:
      typeof response.result === "string" && response.result.trim()
        ? response.result.trim()
        : (sourceResult.result as unknown) || formInstanceId,
    ...(processInstanceId ? { processInstanceId } : {}),
    ...(serialNumber ? { serialNumber } : {}),
    ...(serialNumbers ? { serialNumbers } : {}),
  } as TResult

  const normalizedData = isRecord(response.data)
    ? ({
        ...response.data,
        formInstId:
          (response.data as Record<string, unknown>).formInstId || formInstanceId,
        formInstanceId:
          (response.data as Record<string, unknown>).formInstanceId ||
          formInstanceId,
        ...(processInstanceId ? { processInstanceId } : {}),
        ...(serialNumber ? { serialNumber } : {}),
        ...(serialNumbers ? { serialNumbers } : {}),
      } as TRaw)
    : response.data

  return {
    ...(response as PageApiResponse<TResult, TRaw> & {
      formInstId?: string
      formInstanceId?: string
      processInstanceId?: string
      serialNumber?: string
      serialNumbers?: Record<string, string>
    }),
    formInstId: formInstanceId,
    formInstanceId,
    ...(processInstanceId ? { processInstanceId } : {}),
    ...(serialNumber ? { serialNumber } : {}),
    ...(serialNumbers ? { serialNumbers } : {}),
    result: normalizedResult,
    data: normalizedData,
  }
}

const isStableCreateLookupValue = (value: unknown) => {
  if (value === undefined || value === null || value === "") return false
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
}

const buildCreateLookupFilters = (
  data: Record<string, unknown>,
  lookupFields?: string[],
): SearchGroup | undefined => {
  const sourceFields = lookupFields?.length
    ? lookupFields
    : Object.keys(data).filter((key) => isStableCreateLookupValue(data[key]))
  const rules = sourceFields
    .filter((key) => isStableCreateLookupValue(data[key]))
    .slice(0, 6)
    .map(
      (key): SearchRule => ({
        key,
        operator: "EQ",
        value: data[key],
      }),
    )
  return rules.length > 0 ? { logic: "AND", rules } : undefined
}

const firstListItem = (value: unknown): Record<string, unknown> | undefined => {
  if (!value) return undefined
  if (Array.isArray(value)) {
    return isRecord(value[0]) ? value[0] : undefined
  }
  if (!isRecord(value)) return undefined
  const candidates = [
    value.data,
    value.list,
    value.items,
    value.records,
    value.result,
  ]
  for (const candidate of candidates) {
    const item = firstListItem(candidate)
    if (item) return item
  }
  return undefined
}

const attachFormInstanceId = <TResult = unknown, TRaw = TResult>(
  response: PageApiResponse<TResult, TRaw>,
  formInstanceId: string,
): PageApiResponse<TResult, TRaw> => {
  const withIds = (value: unknown) =>
    isRecord(value)
      ? ({
          ...value,
          formInstId: value.formInstId || formInstanceId,
          formInstanceId: value.formInstanceId || formInstanceId,
        } as unknown)
      : value

  return {
    ...(response as PageApiResponse<TResult, TRaw> & {
      formInstId?: string
      formInstanceId?: string
    }),
    formInstId: formInstanceId,
    formInstanceId,
    result:
      response.result === null || response.result === undefined
        ? (formInstanceId as unknown as TResult)
        : (withIds(response.result) as TResult),
    data:
      response.data === undefined
        ? response.data
        : (withIds(response.data) as TRaw),
  }
}

const withDefaultAppType = <
  T extends {
    appType?: string
    scope?: string
  },
>(
  context: PageContext,
  params: T | undefined,
) => {
  if (!params) {
    return params
  }

  if (params.appType) {
    return params
  }

  if (params.scope === "app") {
    return {
      ...params,
      appType: context.app.appType,
    }
  }

  return params
}

const AUTH_LOGIN_URL_ENV_KEYS = [
  "loginUrl",
  "authLoginUrl",
  "bathAuthUrl",
  "REACT_APP_VITE_BATH_AUTH_URL",
  "VITE_BATH_AUTH_URL",
  "BATH_AUTH_URL",
]

const DEFAULT_PLATFORM_LOGIN_URL = "/platform/login"

const normalizeOptionalString = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : ""
  return text || undefined
}

const getCurrentHref = () => {
  if (typeof window === "undefined") {
    return ""
  }
  return window.location?.href || ""
}

const resolveAuthLoginUrl = (
  context: PageContext,
  options: AuthLogoutRedirectOptions,
) => {
  const explicitLoginUrl = normalizeOptionalString(options.loginUrl)
  if (explicitLoginUrl) {
    return explicitLoginUrl
  }

  for (const key of AUTH_LOGIN_URL_ENV_KEYS) {
    const loginUrl = normalizeOptionalString(context.env?.[key])
    if (loginUrl) {
      return loginUrl
    }
  }

  return undefined
}

const buildAuthRedirectUrl = (
  loginUrl: string,
  callbackUrl: string | undefined,
  callbackParamName: string | undefined,
) => {
  const paramName = normalizeOptionalString(callbackParamName) || "callback"
  const normalizedCallbackUrl = normalizeOptionalString(callbackUrl)

  if (!normalizedCallbackUrl) {
    return loginUrl
  }

  const baseHref = getCurrentHref() || "http://localhost/"
  const isAbsoluteUrl = /^[a-z][a-z\d+.-]*:/i.test(loginUrl)
  const isProtocolRelativeUrl = loginUrl.startsWith("//")
  const isRootRelativeUrl = loginUrl.startsWith("/")

  try {
    const url = new URL(loginUrl, baseHref)
    url.searchParams.set(paramName, normalizedCallbackUrl)

    if (isAbsoluteUrl || isProtocolRelativeUrl) {
      return url.toString()
    }

    const path = `${url.pathname}${url.search}${url.hash}`
    return isRootRelativeUrl ? path : path.replace(/^\//, "")
  } catch {
    const hashIndex = loginUrl.indexOf("#")
    const pathAndQuery =
      hashIndex >= 0 ? loginUrl.slice(0, hashIndex) : loginUrl
    const hash = hashIndex >= 0 ? loginUrl.slice(hashIndex) : ""
    const separator = pathAndQuery.includes("?") ? "&" : "?"

    return `${pathAndQuery}${separator}${encodeURIComponent(
      paramName,
    )}=${encodeURIComponent(normalizedCallbackUrl)}${hash}`
  }
}

const performRedirect = (
  url: string,
  options: AuthLogoutRedirectOptions,
) => {
  if (options.redirect) {
    options.redirect(url)
    return
  }

  if (typeof window === "undefined" || !window.location) {
    return
  }

  if (options.replace && typeof window.location.replace === "function") {
    window.location.replace(url)
    return
  }

  window.location.href = url
}

const reloadCurrentPage = () => {
  if (
    typeof window === "undefined" ||
    !window.location ||
    typeof window.location.reload !== "function"
  ) {
    return
  }

  window.location.reload()
}

const redirectAfterLogout = (
  context: PageContext,
  options: AuthLogoutRedirectOptions,
) => {
  const loginUrl = resolveAuthLoginUrl(context, options)
  const callbackUrl = normalizeOptionalString(options.callbackUrl) || getCurrentHref()

  if (loginUrl) {
    performRedirect(
      buildAuthRedirectUrl(loginUrl, callbackUrl, options.callbackParamName),
      options,
    )
    return
  }

  if (options.fallback === "none") {
    return
  }

  if (options.fallback === "reload") {
    reloadCurrentPage()
    return
  }

  const redirectLoginUrl = DEFAULT_PLATFORM_LOGIN_URL
  performRedirect(
    buildAuthRedirectUrl(redirectLoginUrl, callbackUrl, options.callbackParamName),
    options,
  )
}

export const createPageSdk = (context: PageContext): PageSdk => {
  const formConfigRevisions = new Map<string, number>()
  const formConfigKey = (appType: string | undefined, formUuid: string) =>
    `${resolveAppType(context, appType)}:${formUuid}`
  const rememberFormConfigRevision = <T>(
    response: PageApiResponse<T>,
    appType: string | undefined,
    formUuid: string,
  ) => {
    const revision = Number(
      (response.raw as any)?.releaseControl?.revision ??
        (response.raw as any)?.raw?.releaseControl?.revision ??
        (response.raw as any)?.data?.revision,
    )
    if (Number.isSafeInteger(revision) && revision >= 1) {
      formConfigRevisions.set(formConfigKey(appType, formUuid), revision)
    }
    return response
  }
  const inFlightGetRequests = new Map<
    string,
    Promise<PageApiResponse<unknown, unknown>>
  >()
  const recentRequestStats = new Map<string, { count: number; lastAt: number }>()

  const request = async <TResult = unknown, TRaw = TResult>(
    options: PageRequestOptions,
  ) => {
    const payload: PageTransportRequestPayload = {
      path: options.path,
      method: normalizeMethod(options.method),
      query: serializeQuery(options.query),
      body: options.body,
      headers: options.headers,
      ...(options.cache ? { cache: options.cache } : {}),
    }
    const traceEnabled = isRequestTracingEnabled(context, options)
    const traceLabel = options.traceLabel || `${payload.method.toUpperCase()} ${payload.path}`
    const dedupeKey =
      options.dedupe !== false && payload.method === "get"
        ? buildRequestDedupeKey(payload)
        : undefined

    if (traceEnabled && dedupeKey) {
      const currentAt = nowMs()
      const previous = recentRequestStats.get(dedupeKey)
      const nextCount =
        previous && currentAt - previous.lastAt < 500 ? previous.count + 1 : 1
      recentRequestStats.set(dedupeKey, { count: nextCount, lastAt: currentAt })
      if (nextCount > 1) {
        console.warn(
          `[OpenXiangda SDK] repeated request within 500ms (${nextCount}): ${traceLabel}`,
        )
      }
    }

    if (dedupeKey && inFlightGetRequests.has(dedupeKey)) {
      if (traceEnabled) {
        console.debug(`[OpenXiangda SDK] deduped in-flight request: ${traceLabel}`)
      }
      return inFlightGetRequests.get(dedupeKey) as Promise<
        PageApiResponse<TResult, TRaw>
      >
    }

    const task = (async () => {
      const startedAt = nowMs()
      const rawResponse = await context.bridge.invoke<unknown>(
        "transport.request",
        payload,
      )
      const normalized = ensureSuccess(
        normalizeJsonResponse<TResult, TRaw>(rawResponse),
        payload,
      )
      if (traceEnabled) {
        console.debug(
          `[OpenXiangda SDK] ${traceLabel} ${Math.round(nowMs() - startedAt)}ms`,
        )
      }
      return normalized
    })()

    if (dedupeKey) {
      inFlightGetRequests.set(dedupeKey, task as Promise<PageApiResponse<unknown, unknown>>)
    }

    try {
      return await task
    } catch (error) {
      throw toSdkError(error, payload)
    } finally {
      if (dedupeKey && inFlightGetRequests.get(dedupeKey) === task) {
        inFlightGetRequests.delete(dedupeKey)
      }
    }
  }

  const download = async (options: PageRequestOptions) => {
    const payload: PageTransportDownloadPayload = {
      path: options.path,
      method: normalizeMethod(options.method),
      query: serializeQuery(options.query),
      body: options.body,
      headers: options.headers,
    }

    try {
      const rawResponse = await context.bridge.invoke<unknown>(
        "transport.download",
        payload,
      )
      return normalizeBinaryResponse(rawResponse)
    } catch (error) {
      throw toSdkError(error, payload)
    }
  }

  const createFileAccessTicket: PageSdk["createFileAccessTicket"] = (
    bucketName,
    objectName,
    fileName,
    purpose = "preview",
    options = {},
  ) =>
    request<FileAccessTicketResult>({
      path: "/file/access-ticket",
      method: "post",
      body: {
        bucketName,
        objectName,
        fileName,
        purpose,
        appType: resolveAppType(context, options.appType),
      },
    })

  const logout = <T = boolean>() =>
    request<T>({
      path: "/api/auth/logout",
      method: "post",
    })

  const auth = {
    logout,
    logoutAndRedirect: async <T = boolean>(
      options: AuthLogoutRedirectOptions = {},
    ) => {
      try {
        const response = await logout<T>()
        redirectAfterLogout(context, options)
        return response
      } catch (error) {
        if (options.continueOnLogoutError === false) {
          throw error
        }
        redirectAfterLogout(context, options)
        return null
      }
    },
  }

  const connector = {
    invoke: <TResult = unknown, TBody = unknown>(
      params: ConnectorInvokeParams<TBody>,
    ) =>
      request<ConnectorInvokeResult<TResult>>({
        path: buildAppPath(
          context,
          params.appType,
          "/v1/connectors/actions/invoke",
        ),
        method: "post",
        body: {
          connector: params.connector,
          api: params.api,
          pathParams: params.pathParams,
          query: params.query,
          body: params.body,
          headers: params.headers,
          requestBodyType: params.requestBodyType,
          responseType: params.responseType,
        },
      }),
    call: <TResult = unknown, TBody = unknown>(
      name: string,
      params: ConnectorCallParams<TBody> = {},
    ) => {
      const target = parseConnectorCallName(name)
      return connector.invoke<TResult, TBody>({
        ...params,
        connector: target.connector,
        api: target.api,
      })
    },
    download: <TBody = unknown>(
      params: ConnectorInvokeParams<TBody>,
    ): Promise<PageBinaryResponse> =>
      download({
        path: buildAppPath(
          context,
          params.appType,
          "/v1/connectors/actions/download",
        ),
        method: "post",
        body: {
          connector: params.connector,
          api: params.api,
          pathParams: params.pathParams,
          query: params.query,
          body: params.body,
          headers: params.headers,
          requestBodyType: params.requestBodyType,
          responseType: "binary",
        },
      }),
  }

  const form = {
    getDetail: <T = unknown>(params: FormGetDetailParams) =>
      request<T>({
        path: buildAppPath(
          context,
          params.appType,
          "/v1/form/getFormDataById.json",
        ),
        method: "get",
        query: {
          formUuid: params.formUuid,
          formInstId: resolveFormInstanceId(params),
        },
      }),
    create: async <T = FormCreateResult, TRaw = unknown>(
      params: FormCreateParams,
    ) => {
      const response = await request<T, TRaw>({
        path: buildAppPath(
          context,
          params.appType,
          "/v1/form/saveFormData.json",
        ),
        method: "post",
        body: {
          formUuid: params.formUuid,
          formDataJson: JSON.stringify(params.data || {}),
          saveAsDraft: params.saveAsDraft,
          draft: params.draft,
          startProcess: params.startProcess,
          autoStartProcess: params.autoStartProcess,
          processStartMode: params.processStartMode,
        },
      })
      const directId = pickCreatedFormInstanceId(response)
      if (directId) {
        return normalizeFormCreateResponse(response, directId)
      }
      if (!params.lookupAfterCreate) {
        throw createMissingFormInstanceIdError(response)
      }
      const filters = buildCreateLookupFilters(params.data || {}, params.lookupFields)
      if (!filters) {
        if (params.lookupAfterCreate === "legacy") return response
        throw createMissingFormInstanceIdError(response)
      }
      const lookupResponse = await request<PageListResult<Record<string, unknown>>>({
        path: buildAppPath(
          context,
          params.appType,
          "/v1/form/advancedSearch.json",
        ),
        method: "get",
        query: {
          formUuid: params.formUuid,
          filters: serializeSearchExpression(filters),
          currentPage: 1,
          pageSize: 1,
          order: normalizeAdvancedOrder([{ id: "createTime", isAsc: "n" }]),
        },
      })
      const lookupId = pickCreatedFormInstanceId(firstListItem(lookupResponse))
      if (lookupId) return normalizeFormCreateResponse(response, lookupId)
      if (params.lookupAfterCreate === "legacy") return response
      throw createMissingFormInstanceIdError(response)
    },
    update: <T = unknown, TRaw = unknown>(params: FormUpdateParams) =>
      request<T, TRaw>({
        path: buildAppPath(
          context,
          params.appType,
          "/v1/form/updateFormData.json",
        ),
        method: "post",
        body: {
          formUuid: params.formUuid,
          formInstId: resolveFormInstanceId(params),
          updateFormDataJson:
            params.updateFormDataJson || JSON.stringify(params.data || {}),
        },
      }),
    remove: <T = unknown, TRaw = unknown>(params: FormRemoveParams) =>
      request<T, TRaw>({
        path: buildAppPath(
          context,
          params.appType,
          "/v1/form/deleteFormData.json",
        ),
        method: "post",
        body: {
          formUuid: params.formUuid,
          formInstId: resolveFormInstanceId(params),
        },
      }),
    getChangeRecords: <T = unknown>(params: FormChangeRecordParams) =>
      request<T>({
        path: buildAppPath(
          context,
          params.appType,
          "/v1/form/getFormDataChangeRecords.json",
        ),
        method: "get",
        query: {
          formUuid: params.formUuid,
          formInstId: resolveFormInstanceId(params),
          page: params.page,
          pageSize: params.pageSize,
        },
      }),
    search: <T = unknown>(params: FormSearchParams) =>
      request<PageListResult<T>>({
        path: buildAppPath(
          context,
          params.appType,
          "/v1/form/searchFormDatas.json",
        ),
        method: "get",
        query: {
          formUuid: params.formUuid,
          searchFieldJson: serializeSearchExpression(params.search),
          currentPage: params.currentPage,
          pageSize: params.pageSize,
          originatorId: params.originatorId,
          createFrom: params.createFrom,
          createTo: params.createTo,
          modifiedFrom: params.modifiedFrom,
          modifiedTo: params.modifiedTo,
          dynamicOrder: normalizeDynamicOrder(params.dynamicOrder),
          instanceStatus: params.instanceStatus,
        },
      }),
    searchIds: <T = string>(params: FormSearchParams) =>
      request<PageListResult<T>>({
        path: buildAppPath(
          context,
          params.appType,
          "/v1/form/searchFormDataIds.json",
        ),
        method: "get",
        query: {
          formUuid: params.formUuid,
          searchFieldJson: serializeSearchExpression(params.search),
          currentPage: params.currentPage,
          pageSize: params.pageSize,
          originatorId: params.originatorId,
          createFrom: params.createFrom,
          createTo: params.createTo,
          modifiedFrom: params.modifiedFrom,
          modifiedTo: params.modifiedTo,
          dynamicOrder: normalizeDynamicOrder(params.dynamicOrder),
          instanceStatus: params.instanceStatus,
        },
      }),
    advancedSearch: <T = unknown>(params: FormAdvancedSearchParams) =>
      request<PageListResult<T>>({
        path: buildAppPath(
          context,
          params.appType,
          "/v1/form/advancedSearch.json",
        ),
        method: "get",
        cache: "no-store",
        dedupe: false,
        query: {
          formUuid: params.formUuid,
          filters: serializeSearchExpression(params.filters),
          conditionType: params.conditionType,
          searchKeyWord: params.searchKeyWord,
          currentPage: params.currentPage,
          pageSize: params.pageSize,
          order: normalizeAdvancedOrder(params.order),
          instanceStatus: params.instanceStatus,
          _oxCacheBust: nextDynamicReadNonce(),
        },
      }),
    advancedExport: (params: FormExportParams) =>
      download({
        path: buildAppPath(
          context,
          params.appType,
          "/v1/form/advancedExport.xlsx",
        ),
        method: "get",
        query: {
          formUuid: params.formUuid,
          filters: serializeSearchExpression(params.filters),
          conditionType: params.conditionType,
          searchKeyWord: params.searchKeyWord,
          currentPage: params.currentPage,
          pageSize: params.pageSize,
          order: normalizeAdvancedOrder(params.order),
          instanceStatus: params.instanceStatus,
          exportAll: params.exportAll,
          embedImages: params.embedImages,
          exportFields: params.exportFields?.join(","),
        },
      }),
    downloadImportTemplate: (params: DataManagementConfigParams) =>
      download({
        path: buildAppPath(
          context,
          params.appType,
          "/v1/form/advancedExportTemplate.xlsx",
        ),
        method: "get",
        query: {
          formUuid: params.formUuid,
        },
      }),
    importPreview: <T = unknown>(params: FormImportParams) =>
      request<T>({
        path: buildAppPath(
          context,
          params.appType,
          "/v1/form/importPreview.xlsx",
        ),
        method: "post",
        body: {
          formUuid: params.formUuid,
          fileBase64: params.fileBase64,
          fileName: params.fileName,
        },
      }),
    importExcel: <T = unknown>(params: FormImportParams) =>
      request<T>({
        path: buildAppPath(context, params.appType, "/v1/form/import.xlsx"),
        method: "post",
        body: {
          formUuid: params.formUuid,
          fileBase64: params.fileBase64,
          fileName: params.fileName,
        },
      }),
    getImportRecords: <T = unknown>(params: ImportExportRecordQuery) =>
      request<T>({
        path: buildAppPath(
          context,
          params.appType,
          "/v1/form/importRecords.json",
        ),
        method: "get",
        query: {
          formUuid: params.formUuid,
          currentPage: params.currentPage,
          pageSize: params.pageSize,
        },
      }),
    getExportRecords: <T = unknown>(params: ImportExportRecordQuery) =>
      request<T>({
        path: buildAppPath(
          context,
          params.appType,
          "/v1/form/exportRecords.json",
        ),
        method: "get",
        query: {
          formUuid: params.formUuid,
          currentPage: params.currentPage,
          pageSize: params.pageSize,
        },
      }),
    downloadImportSource: (params: ImportExportRecordDownloadParams) =>
      download({
        path: buildAppPath(
          context,
          params.appType,
          "/v1/form/importRecord/downloadSource.xlsx",
        ),
        method: "get",
        query: {
          recordId: params.recordId,
        },
      }),
    downloadImportFailed: (params: ImportExportRecordDownloadParams) =>
      download({
        path: buildAppPath(
          context,
          params.appType,
          "/v1/form/importRecord/downloadFailed.xlsx",
        ),
        method: "get",
        query: {
          recordId: params.recordId,
        },
      }),
    downloadExportRecord: (params: ImportExportRecordDownloadParams) =>
      download({
        path: buildAppPath(
          context,
          params.appType,
          "/v1/form/exportRecord/download.xlsx",
        ),
        method: "get",
        query: {
          recordId: params.recordId,
        },
      }),
    getDataManagementConfig: async <T = unknown>(
      params: DataManagementConfigParams,
    ) => {
      const response = await request<T>({
        path: buildAppPath(
          context,
          params.appType,
          "/v1/form/dataManagement/config/get.json",
        ),
        method: "get",
        query: {
          formUuid: params.formUuid,
        },
      })
      return rememberFormConfigRevision(
        response,
        params.appType,
        params.formUuid,
      )
    },
    saveDataManagementConfig: async <T = unknown>(
      params: SaveDataManagementConfigParams,
    ) => {
      const expectedRevision =
        params.expectedRevision ??
        formConfigRevisions.get(
          formConfigKey(params.appType, params.formUuid),
        )
      if (!expectedRevision) {
        throw new Error(
          "保存数据管理配置前必须先读取配置，或显式传入 expectedRevision",
        )
      }
      const response = await request<T>({
        path: buildAppPath(
          context,
          params.appType,
          "/v1/form/dataManagement/config/save.json",
        ),
        method: "post",
        body: {
          formUuid: params.formUuid,
          config: params.config,
          expectedRevision,
        },
      })
      return rememberFormConfigRevision(
        response,
        params.appType,
        params.formUuid,
      )
    },
  }

  const user = {
    create: <T = unknown>(params: CreateUserParams) =>
      request<T>({
        path: "/user/create",
        method: "post",
        body: params,
      }),
    update: <T = unknown>(params: UpdateUserParams) =>
      request<T>({
        path: "/user/update",
        method: "post",
        body: params,
      }),
    remove: <T = boolean>(id: string) =>
      request<T>({
        path: withPostDeleteAction(`/user/${encodePathSegment(id)}`),
        method: "post",
      }),
    get: <T = unknown>(id = "current") =>
      request<T>({
        path: `/user/${encodePathSegment(id)}`,
        method: "get",
      }),
    getCurrent: <T = unknown>() =>
      request<T>({
        path: "/user/current",
        method: "get",
      }),
    getByUsername: <T = unknown>(username: string) =>
      request<T>({
        path: `/user/username/${encodePathSegment(username)}`,
        method: "get",
      }),
    list: <T = unknown>(params?: UserListParams) =>
      request<T>({
        path: "/user/list",
        method: "get",
        query: {
          ids: serializeCommaList(params?.ids),
          departmentIds: serializeCommaList(params?.departmentIds),
          keyword: params?.keyword,
          name: params?.name,
          username: params?.username,
          phone: params?.phone,
          email: params?.email,
          jobNumber: params?.jobNumber,
          page: params?.page,
          pageSize: params?.pageSize,
        },
      }),
    search: <T = unknown>(keyword?: string) =>
      request<T>({
        path: "/user/search",
        method: "get",
        query: {
          keyword,
        },
      }),
    listAll: <T = unknown>() =>
      request<T>({
        path: "/user/all",
        method: "get",
      }),
    listByDepartment: <T = unknown>(departmentId: string) =>
      request<T>({
        path: `/user/department/${encodePathSegment(departmentId)}`,
        method: "get",
      }),
    validate: <T = unknown>(params: ValidateUserParams) =>
      request<T>({
        path: "/user/validate",
        method: "post",
        body: params,
      }),
  }

  const getParentDepartments = <T = PageDepartmentRecord[]>(
    departmentId: string,
    options: GetParentDepartmentsOptions = {},
  ) =>
    request<T>({
      path: `/department/${encodePathSegment(departmentId)}/parentDepartments`,
      method: "get",
      query: {
        includeSelf: options.includeSelf ?? true,
      },
    })

  const department = {
    getParentDepartments,
    getCurrentUserParentDepartments: async (
      options: GetParentDepartmentsOptions = {},
    ): Promise<CurrentUserDepartmentParents[]> => {
      const departments = (context.user.departments || []).filter(
        (item) => typeof item.id === "string" && item.id.trim(),
      )

      return Promise.all(
        departments.map(async (item) => {
          const response = await getParentDepartments(item.id || "", {
            includeSelf: options.includeSelf,
          })
          return {
            department: item,
            parents: response.result || [],
          }
        }),
      )
    },
  }

  const organization = {
    capabilities: <T = unknown>(params: { appType?: string } = {}) =>
      request<T>({
        path: buildOpenXiangdaAppPath(
          context,
          params.appType,
          "/organization/capabilities",
        ),
        method: "get",
      }),
    departments: {
      list: <T = PageDepartmentRecord[]>(params: { appType?: string } = {}) =>
        request<T>({
          path: buildOpenXiangdaAppPath(
            context,
            params.appType,
            "/organization/departments",
          ),
          method: "get",
        }),
      get: <T = PageDepartmentRecord>(
        departmentId: string,
        params: { appType?: string } = {},
      ) =>
        request<T>({
          path: buildOpenXiangdaAppPath(
            context,
            params.appType,
            `/organization/departments/${encodePathSegment(departmentId)}`,
          ),
          method: "get",
        }),
      create: <T = PageDepartmentRecord>(
        params: CreateOrganizationDepartmentParams,
      ) =>
        request<T>({
          path: buildOpenXiangdaAppPath(
            context,
            params.appType,
            "/organization/departments",
          ),
          method: "post",
          body: {
            ...params,
            appType: resolveAppType(context, params.appType),
          },
        }),
      update: <T = PageDepartmentRecord>(
        departmentId: string,
        params: UpdateOrganizationDepartmentParams,
      ) =>
        request<T>({
          path: buildOpenXiangdaAppPath(
            context,
            params.appType,
            `/organization/departments/${encodePathSegment(departmentId)}`,
          ),
          method: "post",
          body: {
            ...params,
            appType: resolveAppType(context, params.appType),
          },
        }),
    },
    accounts: {
      list: <T = unknown>(params: OrganizationAccountListParams = {}) =>
        request<T>({
          path: buildOpenXiangdaAppPath(
            context,
            params.appType,
            "/organization/accounts",
          ),
          method: "get",
          query: {
            ids: serializeCommaList(params.ids),
            departmentIds: serializeCommaList(params.departmentIds),
            keyword: params.keyword,
            name: params.name,
            username: params.username,
            phone: params.phone,
            email: params.email,
            jobNumber: params.jobNumber,
            page: params.page,
            pageSize: params.pageSize,
          },
        }),
      get: <T = PageUserRecord>(
        userId: string,
        params: { appType?: string } = {},
      ) =>
        request<T>({
          path: buildOpenXiangdaAppPath(
            context,
            params.appType,
            `/organization/accounts/${encodePathSegment(userId)}`,
          ),
          method: "get",
        }),
      create: <T = PageUserRecord>(params: CreateOrganizationAccountParams) =>
        request<T>({
          path: buildOpenXiangdaAppPath(
            context,
            params.appType,
            "/organization/accounts",
          ),
          method: "post",
          body: {
            ...params,
            appType: resolveAppType(context, params.appType),
          },
        }),
      update: <T = PageUserRecord>(
        userId: string,
        params: UpdateOrganizationAccountParams,
      ) =>
        request<T>({
          path: buildOpenXiangdaAppPath(
            context,
            params.appType,
            `/organization/accounts/${encodePathSegment(userId)}`,
          ),
          method: "post",
          body: {
            ...params,
            appType: resolveAppType(context, params.appType),
          },
        }),
      resetPassword: <T = PageUserRecord>(
        userId: string,
        params: ResetOrganizationAccountPasswordParams,
      ) =>
        request<T>({
          path: buildOpenXiangdaAppPath(
            context,
            params.appType,
            `/organization/accounts/${encodePathSegment(userId)}/password/reset`,
          ),
          method: "post",
          body: {
            ...params,
            appType: resolveAppType(context, params.appType),
          },
        }),
      changeMyPassword: <T = PageUserRecord>(
        params: ChangeOrganizationAccountPasswordParams,
      ) =>
        request<T>({
          path: buildOpenXiangdaAppPath(
            context,
            params.appType,
            "/organization/accounts/me/password/change",
          ),
          method: "post",
          body: {
            ...params,
            appType: resolveAppType(context, params.appType),
          },
        }),
    },
    schoolContact: {
      relations: {
        list: <T = unknown>(params: SchoolContactRelationListParams = {}) =>
          request<T>({
            path: buildOpenXiangdaAppPath(
              context,
              params.appType,
              "/organization/school-contact/relations",
            ),
            method: "get",
            query: {
              userId: params.userId,
              guardianUserId: params.guardianUserId,
              studentUserId: params.studentUserId,
              dingtalkUserId: params.dingtalkUserId,
              mobile: params.mobile,
              name: params.name,
              classId: params.classId,
              role: params.role,
              relationCode: params.relationCode,
              page: params.page,
              pageSize: params.pageSize,
            },
          }),
      },
      teachers: {
        list: <T = unknown>(params: SchoolContactTeacherListParams = {}) =>
          request<T>({
            path: buildOpenXiangdaAppPath(
              context,
              params.appType,
              "/organization/school-contact/teachers",
            ),
            method: "get",
            query: {
              userId: params.userId,
              dingtalkUserId: params.dingtalkUserId,
              mobile: params.mobile,
              name: params.name,
              classId: params.classId,
              isHeadTeacher: params.isHeadTeacher,
              page: params.page,
              pageSize: params.pageSize,
            },
          }),
      },
      children: {
        list: <T = unknown>(
          guardianUserId: string,
          params: Pick<SchoolContactRelationListParams, "page" | "pageSize"> = {},
        ) =>
          request<T>({
            path: buildOpenXiangdaAppPath(
              context,
              undefined,
              `/organization/school-contact/users/${encodePathSegment(guardianUserId)}/children`,
            ),
            method: "get",
            query: params,
          }),
      },
      guardians: {
        list: <T = unknown>(
          studentUserId: string,
          params: Pick<SchoolContactRelationListParams, "page" | "pageSize"> = {},
        ) =>
          request<T>({
            path: buildOpenXiangdaAppPath(
              context,
              undefined,
              `/organization/school-contact/users/${encodePathSegment(studentUserId)}/guardians`,
            ),
            method: "get",
            query: params,
          }),
      },
      myFamily: {
        get: <T = unknown>(
          params: Pick<SchoolContactRelationListParams, "page" | "pageSize"> = {},
        ) =>
          request<T>({
            path: buildOpenXiangdaAppPath(
              context,
              undefined,
              "/organization/school-contact/me/family",
            ),
            method: "get",
            query: params,
          }),
      },
    },
  }

  const role = {
    create: <T = unknown>(params: CreateRoleParams) =>
      request<T>({
        path: "/role/",
        method: "post",
        body: params,
      }),
    update: <T = unknown>(id: string, params: UpdateRoleParams) =>
      request<T>({
        path: `/role/${encodePathSegment(id)}/update`,
        method: "post",
        body: params,
      }),
    remove: <T = boolean>(id: string) =>
      request<T>({
        path: withPostDeleteAction(`/role/${encodePathSegment(id)}`),
        method: "post",
      }),
    get: <T = unknown>(id: string) =>
      request<T>({
        path: `/role/${encodePathSegment(id)}`,
        method: "get",
      }),
    list: <T = unknown>(params?: RoleListParams) =>
      request<T>({
        path: "/role/",
        method: "get",
        query: withDefaultAppType(context, params) as
          | Record<string, unknown>
          | undefined,
      }),
    listUsers: <T = unknown>(roleId: string, params?: RoleUsersParams) =>
      request<T>({
        path: `/role/${encodePathSegment(roleId)}/users`,
        method: "get",
        query: params as Record<string, unknown> | undefined,
      }),
    assignRoles: <T = unknown>(params: AssignRolesParams) =>
      request<T>({
        path: "/role/assign",
        method: "post",
        body: params,
      }),
    addUserRole: <T = boolean>(params: { userId: string; roleId: string }) =>
      request<T>({
        path: "/role/add",
        method: "post",
        body: params,
      }),
    removeUserRole: <T = boolean>(params: { userId: string; roleId: string }) =>
      request<T>({
        path: "/role/remove",
        method: "post",
        body: params,
      }),
    batchAddUsers: <T = unknown>(params: BatchAddUsersToRoleParams) =>
      request<T>({
        path: "/role/batch-add-users",
        method: "post",
        body: params,
      }),
    getMyRoles: <T = unknown>(params?: GetUserRolesParams) =>
      request<T>({
        path: "/role/my/roles",
        method: "get",
        query: withDefaultAppType(context, params) as
          | Record<string, unknown>
          | undefined,
      }),
    getCurrentRole: <T = unknown>(params?: GetUserRolesParams) =>
      request<T>({
        path: "/role/my/current",
        method: "get",
        query: withDefaultAppType(context, params) as
          | Record<string, unknown>
          | undefined,
      }),
    switchPlatformRole: <T = boolean>(params: SwitchPlatformRoleParams) =>
      request<T>({
        path: "/role/switch/platform",
        method: "post",
        body: params,
      }),
    switchAppRole: <T = boolean>(params: SwitchAppRoleParams) =>
      request<T>({
        path: "/role/switch/app",
        method: "post",
        body: {
          ...params,
          appType: resolveAppType(context, params.appType),
        },
      }),
  }

  const permission = {
    formGroup: {
      create: <T = FormPermissionGroup>(params: CreateFormPermissionGroupDto) =>
        request<T>({
          path: "/permission/form-group/",
          method: "post",
          body: {
            ...params,
            appType: resolveAppType(context, params.appType),
          },
        }),
      update: <T = FormPermissionGroup>(
        id: string,
        params: UpdateFormPermissionGroupDto,
      ) =>
        request<T>({
          path: `/permission/form-group/${encodePathSegment(id)}`,
          method: "post",
          body: {
            ...params,
            ...(params.appType
              ? { appType: resolveAppType(context, params.appType) }
              : {}),
          },
        }),
      remove: <T = boolean>(id: string) =>
        request<T>({
          path: withPostDeleteAction(
            `/permission/form-group/${encodePathSegment(id)}`,
          ),
          method: "post",
        }),
      get: <T = FormPermissionGroup | null>(id: string) =>
        request<T>({
          path: `/permission/form-group/${encodePathSegment(id)}`,
          method: "get",
        }),
      list: <T = PageOffsetListResult<FormPermissionGroup>>(
        params?: QueryFormPermissionGroupDto,
      ) =>
        request<T>({
          path: "/permission/form-group/",
          method: "get",
          query: {
            ...params,
            appType: resolveAppType(context, params?.appType),
          },
        }),
      getViewFieldPermissions: <
        T = Record<string, ViewFieldPermissionValue>,
      >(params: {
        appType?: string
        formUuid: string
      }) =>
        request<T>({
          path: "/permission/form-group/field-permissions",
          method: "get",
          query: {
            appType: resolveAppType(context, params.appType),
            formUuid: params.formUuid,
          },
        }),
      getViewPermissionSummary: <T = ViewPermissionSummary>(params: {
        appType?: string
        formUuid: string
      }) =>
        request<T>({
          path: "/permission/form-group/view-permissions",
          method: "get",
          query: {
            appType: resolveAppType(context, params.appType),
            formUuid: params.formUuid,
          },
        }),
    },
    pageGroup: {
      create: <T = PagePermissionGroup>(params: CreatePagePermissionGroupDto) =>
        request<T>({
          path: "/permission/page-group/",
          method: "post",
          body: {
            ...params,
            appType: resolveAppType(context, params.appType),
          },
        }),
      update: <T = PagePermissionGroup>(
        id: string,
        params: UpdatePagePermissionGroupDto,
      ) =>
        request<T>({
          path: `/permission/page-group/${encodePathSegment(id)}`,
          method: "post",
          body: {
            ...params,
            ...(params.appType
              ? { appType: resolveAppType(context, params.appType) }
              : {}),
          },
        }),
      remove: <T = boolean>(id: string) =>
        request<T>({
          path: withPostDeleteAction(
            `/permission/page-group/${encodePathSegment(id)}`,
          ),
          method: "post",
        }),
      get: <T = PagePermissionGroup | null>(id: string) =>
        request<T>({
          path: `/permission/page-group/${encodePathSegment(id)}`,
          method: "get",
        }),
      list: <T = PageOffsetListResult<PagePermissionGroup>>(
        params?: QueryPagePermissionGroupDto,
      ) =>
        request<T>({
          path: "/permission/page-group/",
          method: "get",
          query: {
            ...params,
            appType: resolveAppType(context, params?.appType),
          },
        }),
      getUserMenuPermissions: <T = UserMenuPermissionsResponse>(
        appType?: string,
      ) =>
        request<T>({
          path: "/permission/page-group/user-menu-permissions",
          method: "get",
          query: {
            appType: resolveAppType(context, appType),
          },
        }),
    },
    api: {
      create: <T = unknown>(params: CreateApiPermissionParams) =>
        request<T>({
          path: "/permission/api",
          method: "post",
          body: params,
        }),
      update: <T = unknown>(id: string, params: UpdateApiPermissionParams) =>
        request<T>({
          path: `/permission/api/${encodePathSegment(id)}/update`,
          method: "post",
          body: params,
        }),
      remove: <T = boolean>(id: string) =>
        request<T>({
          path: withPostDeleteAction(`/permission/api/${encodePathSegment(id)}`),
          method: "post",
        }),
      list: <T = unknown>(params?: ApiPermissionListParams) =>
        request<T>({
          path: "/permission/api",
          method: "get",
          query: withDefaultAppType(context, params) as
            | Record<string, unknown>
            | undefined,
        }),
      assign: <T = boolean>(params: AssignPermissionsParams) =>
        request<T>({
          path: "/permission/api/assign",
          method: "post",
          body: params,
        }),
      getByRole: <T = unknown>(roleId: string) =>
        request<T>({
          path: `/permission/api/role/${encodePathSegment(roleId)}`,
          method: "get",
        }),
      getRolesByPermission: <T = unknown>(permissionId: string) =>
        request<T>({
          path: `/permission/api/${encodePathSegment(permissionId)}/roles`,
          method: "get",
        }),
    },
    ui: {
      create: <T = unknown>(params: CreateUiPermissionParams) =>
        request<T>({
          path: "/permission/api/ui",
          method: "post",
          body: params,
        }),
      update: <T = unknown>(id: string, params: UpdateUiPermissionParams) =>
        request<T>({
          path: `/permission/api/ui/${encodePathSegment(id)}/update`,
          method: "post",
          body: params,
        }),
      remove: <T = boolean>(id: string) =>
        request<T>({
          path: withPostDeleteAction(
            `/permission/api/ui/${encodePathSegment(id)}`,
          ),
          method: "post",
        }),
      list: <T = unknown>(params?: UiPermissionListParams) =>
        request<T>({
          path: "/permission/api/ui",
          method: "get",
          query: withDefaultAppType(context, params) as
            | Record<string, unknown>
            | undefined,
        }),
      assign: <T = boolean>(params: AssignPermissionsParams) =>
        request<T>({
          path: "/permission/api/ui/assign",
          method: "post",
          body: params,
        }),
      getMyPlatform: <T = unknown>() =>
        request<T>({
          path: "/permission/api/ui/me/platform",
          method: "get",
        }),
      getMyApp: <T = unknown>(appType?: string) =>
        request<T>({
          path: "/permission/api/ui/me/app",
          method: "get",
          query: {
            appType: resolveAppType(context, appType),
          },
        }),
    },
  }

  const process = {
    getInstance: <T = unknown>(params: GetProcessInstanceParams) =>
      request<T>({
        path: buildAppPath(context, params.appType, "/v1/process/instance"),
        method: "get",
        query: {
          instanceId: params.instanceId,
        },
      }),
    terminateInstance: <T = unknown>(params: TerminateProcessInstanceParams) =>
      request<T>({
        path: buildAppPath(
          context,
          params.appType,
          "/v1/process/terminateInstance.json",
        ),
        method: "post",
        body: {
          processInstanceId: params.processInstanceId,
          reason: params.reason,
        },
      }),
    approveTask: <T = unknown>(params: ApproveTaskParams) =>
      request<T>({
        path: buildAppPath(
          context,
          params.appType,
          "/v1/process/approveTask.json",
        ),
        method: "post",
        body: {
          ...params,
          appType: resolveAppType(context, params.appType),
        },
      }),
    triggerCallbackTask: <T = unknown>(params: TriggerCallbackTaskParams) =>
      request<T>({
        path: buildAppPath(
          context,
          params.appType,
          "/v1/process/triggerCallback.json",
        ),
        method: "post",
        body: {
          taskId: params.taskId,
          payload: params.payload,
        },
      }),
    getBasic: <T = unknown>(params: ProcessInstanceLookupParams) =>
      request<T>({
        path: `/workflow/instance/${encodePathSegment(
          resolveFormInstanceId(params),
        )}/basic`,
        method: "get",
      }),
    getProgress: <T = unknown>(params: ProcessInstanceLookupParams) =>
      request<T>({
        path: `/workflow/instance/${encodePathSegment(
          resolveFormInstanceId(params),
        )}/all-tasks`,
        method: "get",
      }),
    getPermission: <T = unknown>(params: ProcessInstanceLookupParams) =>
      request<T>({
        path: `/workflow/instance/${encodePathSegment(
          resolveFormInstanceId(params),
        )}/permission`,
        method: "get",
      }),
    resolveCapabilities: <T = unknown>(
      params: ResolveProcessCapabilitiesParams,
    ) =>
      request<T>({
        path: "/workflow/capabilities/resolve",
        method: "post",
        body: {
          ...params,
          appType: params.appType
            ? resolveAppType(context, params.appType)
            : context.app.appType,
        },
      }),
    startFromExistingInstance: <T = unknown>(
      params: WorkflowStartFromExistingInstanceParams,
    ) =>
      request<T>({
        path: "/workflow/start-from-form-instance",
        method: "post",
        body: {
          ...params,
          appType: params.appType
            ? resolveAppType(context, params.appType)
            : context.app.appType,
          formInstId: params.formInstId || params.formInstanceId,
          initiatorSelectedApprovers:
            params.initiatorSelectedApprovers || params.selectedApprovers,
        },
      }),
    approve: <T = unknown>(params: WorkflowApproveParams) =>
      request<T>({
        path: "/workflow/approve",
        method: "post",
        body: {
          ...params,
          action: params.action || "approved",
          appType: params.appType
            ? resolveAppType(context, params.appType)
            : context.app.appType,
        },
      }),
    reject: <T = unknown>(params: WorkflowApproveParams) =>
      request<T>({
        path: "/workflow/approve",
        method: "post",
        body: {
          ...params,
          action: "rejected",
          appType: params.appType
            ? resolveAppType(context, params.appType)
            : context.app.appType,
        },
      }),
    transferTask: <T = unknown>(params: WorkflowTransferParams) =>
      request<T>({
        path: `/workflow/task/${encodePathSegment(params.taskId)}/transfer`,
        method: "post",
        body: {
          newAssignee: params.newAssignee,
          reason: params.reason,
        },
      }),
    adminTransferTask: <T = unknown>(params: WorkflowTransferParams) =>
      request<T>({
        path: `/workflow/task/${encodePathSegment(params.taskId)}/admin-transfer`,
        method: "post",
        body: {
          newAssignee: params.newAssignee,
          reason: params.reason,
        },
      }),
    returnTask: <T = unknown>(params: WorkflowReturnParams) =>
      request<T>({
        path: `/workflow/task/${encodePathSegment(params.taskId)}/return`,
        method: "post",
        body: {
          targetNodeId: params.targetNodeId,
          reason: params.reason,
        },
      }),
    withdraw: <T = unknown>(params: WorkflowWithdrawParams) =>
      request<T>({
        path: `/workflow/instance/${encodePathSegment(
          params.instanceId,
        )}/withdraw`,
        method: "post",
        body: {
          reason: params.reason,
        },
      }),
    retryException: <T = unknown>(params: { instanceId: string }) =>
      request<T>({
        path: `/workflow/instance/${encodePathSegment(
          params.instanceId,
        )}/retry-exception`,
        method: "post",
      }),
    saveTask: <T = unknown>(params: WorkflowSaveTaskParams) =>
      request<T>({
        path: "/workflow/task/save",
        method: "post",
        body: {
          ...params,
          appType: params.appType
            ? resolveAppType(context, params.appType)
            : context.app.appType,
        },
      }),
    resubmitTask: <T = unknown>(params: WorkflowResubmitParams) =>
      request<T>({
        path: `/workflow/task/${encodePathSegment(params.taskId)}/resubmit`,
        method: "post",
        body: {
          formUuid: params.formUuid,
          appType: params.appType
            ? resolveAppType(context, params.appType)
            : context.app.appType,
          updateFormDataJson: params.updateFormDataJson,
          comments: params.comments,
          selectedApprovers: params.selectedApprovers,
          initiatorSelectedApprovers:
            params.initiatorSelectedApprovers || params.selectedApprovers,
        },
      }),
    getReturnableNodes: <T = unknown>(params: WorkflowTaskParams) =>
      request<T>({
        path: `/workflow/task/${encodePathSegment(
          params.taskId,
        )}/returnable-nodes`,
        method: "get",
      }),
    preview: <T = unknown>(params: WorkflowPreviewParams) =>
      request<T>({
        path: "/workflow/preview",
        method: "post",
        body: {
          ...params,
          appType: params.appType
            ? resolveAppType(context, params.appType)
            : context.app.appType,
          selectedApprovers: params.selectedApprovers,
          initiatorSelectedApprovers:
            params.initiatorSelectedApprovers || params.selectedApprovers,
        },
      }),
    getDefinitionByForm: <T = unknown>(params: WorkflowDefinitionByFormParams) =>
      request<T>({
        path: "/workflow/definition/form",
        method: "get",
        query: {
          formUuid: params.formUuid,
          appType: params.appType
            ? resolveAppType(context, params.appType)
            : context.app.appType,
          id: params.id,
        },
      }),
    getInitiatorSelectRequirements: <T = unknown>(
      params: WorkflowInitiatorSelectRequirementsParams,
    ) =>
      request<T>({
        path: "/workflow/initiator-approver/requirements",
        method: "post",
        body: {
          ...params,
          appType: params.appType
            ? resolveAppType(context, params.appType)
            : context.app.appType,
        },
      }),
    getResubmitInitiatorSelectRequirements: <T = unknown>(
      params: WorkflowResubmitInitiatorSelectRequirementsParams,
    ) =>
      request<T>({
        path: `/workflow/task/${encodePathSegment(
          params.taskId,
        )}/resubmit/initiator-approver/requirements`,
        method: "post",
        body: {
          formUuid: params.formUuid,
          appType: params.appType
            ? resolveAppType(context, params.appType)
            : context.app.appType,
          data: params.data,
          submissionDepartmentId: params.submissionDepartmentId,
        },
      }),
    getInitiatorSelectCandidates: <T = unknown>(
      params: WorkflowInitiatorSelectCandidatesParams,
    ) =>
      request<T>({
        path: "/workflow/initiator-select/candidates",
        method: "get",
        query: {
          ...params,
          appType: params.appType
            ? resolveAppType(context, params.appType)
            : context.app.appType,
        },
      }),
    triggerCallback: <T = unknown>(params: TriggerCallbackTaskParams) =>
      request<T>({
        path: `/workflow/task/${encodePathSegment(params.taskId)}/callback`,
        method: "post",
        body:
          params.payload === undefined
            ? {}
            : params.payload && typeof params.payload === "object"
            ? params.payload
            : { payload: params.payload },
      }),
  }

  const dataView = {
    query: <T = unknown>(code: string, params: DataViewQueryParams = {}) => {
      const dataViewCode = String(code || "").trim()
      if (!dataViewCode) {
        throw new Error("数据视图 code 不能为空")
      }
      return request<DataViewQueryResult<T>>({
        path: buildAppPath(
          context,
          params.appType,
          `/v1/data-views/${encodePathSegment(dataViewCode)}/query.json`,
        ),
        method: "post",
        body: {
          fields: params.fields,
          filters: serializeSearchExpression(params.filters),
          conditionType: params.conditionType,
          searchKeyWord: params.searchKeyWord,
          currentPage: params.currentPage,
          pageSize: params.pageSize,
          order: Array.isArray(params.order)
            ? params.order
            : params.order
              ? [params.order]
              : undefined,
        },
      })
    },
    stats: <T = unknown>(code: string, params: DataViewStatsParams = {}) => {
      const dataViewCode = String(code || "").trim()
      if (!dataViewCode) {
        throw new Error("数据视图 code 不能为空")
      }
      return request<DataViewQueryResult<T>>({
        path: buildAppPath(
          context,
          params.appType,
          `/v1/data-views/${encodePathSegment(dataViewCode)}/stats.json`,
        ),
        method: "post",
        body: {
          fields: params.fields,
          filters: serializeSearchExpression(params.filters),
          having: serializeSearchExpression(params.having),
          conditionType: params.conditionType,
          searchKeyWord: params.searchKeyWord,
          currentPage: params.currentPage,
          pageSize: params.pageSize,
          order: Array.isArray(params.order)
            ? params.order
            : params.order
              ? [params.order]
              : undefined,
        },
      })
    },
  }

  const appFunction = {
    invoke: <TResult = unknown, TInput = unknown>(
      code: string,
      params: FunctionInvokeParams<TInput> = {},
    ) => {
      const functionCode = String(code || "").trim()
      if (!functionCode) {
        throw new Error("应用函数 code 不能为空")
      }
      return request<FunctionInvokeResult<TResult>>({
        path: buildAppPath(
          context,
          params.appType,
          `/v1/functions/${encodePathSegment(functionCode)}/invoke.json`,
        ),
        method: "post",
        body: {
          input: params.input,
        },
      })
    },
  }

  const structuredExport = {
    create: (params: StructuredExportCreateParams) =>
      request<StructuredExportTask>({
        path: buildOpenXiangdaAppPath(
          context,
          params.appType,
          "/exports",
        ),
        method: "post",
        body: {
          ...params,
          appType: undefined,
          protocol: "structured_export_v1",
        },
      }),
    get: (
      taskId: string,
      params: StructuredExportGetParams = {},
    ) => {
      const normalizedTaskId = String(taskId || "").trim()
      if (!normalizedTaskId) {
        throw new Error("导出任务 ID 不能为空")
      }
      return request<StructuredExportTask>({
        path: buildOpenXiangdaAppPath(
          context,
          params.appType,
          `/exports/${encodePathSegment(normalizedTaskId)}`,
        ),
        method: "get",
      })
    },
  }

  const notification = {
    sendByType: <T = SendNotificationResult>(
      params: SendNotificationByTypeParams,
    ) =>
      request<T>({
        path: buildOpenXiangdaAppPath(
          context,
          params.appType,
          "/notifications/send-by-type",
        ),
        method: "post",
        body: {
          ...params,
          appType: resolveAppType(context, params.appType),
        },
      }),
    batchSendByType: <T = SendNotificationResult>(
      params: BatchSendNotificationByTypeParams,
    ) =>
      request<T>({
        path: buildOpenXiangdaAppPath(
          context,
          params.appType,
          "/notifications/batch-send-by-type",
        ),
        method: "post",
        body: {
          ...params,
          appType: resolveAppType(context, params.appType),
        },
      }),
    findConfig: <T = unknown>(
      notificationType: string,
      params: { appType?: string; formUuid?: string } = {},
    ) =>
      request<T>({
        path: buildOpenXiangdaAppPath(
          context,
          params.appType,
          `/notifications/type-configs/${encodePathSegment(notificationType)}`,
        ),
        method: "get",
        query: params.formUuid ? { formUuid: params.formUuid } : undefined,
      }),
    previewTemplate: <T = unknown>(params: PreviewNotificationTemplateParams) =>
      request<T>({
        path: buildOpenXiangdaAppPath(
          context,
          params.appType,
          "/notifications/templates/preview",
        ),
        method: "post",
        body: {
          ...params,
          appType: resolveAppType(context, params.appType),
        },
      }),
    previewDingTalk: <T = unknown>(params: PreviewDingTalkNotificationParams) =>
      request<T>({
        path: buildOpenXiangdaAppPath(
          context,
          params.appType,
          "/notifications/dingtalk/preview",
        ),
        method: "post",
        body: {
          ...params,
          appType: resolveAppType(context, params.appType),
        },
      }),
    sendDingTalk: <T = SendNotificationResult>(
      params: SendNotificationByTypeParams,
    ) =>
      request<T>({
        path: buildOpenXiangdaAppPath(
          context,
          params.appType,
          "/notifications/dingtalk/send",
        ),
        method: "post",
        body: {
          ...params,
          appType: resolveAppType(context, params.appType),
        },
      }),
    capabilities: <T = unknown>(params: { appType?: string } = {}) =>
      request<T>({
        path: buildOpenXiangdaAppPath(
          context,
          params.appType,
          "/notifications/dingtalk/capabilities",
        ),
        method: "get",
      }),
    listInbox: <T = NotificationInboxListResult>(
      params: ListNotificationInboxParams = {},
    ) =>
      request<T>({
        path: buildOpenXiangdaAppPath(
          context,
          params.appType,
          "/notifications/inbox",
        ),
        method: "get",
        query: {
          page: params.page,
          limit: params.limit,
          readStatus: params.readStatus,
          keyword: params.keyword,
          templateCode: params.templateCode,
        },
      }),
    getUnreadCount: <T = NotificationUnreadCountResult>(
      params: { appType?: string } = {},
    ) =>
      request<T>({
        path: buildOpenXiangdaAppPath(
          context,
          params.appType,
          "/notifications/inbox/unread-count",
        ),
        method: "get",
      }),
    markRead: <T = NotificationInboxMessage>(
      messageId: string,
      params: { appType?: string } = {},
    ) =>
      request<T>({
        path: buildOpenXiangdaAppPath(
          context,
          params.appType,
          `/notifications/inbox/${encodePathSegment(messageId)}/read`,
        ),
        method: "post",
      }),
    markAllRead: <T = MarkAllNotificationReadResult>(
      params: { appType?: string } = {},
    ) =>
      request<T>({
        path: buildOpenXiangdaAppPath(
          context,
          params.appType,
          "/notifications/inbox/read-all",
        ),
        method: "post",
      }),
  }

  const workCenter = {
    listItems: <T = WorkCenterItem>(params: ListWorkCenterItemsParams) =>
      request<WorkCenterListResult<T>>({
        path: "/work-center/items",
        method: "get",
        query: {
          ...params,
          appType: resolveAppType(context, params.appType),
        },
      }),
    getStats: <T = WorkCenterStats>(params: WorkCenterStatsParams = {}) =>
      request<T>({
        path: "/work-center/stats",
        method: "get",
        query: {
          ...params,
          appType: resolveAppType(context, params.appType),
        },
      }),
  }

  const loginLog = {
    list: <T = PageOffsetListResult<LoginLogRecord>>(
      params: LoginLogListParams = {},
    ) =>
      request<T>({
        path: "/login-log",
        method: "get",
        query: {
          ...params,
          appType: resolveAppType(context, params.appType),
        },
      }),
    get: <T = LoginLogRecord | null>(
      id: string,
      params: LoginLogGetParams = {},
    ) => {
      const logId = String(id || "").trim()
      if (!logId) {
        throw new Error("登录日志 id 不能为空")
      }
      return request<T>({
        path: `/login-log/${encodePathSegment(logId)}`,
        method: "get",
        query: {
          appType: resolveAppType(context, params.appType),
          includeSensitive: params.includeSensitive,
        },
      })
    },
    stats: <T = LoginLogStats>(params: LoginLogStatsParams = {}) =>
      request<T>({
        path: "/login-log/stats",
        method: "get",
        query: {
          appType: resolveAppType(context, params.appType),
          startAt: params.startAt,
          endAt: params.endAt,
        },
      }),
  }

  const sdk: PageSdk = {
    context,
    request,
    download,
    createFileAccessTicket,
    export: structuredExport,
    transport: {
      request,
      download,
    },
    auth,
    connector,
    form,
    user,
    department,
    organization,
    role,
    permission,
    process,
    notification,
    workCenter,
    loginLog,
    dataView,
    function: appFunction,
    dataSource: {
      run: async <TResult = unknown, TRaw = TResult>(
        name: string,
        params: Record<string, unknown> = {},
      ): Promise<PageApiResponse<TResult, TRaw>> => {
        const descriptor = (context.page.dataSources || []).find(
          (item) => item.key === name,
        ) as PageDataSourceDescriptor | undefined

        if (!descriptor) {
          throw new Error(`未找到数据源: ${String(name || "")}`)
        }

        const runtimeParams = params
        const resolvedFormUuid = String(
          runtimeParams.formUuid || descriptor.formUuid || "",
        ).trim()

        switch (descriptor.type) {
          case "dataView.query":
          case "dataView.stats": {
            const dataViewCode = String(
              runtimeParams.code ||
                runtimeParams.dataViewCode ||
                descriptor.code ||
                descriptor.dataViewCode ||
                descriptor.viewCode ||
                descriptor.key ||
                "",
            ).trim()
            const queryParams = {
              ...(descriptor.params && typeof descriptor.params === "object"
                ? (descriptor.params as Record<string, unknown>)
                : {}),
              ...runtimeParams,
              fields: runtimeParams.fields || descriptor.fields,
              filters: mergeSearchExpressions(
                descriptor.defaultFilter,
                runtimeParams.filters as SearchExpression | string | undefined,
              ),
              having: mergeSearchExpressions(
                descriptor.defaultHaving || descriptor.having,
                runtimeParams.having as SearchExpression | string | undefined,
              ),
            } as unknown as DataViewStatsParams
            delete (queryParams as Record<string, unknown>).code
            delete (queryParams as Record<string, unknown>).dataViewCode
            delete (queryParams as Record<string, unknown>).viewCode
            if (descriptor.type === "dataView.stats") {
              return dataView.stats<TResult>(
                dataViewCode,
                queryParams,
              ) as unknown as Promise<PageApiResponse<TResult, TRaw>>
            }
            delete (queryParams as Record<string, unknown>).having
            return dataView.query<TResult>(
              dataViewCode,
              queryParams,
            ) as unknown as Promise<PageApiResponse<TResult, TRaw>>
          }
          case "form.list":
            return form.advancedSearch<TResult>({
              ...(runtimeParams as unknown as Omit<
                FormAdvancedSearchParams,
                "formUuid"
              >),
              formUuid: resolvedFormUuid,
              filters: mergeSearchExpressions(
                descriptor.defaultFilter,
                runtimeParams.filters as SearchExpression | string | undefined,
              ),
            }) as unknown as Promise<PageApiResponse<TResult, TRaw>>
          case "form.detail":
            return form.getDetail<TResult>({
              ...(runtimeParams as unknown as Omit<
                FormGetDetailParams,
                "formUuid"
              >),
              formUuid: resolvedFormUuid,
            }) as unknown as Promise<PageApiResponse<TResult, TRaw>>
          case "form.create":
            return form.create<TResult>({
              ...(runtimeParams as unknown as Omit<
                FormCreateParams,
                "formUuid"
              >),
              formUuid: resolvedFormUuid,
            }) as unknown as Promise<PageApiResponse<TResult, TRaw>>
          case "form.update":
            return form.update<TResult>({
              ...(runtimeParams as unknown as Omit<
                FormUpdateParams,
                "formUuid"
              >),
              formUuid: resolvedFormUuid,
            }) as unknown as Promise<PageApiResponse<TResult, TRaw>>
          case "form.delete":
            return form.remove<TResult>({
              ...(runtimeParams as unknown as Omit<
                FormRemoveParams,
                "formUuid"
              >),
              formUuid: resolvedFormUuid,
            }) as unknown as Promise<PageApiResponse<TResult, TRaw>>
          default:
            throw new Error(`暂不支持的数据源类型: ${String(descriptor.type)}`)
        }
      },
    },
    navigation: context.navigation,
    ui: context.ui,
  }

  return sdk
}
