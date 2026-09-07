import React, {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Space,
  Tabs,
  Typography,
} from "antd"
import {
  LoginOutlined,
  MobileOutlined,
  QrcodeOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from "@ant-design/icons"
import {
  type AppAuthClient,
  type AuthChallengePayload,
  type AuthClientOptions,
  type AuthMethod,
  type AuthTokenData,
  createAuthClient,
  type DingTalkLoginFlow,
  getAuthErrorExtra,
  getAuthErrorReason,
  isAuthChallengeRequired,
  type LoginMethodsResult,
} from "../core/auth"
import { useOpenXiangda } from "./openxiangdaProvider"
import {
  detectDingTalkLoginEnvironment,
  DingTalkExternalBrowserGuide,
  getDingTalkOAuthRecoveryMessage,
  isDingTalkContainer,
  loadDingTalkClient,
  requestDingTalkAuthCode,
} from "./dingtalkAuth"

export interface UseAuthOptions extends Partial<AuthClientOptions> {}

export interface UseLoginMethodsState {
  data: LoginMethodsResult | null
  methods: AuthMethod[]
  loading: boolean
  error: Error | null
  reload: () => Promise<void>
}

export interface LoginPageProps extends UseAuthOptions {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  className?: string
  style?: CSSProperties
  defaultMethod?: "password" | "phone_code"
  dingtalkFlow?: DingTalkLoginFlow
  redirectUrl?: string
  redirectOnSuccess?: boolean
  onSuccess?: (data: AuthTokenData) => void | Promise<void>
}

interface PasswordFormValues {
  challengeAnswer?: string
  username: string
  password: string
}

interface PhoneCodeFormValues {
  phone: string
  code: string
}

export const useAuth = (options: UseAuthOptions = {}) => {
  const runtime = useOpenXiangda()
  const client = useMemo(
    () =>
      createAuthClient({
        appType: options.appType || runtime.appType,
        servicePrefix: options.servicePrefix || runtime.servicePrefix,
        fetchImpl: options.fetchImpl || runtime.baseFetchImpl,
      }),
    [
      options.appType,
      options.fetchImpl,
      options.servicePrefix,
      runtime.appType,
      runtime.baseFetchImpl,
      runtime.servicePrefix,
    ],
  )

  return useMemo(
    () => ({
      client,
      getMethods: client.getMethods,
      passwordLogin: client.passwordLogin,
      dingtalkLogin: client.dingtalkLogin,
      getDingTalkOAuthUrl: client.getDingTalkOAuthUrl,
      guestLogin: client.guestLogin,
      sendPhoneCode: client.sendPhoneCode,
      phoneCodeLogin: client.phoneCodeLogin,
      registerWithPhoneCode: client.registerWithPhoneCode,
      getSsoLoginUrl: client.getSsoLoginUrl,
      refresh: client.refresh,
      logout: client.logout,
      resolveLoginUrl: client.resolveLoginUrl,
    }),
    [client],
  )
}

export const useLoginMethods = (
  options: UseAuthOptions = {},
): UseLoginMethodsState => {
  const auth = useAuth(options)
  const [state, setState] = useState<{
    data: LoginMethodsResult | null
    loading: boolean
    error: Error | null
  }>({
    data: null,
    loading: true,
    error: null,
  })

  const reload = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }))
    try {
      const data = await auth.getMethods()
      setState({ data, loading: false, error: null })
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: normalizeError(error),
      })
    }
  }, [auth])

  useEffect(() => {
    let disposed = false
    const run = async () => {
      setState(prev => ({ ...prev, loading: true, error: null }))
      try {
        const data = await auth.getMethods()
        if (!disposed) setState({ data, loading: false, error: null })
      } catch (error) {
        if (!disposed) {
          setState({
            data: null,
            loading: false,
            error: normalizeError(error),
          })
        }
      }
    }
    void run()
    return () => {
      disposed = true
    }
  }, [auth])

  return {
    ...state,
    methods: state.data?.methods || [],
    reload,
  }
}

export const LoginPage: React.FC<LoginPageProps> = ({
  title,
  subtitle,
  className,
  style,
  defaultMethod,
  dingtalkFlow,
  redirectUrl,
  redirectOnSuccess = true,
  onSuccess,
  ...authOptions
}) => {
  const runtime = useOpenXiangda()
  const auth = useAuth(authOptions)
  const methodsState = useLoginMethods(authOptions)
  const [passwordForm] = Form.useForm<PasswordFormValues>()
  const [phoneForm] = Form.useForm<PhoneCodeFormValues>()
  const [activeMethod, setActiveMethod] = useState<string>(
    defaultMethod || "password",
  )
  const [phonePurpose, setPhonePurpose] = useState<"login" | "register">(
    "login",
  )
  const [phoneChallengeId, setPhoneChallengeId] = useState("")
  const [passwordChallenge, setPasswordChallenge] =
    useState<AuthChallengePayload | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [error, setError] = useState<string | null>(() =>
    getDingTalkOAuthRecoveryMessage() || null,
  )
  const [showDingTalkBrowserGuide, setShowDingTalkBrowserGuide] =
    useState(false)

  const methods = methodsState.methods.filter(method => method.enabled !== false)
  const passwordMethod = findMethod(methods, "password")
  const phoneMethod = findMethod(methods, "phone_code")
  const dingtalkMethod = findMethod(methods, "dingtalk")
  const ssoMethod = findMethod(methods, "sso")
  const guestMethod = findMethod(methods, "guest")
  const allowRegister = methodsState.data?.registration?.mode !== "reject"

  const tabItems = useMemo(() => {
    const items = []
    if (passwordMethod) {
      items.push({
        key: "password",
        label: (
          <Space size={6}>
            <UserOutlined />
            <span>{passwordMethod.label || "账号密码"}</span>
          </Space>
        ),
        children: (
          <PasswordLoginForm
            challenge={passwordChallenge}
            form={passwordForm}
            loading={submitting}
            onFinish={async values => {
              setSubmitting(true)
              setError(null)
              try {
                await handleSuccess(
                  await auth.passwordLogin({
                    challengeAnswer: passwordChallenge
                      ? values.challengeAnswer
                      : undefined,
                    challengeId: readChallengeId(passwordChallenge),
                    clientFingerprint: getOrCreateLoginFingerprint(auth.client),
                    username: values.username,
                    password: values.password,
                  }),
                )
                setPasswordChallenge(null)
              } catch (loginError) {
                if (isAuthChallengeRequired(loginError)) {
                  const nextChallenge = getAuthErrorExtra(loginError)?.challenge
                  if (nextChallenge) {
                    setPasswordChallenge(nextChallenge)
                    passwordForm.setFieldValue("challengeAnswer", "")
                  }
                } else {
                  setPasswordChallenge(null)
                }
                setError(formatAuthErrorMessage(loginError))
              } finally {
                setSubmitting(false)
              }
            }}
          />
        ),
      })
    }
    if (phoneMethod) {
      items.push({
        key: "phone_code",
        label: (
          <Space size={6}>
            <MobileOutlined />
            <span>{phoneMethod.label || "手机号"}</span>
          </Space>
        ),
        children: (
          <PhoneCodeLoginForm
            allowRegister={allowRegister}
            form={phoneForm}
            loading={submitting}
            phonePurpose={phonePurpose}
            sendingCode={sendingCode}
            onPurposeChange={setPhonePurpose}
            onSendCode={async () => {
              const values = await phoneForm.validateFields(["phone"])
              setSendingCode(true)
              setError(null)
              try {
                const result = await auth.sendPhoneCode({
                  phone: values.phone,
                  purpose: phonePurpose,
                })
                setPhoneChallengeId(result.challengeId)
              } catch (sendError) {
                setError(normalizeError(sendError).message)
              } finally {
                setSendingCode(false)
              }
            }}
            onFinish={async values => {
              setSubmitting(true)
              setError(null)
              try {
                const data =
                  phonePurpose === "register"
                    ? await auth.registerWithPhoneCode({
                        phone: values.phone,
                        code: values.code,
                        challengeId: phoneChallengeId,
                      })
                    : await auth.phoneCodeLogin({
                        phone: values.phone,
                        code: values.code,
                        challengeId: phoneChallengeId,
                      })
                await handleSuccess(data)
              } catch (loginError) {
                setError(normalizeError(loginError).message)
              } finally {
                setSubmitting(false)
              }
            }}
          />
        ),
      })
    }
    return items
  }, [
    allowRegister,
    auth,
    handleSuccess,
    passwordChallenge,
    passwordForm,
    passwordMethod,
    phoneChallengeId,
    phoneForm,
    phoneMethod,
    phonePurpose,
    sendingCode,
    submitting,
  ])

  useEffect(() => {
    const firstKey = tabItems[0]?.key
    if (firstKey && !tabItems.some(item => item.key === activeMethod)) {
      setActiveMethod(firstKey)
    }
  }, [activeMethod, tabItems])

  const handleDingTalkLogin = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const flow = resolveDingTalkLoginFlow(dingtalkFlow, dingtalkMethod)
      if (flow === "oauth") {
        if (detectDingTalkLoginEnvironment() === "wechat") {
          setShowDingTalkBrowserGuide(true)
          return
        }
        const returnUrl = resolveDingTalkOAuthReturnUrl(
          auth.client.appType,
          redirectUrl || getCallbackUrl() || undefined,
        )
        const result = await auth.getDingTalkOAuthUrl({
          returnUrl,
        })
        if (typeof window === "undefined") {
          throw new Error("当前环境不支持跳转钉钉登录")
        }
        window.location.assign(result.loginUrl)
        return
      }
      const client = await loadDingTalkClient()
      const code = await requestDingTalkAuthCode({
        client,
        clientId: getString(dingtalkMethod, "clientId") || "",
        corpId: getString(dingtalkMethod, "corpId") || "",
      })
      await handleSuccess(
        await auth.dingtalkLogin({
          code,
          corpId: getString(dingtalkMethod, "corpId"),
        }),
      )
    } catch (loginError) {
      setError(normalizeError(loginError).message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSsoLogin = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const redirectUri = getCurrentHref()
      const result = await auth.getSsoLoginUrl({
        protocol: getString(ssoMethod, "protocol") || "cas",
        redirectUri,
      })
      window.location.assign(result.loginUrl)
    } catch (loginError) {
      setError(normalizeError(loginError).message)
      setSubmitting(false)
    }
  }

  const handleGuestLogin = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await handleSuccess(
        await auth.guestLogin({
          guestIdentifier: getOrCreateGuestIdentifier(auth.client),
          domain: getCurrentHostname(),
        }),
      )
    } catch (loginError) {
      setError(normalizeError(loginError).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSuccess(data: AuthTokenData) {
    await onSuccess?.(data)
    const accessToken = data.accessToken || data.token
    const accessTokenOptions = {
      expiresAt: data.accessTokenExpiresAt,
    }
    if (accessToken) {
      runtime.setAccessToken(accessToken, accessTokenOptions)
    }
    await runtime.reload(
      accessToken
        ? {
            accessToken,
            accessTokenOptions,
          }
        : undefined,
    )
    if (redirectOnSuccess && typeof window !== "undefined") {
      window.location.replace(
        redirectUrl || getCallbackUrl() || `/view/${auth.client.appType}`,
      )
    }
  }

  return (
    <>
      <DingTalkExternalBrowserGuide open={showDingTalkBrowserGuide} />
      <div
        className={className}
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "#f6f8fb",
          ...style,
        }}
      >
        <Card
          style={{
            width: "min(100%, 420px)",
            borderRadius: 8,
            boxShadow: "0 16px 48px rgba(15, 23, 42, 0.10)",
          }}
          styles={{ body: { padding: 28 } }}
        >
          <Space direction="vertical" size={20} style={{ width: "100%" }}>
          <div>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {title || "应用登录"}
            </Typography.Title>
            {subtitle ? (
              <Typography.Text type="secondary">{subtitle}</Typography.Text>
            ) : null}
          </div>
          {methodsState.error ? (
            <Alert
              showIcon
              type="error"
              message={methodsState.error.message}
            />
          ) : null}
          {error ? <Alert showIcon type="error" message={error} /> : null}
          {methodsState.loading ? (
            <Button block loading>
              加载中
            </Button>
          ) : tabItems.length > 0 ? (
            <Tabs
              activeKey={activeMethod}
              items={tabItems}
              onChange={setActiveMethod}
            />
          ) : (
            <Empty description="未启用登录方式" />
          )}
          <Space direction="vertical" size={10} style={{ width: "100%" }}>
            {dingtalkMethod ? (
              <Button
                block
                icon={<QrcodeOutlined />}
                loading={submitting}
                onClick={handleDingTalkLogin}
              >
                {dingtalkMethod.label || "钉钉登录"}
              </Button>
            ) : null}
            {ssoMethod ? (
              <Button
                block
                icon={<SafetyCertificateOutlined />}
                loading={submitting}
                onClick={handleSsoLogin}
              >
                {ssoMethod.label || "SSO 登录"}
              </Button>
            ) : null}
            {guestMethod ? (
              <Button
                block
                icon={<LoginOutlined />}
                loading={submitting}
                onClick={handleGuestLogin}
              >
                {guestMethod.label || "访客访问"}
              </Button>
            ) : null}
          </Space>
          </Space>
        </Card>
      </div>
    </>
  )
}

const PasswordLoginForm: React.FC<{
  challenge?: AuthChallengePayload | null
  form: ReturnType<typeof Form.useForm<PasswordFormValues>>[0]
  loading: boolean
  onFinish: (values: PasswordFormValues) => void
}> = ({ challenge, form, loading, onFinish }) => (
  <Form form={form} layout="vertical" requiredMark={false} onFinish={onFinish}>
    <Form.Item
      label="账号"
      name="username"
      rules={[{ required: true, message: "请输入账号" }]}
    >
      <Input autoComplete="username" />
    </Form.Item>
    <Form.Item
      label="密码"
      name="password"
      rules={[{ required: true, message: "请输入密码" }]}
    >
      <Input.Password autoComplete="current-password" />
    </Form.Item>
    {challenge ? (
      <>
        <Alert
          showIcon
          type="warning"
          message="请完成额外验证"
          description={readChallengeQuestion(challenge) || "请输入验证码后继续登录。"}
        />
        <Form.Item
          label="验证答案"
          name="challengeAnswer"
          rules={[{ required: true, message: "请输入验证答案" }]}
        >
          <Input autoComplete="one-time-code" />
        </Form.Item>
      </>
    ) : null}
    <Button block htmlType="submit" icon={<LoginOutlined />} loading={loading} type="primary">
      登录
    </Button>
  </Form>
)

const PhoneCodeLoginForm: React.FC<{
  allowRegister: boolean
  form: ReturnType<typeof Form.useForm<PhoneCodeFormValues>>[0]
  loading: boolean
  phonePurpose: "login" | "register"
  sendingCode: boolean
  onPurposeChange: (purpose: "login" | "register") => void
  onSendCode: () => Promise<void>
  onFinish: (values: PhoneCodeFormValues) => void
}> = ({
  allowRegister,
  form,
  loading,
  phonePurpose,
  sendingCode,
  onPurposeChange,
  onSendCode,
  onFinish,
}) => (
  <Form form={form} layout="vertical" requiredMark={false} onFinish={onFinish}>
    {allowRegister ? (
      <Form.Item style={{ marginBottom: 12 }}>
        <Tabs
          activeKey={phonePurpose}
          items={[
            { key: "login", label: "登录" },
            { key: "register", label: "注册" },
          ]}
          onChange={key => onPurposeChange(key === "register" ? "register" : "login")}
          size="small"
        />
      </Form.Item>
    ) : null}
    <Form.Item
      label="手机号"
      name="phone"
      rules={[{ required: true, message: "请输入手机号" }]}
    >
      <Input autoComplete="tel" />
    </Form.Item>
    <Form.Item
      label="验证码"
      name="code"
      rules={[{ required: true, message: "请输入验证码" }]}
    >
      <Input
        addonAfter={
          <Button
            loading={sendingCode}
            onClick={onSendCode}
            size="small"
            type="link"
          >
            发送
          </Button>
        }
        autoComplete="one-time-code"
      />
    </Form.Item>
    <Button block htmlType="submit" icon={<MobileOutlined />} loading={loading} type="primary">
      {phonePurpose === "register" ? "注册" : "登录"}
    </Button>
  </Form>
)

const findMethod = (methods: AuthMethod[], type: string) =>
  methods.find(method => method.type === type)

const normalizeError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error || "请求失败"))

const formatAuthErrorMessage = (error: unknown) => {
  const normalized = normalizeError(error)
  const extra = getAuthErrorExtra(error)
  const reason = getAuthErrorReason(error)
  if (isAuthChallengeRequired(error)) {
    return extra?.challenge?.question
      ? "请完成下方验证后再登录"
      : normalized.message || "请先完成额外验证后再尝试登录"
  }
  if (
    reason === "LOGIN_BLOCKED" ||
    reason === "USERNAME_BLOCKED" ||
    reason === "IP_BLOCKED" ||
    reason === "ACCOUNT_LOCKED"
  ) {
    const retryAfter = Number(extra?.retryAfter ?? extra?.retryAfterSeconds)
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      const minutes = Math.ceil(retryAfter / 60)
      return `登录受限，请约 ${minutes} 分钟后再试或联系管理员`
    }
  }
  return normalized.message || "登录失败"
}

const getString = (value: unknown, key: string) => {
  if (!value || typeof value !== "object") return undefined
  const result = (value as Record<string, unknown>)[key]
  return typeof result === "string" ? result : undefined
}

export const resolveDingTalkLoginFlow = (
  explicitFlow?: DingTalkLoginFlow,
  method?: AuthMethod,
): Exclude<DingTalkLoginFlow, "auto"> => {
  const configuredFlow = normalizeDingTalkLoginFlow(getString(method, "flow"))
  const flow = explicitFlow || configuredFlow || "auto"
  if (flow !== "auto") return flow
  return isDingTalkContainer() ? "jsapi" : "oauth"
}

export const resolveDingTalkOAuthReturnUrl = (
  appType: string,
  returnUrl?: string,
  origin = getCurrentOrigin(),
) => {
  const normalizedAppType = String(appType || "").trim()
  if (!normalizedAppType) throw new Error("appType 不能为空")

  const appRoot = `/view/${encodeURIComponent(normalizedAppType)}`
  const rawReturnUrl = String(returnUrl || "").trim()
  if (!rawReturnUrl) return appRoot
  if (!origin || rawReturnUrl.startsWith("//")) {
    throw createInvalidDingTalkReturnUrlError(appRoot)
  }

  let baseUrl: URL
  let targetUrl: URL
  try {
    baseUrl = new URL(origin)
    targetUrl = new URL(rawReturnUrl, baseUrl)
  } catch {
    throw createInvalidDingTalkReturnUrlError(appRoot)
  }

  if (
    targetUrl.origin !== baseUrl.origin ||
    targetUrl.username ||
    targetUrl.password ||
    (targetUrl.pathname !== appRoot &&
      !targetUrl.pathname.startsWith(`${appRoot}/`))
  ) {
    throw createInvalidDingTalkReturnUrlError(appRoot)
  }

  return `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`
}

const createInvalidDingTalkReturnUrlError = (appRoot: string) =>
  new Error(`钉钉登录返回地址必须位于当前应用 ${appRoot} 下`)

const normalizeDingTalkLoginFlow = (
  value: unknown,
): DingTalkLoginFlow | undefined =>
  value === "auto" || value === "jsapi" || value === "oauth"
    ? value
    : undefined

const getOrCreateGuestIdentifier = (client: AppAuthClient) => {
  const key = `openxiangda:${client.appType}:guest_id`
  if (typeof window === "undefined") return createGuestIdentifier()
  const current = window.localStorage.getItem(key)
  if (current) return current
  const next = createGuestIdentifier()
  window.localStorage.setItem(key, next)
  return next
}

const getOrCreateLoginFingerprint = (client: AppAuthClient) => {
  const key = `openxiangda:${client.appType}:login_fingerprint`
  if (typeof window === "undefined") return createGuestIdentifier()
  const current = window.localStorage.getItem(key)
  const id = current || createGuestIdentifier()
  if (!current) window.localStorage.setItem(key, id)
  return `${id}:${window.navigator?.userAgent || "unknown"}`
}

const createGuestIdentifier = () =>
  `guest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

const readChallengeId = (challenge?: AuthChallengePayload | null) => {
  if (!challenge) return undefined
  const id = challenge.id || challenge.challengeId
  return typeof id === "string" && id.trim() ? id.trim() : undefined
}

const readChallengeQuestion = (challenge: AuthChallengePayload) =>
  typeof challenge.question === "string" ? challenge.question : undefined

const getCurrentHref = () =>
  typeof window === "undefined" ? "" : window.location.href

const getCurrentOrigin = () =>
  typeof window === "undefined" ? "" : window.location.origin

const getCurrentHostname = () =>
  typeof window === "undefined" ? "" : window.location.hostname

const getCallbackUrl = () => {
  if (typeof window === "undefined") return ""
  const query = new URLSearchParams(window.location.search)
  return query.get("callback") || query.get("redirectUri") || ""
}
