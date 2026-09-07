/**
 * publish-all.mjs - 统一执行 schema 同步、构建、OSS 发布和平台注册。
 *
 * 关键点：在同一个进程里生成一次 APP_BUILD_ID，并传给所有子脚本，
 * 避免上传路径和注册 URL 因跨进程默认 buildId 不一致而错位。
 */

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import minimist from "minimist";
import { loadConfig, rootDir } from "./utils/load-config.mjs";
import {
  discoverWorkspaceModules,
  commitIncrementalPublish,
  normalizeOnly,
  planIncrementalPublish,
  printPlan,
  resolveGitChangedWorkspaceTargets,
} from "./utils/incremental.mjs";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const tsxCli = require.resolve("tsx/cli");

/**
 * 生成时间戳格式的构建ID
 * @returns {string} 格式如 20260516120000
 */
function createBuildId() {
  return new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
}

const args = minimist(process.argv.slice(2).filter((arg) => arg !== "--"));
const dryRun = Boolean(args["dry-run"]);
const targetForm = args.form || "";
const targetPage = args.page || "";
const force = Boolean(args.force);
const changedOnly = Boolean(args.changed || args["changed-only"]);
const changedSince = args.since || "HEAD";

if (args.help || args.h) {
  console.log(`
publish-all - 同步、构建、上传并注册应用工作区产物

用法:
  tsx scripts/publish-all.mjs [options]

选项:
  --dry-run        schema、OSS、注册均只打印计划，不调用写接口
  --form <name>    只发布指定表单
  --page <name>    只发布指定代码页
  --only <list>    只发布指定模块，如 forms/customer,pages/dashboard
  --changed        只发布 git 变更触达的 src/forms/* 和 src/pages/*
  --since <ref>    配合 --changed 使用，默认 HEAD
  --force          忽略增量缓存，强制发布
  --legacy-form-bundle  React SPA 下仍发布旧表单 bundle 到 OSS
  --help, -h       显示帮助信息
`);
  process.exit(0);
}

if (targetForm && targetPage) {
  console.error("❌ --form 和 --page 不能同时使用，请分两次发布");
  process.exit(1);
}
if (changedOnly && (targetForm || targetPage || args.only)) {
  console.error("❌ --changed 不能与 --form、--page 或 --only 同时使用");
  process.exit(1);
}

const changedTargets = changedOnly
  ? resolveGitChangedWorkspaceTargets({ since: changedSince })
  : null;
if (changedTargets && !changedTargets.available) {
  console.error(`❌ 无法读取 git 变更: ${changedTargets.error}`);
  process.exit(1);
}
if (changedTargets?.globalFiles?.length) {
  console.warn(
    `[publish] --changed 检测到 shared/config 变更: ${changedTargets.globalFiles.join(", ")}`,
  );
  console.warn(
    "[publish] 将只发布直接变更的 forms/pages；若 shared 改动影响其他模块，请显式使用 --only 或不传 --changed。",
  );
}
if (changedTargets?.resourceFiles?.length) {
  console.warn(
    `[publish] --changed 检测到资源变更: ${changedTargets.resourceFiles.join(", ")}`,
  );
  console.warn("[publish] publish-all 只处理 forms/pages；资源请通过 openxiangda resource plan|publish 处理。");
}

const only = changedOnly
  ? changedTargets.only
  : targetForm
    ? [`forms/${targetForm}`]
    : targetPage
      ? [`pages/${targetPage}`]
      : normalizeOnly(args.only);

if (changedOnly && only.length === 0) {
  console.log("✅ 没有检测到 src/forms 或 src/pages 的 git 变更，跳过发布");
  process.exit(0);
}

const buildId = process.env.APP_BUILD_ID || createBuildId();
const childEnv = {
  ...process.env,
  APP_BUILD_ID: buildId,
};

/**
 * 执行子脚本
 * @param {string} script - 脚本路径
 * @param {string[]} [scriptArgs] - 脚本参数
 * @returns {Promise<void>}
 */
function run(script, scriptArgs = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, path.join(scriptDir, script), ...scriptArgs], {
      cwd: rootDir,
      env: childEnv,
      shell: false,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${script} ${scriptArgs.join(" ")} exited with code ${code}`));
    });
  });
}

const maybeDryRun = dryRun ? ["--dry-run"] : [];
const maybeForce = force ? ["--force"] : [];
const config = await loadConfig();
const publishLegacyFormBundle =
  config.runtimeMode !== "react-spa" ||
  Boolean(args["legacy-form-bundle"]) ||
  Boolean(config.forms?.publishLegacyBundle);

const allModules = discoverWorkspaceModules();
const plan = planIncrementalPublish(allModules, { force, only });
printPlan(plan, "publish-all");
if (plan.changed.length === 0 && !force) {
  console.log("✅ 没有检测到变更，跳过发布");
  process.exit(0);
}

console.log(`🚀 发布应用工作区 (${dryRun ? "DRY RUN" : "LIVE"})`);
console.log(`   APP_BUILD_ID=${buildId}`);
console.log("");

const publishedModules = [];

for (const moduleItem of plan.changed) {
  if (moduleItem.kind === "forms") {
    await run("sync-schema.mjs", ["--form", moduleItem.name, ...maybeDryRun]);
    if (publishLegacyFormBundle) {
      await run("build-forms.mjs", ["--form", moduleItem.name, ...maybeForce]);
      await run("publish-oss.mjs", ["--form", moduleItem.name, ...maybeDryRun]);
      await run("register.mjs", ["--form", moduleItem.name, ...maybeDryRun]);
    } else {
      console.log(
        `[publish] React SPA 表单 ${moduleItem.name}: 已同步 schema，跳过旧表单 bundle/OSS/register。`,
      );
      console.log(
        "[publish] 如需兼容旧表单页面 bundle，请传 --legacy-form-bundle 或配置 forms.publishLegacyBundle=true。",
      );
    }
    publishedModules.push(moduleItem);
  } else if (moduleItem.kind === "pages") {
    await run("build-pages.mjs", ["--page", moduleItem.name, ...maybeForce]);
    await run("publish-oss.mjs", ["--page", moduleItem.name, ...maybeDryRun]);
    await run("register.mjs", ["--page", moduleItem.name, ...maybeDryRun]);
    publishedModules.push(moduleItem);
  }
}

if (!dryRun) {
  commitIncrementalPublish(plan, publishedModules);
}

console.log("");
console.log(`✅ 发布流程完成，buildId=${buildId}`);
