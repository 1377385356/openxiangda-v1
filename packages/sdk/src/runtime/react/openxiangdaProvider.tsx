import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { createBrowserPageContext } from "../host/browserHost"
import { createBoundFetch } from "../core/fetch"
import { PageProvider } from "./provider"

import type {
  PageContext,
  PageInfo,
  PageMessageApi,
  PageModalApi,
  PageNavigationApi,
  PageQueryValue,
  PageRouteInfo,
} from "../core/types"

export type RuntimeErrorType =
  | "unauthenticated"
  | "forbidden"
  | "network"
  | "unknown"

export type RuntimeRequestError = Error & {
  type?: RuntimeErrorType
  status?: number
  code?: number | string
  payload?: unknown
}

export interface RuntimeErrorSnapshot {
  type: RuntimeErrorType
  status?: number
  code?: number | string
  message: string
  payload?: unknown
}

export class RuntimeHttpError extends Error {
  type: RuntimeErrorType
  status?: number
  code?: number | string
  payload?: unknown

  constructor(snapshot: RuntimeErrorSnapshot) {
    super(snapshot.message)
    this.name = "RuntimeHttpError"
    this.type = snapshot.type
    this.status = snapshot.status
    this.code = snapshot.code
    this.payload = snapshot.payload
  }
}

export interface RuntimeMenuItem {
  id: string
  name: string
  resourceCode?: string | null
  routeCode?: string | null
  path?: string | null
  type?: string
  formUuid?: string | null
  pageId?: string | null
  parentId?: string | null
  sortOrder?: number
  isHidden?: boolean
  icon?: string | null
  children?: RuntimeMenuItem[]
  [key: string]: unknown
}

export interface RuntimePagePermissions {
  appType: string
  hasFullAccess: boolean
  roleCodes: string[]
  platformRoleCodes?: string[]
  roleSource?: string
  menuFormUuids: string[]
  menuCodes: string[]
  routeCodes: string[]
  pathPatterns: string[]
}

export interface RuntimeBootstrap {
  appType: string
  app?: Record<string, unknown> | null
  user?: Record<string, unknown> | null
  runtime?: {
    mode?: "legacy" | "react-spa" | string
    settings?: Record<string, unknown>
    activeReleaseId?: string | null
    activeBuildId?: string | null
    indexUrl?: string | null
    assetBaseUrl?: string | null
  }
  permissions?: RuntimePagePermissions
  menus?: RuntimeMenuItem[]
  servicePrefix?: string
}

export interface RouteAccessResult {
  appType: string
  canAccess: boolean
  routeCode?: string
  menuCode?: string
  path?: string
  status?: number
  code?: number | string
  message?: string
  errorType?: RuntimeErrorType
  payload?: unknown
  permissions?: RuntimePagePermissions
}

export interface RuntimeRequestState<T> {
  data: T | null
  loading: boolean
  error: RuntimeRequestError | null
}

export type RuntimeAuthStatus =
  | "unknown"
  | "authenticated"
  | "refreshing"
  | "unauthenticated"

export interface RuntimeAuthState {
  status: RuntimeAuthStatus
  error?: RuntimeRequestError | null
  refreshedAt?: number
}

export interface RuntimeReloadOptions {
  accessToken?: string | null
  accessTokenOptions?: RuntimeAccessTokenOptions
}

export interface RuntimeAccessTokenOptions {
  scope?: "default" | "public"
  path?: string | null
  clearIfToken?: string
  expiresAt?: number
}

export interface OpenXiangdaProviderProps {
  appType?: string
  servicePrefix?: string
  fetchImpl?: typeof fetch
  children: React.ReactNode
}

export interface OpenXiangdaPageProviderProps {
  children: React.ReactNode
  page?: Partial<PageInfo>
  route?: Partial<PageRouteInfo>
  env?: Record<string, unknown>
  message?: Partial<PageMessageApi>
  modal?: Partial<PageModalApi>
  navigation?: Partial<PageNavigationApi>
}

interface OpenXiangdaRuntimeStore extends RuntimeRequestState<RuntimeBootstrap> {
  appType: string
  servicePrefix: string
  fetchImpl: typeof fetch
  baseFetchImpl: typeof fetch
  authState: RuntimeAuthState
  getAuthHeaders: () => HeadersInit
  reload: (options?: RuntimeReloadOptions) => Promise<void>
  setAccessToken: (
    accessToken?: string | null,
    options?: RuntimeAccessTokenOptions,
  ) => void
}

interface RuntimeAccessTokenState {
  token: string
  scope: "default" | "public"
  path?: string | null
  expiresAt?: number
}

const OpenXiangdaRuntimeContext =
  createContext<OpenXiangdaRuntimeStore | null>(null)

export const OpenXiangdaProvider: React.FC<OpenXiangdaProviderProps> = ({
  appType,
  servicePrefix = "/service",
  fetchImpl,
  children,
}) => {
  const resolvedFetch = useMemo(() => createBoundFetch(fetchImpl), [fetchImpl])
  const resolvedAppType = useMemo(
    () => appType || resolveAppTypeFromLocation(),
    [appType],
  )
  const [, setAccessTokenState] = useState<RuntimeAccessTokenState | null>(null)
  const [authState, setAuthState] = useState<RuntimeAuthState>({
    status: "unknown",
    error: null,
  })
  const accessTokenRef = useRef<RuntimeAccessTokenState | null>(null)
  const refreshRequestRef = useRef<Promise<RuntimeAccessTokenState | null> | null>(null)
  const applyAccessToken = useCallback(
    (
      nextAccessToken?: string | null,
      options: RuntimeAccessTokenOptions = {},
    ): RuntimeAccessTokenState | null => {
      if (
        !nextAccessToken &&
        options.clearIfToken &&
        accessTokenRef.current?.token !== options.clearIfToken
      ) {
        return accessTokenRef.current
      }
      const normalizedAccessToken = nextAccessToken || null
      const nextState = normalizedAccessToken
        ? {
            token: normalizedAccessToken,
            scope: options.scope || "default",
            path: options.path || null,
            expiresAt: options.expiresAt,
          }
        : null
      accessTokenRef.current = nextState
      setAccessTokenState(nextState)
      return nextState
    },
    [],
  )
  const setAccessToken = useCallback(
    (
      nextAccessToken?: string | null,
      options: RuntimeAccessTokenOptions = {},
    ) => {
      const previousState = accessTokenRef.current
      const nextState = applyAccessToken(nextAccessToken, options)
      if (nextState) {
        if (nextState.scope === "public") return
        setAuthState({
          status: "authenticated",
          error: null,
        })
      } else if (previousState?.scope !== "public") {
        setAuthState({ status: "unauthenticated", error: null })
      }
    },
    [applyAccessToken],
  )
  const markUnauthenticated = useCallback(
    (error: unknown) => {
      const runtimeError = normalizeRuntimeError(error)
      applyAccessToken(null)
      setAuthState({ status: "unauthenticated", error: runtimeError })
    },
    [applyAccessToken],
  )
  const refreshAccessToken = useCallback(async () => {
    if (!resolvedAppType) return null
    if (!refreshRequestRef.current) {
      setAuthState(prev => ({ ...prev, status: "refreshing", error: null }))
      refreshRequestRef.current = (async () => {
        const response = await resolvedFetch(
          buildServiceUrl(
            servicePrefix,
            `/openxiangda-api/v1/apps/${encodeURIComponent(
              resolvedAppType,
            )}/auth/refresh`,
          ),
          {
            method: "POST",
            credentials: "include",
            headers: {
              accept: "application/json",
              "content-type": "application/json",
            },
            body: "{}",
          },
        )
        const payload = await readJsonPayload(response)
        if (isRuntimeEnvelopeFailure(response, payload)) {
          throw createRuntimeHttpError(
            response,
            payload,
            payload?.message || `Token refresh failed: ${response.status}`,
          )
        }
        const data = unwrapRuntimePayload(payload)
        const nextAccessToken =
          getRecordString(data, "accessToken") || getRecordString(data, "token")
        if (!nextAccessToken) {
          throw createRuntimeError({
            type: "unauthenticated",
            status: response.status,
            code: getRecordValue(payload, "code") as number | string | undefined,
            message: "Token refresh response missing accessToken",
            payload,
          })
        }
        const nextState = applyAccessToken(nextAccessToken, {
          expiresAt: getRecordNumber(data, "accessTokenExpiresAt"),
        })
        setAuthState({
          status: "authenticated",
          error: null,
          refreshedAt: Date.now(),
        })
        return nextState
      })()
        .catch(error => {
          const runtimeError = normalizeRuntimeError(error)
          applyAccessToken(null)
          setAuthState({ status: "unauthenticated", error: runtimeError })
          throw runtimeError
        })
        .finally(() => {
          refreshRequestRef.current = null
        })
    }
    return refreshRequestRef.current
  }, [applyAccessToken, resolvedAppType, resolvedFetch, servicePrefix])
  const authorizedFetch = useMemo(
    () =>
      createAuthorizedFetch({
        appType: resolvedAppType,
        baseFetch: resolvedFetch,
        accessTokenRef,
        markUnauthenticated,
        refreshAccessToken,
      }),
    [markUnauthenticated, refreshAccessToken, resolvedAppType, resolvedFetch],
  )
  const getAuthHeaders = useCallback((): HeadersInit => {
    const state = accessTokenRef.current
    if (!state) return {}
    const token = resolveAccessTokenForCurrentRoute(state)
    return token ? { authorization: `Bearer ${token}` } : {}
  }, [])
  const [state, setState] = useState<RuntimeRequestState<RuntimeBootstrap>>({
    data: null,
    loading: true,
    error: null,
  })

  const reload = useCallback(async (options: RuntimeReloadOptions = {}) => {
    if (!resolvedAppType) {
      setState({
        data: null,
        loading: false,
        error: createRuntimeError({
          message: "appType 不能为空",
          type: "unknown",
        }),
      })
      return
    }
    setState(prev => ({ ...prev, loading: true, error: null }))
    const requestFetch =
      options.accessToken !== undefined
        ? createAccessTokenFetch(
            resolvedFetch,
            createAccessTokenState(
              options.accessToken || null,
              options.accessTokenOptions,
            ),
          )
        : authorizedFetch
    try {
      const response = await requestFetch(
        buildServiceUrl(
          servicePrefix,
          `/openxiangda-api/v1/apps/${encodeURIComponent(
            resolvedAppType,
          )}/runtime/bootstrap`,
        ),
        {
          credentials: "include",
          headers: { accept: "application/json" },
        },
      )
      const payload = await readJsonPayload(response)
      if (isRuntimeEnvelopeFailure(response, payload)) {
        throw createRuntimeHttpError(
          response,
          payload,
          payload?.message || `Runtime bootstrap failed: ${response.status}`,
        )
      }
      const nextData = payload?.data || null
      setState({
        data: nextData,
        loading: false,
        error: null,
      })
      if (isAuthenticatedBootstrap(nextData)) {
        setAuthState(prev =>
          prev.status === "authenticated"
            ? prev
            : { status: "authenticated", error: null },
        )
      }
    } catch (error) {
      const runtimeError = normalizeRuntimeError(error)
      setState({
        data: null,
        loading: false,
        error: runtimeError,
      })
      if (runtimeError.type === "unauthenticated") {
        setAuthState({ status: "unauthenticated", error: runtimeError })
      }
    }
  }, [authorizedFetch, resolvedAppType, resolvedFetch, servicePrefix])

  useEffect(() => {
    void reload()
  }, [reload])

  const value = useMemo<OpenXiangdaRuntimeStore>(
    () => ({
      ...state,
      appType: resolvedAppType,
      servicePrefix,
      fetchImpl: authorizedFetch,
      baseFetchImpl: resolvedFetch,
      authState,
      getAuthHeaders,
      reload,
      setAccessToken,
    }),
    [
      authorizedFetch,
      getAuthHeaders,
      reload,
      resolvedAppType,
      resolvedFetch,
      servicePrefix,
      state,
      authState,
    ],
  )

  return (
    <OpenXiangdaRuntimeContext.Provider value={value}>
      {children}
    </OpenXiangdaRuntimeContext.Provider>
  )
}

export const useOpenXiangda = () => {
  const context = useContext(OpenXiangdaRuntimeContext)
  if (!context) {
    throw new Error("useOpenXiangda must be used inside OpenXiangdaProvider")
  }
  return context
}

export const useRuntimeBootstrap = () => useOpenXiangda()

export const OpenXiangdaPageProvider: React.FC<
  OpenXiangdaPageProviderProps
> = ({
  children,
  page,
  route,
  env,
  message,
  modal,
  navigation,
}) => {
  const runtime = useOpenXiangda()
  const context = useMemo<PageContext>(() => {
    const bootstrap = runtime.data
    const app = toRuntimeRecord(bootstrap?.app)
    const user = toRuntimeRecord(bootstrap?.user)
    const permissions = bootstrap?.permissions
    const unauthenticatedRuntime =
      !bootstrap?.user && runtime.error?.type === "unauthenticated"
    const runtimeGuestUser =
      unauthenticatedRuntime ||
      user.isGuest === true ||
      user.userType === "guest" ||
      Boolean(getRecordValue(user, "publicAccess"))
    const tenantId =
      toStringValue(getRecordValue(app, "tenantId")) ||
      toStringValue(getRecordValue(user, "tenantId")) ||
      toStringValue(getRecordValue(app, "tenantCode")) ||
      ""
    const appType =
      runtime.appType ||
      bootstrap?.appType ||
      toStringValue(getRecordValue(app, "appType"))
    const routeInfo = buildBrowserRouteInfo(route)

    return createBrowserPageContext(
      {
        app: {
          ...app,
          appType,
          tenantId,
        },
        page: {
          id: routeInfo.pathname || "react-spa",
          code: routeInfo.pathname || "react-spa",
          name: "OpenXiangda React SPA",
          type: "react-spa",
          rendererType: "react-spa",
          routeKey: routeInfo.pathname || "react-spa",
          status: "ACTIVE",
          props: {},
          route: {},
          dataSources: [],
          capabilities: {},
          buildId: toStringValue(
            getRecordValue(bootstrap?.runtime, "activeBuildId"),
          ),
          ...page,
        },
        user: {
          ...user,
          id:
            toStringValue(getRecordValue(user, "id")) ||
            (runtimeGuestUser ? "guest" : "current"),
          username:
            toStringValue(getRecordValue(user, "username")) ||
            toStringValue(getRecordValue(user, "name")) ||
            (runtimeGuestUser ? "guest" : "current"),
          tenantId,
          isGuest: runtimeGuestUser,
          userType: runtimeGuestUser ? "guest" : "normal",
        },
        env: {
          appType,
          servicePrefix: runtime.servicePrefix,
          runtimeMode: bootstrap?.runtime?.mode || "react-spa",
          ...(env || {}),
        },
        permissions: {
          canView: runtime.error?.type !== "forbidden",
          hasFullAccess: permissions?.hasFullAccess === true,
          ...(permissions || {}),
        },
        sdk: {
          packageName: "openxiangda",
          supportedBridgeMethods: ["transport.request", "transport.download"],
        },
      },
      {
        servicePrefix: runtime.servicePrefix,
        fetchImpl: runtime.fetchImpl,
        route: routeInfo,
        message,
        modal,
        navigation,
      },
    )
  }, [
    env,
    message,
    modal,
    navigation,
    page,
    route,
    runtime.appType,
    runtime.data,
    runtime.error?.type,
    runtime.fetchImpl,
    runtime.servicePrefix,
  ])

  return <PageProvider context={context}>{children}</PageProvider>
}

export const useAppMenus = () => {
  const runtime = useOpenXiangda()
  return {
    ...runtime,
    data: runtime.data?.menus || [],
  }
}

export const usePermission = () => {
  const runtime = useOpenXiangda()
  return {
    ...runtime,
    data: runtime.data?.permissions || null,
  }
}

export interface UseCanAccessRouteInput {
  routeCode?: string
  menuCode?: string
  path?: string
}

export const useCanAccessRoute = (input: UseCanAccessRouteInput) => {
  const runtime = useOpenXiangda()
  const [state, setState] = useState<RuntimeRequestState<RouteAccessResult>>({
    data: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let disposed = false
    const check = async () => {
      const permissions = runtime.data?.permissions
      if (!runtime.appType || runtime.loading) {
        setState(prev => ({ ...prev, loading: runtime.loading }))
        return
      }
      if (runtime.error && !runtime.data) {
        const snapshot = toRuntimeErrorSnapshot(runtime.error)
        setState({
          data: {
            appType: runtime.appType,
            canAccess: false,
            status: snapshot.status,
            code: snapshot.code,
            message: snapshot.message,
            errorType: snapshot.type,
            payload: snapshot.payload,
          },
          loading: false,
          error: runtime.error,
        })
        return
      }
      if (permissions?.hasFullAccess) {
        setState({
          data: { appType: runtime.appType, canAccess: true, permissions },
          loading: false,
          error: null,
        })
        return
      }
      setState(prev => ({ ...prev, loading: true, error: null }))
      try {
        const response = await runtime.fetchImpl(
          buildServiceUrl(
            runtime.servicePrefix,
            `/openxiangda-api/v1/apps/${encodeURIComponent(
              runtime.appType,
            )}/runtime/routes/check`,
          ),
          {
            method: "POST",
            credentials: "include",
            headers: {
              accept: "application/json",
              "content-type": "application/json",
            },
            body: JSON.stringify(input),
          },
        )
        const payload = await readJsonPayload(response)
        const code = payload?.code ?? response.status
        const canAccess = Boolean(payload?.data?.canAccess)
        const errorType = canAccess
          ? undefined
          : classifyRuntimeError(response.status, code)
        const data: RouteAccessResult = {
          ...(payload?.data || {
            appType: runtime.appType,
            canAccess: false,
          }),
          appType: payload?.data?.appType || runtime.appType,
          canAccess,
          status: response.status,
          code,
          message: payload?.message,
          errorType,
          payload,
        }
        if (!disposed) {
          const shouldTreatAsError =
            !response.ok || isServerErrorCode(code)
          setState({
            data,
            loading: false,
            error: shouldTreatAsError
              ? createRuntimeHttpError(
                  response,
                  payload,
                  payload?.message || `Route check failed: ${response.status}`,
                )
              : null,
          })
        }
      } catch (error) {
        if (!disposed) {
          setState({
            data: null,
            loading: false,
            error: normalizeRuntimeError(error),
          })
        }
      }
    }
    void check()
    return () => {
      disposed = true
    }
  }, [
    input.menuCode,
    input.path,
    input.routeCode,
    runtime.appType,
    runtime.data?.permissions,
    runtime.fetchImpl,
    runtime.loading,
    runtime.servicePrefix,
  ])

  return {
    ...state,
    canAccess: Boolean(state.data?.canAccess),
  }
}

export interface PermissionBoundaryProps extends UseCanAccessRouteInput {
  children: React.ReactNode
  fallback?: React.ReactNode | PermissionBoundaryFallback
  loadingFallback?: React.ReactNode | PermissionBoundaryFallback
}

export interface PermissionBoundaryFallbackState {
  access: ReturnType<typeof useCanAccessRoute>
  runtime: ReturnType<typeof useOpenXiangda>
  error: RuntimeRequestError | null
  errorType: RuntimeErrorType
  status?: number
  code?: number | string
  message: string
}

export type PermissionBoundaryFallback = (
  state: PermissionBoundaryFallbackState,
) => React.ReactNode

export const PermissionBoundary: React.FC<PermissionBoundaryProps> = ({
  children,
  fallback = null,
  loadingFallback = null,
  routeCode,
  menuCode,
  path,
}) => {
  const runtime = useOpenXiangda()
  const access = useCanAccessRoute({ routeCode, menuCode, path })
  const fallbackState = createPermissionFallbackState(access, runtime)
  if (access.loading) {
    return <>{renderBoundaryFallback(loadingFallback, fallbackState)}</>
  }
  if (!access.canAccess) {
    return <>{renderBoundaryFallback(fallback, fallbackState)}</>
  }
  return <>{children}</>
}

export interface RuntimeResolveLoginOptions {
  redirectUri?: string
  loginUrl?: string
  domain?: string
}

export interface RuntimeRedirectLoginOptions extends RuntimeResolveLoginOptions {
  replace?: boolean
}

export interface RuntimeLogoutOptions extends RuntimeRedirectLoginOptions {
  continueOnError?: boolean
}

export const useRuntimeAuth = () => {
  const runtime = useOpenXiangda()

  const resolveLoginUrl = useCallback(
    async (options: RuntimeResolveLoginOptions = {}) => {
      const redirectUri = options.redirectUri || getCurrentHref()
      const domain = options.domain || getCurrentHostname()
      const appTenantId = getRecordString(runtime.data?.app, "tenantId")

      try {
        const statusUrl = withQuery(
          buildServiceUrl(runtime.servicePrefix, "/api/sso/status"),
          { domain },
        )
        const statusResponse = await runtime.baseFetchImpl(statusUrl, {
          credentials: "include",
          headers: { accept: "application/json" },
        })
        const statusPayload = await readJsonPayload(statusResponse)
        const sso = statusPayload?.data || {}
        const enabled = Boolean(sso.enabled)
        const shouldUseSso = Boolean(
          enabled && (sso.forceLogin ?? sso.autoRedirect ?? true),
        )
        if (shouldUseSso) {
          const loginUrlResponse = await runtime.baseFetchImpl(
            withQuery(buildServiceUrl(runtime.servicePrefix, "/api/sso/login-url"), {
              domain,
              redirectUri,
              ...(sso.tenantId || appTenantId
                ? { tenantId: String(sso.tenantId || appTenantId) }
                : {}),
              ...(sso.protocol ? { protocol: String(sso.protocol) } : {}),
            }),
            {
              credentials: "include",
              headers: { accept: "application/json" },
            },
          )
          const loginUrlPayload = await readJsonPayload(loginUrlResponse)
          const loginUrl =
            loginUrlPayload?.data?.loginUrl ||
            loginUrlPayload?.data?.url ||
            loginUrlPayload?.loginUrl ||
            loginUrlPayload?.url
          if (loginUrl) return String(loginUrl)
        }
      } catch {
        // Login resolution must always have a local fallback so logged-out
        // users are not stranded behind a permission state.
      }

      const configuredLoginUrl =
        options.loginUrl ||
        getRuntimeEnv("OPENXIANGDA_LOGIN_URL") ||
        getRuntimeEnv("VITE_OPENXIANGDA_LOGIN_URL") ||
        getRuntimeEnv("APP_LOGIN_URL") ||
        getRuntimeEnv("VITE_APP_LOGIN_URL") ||
        getRuntimeEnv("VITE_BATH_AUTH_URL") ||
        getRuntimeEnv("BATH_AUTH_URL")
      if (configuredLoginUrl) {
        return attachCallback(configuredLoginUrl, redirectUri)
      }
      return attachCallback("/platform/login", redirectUri)
    },
    [runtime.baseFetchImpl, runtime.data?.app, runtime.servicePrefix],
  )

  const redirectToLogin = useCallback(
    async (options: RuntimeRedirectLoginOptions = {}) => {
      const loginUrl = await resolveLoginUrl(options)
      if (typeof window !== "undefined") {
        if (options.replace === false) {
          window.location.assign(loginUrl)
        } else {
          window.location.replace(loginUrl)
        }
      }
      return loginUrl
    },
    [resolveLoginUrl],
  )

  const logout = useCallback(async () => {
    const response = await runtime.baseFetchImpl(
      buildServiceUrl(runtime.servicePrefix, "/api/auth/logout"),
      {
        method: "POST",
        credentials: "include",
        headers: { accept: "application/json" },
      },
    )
    const payload = await readJsonPayload(response)
    if (isRuntimeEnvelopeFailure(response, payload)) {
      throw createRuntimeHttpError(
        response,
        payload,
        payload?.message || `Logout failed: ${response.status}`,
      )
    }
    runtime.setAccessToken(null)
    return payload
  }, [runtime.baseFetchImpl, runtime.servicePrefix, runtime.setAccessToken])

  const logoutAndRedirect = useCallback(
    async (options: RuntimeLogoutOptions = {}) => {
      try {
        await logout()
      } catch (error) {
        if (options.continueOnError === false) throw error
      }
      return redirectToLogin(options)
    },
    [logout, redirectToLogin],
  )

  return useMemo(
    () => ({
      logout,
      logoutAndRedirect,
      redirectToLogin,
      resolveLoginUrl,
    }),
    [logout, logoutAndRedirect, redirectToLogin, resolveLoginUrl],
  )
}

export interface RuntimeAuthGuardProps extends RuntimeRedirectLoginOptions {
  children: React.ReactNode
  fallback?: React.ReactNode
  disabled?: boolean
  excludedPaths?: string[]
}

export const RuntimeAuthGuard: React.FC<RuntimeAuthGuardProps> = ({
  children,
  fallback = null,
  disabled = false,
  excludedPaths = [],
  ...redirectOptions
}) => {
  const runtime = useOpenXiangda()
  const auth = useRuntimeAuth()
  const redirectedRef = useRef(false)
  const currentPath = getCurrentPathname()
  const excluded = isRuntimeAuthGuardExcluded(
    currentPath,
    runtime.appType,
    excludedPaths,
  )
  const shouldRedirect =
    !disabled &&
    !excluded &&
    !runtime.loading &&
    (runtime.authState.status === "unauthenticated" ||
      runtime.error?.type === "unauthenticated")

  useEffect(() => {
    if (!shouldRedirect || redirectedRef.current) return
    redirectedRef.current = true
    void auth
      .redirectToLogin({
        ...redirectOptions,
        redirectUri: redirectOptions.redirectUri || getCurrentHref(),
      })
      .catch(() => {
        redirectedRef.current = false
      })
  }, [
    auth,
    redirectOptions.domain,
    redirectOptions.loginUrl,
    redirectOptions.redirectUri,
    redirectOptions.replace,
    shouldRedirect,
  ])

  if (excluded) return <>{children}</>
  if (shouldRedirect) return <>{fallback}</>
  return <>{children}</>
}

const buildServiceUrl = (servicePrefix: string, path: string) => {
  const prefix = servicePrefix.endsWith("/")
    ? servicePrefix.slice(0, -1)
    : servicePrefix
  const suffix = path.startsWith("/") ? path : `/${path}`
  return `${prefix}${suffix}`
}

interface CreateAuthorizedFetchOptions {
  appType: string
  baseFetch: typeof fetch
  accessTokenRef: React.MutableRefObject<RuntimeAccessTokenState | null>
  refreshAccessToken: () => Promise<RuntimeAccessTokenState | null>
  markUnauthenticated: (error: unknown) => void
}

const createAuthorizedFetch = ({
  appType,
  baseFetch,
  accessTokenRef,
  refreshAccessToken,
  markUnauthenticated,
}: CreateAuthorizedFetchOptions): typeof fetch =>
  (async (input, init = {}) => {
    const currentTokenState = accessTokenRef.current
    const response = await createAccessTokenFetch(
      baseFetch,
      currentTokenState,
    )(input, init)
    if (
      !shouldAttemptAuthRefresh({
        appType,
        input,
        init,
        tokenState: currentTokenState,
      })
    ) {
      return response
    }
    if (!(await isUnauthenticatedResponse(response))) return response

    try {
      const refreshedTokenState = await refreshAccessToken()
      if (!refreshedTokenState) return response
      return await createAccessTokenFetch(
        baseFetch,
        refreshedTokenState,
      )(input, init)
    } catch (error) {
      markUnauthenticated(error)
      return response
    }
  }) as typeof fetch

const createAccessTokenFetch = (
  baseFetch: typeof fetch,
  accessToken?: RuntimeAccessTokenState | null,
): typeof fetch => {
  if (!accessToken) return baseFetch
  return ((input, init = {}) => {
    const token = resolveAccessTokenForCurrentRoute(accessToken)
    if (!token) return baseFetch(input, init)
    const headers = new Headers(init.headers || {})
    if (!headers.has("authorization")) {
      headers.set("authorization", `Bearer ${token}`)
    }
    return baseFetch(input, {
      ...init,
      headers,
    })
  }) as typeof fetch
}

const createAccessTokenState = (
  accessToken?: string | null,
  options: RuntimeAccessTokenOptions = {},
): RuntimeAccessTokenState | null =>
  accessToken
    ? {
        token: accessToken,
        scope: options.scope || "default",
        path: options.path || null,
        expiresAt: options.expiresAt,
      }
    : null

const shouldAttemptAuthRefresh = ({
  appType,
  input,
  init,
  tokenState,
}: {
  appType: string
  input: Parameters<typeof fetch>[0]
  init?: Parameters<typeof fetch>[1]
  tokenState?: RuntimeAccessTokenState | null
}) => {
  if (!appType) return false
  if (tokenState?.scope === "public") return false
  if (isPublicRoutePath(normalizeRoutePath(getCurrentPathname()))) return false
  if (hasAuthorizationHeader(init?.headers)) return false
  const pathname = getFetchInputPathname(input)
  if (!pathname) return false
  if (/\/openxiangda-api\/v1\/apps\/[^/]+\/auth(?:\/|$)/.test(pathname)) {
    return false
  }
  if (/\/openxiangda-api\/v1\/apps\/[^/]+\/public\/session(?:\/|$)/.test(pathname)) {
    return false
  }
  if (/\/openxiangda-api\/v1\/auth(?:\/|$)/.test(pathname)) return false
  if (/\/api\/auth\/logout(?:\/|$)/.test(pathname)) return false
  if (/\/api\/sso(?:\/|$)/.test(pathname)) return false
  return true
}

const isUnauthenticatedResponse = async (response: Response) => {
  if (response.status === 401) return true
  const payload = await readJsonPayload(response.clone())
  const code = getRecordValue(payload, "code")
  return classifyRuntimeError(response.status, code as number | string | undefined) === "unauthenticated"
}

const hasAuthorizationHeader = (headers?: HeadersInit) => {
  if (!headers) return false
  const normalized = new Headers(headers)
  return normalized.has("authorization")
}

const getFetchInputPathname = (input: Parameters<typeof fetch>[0]) => {
  const text =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : typeof Request !== "undefined" && input instanceof Request
          ? input.url
          : String(input || "")
  if (!text) return ""
  try {
    const base =
      typeof window !== "undefined" ? window.location.origin : "http://localhost"
    return new URL(text, base).pathname
  } catch {
    return text.split(/[?#]/, 1)[0] || ""
  }
}

const resolveAccessTokenForCurrentRoute = (
  accessToken: RuntimeAccessTokenState,
) => {
  if (accessToken.scope !== "public") return accessToken.token
  const scopedPath = normalizeRoutePath(accessToken.path)
  const currentPath = normalizeRoutePath(getCurrentPathname())
  if (!scopedPath) {
    return isPublicRoutePath(currentPath) ? accessToken.token : null
  }
  if (
    currentPath === scopedPath ||
    (isPublicRoutePath(currentPath) && currentPath.startsWith(`${scopedPath}/`))
  ) {
    return accessToken.token
  }
  return null
}

const normalizeRoutePath = (path?: string | null) => {
  const text = String(path || "").trim()
  if (!text) return ""
  try {
    const base =
      typeof window !== "undefined" ? window.location.origin : "http://localhost"
    return new URL(text, base).pathname.replace(/\/+$/, "") || "/"
  } catch {
    return text.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/"
  }
}

const isPublicRoutePath = (path: string) => /\/public(?:\/|$)/.test(path)

const readJsonPayload = async (response: Response) => {
  try {
    return await response.json()
  } catch {
    return null
  }
}

const createRuntimeHttpError = (
  response: Response,
  payload: unknown,
  fallbackMessage: string,
): RuntimeRequestError =>
  createRuntimeError({
    type: classifyRuntimeError(
      response.status,
      getRecordValue(payload, "code") as number | string | undefined,
    ),
    status: response.status,
    code: getRecordValue(payload, "code") as number | string | undefined,
    message:
      (getRecordValue(payload, "message") as string | undefined) ||
      fallbackMessage,
    payload,
  })

const createRuntimeError = (
  snapshot: RuntimeErrorSnapshot,
): RuntimeRequestError =>
  new RuntimeHttpError({
    ...snapshot,
    type: snapshot.type || "unknown",
    message: snapshot.message || "Runtime request failed",
  })

const normalizeRuntimeError = (error: unknown): RuntimeRequestError => {
  if (error instanceof RuntimeHttpError) return error
  if (error instanceof Error) {
    const runtimeError = error as RuntimeRequestError
    runtimeError.type = runtimeError.type || classifyRuntimeError(runtimeError.status, runtimeError.code)
    return runtimeError
  }
  return createRuntimeError({
    type: "unknown",
    message: String(error),
  })
}

const toRuntimeErrorSnapshot = (
  error: RuntimeRequestError,
): RuntimeErrorSnapshot => ({
  type: error.type || classifyRuntimeError(error.status, error.code),
  status: error.status,
  code: error.code,
  message: error.message || "Runtime request failed",
  payload: error.payload,
})

const classifyRuntimeError = (
  status?: number,
  code?: number | string,
): RuntimeErrorType => {
  const normalizedCode = typeof code === "string" ? Number(code) : code
  if (status === 401 || normalizedCode === 401) return "unauthenticated"
  if (status === 403 || normalizedCode === 403) return "forbidden"
  if (typeof code === "string") {
    const normalizedText = code.toUpperCase()
    if (
      normalizedText.includes("DENIED") ||
      normalizedText.includes("FORBIDDEN")
    ) {
      return "forbidden"
    }
    if (
      normalizedText.includes("UNAUTH") ||
      normalizedText.includes("LOGIN")
    ) {
      return "unauthenticated"
    }
  }
  if (!status && !normalizedCode) return "network"
  return "unknown"
}

const createPermissionFallbackState = (
  access: ReturnType<typeof useCanAccessRoute>,
  runtime: ReturnType<typeof useOpenXiangda>,
): PermissionBoundaryFallbackState => {
  const error = access.error || runtime.error
  const accessData = access.data
  const errorType =
    accessData?.errorType ||
    error?.type ||
    (!access.canAccess ? "forbidden" : "unknown")
  return {
    access,
    runtime,
    error,
    errorType,
    status: accessData?.status || error?.status,
    code: accessData?.code || error?.code,
    message:
      accessData?.message ||
      error?.message ||
      (errorType === "unauthenticated"
        ? "当前账号尚未登录"
        : "当前账号没有访问权限"),
  }
}

const renderBoundaryFallback = (
  fallback: React.ReactNode | PermissionBoundaryFallback,
  state: PermissionBoundaryFallbackState,
) => (typeof fallback === "function" ? fallback(state) : fallback)

const withQuery = (
  url: string,
  params: Record<string, string | number | boolean | undefined>,
) => {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === "") return
    query.set(key, String(value))
  })
  const serialized = query.toString()
  if (!serialized) return url
  return `${url}${url.includes("?") ? "&" : "?"}${serialized}`
}

const attachCallback = (loginUrl: string, callback: string) => {
  if (!callback) return loginUrl
  try {
    const base =
      typeof window !== "undefined" ? window.location.origin : "http://localhost"
    const parsed = new URL(loginUrl, base)
    if (!parsed.searchParams.has("callback") && !parsed.searchParams.has("redirectUri")) {
      parsed.searchParams.set("callback", callback)
    }
    if (loginUrl.startsWith("http://") || loginUrl.startsWith("https://")) {
      return parsed.toString()
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    const separator = loginUrl.includes("?") ? "&" : "?"
    return `${loginUrl}${separator}callback=${encodeURIComponent(callback)}`
  }
}

const getCurrentHref = () =>
  typeof window === "undefined" ? "" : window.location.href

const getCurrentPathname = () =>
  typeof window === "undefined" ? "" : window.location.pathname

const getCurrentHostname = () =>
  typeof window === "undefined" ? "" : window.location.hostname

const getRuntimeEnv = (key: string) => {
  const env =
    typeof process !== "undefined"
      ? (process as unknown as { env?: Record<string, string | undefined> }).env
      : undefined
  return env?.[key]
}

const getRecordValue = (value: unknown, key: string) => {
  if (!value || typeof value !== "object") return undefined
  return (value as Record<string, unknown>)[key]
}

const toRuntimeRecord = (value: unknown): Record<string, unknown> => {
  return value && typeof value === "object"
    ? { ...(value as Record<string, unknown>) }
    : {}
}

const toStringValue = (value: unknown): string => {
  if (value === undefined || value === null) return ""
  return String(value)
}

const parseBrowserQuery = (): Record<string, PageQueryValue> => {
  if (typeof window === "undefined") return {}
  const query: Record<string, PageQueryValue> = {}
  const params = new URLSearchParams(window.location.search)
  params.forEach((value, key) => {
    const currentValue = query[key]
    if (currentValue === undefined) {
      query[key] = value
      return
    }
    query[key] = Array.isArray(currentValue)
      ? [...currentValue, value]
      : [currentValue, value]
  })
  return query
}

const buildBrowserRouteInfo = (
  route?: Partial<PageRouteInfo>,
): PageRouteInfo => {
  const pathname =
    route?.pathname ||
    (typeof window !== "undefined" ? window.location.pathname : "")
  const search = typeof window !== "undefined" ? window.location.search : ""
  const hash =
    route?.hash || (typeof window !== "undefined" ? window.location.hash : "")
  return {
    pathname,
    fullPath:
      route?.fullPath ||
      (typeof window !== "undefined" ? `${pathname}${search}${hash}` : pathname),
    params: route?.params || {},
    query: route?.query || parseBrowserQuery(),
    hash,
  }
}

const isSuccessCode = (code: unknown) => {
  if (code === undefined || code === null || code === "") return true
  const normalized = Number(code)
  return Number.isFinite(normalized)
    ? normalized === 0 || (normalized >= 200 && normalized < 300)
    : false
}

const isRuntimeEnvelopeFailure = (response: Response, payload: unknown) => {
  const code = getRecordValue(payload, "code")
  const success = getRecordValue(payload, "success")
  return !response.ok || success === false || !isSuccessCode(code)
}

const isServerErrorCode = (code: unknown) => {
  const normalized = Number(code)
  return Number.isFinite(normalized) && normalized >= 500
}

const getRecordString = (value: unknown, key: string) => {
  const result = getRecordValue(value, key)
  return typeof result === "string" ? result : undefined
}

const getRecordNumber = (value: unknown, key: string) => {
  const result = getRecordValue(value, key)
  const numberValue = Number(result)
  return Number.isFinite(numberValue) ? numberValue : undefined
}

const unwrapRuntimePayload = (payload: unknown) => {
  if (!payload || typeof payload !== "object") return payload
  const record = payload as Record<string, unknown>
  return "data" in record ? record.data : payload
}

const isAuthenticatedBootstrap = (value: unknown) => {
  if (!value || typeof value !== "object") return false
  const user = toRuntimeRecord(getRecordValue(value, "user"))
  if (!getRecordValue(user, "id") && !getRecordValue(user, "username")) {
    return false
  }
  return !getRecordValue(user, "publicAccess")
}

const isRuntimeAuthGuardExcluded = (
  path: string,
  appType: string,
  excludedPaths: string[],
) => {
  const normalizedPath = normalizeRoutePath(path)
  if (isPublicRoutePath(normalizedPath)) return true
  const loginPath = normalizeRoutePath(`/view/${encodeURIComponent(appType)}/login`)
  if (appType && normalizedPath === loginPath) return true
  return excludedPaths
    .map(item => normalizeRoutePath(item))
    .some(item => item && normalizedPath === item)
}

const resolveAppTypeFromLocation = () => {
  if (typeof window === "undefined") return ""
  const segments = window.location.pathname.split("/").filter(Boolean)
  const viewIndex = segments[0] === "view" ? 1 : 0
  if (segments[viewIndex] === "submit") return segments[viewIndex + 1] || ""
  if (segments[viewIndex] === "preview") return segments[viewIndex + 1] || ""
  return segments[viewIndex] || ""
}

export {
  LoginPage,
  useAuth,
  useLoginMethods,
} from "./auth"
export type {
  LoginPageProps,
  UseAuthOptions,
  UseLoginMethodsState,
} from "./auth"
export {
  AuthClientError,
  createAuthClient,
} from "../core/auth"
export type {
  AppAuthClient,
  AuthMethod,
  AuthMethodType,
  AuthTokenData,
  DingTalkLoginInput,
  GuestLoginInput,
  LoginMethodsResult,
  PasswordLoginInput,
  PhoneCodeInput,
  PhoneCodeLoginInput,
  PhoneCodeRegisterInput,
  PhoneCodeSendResult,
  RefreshInput,
  ResolveLoginUrlInput,
  SsoLoginUrlInput,
  SsoLoginUrlResult,
} from "../core/auth"
