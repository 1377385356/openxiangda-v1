/**
 * publish-oss.mjs - 上传应用工作区构建产物到阿里云 OSS
 *
 * 功能特性：
 * - 完整 MIME 类型识别（JS/CSS/图片/字体等）
 * - 基于文件名 hash 的差异化 Cache-Control 策略
 * - 并行上传（p-limit 控制并发数）
 * - 失败自动重试
 * - 上传进度与统计报告
 */

import { glob } from "glob";
import path from "node:path";
import minimist from "minimist";
import pLimit from "p-limit";
import { loadConfig, rootDir } from "./utils/load-config.mjs";
import { getContentType, getCacheControl } from "./utils/mime-types.mjs";
import { createOSSClient, uploadWithRetry, ensureBucketCors } from "./utils/oss-client.mjs";
import { createProgressTracker } from "./utils/progress.mjs";
import { discoverPages } from "./utils/pages.mjs";
import { buildUploadPatterns } from "./utils/publish-oss-patterns.mjs";

const args = minimist(process.argv.slice(2).filter((arg) => arg !== "--"));
const dryRun = Boolean(args["dry-run"]);
const targetForm = args.form || null;
const targetPage = args.page || null;

if (args.help || args.h) {
  console.log(`
publish-oss - 发布应用工作区产物到阿里云 OSS

用法:
  tsx scripts/publish-oss.mjs [options]

选项:
  --dry-run        只打印上传计划，不实际上传
  --form <name>    只上传指定表单
  --page <name>    只上传指定代码页
  --help, -h       显示帮助信息
`);
  process.exit(0);
}

const config = await loadConfig();

if (!dryRun && !config.buildIdExplicit) {
  console.error(
    "❌ 单独执行 publish:oss 时必须设置 APP_BUILD_ID；推荐使用 pnpm publish:all 统一发布。",
  );
  process.exit(1);
}

if (
  !dryRun &&
  (!config.oss.accessKeyId || config.oss.accessKeyId.startsWith("your_"))
) {
  console.error("❌ 请先配置 OSS 密钥（~/.openxiangda/.env 或项目 .env 中的 APP_OSS_* 字段）");
  process.exit(1);
}

const client = dryRun ? null : createOSSClient(config.oss);

const distDir = path.resolve(rootDir, "dist");
const files = (await glob(
  await buildUploadPatterns({ targetForm, targetPage, discoverPages }),
  { cwd: distDir, nodir: true },
)).filter(
  (file) => !file.endsWith("/build-cache.json"),
);

if (files.length === 0) {
  console.error("❌ 没有找到构建产物。请先运行 pnpm build");
  process.exit(1);
}

const remoteRoot = `${config.oss.pathPrefix}/${config.version}/${config.buildId}`;

function toOssKeyPath(file) {
  return String(file).replace(/\\/g, "/");
}

console.log(
  `📦 准备上传 ${files.length} 个文件到 OSS (${dryRun ? "DRY RUN" : "LIVE"})`,
);
console.log(`   Bucket: ${config.oss.bucket}`);
console.log(`   Path: ${remoteRoot}/`);
console.log("");

// ---------- Dry-run 模式 ----------

if (dryRun) {
  for (const file of files) {
    const remoteFile = toOssKeyPath(file);
    const ossKey = `${remoteRoot}/${remoteFile}`;
    const mime = getContentType(remoteFile);
    const cache = getCacheControl(remoteFile);
    console.log(`  [DRY] ${ossKey}  (${mime}, ${cache})`);
  }
  console.log(`\n✅ 预览完成（${files.length} 个文件）`);
  process.exit(0);
}

// ---------- 实际上传 ----------

await ensureBucketCors(client, config.oss);
console.log("");

const limit = pLimit(5); // 最多 5 个并发上传
const tracker = createProgressTracker(files.length);

const results = await Promise.allSettled(
  files.map((file) =>
    limit(async () => {
      const remoteFile = toOssKeyPath(file);
      const ossKey = `${remoteRoot}/${remoteFile}`;
      const localPath = path.join(distDir, file);
      const headers = {
        "Cache-Control": getCacheControl(remoteFile),
        "Content-Type": getContentType(remoteFile),
      };

      await uploadWithRetry(client, ossKey, localPath, headers);
      tracker.tick(ossKey, localPath);
    }),
  ),
);

// 报告失败项
const failures = results.filter((r) => r.status === "rejected");
if (failures.length > 0) {
  console.error(`\n⚠ ${failures.length} 个文件上传失败:`);
  for (const f of failures) {
    console.error(`  - ${f.reason?.message || f.reason}`);
  }
}

tracker.summary();

const successCount = results.filter((r) => r.status === "fulfilled").length;
console.log(`\n✅ 上传完成（${successCount}/${files.length} 成功）`);

if (failures.length > 0) {
  process.exit(1);
}
