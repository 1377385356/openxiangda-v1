import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  readContentCache,
  writeContentCache,
} = require('../lib/content-cache');

const workspace = fs.mkdtempSync(
  path.join(os.tmpdir(), 'openxiangda-content-cache-'),
);
try {
  spawnSync('git', ['init', '-b', 'master'], { cwd: workspace });
  const key = 'a'.repeat(64);
  const value = {
    actions: [{ kind: 'role', code: 'operator', action: 'noop' }],
  };
  const file = writeContentCache({
    cwd: workspace,
    namespace: 'generic-git-base-plan',
    key,
    value,
  });
  assert.ok(file && fs.existsSync(file));
  assert.deepEqual(
    readContentCache({
      cwd: workspace,
      namespace: 'generic-git-base-plan',
      key,
    }),
    value,
  );
  const mode = fs.statSync(file).mode & 0o777;
  assert.equal(mode, 0o600);
} finally {
  fs.rmSync(workspace, { recursive: true, force: true });
}

console.log('content cache smoke passed');
