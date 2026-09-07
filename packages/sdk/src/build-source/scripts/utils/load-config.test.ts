import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  getApiBaseUrl,
  getGlobalOpenXiangdaEnvFile,
  loadWorkspaceEnv,
  resolveOpenXiangdaEndpointConfig,
} from "./load-config.mjs";

let tempDirs: string[] = [];

function makeTempDir(prefix: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe("OpenXiangda endpoint config", () => {
  it("treats /service base as the complete API base", () => {
    const config = resolveOpenXiangdaEndpointConfig(
      "https://platform.example.com/service",
    );

    expect(config).toEqual({
      platformUrl: "https://platform.example.com/service",
      servicePrefix: "",
    });
    expect(getApiBaseUrl(config)).toBe("https://platform.example.com/service");
  });

  it("maps root, platform, and view urls to the service API base", () => {
    const inputs = [
      "https://platform.example.com/",
      "https://platform.example.com/platform",
      "https://platform.example.com/platform/apps",
      "https://platform.example.com/view/app",
    ];

    for (const input of inputs) {
      const config = resolveOpenXiangdaEndpointConfig(input);
      expect(getApiBaseUrl(config)).toBe("https://platform.example.com/service");
    }
  });

  it("preserves custom gateway paths as complete API bases", () => {
    const config = resolveOpenXiangdaEndpointConfig(
      "https://gateway.example.com/private-api",
    );

    expect(getApiBaseUrl(config)).toBe(
      "https://gateway.example.com/private-api",
    );
  });
});

describe("OpenXiangda workspace env loading", () => {
  it("loads global env defaults and lets project env override them", () => {
    const home = makeTempDir("openxiangda-home-");
    const workspace = makeTempDir("openxiangda-workspace-");
    fs.mkdirSync(path.join(home, ".openxiangda"), { recursive: true });
    fs.writeFileSync(
      path.join(home, ".openxiangda", ".env"),
      [
        "APP_OSS_REGION=oss-cn-shanghai",
        "APP_OSS_BUCKET=global-bucket",
        "APP_OSS_ACCESS_KEY_ID=global-key",
        "APP_OSS_ACCESS_KEY_SECRET=global-secret",
        "APP_OSS_PATH_PREFIX=global-prefix",
        "",
      ].join("\n"),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(workspace, ".env"),
      ["APP_OSS_BUCKET=project-bucket", "APP_OSS_PATH_PREFIX=project-prefix", ""].join(
        "\n",
      ),
      "utf-8",
    );

    const env: Record<string, string> = {
      HOME: home,
      APP_OSS_ACCESS_KEY_ID: "shell-key",
    };

    const result = loadWorkspaceEnv({ workspaceRoot: workspace, env });

    expect(getGlobalOpenXiangdaEnvFile(env)).toBe(
      path.join(home, ".openxiangda", ".env"),
    );
    expect(result.loadedFiles).toEqual([
      path.join(home, ".openxiangda", ".env"),
      path.join(workspace, ".env"),
    ]);
    expect(env.APP_OSS_REGION).toBe("oss-cn-shanghai");
    expect(env.APP_OSS_BUCKET).toBe("project-bucket");
    expect(env.APP_OSS_ACCESS_KEY_ID).toBe("shell-key");
    expect(env.APP_OSS_ACCESS_KEY_SECRET).toBe("global-secret");
    expect(env.APP_OSS_PATH_PREFIX).toBe("project-prefix");
  });

  it("lets project env override values injected from global env by the CLI", () => {
    const home = makeTempDir("openxiangda-home-");
    const workspace = makeTempDir("openxiangda-workspace-");
    fs.mkdirSync(path.join(home, ".openxiangda"), { recursive: true });
    fs.writeFileSync(
      path.join(home, ".openxiangda", ".env"),
      "APP_OSS_BUCKET=global-bucket\n",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(workspace, ".env"),
      "APP_OSS_BUCKET=project-bucket\n",
      "utf-8",
    );

    const env: Record<string, string> = {
      HOME: home,
      APP_OSS_BUCKET: "global-bucket",
      OPENXIANGDA_GLOBAL_ENV_KEYS: "APP_OSS_BUCKET",
    };

    loadWorkspaceEnv({ workspaceRoot: workspace, env });

    expect(env.APP_OSS_BUCKET).toBe("project-bucket");
  });

  it("keeps mode-specific project env above normal project env", () => {
    const home = makeTempDir("openxiangda-home-");
    const workspace = makeTempDir("openxiangda-workspace-");
    fs.mkdirSync(path.join(home, ".openxiangda"), { recursive: true });
    fs.writeFileSync(
      path.join(home, ".openxiangda", ".env"),
      "APP_OSS_BUCKET=global-bucket\n",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(workspace, ".env"),
      "APP_OSS_BUCKET=project-bucket\n",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(workspace, ".env.production"),
      "APP_OSS_BUCKET=prod-bucket\n",
      "utf-8",
    );

    const env: Record<string, string> = { HOME: home };
    const result = loadWorkspaceEnv({
      workspaceRoot: workspace,
      mode: "production",
      env,
    });

    expect(result.loadedFiles).toEqual([
      path.join(home, ".openxiangda", ".env"),
      path.join(workspace, ".env"),
      path.join(workspace, ".env.production"),
    ]);
    expect(env.APP_OSS_BUCKET).toBe("prod-bucket");
  });
});
