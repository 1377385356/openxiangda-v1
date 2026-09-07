import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  appMessageCalls: [] as any[],
  appMessageApi: null as any,
  configProps: [] as any[],
  messageConfigProps: [] as any[],
  staticConfigProps: [] as any[],
  styleProps: [] as any[],
  styleContainers: [] as any[],
}));

vi.mock("@ant-design/cssinjs", async () => {
  const ReactModule = await import("react");
  return {
    StyleProvider: ({ children, container, ...props }: any) => {
      captured.styleProps.push(props);
      captured.styleContainers.push(container);
      return ReactModule.createElement(
        "div",
        { "data-testid": "style-provider" },
        children,
      );
    },
  };
});

vi.mock("antd", async () => {
  const ReactModule = await import("react");
  captured.appMessageApi = {
    open: (...args: any[]) => captured.appMessageCalls.push(["open", args]),
    success: (...args: any[]) =>
      captured.appMessageCalls.push(["success", args]),
    info: (...args: any[]) => captured.appMessageCalls.push(["info", args]),
    warning: (...args: any[]) =>
      captured.appMessageCalls.push(["warning", args]),
    error: (...args: any[]) => captured.appMessageCalls.push(["error", args]),
    loading: (...args: any[]) =>
      captured.appMessageCalls.push(["loading", args]),
    destroy: (...args: any[]) =>
      captured.appMessageCalls.push(["destroy", args]),
  };
  const ConfigProvider = Object.assign(
    (props: any) => {
      captured.configProps.push(props);
      return ReactModule.createElement(
        "div",
        { "data-testid": "config-provider" },
        props.children,
      );
    },
    {
      config: (props: any) => {
        captured.staticConfigProps.push(props);
      },
    },
  );

  const message = {
    config: (props: any) => {
      captured.messageConfigProps.push(props);
    },
    open: (...args: any[]) => captured.appMessageCalls.push(["static-open", args]),
    success: (...args: any[]) =>
      captured.appMessageCalls.push(["static-success", args]),
    info: (...args: any[]) => captured.appMessageCalls.push(["static-info", args]),
    warning: (...args: any[]) =>
      captured.appMessageCalls.push(["static-warning", args]),
    error: (...args: any[]) =>
      captured.appMessageCalls.push(["static-error", args]),
    loading: (...args: any[]) =>
      captured.appMessageCalls.push(["static-loading", args]),
    destroy: (...args: any[]) =>
      captured.appMessageCalls.push(["static-destroy", args]),
  };
  const App = Object.assign(
    ({ children }: any) =>
      ReactModule.createElement("div", { "data-testid": "antd-app" }, children),
    {
      useApp: () => ({ message: captured.appMessageApi }),
    },
  );

  return {
    ConfigProvider,
    message,
    App,
  };
});

vi.mock("antd/locale/zh_CN.js", () => ({ default: { locale: "zh-cn" } }));

import { createReactPage } from "./createReactPage";
import { message } from "antd";

function createContext(cssIsolation = "none") {
  return {
    page: {
      capabilities: { cssIsolation },
    },
  } as any;
}

describe("createReactPage", () => {
  afterEach(() => {
    captured.appMessageCalls = [];
    captured.configProps = [];
    captured.messageConfigProps = [];
    captured.staticConfigProps = [];
    captured.styleProps = [];
    captured.styleContainers = [];
    document.body.innerHTML = "";
  });

  it("uses default AntD classes and no namespace portal when cssIsolation is none", async () => {
    const mountEl = document.createElement("div");
    document.body.appendChild(mountEl);
    const page = createReactPage(() =>
      React.createElement("div", null, "page"),
    );

    await act(async () => page.mount(mountEl, createContext("none")));

    const configProps = captured.configProps.at(-1);
    expect(mountEl.classList.contains("sy-app-workspace")).toBe(false);
    expect(captured.styleContainers.at(-1)).toBe(document.head);
    expect(configProps.prefixCls).toBe("ant");
    expect(configProps.iconPrefixCls).toBe("anticon");
    expect(configProps.locale).toEqual({ locale: "zh-cn" });
    expect(configProps.getPopupContainer).toBeUndefined();
    expect(captured.staticConfigProps.at(-1).prefixCls).toBe("ant");
    expect(captured.messageConfigProps.at(-1).prefixCls).toBe("ant-message");
    expect(captured.messageConfigProps.at(-1).getContainer()).toBe(
      document.body,
    );
    expect(document.querySelector("[data-sy-runtime-portal]")).toBeNull();
    await act(async () => page.unmount());
    mountEl.remove();
  });

  it("uses a namespaced shadow-root portal for legacy AntD overlays when mounted in ShadowRoot", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: "open" });
    const mountEl = document.createElement("div");
    shadowRoot.appendChild(mountEl);
    const page = createReactPage(() =>
      React.createElement("div", null, "page"),
    );

    await act(async () => page.mount(mountEl, createContext("shadow")));

    const configProps = captured.configProps.at(-1);
    const popupContainer = configProps.getPopupContainer() as HTMLElement;
    expect(captured.styleProps.at(-1)).toEqual({ hashPriority: "high" });
    expect(captured.styleContainers.at(-1)).toBe(shadowRoot);
    expect(popupContainer.getAttribute("data-sy-runtime-portal")).toBe("");
    expect(popupContainer.classList.contains("sy-app-workspace")).toBe(true);
    expect(popupContainer.parentNode).toBe(shadowRoot);
    expect(configProps.getTargetContainer()).toBe(mountEl);
    expect(configProps.locale).toEqual({ locale: "zh-cn" });
    expect(captured.staticConfigProps.at(-1).prefixCls).toBe("sy-ant");
    expect(captured.staticConfigProps.at(-1).holderRender).toEqual(
      expect.any(Function),
    );
    expect(captured.messageConfigProps.at(-1).prefixCls).toBe("sy-ant-message");
    expect(captured.messageConfigProps.at(-1).getContainer()).toBe(
      popupContainer,
    );
    message.success("saved");
    expect(captured.appMessageCalls.at(-1)).toEqual(["success", ["saved"]]);
    await act(async () => page.unmount());
    expect(popupContainer.isConnected).toBe(false);
    host.remove();
  });

  it("uses a namespaced body portal for legacy non-shadow AntD overlays", async () => {
    const mountEl = document.createElement("div");
    document.body.appendChild(mountEl);
    const page = createReactPage(() =>
      React.createElement("div", null, "page"),
    );

    await act(async () => page.mount(mountEl, createContext("namespace")));

    const configProps = captured.configProps.at(-1);
    const popupContainer = configProps.getPopupContainer() as HTMLElement;
    expect(captured.styleContainers.at(-1)).toBe(document.head);
    expect(popupContainer.getAttribute("data-sy-runtime-portal")).toBe("");
    expect(popupContainer.classList.contains("sy-app-workspace")).toBe(true);
    expect(popupContainer.parentNode).toBe(document.body);
    expect(configProps.getTargetContainer()).toBe(mountEl);
    expect(captured.messageConfigProps.at(-1).getContainer()).toBe(
      popupContainer,
    );
    await act(async () => page.unmount());
    expect(popupContainer.isConnected).toBe(false);
    mountEl.remove();
  });

  it("keeps popups in the runtime portal even when trigger has an overflow parent", async () => {
    const mountEl = document.createElement("div");
    const overflowParent = document.createElement("div");
    const trigger = document.createElement("button");
    overflowParent.style.overflow = "hidden";
    overflowParent.appendChild(trigger);
    document.body.append(mountEl, overflowParent);
    const page = createReactPage(() =>
      React.createElement("div", null, "page"),
    );

    await act(async () => page.mount(mountEl, createContext("namespace")));

    const configProps = captured.configProps.at(-1);
    const popupContainer = configProps.getPopupContainer(trigger) as HTMLElement;
    expect(popupContainer.getAttribute("data-sy-runtime-portal")).toBe("");
    expect(popupContainer.parentNode).toBe(document.body);
    expect(popupContainer).not.toBe(overflowParent);
    await act(async () => page.unmount());
    mountEl.remove();
    overflowParent.remove();
  });
});
