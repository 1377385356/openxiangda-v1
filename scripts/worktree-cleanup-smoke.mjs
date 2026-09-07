import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  applyWorktreeCleanup,
  planWorktreeCleanup,
} = require('../lib/worktree-cleanup');

const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'openxiangda-worktree-cleanup-')
);
const remote = path.join(tempRoot, 'remote.git');
const canonical = path.join(tempRoot, 'canonical');
const cli = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'bin',
  'openxiangda.js'
);

function git(cwd, ...args) {
  const result = spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
    },
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed: ${String(result.stderr || result.stdout).trim()}`
    );
  }
  return String(result.stdout || '').trim();
}

function write(relativePath, content, root = canonical) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function addTask(name, options = {}) {
  const branch = `codex/${name}`;
  const worktree = path.join(tempRoot, name);
  git(canonical, 'worktree', 'add', '-b', branch, worktree, 'HEAD');
  write(`${name}.txt`, `${name}\n`, worktree);
  git(worktree, 'add', `${name}.txt`);
  git(worktree, 'commit', '-m', `test: ${name}`);
  if (options.pushBranch) {
    git(worktree, 'push', '-u', 'origin', branch);
  }
  if (options.merge !== false) {
    git(canonical, 'merge', '--no-ff', branch, '-m', `merge ${name}`);
  }
  return { branch, worktree };
}

try {
  fs.mkdirSync(remote, { recursive: true });
  git(remote, 'init', '--bare');
  git(remote, 'symbolic-ref', 'HEAD', 'refs/heads/master');
  git(tempRoot, 'clone', remote, canonical);
  git(canonical, 'config', 'user.name', 'OpenXiangda Test');
  git(canonical, 'config', 'user.email', 'openxiangda@example.invalid');
  write('README.md', '# cleanup smoke\n');
  git(canonical, 'add', 'README.md');
  git(canonical, 'commit', '-m', 'chore: initialize repository');
  git(canonical, 'push', '-u', 'origin', 'master');

  const safe = addTask('safe-task', { pushBranch: true });
  const journal = addTask('journal-task');
  const stale = addTask('stale-task');
  const unmerged = addTask('unmerged-task', { merge: false });
  const dirty = addTask('dirty-task');
  const invalidOwner = addTask('invalid-owner-task');
  const unmanagedWorktree = path.join(tempRoot, 'ordinary-task');
  git(
    canonical,
    'worktree',
    'add',
    '-b',
    'feature/ordinary-task',
    unmanagedWorktree,
    'HEAD'
  );

  write(
    '.openxiangda/releases/journal-task/execution.json',
    '{"status":"awaiting_production_confirmation"}\n',
    journal.worktree
  );
  write(
    '.openxiangda/state.json',
    JSON.stringify({
      version: 1,
      profiles: {
        dev: {
          promotion: {
            publishLease: { leaseId: 'lease-journal-task' },
            changeBaseline: { baselineId: 'baseline-journal-task' },
          },
        },
      },
    }),
    journal.worktree
  );
  write(
    '.openxiangda/worktree-owner.json',
    JSON.stringify({
      version: 1,
      threadId: 'thread-dirty',
      changeId: 'dirty-task',
      acquiredAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    }),
    dirty.worktree
  );
  write('uncommitted.txt', 'dirty\n', dirty.worktree);
  write(
    '.openxiangda/worktree-owner.json',
    '{not-json\n',
    invalidOwner.worktree
  );
  fs.rmSync(stale.worktree, { recursive: true, force: true });
  git(canonical, 'push', 'origin', 'master');

  const cliPlanResult = spawnSync(
    process.execPath,
    [cli, 'workspace', 'cleanup', '--json'],
    {
      cwd: canonical,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: path.join(tempRoot, 'home'),
        GIT_TERMINAL_PROMPT: '0',
      },
    }
  );
  assert.equal(cliPlanResult.status, 0, cliPlanResult.stderr);
  const cliPlan = JSON.parse(cliPlanResult.stdout);
  assert.equal(cliPlan.dryRun, true);
  assert.equal(cliPlan.summary.safe, 1);

  const plan = planWorktreeCleanup({ cwd: canonical });
  assert.equal(plan.dryRun, true);
  assert.equal(plan.canApply, true);
  assert.equal(plan.summary.safe, 1);
  assert.equal(plan.summary.blocked, 6);
  assert.equal(plan.summary.staleRecords, 1);

  const safePlan = plan.candidates.find(item => item.branch === safe.branch);
  assert.equal(safePlan?.safeToRemove, true);
  const stalePlan = plan.candidates.find(item => item.branch === stale.branch);
  assert.equal(stalePlan?.safeToRemove, false);
  assert.equal(stalePlan?.prunable, true);
  assert(
    stalePlan.blockers.some(
      item =>
        item.code ===
        'WORKTREE_CLEANUP_STALE_RECORD_MANUAL_PRUNE_REQUIRED'
    )
  );

  const journalPlan = plan.candidates.find(
    item => item.branch === journal.branch
  );
  assert.equal(journalPlan?.safeToRemove, false);
  assert(
    journalPlan.blockers.some(
      item => item.code === 'WORKTREE_CLEANUP_RELEASE_JOURNAL_PRESENT'
    )
  );
  assert(
    journalPlan.blockers.some(
      item => item.code === 'WORKTREE_CLEANUP_PROMOTION_STATE_PRESENT'
    )
  );

  const unmergedPlan = plan.candidates.find(
    item => item.branch === unmerged.branch
  );
  assert(
    unmergedPlan.blockers.some(
      item => item.code === 'WORKTREE_CLEANUP_NOT_IN_MAINLINE'
    )
  );
  const dirtyPlan = plan.candidates.find(item => item.branch === dirty.branch);
  assert(
    dirtyPlan.blockers.some(item => item.code === 'WORKTREE_CLEANUP_DIRTY')
  );
  assert(
    dirtyPlan.blockers.some(
      item => item.code === 'WORKTREE_CLEANUP_OWNER_ACTIVE'
    )
  );
  const invalidOwnerPlan = plan.candidates.find(
    item => item.branch === invalidOwner.branch
  );
  assert(
    invalidOwnerPlan.blockers.some(
      item => item.code === 'WORKTREE_CLEANUP_OWNER_STATE_INVALID'
    )
  );
  const unmanagedPlan = plan.candidates.find(
    item => item.branch === 'feature/ordinary-task'
  );
  assert(
    unmanagedPlan.blockers.some(
      item => item.code === 'WORKTREE_CLEANUP_UNMANAGED'
    )
  );

  // A worktree that becomes safe after dry-run was not reviewed and must not
  // be picked up by apply.
  fs.rmSync(path.join(journal.worktree, '.openxiangda'), {
    recursive: true,
    force: true,
  });

  const applied = applyWorktreeCleanup(plan, { cwd: canonical });
  assert.equal(applied.dryRun, false);
  assert.equal(applied.failures.length, 0);
  assert.equal(applied.remoteBranchesRetained, true);
  assert.equal(fs.existsSync(safe.worktree), false);
  assert.equal(
    spawnSync(
      'git',
      ['-C', canonical, 'show-ref', '--verify', '--quiet', `refs/heads/${safe.branch}`]
    ).status,
    1
  );
  assert.equal(
    spawnSync(
      'git',
      ['-C', canonical, 'show-ref', '--verify', '--quiet', `refs/heads/${stale.branch}`]
    ).status,
    0
  );
  assert.match(
    git(canonical, 'ls-remote', '--heads', 'origin', `refs/heads/${safe.branch}`),
    new RegExp(`refs/heads/${safe.branch.replace('/', '\\/')}$`)
  );
  assert.equal(fs.existsSync(journal.worktree), true);
  assert.equal(fs.existsSync(unmerged.worktree), true);
  assert.equal(fs.existsSync(dirty.worktree), true);
  assert.equal(fs.existsSync(invalidOwner.worktree), true);
  assert.equal(fs.existsSync(unmanagedWorktree), true);

  const tamperedPlan = structuredClone(
    planWorktreeCleanup({ cwd: canonical })
  );
  tamperedPlan.candidates = [];
  assert.throws(
    () => applyWorktreeCleanup(tamperedPlan, { cwd: canonical }),
    error => error?.code === 'WORKTREE_CLEANUP_PLAN_TAMPERED'
  );

  console.log('worktree cleanup smoke passed');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
