import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { rootDir as workspaceRoot } from "./load-config.mjs";

export const rootDir = workspaceRoot;
export const srcRoot = path.join(rootDir, "src");
export const formsRoot = path.join(srcRoot, "forms");
export const pagesRoot = path.join(srcRoot, "pages");
export const distRoot = path.join(rootDir, "dist");

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveExistingModulePath(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    `${basePath}.mjs`,
    `${basePath}.cjs`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
    path.join(basePath, "index.js"),
    path.join(basePath, "index.jsx"),
    path.join(basePath, "index.mjs"),
    path.join(basePath, "index.cjs"),
  ];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }
  throw new Error(`无法解析工作区别名导入: @/${path.relative(srcRoot, basePath)}`);
}

async function rewriteWorkspaceAliasImports(source) {
  const importSpecifierPattern =
    /(\bfrom\s*["']|^\s*import\s*["']|import\s*\(\s*["'])(@\/[^"']+)(["'])/gm;
  const replacements = [];
  let match;
  while ((match = importSpecifierPattern.exec(source))) {
    const [, prefix, specifier, suffix] = match;
    const targetPath = await resolveExistingModulePath(
      path.join(srcRoot, specifier.slice(2)),
    );
    replacements.push({
      start: match.index,
      end: match.index + match[0].length,
      value: `${prefix}${pathToFileURL(targetPath).href}${suffix}`,
    });
  }

  if (replacements.length === 0) return source;

  let cursor = 0;
  let next = "";
  for (const replacement of replacements) {
    next += source.slice(cursor, replacement.start);
    next += replacement.value;
    cursor = replacement.end;
  }
  next += source.slice(cursor);
  return next;
}

async function loadTypeScriptModule(filePath) {
  const source = await fs.readFile(filePath, "utf8");
  const rewritten = await rewriteWorkspaceAliasImports(source);
  let importPath = filePath;
  if (rewritten !== source) {
    importPath = path.join(
      path.dirname(filePath),
      `.page.config.openxiangda-loader-${process.pid}-${Date.now()}.ts`,
    );
    await fs.writeFile(importPath, rewritten, "utf8");
  }

  try {
    const loaded = await import(`${pathToFileURL(importPath).href}?t=${Date.now()}`);
    return loaded.default || loaded;
  } finally {
    if (importPath !== filePath) {
      await fs.rm(importPath, { force: true });
    }
  }
}

export async function discoverPages(filterName = "") {
  if (!(await fileExists(pagesRoot))) {
    return [];
  }

  const entries = await fs.readdir(pagesRoot, { withFileTypes: true });
  const pages = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (filterName && entry.name !== filterName) continue;

    const dirPath = path.join(pagesRoot, entry.name);
    const entryPath = path.join(dirPath, "index.tsx");
    const appPath = path.join(dirPath, "App.tsx");
    const configPath = path.join(dirPath, "page.config.ts");
    const required = [entryPath, appPath, configPath];
    const exists = await Promise.all(required.map(fileExists));
    if (exists.every((item) => !item)) continue;
    for (let index = 0; index < required.length; index += 1) {
      if (!exists[index]) {
        throw new Error(`页面 ${entry.name} 缺少文件: ${path.basename(required[index])}`);
      }
    }

    const config = await loadTypeScriptModule(configPath);
    if (config.publish === false) continue;
    pages.push({
      dirName: entry.name,
      dirPath,
      entryPath,
      appPath,
      configPath,
      config,
    });
  }

  return pages.sort((left, right) =>
    String(left.config.name || left.dirName).localeCompare(
      String(right.config.name || right.dirName),
      "zh-Hans-CN",
    ),
  );
}

export async function readPackageJson() {
  return JSON.parse(await fs.readFile(path.join(rootDir, "package.json"), "utf8"));
}

export async function getReactVersion() {
  const packageJson = await readPackageJson();
  return String(packageJson.dependencies?.react || "")
    .replace(/^[~^]/, "")
    .trim();
}
