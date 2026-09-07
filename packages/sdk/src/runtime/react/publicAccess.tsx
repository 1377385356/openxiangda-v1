import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  createPublicAccessClient,
  PublicAccessClientError,
  type PublicAccessClaim,
  type PublicAccessSessionData,
  type PublicAccessSessionInput,
} from "../core/publicAccess"
import { useOpenXiangda } from "./openxiangdaProvider"

export interface UsePublicAccessOptions extends PublicAccessSessionInput {
  appType?: string
  servicePrefix?: string
  fetchImpl?: typeof fetch
  autoStart?: boolean
}

export interface UsePublicAccessState {
  loading: boolean
  error: PublicAccessClientError | null
  session: PublicAccessSessionData | null
  publicAccess: PublicAccessClaim | null
  startSession: (
    input?: PublicAccessSessionInput,
  ) => Promise<PublicAccessSessionData>
}

export const usePublicAccess = (
  options: UsePublicAccessOptions = {},
): UsePublicAccessState => {
  const runtime = useOpenXiangda()
  const {
    appType: runtimeAppType,
    servicePrefix: runtimeServicePrefix,
    baseFetchImpl: runtimeBaseFetchImpl,
    reload: reloadRuntime,
    setAccessToken,
  } = runtime
  const {
    appType = runtimeAppType,
    servicePrefix = runtimeServicePrefix,
    fetchImpl = runtimeBaseFetchImpl,
    autoStart = true,
    ...sessionInput
  } = options
  const [session, setSession] = useState<PublicAccessSessionData | null>(null)
  const [error, setError] = useState<PublicAccessClientError | null>(null)
  const [loading, setLoading] = useState(Boolean(autoStart))
  const activeSessionRef = useRef<{
    accessToken: string
    path?: string
  } | null>(null)
  const mountedRef = useRef(true)
  const sessionInputKey = JSON.stringify(sessionInput)
  const stableSessionInput = useMemo(() => sessionInput, [sessionInputKey])

  const client = useMemo(
    () =>
      createPublicAccessClient({
        appType,
        servicePrefix,
        fetchImpl,
      }),
    [appType, fetchImpl, servicePrefix],
  )

  const startSession = useCallback(
    async (input: PublicAccessSessionInput = {}) => {
      setLoading(true)
      setError(null)
      try {
        const resolvedPath =
          input.path || stableSessionInput.path || readPathFromLocation()
        const resolvedInput = {
          ...stableSessionInput,
          ...input,
          ticket:
            input.ticket || stableSessionInput.ticket || readTicketFromLocation(),
          path: resolvedPath,
        }
        let data = await client.startSession(resolvedInput)
        if (!mountedRef.current) return data
        const activateSession = async (next: PublicAccessSessionData) => {
          activeSessionRef.current = {
            accessToken: next.accessToken,
            path: resolvedPath,
          }
          setSession(next)
          setAccessToken(next.accessToken, {
            scope: "public",
            path: resolvedPath,
          })
          await reloadRuntime({
            accessToken: next.accessToken,
            accessTokenOptions: {
              scope: "public",
              path: resolvedPath,
            },
          })
        }
        try {
          await activateSession(data)
        } catch (activationError) {
          if (!isUnauthorizedPublicSessionError(activationError)) throw activationError
          client.clearSession(resolvedInput)
          data = await client.startSession(resolvedInput)
          await activateSession(data)
        }
        if (!mountedRef.current) return data
        setLoading(false)
        return data
      } catch (caught) {
        const nextError =
          caught instanceof PublicAccessClientError
            ? caught
            : new PublicAccessClientError(
                caught instanceof Error ? caught.message : "公开访问会话创建失败",
                { payload: caught },
              )
        if (mountedRef.current) {
          setError(nextError)
          setLoading(false)
        }
        throw nextError
      }
    },
    [client, reloadRuntime, setAccessToken, stableSessionInput],
  )

  useEffect(() => {
    if (!autoStart) return
    void startSession().catch(() => undefined)
  }, [autoStart, startSession])

  useEffect(
    () => {
      mountedRef.current = true
      return () => {
        mountedRef.current = false
        const activeSession = activeSessionRef.current
        if (!activeSession) return
        activeSessionRef.current = null
        setAccessToken(null, { clearIfToken: activeSession.accessToken })
        void reloadRuntime({ accessToken: null })
      }
    },
    [reloadRuntime, setAccessToken],
  )

  return {
    loading,
    error,
    session,
    publicAccess: session?.publicAccess || null,
    startSession,
  }
}

export interface PublicAccessGateProps extends UsePublicAccessOptions {
  children: React.ReactNode
  fallback?: React.ReactNode
  errorFallback?: React.ReactNode | ((error: PublicAccessClientError) => React.ReactNode)
}

export const PublicAccessGate: React.FC<PublicAccessGateProps> = ({
  children,
  fallback = null,
  errorFallback = null,
  ...options
}) => {
  const state = usePublicAccess(options)
  if (state.loading) return <>{fallback}</>
  if (state.error) {
    return (
      <>
        {typeof errorFallback === "function"
          ? errorFallback(state.error)
          : errorFallback}
      </>
    )
  }
  return <>{children}</>
}

const readTicketFromLocation = () => {
  if (typeof window === "undefined") return undefined
  return new URLSearchParams(window.location.search).get("ticket") || undefined
}

const readPathFromLocation = () =>
  typeof window === "undefined" ? undefined : window.location.pathname

const isUnauthorizedPublicSessionError = (error: unknown) => {
  if (!error || typeof error !== "object") return false
  const status = Number(
    (error as { status?: unknown; statusCode?: unknown }).status ??
      (error as { statusCode?: unknown }).statusCode,
  )
  return status === 401 || status === 403
}
