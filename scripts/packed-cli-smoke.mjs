import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openxiangda-packed-cli-"));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status}):\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result.stdout;
}

try {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  const packOutput = run("npm", [
    "pack",
    "--json",
    "--pack-destination",
    tempRoot,
  ]);
  const jsonStart = packOutput.lastIndexOf("\n[");
  const packResult = JSON.parse(packOutput.slice(jsonStart >= 0 ? jsonStart + 1 : 0));
  assert.equal(packResult.length, 1, "npm pack must produce exactly one archive");
  assert.ok(
    Number(packResult[0].size) < 4 * 1024 * 1024,
    `published archive must stay below 4 MiB, got ${packResult[0].size}`,
  );
  assert.ok(
    Number(packResult[0].unpackedSize) < 17 * 1024 * 1024,
    `published archive must stay below 17 MiB unpacked, got ${packResult[0].unpackedSize}`,
  );
  assert.equal(
    (packResult[0].files || []).some(file => file.path.endsWith(".map")),
    false,
    "published SDK must not include source maps",
  );
  assert.equal(
    (packResult[0].files || []).some(file =>
      /packages\/sdk\/src\/build-source\/.*\.test\.ts$/.test(file.path),
    ),
    false,
    "published build toolchain must not include test sources",
  );
  const archive = path.join(tempRoot, packResult[0].filename);
  const prefix = path.join(tempRoot, "prefix");

  run("npm", [
    "install",
    "--global",
    archive,
    "--prefix",
    prefix,
    "--legacy-peer-deps",
    "--ignore-scripts",
    "--loglevel=error",
  ]);

  const cli = path.join(prefix, "bin", "openxiangda");
  const version = JSON.parse(run(cli, ["version", "--json"]));
  assert.equal(version.version, packageJson.version);
  const commands = JSON.parse(run(cli, ["commands", "--json"]));
  assert.ok(Array.isArray(commands.commands) || Array.isArray(commands));

  const installedPackage = path.join(prefix, "lib", "node_modules", "openxiangda");
  const installedRequire = createRequire(
    path.join(installedPackage, "package.json"),
  );
  assert.doesNotThrow(
    () => installedRequire.resolve("react"),
    "packed Delivery V2 toolchain must include React when --legacy-peer-deps disables peer auto-install",
  );
  assert.doesNotThrow(
    () => installedRequire.resolve("react-dom"),
    "packed Delivery V2 toolchain must include React DOM when --legacy-peer-deps disables peer auto-install",
  );
  const installedBuildModule = path.join(installedPackage, "lib", "js-code-build.js");
  const installedCanonicalBuilder = path.join(
    installedPackage,
    "templates",
    "openxiangda-react-spa",
    "scripts",
    "build-js-code.mjs",
  );
  assert.equal(fs.existsSync(installedCanonicalBuilder), true);

  const legacyWorkspace = path.join(tempRoot, "legacy-workspace");
  const writeLegacy = (relative, content) => {
    const file = path.join(legacyWorkspace, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
  };
  const legacyMarker = path.join(legacyWorkspace, "old-builder-ran.log");
  writeLegacy(
    "package.json",
    `${JSON.stringify({
      name: "packed-cli-legacy-workspace",
      private: true,
      type: "module",
      scripts: {
        "prebuild-js-code": "node scripts/build-js-code.mjs --all",
        "build-js-code": "node scripts/build-js-code.mjs",
      },
    }, null, 2)}\n`,
  );
  writeLegacy(
    "tsconfig.js-code-nodes.json",
    `${JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        skipLibCheck: true,
        types: [],
      },
      include: ["src/**/*.ts"],
    }, null, 2)}\n`,
  );
  writeLegacy(
    "scripts/build-js-code.mjs",
    `/* standard legacy builder markers: tsconfig.js-code-nodes.json sourceKinds resolveBuildTargets buildScript */\nimport fs from "node:fs"\nfs.writeFileSync(${JSON.stringify(legacyMarker)}, "old builder ran\\n")\nthrow new Error("packed CLI must bypass old builder")\n`,
  );
  writeLegacy(
    "src/functions/selected/index.ts",
    "export default async () => ({ ok: true });\n",
  );
  writeLegacy(
    "src/functions/unrelated/index.ts",
    'const invalid: number = "must stay unrelated";\nexport default async () => invalid;\n',
  );
  const packedBuildOutput = run(process.execPath, [
    "-e",
    `const { runWorkspaceJsCodeBuildBatch } = require(${JSON.stringify(installedBuildModule)});\n` +
      `const result = runWorkspaceJsCodeBuildBatch(${JSON.stringify(legacyWorkspace)}, [{ sourceKind: "functions", scriptCode: "selected" }]);\n` +
      `if (result.status !== 0) { process.stderr.write(String(result.stdout || "") + String(result.stderr || "")); process.exit(result.status || 1); }\n` +
      `process.stdout.write(String(result.stdout || "") + String(result.stderr || ""));\n`,
  ]);
  assert.match(packedBuildOutput, /complete: 1 built, 0 cached, 1 total/);
  assert.doesNotMatch(packedBuildOutput, /unrelated/);
  assert.equal(fs.existsSync(legacyMarker), false);
  assert.equal(
    fs.existsSync(path.join(legacyWorkspace, "dist", "functions", "selected", "index.cjs")),
    true,
  );

  console.log(`packed CLI smoke passed (${packageJson.version})`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
