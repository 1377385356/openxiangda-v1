import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openxiangda-plan-readonly-'));
const tempHome = path.join(tempRoot, 'home');
const workspace = path.join(tempRoot, 'workspace');
const profileName = 'dev';
const appType = 'APP_PLAN_READONLY';
const requests = [];
let mode = 'success';

fs.mkdirSync(path.join(tempHome, '.openxiangda'), { recursive: true });
fs.mkdirSync(path.join(workspace, '.openxiangda'), { recursive: true });
fs.mkdirSync(path.join(workspace, 'src', 'resources', 'functions'), {
  recursive: true,
});
fs.writeFileSync(
  path.join(workspace, 'src', 'resources', 'functions', 'alpha.json'),
  `${JSON.stringify({
    code: 'alpha',
    name: 'Alpha',
    definitionJson: {
      kind: 'app_function',
      version: 'function_v1',
      runtimeMode: 'trusted_node',
      sourceType: 'file_snapshot',
      functionCode: 'alpha',
      sourceFile: {
        bucketName: 'files',
        objectName: 'alpha.cjs',
        sha256: 'a'.repeat(64),
        size: 1,
      },
      resourceBindings: {},
    },
  }, null, 2)}\n`
);
fs.writeFileSync(
  path.join(workspace, '.openxiangda', 'state.json'),
  `${JSON.stringify({
    version: 1,
    profiles: { [profileName]: { appType, resources: {} } },
  }, null, 2)}\n`
);

const server = http.createServer((request, response) => {
  requests.push({ method: request.method, url: request.url });
  response.setHeader('content-type', 'application/json');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.statusCode = 500;
    response.end(
      JSON.stringify({ code: 500, message: `unexpected write ${request.method}` })
    );
    return;
  }
  if (mode === 'unauthorized') {
    response.statusCode = 401;
    response.end(
      JSON.stringify({
        code: 401,
        errorCode: 'ACCESS_TOKEN_EXPIRED',
        message: 'access token expired',
      })
    );
    return;
  }
  response.end(
    JSON.stringify({
      code: 200,
      data: { data: [], totalCount: 0, currentPage: 1, pageSize: 1000 },
    })
  );
});

const listen = () =>
  new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });

const runPlan = () =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(repoRoot, 'bin', 'openxiangda.js'),
        'resource',
        'plan',
        'function',
        '--only',
        'alpha',
        '--profile',
        profileName,
        '--json',
      ],
      {
        cwd: workspace,
        env: { ...process.env, HOME: tempHome },
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
    child.on('close', code => {
      resolve({ code, stdout, stderr });
    });
  });

try {
  const port = await listen();
  fs.writeFileSync(
    path.join(workspace, '.openxiangda', 'profiles.json'),
    `${JSON.stringify({
      version: 1,
      currentProfile: profileName,
      profiles: {
        [profileName]: {
          baseUrl: `http://127.0.0.1:${port}/service`,
          token: {
            accessToken: 'expired-access-token',
            refreshToken: 'must-not-be-used-by-plan',
          },
        },
      },
    }, null, 2)}\n`
  );
  mode = 'success';
  const success = await runPlan();
  assert.equal(success.code, 0, success.stderr || success.stdout);
  const plan = JSON.parse(success.stdout);
  assert.equal(plan.actions.length, 1);
  assert.equal(plan.actions[0].kind, 'function');
  assert.equal(plan.actions[0].action, 'create');
  assert.ok(requests.length > 0);
  assert.ok(
    requests.every(request => ['GET', 'HEAD'].includes(request.method)),
    JSON.stringify(requests)
  );

  const unauthorizedStart = requests.length;
  mode = 'unauthorized';
  const unauthorized = await runPlan();
  assert.notEqual(unauthorized.code, 0, '401 plan must fail explicitly');
  assert.match(unauthorized.stderr, /READ_ONLY_AUTH_REQUIRED/);
  assert.match(
    unauthorized.stderr,
    /openxiangda auth refresh --profile dev/
  );
  const unauthorizedRequests = requests.slice(unauthorizedStart);
  assert.ok(unauthorizedRequests.length > 0, '401 scenario must issue a read');
  assert.ok(
    unauthorizedRequests.every(request =>
      ['GET', 'HEAD'].includes(request.method)
    ),
    JSON.stringify(unauthorizedRequests)
  );
  assert.equal(
    unauthorizedRequests.some(request =>
      String(request.url || '').includes('/auth/refresh')
    ),
    false,
    'resource plan must never refresh auth inside the read-only guard'
  );
  console.log('resource plan read-only smoke passed');
} finally {
  server.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
