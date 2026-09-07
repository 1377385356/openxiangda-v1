import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  claimWorktreeOwner,
  getWorktreeOwnerStatus,
  managedWorktreeMarkerFile,
  releaseWorktreeOwner,
} = require('../lib/worktree-owner');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openxiangda-worktree-owner-'));
const originalThreadId = process.env.CODEX_THREAD_ID;

try {
  process.env.CODEX_THREAD_ID = 'thread-a';
  const first = claimWorktreeOwner({
    cwd: tempRoot,
    changeId: 'change-a',
    ttlSeconds: 600,
  });
  assert.equal(first.claimed, true);
  assert.equal(first.renewed, false);
  assert.equal(first.owner.threadId, 'thread-a');
  assert.equal(first.owner.changeId, 'change-a');

  const renewed = claimWorktreeOwner({
    cwd: tempRoot,
    changeId: 'change-a',
    ttlSeconds: 600,
  });
  assert.equal(renewed.renewed, true);
  assert.equal(getWorktreeOwnerStatus({ cwd: tempRoot }).ownedByCurrentThread, true);

  process.env.CODEX_THREAD_ID = 'thread-b';
  assert.throws(
    () => claimWorktreeOwner({ cwd: tempRoot, changeId: 'change-b' }),
    error => error?.code === 'WORKTREE_OWNED_BY_ANOTHER_TASK'
  );
  assert.equal(getWorktreeOwnerStatus({ cwd: tempRoot }).ownedByCurrentThread, false);
  assert.throws(
    () => releaseWorktreeOwner({ cwd: tempRoot }),
    error => error?.code === 'WORKTREE_OWNED_BY_ANOTHER_TASK'
  );
  assert.throws(
    () =>
      claimWorktreeOwner({
        cwd: tempRoot,
        changeId: 'change-b',
        force: true,
      }),
    /--reason/
  );

  const takeover = claimWorktreeOwner({
    cwd: tempRoot,
    changeId: 'change-b',
    force: true,
    reason: 'thread-a was explicitly closed',
  });
  assert.equal(takeover.owner.threadId, 'thread-b');
  assert.equal(takeover.owner.takeover.previousThreadId, 'thread-a');
  assert.equal(releaseWorktreeOwner({ cwd: tempRoot }).released, true);
  assert.equal(getWorktreeOwnerStatus({ cwd: tempRoot }).active, false);
  assert.equal(
    fs.existsSync(managedWorktreeMarkerFile({ cwd: tempRoot })),
    true
  );

  fs.writeFileSync(
    path.join(tempRoot, '.openxiangda', 'worktree-owner.json'),
    '{not-json\n'
  );
  const invalid = getWorktreeOwnerStatus({ cwd: tempRoot });
  assert.equal(invalid.invalid, true);
  assert.equal(invalid.active, true);
  assert.throws(
    () => claimWorktreeOwner({ cwd: tempRoot, changeId: 'change-b' }),
    error => error?.code === 'WORKTREE_OWNER_STATE_INVALID'
  );
  fs.rmSync(
    path.join(tempRoot, '.openxiangda', 'worktree-owner.json'),
    { force: true }
  );

  delete process.env.CODEX_THREAD_ID;
  const disabled = claimWorktreeOwner({ cwd: tempRoot, changeId: 'change-c' });
  assert.equal(disabled.enforced, false);
  assert.equal(disabled.claimed, false);
  console.log('worktree owner smoke passed');
} finally {
  if (originalThreadId === undefined) delete process.env.CODEX_THREAD_ID;
  else process.env.CODEX_THREAD_ID = originalThreadId;
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
