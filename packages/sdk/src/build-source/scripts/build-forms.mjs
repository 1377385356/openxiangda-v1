/**
 * build-forms.mjs - 构建单个或全部表单页面
 */

import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "vite";
import { loadConfig, rootDir } from "./utils/load-config.mjs";
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
import {
  createWorkspaceStyleImport,
  listWorkspaceStyleEntryPaths,
} from "./utils/workspace-style-entry.mjs";

process.env.NODE_ENV = "production";
process.env.BABEL_ENV = "production";

const require = createRequire(import.meta.url);
const formsDir = path.join(rootDir, "src/forms");
const distDir = path.join(rootDir, "dist/forms");
const runtimeDistDir = path.join(rootDir, "dist/form-runtime");
const tmpDir = path.join(rootDir, ".tmp");
const runtimeVersionPlaceholder = "__SY_FORM_RUNTIME_VERSION__";
const runtimeCacheFileName = "build-cache.json";
const portalContainerResolverGlobal = "__OPENXIANGDA_GET_PORTAL_CONTAINER__";
let workspaceConfigPromise = null;

const runtimePackages = [
  "react",
  "react-dom",
  "@ant-design/cssinjs",
  "antd",
  "antd-mobile",
  "openxiangda",
  "@tiptap/react",
];

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
  if (!fs.existsSync(filePath)) return "未生成";
  return formatBytes(fs.statSync(filePath).size);
}

function fileGzipSizeLabel(filePath) {
  if (!fs.existsSync(filePath)) return "未生成";
  return formatBytes(gzipSync(fs.readFileSync(filePath)).length);
}

function readTextIfExists(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf-8");
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
      if (fs.existsSync(packageJsonPath)) {
        return (
          JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")).version ||
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

function createRuntimeInputHash(runtimeEntryContent, cssIsolation) {
  const hash = crypto.createHash("sha256");
  const configFiles = [
    ...listWorkspaceStyleEntryPaths(rootDir),
    path.join(rootDir, "app-workspace.config.ts"),
    path.join(rootDir, "tailwind.config.cjs"),
    path.join(rootDir, "postcss.config.cjs"),
    fileURLToPath(import.meta.url),
  ];
  const packageVersions = runtimePackages.reduce((result, packageName) => {
    result[packageName] = readPackageVersion(packageName);
    return result;
  }, {});

  hash.update("sy-form-runtime-v2-input");
  hash.update(runtimeEntryContent);
  hash.update(normalizeCssIsolation(cssIsolation));
  hash.update(JSON.stringify(packageVersions));
  configFiles.forEach((filePath) => {
    hash.update(filePath);
    hash.update(readTextIfExists(filePath));
  });
  return hash.digest("hex");
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

async function createReactPlugin() {
  const reactPluginModule = await import("@vitejs/plugin-react");
  return reactPluginModule.default();
}

function parseArgs(argv) {
  const result = {
    form: "",
    force: false,
    only: "",
    dryRun: false,
    cleanCache: false,
    runtimeCache: process.env.APP_RUNTIME_CACHE !== "false",
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }
    if (arg === "--form" && argv[i + 1]) {
      result.form = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--only" && argv[i + 1]) {
      result.only = argv[i + 1];
      i += 1;
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
build-forms - 构建表单页面

用法:
  tsx scripts/build-forms.mjs [options]

选项:
  --form <name>       只构建指定表单（src/forms/ 下的目录名）
  --only <list>       只构建指定模块，如 forms/customer,pages/dashboard
  --force             忽略增量缓存，强制重建表单产物
  --dry-run           只打印增量计划，不构建
  --clean-cache       删除 .openxiangda/build-cache.json
  --no-runtime-cache  强制重建共享 runtime
  --help, -h          显示帮助信息
`);
}

function discoverForms(filterName) {
  if (!fs.existsSync(formsDir)) {
    console.error(`错误: 找不到表单目录 ${formsDir}`);
    process.exit(1);
  }

  const entries = fs.readdirSync(formsDir, { withFileTypes: true });
  const formDirs = entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => (filterName ? entry.name === filterName : true))
    .filter((entry) => {
      const schemaPath = path.join(formsDir, entry.name, "schema.ts");
      return fs.existsSync(schemaPath);
    });

  return formDirs.map((entry) => ({
    name: entry.name,
    key: `forms/${entry.name}`,
    dirPath: path.join(formsDir, entry.name),
    entryPath: path.join(formsDir, entry.name, "page.tsx"),
    schemaPath: path.join(formsDir, entry.name, "schema.ts"),
    outDir: path.join(distDir, entry.name),
  }));
}

function createRuntimeEntryContent() {
  const workspaceStyleImport = createWorkspaceStyleImport(rootDir, tmpDir);
  return `import React from 'react';
import { createRoot } from 'react-dom/client';
import { StyleProvider } from '@ant-design/cssinjs';
import { App as AntdApp, ConfigProvider, message } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import * as SyFormComponentsModule from 'openxiangda';
import { antdTheme, legacyAntdTheme } from 'openxiangda/antd-theme';
import 'antd-mobile/es/global';
import '${workspaceStyleImport}';

const runtimeVersion = '${runtimeVersionPlaceholder}';
dayjs.locale('zh-cn');

const roots = new WeakMap();
const portalContainerCleanups = new WeakMap();
const { StandardFormPage, defineFormSchema } = SyFormComponentsModule;
const NAMESPACE_ROOT_CLASS = 'sy-app-workspace';
const RUNTIME_PORTAL_ATTR = 'data-sy-runtime-portal';
const PORTAL_CONTAINER_STACK_GLOBAL = '__OPENXIANGDA_PORTAL_CONTAINER_STACK__';
const PORTAL_CONTAINER_RESOLVER_GLOBAL = '${portalContainerResolverGlobal}';
const MESSAGE_PROXY_GLOBAL = '__OPENXIANGDA_ANTD_MESSAGE_PROXY__';
const MESSAGE_METHODS = ['open', 'success', 'info', 'warning', 'error', 'loading', 'destroy'];
const portalContainers = new WeakMap();
const portalCssIsolations = new WeakMap();

function normalizeRuntimeCssIsolation(value) {
  return value === 'namespace' || value === 'shadow' ? value : 'none';
}

function getRuntimeCssIsolation(context = {}) {
  return normalizeRuntimeCssIsolation(
    context.cssIsolation ||
      context.runtime?.cssIsolation ||
      context.page?.capabilities?.cssIsolation,
  );
}

function usesLegacyCssIsolation(cssIsolation) {
  return cssIsolation === 'namespace' || cssIsolation === 'shadow';
}

function getAntdRuntimeOptions(cssIsolation) {
  const legacy = usesLegacyCssIsolation(cssIsolation);
  return {
    prefixCls: legacy ? 'sy-ant' : 'ant',
    iconPrefixCls: legacy ? 'sy-anticon' : 'anticon',
    messagePrefixCls: legacy ? 'sy-ant-message' : 'ant-message',
    theme: legacy ? legacyAntdTheme : antdTheme,
  };
}

function getStyleContainer(el) {
  const rootNode = el.getRootNode?.();
  return typeof ShadowRoot !== 'undefined' && rootNode instanceof ShadowRoot
    ? rootNode
    : document.head;
}

function isShadowRoot(rootNode) {
  return typeof ShadowRoot !== 'undefined' && rootNode instanceof ShadowRoot;
}

function getRuntimeRoot(el, triggerNode) {
  if (isShadowRoot(el.getRootNode?.())) return el;
  const triggerRoot = triggerNode?.closest?.('.' + NAMESPACE_ROOT_CLASS);
  return (
    triggerRoot ||
    el.closest?.('.' + NAMESPACE_ROOT_CLASS) ||
    el.querySelector?.('.' + NAMESPACE_ROOT_CLASS) ||
    el
  );
}

function getOverlayRoot(el, portalContainer, triggerNode) {
  return portalContainer?.isConnected ? portalContainer : getRuntimeRoot(el, triggerNode);
}

function getPopupContainer(el, portalContainer) {
  return (triggerNode) => getOverlayRoot(el, portalContainer, triggerNode);
}

function getTargetContainer(el) {
  return () => getRuntimeRoot(el);
}

function createAntdConfig(el, portalContainer, cssIsolation) {
  const antdOptions = getAntdRuntimeOptions(cssIsolation);
  return {
    locale: zhCN,
    prefixCls: antdOptions.prefixCls,
    iconPrefixCls: antdOptions.iconPrefixCls,
    theme: antdOptions.theme,
    ...(usesLegacyCssIsolation(cssIsolation)
      ? {
          getPopupContainer: getPopupContainer(el, portalContainer),
          getTargetContainer: getTargetContainer(el),
        }
      : {}),
  };
}

function createPortalContainer(el) {
  const rootNode = el.getRootNode?.();
  const parent = isShadowRoot(rootNode) ? rootNode : el.ownerDocument.body;
  const portalContainer = el.ownerDocument.createElement('div');
  portalContainer.setAttribute(RUNTIME_PORTAL_ATTR, '');
  portalContainer.classList.add(NAMESPACE_ROOT_CLASS);
  parent.appendChild(portalContainer);
  return portalContainer;
}

function getAntdMessageProxyState() {
  if (!globalThis[MESSAGE_PROXY_GLOBAL]) {
    globalThis[MESSAGE_PROXY_GLOBAL] = {
      apiStack: [],
      installed: false,
      originalMethods: {},
    };
  }
  return globalThis[MESSAGE_PROXY_GLOBAL];
}

function installAntdMessageProxy() {
  const state = getAntdMessageProxyState();
  if (state.installed) return state;
  MESSAGE_METHODS.forEach((method) => {
    const originalMethod = message[method];
    if (typeof originalMethod !== 'function') return;
    state.originalMethods[method] = originalMethod.bind(message);
    message[method] = (...args) => {
      const api = state.apiStack[state.apiStack.length - 1];
      const apiMethod = api?.[method];
      if (typeof apiMethod === 'function') {
        return apiMethod(...args);
      }
      return state.originalMethods[method]?.(...args);
    };
  });
  state.installed = true;
  return state;
}

function registerAntdMessageApi(api) {
  const state = installAntdMessageProxy();
  state.apiStack.push(api);
  return () => {
    const position = state.apiStack.lastIndexOf(api);
    if (position >= 0) state.apiStack.splice(position, 1);
  };
}

function installRuntimePortalContainer(el, cssIsolation) {
  const portalContainer = usesLegacyCssIsolation(cssIsolation)
    ? createPortalContainer(el)
    : null;
  const stack = Array.isArray(globalThis[PORTAL_CONTAINER_STACK_GLOBAL])
    ? globalThis[PORTAL_CONTAINER_STACK_GLOBAL]
    : [];
  const stackTarget = portalContainer || el.ownerDocument.body;
  stack.push(stackTarget);
  globalThis[PORTAL_CONTAINER_STACK_GLOBAL] = stack;
  globalThis[PORTAL_CONTAINER_RESOLVER_GLOBAL] = () => {
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      const candidate = stack[index];
      if (candidate?.isConnected) {
        return candidate;
      }
    }
    return (
      document.querySelector('[' + RUNTIME_PORTAL_ATTR + ']') ||
      document.querySelector('.' + NAMESPACE_ROOT_CLASS) ||
      document.body
    );
  };
  return {
    container: portalContainer,
    release: () => {
      const position = stack.lastIndexOf(stackTarget);
      if (position >= 0) stack.splice(position, 1);
      portalContainer?.remove();
    },
  };
}

function installAntdStaticHolder(el, portalContainer, cssIsolation) {
  installAntdMessageProxy();
  const antdOptions = getAntdRuntimeOptions(cssIsolation);
  const getMessageContainer = () =>
    portalContainer?.isConnected
      ? portalContainer
      : usesLegacyCssIsolation(cssIsolation)
        ? getRuntimeRoot(el)
        : document.body;

  ConfigProvider.config({
    prefixCls: antdOptions.prefixCls,
    iconPrefixCls: antdOptions.iconPrefixCls,
    theme: antdOptions.theme,
    holderRender: (children) => {
      if (!el.isConnected) {
        return (
          <ConfigProvider locale={zhCN} prefixCls={antdOptions.prefixCls} iconPrefixCls={antdOptions.iconPrefixCls} theme={antdOptions.theme}>
            {children}
          </ConfigProvider>
        );
      }
      return (
        <StyleProvider hashPriority="high" container={getStyleContainer(el)}>
          <ConfigProvider {...createAntdConfig(el, portalContainer, cssIsolation)}>{children}</ConfigProvider>
        </StyleProvider>
      );
    },
  });
  message.config({
    prefixCls: antdOptions.messagePrefixCls,
    getContainer: getMessageContainer,
  });
}

function RuntimeMessageBridge({ children }) {
  const appContext = AntdApp.useApp();
  React.useLayoutEffect(() => {
    return registerAntdMessageApi(appContext.message);
  }, [appContext.message]);
  return <>{children}</>;
}

function renderStandardForm(el, schemaInput, context = {}) {
  let root = roots.get(el);
  const cssIsolation = getRuntimeCssIsolation(context);
  if (usesLegacyCssIsolation(cssIsolation)) {
    el.classList.add(NAMESPACE_ROOT_CLASS);
  } else {
    el.classList.remove(NAMESPACE_ROOT_CLASS);
  }
  let portalContainer = portalContainers.get(el);
  const previousCssIsolation = portalCssIsolations.get(el);
  if (
    previousCssIsolation !== cssIsolation ||
    (usesLegacyCssIsolation(cssIsolation) && !portalContainer?.isConnected) ||
    (!usesLegacyCssIsolation(cssIsolation) && portalContainer)
  ) {
    const cleanup = portalContainerCleanups.get(el);
    if (cleanup) cleanup();
    const portalHandle = installRuntimePortalContainer(el, cssIsolation);
    portalContainer = portalHandle.container;
    if (portalContainer) {
      portalContainers.set(el, portalContainer);
    } else {
      portalContainers.delete(el);
    }
    portalCssIsolations.set(el, cssIsolation);
    portalContainerCleanups.set(el, portalHandle.release);
  }
  installAntdStaticHolder(el, portalContainer, cssIsolation);
  if (!root) {
    root = createRoot(el);
    roots.set(el, root);
  }

  const schema = defineFormSchema(schemaInput);
  const antdConfig = createAntdConfig(el, portalContainer, cssIsolation);
  const content = (
    <StandardFormPage
      schema={schema}
      mode={context.mode || 'submit'}
      initialValues={context.initialValues}
      permissions={context.permissions}
      formUuid={context.formUuid}
      appType={context.appType}
      formInstanceId={context.formInstanceId}
      onSubmit={context.onSubmit}
      inDrawer={context.inDrawer}
    />
  );
  root.render(
    <StyleProvider hashPriority="high" container={getStyleContainer(el)}>
      <ConfigProvider {...antdConfig}>
        <AntdApp>
          <RuntimeMessageBridge>
            {usesLegacyCssIsolation(cssIsolation) ? (
              <div className="sy-app-workspace">{content}</div>
            ) : (
              content
            )}
          </RuntimeMessageBridge>
        </AntdApp>
      </ConfigProvider>
    </StyleProvider>
  );
}

function unmountStandardForm(el) {
  const root = roots.get(el);
  if (root) {
    root.unmount();
    roots.delete(el);
  }
  const releasePortalContainer = portalContainerCleanups.get(el);
  if (releasePortalContainer) {
    releasePortalContainer();
    portalContainerCleanups.delete(el);
    portalContainers.delete(el);
    portalCssIsolations.delete(el);
  }
}

export function createStandardFormModule(schemaInput) {
  let currentEl = null;
  return {
    mount(el, context = {}) {
      currentEl = el;
      renderStandardForm(el, schemaInput, context);
    },
    update(el, nextContext = {}) {
      const target = currentEl || el;
      if (target) {
        renderStandardForm(target, schemaInput, nextContext);
      }
    },
    unmount(el) {
      const target = el || currentEl;
      if (target) {
        unmountStandardForm(target);
      }
      currentEl = null;
    },
  };
}

export const formRuntime = {
  protocol: 'sy-form-runtime',
  majorVersion: 2,
  version: runtimeVersion,
  modules: {
    'openxiangda': SyFormComponentsModule,
  },
  createStandardFormModule,
};

globalThis.SY_FORM_RUNTIME_V2 = formRuntime;

export default formRuntime;
`;
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

function createFormRuntimeProxyPlugin() {
  return {
    name: "sy-form-runtime-proxy",
    enforce: "pre",
    resolveId(source) {
      if (source === "openxiangda")
        return "\0sy-form-runtime-proxy:openxiangda";
      return null;
    },
    load(id) {
      if (id !== "\0sy-form-runtime-proxy:openxiangda") return null;
      return `const runtime = globalThis.SY_FORM_RUNTIME_V2;
if (!runtime || runtime.protocol !== 'sy-form-runtime' || runtime.majorVersion !== 2) {
  throw new Error('表单共享运行时未加载或版本不兼容');
}
const moduleValue = runtime.modules['openxiangda'];
export const defineFormSchema = moduleValue.defineFormSchema;
export default moduleValue;
`;
    },
  };
}

function generateRuntimeEntryFile(entryContent) {
  const entryPath = path.join(tmpDir, "form-runtime-entry.jsx");
  fs.writeFileSync(entryPath, entryContent, "utf-8");
  return entryPath;
}

function generateSharedEntryFile(formName) {
  const entryContent = `import schema from '../src/forms/${formName}/schema';

const runtime = globalThis.SY_FORM_RUNTIME_V2;

if (!runtime || runtime.protocol !== 'sy-form-runtime' || runtime.majorVersion !== 2) {
  throw new Error('表单共享运行时未加载或版本不兼容');
}

const page = runtime.createStandardFormModule(schema);

export const mount = page.mount;
export const update = page.update;
export const unmount = page.unmount;

export default page;
`;

  const entryPath = path.join(tmpDir, `${formName}-shared-entry.js`);
  fs.writeFileSync(entryPath, entryContent, "utf-8");
  return entryPath;
}

function readRuntimeManifest() {
  const manifestPath = path.join(runtimeDistDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  } catch {
    return null;
  }
}

function readRuntimeBuildCache() {
  const cachePath = path.join(runtimeDistDir, runtimeCacheFileName);
  if (!fs.existsSync(cachePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(cachePath, "utf-8"));
  } catch {
    return null;
  }
}

function isRuntimeCacheValid(inputHash) {
  const manifest = readRuntimeManifest();
  const cache = readRuntimeBuildCache();
  if (
    !manifest ||
    manifest.protocol !== "sy-form-runtime" ||
    manifest.majorVersion !== 2 ||
    !manifest.version ||
    !manifest.files?.entry ||
    !cache ||
    cache.inputHash !== inputHash ||
    cache.runtimeVersion !== manifest.version
  ) {
    return false;
  }

  const runtimeJsPath = path.join(runtimeDistDir, manifest.files.entry);
  if (!fs.existsSync(runtimeJsPath)) return false;
  const runtimeCode = fs.readFileSync(runtimeJsPath, "utf-8");
  if (/\bjsxDEV\b|react\/jsx-dev-runtime/.test(runtimeCode)) return false;
  if (
    manifest.files.css &&
    !fs.existsSync(path.join(runtimeDistDir, manifest.files.css))
  ) {
    return false;
  }
  try {
    validateRuntimeCssFile(
      path.join(runtimeDistDir, manifest.files.css || "style.css"),
      {
        label: "表单共享 runtime",
      },
    );
  } catch {
    return false;
  }
  return true;
}

function logRuntimeAssetSummary(prefix = "共享 runtime") {
  const manifest = readRuntimeManifest();
  if (!manifest) return;
  const runtimeJsPath = path.join(
    runtimeDistDir,
    manifest.files?.entry || "runtime.js",
  );
  const runtimeCssPath = path.join(
    runtimeDistDir,
    manifest.files?.css || "style.css",
  );
  console.log(`[build] ${prefix} version: ${manifest.version}`);
  console.log(
    `[build] runtime.js: ${fileSizeLabel(runtimeJsPath)} / gzip ${fileGzipSizeLabel(runtimeJsPath)}`,
  );
  console.log(
    `[build] style.css: ${fileSizeLabel(runtimeCssPath)} / gzip ${fileGzipSizeLabel(runtimeCssPath)}`,
  );
}

async function buildSharedRuntime(options = {}) {
  const startedAt = Date.now();
  const entryContent = createRuntimeEntryContent();
  const config = await getWorkspaceConfig();
  const cssIsolation = normalizeCssIsolation(config.defaults?.cssIsolation);
  const inputHash = createRuntimeInputHash(entryContent, cssIsolation);
  if (options.runtimeCache !== false && isRuntimeCacheValid(inputHash)) {
    console.log("[build] 表单共享 runtime 缓存命中，跳过构建");
    logRuntimeAssetSummary("缓存 runtime");
    return;
  }

  const entryPath = generateRuntimeEntryFile(entryContent);

  try {
    console.log("[build] 构建表单共享 runtime");
    const cssOptions = await createCssOptions(cssIsolation);
    const reactPlugin = await createReactPlugin();
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
      resolve: {
        alias: [
          {
            find: "@",
            replacement: path.join(rootDir, "src"),
          },
        ],
      },
      build: {
        target: "es2018",
        assetsInlineLimit: 0,
        outDir: runtimeDistDir,
        emptyOutDir: true,
        cssCodeSplit: false,
        minify: true,
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
              return "[name][extname]";
            },
          },
        },
      },
      plugins: [createAntdMobilePortalPatchPlugin(), reactPlugin],
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
    validateRuntimeCssFile(runtimeCssPath, { label: "表单共享 runtime" });
    const runtimeOutputCode = fs.readFileSync(runtimeJsPath, "utf-8");
    if (/\bjsxDEV\b|react\/jsx-dev-runtime/.test(runtimeOutputCode)) {
      throw new Error(
        "表单共享 runtime 包含开发态 JSX runtime（jsxDEV/react/jsx-dev-runtime），请使用生产模式重新构建",
      );
    }
    const runtimeJs = fs.readFileSync(runtimeJsPath);
    const runtimeCss = fs.existsSync(runtimeCssPath)
      ? fs.readFileSync(runtimeCssPath)
      : Buffer.alloc(0);
    const hash = crypto
      .createHash("sha256")
      .update(runtimeJs)
      .update(runtimeCss)
      .digest("hex")
      .slice(0, 12);
    const runtimeVersion = `v2-${hash}`;
    fs.writeFileSync(
      runtimeJsPath,
      runtimeJs
        .toString("utf-8")
        .split(runtimeVersionPlaceholder)
        .join(runtimeVersion),
      "utf-8",
    );
    const manifest = {
      protocol: "sy-form-runtime",
      majorVersion: 2,
      version: runtimeVersion,
      inputHash,
      files: {
        entry: "runtime.js",
        css: fs.existsSync(runtimeCssPath) ? "style.css" : null,
      },
      sizes: {
        entry: fs.statSync(runtimeJsPath).size,
        entryGzip: gzipSync(fs.readFileSync(runtimeJsPath)).length,
        css: fs.existsSync(runtimeCssPath)
          ? fs.statSync(runtimeCssPath).size
          : 0,
        cssGzip: fs.existsSync(runtimeCssPath)
          ? gzipSync(fs.readFileSync(runtimeCssPath)).length
          : 0,
      },
      builtAt: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(runtimeDistDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8",
    );
    fs.writeFileSync(
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
      "utf-8",
    );

    console.log(
      `[build] 表单共享 runtime 构建完成，用时 ${formatDuration(startedAt)}`,
    );
    logRuntimeAssetSummary();
  } finally {
    if (fs.existsSync(entryPath)) {
      fs.unlinkSync(entryPath);
    }
  }
}

async function buildForm(form) {
  const startedAt = Date.now();
  const hasSchema = fs.existsSync(form.schemaPath);
  if (!hasSchema) {
    throw new Error(
      `表单 ${form.name} 缺少 schema.ts，无法使用共享 runtime 发布`,
    );
  }
  const entryPath = generateSharedEntryFile(form.name);

  try {
    console.log(`[build] 构建表单: ${form.name} (shared runtime)`);
    const config = await getWorkspaceConfig();
    const cssIsolation = normalizeCssIsolation(config.defaults?.cssIsolation);
    const cssOptions = await createCssOptions(cssIsolation);
    const reactPlugin = await createReactPlugin();
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
      resolve: {
        alias: [
          {
            find: "@",
            replacement: path.join(rootDir, "src"),
          },
        ],
      },
      build: {
        target: "es2018",
        assetsInlineLimit: 0,
        outDir: form.outDir,
        emptyOutDir: true,
        lib: {
          entry: entryPath,
          name: form.name,
          formats: ["es"],
          fileName: () => "index.js",
        },
        cssCodeSplit: false,
        minify: true,
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
      plugins: [
        createAntdMobilePortalPatchPlugin(),
        createFormRuntimeProxyPlugin(),
        reactPlugin,
      ].filter(Boolean),
      logLevel: "warn",
    });

    const entryOutput = path.join(form.outDir, "index.js");
    const cssOutput = path.join(form.outDir, "style.css");
    if (!fs.existsSync(cssOutput)) {
      fs.writeFileSync(cssOutput, "", "utf-8");
    }
    const extractedAssets = extractLargeDataUrlAssets({
      outDir: form.outDir,
      files: [entryOutput, cssOutput],
    });
    const extractedSummary = formatExtractedAssetSummary(extractedAssets);
    if (extractedSummary) console.log(`[build] ${extractedSummary}`);
    console.log(
      `[build] 输出: index.js ${fileSizeLabel(entryOutput)} / gzip ${fileGzipSizeLabel(entryOutput)}`,
    );
    console.log(
      `[build] 输出: style.css ${fileSizeLabel(cssOutput)} / gzip ${fileGzipSizeLabel(cssOutput)}`,
    );
    const outputCode = fs.readFileSync(entryOutput, "utf-8");
    const bareImportMatch = outputCode.match(
      /\bfrom\s*["'](?:react|react-dom|react\/jsx-runtime|antd|openxiangda|antd-mobile|@tiptap\/[^"']+)["']/,
    );
    if (bareImportMatch) {
      throw new Error(
        `构建产物仍包含浏览器无法直接加载的裸模块导入: ${bareImportMatch[0]}`,
      );
    }
    if (/(?:react-dom\/client|antd-mobile|@tiptap\/)/.test(outputCode)) {
      throw new Error(
        "shared 表单产物仍包含运行时依赖代码，请检查入口生成逻辑",
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
      `[build] 表单 ${form.name} 构建完成，用时 ${formatDuration(startedAt)}`,
    );
  } finally {
    if (fs.existsSync(entryPath)) {
      fs.unlinkSync(entryPath);
    }
  }
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

  const startedAt = Date.now();
  console.log("[build] 构建表单页面");
  console.log("[build] 构建模式: shared runtime");
  const onlyTargets = normalizeOnly(args.only);
  const only = onlyTargets.filter((item) => item.startsWith("forms/"));
  if (onlyTargets.length > 0 && only.length === 0) {
    console.log("[build] forms: No form targets selected");
    return;
  }
  const requested = args.form ? [`forms/${args.form}`] : only;
  const forms = discoverForms("");

  if (forms.length === 0) {
    if (args.form) {
      console.error(`错误: 找不到表单 "${args.form}"`);
    } else {
      console.error("错误: 未发现任何表单页面文件");
    }
    process.exit(1);
  }
  const formKeys = new Set(forms.map((form) => form.key));
  const missing = requested.filter((key) => !formKeys.has(key));
  if (missing.length > 0) {
    console.error(
      `错误: 找不到表单 ${missing.map((key) => `"${key.slice("forms/".length)}"`).join(", ")}`,
    );
    process.exit(1);
  }

  const plan = planIncrementalBuild(forms, {
    force: args.force,
    only: requested.length ? requested : undefined,
  });
  printPlan(plan, "forms");
  if (args.dryRun) return;
  if (plan.changed.length === 0) return;
  warnShadcnTailwindTokens(rootDir);

  if (plan.fullRebuild && requested.length === 0 && fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }

  fs.mkdirSync(distDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  await buildSharedRuntime({ runtimeCache: args.runtimeCache });
  console.log("");

  let succeeded = 0;
  let failed = 0;

  const built = [];
  for (const form of plan.changed) {
    try {
      await buildForm(form);
      succeeded += 1;
      built.push(form);
    } catch (error) {
      console.error(
        `[build] ${form.name} 构建失败: ${error.stack || error.message}`,
      );
      failed += 1;
    }
    console.log("");
  }

  try {
    const remaining = fs.readdirSync(tmpDir);
    if (remaining.length === 0) {
      fs.rmdirSync(tmpDir);
    }
  } catch {
    // ignore
  }

  console.log(
    `[build] 完成: ${succeeded} 成功, ${failed} 失败, 总耗时 ${formatDuration(
      startedAt,
    )}`,
  );

  if (failed > 0) {
    process.exit(1);
  }
  commitIncrementalBuild(plan, built);
}

await main();
