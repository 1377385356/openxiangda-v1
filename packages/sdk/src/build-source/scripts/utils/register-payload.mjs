import fs from "node:fs";
import path from "node:path";
import {
  getPageAssetBaseUrl,
  getPageAssetUrl,
  getPageRuntimeUrl,
  rootDir,
} from "./load-config.mjs";

function readPageRuntimeManifest() {
  const manifestPath = path.resolve(rootDir, "dist/page-runtime/manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    if (
      manifest?.protocol !== "sy-page-runtime" ||
      manifest?.majorVersion !== 1 ||
      !manifest?.version ||
      !manifest?.files?.entry
    ) {
      return null;
    }
    return manifest;
  } catch {
    return null;
  }
}

export function buildPageMenuConfig(config, pageConfig) {
  if (pageConfig.menu?.enabled === false) {
    return { enabled: false };
  }

  return {
    enabled: true,
    name: pageConfig.menu?.name || pageConfig.name,
    parentId:
      pageConfig.menu && "parentId" in pageConfig.menu
        ? pageConfig.menu.parentId
        : config.defaults.pageMenuParentId || null,
    icon:
      pageConfig.menu && "icon" in pageConfig.menu
        ? pageConfig.menu.icon
        : config.defaults.pageMenuIcon || null,
  };
}

export function buildDirectPagePublishPayload(config, pages) {
  const pageRuntime = readPageRuntimeManifest();
  return {
    appType: config.appType,
    userId: config.userId,
    version: config.version,
    buildId: config.buildId,
    pages: pages.map((page) => {
      const pageBaseUrl = getPageAssetBaseUrl(config, page.config.code);
      const pageEntryUrl = getPageAssetUrl(config, page.config.code, "index.js");
      const pageStyleUrl = getPageAssetUrl(config, page.config.code, "style.css");
      const runtimeJsUrl = pageRuntime?.files?.entry
        ? getPageRuntimeUrl(config, pageRuntime.files.entry)
        : null;
      const runtimeCssUrl = pageRuntime?.files?.css
        ? getPageRuntimeUrl(config, pageRuntime.files.css)
        : null;
      return {
        code: page.config.code,
        name: page.config.name,
        description: page.config.description || "",
        entry: page.config.entry || {},
        route: page.config.route,
        props: page.config.props || {},
        dataSources: page.config.dataSources || [],
        runtime: {
          entryUrl: pageEntryUrl,
          cssUrls: [runtimeCssUrl, pageStyleUrl].filter(Boolean),
          jsUrls: runtimeJsUrl ? [runtimeJsUrl] : [pageEntryUrl],
          cdnBaseUrl: pageBaseUrl,
          framework: "react",
          frameworkVersion: config.defaults.frameworkVersion,
          protocolVersion: config.defaults.protocolVersion,
          protocol: pageRuntime?.protocol || undefined,
          version: config.version,
          cssIsolation:
            page.config.cssIsolation || config.defaults.cssIsolation,
        },
        menu: buildPageMenuConfig(config, page.config),
      };
    }),
  };
}
