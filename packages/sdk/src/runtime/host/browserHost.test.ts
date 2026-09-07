import { describe, expect, it, vi } from "vitest";
import type { PageContext } from "../core/types";
import {
  createBrowserPageBridge,
  createBrowserPageContext,
  fetchBrowserRuntimeBootstrap,
  loadCustomPageModule,
  mountBrowserPageRuntime,
  mountCustomPageRuntime,
  resolveBrowserRuntimeRoute,
} from "./browserHost";

const createBootstrap = () => ({
  app: {
    appType: "APP_DEMO",
    tenantId: "tenant-1",
  },
  page: {
    id: "page-1",
    code: "home",
    name: "首页",
    type: "custom",
    rendererType: "custom_bundle",
    routeKey: "home",
    status: "active",
    props: {},
    route: {},
    dataSources: [],
    capabilities: {},
  },
  user: {
    id: "user-1",
    username: "alice",
    tenantId: "tenant-1",
  },
});

describe("browser runtime host", () => {
  it("sends bridge requests through the configured service prefix", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ code: 200, data: { ok: true } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;
    const bridge = createBrowserPageBridge({
      servicePrefix: "/service",
      fetchImpl,
    });

    const response = await bridge.invoke("transport.request", {
      path: "/APP_DEMO/v1/form/advancedSearch.json",
      method: "post",
      query: "page=1",
      body: { formUuid: "form-1" },
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "/service/APP_DEMO/v1/form/advancedSearch.json?page=1",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
    expect(response).toMatchObject({
      code: 200,
      success: true,
      result: { ok: true },
    });
  });

  it("downloads relative file tickets through the service prefix with credentials", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(new Blob(["export"]), {
        status: 200,
        headers: {
          "content-disposition":
            "attachment; filename*=UTF-8''admin-list.xlsx",
          "content-type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      }),
    ) as unknown as typeof fetch;
    const bridge = createBrowserPageBridge({
      servicePrefix: "/service",
      fetchImpl,
    });

    const response = await bridge.invoke("transport.download", {
      path: "/file/download-by-ticket?ticket=ticket-1",
      method: "get",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "/service/file/download-by-ticket?ticket=ticket-1",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      }),
    );
    expect(response).toMatchObject({
      fileName: "attachment; filename*=UTF-8''admin-list.xlsx",
    });
    expect((response as { blob: Blob }).blob).toBeInstanceOf(Blob);
  });

  it("marks HTTP 200 envelopes with string business error codes as failed", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          code: "PUBLIC_GRANT_DENIED",
          message: "公开访问未授权查询该资源",
          data: null,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    ) as unknown as typeof fetch;
    const bridge = createBrowserPageBridge({
      servicePrefix: "/service",
      fetchImpl,
    });

    const response = await bridge.invoke("transport.request", {
      path: "/APP_DEMO/v1/data-views/private/query.json",
      method: "post",
    });

    expect(response).toMatchObject({
      code: "PUBLIC_GRANT_DENIED",
      success: false,
      message: "公开访问未授权查询该资源",
    });
  });

  it("retries transient workflow capability resolve fetch failures", async () => {
    const timeoutError = new Error("fetch failed") as any;
    timeoutError.cause = { code: "UND_ERR_CONNECT_TIMEOUT" };
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 200, data: { operations: [] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ) as unknown as typeof fetch;
    const bridge = createBrowserPageBridge({
      servicePrefix: "/service",
      fetchImpl,
    });

    const response = await bridge.invoke("transport.request", {
      path: "/workflow/capabilities/resolve",
      method: "post",
      body: { formInstId: "inst-1" },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(response).toMatchObject({
      code: 200,
      success: true,
      result: { operations: [] },
    });
  });

  it("creates a PageContext with browser bridge and permission defaults", () => {
    const context = createBrowserPageContext(createBootstrap(), {
      route: {
        pathname: "/view/APP_DEMO/workbench/home",
        fullPath: "/view/APP_DEMO/workbench/home?tab=a",
        params: { appType: "APP_DEMO", pageKey: "home" },
        query: { tab: "a" },
        hash: "",
      },
      servicePrefix: "/service",
    });

    expect(context.app.appType).toBe("APP_DEMO");
    expect(context.page.code).toBe("home");
    expect(context.permissions).toMatchObject({
      canView: true,
      hasFullAccess: false,
    });
    expect(context.capabilities).toContain("transport.request");
  });

  it("mounts a custom page module and cleans up runtime styles", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const context = createBrowserPageContext(createBootstrap()) as PageContext;
    const mount = vi.fn((el: HTMLElement) => {
      el.textContent = "mounted";
    });
    const unmount = vi.fn();

    const cleanup = await mountCustomPageRuntime({
      container,
      context,
      module: { mount, unmount },
      assets: {
        cssIsolation: "namespace",
        cssUrls: ["/assets/page.css"],
      },
    });

    expect(mount).toHaveBeenCalledWith(container, context);
    expect(container.classList.contains("sy-app-workspace")).toBe(true);
    expect(document.head.querySelector('[data-openxiangda-runtime-style="/assets/page.css"]')).toBeTruthy();

    await cleanup();

    expect(unmount).toHaveBeenCalledWith(container, context);
    expect(container.classList.contains("sy-app-workspace")).toBe(false);
    expect(document.head.querySelector('[data-openxiangda-runtime-style="/assets/page.css"]')).toBeNull();
    container.remove();
  });

  it("loads shared runtime scripts before the custom page entry", async () => {
    const mount = vi.fn();
    const moduleLoader = vi.fn(async (url: string) => {
      if (url === "/assets/entry.js") {
        return { mount };
      }
      return {};
    });

    const loaded = await loadCustomPageModule(
      "/assets/entry.js",
      moduleLoader,
      ["/assets/vendor.js", "/assets/shared.js", "/assets/vendor.js"],
    );

    expect(moduleLoader.mock.calls.map(call => call[0])).toEqual([
      "/assets/vendor.js",
      "/assets/shared.js",
      "/assets/entry.js",
    ]);
    expect(loaded.mount).toBe(mount);
  });

  it("fetches runtime bootstrap through the service prefix", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          code: 200,
          success: true,
          data: createBootstrap(),
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    ) as unknown as typeof fetch;

    const bootstrap = await fetchBrowserRuntimeBootstrap({
      appType: "APP_DEMO",
      pageKey: "home",
      servicePrefix: "/service",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "/service/openxiangda-api/v1/apps/APP_DEMO/pages/home/bootstrap",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      }),
    );
    expect(bootstrap.page.code).toBe("home");
  });

  it("resolves browser runtime routes through the service prefix", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          code: 200,
          data: {
            appType: "APP_DEMO",
            path: "/APP_DEMO/workbench/home",
            search: "?route=dashboard",
            kind: "custom-page",
            mode: "custom-page",
            params: { pageKey: "home" },
            query: { route: "dashboard" },
            runtime: {
              renderer: "custom-page",
            },
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    ) as unknown as typeof fetch;

    const route = await resolveBrowserRuntimeRoute({
      appType: "APP_DEMO",
      path: "/view/APP_DEMO/workbench/home",
      search: "?route=dashboard",
      servicePrefix: "/service",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "/service/openxiangda-api/v1/apps/APP_DEMO/runtime/routes/resolve",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: "/view/APP_DEMO/workbench/home",
          search: "?route=dashboard",
        }),
      }),
    );
    expect(route).toMatchObject({
      kind: "custom-page",
      mode: "custom-page",
      params: { pageKey: "home" },
    });
  });

  it("mounts a browser page runtime from backend bootstrap", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const mount = vi.fn((el: HTMLElement) => {
      el.textContent = "runtime";
    });
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          code: 200,
          success: true,
          data: {
            ...createBootstrap(),
            runtimeAssets: {
              entryUrl: "/assets/entry.js",
              jsUrls: ["/assets/vendor.js"],
              cssUrls: ["/assets/page.css"],
              cssIsolation: "namespace",
            },
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    ) as unknown as typeof fetch;
    const moduleLoader = vi.fn(async (url: string) => {
      if (url === "/assets/entry.js") return { mount };
      return {};
    });

    const result = await mountBrowserPageRuntime({
      appType: "APP_DEMO",
      pageKey: "home",
      container,
      servicePrefix: "/service",
      fetchImpl,
      moduleLoader,
    });

    expect(moduleLoader.mock.calls.map(call => call[0])).toEqual([
      "/assets/vendor.js",
      "/assets/entry.js",
    ]);
    expect(mount).toHaveBeenCalledWith(container, result.context);
    expect(container.textContent).toBe("runtime");

    await result.cleanup();
    container.remove();
  });

  it("does not mount a browser page runtime when bootstrap denies view permission", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          code: 200,
          success: true,
          data: {
            ...createBootstrap(),
            permissions: {
              canView: false,
              message: "no permission",
            },
            runtimeAssets: {
              entryUrl: "/assets/entry.js",
            },
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    ) as unknown as typeof fetch;
    const moduleLoader = vi.fn();

    await expect(
      mountBrowserPageRuntime({
        appType: "APP_DEMO",
        pageKey: "home",
        container,
        servicePrefix: "/service",
        fetchImpl,
        moduleLoader,
      }),
    ).rejects.toThrow("no permission");

    expect(moduleLoader).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe("");
    container.remove();
  });
});
