import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { buildScopeGrantSourceSyncDecision } = require('../lib/cli');
const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'openxiangda-managed-target-scope-form-'),
);
const home = path.join(tempRoot, 'home');
const workspace = path.join(tempRoot, 'workspace');
const profileName = 'dev';
const targetName = 'instrument-example-pre';
const appType = 'APP_PRE';
const targetFormUuid = 'FORM_TARGET';
const productionFormUuid = 'FORM_PRODUCTION';

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
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

const scopeDimension = {
  code: 'customer',
  name: 'Customer',
  sourceFormCode: 'customer',
  sourceFormUuid: productionFormUuid,
  valueType: 'string',
  hierarchyMode: 'flat',
  sourceValueField: 'customerId',
  sourceLabelField: 'customerName',
  enabled: true,
};
const scopeGrantSource = {
  code: 'customer_grants',
  name: 'Customer grants',
  sourceFormCode: 'customer',
  sourceFormUuid: productionFormUuid,
  subjectMappings: [{ subjectType: 'user', field: 'userId' }],
  dimensionMappings: [{ dimensionCode: 'customer', field: 'customerId' }],
  syncMode: 'manual',
  enabled: true,
};

{
  const decision = buildScopeGrantSourceSyncDecision({
    source: {
      sourceFormUuid: 'FORM_ASSIGNMENT',
      dimensionMappings: [{ dimensionCode: 'customer' }],
    },
    dimensionMap: new Map([
      ['customer', { code: 'customer', sourceFormUuid: targetFormUuid }],
    ]),
    stagedFormBindingOverlays: new Map([
      [
        'customer',
        {
          formCode: 'customer',
          formUuid: targetFormUuid,
          parentReleaseId: null,
        },
      ],
      [
        'assignment',
        {
          formCode: 'assignment',
          formUuid: 'FORM_ASSIGNMENT',
          parentReleaseId: 'ACTIVE_FORM_RELEASE',
        },
      ],
    ]),
  });
  assert.deepEqual(decision, {
    defer: true,
    reason: 'staged_new_form_has_no_active_data_table',
    formUuids: [targetFormUuid],
    formCodes: ['customer'],
  });
  assert.equal(
    buildScopeGrantSourceSyncDecision({
      source: { sourceFormUuid: 'FORM_ASSIGNMENT' },
      stagedFormBindingOverlays: new Map([
        [
          'assignment',
          {
            formCode: 'assignment',
            formUuid: 'FORM_ASSIGNMENT',
            parentReleaseId: 'ACTIVE_FORM_RELEASE',
          },
        ],
      ]),
    }).defer,
    false,
    'existing active form releases must keep the normal initial sync'
  );
}

const server = http.createServer((request, response) => {
  response.setHeader('content-type', 'application/json');
  if (
    request.method === 'GET' &&
    request.url ===
      `/service/openxiangda-api/v1/apps/${appType}/scope/dimensions`
  ) {
    response.end(
      JSON.stringify({
        code: 200,
        data: [{ ...scopeDimension, sourceFormUuid: targetFormUuid }],
      }),
    );
    return;
  }
  if (
    request.method === 'GET' &&
    request.url ===
      `/service/openxiangda-api/v1/apps/${appType}/scope/grant-sources`
  ) {
    response.end(
      JSON.stringify({
        code: 200,
        data: [{ ...scopeGrantSource, sourceFormUuid: targetFormUuid }],
      }),
    );
    return;
  }
  response.statusCode = 404;
  response.end(
    JSON.stringify({
      code: 404,
      message: `not found ${request.method} ${request.url}`,
    }),
  );
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
    currentTarget: targetName,
    logicalApp: {
      id: 'logical-app-1',
      code: 'instrument-example-instrument-sharing',
      name: 'instrument-example instrument sharing',
      sourceRepositoryId: 'ssh://git.example/instrument-example.git',
    },
    profiles: {
      [profileName]: {
        appType: 'APP_PRODUCTION',
        resources: {
          forms: {
            customer: { formUuid: productionFormUuid },
          },
        },
      },
    },
    targets: {
      [targetName]: {
        targetName,
        profile: profileName,
        environmentId: '10000000-0000-4000-8000-000000000001',
        kind: 'preproduction',
        appType,
        resources: {
          forms: {
            customer: { formUuid: targetFormUuid },
          },
        },
      },
    },
  });
  writeJson(
    path.join(
      workspace,
      'src',
      'resources',
      'permissions',
      'scope-dimensions',
      'customer.json',
    ),
    scopeDimension,
  );
  writeJson(
    path.join(
      workspace,
      'src',
      'resources',
      'permissions',
      'scope-grant-sources',
      'customer-grants.json',
    ),
    scopeGrantSource,
  );
  fs.writeFileSync(
    path.join(workspace, 'app-workspace.config.ts'),
    'export default { runtimeMode: "react-spa" };\n',
  );

  const result = await runCli([
    'resource',
    'plan',
    'permission',
    '--only',
    'scopeDimension:customer,scopeGrantSource:customer_grants',
    '--profile',
    profileName,
    '--environment',
    targetName,
    '--json',
  ]);
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.appType, appType);
  assert.deepEqual(plan.summary, {
    create: 0,
    update: 0,
    noop: 2,
    delete: 0,
  });
  assert.deepEqual(
    plan.actions.map(item => [item.kind, item.code, item.action]),
    [
      ['scopeDimension', 'customer', 'noop'],
      ['scopeGrantSource', 'customer_grants', 'noop'],
    ],
  );
  console.log('managed target scope form resolution smoke passed');
} finally {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
