import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const sdd = require(path.join(repoRoot, 'lib', 'sdd.js'));
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openxiangda-baseline-publish-'));
const tempHome = path.join(tempRoot, 'home');
const workspace = path.join(tempRoot, 'workspace');
const origin = path.join(tempRoot, 'origin.git');
const profileName = 'mock';
const appType = 'APP_BASELINE_PUBLISH';
const functionCode = 'baseline_guard';
const staleChangeId = 'stale-baseline-publish';
const freshChangeId = 'fresh-baseline-publish';
const catchupChangeId = 'catchup-baseline-publish';
const calls = [];
let activeMode = 'stale';
let dropNextStaleLeaseRelease = true;

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const baseSource = 'export default async function baselineGuard() { return "base"; }\n';
const dirtySource = 'export default async function baselineGuard() { return "dirty"; }\n';
const bundle = source => `bundle:functions:${functionCode}\n${source}`;
const baseArtifactHash = sha256(bundle(baseSource));
const dirtyArtifactHash = sha256(bundle(dirtySource));
const newerRemoteHash = 'f'.repeat(64);
const backendReleaseId = '90000000-0000-4000-8000-000000000001';

const backendRelease = status => ({
  id: backendReleaseId,
  appType,
  status,
  mode: 'source_only',
  protocolVersion: 'backend_release_v2',
  parentReleaseId: null,
  manifestHash: 'c'.repeat(64),
  verificationHash: status === 'verified' ? 'd'.repeat(64) : null,
  resources: [
    {
      kind: 'Function',
      code: functionCode,
      action: 'update',
      resourceId: 'FUNC_BASELINE',
      baseRevision: 7,
    },
  ],
});

function write(relativePath, content) {
  const filePath = path.join(workspace, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function git(args) {
  const result = spawnSync('git', args, { cwd: workspace, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr || result.stdout || args.join(' '));
  }
  return String(result.stdout || '').trim();
}

function createQuickChange(changeId) {
  return sdd.createQuickSddChange({
    cwd: workspace,
    changeId,
    title: `Baseline publish smoke ${changeId}`,
    changeKind: 'narrow-fix',
    approvalSummary: 'Smoke fixture explicitly approves one exact Function source update.',
    affected: {
      functions: [functionCode],
      files: [`src/functions/${functionCode}/index.ts`],
    },
    riskAssessment: {
      confirmed: true,
      schema: false,
      permission: false,
      auth: false,
      publicAccess: false,
      dataMigration: false,
      destructive: false,
      crossResource: false,
    },
  });
}

fs.mkdirSync(path.join(tempHome, '.openxiangda'), { recursive: true });
fs.mkdirSync(workspace, { recursive: true });
write('.gitignore', ['.openxiangda/', 'dist/', 'node_modules/', ''].join('\n'));
write(
  'package.json',
  `${JSON.stringify(
    {
      private: true,
      packageManager: 'pnpm@10.8.1',
      scripts: { 'build-js-code': 'node scripts/build-js-code.mjs' },
    },
    null,
    2
  )}\n`
);
write(
  'scripts/build-js-code.mjs',
  `import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const read = name => {
  const index = args.indexOf('--' + name);
  return index >= 0 ? args[index + 1] : '';
};
const specs = read('scripts')
  ? read('scripts').split(',').filter(Boolean)
  : [read('source') + ':' + read('script')];
for (const spec of specs) {
  const [sourceKind, code] = spec.split(':');
  const source = fs.readFileSync(path.join('src', sourceKind, code, 'index.ts'), 'utf8');
  const output = path.join('dist', sourceKind, code, 'index.cjs');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, 'bundle:' + sourceKind + ':' + code + '\\n' + source);
}
`
);
write(`src/functions/${functionCode}/index.ts`, baseSource);
write(
  `src/resources/functions/${functionCode}.json`,
  `${JSON.stringify(
    {
      code: functionCode,
      name: 'Baseline Guard',
      description: '',
      definitionJson: {
        kind: 'app_function',
        version: 'function_v1',
        runtimeMode: 'trusted_node',
        sourceType: 'file_snapshot',
        sourceFile: { localPath: `src/functions/${functionCode}/index.ts` },
      },
      status: 'active',
    },
    null,
    2
  )}\n`
);

for (const args of [
  ['init'],
  ['config', 'user.email', 'smoke@example.com'],
  ['config', 'user.name', 'Smoke'],
  ['add', '.'],
  ['commit', '-m', 'baseline source'],
]) {
  git(args);
}
git(['init', '--bare', '-q', origin]);
git(['--git-dir', origin, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
git(['remote', 'add', 'origin', origin]);
fs.symlinkSync(path.join(repoRoot, 'node_modules'), path.join(workspace, 'node_modules'), 'dir');
sdd.initSddWorkspace({ cwd: workspace });
createQuickChange(staleChangeId);
createQuickChange(freshChangeId);
write(`src/functions/${functionCode}/index.ts`, dirtySource);
git(['add', `src/functions/${functionCode}/index.ts`]);
git(['commit', '-m', 'intended function source change']);
createQuickChange(catchupChangeId);
git(['branch', '-M', 'main']);
git(['push', '-qu', 'origin', 'main']);
write(
  '.openxiangda/state.json',
  `${JSON.stringify(
    {
      version: 1,
      profiles: { [profileName]: { appType, resources: {} } },
    },
    null,
    2
  )}\n`
);

const readBody = request =>
  new Promise(resolve => {
    let raw = '';
    request.on('data', chunk => {
      raw += chunk;
    });
    request.on('end', () => {
      const contentType = String(request.headers['content-type'] || '');
      resolve(raw && contentType.includes('application/json') ? JSON.parse(raw) : raw || {});
    });
  });

const respond = (response, data, statusCode = 200, errorCode) => {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  response.end(
    JSON.stringify(
      statusCode >= 400
        ? { code: statusCode, errorCode, message: data.message, data: data.data || null }
        : { code: statusCode, data }
    )
  );
};

const currentRemoteHash = () =>
  activeMode === 'stale' ? newerRemoteHash : baseArtifactHash;

const remoteFunction = () => ({
  id: 'FUNC_BASELINE',
  code: functionCode,
  name: 'Baseline Guard',
  description: '',
  status: 'active',
  revision: 7,
  updatedAt: '2026-07-15T08:00:00.000Z',
  definitionJson: {
    kind: 'app_function',
    version: 'function_v1',
    functionCode,
    runtimeMode: 'trusted_node',
    sourceType: 'file_snapshot',
    sourceFile: {
      bucketName: 'files',
      objectName: `${functionCode}.cjs`,
      sha256: currentRemoteHash(),
      size: 1,
      originalName: 'index.cjs',
      contentType: 'application/javascript',
    },
  },
  resourceBindings: {},
});

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  const body = request.method === 'GET' ? null : await readBody(request);
  calls.push({ mode: activeMode, method: request.method, path: url.pathname, body });
  const api = `/service/openxiangda-api/v1/apps/${appType}`;

  if (request.method === 'GET' && url.pathname === `${api}/functions`) {
    return respond(response, { items: [remoteFunction()], totalCount: 1 });
  }
  if (
    request.method === 'GET' &&
    url.pathname === `${api}/functions/${functionCode}`
  ) {
    return respond(response, remoteFunction());
  }
  if (request.method === 'POST' && url.pathname === `${api}/change-baselines`) {
    const expectedChange =
      activeMode === 'stale'
        ? staleChangeId
        : activeMode === 'catchup'
          ? catchupChangeId
          : freshChangeId;
    assert.equal(body.changeId, expectedChange);
    return respond(response, {
      baselineId: `BASELINE_${activeMode.toUpperCase()}`,
      appType,
      changeId: body.changeId,
      clientSessionId: body.clientSessionId,
      sourceBase: body.sourceBase,
      headDigest: 'a'.repeat(64),
      resourceHeads: {
        Function: {
          [functionCode]: {
            headHash: 'b'.repeat(64),
            fields: { sourceArtifactHash: currentRemoteHash() },
          },
        },
        Automation: {},
        Runtime: {},
      },
      createdAt: '2026-07-15T08:00:00.000Z',
    });
  }
  if (request.method === 'GET' && url.pathname === `${api}/snapshot`) {
    return respond(response, {
      app: {
        appType,
        activeRuntimeReleaseId: 'REL_BASE',
        activeRuntimeBuildId: 'BUILD_BASE',
        updatedAt: '2026-07-15T08:00:00.000Z',
      },
    });
  }
  if (request.method === 'POST' && url.pathname === `${api}/publish-lease/acquire`) {
    return respond(response, {
      leaseId: `LEASE_${activeMode.toUpperCase()}`,
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
    url.pathname === `${api}/change-baselines/BASELINE_${activeMode.toUpperCase()}/preflight`
  ) {
    assert.deepEqual(body.targets, [{ kind: 'Function', code: functionCode }]);
    assert.equal(body.localBaseHeads[0].fields.sourceArtifactHash, baseArtifactHash);
    if (activeMode === 'stale') {
      return respond(
        response,
        { message: 'local Git base no longer matches the remote Function source' },
        409,
        'RESOURCE_FIELD_CONFLICT'
      );
    }
    return respond(response, {
      ok: true,
      baselineId: `BASELINE_${activeMode.toUpperCase()}`,
      headDigest: 'a'.repeat(64),
      targetDigest: 'c'.repeat(64),
      checkedTargets: [{ kind: 'Function', code: functionCode }],
    });
  }
  if (request.method === 'POST' && url.pathname.includes('/publish-lease/') && url.pathname.endsWith('/release')) {
    if (activeMode === 'stale' && dropNextStaleLeaseRelease) {
      dropNextStaleLeaseRelease = false;
      response.destroy();
      return;
    }
    return respond(response, { active: false, appType });
  }
  if (request.method === 'POST' && url.pathname === '/service/file/js-code-snapshot/upload') {
    return respond(response, {
      bucketName: 'files',
      objectName: `${functionCode}.cjs`,
      sha256: dirtyArtifactHash,
      size: bundle(dirtySource).length,
      originalName: 'index.cjs',
      contentType: 'application/javascript',
    });
  }
  if (request.method === 'GET' && url.pathname === `${api}/backend-releases/head`) {
    return respond(response, {
      appType,
      activeBackendReleaseId: null,
      release: null,
    });
  }
  if (request.method === 'POST' && url.pathname === `${api}/backend-releases`) {
    assert.equal(body.protocolVersion, 'backend_release_v2');
    assert.equal(body.resources.length, 1);
    assert.equal(body.resources[0].code, functionCode);
    return respond(response, backendRelease('prepared'));
  }
  if (
    request.method === 'POST' &&
    url.pathname === `${api}/backend-releases/${backendReleaseId}/verify`
  ) {
    assert.equal(body.manifestHash, 'c'.repeat(64));
    return respond(response, backendRelease('verified'));
  }
  if (
    request.method === 'PATCH' &&
    url.pathname === `${api}/functions/${functionCode}/source`
  ) {
    assert.equal(body.publishLeaseId, `LEASE_${activeMode.toUpperCase()}`);
    assert.equal(body.baseSourceHash, baseArtifactHash);
    assert.equal(body.sourceFile.sha256, dirtyArtifactHash);
    return respond(response, {
      ...remoteFunction(),
      revision: 8,
      definitionJson: {
        ...remoteFunction().definitionJson,
        sourceFile: { ...remoteFunction().definitionJson.sourceFile, sha256: dirtyArtifactHash },
      },
    });
  }
  return respond(response, { message: `not found ${request.method} ${url.pathname}` }, 404, 'NOT_FOUND');
});

const listen = () =>
  new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

const runCli = args =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(repoRoot, 'bin', 'openxiangda.js'), ...args], {
      cwd: workspace,
      env: { ...process.env, HOME: tempHome, CODEX_THREAD_ID: 'baseline-publish-smoke' },
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

const publishArgs = (changeId, adoptOnlineBaseline = false) => [
  'resource',
  'publish',
  'function',
  '--only',
  functionCode,
  '--stage-only',
  '--change',
  changeId,
  '--profile',
  profileName,
  '--sdd-bypass',
  '--reason',
  'approved baseline publish smoke',
  ...(adoptOnlineBaseline
    ? [
        '--adopt-online-baseline',
        '--adoption-reason',
        'approved historical mainline catch-up smoke',
      ]
    : []),
  '--json',
];

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

  const stale = await runCli(publishArgs(staleChangeId));
  assert.notEqual(stale.code, 0);
  assert.match(stale.stderr, /RESOURCE_FIELD_CONFLICT|local Git base/i);
  assert.equal(
    calls.filter(call => call.mode === 'stale' && /js-code-snapshot\/upload|\/source$/.test(call.path)).length,
    0,
    'stale preflight must stop before source upload or PATCH'
  );
  const stalePreflightIndex = calls.findIndex(
    call => call.mode === 'stale' && call.path.endsWith('/preflight')
  );
  assert.ok(stalePreflightIndex >= 0, 'stale publish must reach the aggregate preflight');
  const staleLeaseReleases = calls.filter(
    call =>
      call.mode === 'stale' &&
      call.method === 'POST' &&
      call.path.includes('/publish-lease/') &&
      call.path.endsWith('/release')
  );
  assert.equal(
    staleLeaseReleases.length,
    2,
    'a transient socket close while releasing a prewrite-failed lease must retry exactly once'
  );
  assert.equal(
    staleLeaseReleases[1]?.body?.completion,
    'prewrite-failed',
    'a preflight failure before any platform write must automatically release its command-scoped lease'
  );

  activeMode = 'fresh';
  const fresh = await runCli(publishArgs(freshChangeId));
  assert.equal(fresh.code, 0, fresh.stderr || fresh.stdout);
  const result = JSON.parse(fresh.stdout);
  const published = result.published.find(
    item => item.kind === 'function' && item.code === functionCode
  );
  assert.equal(published?.writeMode, 'backend-release-stage');
  assert.equal(published?.activation, 'staged');
  const freshPreflightIndex = calls.findIndex(
    call => call.mode === 'fresh' && call.path.endsWith('/preflight')
  );
  const freshUploadIndex = calls.findIndex(
    call => call.mode === 'fresh' && call.path.endsWith('/js-code-snapshot/upload')
  );
  const freshBackendIndex = calls.findIndex(
    call =>
      call.mode === 'fresh' &&
      call.method === 'POST' &&
      call.path.endsWith('/backend-releases')
  );
  assert.ok(
    freshPreflightIndex >= 0 &&
      freshUploadIndex > freshPreflightIndex &&
      freshBackendIndex > freshUploadIndex,
    'aggregate preflight must finish before any upload or Backend Release prepare'
  );

  const freshEnded = await runCli([
    'release',
    'end',
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(freshEnded.code, 0, freshEnded.stderr || freshEnded.stdout);

  activeMode = 'catchup';
  const catchup = await runCli(publishArgs(catchupChangeId, true));
  assert.equal(catchup.code, 0, catchup.stderr || catchup.stdout);
  const catchupJson = JSON.parse(catchup.stdout);
  assert.deepEqual(catchupJson.changeBaselinePreflight?.onlineBaselineAdoption, {
    mode: 'frozen_online_heads_v1',
    changeId: catchupChangeId,
    reason: 'approved historical mainline catch-up smoke',
  });
  const catchupPreflight = calls.find(
    call => call.mode === 'catchup' && call.path.endsWith('/preflight')
  );
  assert.equal(
    catchupPreflight?.body?.localBaseHeads?.[0]?.fields?.sourceArtifactHash,
    baseArtifactHash,
    'catch-up adoption must submit the frozen online Function head, not rebuild a synthetic Git base'
  );
  const catchupEnded = await runCli([
    'release',
    'end',
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(catchupEnded.code, 0, catchupEnded.stderr || catchupEnded.stdout);

  console.log('change baseline publish CLI smoke passed');
} finally {
  server.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
