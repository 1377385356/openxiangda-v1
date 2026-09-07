import fs from "node:fs";
import path from "node:path";

const sourceExtensions = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".html",
]);

const ignoredDirs = new Set([
  ".git",
  ".openxiangda",
  ".tmp",
  "dist",
  "node_modules",
]);

const shadcnTokenClassNames = [
  "bg-background",
  "text-foreground",
  "bg-card",
  "text-card",
  "text-card-foreground",
  "bg-popover",
  "text-popover",
  "text-popover-foreground",
  "bg-muted",
  "text-muted",
  "text-muted-foreground",
  "bg-accent",
  "text-accent",
  "text-accent-foreground",
  "bg-destructive",
  "text-destructive",
  "text-destructive-foreground",
  "border-input",
  "border-ring",
  "ring-ring",
  "placeholder:text-muted-foreground",
];

const shadcnTokenCssVariablePattern =
  /--(?:background|foreground|card|card-foreground|popover|popover-foreground|muted|muted-foreground|accent|accent-foreground|destructive|destructive-foreground|input|ring)\b/;
const shadcnTokenTailwindConfigPatterns = [
  /["']?(?:background|foreground|card|popover|muted|accent|destructive|input|ring)["']?\s*:/,
  /["']?(?:card-foreground|popover-foreground|muted-foreground|accent-foreground|destructive-foreground)["']?\s*:/,
];

function readTextIfExists(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf-8");
}

function isShadcnTokenThemeConfigured(workspaceRoot) {
  const tailwindConfig = readTextIfExists(
    path.join(workspaceRoot, "tailwind.config.cjs"),
  );
  const indexCss = readTextIfExists(path.join(workspaceRoot, "src", "index.css"));
  return (
    shadcnTokenCssVariablePattern.test(indexCss) ||
    shadcnTokenTailwindConfigPatterns.some((pattern) =>
      pattern.test(tailwindConfig),
    )
  );
}

function walkSourceFiles(dirPath, result = []) {
  if (!fs.existsSync(dirPath)) return result;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkSourceFiles(entryPath, result);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!sourceExtensions.has(path.extname(entry.name))) continue;
    result.push(entryPath);
  }
  return result;
}

function hasClassToken(content, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(?:^|[^A-Za-z0-9_:/-])(?:!?[-A-Za-z0-9_\\[\\]=()./#&]+:)*${escaped}(?:/[0-9]+)?(?=$|[^A-Za-z0-9_:/-])`,
  );
  return pattern.test(content);
}

export function getShadcnTailwindTokenWarnings(workspaceRoot) {
  if (isShadcnTokenThemeConfigured(workspaceRoot)) {
    return {
      configured: true,
      files: [],
      tokens: [],
    };
  }

  const files = [];
  const tokenSet = new Set();
  for (const filePath of walkSourceFiles(path.join(workspaceRoot, "src"))) {
    const content = fs.readFileSync(filePath, "utf-8");
    const tokens = shadcnTokenClassNames.filter((className) =>
      hasClassToken(content, className),
    );
    if (tokens.length === 0) continue;
    tokens.forEach((token) => tokenSet.add(token));
    files.push({
      path: path.relative(workspaceRoot, filePath).split(path.sep).join("/"),
      tokens,
    });
  }

  return {
    configured: false,
    files,
    tokens: Array.from(tokenSet).sort(),
  };
}

export function warnShadcnTailwindTokens(workspaceRoot, options = {}) {
  const logger = options.logger ?? console;
  const warning = getShadcnTailwindTokenWarnings(workspaceRoot);
  if (warning.configured || warning.files.length === 0) return warning;

  const fileLines = warning.files
    .slice(0, 8)
    .map((item) => `  - ${item.path}: ${item.tokens.join(", ")}`)
    .join("\n");
  const more =
    warning.files.length > 8
      ? `\n  ... and ${warning.files.length - 8} more file(s)`
      : "";

  logger.warn(
    `[style warning] 检测到 shadcn 风格 Tailwind token 类，但当前项目未配置这些 token：\n${fileLines}${more}\n` +
      "这些不是 Tailwind 原生类，OpenXiangda 业务页面也不再强制使用平台 token。请改成原生 Tailwind 类（例如 bg-white border border-slate-200 text-slate-600）、Tailwind 任意值（例如 bg-[#1677ff]），或在 tailwind.config.cjs 中显式配置这些 token。",
  );
  return warning;
}
