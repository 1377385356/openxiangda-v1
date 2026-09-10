import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openxiangda-page-release-'));
const tempHome = path.join(tempRoot, 'home');
const workspace = path.join(tempRoot, 'workspace');
const origin = path.join(tempRoot, 'origin.git');
const profileName = 'mock';
const appType = 'APP_PAGE_RELEASE_SMOKE';
const activeReleaseId = '30000000-0000-4000-8000-000000000001';
const targetReleaseId = '30000000-0000-4000-8000-000000000002';
const activeReleaseHash = 'a'.repeat(64);
const targetReleaseHash = 'b'.repeat(64);
const homeAssetId = '31000000-0000-4000-8000-000000000001';
const adminAssetId = '31000000-0000-4000-8000-000000000002';
const homeAssetHash = 'c'.repeat(64);
const adminAssetHash = 'd'.repeat(64);
const leaseId = '40000000-0000-4000-8000-000000000001';
const baselineId = '50000000-0000-4000-8000-000000000001';
const calls = [];
let mode = 'normal';

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
git(['init', '--bare', '--initial-branch=main', origin], tempRoot);
for (const args of [
  ['init', '-b', 'main'],
  ['config', 'user.email', 'smoke@example.com'],
  ['config', 'user.name', 'Smoke'],
  ['add', '.'],
  ['commit', '-m', 'page release fixture'],
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

function snapshot() {
  if (mode === 'incomplete') {
    return { pages: [{ pageId: 'PAGE_HOME', code: 'home', revision: 7, etag: 'home-7' }] };
  }
  const result = {
    activePageReleaseHead: {
      releaseId: activeReleaseId,
      releaseHash: activeReleaseHash,
      headRevision: 9,
      etag: 'head-9',
    },
    pages: [
      {
        pageId: 'PAGE_HOME',
        code: 'home',
        revision: 7,
        etag: 'home-7',
        activeAssetId: homeAssetId,
        activeAssetContentHash: homeAssetHash,
        activeAsset: {
          assetId: homeAssetId,
          releaseId: activeReleaseId,
          contentHash: homeAssetHash,
        },
      },
      {
        pageId: 'PAGE_ADMIN',
        code: 'admin',
        revision: 4,
        etag: 'admin-4',
        activeAssetId: adminAssetId,
        activeAssetContentHash: adminAssetHash,
        activeAsset: {
          assetId: adminAssetId,
          releaseId: activeReleaseId,
          contentHash: adminAssetHash,
        },
      },
    ],
  };
  if (mode === 'incomplete-asset') {
    result.pages[0].activeAsset = null;
  }
  return result;
}

function releaseList() {
  return {
    summary: { total: 2 },
    items: [
      {
        releaseId: activeReleaseId,
        version: '1.0.0',
        buildId: 'active-build',
        releaseHash: activeReleaseHash,
        parentReleaseId: null,
        immutable: true,
        isComplete: true,
        isActive: true,
        pages: [
          { code: 'home', revision: 7 },
          { code: 'admin', revision: 4 },
        ],
      },
      {
        releaseId: targetReleaseId,
        version: '1.1.0',
        buildId: 'target-build',
        releaseHash: targetReleaseHash,
        parentReleaseId: activeReleaseId,
        immutable: true,
        isComplete: true,
        isActive: false,
        pages: [
          { code: 'home', revision: 8 },
          { code: 'admin', revision: 4 },
        ],
      },
    ],
  };
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  const body = request.method === 'GET' ? {} : await readBody(request);
  calls.push({
    mode,
    method: request.method,
    path: url.pathname,
    headers: request.headers,
    body,
  });
  const api = `/service/openxiangda-api/v1/apps/${appType}`;

  if (request.method === 'POST' && url.pathname === `${api}/change-baselines`) {
    return respond(response, {
      baselineId,
      appType,
      changeId: body.changeId,
      clientSessionId: body.clientSessionId,
      sourceBase: body.sourceBase,
      headDigest: 'c'.repeat(64),
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
  if (request.method === 'GET' && url.pathname === `${api}/pages/snapshot`) {
    return respond(response, snapshot());
  }
  if (request.method === 'GET' && url.pathname === `${api}/pages/releases`) {
    return respond(response, releaseList());
  }
  if (request.method === 'POST' && url.pathname === `${api}/pages/publish`) {
    if (mode === 'stale') {
      return respond(
        response,
        { message: 'page release parent moved' },
        409,
        'PAGE_RELEASE_PARENT_CONFLICT'
      );
    }
    return respond(response, {
      staged: body.stage,
      activated: body.activate,
      items: [
        {
          pageId: body.pages[0].code === 'home' ? 'PAGE_HOME' : 'PAGE_NEW',
          code: body.pages[0].code,
          routeKey: body.pages[0].code,
          revision: body.expectedRevision + 1,
        },
      ],
    });
  }
  if (
    request.method === 'POST' &&
    url.pathname === `${api}/pages/releases/activate`
  ) {
    return respond(response, {
      releaseId: targetReleaseId,
      releaseHash: targetReleaseHash,
      rollback: body.rollback,
      active: true,
    });
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
          CODEX_THREAD_ID: 'page-release-cli-smoke',
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

const pagePublishArgs = (pageCode, extra = []) => [
  'page',
  'publish',
  pageCode,
  '--entry-url',
  `https://cdn.example.com/${pageCode}.js`,
  '--version',
  '1.1.0',
  '--build-id',
  'target-build',
  '--profile',
  profileName,
  '--json',
  ...extra,
];

function callsSince(start, predicate) {
  return calls.slice(start).filter(predicate);
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
            baseUrl: `http://127.0.0.1:${port}/service`,
            token: { accessToken: 'test-token' },
          },
        },
      },
      null,
      2
    )}\n`
  );

  const noContextStart = calls.length;
  const noContext = await runCli(pagePublishArgs('home'));
  assert.notEqual(noContext.code, 0);
  assert.match(noContext.stderr, /PUBLISH_CONTEXT_REQUIRED/);
  assert.equal(calls.length, noContextStart, 'missing lease must fail before HTTP');

  const begun = await runCli([
    'release',
    'begin',
    '--change',
    'page-release-smoke',
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(begun.code, 0, begun.stderr || begun.stdout);

  mode = 'normal';
  const stageStart = calls.length;
  const staged = await runCli(pagePublishArgs('home'));
  assert.equal(staged.code, 0, staged.stderr || staged.stdout);
  const stageCalls = calls.slice(stageStart);
  const snapshotIndex = stageCalls.findIndex(call => call.path.endsWith('/pages/snapshot'));
  const publishIndex = stageCalls.findIndex(call => call.path.endsWith('/pages/publish'));
  assert.ok(snapshotIndex >= 0 && publishIndex > snapshotIndex, 'snapshot must precede publish');
  const publish = stageCalls[publishIndex];
  assert.equal(publish.body.stage, true);
  assert.equal(publish.body.activate, false);
  assert.equal(publish.body.expectedRevision, 7);
  assert.equal(publish.body.pages[0].expectedRevision, 7);
  assert.deepEqual(publish.body.expectedParent, {
    releaseId: activeReleaseId,
    releaseHash: activeReleaseHash,
    headRevision: 9,
  });
  assert.deepEqual(publish.body.expectedRevisions, { home: 7, admin: 4 });
  assert.deepEqual(publish.body.expectedActiveAssets, {
    home: {
      assetId: homeAssetId,
      releaseId: activeReleaseId,
      contentHash: homeAssetHash,
    },
    admin: {
      assetId: adminAssetId,
      releaseId: activeReleaseId,
      contentHash: adminAssetHash,
    },
  });
  assert.equal(publish.headers['if-match'], 'home-7');

  const newStart = calls.length;
  const newPage = await runCli(pagePublishArgs('reports'));
  assert.equal(newPage.code, 0, newPage.stderr || newPage.stdout);
  const newPublish = callsSince(
    newStart,
    call => call.method === 'POST' && call.path.endsWith('/pages/publish')
  );
  assert.equal(newPublish.length, 1);
  assert.equal(newPublish[0].body.expectedRevision, 0);
  assert.equal(newPublish[0].body.pages[0].expectedRevision, 0);
  assert.equal(newPublish[0].body.expectedRevisions.reports, 0);
  assert.deepEqual(newPublish[0].body.expectedActiveAssets, {
    home: {
      assetId: homeAssetId,
      releaseId: activeReleaseId,
      contentHash: homeAssetHash,
    },
    admin: {
      assetId: adminAssetId,
      releaseId: activeReleaseId,
      contentHash: adminAssetHash,
    },
    reports: null,
  });
  assert.equal(newPublish[0].headers['if-match'], '0');

  mode = 'incomplete';
  const incompleteStart = calls.length;
  const incomplete = await runCli(pagePublishArgs('home'));
  assert.notEqual(incomplete.code, 0);
  assert.match(incomplete.stderr, /PAGE_RELEASE_PARENT_CONFLICT/);
  assert.equal(
    callsSince(
      incompleteStart,
      call => call.method === 'POST' && call.path.endsWith('/pages/publish')
    ).length,
    0,
    'incomplete CAS snapshot must cause zero writes'
  );

  mode = 'incomplete-asset';
  const incompleteAssetStart = calls.length;
  const incompleteAsset = await runCli(pagePublishArgs('home'));
  assert.notEqual(incompleteAsset.code, 0);
  assert.match(incompleteAsset.stderr, /PAGE_ACTIVE_ASSET_CONFLICT/);
  assert.equal(
    callsSince(
      incompleteAssetStart,
      call => call.method === 'POST' && call.path.endsWith('/pages/publish')
    ).length,
    0,
    'incomplete active asset snapshot must cause zero writes'
  );

  mode = 'stale';
  const staleStart = calls.length;
  const stale = await runCli(pagePublishArgs('home'));
  assert.notEqual(stale.code, 0);
  assert.match(stale.stderr, /PAGE_RELEASE_PARENT_CONFLICT|parent moved/i);
  assert.equal(
    callsSince(
      staleStart,
      call => call.method === 'POST' && call.path.endsWith('/pages/publish')
    ).length,
    1,
    'stale parent conflict must not be retried'
  );

  mode = 'normal';
  const activateStart = calls.length;
  const activated = await runCli([
    'page',
    'activate',
    targetReleaseId,
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(activated.code, 0, activated.stderr || activated.stdout);
  const activate = callsSince(
    activateStart,
    call => call.method === 'POST' && call.path.endsWith('/pages/releases/activate')
  );
  assert.equal(activate.length, 1);
  assert.equal(activate[0].body.expectedReleaseHash, targetReleaseHash);
  assert.deepEqual(activate[0].body.expectedParent, {
    releaseId: activeReleaseId,
    releaseHash: activeReleaseHash,
    headRevision: 9,
  });
  assert.deepEqual(activate[0].body.expectedRevisions, { home: 7, admin: 4 });
  assert.deepEqual(activate[0].body.expectedActiveAssets, {
    home: {
      assetId: homeAssetId,
      releaseId: activeReleaseId,
      contentHash: homeAssetHash,
    },
    admin: {
      assetId: adminAssetId,
      releaseId: activeReleaseId,
      contentHash: adminAssetHash,
    },
  });
  assert.equal(activate[0].body.rollback, false);

  const rollbackGuardStart = calls.length;
  const missingRollbackFlag = await runCli([
    'page',
    'rollback',
    targetReleaseId,
    '--reason',
    'restore reviewed page release',
    '--profile',
    profileName,
    '--json',
  ]);
  assert.notEqual(missingRollbackFlag.code, 0);
  assert.match(missingRollbackFlag.stderr, /必须显式提供 --rollback/);
  const shortReason = await runCli([
    'page',
    'rollback',
    targetReleaseId,
    '--rollback',
    '--reason',
    'short',
    '--profile',
    profileName,
    '--json',
  ]);
  assert.notEqual(shortReason.code, 0);
  assert.match(shortReason.stderr, /至少 8 个字符/);
  assert.equal(
    callsSince(
      rollbackGuardStart,
      call => call.method === 'POST' && call.path.endsWith('/pages/releases/activate')
    ).length,
    0,
    'rollback guards must fail before write'
  );

  const rollbackStart = calls.length;
  const rolledBack = await runCli([
    'page',
    'rollback',
    targetReleaseId,
    '--rollback',
    '--reason',
    'restore reviewed page release',
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(rolledBack.code, 0, rolledBack.stderr || rolledBack.stdout);
  const rollback = callsSince(
    rollbackStart,
    call => call.method === 'POST' && call.path.endsWith('/pages/releases/activate')
  );
  assert.equal(rollback.length, 1);
  assert.equal(rollback[0].body.rollback, true);
  assert.equal(rollback[0].body.reason, 'restore reviewed page release');

  console.log('page release CLI smoke passed');
} finally {
  server.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
