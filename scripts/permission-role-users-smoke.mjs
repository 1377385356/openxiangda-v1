import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repoRoot, 'bin', 'openxiangda.js');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openxiangda-role-users-'));
const tempHome = path.join(tempRoot, 'home');
const workspace = path.join(tempRoot, 'workspace');
const origin = path.join(tempRoot, 'origin.git');
const profileName = 'dev';
const appType = 'APP_ROLE_USERS';
const roleId = '11111111-1111-4111-8111-111111111111';
const duplicateRoleIds = [
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
];
const baselineId = 'BASELINE_ROLE_USERS';
const leaseId = 'LEASE_ROLE_USERS';
const changeId = 'role-users-smoke';
const calls = [];

try {
  fs.mkdirSync(path.join(tempHome, '.openxiangda'), { recursive: true });
  fs.mkdirSync(path.join(workspace, '.openxiangda'), { recursive: true });
  fs.writeFileSync(
    path.join(workspace, '.openxiangda', 'state.json'),
    `${JSON.stringify({
      version: 1,
      profiles: {
        [profileName]: {
          appType,
          resources: {},
        },
      },
    }, null, 2)}\n`,
  );
  fs.writeFileSync(path.join(workspace, '.gitignore'), '.openxiangda/\n');
  fs.writeFileSync(path.join(workspace, 'package.json'), '{"private":true}\n');

  runGit(['init', '--bare', '--initial-branch=main'], tempRoot, origin);
  for (const args of [
    ['init', '-b', 'main'],
    ['config', 'user.email', 'smoke@example.com'],
    ['config', 'user.name', 'Smoke'],
    ['add', '.gitignore', 'package.json'],
    ['commit', '-m', 'baseline'],
    ['remote', 'add', 'origin', origin],
    ['push', '-u', 'origin', 'main'],
  ]) {
    runGit(args, workspace);
  }

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const body = request.method === 'GET' ? undefined : await readRequestJson(request);
    calls.push({
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: request.headers,
      body,
    });
    const api = `/service/openxiangda-api/v1/apps/${appType}`;

    if (request.method === 'GET' && url.pathname === `${api}/roles`) {
      const code = url.searchParams.get('code');
      const items =
        code === 'department_liaison'
          ? [{ id: roleId, code }]
          : code === 'duplicate'
            ? duplicateRoleIds.map(id => ({ id, code }))
            : [];
      return respond(response, { items, total: items.length, page: 1, limit: 200 });
    }

    if (
      request.method === 'GET' &&
      url.pathname === `${api}/roles/${roleId}/users`
    ) {
      return respond(response, {
        items: [{ id: 'USER_EXISTING', name: 'Existing User' }],
        total: 1,
      });
    }

    if (request.method === 'POST' && url.pathname === `${api}/change-baselines`) {
      return respond(response, {
        baselineId,
        appType,
        changeId: body.changeId,
        clientSessionId: body.clientSessionId,
        sourceBase: body.sourceBase,
        headDigest: 'a'.repeat(64),
        resourceHeads: {},
        createdAt: '2026-08-03T00:00:00.000Z',
      });
    }

    if (request.method === 'POST' && url.pathname === `${api}/publish-lease/acquire`) {
      return respond(response, {
        leaseId,
        appType,
        changeId: body.changeId,
        clientSessionId: body.clientSessionId,
        baseRevision: body.baseRevision,
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        holder: 'self',
      });
    }

    if (
      request.method === 'POST' &&
      url.pathname === `${api}/roles/${roleId}/users`
    ) {
      assert.equal(request.headers['x-openxiangda-publish-lease-id'], leaseId);
      assert.equal(request.headers['x-openxiangda-change-baseline-id'], baselineId);
      assert.equal(request.headers['x-openxiangda-change-id'], changeId);
      assert.deepEqual(body.userIds, ['USER_A', 'USER_B']);
      return respond(response, { added: 2 });
    }

    if (
      request.method === 'POST' &&
      url.pathname === `${api}/publish-lease/${leaseId}/release`
    ) {
      return respond(response, { released: true });
    }

    return respond(
      response,
      { message: `not found ${request.method} ${url.pathname}` },
      404,
    );
  });

  const port = await new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
  fs.writeFileSync(
    path.join(tempHome, '.openxiangda', 'profiles.json'),
    `${JSON.stringify({
      version: 1,
      currentProfile: profileName,
      profiles: {
        [profileName]: {
          name: profileName,
          baseUrl: `http://127.0.0.1:${port}/service`,
          token: { accessToken: 'test-token' },
        },
      },
    }, null, 2)}\n`,
  );

  const codeResult = await runCli([
    'permission',
    'role-users',
    'department_liaison',
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(JSON.parse(codeResult.stdout).items[0].id, 'USER_EXISTING');
  assert.deepEqual(
    calls.slice(0, 2).map(call => `${call.method} ${call.path}`),
    [
      `GET /service/openxiangda-api/v1/apps/${appType}/roles`,
      `GET /service/openxiangda-api/v1/apps/${appType}/roles/${roleId}/users`,
    ],
  );
  assert.equal(calls[0].query.code, 'department_liaison');
  assert.equal(calls[0].query.limit, '200');

  const beforeUuid = calls.length;
  await runCli([
    'permission',
    'role-users',
    roleId,
    '--profile',
    profileName,
    '--json',
  ]);
  assert.deepEqual(
    calls.slice(beforeUuid).map(call => `${call.method} ${call.path}`),
    [`GET /service/openxiangda-api/v1/apps/${appType}/roles/${roleId}/users`],
    'UUID input must bypass role-list resolution',
  );

  const beforeUnknown = calls.length;
  const unknown = await runCli([
    'permission',
    'role-users',
    'unknown',
    '--profile',
    profileName,
    '--json',
  ], { expectFailure: true });
  assert.match(unknown.stderr, /ROLE_CODE_NOT_FOUND/);
  assert.equal(calls.length, beforeUnknown + 1, 'unknown code must stop after role-list');

  const beforeDuplicate = calls.length;
  const duplicate = await runCli([
    'permission',
    'role-users',
    'duplicate',
    '--profile',
    profileName,
    '--json',
  ], { expectFailure: true });
  assert.match(duplicate.stderr, /ROLE_CODE_AMBIGUOUS/);
  assert.equal(calls.length, beforeDuplicate + 1, 'ambiguous code must stop after role-list');

  const beforeUnknownAdd = calls.length;
  const unknownAdd = await runCli([
    'permission',
    'role-add-users',
    'unknown',
    '--user-ids',
    'USER_A',
    '--change',
    changeId,
    '--profile',
    profileName,
    '--json',
  ], { expectFailure: true });
  assert.match(unknownAdd.stderr, /ROLE_CODE_NOT_FOUND/);
  assert.equal(
    calls.length,
    beforeUnknownAdd + 1,
    'unknown role-add-users code must fail before lease acquisition or mutation',
  );

  const beforeAdd = calls.length;
  const added = await runCli([
    'permission',
    'role-add-users',
    'department_liaison',
    '--user-ids',
    'USER_A,USER_B',
    '--change',
    changeId,
    '--profile',
    profileName,
    '--json',
  ]);
  assert.deepEqual(JSON.parse(added.stdout), { added: 2 });
  const addCalls = calls.slice(beforeAdd);
  assert.equal(addCalls[0].path, `/service/openxiangda-api/v1/apps/${appType}/roles`);
  assert(
    addCalls.some(
      call => call.method === 'POST' && call.path === `/service/openxiangda-api/v1/apps/${appType}/roles/${roleId}/users`,
    ),
    'role-add-users must post to the resolved role UUID',
  );
  assert(
    !addCalls.some(call => call.path.includes('/roles/department_liaison/users')),
    'role-add-users must never send an unresolved code as roleId',
  );

  const help = await runCli(['permission', 'role-users', '--help']);
  assert.match(help.stdout, /本地未绑定的 code/);

  await new Promise(resolve => server.close(resolve));
  console.log('permission role users smoke passed');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function runGit(args, cwd, explicitPath) {
  const command = explicitPath ? [...args, explicitPath] : args;
  const result = spawnSync('git', command, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${command.join(' ')} failed`);
  }
}

function readRequestJson(request) {
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
  response.end(JSON.stringify({ code: statusCode, data }));
}

function runCli(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: workspace,
      env: { ...process.env, HOME: tempHome, CODEX_THREAD_ID: 'role-users-smoke' },
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
    child.on('close', code => {
      if (options.expectFailure) {
        if (code === 0) return reject(new Error(`${args.join(' ')} should fail`));
        return resolve({ code, stdout, stderr });
      }
      if (code !== 0) return reject(new Error(stderr || stdout || `${args.join(' ')} failed`));
      return resolve({ code, stdout, stderr });
    });
  });
}
