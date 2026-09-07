import { createBoundFetch } from "./fetch"
import type { AuthTokenData } from "./auth"

export type PublicStorageAction = "upload" | "preview" | "download"

export interface PublicStorageGrant {
  bucketName: string
  actions: PublicStorageAction[]
  allowedMimeTypes?: string[]
  allowedExtensions?: string[]
  maxSizeBytes?: number
  visibility?: "public" | "private"
  pathPrefix?: string
}

export interface PublicFormGrant {
  code?: string
  formUuid?: string
  actions?: string[]
  fields?: string[]
  fieldIds?: string[]
  upload?: Omit<PublicStorageGrant, "actions"> & { bucketName?: string }
  [key: string]: unknown
}

export interface PublicAccessClaim {
  type: "openxiangda_public"
  appType: string
  policyCode: string
  routeCode?: string
  pathPattern?: string
  mode: "guest" | "ticket"
  externalRoleCodes: string[]
  grants: {
    forms?: Array<string | PublicFormGrant>
    dataViews?: string[]
    functions?: string[]
    connectors?: string[]
    storage?: PublicStorageGrant[]
  }
  issuedAt: string
  expiresAt?: string | null
  ticketId?: string | null
  guestIdentifier?: string
}

export interface PublicAccessSessionInput {
  policyCode?: string
  routeCode?: string
  path?: string
  ticket?: string
  guestIdentifier?: string
  domain?: string
  ipAddress?: string
  userAgent?: string
}

export interface PublicAccessSessionData extends AuthTokenData {
  publicAccess?: PublicAccessClaim | null
  raw?: unknown
}

export interface PublicAccessClientOptions {
  appType: string
  servicePrefix?: string
  fetchImpl?: typeof fetch
}

export interface PublicAccessClient {
  appType: string
  servicePrefix: string
  startSession: (
    input?: PublicAccessSessionInput,
  ) => Promise<PublicAccessSessionData>
  clearSession: (input?: PublicAccessSessionInput) => void
}

const PUBLIC_SESSION_RENEW_WINDOW_MS = 5 * 60 * 1000
const publicSessionInflight = new Map<string, Promise<PublicAccessSessionData>>()

export class PublicAccessClientError extends Error {
  status?: number
  code?: number | string
  payload?: unknown

  constructor(
    message: string,
    options: { status?: number; code?: number | string; payload?: unknown } = {},
  ) {
    super(message)
    this.name = "PublicAccessClientError"
    this.status = options.status
    this.code = options.code
    this.payload = options.payload
  }
}

export const createPublicAccessClient = ({
  appType,
  servicePrefix = "/service",
  fetchImpl,
}: PublicAccessClientOptions): PublicAccessClient => {
  const normalizedAppType = String(appType || "").trim()
  if (!normalizedAppType) {
    throw new Error("appType 不能为空")
  }
  const boundFetch = createBoundFetch(fetchImpl)
  const request = async (
    input: PublicAccessSessionInput = {},
  ): Promise<PublicAccessSessionData> => {
    const body: PublicAccessSessionInput = {
      ...input,
      path: input.path || getCurrentPathname(),
      domain: input.domain || getCurrentDomain(),
      userAgent: input.userAgent || getCurrentUserAgent(),
      guestIdentifier:
        input.guestIdentifier || getOrCreatePublicGuestIdentifier(normalizedAppType),
    }
    const identity = buildPublicSessionIdentity(
      normalizedAppType,
      servicePrefix,
      body,
    )
    const cached = readCachedPublicSession(identity)
    if (cached) return cached

    const existing = publicSessionInflight.get(identity)
    if (existing) return existing

    const pending = (async () => {
      const response = await boundFetch(
        buildServiceUrl(
          servicePrefix,
          `/openxiangda-api/v1/apps/${encodeURIComponent(
            normalizedAppType,
          )}/public/session`,
        ),
        {
          method: "POST",
          credentials: "include",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        },
      )
      const payload = await readPayload(response)
      const code = getRecordValue(payload, "code")
      const success = getRecordValue(payload, "success")
      if (!response.ok || success === false || !isSuccessCode(code)) {
        throw new PublicAccessClientError(
          String(
            getRecordValue(payload, "message") ||
              `Public access session failed: ${response.status}`,
          ),
          { status: response.status, code: code as number | string | undefined, payload },
        )
      }
      const data = getRecordValue(payload, "data") as AuthTokenData
      const extra = getRecordValue(payload, "extra") as
        | Record<string, unknown>
        | undefined
      const session = {
        ...data,
        publicAccess: (extra?.publicAccess as PublicAccessClaim | undefined) || null,
        raw: payload,
      }
      writeCachedPublicSession(identity, session)
      return session
    })()
    publicSessionInflight.set(identity, pending)
    try {
      return await pending
    } finally {
      if (publicSessionInflight.get(identity) === pending) {
        publicSessionInflight.delete(identity)
      }
    }
  }

  return {
    appType: normalizedAppType,
    servicePrefix,
    startSession: request,
    clearSession: (input: PublicAccessSessionInput = {}) => {
      const body: PublicAccessSessionInput = {
        ...input,
        path: input.path || getCurrentPathname(),
        domain: input.domain || getCurrentDomain(),
        userAgent: input.userAgent || getCurrentUserAgent(),
        guestIdentifier:
          input.guestIdentifier || getOrCreatePublicGuestIdentifier(normalizedAppType),
      }
      clearCachedPublicSession(
        buildPublicSessionIdentity(normalizedAppType, servicePrefix, body),
      )
    },
  }
}

const buildPublicSessionIdentity = (
  appType: string,
  servicePrefix: string,
  input: PublicAccessSessionInput,
) =>
  JSON.stringify({
    appType,
    servicePrefix: servicePrefix.replace(/\/$/, ""),
    path: input.path || "",
    policyCode: input.policyCode || "",
    routeCode: input.routeCode || "",
    ticket: input.ticket || "",
    guestIdentifier: input.guestIdentifier || "",
    domain: input.domain || "",
  })

const publicSessionStorageKey = (identity: string) => {
  let hash = 2166136261
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `openxiangda:public:session:v1:${identity.length}:${(hash >>> 0).toString(16)}`
}

const readCachedPublicSession = (
  identity: string,
): PublicAccessSessionData | null => {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return null
    const raw = window.sessionStorage.getItem(publicSessionStorageKey(identity))
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      identity?: string
      session?: PublicAccessSessionData
    }
    if (parsed.identity !== identity || !parsed.session) return null
    if (!isPublicSessionReusable(parsed.session)) {
      clearCachedPublicSession(identity)
      return null
    }
    return parsed.session
  } catch {
    return null
  }
}

const writeCachedPublicSession = (
  identity: string,
  session: PublicAccessSessionData,
) => {
  if (!isPublicSessionReusable(session)) return
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return
    const { raw: _raw, ...cacheableSession } = session
    window.sessionStorage.setItem(
      publicSessionStorageKey(identity),
      JSON.stringify({ identity, session: cacheableSession }),
    )
  } catch {
    // Storage is an optimization only. Continue with the fresh session.
  }
}

const clearCachedPublicSession = (identity: string) => {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      window.sessionStorage.removeItem(publicSessionStorageKey(identity))
    }
  } catch {
    // Ignore storage failures.
  }
}

const isPublicSessionReusable = (session: PublicAccessSessionData) => {
  const accessTokenExpiresAt = Number(session.accessTokenExpiresAt)
  if (!Number.isFinite(accessTokenExpiresAt) || accessTokenExpiresAt <= 0) {
    return false
  }
  const policyExpiresAt = session.publicAccess?.expiresAt
    ? new Date(session.publicAccess.expiresAt).getTime()
    : Number.POSITIVE_INFINITY
  const expiresAt = Math.min(accessTokenExpiresAt, policyExpiresAt)
  return expiresAt - Date.now() >= PUBLIC_SESSION_RENEW_WINDOW_MS
}

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

const getRecordValue = (value: unknown, key: string) => {
  if (!value || typeof value !== "object") return undefined
  return (value as Record<string, unknown>)[key]
}

const isSuccessCode = (code: unknown) => {
  if (code === undefined || code === null || code === "") return true
  const normalized = Number(code)
  return Number.isFinite(normalized)
    ? normalized === 0 || (normalized >= 200 && normalized < 300)
    : false
}

const getCurrentPathname = () =>
  typeof window === "undefined" ? undefined : window.location.pathname

const getCurrentDomain = () =>
  typeof window === "undefined" ? undefined : window.location.host

const getCurrentUserAgent = () =>
  typeof navigator === "undefined" ? undefined : navigator.userAgent

const getOrCreatePublicGuestIdentifier = (appType: string) => {
  const key = `openxiangda:public:guest:${appType}`
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const existing = window.localStorage.getItem(key)
      if (existing) return existing
      const next = createRandomIdentifier(appType)
      window.localStorage.setItem(key, next)
      return next
    }
  } catch {
    // ignore storage failures and fall back to an in-memory value.
  }
  return createRandomIdentifier(appType)
}

const createRandomIdentifier = (appType: string) => {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `public:${appType}:${random}`
}
