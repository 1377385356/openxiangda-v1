import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
);
const excluded = new Set([
  'test:fast',
  'test:changed',
  'test:contract',
  'test:release',
  'test:release:sdk-admin-list',
  'test:critical',
  'test:all',
  'test:full',
  'test:ci',
]);
const releaseTests = new Set([
  'test:migration-advice',
  'test:delivery-v2-package',
  'test:delivery-v2-executor',
  'test:delivery-v2-release-conformance',
  'test:application-environments',
  'test:environment-swap',
  'test:environment-policy',
  'test:developer-center',
  'test:resource-plan-readonly',
  'test:resource-publish-scope',
  'test:managed-target-scope-form-resolution',
  'test:app-function-secrets',
  'test:app-function-role-contract',
  'test:change-baseline-publish',
  'test:generic-base-preflight',
  'test:publish-lease-heartbeat',
  'test:publish-lease-cli',
  'test:resource-cli',
  'test:managed-target-scope-form-resolution',
  'test:permission-snapshot',
  'test:permission-role-users',
  'test:release-plan',
  'test:release-ship',
  'test:release-mainline',
  'test:release-explain',
  'test:release-error-classification',
  'test:release-evidence',
  'test:release-fail',
  'test:task-status',
  'test:worktree-cleanup',
  'test:policy',
  'test:backend-release-cli',
  'test:app-release-cli',
  'test:runtime-deploy',
  'test:release-ship',
  'test:sdd',
  'test:sdd-stages',
  'test:integration-bundle',
  'test:typed-resource-plan',
  'test:content-cache',
  'test:dependency-capsule',
  'test:form-field-contract',
  'test:resource-binding-contract',
  'test:sdk-list-response',
  'test:sdk-runtime-cache',
  'test:sdk-admin-list',
]);
const contractTests = new Set([
  'test:delivery-v2-package',
  'test:delivery-v2-executor',
  'test:delivery-v2-release-conformance',
  'test:application-environments',
  'test:environment-swap',
  'test:environment-policy',
  'test:developer-center',
  'test:api-contract',
  'test:app-function-secrets',
  'test:app-function-role-contract',
  'test:backend-release-cli',
  'test:app-release-cli',
  'test:form-release-cas',
  'test:form-field-contract',
  'test:resource-binding-contract',
  'test:permission-role-users',
  'test:sdk-list-response',
  'test:sdk-runtime-cache',
  'test:sdk-admin-list',
  'test:page-release-cli',
  'test:runtime-deploy',
  'test:package-runtime-dependencies',
]);
const changedTests = new Set([
  'test:delivery-v2-package',
  'test:delivery-v2-executor',
  'test:delivery-v2-release-conformance',
  'test:application-environments',
  'test:environment-swap',
  'test:environment-policy',
  'test:developer-center',
  'test:resource-plan-readonly',
  'test:app-function-role-contract',
  'test:backend-release-cli',
  'test:app-release-cli',
  'test:form-release-cas',
  'test:release-plan',
  'test:release-ship',
  'test:release-fail',
  'test:typed-resource-plan',
  'test:integration-bundle',
  'test:content-cache',
  'test:dependency-capsule',
  'test:sdd-stages',
  'test:release-explain',
  'test:release-error-classification',
  'test:task-status',
  'test:worktree-cleanup',
  'test:publish-lease-cli',
  'test:permission-snapshot',
  'test:permission-role-users',
  'test:resource-cli',
  'test:policy',
  'test:form-field-contract',
  'test:resource-binding-contract',
  'test:sdk-list-response',
  'test:sdk-runtime-cache',
  'test:sdk-admin-list',
]);
const argumentValue = name => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const releaseProfileName = argumentValue('--release-profile');
const releaseProfiles = new Map([
  [
    'sdk-admin-list',
    new Set([
      'test:release-evidence',
      'test:sdk-admin-list',
      'test:sdk-list-response',
      'test:sdk-runtime-cache',
    ]),
  ],
]);
if (releaseProfileName && !releaseProfiles.has(releaseProfileName)) {
  throw new Error(
    `UNKNOWN_RELEASE_TEST_PROFILE: unknown release test profile ${releaseProfileName}`,
  );
}
const mode = process.argv.includes('--changed')
  ? 'changed'
  : process.argv.includes('--contract')
    ? 'contract'
    : process.argv.includes('--release') ||
        process.argv.includes('--critical') ||
        releaseProfileName
      ? 'release'
      : 'all';
const selected =
  releaseProfileName
    ? releaseProfiles.get(releaseProfileName)
    : mode === 'changed'
    ? changedTests
    : mode === 'contract'
      ? contractTests
      : mode === 'release'
        ? releaseTests
        : null;
const tests = Object.keys(packageJson.scripts || {})
  .filter(name => name.startsWith('test:') && !excluded.has(name))
  .filter(name => !selected || selected.has(name))
  .sort();
// Release tests launch several nested CLI processes and local HTTP mock servers.
// Three or more concurrent workers intermittently reset loopback connections on
// developer machines, which turns a healthy non-idempotent write path into a false
// failure.
// Keep the release gate stable by default while preserving an explicit override.
// A single release worker is intentional: the nested CLI processes have 30-second
// HTTP deadlines, and two CPU-heavy suites can starve an otherwise healthy local
// mock request until the CLI correctly classifies it as a pre-write timeout.
const defaultConcurrency = mode === 'release' ? 1 : 4;
const concurrency = Math.max(
  1,
  Math.min(
    Number(process.env.OPENXIANGDA_TEST_CONCURRENCY) || defaultConcurrency,
    tests.length,
  ),
);
const results = [];
let cursor = 0;

async function run(name) {
  const started = Date.now();
  const result = await new Promise(resolve => {
    const child = spawn('npm', ['run', name], {
      cwd: repoRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', chunk => {
      output += String(chunk);
    });
    child.stderr.on('data', chunk => {
      output += String(chunk);
    });
    child.on('error', error => resolve({ code: 1, output: error.stack || error.message }));
    child.on('close', code => resolve({ code: code || 0, output }));
  });
  return {
    name,
    code: result.code,
    output: result.output,
    durationMs: Date.now() - started,
  };
}

async function worker() {
  while (cursor < tests.length) {
    const index = cursor++;
    const result = await run(tests[index]);
    results.push(result);
    process.stdout.write(
      `${result.code === 0 ? 'PASS' : 'FAIL'} ${result.name} ${(
        result.durationMs / 1000
      ).toFixed(1)}s\n`,
    );
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
const failures = results.filter(result => result.code !== 0);
for (const result of failures) {
  process.stderr.write(`\n===== ${result.name} =====\n${result.output.slice(-12000)}\n`);
}
const totalMs = results.reduce((sum, result) => sum + result.durationMs, 0);
process.stdout.write(
  `${mode} suite: ${results.length - failures.length}/${results.length} passed, worker-time ${(
    totalMs / 1000
  ).toFixed(1)}s, concurrency ${concurrency}\n`,
);
if (process.argv.includes('--evidence')) {
  const commitResult = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const commit =
    commitResult.status === 0 ? String(commitResult.stdout).trim() : 'uncommitted';
  const evidence = {
    schemaVersion: 'openxiangda_test_evidence_v1',
    commit,
    suite: mode,
    releaseProfile: releaseProfileName || null,
    toolchain: {
      openxiangda: packageJson.version,
      node: process.versions.node,
    },
    generatedAt: new Date().toISOString(),
    concurrency,
    passed: tests.length - failures.length,
    failed: failures.length,
    results: results
      .map(result => ({
        name: result.name,
        passed: result.code === 0,
        durationMs: result.durationMs,
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
  const canonical = JSON.stringify(evidence);
  evidence.evidenceHash = crypto.createHash('sha256').update(canonical).digest('hex');
  const evidenceDir = path.join(repoRoot, '.openxiangda', 'evidence', 'tests', commit);
  fs.mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
  const file = path.join(evidenceDir, `${mode}.json`);
  fs.writeFileSync(file, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`evidence: ${path.relative(repoRoot, file)}\n`);
}
if (failures.length > 0) process.exitCode = 1;
