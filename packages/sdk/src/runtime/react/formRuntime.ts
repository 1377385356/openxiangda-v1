import { useMemo } from "react"

import { createFormRuntimeApi } from "../../components/core/runtimeApi"
import { usePageSdk } from "./hooks/usePageSdk"
import { useOpenXiangda } from "./openxiangdaProvider"

import type {
  FormRuntimeApi,
  RuntimeAuthHeadersProvider,
  RuntimeRequestConfig,
  RuntimeResponse,
} from "../../components/types"
import type {
  PageApiResponse,
  PageHttpMethod,
  PageRequestOptions,
  PageSdk,
} from "../core/types"

const normalizeMethod = (method?: string): PageHttpMethod => {
  const value = String(method || "get").toLowerCase()
  return ["get", "post", "put", "delete", "patch"].includes(value)
    ? (value as PageHttpMethod)
    : "get"
}

const normalizeHeaders = (headers?: HeadersInit) => {
  if (!headers) return undefined
  return Object.fromEntries(new Headers(headers).entries())
}

const toPageRequest = (config: RuntimeRequestConfig): PageRequestOptions => ({
  path: config.url,
  method: normalizeMethod(config.method),
  query: config.params,
  body: config.data,
  headers: normalizeHeaders(config.headers),
})

const toRuntimeResponse = <T,>(response: PageApiResponse<T>): RuntimeResponse<T> => {
  if (response.raw && typeof response.raw === "object") {
    return response.raw as RuntimeResponse<T>
  }
  return {
    code: Number(response.code) || 200,
    success: response.success,
    message: response.message,
    data: response.result as T,
    result: response.result as T,
  }
}

const unwrapPageResult = <T,>(response: PageApiResponse<T>): T | null =>
  response.result ?? (response.data as T | undefined) ?? null

const FILE_URL_KEYS = [
  "url",
  "downloadUrl",
  "publicUrl",
  "relayUrl",
  "previewUrl",
  "metadataUrl",
  "officeTextPreviewUrl",
] as const

const resolveServicePrefix = (sdk: PageSdk) => {
  const value = sdk.context?.env?.servicePrefix
  return typeof value === "string" && value.trim()
    ? value.trim().replace(/\/+$/, "")
    : "/service"
}

const normalizeServiceFileUrl = (value: unknown, servicePrefix: string) => {
  if (typeof value !== "string" || !value) return value
  if (/^(https?:)?\/\//i.test(value) || /^(blob|data):/i.test(value)) return value
  if (value === servicePrefix || value.startsWith(`${servicePrefix}/`)) return value
  return value.startsWith("/file/") ? `${servicePrefix}${value}` : value
}

const normalizeFileTicketResult = <T,>(payload: T, servicePrefix: string): T => {
  if (typeof payload === "string") {
    return normalizeServiceFileUrl(payload, servicePrefix) as T
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload

  const normalized = { ...payload } as Record<string, unknown>
  FILE_URL_KEYS.forEach((key) => {
    normalized[key] = normalizeServiceFileUrl(normalized[key], servicePrefix)
  })
  return normalized as T
}

/**
 * Adapts PageSdk to the form component runtime, including binary Blob requests.
 * Use this instead of implementing FormEngineConfig.api.request in application code.
 */
export const createPageFormRuntimeApi = (
  sdk: PageSdk,
  options: { getAuthHeaders?: RuntimeAuthHeadersProvider } = {},
): FormRuntimeApi => {
  const servicePrefix = resolveServicePrefix(sdk)
  const request: FormRuntimeApi["request"] = async <T,>(
    config: RuntimeRequestConfig,
  ) => {
    const options = toPageRequest(config)
    if (config.responseType === "blob") {
      const response = await sdk.transport.download(options)
      return response.blob
    }
    return toRuntimeResponse(await sdk.transport.request<T>(options))
  }

  return createFormRuntimeApi({
    baseUrl: servicePrefix,
    request,
    getAuthHeaders: options.getAuthHeaders,
    createFileAccessTicket: async (
      bucketName,
      objectName,
      fileName,
      purpose = "preview",
      options = {},
    ) =>
      normalizeFileTicketResult(
        unwrapPageResult(
          await sdk.createFileAccessTicket(
            bucketName,
            objectName,
            fileName,
            purpose,
            options,
          ),
        ),
        servicePrefix,
      ),
    createDownloadTicket: async (bucketName, objectName, fileName) =>
      normalizeFileTicketResult(
        unwrapPageResult(
          await sdk.request({
            path: "/file/download-ticket",
            method: "post",
            body: { bucketName, objectName, fileName },
          }),
        ),
        servicePrefix,
      ),
  })
}

/** Returns the current PageSdk as a complete FormRuntimeApi for FormProvider. */
export const usePageFormRuntimeApi = (): FormRuntimeApi => {
  const sdk = usePageSdk()
  const { getAuthHeaders } = useOpenXiangda()
  return useMemo(
    () => createPageFormRuntimeApi(sdk, { getAuthHeaders }),
    [getAuthHeaders, sdk],
  )
}
