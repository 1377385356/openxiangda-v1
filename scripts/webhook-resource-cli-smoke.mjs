import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repoRoot, 'bin', 'openxiangda.js');
const require = createRequire(import.meta.url);
const { directResourceTypeForKey } = require('../lib/release-plan');
const workspace = fs.mkdtempSync(
  path.join(os.tmpdir(), 'openxiangda-webhook-resource-')
);

function writeJson(relative, value) {
  const file = path.join(workspace, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: workspace,
    encoding: 'utf8',
    env: { ...process.env, HOME: path.join(workspace, '.home') },
  });
}

try {
  writeJson('.openxiangda/profiles.json', {
    version: 1,
    currentProfile: 'dev',
    profiles: {
      dev: {
        name: 'dev',
        baseUrl: 'https://lowcode.example.test/service',
        accessToken: 'test-token',
      },
    },
  });
  writeJson('.openxiangda/state.json', {
    version: 1,
    profiles: {
      dev: { appType: 'APP_QFYY', resources: {} },
    },
  });
  writeJson('src/resources/webhooks/yuquan_access.json', {
    code: 'yuquan_access',
    name: '玉泉门禁开门事件',
    targetFunctionCode: 'qfyy_access_event',
    idempotencyQueryParam: 'nonce',
    maxBodyBytes: 262144,
    status: 'active',
  });

  const validation = run([
    'resource',
    'validate',
    'webhook',
    '--profile',
    'dev',
    '--json',
  ]);
  assert.equal(validation.status, 0, validation.stderr || validation.stdout);
  assert.equal(JSON.parse(validation.stdout).valid, true);

  const dryRun = run([
    'webhook',
    'upsert',
    '--json-file',
    'src/resources/webhooks/yuquan_access.json',
    '--profile',
    'dev',
    '--dry-run',
    '--json',
  ]);
  assert.equal(dryRun.status, 0, dryRun.stderr || dryRun.stdout);
  const plan = JSON.parse(dryRun.stdout);
  assert.equal(
    plan.existsCheck.path,
    '/openxiangda-api/v1/apps/APP_QFYY/webhooks/yuquan_access'
  );
  assert.equal(plan.create.body.targetFunctionCode, 'qfyy_access_event');
  assert.equal(plan.create.body.idempotencyQueryParam, 'nonce');
  assert.equal(directResourceTypeForKey('webhooks'), 'webhook');

  writeJson('src/resources/webhooks/yuquan_access.json', {
    code: 'yuquan_access',
    name: '玉泉门禁开门事件',
    targetFunctionCode: 'qfyy_access_event',
    webhookSecret: 'plaintext-must-fail',
  });
  const invalid = run([
    'resource',
    'validate',
    'webhook',
    '--profile',
    'dev',
    '--json',
  ]);
  assert.equal(invalid.status, 0, invalid.stderr || invalid.stdout);
  const invalidResult = JSON.parse(invalid.stdout);
  assert.equal(invalidResult.valid, false);
  assert.match(invalidResult.errors.join('\n'), /webhookSecret|Secret/);
} finally {
  fs.rmSync(workspace, { recursive: true, force: true });
}

console.log('webhook resource cli smoke passed');
