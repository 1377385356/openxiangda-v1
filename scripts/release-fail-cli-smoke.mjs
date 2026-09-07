import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repoRoot, 'bin', 'openxiangda.js');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openxiangda-release-fail-'));
const home = path.join(tempRoot, 'home');
const workspace = path.join(tempRoot, 'workspace');
const profileName = 'mock';
const logicalAppCode = 'sample-managed-app';
const preproductionEnvironmentId = '10000000-0000-4000-8000-000000000001';
const productionEnvironmentId = '10000000-0000-4000-8000-000000000002';
const deploymentId = '20000000-0000-4000-8000-000000000001';
const wrongEnvironmentDeploymentId = '20000000-0000-4000-8000-000000000002';
const calls = [];

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

function respond(response, data, statusCode = 200) {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ code: statusCode === 200 ? 0 : statusCode, success: statusCode === 200, data }));
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: workspace,
      env: { ...process.env, HOME: home },
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

const deploymentPath =
  `/service/openxiangda-api/v1/environment-sets/${logicalAppCode}` +
  `/deployments/${deploymentId}`;
const wrongEnvironmentDeploymentPath =
  `/service/openxiangda-api/v1/environment-sets/${logicalAppCode}` +
  `/deployments/${wrongEnvironmentDeploymentId}`;
const server = http.createServer(async (request, response) => {
  const body = request.method === 'POST' ? await readBody(request) : {};
  calls.push({ method: request.method, path: request.url, body });
  if (request.method === 'GET' && request.url === deploymentPath) {
    return respond(response, {
      id: deploymentId,
      kind: 'deploy',
      candidateId: '30000000-0000-4000-8000-000000000001',
      targetEnvironmentId: preproductionEnvironmentId,
      status: 'deployed',
    });
  }
  if (
    request.method === 'GET' &&
    request.url === wrongEnvironmentDeploymentPath
  ) {
    return respond(response, {
      id: wrongEnvironmentDeploymentId,
      kind: 'promotion',
      candidateId: '30000000-0000-4000-8000-000000000002',
      targetEnvironmentId: productionEnvironmentId,
      status: 'deployed',
    });
  }
  if (request.method === 'POST' && request.url === `${deploymentPath}/fail`) {
    return respond(response, {
      id: deploymentId,
      kind: 'deploy',
      candidateId: '30000000-0000-4000-8000-000000000001',
      targetEnvironmentId: preproductionEnvironmentId,
      status: 'failed',
      failureCode: body.code || null,
      failureMessage: body.message,
      failureDetails: body.details || null,
    });
  }
  return respond(response, { message: 'not found' }, 404);
});

try {
  fs.mkdirSync(workspace, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  writeJson(path.join(home, '.openxiangda', 'profiles.json'), {
    version: 1,
    currentProfile: profileName,
    profiles: {
      [profileName]: {
        baseUrl: `http://127.0.0.1:${port}/service`,
        token: { accessToken: 'test-token' },
      },
    },
  });
  writeJson(path.join(workspace, '.openxiangda', 'state.json'), {
    version: 1,
    logicalApp: {
      id: 'logical-app-1',
      code: logicalAppCode,
      name: 'Sample Managed App',
      sourceRepositoryId: 'sha256:sample-managed-app',
    },
    currentTarget: 'preproduction',
    targets: {
      preproduction: {
        targetName: 'preproduction',
        profile: profileName,
        environmentId: preproductionEnvironmentId,
        kind: 'preproduction',
        appType: 'APP_PREPRODUCTION',
        resources: {},
      },
      production: {
        targetName: 'production',
        profile: profileName,
        environmentId: productionEnvironmentId,
        kind: 'production',
        appType: 'APP_PRODUCTION',
        resources: {},
      },
    },
  });
  fs.writeFileSync(
    path.join(workspace, 'app-workspace.config.ts'),
    'export default { runtimeMode: "react-spa" };\n',
  );
  const detailsFile = path.join(workspace, 'uat-failure.json');
  writeJson(detailsFile, {
    gate: 'uat',
    failedCases: ['organization-multi-role'],
  });

  const successfulStart = calls.length;
  const successful = await runCli([
    'release',
    'fail',
    '--deployment',
    deploymentId,
    '--message',
    'UAT 多角色组织权限验证未通过',
    '--code',
    'UAT_FAILED',
    '--details-json',
    detailsFile,
    '--environment',
    'preproduction',
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(successful.code, 0, successful.stderr || successful.stdout);
  const result = JSON.parse(successful.stdout);
  assert.equal(result.failed, true);
  assert.equal(result.deployment.id, deploymentId);
  assert.equal(result.deployment.status, 'failed');
  assert.deepEqual(calls.slice(successfulStart), [
    { method: 'GET', path: deploymentPath, body: {} },
    {
      method: 'POST',
      path: `${deploymentPath}/fail`,
      body: {
        code: 'UAT_FAILED',
        message: 'UAT 多角色组织权限验证未通过',
        details: {
          gate: 'uat',
          failedCases: ['organization-multi-role'],
        },
      },
    },
  ]);

  const missingMessageStart = calls.length;
  const missingMessage = await runCli([
    'release',
    'fail',
    '--deployment',
    deploymentId,
    '--environment',
    'preproduction',
    '--profile',
    profileName,
  ]);
  assert.notEqual(missingMessage.code, 0);
  assert.match(missingMessage.stderr, /--message <text>/);
  assert.equal(calls.length, missingMessageStart);

  const productionStart = calls.length;
  const production = await runCli([
    'release',
    'fail',
    '--deployment',
    deploymentId,
    '--message',
    'must not reach production',
    '--environment',
    'production',
    '--profile',
    profileName,
  ]);
  assert.notEqual(production.code, 0);
  assert.match(production.stderr, /RELEASE_FAIL_PREPRODUCTION_ONLY/);
  assert.equal(calls.length, productionStart);

  const mismatchStart = calls.length;
  const mismatch = await runCli([
    'release',
    'fail',
    '--deployment',
    wrongEnvironmentDeploymentId,
    '--message',
    'must not mutate a production deployment through the preproduction target',
    '--environment',
    'preproduction',
    '--profile',
    profileName,
  ]);
  assert.notEqual(mismatch.code, 0);
  assert.match(
    mismatch.stderr,
    /RELEASE_FAIL_DEPLOYMENT_ENVIRONMENT_MISMATCH/,
  );
  assert.deepEqual(calls.slice(mismatchStart), [
    { method: 'GET', path: wrongEnvironmentDeploymentPath, body: {} },
  ]);

  const help = await runCli(['release', 'fail', '--help']);
  assert.equal(help.code, 0, help.stderr);
  assert.match(help.stdout, /release fail --deployment/);
  assert.match(help.stdout, /只允许显式选择 preproduction/);

  const commands = await runCli(['commands', '--json']);
  assert.equal(commands.code, 0, commands.stderr);
  assert.match(commands.stdout, /release ship\|candidate\|deploy\|reconcile\|test\|fail/);
} finally {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('release fail cli smoke passed');
