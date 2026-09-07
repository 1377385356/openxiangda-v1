const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const { resolveAuthoritativeMainline } = require('./release-mainline');
const {
  getWorktreeOwnerStatus,
  hasManagedWorktreeMarker,
  managedWorktreeMarkerFile,
  withWorktreeOwnerLock,
} = require('./worktree-owner');

const GIT_OUTPUT_LIMIT = 16 * 1024 * 1024;
const PRIVATE_RELEASE_PATHS = [
  path.join('.openxiangda', 'candidates'),
  path.join('.openxiangda', 'releases'),
];

function planWorktreeCleanup(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const repositoryRoot = readGit(cwd, ['rev-parse', '--show-toplevel']).stdout;
  const currentWorktree = normalizeExistingPath(repositoryRoot);
  const currentBranch = readGit(cwd, ['branch', '--show-current'], {
    allowFailure: true,
  }).stdout;
  const currentHead = readGit(cwd, ['rev-parse', 'HEAD']).stdout;
  const mainline = resolveAuthoritativeMainline({ cwd });
  const currentDirtyPaths = readStatusPaths(cwd);
  const globalBlockers = [];

  if (currentBranch !== mainline.branchName) {
    globalBlockers.push(
      blocker(
        'WORKTREE_CLEANUP_MAINLINE_REQUIRED',
        `清理只能从 canonical ${mainline.branchName} 工作区执行；当前分支为 ${currentBranch || '(detached)'}`
      )
    );
  }
  if (currentHead !== mainline.tipCommit) {
    globalBlockers.push(
      blocker(
        'WORKTREE_CLEANUP_MAINLINE_NOT_SYNCED',
        `canonical 工作区 ${shortCommit(currentHead)} 必须与 ${mainline.remoteName}/${mainline.branchName}@${shortCommit(mainline.tipCommit)} 完全一致`
      )
    );
  }
  if (currentDirtyPaths.length > 0) {
    globalBlockers.push(
      blocker(
        'WORKTREE_CLEANUP_MAINLINE_DIRTY',
        `canonical 工作区必须干净；未提交路径: ${summarizePaths(currentDirtyPaths)}`,
        { dirtyPaths: currentDirtyPaths }
      )
    );
  }

  const worktrees = parseWorktreeList(
    readGit(cwd, ['worktree', 'list', '--porcelain']).stdout
  );
  const candidates = worktrees
    .map(record =>
      inspectWorktree(record, {
        cwd,
        currentHead,
        currentWorktree,
        mainline,
      })
    )
    .filter(Boolean);
  const safeCandidates = candidates.filter(candidate => candidate.safeToRemove);
  const blockedCandidates = candidates.filter(candidate => !candidate.safeToRemove);

  const plan = {
    schemaVersion: 1,
    dryRun: true,
    repositoryRoot,
    canonical: {
      worktree: currentWorktree,
      branch: currentBranch || null,
      commit: currentHead,
      clean: currentDirtyPaths.length === 0,
      dirtyPaths: currentDirtyPaths,
    },
    mainline,
    globalBlockers,
    canApply: globalBlockers.length === 0,
    candidates,
    summary: {
      linkedWorktrees: worktrees.length,
      safe: safeCandidates.length,
      blocked: blockedCandidates.length,
      staleRecords: candidates.filter(candidate => candidate.prunable).length,
    },
  };
  plan.planHash = cleanupPlanHash(plan);
  return plan;
}

function applyWorktreeCleanup(plan, options = {}) {
  if (!plan || typeof plan !== 'object') {
    throw cleanupError(
      'WORKTREE_CLEANUP_PLAN_REQUIRED',
      'apply 需要同一进程刚生成的 cleanup plan'
    );
  }
  const cwd = path.resolve(options.cwd || plan.repositoryRoot || process.cwd());
  if (plan.planHash !== cleanupPlanHash(plan)) {
    throw cleanupError(
      'WORKTREE_CLEANUP_PLAN_TAMPERED',
      'cleanup plan 内容与 planHash 不一致；请重新执行 dry-run'
    );
  }
  if (!plan.canApply) {
    throw cleanupError(
      'WORKTREE_CLEANUP_PLAN_BLOCKED',
      'dry-run 计划本身未通过 canonical 门禁；状态修复后请重新审阅'
    );
  }
  const currentPlan = planWorktreeCleanup({ cwd });
  if (
    normalizeExistingPath(currentPlan.repositoryRoot) !==
    normalizeExistingPath(plan.repositoryRoot)
  ) {
    throw cleanupError(
      'WORKTREE_CLEANUP_REPOSITORY_CHANGED',
      'apply 必须在生成 dry-run 的同一仓库执行'
    );
  }
  if (!currentPlan.canApply) {
    throw cleanupError(
      'WORKTREE_CLEANUP_MAINLINE_BLOCKED',
      `canonical 工作区未通过清理门禁: ${currentPlan.globalBlockers
        .map(item => item.code)
        .join(', ')}`
    );
  }
  const applied = [];
  const failures = [];
  const approvedCandidates = (plan.candidates || []).filter(
    candidate => candidate.safeToRemove
  );

  for (const approved of approvedCandidates) {
    const candidate = findExactCandidate(
      currentPlan.candidates,
      approved
    );
    if (!candidate?.safeToRemove) {
      failures.push({
        action: approved.prunable
          ? 'prune-worktree-record'
          : 'remove-worktree',
        path: approved.path,
        branch: approved.branch,
        code: 'WORKTREE_CLEANUP_PLAN_STALE',
        message:
          'dry-run 后 worktree 身份或安全状态已变化；本次跳过，请重新审查',
      });
      continue;
    }
    if (candidate.prunable) {
      failures.push({
        action: 'prune-worktree-record',
        path: candidate.path,
        branch: candidate.branch,
        code: 'WORKTREE_CLEANUP_STALE_RECORD_MANUAL_PRUNE_REQUIRED',
        message:
          '失效记录不自动全局 prune；请确认全部 stale 记录后手工执行 git worktree prune',
      });
      continue;
    }
    try {
      withWorktreeOwnerLock({ cwd: candidate.path }, () => {
        const lockedPlan = planWorktreeCleanup({ cwd });
        const lockedCandidate = findExactCandidate(
          lockedPlan.candidates,
          approved
        );
        if (!lockedPlan.canApply || !lockedCandidate?.safeToRemove) {
          throw cleanupError(
            'WORKTREE_CLEANUP_REVALIDATION_FAILED',
            'owner lock 内复核发现 worktree 已变化或不再安全'
          );
        }
        const managedMarker = managedWorktreeMarkerFile({
          cwd: candidate.path,
        });
        runGit(cwd, ['worktree', 'remove', candidate.path]);
        fs.rmSync(managedMarker, { force: true });
      });
      applied.push({
        action: 'remove-worktree',
        path: candidate.path,
        branch: candidate.branch,
      });
    } catch (error) {
      failures.push({
        action: 'remove-worktree',
        path: candidate.path,
        branch: candidate.branch,
        code: error.code || 'WORKTREE_CLEANUP_REMOVE_FAILED',
        message: error.message,
      });
    }
  }

  for (const approved of approvedCandidates) {
    const candidate = findExactCandidate(
      currentPlan.candidates,
      approved
    );
    if (
      !candidate ||
      candidate.prunable ||
      !candidate.branch ||
      !candidate.localBranch
    ) {
      continue;
    }
    const worktreeFailure = failures.some(
      failure =>
        failure.action === 'remove-worktree' &&
        failure.path === candidate.path
    );
    if (worktreeFailure) continue;
    try {
      const branchHead = readGit(
        cwd,
        ['rev-parse', `refs/heads/${candidate.branch}`],
        { allowFailure: true }
      );
      if (!branchHead.ok || branchHead.stdout !== candidate.head) {
        throw cleanupError(
          'WORKTREE_CLEANUP_BRANCH_MOVED',
          `本地分支 ${candidate.branch} 在 dry-run 后已移动，拒绝删除`
        );
      }
      runGit(cwd, ['branch', '-d', candidate.branch]);
      applied.push({
        action: 'delete-local-branch',
        branch: candidate.branch,
      });
    } catch (error) {
      failures.push({
        action: 'delete-local-branch',
        branch: candidate.branch,
        code: error.code || 'WORKTREE_CLEANUP_BRANCH_DELETE_FAILED',
        message: error.message,
      });
    }
  }

  return {
    ...currentPlan,
    dryRun: false,
    applied,
    failures,
    remoteBranchesRetained: true,
  };
}

function inspectWorktree(record, context) {
  const worktreePath = normalizePath(record.path);
  if (samePath(worktreePath, context.currentWorktree)) return null;

  const exists = fs.existsSync(worktreePath);
  const prunable = Boolean(record.prunable || !exists);
  const branch = normalizeLocalBranch(record.branch);
  const managed =
    Boolean(branch?.startsWith('codex/')) ||
    (exists && hasManagedWorktreeMarker({ cwd: worktreePath }));
  const localBranch = branch
    ? readGit(context.cwd, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
        allowFailure: true,
      }).ok
    : false;
  const blockers = [];
  const headContained = Boolean(
    record.head &&
      readGit(
        context.cwd,
        ['merge-base', '--is-ancestor', record.head, context.currentHead],
        { allowFailure: true }
      ).status === 0
  );

  if (!branch) {
    blockers.push(
      blocker(
        'WORKTREE_CLEANUP_NAMED_BRANCH_REQUIRED',
        'detached worktree 不自动删除；请先人工确认用途'
      )
    );
  } else if (branch === context.mainline.branchName) {
    blockers.push(
      blocker(
        'WORKTREE_CLEANUP_MAINLINE_PROTECTED',
        `禁止删除 ${context.mainline.branchName} worktree`
      )
    );
  }
  if (!headContained) {
    blockers.push(
      blocker(
        'WORKTREE_CLEANUP_NOT_IN_MAINLINE',
        `${shortCommit(record.head)} 尚未包含在 ${context.mainline.remoteName}/${context.mainline.branchName}@${shortCommit(context.currentHead)}`
      )
    );
  }
  if (record.locked) {
    blockers.push(
      blocker(
        'WORKTREE_CLEANUP_LOCKED',
        `Git worktree 仍被锁定${record.lockedReason ? `: ${record.lockedReason}` : ''}`
      )
    );
  }
  if (!managed) {
    blockers.push(
      blocker(
        'WORKTREE_CLEANUP_UNMANAGED',
        '仅自动删除 OpenXiangda 标记或 codex/* 任务 worktree'
      )
    );
  }
  if (prunable) {
    blockers.push(
      blocker(
        'WORKTREE_CLEANUP_STALE_RECORD_MANUAL_PRUNE_REQUIRED',
        'stale 记录只能整体 prune，自动清理禁止执行全局 git worktree prune'
      )
    );
  }

  let dirtyPaths = [];
  let owner = null;
  let privateReleasePaths = [];
  let promotionStatePaths = [];
  if (prunable && exists) {
    blockers.push(
      blocker(
        'WORKTREE_CLEANUP_STALE_PATH_PRESENT',
        'Git 记录已失效但目录仍存在；请先人工检查目录内容，禁止自动清理'
      )
    );
  } else if (exists) {
    dirtyPaths = readStatusPaths(worktreePath);
    if (dirtyPaths.length > 0) {
      blockers.push(
        blocker(
          'WORKTREE_CLEANUP_DIRTY',
          `存在未提交路径: ${summarizePaths(dirtyPaths)}`,
          { dirtyPaths }
        )
      );
    }
    owner = getWorktreeOwnerStatus({ cwd: worktreePath });
    if (owner.invalid) {
      blockers.push(
        blocker(
          'WORKTREE_CLEANUP_OWNER_STATE_INVALID',
          'worktree ownership 文件无法解析；按占用状态处理，禁止自动删除'
        )
      );
    } else if (owner.active) {
      blockers.push(
        blocker(
          'WORKTREE_CLEANUP_OWNER_ACTIVE',
          `worktree 仍由任务 ${owner.owner?.threadId || '(unknown)'} 占用`,
          {
            threadId: owner.owner?.threadId || null,
            changeId: owner.owner?.changeId || null,
            expiresAt: owner.owner?.expiresAt || null,
          }
        )
      );
    }
    privateReleasePaths = PRIVATE_RELEASE_PATHS.filter(relativePath =>
      directoryHasEntries(path.join(worktreePath, relativePath))
    );
    if (privateReleasePaths.length > 0) {
      blockers.push(
        blocker(
          'WORKTREE_CLEANUP_RELEASE_JOURNAL_PRESENT',
          `存在私有发布进度: ${privateReleasePaths.join(', ')}；请先在该 worktree 完成 release status/end 或恢复处理`,
          { paths: privateReleasePaths }
        )
      );
    }
    promotionStatePaths = inspectPromotionState(worktreePath);
    if (promotionStatePaths.length > 0) {
      blockers.push(
        blocker(
          'WORKTREE_CLEANUP_PROMOTION_STATE_PRESENT',
          `state.json 仍包含 lease/baseline: ${promotionStatePaths.join(', ')}`,
          { paths: promotionStatePaths }
        )
      );
    }
  }

  return {
    path: worktreePath,
    head: record.head || null,
    branch,
    localBranch,
    exists,
    prunable,
    dirtyPaths,
    owner: owner?.owner || null,
    managed,
    privateReleasePaths,
    promotionStatePaths,
    headContained,
    blockers,
    safeToRemove: blockers.length === 0,
    plannedActions: blockers.length === 0
      ? [
          prunable ? 'prune-worktree-record' : 'remove-worktree',
          ...(localBranch ? ['delete-local-branch'] : []),
        ]
      : [],
  };
}

function candidateIdentity(candidate) {
  return [
    normalizePath(candidate?.path),
    candidate?.head || '',
    candidate?.branch || '',
    candidate?.prunable ? 'prunable' : 'linked',
  ].join('\n');
}

function findExactCandidate(candidates, expected) {
  const identity = candidateIdentity(expected);
  return (candidates || []).find(
    candidate => candidateIdentity(candidate) === identity
  );
}

function cleanupPlanHash(plan) {
  const canonical = {
    schemaVersion: plan?.schemaVersion,
    repositoryRoot: plan?.repositoryRoot,
    canonical: plan?.canonical,
    mainline: plan?.mainline,
    globalBlockers: plan?.globalBlockers,
    candidates: plan?.candidates,
  };
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonical))
    .digest('hex');
}

function inspectPromotionState(worktreePath) {
  const stateFile = path.join(worktreePath, '.openxiangda', 'state.json');
  if (!fs.existsSync(stateFile)) return [];
  let state;
  try {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    return ['.openxiangda/state.json#invalid'];
  }
  const matches = [];
  for (const [name, binding] of Object.entries(state.profiles || {})) {
    collectPromotionState(matches, `profiles.${name}`, binding);
  }
  for (const [name, binding] of Object.entries(state.targets || {})) {
    collectPromotionState(matches, `targets.${name}`, binding);
  }
  return matches;
}

function collectPromotionState(matches, prefix, binding) {
  const promotion = binding?.promotion;
  if (!promotion || typeof promotion !== 'object') return;
  if (promotion.publishLease) matches.push(`${prefix}.promotion.publishLease`);
  if (promotion.changeBaseline) {
    matches.push(`${prefix}.promotion.changeBaseline`);
  }
}

function parseWorktreeList(output) {
  const records = [];
  let current = null;
  for (const rawLine of String(output || '').split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) {
      if (current) records.push(current);
      current = null;
      continue;
    }
    const separator = line.indexOf(' ');
    const key = separator === -1 ? line : line.slice(0, separator);
    const value = separator === -1 ? '' : line.slice(separator + 1);
    if (key === 'worktree') {
      if (current) records.push(current);
      current = { path: value };
      continue;
    }
    if (!current) continue;
    if (key === 'HEAD') current.head = value;
    else if (key === 'branch') current.branch = value;
    else if (key === 'detached') current.detached = true;
    else if (key === 'locked') {
      current.locked = true;
      current.lockedReason = value || null;
    } else if (key === 'prunable') {
      current.prunable = true;
      current.prunableReason = value || null;
    }
  }
  if (current) records.push(current);
  return records;
}

function readStatusPaths(cwd) {
  return String(
    readGit(cwd, ['status', '--porcelain=v1', '--untracked-files=all']).stdout ||
      ''
  )
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => line.slice(3).trim())
    .filter(Boolean);
}

function directoryHasEntries(dir) {
  if (!fs.existsSync(dir)) return false;
  try {
    return fs.statSync(dir).isDirectory() && fs.readdirSync(dir).length > 0;
  } catch {
    return true;
  }
}

function normalizeLocalBranch(value) {
  const prefix = 'refs/heads/';
  const text = String(value || '').trim();
  return text.startsWith(prefix) ? text.slice(prefix.length) : null;
}

function normalizeExistingPath(value) {
  const resolved = normalizePath(value);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function normalizePath(value) {
  return path.resolve(String(value || ''));
}

function samePath(left, right) {
  return normalizeExistingPath(left) === normalizeExistingPath(right);
}

function runGit(cwd, args) {
  return readGit(cwd, args);
}

function readGit(cwd, args, options = {}) {
  const result = spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    maxBuffer: GIT_OUTPUT_LIMIT,
    timeout: 30_000,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
    },
  });
  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();
  const ok = !result.error && result.status === 0;
  if (!ok && !options.allowFailure) {
    throw cleanupError(
      'WORKTREE_CLEANUP_GIT_FAILED',
      `git ${args.join(' ')} 失败${stderr ? `: ${sanitizeGitError(stderr)}` : ''}`
    );
  }
  return {
    ok,
    stdout,
    stderr,
    status: result.status,
    error: result.error,
  };
}

function blocker(code, message, details) {
  return {
    code,
    message,
    ...(details === undefined ? {} : { details }),
  };
}

function cleanupError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

function sanitizeGitError(value) {
  return String(value || '')
    .replace(/https?:\/\/[^\s/@]+@/gi, 'https://***@')
    .replace(/\s+/g, ' ')
    .slice(0, 500);
}

function summarizePaths(paths, limit = 6) {
  const selected = paths.slice(0, limit).join(', ');
  return paths.length > limit
    ? `${selected}（另有 ${paths.length - limit} 项）`
    : selected;
}

function shortCommit(value) {
  return String(value || '').slice(0, 12) || '-';
}

module.exports = {
  applyWorktreeCleanup,
  parseWorktreeList,
  planWorktreeCleanup,
};
