import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const sdd = require(path.join(repoRoot, 'lib', 'sdd.js'));
const {
  normalizeBindingContracts,
  resourceBindingContractHash,
} = require(path.join(repoRoot, 'lib', 'resource-binding-contract.js'));
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openxiangda-app-release-'));
const tempHome = path.join(tempRoot, 'home');
const workspace = path.join(tempRoot, 'workspace');
const origin = path.join(tempRoot, 'origin.git');
const profileName = 'mock';
const appType = 'APP_RELEASE_SMOKE';
const parentReleaseId = '60000000-0000-4000-8000-000000000001';
const preparedReleaseId = '60000000-0000-4000-8000-000000000002';
const historicalReleaseId = '60000000-0000-4000-8000-000000000003';
const leaseId = '70000000-0000-4000-8000-000000000001';
const baselineId = '80000000-0000-4000-8000-000000000001';
const environmentId = '90000000-0000-4000-8000-000000000001';
const candidateId = '90000000-0000-4000-8000-000000000002';
const deploymentId = '90000000-0000-4000-8000-000000000003';
const manifestHash = 'd'.repeat(64);
const calls = [];
let mode = 'normal';
let preparedResources = null;
let frozenRepositoryIdentity = null;

const frozenResources = [
  {
    kind: 'RuntimeRelease',
    identity: { releaseId: 'RUNTIME_RELEASE_2' },
    action: 'upsert',
    hash: '1'.repeat(64),
    revision: { releaseId: 'RUNTIME_RELEASE_2', buildId: 'runtime-build-2' },
  },
  {
    kind: 'PageRelease',
    identity: { releaseId: 'PAGE_RELEASE_2' },
    action: 'upsert',
    hash: '2'.repeat(64),
    revision: { releaseId: 'PAGE_RELEASE_2', buildId: 'page-build-2' },
  },
  {
    kind: 'BackendRelease',
    identity: { releaseId: 'BACKEND_RELEASE_2' },
    action: 'upsert',
    hash: '3'.repeat(64),
    revision: { releaseId: 'BACKEND_RELEASE_2' },
  },
  {
    kind: 'FormRelease',
    identity: { releaseId: 'FORM_RELEASE_2', formUuid: 'FORM_CUSTOMER' },
    action: 'upsert',
    hash: '4'.repeat(64),
    revision: { releaseId: 'FORM_RELEASE_2', formUuid: 'FORM_CUSTOMER' },
  },
  {
    kind: 'FormRelease',
    identity: { releaseId: 'FORM_ORDER_2', formUuid: 'FORM_ORDER' },
    action: 'upsert',
    hash: '5'.repeat(64),
    revision: { releaseId: 'FORM_ORDER_2', formUuid: 'FORM_ORDER' },
  },
];

const stagedResources = [
  {
    kind: 'RuntimeRelease',
    releaseId: 'RUNTIME_RELEASE_3',
    hash: '6'.repeat(64),
    revision: { releaseId: 'RUNTIME_RELEASE_3', buildId: 'runtime-build-3' },
    metadata: {
      buildId: 'runtime-build-3',
      assetBaseUrl: 'https://cdn.example.com/runtime-build-3/',
    },
  },
  {
    kind: 'PageRelease',
    identity: { releaseId: 'PAGE_RELEASE_3' },
    action: 'update',
    hash: '7'.repeat(64),
    revision: { releaseId: 'PAGE_RELEASE_3', buildId: 'page-build-3' },
  },
  {
    kind: 'FormRelease',
    releaseId: 'FORM_RELEASE_3',
    formUuid: 'FORM_CUSTOMER',
    hash: '8'.repeat(64),
    revision: { releaseId: 'FORM_RELEASE_3', formUuid: 'FORM_CUSTOMER' },
  },
];
const v2StagedResources = [
  {
    kind: 'BackendRelease',
    releaseId: 'BACKEND_RELEASE_3',
    hash: '9'.repeat(64),
    metadata: { protocolVersion: 'backend_release_v2' },
  },
];

const overlaidResources = [
  {
    kind: 'RuntimeRelease',
    identity: { releaseId: 'RUNTIME_RELEASE_3' },
    action: 'upsert',
    hash: '6'.repeat(64),
    revision: { releaseId: 'RUNTIME_RELEASE_3', buildId: 'runtime-build-3' },
    metadata: {
      buildId: 'runtime-build-3',
      assetBaseUrl: 'https://cdn.example.com/runtime-build-3/',
    },
  },
  {
    kind: 'PageRelease',
    identity: { releaseId: 'PAGE_RELEASE_3' },
    action: 'update',
    hash: '7'.repeat(64),
    revision: { releaseId: 'PAGE_RELEASE_3', buildId: 'page-build-3' },
  },
  frozenResources[2],
  {
    kind: 'FormRelease',
    identity: { releaseId: 'FORM_RELEASE_3', formUuid: 'FORM_CUSTOMER' },
    action: 'upsert',
    hash: '8'.repeat(64),
    revision: { releaseId: 'FORM_RELEASE_3', formUuid: 'FORM_CUSTOMER' },
  },
  frozenResources[4],
];
const stagedResourcesFile = path.join(tempRoot, 'staged-resources.json');
fs.writeFileSync(
  stagedResourcesFile,
  `${JSON.stringify(stagedResources, null, 2)}\n`,
  'utf8'
);

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(',')}}`;
}

const capturePayload = {
  schemaVersion: 1,
  appType,
  parentReleaseId,
  source: {
    capturedAt: '2026-07-15T13:00:00.000Z',
    consistency: 'repeatable_read_read_only',
  },
  heads: {
    runtimeReleaseId: frozenResources[0].identity.releaseId,
    pageReleaseId: frozenResources[1].identity.releaseId,
    backendReleaseId: frozenResources[2].identity.releaseId,
  },
  resources: frozenResources,
};
const captureHash = crypto
  .createHash('sha256')
  .update(canonicalJson(capturePayload))
  .digest('hex');

function write(relativePath, value) {
  const file = path.join(workspace, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

function writeJson(relativePath, value) {
  write(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function git(args, cwd = workspace) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr || result.stdout);
  }
}

fs.mkdirSync(path.join(tempHome, '.openxiangda'), { recursive: true });
fs.mkdirSync(workspace, { recursive: true });
write('.gitignore', '.openxiangda/\n');
writeJson('package.json', { private: true });
write(
  'app-workspace.config.ts',
  'export default { runtimeMode: "react-spa" };\n'
);
git(['init', '--bare', '--initial-branch=main', origin], tempRoot);
for (const args of [
  ['init', '-b', 'main'],
  ['config', 'user.email', 'smoke@example.com'],
  ['config', 'user.name', 'Smoke'],
  ['add', '.'],
  ['commit', '-m', 'app release fixture'],
  ['remote', 'add', 'origin', origin],
  ['push', '-u', 'origin', 'main'],
]) {
  git(args);
}
writeJson('.openxiangda/state.json', {
  version: 1,
  profiles: { [profileName]: { appType, resources: {} } },
});

const readBody = request =>
  new Promise(resolve => {
    let raw = '';
    request.on('data', chunk => {
      raw += chunk;
    });
    request.on('end', () => resolve(raw ? JSON.parse(raw) : {}));
  });

function respond(response, data, status = 200, errorCode) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.end(
    JSON.stringify(
      status >= 400
        ? { code: status, errorCode, message: data.message, data: data.data || null }
        : { code: status, data }
    )
  );
}

function capture() {
  return {
    ...structuredClone(capturePayload),
    captureHash: mode === 'corrupt-capture' ? '0'.repeat(64) : captureHash,
  };
}

function releaseDetail(status, resources = frozenResources, protocolVersion) {
  return {
    id: preparedReleaseId,
    appType,
    status,
    parentReleaseId,
    manifestHash,
    verificationHash: status === 'prepared' ? null : 'f'.repeat(64),
    manifestJson: { schemaVersion: 1, resources: structuredClone(resources) },
    ...(protocolVersion ? { protocolVersion } : {}),
  };
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  const body = request.method === 'GET' ? {} : await readBody(request);
  calls.push({ mode, method: request.method, path: url.pathname, body });
  const api = `/service/openxiangda-api/v1/apps/${appType}`;

  if (request.method === 'GET' && url.pathname === `${api}/secrets/capabilities`) {
    return respond(response, {
      enabled: true,
      contractVersion: 'app_function_secrets_v1',
      runtimeContractVersion: 'trusted_node_v2',
      app_function_secrets_v1: true,
      trusted_node_v2: true,
      backend_release_v2: true,
      atomic_staged_children_v2: true,
    });
  }

  if (request.method === 'POST' && url.pathname === `${api}/change-baselines`) {
    return respond(response, {
      baselineId,
      appType,
      changeId: body.changeId,
      clientSessionId: body.clientSessionId,
      sourceBase: body.sourceBase,
      headDigest: 'a'.repeat(64),
      resourceHeads: { Function: {}, Automation: {}, Runtime: {} },
    });
  }
  if (request.method === 'POST' && url.pathname === `${api}/publish-lease/acquire`) {
    return respond(response, {
      leaseId,
      appType,
      changeId: body.changeId,
      clientSessionId: body.clientSessionId,
      baseRevision: body.baseRevision,
      expiresAt: '2099-07-15T12:00:00.000Z',
      holder: 'self',
    });
  }
  if (
    request.method === 'POST' &&
    url.pathname === `${api}/publish-lease/${leaseId}/release`
  ) {
    return respond(response, { active: false, appType });
  }
  if (request.method === 'GET' && url.pathname === `${api}/app-releases/capture`) {
    return respond(response, capture());
  }
  if (
    request.method === 'GET' &&
    url.pathname === `${api}/runtime/releases/head`
  ) {
    return respond(response, {
      activeRuntimeReleaseId: 'RUNTIME_RELEASE_3',
      activeRuntimeBuildId: 'runtime-build-3',
    });
  }
  if (
    request.method === 'GET' &&
    url.pathname === `${api}/automations`
  ) {
    return respond(response, {
      items: [
        {
          id: 'AUTOMATION_SYNC_CUSTOMER',
          resourceCode: 'sync_customer',
          version: 3,
          isPublished: true,
          isEnabled: true,
          updatedAt: '2026-07-15T13:05:00.000Z',
        },
      ],
      total: 1,
    });
  }
  if (
    request.method === 'GET' &&
    url.pathname ===
      `${api}/automations/AUTOMATION_SYNC_CUSTOMER`
  ) {
    return respond(response, {
      id: 'AUTOMATION_SYNC_CUSTOMER',
      resourceCode: 'sync_customer',
      definitionJson: {
        resourceBindings: {
          forms: {
            customer:
              mode === 'binding-mismatch'
                ? 'FORM_CUSTOMER_STALE'
                : 'FORM_CUSTOMER',
          },
        },
      },
    });
  }
  if (request.method === 'GET' && url.pathname === `${api}/app-releases/head`) {
    return respond(response, {
      appType,
      activeAppReleaseId: parentReleaseId,
      release: {
        id: parentReleaseId,
        status: 'active',
        manifestJson: {
          schemaVersion: 1,
          resources: frozenResources,
          largePayload: 'x'.repeat(100_000),
        },
      },
    });
  }
  if (request.method === 'GET' && url.pathname === `${api}/app-releases`) {
    return respond(response, {
      appType,
      items: [
        { id: parentReleaseId, status: 'active' },
        { id: preparedReleaseId, status: 'prepared' },
      ],
    });
  }
  if (
    request.method === 'GET' &&
    url.pathname === `${api}/app-releases/${preparedReleaseId}`
  ) {
    return respond(
      response,
      releaseDetail('prepared', preparedResources || frozenResources)
    );
  }
  if (
    request.method === 'GET' &&
    url.pathname ===
      `${api}/app-releases/${preparedReleaseId}/post-commit`
  ) {
    return respond(response, {
      status: 'completed',
      pending: 0,
      processing: 0,
      completed: 4,
      failed: 0,
    });
  }
  if (
    request.method === 'POST' &&
    url.pathname ===
      `${api}/app-releases/${preparedReleaseId}/post-commit/retry`
  ) {
    return respond(response, {
      status: 'completed',
      pending: 0,
      processing: 0,
      completed: 4,
      failed: 0,
      processed: [],
      retryable: false,
    });
  }
  if (
    request.method === 'GET' &&
    url.pathname ===
      `${api}/app-releases/${parentReleaseId}/diff/${preparedReleaseId}`
  ) {
    return respond(response, {
      fromReleaseId: parentReleaseId,
      toReleaseId: preparedReleaseId,
      resources: [],
    });
  }
  if (request.method === 'POST' && url.pathname === `${api}/app-releases`) {
    preparedResources = body.resources;
    return respond(
      response,
      releaseDetail('prepared', body.resources, body.protocolVersion)
    );
  }
  if (
    request.method === 'POST' &&
    url.pathname === `${api}/app-releases/${preparedReleaseId}/verify`
  ) {
    if (mode === 'moved') {
      return respond(
        response,
        { message: 'child release head moved after capture' },
        409,
        'APP_RELEASE_CHILD_MOVED'
      );
    }
    return respond(
      response,
      releaseDetail('verified', body.resources, body.protocolVersion)
    );
  }
  if (
    request.method === 'POST' &&
    url.pathname === `${api}/app-releases/${preparedReleaseId}/activate`
  ) {
    if (mode === 'adoption-mismatch') {
      return respond(
        response,
        {
          message:
            '新旧发布会话的源码冻结基线或 Active Head 快照不等价，拒绝接管 verified App Release。',
          data: {
            originalBaselineId: 'baseline-old',
            currentBaselineId: baselineId,
            mismatchedFields: [
              'resourceHeads.Function.sync_customer.fields.definitionHash',
            ],
            mismatchCount: 1,
          },
        },
        409,
        'APP_RELEASE_ADOPTION_BASELINE_MISMATCH'
      );
    }
    return respond(
      response,
      releaseDetail('active', frozenResources, body.protocolVersion)
    );
  }
  if (request.method === 'POST' && url.pathname === `${api}/app-releases/rollback`) {
    return respond(response, {
      ...releaseDetail('prepared'),
      targetReleaseId: body.targetReleaseId,
      reason: body.reason,
    });
  }
  if (
    request.method === 'POST' &&
    url.pathname === `${api}/app-releases/${preparedReleaseId}/abort`
  ) {
    return respond(response, { ...releaseDetail('aborted'), reason: body.reason });
  }
  return respond(
    response,
    { message: `unexpected ${request.method} ${url.pathname}` },
    500,
    'UNEXPECTED_CALL'
  );
});

const listen = () =>
  new Promise(resolve =>
    server.listen(0, '127.0.0.1', () => resolve(server.address().port))
  );

const runCli = args =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(repoRoot, 'bin', 'openxiangda.js'), ...args],
      {
        cwd: workspace,
        env: {
          ...process.env,
          HOME: tempHome,
          CODEX_THREAD_ID: 'app-release-cli-smoke',
        },
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
    child.on('close', code => resolve({ code, stdout, stderr }));
  });

function freezeBaselineToRepositoryAlias() {
  const stateFile = path.join(workspace, '.openxiangda', 'state.json');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const baseline =
    state.profiles?.[profileName]?.promotion?.changeBaseline;
  const revision = baseline?.releaseSourceRevision;
  const primary = revision?.repositoryId || revision?.repo;
  const canonical = revision?.repoAliases?.find(alias => alias !== primary);
  assert.ok(canonical, 'release fixture must expose a repository alias');
  baseline.sourceBase.repo = canonical;
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
  frozenRepositoryIdentity = { canonical, primary };
  return frozenRepositoryIdentity;
}

function appCallsSince(start) {
  return calls
    .slice(start)
    .filter(call => call.path.includes('/app-releases'));
}

function assertReleaseControl(body, reference) {
  assert.equal(body.publishLeaseId, leaseId);
  assert.equal(body.baselineId, baselineId);
  assert.equal(body.changeId, 'app-release-smoke');
  assert.ok(body.clientSessionId);
  assert.ok(body.sourceRepositoryId.startsWith('sha256:'));
  assert.equal(body.sourceRevision.repositoryId, body.sourceRepositoryId);
  if (frozenRepositoryIdentity) {
    assert.equal(
      body.sourceRepositoryId,
      frozenRepositoryIdentity.canonical
    );
    assert.ok(
      body.sourceRevision.repoAliases.includes(
        frozenRepositoryIdentity.primary
      )
    );
  }
  assert.ok(body.sourceRevision.baseCommit);
  assert.ok(body.sourceRevision.treeHash);
  if (reference) {
    assert.equal(body.clientSessionId, reference.clientSessionId);
    assert.equal(body.sourceRepositoryId, reference.sourceRepositoryId);
    assert.deepEqual(body.sourceRevision, reference.sourceRevision);
  }
}

try {
  const port = await listen();
  fs.writeFileSync(
    path.join(tempHome, '.openxiangda', 'profiles.json'),
    `${JSON.stringify(
      {
        version: 1,
        currentProfile: profileName,
        profiles: {
          [profileName]: {
            baseUrl: `http://127.0.0.1:${port}/service`,
            token: { accessToken: 'test-token' },
          },
        },
      },
      null,
      2
    )}\n`
  );

  const captureStart = calls.length;
  const captured = await runCli([
    'release',
    'app-capture',
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(captured.code, 0, captured.stderr || captured.stdout);
  assert.equal(JSON.parse(captured.stdout).captureHash, captureHash);
  assert.deepEqual(appCallsSince(captureStart).map(call => call.method), ['GET']);
  assert.ok(appCallsSince(captureStart)[0].path.endsWith('/app-releases/capture'));

  mode = 'corrupt-capture';
  const corruptCapture = await runCli([
    'release',
    'app-capture',
    '--profile',
    profileName,
    '--json',
  ]);
  assert.notEqual(corruptCapture.code, 0);
  assert.match(corruptCapture.stderr, /APP_RELEASE_CAPTURE_HASH_MISMATCH/);
  mode = 'normal';

  const noLeaseStart = calls.length;
  const noLease = await runCli([
    'release',
    'app-finalize',
    '--profile',
    profileName,
    '--json',
  ]);
  assert.notEqual(noLease.code, 0);
  assert.match(noLease.stderr, /PUBLISH_CONTEXT_REQUIRED/);
  assert.equal(calls.length, noLeaseStart, 'missing lease must fail before capture or write');

  const begun = await runCli([
    'release',
    'begin',
    '--change',
    'app-release-smoke',
    '--profile',
    profileName,
    '--freeze-app-capture',
    '--json',
  ]);
  assert.equal(begun.code, 0, begun.stderr || begun.stdout);
  freezeBaselineToRepositoryAlias();

  const invalidOverlays = [
    {
      value: [{ kind: 'MutableResource', releaseId: 'BAD', hash: '9'.repeat(64) }],
      error: /APP_RELEASE_STAGED_RESOURCE_KIND_UNSUPPORTED/,
    },
    {
      value: [{ kind: 'RuntimeRelease', hash: '9'.repeat(64) }],
      error: /APP_RELEASE_STAGED_RESOURCE_IDENTITY_INVALID/,
    },
    {
      value: [{ kind: 'RuntimeRelease', releaseId: 'RUNTIME_RELEASE_3' }],
      error: /APP_RELEASE_STAGED_RESOURCE_HASH_INVALID/,
    },
    {
      value: [
        {
          kind: 'RuntimeRelease',
          releaseId: 'RUNTIME_RELEASE_3',
          hash: '9'.repeat(64),
        },
        {
          kind: 'RuntimeRelease',
          releaseId: 'RUNTIME_RELEASE_4',
          hash: 'a'.repeat(64),
        },
      ],
      error: /APP_RELEASE_STAGED_RESOURCE_DUPLICATE/,
    },
  ];
  for (const invalid of invalidOverlays) {
    const invalidStart = calls.length;
    const result = await runCli([
      'release',
      'app-prepare',
      '--change',
      'app-release-smoke',
      '--staged-resources-json',
      JSON.stringify(invalid.value),
      '--profile',
      profileName,
      '--json',
    ]);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, invalid.error);
    assert.equal(
      calls.length,
      invalidStart,
      'invalid overlay must fail before capture or write'
    );
  }

  const unchangedOverlayStart = calls.length;
  const unchangedOverlay = await runCli([
    'release',
    'app-prepare',
    '--change',
    'app-release-smoke',
    '--staged-resources-json',
    JSON.stringify([frozenResources[0]]),
    '--profile',
    profileName,
    '--json',
  ]);
  assert.notEqual(unchangedOverlay.code, 0);
  assert.match(
    unchangedOverlay.stderr,
    /APP_RELEASE_STAGED_RESOURCE_NOT_CHANGED/
  );
  assert.deepEqual(
    appCallsSince(unchangedOverlayStart).map(call => call.method),
    ['GET'],
    'app-prepare may only perform the read-only capture before rejecting unchanged staged entries'
  );

  const prepareOverlayStart = calls.length;
  const overlayPrepared = await runCli([
    'release',
    'app-prepare',
    '--change',
    'app-release-smoke',
    '--staged-resources-json',
    JSON.stringify(stagedResources),
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(
    overlayPrepared.code,
    0,
    overlayPrepared.stderr || overlayPrepared.stdout
  );
  const prepareOverlayCalls = appCallsSince(prepareOverlayStart);
  assert.deepEqual(
    prepareOverlayCalls.map(call => [
      call.method,
      call.path.split('/app-releases')[1],
    ]),
    [
      ['GET', '/capture'],
      ['POST', ''],
    ]
  );
  assert.deepEqual(prepareOverlayCalls[1].body.resources, overlaidResources);

  const explicitActivateStart = calls.length;
  const explicitActivated = await runCli([
    'release',
    'app-activate',
    preparedReleaseId,
    '--change',
    'app-release-smoke',
    '--activate-staged-children',
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(
    explicitActivated.code,
    0,
    explicitActivated.stderr || explicitActivated.stdout
  );
  const explicitActivateCalls = appCallsSince(explicitActivateStart);
  assert.deepEqual(
    explicitActivateCalls.map(call => [
      call.method,
      call.path.split('/app-releases')[1],
    ]),
    [
      ['GET', `/${preparedReleaseId}`],
      ['GET', '/capture'],
      ['POST', `/${preparedReleaseId}/activate`],
    ]
  );
  assert.equal(explicitActivateCalls[2].body.activateStagedChildren, true);

  const missingBreakGlassReasonStart = calls.length;
  const missingBreakGlassReason = await runCli([
    'release',
    'app-activate',
    preparedReleaseId,
    '--change',
    'app-release-smoke',
    '--activate-staged-children',
    '--break-glass-adopt-verified-root',
    '--reason',
    'too short',
    '--profile',
    profileName,
    '--json',
  ]);
  assert.notEqual(missingBreakGlassReason.code, 0);
  assert.match(
    missingBreakGlassReason.stderr,
    /BREAK_GLASS_REASON_REQUIRED/
  );
  assert.equal(
    calls.length,
    missingBreakGlassReasonStart,
    'invalid break-glass authority must fail before any API call'
  );

  const breakGlassStart = calls.length;
  const breakGlassReason =
    '历史工作区 verified Root 已完成离线核验，执行平台管理员应急接管';
  const breakGlassActivated = await runCli([
    'release',
    'app-activate',
    preparedReleaseId,
    '--change',
    'app-release-smoke',
    '--activate-staged-children',
    '--break-glass-adopt-verified-root',
    '--reason',
    breakGlassReason,
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(
    breakGlassActivated.code,
    0,
    breakGlassActivated.stderr || breakGlassActivated.stdout
  );
  const breakGlassCalls = appCallsSince(breakGlassStart);
  assert.deepEqual(
    breakGlassCalls.map(call => [
      call.method,
      call.path.split('/app-releases')[1],
    ]),
    [
      ['GET', `/${preparedReleaseId}`],
      ['POST', `/${preparedReleaseId}/activate`],
    ],
    'break-glass adoption must skip workspace capture/scope compatibility checks'
  );
  assert.equal(
    breakGlassCalls[1].body.breakGlassAdoptVerifiedRoot,
    true
  );
  assert.equal(breakGlassCalls[1].body.breakGlassReason, breakGlassReason);
  assert.equal(breakGlassCalls[1].body.activateStagedChildren, true);

  const forceActivateStart = calls.length;
  const forceActivated = await runCli([
    'release',
    'app-activate',
    preparedReleaseId,
    '--force-activate-without-validation',
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(
    forceActivated.code,
    0,
    forceActivated.stderr || forceActivated.stdout
  );
  const forceActivateCalls = appCallsSince(forceActivateStart);
  assert.deepEqual(
    forceActivateCalls.map(call => [
      call.method,
      call.path.split('/app-releases')[1],
    ]),
    [['POST', `/${preparedReleaseId}/activate`]],
    'force activation must not read detail/capture or require a release context'
  );
  assert.deepEqual(forceActivateCalls[0].body, {
    activateStagedChildren: true,
    forceActivateWithoutValidation: true,
  });

  mode = 'adoption-mismatch';
  const adoptionMismatch = await runCli([
    'release',
    'app-activate',
    preparedReleaseId,
    '--change',
    'app-release-smoke',
    '--activate-staged-children',
    '--profile',
    profileName,
    '--json',
  ]);
  assert.notEqual(adoptionMismatch.code, 0);
  const structuredError = JSON.parse(adoptionMismatch.stderr);
  assert.deepEqual(structuredError, {
    success: false,
    error: {
      status: 409,
      code: 'APP_RELEASE_ADOPTION_BASELINE_MISMATCH',
      message:
        'HTTP 409: 新旧发布会话的源码冻结基线或 Active Head 快照不等价，拒绝接管 verified App Release。',
      data: {
        originalBaselineId: 'baseline-old',
        currentBaselineId: baselineId,
        mismatchedFields: [
          'resourceHeads.Function.sync_customer.fields.definitionHash',
        ],
        mismatchCount: 1,
      },
    },
  });

  mode = 'normal';
  const finalizeStart = calls.length;
  const finalized = await runCli([
    'release',
    'app-finalize',
    '--change',
    'app-release-smoke',
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(finalized.code, 0, finalized.stderr || finalized.stdout);
  const finalizeResult = JSON.parse(finalized.stdout);
  assert.equal(finalizeResult.activationModel, 'retrospective_active_children');
  assert.equal(finalizeResult.captureHash, captureHash);
  assert.match(finalizeResult.payloadHash, /^[a-f0-9]{64}$/);
  assert.equal(finalizeResult.prepared.status, 'prepared');
  assert.equal(finalizeResult.verified.status, 'verified');
  assert.equal(finalizeResult.activated.status, 'active');

  const finalizeCalls = appCallsSince(finalizeStart);
  assert.deepEqual(
    finalizeCalls.map(call => [call.method, call.path.split('/app-releases')[1]]),
    [
      ['POST', ''],
      ['POST', `/${preparedReleaseId}/verify`],
      ['POST', `/${preparedReleaseId}/activate`],
    ],
    'finalize must reuse the lease-frozen capture, then prepare -> verify -> activate'
  );
  const prepareBody = finalizeCalls[0].body;
  const verifyBody = finalizeCalls[1].body;
  const activateBody = finalizeCalls[2].body;
  assert.deepEqual(prepareBody.resources, frozenResources);
  assert.deepEqual(verifyBody.resources, frozenResources);
  assert.equal(prepareBody.parentReleaseId, parentReleaseId);
  assert.equal(verifyBody.manifestHash, manifestHash);
  assertReleaseControl(prepareBody);
  assertReleaseControl(verifyBody, prepareBody);
  assertReleaseControl(activateBody, prepareBody);
  assert.equal(activateBody.activateStagedChildren, undefined);

  const atomicFinalizeStart = calls.length;
  const atomicFinalized = await runCli([
    'release',
    'app-finalize',
    '--change',
    'app-release-smoke',
    '--staged-resources-json',
    stagedResourcesFile,
    '--profile',
    profileName,
    '--environment-id',
    environmentId,
    '--candidate-id',
    candidateId,
    '--deployment-id',
    deploymentId,
    '--json',
  ]);
  assert.equal(
    atomicFinalized.code,
    0,
    atomicFinalized.stderr || atomicFinalized.stdout
  );
  const atomicResult = JSON.parse(atomicFinalized.stdout);
  assert.equal(atomicResult.activationModel, 'atomic_staged_children_v1');
  const atomicCalls = appCallsSince(atomicFinalizeStart);
  assert.deepEqual(
    atomicCalls.map(call => [call.method, call.path.split('/app-releases')[1]]),
    [
      ['GET', '/capture'],
      ['POST', ''],
      ['POST', `/${preparedReleaseId}/verify`],
      ['POST', `/${preparedReleaseId}/activate`],
    ]
  );
  assert.deepEqual(atomicCalls[1].body.resources, overlaidResources);
  assert.deepEqual(atomicCalls[2].body.resources, overlaidResources);
  assert.equal(atomicCalls[3].body.activateStagedChildren, true);
  assert.equal(atomicCalls[3].body.environmentId, environmentId);
  assert.equal(atomicCalls[3].body.candidateId, candidateId);
  assert.equal(atomicCalls[3].body.deploymentId, deploymentId);
  const stateAfterAtomicFinalize = JSON.parse(
    fs.readFileSync(
      path.join(workspace, '.openxiangda', 'state.json'),
      'utf8'
    )
  );
  assert.equal(
    stateAfterAtomicFinalize.profiles?.[profileName]?.runtime?.assetBaseUrl,
    'https://cdn.example.com/runtime-build-3/',
    'app-finalize should recover the staged Runtime asset URL when the compact head omits it'
  );
  assertReleaseControl(atomicCalls[3].body, prepareBody);

  const atomicV2Start = calls.length;
  const bindingContracts = normalizeBindingContracts([
    {
      kind: 'Automation',
      code: 'sync_customer',
      expected: {
        forms: { customer: 'FORM_CUSTOMER' },
      },
    },
  ]);
  const bindingContractFile = path.join(
    workspace,
    '.openxiangda',
    'releases',
    'app-release-smoke',
    'backend-binding-contracts.json'
  );
  fs.writeFileSync(
    bindingContractFile,
    `${JSON.stringify(
      {
        contractVersion: 'backend_binding_contracts_v1',
        appType,
        profile: profileName,
        changeId: 'app-release-smoke',
        deploymentId: null,
        backendReleaseId: 'BACKEND_RELEASE_3',
        contractHash: resourceBindingContractHash(bindingContracts),
        contracts: bindingContracts,
        recordedAt: '2026-07-15T13:04:00.000Z',
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  const atomicV2 = await runCli([
    'release',
    'app-finalize',
    '--change',
    'app-release-smoke',
    '--staged-resources-json',
    JSON.stringify(v2StagedResources),
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(atomicV2.code, 0, atomicV2.stderr || atomicV2.stdout);
  assert.equal(
    JSON.parse(atomicV2.stdout).activationModel,
    'atomic_staged_children_v2'
  );
  assert.deepEqual(JSON.parse(atomicV2.stdout).bindingVerification, {
    contractVersion: 'resource_binding_verification_v1',
    phase: 'active-readback',
    status: 'passed',
    contractCount: 1,
    checkedResourceCount: 1,
    contractHash: resourceBindingContractHash(bindingContracts),
    backendReleaseId: 'BACKEND_RELEASE_3',
    contractFile:
      '.openxiangda/releases/app-release-smoke/backend-binding-contracts.json',
  });
  const atomicV2Calls = appCallsSince(atomicV2Start);
  assert.deepEqual(
    atomicV2Calls.map(call => [
      call.method,
      call.path.split('/app-releases')[1],
    ]),
    [
      ['POST', ''],
      ['POST', `/${preparedReleaseId}/verify`],
      ['POST', `/${preparedReleaseId}/activate`],
    ]
  );
  for (const call of atomicV2Calls) {
    assert.equal(call.body.protocolVersion, 'atomic_staged_children_v2');
  }
  assert.equal(atomicV2Calls[2].body.activateStagedChildren, true);
  const v2Backend = atomicV2Calls[0].body.resources.find(
    resource => resource.kind === 'BackendRelease'
  );
  assert.equal(v2Backend.identity.releaseId, 'BACKEND_RELEASE_3');
  assert.equal(v2Backend.metadata.protocolVersion, 'backend_release_v2');
  assert.equal(
    calls
      .slice(atomicV2Start)
      .filter(call => call.path.endsWith('/secrets/capabilities')).length,
    1,
    'v2 app activation must fail closed behind the full capability probe'
  );

  mode = 'binding-mismatch';
  const mismatchedBinding = await runCli([
    'release',
    'app-finalize',
    '--change',
    'app-release-smoke',
    '--staged-resources-json',
    JSON.stringify(v2StagedResources),
    '--profile',
    profileName,
    '--json',
  ]);
  assert.notEqual(mismatchedBinding.code, 0);
  assert.match(
    mismatchedBinding.stderr,
    /BACKEND_RELEASE_BINDING_VERIFICATION_FAILED.*forms.changed=\[customer\]/
  );
  fs.rmSync(bindingContractFile);

  mode = 'moved';
  const movedStart = calls.length;
  const moved = await runCli([
    'release',
    'app-finalize',
    '--change',
    'app-release-smoke',
    '--staged-resources-json',
    stagedResourcesFile,
    '--profile',
    profileName,
    '--json',
  ]);
  assert.notEqual(moved.code, 0);
  assert.match(moved.stderr, /APP_RELEASE_CHILD_MOVED|child release head moved/i);
  const movedCalls = appCallsSince(movedStart);
  assert.deepEqual(
    movedCalls.map(call => [call.method, call.path.split('/app-releases')[1]]),
    [
      ['POST', ''],
      ['POST', `/${preparedReleaseId}/verify`],
    ],
    'child drift must stop before activate and must not retry conflicts'
  );

  mode = 'normal';
  const rollbackGuardStart = calls.length;
  const shortRollback = await runCli([
    'release',
    'app-rollback',
    historicalReleaseId,
    '--change',
    'app-release-smoke',
    '--reason',
    'short',
    '--profile',
    profileName,
    '--json',
  ]);
  assert.notEqual(shortRollback.code, 0);
  assert.match(shortRollback.stderr, /至少 8 个字符/);
  assert.equal(appCallsSince(rollbackGuardStart).length, 0);

  const rollbackStart = calls.length;
  const rolledBack = await runCli([
    'release',
    'app-rollback',
    historicalReleaseId,
    '--change',
    'app-release-smoke',
    '--reason',
    'restore reviewed whole app release',
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(rolledBack.code, 0, rolledBack.stderr || rolledBack.stdout);
  const rollbackCalls = appCallsSince(rollbackStart);
  assert.deepEqual(
    rollbackCalls.map(call => [call.method, call.path.split('/app-releases')[1]]),
    [
      ['GET', '/head'],
      ['POST', '/rollback'],
    ]
  );
  assert.equal(rollbackCalls[1].body.targetReleaseId, historicalReleaseId);
  assert.equal(rollbackCalls[1].body.parentReleaseId, parentReleaseId);
  assert.equal(rollbackCalls[1].body.reason, 'restore reviewed whole app release');
  assertReleaseControl(rollbackCalls[1].body, prepareBody);
  assert.match(
    JSON.parse(rolledBack.stdout).nextStep,
    /子 Release.*app-verify.*app-activate/
  );

  const head = await runCli([
    'release',
    'app-head',
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(head.code, 0, head.stderr || head.stdout);
  const compactHead = JSON.parse(head.stdout);
  assert.equal(compactHead.activeAppReleaseId, parentReleaseId);
  assert.equal(compactHead.resourceCount, frozenResources.length);
  assert.equal(compactHead.resourcesByKind.FormRelease, 2);
  assert.equal(
    compactHead.release.manifestJson,
    undefined,
    'app-head should default to a token-efficient summary',
  );
  const fullHead = await runCli([
    'release',
    'app-head',
    '--profile',
    profileName,
    '--full',
    '--json',
  ]);
  assert.equal(fullHead.code, 0, fullHead.stderr || fullHead.stdout);
  assert.equal(
    JSON.parse(fullHead.stdout).release.manifestJson.largePayload.length,
    100_000,
    '--full should preserve the complete compatibility payload',
  );
  const list = await runCli([
    'release',
    'app-list',
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(list.code, 0, list.stderr || list.stdout);
  assert.equal(JSON.parse(list.stdout).items.length, 2);
  const detail = await runCli([
    'release',
    'app-detail',
    preparedReleaseId,
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(detail.code, 0, detail.stderr || detail.stdout);
  assert.equal(JSON.parse(detail.stdout).id, preparedReleaseId);
  const postCommit = await runCli([
    'release',
    'app-post-commit',
    preparedReleaseId,
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(postCommit.code, 0, postCommit.stderr || postCommit.stdout);
  assert.equal(JSON.parse(postCommit.stdout).status, 'completed');
  const postCommitRetry = await runCli([
    'release',
    'app-retry',
    preparedReleaseId,
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(
    postCommitRetry.code,
    0,
    postCommitRetry.stderr || postCommitRetry.stdout
  );
  assert.equal(JSON.parse(postCommitRetry.stdout).retryable, false);
  const diff = await runCli([
    'release',
    'app-diff',
    parentReleaseId,
    preparedReleaseId,
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(diff.code, 0, diff.stderr || diff.stdout);
  assert.equal(JSON.parse(diff.stdout).toReleaseId, preparedReleaseId);

  sdd.initSddWorkspace({ cwd: workspace });
  sdd.proposeSddChange({
    cwd: workspace,
    changeId: 'app-release-smoke',
    affected: {
      forms: ['FORM_CUSTOMER'],
      pages: ['portal'],
      runtime: true,
    },
  });
  sdd.approveSddChange({ cwd: workspace, changeId: 'app-release-smoke' });
  const stagedContextFile = path.join(
    workspace,
    '.openxiangda',
    'releases',
    'app-release-smoke',
    'staged-resources.context.json'
  );
  const stagedContext = JSON.parse(fs.readFileSync(stagedContextFile, 'utf8'));
  fs.writeFileSync(
    stagedContextFile,
    `${JSON.stringify(
      {
        ...stagedContext,
        satisfiedSelectors: ['form:FORM_CUSTOMER'],
      },
      null,
      2
    )}\n`
  );
  const noopCoveredStart = calls.length;
  const noopCovered = await runCli([
    'release',
    'app-prepare',
    '--change',
    'app-release-smoke',
    '--staged-resources-json',
    JSON.stringify([stagedResources[0]]),
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(noopCovered.code, 0, noopCovered.stderr || noopCovered.stdout);
  assert.ok(
    appCallsSince(noopCoveredStart).length > 0,
    'a current-context noop Form selector must satisfy exact staged scope'
  );
  const staleExtraStart = calls.length;
  const staleExtra = await runCli([
    'release',
    'app-prepare',
    '--change',
    'app-release-smoke',
    '--staged-resources-json',
    JSON.stringify([
      stagedResources[0],
      stagedResources[2],
      {
        kind: 'FormRelease',
        releaseId: 'FORM_ORDER_STALE',
        formUuid: 'FORM_ORDER',
        hash: 'a'.repeat(64),
      },
    ]),
    '--profile',
    profileName,
    '--json',
  ]);
  assert.notEqual(staleExtra.code, 0);
  assert.match(staleExtra.stderr, /APP_RELEASE_STAGED_SCOPE_MISMATCH/);
  assert.equal(
    calls.length,
    staleExtraStart,
    'an extra staged child outside SDD scope must fail before any API call'
  );

  console.log('app release CLI smoke passed');
} finally {
  server.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
