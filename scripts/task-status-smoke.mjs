import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildTaskStatus } = require('../lib/task-status');

const completed = buildTaskStatus({
  changeId: 'small-fix',
  change: { id: 'small-fix', status: 'approved' },
  taskResult: { commit: 'abc123', recordedAt: '2026-07-18T00:00:00Z' },
  integration: {
    requiredCommits: [{ commit: 'abc123', mergedIntoHead: true }],
  },
  execution: {
    status: 'completed',
    writeAttempted: true,
    createdAt: '2026-07-18T00:00:01Z',
    completedAt: '2026-07-18T00:00:21Z',
    steps: [
      {
        id: 'app-finalize',
        status: 'completed',
        startedAt: '2026-07-18T00:00:10Z',
        completedAt: '2026-07-18T00:00:20Z',
        result: { releaseId: 'release-1' },
      },
    ],
  },
  postCommit: { status: 'completed' },
});
assert.equal(completed.phase, 'healthy');
assert.equal(completed.healthy, true);
assert.equal(completed.wrotePlatform, true);
assert.equal(completed.release.appReleaseId, 'release-1');
assert.equal(completed.source.integrated, true);

const blocked = buildTaskStatus({
  changeId: 'failed-change',
  execution: {
    status: 'failed',
    steps: [
      {
        id: 'backend-stage',
        status: 'failed',
        error: {
          code: 'DB_MIGRATION_NOT_READY',
          message: 'database contract is not ready',
        },
      },
    ],
  },
});
assert.equal(blocked.phase, 'failed');
assert.equal(blocked.blocker.layer, 'database');
assert.match(blocked.nextAction, /backend-stage/);

const postCommit = buildTaskStatus({
  changeId: 'retry-change',
  execution: {
    status: 'completed',
    steps: [
      {
        id: 'app-finalize',
        status: 'completed',
        result: { releaseId: 'release-2' },
      },
    ],
  },
  postCommit: { status: 'pending_retry', failed: 1 },
});
assert.equal(postCommit.phase, 'health');
assert.equal(postCommit.healthy, false);
assert.equal(postCommit.blocker.layer, 'post-commit');

const waitingForOtherLease = buildTaskStatus({
  changeId: 'runtime-fix',
  change: { id: 'runtime-fix', status: 'approved' },
  sourceRevision: {
    baseCommit: 'def456',
  },
  integration: { integrated: true },
  execution: {
    status: 'running',
    createdAt: '2026-07-18T00:00:00Z',
    releaseSourceRevision: { baseCommit: 'def456' },
    steps: [
      {
        id: 'lease-and-capture',
        status: 'pending',
      },
      {
        id: 'runtime-stage',
        status: 'pending',
      },
    ],
  },
  remoteLease: {
    active: true,
    holder: 'self',
    changeId: 'previous-role-publish',
    clientSessionId: 'codex:previous-thread',
    expiresAt: '2026-07-18T00:02:00Z',
  },
});
assert.equal(waitingForOtherLease.phase, 'staging');
assert.equal(waitingForOtherLease.blocker.layer, 'lease');
assert.match(waitingForOtherLease.blocker.message, /previous-role-publish/);
assert.match(waitingForOtherLease.nextAction, /previous-role-publish/);
assert.equal(waitingForOtherLease.source.taskCommit, 'def456');
assert.equal(waitingForOtherLease.source.taskReady, true);
assert.equal(waitingForOtherLease.source.integrated, true);

const ownActiveLease = buildTaskStatus({
  changeId: 'runtime-fix',
  execution: {
    status: 'running',
    releaseContext: {
      leaseId: 'lease-runtime',
      clientSessionId: 'codex:runtime-thread',
    },
    steps: [
      {
        id: 'runtime-stage',
        status: 'running',
      },
    ],
  },
  remoteLease: {
    active: true,
    holder: 'self',
    leaseId: 'lease-runtime',
    changeId: 'runtime-fix',
    clientSessionId: 'codex:runtime-thread',
  },
});
assert.equal(ownActiveLease.blocker, null);
assert.equal(ownActiveLease.phase, 'staging');

const directPublishCompleted = buildTaskStatus({
  changeId: 'role-fix',
  change: { id: 'role-fix', status: 'approved' },
  directPublish: {
    status: 'completed',
    command: 'resource publish',
    writeAttempted: true,
    completedAt: '2026-07-18T00:00:08Z',
    sourceRevision: { baseCommit: 'role123' },
    selectors: ['role:instrument_admin'],
  },
  integration: { integrated: true },
});
assert.equal(directPublishCompleted.phase, 'healthy');
assert.equal(directPublishCompleted.healthy, true);
assert.equal(directPublishCompleted.wrotePlatform, true);
assert.equal(
  directPublishCompleted.release.state,
  'direct-publish-completed',
);
assert.equal(directPublishCompleted.source.taskCommit, 'role123');
assert.match(directPublishCompleted.nextAction, /直接发布已完成/);

console.log('task status smoke passed');
