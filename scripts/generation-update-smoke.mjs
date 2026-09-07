import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { resolveUpdateTarget, buildGenerationUpdateCommand } = require('../lib/generation-update');
const { installSkills } = require('../lib/skills');
const root = mkdtempSync(join(tmpdir(), 'oxa-v1-generation-'));
try {
  mkdirSync(join(root, 'old/src'), { recursive: true });
  writeFileSync(join(root, 'old/app-workspace.config.ts'), 'export default {}');
  writeFileSync(join(root, 'old/package.json'), JSON.stringify({ dependencies: { openxiangda: '1.0.267' } }));
  const selection = resolveUpdateTarget({ cwd: join(root, 'old/src') });
  assert.equal(selection.target, 'workspace'); assert.equal(selection.channel, 'legacy-v1');
  const command = buildGenerationUpdateCommand(selection, '1.0.268');
  assert.ok(!command.args.includes('-g')); assert.ok(command.args.includes('--save-prod'));
  assert.throws(() => buildGenerationUpdateCommand(selection, '2.0.0'), /GENERATION_MISMATCH/);
  assert.equal(resolveUpdateTarget({ cwd: root }).target, 'launcher');
  const dest = join(root, 'skills');
  for (const name of ['openxiangda', 'openxiangda-v2']) { mkdirSync(join(dest, name), { recursive: true }); writeFileSync(join(dest, name, 'SKILL.md'), `preserve-${name}`); }
  installSkills({ agent: 'codex', destination: dest, env: { ...process.env, CODEX_HOME: root }, force: true });
  assert.equal(readFileSync(join(dest, 'openxiangda/SKILL.md'), 'utf8'), 'preserve-openxiangda');
  assert.equal(readFileSync(join(dest, 'openxiangda-v2/SKILL.md'), 'utf8'), 'preserve-openxiangda-v2');
  assert.match(readFileSync(join(dest, 'openxiangda-v1/SKILL.md'), 'utf8'), /name: openxiangda-v1/);
  console.log('V1 generation updates and Skill isolation passed');
} finally { rmSync(root, { recursive: true, force: true }); }
