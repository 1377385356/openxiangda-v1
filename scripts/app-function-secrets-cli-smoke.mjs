import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const {
  clearSensitiveText,
  registerSensitiveText,
  writeJson,
} = require(path.join(repoRoot, 'lib', 'utils.js'));
const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'openxiangda-function-secrets-cli-')
);
const tempHome = path.join(tempRoot, 'home');
const workspace = path.join(tempRoot, 'workspace');
const origin = path.join(tempRoot, 'origin.git');
const profileName = 'dev';
const appType = 'APP_FUNCTION_SECRETS';
const secretName = 'dingtalk_org_app_secret';
const envName = 'HGY_TEST_APP_SECRET';
const canary = 'CANARY+"\\/=function-secret-20260716';
const canaryBase64 = Buffer.from(canary).toString('base64');
const encodedCanaries = [
  canary,
  JSON.stringify(canary).slice(1, -1),
  encodeURIComponent(canary),
  canaryBase64,
  canaryBase64.replace(/=+$/g, ''),
  Buffer.from(canary).toString('base64url'),
  Buffer.from(canary).toString('hex'),
].filter(Boolean);
const requests = [];
let capabilityReady = true;
let secretRevision = 0;
let secretDeleted = false;
let failNextMutation = false;
let includeHasValue = true;
let metadataHasValue = true;
let forbiddenMetadataField = null;

const forbiddenSecretMaterialKeys = new Set([
  'value',
  'secretvalue',
  'plaintext',
  'ciphertext',
  'cipher',
  'encryptedvalue',
  'encrypteddek',
  'wrappeddek',
  'valuehash',
  'cipherhash',
  'valuedigest',
  'cipherdigest',
  'valuelength',
  'cipherlength',
  'plaintextlength',
  'iv',
  'nonce',
  'authtag',
  'tag',
]);

function write(relativePath, value) {
  const file = path.join(workspace, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

function writeJsonFile(relativePath, value) {
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

function readBody(request) {
  return new Promise(resolve => {
    let raw = '';
    request.on('data', chunk => {
      raw += chunk;
    });
    request.on('end', () => resolve(raw ? JSON.parse(raw) : {}));
  });
}

function respond(response, data, status = 200, errorCode) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.end(
    JSON.stringify(
      status >= 400
        ? { code: status, success: false, errorCode, message: data.message, data: null }
        : { code: 0, success: true, data }
    )
  );
}

function listFiles(root) {
  const files = [];
  const visit = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else files.push(path.relative(root, file));
    }
  };
  visit(root);
  return files.sort();
}

function listWorkspaceFiles() {
  return listFiles(workspace);
}

function assertNoCanary(text, label) {
  for (const candidate of encodedCanaries) {
    assert.equal(
      String(text).includes(candidate),
      false,
      `${label} leaked ${candidate}`
    );
  }
}

function assertNoSecretMaterialKeys(value, label, pathParts = []) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoSecretMaterialKeys(item, label, [...pathParts, String(index)])
    );
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.replace(/[_-]/g, '').toLowerCase();
    assert.equal(
      forbiddenSecretMaterialKeys.has(normalizedKey),
      false,
      `${label} exposed forbidden Secret material key ${[
        ...pathParts,
        key,
      ].join('.')}`
    );
    assertNoSecretMaterialKeys(child, label, [...pathParts, key]);
  }
}

function backendSafeSecretMetadata() {
  return {
    name: secretName,
    status: 'active',
    revision: Math.max(secretRevision, 1),
    activeVersion: {
      version: 1,
      keyId: 'contract-test-key',
      createdAt: '2026-07-16T00:00:00.000Z',
    },
    ...(includeHasValue ? { hasValue: metadataHasValue } : {}),
    referenceCount: 0,
    unused: true,
    ...(forbiddenMetadataField ? { [forbiddenMetadataField]: canary } : {}),
  };
}

function runCli(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(repoRoot, 'bin', 'openxiangda.js'), ...args],
      {
        cwd: workspace,
        env: {
          ...process.env,
          HOME: tempHome,
          [envName]: canary,
          ...(options.env || {}),
        },
        stdio: ['pipe', 'pipe', 'pipe'],
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
    child.stdin.end(options.input || '');
  });
}

function runSecretRefPlan() {
  return runCli([
    'resource',
    'plan',
    'function',
    '--only',
    'secure_function',
    '--profile',
    profileName,
    '--change',
    'app-secret-metadata-contract',
    '--json',
  ]);
}

function functionManifest() {
  return {
    code: 'secure_function',
    name: 'Secure Function',
    secretRefs: [{ name: secretName, required: true }],
    definitionJson: {
      kind: 'app_function',
      version: 'function_v2',
      functionCode: 'secure_function',
      runtimeMode: 'trusted_node',
      runtimeContractVersion: 'trusted_node_v2',
      sourceType: 'file_snapshot',
      sourceFile: {
        localPath: 'src/functions/secure_function/index.ts',
      },
    },
  };
}

function functionPlanManifest() {
  const manifest = functionManifest();
  manifest.definitionJson.sourceFile = {
    bucketName: 'files',
    objectName: 'functions/secure_function/index.cjs',
    sha256: 'a'.repeat(64),
    size: 128,
  };
  return manifest;
}

function writeFunctionSource(body) {
  write('src/functions/secure_function/index.ts', body);
}

fs.mkdirSync(path.join(tempHome, '.openxiangda'), { recursive: true });
fs.mkdirSync(workspace, { recursive: true });
git(['init', '--bare', '--initial-branch=main', origin], tempRoot);
write('.gitignore', '.openxiangda/\nnode_modules/\n');
writeJsonFile('package.json', {
  name: 'sy-lowcode-app-workspace',
  private: true,
});
writeJsonFile(
  'src/resources/functions/secure_function.json',
  functionManifest()
);
writeFunctionSource(
  `export default async function (ctx, input) {
    const value = await ctx.secrets.get(${JSON.stringify(secretName)});
    return { configured: value.length > 0, marker: input.marker };
  }\n`
);

for (const args of [
  ['init', '-b', 'main'],
  ['config', 'user.email', 'secret-smoke@example.com'],
  ['config', 'user.name', 'Secret Smoke'],
  ['add', '.'],
  ['commit', '-m', 'app function secret fixture'],
  ['remote', 'add', 'origin', origin],
  ['push', '-u', 'origin', 'main'],
]) {
  git(args);
}

const server = http.createServer(async (request, response) => {
  const body = ['GET', 'HEAD'].includes(request.method || '')
    ? {}
    : await readBody(request);
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  requests.push({
    method: request.method,
    url: request.url,
    path: url.pathname,
    headers: request.headers,
    body,
  });
  const api = `/service/openxiangda-api/v1/apps/${appType}`;
  if (request.url.endsWith('/secrets/capabilities')) {
    return respond(response, {
      enabled: true,
      contractVersion: 'app_function_secrets_v1',
      runtimeContractVersion: 'trusted_node_v2',
      app_function_secrets_v1: true,
      trusted_node_v2: true,
      backend_release_v2: capabilityReady,
      atomic_staged_children_v2: capabilityReady,
      readiness: {
        backendReleaseV2: {
          contractVersion: 'backend_release_v2',
          ready: capabilityReady,
          migration: {
            filename:
              '1784294400000-EnableBackendReleaseV2MixedManifests.sql',
            applied: capabilityReady,
          },
          reasons: capabilityReady ? [] : ['migration-not-applied'],
        },
      },
    });
  }
  if (request.method === 'GET' && url.pathname === `${api}/snapshot`) {
    return respond(response, {
      app: { appType, updatedAt: '2026-07-16T00:00:00.000Z' },
    });
  }
  if (request.method === 'POST' && url.pathname === `${api}/change-baselines`) {
    return respond(response, {
      baselineId: 'BASELINE_SECRET_CLI',
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
      leaseId: 'LEASE_SECRET_CLI',
      appType,
      changeId: body.changeId,
      clientSessionId: body.clientSessionId,
      baseRevision: body.baseRevision,
      expiresAt: '2099-07-16T00:00:00.000Z',
      holder: 'self',
    });
  }
  if (
    request.method === 'POST' &&
    url.pathname === `${api}/publish-lease/LEASE_SECRET_CLI/release`
  ) {
    return respond(response, { active: false, appType });
  }
  if (
    failNextMutation &&
    !['GET', 'HEAD'].includes(request.method || '') &&
    url.pathname.includes('/secrets')
  ) {
    failNextMutation = false;
    return respond(
      response,
      { message: `server rejected ${canary} ${canaryBase64}` },
      500,
      'SECRET_SERVER_CANARY'
    );
  }
  if (request.method === 'POST' && url.pathname === `${api}/secrets`) {
    secretRevision = 1;
    secretDeleted = false;
    return respond(response, {
      name: body.name,
      status: 'active',
      revision: secretRevision,
      activeVersion: 1,
      hasValue: true,
      referenceCount: 0,
      unused: true,
    });
  }
  if (request.method === 'GET' && url.pathname === `${api}/secrets`) {
    return respond(response, {
      items: secretDeleted ? [] : [backendSafeSecretMetadata()],
      totalCount: secretDeleted ? 0 : 1,
    });
  }
  if (request.method === 'GET' && url.pathname === `${api}/functions`) {
    return respond(response, { items: [], totalCount: 0 });
  }
  if (
    request.method === 'PATCH' &&
    url.pathname === `${api}/secrets/${secretName}`
  ) {
    secretRevision += 1;
    return respond(response, {
      name: secretName,
      status: body.status || 'active',
      description: body.description,
      revision: secretRevision,
      activeVersion: 1,
      hasValue: true,
      referenceCount: 0,
      unused: true,
    });
  }
  if (
    request.method === 'POST' &&
    url.pathname === `${api}/secrets/${secretName}/rotate`
  ) {
    secretRevision += 1;
    return respond(response, {
      name: secretName,
      status: 'active',
      revision: secretRevision,
      activeVersion: 2,
      hasValue: true,
      referenceCount: 0,
      unused: true,
    });
  }
  if (
    request.method === 'POST' &&
    url.pathname === `${api}/secrets/${secretName}/delete`
  ) {
    secretRevision += 1;
    secretDeleted = true;
    return respond(response, {
      name: secretName,
      revision: secretRevision,
      deleted: true,
    });
  }
  if (
    request.method === 'GET' &&
    url.pathname === `${api}/secrets/${secretName}` &&
    secretRevision > 0 &&
    !secretDeleted
  ) {
    return respond(response, {
      name: secretName,
      status: 'active',
      revision: secretRevision,
      activeVersion: secretRevision >= 3 ? 2 : 1,
      hasValue: true,
      referenceCount: 0,
      unused: true,
    });
  }
  return respond(response, { message: 'not found' }, 404, 'NOT_FOUND');
});

try {
  const jsonOutput = [];
  const originalLog = console.log;
  console.log = value => jsonOutput.push(String(value));
  try {
    writeJson({ email: 'owner@example.com', phone: '13800138000' });
    assert.deepEqual(JSON.parse(jsonOutput.pop()), {
      email: 'owner@example.com',
      phone: '13800138000',
    });
    registerSensitiveText(canary);
    for (const candidate of encodedCanaries) {
      writeJson({ result: candidate });
      assert.equal(JSON.parse(jsonOutput.pop()).result, '***secret***');
    }
    registerSensitiveText('61');
    writeJson({ revision: 61, rendered: '61' });
    assert.deepEqual(JSON.parse(jsonOutput.pop()), {
      revision: 61,
      rendered: '***secret***',
    });
  } finally {
    clearSensitiveText();
    console.log = originalLog;
  }

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  fs.writeFileSync(
    path.join(tempHome, '.openxiangda', 'profiles.json'),
    `${JSON.stringify(
      {
        version: 1,
        currentProfile: profileName,
        profiles: {
          [profileName]: {
            baseUrl: `http://127.0.0.1:${port}/service`,
            token: { accessToken: 'test-access-token' },
          },
        },
      },
      null,
      2
    )}\n`
  );
  writeJsonFile('.openxiangda/state.json', {
    version: 1,
    profiles: { [profileName]: { appType, resources: {} } },
  });

  capabilityReady = false;
  const missingCapability = await runCli([
    'secret',
    'create',
    secretName,
    '--profile',
    profileName,
    '--change',
    'secret-smoke',
    '--dry-run',
    '--json',
  ]);
  assert.notEqual(missingCapability.code, 0);
  assert.match(
    `${missingCapability.stdout}\n${missingCapability.stderr}`,
    /APP_FUNCTION_SECRET_CAPABILITY_REQUIRED/
  );
  capabilityReady = true;

  const dryRun = await runCli(
    [
      'secret',
      'create',
      secretName,
      '--profile',
      profileName,
      '--change',
      'secret-smoke',
      '--dry-run',
      '--value-stdin',
      '--json',
    ],
    { input: canary }
  );
  assert.equal(dryRun.code, 0, dryRun.stderr || dryRun.stdout);
  const dryRunPayload = JSON.parse(dryRun.stdout);
  assert.equal(dryRunPayload.valueRead, false);
  assert.equal(dryRunPayload.writes, 0);
  assert.ok(requests.every(item => ['GET', 'HEAD'].includes(item.method)));
  assertNoCanary(`${dryRun.stdout}\n${dryRun.stderr}`, 'secret dry-run');

  const rejectedArg = await runCli([
    'secret',
    'create',
    secretName,
    '--profile',
    profileName,
    '--change',
    'secret-smoke',
    '--value',
    canary,
  ]);
  assert.notEqual(rejectedArg.code, 0);
  assert.match(rejectedArg.stderr, /禁止出现在命令行或文件参数/);
  assertNoCanary(rejectedArg.stderr, 'rejected --value');

  const create = await runCli(
    [
      'secret',
      'create',
      secretName,
      '--profile',
      profileName,
      '--change',
      'secret-smoke',
      '--value-stdin',
      '--json',
    ],
    { input: canary }
  );
  assert.equal(create.code, 0, create.stderr || create.stdout);
  assert.equal(JSON.parse(create.stdout).revision, 1);
  assertNoCanary(`${create.stdout}\n${create.stderr}`, 'secret create');
  const createCall = requests.find(
    item => item.method === 'POST' && item.path === `/service/openxiangda-api/v1/apps/${appType}/secrets`
  );
  assert.equal(createCall.body.name, secretName);
  assert.equal(createCall.body.value, canary);
  assert.equal(createCall.body.expectedRevision, 0);
  assert.match(createCall.body.idempotencyKey, /^openxiangda-secret-/);
  assert.equal(createCall.body.publishLeaseId, 'LEASE_SECRET_CLI');
  assert.equal(createCall.body.baselineId, 'BASELINE_SECRET_CLI');
  assert.equal(createCall.body.changeId, 'secret-smoke');
  assert.ok(createCall.body.clientSessionId);
  assert.equal(
    createCall.headers['x-openxiangda-publish-lease-id'],
    'LEASE_SECRET_CLI'
  );
  assert.equal(
    createCall.headers['x-openxiangda-change-baseline-id'],
    'BASELINE_SECRET_CLI'
  );

  writeJsonFile(
    'src/resources/functions/secure_function.json',
    functionPlanManifest()
  );
  includeHasValue = true;
  metadataHasValue = true;
  const configuredPlanResult = await runSecretRefPlan();
  assert.equal(
    configuredPlanResult.code,
    0,
    configuredPlanResult.stderr || configuredPlanResult.stdout
  );
  const configuredPlan = JSON.parse(configuredPlanResult.stdout);
  assert.equal(configuredPlan.functionSecretRefs.valid, true);
  assert.deepEqual(
    configuredPlan.functionSecretRefs.functions[0].missingRequired,
    []
  );
  assert.deepEqual(
    configuredPlan.actions.map(item => ({ kind: item.kind, code: item.code })),
    [{ kind: 'function', code: 'secure_function' }]
  );
  assertNoSecretMaterialKeys(configuredPlan, 'configured resource plan');
  assertNoCanary(
    `${configuredPlanResult.stdout}\n${configuredPlanResult.stderr}`,
    'configured resource plan'
  );

  includeHasValue = false;
  const missingHasValueResult = await runSecretRefPlan();
  assert.equal(
    missingHasValueResult.code,
    0,
    missingHasValueResult.stderr || missingHasValueResult.stdout
  );
  const missingHasValuePlan = JSON.parse(missingHasValueResult.stdout);
  assert.equal(missingHasValuePlan.functionSecretRefs.valid, false);
  assert.deepEqual(
    missingHasValuePlan.functionSecretRefs.functions[0].missingRequired,
    [{ name: secretName, reason: 'value-not-configured' }]
  );

  includeHasValue = true;
  metadataHasValue = false;
  const falseHasValueResult = await runSecretRefPlan();
  assert.equal(
    falseHasValueResult.code,
    0,
    falseHasValueResult.stderr || falseHasValueResult.stdout
  );
  const falseHasValuePlan = JSON.parse(falseHasValueResult.stdout);
  assert.equal(falseHasValuePlan.functionSecretRefs.valid, false);
  assert.deepEqual(
    falseHasValuePlan.functionSecretRefs.functions[0].missingRequired,
    [{ name: secretName, reason: 'value-not-configured' }]
  );

  metadataHasValue = true;
  for (const field of [
    'value',
    'ciphertext',
    'nonce',
    'authTag',
    'wrappedDek',
  ]) {
    forbiddenMetadataField = field;
    const forbiddenMetadataResult = await runSecretRefPlan();
    assert.notEqual(forbiddenMetadataResult.code, 0, field);
    assert.match(
      `${forbiddenMetadataResult.stdout}\n${forbiddenMetadataResult.stderr}`,
      /APP_SECRET_RESPONSE_CONTRACT_VIOLATION/,
      field
    );
    assertNoCanary(
      `${forbiddenMetadataResult.stdout}\n${forbiddenMetadataResult.stderr}`,
      `forbidden metadata response ${field}`
    );
  }
  forbiddenMetadataField = null;
  writeJsonFile(
    'src/resources/functions/secure_function.json',
    functionManifest()
  );

  const update = await runCli([
    'secret',
    'update',
    secretName,
    '--profile',
    profileName,
    '--change',
    'secret-smoke',
    '--expected-revision',
    '1',
    '--description',
    'rotatable organization credential',
    '--json',
  ]);
  assert.equal(update.code, 0, update.stderr || update.stdout);
  assert.equal(JSON.parse(update.stdout).revision, 2);
  const updateCall = requests.find(
    item =>
      item.method === 'PATCH' &&
      item.path === `/service/openxiangda-api/v1/apps/${appType}/secrets/${secretName}`
  );
  assert.equal(updateCall.body.expectedRevision, 1);
  assert.equal(updateCall.body.publishLeaseId, 'LEASE_SECRET_CLI');
  assert.equal(updateCall.body.baselineId, 'BASELINE_SECRET_CLI');
  assert.equal(updateCall.body.value, undefined);

  const rotate = await runCli(
    [
      'secret',
      'rotate',
      secretName,
      '--profile',
      profileName,
      '--change',
      'secret-smoke',
      '--expected-revision',
      '2',
      '--reason',
      'scheduled credential rotation',
      '--value-stdin',
      '--json',
    ],
    { input: canary }
  );
  assert.equal(rotate.code, 0, rotate.stderr || rotate.stdout);
  assert.equal(JSON.parse(rotate.stdout).revision, 3);
  assertNoCanary(`${rotate.stdout}\n${rotate.stderr}`, 'secret rotate');
  const rotateCall = requests.find(
    item =>
      item.method === 'POST' &&
      item.path === `/service/openxiangda-api/v1/apps/${appType}/secrets/${secretName}/rotate`
  );
  assert.equal(rotateCall.body.value, canary);
  assert.equal(rotateCall.body.expectedRevision, 2);
  assert.match(rotateCall.body.idempotencyKey, /^openxiangda-secret-/);
  assert.equal(rotateCall.body.publishLeaseId, 'LEASE_SECRET_CLI');

  failNextMutation = true;
  const maskedServerError = await runCli(
    [
      'secret',
      'rotate',
      secretName,
      '--profile',
      profileName,
      '--change',
      'secret-smoke',
      '--expected-revision',
      '3',
      '--reason',
      'exercise redacted server failure',
      '--value-stdin',
      '--json',
    ],
    { input: canary }
  );
  assert.notEqual(maskedServerError.code, 0);
  assert.match(
    `${maskedServerError.stdout}\n${maskedServerError.stderr}`,
    /SECRET_SERVER_CANARY|500/
  );
  assertNoCanary(
    `${maskedServerError.stdout}\n${maskedServerError.stderr}`,
    'secret server error'
  );

  const remove = await runCli([
    'secret',
    'delete',
    secretName,
    '--profile',
    profileName,
    '--change',
    'secret-smoke',
    '--expected-revision',
    '3',
    '--reason',
    'retire unused credential after migration',
    '--json',
  ]);
  assert.equal(remove.code, 0, remove.stderr || remove.stdout);
  assert.equal(JSON.parse(remove.stdout).deleted, true);
  const deleteCall = requests.find(
    item =>
      item.method === 'POST' &&
      item.path === `/service/openxiangda-api/v1/apps/${appType}/secrets/${secretName}/delete`
  );
  assert.equal(deleteCall.body.expectedRevision, 3);
  assert.equal(deleteCall.body.value, undefined);
  assert.equal(deleteCall.body.publishLeaseId, 'LEASE_SECRET_CLI');
  assert.equal(
    requests.some(
      item =>
        item.method === 'DELETE' &&
        item.path.includes(`/secrets/${secretName}`)
    ),
    false,
    'Secret delete must use the proxy-safe POST action'
  );

  const ended = await runCli([
    'release',
    'end',
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(ended.code, 0, ended.stderr || ended.stdout);

  const nestedSecretRefs = await runCli([
    'function',
    'create',
    'nested_secret_refs',
    '--profile',
    profileName,
    '--body-json',
    JSON.stringify({
      code: 'nested_secret_refs',
      definitionJson: {
        version: 'function_v2',
        runtimeMode: 'trusted_node',
        runtimeContractVersion: 'trusted_node_v2',
        secretRefs: [{ name: secretName, required: true }],
      },
    }),
    '--dry-run',
    '--json',
  ]);
  assert.notEqual(nestedSecretRefs.code, 0);
  assert.match(
    `${nestedSecretRefs.stdout}\n${nestedSecretRefs.stderr}`,
    /APP_FUNCTION_SECRET_STAGED_RELEASE_REQUIRED/
  );

  const beforeFiles = listWorkspaceFiles();
  const safe = await runCli([
    'function',
    'test',
    'secure_function',
    '--secret-from-env',
    `${secretName}=${envName}`,
    '--input-json',
    '{"marker":"safe"}',
    '--json',
  ]);
  assert.equal(safe.code, 0, safe.stderr || safe.stdout);
  assert.equal(JSON.parse(safe.stdout).result.configured, true);
  assertNoCanary(`${safe.stdout}\n${safe.stderr}`, 'safe function test');
  assert.deepEqual(listWorkspaceFiles(), beforeFiles, 'function test wrote workspace files');

  const exfiltrationCases = [
    {
      label: 'raw return',
      source: `export default async function (ctx) { return await ctx.secrets.get(${JSON.stringify(secretName)}); }\n`,
    },
    {
      label: 'base64 return',
      source: `export default async function (ctx) { const value = await ctx.secrets.get(${JSON.stringify(secretName)}); return Buffer.from(value).toString("base64"); }\n`,
    },
    {
      label: 'encoded log',
      source: `export default async function (ctx) { const value = await ctx.secrets.get(${JSON.stringify(secretName)}); console.log(encodeURIComponent(value)); return { ok: true }; }\n`,
    },
    {
      label: 'encoded error',
      source: `export default async function (ctx) { const value = await ctx.secrets.get(${JSON.stringify(secretName)}); throw new Error(Buffer.from(value).toString("base64url")); }\n`,
    },
  ];
  for (const scenario of exfiltrationCases) {
    writeFunctionSource(scenario.source);
    const result = await runCli([
      'function',
      'test',
      'secure_function',
      '--secret-from-env',
      `${secretName}=${envName}`,
      '--json',
    ]);
    assert.notEqual(result.code, 0, scenario.label);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /APP_SECRET_EXFILTRATION_BLOCKED/,
      scenario.label
    );
    assertNoCanary(`${result.stdout}\n${result.stderr}`, scenario.label);
    assert.deepEqual(
      listWorkspaceFiles(),
      beforeFiles,
      `${scenario.label} wrote workspace files`
    );
  }

  writeFunctionSource(
    'export default async function (ctx) { return await ctx.secrets.get("not_declared"); }\n'
  );
  const undeclared = await runCli([
    'function',
    'test',
    'secure_function',
    '--secret-from-env',
    `${secretName}=${envName}`,
    '--json',
  ]);
  assert.notEqual(undeclared.code, 0);
  assert.match(
    `${undeclared.stdout}\n${undeclared.stderr}`,
    /FUNCTION_SECRET_REF_UNDECLARED/
  );
  assertNoCanary(`${undeclared.stdout}\n${undeclared.stderr}`, 'undeclared ref');

  for (const file of listWorkspaceFiles()) {
    assertNoCanary(
      fs.readFileSync(path.join(workspace, file), 'utf8'),
      `workspace file ${file}`
    );
  }
  for (const file of listFiles(tempHome)) {
    assertNoCanary(
      fs.readFileSync(path.join(tempHome, file), 'utf8'),
      `home/state file ${file}`
    );
  }
  console.log('app function secrets CLI smoke passed');
} finally {
  server.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
