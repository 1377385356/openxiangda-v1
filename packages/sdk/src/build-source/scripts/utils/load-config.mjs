import fs from "node:fs";
import os from "node:os";
import { parse as parseDotenv } from "dotenv";
import { resolve } from "path";
import { pathToFileURL } from "url";

export const rootDir = resolve(process.env.LOWCODE_WORKSPACE_ROOT || process.cwd());
const OPENXIANGDA_HOME_DIR = ".openxiangda";
const OPENXIANGDA_GLOBAL_ENV_FILE = ".env";

export function getGlobalOpenXiangdaEnvFile(env = process.env) {
  const home = env.HOME || os.homedir();
  return resolve(home, OPENXIANGDA_HOME_DIR, OPENXIANGDA_GLOBAL_ENV_FILE);
}

function readDotenvFile(filePath) {
  try {
    return parseDotenv(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return {};
  }
}

export function loadWorkspaceEnv(options = {}) {
  const workspaceRoot = options.workspaceRoot || rootDir;
  const env = options.env || process.env;
  const globalEnvFile = getGlobalOpenXiangdaEnvFile(env);
  const globalEnv = readDotenvFile(globalEnvFile);
  const mode = options.mode || env.APP_MODE || globalEnv.APP_MODE || "development";
  const files = [
    { filePath: globalEnvFile, values: globalEnv },
    {
      filePath: resolve(workspaceRoot, ".env"),
      values: readDotenvFile(resolve(workspaceRoot, ".env")),
    },
  ];

  if (mode !== "development") {
    const modeFile = resolve(workspaceRoot, `.env.${mode}`);
    files.push({ filePath: modeFile, values: readDotenvFile(modeFile) });
  }

  const injectedGlobalKeys = new Set(
    String(env.OPENXIANGDA_GLOBAL_ENV_KEYS || "")
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean),
  );
  const originalKeys = new Set(
    Object.keys(env).filter(
      (key) => env[key] !== undefined && !injectedGlobalKeys.has(key),
    ),
  );
  const merged = {};
  const loadedFiles = [];
  for (const file of files) {
    if (fs.existsSync(file.filePath)) loadedFiles.push(file.filePath);
    Object.assign(merged, file.values);
  }

  for (const [key, value] of Object.entries(merged)) {
    if (!originalKeys.has(key)) {
      env[key] = value;
    }
  }

  return {
    globalEnvFile,
    loadedFiles,
    mode,
  };
}

/**
 * 标准化 OSS 路径前缀，去除前后斜杠
 * @param {string|undefined} pathPrefix
 * @returns {string}
 */
function normalizePathPrefix(pathPrefix) {
  return String(pathPrefix || "app-workspace").replace(/^\/+|\/+$/g, "");
}

/**
 * 解析逗号分隔的字符串为数组
 * @param {string|undefined} value
 * @param {string} [fallback]
 * @returns {string[]}
 */
function parseCsv(value, fallback) {
  return String(value || fallback || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getDefaultCorsOrigin(platformUrl) {
  try {
    return new URL(platformUrl).origin;
  } catch {
    return "*";
  }
}

function createBuildId() {
  return new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
}

function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function normalizeCssIsolation(value) {
  if (value === "none") return "none";
  if (value === "namespace") return "namespace";
  if (value === "shadow") {
    console.warn(
      "[lowcode-workspace] cssIsolation='shadow' is deprecated; use 'none' unless legacy isolation is required.",
    );
    return "shadow";
  }
  return "none";
}

function normalizeRuntimeMode(value) {
  if (value === "react-spa" || value === "spa") return "react-spa";
  return value === "legacy" ? "legacy" : "";
}

export function resolveOpenXiangdaEndpointConfig(baseUrl) {
  const raw = normalizeBaseUrl(baseUrl);
  if (!raw) {
    return { platformUrl: "", servicePrefix: "" };
  }

  try {
    const url = new URL(raw);
    const cleanPath = url.pathname.replace(/\/+$/, "");
    if (
      !cleanPath ||
      cleanPath === "/platform" ||
      cleanPath.startsWith("/platform/") ||
      cleanPath === "/view" ||
      cleanPath.startsWith("/view/")
    ) {
      return { platformUrl: url.origin, servicePrefix: "/service" };
    }
    return { platformUrl: `${url.origin}${cleanPath}`, servicePrefix: "" };
  } catch {
    return { platformUrl: raw, servicePrefix: "" };
  }
}

async function loadConfigModule() {
  const configPath = resolve(rootDir, "app-workspace.config.ts");
  const loaded = await import(pathToFileURL(configPath).href);
  return loaded.default || loaded;
}

/**
 * 加载并合并应用配置（文件 + 环境变量）
 * @returns {Promise<object>} 合并后的应用配置对象
 */
export async function loadConfig() {
  loadWorkspaceEnv();

  const source = await loadConfigModule();
  const openXiangdaMode = Boolean(
    process.env.OPENXIANGDA_ACCESS_TOKEN || process.env.OPENXIANGDA_BASE_URL,
  );
  const openXiangdaEndpoint = process.env.OPENXIANGDA_BASE_URL
    ? resolveOpenXiangdaEndpointConfig(process.env.OPENXIANGDA_BASE_URL)
    : null;
  const platformUrl = openXiangdaEndpoint
    ? openXiangdaEndpoint.platformUrl
    : source.platformUrl || process.env.APP_PLATFORM_URL;
  const explicitBuildId = Boolean(source.buildId || process.env.APP_BUILD_ID);

  const normalized = {
    ...source,
    appType: process.env.OPENXIANGDA_APP_TYPE || source.appType || process.env.APP_TYPE,
    appName: source.appName || process.env.APP_NAME || "低代码应用",
    runtimeMode: normalizeRuntimeMode(
      process.env.OPENXIANGDA_RUNTIME_MODE ||
        process.env.APP_RUNTIME_MODE ||
        source.runtimeMode,
    ),
    platformUrl,
    servicePrefix:
      openXiangdaEndpoint?.servicePrefix ??
      (source.servicePrefix ||
        process.env.APP_SERVICE_PREFIX ||
        (openXiangdaMode ? "" : "/service")),
    openXiangdaAccessToken: process.env.OPENXIANGDA_ACCESS_TOKEN || "",
    openXiangdaProfile: process.env.OPENXIANGDA_PROFILE || "",
    openXiangdaTarget: process.env.OPENXIANGDA_TARGET || "",
    appKey: source.appKey || process.env.APP_KEY,
    appSecret: source.appSecret || process.env.APP_SECRET,
    userId: source.userId || process.env.APP_USER_ID,
    version: source.version || process.env.APP_VERSION || "0.1.0",
    buildId: source.buildId || process.env.APP_BUILD_ID || createBuildId(),
    buildIdExplicit: explicitBuildId,
    oss: {
      ...(source.oss || {}),
      region: source.oss?.region || process.env.APP_OSS_REGION,
      bucket: source.oss?.bucket || process.env.APP_OSS_BUCKET,
      accessKeyId:
        source.oss?.accessKeyId || process.env.APP_OSS_ACCESS_KEY_ID,
      accessKeySecret:
        source.oss?.accessKeySecret || process.env.APP_OSS_ACCESS_KEY_SECRET,
      pathPrefix: normalizePathPrefix(
        source.oss?.pathPrefix || process.env.APP_OSS_PATH_PREFIX,
      ),
      corsOrigins: parseCsv(
        process.env.APP_OSS_CORS_ORIGINS,
        getDefaultCorsOrigin(platformUrl),
      ),
      skipCors: process.env.APP_OSS_SKIP_CORS === "1" || source.oss?.skipCors,
    },
    defaults: {
      protocolVersion:
        source.defaults?.protocolVersion ||
        process.env.APP_PAGE_PROTOCOL_VERSION ||
        "1.0",
      frameworkVersion:
        source.defaults?.frameworkVersion ||
        process.env.APP_FRAMEWORK_VERSION ||
        "18.3.1",
      cssIsolation: normalizeCssIsolation(
        process.env.APP_PAGE_CSS_ISOLATION || source.defaults?.cssIsolation,
      ),
      formMenuParentId:
        source.defaults?.formMenuParentId ||
        process.env.APP_FORM_MENU_PARENT_ID ||
        "",
      formMenuIcon:
        source.defaults?.formMenuIcon || process.env.APP_FORM_MENU_ICON || "",
      pageMenuParentId:
        source.defaults?.pageMenuParentId ||
        process.env.APP_PAGE_MENU_PARENT_ID ||
        "",
      pageMenuIcon:
        source.defaults?.pageMenuIcon || process.env.APP_PAGE_MENU_ICON || "",
      formBuilderVersion:
        source.defaults?.formBuilderVersion ||
        process.env.APP_FORM_BUILDER_VERSION ||
        "2.0",
    },
  };

  return {
    ...normalized,
    menu: {
      parentId: normalized.defaults.formMenuParentId,
      icon: normalized.defaults.formMenuIcon,
    },
  };
}

/**
 * 获取后端 API 基础 URL
 * @param {object} config - 应用配置对象
 * @returns {string}
 */
export function getApiBaseUrl(config) {
  return `${normalizeBaseUrl(config.platformUrl)}${config.servicePrefix}`;
}

/**
 * 获取 OSS 公网访问基础 URL
 * @param {object} config - 应用配置对象
 * @returns {string}
 */
export function getPublicBaseUrl(config) {
  return `https://${config.oss.bucket}.${config.oss.region}.aliyuncs.com/${config.oss.pathPrefix}/${config.version}/${config.buildId}`;
}

/**
 * 获取表单 bundle 文件的公网 URL
 * @param {object} config - 应用配置对象
 * @param {string} formName - 表单名
 * @param {string} fileName - 文件名
 * @returns {string}
 */
export function getFormBundleUrl(config, formName, fileName) {
  return `${getPublicBaseUrl(config)}/forms/${formName}/${fileName}`;
}

/**
 * 获取表单共享 runtime 文件的公网 URL
 * @param {object} config - 应用配置对象
 * @param {string} fileName - 文件名
 * @returns {string}
 */
export function getFormRuntimeUrl(config, fileName) {
  return `${getPublicBaseUrl(config)}/form-runtime/${fileName}`;
}

/**
 * 获取代码页资源基础 URL
 * @param {object} config - 应用配置对象
 * @param {string} pageCode - 页面编码
 * @returns {string}
 */
export function getPageAssetBaseUrl(config, pageCode) {
  return `${getPublicBaseUrl(config)}/pages/${pageCode}`;
}

/**
 * 获取代码页指定资源的公网 URL
 * @param {object} config - 应用配置对象
 * @param {string} pageCode - 页面编码
 * @param {string} fileName - 文件名
 * @returns {string}
 */
export function getPageAssetUrl(config, pageCode, fileName) {
  return `${getPageAssetBaseUrl(config, pageCode)}/${fileName}`;
}

/**
 * 获取代码页共享 runtime 文件的公网 URL
 * @param {object} config - 应用配置对象
 * @param {string} fileName - 文件名
 * @returns {string}
 */
export function getPageRuntimeUrl(config, fileName) {
  return `${getPublicBaseUrl(config)}/page-runtime/${fileName}`;
}

export function getBundleOSSUrl(config, formName, fileName) {
  return getFormBundleUrl(config, formName, fileName);
}
