import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  ensureWorkspaceTailwindConfig,
  validateWorkspaceTailwindConfig,
} from "../scripts/utils/tailwind-config.mjs";

const require = createRequire(import.meta.url);
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const managedScriptDir = join(packageRoot, "scripts");
const managedCommands = new Map([
  ["build", "build-workspace.mjs"],
  ["build-forms", "build-forms.mjs"],
  ["build-pages", "build-pages.mjs"],
  ["sync-schema", "sync-schema.mjs"],
  ["publish-oss", "publish-oss.mjs"],
  ["register", "register.mjs"],
  ["publish-all", "publish-all.mjs"],
]);
const wrapperScripts = new Map([
  ["build-workspace.mjs", "build"],
  ["build-forms.mjs", "build-forms"],
  ["build-pages.mjs", "build-pages"],
  ["sync-schema.mjs", "sync-schema"],
  ["publish-oss.mjs", "publish-oss"],
  ["register.mjs", "register"],
  ["publish-all.mjs", "publish-all"],
]);
const textExtensions = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".css",
  ".scss",
  ".yml",
  ".yaml",
]);
const ignoredDirs = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".vite",
  "packages",
]);
const runtimePackages = ["openxiangda"];
const runtimePackageRegistry =
  process.env.APP_WORKSPACE_NPM_REGISTRY || "https://registry.npmjs.org/";
const legacyTemplateTiptapOverrideVersion = "3.23.6";
const legacyTemplateTiptapOverrideKeys = new Set([
  "@tiptap/core",
  "@tiptap/pm",
  "@tiptap/react",
  "@tiptap/starter-kit",
  "@tiptap/extensions",
  "@tiptap/extension-list",
  "@tiptap/extension-blockquote",
  "@tiptap/extension-bold",
  "@tiptap/extension-bubble-menu",
  "@tiptap/extension-bullet-list",
  "@tiptap/extension-character-count",
  "@tiptap/extension-code",
  "@tiptap/extension-document",
  "@tiptap/extension-floating-menu",
  "@tiptap/extension-hard-break",
  "@tiptap/extension-heading",
  "@tiptap/extension-horizontal-rule",
  "@tiptap/extension-italic",
  "@tiptap/extension-list-item",
  "@tiptap/extension-list-keymap",
  "@tiptap/extension-ordered-list",
  "@tiptap/extension-paragraph",
  "@tiptap/extension-placeholder",
  "@tiptap/extension-strike",
  "@tiptap/extension-text",
]);

function usage() {
  return `
lowcode-workspace <command> [options]

Commands:
  build | build-forms | build-pages | sync-schema | publish-oss | register | publish-all
  update   Update workspace runtime dependencies and managed wrappers
  migrate  Convert old local SDK workspace to npm package mode
  smoke    Run workspace runtime smoke checks

Update options:
  --workspace <path>       Workspace root, defaults to cwd
  --channel <tag>          npm dist-tag, defaults to latest
  --check                  Validate only; do not mutate
  --strict-lock            Compare lockfile and installed versions with npm latest
  --commit                 Commit update changes
  --push                   Push after commit
  --no-commit              Do not commit, even if changes exist
  --allow-dirty            Allow updates with existing worktree changes
  --skip-install           Do not run pnpm install/update
  --skip-gate              Do not run typecheck smoke gate
  --gate <quick|full>      Gate depth after update, defaults to quick

Smoke options:
  --workspace <path>       Workspace root, defaults to cwd
  --mode <quick|full>      quick validates commands/manifests; full builds shared runtimes
`;
}

function parseArgs(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      result._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (["workspace", "channel", "mode", "gate"].includes(key)) {
      result[key] = argv[index + 1];
      index += 1;
    } else {
      result[key] = true;
    }
  }
  return result;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    stdio: options.capture ? "pipe" : "inherit",
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(
      `command failed: ${[command, ...args].join(" ")}${output ? `\n${output}` : ""}`,
    );
  }
  return result;
}

function runManagedScript(command, args, workspaceRoot) {
  const scriptName = managedCommands.get(command);
  if (!scriptName) throw new Error(`unknown managed command: ${command}`);
  const scriptPath = join(managedScriptDir, scriptName);
  const tsxCli = require.resolve("tsx/cli");
  run(process.execPath, [tsxCli, scriptPath, ...args], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      LOWCODE_WORKSPACE_ROOT: workspaceRoot,
    },
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function getLegacyTemplateTiptapOverrideKeys(overrides = {}) {
  const tiptapKeys = Object.keys(overrides).filter((key) =>
    key.startsWith("@tiptap/"),
  );
  if (tiptapKeys.length === 0) return [];
  const isLegacyTemplateSet = tiptapKeys.every(
    (key) =>
      legacyTemplateTiptapOverrideKeys.has(key) &&
      overrides[key] === legacyTemplateTiptapOverrideVersion,
  );
  return isLegacyTemplateSet ? tiptapKeys : [];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readOptionalJson(path) {
  if (!existsSync(path)) return null;
  try {
    return readJson(path);
  } catch {
    return null;
  }
}

function npmLatestVersion(packageName, channel) {
  const result = run(
    "npm",
    [
      "view",
      `${packageName}@${channel}`,
      "version",
      "--registry",
      runtimePackageRegistry,
    ],
    {
      capture: true,
      env: runtimeDependencyInstallEnv(),
    },
  );
  return String(result.stdout || "").trim();
}

function runtimeDependencyInstallEnv() {
  return {
    ...process.env,
    npm_config_registry: runtimePackageRegistry,
    PNPM_CONFIG_MINIMUM_RELEASE_AGE: "0",
  };
}

function readInstalledVersion(workspaceRoot, packageName) {
  const packagePath = join(
    workspaceRoot,
    "node_modules",
    packageName,
    "package.json",
  );
  const pkg = readOptionalJson(packagePath);
  return typeof pkg?.version === "string" ? pkg.version : null;
}

function readLockVersion(workspaceRoot, packageName) {
  const lockPath = join(workspaceRoot, "pnpm-lock.yaml");
  if (!existsSync(lockPath)) return null;
  const content = readFileSync(lockPath, "utf-8");
  const packagePattern = new RegExp(
    `(?:^|\\n)\\s{2,}/?${escapeRegExp(packageName)}@([^:\\n(]+)(?:\\([^\\n]*\\))?:`,
  );
  const packageMatch = content.match(packagePattern);
  if (packageMatch?.[1]) return packageMatch[1].trim();

  const dependencyPattern = new RegExp(
    `(?:^|\\n)\\s{6}${escapeRegExp(packageName)}:\\n\\s{8}specifier:\\s*[^\\n]+\\n\\s{8}version:\\s*([^\\s(]+)`,
  );
  const dependencyMatch = content.match(dependencyPattern);
  return dependencyMatch?.[1]?.trim() || null;
}

function validateRuntimeManifest(
  workspaceRoot,
  manifestPath,
  expectedProtocol,
  expectedMajorVersion,
) {
  if (!existsSync(manifestPath)) return;
  const manifest = readJson(manifestPath);
  const errors = [];
  if (manifest.protocol !== expectedProtocol) {
    errors.push(`protocol must be ${expectedProtocol}`);
  }
  if (manifest.majorVersion !== expectedMajorVersion) {
    errors.push(`majorVersion must be ${expectedMajorVersion}`);
  }
  if (!manifest.version) errors.push("version is required");
  if (!manifest.files?.entry) errors.push("files.entry is required");
  if (errors.length) {
    throw new Error(
      `${manifestPath.replace(`${workspaceRoot}/`, "")} is invalid: ${errors.join("; ")}`,
    );
  }
}

function gitStatus(workspaceRoot) {
  const result = run("git", ["status", "--porcelain"], {
    cwd: workspaceRoot,
    capture: true,
  });
  return String(result.stdout || "").trim();
}

function hasGit(workspaceRoot) {
  return (
    existsSync(join(workspaceRoot, ".git")) ||
    existsSync(join(workspaceRoot, "..", ".git"))
  );
}

function updatePackageJson(workspaceRoot, channel) {
  const packagePath = join(workspaceRoot, "package.json");
  if (!existsSync(packagePath))
    throw new Error(`package.json not found: ${packagePath}`);
  const pkg = readJson(packagePath);
  pkg.scripts = {
    ...(pkg.scripts || {}),
    build: "lowcode-workspace build",
    "build:forms": "lowcode-workspace build-forms",
    "build:pages": "lowcode-workspace build-pages",
    "sync-schema": "lowcode-workspace sync-schema",
    "publish:oss": "lowcode-workspace publish-oss",
    register: "lowcode-workspace register",
    "register-bundle": "lowcode-workspace register",
    "publish:all": "lowcode-workspace publish-all",
    "ai:update": `pnpm dlx openxiangda@${channel} lowcode-workspace update --channel ${channel}`,
    "ai:migrate": `pnpm dlx openxiangda@${channel} lowcode-workspace migrate`,
  };
  pkg.dependencies = pkg.dependencies || {};
  delete pkg.dependencies["@sy/page-sdk"];
  delete pkg.dependencies["sy-form-components"];
  delete pkg.dependencies["sy-page-sdk"];
  delete pkg.dependencies["sy-lowcode-workspace-tools"];
  pkg.dependencies["openxiangda"] = channel;
  if (pkg.pnpm?.patchedDependencies) {
    for (const packageName of [
      "@sy/page-sdk",
      "sy-form-components",
      "sy-page-sdk",
      "sy-lowcode-workspace-tools",
    ]) {
      for (const key of Object.keys(pkg.pnpm.patchedDependencies)) {
        if (key === packageName || key.startsWith(`${packageName}@`)) {
          delete pkg.pnpm.patchedDependencies[key];
        }
      }
    }
    if (Object.keys(pkg.pnpm.patchedDependencies).length === 0) {
      delete pkg.pnpm.patchedDependencies;
    }
  }
  if (pkg.pnpm?.overrides) {
    for (const key of getLegacyTemplateTiptapOverrideKeys(pkg.pnpm.overrides)) {
      delete pkg.pnpm.overrides[key];
    }
    if (Object.keys(pkg.pnpm.overrides).length === 0) {
      delete pkg.pnpm.overrides;
    }
  }
  if (pkg.pnpm && Object.keys(pkg.pnpm).length === 0) {
    delete pkg.pnpm;
  }
  writeJson(packagePath, pkg);
}

function wrapperContent(command) {
  return `#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const result = spawnSync("lowcode-workspace", [${JSON.stringify(command)}, ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
`;
}

function ensureWrapperScripts(workspaceRoot) {
  const scriptsDir = join(workspaceRoot, "scripts");
  mkdirSync(scriptsDir, { recursive: true });
  for (const [fileName, command] of wrapperScripts) {
    writeFileSync(join(scriptsDir, fileName), wrapperContent(command), "utf-8");
  }
}

function replaceInFile(path, replacer) {
  const before = readFileSync(path, "utf-8");
  const after = replacer(before);
  if (after !== before) writeFileSync(path, after, "utf-8");
}

function rewriteImports(workspaceRoot) {
  walkFiles(workspaceRoot, (filePath) => {
    if (
      ["pnpm-lock.yaml", "package-lock.json", "yarn.lock"].includes(
        basename(filePath),
      )
    ) {
      return;
    }
    if (!textExtensions.has(filePath.slice(filePath.lastIndexOf(".")))) return;
    replaceInFile(filePath, (content) =>
      content
        .replaceAll("@sy/page-sdk", "openxiangda/runtime")
        .replaceAll("sy-page-sdk/react", "openxiangda/runtime")
        .replaceAll("sy-page-sdk", "openxiangda/runtime")
        .replaceAll("sy-form-components/tailwind-preset", "openxiangda/tailwind-preset")
        .replaceAll("sy-form-components", "openxiangda")
        .replaceAll("sy-lowcode-workspace-tools", "openxiangda"),
    );
  });
}

function rewriteLocalSdkConfig(workspaceRoot) {
  const viteConfig = join(workspaceRoot, "vite.config.ts");
  if (existsSync(viteConfig)) {
    replaceInFile(viteConfig, (content) =>
      content
        .replace(/\s*\{[^{}]*packages\/page-sdk[^{}]*\},?/g, "")
        .replace(
          /\s*\{\s*find:\s*["']sy-page-sdk\/react["'][\s\S]*?\n\s*\},\n/g,
          "",
        )
        .replace(/\s*\{\s*find:\s*["']sy-page-sdk["'][\s\S]*?\n\s*\},\n/g, ""),
    );
  }
  const vitestConfig = join(workspaceRoot, "vitest.config.ts");
  if (existsSync(vitestConfig)) {
    replaceInFile(vitestConfig, (content) =>
      content
        .replace(/\s*\{[^{}]*packages\/page-sdk[^{}]*\},?/g, "")
        .replace(
          /\s*\{\s*find:\s*["']sy-page-sdk\/react["'][\s\S]*?\n\s*\},\n/g,
          "",
        )
        .replace(/\s*\{\s*find:\s*["']sy-page-sdk["'][\s\S]*?\n\s*\},\n/g, "")
        .replace(/,\s*["']sy-page-sdk["']/g, ""),
    );
  }
  const tsconfig = join(workspaceRoot, "tsconfig.app.json");
  if (existsSync(tsconfig)) {
    try {
      const config = readJson(tsconfig);
      if (config.compilerOptions?.paths) {
        delete config.compilerOptions.paths["sy-page-sdk"];
        delete config.compilerOptions.paths["sy-page-sdk/react"];
      }
      if (Array.isArray(config.include)) {
        config.include = config.include.filter(
          (item) => !String(item).includes("packages/page-sdk"),
        );
      }
      writeJson(tsconfig, config);
    } catch {
      replaceInFile(tsconfig, (content) =>
        content
          .replace(/\s*["']sy-page-sdk["']:\s*\[[^\n]*\],?\n/g, "")
          .replace(/\s*["']sy-page-sdk\/react["']:\s*\[[^\n]*\],?\n/g, "")
          .replace(/,\s*["']packages\/page-sdk\/src["']/g, "")
          .replace(/["']packages\/page-sdk\/src["'],?\s*/g, ""),
      );
    }
  }
  const tailwindConfig = join(workspaceRoot, "tailwind.config.cjs");
  if (existsSync(tailwindConfig)) {
    replaceInFile(tailwindConfig, (content) =>
      content
        .replace(/,\s*["'][^"']*packages\/page-sdk[^"']*["']/g, "")
        .replace(/["'][^"']*packages\/page-sdk[^"']*["']\s*,?/g, ""),
    );
  }
}

function rewriteCssIsolationDefault(workspaceRoot) {
  const configPath = join(workspaceRoot, "app-workspace.config.ts");
  if (!existsSync(configPath)) return;
  replaceInFile(configPath, (content) =>
    content.replace(
      /cssIsolation:\s*\n\s*process\.env\.APP_PAGE_CSS_ISOLATION === ["']none["']\s*\n\s*\?\s*["']none["']\s*\n\s*:\s*process\.env\.APP_PAGE_CSS_ISOLATION === ["']shadow["']\s*\n\s*\?\s*["']shadow["']\s*\n\s*:\s*["']namespace["']/g,
      `cssIsolation:
      process.env.APP_PAGE_CSS_ISOLATION === "namespace"
        ? "namespace"
        : process.env.APP_PAGE_CSS_ISOLATION === "shadow"
          ? "shadow"
          : "none"`,
    ),
  );
}

function walkFiles(root, onFile) {
  for (const entry of readdirSync(root)) {
    if (ignoredDirs.has(entry)) continue;
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walkFiles(path, onFile);
    } else if (stat.isFile()) {
      onFile(path);
    }
  }
}

function removeLocalSdk(workspaceRoot) {
  const localSdkPath = join(workspaceRoot, "packages", "page-sdk");
  if (existsSync(localSdkPath)) {
    rmSync(localSdkPath, { recursive: true, force: true });
  }
}

function validateWorkspace(workspaceRoot, channel = "latest", options = {}) {
  const errors = [];
  const warnings = [];
  const pkg = readJson(join(workspaceRoot, "package.json"));
  const deps = pkg.dependencies || {};
  if (deps["@sy/page-sdk"])
    errors.push("package.json still depends on @sy/page-sdk");
  for (const oldName of [
    "sy-form-components",
    "sy-page-sdk",
    "sy-lowcode-workspace-tools",
  ]) {
    if (deps[oldName]) errors.push(`package.json still depends on ${oldName}`);
  }
  for (const name of runtimePackages) {
    if (deps[name] !== channel)
      errors.push(`package.json dependency ${name} must be ${channel}`);
  }
  const isWorkspaceToolsSourceRepo = existsSync(
    join(workspaceRoot, "packages", "workspace-tools", "package.json"),
  );
  if (
    existsSync(join(workspaceRoot, "packages", "page-sdk")) &&
    !isWorkspaceToolsSourceRepo
  ) {
    errors.push(
      "local packages/page-sdk must be removed from application workspaces",
    );
  }
  errors.push(...validateWorkspaceTailwindConfig(workspaceRoot));
  walkFiles(workspaceRoot, (filePath) => {
    if (!textExtensions.has(filePath.slice(filePath.lastIndexOf(".")))) return;
    if (
      ["pnpm-lock.yaml", "package-lock.json", "yarn.lock"].includes(
        basename(filePath),
      )
    ) {
      return;
    }
    const content = readFileSync(filePath, "utf-8");
    for (const oldName of [
      "@sy/page-sdk",
      "sy-form-components",
      "sy-page-sdk",
      "sy-lowcode-workspace-tools",
    ]) {
      if (content.includes(oldName)) {
        errors.push(`${filePath} still references ${oldName}`);
      }
    }
    if (content.includes("packages/page-sdk")) {
      errors.push(`${filePath} still references packages/page-sdk`);
    }
  });
  if (errors.length) {
    throw new Error(`workspace update check failed:\n- ${errors.join("\n- ")}`);
  }
  if (options.strictLock) {
    const versionRows = [];
    for (const packageName of runtimePackages) {
      const latest = npmLatestVersion(packageName, channel);
      const installed = readInstalledVersion(workspaceRoot, packageName);
      const locked = readLockVersion(workspaceRoot, packageName);
      versionRows.push({ packageName, latest, installed, locked });
      if (latest && locked && locked !== latest) {
        errors.push(
          `pnpm-lock.yaml locks ${packageName}@${locked}, latest is ${latest}`,
        );
      }
      if (latest && installed && installed !== latest) {
        errors.push(
          `node_modules has ${packageName}@${installed}, latest is ${latest}`,
        );
      }
      if (!locked) {
        warnings.push(
          `pnpm-lock.yaml does not contain ${packageName}; run pnpm install after update`,
        );
      }
      if (!installed) {
        warnings.push(
          `node_modules does not contain ${packageName}; run pnpm install`,
        );
      }
    }
    if (versionRows.length) {
      console.log("[lowcode-workspace] runtime dependency versions:");
      for (const row of versionRows) {
        console.log(
          `  - ${row.packageName}: latest=${row.latest || "unknown"} locked=${row.locked || "missing"} installed=${row.installed || "missing"}`,
        );
      }
    }
  }
  if (errors.length) {
    throw new Error(`workspace update check failed:\n- ${errors.join("\n- ")}`);
  }
  for (const warning of warnings) {
    console.warn(`[lowcode-workspace] warning: ${warning}`);
  }
}

function runUpdateInstall(workspaceRoot, channel) {
  const installEnv = runtimeDependencyInstallEnv();
  run("pnpm", ["install"], { cwd: workspaceRoot, env: installEnv });
  run(
    "pnpm",
    [
      "update",
      "--latest",
      "openxiangda",
    ],
    { cwd: workspaceRoot, env: installEnv },
  );
  updatePackageJson(workspaceRoot, channel);
  run("pnpm", ["install"], { cwd: workspaceRoot, env: installEnv });
}

function runSmoke(workspaceRoot, mode = "quick") {
  const normalizedMode = String(mode || "quick").trim();
  if (!["quick", "full"].includes(normalizedMode)) {
    throw new Error(`unsupported smoke mode: ${mode}`);
  }
  const pkg = readJson(join(workspaceRoot, "package.json"));
  if (pkg.scripts?.typecheck) {
    run("pnpm", ["typecheck"], { cwd: workspaceRoot });
  }
  if (normalizedMode === "full") {
    runManagedScript("build-pages", [], workspaceRoot);
    runManagedScript("build-forms", [], workspaceRoot);
  } else {
    runManagedScript("build-pages", ["--help"], workspaceRoot);
    runManagedScript("build-forms", ["--help"], workspaceRoot);
  }
  validateRuntimeManifest(
    workspaceRoot,
    join(workspaceRoot, "dist", "page-runtime", "manifest.json"),
    "sy-page-runtime",
    1,
  );
  validateRuntimeManifest(
    workspaceRoot,
    join(workspaceRoot, "dist", "form-runtime", "manifest.json"),
    "sy-form-runtime",
    2,
  );
}

function commitAndMaybePush(workspaceRoot, push) {
  if (!hasGit(workspaceRoot)) return;
  run("git", ["add", "-A"], { cwd: workspaceRoot });
  const status = gitStatus(workspaceRoot);
  if (!status) return;
  run(
    "git",
    ["commit", "-m", "chore: update lowcode workspace runtime dependencies"],
    {
      cwd: workspaceRoot,
    },
  );
  if (push) {
    run("git", ["push", "origin", "HEAD"], { cwd: workspaceRoot });
  }
}

async function updateWorkspace(argv, { migrate = false } = {}) {
  const args = parseArgs(argv);
  const workspaceRoot = resolve(args.workspace || process.cwd());
  const channel = String(
    args.channel || process.env.APP_WORKSPACE_UPDATE_CHANNEL || "latest",
  );
  const checkOnly = Boolean(args.check);
  const strictLock = Boolean(args["strict-lock"]);
  const allowDirty = Boolean(args["allow-dirty"]);
  const shouldCommit = Boolean(args.commit) && !args["no-commit"];
  const shouldPush = Boolean(args.push);
  const gateMode = String(args.gate || "quick");

  if (checkOnly) {
    validateWorkspace(workspaceRoot, channel, { strictLock });
    console.log("[lowcode-workspace] update check passed");
    return;
  }

  if (hasGit(workspaceRoot) && !allowDirty) {
    const before = gitStatus(workspaceRoot);
    if (before) {
      throw new Error(
        "workspace has uncommitted changes; commit/stash them first or pass --allow-dirty",
      );
    }
  }

  updatePackageJson(workspaceRoot, channel);
  rewriteImports(workspaceRoot);
  rewriteCssIsolationDefault(workspaceRoot);
  ensureWorkspaceTailwindConfig(workspaceRoot);
  ensureWrapperScripts(workspaceRoot);
  rewriteLocalSdkConfig(workspaceRoot);
  if (migrate || existsSync(join(workspaceRoot, "packages", "page-sdk"))) {
    removeLocalSdk(workspaceRoot);
  }

  if (!args["skip-install"]) runUpdateInstall(workspaceRoot, channel);
  validateWorkspace(workspaceRoot, channel, { strictLock: !args["skip-install"] });
  if (!args["skip-gate"]) runSmoke(workspaceRoot, gateMode);
  if (shouldCommit) commitAndMaybePush(workspaceRoot, shouldPush);
  console.log("[lowcode-workspace] workspace update completed");
}

export async function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") {
    console.log(usage());
    return;
  }
  if (command === "update") {
    await updateWorkspace(rest);
    return;
  }
  if (command === "migrate") {
    await updateWorkspace(rest, { migrate: true });
    return;
  }
  if (command === "smoke") {
    const args = parseArgs(rest);
    runSmoke(resolve(args.workspace || process.cwd()), args.mode || "quick");
    console.log("[lowcode-workspace] smoke check passed");
    return;
  }
  if (managedCommands.has(command)) {
    const args = parseArgs(rest);
    runManagedScript(command, rest, resolve(args.workspace || process.cwd()));
    return;
  }
  throw new Error(`unknown command: ${command}`);
}
