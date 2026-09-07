import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const {
  assertReleaseSourceIntegrated,
  assertReleaseSourceRevisionStable,
  inspectReleaseSourceIntegration,
  isGitAuthenticationError,
  prepareReleaseSourceRevision,
} = require('../lib/release-mainline');

const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'openxiangda-release-mainline-'),
);

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(
      result.error?.message || result.stderr || result.stdout || args.join(' '),
    );
  }
  return String(result.stdout || '').trim();
}

function configure(cwd) {
  git(cwd, ['config', 'user.email', 'release-mainline@example.com']);
  git(cwd, ['config', 'user.name', 'Release Mainline Smoke']);
}

function commitFile(cwd, file, content, message) {
  fs.writeFileSync(path.join(cwd, file), content);
  git(cwd, ['add', file]);
  git(cwd, ['commit', '-m', message]);
  return git(cwd, ['rev-parse', 'HEAD']);
}

function assertCode(fn, code) {
  assert.throws(fn, error => {
    assert.equal(error.code, code);
    return true;
  });
}

try {
  assert.equal(
    isGitAuthenticationError(
      "fatal: could not read Username for 'https://example.invalid': terminal prompts disabled",
    ),
    true,
  );
  assert.equal(
    isGitAuthenticationError('fatal: repository not found'),
    false,
  );
  const remote = path.join(tempRoot, 'remote.git');
  const seed = path.join(tempRoot, 'seed');
  const workspace = path.join(tempRoot, 'workspace');
  const other = path.join(tempRoot, 'other');
  fs.mkdirSync(seed);
  git(tempRoot, ['init', '--bare', '--initial-branch=master', remote]);
  git(seed, ['init', '-b', 'master']);
  configure(seed);
  commitFile(seed, 'app.txt', 'base\n', 'base');
  git(seed, ['remote', 'add', 'origin', remote]);
  git(seed, ['push', '-u', 'origin', 'master']);

  git(tempRoot, ['clone', remote, workspace]);
  configure(workspace);
  git(workspace, ['switch', '-c', 'codex/change-a']);
  const featureCommit = commitFile(
    workspace,
    'feature.txt',
    'feature\n',
    'feature',
  );

  assertCode(
    () => prepareReleaseSourceRevision({ cwd: workspace }),
    'RELEASE_SOURCE_MAINLINE_REQUIRED',
  );
  git(workspace, ['switch', 'master']);
  git(workspace, ['merge', '--ff-only', featureCommit]);
  git(workspace, ['push', 'origin', 'master']);

  const frozen = prepareReleaseSourceRevision({ cwd: workspace });
  assert.equal(frozen.baseCommit, featureCommit);
  assert.equal(frozen.branch, 'master');
  assert.equal(frozen.remoteName, 'origin');
  assert.equal(frozen.mainBranch, 'master');
  assert.equal(frozen.mainlinePolicy, 'publish-from-main-v1');
  assert.match(frozen.remoteUrlHash, /^sha256:[0-9a-f]{64}$/);
  assert.ok(
    frozen.repoAliases.length >= 2 && frozen.remoteUrlHashAliases.length >= 2,
    'source lineage should retain compatible remote identity aliases',
  );
  assertCode(
    () =>
      prepareReleaseSourceRevision({
        cwd: workspace,
        branchName: 'codex/change-a',
      }),
    'RELEASE_MAINLINE_OVERRIDE_FORBIDDEN',
  );
  assertCode(
    () =>
      inspectReleaseSourceIntegration(frozen, {
        cwd: workspace,
        remoteName: 'origin',
      }),
    'RELEASE_MAINLINE_OVERRIDE_FORBIDDEN',
  );
  assert.equal(
    inspectReleaseSourceIntegration(frozen, { cwd: workspace }).integrated,
    true,
  );
  const integrated = assertReleaseSourceIntegrated(frozen, { cwd: workspace });
  assert.equal(integrated.integrated, true);
  assert.equal(integrated.mainTipCommit, featureCommit);

  // Hosting providers and clone tools commonly expose the same repository
  // with or without the optional .git suffix. That spelling change must not
  // create a false source-repository divergence.
  const dotGitAlias = path.join(tempRoot, 'remote');
  fs.symlinkSync(remote, dotGitAlias);
  git(workspace, ['remote', 'set-url', 'origin', dotGitAlias]);
  assert.equal(
    inspectReleaseSourceIntegration(frozen, { cwd: workspace }).integrated,
    true,
  );
  git(workspace, ['remote', 'set-url', 'origin', remote]);

  // Changing the remote identity after begin cannot redirect the closure
  // check to a convenient repository with the same branch name.
  const replacementRemote = path.join(tempRoot, 'replacement.git');
  git(tempRoot, [
    'clone',
    '--bare',
    remote,
    replacementRemote,
  ]);
  git(workspace, ['remote', 'set-url', 'origin', replacementRemote]);
  assertCode(
    () => inspectReleaseSourceIntegration(frozen, { cwd: workspace }),
    'RELEASE_SOURCE_REPOSITORY_MISMATCH',
  );
  git(workspace, ['remote', 'set-url', 'origin', remote]);

  fs.writeFileSync(path.join(workspace, 'dirty.txt'), 'dirty\n');
  assertCode(
    () => prepareReleaseSourceRevision({ cwd: workspace }),
    'RELEASE_SOURCE_DIRTY',
  );
  assertCode(
    () => assertReleaseSourceRevisionStable(frozen, { cwd: workspace }),
    'RELEASE_PUBLISH_REVISION_CHANGED',
  );
  fs.rmSync(path.join(workspace, 'dirty.txt'));
  assertReleaseSourceRevisionStable(frozen, { cwd: workspace });

  const descendantCommit = commitFile(
    workspace,
    'unrelated-mainline.txt',
    'unrelated\n',
    'unrelated mainline change',
  );
  git(workspace, ['push', 'origin', 'master']);
  assertCode(
    () => assertReleaseSourceRevisionStable(frozen, { cwd: workspace }),
    'RELEASE_PUBLISH_REVISION_CHANGED',
  );
  const descendantStatus = assertReleaseSourceRevisionStable(frozen, {
    cwd: workspace,
    allowDescendant: true,
  });
  assert.equal(descendantStatus.stabilityMode, 'mainline-descendant');
  assert.equal(descendantStatus.frozenCommit, featureCommit);
  assert.equal(descendantStatus.baseCommit, descendantCommit);

  // A branch based on an obsolete main tip is rejected before release begin.
  git(tempRoot, ['clone', remote, other]);
  configure(other);
  commitFile(other, 'main-advance.txt', 'advance\n', 'advance main');
  git(other, ['push', 'origin', 'master']);
  assertCode(
    () => prepareReleaseSourceRevision({ cwd: workspace }),
    'RELEASE_SOURCE_MAINLINE_NOT_PUSHED',
  );

  // Local-only branches are not publication evidence, even when their local
  // main ref contains the exact commit.
  const local = path.join(tempRoot, 'local');
  fs.mkdirSync(local);
  git(local, ['init', '-b', 'main']);
  configure(local);
  commitFile(local, 'base.txt', 'base\n', 'base');
  git(local, ['switch', '-c', 'codex/local-change']);
  const localFeature = commitFile(local, 'change.txt', 'change\n', 'change');
  git(local, ['branch', '-f', 'main', localFeature]);
  assertCode(
    () => prepareReleaseSourceRevision({ cwd: local }),
    'RELEASE_GIT_REMOTE_REQUIRED',
  );

  console.log('release mainline smoke passed');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
