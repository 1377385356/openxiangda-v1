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
write('.gitignore', '.openxiangda/\ndist/\nnode_modules/\n');
writeJson('package.json', {
  name: 'page-release-smoke',
  private: true,
  type: 'module',
});
write(
  'src/index.css',
  '@layer tailwind-base { @tailwind base; }\n@tailwind components;\n@tailwind utilities;\n'
);
write(
  'tailwind.config.cjs',
  `const path = require('node:path');
const presetModule = require('openxiangda/tailwind-preset');
const preset = presetModule.default ?? presetModule;
const packagePath = require.resolve('openxiangda');
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    path.join(path.dirname(packagePath), '..', '**/*.{js,mjs,cjs}'),
  ],
  blocklist: ['[-:T]', '[-:TZ.]'],
  presets: [preset],
  theme: { extend: {} },
  plugins: [],
};
`
);
fs.mkdirSync(path.join(workspace, 'node_modules'), { recursive: true });
const dependencyRoot = path.join(repoRoot, 'node_modules');
for (const name of fs.readdirSync(dependencyRoot)) {
  if (name === 'openxiangda') continue;
  const target = path.join(dependencyRoot, name);
  fs.symlinkSync(
    target,
    path.join(workspace, 'node_modules', name),
    fs.statSync(target).isDirectory() ? 'dir' : 'file'
  );
}
fs.symlinkSync(repoRoot, path.join(workspace, 'node_modules', 'openxiangda'), 'dir');
write(
  'app-workspace.config.ts',
  `export default {
  appType: '${appType}',
  appName: 'Page release smoke',
  platformUrl: 'http://127.0.0.1',
  version: '1.2.0',
  oss: {
    region: 'oss-cn-hangzhou',
    bucket: 'page-release-smoke',
    pathPrefix: 'app-workspace',
  },
  defaults: {
    protocolVersion: '1.0',
    frameworkVersion: '18.3.1',
    cssIsolation: 'none',
  },
};
`,
);
for (const code of ['home', 'admin']) {
  write(`src/pages/${code}/index.tsx`, 'export default {};\n');
  write(`src/pages/${code}/App.tsx`, 'export default {};\n');
  write(
    `src/pages/${code}/page.config.ts`,
    `export default {
  code: '${code}',
  name: '${code}',
  route: { pathKey: '${code}' },
  menu: { enabled: false },
};
`,
  );
}
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
      activation: body.activate ? { active: true } : null,
      release: {
        id: targetReleaseId,
        version: body.version,
        buildId: body.buildId,
        releaseHash: targetReleaseHash,
        parentReleaseId: activeReleaseId,
        immutable: true,
      },
      items: body.pages.map(page => ({
        pageId:
          page.code === 'home'
            ? 'PAGE_HOME'
            : page.code === 'admin'
              ? 'PAGE_ADMIN'
              : 'PAGE_NEW',
        code: page.code,
        routeKey: page.code,
        revision: Number(body.expectedRevisions?.[page.code] || 0) + 1,
      })),
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

const runBundledWorkspaceScript = (scriptName, scriptArgs) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(
          repoRoot,
          'packages',
          'sdk',
          'src',
          'build-source',
          'scripts',
          scriptName
        ),
        ...scriptArgs,
      ],
      {
        cwd: workspace,
        env: {
          ...process.env,
          HOME: tempHome,
          LOWCODE_WORKSPACE_ROOT: workspace,
          OPENXIANGDA_ACCESS_TOKEN: 'test-token',
          OPENXIANGDA_APP_TYPE: appType,
          OPENXIANGDA_BASE_URL: process.env.PAGE_RELEASE_SMOKE_BASE_URL,
          OPENXIANGDA_CHANGE_ID: 'page-release-smoke',
          OPENXIANGDA_CLI: path.join(repoRoot, 'bin', 'openxiangda.js'),
          OPENXIANGDA_PAGE_STAGE_ONLY: '1',
          OPENXIANGDA_PROFILE: profileName,
          APP_BUILD_ID: 'bundled-register-build',
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

const runBundledRegister = (pageNames, extraArgs = []) =>
  runBundledWorkspaceScript('register.mjs', [
    '--page-list-json',
    JSON.stringify(pageNames),
    ...extraArgs,
  ]);

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

const batchDefinitionsPath = path.join(
  workspace,
  '.openxiangda',
  'batch-pages.json'
);
writeJson('.openxiangda/batch-pages.json', {
  pages: ['home', 'admin'].map(code => ({
    code,
    name: code,
    route: { pathKey: code },
    runtime: {
      entryUrl: `https://cdn.example.com/${code}.js`,
      cssUrls: [],
      jsUrls: [`https://cdn.example.com/${code}.js`],
      framework: 'react',
      frameworkVersion: '18.3.1',
      cssIsolation: 'none',
    },
    menu: { enabled: false },
  })),
});

const batchPublishArgs = extra => [
  'page',
  'publish',
  '--pages-json',
  batchDefinitionsPath,
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
  process.env.PAGE_RELEASE_SMOKE_BASE_URL = `http://127.0.0.1:${port}/service`;

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
  const bundledPublishDryRunStart = calls.length;
  const bundledPublishDryRun = await runBundledWorkspaceScript('publish-all.mjs', [
    '--only',
    'pages/home,pages/admin',
    '--dry-run',
  ]);
  assert.equal(
    bundledPublishDryRun.code,
    0,
    bundledPublishDryRun.stderr || bundledPublishDryRun.stdout
  );
  assert.equal(
    callsSince(
      bundledPublishDryRunStart,
      call => call.method === 'POST' && call.path.endsWith('/pages/publish')
    ).length,
    0,
    'bundled publish-all dry-run must not write a PageRelease'
  );

  const bundledDryRunStart = calls.length;
  const bundledDryRun = await runBundledRegister(['home', 'admin'], ['--dry-run']);
  assert.equal(bundledDryRun.code, 0, bundledDryRun.stderr || bundledDryRun.stdout);
  assert.equal(
    callsSince(
      bundledDryRunStart,
      call => call.method === 'POST' && call.path.endsWith('/pages/publish')
    ).length,
    0,
    'bundled register dry-run must not write a PageRelease'
  );

  const bundledRegisterStart = calls.length;
  const bundledRegister = await runBundledRegister(['home', 'admin']);
  assert.equal(
    bundledRegister.code,
    0,
    bundledRegister.stderr || bundledRegister.stdout
  );
  const bundledRegisterPublish = callsSince(
    bundledRegisterStart,
    call =>
      call.method === 'POST' &&
      call.path.endsWith('/pages/publish') &&
      call.body.buildId === 'bundled-register-build'
  );
  assert.equal(
    bundledRegisterPublish.length,
    1,
    'bundled register must create one PageRelease for all selected pages'
  );
  assert.equal(bundledRegisterPublish[0].body.stage, true);
  assert.equal(bundledRegisterPublish[0].body.activate, false);
  assert.deepEqual(
    bundledRegisterPublish[0].body.pages.map(page => page.code),
    ['home', 'admin']
  );
  const bundledRegisterResources = JSON.parse(
    fs.readFileSync(
      path.join(
        workspace,
        '.openxiangda',
        'releases',
        'page-release-smoke',
        'staged-resources.json'
      ),
      'utf8'
    )
  );
  assert.equal(bundledRegisterResources.length, 1);
  assert.equal(bundledRegisterResources[0].kind, 'PageRelease');
  assert.deepEqual(
    bundledRegisterResources[0].metadata.selectedPageCodes,
    ['admin', 'home']
  );

  const batchStart = calls.length;
  const batch = await runCli(batchPublishArgs([]));
  assert.equal(batch.code, 0, batch.stderr || batch.stdout);
  const batchPublish = callsSince(
    batchStart,
    call => call.method === 'POST' && call.path.endsWith('/pages/publish')
  );
  assert.equal(batchPublish.length, 1, 'batch must create one PageRelease');
  assert.deepEqual(
    batchPublish[0].body.pages.map(page => page.code),
    ['home', 'admin']
  );
  assert.equal(batchPublish[0].headers['if-match'], undefined);
  assert.equal(
    Object.prototype.hasOwnProperty.call(batchPublish[0].body, 'expectedRevision'),
    false,
    'multi-page publish must not send a single-page expectedRevision'
  );
  assert.deepEqual(batchPublish[0].body.expectedRevisions, { home: 7, admin: 4 });
  const batchResources = JSON.parse(
    fs.readFileSync(
      path.join(
        workspace,
        '.openxiangda',
        'releases',
        'page-release-smoke',
        'staged-resources.json'
      ),
      'utf8'
    )
  );
  assert.deepEqual(batchResources[0].metadata.selectedPageCodes, ['admin', 'home']);

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
  const stagedResources = JSON.parse(
    fs.readFileSync(
      path.join(
        workspace,
        '.openxiangda',
        'releases',
        'page-release-smoke',
        'staged-resources.json'
      ),
      'utf8'
    )
  );
  assert.equal(stagedResources.length, 1);
  assert.equal(stagedResources[0].kind, 'PageRelease');
  assert.equal(stagedResources[0].identity.releaseId, targetReleaseId);
  assert.equal(stagedResources[0].hash, targetReleaseHash);
  assert.deepEqual(stagedResources[0].metadata.selectedPageCodes, ['home']);

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
