import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openxiangda-resource-scope-'));
const tempHome = path.join(tempRoot, 'home');
const workspace = path.join(tempRoot, 'workspace');

const run = args =>
  spawnSync(process.execPath, [path.join(repoRoot, 'bin', 'openxiangda.js'), ...args], {
    cwd: workspace,
    env: {
      ...process.env,
      HOME: tempHome,
      CODEX_THREAD_ID: 'resource-scope-smoke',
    },
    encoding: 'utf8',
  });

try {
  fs.mkdirSync(path.join(tempHome, '.openxiangda'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'src', 'resources', 'functions'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(workspace, 'src', 'resources', 'functions', 'alpha.json'),
    `${JSON.stringify({ code: 'alpha', name: 'Alpha', runtime: 'nodejs' }, null, 2)}\n`
  );

  const accidentalFull = run(['resource', 'publish', 'function', '--json']);
  assert.notEqual(accidentalFull.status, 0);
  assert.match(accidentalFull.stderr, /必须使用 --only\/--code/);

  const missingReason = run(['resource', 'publish', 'function', '--all', '--json']);
  assert.notEqual(missingReason.status, 0);
  assert.match(missingReason.stderr, /--all 必须提供/);

  const manifestReplaceMissingReason = run([
    'resource',
    'publish',
    'function',
    '--only',
    'alpha',
    '--replace-manifest',
    '--json',
  ]);
  assert.notEqual(manifestReplaceMissingReason.status, 0);
  assert.match(manifestReplaceMissingReason.stderr, /--replace-manifest 必须提供/);

  const bypassStillBlocked = run([
    'resource',
    'publish',
    'function,automation',
    '--sdd-bypass',
    '--reason',
    'emergency legacy command',
    '--json',
  ]);
  assert.notEqual(bypassStillBlocked.status, 0);
  assert.match(bypassStillBlocked.stderr, /必须使用 --only\/--code/);
  console.log('resource publish scope smoke passed');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
