import { StyleProvider } from "@ant-design/cssinjs";
import { App as AntdApp, ConfigProvider, message } from "antd";
import zhCN from "antd/locale/zh_CN.js";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn.js";
import React from "react";
import { createRoot } from "react-dom/client";

import { PageProvider } from "./provider";
import { antdTheme, legacyAntdTheme } from "../../styles/antd-theme";

import type { PageContext } from "../core/types";

dayjs.locale("zh-cn");

type RootLike = {
  render: (node: React.ReactNode) => void;
  unmount: () => void;
};

const NAMESPACE_ROOT_CLASS = "sy-app-workspace";
const RUNTIME_PORTAL_ATTR = "data-sy-runtime-portal";
const PORTAL_CONTAINER_STACK_GLOBAL = "__OPENXIANGDA_PORTAL_CONTAINER_STACK__";
const PORTAL_CONTAINER_RESOLVER_GLOBAL = "__OPENXIANGDA_GET_PORTAL_CONTAINER__";
const MESSAGE_PROXY_GLOBAL = "__OPENXIANGDA_ANTD_MESSAGE_PROXY__";
const MESSAGE_METHODS = [
  "open",
  "success",
  "info",
  "warning",
  "error",
  "loading",
  "destroy",
] as const;

type RuntimePortalHandle = {
  container: HTMLElement | null;
  release: () => void;
};

type RuntimeCssIsolation = "none" | "namespace" | "shadow";

type MessageMethod = (typeof MESSAGE_METHODS)[number];

type AntdMessageProxyState = {
  apiStack: Array<Record<string, unknown>>;
  installed: boolean;
  originalMethods: Partial<Record<MessageMethod, (...args: unknown[]) => unknown>>;
};

const createRuntimeRoot = (el: HTMLElement): RootLike => {
  return createRoot(el);
};

const normalizeCssIsolation = (value: unknown): RuntimeCssIsolation => {
  if (value === "namespace" || value === "shadow") return value;
  return "none";
};

const usesLegacyCssIsolation = (cssIsolation: RuntimeCssIsolation) =>
  cssIsolation === "namespace" || cssIsolation === "shadow";

const getRuntimeCssIsolation = (context: PageContext): RuntimeCssIsolation =>
  normalizeCssIsolation(context.page?.capabilities?.cssIsolation);

const getAntdRuntimeOptions = (cssIsolation: RuntimeCssIsolation) => {
  const legacy = usesLegacyCssIsolation(cssIsolation);
  return {
    prefixCls: legacy ? "sy-ant" : "ant",
    iconPrefixCls: legacy ? "sy-anticon" : "anticon",
    messagePrefixCls: legacy ? "sy-ant-message" : "ant-message",
    theme: legacy ? legacyAntdTheme : antdTheme,
  };
};

const isShadowRoot = (rootNode: Node | null | undefined): rootNode is ShadowRoot =>
  typeof ShadowRoot !== "undefined" && rootNode instanceof ShadowRoot;

const getStyleContainer = (el: HTMLElement): HTMLElement | ShadowRoot => {
  const rootNode = el.getRootNode?.();
  if (isShadowRoot(rootNode)) {
    return rootNode;
  }
  return document.head;
};

const getRuntimeRoot = (el: HTMLElement, triggerNode?: HTMLElement) => {
  const rootNode = el.getRootNode?.();
  if (isShadowRoot(rootNode)) return el;
  const triggerRoot = triggerNode?.closest?.<HTMLElement>(
    `.${NAMESPACE_ROOT_CLASS}`,
  );
  return (
    triggerRoot ||
    el.closest<HTMLElement>(`.${NAMESPACE_ROOT_CLASS}`) ||
    el.querySelector<HTMLElement>(`.${NAMESPACE_ROOT_CLASS}`) ||
    el
  );
};

const getRuntimeOverlayContainer = (
  el: HTMLElement,
  portalContainer: HTMLElement | null,
): {
  getPopupContainer: (triggerNode?: HTMLElement) => HTMLElement | ShadowRoot;
  getTargetContainer: () => HTMLElement | ShadowRoot;
} => {
  const getOverlayRoot = (triggerNode?: HTMLElement) => {
    if (portalContainer?.isConnected) return portalContainer;
    return getRuntimeRoot(el, triggerNode);
  };

  return {
    getPopupContainer: (triggerNode?: HTMLElement) => {
      return getOverlayRoot(triggerNode);
    },
    getTargetContainer: () => getRuntimeRoot(el),
  };
};

const createAntdConfig = (
  overlayContainer: ReturnType<typeof getRuntimeOverlayContainer>,
  cssIsolation: RuntimeCssIsolation,
) => {
  const antdOptions = getAntdRuntimeOptions(cssIsolation);
  return {
    locale: zhCN,
    prefixCls: antdOptions.prefixCls,
    iconPrefixCls: antdOptions.iconPrefixCls,
    theme: antdOptions.theme,
    ...(usesLegacyCssIsolation(cssIsolation)
      ? {
          getPopupContainer: overlayContainer.getPopupContainer,
          getTargetContainer: overlayContainer.getTargetContainer,
        }
      : {}),
  };
};

const createPortalContainer = (el: HTMLElement) => {
  const rootNode = el.getRootNode?.();
  const parent = isShadowRoot(rootNode)
    ? rootNode
    : el.ownerDocument?.body || document.body;
  const portalContainer = el.ownerDocument.createElement("div");
  portalContainer.setAttribute(RUNTIME_PORTAL_ATTR, "");
  portalContainer.classList.add(NAMESPACE_ROOT_CLASS);
  parent.appendChild(portalContainer);
  return portalContainer;
};

const getAntdMessageProxyState = (): AntdMessageProxyState => {
  const globalScope = globalThis as typeof globalThis & {
    [MESSAGE_PROXY_GLOBAL]?: AntdMessageProxyState;
  };
  if (!globalScope[MESSAGE_PROXY_GLOBAL]) {
    globalScope[MESSAGE_PROXY_GLOBAL] = {
      apiStack: [],
      installed: false,
      originalMethods: {},
    };
  }
  return globalScope[MESSAGE_PROXY_GLOBAL];
};

const installAntdMessageProxy = () => {
  const state = getAntdMessageProxyState();
  if (state.installed) return state;
  MESSAGE_METHODS.forEach((method) => {
    const originalMethod = (message as unknown as Record<string, unknown>)[method];
    if (typeof originalMethod !== "function") return;
    state.originalMethods[method] = originalMethod.bind(message) as (
      ...args: unknown[]
    ) => unknown;
    (message as unknown as Record<string, unknown>)[method] = (
      ...args: unknown[]
    ) => {
      const api = state.apiStack.at(-1);
      const apiMethod = api?.[method];
      if (typeof apiMethod === "function") {
        return apiMethod(...args);
      }
      return state.originalMethods[method]?.(...args);
    };
  });
  state.installed = true;
  return state;
};

const registerAntdMessageApi = (api: Record<string, unknown>) => {
  const state = installAntdMessageProxy();
  state.apiStack.push(api);
  return () => {
    const position = state.apiStack.lastIndexOf(api);
    if (position >= 0) {
      state.apiStack.splice(position, 1);
    }
  };
};

const installRuntimePortalContainer = (
  el: HTMLElement,
  cssIsolation: RuntimeCssIsolation,
): RuntimePortalHandle => {
  const globalScope = globalThis as typeof globalThis & {
    [PORTAL_CONTAINER_STACK_GLOBAL]?: HTMLElement[];
    [PORTAL_CONTAINER_RESOLVER_GLOBAL]?: () => HTMLElement;
  };
  const portalContainer = usesLegacyCssIsolation(cssIsolation)
    ? createPortalContainer(el)
    : null;
  const stack = Array.isArray(globalScope[PORTAL_CONTAINER_STACK_GLOBAL])
    ? globalScope[PORTAL_CONTAINER_STACK_GLOBAL]
    : [];
  const stackTarget = portalContainer ?? el.ownerDocument?.body ?? document.body;
  stack.push(stackTarget);
  globalScope[PORTAL_CONTAINER_STACK_GLOBAL] = stack;
  globalScope[PORTAL_CONTAINER_RESOLVER_GLOBAL] = () => {
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      const candidate = stack[index];
      if (candidate?.isConnected) {
        return candidate;
      }
    }
    return (
      document.querySelector<HTMLElement>(`[${RUNTIME_PORTAL_ATTR}]`) ||
      document.querySelector<HTMLElement>(`.${NAMESPACE_ROOT_CLASS}`) ||
      document.body
    );
  };

  return {
    container: portalContainer,
    release: () => {
      const position = stack.lastIndexOf(stackTarget);
      if (position >= 0) {
        stack.splice(position, 1);
      }
      portalContainer?.remove();
    },
  };
};

const installAntdStaticHolder = (
  el: HTMLElement,
  portalContainer: HTMLElement | null,
  cssIsolation: RuntimeCssIsolation,
) => {
  installAntdMessageProxy();
  const antdOptions = getAntdRuntimeOptions(cssIsolation);
  const getMessageContainer = () => {
    if (portalContainer?.isConnected) return portalContainer;
    return usesLegacyCssIsolation(cssIsolation) ? getRuntimeRoot(el) : document.body;
  };

  ConfigProvider.config({
    prefixCls: antdOptions.prefixCls,
    iconPrefixCls: antdOptions.iconPrefixCls,
    theme: antdOptions.theme,
    holderRender: (children) => {
      if (!el.isConnected) {
        return (
          <ConfigProvider
            locale={zhCN}
            prefixCls={antdOptions.prefixCls}
            iconPrefixCls={antdOptions.iconPrefixCls}
            theme={antdOptions.theme}
          >
            {children}
          </ConfigProvider>
        );
      }
      const overlayContainer = getRuntimeOverlayContainer(el, portalContainer);
      return (
        <StyleProvider hashPriority="high" container={getStyleContainer(el)}>
          <ConfigProvider {...createAntdConfig(overlayContainer, cssIsolation)}>
            {children}
          </ConfigProvider>
        </StyleProvider>
      );
    },
  });
  message.config({
    prefixCls: antdOptions.messagePrefixCls,
    getContainer: getMessageContainer,
  });
};

const RuntimeMessageBridge = ({ children }: { children: React.ReactNode }) => {
  const appContext = AntdApp.useApp();
  React.useLayoutEffect(() => {
    return registerAntdMessageApi(
      appContext.message as unknown as Record<string, unknown>,
    );
  }, [appContext.message]);
  return <>{children}</>;
};

export const createReactPage = (
  AppComponent: React.ComponentType,
): {
  mount: (el: HTMLElement, context: PageContext) => void;
  update: (el: HTMLElement, context: PageContext) => void;
  unmount: () => void;
} => {
  let root: RootLike | null = null;
  let currentContainer: HTMLElement | null = null;
  let releasePortalContainer: (() => void) | null = null;
  let portalContainer: HTMLElement | null = null;
  let currentCssIsolation: RuntimeCssIsolation | null = null;

  const render = (el: HTMLElement, context: PageContext) => {
    const cssIsolation = getRuntimeCssIsolation(context);
    if (usesLegacyCssIsolation(cssIsolation)) {
      el.classList.add(NAMESPACE_ROOT_CLASS);
    } else {
      el.classList.remove(NAMESPACE_ROOT_CLASS);
    }
    if (
      !root ||
      currentContainer !== el ||
      currentCssIsolation !== cssIsolation ||
      (usesLegacyCssIsolation(cssIsolation) && !portalContainer?.isConnected)
    ) {
      root?.unmount();
      releasePortalContainer?.();
      root = createRuntimeRoot(el);
      currentContainer = el;
      currentCssIsolation = cssIsolation;
      const portalHandle = installRuntimePortalContainer(el, cssIsolation);
      portalContainer = portalHandle.container;
      releasePortalContainer = portalHandle.release;
    }
    const overlayContainer = getRuntimeOverlayContainer(el, portalContainer);
    installAntdStaticHolder(el, portalContainer, cssIsolation);
    const antdConfig = createAntdConfig(overlayContainer, cssIsolation);

    root.render(
      <StyleProvider hashPriority="high" container={getStyleContainer(el)}>
        <ConfigProvider {...antdConfig}>
          <AntdApp>
            <RuntimeMessageBridge>
              <PageProvider context={context}>
                <AppComponent />
              </PageProvider>
            </RuntimeMessageBridge>
          </AntdApp>
        </ConfigProvider>
      </StyleProvider>,
    );
  };

  return {
    mount: (el, context) => {
      render(el, context);
    },
    update: (el, context) => {
      render(el, context);
    },
    unmount: () => {
      root?.unmount();
      releasePortalContainer?.();
      root = null;
      currentContainer = null;
      releasePortalContainer = null;
      portalContainer = null;
      currentCssIsolation = null;
    },
  };
};
