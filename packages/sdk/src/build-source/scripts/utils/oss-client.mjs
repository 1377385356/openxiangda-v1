/**
 * oss-client.mjs - 阿里云 OSS 客户端工具
 *
 * 封装 OSS 客户端初始化、带重试的上传、以及 CORS 规则确保。
 */

import OSS from "ali-oss";

/**
 * 创建阿里云 OSS 客户端实例
 * @param {object} ossConfig - OSS 配置
 * @param {string} ossConfig.region - OSS Region
 * @param {string} ossConfig.bucket - Bucket 名称
 * @param {string} ossConfig.accessKeyId - AccessKey ID
 * @param {string} ossConfig.accessKeySecret - AccessKey Secret
 * @returns {import("ali-oss")} OSS 客户端实例
 */
export function createOSSClient(ossConfig) {
  return new OSS({
    region: ossConfig.region,
    accessKeyId: ossConfig.accessKeyId,
    accessKeySecret: ossConfig.accessKeySecret,
    bucket: ossConfig.bucket,
  });
}

/**
 * 带重试机制的 OSS 上传
 * @param {import("ali-oss")} client - OSS 客户端实例
 * @param {string} ossKey - OSS 对象键
 * @param {string} localPath - 本地文件路径
 * @param {object} headers - HTTP 头（Cache-Control, Content-Type 等）
 * @param {number} [retries=3] - 最大重试次数
 * @returns {Promise<void>}
 */
export async function uploadWithRetry(client, ossKey, localPath, headers, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await client.put(ossKey, localPath, { headers });
      return;
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`  ⚠ 重试 ${i + 1}/${retries}: ${ossKey}`);
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

/**
 * @param {*} value
 * @returns {string[]}
 */
function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

/**
 * 检查单条 CORS 规则是否已满足指定 origins 和 methods
 * @param {object} rule - CORS 规则对象
 * @param {string[]} origins - 需要允许的来源
 * @param {string[]} methods - 需要允许的方法
 * @returns {boolean}
 */
function corsRuleAllows(rule, origins, methods) {
  const allowedOrigins = toArray(rule.allowedOrigin);
  const allowedMethods = toArray(rule.allowedMethod).map((item) =>
    String(item).toUpperCase(),
  );

  const originAllowed =
    allowedOrigins.includes("*") ||
    origins.every((origin) => allowedOrigins.includes(origin));
  const methodAllowed = methods.every((method) =>
    allowedMethods.includes(method),
  );

  return originAllowed && methodAllowed;
}

/**
 * 确保 OSS Bucket 的 CORS 规则满足前端资源加载需求
 * @param {import("ali-oss")} client - OSS 客户端实例
 * @param {object} ossConfig - OSS 配置
 * @param {string} ossConfig.bucket - Bucket 名称
 * @param {boolean} [ossConfig.skipCors] - 是否跳过 CORS 检查
 * @param {string[]} [ossConfig.corsOrigins] - 允许的来源列表
 * @returns {Promise<void>}
 */
export async function ensureBucketCors(client, ossConfig) {
  if (ossConfig.skipCors) {
    console.log("   CORS: 跳过（APP_OSS_SKIP_CORS=1）");
    return;
  }

  const origins = ossConfig.corsOrigins?.length
    ? ossConfig.corsOrigins
    : ["*"];
  const methods = ["GET", "HEAD"];
  let rules = [];

  try {
    const result = await client.getBucketCORS(ossConfig.bucket);
    rules = Array.isArray(result.rules) ? result.rules : [];
  } catch (error) {
    if (error?.status !== 404 && error?.code !== "NoSuchCORSConfiguration") {
      throw error;
    }
  }

  if (rules.some((rule) => corsRuleAllows(rule, origins, methods))) {
    console.log(`   CORS: 已允许 ${origins.join(", ")}`);
    return;
  }

  await client.putBucketCORS(ossConfig.bucket, [
    ...rules,
    {
      allowedOrigin: origins,
      allowedMethod: methods,
      allowedHeader: "*",
      exposeHeader: ["ETag", "Content-Length", "Content-Type"],
      maxAgeSeconds: "3600",
    },
  ]);
  console.log(`   CORS: 已配置 ${origins.join(", ")}`);
}
