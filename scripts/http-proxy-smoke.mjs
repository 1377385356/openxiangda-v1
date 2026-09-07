import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTTP_MODULE = path.join(ROOT_DIR, 'lib', 'http.js');
let proxyConnections = 0;

const origin = http.createServer((request, response) => {
  if (request.url === '/conflict') {
    response.writeHead(409, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        code: 409,
        errorCode: 'PUBLISH_LEASE_HELD',
        message: '另一个任务正在发布',
        data: { holder: 'other', expiresAt: '2026-07-15T12:00:00.000Z' },
      })
    );
    return;
  }
  if (request.url === '/slow') {
    setTimeout(() => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
    }, 100);
    return;
  }
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ ok: true, path: request.url }));
});

const proxy = http.createServer();
proxy.on('connect', (request, clientSocket, head) => {
  proxyConnections += 1;
  const targetUrl = new URL(`http://${request.url}`);
  const upstream = net.connect(Number(targetUrl.port), targetUrl.hostname, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length) upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
  upstream.on('error', () => clientSocket.destroy());
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}

function runRequest(baseUrl, apiPath, env, timeoutMs) {
  const source = `
    const { requestJson } = require(${JSON.stringify(HTTP_MODULE)});
    requestJson(${JSON.stringify(baseUrl)}, ${JSON.stringify(apiPath)}, {
      timeoutMs: ${JSON.stringify(timeoutMs)}
    }).then(value => process.stdout.write(JSON.stringify(value)));
  `;
  return new Promise(resolve => {
    const child = spawn(process.execPath, ['-e', source], {
      env: {
        ...process.env,
        HTTP_PROXY: '',
        http_proxy: '',
        HTTPS_PROXY: '',
        https_proxy: '',
        ALL_PROXY: '',
        all_proxy: '',
        NO_PROXY: '',
        no_proxy: '',
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => (stdout += chunk));
    child.stderr.on('data', chunk => (stderr += chunk));
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

function runRejectedRequest(baseUrl, apiPath) {
  const source = `
    const { requestJson } = require(${JSON.stringify(HTTP_MODULE)});
    requestJson(${JSON.stringify(baseUrl)}, ${JSON.stringify(apiPath)})
      .then(() => process.exitCode = 2)
      .catch(error => process.stdout.write(JSON.stringify({
        status: error.status,
        code: error.code,
        data: error.data,
        payload: error.payload
      })));
  `;
  return new Promise(resolve => {
    const child = spawn(process.execPath, ['-e', source], {
      env: {
        ...process.env,
        HTTP_PROXY: '',
        http_proxy: '',
        HTTPS_PROXY: '',
        https_proxy: '',
        ALL_PROXY: '',
        all_proxy: '',
        NO_PROXY: '',
        no_proxy: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => (stdout += chunk));
    child.stderr.on('data', chunk => (stderr += chunk));
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

try {
  await Promise.all([listen(origin), listen(proxy)]);
  const originAddress = origin.address();
  const proxyAddress = proxy.address();
  const baseUrl = `http://127.0.0.1:${originAddress.port}`;
  const proxyUrl = `http://127.0.0.1:${proxyAddress.port}`;

  const proxied = await runRequest(baseUrl, '/proxied', {
    HTTP_PROXY: proxyUrl,
  });
  assert.equal(proxied.code, 0, proxied.stderr);
  assert.deepEqual(JSON.parse(proxied.stdout), { ok: true, path: '/proxied' });
  assert.equal(proxyConnections, 1);

  const bypassed = await runRequest(baseUrl, '/direct', {
    HTTP_PROXY: proxyUrl,
    NO_PROXY: '127.0.0.1',
  });
  assert.equal(bypassed.code, 0, bypassed.stderr);
  assert.deepEqual(JSON.parse(bypassed.stdout), { ok: true, path: '/direct' });
  assert.equal(proxyConnections, 1);

  const timedOut = await runRequest(baseUrl, '/slow', {}, 20);
  assert.notEqual(timedOut.code, 0);
  assert.match(timedOut.stderr, /timed out after 20ms/);

  const conflict = await runRejectedRequest(baseUrl, '/conflict');
  assert.equal(conflict.code, 0, conflict.stderr);
  assert.deepEqual(JSON.parse(conflict.stdout), {
    status: 409,
    code: 'PUBLISH_LEASE_HELD',
    data: { holder: 'other', expiresAt: '2026-07-15T12:00:00.000Z' },
    payload: {
      code: 409,
      errorCode: 'PUBLISH_LEASE_HELD',
      message: '另一个任务正在发布',
      data: { holder: 'other', expiresAt: '2026-07-15T12:00:00.000Z' },
    },
  });

  console.log('http proxy smoke passed');
} finally {
  await Promise.all([close(proxy), close(origin)]);
}
