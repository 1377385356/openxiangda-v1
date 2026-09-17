/**
 * register.mjs - 注册表单 bundle 和复杂代码页到平台
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { glob } from "glob";
import minimist from "minimist";
import {
  getApiBaseUrl,
  getFormBundleUrl,
  getFormRuntimeUrl,
  loadConfig,
  rootDir,
} from "./utils/load-config.mjs";
import { getRegisteredFormCssUrl } from "./utils/form-runtime-assets.mjs";
import { discoverPages } from "./utils/pages.mjs";
import { buildDirectPagePublishPayload } from "./utils/register-payload.mjs";
import {
  ensureSchemaFormUuid,
  getOpenApiAccessToken,
  getOpenApiForm,
  getOpenXiangdaPublishContextHeaders,
  isOpenXiangdaMode,
  markWorkspaceFormBundlePublished,
  mutateOpenXiangdaFormConfig,
} from "./utils/form-api.mjs";
import { assertFormReadyForBundle } from "./utils/schema-transform.mjs";

const args = minimist(process.argv.slice(2).filter((arg) => arg !== "--"));
const dryRun = Boolean(args["dry-run"]);
const targetForm = args.form || null;
const targetPage = args.page || null;
const targetPageList = parsePageList(args["page-list-json"]);
const stageOnlyPageRelease = process.env.OPENXIANGDA_PAGE_STAGE_ONLY === "1";
const ensureExistingFormMenu =
  Boolean(args["ensure-menu"]) ||
  ["1", "true", "yes"].includes(
    String(process.env.APP_FORM_AUTO_CREATE_MENU || "").toLowerCase(),
  );

if (args.help || args.h) {
  console.log(`
register - 注册应用工作区产物到平台

用法:
  tsx scripts/register.mjs [options]

选项:
  --dry-run        只打印注册计划，不实际调用 API
  --form <name>    只注册指定表单
  --page <name>    只注册指定代码页目录
  --page-list-json <JSON>  注册指定代码页目录数组（内部批量发布入口）
  --ensure-menu    已存在 formUuid 的表单也尝试补齐菜单
  --help, -h       显示帮助信息
`);
  process.exit(0);
}

if (targetPage && targetPageList.length > 0) {
  console.error("❌ --page 和 --page-list-json 不能同时使用");
  process.exit(1);
}

function parsePageList(value) {
  if (value === undefined || value === null || value === "") return [];
  let parsed;
  try {
    parsed = JSON.parse(String(value));
  } catch (error) {
    throw new Error(`PAGE_REGISTER_SCOPE_INVALID: page-list-json 不是合法 JSON: ${error.message}`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("PAGE_REGISTER_SCOPE_INVALID: page-list-json 必须是非空数组");
  }
  const normalized = parsed.map((item) => String(item || "").trim()).filter(Boolean);
  if (normalized.length !== parsed.length || new Set(normalized).size !== normalized.length) {
    throw new Error("PAGE_REGISTER_SCOPE_INVALID: page-list-json 包含空值或重复页面");
  }
  return normalized;
}

const config = await loadConfig();
const apiBase = getApiBaseUrl(config);
let accessToken = null;

if (!dryRun && !config.buildIdExplicit) {
  console.error(
    "❌ 单独执行 register 时必须设置 APP_BUILD_ID；推荐使用 pnpm publish:all 统一发布。",
  );
  process.exit(1);
}

async function getAccessToken() {
  if (!accessToken) {
    accessToken = await getOpenApiAccessToken(config);
  }
  return accessToken;
}

async function registerForms() {
  const formDirs = await glob(targetForm ? targetForm : "*", {
    cwd: path.resolve(rootDir, "src/forms"),
    onlyDirectories: true,
  });

  let succeeded = 0;
  let failed = 0;
  let created = 0;

  for (const formName of formDirs) {
    const schemaPath = path.resolve(rootDir, `src/forms/${formName}/schema.ts`);
    if (!fs.existsSync(schemaPath)) {
      console.log(`  ⊘ 表单 ${formName}: 无 schema.ts，跳过注册`);
      continue;
    }

    let formUuid;
    let appType;
    let releaseExpectation = null;
    try {
      const ensured = await ensureSchemaFormUuid({
        config,
        schemaPath,
        formName,
        accessToken: dryRun ? null : await getAccessToken(),
        dryRun,
        ensureMenu: ensureExistingFormMenu,
      });
      formUuid = ensured.formUuid;
      appType = ensured.appType || config.appType;
      releaseExpectation = ensured.releaseExpectation;
      if (ensured.created || ensured.dryRunCreated) created += 1;
    } catch (error) {
      console.error(`  ✗ 表单 ${formName}: ${error.message}`);
      failed += 1;
      continue;
    }

    if (!dryRun) {
      try {
        const formMeta = await getOpenApiForm(config, await getAccessToken(), {
          appType,
          formUuid,
        });
        assertFormReadyForBundle(formMeta, formName);
      } catch (error) {
        console.error(`  ✗ 表单 ${formName}: ${error.message}`);
        failed += 1;
        continue;
      }
    }

    const runtime = readFormRuntimeAssets(config);
    const payload = {
      appType,
      formUuid,
      userId: config.userId,
      bundleUrl: getFormBundleUrl(config, formName, "index.js"),
      cssUrl: getRegisteredFormCssUrl(config, formName, {
        runtime,
        formCssPath: path.resolve(rootDir, `dist/forms/${formName}/style.css`),
      }),
      cssIsolation: config.defaults.cssIsolation,
      version: config.version,
    };
    if (runtime) {
      payload.runtimeMode = "shared";
      payload.runtime = runtime;
    }

    if (dryRun) {
      console.log(`  [DRY] 表单 ${formName} (${formUuid})`);
      console.log(`        → ${payload.bundleUrl}`);
      console.log(`        → ${payload.cssUrl}`);
      if (payload.runtime) {
        console.log(`        runtime → ${payload.runtime.entryUrl}`);
        if (payload.runtime.cssUrl) {
          console.log(`        runtime → ${payload.runtime.cssUrl}`);
        }
      }
      succeeded += 1;
      continue;
    }

    let body;
    if (isOpenXiangdaMode(config)) {
      try {
        const mutation = await mutateOpenXiangdaFormConfig(
          config,
          await getAccessToken(),
          {
            appType,
            formUuid,
            endpoint: "publish",
            operation: "bundle",
            expected: releaseExpectation,
            payload: {
              bundleUrl: payload.bundleUrl,
              cssUrl: payload.cssUrl,
              cssIsolation: payload.cssIsolation,
              version: payload.version,
              runtimeMode: payload.runtimeMode,
              runtime: payload.runtime,
            },
          },
        );
        body = mutation.response;
        markWorkspaceFormBundlePublished(config, formName, formUuid, {
          revision: mutation.data?.revision,
          etag: mutation.data?.etag,
          activeFormReleaseHead: mutation.data?.activeFormReleaseHead,
          version: payload.version,
        });
      } catch (error) {
        console.error(`  ✗ 表单 ${formName}: ${error.message}`);
        failed += 1;
        continue;
      }
    } else {
      const response = await fetch(getFormPublishUrl(appType, formUuid), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-acs-dingtalk-access-token": await getAccessToken(),
        },
        body: JSON.stringify(payload),
      });
      body = await response.json().catch(() => null);
      if (!response.ok || body?.code !== 200) {
        console.error(
          `  ✗ 表单 ${formName}: HTTP ${response.status} ${body?.message || response.statusText}`,
        );
        failed += 1;
        continue;
      }
    }
    console.log(`  ✓ 表单 ${formName} (${formUuid})`);
    succeeded += 1;
  }

  return { succeeded, failed, created };
}

function getFormPublishUrl(appType, formUuid) {
  if (isOpenXiangdaMode(config)) {
    return `${apiBase}/openxiangda-api/v1/apps/${encodeURIComponent(appType)}/forms/${encodeURIComponent(formUuid)}/publish`;
  }
  return `${apiBase}/dingtalk-api/v1.0/forms/customPage/publish`;
}

function readFormRuntimeAssets(config) {
  const manifestPath = path.resolve(rootDir, "dist/form-runtime/manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    if (
      manifest?.protocol !== "sy-form-runtime" ||
      manifest?.majorVersion !== 2 ||
      !manifest?.version ||
      !manifest?.files?.entry
    ) {
      return null;
    }
    return {
      protocol: "sy-form-runtime",
      majorVersion: 2,
      version: manifest.version,
      entryUrl: getFormRuntimeUrl(config, manifest.files.entry),
      cssUrl: manifest.files.css
        ? getFormRuntimeUrl(config, manifest.files.css)
        : null,
    };
  } catch {
    return null;
  }
}

async function registerPages() {
  const pages = await discoverSelectedPages();
  if (pages.length === 0) {
    return { succeeded: 0, failed: 0 };
  }

  const payload = buildDirectPagePublishPayload(config, pages);

  if (dryRun) {
    console.log("  [DRY] 代码页发布 payload:");
    console.log(JSON.stringify(payload, null, 2));
    writePagePublishResult(payload, null, true);
    return { succeeded: pages.length, failed: 0 };
  }

  if (stageOnlyPageRelease) {
    if (!isOpenXiangdaMode(config)) {
      throw new Error(
        "PAGE_RELEASE_STAGE_CONTEXT_REQUIRED: stage-only 页面发布只支持 OpenXiangda 模式",
      );
    }
    if (!targetPage && targetPageList.length === 0) {
      throw new Error(
        "PAGE_RELEASE_STAGE_SCOPE_REQUIRED: stage-only 页面发布必须提供精确页面范围",
      );
    }
    const data = await publishStagedPagesWithCurrentCli(payload);
    data.items?.forEach((item) => {
      console.log(`  ✓ 代码页 ${item.code} (${item.pageId})`);
    });
    writePagePublishResult(payload, { data }, false);
    return { succeeded: pages.length, failed: 0 };
  }

  const response = await fetch(getPagePublishUrl(payload.appType), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(isOpenXiangdaMode(config)
        ? {
            Authorization: `Bearer ${await getAccessToken()}`,
            ...getOpenXiangdaPublishContextHeaders(),
          }
        : { "x-acs-dingtalk-access-token": await getAccessToken() }),
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.code !== 200) {
    console.error(
      `  ✗ 代码页发布失败: HTTP ${response.status} ${body?.message || response.statusText}`,
    );
    return { succeeded: 0, failed: pages.length };
  }

  body.data?.items?.forEach((item) => {
    console.log(`  ✓ 代码页 ${item.code} (${item.pageId})`);
  });
  writePagePublishResult(payload, body, false);
  return { succeeded: pages.length, failed: 0 };
}

async function discoverSelectedPages() {
  if (targetPage) return discoverPages(targetPage);
  const pages = await discoverPages("");
  if (targetPageList.length === 0) return pages;
  const byName = new Map();
  for (const page of pages) {
    byName.set(String(page.dirName || ""), page);
    byName.set(String(page.config?.code || ""), page);
  }
  const missing = targetPageList.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    throw new Error(`PAGE_REGISTER_SCOPE_INVALID: 找不到代码页 ${missing.join(",")}`);
  }
  return targetPageList.map((name) => byName.get(name));
}

async function publishStagedPagesWithCurrentCli(payload) {
  const cli = String(process.env.OPENXIANGDA_CLI || "").trim();
  const profile = String(config.openXiangdaProfile || process.env.OPENXIANGDA_PROFILE || "").trim();
  const changeId = String(process.env.OPENXIANGDA_CHANGE_ID || "").trim();
  if (!cli || !profile || !changeId) {
    throw new Error(
      "PAGE_RELEASE_STAGE_CONTEXT_REQUIRED: 缺少 OPENXIANGDA_CLI、OPENXIANGDA_PROFILE 或 OPENXIANGDA_CHANGE_ID",
    );
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openxiangda-page-stage-"));
  const definitionsFile = path.join(tempDir, "pages.json");
  try {
    fs.writeFileSync(
      definitionsFile,
      `${JSON.stringify({ pages: payload.pages }, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    const cliArgs = [
      "page",
      "publish",
      "--pages-json",
      definitionsFile,
      "--version",
      payload.version,
      "--build-id",
      payload.buildId,
      "--profile",
      profile,
      "--change",
      changeId,
      "--json",
    ];
    if (config.openXiangdaTarget) {
      cliArgs.push("--environment", config.openXiangdaTarget);
    }
    const result = await runCurrentOpenXiangdaCli(cli, cliArgs);
    const selectedPageCodes = Array.isArray(result?.stagedResource?.metadata?.selectedPageCodes)
      ? [...result.stagedResource.metadata.selectedPageCodes].sort()
      : [];
    const expectedPageCodes = payload.pages.map((page) => page.code).sort();
    if (
      result?.stagedResource?.kind !== "PageRelease" ||
      selectedPageCodes.length !== expectedPageCodes.length ||
      !expectedPageCodes.every((code, index) => code === selectedPageCodes[index])
    ) {
      throw new Error(
        `PAGE_RELEASE_STAGE_SCOPE_MISMATCH: staged PageRelease 范围不匹配；expected=${expectedPageCodes.join(",")} actual=${selectedPageCodes.join(",") || "-"}`,
      );
    }
    return result;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function runCurrentOpenXiangdaCli(cli, args) {
  return new Promise((resolve, reject) => {
    const command = cli.endsWith(".js") || cli.endsWith(".mjs") ? process.execPath : cli;
    const commandArgs = command === process.execPath ? [cli, ...args] : args;
    const child = spawn(command, commandArgs, {
      cwd: rootDir,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (signal || code !== 0) {
        reject(
          new Error(
            `PAGE_RELEASE_STAGE_FAILED: 当前 OpenXiangda CLI 执行失败 (${signal || code}) ${stderr.trim() || stdout.trim()}`,
          ),
        );
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(
          new Error(
            `PAGE_RELEASE_STAGE_RESULT_INVALID: CLI JSON 输出不可解析: ${error.message}`,
          ),
        );
      }
    });
  });
}

function getPagePublishUrl(appType) {
  if (isOpenXiangdaMode(config)) {
    return `${apiBase}/openxiangda-api/v1/apps/${encodeURIComponent(appType)}/pages/publish`;
  }
  return `${apiBase}/dingtalk-api/v1.0/custom-pages/publish`;
}

function writePagePublishResult(payload, responseBody, isDryRun) {
  const publishedItems = new Map(
    (responseBody?.data?.items || []).map((item) => [item.code, item]),
  );
  const result = {
    appId: config.appId || config.appType,
    appType: payload.appType,
    workspacePath: rootDir,
    version: payload.version,
    buildId: payload.buildId,
    pages: payload.pages.map((page) => {
      const published = publishedItems.get(page.code) || {};
      return {
        code: page.code,
        name: page.name,
        pageId: published.pageId || (isDryRun ? "<dry-run-pageId>" : ""),
        routeKey:
          published.routeKey ||
          page.route?.pathKey ||
          page.route?.path ||
          page.code,
        legacyFormUuid: published.legacyFormUuid || published.formUuid || null,
        entryUrl: page.runtime?.entryUrl || "",
        cssUrls: page.runtime?.cssUrls || [],
        menuId:
          published.menuId === undefined
            ? isDryRun
              ? "<dry-run-menuId>"
              : null
            : published.menuId,
      };
    }),
    publishedAt: new Date().toISOString(),
  };
  const outputPath = path.resolve(rootDir, "dist", "publish-result.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf-8");
}

console.log(`🔗 注册应用工作区产物 (${dryRun ? "DRY RUN" : "LIVE"})`);
console.log(`   API: ${apiBase}`);
console.log("");

const formResult = targetPage
  ? { succeeded: 0, failed: 0, created: 0 }
  : await registerForms();
const pageResult = targetForm
  ? { succeeded: 0, failed: 0 }
  : await registerPages();
const succeeded = formResult.succeeded + pageResult.succeeded;
const failed = formResult.failed + pageResult.failed;

console.log("");
console.log(
  `完成: ${succeeded} 成功, ${formResult.created || 0} 自动创建表单, ${failed} 失败`,
);

if (failed > 0) {
  process.exit(1);
}
