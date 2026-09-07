import { beforeEach, describe, expect, it, vi } from "vitest"
import { createPublicAccessClient } from "./publicAccess"

describe("createPublicAccessClient", () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it("posts the public session DTO to the app public session endpoint", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          code: 200,
          message: "success",
          data: {
            accessToken: "access-token",
            refreshToken: "refresh-token",
            guestUser: { id: "guest-1", name: "游客" },
          },
          extra: {
            publicAccess: {
              type: "openxiangda_public",
              appType: "app_demo",
              policyCode: "public_register",
              mode: "guest",
              externalRoleCodes: ["external_visitor"],
              grants: { forms: ["FORM_UUID"] },
              issuedAt: "2026-06-18T00:00:00.000Z",
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    })
    const client = createPublicAccessClient({
      appType: "app_demo",
      servicePrefix: "/service",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    const session = await client.startSession({
      policyCode: "public_register",
      routeCode: "public.register",
      path: "/view/app_demo/public/register",
      ticket: "ticket-1",
      domain: "example.com",
      guestIdentifier: "public:app_demo:test",
      userAgent: "vitest",
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(
      "/service/openxiangda-api/v1/apps/app_demo/public/session",
    )
    expect(init?.method).toBe("POST")
    expect(init?.credentials).toBe("include")
    expect(JSON.parse(String(init?.body))).toEqual({
      policyCode: "public_register",
      routeCode: "public.register",
      path: "/view/app_demo/public/register",
      ticket: "ticket-1",
      domain: "example.com",
      guestIdentifier: "public:app_demo:test",
      userAgent: "vitest",
    })
    expect(session.publicAccess?.policyCode).toBe("public_register")
    expect(session.accessToken).toBe("access-token")
  })

  it("rejects HTTP 200 public session envelopes with string error codes", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          code: "PUBLIC_GRANT_DENIED",
          message: "公开访问未授权访问该入口",
          data: null,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    })
    const client = createPublicAccessClient({
      appType: "app_demo",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await expect(client.startSession({ policyCode: "public_register" }))
      .rejects
      .toMatchObject({
        message: "公开访问未授权访问该入口",
        code: "PUBLIC_GRANT_DENIED",
      })
  })

  it("singleflights concurrent requests and reuses a valid tab session", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          code: 200,
          data: {
            accessToken: "access-token",
            refreshToken: "refresh-token",
            accessTokenExpiresAt: Date.now() + 60 * 60 * 1000,
          },
          extra: {
            publicAccess: {
              type: "openxiangda_public",
              appType: "app_demo",
              policyCode: "public_home",
              mode: "guest",
              externalRoleCodes: ["external_visitor"],
              grants: { functions: ["portal_public_query"] },
              issuedAt: new Date().toISOString(),
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )
    const input = {
      policyCode: "public_home",
      routeCode: "public.home",
      path: "/view/app_demo/public/home",
      domain: "example.com",
      guestIdentifier: "public:app_demo:stable",
    }
    const client = createPublicAccessClient({
      appType: "app_demo",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    const [first, second] = await Promise.all([
      client.startSession(input),
      client.startSession(input),
    ])
    const nextClient = createPublicAccessClient({
      appType: "app_demo",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const third = await nextClient.startSession(input)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(first.accessToken).toBe("access-token")
    expect(second.accessToken).toBe("access-token")
    expect(third.accessToken).toBe("access-token")
  })

  it("refreshes sessions inside the five minute renewal window", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          code: 200,
          data: {
            accessToken: `access-${fetchImpl.mock.calls.length}`,
            refreshToken: "refresh-token",
            accessTokenExpiresAt: Date.now() + 4 * 60 * 1000,
          },
          extra: {
            publicAccess: {
              type: "openxiangda_public",
              appType: "app_demo",
              policyCode: "public_home",
              mode: "guest",
              externalRoleCodes: [],
              grants: {},
              issuedAt: new Date().toISOString(),
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )
    const client = createPublicAccessClient({
      appType: "app_demo",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const input = {
      policyCode: "public_home",
      path: "/view/app_demo/public/home",
      domain: "example.com",
      guestIdentifier: "public:app_demo:renew",
    }

    await client.startSession(input)
    await client.startSession(input)

    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("isolates cached sessions by policy and route", async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      return new Response(
        JSON.stringify({
          code: 200,
          data: {
            accessToken: `access-${body.policyCode}`,
            refreshToken: "refresh-token",
            accessTokenExpiresAt: Date.now() + 60 * 60 * 1000,
          },
          extra: {
            publicAccess: {
              type: "openxiangda_public",
              appType: "app_demo",
              policyCode: body.policyCode,
              routeCode: body.routeCode,
              mode: "guest",
              externalRoleCodes: [],
              grants: {},
              issuedAt: new Date().toISOString(),
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    })
    const client = createPublicAccessClient({
      appType: "app_demo",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const shared = {
      path: "/view/app_demo/public/home",
      domain: "example.com",
      guestIdentifier: "public:app_demo:isolation",
    }

    await client.startSession({
      ...shared,
      policyCode: "public_home",
      routeCode: "public.home",
    })
    await client.startSession({
      ...shared,
      policyCode: "public_news",
      routeCode: "public.news",
    })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
