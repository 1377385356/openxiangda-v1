/**
 * register.mjs - 注册表单 bundle 和复杂代码页到平台
 */

import fs from "node:fs";
import path from "node:path";
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
  --ensure-menu    已存在 formUuid 的表单也尝试补齐菜单
  --help, -h       显示帮助信息
`);
  process.exit(0);
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
  const pages = await discoverPages(targetPage || "");
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
