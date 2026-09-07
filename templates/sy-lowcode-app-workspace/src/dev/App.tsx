import { ReloadOutlined, UserSwitchOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Empty, Input, Select, Space, Spin, Tag, Typography, message, Modal } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { BuiltinRouteRenderer, resolveBrowserRuntimeRoute } from "openxiangda/runtime";
import type {
  BrowserRuntimeRouteResolution,
  PageApiResponse,
  PageBinaryResponse,
  PageContext,
  PageRequestOptions,
} from "openxiangda/runtime";
import { runtimeRouteOverrides } from "../runtime/builtin-overrides";

type PageConfig = {
  code?: string;
  name?: string;
  description?: string;
  route?: {
    pathKey?: string;
    [key: string]: unknown;
  };
  entry?: {
    mode?: string;
    hidePlatformNav?: boolean;
    defaultRoute?: string;
    [key: string]: unknown;
  };
  menu?: {
    name?: string;
    [key: string]: unknown;
  };
  publish?: boolean;
  [key: string]: unknown;
};

type RuntimeModule = {
  mount?: (el: HTMLElement, context: PageContext) => void | Promise<void>;
  update?: (el: HTMLElement, context: PageContext) => void | Promise<void>;
  unmount?: (el?: HTMLElement, context?: PageContext) => void | Promise<void>;
  default?: RuntimeModule;
};

type PageOption = {
  dirName: string;
  config: PageConfig;
  module?: RuntimeModule;
};

type UserProfile = {
  id?: string;
  username?: string;
  name?: string;
  tenantId?: string;
  departments?: Array<{ id: string; name: string }>;
  isGuest?: boolean;
  isPlatFormAdmin?: boolean;
  isAppAdmin?: boolean;
};

const configModules = (import.meta as any).glob("../pages/*/page.config.ts", {
  eager: true,
}) as Record<string, { default?: PageConfig } & PageConfig>;

const pageModules = (import.meta as any).glob("../pages/*/index.tsx", {
  eager: true,
}) as Record<string, RuntimeModule>;

const servicePrefix = (process.env.APP_SERVICE_PREFIX || "/service").replace(
  /\/+$/,
  "",
);

const appType =
  process.env.OPENXIANGDA_APP_TYPE ||
  process.env.APP_TYPE ||
  "APP_XXXXXXXXXXXXXXXX";

const hasPlatformProxy = Boolean(
  process.env.OPENXIANGDA_BASE_URL || process.env.APP_PLATFORM_URL,
);

const LOCATION_CHANGE_EVENT = "openxiangda:location-change";

const getDirName = (path: string) => path.match(/\/pages\/([^/]+)\//)?.[1] || "";

const getPageIdentity = (page: PageOption) =>
  page.config.route?.pathKey || page.config.code || page.dirName;

const getLocationKey = () =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;

const emitLocationChange = () => {
  window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT));
};

const setBrowserUrl = (
  method: "pushState" | "replaceState",
  url: string,
) => {
  window.history[method](null, "", url);
  emitLocationChange();
};

const createSearchParams = (query?: Record<string, unknown>) => {
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value)) {
      value.forEach(item => params.append(key, String(item)));
      return;
    }
    params.set(key, String(value));
  });
  return params;
};

const getRouteSegments = (pathname = window.location.pathname) => {
  const segments = pathname.split("/").filter(Boolean);
  return segments[0] === "view" ? segments.slice(1) : segments;
};

const getWorkbenchPageKeyFromPath = (pathname = window.location.pathname) => {
  const segments = getRouteSegments(pathname);
  if (segments[0] === appType && segments[1] === "workbench") {
    return segments[2] || "";
  }
  return "";
};

const normalizeModule = (moduleValue?: RuntimeModule): RuntimeModule => {
  if (moduleValue?.default && (moduleValue.default.mount || moduleValue.default.unmount)) {
    return {
      ...moduleValue.default,
      ...moduleValue,
    };
  }
  return moduleValue || {};
};

const appendQuery = (url: string, query?: string) => {
  if (!query) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
};

const normalizeQueryString = (query?: unknown) => {
  if (!query) return undefined;
  if (typeof query === "string") return query;
  if (query instanceof URLSearchParams) return query.toString();
  if (typeof query === "object") {
    const params = createSearchParams(query as Record<string, unknown>);
    return params.toString() || undefined;
  }
  return String(query);
};

const joinServicePath = (path: string) => {
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith(servicePrefix || "/service")) return path;
  return `${servicePrefix}${path.startsWith("/") ? path : `/${path}`}`;
};

const normalizeMethod = (method?: string) => {
  const value = String(method || "get").toUpperCase();
  return ["GET", "POST", "PUT", "DELETE", "PATCH"].includes(value)
    ? value
    : "GET";
};

const parseJsonResponse = async <T,>(response: Response): Promise<PageApiResponse<T>> => {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || response.statusText || "请求失败");
  }
  if (payload && typeof payload === "object" && "code" in payload) {
    return {
      code: Number(payload.code || response.status),
      success: payload.code === 200 || payload.success === true,
      message: payload.message,
      result: payload.data ?? payload.result ?? null,
      data: payload.data,
      raw: payload,
    };
  }
  return {
    code: response.status,
    success: response.ok,
    message: response.statusText,
    result: payload,
    data: payload,
    raw: payload,
  };
};

const requestJson = async <T,>(options: PageRequestOptions): Promise<PageApiResponse<T>> => {
  const url = appendQuery(joinServicePath(options.path), normalizeQueryString(options.query));
  const headers = new Headers(options.headers as HeadersInit);
  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    headers.set("Content-Type", headers.get("Content-Type") || "application/json");
    body = JSON.stringify(options.body);
  }
  const response = await fetch(url, {
    method: normalizeMethod(options.method),
    headers,
    body,
    credentials: "include",
  });
  return parseJsonResponse<T>(response);
};

const requestBinary = async (
  options: PageRequestOptions,
): Promise<PageBinaryResponse> => {
  const url = appendQuery(joinServicePath(options.path), normalizeQueryString(options.query));
  const response = await fetch(url, {
    method: normalizeMethod(options.method),
    headers: options.headers as HeadersInit,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(response.statusText || "下载失败");
  }
  const headers = Object.fromEntries(response.headers.entries());
  return {
    blob: await response.blob(),
    contentType: response.headers.get("content-type") || undefined,
    fileName: response.headers.get("content-disposition") || undefined,
    headers,
  };
};

const buildRouteInfo = (selected?: PageOption) => {
  const url = new URL(window.location.href);
  const query: Record<string, string | string[]> = {};
  url.searchParams.forEach((value, key) => {
    const current = query[key];
    if (current === undefined) {
      query[key] = value;
    } else if (Array.isArray(current)) {
      query[key] = [...current, value];
    } else {
      query[key] = [current, value];
    }
  });
  return {
    pathname: url.pathname,
    fullPath: `${url.pathname}${url.search}${url.hash}`,
    params: {
      appType,
      pageKey: selected?.config.route?.pathKey || selected?.config.code || selected?.dirName,
    },
    query,
    hash: url.hash,
  };
};

const createFallbackUser = (profile?: UserProfile) => ({
  id: profile?.id || "local-dev-user",
  name: profile?.name || profile?.username || "Local Developer",
  username: profile?.username || profile?.name || "local-dev-user",
  tenantId: profile?.tenantId || "",
  departments: profile?.departments || [],
  isGuest: profile?.isGuest || false,
});

const createPageContext = (
  selected: PageOption,
  profile: UserProfile | null,
): PageContext => ({
  protocolVersion: "1.0",
  app: {
    appType,
    name: appType,
  } as any,
  page: {
    id: selected.config.code || selected.dirName,
    code: selected.config.code || selected.dirName,
    name: selected.config.name || selected.dirName,
    type: "custom",
    rendererType: "custom_bundle",
    routeKey:
      selected.config.route?.pathKey || selected.config.code || selected.dirName,
    legacyFormUuid: selected.config.code || selected.dirName,
    status: "local",
    props: {},
    route: selected.config.route || {},
    entry: selected.config.entry || {},
    dataSources: [],
    capabilities: {},
  },
  user: createFallbackUser(profile || undefined) as any,
  route: buildRouteInfo(selected),
  env: {
    mode: "local",
    servicePrefix,
  },
  permissions: {
    canView: true,
    hasFullAccess: true,
  } as any,
  capabilities: ["navigation", "ui.message", "ui.modal", "transport.request", "transport.download"],
  ui: {
    message: {
      success: (text: string) => message.success(text),
      error: (text: string) => message.error(text),
      warning: (text: string) => message.warning(text),
      info: (text: string) => message.info(text),
      loading: (text: string) => {
        const hide = message.loading(text, 0);
        return () => {
          if (typeof hide === "function") hide();
        };
      },
    },
    modal: {
      confirm: (input: { title: string; content: string }) =>
        new Promise<boolean>(resolve => {
          Modal.confirm({
            title: input.title,
            content: input.content,
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          });
        }),
    },
  },
  navigation: {
    pushPage: (pageKey: string, query?: Record<string, unknown>) => {
      const params = createSearchParams(query);
      setBrowserUrl(
        "pushState",
        `/view/${appType}/workbench/${pageKey}${params.size ? `?${params}` : ""}`,
      );
    },
    replacePage: (pageKey: string, query?: Record<string, unknown>) => {
      const params = createSearchParams(query);
      setBrowserUrl(
        "replaceState",
        `/view/${appType}/workbench/${pageKey}${params.size ? `?${params}` : ""}`,
      );
    },
    pushRoute: (route: string) => {
      const url = new URL(window.location.href);
      url.searchParams.set("route", route);
      setBrowserUrl("pushState", `${url.pathname}${url.search}${url.hash}`);
    },
    replaceRoute: (route: string) => {
      const url = new URL(window.location.href);
      url.searchParams.set("route", route);
      setBrowserUrl("replaceState", `${url.pathname}${url.search}${url.hash}`);
    },
    updateQuery: (query: Record<string, unknown>) => {
      const url = new URL(window.location.href);
      Object.entries(query || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") {
          url.searchParams.delete(key);
        } else {
          url.searchParams.set(key, String(value));
        }
      });
      setBrowserUrl("replaceState", `${url.pathname}${url.search}${url.hash}`);
    },
    setHash: (hash: string) => {
      window.location.hash = hash ? (hash.startsWith("#") ? hash : `#${hash}`) : "";
    },
    back: () => window.history.back(),
  },
  bridge: {
    invoke: async <T = unknown>(method: string, payload?: unknown): Promise<T> => {
      if (method === "transport.request") {
        return (await requestJson((payload || {}) as PageRequestOptions)) as T;
      }
      if (method === "transport.download") {
        return (await requestBinary((payload || {}) as PageRequestOptions)) as T;
      }
      throw new Error(`不支持的 bridge 方法: ${method}`);
    },
  },
  sdk: {
    packageName: "openxiangda",
    supportedBridgeMethods: ["transport.request", "transport.download"],
  },
});

const discoverPages = (): PageOption[] => {
  return Object.entries(configModules)
    .map(([configPath, moduleValue]) => {
      const dirName = getDirName(configPath);
      const modulePath = `../pages/${dirName}/index.tsx`;
      const config = moduleValue.default || moduleValue;
      return {
        dirName,
        config,
        module: normalizeModule(pageModules[modulePath]),
      };
    })
    .filter(item => item.dirName && item.config.publish !== false)
    .sort((left, right) =>
      String(left.config.name || left.dirName).localeCompare(
        String(right.config.name || right.dirName),
        "zh-Hans-CN",
      ),
    );
};

const findPageByIdentity = (pages: PageOption[], identity: string) =>
  pages.find(
    page =>
      page.config.code === identity ||
      page.config.route?.pathKey === identity ||
      page.dirName === identity,
  );

const getRuntimePermission = (route?: BrowserRuntimeRouteResolution | null) => {
  const permission = route?.runtime?.permission;
  return permission && typeof permission === "object"
    ? (permission as { canView?: unknown; message?: unknown })
    : undefined;
};

const isRuntimePermissionDenied = (route?: BrowserRuntimeRouteResolution | null) =>
  getRuntimePermission(route)?.canView === false;

const getRuntimePermissionMessage = (route: BrowserRuntimeRouteResolution) =>
  String(
    route.message ||
      getRuntimePermission(route)?.message ||
      "您没有权限访问当前页面",
  );

const RuntimeRouteNotice = ({
  route,
  routeError,
  resolving,
}: {
  route: BrowserRuntimeRouteResolution | null;
  routeError: string;
  resolving: boolean;
}) => {
  if (resolving) {
    return (
      <Alert
        type="info"
        showIcon
        message="正在解析 /view 路由..."
        style={{ margin: 16 }}
      />
    );
  }

  if (routeError) {
    return (
      <Alert
        type="warning"
        showIcon
        message="后端 runtime route resolver 不可用"
        description={routeError}
        style={{ margin: 16 }}
      />
    );
  }

  if (!route) return null;

  if (isRuntimePermissionDenied(route)) {
    return (
      <Alert
        type="warning"
        showIcon
        message={getRuntimePermissionMessage(route)}
        style={{ margin: 16 }}
      />
    );
  }

  if (route.mode === "builtin-route") {
    return null;
  }

  if (route.mode === "legacy-fallback") {
    return (
      <Alert
        type="info"
        showIcon
        message="后端建议走旧 view fallback"
        description={route.fallback?.reason || route.message || "legacy-fallback"}
        style={{ margin: 16 }}
      />
    );
  }

  if (route.mode === "not-found") {
    return (
      <Alert
        type="warning"
        showIcon
        message="后端未识别该 runtime 路由"
        description={route.message || route.path}
        style={{ margin: 16 }}
      />
    );
  }

  return null;
};

export default function App() {
  const pages = useMemo(discoverPages, []);
  const [selectedCode, setSelectedCode] = useState(
    () => getWorkbenchPageKeyFromPath() || (pages[0] ? getPageIdentity(pages[0]) : ""),
  );
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [targetUserId, setTargetUserId] = useState("");
  const [mountError, setMountError] = useState("");
  const [mountSeed, setMountSeed] = useState(0);
  const [locationKey, setLocationKey] = useState(() => getLocationKey());
  const [routeResolution, setRouteResolution] =
    useState<BrowserRuntimeRouteResolution | null>(null);
  const [routeResolving, setRouteResolving] = useState(false);
  const [routeError, setRouteError] = useState("");
  const mountRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => findPageByIdentity(pages, selectedCode),
    [pages, selectedCode],
  );

  const shouldBlockLocalMount =
    isRuntimePermissionDenied(routeResolution) ||
    routeResolution?.mode === "builtin-route" ||
    routeResolution?.kind === "work-center" ||
    (routeResolution?.mode === "not-found" &&
      routeResolution.params?.routeAppType !== undefined);
  const shouldRenderBuiltinRoute = routeResolution?.mode === "builtin-route";
  const localMountBlockedDescription = isRuntimePermissionDenied(routeResolution)
    ? "当前用户没有权限访问该页面"
    : "当前路由不挂载本地代码页";

  const handleSelectPage = (value: string) => {
    setSelectedCode(value);
    setBrowserUrl("pushState", `/view/${appType}/workbench/${value}`);
  };

  const loadProfile = async () => {
    setProfileLoading(true);
    try {
      const response = await requestJson<UserProfile>({
        path: "/api/auth/profile",
        method: "post",
        body: { appType },
      });
      setProfile((response.result || response.data || null) as UserProfile | null);
      if (response.success) {
        message.success("已读取当前登录用户");
      }
    } catch (error: any) {
      setProfile(null);
      message.warning(error?.message || "未读取到当前登录用户");
    } finally {
      setProfileLoading(false);
    }
  };

  const loginAsTargetUser = async () => {
    const normalizedTarget = targetUserId.trim();
    if (!normalizedTarget) {
      message.warning("请输入目标用户 ID");
      return;
    }
    const redirectPageKey =
      (selected ? getPageIdentity(selected) : selectedCode) ||
      getWorkbenchPageKeyFromPath();
    const redirectUri = `${window.location.origin}/view/${appType}/workbench/${
      redirectPageKey || ""
    }`;
    const response = await requestJson<{ loginUrl: string; expireIn: number }>({
      path: `/openxiangda-api/v1/apps/${appType}/verification-login-links`,
      method: "post",
      body: {
        targetUserId: normalizedTarget,
        redirectUri,
        purpose: "workspace-dev-preview",
      },
    });
    const loginUrl = response.result?.loginUrl || response.data?.loginUrl;
    if (!loginUrl) {
      throw new Error(response.message || "未生成登录链接");
    }
    window.location.href = loginUrl;
  };

  useEffect(() => {
    void loadProfile();
  }, []);

  useEffect(() => {
    const syncLocation = () => setLocationKey(getLocationKey());
    window.addEventListener("popstate", syncLocation);
    window.addEventListener(LOCATION_CHANGE_EVENT, syncLocation);
    return () => {
      window.removeEventListener("popstate", syncLocation);
      window.removeEventListener(LOCATION_CHANGE_EVENT, syncLocation);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const resolveRoute = async () => {
      const pageKey = getWorkbenchPageKeyFromPath();
      if (pageKey) {
        setSelectedCode(pageKey);
      }

      if (!hasPlatformProxy) {
        setRouteResolution(null);
        setRouteError("");
        setRouteResolving(false);
        return;
      }

      setRouteResolving(true);
      setRouteError("");
      try {
        const route = await resolveBrowserRuntimeRoute({
          appType,
          path: window.location.pathname,
          search: window.location.search,
          servicePrefix,
        });
        if (cancelled) return;
        setRouteResolution(route);
        const resolvedPageKey = route.params?.pageKey || pageKey;
        if (
          resolvedPageKey &&
          (route.kind === "custom-page" || route.kind === "legacy-workbench")
        ) {
          setSelectedCode(resolvedPageKey);
        }
      } catch (error: any) {
        if (!cancelled) {
          setRouteResolution(null);
          setRouteError(error?.message || "解析运行时路由失败");
        }
      } finally {
        if (!cancelled) {
          setRouteResolving(false);
        }
      }
    };

    void resolveRoute();

    return () => {
      cancelled = true;
    };
  }, [locationKey]);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => Promise<void> | void) | undefined;

    const mount = async () => {
      setMountError("");
      const host = mountRef.current;
      if (!host) return;
      host.innerHTML = "";
      if (shouldBlockLocalMount) return;
      if (!selected) {
        if (selectedCode) {
          setMountError(`本地 src/pages 中没有找到页面: ${selectedCode}`);
        }
        return;
      }
      const moduleValue = selected.module;
      if (!moduleValue?.mount) {
        setMountError(`页面 ${selected.dirName} 缺少 index.tsx runtime export`);
        return;
      }
      const context = createPageContext(selected, profile);
      try {
        await moduleValue.mount(host, context);
        cleanup = async () => {
          await moduleValue.unmount?.(host, context);
          host.innerHTML = "";
        };
      } catch (error: any) {
        if (!cancelled) {
          setMountError(error?.message || "本地页面挂载失败");
        }
      }
    };

    void mount();

    return () => {
      cancelled = true;
      void cleanup?.();
    };
  }, [selected, profile, mountSeed, selectedCode, shouldBlockLocalMount]);

  return (
    <main style={{ minHeight: "100vh", background: "#f7f8fb" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "16px 20px",
          borderBottom: "1px solid #e5e7eb",
          background: "#fff",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <Space size={16} wrap>
          <Typography.Title level={4} style={{ margin: 0 }}>
            OpenXiangda Runtime
          </Typography.Title>
          <Tag color="blue">{appType}</Tag>
          <Select
            style={{ minWidth: 240 }}
            value={selected ? getPageIdentity(selected) : selectedCode || undefined}
            placeholder="选择本地页面"
            onChange={handleSelectPage}
            options={pages.map(page => ({
              value: getPageIdentity(page),
              label: page.config.name || page.config.code || page.dirName,
            }))}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => setMountSeed(value => value + 1)}
          >
            重新挂载
          </Button>
        </Space>

        <Space wrap>
          <Button loading={profileLoading} onClick={loadProfile}>
            {profile?.name || profile?.username || "读取登录态"}
          </Button>
          <Input
            style={{ width: 220 }}
            value={targetUserId}
            placeholder="目标用户 ID"
            onChange={event => setTargetUserId(event.target.value)}
            onPressEnter={() => void loginAsTargetUser()}
          />
          <Button
            type="primary"
            icon={<UserSwitchOutlined />}
            onClick={() => void loginAsTargetUser()}
          >
            以该用户打开
          </Button>
        </Space>
      </header>

      {!process.env.OPENXIANGDA_BASE_URL && !process.env.APP_PLATFORM_URL ? (
        <Alert
          type="warning"
          showIcon
          message="未配置远端平台地址"
          description="设置 OPENXIANGDA_BASE_URL 或 APP_PLATFORM_URL 后，Vite 会代理 /service 并重写 Cookie，SDK 请求才能访问远端后端。"
          style={{ margin: 16 }}
        />
      ) : null}

      {mountError ? (
        <Alert type="error" showIcon message={mountError} style={{ margin: 16 }} />
      ) : null}

      <RuntimeRouteNotice
        route={routeResolution}
        routeError={routeError}
        resolving={routeResolving}
      />

      {shouldRenderBuiltinRoute ? (
        <BuiltinRouteRenderer
          route={routeResolution}
          appType={appType}
          servicePrefix={servicePrefix}
          overrides={runtimeRouteOverrides}
          style={{ minHeight: "calc(100vh - 73px)" }}
        />
      ) : pages.length === 0 ? (
        <Card style={{ margin: 16 }}>
          <Empty
            description={
              <span>
                在 <Typography.Text code>src/pages/&lt;page&gt;</Typography.Text>{" "}
                下添加 <Typography.Text code>index.tsx</Typography.Text>、
                <Typography.Text code>App.tsx</Typography.Text> 和{" "}
                <Typography.Text code>page.config.ts</Typography.Text> 后即可本地预览。
              </span>
            }
          />
        </Card>
      ) : (
        <section style={{ minHeight: "calc(100vh - 73px)" }}>
          {shouldBlockLocalMount ? (
            <div style={{ padding: 16 }}>
              <Empty description={localMountBlockedDescription} />
            </div>
          ) : !selected && !selectedCode ? (
            <Spin style={{ margin: 32 }} />
          ) : (
            <div ref={mountRef} style={{ minHeight: "calc(100vh - 73px)" }} />
          )}
        </section>
      )}
    </main>
  );
}
