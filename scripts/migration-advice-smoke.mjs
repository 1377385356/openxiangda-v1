import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = mkdtempSync(join(tmpdir(), 'oxa-migration-advice-'));
const cli = resolve(import.meta.dirname, '../bin/openxiangda.js');
try {
  writeFileSync(join(root, 'app-workspace.config.ts'), 'export default {}');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ devDependencies: { openxiangda: '1.0.268' } }));
  mkdirSync(join(root, 'bin'));
  const npm = join(root, 'bin/npm');
  writeFileSync(npm, '#!/usr/bin/env node\n' + `
    const args = process.argv.slice(2);
    if (process.env.TEST_NPM_FAILURE) { process.stderr.write('registry unavailable'); process.exit(1); }
    if (args[0] === 'view') {
      if (args[1] !== 'openxiangda@legacy-v1') process.exit(2);
      process.stdout.write(JSON.stringify('1.0.268'));
    } else if (args[0] !== 'install' || !args.includes('openxiangda@1.0.268') || args.includes('-g')) process.exit(3);
  `);
  chmodSync(npm, 0o755);
  const run = (args, extraEnv = {}) => spawnSync(process.execPath, [cli, ...args], {
    cwd: root, encoding: 'utf8', timeout: 30000,
    env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}`, ...extraEnv },
  });
  for (const args of [['version'], ['update', 'check'], ['update', 'install', '--no-skills'], ['skill', 'install', '--dry-run', '--dest', join(root, 'skills')]]) {
    const human = run(args);
    assert.equal(human.status, 0, human.stderr);
    assert.match(human.stderr, /建议评估升级到 OpenXiangda 2\.0/);
    const machine = run([...args, '--json']);
    assert.equal(machine.status, 0, machine.stderr);
    assert.equal(machine.stderr, '');
    const result = JSON.parse(machine.stdout);
    assert.equal(result.migrationAdvice.generation, 'v1');
    assert.equal(result.migrationAdvice.nodeRequirement, '>=24');
    if (args[1] === 'check') assert.equal(result.channel, 'legacy-v1');
  }
  const failed = run(['update', 'install', '--no-skills'], { TEST_NPM_FAILURE: '1' });
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /registry unavailable/);
  assert.doesNotMatch(failed.stderr, /建议评估升级/);
  const discovery = run(['commands', '--json']);
  assert.equal(discovery.status, 0, discovery.stderr);
  assert.equal(discovery.stderr, '');
  JSON.parse(discovery.stdout);
  console.log('V1 guidance output, JSON, maintenance channel and failure behavior passed.');
} finally { rmSync(root, { recursive: true, force: true }); }
