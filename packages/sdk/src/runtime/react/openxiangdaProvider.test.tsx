import { render, renderHook, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  OpenXiangdaPageProvider,
  OpenXiangdaProvider,
  PermissionBoundary,
  RuntimeAuthGuard,
  useAuth,
  useOpenXiangda,
  useRuntimeAuth,
  useRuntimeBootstrap,
} from "./openxiangdaProvider"
import { PublicAccessGate } from "./publicAccess"
import { usePageSdk } from "./hooks/usePageSdk"

import { useEffect, useState, type ReactNode } from "react"

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  })

const createWrapper =
  (fetchImpl: typeof fetch) =>
  ({ children }: { children: ReactNode }) => (
    <OpenXiangdaProvider appType="APP_TEST" fetchImpl={fetchImpl}>
      {children}
    </OpenXiangdaProvider>
  )

const getAuthorizationHeader = (headers: HeadersInit | undefined) => {
  if (!headers) return undefined
  if (headers instanceof Headers) {
    return headers.get("authorization") || undefined
  }
  if (Array.isArray(headers)) {
    const entry = headers.find(([key]) => key.toLowerCase() === "authorization")
    return entry?.[1]
  }
  return headers.authorization || headers.Authorization
}

afterEach(() => {
  window.history.pushState({}, "", "/")
  delete process.env.OPENXIANGDA_LOGIN_URL
})

describe("OpenXiangdaProvider runtime auth and permissions", () => {
  it("refreshes an expired bootstrap request and retries with the new token", async () => {
    let bootstrapCalls = 0
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      if (url.includes("/auth/refresh")) {
        return jsonResponse({
          code: 200,
          data: {
            accessToken: "access-new",
            token: "access-new",
            accessTokenExpiresAt: Date.now() + 3600000,
          },
        })
      }
      if (url.includes("/runtime/bootstrap")) {
        bootstrapCalls += 1
        if (getAuthorizationHeader(init?.headers) === "Bearer access-new") {
          return jsonResponse({
            code: 200,
            data: {
              appType: "APP_TEST",
              user: { id: "USER_TEST", username: "tester" },
              permissions: { hasFullAccess: true, roleCodes: [] },
            },
          })
        }
        return jsonResponse({ code: 401, message: "未登录" }, 401)
      }
      return jsonResponse({ code: 404 }, 404)
    })
    const { result } = renderHook(() => useRuntimeBootstrap(), {
      wrapper: createWrapper(fetchImpl),
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.error).toBeNull()
      expect(result.current.data?.user?.id).toBe("USER_TEST")
      expect(result.current.authState.status).toBe("authenticated")
    })
    expect(bootstrapCalls).toBe(2)
    expect(
      fetchImpl.mock.calls.filter(([url]) => String(url).includes("/auth/refresh")),
    ).toHaveLength(1)
  })

  it("deduplicates concurrent refreshes and replays each request once", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      if (url.includes("/runtime/bootstrap")) {
        return jsonResponse({
          code: 200,
          data: {
            appType: "APP_TEST",
            user: { id: "USER_TEST", username: "tester" },
            permissions: { hasFullAccess: true, roleCodes: [] },
          },
        })
      }
      if (url.includes("/auth/refresh")) {
        await new Promise(resolve => setTimeout(resolve, 10))
        return jsonResponse({
          code: 200,
          data: {
            accessToken: "access-new",
            token: "access-new",
          },
        })
      }
      if (url.includes("/resource-a") || url.includes("/resource-b")) {
        if (getAuthorizationHeader(init?.headers) === "Bearer access-new") {
          return jsonResponse({ code: 200, data: { ok: true } })
        }
        return jsonResponse({ code: 401, message: "未登录" }, 401)
      }
      return jsonResponse({ code: 404 }, 404)
    })
    const FetchConsumer = () => {
      const runtime = useOpenXiangda()
      const [done, setDone] = useState(false)
      useEffect(() => {
        if (runtime.loading) return
        let disposed = false
        void Promise.all([
          runtime.fetchImpl("/service/resource-a"),
          runtime.fetchImpl("/service/resource-b"),
        ]).then(() => {
          if (!disposed) setDone(true)
        })
        return () => {
          disposed = true
        }
      }, [runtime.fetchImpl, runtime.loading])
      return <div>{done ? "done" : "pending"}</div>
    }

    render(
      <OpenXiangdaProvider appType="APP_TEST" fetchImpl={fetchImpl}>
        <FetchConsumer />
      </OpenXiangdaProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText("done")).toBeInTheDocument()
    })
    expect(
      fetchImpl.mock.calls.filter(([url]) => String(url).includes("/auth/refresh")),
    ).toHaveLength(1)
    expect(
      fetchImpl.mock.calls.filter(([, init]) =>
        getAuthorizationHeader(init?.headers) === "Bearer access-new",
      ).length,
    ).toBeGreaterThanOrEqual(2)
  })

  it("marks auth unauthenticated when refresh fails and lets the guard take over", async () => {
    process.env.OPENXIANGDA_LOGIN_URL = "/custom-login"
    const fetchImpl = vi.fn<typeof fetch>(async input => {
      const url = String(input)
      if (url.includes("/auth/refresh")) {
        return jsonResponse(
          {
            code: 401,
            message: "Missing refresh token",
            extra: { reason: "MISSING_REFRESH_TOKEN" },
          },
          401,
        )
      }
      if (url.includes("/runtime/bootstrap")) {
        return jsonResponse({ code: 401, message: "未登录" }, 401)
      }
      if (url.includes("/api/sso/status")) {
        return jsonResponse({ code: 200, data: { enabled: false } })
      }
      return jsonResponse({ code: 404 }, 404)
    })
    const GuardState = () => {
      const runtime = useOpenXiangda()
      return (
        <RuntimeAuthGuard fallback={<div>redirecting:{runtime.authState.status}</div>}>
          <div>private</div>
        </RuntimeAuthGuard>
      )
    }

    render(
      <OpenXiangdaProvider appType="APP_TEST" fetchImpl={fetchImpl}>
        <GuardState />
      </OpenXiangdaProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText("redirecting:unauthenticated")).toBeInTheDocument()
    })
  })

  it("does not run refresh for app auth login failures", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async input => {
      const url = String(input)
      if (url.includes("/runtime/bootstrap")) {
        return jsonResponse({ code: 200, data: { appType: "APP_TEST" } })
      }
      if (url.includes("/password/login")) {
        return jsonResponse(
          {
            code: 460,
            message: "请先完成额外验证后再尝试登录",
            extra: { reason: "LOGIN_CHALLENGE_REQUIRED" },
          },
          460,
        )
      }
      if (url.includes("/auth/refresh")) {
        return jsonResponse({ code: 200, data: { accessToken: "unexpected" } })
      }
      return jsonResponse({ code: 404 }, 404)
    })
    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(fetchImpl),
    })

    await expect(
      result.current.passwordLogin({ username: "u", password: "p" }),
    ).rejects.toThrow("请先完成额外验证后再尝试登录")
    expect(
      fetchImpl.mock.calls.filter(([url]) => String(url).includes("/auth/refresh")),
    ).toHaveLength(0)
  })

  it("provides PageSdk context for React SPA route children", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async input => {
      const url = String(input)
      if (url.includes("/runtime/bootstrap")) {
        return jsonResponse({
          code: 200,
          data: {
            appType: "APP_TEST",
            app: { appType: "APP_TEST", tenantId: "TENANT_TEST" },
            user: {
              id: "USER_TEST",
              username: "tester",
              tenantId: "TENANT_TEST",
            },
            permissions: { hasFullAccess: true, roleCodes: [] },
          },
        })
      }
      return jsonResponse({ code: 200, data: true })
    })

    const SdkConsumer = () => {
      const sdk = usePageSdk()
      return <div>{sdk.context.app.appType}</div>
    }

    render(
      <OpenXiangdaProvider appType="APP_TEST" fetchImpl={fetchImpl}>
        <OpenXiangdaPageProvider>
          <SdkConsumer />
        </OpenXiangdaPageProvider>
      </OpenXiangdaProvider>,
    )

    expect(screen.getByText("APP_TEST")).toBeInTheDocument()
    await waitFor(() => {
      expect(fetchImpl).toHaveBeenCalledWith(
        "/service/openxiangda-api/v1/apps/APP_TEST/runtime/bootstrap",
        expect.any(Object),
      )
    })
  })

  it("classifies bootstrap 401 as unauthenticated", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ code: 401, message: "未登录" }, 401),
    )
    const { result } = renderHook(() => useRuntimeBootstrap(), {
      wrapper: createWrapper(fetchImpl),
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.error?.type).toBe("unauthenticated")
      expect(result.current.error?.status).toBe(401)
    })
  })

  it("exposes unauthenticated bootstrap state as guest instead of current user", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ code: 401, message: "login field" }),
    )
    const SdkConsumer = () => {
      const sdk = usePageSdk()
      return (
        <div>
          {sdk.context.user.username}:{String(sdk.context.user.isGuest)}:
          {sdk.context.user.userType}
        </div>
      )
    }

    render(
      <OpenXiangdaProvider appType="APP_TEST" fetchImpl={fetchImpl}>
        <OpenXiangdaPageProvider>
          <SdkConsumer />
        </OpenXiangdaPageProvider>
      </OpenXiangdaProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText("guest:true:guest")).toBeInTheDocument()
    })
    expect(screen.queryByText(/current/)).not.toBeInTheDocument()
  })

  it("treats HTTP 200 bootstrap string error codes as failures", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        code: "PUBLIC_GRANT_DENIED",
        message: "公开访问未授权查询该资源",
      }),
    )
    const { result } = renderHook(() => useRuntimeBootstrap(), {
      wrapper: createWrapper(fetchImpl),
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.error?.type).toBe("forbidden")
      expect(result.current.error?.code).toBe("PUBLIC_GRANT_DENIED")
    })
  })

  it("keeps route 403 as forbidden and exposes function fallback state", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async input => {
      const url = String(input)
      if (url.includes("/runtime/bootstrap")) {
        return jsonResponse({
          code: 200,
          data: {
            appType: "APP_TEST",
            permissions: { hasFullAccess: false, roleCodes: [] },
          },
        })
      }
      return jsonResponse(
        {
          code: 403,
          message: "无权访问",
          data: { appType: "APP_TEST", canAccess: false },
        },
        200,
      )
    })

    render(
      <OpenXiangdaProvider appType="APP_TEST" fetchImpl={fetchImpl}>
        <PermissionBoundary
          fallback={state => (
            <div>
              {state.errorType}:{state.code}:{state.message}
            </div>
          )}
          path="/view/APP_TEST/admin"
        >
          <div>allowed</div>
        </PermissionBoundary>
      </OpenXiangdaProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText("forbidden:403:无权访问")).toBeInTheDocument()
    })
    expect(screen.queryByText("allowed")).not.toBeInTheDocument()
  })

  it("keeps legacy static PermissionBoundary fallback compatible", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async input => {
      const url = String(input)
      if (url.includes("/runtime/bootstrap")) {
        return jsonResponse({
          code: 200,
          data: {
            appType: "APP_TEST",
            permissions: { hasFullAccess: false, roleCodes: [] },
          },
        })
      }
      return jsonResponse({
        code: 403,
        message: "无权访问",
        data: { appType: "APP_TEST", canAccess: false },
      })
    })

    render(
      <OpenXiangdaProvider appType="APP_TEST" fetchImpl={fetchImpl}>
        <PermissionBoundary fallback={<div>no access</div>} path="/denied">
          <div>allowed</div>
        </PermissionBoundary>
      </OpenXiangdaProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText("no access")).toBeInTheDocument()
    })
  })

  it("uses public access tokens for runtime reloads", async () => {
    window.history.pushState({}, "", "/view/APP_TEST/public/register")

    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      if (url.includes("/public/session")) {
        return jsonResponse({
          code: 200,
          data: {
            accessToken: "public-access-token",
            refreshToken: "public-refresh-token",
          },
          extra: {
            publicAccess: {
              type: "openxiangda_public",
              appType: "APP_TEST",
              policyCode: "public_register",
              mode: "guest",
              externalRoleCodes: ["external_visitor"],
              grants: { dataViews: ["public_lookup"] },
              issuedAt: "2026-06-18T00:00:00.000Z",
            },
          },
        })
      }
      if (url.includes("/runtime/bootstrap")) {
        const authorization = getAuthorizationHeader(init?.headers)
        if (authorization === "Bearer public-access-token") {
          return jsonResponse({
            code: 200,
            data: {
              appType: "APP_TEST",
              user: { publicAccess: { policyCode: "public_register" } },
            },
          })
        }
        return jsonResponse({ code: 401, message: "未登录" }, 401)
      }
      return jsonResponse({ code: 404 }, 404)
    })

    render(
      <OpenXiangdaProvider appType="APP_TEST" fetchImpl={fetchImpl}>
        <PublicAccessGate policyCode="public_register">
          <div>public ready</div>
        </PublicAccessGate>
      </OpenXiangdaProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText("public ready")).toBeInTheDocument()
    })
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(
      fetchImpl.mock.calls.filter(([url]) =>
        String(url).includes("/public/session"),
      ),
    ).toHaveLength(1)
    expect(
      fetchImpl.mock.calls.some(([url, init]) => {
        return (
          String(url).includes("/runtime/bootstrap") &&
          getAuthorizationHeader(init?.headers) === "Bearer public-access-token"
        )
      }),
    ).toBe(true)
    expect(
      fetchImpl.mock.calls.filter(([url]) => String(url).includes("/auth/refresh")),
    ).toHaveLength(0)
  })

  it("drops public access tokens when navigating back to private routes", async () => {
    window.history.pushState({}, "", "/view/APP_TEST/public/register")

    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      const authorization = getAuthorizationHeader(init?.headers)
      if (url.includes("/public/session")) {
        return jsonResponse({
          code: 200,
          data: {
            accessToken: "public-access-token",
            refreshToken: "public-refresh-token",
          },
          extra: {
            publicAccess: {
              type: "openxiangda_public",
              appType: "APP_TEST",
              policyCode: "public_register",
              mode: "guest",
              externalRoleCodes: ["external_visitor"],
              grants: { dataViews: ["public_lookup"] },
              issuedAt: "2026-06-18T00:00:00.000Z",
            },
          },
        })
      }
      if (url.includes("/runtime/bootstrap")) {
        return jsonResponse({
          code: 200,
          data: {
            appType: "APP_TEST",
            user:
              authorization === "Bearer public-access-token"
                ? { publicAccess: { policyCode: "public_register" } }
                : { id: "USER_TEST", username: "tester" },
            permissions: { hasFullAccess: false, roleCodes: [] },
          },
        })
      }
      if (url.includes("/runtime/routes/check")) {
        if (authorization === "Bearer public-access-token") {
          return jsonResponse({
            code: 403,
            message: "公开访问未授权访问该资源",
            data: { appType: "APP_TEST", canAccess: false },
          })
        }
        return jsonResponse({
          code: 200,
          data: { appType: "APP_TEST", canAccess: true },
        })
      }
      return jsonResponse({ code: 404 }, 404)
    })

    const Harness = ({ route }: { route: "public" | "admin" }) => (
      <OpenXiangdaProvider appType="APP_TEST" fetchImpl={fetchImpl}>
        {route === "public" ? (
          <PublicAccessGate
            policyCode="public_register"
            routeCode="public.register"
          >
            <div>public ready</div>
          </PublicAccessGate>
        ) : (
          <PermissionBoundary
            fallback={<div>admin denied</div>}
            path="/view/APP_TEST/admin"
          >
            <div>admin allowed</div>
          </PermissionBoundary>
        )}
      </OpenXiangdaProvider>
    )

    const { rerender } = render(<Harness route="public" />)

    await waitFor(() => {
      expect(screen.getByText("public ready")).toBeInTheDocument()
    })
    expect(
      fetchImpl.mock.calls.some(([url, init]) => {
        return (
          String(url).includes("/runtime/bootstrap") &&
          getAuthorizationHeader(init?.headers) === "Bearer public-access-token"
        )
      }),
    ).toBe(true)

    const callsBeforeAdminRoute = fetchImpl.mock.calls.length
    window.history.pushState({}, "", "/view/APP_TEST/admin")
    rerender(<Harness route="admin" />)

    await waitFor(() => {
      expect(screen.getByText("admin allowed")).toBeInTheDocument()
    })
    const adminRouteCalls = fetchImpl.mock.calls.slice(callsBeforeAdminRoute)
    expect(
      adminRouteCalls.some(([url, init]) => {
        return (
          String(url).includes("/runtime/bootstrap") &&
          getAuthorizationHeader(init?.headers) !== "Bearer public-access-token"
        )
      }),
    ).toBe(true)
    const routeCheckCalls = fetchImpl.mock.calls.filter(([url]) =>
      String(url).includes("/runtime/routes/check"),
    )
    expect(routeCheckCalls.length).toBeGreaterThan(0)
    expect(
      routeCheckCalls.some(([, init]) => {
        return getAuthorizationHeader(init?.headers) === "Bearer public-access-token"
      }),
    ).toBe(false)
  })

  it("logs out through /api/auth/logout", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async input => {
      const url = String(input)
      if (url.includes("/runtime/bootstrap")) {
        return jsonResponse({ code: 200, data: { appType: "APP_TEST" } })
      }
      return jsonResponse({ code: 200, message: "ok" })
    })
    const { result } = renderHook(() => useRuntimeAuth(), {
      wrapper: createWrapper(fetchImpl),
    })

    await result.current.logout()

    expect(fetchImpl).toHaveBeenCalledWith(
      "/service/api/auth/logout",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
      }),
    )
  })

  it("resolves SSO login urls when SSO is enabled", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async input => {
      const url = String(input)
      if (url.includes("/runtime/bootstrap")) {
        return jsonResponse({
          code: 200,
          data: { appType: "APP_TEST", app: { tenantId: "001" } },
        })
      }
      if (url.includes("/api/sso/status")) {
        return jsonResponse({
          code: 200,
          data: { enabled: true, protocol: "cas", tenantId: "001" },
        })
      }
      if (url.includes("/api/sso/login-url")) {
        return jsonResponse({
          code: 200,
          data: { loginUrl: "https://sso.example.com/login" },
        })
      }
      return jsonResponse({ code: 404 }, 404)
    })
    const { result } = renderHook(() => useRuntimeAuth(), {
      wrapper: createWrapper(fetchImpl),
    })

    await waitFor(() => {
      expect(fetchImpl).toHaveBeenCalledWith(
        expect.stringContaining("/runtime/bootstrap"),
        expect.anything(),
      )
    })
    await expect(
      result.current.resolveLoginUrl({
        redirectUri: "https://app.example.com/view/APP_TEST/admin",
      }),
    ).resolves.toBe("https://sso.example.com/login")
  })

  it("falls back to configured and local login urls when SSO is disabled", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async input => {
      const url = String(input)
      if (url.includes("/runtime/bootstrap")) {
        return jsonResponse({ code: 200, data: { appType: "APP_TEST" } })
      }
      if (url.includes("/api/sso/status")) {
        return jsonResponse({ code: 200, data: { enabled: false } })
      }
      return jsonResponse({ code: 404 }, 404)
    })
    const { result } = renderHook(() => useRuntimeAuth(), {
      wrapper: createWrapper(fetchImpl),
    })

    await expect(
      result.current.resolveLoginUrl({
        loginUrl: "/custom-login",
        redirectUri: "https://app.example.com/admin",
      }),
    ).resolves.toBe(
      "/custom-login?callback=https%3A%2F%2Fapp.example.com%2Fadmin",
    )

    process.env.OPENXIANGDA_LOGIN_URL = "/env-login"
    await expect(
      result.current.resolveLoginUrl({
        redirectUri: "https://app.example.com/admin",
      }),
    ).resolves.toBe(
      "/env-login?callback=https%3A%2F%2Fapp.example.com%2Fadmin",
    )
    delete process.env.OPENXIANGDA_LOGIN_URL

    await expect(
      result.current.resolveLoginUrl({
        redirectUri: "https://app.example.com/admin",
      }),
    ).resolves.toBe(
      "/platform/login?callback=https%3A%2F%2Fapp.example.com%2Fadmin",
    )
  })
})
