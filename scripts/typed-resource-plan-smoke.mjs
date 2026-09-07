import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repoRoot, 'bin', 'openxiangda.js');
const workspace = fs.mkdtempSync(
  path.join(os.tmpdir(), 'openxiangda-typed-resource-plan-'),
);

function git(args) {
  const result = spawnSync('git', args, { cwd: workspace, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`);
  }
}

function write(relative, value) {
  const file = path.join(workspace, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

try {
  fs.writeFileSync(
    path.join(workspace, 'app-workspace.config.ts'),
    "export default { runtimeMode: 'react-spa' };\n",
  );
  write('src/resources/roles/roles.json', {
    roles: [
      { code: 'lab_admin', name: 'Lab Admin' },
      { code: 'lab_viewer', name: 'Lab Viewer' },
    ],
  });
  write('src/resources/routes/lab-home.json', {
    code: 'lab_home',
    pathPattern: '/lab/home',
  });
  git(['init', '-b', 'master']);
  git(['config', 'user.name', 'OpenXiangda Test']);
  git(['config', 'user.email', 'openxiangda@example.test']);
  git(['add', '.']);
  git(['commit', '-m', 'baseline']);

  write('src/resources/roles/roles.json', {
    roles: [
      { code: 'lab_admin', name: 'Lab Admin' },
      { code: 'lab_viewer', name: 'Lab Read Only' },
    ],
  });
  fs.rmSync(path.join(workspace, 'src/resources/routes/lab-home.json'));

  const runPlan = () =>
    spawnSync(
      process.execPath,
      [cli, 'workspace', 'plan', '--changed', '--json'],
      {
        cwd: workspace,
        encoding: 'utf8',
        env: { ...process.env, HOME: path.join(workspace, '.home') },
      },
    );
  const result = runPlan();
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const plan = JSON.parse(result.stdout);
  assert.deepEqual(plan.targets.resourceSelectors.roles, ['lab_viewer']);
  assert.deepEqual(plan.targets.resourceSelectors.routes, ['lab_home']);
  assert.equal(
    plan.errors.some(error => error.name === 'release-atomic-target-unsupported'),
    true,
    'destructive generic resource deletes must remain outside the fast path',
  );
  assert.match(
    plan.errors.find(
      error => error.name === 'release-atomic-target-unsupported',
    ).message,
    /destructive-resource-delete:routes:lab_home/,
  );
  assert.equal(
    plan.commands.some(command => /resource publish (?:role|route)/.test(command)),
    false,
    'a destructive mixed plan must fail before generating partial writes',
  );

  write('src/resources/routes/lab-home.json', {
    code: 'lab_home',
    pathPattern: '/lab/home',
  });
  const safeResult = runPlan();
  assert.equal(
    safeResult.status,
    0,
    safeResult.stderr || safeResult.stdout,
  );
  const safePlan = JSON.parse(safeResult.stdout);
  assert.deepEqual(safePlan.targets.resourceSelectors.roles, [
    'lab_viewer',
  ]);
  assert.equal(
    safePlan.errors.some(
      error => error.name === 'release-atomic-target-unsupported',
    ),
    false,
  );
  assert.equal(
    safePlan.commands.some(command =>
      /resource publish role --only lab_viewer/.test(command),
    ),
    true,
    'safe exact configuration updates should be orchestrated automatically',
  );
  assert.equal(
    safePlan.commands.some(command =>
      /release app-finalize/.test(command),
    ),
    true,
    'configuration-only managed deployments still need a candidate-bound AppRelease',
  );
} finally {
  fs.rmSync(workspace, { recursive: true, force: true });
}

console.log('typed resource plan smoke passed');
