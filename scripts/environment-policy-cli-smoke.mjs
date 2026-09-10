import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'openxiangda-environment-policy-cli-'),
);
const home = path.join(tempRoot, 'home');
const workspace = path.join(tempRoot, 'workspace');
const profileName = 'dev';
const preEnvironmentId = '20000000-0000-4000-8000-000000000001';
const productionEnvironmentId = '20000000-0000-4000-8000-000000000002';
const posts = [];
let swapRequests = 0;

const environmentSet = {
  id: 'logical-app-1',
  code: 'instrument-example-instrument-sharing',
  name: '示例学校大型仪器共享',
  sourceRepositoryId: 'ssh://git.example/instrument-example.git',
  environments: [
    {
      id: preEnvironmentId,
      environmentSetId: 'logical-app-1',
      kind: 'preproduction',
      appType: 'APP_PRE',
      displayName: '示例学校预发',
      publicOrigin: 'https://pre.example.com',
      revision: 3,
      sideEffectPolicy: {
        notifications: 'tester_allowlist',
        notificationAllowlist: [],
        organizationWrites: 'deny',
        scheduledAutomations: 'disabled',
        externalWrites: 'allowlist',
        payments: 'deny',
        publicIndexing: 'deny',
        environmentBanner: true,
        externalReservationDepartmentRootId:
          '868221ce-3a9f-4b1d-8e15-b312a54b8574',
      },
    },
    {
      id: productionEnvironmentId,
      environmentSetId: 'logical-app-1',
      kind: 'production',
      appType: 'APP_PROD',
      displayName: '示例学校正式',
      publicOrigin: 'https://prod.example.com',
      revision: 8,
      sideEffectPolicy: {
        notifications: 'real',
        organizationWrites: 'explicit_capability_only',
        scheduledAutomations: 'enabled',
        externalWrites: 'configured',
        payments: 'configured',
        publicIndexing: 'configured',
        environmentBanner: false,
      },
    },
  ],
};

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
      },
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
  const setPath =
    '/service/openxiangda-api/v1/environment-sets/instrument-example-instrument-sharing';
  if (request.method === 'GET' && request.url === setPath) {
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({ code: 0, success: true, data: environmentSet }),
    );
    return;
  }
  if (request.url?.endsWith('/environments/swap-roles')) {
    swapRequests += 1;
    response.statusCode = 500;
    response.end('policy update must not use environment swap');
    return;
  }
  const policyMatch = request.url?.match(
    /^\/service\/openxiangda-api\/v1\/environment-sets\/instrument-example-instrument-sharing\/environments\/([^/]+)\/policy$/,
  );
  if (request.method === 'POST' && policyMatch) {
    const body = await readBody(request);
    const environment = environmentSet.environments.find(
      item => item.id === decodeURIComponent(policyMatch[1]),
    );
    if (!environment) {
      response.statusCode = 404;
      response.end('environment not found');
      return;
    }
    posts.push({ url: request.url, body });
    const before = JSON.parse(JSON.stringify(environment.sideEffectPolicy));
    const normalizedPatch = {
      ...body.sideEffectPolicy,
      ...(Object.prototype.hasOwnProperty.call(
        body.sideEffectPolicy,
        'externalDingTalkDepartmentRootId',
      )
        ? {
            externalDingTalkDepartmentRootId: String(
              body.sideEffectPolicy.externalDingTalkDepartmentRootId,
            ),
          }
        : {}),
    };
    environment.sideEffectPolicy = body.fullReplace
      ? normalizedPatch
      : { ...environment.sideEffectPolicy, ...normalizedPatch };
    environment.revision += 1;
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        code: 0,
        success: true,
        data: {
          environment,
          audit: {
            id: `audit-${posts.length}`,
            actorId: 'user-1',
            reason: body.reason,
            before,
            after: environment.sideEffectPolicy,
            expectedRevision: body.expectedRevision,
            resultRevision: environment.revision,
          },
        },
      }),
    );
    return;
  }
  response.statusCode = 404;
  response.end('not found');
});

try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  writeJson((fs.mkdirSync(path.join(workspace, '.openxiangda'), { recursive: true }), path.join(workspace, '.openxiangda', 'profiles.json')), {
    version: 1,
    currentProfile: profileName,
    profiles: {
      [profileName]: {
        baseUrl: `http://127.0.0.1:${port}/service`,
        token: { accessToken: 'test-access-token' },
      },
    },
  });
  const stateFile = path.join(workspace, '.openxiangda', 'state.json');
  const initialState = {
    version: 1,
    logicalApp: {
      id: environmentSet.id,
      code: environmentSet.code,
      name: environmentSet.name,
      sourceRepositoryId: environmentSet.sourceRepositoryId,
    },
    currentTarget: 'instrument-example-pre',
    targets: {
      'instrument-example-pre': {
        targetName: 'instrument-example-pre',
        profile: profileName,
        environmentId: preEnvironmentId,
        kind: 'preproduction',
        appType: 'APP_PRE',
        revision: 3,
        lastCandidateId: 'candidate-pre',
        lastDeploymentId: 'deployment-pre',
        runtime: { activeReleaseId: 'runtime-pre' },
        resources: { forms: { pre: { formUuid: 'FORM_PRE' } } },
      },
      'instrument-example-prod': {
        targetName: 'instrument-example-prod',
        profile: profileName,
        environmentId: productionEnvironmentId,
        kind: 'production',
        appType: 'APP_PROD',
        revision: 8,
        lastCandidateId: 'candidate-prod',
        lastDeploymentId: 'deployment-prod',
        runtime: { activeReleaseId: 'runtime-prod' },
        resources: { forms: { prod: { formUuid: 'FORM_PROD' } } },
      },
    },
  };
  writeJson(stateFile, initialState);

  const prePatch = JSON.stringify({
    organizationWrites: 'explicit_capability_only',
    notifications: 'real',
    externalDingTalkDepartmentRootId: 996194759,
  });
  const dryRun = await runCli([
    'environment',
    'policy',
    'update',
    'preproduction',
    '--side-effect-policy-json',
    prePatch,
    '--reason',
    'Enable instrument-example external registration UAT safely',
    '--dry-run',
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(dryRun.code, 0, dryRun.stderr);
  const preview = JSON.parse(dryRun.stdout);
  assert.equal(preview.dryRun, true);
  assert.equal(preview.changed, true);
  assert.equal(preview.expectedRevision, 3);
  assert.equal(
    preview.after.externalDingTalkDepartmentRootId,
    '996194759',
  );
  assert.equal(preview.after.payments, 'deny');
  assert.equal(
    preview.before.externalReservationDepartmentRootId,
    '868221ce-3a9f-4b1d-8e15-b312a54b8574',
  );
  assert.equal(
    preview.after.externalReservationDepartmentRootId,
    '868221ce-3a9f-4b1d-8e15-b312a54b8574',
  );
  assert.equal(posts.length, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(stateFile, 'utf8')), initialState);

  const update = await runCli([
    'environment',
    'policy',
    'update',
    'instrument-example-pre',
    '--side-effect-policy-json',
    prePatch,
    '--reason',
    'Enable instrument-example external registration UAT safely',
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(update.code, 0, update.stderr);
  assert.equal(posts.length, 1);
  assert.match(posts[0].url, new RegExp(`${preEnvironmentId}/policy$`));
  assert.deepEqual(posts[0].body, {
    expectedRevision: 3,
    sideEffectPolicy: {
      organizationWrites: 'explicit_capability_only',
      notifications: 'real',
      externalDingTalkDepartmentRootId: 996194759,
    },
    reason: 'Enable instrument-example external registration UAT safely',
    fullReplace: false,
    confirmProduction: false,
  });
  const updatedState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(updatedState.targets['instrument-example-pre'].revision, 4);
  assert.equal(updatedState.targets['instrument-example-pre'].lastCandidateId, 'candidate-pre');
  assert.equal(updatedState.targets['instrument-example-pre'].lastDeploymentId, 'deployment-pre');
  assert.equal(
    updatedState.targets['instrument-example-pre'].runtime.activeReleaseId,
    'runtime-pre',
  );
  assert.deepEqual(updatedState.targets['instrument-example-prod'], initialState.targets['instrument-example-prod']);

  const fullReplaceDryRun = await runCli([
    'environment',
    'policy',
    'update',
    'preproduction',
    '--side-effect-policy-json',
    JSON.stringify({ payments: 'deny' }),
    '--reason',
    'Preview an explicit complete policy replacement',
    '--full-replace',
    '--dry-run',
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(fullReplaceDryRun.code, 0, fullReplaceDryRun.stderr);
  const fullReplacePreview = JSON.parse(fullReplaceDryRun.stdout);
  assert.deepEqual(fullReplacePreview.after, { payments: 'deny' });
  assert.equal(
    fullReplacePreview.before.externalReservationDepartmentRootId,
    '868221ce-3a9f-4b1d-8e15-b312a54b8574',
  );
  assert.equal(posts.length, 1);

  const missingProductionConfirmation = await runCli([
    'environment',
    'policy',
    'update',
    'production',
    '--side-effect-policy-json',
    JSON.stringify({ payments: 'deny' }),
    '--reason',
    'Apply an intentional production payment block',
    '--profile',
    profileName,
  ]);
  assert.notEqual(missingProductionConfirmation.code, 0);
  assert.match(missingProductionConfirmation.stderr, /--confirm-production/);
  assert.equal(posts.length, 1);

  const productionDryRun = await runCli([
    'environment',
    'policy',
    'update',
    'production',
    '--side-effect-policy-json',
    JSON.stringify({ payments: 'deny' }),
    '--reason',
    'Preview an intentional production payment block',
    '--dry-run',
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(productionDryRun.code, 0, productionDryRun.stderr);
  assert.equal(posts.length, 1);

  const productionUpdate = await runCli([
    'environment',
    'policy',
    'update',
    'production',
    '--side-effect-policy-json',
    JSON.stringify({ payments: 'deny' }),
    '--reason',
    'Apply an intentional production payment block',
    '--confirm-production',
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(productionUpdate.code, 0, productionUpdate.stderr);
  assert.equal(posts.length, 2);
  assert.equal(posts[1].body.expectedRevision, 8);
  assert.equal(posts[1].body.confirmProduction, true);

  const unknownField = await runCli([
    'environment',
    'policy',
    'update',
    'preproduction',
    '--side-effect-policy-json',
    JSON.stringify({ secretToken: 'must-not-be-written' }),
    '--reason',
    'Reject unknown fields before platform writes',
    '--profile',
    profileName,
  ]);
  assert.notEqual(unknownField.code, 0);
  assert.match(unknownField.stderr, /不是允许的副作用策略字段/);
  assert.equal(posts.length, 2);
  assert.equal(swapRequests, 0);

  console.log('environment policy CLI smoke passed');
} finally {
  server.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
