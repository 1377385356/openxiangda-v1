import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'openxiangda-environment-swap-cli-')
);
const home = path.join(tempRoot, 'home');
const workspace = path.join(tempRoot, 'workspace');
const profileName = 'dev';
const preEnvironmentId = '10000000-0000-4000-8000-000000000001';
const productionEnvironmentId = '10000000-0000-4000-8000-000000000002';
let capturedBody = null;
const snapshotAppTypes = [];

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function readBody(request) {
  return new Promise(resolve => {
    let raw = '';
    request.on('data', chunk => {
      raw += chunk;
    });
    request.on('end', () => resolve(raw ? JSON.parse(raw) : {}));
  });
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(repoRoot, 'bin', 'openxiangda.js'), ...args],
      {
        cwd: workspace,
        env: { ...process.env, HOME: home },
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
}

const server = http.createServer(async (request, response) => {
  const snapshotMatch = request.url?.match(
    /^\/service\/openxiangda-api\/v1\/apps\/([^/]+)\/snapshot$/,
  );
  if (request.method === 'GET' && snapshotMatch) {
    snapshotAppTypes.push(decodeURIComponent(snapshotMatch[1]));
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        code: 0,
        success: true,
        data: { app: { appType: decodeURIComponent(snapshotMatch[1]) } },
      }),
    );
    return;
  }
  if (
    request.method === 'POST' &&
    request.url ===
      '/service/openxiangda-api/v1/environment-sets/instrument-example-instrument-sharing/environments/swap-roles'
  ) {
    capturedBody = await readBody(request);
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        code: 0,
        success: true,
        data: {
          id: 'logical-app-1',
          code: 'instrument-example-instrument-sharing',
          name: '示例学校大型仪器共享',
          sourceRepositoryId: 'ssh://git.example/instrument-example.git',
          environments: [
            {
              id: productionEnvironmentId,
              kind: 'preproduction',
              appType: 'APP_EMPTY',
              displayName: '示例学校新预发',
              sideEffectPolicy: { payments: 'deny' },
            },
            {
              id: preEnvironmentId,
              kind: 'production',
              appType: 'APP_CURRENT',
              displayName: '示例学校正式',
              sideEffectPolicy: {
                payments: 'deny',
                scheduledAutomations: 'disabled',
              },
            },
          ],
          roleSwap: {
            reason: '将已有业务数据的应用调整为正式应用',
            swappedBy: 'user-1',
          },
        },
      })
    );
    return;
  }
  response.statusCode = 404;
  response.end('not found');
});

try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  writeJson(path.join(home, '.openxiangda', 'profiles.json'), {
    version: 1,
    currentProfile: profileName,
    profiles: {
      [profileName]: {
        baseUrl: `http://127.0.0.1:${port}/service`,
        token: { accessToken: 'test-access-token' },
      },
    },
  });
  writeJson(path.join(workspace, '.openxiangda', 'state.json'), {
    version: 1,
    logicalApp: {
      id: 'logical-app-1',
      code: 'instrument-example-instrument-sharing',
      name: '示例学校大型仪器共享',
      sourceRepositoryId: 'ssh://git.example/instrument-example.git',
    },
    currentTarget: 'instrument-example-pre',
    profiles: {
      [profileName]: {
        appType: 'APP_CURRENT',
        resources: {
          forms: {
            production_form: { formUuid: 'FORM_PRODUCTION' },
          },
        },
      },
    },
    targets: {
      'instrument-example-pre': {
        targetName: 'instrument-example-pre',
        profile: profileName,
        environmentId: preEnvironmentId,
        kind: 'preproduction',
        appType: 'APP_CURRENT',
        lastCandidateId: 'candidate-current',
        lastDeploymentId: 'deployment-current',
        lastDeploymentStatus: 'activated',
        runtime: {
          activeReleaseId: 'runtime-current',
          assetBaseUrl: '/apps/APP_CURRENT/runtime/',
        },
        resources: { forms: { current: { formUuid: 'FORM_CURRENT' } } },
      },
      'instrument-example-prod': {
        targetName: 'instrument-example-prod',
        profile: profileName,
        environmentId: productionEnvironmentId,
        kind: 'production',
        appType: 'APP_EMPTY',
        lastCandidateId: 'candidate-empty',
        lastDeploymentId: 'deployment-empty',
        lastDeploymentStatus: 'failed',
        resources: { pages: { empty: { pageId: 'PAGE_EMPTY' } } },
      },
    },
  });
  writeJson(path.join(workspace, 'package.json'), {
    name: 'environment-target-publish-smoke',
    private: true,
    type: 'module',
    scripts: {
      'sync-schema': 'node capture-publish-env.mjs',
    },
  });
  fs.writeFileSync(
    path.join(workspace, 'app-workspace.config.ts'),
    'export default { runtimeMode: "react-spa" };\n',
  );
  fs.writeFileSync(
    path.join(workspace, 'capture-publish-env.mjs'),
    [
      "import fs from 'node:fs';",
      "fs.writeFileSync('publish-env.json', JSON.stringify({",
      "  appType: process.env.OPENXIANGDA_APP_TYPE,",
      "  profile: process.env.OPENXIANGDA_PROFILE,",
      "  target: process.env.OPENXIANGDA_TARGET,",
      "  argv: process.argv.slice(2),",
      "}, null, 2));",
      '',
    ].join('\n'),
  );

  const missingConfirmation = await runCli([
    'environment',
    'swap',
    '--reason',
    '将已有业务数据的应用调整为正式应用',
    '--profile',
    profileName,
  ]);
  assert.notEqual(missingConfirmation.code, 0);
  assert.match(missingConfirmation.stderr, /--confirm-production/);

  const result = await runCli([
    'environment',
    'swap',
    '--reason',
    '将已有业务数据的应用调整为正式应用',
    '--confirm-production',
    '--production-side-effect-policy-json',
    JSON.stringify({ payments: 'deny', scheduledAutomations: 'disabled' }),
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.deepEqual(capturedBody, {
    confirmation: 'SWAP_PREPRODUCTION_AND_PRODUCTION',
    reason: '将已有业务数据的应用调整为正式应用',
    preproduction: {},
    production: {
      sideEffectPolicy: {
        payments: 'deny',
        scheduledAutomations: 'disabled',
      },
    },
  });

  const state = JSON.parse(
    fs.readFileSync(
      path.join(workspace, '.openxiangda', 'state.json'),
      'utf8'
    )
  );
  assert.equal(state.currentTarget, 'instrument-example-pre');
  assert.equal(state.targets['instrument-example-pre'].kind, 'preproduction');
  assert.equal(state.targets['instrument-example-pre'].appType, 'APP_EMPTY');
  assert.equal(
    state.targets['instrument-example-pre'].resources.pages.empty.pageId,
    'PAGE_EMPTY'
  );
  assert.equal(
    state.targets['instrument-example-pre'].lastCandidateId,
    'candidate-empty'
  );
  assert.equal(
    state.targets['instrument-example-pre'].lastDeploymentId,
    'deployment-empty'
  );
  assert.equal(state.targets['instrument-example-pre'].lastDeploymentStatus, 'failed');
  assert.equal(state.targets['instrument-example-pre'].runtime, undefined);
  assert.equal(state.targets['instrument-example-prod'].kind, 'production');
  assert.equal(state.targets['instrument-example-prod'].appType, 'APP_CURRENT');
  assert.equal(
    state.targets['instrument-example-prod'].resources.forms.current.formUuid,
    'FORM_CURRENT'
  );
  assert.equal(
    state.targets['instrument-example-prod'].lastCandidateId,
    'candidate-current'
  );
  assert.equal(
    state.targets['instrument-example-prod'].lastDeploymentId,
    'deployment-current'
  );
  assert.equal(state.targets['instrument-example-prod'].lastDeploymentStatus, 'activated');
  assert.deepEqual(state.targets['instrument-example-prod'].runtime, {
    activeReleaseId: 'runtime-current',
    assetBaseUrl: '/apps/APP_CURRENT/runtime/',
  });

  const publishDryRun = await runCli([
    'workspace',
    'publish',
    '--environment',
    'instrument-example-pre',
    '--form',
    'hgy_asset',
    '--dry-run',
    '--skip-resources',
  ]);
  assert.equal(
    publishDryRun.code,
    0,
    publishDryRun.stderr || publishDryRun.stdout,
  );
  assert.deepEqual(snapshotAppTypes, ['APP_EMPTY']);
  const publishEnv = JSON.parse(
    fs.readFileSync(path.join(workspace, 'publish-env.json'), 'utf8'),
  );
  assert.equal(publishEnv.appType, 'APP_EMPTY');
  assert.equal(publishEnv.profile, profileName);
  assert.equal(publishEnv.target, 'instrument-example-pre');
  assert.deepEqual(publishEnv.argv, ['--form', 'hgy_asset', '--dry-run']);
} finally {
  await new Promise((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve()))
  );
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('environment swap CLI smoke passed');
