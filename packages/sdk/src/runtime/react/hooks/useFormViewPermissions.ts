import { useCallback, useEffect, useMemo, useState } from "react"

import { usePageSdk } from "./usePageSdk"

import type {
  PageApiResponse,
  ViewFieldPermissionValue,
  ViewOperationPermission,
  ViewPermissionSummary,
} from "../../core/types"

export interface UseFormViewPermissionsOptions {
  appType?: string
  immediate?: boolean
}

export interface UseFormViewPermissionsState {
  summary: ViewPermissionSummary
  response: PageApiResponse<ViewPermissionSummary> | null
  loading: boolean
  error: Error | null
  refresh: () => Promise<PageApiResponse<ViewPermissionSummary> | null>
  can: (operation: ViewOperationPermission) => boolean
  getFieldPermission: (fieldName: string) => ViewFieldPermissionValue | null
}

const EMPTY_SUMMARY: ViewPermissionSummary = {
  fieldPermissions: {},
  operations: [],
  actions: [],
}

const normalizeSummary = (summary?: ViewPermissionSummary): ViewPermissionSummary => {
  const actions = Array.from(
    new Set([...(summary?.actions || []), ...(summary?.operations || [])]),
  ) as ViewOperationPermission[]
  const can = actions.reduce(
    (result, operation) => {
      result[operation] = Boolean(summary?.can?.[operation] ?? true)
      return result
    },
    {} as Record<ViewOperationPermission, boolean>,
  )
  return {
    ...summary,
    fieldPermissions: summary?.fieldPermissions || {},
    operations: actions,
    actions,
    can,
  }
}

const toError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return new Error(error.message)
  }
  return new Error(String(error || "获取查看态权限失败"))
}

export const useFormViewPermissions = (
  formUuid: string,
  options: UseFormViewPermissionsOptions = {},
): UseFormViewPermissionsState => {
  const sdk = usePageSdk()
  const [summary, setSummary] = useState<ViewPermissionSummary>(EMPTY_SUMMARY)
  const [response, setResponse] =
    useState<PageApiResponse<ViewPermissionSummary> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const immediate = options.immediate ?? true

  const refresh = useCallback(async () => {
    const normalizedFormUuid = String(formUuid || "").trim()
    if (!normalizedFormUuid) {
      setSummary(EMPTY_SUMMARY)
      setResponse(null)
      return null
    }

    setLoading(true)
    setError(null)

    try {
      const nextResponse =
        await sdk.permission.formGroup.getViewPermissionSummary({
          appType: options.appType,
          formUuid: normalizedFormUuid,
        })
      const nextSummary = nextResponse.result || EMPTY_SUMMARY
      setResponse(nextResponse)
      setSummary(normalizeSummary(nextSummary))
      return nextResponse
    } catch (requestError) {
      const nextError = toError(requestError)
      setError(nextError)
      setResponse(null)
      setSummary(EMPTY_SUMMARY)
      return null
    } finally {
      setLoading(false)
    }
  }, [formUuid, options.appType, sdk])

  useEffect(() => {
    if (!immediate) {
      return
    }
    void refresh()
  }, [immediate, refresh])

  const operationSet = useMemo(
    () => new Set(summary.actions || summary.operations),
    [summary.actions, summary.operations],
  )

  const can = useCallback(
    (operation: ViewOperationPermission) =>
      Boolean(summary.can?.[operation] ?? operationSet.has(operation)),
    [operationSet, summary.can],
  )

  const getFieldPermission = useCallback(
    (fieldName: string) => summary.fieldPermissions[fieldName] || null,
    [summary.fieldPermissions],
  )

  return {
    summary,
    response,
    loading,
    error,
    refresh,
    can,
    getFieldPermission,
  }
}
