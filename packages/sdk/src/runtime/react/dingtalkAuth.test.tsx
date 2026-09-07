import React from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import {
  detectDingTalkLoginEnvironment,
  DingTalkExternalBrowserGuide,
  getDingTalkOAuthRecoveryMessage,
  requestDingTalkAuthCode,
} from "./dingtalkAuth"

describe("DingTalk login environment", () => {
  it("distinguishes DingTalk, WeChat, and regular browsers", () => {
    expect(
      detectDingTalkLoginEnvironment({
        navigator: { userAgent: "Mozilla/5.0 MicroMessenger/8.0.50" },
      }),
    ).toBe("wechat")
    expect(
      detectDingTalkLoginEnvironment({
        navigator: { userAgent: "Mozilla/5.0 AliApp(DingTalk/7.6.0)" },
      }),
    ).toBe("dingtalk")
    expect(
      detectDingTalkLoginEnvironment({
        dd: { env: { platform: "android" } },
        navigator: { userAgent: "Mozilla/5.0" },
      }),
    ).toBe("dingtalk")
    expect(
      detectDingTalkLoginEnvironment({
        navigator: { userAgent: "Mozilla/5.0 Chrome/126.0" },
      }),
    ).toBe("browser")
  })

  it("extracts the stable cross-browser OAuth recovery message", () => {
    expect(
      getDingTalkOAuthRecoveryMessage(
        "?oauthError=DINGTALK_OAUTH_BROWSER_CONTEXT_CHANGED",
      ),
    ).toContain("请在当前浏览器重新点击")
    expect(getDingTalkOAuthRecoveryMessage("?oauthError=OTHER")).toBeUndefined()
  })
})

describe("DingTalkExternalBrowserGuide", () => {
  it("renders the top-right browser-opening instruction", () => {
    render(
      <DingTalkExternalBrowserGuide
        appName="公共实验技术服务平台"
        open
      />,
    )

    expect(
      screen.getByRole("dialog", { name: "钉钉登录浏览器打开指引" }),
    ).toBeInTheDocument()
    expect(screen.getByText(/点击右上角/)).toBeInTheDocument()
    expect(screen.getAllByText(/在浏览器中打开/).length).toBeGreaterThan(0)
    expect(screen.getByText(/公共实验技术服务平台/)).toBeInTheDocument()
  })

  it("does not render when closed", () => {
    render(<DingTalkExternalBrowserGuide open={false} />)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})

describe("requestDingTalkAuthCode", () => {
  it("passes both clientId and corpId to the reusable JSAPI bridge", async () => {
    const requestAuthCode = vi.fn((options: any) => {
      options.onSuccess({ code: "auth-code" })
    })

    await expect(
      requestDingTalkAuthCode({
        client: { runtime: { permission: { requestAuthCode } } },
        clientId: "client-id",
        corpId: "corp-id",
      }),
    ).resolves.toBe("auth-code")
    expect(requestAuthCode).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "client-id",
        corpId: "corp-id",
      }),
    )
  })
})
