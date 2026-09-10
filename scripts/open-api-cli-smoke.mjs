import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI_FILE = path.join(ROOT_DIR, 'bin', 'openxiangda.js');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openxiangda-open-api-'));
const home = path.join(tempRoot, 'home');
const codexHome = path.join(tempRoot, 'codex');
const cwd = path.join(tempRoot, 'project');
const requests = [];

fs.mkdirSync(path.join(home, '.openxiangda'), { recursive: true });
fs.mkdirSync(codexHome, { recursive: true });
fs.mkdirSync(cwd, { recursive: true });

const server = http.createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString('utf8');
  const body = rawBody ? JSON.parse(rawBody) : undefined;
  requests.push({
    method: request.method,
    url: request.url,
    authorization: request.headers.authorization,
    body,
  });

  const send = payload => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(payload));
  };
  if (request.method === 'GET' && request.url === '/api/dingtalk-apps') {
    return send({
      code: 200,
      message: '查询成功',
      data: {
        apps: [{ id: 'cred-1', name: 'Backend', appKey: 'ak_list' }],
        total: 1,
      },
    });
  }
  if (request.method === 'GET' && request.url === '/api/dingtalk-apps/cred-1') {
    return send({
      code: 200,
      message: '查询成功',
      data: {
        id: 'cred-1',
        name: 'Backend',
        appKey: 'ak_detail',
        appSecret: 'sk_detail_secret',
      },
    });
  }
  if (request.method === 'POST' && request.url === '/api/dingtalk-apps') {
    if (body?.name === 'Denied') {
      return send({
        code: 500,
        message: '创建失败: 无权限：仅平台管理员可创建微应用',
        data: null,
      });
    }
    return send({
      code: 200,
      message: '创建成功',
      data: {
        id: 'cred-2',
        name: body?.name,
        appKey: 'ak_created',
        appSecret: 'sk_created_secret',
        permissions: body?.permissions || [],
      },
    });
  }
  if (request.method === 'POST' && request.url === '/api/dingtalk-apps/cred-1') {
    return send({
      code: 200,
      message: '更新成功',
      data: { id: 'cred-1', ...body, appKey: 'ak_detail' },
    });
  }
  if (
    request.method === 'POST' &&
    request.url === '/api/dingtalk-apps/cred-1/regenerate-secret'
  ) {
    return send({
      code: 200,
      message: '密钥重新生成成功',
      data: {
        id: 'cred-1',
        appKey: 'ak_detail',
        appSecret: 'sk_rotated_secret',
      },
    });
  }
  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ code: 404, message: 'not found' }));
});

function runCli(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_FILE, ...args], {
      cwd,
      env: {
        ...process.env,
        HOME: home,
        CODEX_HOME: codexHome,
      },
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
      const result = { code, stdout, stderr };
      if (options.expectFailure ? code === 0 : code !== 0) {
        reject(
          new Error(
            `Command ${args.join(' ')} ${options.expectFailure ? 'succeeded unexpectedly' : 'failed'}:\n${stderr}\n${stdout}`
          )
        );
        return;
      }
      resolve(result);
    });
  });
}

function parseJson(result) {
  return JSON.parse(result.stdout);
}

try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  fs.mkdirSync(path.join(cwd, '.openxiangda'), { recursive: true });
  const configFile = path.join(cwd, '.openxiangda', 'profiles.json');
  fs.writeFileSync(
    configFile,
    `${JSON.stringify(
      {
        version: 1,
        currentProfile: 'dev',
        profiles: {
          dev: {
            name: 'dev',
            baseUrl: `http://127.0.0.1:${address.port}`,
            token: { accessToken: 'normal-user-token' },
          },
        },
      },
      null,
      2
    )}\n`
  );
  const configBefore = fs.readFileSync(configFile, 'utf8');

  const tags = parseJson(await runCli(['open-api', 'spec', 'tags', '--json']));
  assert.equal(tags.tags.length, 18);

  const list = parseJson(
    await runCli([
      'open-api',
      'spec',
      'list',
      '--tag',
      '表单与菜单',
      '--search',
      'submitFormData',
      '--json',
    ])
  );
  assert.equal(list.total, 1);
  assert.equal(list.operations[0].path, '/dingtalk-api/v1.0/forms/submitFormData');

  const token = parseJson(
    await runCli([
      'open-api',
      'spec',
      'describe',
      '/dingtalk-api/v1.0/oauth2/accessToken',
      '--method',
      'post',
      '--json',
    ])
  );
  assert.equal(token.authenticated, false);
  assert.deepEqual(token.requestBody.content['application/json'].schema.required, [
    'appKey',
    'appSecret',
  ]);
  assert.equal(
    token.requestBody.content['application/json'].schema.$ref,
    undefined,
    'describe should resolve request schema refs'
  );

  const credentialList = parseJson(
    await runCli(['open-api', 'credential', 'list', '--json'])
  );
  assert.equal(credentialList.total, 1);

  const hidden = parseJson(
    await runCli(['open-api', 'credential', 'get', 'cred-1', '--json'])
  );
  assert.equal(hidden.appSecret, '***redacted***');
  assert(!hidden.appSecret.includes('sk_detail'));

  const revealed = parseJson(
    await runCli([
      'open-api',
      'credential',
      'get',
      'cred-1',
      '--show-secret',
      '--json',
    ])
  );
  assert.equal(revealed.appSecret, 'sk_detail_secret');

  const createWithoutConfirmation = await runCli(
    ['open-api', 'credential', 'create', '--name', 'Backend', '--json'],
    { expectFailure: true }
  );
  assert.match(createWithoutConfirmation.stderr, /追加 --yes/);

  const created = parseJson(
    await runCli([
      'open-api',
      'credential',
      'create',
      '--name',
      'Backend',
      '--description',
      'External service',
      '--permissions',
      'forms.read,forms.write',
      '--yes',
      '--show-secret',
      '--json',
    ])
  );
  assert.equal(created.appSecret, 'sk_created_secret');
  assert.deepEqual(created.permissions, ['forms.read', 'forms.write']);

  const updated = parseJson(
    await runCli([
      'open-api',
      'credential',
      'update',
      'cred-1',
      '--description',
      'Updated',
      '--permissions',
      'forms.read',
      '--json',
    ])
  );
  assert.equal(updated.description, 'Updated');

  const rotateWithoutSecret = await runCli(
    ['open-api', 'credential', 'rotate-secret', 'cred-1', '--yes', '--json'],
    { expectFailure: true }
  );
  assert.match(rotateWithoutSecret.stderr, /--yes --show-secret/);

  const rotated = parseJson(
    await runCli([
      'open-api',
      'credential',
      'rotate-secret',
      'cred-1',
      '--yes',
      '--show-secret',
      '--json',
    ])
  );
  assert.equal(rotated.appSecret, 'sk_rotated_secret');

  const denied = await runCli(
    [
      'open-api',
      'credential',
      'create',
      '--name',
      'Denied',
      '--yes',
      '--json',
    ],
    { expectFailure: true }
  );
  assert.match(denied.stderr, /需要平台管理员权限/);

  for (const request of requests) {
    assert.equal(request.authorization, 'Bearer normal-user-token');
  }
  const createRequest = requests.find(
    request => request.method === 'POST' && request.url === '/api/dingtalk-apps' && request.body?.name === 'Backend'
  );
  assert.deepEqual(createRequest.body, {
    name: 'Backend',
    description: 'External service',
    permissions: ['forms.read', 'forms.write'],
  });
  const rotateRequest = requests.find(request =>
    request.url.endsWith('/regenerate-secret')
  );
  assert.deepEqual(rotateRequest.body, {});

  assert.equal(fs.readFileSync(configFile, 'utf8'), configBefore);
  assert.equal(fs.existsSync(path.join(cwd, '.openxiangda', 'state.json')), false);
  assert.equal(fs.readFileSync(configFile, 'utf8').includes('sk_'), false);
  console.log('open API CLI smoke passed');
} finally {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
