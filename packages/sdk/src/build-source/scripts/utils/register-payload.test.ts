import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { getFormBundleUrl, getPageAssetUrl } from "./load-config.mjs";
import { buildDirectPagePublishPayload } from "./register-payload.mjs";

const config = {
  appType: "APP_TEST",
  userId: "user-1",
  version: "1.2.3",
  buildId: "BUILD_001",
  oss: {
    bucket: "bucket",
    region: "oss-cn-hangzhou",
    pathPrefix: "lowcode/app-workspace/dev",
  },
  defaults: {
    frameworkVersion: "19.0.0",
    protocolVersion: "1.0",
    cssIsolation: "none",
    pageMenuParentId: "MENU_PARENT",
    pageMenuIcon: "dashboard",
  },
};

describe("register payload helpers", () => {
  it("discovers publishable code pages", async () => {
    const workspaceRoot = await mkdtemp(
      join(process.cwd(), ".tmp-openxiangda-pages-test-"),
    );
    const previousWorkspaceRoot = process.env.LOWCODE_WORKSPACE_ROOT;

    try {
      const pageDir = join(workspaceRoot, "src/pages/customer-dashboard");
      await mkdir(pageDir, { recursive: true });
      await writeFile(join(pageDir, "index.tsx"), "export {};\n", "utf8");
      await writeFile(
        join(pageDir, "App.tsx"),
        "export default function App() { return null; }\n",
        "utf8",
      );
      await writeFile(
        join(pageDir, "page.config.ts"),
        `export default {
  code: "customer-dashboard",
  name: "客户经营看板",
  route: { pathKey: "customer-dashboard" },
};
`,
        "utf8",
      );

      process.env.LOWCODE_WORKSPACE_ROOT = workspaceRoot;
      vi.resetModules();
      const { discoverPages } = await import("./pages.mjs");
      const pages = await discoverPages("customer-dashboard");

      expect(pages).toHaveLength(1);
      expect(pages[0].config.code).toBe("customer-dashboard");
    } finally {
      if (previousWorkspaceRoot === undefined) {
        delete process.env.LOWCODE_WORKSPACE_ROOT;
      } else {
        process.env.LOWCODE_WORKSPACE_ROOT = previousWorkspaceRoot;
      }
      vi.resetModules();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("loads page configs that import workspace @ alias modules", async () => {
    const workspaceRoot = await mkdtemp(
      join(process.cwd(), ".tmp-openxiangda-pages-alias-test-"),
    );
    const previousWorkspaceRoot = process.env.LOWCODE_WORKSPACE_ROOT;

    try {
      const typesDir = join(workspaceRoot, "src/types");
      const pageDir = join(workspaceRoot, "src/pages/runtime-workbench");
      await mkdir(typesDir, { recursive: true });
      await mkdir(pageDir, { recursive: true });
      await writeFile(
        join(typesDir, "app-workspace.types.ts"),
        `export function definePageConfig(config) { return config; }\n`,
        "utf8",
      );
      await writeFile(join(pageDir, "index.tsx"), "export {};\n", "utf8");
      await writeFile(
        join(pageDir, "App.tsx"),
        "export default function App() { return null; }\n",
        "utf8",
      );
      await writeFile(
        join(pageDir, "page.config.ts"),
        `import { definePageConfig } from "@/types/app-workspace.types";

export default definePageConfig({
  code: "runtime-workbench",
  name: "运行时工作台",
  route: { pathKey: "runtime_workbench" },
});
`,
        "utf8",
      );

      process.env.LOWCODE_WORKSPACE_ROOT = workspaceRoot;
      vi.resetModules();
      const { discoverPages } = await import("./pages.mjs");
      const pages = await discoverPages("runtime-workbench");

      expect(pages).toHaveLength(1);
      expect(pages[0].config.code).toBe("runtime-workbench");
      expect(pages[0].config.route.pathKey).toBe("runtime_workbench");
    } finally {
      if (previousWorkspaceRoot === undefined) {
        delete process.env.LOWCODE_WORKSPACE_ROOT;
      } else {
        process.env.LOWCODE_WORKSPACE_ROOT = previousWorkspaceRoot;
      }
      vi.resetModules();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("builds stable form and page asset URLs from one build id", () => {
    expect(getFormBundleUrl(config, "customer-info", "index.js")).toBe(
      "https://bucket.oss-cn-hangzhou.aliyuncs.com/lowcode/app-workspace/dev/1.2.3/BUILD_001/forms/customer-info/index.js",
    );
    expect(getPageAssetUrl(config, "customer-dashboard", "style.css")).toBe(
      "https://bucket.oss-cn-hangzhou.aliyuncs.com/lowcode/app-workspace/dev/1.2.3/BUILD_001/pages/customer-dashboard/style.css",
    );
  });

  it("builds direct custom page payloads without manifest fields", () => {
    const payload = buildDirectPagePublishPayload(config, [
      {
        config: {
          code: "customer-dashboard",
          name: "客户经营看板",
          entry: {
            mode: "app-shell",
            hidePlatformNav: true,
            defaultRoute: "home",
          },
          route: { pathKey: "customer-dashboard" },
          props: { title: "客户经营看板" },
          dataSources: [],
        },
      },
    ]);

    expect(payload.pages[0].runtime.entryUrl).toBe(
      "https://bucket.oss-cn-hangzhou.aliyuncs.com/lowcode/app-workspace/dev/1.2.3/BUILD_001/pages/customer-dashboard/index.js",
    );
    expect(payload.pages[0].entry).toEqual({
      mode: "app-shell",
      hidePlatformNav: true,
      defaultRoute: "home",
    });
    expect(payload.pages[0].runtime.cssIsolation).toBe("none");
    expect(JSON.stringify(payload)).not.toMatch(/manifest/i);
  });

  it("marks menu disabled pages so the backend skips menu upsert", () => {
    const payload = buildDirectPagePublishPayload(config, [
      {
        config: {
          code: "internal-dashboard",
          name: "内部看板",
          route: { pathKey: "internal-dashboard" },
          menu: { enabled: false },
        },
      },
    ]);

    expect(payload.pages[0].menu).toEqual({ enabled: false });
  });
});
