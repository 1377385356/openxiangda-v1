import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { rootDir } from "./load-config.mjs";
import { WORKSPACE_STYLE_ENTRY_CANDIDATES } from "./workspace-style-entry.mjs";

const CACHE_VERSION = 1;
export const CACHE_FILE = path.join(rootDir, ".openxiangda", "build-cache.json");
export const PUBLISH_CACHE_FILE = path.join(
  rootDir,
  ".openxiangda",
  "publish-cache.json",
);

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function hashContent(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function readFileHash(filePath) {
  try {
    return hashContent(fs.readFileSync(filePath));
  } catch {
    return "missing";
  }
}

function walkFiles(dirPath, files = []) {
  if (!fs.existsSync(dirPath)) return files;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const nextPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "dist", ".openxiangda", ".git", ".tmp"].includes(entry.name)) {
        continue;
      }
      walkFiles(nextPath, files);
      continue;
    }
    if (entry.isFile()) files.push(nextPath);
  }
  return files;
}

export function computeDirectoryHash(dirPath) {
  const files = walkFiles(dirPath).sort((left, right) =>
    toPosix(path.relative(rootDir, left)).localeCompare(toPosix(path.relative(rootDir, right))),
  );
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    const rel = toPosix(path.relative(rootDir, file));
    hash.update(rel);
    hash.update("\0");
    hash.update(readFileHash(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function computeLockfileHash() {
  const hash = crypto.createHash("sha256");
  for (const name of ["pnpm-lock.yaml", "package-lock.json", "yarn.lock"]) {
    const filePath = path.join(rootDir, name);
    hash.update(name);
    hash.update("\0");
    hash.update(readFileHash(filePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function computeSharedHash() {
  const sharedDir = path.join(rootDir, "src", "shared");
  return fs.existsSync(sharedDir) ? computeDirectoryHash(sharedDir) : "no-shared";
}

export function computeConfigHash() {
  const hash = crypto.createHash("sha256");
  for (const name of [
    "package.json",
    "app-workspace.config.ts",
    "tailwind.config.cjs",
    "postcss.config.cjs",
    "vite.config.ts",
    "tsconfig.json",
    ...WORKSPACE_STYLE_ENTRY_CANDIDATES,
  ]) {
    hash.update(name);
    hash.update("\0");
    hash.update(readFileHash(path.join(rootDir, name)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function loadCache(cacheFile) {
  try {
    const cache = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
    return cache.version === CACHE_VERSION ? cache : null;
  } catch {
    return null;
  }
}

export function loadBuildCache() {
  return loadCache(CACHE_FILE);
}

export function loadPublishCache() {
  return loadCache(PUBLISH_CACHE_FILE);
}

export function cleanBuildCache() {
  fs.rmSync(CACHE_FILE, { force: true });
}

export function normalizeOnly(value) {
  if (!value) return [];
  const raw = Array.isArray(value) ? value.join(",") : String(value);
  return raw
    .split(",")
    .map((item) => item.trim().replace(/^src\//, ""))
    .filter(Boolean);
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: rootDir,
    encoding: "utf-8",
  });
  if (result.error || result.status !== 0) {
    return {
      ok: false,
      error: result.error?.message || result.stderr || result.stdout || "git command failed",
      stdout: "",
    };
  }
  return {
    ok: true,
    error: "",
    stdout: result.stdout || "",
  };
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function parseGitNameOnly(stdout) {
  return String(stdout || "")
    .split(/\r?\n/)
    .map((item) => item.trim().replace(/\\/g, "/"))
    .filter(Boolean);
}

function workspaceTargetForFile(filePath) {
  const matched = filePath.match(/^src\/(forms|pages)\/([^/]+)\//);
  if (!matched) return null;
  return `${matched[1]}/${matched[2]}`;
}

function isGlobalWorkspaceFile(filePath) {
  return (
    filePath === "package.json" ||
    filePath === "pnpm-lock.yaml" ||
    filePath === "package-lock.json" ||
    filePath === "yarn.lock" ||
    filePath === "app-workspace.config.ts" ||
    filePath === "tailwind.config.cjs" ||
    filePath === "postcss.config.cjs" ||
    filePath === "vite.config.ts" ||
    filePath === "tsconfig.json" ||
    WORKSPACE_STYLE_ENTRY_CANDIDATES.includes(filePath) ||
    filePath.startsWith("src/shared/")
  );
}

export function resolveGitChangedWorkspaceTargets(options = {}) {
  const since = options.since || "HEAD";
  const insideWorkTree = runGit(["rev-parse", "--is-inside-work-tree"]);
  if (!insideWorkTree.ok || insideWorkTree.stdout.trim() !== "true") {
    return {
      available: false,
      error: insideWorkTree.error || "not a git worktree",
      files: [],
      only: [],
      resourceFiles: [],
      globalFiles: [],
    };
  }

  const changed = runGit(["diff", "--name-only", "--relative", since, "--"]);
  if (!changed.ok) {
    return {
      available: false,
      error: changed.error,
      files: [],
      only: [],
      resourceFiles: [],
      globalFiles: [],
    };
  }

  const untracked = runGit(["ls-files", "--others", "--exclude-standard"]);
  const files = uniqueSorted([
    ...parseGitNameOnly(changed.stdout),
    ...(untracked.ok ? parseGitNameOnly(untracked.stdout) : []),
  ]);

  return {
    available: true,
    error: "",
    files,
    only: uniqueSorted(files.map(workspaceTargetForFile).filter(Boolean)),
    resourceFiles: files.filter((item) => item.startsWith("src/resources/")),
    globalFiles: files.filter(isGlobalWorkspaceFile),
  };
}

function createIncrementalPlan(modules, options = {}, cache = null) {
  const only = normalizeOnly(options.only);
  const selected = only.length
    ? modules.filter((item) => only.includes(item.key))
    : modules;
  const moduleHashes = Object.fromEntries(
    modules.map((item) => [item.key, computeDirectoryHash(item.dirPath)]),
  );
  const snapshot = {
    lockfileHash: computeLockfileHash(),
    sharedHash: computeSharedHash(),
    configHash: computeConfigHash(),
    moduleHashes,
  };
  const fullRebuild =
    Boolean(options.force) ||
    !cache ||
    cache.lockfileHash !== snapshot.lockfileHash ||
    cache.sharedHash !== snapshot.sharedHash ||
    cache.configHash !== snapshot.configHash;
  const changed = selected.filter(
    (item) => fullRebuild || cache?.entries?.[item.key]?.contentHash !== moduleHashes[item.key],
  );

  return {
    all: modules,
    selected,
    changed,
    fullRebuild,
    snapshot,
  };
}

export function planIncrementalBuild(modules, options = {}) {
  return createIncrementalPlan(modules, options, loadBuildCache());
}

export function planIncrementalPublish(modules, options = {}) {
  return createIncrementalPlan(modules, options, loadPublishCache());
}

export function discoverWorkspaceModules() {
  const modules = [];
  for (const [kind, requiredFile] of [
    ["forms", "schema.ts"],
    ["pages", "page.config.ts"],
  ]) {
    const baseDir = path.join(rootDir, "src", kind);
    if (!fs.existsSync(baseDir)) continue;
    for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dirPath = path.join(baseDir, entry.name);
      if (!fs.existsSync(path.join(dirPath, requiredFile))) continue;
      modules.push({
        key: `${kind}/${entry.name}`,
        kind,
        name: entry.name,
        dirPath,
      });
    }
  }
  return modules.sort((left, right) => left.key.localeCompare(right.key));
}

function commitIncrementalCache(cacheFile, previous, plan, modules) {
  const entries = { ...(previous?.entries || {}) };
  const now = new Date().toISOString();
  const isPartialBuild = plan.selected.length !== plan.all.length;
  const preserveGlobalSnapshot = Boolean(
    previous && isPartialBuild && plan.fullRebuild,
  );
  for (const item of modules) {
    entries[item.key] = {
      contentHash: plan.snapshot.moduleHashes[item.key],
      lastBuildTime: now,
      success: true,
    };
  }
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(
    cacheFile,
    `${JSON.stringify(
      {
        version: CACHE_VERSION,
        lockfileHash: preserveGlobalSnapshot
          ? previous.lockfileHash
          : plan.snapshot.lockfileHash,
        sharedHash: preserveGlobalSnapshot
          ? previous.sharedHash
          : plan.snapshot.sharedHash,
        configHash: preserveGlobalSnapshot
          ? previous.configHash
          : plan.snapshot.configHash,
        entries,
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
}

export function commitIncrementalBuild(plan, builtModules) {
  commitIncrementalCache(CACHE_FILE, loadBuildCache(), plan, builtModules);
}

export function commitIncrementalPublish(plan, publishedModules) {
  commitIncrementalCache(
    PUBLISH_CACHE_FILE,
    loadPublishCache(),
    plan,
    publishedModules,
  );
}

export function printPlan(plan, label) {
  if (plan.changed.length === 0) {
    console.log(`[build] ${label}: No changes detected`);
    return;
  }
  const mode = plan.fullRebuild ? "full rebuild" : "incremental";
  console.log(
    `[build] ${label}: Building ${plan.changed.length}/${plan.all.length} module(s) (${mode})`,
  );
  for (const item of plan.changed) console.log(`  - ${item.key}`);
}
