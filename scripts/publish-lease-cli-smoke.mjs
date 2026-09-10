import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { createPublishClientSessionId } = require('../lib/publish-lease');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openxiangda-publish-lease-cli-'));
const tempHome = path.join(tempRoot, 'home');
const workspace = path.join(tempRoot, 'workspace');
const origin = path.join(tempRoot, 'origin.git');
const profileName = 'mock';
const appType = 'APP_LEASE_CLI';
const leaseId = 'LEASE_CLI_1';
const baselineId = 'BASELINE_CLI_1';
const calls = [];
let workflowPublishCalls = 0;
let renewCalls = 0;
let failNextRenew = false;
let remoteLeaseActive = true;
let activeClientSessionId = null;

const firstSessionId = createPublishClientSessionId({
  CODEX_THREAD_ID: 'thread-a',
});
const secondSessionId = createPublishClientSessionId({
  CODEX_THREAD_ID: 'thread-a',
});
assert.match(
  firstSessionId,
  /^codex:thread-a:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
);
assert.notEqual(
  firstSessionId,
  secondSessionId,
  'each release lifecycle in one Codex task must get a fresh client session'
);

fs.mkdirSync(path.join(tempHome, '.openxiangda'), { recursive: true });
fs.mkdirSync(path.join(workspace, '.openxiangda'), { recursive: true });
fs.writeFileSync(
  path.join(workspace, '.openxiangda', 'state.json'),
  `${JSON.stringify({
    version: 1,
    profiles: {
      [profileName]: {
        appType,
        resources: {
          forms: { customer: { formUuid: 'FORM_CUSTOMER' } },
        },
      },
    },
  }, null, 2)}\n`
);

fs.writeFileSync(path.join(workspace, '.gitignore'), '.openxiangda/\n');
fs.writeFileSync(path.join(workspace, 'package.json'), '{"private":true}\n');
fs.writeFileSync(
  path.join(workspace, 'schema.json'),
  '{"components":[]}\n'
);
fs.writeFileSync(
  path.join(workspace, 'workflow.json'),
  '{"version":"v3","nodes":[],"edges":[]}\n'
);
const initOrigin = spawnSync(
  'git',
  ['init', '--bare', '--initial-branch=main', origin],
  { cwd: tempRoot, encoding: 'utf8' }
);
if (initOrigin.status !== 0) {
  throw new Error(initOrigin.stderr || initOrigin.stdout || 'git init --bare failed');
}
for (const args of [
  ['init', '-b', 'main'],
  ['config', 'user.email', 'smoke@example.com'],
  ['config', 'user.name', 'Smoke'],
  ['add', '.gitignore', 'package.json', 'schema.json', 'workflow.json'],
  ['commit', '-m', 'baseline'],
  ['remote', 'add', 'origin', origin],
  ['push', '-u', 'origin', 'main'],
]) {
  const result = spawnSync('git', args, { cwd: workspace, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`);
  }
}
fs.writeFileSync(path.join(workspace, 'release-source.txt'), 'release source\n');
for (const args of [
  ['add', 'release-source.txt'],
  ['commit', '-m', 'release source'],
  ['push', 'origin', 'main'],
]) {
  const result = spawnSync('git', args, { cwd: workspace, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`);
  }
}
const publishedSourceCommit = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: workspace,
  encoding: 'utf8',
}).stdout.trim();

const readBody = request =>
  new Promise(resolve => {
    let raw = '';
    request.on('data', chunk => {
      raw += chunk;
    });
    request.on('end', () => resolve(raw ? JSON.parse(raw) : {}));
  });

const respond = (response, data, statusCode = 200) => {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ code: statusCode, data }));
};

const assertPublishHeaders = request => {
  assert.equal(request.headers['x-openxiangda-publish-lease-id'], leaseId);
  assert.equal(request.headers['x-openxiangda-change-baseline-id'], baselineId);
  assert.equal(request.headers['x-openxiangda-change-id'], 'change-a');
  assert.equal(
    request.headers['x-openxiangda-client-session-id'],
    activeClientSessionId
  );
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  const body = request.method === 'GET' ? null : await readBody(request);
  calls.push({ method: request.method, path: url.pathname, body });
  const api = `/service/openxiangda-api/v1/apps/${appType}`;

  if (
    request.method === 'POST' &&
    url.pathname === `${api}/forms/FORM_CUSTOMER/schema-storage-plan`
  ) {
    assert.equal(
      calls.some(call => call.path.includes('/publish-lease/acquire')),
      false,
      'form schema-plan must not acquire a publish lease'
    );
    return respond(response, {
      storageMode: 'jsonb',
      operations: [],
      revision: 1,
      etag: '"form-FORM_CUSTOMER-r1"',
      activeFormReleaseHead: {
        releaseId: 'REL_FORM_CUSTOMER_1',
        releaseHash: 'hash-form-customer-r1',
        revision: 1,
      },
    });
  }

  if (request.method === 'POST' && url.pathname === `${api}/change-baselines`) {
    assert.equal(body.changeId, 'change-a');
    assert.match(
      body.clientSessionId,
      /^codex:thread-a:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    activeClientSessionId = body.clientSessionId;
    assert.match(body.sourceBase?.repo || '', /^sha256:[a-f0-9]{64}$/);
    assert.match(body.sourceBase?.baseCommit || '', /^[a-f0-9]{40,64}$/);
    assert.match(body.sourceBase?.treeHash || '', /^[a-f0-9]{40,64}$/);
    return respond(response, {
      baselineId,
      appType,
      changeId: body.changeId,
      clientSessionId: body.clientSessionId,
      sourceBase: body.sourceBase,
      headDigest: 'a'.repeat(64),
      resourceHeads: { Function: {}, Automation: {}, Runtime: {} },
      createdAt: '2026-07-15T08:00:00.000Z',
    });
  }
  if (request.method === 'POST' && url.pathname === `${api}/publish-lease/acquire`) {
    assert.equal(body.changeId, 'change-a');
    assert.equal(body.clientSessionId, activeClientSessionId);
    assert.equal(body.ttlSeconds, 120);
    assert.match(body.baseRevision, /changeBaseline=BASELINE_CLI_1/);
    assert.match(body.baseRevision, new RegExp(`headDigest=${'a'.repeat(64)}`));
    assert.match(body.baseRevision, /sourceTree=[a-f0-9]{40,64}/);
    return respond(response, {
      leaseId,
      appType,
      changeId: body.changeId,
      baseRevision: body.baseRevision,
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
      holder: 'self',
    });
  }
  if (request.method === 'POST' && url.pathname === `${api}/forms`) {
    assertPublishHeaders(request);
    assert.equal(body.name, 'Baseline Form');
    return respond(response, {
      form: { formUuid: 'FORM_BASELINE', name: body.name },
    });
  }
  if (request.method === 'POST' && url.pathname === `${api}/routes`) {
    assertPublishHeaders(request);
    return respond(response, {
      id: 'ROUTE_CONTEXT',
      code: body.code,
      pathPattern: body.pathPattern,
    });
  }
  if (request.method === 'GET' && url.pathname === `${api}/pages/snapshot`) {
    return respond(response, {
      activePageReleaseHead: {
        releaseId: null,
        releaseHash: null,
        headRevision: 0,
        etag: 'page-release-none-r0',
      },
      pages: [],
    });
  }
  if (
    request.method === 'POST' &&
    url.pathname === `${api}/pages/publish`
  ) {
    assertPublishHeaders(request);
    assert.equal(body.expectedRevision, 0);
    assert.deepEqual(body.expectedParent, {
      releaseId: null,
      releaseHash: null,
      headRevision: 0,
    });
    assert.deepEqual(body.expectedRevisions, { dashboard: 0 });
    assert.deepEqual(body.expectedActiveAssets, { dashboard: null });
    assert.equal(body.stage, true);
    assert.equal(body.activate, false);
    return respond(response, {
      items: [
        {
          pageId: 'PAGE_CONTEXT',
          routeKey: 'dashboard',
          legacyFormUuid: 'FORM_PAGE_CONTEXT',
        },
      ],
    });
  }
  if (request.method === 'POST' && url.pathname === `${api}/workflows`) {
    assertPublishHeaders(request);
    assert.equal(body.expectedRevision, 0);
    assert.match(body.idempotencyKey || '', /^openxiangda-wf-[a-f0-9]{64}$/);
    return respond(response, {
      id: 'WORKFLOW_CONTEXT',
      formUuid: body.formUuid,
      resourceCode: body.resourceCode,
      revision: 1,
      etag: '"workflow-WORKFLOW_CONTEXT-r1"',
    });
  }
  if (
    request.method === 'POST' &&
    url.pathname === `${api}/workflows/WORKFLOW_CONTEXT/publish`
  ) {
    assertPublishHeaders(request);
    workflowPublishCalls += 1;
    assert.equal(body.expectedRevision, 1);
    assert.match(body.idempotencyKey || '', /^openxiangda-wf-[a-f0-9]{64}$/);
    if (workflowPublishCalls > 1) {
      response.statusCode = 409;
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          code: 409,
          errorCode: 'WORKFLOW_REVISION_CONFLICT',
          message: 'stale workflow revision',
        })
      );
      return;
    }
    return respond(response, {
      id: 'WORKFLOW_CONTEXT',
      revision: 2,
      etag: '"workflow-WORKFLOW_CONTEXT-r2"',
      isPublished: true,
    });
  }
  if (request.method === 'GET' && url.pathname === `${api}/publish-lease/status`) {
    assert.match(
      url.searchParams.get('clientSessionId') || '',
      /^codex:thread-[ab]:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    if (!remoteLeaseActive) {
      return respond(response, {
        active: false,
        appType,
        holder: null,
        expiresAt: null,
      });
    }
    return respond(response, {
      active: true,
      leaseId,
      appType,
      changeId: 'change-a',
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
      holder: 'self',
    });
  }
  if (
    request.method === 'POST' &&
    url.pathname === `${api}/publish-lease/${leaseId}/renew`
  ) {
    renewCalls += 1;
    assert.equal(body.ttlSeconds, 120);
    if (failNextRenew) {
      failNextRenew = false;
      response.statusCode = 409;
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          code: 409,
          errorCode: 'PUBLISH_LEASE_EXPIRED',
          message: 'lease expired during heartbeat smoke',
        })
      );
      return;
    }
    return respond(response, {
      leaseId,
      appType,
      changeId: 'change-a',
      baseRevision: 'base-renewed',
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
      holder: 'self',
    });
  }
  if (
    request.method === 'POST' &&
    url.pathname === `${api}/publish-lease/${leaseId}/release`
  ) {
    return respond(response, { active: false, leaseId, appType });
  }
  return respond(response, { message: `not found ${request.method} ${url.pathname}` }, 404);
});

const listen = () =>
  new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });

const runOpenXiangda = (args, threadId = 'thread-a') =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(repoRoot, 'bin', 'openxiangda.js'), ...args, '--json'],
      {
        cwd: workspace,
        env: { ...process.env, HOME: tempHome, CODEX_THREAD_ID: threadId },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', code => {
      resolve({ code, stdout, stderr });
    });
  });

const runJson = async (args, threadId = 'thread-a') => {
  const result = await runOpenXiangda(args, threadId);
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || args.join(' '));
  }
  return JSON.parse(result.stdout);
};

const stateFile = path.join(workspace, '.openxiangda', 'state.json');
const ownerFile = path.join(workspace, '.openxiangda', 'worktree-owner.json');
const readState = () => JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const writeState = state => {
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
};

const updateStoredLeaseExpiry = expiresAt => {
  const state = readState();
  state.profiles[profileName].promotion.publishLease.expiresAt = expiresAt;
  writeState(state);
};

try {
  const port = await listen();
  fs.writeFileSync(
    path.join(workspace, '.openxiangda', 'profiles.json'),
    `${JSON.stringify({
      version: 1,
      currentProfile: profileName,
      profiles: {
        [profileName]: {
          name: profileName,
          baseUrl: `http://127.0.0.1:${port}/service`,
          token: { accessToken: 'test-token' },
        },
      },
    }, null, 2)}\n`
  );

  const beforeMissingContext = calls.length;
  const missingContext = await runOpenXiangda([
    'route',
    'create',
    'missing-context',
    '--body-json',
    '{"code":"missing-context","title":"Missing","pathPattern":"/missing"}',
    '--profile',
    profileName,
  ]);
  assert.notEqual(missingContext.code, 0);
  assert.match(missingContext.stderr, /PUBLISH_CONTEXT_REQUIRED/);
  assert.equal(calls.length, beforeMissingContext, 'missing context must perform zero HTTP writes');

  await runJson([
    'route',
    'create',
    'dry-route',
    '--body-json',
    '{"code":"dry-route","title":"Dry","pathPattern":"/dry"}',
    '--dry-run',
    '--profile',
    profileName,
  ]);
  assert.equal(calls.length, beforeMissingContext, 'dry-run must not acquire a lease or write');

  await runJson([
    'form',
    'schema-plan',
    'customer',
    '--schema-json',
    'schema.json',
    '--profile',
    profileName,
  ]);
  assert.equal(
    calls.filter(call => call.path.includes('/publish-lease/acquire')).length,
    0,
    'schema-plan must not acquire a lease'
  );

  const begun = await runJson([
    'release',
    'begin',
    '--change',
    'change-a',
    '--profile',
    profileName,
  ]);
  assert.equal(begun.leaseId, leaseId);
  assert.equal(begun.changeId, 'change-a');
  assert.equal(begun.baselineId, baselineId);
  const recoverySourceRevision = begun.releaseSourceRevision;
  const recoveryClientSessionId = begun.clientSessionId;

  updateStoredLeaseExpiry(new Date(Date.now() + 10_000).toISOString());
  const renewsBeforeNearExpiryWrite = renewCalls;
  const createdForm = await runJson([
    'form',
    'create',
    'baseline_form',
    '--name',
    'Baseline Form',
    '--profile',
    profileName,
  ]);
  assert.equal(createdForm.form.formUuid, 'FORM_BASELINE');
  assert.equal(
    renewCalls,
    renewsBeforeNearExpiryWrite + 1,
    'a near-expiry CLI publish must renew exactly once and continue the write'
  );

  updateStoredLeaseExpiry(new Date(Date.now() + 10_000).toISOString());
  failNextRenew = true;
  const routeWritesBeforeLostLease = calls.filter(
    call => call.method === 'POST' && call.path === `/service/openxiangda-api/v1/apps/${appType}/routes`
  ).length;
  const lostLease = await runOpenXiangda([
    'route',
    'create',
    'lost-lease-route',
    '--body-json',
    '{"code":"lost-lease-route","title":"Lost","pathPattern":"/lost"}',
    '--profile',
    profileName,
  ]);
  assert.notEqual(lostLease.code, 0);
  assert.match(lostLease.stderr, /PUBLISH_LEASE_LOST/);
  assert.equal(
    calls.filter(
      call => call.method === 'POST' && call.path === `/service/openxiangda-api/v1/apps/${appType}/routes`
    ).length,
    routeWritesBeforeLostLease,
    'renew 409 must block the subsequent config write before HTTP'
  );
  updateStoredLeaseExpiry(new Date(Date.now() + 120_000).toISOString());

  await runJson([
    'route',
    'create',
    'route-context',
    '--body-json',
    '{"code":"route-context","title":"Context","pathPattern":"/context"}',
    '--profile',
    profileName,
  ]);
  await runJson([
    'page',
    'publish',
    'dashboard',
    '--entry-url',
    '/assets/dashboard.js',
    '--version',
    '1.0.0',
    '--build-id',
    'build-context',
    '--profile',
    profileName,
  ]);
  await runJson([
    'workflow',
    'create',
    'workflow_context',
    '--form-code',
    'customer',
    '--definition-json',
    'workflow.json',
    '--publish',
    '--profile',
    profileName,
  ]);
  const missingRevisionCallsBefore = calls.length;
  const missingRevision = await runOpenXiangda([
    'workflow',
    'publish',
    'workflow_context',
    '--profile',
    profileName,
  ]);
  assert.notEqual(missingRevision.code, 0);
  assert.match(missingRevision.stderr, /WORKFLOW_REVISION_REQUIRED/);
  assert.equal(
    calls.length,
    missingRevisionCallsBefore,
    'missing Workflow revision must fail before HTTP'
  );
  const staleCallsBefore = workflowPublishCalls;
  const staleWorkflow = await runOpenXiangda([
    'workflow',
    'publish',
    'workflow_context',
    '--expected-revision',
    '1',
    '--profile',
    profileName,
  ]);
  assert.notEqual(staleWorkflow.code, 0);
  assert.match(staleWorkflow.stderr, /stale workflow revision/);
  assert.equal(
    workflowPublishCalls,
    staleCallsBefore + 1,
    'stale Workflow 409 must not be retried'
  );
  assert.equal(
    calls.filter(call => call.path.endsWith('/change-baselines')).length,
    1,
    'stored cross-process context must reuse one baseline'
  );
  assert.equal(
    calls.filter(call => call.path.endsWith('/publish-lease/acquire')).length,
    1,
    'stored cross-process context must reuse one lease'
  );

  const foreignEnd = await runOpenXiangda(
    ['release', 'end', '--profile', profileName, '--json'],
    'thread-b'
  );
  assert.notEqual(foreignEnd.code, 0);
  assert.match(foreignEnd.stderr, /RELEASE_RECONCILIATION_REMOTE_ACTIVE/);
  assert.equal(
    calls.filter(call => call.path.endsWith(`/${leaseId}/release`)).length,
    0,
    'a different Codex task must not release the stored lease'
  );
  const foreignIntegration = await runJson(
    ['release', 'integration-status', '--profile', profileName],
    'thread-b'
  );
  assert.equal(
    foreignIntegration.integrated,
    true,
    'a different task may inspect frozen lineage without gaining write authority'
  );

  const status = await runJson(['release', 'status', '--profile', profileName]);
  assert.equal(status.remote.active, true);
  assert.equal(status.local.leaseId, leaseId);
  assert.equal(fs.realpathSync(status.local.workspace.cwd), fs.realpathSync(workspace));
  assert.equal(status.local.workspace.threadId, 'thread-a');
  assert.equal(status.localOwnedByCurrentSession, true);

  const renewed = await runJson(['release', 'renew', '--profile', profileName]);
  assert.equal(renewed.leaseId, leaseId);
  assert.equal(renewed.baseRevision, 'base-renewed');

  const ownerBeforeWrongLease = fs.readFileSync(ownerFile, 'utf8');
  const wrongLeaseEnd = await runOpenXiangda([
    'release',
    'end',
    'LEASE_WRONG',
    '--profile',
    profileName,
  ]);
  assert.notEqual(wrongLeaseEnd.code, 0);
  assert.match(wrongLeaseEnd.stderr, /RELEASE_LEASE_ID_MISMATCH/);
  const stateAfterWrongLease = readState();
  assert.equal(
    stateAfterWrongLease.profiles[profileName].promotion.publishLease.leaseId,
    leaseId,
    'an explicit wrong lease id must preserve the real stored lease'
  );
  assert.equal(
    stateAfterWrongLease.profiles[profileName].promotion.changeBaseline.baselineId,
    baselineId,
    'an explicit wrong lease id must preserve the frozen baseline'
  );
  assert.equal(
    fs.readFileSync(ownerFile, 'utf8'),
    ownerBeforeWrongLease,
    'an explicit wrong lease id must preserve the real worktree owner'
  );

  const foreignActiveEnd = await runOpenXiangda(
    ['release', 'end', '--profile', profileName],
    'thread-b'
  );
  assert.notEqual(foreignActiveEnd.code, 0);
  assert.match(foreignActiveEnd.stderr, /RELEASE_RECONCILIATION_REMOTE_ACTIVE/);
  assert.equal(
    readState().profiles[profileName].promotion.changeBaseline.baselineId,
    baselineId,
    'a foreign task must preserve evidence while the remote lease is active'
  );

  remoteLeaseActive = false;
  updateStoredLeaseExpiry(new Date(Date.now() - 1_000).toISOString());
  const ended = await runJson(
    ['release', 'end', '--profile', profileName],
    'thread-b'
  );
  assert.equal(ended.active, false);
  assert.equal(ended.reconciliationOnly, true);
  assert.equal(ended.integration.sourceCommit, publishedSourceCommit);
  assert.equal(
    fs.existsSync(ownerFile),
    false,
    'successful foreign reconciliation must release the stale worktree owner'
  );
  const state = JSON.parse(
    fs.readFileSync(path.join(workspace, '.openxiangda', 'state.json'), 'utf8')
  );
  assert.equal(state.profiles[profileName].promotion?.publishLease, undefined);
  assert.equal(state.profiles[profileName].promotion?.changeBaseline, undefined);

  remoteLeaseActive = true;
  const missingRecovery = await runOpenXiangda([
    'release',
    'end',
    '--change',
    'change-a',
    '--profile',
    profileName,
  ]);
  assert.notEqual(missingRecovery.code, 0);
  assert.match(missingRecovery.stderr, /PUBLISH_LEASE_RECOVERY_REQUIRED/);
  assert.equal(
    calls.filter(call => call.path.endsWith(`/${leaseId}/release`)).length,
    0,
    'missing local state must never be misreported as inactive or release an unaudited lease'
  );

  const recoveryDir = path.join(
    workspace,
    '.openxiangda',
    'releases',
    'change-a'
  );
  fs.mkdirSync(recoveryDir, { recursive: true });
  fs.writeFileSync(
    path.join(recoveryDir, 'execution.json'),
    `${JSON.stringify({
      schemaVersion: 'openxiangda_release_execution_v1',
      appType,
      profile: profileName,
      changeId: 'change-a',
      status: 'failed',
      releaseContext: {
        appType,
        profile: profileName,
        changeId: 'change-a',
        leaseId,
        baselineId,
        clientSessionId: recoveryClientSessionId,
        releaseSourceRevision: recoverySourceRevision,
      },
      steps: [],
    }, null, 2)}\n`
  );
  const recoveredEnd = await runJson([
    'release',
    'end',
    '--change',
    'change-a',
    '--profile',
    profileName,
  ]);
  assert.equal(recoveredEnd.active, false);
  assert.equal(recoveredEnd.recovered, true);
  assert.equal(recoveredEnd.integration.sourceCommit, publishedSourceCommit);
  const recoveredIntegration = await runJson([
    'release',
    'integration-status',
    '--change',
    'change-a',
    '--profile',
    profileName,
  ]);
  assert.equal(
    recoveredIntegration.integrated,
    true,
    'integration-status should recover frozen source lineage from a completed release journal'
  );
  const managedDeploymentId = 'deployment-managed-1';
  const managedRecoveryDir = path.join(recoveryDir, managedDeploymentId);
  fs.mkdirSync(managedRecoveryDir, { recursive: true });
  fs.renameSync(
    path.join(recoveryDir, 'execution.json'),
    path.join(managedRecoveryDir, 'execution.json')
  );
  const managedDeploymentIntegration = await runJson([
    'release',
    'integration-status',
    '--change',
    'change-a',
    '--deployment-id',
    managedDeploymentId,
    '--profile',
    profileName,
  ]);
  assert.equal(
    managedDeploymentIntegration.integrated,
    true,
    'integration-status should recover managed candidate lineage from its deployment journal'
  );
  const managedShipFile = path.join(recoveryDir, 'ship.json');
  fs.writeFileSync(
    managedShipFile,
    `${JSON.stringify({
      schemaVersion: 'openxiangda_managed_ship_v1',
      changeId: 'change-a',
      status: 'completed',
      sourceRevision: recoverySourceRevision,
      productionDeploymentId: 'deployment-not-needed-when-ship-has-lineage',
    }, null, 2)}\n`
  );
  const managedShipIntegration = await runJson([
    'release',
    'integration-status',
    '--change',
    'change-a',
    '--profile',
    profileName,
  ]);
  assert.equal(
    managedShipIntegration.integrated,
    true,
    'integration-status --change should recover managed lineage directly from ship.json'
  );
  assert.match(
    managedShipIntegration.lineageSource,
    /ship\.json#sourceRevision$/,
  );

  fs.writeFileSync(
    managedShipFile,
    `${JSON.stringify({
      schemaVersion: 'openxiangda_managed_ship_v1',
      changeId: 'change-a',
      status: 'completed',
      productionDeploymentId: managedDeploymentId,
    }, null, 2)}\n`
  );
  const inferredDeploymentIntegration = await runJson([
    'release',
    'integration-status',
    '--change',
    'change-a',
    '--profile',
    profileName,
  ]);
  assert.equal(
    inferredDeploymentIntegration.integrated,
    true,
    'integration-status --change should follow ship.json to the production deployment execution journal'
  );
  assert.match(
    inferredDeploymentIntegration.lineageSource,
    new RegExp(`${managedDeploymentId}/execution\\.json$`),
  );

  const missingLineageChange = 'change-with-missing-lineage';
  const missingLineageDir = path.join(
    workspace,
    '.openxiangda',
    'releases',
    missingLineageChange,
  );
  fs.mkdirSync(missingLineageDir, { recursive: true });
  fs.writeFileSync(
    path.join(missingLineageDir, 'ship.json'),
    `${JSON.stringify({
      schemaVersion: 'openxiangda_managed_ship_v1',
      changeId: missingLineageChange,
      status: 'completed',
      productionDeploymentId: 'missing-production-deployment',
    }, null, 2)}\n`
  );
  const missingLineage = await runOpenXiangda([
    'release',
    'integration-status',
    '--change',
    missingLineageChange,
    '--profile',
    profileName,
  ]);
  assert.notEqual(missingLineage.code, 0);
  assert.match(
    missingLineage.stderr,
    /ship\.json \(缺少 sourceRevision\)/,
    'lineage recovery failure should identify the missing ship field',
  );
  assert.match(
    missingLineage.stderr,
    /missing-production-deployment\/execution\.json \(文件不存在\)/,
    'lineage recovery failure should identify the missing deployment journal',
  );
  assert.doesNotMatch(
    missingLineage.stderr,
    /请同时传入 --change/,
    'lineage recovery failure must not ask for an already supplied --change',
  );
  assert.equal(
    calls.filter(call => call.path.endsWith(`/${leaseId}/release`)).length,
    1,
    'a self-owned remote lease should be recoverable from the private execution journal'
  );
  assert.equal(
    calls.some(call => call.path === `/service/openxiangda-api/v1/apps/${appType}/snapshot`),
    false,
    'release begin must derive baseRevision from the frozen baseline without fetching an app snapshot'
  );
  assert.ok(
    renewCalls >= 3,
    'near-expiry success, near-expiry failure, and explicit renew must all be observed'
  );
  const renewPath = `/service/openxiangda-api/v1/apps/${appType}/publish-lease/${leaseId}/renew`;
  assert.deepEqual(
    calls
      .filter(call => call.path !== renewPath)
      .map(call => `${call.method} ${call.path}`),
    [
      `POST /service/openxiangda-api/v1/apps/${appType}/forms/FORM_CUSTOMER/schema-storage-plan`,
      `POST /service/openxiangda-api/v1/apps/${appType}/change-baselines`,
      `POST /service/openxiangda-api/v1/apps/${appType}/publish-lease/acquire`,
      `POST /service/openxiangda-api/v1/apps/${appType}/forms`,
      `POST /service/openxiangda-api/v1/apps/${appType}/routes`,
      `GET /service/openxiangda-api/v1/apps/${appType}/pages/snapshot`,
      `POST /service/openxiangda-api/v1/apps/${appType}/pages/publish`,
      `POST /service/openxiangda-api/v1/apps/${appType}/workflows`,
      `POST /service/openxiangda-api/v1/apps/${appType}/workflows/WORKFLOW_CONTEXT/publish`,
      `POST /service/openxiangda-api/v1/apps/${appType}/workflows/WORKFLOW_CONTEXT/publish`,
      `GET /service/openxiangda-api/v1/apps/${appType}/publish-lease/status`,
      `GET /service/openxiangda-api/v1/apps/${appType}/publish-lease/status`,
      `GET /service/openxiangda-api/v1/apps/${appType}/publish-lease/status`,
      `GET /service/openxiangda-api/v1/apps/${appType}/publish-lease/status`,
      `GET /service/openxiangda-api/v1/apps/${appType}/publish-lease/status`,
      `GET /service/openxiangda-api/v1/apps/${appType}/publish-lease/status`,
      `POST /service/openxiangda-api/v1/apps/${appType}/publish-lease/${leaseId}/release`,
    ]
  );
  console.log('publish lease CLI smoke passed');
} finally {
  server.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
