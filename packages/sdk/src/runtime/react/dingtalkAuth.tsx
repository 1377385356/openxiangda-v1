import React, { type CSSProperties, type ReactNode } from "react"

const DINGTALK_JSAPI_SCRIPT_ID = "openxiangda-dingtalk-jsapi"
const DINGTALK_JSAPI_URL =
  "https://g.alicdn.com/dingding/dingtalk-jsapi/3.2.9/dingtalk.open.js"
const DINGTALK_JSAPI_INTEGRITY =
  "sha384-XjiH2Ot8CzSAVT4P5YPH4aM+aewyLaotRABETRFZRd2KafiF+6Jmuf+y6L+Y/EcH"

export const DINGTALK_OAUTH_BROWSER_CONTEXT_CHANGED =
  "DINGTALK_OAUTH_BROWSER_CONTEXT_CHANGED"

export type DingTalkLoginEnvironment = "dingtalk" | "wechat" | "browser"

type DingTalkAuthCodeResult = {
  code?: string
  [key: string]: unknown
}

type DingTalkAuthCodeOptions = {
  clientId: string
  corpId: string
  onSuccess: (result: DingTalkAuthCodeResult | string) => void
  onFail: (error: unknown) => void
}

type DingTalkAuthCodeRequest = (options: DingTalkAuthCodeOptions) => unknown

export type DingTalkClient = {
  env?: { platform?: string }
  error?: (callback: (error: unknown) => void) => void
  ready?: (callback: () => void) => void
  requestAuthCode?: DingTalkAuthCodeRequest
  runtime?: { permission?: { requestAuthCode?: DingTalkAuthCodeRequest } }
}

export type DingTalkBrowserContext = {
  dd?: DingTalkClient
  navigator?: { userAgent?: string }
}

export type LoadDingTalkClientOptions = {
  timeoutMs?: number
}

export type RequestDingTalkAuthCodeOptions = {
  clientId: string
  corpId: string
  client?: DingTalkClient
  timeoutMs?: number
}

export interface DingTalkExternalBrowserGuideProps {
  open: boolean
  appName?: ReactNode
  className?: string
  style?: CSSProperties
  title?: ReactNode
  description?: ReactNode
}

let dingTalkLoadPromise: Promise<DingTalkClient> | null = null

export function detectDingTalkLoginEnvironment(
  context = currentBrowserContext(),
): DingTalkLoginEnvironment {
  if (isDingTalkContainer(context)) return "dingtalk"
  if (isWeChatBrowser(context)) return "wechat"
  return "browser"
}

export function isWeChatBrowser(context = currentBrowserContext()) {
  return /MicroMessenger/i.test(context?.navigator?.userAgent || "")
}

export function isDingTalkContainer(context = currentBrowserContext()) {
  if (!context) return false
  if (/DingTalk|AliApp\(DingTalk/i.test(context.navigator?.userAgent || "")) {
    return true
  }

  const platform = String(context.dd?.env?.platform || "").trim().toLowerCase()
  return [
    "android",
    "iphone",
    "ipad",
    "ios",
    "pc",
    "mac",
    "windows",
    "win",
  ].includes(platform)
}

export function isDingTalkJsApiReady(context = currentBrowserContext()) {
  return Boolean(resolveAuthCodeRequest(context?.dd))
}

export function getDingTalkClient(context = currentBrowserContext()) {
  return context?.dd
}

export function loadDingTalkClient({
  timeoutMs = 5_000,
}: LoadDingTalkClientOptions = {}) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("当前环境无法加载钉钉登录组件"))
  }
  if (!isDingTalkContainer()) {
    return Promise.reject(new Error("当前页面不在钉钉客户端内"))
  }
  if (!dingTalkLoadPromise) {
    const promise = loadDingTalkClientOnce(timeoutMs)
    dingTalkLoadPromise = promise
    void promise.then(
      () => undefined,
      () => {
        if (dingTalkLoadPromise === promise) dingTalkLoadPromise = null
      },
    )
  }
  return dingTalkLoadPromise
}

export function requestDingTalkAuthCode({
  clientId,
  corpId,
  client = getDingTalkClient(),
  timeoutMs = 10_000,
}: RequestDingTalkAuthCodeOptions) {
  const normalizedClientId = String(clientId || "").trim()
  const normalizedCorpId = String(corpId || "").trim()
  if (!normalizedClientId || !normalizedCorpId) {
    return Promise.reject(new Error("钉钉登录配置不完整，请联系平台管理员"))
  }

  const resolved = resolveAuthCodeRequest(client)
  if (!resolved) {
    return Promise.reject(new Error("钉钉免登组件尚未就绪，请稍后重试"))
  }

  return new Promise<string>((resolve, reject) => {
    let settled = false
    const finish = (operation: () => void) => {
      if (settled) return
      settled = true
      globalThis.clearTimeout(timer)
      operation()
    }
    const succeed = (result: DingTalkAuthCodeResult | string) => {
      const code =
        typeof result === "string"
          ? result.trim()
          : String(result?.code || "").trim()
      if (!code) {
        finish(() => reject(new Error("钉钉未返回免登码，请重新登录")))
        return
      }
      finish(() => resolve(code))
    }
    const fail = (error: unknown) =>
      finish(() => reject(normalizeDingTalkError(error)))
    const timer = globalThis.setTimeout(
      () => fail(new Error("钉钉身份校验超时，请重新登录")),
      timeoutMs,
    )

    try {
      const returned = resolved.request.call(resolved.thisArg, {
        clientId: normalizedClientId,
        corpId: normalizedCorpId,
        onSuccess: succeed,
        onFail: fail,
      })
      if (isPromiseLike(returned)) {
        void returned.then(result => {
          if (result !== undefined) {
            succeed(result as DingTalkAuthCodeResult | string)
          }
        }, fail)
      }
    } catch (error) {
      fail(error)
    }
  })
}

export function getDingTalkOAuthRecoveryMessage(
  search: string | URLSearchParams = getCurrentSearch(),
) {
  const query =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search
  if (
    query.get("oauthError") !== DINGTALK_OAUTH_BROWSER_CONTEXT_CHANGED
  ) {
    return undefined
  }
  return "检测到授权过程中切换了浏览器，请在当前浏览器重新点击“使用钉钉登录”。"
}

export const DingTalkExternalBrowserGuide: React.FC<
  DingTalkExternalBrowserGuideProps
> = ({
  open,
  appName,
  className,
  style,
  title = "请在浏览器中打开",
  description,
}) => {
  if (!open) return null

  return (
    <div
      aria-label="钉钉登录浏览器打开指引"
      aria-modal="true"
      className={className}
      role="dialog"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2_147_483_646,
        overflow: "hidden",
        color: "#fff",
        background: "rgba(15, 23, 42, 0.86)",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
        ...style,
      }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 96 112"
        style={{
          position: "absolute",
          top: "max(12px, env(safe-area-inset-top))",
          right: 12,
          width: 96,
          height: 112,
          overflow: "visible",
        }}
      >
        <path
          d="M48 102V25M48 25 20 53M48 25l28 28"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="6"
        />
      </svg>

      <div
        style={{
          position: "absolute",
          top: "max(126px, calc(env(safe-area-inset-top) + 112px))",
          left: 24,
          right: 24,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            lineHeight: 1.45,
            letterSpacing: "0.02em",
          }}
        >
          点击右上角「···」
          <br />
          选择「在浏览器中打开」
        </div>
        <div
          style={{
            marginTop: 22,
            fontSize: 16,
            fontWeight: 600,
            lineHeight: 1.6,
          }}
        >
          {title}
        </div>
        <div
          style={{
            maxWidth: 360,
            margin: "8px auto 0",
            color: "rgba(255, 255, 255, 0.78)",
            fontSize: 14,
            lineHeight: 1.65,
          }}
        >
          {description || (
            <>
              微信内置浏览器无法共享钉钉登录校验信息
              {appName ? <>，请在浏览器中打开后继续使用{appName}</> : ""}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

async function loadDingTalkClientOnce(timeoutMs: number) {
  const existingClient = getDingTalkClient()
  if (existingClient) {
    await waitForDingTalkReady(existingClient, timeoutMs)
    if (!resolveAuthCodeRequest(existingClient)) {
      throw new Error("当前钉钉版本不支持免登，请升级钉钉后重试")
    }
    return existingClient
  }

  await ensureDingTalkScript(timeoutMs)
  const client = getDingTalkClient()
  if (!client) throw new Error("钉钉登录组件加载失败，请重新打开页面")
  await waitForDingTalkReady(client, timeoutMs)
  if (!resolveAuthCodeRequest(client)) {
    throw new Error("当前钉钉版本不支持免登，请升级钉钉后重试")
  }
  return client
}

function ensureDingTalkScript(timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    let settled = false
    let script = document.getElementById(
      DINGTALK_JSAPI_SCRIPT_ID,
    ) as HTMLScriptElement | null
    const created = !script
    if (!script) {
      script = document.createElement("script")
      script.id = DINGTALK_JSAPI_SCRIPT_ID
      script.async = true
      script.crossOrigin = "anonymous"
      script.integrity = DINGTALK_JSAPI_INTEGRITY
      script.src = DINGTALK_JSAPI_URL
    }

    const cleanup = () => {
      window.clearInterval(poll)
      window.clearTimeout(timer)
      script?.removeEventListener("load", onLoad)
      script?.removeEventListener("error", onError)
    }
    const succeed = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      cleanup()
      if (created) script?.remove()
      reject(error)
    }
    const onLoad = () => succeed()
    const onError = () =>
      fail(new Error("钉钉登录组件加载失败，请检查网络后重试"))
    const poll = window.setInterval(() => {
      if (getDingTalkClient()) succeed()
    }, 50)
    const timer = window.setTimeout(
      () => fail(new Error("钉钉登录组件加载超时，请重新打开页面")),
      timeoutMs,
    )

    script.addEventListener("load", onLoad, { once: true })
    script.addEventListener("error", onError, { once: true })
    if (created) document.head.append(script)
  })
}

function waitForDingTalkReady(client: DingTalkClient, timeoutMs: number) {
  const ready = client.ready
  if (typeof ready !== "function") {
    return resolveAuthCodeRequest(client)
      ? Promise.resolve()
      : Promise.reject(new Error("钉钉免登组件尚未就绪，请稍后重试"))
  }

  return new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = (operation: () => void) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      operation()
    }
    const timer = window.setTimeout(
      () =>
        finish(() =>
          reject(new Error("钉钉登录环境初始化超时，请重新打开页面")),
        ),
      timeoutMs,
    )
    try {
      client.error?.(error =>
        finish(() => reject(normalizeDingTalkError(error))),
      )
      ready.call(client, () => finish(resolve))
    } catch (error) {
      finish(() => reject(normalizeDingTalkError(error)))
    }
  })
}

function resolveAuthCodeRequest(client?: DingTalkClient) {
  const runtimeRequest = client?.runtime?.permission?.requestAuthCode
  if (typeof runtimeRequest === "function") {
    return { request: runtimeRequest, thisArg: client?.runtime?.permission }
  }
  if (typeof client?.requestAuthCode === "function") {
    return { request: client.requestAuthCode, thisArg: client }
  }
  return undefined
}

function normalizeDingTalkError(error: unknown) {
  if (error instanceof Error) return error
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>
    const message = record.errorMessage || record.errMsg || record.message
    if (typeof message === "string" && message.trim()) {
      return new Error(message.trim())
    }
  }
  return new Error(String(error || "钉钉身份校验失败，请重新登录"))
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return Boolean(
    value && typeof (value as PromiseLike<unknown>).then === "function",
  )
}

function currentBrowserContext(): DingTalkBrowserContext | undefined {
  if (typeof window === "undefined") return undefined
  return window as unknown as DingTalkBrowserContext
}

function getCurrentSearch() {
  return typeof window === "undefined" ? "" : window.location.search
}
