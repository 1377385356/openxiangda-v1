import { describe, expect, it, vi } from "vitest"
import {
  createAuthClient,
  getAuthErrorExtra,
  getAuthErrorReason,
  isAuthChallengeRequired,
} from "./auth"

describe("createAuthClient", () => {
  it("requests app auth methods through the service prefix", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        data: {
          appType: "APP",
          methods: [{ type: "password", enabled: true }],
        },
      }),
    })) as unknown as typeof fetch

    const client = createAuthClient({
      appType: "APP",
      servicePrefix: "/service",
      fetchImpl,
    })

    const result = await client.getMethods()

    expect(result.methods).toEqual([{ type: "password", enabled: true }])
    expect(fetchImpl).toHaveBeenCalledWith(
      "/service/openxiangda-api/v1/apps/APP/auth/methods",
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({ accept: "application/json" }),
      }),
    )
  })

  it("requests an app-scoped DingTalk OAuth login URL", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        data: {
          loginUrl: "https://login.dingtalk.com/oauth2/auth?state=state-1",
          expiresIn: 600,
        },
      }),
    })) as unknown as typeof fetch

    const client = createAuthClient({
      appType: "APP OAuth",
      servicePrefix: "/service/",
      fetchImpl,
    })

    const result = await client.getDingTalkOAuthUrl({
      returnUrl: "/view/APP%20OAuth/admin",
    })

    expect(result).toEqual({
      loginUrl: "https://login.dingtalk.com/oauth2/auth?state=state-1",
      expiresIn: 600,
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      "/service/openxiangda-api/v1/apps/APP%20OAuth/auth/dingtalk/oauth/start",
      expect.objectContaining({
        body: JSON.stringify({ returnUrl: "/view/APP%20OAuth/admin" }),
        credentials: "include",
        method: "POST",
      }),
    )
  })

  it("throws AuthClientError when the API envelope fails", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        code: 403,
        message: "该登录方式未启用",
        data: null,
      }),
    })) as unknown as typeof fetch

    const client = createAuthClient({ appType: "APP", fetchImpl })

    await expect(client.passwordLogin({ username: "u", password: "p" }))
      .rejects
      .toThrow("该登录方式未启用")
  })

  it("throws AuthClientError for string business error codes on HTTP 200", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        code: "PUBLIC_GRANT_DENIED",
        message: "公开访问未授权调用该资源",
        data: null,
      }),
    })) as unknown as typeof fetch

    const client = createAuthClient({ appType: "APP", fetchImpl })

    await expect(client.refresh()).rejects.toMatchObject({
      message: "公开访问未授权调用该资源",
      code: "PUBLIC_GRANT_DENIED",
    })
  })

  it("exposes login challenge metadata from app auth errors", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 460,
      json: async () => ({
        code: 460,
        message: "请先完成额外验证后再尝试登录",
        data: null,
        extra: {
          reason: "CHALLENGE_REQUIRED",
          guardCode: "LOGIN_CHALLENGE_REQUIRED",
          challenge: {
            id: "challenge-1",
            type: "math",
            question: "17 + 9 = ?",
            attemptsLeft: 3,
            expireAt: 1732864100000,
          },
        },
      }),
    })) as unknown as typeof fetch

    const client = createAuthClient({ appType: "APP", fetchImpl })

    try {
      await client.passwordLogin({ username: "u", password: "p" })
      throw new Error("expected passwordLogin to fail")
    } catch (error) {
      expect(isAuthChallengeRequired(error)).toBe(true)
      expect(getAuthErrorReason(error)).toBe("CHALLENGE_REQUIRED")
      expect(getAuthErrorExtra(error)?.guardCode).toBe("LOGIN_CHALLENGE_REQUIRED")
      expect(getAuthErrorExtra(error)?.challenge?.question).toBe("17 + 9 = ?")
    }
  })

  it("recognizes legacy app auth challenge errors without challenge details", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        code: 400,
        message: "请先完成额外验证后再尝试登录",
        data: null,
        extra: {
          reason: "LOGIN_CHALLENGE_REQUIRED",
        },
      }),
    })) as unknown as typeof fetch

    const client = createAuthClient({ appType: "APP", fetchImpl })

    await expect(
      client.passwordLogin({ username: "u", password: "p" }),
    ).rejects.toSatisfy(error => isAuthChallengeRequired(error))
  })
})
