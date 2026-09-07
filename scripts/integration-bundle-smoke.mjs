import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  assertIntegrationBundleCommits,
  collectIntegrationTaskResults,
  recordIntegrationTaskResult,
} = require('../lib/integration-bundle');
const { readGitSourceBase } = require('../lib/change-baseline');

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`);
  }
  return result.stdout.trim();
}

const workspace = fs.mkdtempSync(
  path.join(os.tmpdir(), 'openxiangda-integration-bundle-'),
);
try {
  git(workspace, ['init', '-b', 'master']);
  git(workspace, ['config', 'user.name', 'OpenXiangda Test']);
  git(workspace, ['config', 'user.email', 'openxiangda@example.test']);
  fs.writeFileSync(path.join(workspace, 'README.md'), 'baseline\n');
  git(workspace, ['add', '.']);
  git(workspace, ['commit', '-m', 'baseline']);
  const sourceBase = readGitSourceBase(workspace, 'HEAD');

  git(workspace, ['checkout', '-b', 'task/change-a']);
  fs.writeFileSync(path.join(workspace, 'feature-a.txt'), 'feature a\n');
  git(workspace, ['add', '.']);
  git(workspace, ['commit', '-m', 'implement change a']);
  const task = recordIntegrationTaskResult({
    cwd: workspace,
    changeId: 'change-a',
    targets: { runtime: true },
    changedFiles: ['feature-a.txt'],
    sourceBase,
  });
  assert.equal(task.commit, git(workspace, ['rev-parse', 'HEAD']));
  assert.equal(task.baseRevision, sourceBase.baseCommit);
  assert.deepEqual(task.sourceBase, {
    repo: sourceBase.repo,
    baseCommit: sourceBase.baseCommit,
    treeHash: sourceBase.treeHash,
  });

  git(workspace, ['checkout', 'master']);
  assert.throws(
    () =>
      collectIntegrationTaskResults({
        cwd: workspace,
        changeIds: ['change-a'],
      }),
    error => error?.code === 'INTEGRATION_TASK_COMMIT_NOT_MERGED',
    'bundle creation must fail while a task commit is still only on its task branch',
  );

  git(workspace, ['merge', '--no-ff', 'task/change-a', '-m', 'merge change a']);
  const integration = collectIntegrationTaskResults({
    cwd: workspace,
    changeIds: ['change-a'],
  });
  assert.equal(integration.requiredCommits.length, 1);
  assert.equal(integration.requiredCommits[0].commit, task.commit);
  assert.equal(
    integration.requiredCommits[0].sourceBase.baseCommit,
    sourceBase.baseCommit,
  );
  assert.equal(
    assertIntegrationBundleCommits(integration, { cwd: workspace })
      .requiredCommits[0].mergedIntoHead,
    true,
  );
  assert.throws(
    () => assertIntegrationBundleCommits(null, { cwd: workspace }),
    error => error?.code === 'INTEGRATION_BUNDLE_REQUIRED',
    'mainline release must reject old bundles that do not prove task commit inclusion',
  );
} finally {
  fs.rmSync(workspace, { recursive: true, force: true });
}

console.log('integration bundle smoke passed');
