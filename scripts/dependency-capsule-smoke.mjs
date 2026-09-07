import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {
  CAPSULE_SCHEMA,
  buildDependencyCapsulePlan,
  prepareDependencyCapsule,
} = require(path.join(repoRoot, 'lib', 'dependency-capsule.js'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openxiangda-capsule-'));
try {
  const git = spawnSync('git', ['init', '-b', 'main'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert(git.status === 0, git.stderr || 'git init failed');
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'capsule-smoke', version: '1.0.0' })
  );
  fs.writeFileSync(
    path.join(root, 'package-lock.json'),
    JSON.stringify({
      name: 'capsule-smoke',
      version: '1.0.0',
      lockfileVersion: 3,
      packages: { '': { name: 'capsule-smoke', version: '1.0.0' } },
    })
  );
  const missing = prepareDependencyCapsule({ cwd: root, check: true });
  assert(!missing.ready && !missing.capsuleReady, 'missing capsule must fail check');

  const plan = buildDependencyCapsulePlan({ cwd: root });
  fs.mkdirSync(plan.capsuleNodeModules, { recursive: true });
  fs.writeFileSync(
    plan.markerFile,
    JSON.stringify({
      schemaVersion: CAPSULE_SCHEMA,
      fingerprint: plan.fingerprint,
    })
  );
  const prepared = prepareDependencyCapsule({ cwd: root });
  assert(prepared.ready && prepared.linked, 'prepared capsule should link node_modules');
  assert(fs.lstatSync(path.join(root, 'node_modules')).isSymbolicLink(), 'node_modules must be a link');

  fs.appendFileSync(path.join(root, 'package-lock.json'), '\n');
  const stale = prepareDependencyCapsule({ cwd: root, check: true });
  assert(!stale.ready && !stale.capsuleReady, 'lockfile changes must invalidate the capsule');
  process.stdout.write('dependency capsule smoke passed\n');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
