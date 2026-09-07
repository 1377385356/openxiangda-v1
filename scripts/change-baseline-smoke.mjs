import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const {
  buildGitBaseSourceArtifacts,
  canonicalJsonSha256,
  clearChangeBaseline,
  getStoredChangeBaseline,
  isChangeBaselineOwnedByCurrentSession,
  readGitSourceBase,
  saveChangeBaseline,
  withGitBaseWorkspace,
} = require(path.join(repoRoot, "lib", "change-baseline.js"));

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openxiangda-change-baseline-smoke-"));

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.error?.message || ""}\n${result.stdout || ""}\n${result.stderr || ""}`,
    );
  }
  return String(result.stdout || "").trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function bundleContent(sourceKind, code, source) {
  return `bundle:${sourceKind}:${code}\n${source}`;
}

function makeTarget(cwd) {
  const bound = {
    appType: "APP_BASELINE_TEST",
    baseUrl: "https://example.invalid/service",
    resources: {},
  };
  const state = {
    version: 1,
    profiles: { dev: bound },
  };
  return {
    cwd,
    state,
    bound,
    profileName: "dev",
    appType: "APP_BASELINE_TEST",
  };
}

function makeManagedTarget(cwd) {
  const profile = {
    appType: "APP_PREPRODUCTION",
    baseUrl: "https://example.invalid/service",
    resources: { sentinel: { id: "profile-must-remain-unchanged" } },
  };
  const bound = {
    targetName: "production",
    profile: "shared-login",
    environmentId: "environment-production",
    appType: "APP_PRODUCTION",
    resources: {},
  };
  const state = {
    version: 1,
    profiles: { "shared-login": profile },
    targets: { production: bound },
  };
  return {
    cwd,
    state,
    bound,
    targetName: "production",
    environmentId: "environment-production",
    profileName: "shared-login",
    appType: "APP_PRODUCTION",
  };
}

try {
  const ownerEnv = { ...process.env, CODEX_THREAD_ID: "thread-baseline-a" };
  const foreignEnv = { ...process.env, CODEX_THREAD_ID: "thread-baseline-b" };
  const stateRoot = path.join(tempRoot, "state-workspace");
  fs.mkdirSync(stateRoot, { recursive: true });
  const target = makeTarget(stateRoot);
  const originalFields = {
    resourceHeads: {
      "Function:hello": { revision: "rev-1", sourceHash: "source-1" },
    },
    sourceBase: {
      repo: `sha256:${"a".repeat(64)}`,
      baseCommit: "b".repeat(40),
      treeHash: "c".repeat(40),
    },
    clientSessionId: "codex:thread-baseline-a",
    localBaseArtifactHashes: {
      "Function:hello": "d".repeat(64),
    },
  };
  const stored = saveChangeBaseline(
    target,
    {
      baselineId: "baseline-1",
      changeId: "change-1",
      ...originalFields,
    },
    { cwd: stateRoot, env: ownerEnv, now: "2026-07-15T01:02:03.000Z" },
  );
  assert.equal(stored.appType, "APP_BASELINE_TEST");
  assert.equal(stored.profile, "dev");
  assert.equal(stored.workspace.threadId, "thread-baseline-a");
  assert.ok(isChangeBaselineOwnedByCurrentSession(stored, ownerEnv));
  assert.equal(isChangeBaselineOwnedByCurrentSession(stored, foreignEnv), false);
  assert.deepEqual(getStoredChangeBaseline(target, { env: ownerEnv }), stored);

  const updated = saveChangeBaseline(
    target,
    { baselineId: "baseline-1", remoteRevision: "rev-2" },
    { cwd: stateRoot, env: ownerEnv, now: "2026-07-15T01:03:04.000Z" },
  );
  for (const [field, value] of Object.entries(originalFields)) {
    assert.deepEqual(updated[field], value, `${field} must survive partial baseline saves`);
  }
  const persisted = JSON.parse(
    fs.readFileSync(path.join(stateRoot, ".openxiangda", "state.json"), "utf8"),
  );
  assert.deepEqual(
    persisted.profiles.dev.promotion.changeBaseline.localBaseArtifactHashes,
    originalFields.localBaseArtifactHashes,
  );

  assert.throws(
    () => getStoredChangeBaseline(target, { env: foreignEnv }),
    error => error?.code === "CHANGE_BASELINE_OWNED_BY_ANOTHER_TASK",
  );
  assert.throws(
    () =>
      saveChangeBaseline(target, { baselineId: "stolen" }, { cwd: stateRoot, env: foreignEnv }),
    error => error?.code === "CHANGE_BASELINE_OWNED_BY_ANOTHER_TASK",
  );
  assert.throws(
    () => clearChangeBaseline(target, { cwd: stateRoot, env: foreignEnv }),
    error => error?.code === "CHANGE_BASELINE_OWNED_BY_ANOTHER_TASK",
  );
  assert.throws(
    () =>
      saveChangeBaseline(
        target,
        { appType: "APP_OTHER" },
        { cwd: stateRoot, env: ownerEnv },
      ),
    error => error?.code === "CHANGE_BASELINE_APP_MISMATCH",
  );
  assert.throws(
    () =>
      saveChangeBaseline(
        target,
        { profile: "prod" },
        { cwd: stateRoot, env: ownerEnv },
      ),
    error => error?.code === "CHANGE_BASELINE_PROFILE_MISMATCH",
  );
  assert.equal(
    clearChangeBaseline(target, "wrong-baseline", { cwd: stateRoot, env: ownerEnv }),
    false,
  );
  assert.equal(
    clearChangeBaseline(target, "baseline-1", { cwd: stateRoot, env: ownerEnv }),
    true,
  );
  assert.equal(getStoredChangeBaseline(target, { env: ownerEnv }), null);

  const managedStateRoot = path.join(tempRoot, "managed-state-workspace");
  fs.mkdirSync(managedStateRoot, { recursive: true });
  const managedTarget = makeManagedTarget(managedStateRoot);
  const originalManagedProfile = structuredClone(
    managedTarget.state.profiles["shared-login"],
  );
  saveChangeBaseline(
    managedTarget,
    {
      baselineId: "managed-baseline-1",
      changeId: "managed-change-1",
    },
    {
      cwd: managedStateRoot,
      env: ownerEnv,
      now: "2026-07-15T02:03:04.000Z",
    },
  );
  assert.deepEqual(
    managedTarget.state.profiles["shared-login"],
    originalManagedProfile,
    "managed baseline save must not overwrite the shared login profile",
  );
  assert.equal(
    managedTarget.state.targets.production.promotion.changeBaseline.baselineId,
    "managed-baseline-1",
  );
  let persistedManagedState = JSON.parse(
    fs.readFileSync(
      path.join(managedStateRoot, ".openxiangda", "state.json"),
      "utf8",
    ),
  );
  assert.deepEqual(
    persistedManagedState.profiles["shared-login"],
    originalManagedProfile,
  );
  assert.equal(
    clearChangeBaseline(managedTarget, "managed-baseline-1", {
      cwd: managedStateRoot,
      env: ownerEnv,
    }),
    true,
  );
  persistedManagedState = JSON.parse(
    fs.readFileSync(
      path.join(managedStateRoot, ".openxiangda", "state.json"),
      "utf8",
    ),
  );
  assert.deepEqual(
    persistedManagedState.profiles["shared-login"],
    originalManagedProfile,
    "managed baseline clear must not overwrite the shared login profile",
  );
  assert.equal(
    persistedManagedState.targets.production.promotion?.changeBaseline,
    undefined,
  );

  const canonicalInput = {
    z: 9,
    a: { y: 2, b: 1 },
    list: [{ z: true, a: false }, 3],
  };
  const sameCanonicalInput = {
    list: [{ a: false, z: true }, 3],
    a: { b: 1, y: 2 },
    z: 9,
  };
  const canonicalText = JSON.stringify({
    a: { b: 1, y: 2 },
    list: [{ a: false, z: true }, 3],
    z: 9,
  });
  assert.equal(canonicalJsonSha256(canonicalInput), sha256(canonicalText));
  assert.equal(canonicalJsonSha256(canonicalInput), canonicalJsonSha256(sameCanonicalInput));
  assert.notEqual(
    canonicalJsonSha256({ list: [1, 2] }),
    canonicalJsonSha256({ list: [2, 1] }),
    "array order must remain significant",
  );

  const gitRoot = path.join(tempRoot, "git-workspace");
  fs.mkdirSync(gitRoot, { recursive: true });
  fs.mkdirSync(path.join(gitRoot, "node_modules"), { recursive: true });
  const functionBaseSource = 'export default () => "base-function";\n';
  const automationBaseSource = 'export default () => "base-automation";\n';
  write(
    gitRoot,
    "package.json",
    `${JSON.stringify(
      {
        name: "change-baseline-fixture",
        private: true,
        scripts: { "build-js-code": "node scripts/build-js-code.cjs" },
      },
      null,
      2,
    )}\n`,
  );
  write(
    gitRoot,
    "scripts/build-js-code.cjs",
    `const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const read = name => {
  const index = args.indexOf(\`--\${name}\`);
  return index >= 0 ? args[index + 1] : "";
};
let specs = [];
if (args.includes("--scripts")) {
  if (process.env.FAKE_BATCH_FAIL === "1") process.exit(42);
  specs = read("scripts").split(",").filter(Boolean);
} else {
  specs = [\`\${read("source")}:\${read("script")}\`];
}
for (const spec of specs) {
  const [sourceKind, code] = spec.split(":");
  const source = fs.readFileSync(path.join("src", sourceKind, code, "index.ts"), "utf8");
  const output = path.join("dist", sourceKind, code, "index.cjs");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, \`bundle:\${sourceKind}:\${code}\\n\${source}\`, "utf8");
}
`,
  );
  write(gitRoot, "src/functions/hello/index.ts", functionBaseSource);
  write(gitRoot, "src/automations/tick/index.ts", automationBaseSource);

  run("git", ["init"], gitRoot);
  run("git", ["config", "user.email", "openxiangda@example.test"], gitRoot);
  run("git", ["config", "user.name", "OpenXiangda Smoke"], gitRoot);
  run(
    "git",
    [
      "config",
      "remote.origin.url",
      "https://secret-user:secret-pass@example.invalid/team/app.git?token=secret",
    ],
    gitRoot,
  );
  run("git", ["add", "."], gitRoot);
  run("git", ["commit", "-m", "base source"], gitRoot);

  const sourceBase = readGitSourceBase(gitRoot);
  assert.match(sourceBase.repo, /^sha256:[0-9a-f]{64}$/);
  assert.equal(sourceBase.repositoryId, sourceBase.repo);
  assert.equal(sourceBase.baseCommit, run("git", ["rev-parse", "HEAD"], gitRoot));
  assert.equal(sourceBase.treeHash, run("git", ["rev-parse", "HEAD^{tree}"], gitRoot));
  assert.doesNotMatch(JSON.stringify(sourceBase), /secret|git-workspace|example\.invalid/);

  run(
    "git",
    ["config", "remote.origin.url", "https://rotated@example.invalid/team/app.git"],
    gitRoot,
  );
  assert.equal(
    readGitSourceBase(gitRoot).repo,
    sourceBase.repo,
    "credentials must not affect the redacted repository identity",
  );

  write(
    gitRoot,
    "src/functions/hello/index.ts",
    'export default () => "DIRTY-FUNCTION";\n',
  );
  write(
    gitRoot,
    "src/automations/tick/index.ts",
    'export default () => "DIRTY-AUTOMATION";\n',
  );

  const exactTargets = [
    { kind: "Function", code: "hello" },
    { kind: "Automation", code: "tick", sourceKind: "automations" },
  ];
  withGitBaseWorkspace(
    {
      cwd: gitRoot,
      baseCommit: sourceBase.baseCommit,
      env: { ...process.env, CI: "false" },
    },
    ({ buildEnv }) => {
      assert.equal(
        buildEnv.CI,
        "true",
        "isolated Git-base builds must always be non-interactive",
      );
    },
  );
  const built = buildGitBaseSourceArtifacts({
    cwd: gitRoot,
    baseCommit: sourceBase.baseCommit,
    targets: exactTargets,
  });
  assert.equal(built.buildMode, "batch");
  assert.equal(built.baseCommit, sourceBase.baseCommit);
  assert.equal(
    built.artifacts["Function:hello"].artifactHash,
    sha256(bundleContent("functions", "hello", functionBaseSource)),
  );
  assert.equal(
    built.artifacts["Automation:tick"].artifactHash,
    sha256(bundleContent("automations", "tick", automationBaseSource)),
  );
  assert.notEqual(
    built.artifacts["Function:hello"].artifactHash,
    sha256(
      bundleContent(
        "functions",
        "hello",
        'export default () => "DIRTY-FUNCTION";\n',
      ),
    ),
    "artifact must come from baseCommit, never the dirty worktree",
  );
  assert.deepEqual(built.localBaseArtifactHashes, {
    "Function:hello": built.artifacts["Function:hello"].artifactHash,
    "Automation:tick": built.artifacts["Automation:tick"].artifactHash,
  });
  assert.equal(built.cacheHit, false);
  const cachedBuild = buildGitBaseSourceArtifacts({
    cwd: gitRoot,
    baseCommit: sourceBase.baseCommit,
    targets: exactTargets,
  });
  assert.equal(cachedBuild.cacheHit, true);
  assert.deepEqual(
    cachedBuild.localBaseArtifactHashes,
    built.localBaseArtifactHashes,
    "immutable Git base artifact hashes should be reused across plans",
  );

  const fallback = buildGitBaseSourceArtifacts({
    cwd: gitRoot,
    baseCommit: sourceBase.baseCommit,
    targets: exactTargets,
    env: { ...process.env, FAKE_BATCH_FAIL: "1" },
  });
  assert.equal(fallback.buildMode, "legacy-fallback");
  assert.deepEqual(fallback.localBaseArtifactHashes, built.localBaseArtifactHashes);

  const canonicalRoot = path.join(tempRoot, "canonical-workspace");
  fs.mkdirSync(path.join(canonicalRoot, "node_modules"), { recursive: true });
  write(
    canonicalRoot,
    "package.json",
    `${JSON.stringify(
      {
        name: "canonical-change-baseline-fixture",
        private: true,
        scripts: { "build-js-code": "node scripts/build-js-code.mjs" },
      },
      null,
      2,
    )}\n`,
  );
  write(
    canonicalRoot,
    "scripts/build-js-code.mjs",
    "// tsconfig.js-code-nodes.json sourceKinds buildScript resolveBuildSelection\n",
  );
  write(
    canonicalRoot,
    "tsconfig.js-code-nodes.json",
    `${JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: false,
        skipLibCheck: true,
        noEmit: true,
      },
      include: ["src/functions/**/*.ts"],
    })}\n`,
  );
  write(
    canonicalRoot,
    "src/functions/stable/index.ts",
    'export default async () => ({ ok: true });\n',
  );
  run("git", ["init"], canonicalRoot);
  run("git", ["config", "user.email", "openxiangda@example.test"], canonicalRoot);
  run("git", ["config", "user.name", "OpenXiangda Smoke"], canonicalRoot);
  run("git", ["add", "."], canonicalRoot);
  run("git", ["commit", "-m", "canonical base source"], canonicalRoot);
  const canonicalBase = readGitSourceBase(canonicalRoot);
  const canonical = buildGitBaseSourceArtifacts({
    cwd: canonicalRoot,
    baseCommit: canonicalBase.baseCommit,
    targets: [{ kind: "Function", code: "stable" }],
    packageManager: "this-command-must-never-run",
  });
  assert.equal(
    canonical.buildMode,
    "canonical-scoped",
    "standard workspaces must use the bundled scoped builder without pnpm",
  );
  assert.match(
    canonical.artifacts["Function:stable"].artifactHash,
    /^[a-f0-9]{64}$/,
  );
  assert.match(
    canonical.artifacts["Function:stable"].sourceHash,
    /^[a-f0-9]{64}$/,
    "canonical builds must expose toolchain-independent source lineage",
  );

  assert.throws(
    () =>
      buildGitBaseSourceArtifacts({ cwd: gitRoot, baseCommit: "HEAD", targets: exactTargets }),
    error => error?.code === "CHANGE_BASELINE_COMMIT_NOT_EXACT",
  );
  assert.throws(
    () =>
      buildGitBaseSourceArtifacts({
        cwd: gitRoot,
        baseCommit: sourceBase.baseCommit,
        targets: [{ kind: "Function", code: "../escape" }],
      }),
    error => error?.code === "CHANGE_BASELINE_TARGET_INVALID",
  );

  console.log("Change baseline state/Git artifact smoke passed");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
