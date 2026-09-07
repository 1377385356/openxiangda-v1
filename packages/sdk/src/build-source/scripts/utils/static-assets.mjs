import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const defaultInlineLimit = 4096;

const mimeExtensions = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/gif", ".gif"],
  ["image/svg+xml", ".svg"],
  ["image/webp", ".webp"],
  ["image/avif", ".avif"],
  ["image/x-icon", ".ico"],
  ["font/woff", ".woff"],
  ["font/woff2", ".woff2"],
  ["font/ttf", ".ttf"],
  ["application/vnd.ms-fontobject", ".eot"],
  ["application/octet-stream", ".bin"],
]);

function readInlineLimit() {
  const raw =
    process.env.LOWCODE_WORKSPACE_ASSETS_INLINE_LIMIT ||
    process.env.LOWCODE_ASSETS_INLINE_LIMIT ||
    "";
  if (!raw) return defaultInlineLimit;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return defaultInlineLimit;
  return parsed;
}

function parseDataUrl(value) {
  if (!value.startsWith("data:")) return null;
  const commaIndex = value.indexOf(",");
  if (commaIndex < 0) return null;
  const meta = value.slice(5, commaIndex);
  const body = value.slice(commaIndex + 1);
  const parts = meta.split(";").filter(Boolean);
  const mime = (parts[0] || "application/octet-stream").toLowerCase();
  if (!parts.slice(1).some((part) => part.toLowerCase() === "base64")) {
    return null;
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(body)) return null;
  return { mime, buffer: Buffer.from(body, "base64") };
}

function resolveAssetFile(parsed, assetCache, assetsDir) {
  const hash = crypto.createHash("sha256").update(parsed.buffer).digest("hex").slice(0, 16);
  const ext = mimeExtensions.get(parsed.mime) || ".bin";
  const cacheKey = `${parsed.mime}:${hash}`;
  const cached = assetCache.get(cacheKey);
  if (cached) return cached;

  const fileName = `asset-${hash}${ext}`;
  const filePath = path.join(assetsDir, fileName);
  fs.mkdirSync(assetsDir, { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, parsed.buffer);
  }
  const asset = {
    fileName,
    filePath,
    mime: parsed.mime,
    size: parsed.buffer.length,
  };
  assetCache.set(cacheKey, asset);
  return asset;
}

function createExtractor({ inlineLimit, assetsDir, assetCache, emittedAssets }) {
  return function extract(dataUrl) {
    const parsed = parseDataUrl(dataUrl);
    if (!parsed || parsed.buffer.length <= inlineLimit) return null;
    const asset = resolveAssetFile(parsed, assetCache, assetsDir);
    emittedAssets.set(asset.fileName, asset);
    return asset;
  };
}

function rewriteCss(content, extractAsset) {
  let changed = false;
  const code = content.replace(
    /url\(\s*(["']?)(data:[^"'\\)]*?;base64,[A-Za-z0-9+/=]+)\1\s*\)/g,
    (full, _quote, dataUrl) => {
      const asset = extractAsset(dataUrl);
      if (!asset) return full;
      changed = true;
      return `url("assets/${asset.fileName}")`;
    },
  );
  return { changed, code };
}

function rewriteJs(content, extractAsset) {
  let changed = false;
  const code = content.replace(
    /(["'])(data:[^"'\\]*?;base64,[A-Za-z0-9+/=]+)\1/g,
    (full, _quote, dataUrl) => {
      const asset = extractAsset(dataUrl);
      if (!asset) return full;
      changed = true;
      return `new URL("assets/${asset.fileName}", import.meta.url).href`;
    },
  );
  return { changed, code };
}

function rewriteFile(filePath, extractAsset) {
  if (!fs.existsSync(filePath)) return { changed: false };
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".css" && ext !== ".js" && ext !== ".mjs") {
    return { changed: false };
  }
  const content = fs.readFileSync(filePath, "utf-8");
  const result = ext === ".css" ? rewriteCss(content, extractAsset) : rewriteJs(content, extractAsset);
  if (result.changed) {
    fs.writeFileSync(filePath, result.code, "utf-8");
  }
  return { changed: result.changed };
}

export function extractLargeDataUrlAssets(options) {
  const outDir = options?.outDir;
  const files = (options?.files || []).filter(Boolean);
  if (!outDir || files.length === 0) {
    return { extracted: [], changedFiles: [] };
  }

  const inlineLimit =
    typeof options.inlineLimit === "number" ? options.inlineLimit : readInlineLimit();
  const assetsDir = path.join(outDir, options.assetsDir || "assets");
  const assetCache = new Map();
  const emittedAssets = new Map();
  const extractAsset = createExtractor({
    inlineLimit,
    assetsDir,
    assetCache,
    emittedAssets,
  });
  const changedFiles = [];

  for (const file of files) {
    const result = rewriteFile(file, extractAsset);
    if (result.changed) changedFiles.push(file);
  }

  return {
    changedFiles,
    extracted: Array.from(emittedAssets.values()),
    inlineLimit,
  };
}

export function formatExtractedAssetSummary(result) {
  const count = result?.extracted?.length || 0;
  if (!count) return "";
  const total = result.extracted.reduce((sum, asset) => sum + asset.size, 0);
  const formatBytes = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };
  return `抽离静态资源 ${count} 个，${formatBytes(total)}，阈值 ${formatBytes(result.inlineLimit)}`;
}
