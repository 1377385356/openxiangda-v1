import type {
  PageApiResponse,
  PageBinaryResponse,
  PageBridgeApi,
  PageContext,
  PageInfo,
  PageRequestOptions,
} from "../core/types";
import { createBoundFetch, fetchWithTransientRetry } from "../core/fetch";

export type RuntimeCssIsolation = "none" | "namespace" | "shadow";

export interface RuntimeHostBootstrap {
  app: PageContext["app"];
  page: PageInfo;
  user: PageContext["user"];
  asset?: {
    protocolVersion?: string;
    version?: string;
    buildId?: string;
    entryUrl?: string;
    cssAssets?: string[];
    jsAssets?: string[];
    manifestUrl?: string;
    [key: string]: unknown;
  };
  runtimeAssets?: {
    entryUrl?: string;
    cssUrls?: string[];
    jsUrls?: string[];
    cssIsolation?: RuntimeCssIsolation | string;
    [key: string]: unknown;
  };
  env?: Record<string, unknown>;
  permissions?: Partial<PageContext["permissions"]>;
  sdk?: PageContext["sdk"];
}

export type BrowserRuntimeRouteMode =
  | "custom-page"
  | "builtin-route"
  | "legacy-fallback"
  | "not-found";

export type BrowserRuntimeRouteKind =
  | "custom-page"
  | "legacy-workbench"
  | "work-center"
  | "form-submit"
  | "process-submit"
  | "form-preview"
  | "form-detail"
  | "process-detail"
  | "data-manage-list"
  | "file-preview"
  | "unknown";

export interface BrowserRuntimeRouteResolution {
  appType: string;
  path: string;
  search: string;
  kind: BrowserRuntimeRouteKind;
  mode: BrowserRuntimeRouteMode;
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  runtime: Record<string, unknown>;
  fallback?: {
    legacyRoute: boolean;
    reason: string;
  };
  message?: string;
}

export interface BrowserRuntimeHostOptions {
  servicePrefix?: string;
  fetchImpl?: typeof fetch;
  message?: Partial<PageContext["ui"]["message"]>;
  modal?: Partial<PageContext["ui"]["modal"]>;
  navigation?: Partial<PageContext["navigation"]>;
  route?: Partial<PageContext["route"]>;
}

export interface BrowserRuntimeBootstrapOptions {
  appType: string;
  pageKey: string;
  servicePrefix?: string;
  bootstrapPath?: string;
  fetchImpl?: typeof fetch;
}

export interface BrowserRuntimeRouteResolveOptions {
  appType: string;
  path?: string;
  search?: string;
  servicePrefix?: string;
  resolvePath?: string;
  fetchImpl?: typeof fetch;
}

export interface LoadedRuntimeAssets {
  entryUrl: string;
  cssUrls: string[];
  jsUrls: string[];
  cssIsolation: RuntimeCssIsolation;
}

export interface CustomPageModule {
  mount?: (el: HTMLElement, context: PageContext) => void | Promise<void>;
  update?: (
    el: HTMLElement,
    nextContext: PageContext,
    prevContext?: PageContext,
  ) => void | Promise<void>;
  unmount?: (el?: HTMLElement, context?: PageContext) => void | Promise<void>;
  default?: CustomPageModule;
}

export interface RuntimeMountOptions {
  container: HTMLElement;
  module: CustomPageModule;
  context: PageContext;
  assets?: Partial<LoadedRuntimeAssets>;
}

export interface BrowserRuntimeMountOptions extends BrowserRuntimeHostOptions {
  container: HTMLElement;
  appType: string;
  pageKey: string;
  bootstrapPath?: string;
  moduleLoader?: (url: string) => Promise<unknown>;
}

export interface BrowserRuntimeMountResult {
  bootstrap: RuntimeHostBootstrap;
  assets: LoadedRuntimeAssets;
  context: PageContext;
  module: CustomPageModule;
  cleanup: () => Promise<void>;
}

const NAMESPACE_ROOT_CLASS = "sy-app-workspace";
const defaultModuleLoader = (url: string) => import(/* @vite-ignore */ url);

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const getDefaultServicePrefix = () =>
  typeof window !== "undefined"
    ? trimTrailingSlash((window as any).__OPENXIANGDA_SERVICE_PREFIX__ || "/service")
    : "/service";

const joinServicePath = (servicePrefix: string, path: string) => {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPrefix = trimTrailingSlash(servicePrefix || "/service");
  if (path.startsWith(normalizedPrefix)) return path;
  return `${normalizedPrefix}${path.startsWith("/") ? path : `/${path}`}`;
};

const appendQuery = (url: string, query?: string) => {
  if (!query) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
};

const normalizeMethod = (method?: string) => {
  const value = String(method || "get").toUpperCase();
  return ["GET", "POST", "PUT", "DELETE", "PATCH"].includes(value)
    ? value
    : "GET";
};

const shouldRetryTransportRequest = (payload: PageRequestOptions | any) => {
  const method = normalizeMethod(payload?.method);
  if (method === "GET") return true;
  const path = String(payload?.path || "").split("?")[0];
  return method === "POST" && path === "/workflow/capabilities/resolve";
};

const normalizeCssIsolation = (value: unknown): RuntimeCssIsolation => {
  if (value === "namespace" || value === "shadow" || value === "none") {
    return value;
  }
  return "none";
};

const normalizeEnvelopeCode = (value: unknown, fallback: number): number | string => {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : String(value);
};

const isSuccessCode = (value: unknown) => {
  if (value === undefined || value === null || value === "") return true;
  const normalized = Number(value);
  return Number.isFinite(normalized)
    ? normalized === 0 || (normalized >= 200 && normalized < 300)
    : false;
};

const parseJsonResponse = async <TResult, TRaw = TResult>(
  response: Response,
): Promise<PageApiResponse<TResult, TRaw>> => {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object"
        ? payload.message || payload.error || response.statusText
        : response.statusText;
    throw new Error(message || "请求失败");
  }

  if (payload && typeof payload === "object" && "code" in payload) {
    const code = normalizeEnvelopeCode(payload.code, response.status);
    return {
      code,
      success: payload.success !== false && isSuccessCode(code),
      message: payload.message,
      result: (payload.result ?? payload.data ?? null) as TResult,
      data: payload.data as TRaw,
      raw: payload,
    };
  }

  return {
    code: response.status,
    success: response.ok,
    message: response.statusText,
    result: payload as TResult,
    data: payload as TRaw,
    raw: payload,
  };
};

export const createBrowserPageBridge = (
  options: BrowserRuntimeHostOptions = {},
): PageBridgeApi => {
  const servicePrefix = options.servicePrefix || getDefaultServicePrefix();
  const fetchImpl = createBoundFetch(options.fetchImpl);

  const request = async <TResult = unknown, TRaw = TResult>(
    payload: PageRequestOptions | any,
  ): Promise<PageApiResponse<TResult, TRaw>> => {
    if (!payload?.path) {
      throw new Error("transport.request 需要 path");
    }
    const url = appendQuery(joinServicePath(servicePrefix, payload.path), payload.query);
    const headers = new Headers(payload.headers as HeadersInit);
    let body: BodyInit | undefined;
    if (payload.body !== undefined) {
      if (payload.body instanceof FormData) {
        body = payload.body;
      } else {
        headers.set("Content-Type", headers.get("Content-Type") || "application/json");
        body = JSON.stringify(payload.body);
      }
    }
    const response = await fetchWithTransientRetry(fetchImpl, url, {
      method: normalizeMethod(payload.method),
      headers,
      body,
      credentials: "include",
      cache: payload.cache,
    }, {
      enabled: shouldRetryTransportRequest(payload),
    });
    return parseJsonResponse<TResult, TRaw>(response);
  };

  const download = async (payload: PageRequestOptions | any): Promise<PageBinaryResponse> => {
    if (!payload?.path) {
      throw new Error("transport.download 需要 path");
    }
    const url = appendQuery(joinServicePath(servicePrefix, payload.path), payload.query);
    const headers = new Headers(payload.headers as HeadersInit);
    let body: BodyInit | undefined;
    if (payload.body !== undefined) {
      if (payload.body instanceof FormData) {
        body = payload.body;
      } else {
        headers.set("Content-Type", headers.get("Content-Type") || "application/json");
        body = JSON.stringify(payload.body);
      }
    }
    const response = await fetchImpl(url, {
      method: normalizeMethod(payload.method),
      headers,
      body,
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error(response.statusText || "下载失败");
    }
    return {
      blob: await response.blob(),
      contentType: response.headers.get("content-type") || undefined,
      fileName: response.headers.get("content-disposition") || undefined,
      headers: Object.fromEntries(response.headers.entries()),
    };
  };

  return {
    invoke: async <T = unknown>(method: string, payload?: unknown): Promise<T> => {
      if (method === "transport.request") return (await request(payload)) as T;
      if (method === "transport.download") return (await download(payload)) as T;
      throw new Error(`不支持的 bridge 方法: ${method}`);
    },
  };
};

export const createBrowserPageContext = (
  bootstrap: RuntimeHostBootstrap,
  options: BrowserRuntimeHostOptions = {},
): PageContext => {
  const route = {
    pathname:
      options.route?.pathname ||
      (typeof window !== "undefined" ? window.location.pathname : ""),
    fullPath:
      options.route?.fullPath ||
      (typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}${window.location.hash}`
        : ""),
    params: options.route?.params || {},
    query: options.route?.query || {},
    hash:
      options.route?.hash ||
      (typeof window !== "undefined" ? window.location.hash : ""),
  };

  return {
    protocolVersion: bootstrap.asset?.protocolVersion || "1.0",
    app: bootstrap.app,
    page: {
      ...bootstrap.page,
      version: bootstrap.asset?.version || bootstrap.page.version,
      buildId: bootstrap.asset?.buildId || bootstrap.page.buildId,
    },
    user: bootstrap.user,
    route,
    env: bootstrap.env || {},
    permissions: {
      canView: bootstrap.permissions?.canView !== false,
      hasFullAccess: bootstrap.permissions?.hasFullAccess === true,
      ...(bootstrap.permissions || {}),
    },
    capabilities: Array.from(
      new Set([
        "navigation",
        "ui.message",
        "ui.modal",
        "transport.request",
        "transport.download",
        ...(bootstrap.sdk?.supportedBridgeMethods || []),
      ]),
    ),
    ui: {
      message: {
        success: text => options.message?.success?.(text),
        error: text => options.message?.error?.(text),
        warning: text => options.message?.warning?.(text),
        info: text => options.message?.info?.(text),
        loading: text => options.message?.loading?.(text) || (() => undefined),
      },
      modal: {
        confirm: input => options.modal?.confirm?.(input) || Promise.resolve(false),
      },
    },
    navigation: {
      pushPage: (pageKey, query) => options.navigation?.pushPage?.(pageKey, query),
      replacePage: (pageKey, query) =>
        options.navigation?.replacePage?.(pageKey, query),
      pushRoute: (routeValue, query) =>
        options.navigation?.pushRoute?.(routeValue, query),
      replaceRoute: (routeValue, query) =>
        options.navigation?.replaceRoute?.(routeValue, query),
      updateQuery: query => options.navigation?.updateQuery?.(query),
      setHash: hash => options.navigation?.setHash?.(hash),
      back: () => options.navigation?.back?.(),
    },
    bridge: createBrowserPageBridge(options),
    sdk: {
      ...bootstrap.sdk,
      supportedBridgeMethods: ["transport.request", "transport.download"],
    },
  };
};

export const resolveRuntimeAssets = async (
  bootstrap: RuntimeHostBootstrap,
  fetchImpl: typeof fetch = fetch,
): Promise<LoadedRuntimeAssets> => {
  const boundFetch = createBoundFetch(fetchImpl);
  const fallback: LoadedRuntimeAssets = {
    entryUrl: bootstrap.runtimeAssets?.entryUrl || bootstrap.asset?.entryUrl || "",
    cssUrls: bootstrap.runtimeAssets?.cssUrls || bootstrap.asset?.cssAssets || [],
    jsUrls: bootstrap.runtimeAssets?.jsUrls || bootstrap.asset?.jsAssets || [],
    cssIsolation: normalizeCssIsolation(
      bootstrap.runtimeAssets?.cssIsolation ||
        bootstrap.page.capabilities?.cssIsolation,
    ),
  };

  if (bootstrap.runtimeAssets?.entryUrl || !bootstrap.asset?.manifestUrl) {
    return fallback;
  }

  try {
    const response = await boundFetch(bootstrap.asset.manifestUrl, {
      credentials: "omit",
    });
    if (!response.ok) return fallback;
    const manifest = await response.json();
    const base = bootstrap.asset.manifestUrl;
    const resolveUrl = (value: string) => new URL(value, base).toString();
    return {
      entryUrl: manifest?.entry?.url
        ? resolveUrl(manifest.entry.url)
        : fallback.entryUrl,
      cssUrls: Array.isArray(manifest?.assets?.css)
        ? manifest.assets.css.map(resolveUrl)
        : fallback.cssUrls,
      jsUrls: Array.isArray(manifest?.assets?.js)
        ? manifest.assets.js.map(resolveUrl)
        : fallback.jsUrls,
      cssIsolation: normalizeCssIsolation(
        manifest?.style?.isolation || fallback.cssIsolation,
      ),
    };
  } catch {
    return fallback;
  }
};

export const fetchBrowserRuntimeBootstrap = async ({
  appType,
  bootstrapPath,
  fetchImpl = fetch,
  pageKey,
  servicePrefix,
}: BrowserRuntimeBootstrapOptions): Promise<RuntimeHostBootstrap> => {
  if (!appType) {
    throw new Error("appType 缺失");
  }
  if (!pageKey) {
    throw new Error("pageKey 缺失");
  }
  const path =
    bootstrapPath ||
    `/openxiangda-api/v1/apps/${encodeURIComponent(
      appType,
    )}/pages/${encodeURIComponent(pageKey)}/bootstrap`;
  const boundFetch = createBoundFetch(fetchImpl);
  const response = await boundFetch(
    joinServicePath(servicePrefix || getDefaultServicePrefix(), path),
    {
      method: "GET",
      credentials: "include",
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || response.statusText || "获取页面运行时失败");
  }
  if (
    payload &&
    typeof payload === "object" &&
    ("code" in payload || "success" in payload)
  ) {
    if (payload.success === false || (payload.code && Number(payload.code) !== 200)) {
      throw new Error(payload.message || "获取页面运行时失败");
    }
    return (payload.data || {}) as RuntimeHostBootstrap;
  }
  return (payload || {}) as RuntimeHostBootstrap;
};

export const resolveBrowserRuntimeRoute = async ({
  appType,
  fetchImpl = fetch,
  path,
  resolvePath,
  search,
  servicePrefix,
}: BrowserRuntimeRouteResolveOptions): Promise<BrowserRuntimeRouteResolution> => {
  if (!appType) {
    throw new Error("appType 缺失");
  }
  const currentPath =
    path ||
    (typeof window !== "undefined" ? window.location.pathname : "/");
  const currentSearch =
    search !== undefined
      ? search
      : typeof window !== "undefined"
        ? window.location.search
        : "";
  const endpoint =
    resolvePath ||
    `/openxiangda-api/v1/apps/${encodeURIComponent(
      appType,
    )}/runtime/routes/resolve`;
  const boundFetch = createBoundFetch(fetchImpl);
  const response = await boundFetch(
    joinServicePath(servicePrefix || getDefaultServicePrefix(), endpoint),
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: currentPath,
        search: currentSearch,
      }),
    },
  );
  const parsed = await parseJsonResponse<BrowserRuntimeRouteResolution>(response);
  if (!parsed.success || !parsed.result) {
    throw new Error(parsed.message || "解析运行时路由失败");
  }
  return parsed.result;
};

export const loadRuntimeScriptModules = async (
  jsUrls: string[] = [],
  moduleLoader: (url: string) => Promise<unknown> = defaultModuleLoader,
): Promise<void> => {
  const urls = Array.from(
    new Set(jsUrls.map(url => String(url || "").trim()).filter(Boolean)),
  );
  for (const url of urls) {
    await moduleLoader(url);
  }
};

export const loadCustomPageModule = async (
  entryUrl: string,
  moduleLoader: (url: string) => Promise<unknown> = defaultModuleLoader,
  jsUrls: string[] = [],
): Promise<CustomPageModule> => {
  if (!entryUrl) {
    throw new Error("代码页面缺少 entryUrl");
  }
  await loadRuntimeScriptModules(
    jsUrls.filter(url => url && url !== entryUrl),
    moduleLoader,
  );
  const loaded = (await moduleLoader(entryUrl)) as CustomPageModule;
  return loaded?.default && (loaded.default.mount || loaded.default.unmount)
    ? { ...loaded.default, ...loaded }
    : loaded || {};
};

export const mountCustomPageRuntime = async ({
  assets,
  container,
  context,
  module,
}: RuntimeMountOptions): Promise<() => Promise<void>> => {
  const cssIsolation = normalizeCssIsolation(assets?.cssIsolation);
  const mountedLinks: HTMLLinkElement[] = [];
  container.innerHTML = "";
  container.classList.toggle(NAMESPACE_ROOT_CLASS, cssIsolation === "namespace");

  (assets?.cssUrls || []).forEach(href => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-openxiangda-runtime-style", href);
    document.head.appendChild(link);
    mountedLinks.push(link);
  });

  await module.mount?.(container, context);

  return async () => {
    await module.unmount?.(container, context);
    mountedLinks.forEach(link => link.remove());
    container.classList.remove(NAMESPACE_ROOT_CLASS);
    container.innerHTML = "";
  };
};

export const mountBrowserPageRuntime = async (
  options: BrowserRuntimeMountOptions,
): Promise<BrowserRuntimeMountResult> => {
  const bootstrap = await fetchBrowserRuntimeBootstrap({
    appType: options.appType,
    pageKey: options.pageKey,
    bootstrapPath: options.bootstrapPath,
    fetchImpl: options.fetchImpl,
    servicePrefix: options.servicePrefix,
  });
  if (bootstrap.permissions?.canView === false) {
    throw new Error(String(bootstrap.permissions.message || "您没有权限访问该页面"));
  }
  const assets = await resolveRuntimeAssets(bootstrap, options.fetchImpl || fetch);
  if (!assets.entryUrl) {
    throw new Error("代码页面缺少 entryUrl");
  }
  const context = createBrowserPageContext(bootstrap, options);
  const module = await loadCustomPageModule(
    assets.entryUrl,
    options.moduleLoader,
    assets.jsUrls,
  );
  const cleanup = await mountCustomPageRuntime({
    assets,
    container: options.container,
    context,
    module,
  });
  return {
    bootstrap,
    assets,
    context,
    module,
    cleanup,
  };
};
