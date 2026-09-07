import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
);
const require = createRequire(path.join(repoRoot, "package.json"));
const { buildOpenXiangdaUpdateInstallPlan } = require(
  path.join(repoRoot, "lib", "cli.js"),
);

assert.equal(
  packageJson.dependencies?.typescript,
  "^5.7.0",
  "typescript is loaded by the packaged CLI and must remain a runtime dependency",
);
assert.doesNotThrow(
  () => require.resolve("typescript"),
  "the packaged CLI runtime dependencies must resolve from the package root",
);
for (const packageName of ["react", "react-dom"]) {
  assert.equal(
    packageJson.dependencies?.[packageName],
    "18.3.1",
    `${packageName} must remain in the sealed Delivery V2 build toolchain even when peer resolution is disabled`,
  );
  assert.doesNotThrow(
    () => require.resolve(packageName),
    `${packageName} must resolve from the package root`,
  );
}
for (const [name, version] of Object.entries(packageJson.dependencies || {})) {
  assert.doesNotMatch(
    String(version),
    /^(?:https?|git(?:\+[^:]+)?):|^[^@/]+\/[^/]+(?:#|$)/i,
    `published runtime dependency ${name} must use a registry semver range`,
  );
}
assert.equal(
  packageJson.dependencies?.xlsx,
  undefined,
  "SheetJS must be bundled into the SDK so workspace installs do not inherit its URL dependency",
);

const updatePlan = buildOpenXiangdaUpdateInstallPlan(
  "https://registry.npmjs.org/",
  { timeoutSeconds: 180, target: 'launcher', version: '2.0.0' },
);
assert.equal(updatePlan.registry, "https://registry.npmjs.org");
assert.equal(updatePlan.timeoutSeconds, 180);
for (const requiredArg of [
  "--prefer-offline",
  "--legacy-peer-deps",
  "--no-audit",
  "--no-fund",
  "--progress=false",
  "--fetch-retries=2",
  "--fetch-timeout=60000",
]) {
  assert.ok(
    updatePlan.args.includes(requiredArg),
    `optimized update plan must include ${requiredArg}`,
  );
}

console.log("package runtime dependencies smoke passed");
