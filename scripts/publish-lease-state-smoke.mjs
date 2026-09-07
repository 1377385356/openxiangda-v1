import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildPublishBaseRevision,
  clearPublishLease,
  getUsableStoredPublishLease,
  savePublishLease,
  shouldRenewPublishLease,
} = require('../lib/publish-lease');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openxiangda-publish-lease-'));
try {
  const bound = { appType: 'APP_TEST', resources: {} };
  const target = {
    appType: 'APP_TEST',
    profileName: 'test',
    bound,
    state: { version: 1, profiles: { test: bound } },
    cwd: tmpDir,
  };
  const expiresAt = new Date(Date.now() + 600_000).toISOString();
  const lease = savePublishLease(
    target,
    {
      leaseId: 'lease-1',
      appType: 'APP_TEST',
      changeId: 'change-1',
      baseRevision: 'base-1',
      expiresAt,
      holder: 'self',
    },
    { cwd: tmpDir }
  );

  assert.equal(lease.leaseId, 'lease-1');
  assert.equal(getUsableStoredPublishLease(target)?.changeId, 'change-1');
  assert.equal(shouldRenewPublishLease(lease, Date.now(), 60), false);
  assert.equal(
    buildPublishBaseRevision({
      app: {
        updatedAt: '2026-07-15T00:00:00.000Z',
        activeRuntimeReleaseId: 'release-1',
        activeRuntimeBuildId: 'build-1',
      },
    }),
    'appUpdatedAt=2026-07-15T00:00:00.000Z;runtimeRelease=release-1;runtimeBuild=build-1'
  );

  assert.equal(clearPublishLease(target, 'another-lease', { cwd: tmpDir }), false);
  assert.equal(clearPublishLease(target, 'lease-1', { cwd: tmpDir }), true);
  assert.equal(getUsableStoredPublishLease(target), null);

  const managedDir = path.join(tmpDir, 'managed');
  fs.mkdirSync(managedDir, { recursive: true });
  const sharedProfile = {
    appType: 'APP_PREPRODUCTION',
    baseUrl: 'https://example.invalid/service',
    resources: { sentinel: { id: 'profile-must-remain-unchanged' } },
  };
  const managedBound = {
    targetName: 'production',
    profile: 'shared-login',
    environmentId: 'environment-production',
    appType: 'APP_PRODUCTION',
    resources: {},
  };
  const managedTarget = {
    appType: 'APP_PRODUCTION',
    environmentId: 'environment-production',
    targetName: 'production',
    profileName: 'shared-login',
    bound: managedBound,
    state: {
      version: 1,
      profiles: { 'shared-login': sharedProfile },
      targets: { production: managedBound },
    },
    cwd: managedDir,
  };
  const originalSharedProfile = structuredClone(sharedProfile);
  savePublishLease(
    managedTarget,
    {
      leaseId: 'managed-lease-1',
      appType: 'APP_PRODUCTION',
      changeId: 'managed-change-1',
      baseRevision: 'managed-base-1',
      expiresAt,
      holder: 'self',
    },
    { cwd: managedDir }
  );
  assert.deepEqual(
    managedTarget.state.profiles['shared-login'],
    originalSharedProfile,
    'managed lease save must not overwrite the shared login profile'
  );
  assert.equal(
    managedTarget.state.targets.production.promotion.publishLease.leaseId,
    'managed-lease-1'
  );
  assert.equal(
    clearPublishLease(managedTarget, 'managed-lease-1', { cwd: managedDir }),
    true
  );
  const persistedManagedState = JSON.parse(
    fs.readFileSync(path.join(managedDir, '.openxiangda', 'state.json'), 'utf8')
  );
  assert.deepEqual(
    persistedManagedState.profiles['shared-login'],
    originalSharedProfile,
    'managed lease clear must not overwrite the shared login profile'
  );
  assert.equal(
    persistedManagedState.targets.production.promotion?.publishLease,
    undefined
  );
  console.log('publish lease state smoke passed');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
