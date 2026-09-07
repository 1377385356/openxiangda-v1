import React from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  LoginPage,
  resolveDingTalkLoginFlow,
  resolveDingTalkOAuthReturnUrl,
} from "./auth"
import { OpenXiangdaProvider } from "./openxiangdaProvider"

const setDingTalk = (value?: unknown) => {
  Object.defineProperty(window, "dd", {
    configurable: true,
    value,
  })
}

const defaultUserAgent = window.navigator.userAgent

const setUserAgent = (value: string) => {
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value,
  })
}

afterEach(() => {
  setDingTalk(undefined)
  setUserAgent(defaultUserAgent)
  window.history.pushState({}, "", "/")
})

describe("resolveDingTalkLoginFlow", () => {
  it("uses browser OAuth when DingTalk JSAPI is unavailable", () => {
    expect(resolveDingTalkLoginFlow()).toBe("oauth")
  })

  it("does not treat a loaded DingTalk SDK outside DingTalk as a container", () => {
    setDingTalk({
      env: { platform: "notInDingTalk" },
      runtime: { permission: { requestAuthCode() {} } },
    })

    expect(resolveDingTalkLoginFlow()).toBe("oauth")
  })

  it("fails safe for an unknown SDK platform", () => {
    setDingTalk({
      env: { platform: "browser" },
      requestAuthCode() {},
    })

    expect(resolveDingTalkLoginFlow()).toBe("oauth")
  })

  it("uses JSAPI only in a confirmed DingTalk container", () => {
    setDingTalk({
      env: { platform: "android" },
      runtime: { permission: { requestAuthCode() {} } },
    })

    expect(resolveDingTalkLoginFlow()).toBe("jsapi")
  })

  it("selects JSAPI from the DingTalk user agent before the SDK loads", () => {
    setUserAgent("Mozilla/5.0 AliApp(DingTalk/7.6.0)")
    expect(resolveDingTalkLoginFlow()).toBe("jsapi")
  })

  it("prefers the explicit prop over auth method configuration", () => {
    expect(
      resolveDingTalkLoginFlow("jsapi", {
        type: "dingtalk",
        flow: "oauth",
      }),
    ).toBe("jsapi")
    expect(
      resolveDingTalkLoginFlow(undefined, {
        type: "dingtalk",
        flow: "oauth",
      }),
    ).toBe("oauth")
  })
})

describe("resolveDingTalkOAuthReturnUrl", () => {
  it("normalizes a same-origin RuntimeAuthGuard callback", () => {
    expect(
      resolveDingTalkOAuthReturnUrl(
        "APP_TEST",
        `${window.location.origin}/view/APP_TEST/admin?tab=overview#section`,
      ),
    ).toBe("/view/APP_TEST/admin?tab=overview#section")
  })

  it("keeps a legal relative app path and defaults to the app root", () => {
    expect(
      resolveDingTalkOAuthReturnUrl(
        "APP_TEST",
        "/view/APP_TEST/admin/../profile?tab=security#password",
      ),
    ).toBe("/view/APP_TEST/profile?tab=security#password")
    expect(resolveDingTalkOAuthReturnUrl("APP_TEST")).toBe(
      "/view/APP_TEST",
    )
  })

  it.each([
    "https://evil.example/view/APP_TEST/admin",
    "//evil.example/view/APP_TEST/admin",
    "/view/APP_OTHER/admin",
    "/view/APP_TESTING/admin",
  ])("rejects an unsafe return URL: %s", returnUrl => {
    expect(() =>
      resolveDingTalkOAuthReturnUrl("APP_TEST", returnUrl),
    ).toThrow("钉钉登录返回地址必须位于当前应用 /view/APP_TEST 下")
  })
})

describe("LoginPage DingTalk OAuth", () => {
  it("guides WeChat users to open a browser without starting OAuth", async () => {
    setUserAgent("Mozilla/5.0 MicroMessenger/8.0.50")
    const fetchImpl = createLoginPageFetch()

    renderLoginPage(fetchImpl)
    fireEvent.click(
      await screen.findByRole("button", { name: /钉钉登录/ }),
    )

    expect(
      await screen.findByRole("dialog", {
        name: "钉钉登录浏览器打开指引",
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/点击右上角/)).toBeInTheDocument()
    expect(
      fetchImpl.mock.calls.some(([input]) =>
        String(input).includes("/auth/dingtalk/oauth/start"),
      ),
    ).toBe(false)
  })

  it("shows a retry message after an OAuth browser-context change", async () => {
    window.history.pushState(
      {},
      "",
      "/view/APP_TEST/login?oauthError=DINGTALK_OAUTH_BROWSER_CONTEXT_CHANGED",
    )

    renderLoginPage(createLoginPageFetch())

    expect(
      await screen.findByText(/请在当前浏览器重新点击/),
    ).toBeInTheDocument()
  })

  it("normalizes the guard callback before starting OAuth", async () => {
    const callback = `${window.location.origin}/view/APP_TEST/admin?tab=overview#section`
    window.history.pushState(
      {},
      "",
      `/view/APP_TEST/login?callback=${encodeURIComponent(callback)}`,
    )
    const fetchImpl = createLoginPageFetch()

    renderLoginPage(fetchImpl)
    fireEvent.click(
      await screen.findByRole("button", { name: /钉钉登录/ }),
    )

    await waitFor(() => {
      expect(fetchImpl).toHaveBeenCalledWith(
        "/service/openxiangda-api/v1/apps/APP_TEST/auth/dingtalk/oauth/start",
        expect.objectContaining({
          body: JSON.stringify({
            returnUrl: "/view/APP_TEST/admin?tab=overview#section",
          }),
          method: "POST",
        }),
      )
    })
  })

  it("rejects an external callback without starting OAuth", async () => {
    window.history.pushState(
      {},
      "",
      `/view/APP_TEST/login?callback=${encodeURIComponent(
        "https://evil.example/view/APP_TEST/admin",
      )}`,
    )
    const fetchImpl = createLoginPageFetch()

    renderLoginPage(fetchImpl)
    fireEvent.click(
      await screen.findByRole("button", { name: /钉钉登录/ }),
    )

    expect(
      await screen.findByText(
        "钉钉登录返回地址必须位于当前应用 /view/APP_TEST 下",
      ),
    ).toBeInTheDocument()
    expect(
      fetchImpl.mock.calls.some(([input]) =>
        String(input).includes("/auth/dingtalk/oauth/start"),
      ),
    ).toBe(false)
  })
})

const renderLoginPage = (fetchImpl: typeof fetch) =>
  render(
    React.createElement(
      OpenXiangdaProvider,
      { appType: "APP_TEST", fetchImpl },
      React.createElement(LoginPage),
    ),
  )

const createLoginPageFetch = () =>
  vi.fn<typeof fetch>(async input => {
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
    if (url.includes("/auth/methods")) {
      return jsonResponse({
        code: 200,
        data: {
          appType: "APP_TEST",
          methods: [
            { type: "dingtalk", enabled: true, label: "钉钉登录" },
          ],
        },
      })
    }
    if (url.includes("/auth/dingtalk/oauth/start")) {
      return jsonResponse({
        code: 200,
        data: { loginUrl: "#dingtalk-oauth", expiresIn: 600 },
      })
    }
    return jsonResponse({ code: 404, message: "not found" }, 404)
  })

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  })
