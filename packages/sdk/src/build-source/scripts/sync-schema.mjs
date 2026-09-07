/**
 * sync-schema.mjs - 将 form schema 同步到后端 API
 *
 * 扫描 src/forms/{form}/schema.ts 中的 defineFormSchema，
 * 转换为后端 updateFormSchema API 格式并发送请求。
 *
 * 用法:
 *   tsx scripts/sync-schema.mjs [options]
 *
 * 选项:
 *   --dry-run        只打印 JSON，不发送请求
 *   --form <name>    只同步指定表单（目录名）
 *   --help           显示帮助信息
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { loadConfig, getApiBaseUrl, rootDir } from "./utils/load-config.mjs";
import {
  ensureSchemaFormUuid,
  getOpenApiAccessToken,
  getOpenApiForm,
  isOpenXiangdaMode,
  markWorkspaceFormSchemaSynced,
  mutateOpenXiangdaFormConfig,
} from "./utils/form-api.mjs";
import {
  assertSchemaSyncResult,
  transformToApiFormat,
} from "./utils/schema-transform.mjs";

const formsDir = path.join(rootDir, "src/forms");

// ---------- CLI 参数解析 ----------

function parseArgs(argv) {
  const result = {
    dryRun: false,
    form: "",
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      result.dryRun = true;
      continue;
    }
    if (arg === "--form" && argv[i + 1]) {
      result.form = argv[i + 1];
      i++;
      continue;
    }
  }

  return result;
}

function printHelp() {
  console.log(`
sync-schema - 将表单 Schema 同步到后端 API

用法:
  tsx scripts/sync-schema.mjs [options]

选项:
  --dry-run        只打印转换后的 JSON，不发送 API 请求
  --form <name>    只同步指定表单（src/forms/ 下的目录名）
  --help, -h       显示帮助信息

示例:
  tsx scripts/sync-schema.mjs --dry-run
  tsx scripts/sync-schema.mjs --form customer-info
  tsx scripts/sync-schema.mjs --form customer-info --dry-run
`);
}

function resolveWorkspaceAlias(importPath) {
  if (!importPath.startsWith("@/")) return null;
  const basePath = path.join(rootDir, "src", importPath.slice(2));
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    `${basePath}.mjs`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
    path.join(basePath, "index.js"),
    path.join(basePath, "index.jsx"),
    path.join(basePath, "index.mjs"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || basePath;
}

function workspaceAliasPlugin() {
  return {
    name: "openxiangda-workspace-alias",
    setup(build) {
      build.onResolve({ filter: /^@\// }, (args) => ({
        path: resolveWorkspaceAlias(args.path),
      }));
    },
  };
}

// ---------- 表单发现 ----------

function discoverForms(filterName) {
  if (!fs.existsSync(formsDir)) {
    console.error(`错误: 找不到表单目录 ${formsDir}`);
    process.exit(1);
  }

  const entries = fs.readdirSync(formsDir, { withFileTypes: true });
  const formDirs = entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => {
      if (filterName) return entry.name === filterName;
      return true;
    })
    .filter((entry) => {
      const schemaPath = path.join(formsDir, entry.name, "schema.ts");
      return fs.existsSync(schemaPath);
    });

  return formDirs.map((entry) => ({
    name: entry.name,
    schemaPath: path.join(formsDir, entry.name, "schema.ts"),
  }));
}

// ---------- Schema 加载 ----------

async function loadSchema(schemaPath) {
  const tmpFile = schemaPath.replace(/\.ts$/, ".tmp.mjs");
  try {
    // 使用 esbuild 将 .ts 打包为单文件 .mjs（解析所有依赖），再动态 import
    const result = await build({
      entryPoints: [schemaPath],
      bundle: true,
      format: "esm",
      platform: "node",
      target: "node18",
      plugins: [workspaceAliasPlugin()],
      write: false,
      outfile: "out.mjs",
    });
    const code = result.outputFiles[0].text;
    fs.writeFileSync(tmpFile, code, "utf-8");
    const module = await import(pathToFileURL(tmpFile).href);
    return module.default || module;
  } catch (error) {
    console.error(`错误: 无法加载 schema 文件 ${schemaPath}`);
    console.error(`  ${error.message}`);
    return null;
  } finally {
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  }
}

// ---------- API 发送 ----------

async function sendToApi(apiPayload, config, accessToken, expected) {
  const apiBase = getApiBaseUrl(config);
  const targetAppType = apiPayload.appType || config.appType;
  const url = isOpenXiangdaMode(config)
    ? `${apiBase}/openxiangda-api/v1/apps/${encodeURIComponent(targetAppType)}/forms/${encodeURIComponent(apiPayload.formUuid)}/schema`
    : `${apiBase}/dingtalk-api/v1.0/forms/updateFormSchema`;

  console.log(`  发送请求到: ${url}`);

  if (isOpenXiangdaMode(config)) {
    const mutation = await mutateOpenXiangdaFormConfig(config, accessToken, {
      appType: targetAppType,
      formUuid: apiPayload.formUuid,
      endpoint: "schema",
      operation: "schema",
      expected,
      payload: {
        schema: apiPayload.schema,
        packages: apiPayload.packages,
        formType: apiPayload.formType,
      },
    });
    const formMeta = await getOpenApiForm(config, accessToken, {
      appType: targetAppType,
      formUuid: apiPayload.formUuid,
    });
    if (Number(formMeta?.revision) !== Number(mutation.data?.revision)) {
      const error = new Error(
        `FORM_REVISION_CONFLICT: schema 激活返回 r${mutation.data?.revision}，校验读取为 r${formMeta?.revision}；未继续发布`,
      );
      error.code = "FORM_REVISION_CONFLICT";
      throw error;
    }
    const verified = {
      ...mutation.response,
      data: {
        ...mutation.data,
        tableName: formMeta?.tableName,
        formFields: formMeta?.formFields,
      },
    };
    assertSchemaSyncResult(verified, apiPayload.fieldCount);
    return verified;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-acs-dingtalk-access-token": accessToken,
    },
    body: JSON.stringify(
      {
        userId: config.userId,
        appType: targetAppType,
        formUuid: apiPayload.formUuid,
        schema: apiPayload.schema,
        packages: apiPayload.packages,
        formType: apiPayload.formType,
      },
    ),
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
  }
  assertSchemaSyncResult(body, apiPayload.fieldCount);

  return body;
}

// ---------- 主流程 ----------

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  console.log("🔍 扫描表单 Schema...\n");

  const forms = discoverForms(args.form);

  if (forms.length === 0) {
    if (args.form) {
      console.error(`错误: 找不到表单 "${args.form}"`);
      console.error(`  请确认 src/forms/${args.form}/schema.ts 存在`);
    } else {
      console.error("错误: 未发现任何表单 schema 文件");
    }
    process.exit(1);
  }

  console.log(`发现 ${forms.length} 个表单:\n`);
  forms.forEach((f) => console.log(`  - ${f.name}`));
  console.log("");

  const config = await loadConfig();
  const results = [];
  const createdForms = new Set();
  let accessToken = null;

  for (const form of forms) {
    console.log(`📋 处理: ${form.name}`);

    const schema = await loadSchema(form.schemaPath);
    if (!schema) {
      results.push({ name: form.name, success: false, error: "加载失败" });
      continue;
    }

    let releaseExpectation = null;
    try {
      if (!args.dryRun && !accessToken) {
        accessToken = await getOpenApiAccessToken(config);
      }

      const ensured = await ensureSchemaFormUuid({
        config,
        schemaPath: form.schemaPath,
        formName: form.name,
        accessToken,
        dryRun: args.dryRun,
      });
      schema.formMeta.formUuid = ensured.formUuid;
      schema.formMeta.appType = ensured.appType || schema.formMeta.appType;
      releaseExpectation = ensured.releaseExpectation;
      if (ensured.created || ensured.dryRunCreated) {
        createdForms.add(form.name);
      }
    } catch (error) {
      console.error(`  ❌ 自动创建表单失败: ${error.message}`);
      results.push({
        name: form.name,
        success: false,
        error: error.message,
      });
      console.log("");
      continue;
    }

    let apiPayload;
    try {
      apiPayload = transformToApiFormat(schema, form.name);
    } catch (error) {
      console.error(`  ❌ Schema 校验失败: ${error.message}`);
      results.push({ name: form.name, success: false, error: error.message });
      console.log("");
      continue;
    }

    if (args.dryRun) {
      console.log(`  [dry-run] 转换结果:`);
      console.log(JSON.stringify(apiPayload, null, 2));
      results.push({ name: form.name, success: true, dryRun: true });
    } else {
      try {
        const response = await sendToApi(
          apiPayload,
          config,
          accessToken,
          releaseExpectation,
        );
        markWorkspaceFormSchemaSynced(config, form.name, apiPayload.formUuid, {
          title: schema.formMeta?.title || form.name,
          formType: apiPayload.formType || schema.formMeta?.formType || "receipt",
          fieldCount: apiPayload.fieldCount,
          tableName: response?.data?.tableName,
          revision: response?.data?.revision,
          etag: response?.data?.etag,
          activeFormReleaseHead: response?.data?.activeFormReleaseHead,
        });
        console.log(`  ✅ 同步成功，tableName=${response.data.tableName}`);
        results.push({ name: form.name, success: true, response });
      } catch (error) {
        console.error(`  ❌ 同步失败: ${error.message}`);
        results.push({ name: form.name, success: false, error: error.message });
      }
    }

    console.log("");
  }

  // 汇总
  const succeeded = results.filter((r) => r.success).length;
  const created = createdForms.size;
  const failed = results.filter((r) => !r.success).length;

  console.log("---");
  console.log(
    `完成: ${succeeded} 成功, ${created} 自动创建, ${failed} 失败${args.dryRun ? " (dry-run 模式)" : ""}`,
  );

  if (failed > 0) {
    process.exit(1);
  }
}

await main();
