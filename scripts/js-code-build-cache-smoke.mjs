import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const {
  buildJsCodeBatchArgs,
  resolveWorkspaceJsCodeBuildCommand,
  runWorkspaceJsCodeBuildBatch,
} = require(path.join(repoRoot, "lib", "js-code-build.js"));
assert.deepEqual(
  buildJsCodeBatchArgs([
    { sourceKind: "functions", scriptCode: "a" },
    { sourceKind: "functions", scriptCode: "a" },
    { sourceKind: "automations", scriptCode: "b" },
  ]),
  ["build-js-code", "--scripts", "functions:a,automations:b"],
);
const reactScript = path.join(
  repoRoot,
  "templates",
  "openxiangda-react-spa",
  "scripts",
  "build-js-code.mjs",
);
const classicScript = path.join(
  repoRoot,
  "templates",
  "sy-lowcode-app-workspace",
  "scripts",
  "build-js-code.mjs",
);
assert.equal(
  fs.readFileSync(reactScript, "utf8"),
  fs.readFileSync(classicScript, "utf8"),
  "the two workspace templates must keep the same JS_CODE builder",
);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openxiangda-js-code-cache-"));
const write = (relative, content) => {
  const file = path.join(tempRoot, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
};

function runResult(args) {
  return spawnSync(process.execPath, ["scripts/build-js-code.mjs", ...args], {
    cwd: tempRoot,
    encoding: "utf8",
    env: process.env,
  });
}

function run(args) {
  const result = runResult(args);
  if (result.status !== 0) {
    throw new Error(`build failed (${args.join(" ")}):\n${result.stdout}\n${result.stderr}`);
  }
  return `${result.stdout}\n${result.stderr}`;
}

try {
  fs.mkdirSync(path.join(tempRoot, "scripts"), { recursive: true });
  fs.copyFileSync(reactScript, path.join(tempRoot, "scripts", "build-js-code.mjs"));
  fs.symlinkSync(path.join(repoRoot, "node_modules"), path.join(tempRoot, "node_modules"), "dir");
  write(
    "package.json",
    `${JSON.stringify({ name: "js-code-cache-smoke", private: true, type: "module" }, null, 2)}\n`,
  );
  write(
    "tsconfig.js-code-nodes.json",
    `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          skipLibCheck: true,
          types: ["node"],
          baseUrl: ".",
          paths: { "@/*": ["src/*"] },
        },
        include: ["src/functions/**/*.ts"],
      },
      null,
      2,
    )}\n`,
  );
  write("src/shared/value.ts", "export const sharedValue: number = 1;\n");
  write(
    "src/functions/a/index.ts",
    'import { sharedValue } from "@/shared/value";\nexport default async () => ({ value: sharedValue });\n',
  );
  write("src/functions/b/index.ts", "export default async () => ({ value: 2 });\n");
  write(
    "src/functions/unrelated/index.ts",
    'const invalid: number = "unrelated target must not be typechecked";\nexport default async () => invalid;\n',
  );

  const first = run(["--scripts", "functions:a,functions:b"]);
  assert.match(first, /TypeScript validation passed/);
  assert.match(first, /complete: 2 built, 0 cached, 2 total/);
  assert.doesNotMatch(first, /unrelated/, "scoped build must not typecheck or build unrelated targets");
  const bOutput = path.join(tempRoot, "dist", "functions", "b", "index.cjs");
  const bFirstMtime = fs.statSync(bOutput).mtimeMs;

  const second = run(["--scripts", "functions:a,functions:b"]);
  assert.match(second, /TypeScript validation cache hit/);
  assert.match(second, /complete: 0 built, 2 cached, 2 total/);

  write("src/shared/value.ts", "export const sharedValue: number = 3;\n");
  const sharedChanged = run(["--scripts", "functions:a,functions:b"]);
  assert.match(sharedChanged, /building functions\/a/);
  assert.match(sharedChanged, /cached functions\/b/);
  assert.equal(fs.statSync(bOutput).mtimeMs, bFirstMtime, "unaffected target should not rebuild");

  fs.appendFileSync(bOutput, "\n// tampered\n", "utf8");
  const repaired = run(["--script", "b", "--source", "functions"]);
  assert.match(repaired, /building functions\/b/);
  assert.doesNotMatch(fs.readFileSync(bOutput, "utf8"), /tampered/);

  const repeatedArgs = run([
    "--script",
    "a",
    "--script",
    "b",
    "--source",
    "functions",
    "--force",
  ]);
  assert.match(repeatedArgs, /complete: 2 built, 0 cached, 2 total/);

  const cache = JSON.parse(
    fs.readFileSync(path.join(tempRoot, ".openxiangda", "build-cache.json"), "utf8"),
  );
  assert.equal(cache.version, 4);
  assert.ok(cache.typechecks["functions/a,functions/b"].inputHash);
  assert.ok(cache.targets["functions/a"].dependencies.includes("src/shared/value.ts"));
  assert.ok(cache.targets["functions/a"].inputHash);
  assert.ok(cache.targets["functions/a"].outputHash);
  assert.match(cache.targets["functions/a"].sourceHash, /^[a-f0-9]{64}$/);

  cache.toolFingerprint = "stale-builder-fingerprint";
  fs.writeFileSync(
    path.join(tempRoot, ".openxiangda", "build-cache.json"),
    `${JSON.stringify(cache, null, 2)}\n`,
  );
  const fingerprintChanged = run(["--script", "a", "--source", "functions"]);
  assert.match(fingerprintChanged, /building functions\/a/);
  const refreshedCache = JSON.parse(
    fs.readFileSync(path.join(tempRoot, ".openxiangda", "build-cache.json"), "utf8"),
  );
  assert.equal(
    refreshedCache.targets["functions/b"],
    undefined,
    "a new builder fingerprint must not retain untouched target metadata",
  );
  assert.deepEqual(
    Object.keys(refreshedCache.typechecks),
    ["functions/a"],
    "a new builder fingerprint must not retain scoped typecheck metadata",
  );

  write(
    "src/functions/tsx-only/index.tsx",
    "export default async () => ({ ok: true });\n",
  );
  const tsxOnly = run(["--script", "tsx-only"]);
  assert.match(tsxOnly, /building functions\/tsx-only/);

  const legacyRoot = path.join(tempRoot, "legacy-workspace");
  const legacyWrite = (relative, content) => {
    const file = path.join(legacyRoot, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
  };
  fs.mkdirSync(legacyRoot, { recursive: true });
  fs.symlinkSync(path.join(repoRoot, "node_modules"), path.join(legacyRoot, "node_modules"), "dir");
  legacyWrite(
    "package.json",
    `${JSON.stringify({
      name: "legacy-js-code-workspace",
      private: true,
      type: "module",
      scripts: {
        "prebuild-js-code": "node scripts/old-full-build.mjs",
        "build-js-code": "node scripts/build-js-code.mjs",
      },
    }, null, 2)}\n`,
  );
  legacyWrite(
    "tsconfig.js-code-nodes.json",
    `${JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        skipLibCheck: true,
        types: ["node"],
        baseUrl: ".",
        paths: { "@/*": ["src/*"] },
      },
      include: ["src/**/*.ts"],
    }, null, 2)}\n`,
  );
  const legacyMarker = path.join(legacyRoot, "old-builder-ran.log");
  const legacyBuilder = `/* standard legacy builder markers: tsconfig.js-code-nodes.json sourceKinds resolveBuildTargets buildScript */\nimport fs from "node:fs"\nfs.writeFileSync(${JSON.stringify(legacyMarker)}, "old builder ran\\n")\nthrow new Error("old builder must be bypassed")\n`;
  legacyWrite("scripts/old-full-build.mjs", legacyBuilder);
  legacyWrite("scripts/build-js-code.mjs", legacyBuilder);
  legacyWrite("src/shared/value.ts", "export const sharedValue: number = 7;\n");
  legacyWrite(
    "src/functions/selected/index.ts",
    'import { sharedValue } from "@/shared/value";\nexport default async () => sharedValue;\n',
  );
  for (let index = 1; index <= 87; index += 1) {
    const code = `function_${String(index).padStart(3, "0")}`;
    legacyWrite(
      `src/functions/${code}/index.ts`,
      `const invalid: number = "${code} must not be typechecked";\nexport default async () => invalid;\n`,
    );
  }
  for (let index = 1; index <= 11; index += 1) {
    const code = `automation_${String(index).padStart(3, "0")}`;
    legacyWrite(
      `src/automations/${code}/index.ts`,
      `const invalid: number = "${code} must not be typechecked";\nexport default async () => invalid;\n`,
    );
  }
  const legacyTargets = [{ sourceKind: "functions", scriptCode: "selected" }];
  const legacyCommand = resolveWorkspaceJsCodeBuildCommand(legacyRoot, legacyTargets);
  assert.equal(legacyCommand.mode, "canonical-scoped");
  const legacyResult = runWorkspaceJsCodeBuildBatch(legacyRoot, legacyTargets);
  if (legacyResult.status !== 0) {
    throw new Error(`canonical legacy build failed:\n${legacyResult.stdout}\n${legacyResult.stderr}`);
  }
  const legacyOutput = `${legacyResult.stdout}\n${legacyResult.stderr}`;
  assert.match(legacyOutput, /complete: 1 built, 0 cached, 1 total/);
  assert.doesNotMatch(legacyOutput, /function_001|automation_001/);
  assert.equal(fs.existsSync(legacyMarker), false, "old workspace builder/lifecycle must be bypassed");
  assert.equal(
    fs.existsSync(path.join(legacyRoot, "dist", "functions", "selected", "index.cjs")),
    true,
  );
  assert.equal(
    fs.existsSync(path.join(legacyRoot, "dist", "functions", "function_001", "index.cjs")),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(legacyRoot, ".openxiangda", "build-cache.cli-v4.json")),
    true,
    "canonical CLI cache must not overwrite an old workspace builder cache",
  );
  legacyWrite(
    "scripts/build-js-code.mjs",
    'console.log("nonstandard custom builder")\n',
  );
  assert.equal(
    resolveWorkspaceJsCodeBuildCommand(legacyRoot, legacyTargets).mode,
    "workspace-script",
    "nonstandard custom builders must keep the compatibility fallback",
  );
  assert.equal(
    resolveWorkspaceJsCodeBuildCommand(legacyRoot, legacyTargets, {
      forceCanonical: true,
    }).mode,
    "canonical-scoped",
    "Delivery V2 sealed execution must never invoke a workspace-owned builder",
  );

  const unscoped = runResult([]);
  assert.notEqual(unscoped.status, 0, "unscoped build must preserve full-workspace validation");
  assert.match(
    `${unscoped.stdout}\n${unscoped.stderr}`,
    /unrelated\/index\.ts|JS_CODE TypeScript validation failed/,
  );
  console.log("JS_CODE batch/cache smoke passed");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
