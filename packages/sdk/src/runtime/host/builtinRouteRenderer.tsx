import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Empty, Spin, Typography } from "antd";
import type {
  FormRuntimeApi,
  FormRuntimeApiConfig,
  FormSchema,
  RuntimeRequestConfig,
  RuntimeResponse,
} from "../../components/types";
import { createFormRuntimeApi } from "../../components/core/runtimeApi";
import { DataManagementList } from "../../components/modules/DataManagementList";
import { StandardFormPage } from "../../components/templates/StandardFormPage";
import { FilePreviewPage } from "../../components/file-preview";
import { createBoundFetch } from "../core/fetch";
import type {
  BrowserRuntimeRouteKind,
  BrowserRuntimeRouteResolution,
} from "./browserHost";
import { normalizeRuntimeFormSchema } from "./formSchema";

export interface BuiltinRouteSurfaceConfig {
  title?: string;
  formTitle?: string;
  formType?: string;
  enableDraft?: boolean;
  enableProcessPreview?: boolean;
  enableEdit?: boolean;
  enableDelete?: boolean;
  enableChangeRecords?: boolean;
  submitSuccessMode?: "redirect" | "continue" | "stay";
  readonly?: boolean;
  fullHeight?: boolean;
  configScope?: "global" | "personal";
  forcedConfig?: Record<string, any>;
  showForcedConfig?: boolean;
  [key: string]: any;
}

export interface BuiltinRouteOverrideComponentProps {
  route: BrowserRuntimeRouteResolution;
  kind: BrowserRuntimeRouteKind;
  appType: string;
  formUuid?: string;
  formInstId?: string;
  formInstanceId?: string;
  query: BrowserRuntimeRouteResolution["query"];
  schema?: FormSchema;
  api: FormRuntimeApi;
  servicePrefix: string;
  requestOverride: FormRuntimeApi["request"];
  config: BuiltinRouteSurfaceConfig;
  defaultNode: React.ReactNode;
  reload: () => void;
}

export type BuiltinRouteOverrideComponent =
  React.ComponentType<BuiltinRouteOverrideComponentProps>;

export type BuiltinRouteOverrides = Partial<
  Record<BrowserRuntimeRouteKind, Record<string, BuiltinRouteOverrideComponent | undefined>>
>;

export type BuiltinRouteConfigMap = Partial<
  Record<BrowserRuntimeRouteKind, Record<string, BuiltinRouteSurfaceConfig | undefined>>
>;

export interface BuiltinRouteRendererProps {
  route: BrowserRuntimeRouteResolution | null;
  appType?: string;
  servicePrefix?: string;
  requestOverride?: FormRuntimeApi["request"] | FormRuntimeApiConfig;
  overrides?: BuiltinRouteOverrides;
  config?: BuiltinRouteConfigMap;
  fetchImpl?: typeof fetch;
  className?: string;
  style?: React.CSSProperties;
}

const DEFAULT_SERVICE_PREFIX = "/service";

const trimTrailingSlash = (value?: string) =>
  String(value || DEFAULT_SERVICE_PREFIX).replace(/\/+$/, "") || DEFAULT_SERVICE_PREFIX;

const appendQuery = (url: string, params?: Record<string, any>) => {
  if (!params) return url;
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value)) {
      value.forEach(item => search.append(key, String(item)));
      return;
    }
    search.append(key, String(value));
  });
  const query = search.toString();
  if (!query) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
};

const joinServicePath = (servicePrefix: string, url: string) => {
  if (/^https?:\/\//i.test(url)) return url;
  const prefix = trimTrailingSlash(servicePrefix);
  if (url.startsWith(prefix)) return url;
  return `${prefix}${url.startsWith("/") ? url : `/${url}`}`;
};

const normalizeMethod = (method?: string) => {
  const value = String(method || "get").toUpperCase();
  return ["GET", "POST", "PUT", "DELETE", "PATCH"].includes(value)
    ? value
    : "GET";
};

const parseRuntimeResponse = async <T,>(
  response: Response,
): Promise<RuntimeResponse<T> | Blob> => {
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message || payload?.error || response.statusText || "请求失败");
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return response.blob();
  }
  return (await response.json()) as RuntimeResponse<T>;
};

export const createBuiltinRouteRequest =
  (
    servicePrefix = DEFAULT_SERVICE_PREFIX,
    fetchImpl: typeof fetch = fetch,
  ): FormRuntimeApi["request"] =>
  async <T = any>(config: RuntimeRequestConfig): Promise<RuntimeResponse<T> | Blob> => {
    const boundFetch = createBoundFetch(fetchImpl);
    const headers = new Headers(config.headers as HeadersInit);
    let body: BodyInit | undefined;
    if (config.data !== undefined) {
      if (config.data instanceof FormData) {
        body = config.data;
      } else {
        headers.set("Content-Type", headers.get("Content-Type") || "application/json");
        body = JSON.stringify(config.data);
      }
    }

    const response = await boundFetch(appendQuery(joinServicePath(servicePrefix, config.url), config.params), {
      method: normalizeMethod(config.method),
      headers,
      body,
      credentials: "include",
    });

    if (config.responseType === "blob") {
      if (!response.ok) throw new Error(response.statusText || "下载失败");
      return response.blob();
    }

    return parseRuntimeResponse<T>(response);
  };

const pickQueryValue = (
  query: BrowserRuntimeRouteResolution["query"] | undefined,
  key: string,
) => {
  const value = query?.[key];
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
};

const pickRouteValue = (
  route: BrowserRuntimeRouteResolution,
  ...keys: string[]
) => {
  for (const key of keys) {
    const value = route.params?.[key] || pickQueryValue(route.query, key);
    if (value) return value;
  }
  return "";
};

const isSchemaRoute = (kind: BrowserRuntimeRouteKind) =>
  kind === "form-submit" ||
  kind === "process-submit" ||
  kind === "form-preview" ||
  kind === "form-detail" ||
  kind === "process-detail";

const isProcessKind = (kind: BrowserRuntimeRouteKind, formType?: string) => {
  const raw = String(formType || "").toLowerCase();
  return kind === "process-submit" || kind === "process-detail" || raw === "process" || raw === "flow";
};

const normalizeSchema = (payload: any, appType: string, formUuid: string): FormSchema | undefined => {
  return normalizeRuntimeFormSchema(payload, { appType, formUuid });
};

const applyRouteConfigToSchema = (
  schema: FormSchema,
  kind: BrowserRuntimeRouteKind,
  config: BuiltinRouteSurfaceConfig,
): FormSchema => {
  const formType = config.formType || schema.template?.formType;
  const resolvedFormType: "form" | "process" | undefined = isProcessKind(kind, formType)
    ? "process"
    : formType === "form"
      ? "form"
      : schema.template?.formType;
  return {
    ...schema,
    template: {
      ...(schema.template || {}),
      ...(config.submitSuccessMode ? { submitSuccessMode: config.submitSuccessMode } : {}),
      ...(config.enableDraft !== undefined ? { enableDraft: config.enableDraft } : {}),
      ...(config.enableEdit !== undefined ? { enableEdit: config.enableEdit } : {}),
      ...(config.enableDelete !== undefined ? { enableDelete: config.enableDelete } : {}),
      ...(config.enableChangeRecords !== undefined
        ? { enableChangeRecords: config.enableChangeRecords }
        : {}),
      enableProcessPreview:
        config.enableProcessPreview ??
        schema.template?.enableProcessPreview ??
        isProcessKind(kind, resolvedFormType),
      formType: resolvedFormType,
    },
  };
};

const resolveRouteConfig = (
  route: BrowserRuntimeRouteResolution,
  configMap?: BuiltinRouteConfigMap,
): BuiltinRouteSurfaceConfig => {
  const formUuid = pickRouteValue(route, "formUuid", "menuFormUuid");
  const map = configMap?.[route.kind] || {};
  return {
    ...((route.runtime?.runtimeSettings as BuiltinRouteSurfaceConfig) || {}),
    ...((route.runtime?.config as BuiltinRouteSurfaceConfig) || {}),
    ...(map["*"] || {}),
    ...(formUuid ? map[formUuid] || {} : {}),
  };
};

const resolveOverride = (
  route: BrowserRuntimeRouteResolution,
  overrides?: BuiltinRouteOverrides,
) => {
  const formUuid = pickRouteValue(route, "formUuid", "menuFormUuid");
  const map = overrides?.[route.kind];
  return (formUuid && map?.[formUuid]) || map?.["*"];
};

const getFormMode = (kind: BrowserRuntimeRouteKind) => {
  if (kind === "process-detail") return "process" as const;
  if (kind === "form-detail" || kind === "form-preview") return "detail" as const;
  return "submit" as const;
};

const getDetailBasePath = (appType: string, formUuid: string, formType?: string) => {
  const detailType = isProcessKind("data-manage-list", formType) ? "processDetail" : "formDetail";
  return `/view/${appType}/${detailType}/${formUuid}`;
};


const BuiltinRouteError = ({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) => (
  <Card style={{ margin: 16 }}>
    <Alert
      type="error"
      showIcon
      title="内置页面加载失败"
      description={error}
      action={
        <Button size="small" onClick={onRetry}>
          重试
        </Button>
      }
    />
  </Card>
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

export function BuiltinRouteRenderer({
  route,
  appType: appTypeProp,
  className,
  config,
  fetchImpl = fetch,
  overrides,
  requestOverride,
  servicePrefix = DEFAULT_SERVICE_PREFIX,
  style,
}: BuiltinRouteRendererProps) {
  const normalizedServicePrefix = trimTrailingSlash(servicePrefix);
  const [schema, setSchema] = useState<FormSchema | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const requestConfig =
    requestOverride && typeof requestOverride === "object" ? requestOverride : undefined;

  const request = useMemo<FormRuntimeApi["request"]>(() => {
    if (typeof requestOverride === "function") return requestOverride;
    if (requestConfig?.request) return requestConfig.request;
    return createBuiltinRouteRequest(requestConfig?.baseUrl || normalizedServicePrefix, fetchImpl);
  }, [fetchImpl, normalizedServicePrefix, requestConfig, requestOverride]);

  const api = useMemo(
    () =>
      createFormRuntimeApi({
        baseUrl: normalizedServicePrefix,
        ...(requestConfig || {}),
        request,
      }),
    [normalizedServicePrefix, request, requestConfig],
  );

  const appType = appTypeProp || route?.appType || "";
  const formUuid = route ? pickRouteValue(route, "formUuid", "menuFormUuid") : "";
  const formInstId = route ? pickRouteValue(route, "formInstId", "formInstanceId") : "";
  const routeConfig = useMemo(
    () => (route ? resolveRouteConfig(route, config) : {}),
    [config, route],
  );
  const runtimeStorage = route?.runtime?.storage as
    | { defaultUploadProvider?: string }
    | undefined;
  const permissionDenied = isRuntimePermissionDenied(route);
  const reload = useCallback(() => setReloadKey(value => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    setSchema(undefined);
    setError("");

    if (
      !route ||
      permissionDenied ||
      route.mode !== "builtin-route" ||
      !isSchemaRoute(route.kind)
    ) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    if (!appType || !formUuid) {
      setError("缺少 appType 或 formUuid");
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const loadSchema = async () => {
      setLoading(true);
      try {
        const endpoint =
          (route.runtime?.bootstrapEndpoint as string) ||
          `/openxiangda-api/v1/apps/${encodeURIComponent(appType)}/forms/${encodeURIComponent(formUuid)}`;
        const response = await request({
          url: endpoint,
          method: "get",
        });
        const normalized = normalizeSchema(response, appType, formUuid);
        if (!normalized) {
          throw new Error("后端未返回可渲染的表单 schema");
        }
        if (!cancelled) {
          setSchema(applyRouteConfigToSchema(normalized, route.kind, routeConfig));
        }
      } catch (currentError: any) {
        if (!cancelled) {
          setError(currentError?.message || "加载表单 schema 失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadSchema();
    return () => {
      cancelled = true;
    };
  }, [api, appType, formUuid, permissionDenied, reloadKey, request, route, routeConfig]);

  if (!route) return null;

  if (permissionDenied) {
    return (
      <div className={className} style={style} data-openxiangda-builtin-route={route.kind}>
        <Alert
          type="warning"
          showIcon
          title={getRuntimePermissionMessage(route)}
          style={{ margin: 16 }}
        />
      </div>
    );
  }

  if (route.mode !== "builtin-route") {
    return route.message ? (
      <Alert type="info" showIcon title={route.message} style={{ margin: 16 }} />
    ) : null;
  }

  let defaultNode: React.ReactNode;
  if (route.kind === "file-preview") {
    defaultNode = (
      <FilePreviewPage
        ticket={pickRouteValue(route, "ticket")}
        request={request}
        servicePrefix={normalizedServicePrefix}
      />
    );
  } else if (route.kind === "data-manage-list") {
    if (!appType || !formUuid) {
      defaultNode = (
        <Card style={{ margin: 16 }}>
          <Empty description="数据管理页缺少 formUuid，请在 URL 或 resolver params 中提供 formUuid" />
        </Card>
      );
    } else {
      const formType =
        routeConfig.formType ||
        route.params?.formType ||
        pickQueryValue(route.query, "formType") ||
        (route.runtime?.formType as string | undefined);
      defaultNode = (
        <DataManagementList
          appType={appType}
          formUuid={formUuid}
          menuFormUuid={route.params?.menuFormUuid || pickQueryValue(route.query, "menuFormUuid") || undefined}
          detailBasePath={getDetailBasePath(appType, formUuid, formType)}
          readonly={routeConfig.readonly}
          fullHeight={routeConfig.fullHeight ?? true}
          configScope={routeConfig.configScope || "personal"}
          title={routeConfig.title}
          formTitle={routeConfig.formTitle}
          formType={formType}
          forcedConfig={routeConfig.forcedConfig}
          showForcedConfig={routeConfig.showForcedConfig}
          requestOverride={request}
        />
      );
    }
  } else if (loading) {
    defaultNode = <Spin style={{ margin: 32 }} />;
  } else if (error) {
    defaultNode = <BuiltinRouteError error={error} onRetry={reload} />;
  } else if (!schema) {
    defaultNode = (
      <Card style={{ margin: 16 }}>
        <Empty description="当前内置页面没有可渲染的 schema" />
      </Card>
    );
  } else {
    defaultNode = (
      <StandardFormPage
        schema={schema}
        mode={getFormMode(route.kind)}
        appType={appType}
        formUuid={formUuid}
        formInstanceId={formInstId}
        defaultUploadProvider={
          runtimeStorage?.defaultUploadProvider === "builtin-oss"
            ? "builtin-oss"
            : undefined
        }
        api={api}
      />
    );
  }

  const Override = resolveOverride(route, overrides);
  const content = Override ? (
    <Override
      route={route}
      kind={route.kind}
      appType={appType}
      formUuid={formUuid || undefined}
      formInstId={formInstId || undefined}
      formInstanceId={formInstId || undefined}
      query={route.query}
      schema={schema}
      api={api}
      servicePrefix={normalizedServicePrefix}
      requestOverride={request}
      config={routeConfig}
      defaultNode={defaultNode}
      reload={reload}
    />
  ) : (
    defaultNode
  );

  return (
    <div className={className} style={style} data-openxiangda-builtin-route={route.kind}>
      {route.message && route.runtime?.permission ? (
        <Alert
          type="warning"
          showIcon
          title={route.message}
          style={{ margin: 16 }}
        />
      ) : null}
      {content}
      {process.env.NODE_ENV !== "production" && route.kind === "data-manage-list" && !formUuid ? (
        <Typography.Text type="secondary" style={{ display: "block", margin: 16 }}>
          提示：本地数据管理页可使用 ?formUuid=xxx 指定表单。
        </Typography.Text>
      ) : null}
    </div>
  );
}
