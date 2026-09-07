/**
 * build-pages.mjs - 构建复杂代码页
 */

import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import {
  cleanBuildCache,
  commitIncrementalBuild,
  normalizeOnly,
  planIncrementalBuild,
  printPlan,
} from "./utils/incremental.mjs";
import { createNamespaceCssPlugin } from "./utils/namespace-css.mjs";
import { validateRuntimeCssFile } from "./utils/runtime-css-check.mjs";
import {
  extractLargeDataUrlAssets,
  formatExtractedAssetSummary,
} from "./utils/static-assets.mjs";
import { warnShadcnTailwindTokens } from "./utils/tailwind-token-warnings.mjs";
import { loadConfig } from "./utils/load-config.mjs";
import {
  createWorkspaceStyleImport,
  listWorkspaceStyleEntryPaths,
} from "./utils/workspace-style-entry.mjs";

process.env.NODE_ENV = "production";
process.env.BABEL_ENV = "production";

const [{ default: react }, { build }] = await Promise.all([
  import("@vitejs/plugin-react"),
  import("vite"),
]);

import { discoverPages, distRoot, rootDir, srcRoot } from "./utils/pages.mjs";

const require = createRequire(import.meta.url);
const tmpDir = path.join(rootDir, ".tmp");
const runtimeDistDir = path.join(distRoot, "page-runtime");
const runtimeVersionPlaceholder = "__SY_PAGE_RUNTIME_VERSION__";
const runtimeCacheFileName = "build-cache.json";
const portalContainerResolverGlobal = "__OPENXIANGDA_GET_PORTAL_CONTAINER__";
let workspaceConfigPromise = null;

const runtimePackages = [
  "react",
  "react-dom",
  "@ant-design/cssinjs",
  "antd",
  "antd-mobile",
  "@ant-design/icons",
  "openxiangda",
];

const proxyModuleIds = new Map(
  [
    "react",
    "react/jsx-runtime",
    "react-dom/client",
    "@ant-design/cssinjs",
    "antd",
    "antd/locale/zh_CN",
    "@ant-design/icons",
    "openxiangda",
    "openxiangda/runtime",
  ].map((id) => [id, `\0sy-page-runtime-proxy:${id}`]),
);

const staticProxyExports = {
  "openxiangda/runtime": [
    "createPageSdk",
    "createReactPage",
    "PageProvider",
    "useCurrentUser",
    "useDataSource",
    "useFormViewPermissions",
    "useMessage",
    "useModal",
    "useNavigation",
    "usePageContext",
    "usePageProps",
    "usePageRoute",
    "usePageSdk",
  ],
  "react/jsx-runtime": ["Fragment", "jsx", "jsxs"],
  "react-dom/client": ["createRoot", "hydrateRoot"],
  "@ant-design/cssinjs": ["StyleProvider", "createCache", "extractStyle"],
  "antd/locale/zh_CN": [],
};

const exportNameCache = new Map();

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDuration(startTime) {
  return `${((Date.now() - startTime) / 1000).toFixed(2)}s`;
}

function fileSizeLabel(filePath) {
  if (!fsSync.existsSync(filePath)) return "未生成";
  return formatBytes(fsSync.statSync(filePath).size);
}

function fileGzipSizeLabel(filePath) {
  if (!fsSync.existsSync(filePath)) return "未生成";
  return formatBytes(gzipSync(fsSync.readFileSync(filePath)).length);
}

function readTextIfExists(filePath) {
  if (!fsSync.existsSync(filePath)) return "";
  return fsSync.readFileSync(filePath, "utf-8");
}

function normalizeCssIsolation(value) {
  if (value === "namespace" || value === "shadow") return value;
  return "none";
}

function usesNamespaceCss(cssIsolation) {
  return cssIsolation === "namespace" || cssIsolation === "shadow";
}

function getWorkspaceConfig() {
  if (!workspaceConfigPromise) workspaceConfigPromise = loadConfig();
  return workspaceConfigPromise;
}

function readPackageVersion(packageName) {
  try {
    let current = path.dirname(require.resolve(packageName));
    while (current && current !== path.dirname(current)) {
      const packageJsonPath = path.join(current, "package.json");
      if (fsSync.existsSync(packageJsonPath)) {
        return (
          JSON.parse(fsSync.readFileSync(packageJsonPath, "utf-8")).version ||
          "unknown"
        );
      }
      current = path.dirname(current);
    }
    return "unknown";
  } catch {
    return "missing";
  }
}

/**
 * @param {string[]} argv - 命令行参数数组
 * @returns {{ page: string, runtimeCache: boolean, help: boolean }}
 */
function parseArgs(argv) {
  const result = {
    page: "",
    force: false,
    only: "",
    dryRun: false,
    cleanCache: false,
    runtimeCache: process.env.APP_RUNTIME_CACHE !== "false",
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }
    if (arg === "--page" && argv[index + 1]) {
      result.page = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--only" && argv[index + 1]) {
      result.only = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--only=")) {
      result.only = arg.slice("--only=".length);
      continue;
    }
    if (arg === "--force") {
      result.force = true;
      continue;
    }
    if (arg === "--dry-run") {
      result.dryRun = true;
      continue;
    }
    if (arg === "--clean-cache") {
      result.cleanCache = true;
      continue;
    }
    if (arg === `--${["bundle", "mode"].join("-")}`) {
      throw new Error("runtime mode flag has been removed");
    }
    if (arg === "--no-runtime-cache") {
      result.runtimeCache = false;
    }
  }
  return result;
}

function printHelp() {
  console.log(`
build-pages - 构建复杂代码页

用法:
  tsx scripts/build-pages.mjs [options]

选项:
  --page <name>       只构建指定页面目录
  --only <list>       只构建指定模块，如 forms/customer,pages/dashboard
  --force             忽略增量缓存，强制重建页面产物
  --dry-run           只打印增量计划，不构建
  --clean-cache       删除 .openxiangda/build-cache.json
  --no-runtime-cache  强制重建共享 runtime
  --help, -h          显示帮助信息
`);
}

function createRuntimeInputHash(runtimeEntryContent, cssIsolation) {
  const hash = crypto.createHash("sha256");
  const packageVersions = runtimePackages.reduce((result, packageName) => {
    result[packageName] = readPackageVersion(packageName);
    return result;
  }, {});
  const configFiles = [
    ...listWorkspaceStyleEntryPaths(rootDir),
    path.join(rootDir, "app-workspace.config.ts"),
    path.join(rootDir, "tailwind.config.cjs"),
    path.join(rootDir, "postcss.config.cjs"),
    fileURLToPath(import.meta.url),
  ];

  hash.update("sy-page-runtime-v1-input");
  hash.update(runtimeEntryContent);
  hash.update(normalizeCssIsolation(cssIsolation));
  hash.update(JSON.stringify(packageVersions));
  configFiles.forEach((filePath) => {
    hash.update(filePath);
    hash.update(readTextIfExists(filePath));
  });
  return hash.digest("hex");
}

function createRuntimeEntryContent() {
  const workspaceStyleImport = createWorkspaceStyleImport(rootDir, tmpDir);
  return `import * as ReactModule from 'react';
import * as ReactJsxRuntimeModule from 'react/jsx-runtime';
import * as ReactDomClientModule from 'react-dom/client';
import * as CssInJsModule from '@ant-design/cssinjs';
import * as AntdModule from 'antd';
import zhCN from 'antd/locale/zh_CN';
import * as IconsModule from '@ant-design/icons';
import * as OpenXiangdaModule from 'openxiangda';
import * as OpenXiangdaRuntimeModule from 'openxiangda/runtime';
import '${workspaceStyleImport}';

const runtimeVersion = '${runtimeVersionPlaceholder}';

const withDefault = (moduleValue, defaultValue) => ({
  ...moduleValue,
  default: defaultValue ?? moduleValue.default ?? moduleValue,
});

export const pageRuntime = {
  protocol: 'sy-page-runtime',
  majorVersion: 1,
  version: runtimeVersion,
  modules: {
    react: withDefault(ReactModule, ReactModule.default || ReactModule),
    'react/jsx-runtime': ReactJsxRuntimeModule,
    'react-dom/client': ReactDomClientModule,
    '@ant-design/cssinjs': CssInJsModule,
    antd: withDefault(AntdModule, null),
    'antd/locale/zh_CN': { default: zhCN },
    '@ant-design/icons': IconsModule,
    openxiangda: OpenXiangdaModule,
    'openxiangda/runtime': OpenXiangdaRuntimeModule,
  },
};

globalThis.SY_PAGE_RUNTIME_V1 = pageRuntime;

export default pageRuntime;
`;
}

function readRuntimeManifest() {
  const manifestPath = path.join(runtimeDistDir, "manifest.json");
  if (!fsSync.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fsSync.readFileSync(manifestPath, "utf-8"));
  } catch {
    return null;
  }
}

function readRuntimeBuildCache() {
  const cachePath = path.join(runtimeDistDir, runtimeCacheFileName);
  if (!fsSync.existsSync(cachePath)) return null;
  try {
    return JSON.parse(fsSync.readFileSync(cachePath, "utf-8"));
  } catch {
    return null;
  }
}

function isRuntimeCacheValid(inputHash) {
  const manifest = readRuntimeManifest();
  const cache = readRuntimeBuildCache();
  if (
    !manifest ||
    manifest.protocol !== "sy-page-runtime" ||
    manifest.majorVersion !== 1 ||
    !manifest.version ||
    !manifest.files?.entry ||
    !cache ||
    cache.inputHash !== inputHash ||
    cache.runtimeVersion !== manifest.version
  ) {
    return false;
  }
  const runtimeJsPath = path.join(runtimeDistDir, manifest.files.entry);
  if (!fsSync.existsSync(runtimeJsPath)) return false;
  if (
    manifest.files.css &&
    !fsSync.existsSync(path.join(runtimeDistDir, manifest.files.css))
  ) {
    return false;
  }
  try {
    validateRuntimeCssFile(
      path.join(runtimeDistDir, manifest.files.css || "style.css"),
      {
        label: "代码页共享 runtime",
      },
    );
  } catch {
    return false;
  }
  return true;
}

async function createCssOptions(cssIsolation = "none") {
  const tailwindcssModule = await import("tailwindcss");
  const autoprefixerModule = await import("autoprefixer");
  const tailwindcss = tailwindcssModule.default ?? tailwindcssModule;
  const autoprefixer = autoprefixerModule.default ?? autoprefixerModule;
  const plugins = [
    tailwindcss({ config: path.join(rootDir, "tailwind.config.cjs") }),
  ];
  if (usesNamespaceCss(normalizeCssIsolation(cssIsolation))) {
    plugins.push(createNamespaceCssPlugin());
  }
  plugins.push(autoprefixer());
  return {
    postcss: {
      plugins,
    },
  };
}

function createAntdMobilePortalPatchPlugin() {
  const resolverExpression = `globalThis.${portalContainerResolverGlobal}?.() || document.body`;
  return {
    name: "openxiangda-antd-mobile-portal-container",
    transform(code, id) {
      if (!id.includes("/antd-mobile/") && !id.includes("\\\\antd-mobile\\\\")) {
        return null;
      }
      const nextCode = code.replace(
        /getContainer:\s*\(\)\s*=>\s*document\.body/g,
        `getContainer: () => ${resolverExpression}`,
      );
      if (nextCode === code) return null;
      return { code: nextCode, map: null };
    },
  };
}

function createResolveAlias() {
  return [
    {
      find: "@",
      replacement: srcRoot,
    },
  ];
}

async function buildSharedRuntime(options = {}) {
  const startedAt = Date.now();
  const entryContent = createRuntimeEntryContent();
  const config = await getWorkspaceConfig();
  const cssIsolation = normalizeCssIsolation(config.defaults?.cssIsolation);
  const inputHash = createRuntimeInputHash(entryContent, cssIsolation);
  if (options.runtimeCache !== false && isRuntimeCacheValid(inputHash)) {
    const manifest = readRuntimeManifest();
    console.log(`[build] 代码页共享 runtime 缓存命中: ${manifest.version}`);
    return;
  }

  const entryPath = path.join(tmpDir, "page-runtime-entry.jsx");
  await fs.writeFile(entryPath, entryContent, "utf8");

  try {
    const cssOptions = await createCssOptions(cssIsolation);
    console.log("[build] 构建代码页共享 runtime");
    await build({
      configFile: false,
      root: rootDir,
      publicDir: false,
      css: cssOptions,
      define: {
        "process.env.NODE_ENV": JSON.stringify("production"),
        "process.env": JSON.stringify({ NODE_ENV: "production" }),
      },
      plugins: [createAntdMobilePortalPatchPlugin(), react()],
      resolve: {
        alias: createResolveAlias(),
        dedupe: ["react", "react-dom", "antd", "@ant-design/cssinjs"],
      },
      build: {
        target: "es2018",
        assetsInlineLimit: 0,
        cssCodeSplit: false,
        emptyOutDir: true,
        minify: true,
        outDir: runtimeDistDir,
        lib: {
          entry: entryPath,
          formats: ["es"],
          fileName: () => "runtime.js",
        },
        rollupOptions: {
          output: {
            inlineDynamicImports: true,
            entryFileNames: "runtime.js",
            chunkFileNames: "runtime.js",
            assetFileNames: (assetInfo) => {
              if (String(assetInfo.name || "").endsWith(".css")) {
                return "style.css";
              }
              return "assets/[name]-[hash][extname]";
            },
          },
        },
      },
      logLevel: "warn",
    });

    const runtimeJsPath = path.join(runtimeDistDir, "runtime.js");
    const runtimeCssPath = path.join(runtimeDistDir, "style.css");
    const extractedAssets = extractLargeDataUrlAssets({
      outDir: runtimeDistDir,
      files: [runtimeJsPath, runtimeCssPath],
    });
    const extractedSummary = formatExtractedAssetSummary(extractedAssets);
    if (extractedSummary) console.log(`[build] ${extractedSummary}`);
    validateRuntimeCssFile(runtimeCssPath, { label: "代码页共享 runtime" });
    const runtimeJs = fsSync.readFileSync(runtimeJsPath);
    const runtimeCss = fsSync.existsSync(runtimeCssPath)
      ? fsSync.readFileSync(runtimeCssPath)
      : Buffer.alloc(0);
    const hash = crypto
      .createHash("sha256")
      .update(runtimeJs)
      .update(runtimeCss)
      .digest("hex")
      .slice(0, 12);
    const runtimeVersion = `v1-${hash}`;
    await fs.writeFile(
      runtimeJsPath,
      runtimeJs
        .toString("utf-8")
        .split(runtimeVersionPlaceholder)
        .join(runtimeVersion),
      "utf8",
    );
    const manifest = {
      protocol: "sy-page-runtime",
      majorVersion: 1,
      version: runtimeVersion,
      inputHash,
      files: {
        entry: "runtime.js",
        css: fsSync.existsSync(runtimeCssPath) ? "style.css" : null,
      },
      sizes: {
        entry: fsSync.statSync(runtimeJsPath).size,
        entryGzip: gzipSync(fsSync.readFileSync(runtimeJsPath)).length,
        css: fsSync.existsSync(runtimeCssPath)
          ? fsSync.statSync(runtimeCssPath).size
          : 0,
        cssGzip: fsSync.existsSync(runtimeCssPath)
          ? gzipSync(fsSync.readFileSync(runtimeCssPath)).length
          : 0,
      },
      builtAt: new Date().toISOString(),
    };
    await fs.writeFile(
      path.join(runtimeDistDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(runtimeDistDir, runtimeCacheFileName),
      JSON.stringify(
        {
          inputHash,
          runtimeVersion,
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    );
    console.log(
      `[build] 代码页共享 runtime 构建完成，用时 ${formatDuration(startedAt)}`,
    );
    console.log(
      `[build] runtime.js: ${fileSizeLabel(runtimeJsPath)} / gzip ${fileGzipSizeLabel(runtimeJsPath)}`,
    );
    console.log(
      `[build] style.css: ${fileSizeLabel(runtimeCssPath)} / gzip ${fileGzipSizeLabel(runtimeCssPath)}`,
    );
  } finally {
    await fs.rm(entryPath, { force: true });
  }
}

function isValidExportName(name) {
  return /^[A-Za-z_$][\w$]*$/.test(name) && name !== "default";
}

async function getProxyExportNames(source) {
  if (exportNameCache.has(source)) return exportNameCache.get(source);
  if (staticProxyExports[source]) {
    exportNameCache.set(source, staticProxyExports[source]);
    return staticProxyExports[source];
  }
  if (source === "openxiangda") {
    const parsed = readPackageTypeExports(source);
    const runtimeExports = await readRuntimeModuleExports(source).catch(() => []);
    const names = Array.from(new Set([...parsed, ...runtimeExports]));
    exportNameCache.set(source, names);
    return names;
  }
  if (source === "@ant-design/icons") {
    const names = await readRuntimeModuleExports(source);
    exportNameCache.set(source, names);
    return names;
  }
  try {
    const names = await readRuntimeModuleExports(source);
    exportNameCache.set(source, names);
    return names;
  } catch {
    exportNameCache.set(source, []);
    return [];
  }
}

async function readRuntimeModuleExports(source) {
  const moduleValue = await import(source);
  return Object.keys(moduleValue).filter(isValidExportName);
}

function readPackageTypeExports(source) {
  try {
    const entryPath = resolvePackageEntry(source);
    if (!entryPath) return [];
    let currentDir = path.dirname(entryPath);
    let packageJsonPath = "";
    while (currentDir && currentDir !== path.dirname(currentDir)) {
      const candidate = path.join(currentDir, "package.json");
      if (fsSync.existsSync(candidate)) {
        packageJsonPath = candidate;
        break;
      }
      currentDir = path.dirname(currentDir);
    }
    if (!packageJsonPath) return [];
    const packageJson = JSON.parse(
      fsSync.readFileSync(packageJsonPath, "utf-8"),
    );
    const typesPath = packageJson.types || packageJson.typings;
    if (!typesPath) return [];
    const dtsPath = path.resolve(path.dirname(packageJsonPath), typesPath);
    const content = fsSync.readFileSync(dtsPath, "utf-8");
    const names = new Set();
    for (const match of content.matchAll(
      /export\s+(?:declare\s+)?(?:const|function|class)\s+([A-Za-z_$][\w$]*)/g,
    )) {
      names.add(match[1]);
    }
    for (const match of content.matchAll(/export\s*\{([^}]+)\}/g)) {
      match[1]
        .split(",")
        .map((item) =>
          item
            .trim()
            .split(/\s+as\s+/)
            .pop()
            ?.trim(),
        )
        .filter((item) => item && isValidExportName(item))
        .forEach((item) => names.add(item));
    }
    return Array.from(names);
  } catch {
    return [];
  }
}

function resolvePackageEntry(source) {
  const attempts = [
    () => require.resolve(source),
    () => require.resolve(source, { paths: [rootDir] }),
  ];
  for (const attempt of attempts) {
    try {
      return attempt();
    } catch {
      // Try the next resolution root.
    }
  }
  return "";
}

async function createProxyModuleCode(source) {
  const exportNames = await getProxyExportNames(source);
  const globalKey = JSON.stringify(source);
  const namedExports = exportNames
    .map(
      (name) => `export const ${name} = moduleValue[${JSON.stringify(name)}];`,
    )
    .join("\n");
  const defaultExport =
    source === "antd/locale/zh_CN"
      ? "export default moduleValue.default;"
      : `export default (moduleValue.default ?? moduleValue);`;

  return `const runtime = globalThis.SY_PAGE_RUNTIME_V1;
if (!runtime || runtime.protocol !== 'sy-page-runtime' || runtime.majorVersion !== 1) {
  throw new Error('代码页共享运行时未加载或版本不兼容');
}
const moduleValue = runtime.modules[${globalKey}];
if (!moduleValue) {
  throw new Error('代码页共享运行时缺少模块: ${source}');
}
${namedExports}
${defaultExport}
`;
}

function createSharedRuntimeProxyPlugin() {
  return {
    name: "sy-page-runtime-proxy",
    enforce: "pre",
    resolveId(source) {
      return proxyModuleIds.get(source) || null;
    },
    async load(id) {
      const source = Array.from(proxyModuleIds.entries()).find(
        ([, proxyId]) => proxyId === id,
      )?.[0];
      if (!source) return null;
      return createProxyModuleCode(source);
    },
    transform(code, id) {
      if (!id.includes(`${path.sep}src${path.sep}pages${path.sep}`))
        return null;
      if (!/\.[cm]?[jt]sx?$/.test(id)) return null;
      return code.replace(
        /^\s*import\s+["'](?:\.\.\/\.\.\/index\.css|\.\.\/index\.css)["'];?\s*$/gm,
        "",
      );
    },
  };
}

/**
 * 确保构建产物的文件名与预期一致，必要时重命名
 * @param {string} targetDir - 目标目录
 * @param {string} expectedName - 期望的文件名
 * @param {string} extension - 文件扩展名
 * @returns {Promise<string|null>}
 */
async function ensureFileName(targetDir, expectedName, extension) {
  const files = await fs.readdir(targetDir);
  const matchingFile = files.find((fileName) => fileName.endsWith(extension));
  if (!matchingFile) return null;
  if (matchingFile === expectedName) return path.join(targetDir, matchingFile);
  const sourcePath = path.join(targetDir, matchingFile);
  const targetPath = path.join(targetDir, expectedName);
  await fs.rename(sourcePath, targetPath);
  return targetPath;
}

/**
 * 构建单个代码页的 Vite bundle
 * @param {{ config: { code: string }, entryPath: string }} page - 页面信息
 * @returns {Promise<void>}
 */
async function buildPage(page) {
  const startedAt = Date.now();
  console.log(`📦 构建代码页: ${page.config.code} (shared runtime)`);
  const outDir = path.join(distRoot, "pages", page.config.code);
  await fs.mkdir(outDir, { recursive: true });

  const config = await getWorkspaceConfig();
  const cssIsolation = normalizeCssIsolation(
    page.config.cssIsolation || config.defaults?.cssIsolation,
  );
  const cssOptions = await createCssOptions(cssIsolation);
  await build({
    configFile: false,
    mode: "production",
    root: rootDir,
    publicDir: false,
    css: cssOptions,
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      "process.env": JSON.stringify({ NODE_ENV: "production" }),
    },
    plugins: [
      createAntdMobilePortalPatchPlugin(),
      createSharedRuntimeProxyPlugin(),
      react(),
    ],
    resolve: {
      alias: createResolveAlias(),
      dedupe: ["react", "react-dom", "antd", "@ant-design/cssinjs"],
    },
    build: {
      target: "es2018",
      assetsInlineLimit: 0,
      cssCodeSplit: false,
      emptyOutDir: true,
      minify: true,
      outDir,
      lib: {
        entry: page.entryPath,
        formats: ["es"],
        fileName: () => "index",
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
          entryFileNames: "index.js",
          chunkFileNames: "index.js",
          assetFileNames: (assetInfo) => {
            if (String(assetInfo.name || "").endsWith(".css")) {
              return "style.css";
            }
            return "assets/[name]-[hash][extname]";
          },
        },
      },
    },
    logLevel: "warn",
  });

  const jsPath = await ensureFileName(outDir, "index.js", ".js");
  if (!jsPath) throw new Error(`页面 ${page.config.code} 未生成 index.js`);
  const cssPath = await ensureFileName(outDir, "style.css", ".css");
  if (!cssPath) await fs.writeFile(path.join(outDir, "style.css"), "", "utf8");
  const finalCssPath = path.join(outDir, "style.css");
  const extractedAssets = extractLargeDataUrlAssets({
    outDir,
    files: [jsPath, finalCssPath],
  });
  const extractedSummary = formatExtractedAssetSummary(extractedAssets);
  if (extractedSummary) console.log(`[build] ${extractedSummary}`);

  const outputCode = await fs.readFile(jsPath, "utf8");
  const bareImportMatch = outputCode.match(
    /\bfrom\s*["'](?:react|react-dom|react\/jsx-runtime|antd|@ant-design\/cssinjs|@ant-design\/icons|openxiangda(?:\/runtime)?)["']/,
  );
  if (bareImportMatch) {
    throw new Error(
      `构建产物仍包含浏览器无法直接加载的裸模块导入: ${bareImportMatch[0]}`,
    );
  }
  if (/\bprocess\.env\b/.test(outputCode)) {
    throw new Error("构建产物仍包含浏览器不存在的 process.env 引用");
  }
  if (/\bjsxDEV\b|react\/jsx-dev-runtime/.test(outputCode)) {
    throw new Error(
      "构建产物包含开发态 JSX runtime（jsxDEV/react/jsx-dev-runtime），请使用生产模式重新构建",
    );
  }
  console.log(
    `[build] 代码页 ${page.config.code} 构建完成，用时 ${formatDuration(startedAt)}`,
  );
  console.log(
    `[build] index.js: ${fileSizeLabel(jsPath)} / gzip ${fileGzipSizeLabel(jsPath)}`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (args.cleanCache) {
    cleanBuildCache();
    console.log("[build] 已删除 .openxiangda/build-cache.json");
    return;
  }

  const onlyTargets = normalizeOnly(args.only);
  const only = onlyTargets.filter((item) => item.startsWith("pages/"));
  if (onlyTargets.length > 0 && only.length === 0) {
    console.log("[build] pages: No page targets selected");
    return;
  }
  const requested = args.page ? [`pages/${args.page}`] : only;
  const pages = (await discoverPages("")).map((page) => ({
    ...page,
    key: `pages/${page.dirName}`,
    dirPath: page.dirPath,
  }));
  if (pages.length === 0) {
    if (args.page) {
      throw new Error(`找不到代码页 "${args.page}"`);
    }
    console.log("未发现复杂代码页，跳过 pages 构建");
    return;
  }
  const pageKeys = new Set(pages.map((page) => page.key));
  const missing = requested.filter((key) => !pageKeys.has(key));
  if (missing.length > 0) {
    throw new Error(
      `找不到代码页 ${missing.map((key) => `"${key.slice("pages/".length)}"`).join(", ")}`,
    );
  }

  const plan = planIncrementalBuild(pages, {
    force: args.force,
    only: requested.length ? requested : undefined,
  });
  printPlan(plan, "pages");
  if (args.dryRun) return;
  if (plan.changed.length === 0) return;
  warnShadcnTailwindTokens(rootDir);

  if (plan.fullRebuild && requested.length === 0) {
    await fs.rm(path.join(distRoot, "pages"), { recursive: true, force: true });
  }
  await fs.mkdir(tmpDir, { recursive: true });

  await buildSharedRuntime({ runtimeCache: args.runtimeCache });
  console.log("");

  let succeeded = 0;
  let failed = 0;
  const built = [];
  for (const page of plan.changed) {
    try {
      await buildPage(page);
      succeeded += 1;
      built.push(page);
    } catch (error) {
      failed += 1;
      console.error(`  ❌ 构建失败: ${error.stack || error.message}`);
    }
  }

  try {
    const remaining = await fs.readdir(tmpDir);
    if (remaining.length === 0) {
      await fs.rmdir(tmpDir);
    }
  } catch {
    // ignore
  }

  console.log(`完成: ${succeeded} 成功, ${failed} 失败`);
  if (failed > 0) process.exit(1);
  commitIncrementalBuild(plan, built);
}

await main();
