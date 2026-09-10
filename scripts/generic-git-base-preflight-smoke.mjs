import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repoRoot, 'bin', 'openxiangda.js');
const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'openxiangda-generic-base-preflight-')
);
const tempHome = path.join(tempRoot, 'home');
const workspace = path.join(tempRoot, 'workspace');
const origin = path.join(tempRoot, 'origin.git');
const profileName = 'mock';
const appType = 'APP_GENERIC_BASE_PREFLIGHT';
const calls = [];
let mode = 'stale-update';

const modeKey = () => mode.replace(/[^a-z0-9]+/gi, '_').toUpperCase();
const baselineId = () => `BASELINE_${modeKey()}`;
const leaseId = () => `LEASE_${modeKey()}`;

function write(relativePath, value) {
  const filePath = path.join(workspace, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, 'utf8');
}

function writeJson(relativePath, value) {
  write(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function git(args, cwd = workspace) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(
      result.error?.message || result.stderr || result.stdout || args.join(' ')
    );
  }
  return String(result.stdout || '').trim();
}

fs.mkdirSync(path.join(tempHome, '.openxiangda'), { recursive: true });
fs.mkdirSync(workspace, { recursive: true });
git(['init', '--bare', '--initial-branch=main', origin], tempRoot);
write('.gitignore', ['.openxiangda/', 'node_modules/', ''].join('\n'));
writeJson('package.json', { private: true });
writeJson('src/resources/roles/operator.json', {
  code: 'operator',
  name: 'Operator',
  description: 'base role',
});
writeJson('src/resources/routes/dashboard.json', {
  code: 'dashboard',
  title: 'Dashboard',
  kind: 'page',
  pathPattern: '/dashboard',
  publicAccess: 'none',
  meta: {},
});
writeJson('src/resources/routes/obsolete.json', {
  code: 'obsolete',
  title: 'Obsolete',
  kind: 'page',
  pathPattern: '/obsolete',
  publicAccess: 'none',
  meta: {},
});
for (const args of [
  ['init', '-b', 'main'],
  ['config', 'user.email', 'smoke@example.com'],
  ['config', 'user.name', 'Smoke'],
  ['add', '.'],
  ['commit', '-m', 'frozen generic resource base'],
]) {
  git(args);
}
const baseCommit = git(['rev-parse', 'HEAD']);
fs.symlinkSync(path.join(repoRoot, 'node_modules'), path.join(workspace, 'node_modules'), 'dir');

writeJson('src/resources/roles/operator.json', {
  code: 'operator',
  name: 'Operator v2',
  description: 'base role',
});
writeJson('src/resources/roles/new_role.json', {
  code: 'new_role',
  name: 'New Role',
  description: 'created by current change',
});
writeJson('src/resources/routes/dashboard.json', {
  code: 'dashboard',
  title: 'Dashboard',
  kind: 'page',
  pathPattern: '/dashboard-v2',
  publicAccess: 'none',
  meta: {},
});
fs.rmSync(path.join(workspace, 'src/resources/routes/obsolete.json'));
for (const args of [
  ['add', '-A', '--', 'src/resources'],
  ['commit', '-m', 'generic resource release source'],
  ['remote', 'add', 'origin', origin],
  ['push', '-u', 'origin', 'main'],
]) {
  git(args);
}
const releaseCommit = git(['rev-parse', 'HEAD']);
writeJson('.openxiangda/state.json', {
  version: 1,
  profiles: {
    [profileName]: {
      appType,
      resources: {},
    },
  },
});

const baseRole = () => ({
  id: 'ROLE_OPERATOR',
  code: 'operator',
  name: 'Operator',
  description: 'base role',
  isAppAdmin: false,
  updatedAt: '2026-07-15T10:00:00.000Z',
});

const baseDashboard = () => ({
  id: 'ROUTE_DASHBOARD',
  code: 'dashboard',
  title: 'Dashboard',
  kind: 'page',
  pathPattern: '/dashboard',
  publicAccess: 'none',
  metaJson: {},
  updatedAt: '2026-07-15T10:00:00.000Z',
});

const currentDashboard = () => ({
  ...baseDashboard(),
  pathPattern: '/dashboard-v2',
});

const baseObsolete = () => ({
  id: 'ROUTE_OBSOLETE',
  code: 'obsolete',
  title: 'Obsolete',
  kind: 'page',
  pathPattern: '/obsolete',
  publicAccess: 'none',
  metaJson: {},
  updatedAt: '2026-07-15T10:00:00.000Z',
});

function remoteRoles() {
  if (mode === 'stale-update') {
    return [{ ...baseRole(), name: 'Operator changed by newer release' }];
  }
  return [baseRole()];
}

function remoteRoutes() {
  if (mode === 'stale-update') {
    return [
      { ...baseDashboard(), pathPattern: '/dashboard-from-newer-release' },
      baseObsolete(),
    ];
  }
  if (mode === 'fresh-update' || mode === 'mainline-catchup') {
    return [baseDashboard(), baseObsolete()];
  }
  if (mode === 'stale-prune') {
    return [
      currentDashboard(),
      { ...baseObsolete(), pathPattern: '/obsolete-from-newer-release' },
    ];
  }
  return [currentDashboard(), baseObsolete()];
}

function readBody(request) {
  return new Promise(resolve => {
    let raw = '';
    request.on('data', chunk => {
      raw += chunk;
    });
    request.on('end', () => {
      resolve(raw ? JSON.parse(raw) : {});
    });
  });
}

function respond(response, data, statusCode = 200, errorCode) {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  response.end(
    JSON.stringify(
      statusCode >= 400
        ? { code: statusCode, errorCode, message: data.message, data: null }
        : { code: statusCode, data }
    )
  );
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  const body = request.method === 'GET' ? null : await readBody(request);
  calls.push({
    mode,
    method: request.method,
    path: url.pathname,
    headers: request.headers,
    body,
  });
  const api = `/service/openxiangda-api/v1/apps/${appType}`;

  if (request.method === 'GET' && url.pathname === `${api}/roles`) {
    return respond(response, { items: remoteRoles(), totalCount: remoteRoles().length });
  }
  if (request.method === 'GET' && url.pathname === `${api}/routes`) {
    return respond(response, { items: remoteRoutes(), totalCount: remoteRoutes().length });
  }
  if (
    request.method === 'GET' &&
    url.pathname === `${api}/routes/dashboard`
  ) {
    return respond(
      response,
      remoteRoutes().find(item => item.code === 'dashboard')
    );
  }
  if (request.method === 'POST' && url.pathname === `${api}/change-baselines`) {
    assert.equal(
      body.sourceBase.baseCommit,
      mode === 'mainline-catchup' ? releaseCommit : baseCommit
    );
    return respond(response, {
      baselineId: baselineId(),
      appType,
      changeId: body.changeId,
      clientSessionId: body.clientSessionId,
      sourceBase: body.sourceBase,
      headDigest: 'a'.repeat(64),
      resourceHeads: { Function: {}, Automation: {}, Runtime: {} },
      createdAt: '2026-07-15T10:00:00.000Z',
    });
  }
  if (request.method === 'GET' && url.pathname === `${api}/snapshot`) {
    return respond(response, {
      app: {
        appType,
        activeRuntimeReleaseId: 'REL_BASE',
        activeRuntimeBuildId: 'BUILD_BASE',
        updatedAt: '2026-07-15T10:00:00.000Z',
      },
    });
  }
  if (
    request.method === 'POST' &&
    url.pathname === `${api}/publish-lease/acquire`
  ) {
    return respond(response, {
      leaseId: leaseId(),
      appType,
      changeId: body.changeId,
      clientSessionId: body.clientSessionId,
      baseRevision: body.baseRevision,
      expiresAt: new Date(Date.now() + 1_800_000).toISOString(),
      holder: 'self',
    });
  }
  if (
    request.method === 'POST' &&
    /\/publish-lease\/[^/]+\/release$/.test(url.pathname)
  ) {
    return respond(response, { active: false, appType });
  }
  if (
    request.method === 'POST' &&
    url.pathname === `${api}/roles/ROLE_OPERATOR`
  ) {
    assertPublishContext(request);
    return respond(response, { ...baseRole(), ...body, id: 'ROLE_OPERATOR' });
  }
  if (request.method === 'POST' && url.pathname === `${api}/roles`) {
    assertPublishContext(request);
    return respond(response, {
      id: 'ROLE_NEW',
      ...body,
      isAppAdmin: false,
    });
  }
  if (
    request.method === 'POST' &&
    url.pathname === `${api}/routes/dashboard`
  ) {
    assertPublishContext(request);
    return respond(response, {
      ...currentDashboard(),
      ...body,
      id: 'ROUTE_DASHBOARD',
    });
  }
  if (
    request.method === 'POST' &&
    url.pathname === `${api}/routes/obsolete/delete`
  ) {
    assertPublishContext(request);
    if (mode === 'failed-prune') {
      return respond(
        response,
        { message: 'simulated frozen prune failure' },
        500,
        'SIMULATED_PRUNE_FAILURE'
      );
    }
    return respond(response, { deleted: true, code: 'obsolete' });
  }
  return respond(
    response,
    { message: `not found ${request.method} ${url.pathname}` },
    404,
    'NOT_FOUND'
  );
});

function assertPublishContext(request) {
  assert.equal(
    request.headers['x-openxiangda-publish-lease-id'],
    leaseId()
  );
  assert.equal(
    request.headers['x-openxiangda-change-baseline-id'],
    baselineId()
  );
}

function listen() {
  return new Promise(resolve =>
    server.listen(0, '127.0.0.1', () => resolve(server.address().port))
  );
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: workspace,
      env: {
        ...process.env,
        HOME: tempHome,
        CODEX_THREAD_ID: 'generic-base-preflight-smoke',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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
}

const exactPublishArgs = () => [
  'resource',
  'publish',
  'role,route',
  '--only',
  'role:operator,role:new_role,route:dashboard',
  '--profile',
  profileName,
  '--sdd-bypass',
  '--reason',
  'approved generic baseline preflight smoke',
  '--json',
];

const adoptedPublishArgs = reason => [
  ...exactPublishArgs().slice(0, -1),
  '--adopt-online-baseline',
  ...(reason ? ['--adoption-reason', reason] : []),
  '--json',
];

const pruneArgs = () => [
  'resource',
  'publish',
  'route',
  '--all',
  '--prune',
  '--reason',
  'approved exact route prune smoke',
  '--profile',
  profileName,
  '--sdd-bypass',
  '--json',
];

const resourceMutations = phase =>
  calls.filter(
    call =>
      call.mode === phase &&
      call.method === 'POST' &&
      (/\/roles(?:\/|$)/.test(call.path) || /\/routes(?:\/|$)/.test(call.path))
  );

async function endRelease() {
  const ended = await runCli(['release', 'end', '--profile', profileName, '--json']);
  assert.equal(ended.code, 0, ended.stderr || ended.stdout);
}

async function beginRelease(changeId, sourceBaseRef = baseCommit) {
  const begun = await runCli([
    'release',
    'begin',
    '--change',
    changeId,
    '--source-base-ref',
    sourceBaseRef,
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(begun.code, 0, begun.stderr || begun.stdout);
  return JSON.parse(begun.stdout);
}

try {
  const port = await listen();
  fs.writeFileSync(
    (fs.mkdirSync(path.join(workspace, '.openxiangda'), { recursive: true }), path.join(workspace, '.openxiangda', 'profiles.json')),
    `${JSON.stringify(
      {
        version: 1,
        currentProfile: profileName,
        profiles: {
          [profileName]: {
            name: profileName,
            baseUrl: `http://127.0.0.1:${port}/service`,
            token: { accessToken: 'test-token' },
          },
        },
      },
      null,
      2
    )}\n`
  );

  await beginRelease('stale-generic-update');
  const staleUpdate = await runCli(exactPublishArgs());
  assert.notEqual(staleUpdate.code, 0);
  assert.match(staleUpdate.stderr, /SOURCE_BASE_DIVERGED/);
  assert.equal(
    resourceMutations('stale-update').length,
    0,
    'stale generic update/create batch must make zero resource writes'
  );
  await endRelease();

  mode = 'mainline-catchup';
  await beginRelease('mainline-catchup-missing-reason', releaseCommit);
  const missingAdoptionReason = await runCli(
    adoptedPublishArgs('short')
  );
  assert.notEqual(missingAdoptionReason.code, 0);
  assert.match(missingAdoptionReason.stderr, /必须提供至少 8 个字符/);
  assert.equal(resourceMutations('mainline-catchup').length, 0);
  await endRelease();

  await beginRelease('mainline-catchup-adopted', releaseCommit);
  const adopted = await runCli(
    adoptedPublishArgs(
      'approved historical mainline catch-up smoke'
    )
  );
  assert.equal(adopted.code, 0, adopted.stderr || adopted.stdout);
  const adoptedJson = JSON.parse(adopted.stdout);
  assert.deepEqual(
    adoptedJson.changeBaselinePreflight?.genericResourcePreflight
      ?.onlineBaselineAdoption,
    {
      mode: 'frozen_online_heads_v1',
      changeId: 'mainline-catchup-adopted',
      reason: 'approved historical mainline catch-up smoke',
    }
  );
  assert.equal(
    adoptedJson.changeBaselinePreflight?.genericResourcePreflight
      ?.gitBasePlanSkipped,
    true
  );
  assert.equal(
    adoptedJson.changeBaselinePreflight?.genericResourcePreflight?.planRuns,
    0
  );
  assert.equal(resourceMutations('mainline-catchup').length, 3);

  const unsafeAdoptedPrune = await runCli([
    ...pruneArgs().slice(0, -1),
    '--adopt-online-baseline',
    '--adoption-reason',
    'approved historical mainline catch-up smoke',
    '--json',
  ]);
  assert.notEqual(unsafeAdoptedPrune.code, 0);
  assert.match(
    unsafeAdoptedPrune.stderr,
    /禁止与 --all、--force 或 --prune/
  );
  assert.equal(
    resourceMutations('mainline-catchup').length,
    3,
    'adoption must never permit prune/delete writes'
  );
  await endRelease();

  mode = 'fresh-update';
  await beginRelease('fresh-generic-update');
  const freshUpdate = await runCli(exactPublishArgs());
  assert.equal(freshUpdate.code, 0, freshUpdate.stderr || freshUpdate.stdout);
  const freshJson = JSON.parse(freshUpdate.stdout);
  assert.equal(
    freshJson.changeBaselinePreflight?.genericResourcePreflight?.planRuns,
    1
  );
  assert.equal(
    freshJson.changeBaselinePreflight?.genericResourcePreflight?.readOnly,
    true
  );
  assert.deepEqual(
    freshJson.published
      .filter(item => ['role', 'route'].includes(item.kind))
      .map(item => `${item.kind}:${item.code}:${item.action}`)
      .sort(),
    [
      'role:new_role:create',
      'role:operator:update',
      'route:dashboard:update',
    ]
  );
  assert.equal(resourceMutations('fresh-update').length, 3);
  await endRelease();

  mode = 'stale-prune';
  await beginRelease('stale-generic-prune');
  const stalePrune = await runCli(pruneArgs());
  assert.notEqual(stalePrune.code, 0);
  assert.match(stalePrune.stderr, /SOURCE_BASE_DIVERGED/);
  assert.equal(
    resourceMutations('stale-prune').length,
    0,
    'stale frozen prune target must make zero update/delete writes'
  );
  await endRelease();

  mode = 'failed-prune';
  await beginRelease('failed-generic-prune');
  const failedPrune = await runCli(pruneArgs());
  assert.notEqual(failedPrune.code, 0);
  assert.match(
    failedPrune.stderr,
    /prune route:obsolete failed: .*simulated frozen prune failure/
  );
  assert.equal(resourceMutations('failed-prune').length, 1);
  await endRelease();

  mode = 'fresh-prune';
  await beginRelease('fresh-generic-prune');
  const freshPrune = await runCli(pruneArgs());
  assert.equal(freshPrune.code, 0, freshPrune.stderr || freshPrune.stdout);
  const pruneJson = JSON.parse(freshPrune.stdout);
  assert.deepEqual(
    pruneJson.pruned.map(item => `${item.kind}:${item.code}`),
    ['route:obsolete']
  );
  assert.equal(resourceMutations('fresh-prune').length, 1);

  console.log('generic Git-base resource preflight smoke passed');
} finally {
  server.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
