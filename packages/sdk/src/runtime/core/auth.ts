import { createBoundFetch } from "./fetch"

export type AuthMethodType =
  | "password"
  | "dingtalk"
  | "sso"
  | "guest"
  | "phone_code"
  | string

export type DingTalkLoginFlow = "auto" | "jsapi" | "oauth"

export interface AuthMethod {
  type: AuthMethodType
  enabled?: boolean
  label?: string
  protocol?: string
  flow?: DingTalkLoginFlow
  [key: string]: unknown
}

export interface LoginMethodsResult {
  appType: string
  configCode?: string
  methods: AuthMethod[]
  registration?: {
    mode?: string
    [key: string]: unknown
  }
  security?: {
    hideFailureReason?: boolean
    [key: string]: unknown
  }
  defaultRedirectUrl?: string
}

export interface AuthUser {
  id: string
  username?: string
  name?: string
  phone?: string | null
  email?: string | null
  avatar?: string | null
  jobNumber?: string | null
  departments?: Array<Record<string, unknown>>
  affiliatedDepartmentId?: string | null
  affiliatedDepartment?: Record<string, unknown> | null
  [key: string]: unknown
}

export interface AuthTokenData {
  accessToken: string
  refreshToken: string
  token?: string
  accessTokenExpiresAt?: number
  refreshTokenExpiresAt?: number
  user?: AuthUser
  guestUser?: AuthUser
  [key: string]: unknown
}

export interface PhoneCodeSendResult {
  challengeId: string
  expiresAt?: string | Date
  ttlSeconds?: number
  message?: string
}

export interface AuthChallengePayload {
  id?: string
  challengeId?: string
  type?: string
  question?: string
  attemptsLeft?: number
  expireAt?: number | string | Date
  expiresAt?: number | string | Date
  [key: string]: unknown
}

export interface AuthErrorExtra {
  reason?: string
  guardCode?: string
  challenge?: AuthChallengePayload
  retryAfter?: number
  retryAfterSeconds?: number
  remainingAttempts?: number
  lockUntil?: string | Date | null
  [key: string]: unknown
}

export interface SsoLoginUrlResult {
  loginUrl: string
  protocol?: string
}

export interface DingTalkOAuthStartInput {
  returnUrl?: string
}

export interface DingTalkOAuthStartResult {
  loginUrl: string
  expiresIn: number
}

export interface AuthClientOptions {
  appType: string
  servicePrefix?: string
  fetchImpl?: typeof fetch
}

export interface PasswordLoginInput {
  username: string
  password: string
  clientFingerprint?: string
  challengeId?: string
  challengeAnswer?: string
}

export interface DingTalkLoginInput {
  code: string
  corpId?: string
}

export interface GuestLoginInput {
  guestIdentifier?: string
  domain?: string
  ipAddress?: string
  userAgent?: string
  formUuid?: string
}

export interface PhoneCodeInput {
  phone: string
  purpose?: "login" | "register" | string
}

export interface PhoneCodeLoginInput {
  phone: string
  code: string
  challengeId?: string
}

export interface PhoneCodeRegisterInput extends PhoneCodeLoginInput {
  name?: string
  email?: string
}

export interface SsoLoginUrlInput {
  protocol?: string
  redirectUri?: string
}

export interface RefreshInput {
  refreshToken?: string
}

export interface ResolveLoginUrlInput {
  callbackUrl?: string
  callbackParamName?: string
  loginUrl?: string
}

export interface AppAuthClient {
  appType: string
  servicePrefix: string
  getMethods: () => Promise<LoginMethodsResult>
  passwordLogin: (input: PasswordLoginInput) => Promise<AuthTokenData>
  dingtalkLogin: (input: DingTalkLoginInput) => Promise<AuthTokenData>
  getDingTalkOAuthUrl: (
    input?: DingTalkOAuthStartInput,
  ) => Promise<DingTalkOAuthStartResult>
  guestLogin: (input?: GuestLoginInput) => Promise<AuthTokenData>
  sendPhoneCode: (input: PhoneCodeInput) => Promise<PhoneCodeSendResult>
  phoneCodeLogin: (input: PhoneCodeLoginInput) => Promise<AuthTokenData>
  registerWithPhoneCode: (
    input: PhoneCodeRegisterInput,
  ) => Promise<AuthTokenData>
  getSsoLoginUrl: (input?: SsoLoginUrlInput) => Promise<SsoLoginUrlResult>
  refresh: (input?: RefreshInput) => Promise<AuthTokenData>
  logout: () => Promise<void>
  resolveLoginUrl: (input?: ResolveLoginUrlInput) => string
}

export interface AuthClientErrorOptions {
  status?: number
  code?: number | string
  payload?: unknown
  extra?: AuthErrorExtra
}

export class AuthClientError extends Error {
  status?: number
  code?: number | string
  payload?: unknown
  extra?: AuthErrorExtra
  reason?: string
  challenge?: AuthChallengePayload
  retryAfter?: number
  remainingAttempts?: number
  lockUntil?: string | Date | null

  constructor(message: string, options: AuthClientErrorOptions = {}) {
    super(message)
    this.name = "AuthClientError"
    this.status = options.status
    this.code = options.code
    this.payload = options.payload
    this.extra = normalizeAuthErrorExtra(
      options.extra || getRecordValue(options.payload, "extra"),
    )
    this.reason =
      this.extra?.reason ||
      this.extra?.guardCode ||
      (typeof options.code === "string" ? options.code : undefined)
    this.challenge = this.extra?.challenge
    this.retryAfter = readNumber(
      this.extra?.retryAfter ?? this.extra?.retryAfterSeconds,
    )
    this.remainingAttempts = readNumber(this.extra?.remainingAttempts)
    this.lockUntil = (this.extra?.lockUntil as string | Date | null | undefined) ?? null
  }
}

export const isAuthClientError = (error: unknown): error is AuthClientError => {
  if (error instanceof AuthClientError) return true
  return Boolean(
    error &&
      typeof error === "object" &&
      (error as Record<string, unknown>).name === "AuthClientError",
  )
}

export const getAuthErrorExtra = (
  error: unknown,
): AuthErrorExtra | undefined => {
  if (!error || typeof error !== "object") return undefined
  const record = error as Record<string, unknown>
  return normalizeAuthErrorExtra(record.extra || getRecordValue(record.payload, "extra"))
}

export const getAuthErrorReason = (error: unknown) => {
  if (!error || typeof error !== "object") return undefined
  const record = error as Record<string, unknown>
  const extra = getAuthErrorExtra(error)
  return (
    extra?.reason ||
    extra?.guardCode ||
    (typeof record.reason === "string" ? record.reason : undefined) ||
    (typeof record.code === "string" ? record.code : undefined)
  )
}

export const isAuthChallengeRequired = (error: unknown) => {
  if (!error || typeof error !== "object") return false
  const record = error as Record<string, unknown>
  const code = record.code
  const reason = getAuthErrorReason(error)
  const extra = getAuthErrorExtra(error)
  return (
    code === 460 ||
    code === "460" ||
    code === "LOGIN_CHALLENGE_REQUIRED" ||
    reason === "LOGIN_CHALLENGE_REQUIRED" ||
    reason === "CHALLENGE_REQUIRED" ||
    extra?.guardCode === "LOGIN_CHALLENGE_REQUIRED"
  )
}

export const createAuthClient = ({
  appType,
  servicePrefix = "/service",
  fetchImpl,
}: AuthClientOptions): AppAuthClient => {
  const normalizedAppType = String(appType || "").trim()
  if (!normalizedAppType) {
    throw new Error("appType 不能为空")
  }
  const boundFetch = createBoundFetch(fetchImpl)
  const request = async <T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> => {
    const response = await boundFetch(buildServiceUrl(servicePrefix, path), {
      credentials: "include",
      ...options,
      headers: {
        accept: "application/json",
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    })
    const payload = await readPayload(response)
    const code = getRecordValue(payload, "code")
    const success = getRecordValue(payload, "success")
    if (!response.ok || success === false || !isSuccessCode(code)) {
      throw new AuthClientError(
        String(getRecordValue(payload, "message") || `Auth request failed: ${response.status}`),
        {
          status: response.status,
          code: code as number | string | undefined,
          payload,
          extra: normalizeAuthErrorExtra(getRecordValue(payload, "extra")),
        },
      )
    }
    return unwrapPayload<T>(payload)
  }

  const appAuthPath = (suffix: string) =>
    `/openxiangda-api/v1/apps/${encodeURIComponent(normalizedAppType)}/auth${suffix}`

  return {
    appType: normalizedAppType,
    servicePrefix,
    getMethods: () => request<LoginMethodsResult>(appAuthPath("/methods")),
    passwordLogin: input =>
      request<AuthTokenData>(appAuthPath("/password/login"), postJson(input)),
    dingtalkLogin: input =>
      request<AuthTokenData>(appAuthPath("/dingtalk/login"), postJson(input)),
    getDingTalkOAuthUrl: input =>
      request<DingTalkOAuthStartResult>(
        appAuthPath("/dingtalk/oauth/start"),
        postJson(input || {}),
      ),
    guestLogin: input =>
      request<AuthTokenData>(appAuthPath("/guest/login"), postJson(input || {})),
    sendPhoneCode: input =>
      request<PhoneCodeSendResult>(appAuthPath("/phone-code/send"), postJson(input)),
    phoneCodeLogin: input =>
      request<AuthTokenData>(appAuthPath("/phone-code/login"), postJson(input)),
    registerWithPhoneCode: input =>
      request<AuthTokenData>(appAuthPath("/phone-code/register"), postJson(input)),
    getSsoLoginUrl: input =>
      request<SsoLoginUrlResult>(appAuthPath("/sso/login-url"), postJson(input || {})),
    refresh: input =>
      request<AuthTokenData>(appAuthPath("/refresh"), postJson(input || {})),
    logout: async () => {
      await request<null>(appAuthPath("/logout"), { method: "POST" })
    },
    resolveLoginUrl: input =>
      resolveLoginUrl(normalizedAppType, input || {}),
  }
}

const postJson = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body || {}),
})

const buildServiceUrl = (servicePrefix: string, path: string) => {
  const prefix = servicePrefix.endsWith("/")
    ? servicePrefix.slice(0, -1)
    : servicePrefix
  const suffix = path.startsWith("/") ? path : `/${path}`
  return `${prefix}${suffix}`
}

const readPayload = async (response: Response) => {
  try {
    return await response.json()
  } catch {
    return null
  }
}

const unwrapPayload = <T>(payload: unknown): T => {
  if (!payload || typeof payload !== "object") return payload as T
  const record = payload as Record<string, unknown>
  if ("data" in record) return record.data as T
  return payload as T
}

const getRecordValue = (value: unknown, key: string) => {
  if (!value || typeof value !== "object") return undefined
  return (value as Record<string, unknown>)[key]
}

const normalizeAuthErrorExtra = (value: unknown): AuthErrorExtra | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const challenge =
    record.challenge && typeof record.challenge === "object" && !Array.isArray(record.challenge)
      ? (record.challenge as AuthChallengePayload)
      : undefined
  const reason = readString(record.reason)
  const guardCode = readString(record.guardCode)
  return {
    ...record,
    ...(reason ? { reason } : {}),
    ...(guardCode ? { guardCode } : {}),
    ...(challenge ? { challenge } : {}),
    ...(readNumber(record.retryAfter) !== undefined
      ? { retryAfter: readNumber(record.retryAfter) }
      : {}),
    ...(readNumber(record.retryAfterSeconds) !== undefined
      ? { retryAfterSeconds: readNumber(record.retryAfterSeconds) }
      : {}),
    ...(readNumber(record.remainingAttempts) !== undefined
      ? { remainingAttempts: readNumber(record.remainingAttempts) }
      : {}),
  } as AuthErrorExtra
}

const readString = (value: unknown) =>
  typeof value === "string" ? value : undefined

const readNumber = (value: unknown) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : undefined
}

const isSuccessCode = (code: unknown) => {
  if (code === undefined || code === null || code === "") return true
  const normalized = Number(code)
  return Number.isFinite(normalized)
    ? normalized === 0 || (normalized >= 200 && normalized < 300)
    : false
}

const resolveLoginUrl = (
  appType: string,
  {
    callbackUrl = getCurrentHref(),
    callbackParamName = "callback",
    loginUrl,
  }: ResolveLoginUrlInput,
) => {
  const target = loginUrl || `/view/${encodeURIComponent(appType)}/login`
  if (!callbackUrl) return target
  try {
    const base =
      typeof window !== "undefined" ? window.location.origin : "http://localhost"
    const url = new URL(target, base)
    if (!url.searchParams.has(callbackParamName)) {
      url.searchParams.set(callbackParamName, callbackUrl)
    }
    if (target.startsWith("http://") || target.startsWith("https://")) {
      return url.toString()
    }
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    const separator = target.includes("?") ? "&" : "?"
    return `${target}${separator}${callbackParamName}=${encodeURIComponent(callbackUrl)}`
  }
}

const getCurrentHref = () =>
  typeof window === "undefined" ? "" : window.location.href
