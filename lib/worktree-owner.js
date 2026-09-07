const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const { readWorkspaceIdentity } = require('./publish-lease');
const { loadEngineeringPolicy } = require('./policy');

const OWNER_RELATIVE_FILE = path.join('.openxiangda', 'worktree-owner.json');
const MANAGED_RELATIVE_FILE = path.join(
  '.openxiangda',
  'worktree-managed.json'
);
// Ownership is a collision guard for an actively edited checkout, not a
// half-day reservation. Long releases have their own renewable platform
// lease; source ownership is released by `sdd ready` once the task is clean
// and committed.
const DEFAULT_OWNER_TTL_SECONDS =
  loadEngineeringPolicy().ownership.defaultTtlSeconds;
const LOCK_STALE_MS = 30_000;
const LOCK_RETRIES = 80;
const LOCK_RETRY_MS = 25;

function getWorktreeOwnerStatus(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const identity = readWorkspaceIdentity(cwd);
  const file = path.join(cwd, OWNER_RELATIVE_FILE);
  const owner = readOwnerFile(file);
  const now = options.now === undefined ? Date.now() : Number(options.now);
  const invalid = Boolean(owner?.__invalidOwnerState);
  const active = invalid || isOwnerActive(owner, now);
  return {
    enforced: Boolean(identity.threadId),
    currentThreadId: identity.threadId || null,
    active,
    ownedByCurrentThread: Boolean(
      active && identity.threadId && owner?.threadId === identity.threadId
    ),
    owner: invalid ? null : owner || null,
    invalid,
    file,
    identity,
  };
}

function claimWorktreeOwner(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const identity = readWorkspaceIdentity(cwd);
  if (!identity.threadId) {
    return {
      enforced: false,
      claimed: false,
      reason: 'CODEX_THREAD_ID is not available',
      identity,
    };
  }
  const file = path.join(cwd, OWNER_RELATIVE_FILE);
  const ttlSeconds = normalizeTtl(options.ttlSeconds);
  return withOwnerLock(file, () => {
    const now = options.now === undefined ? Date.now() : Number(options.now);
    const current = readOwnerFile(file);
    assertValidOwnerState(current, file);
    const active = isOwnerActive(current, now);
    const foreign = active && current.threadId !== identity.threadId;
    if (foreign && !options.force) {
      throw ownershipError(current, identity);
    }
    if (foreign && !String(options.reason || '').trim()) {
      throw new Error('强制接管 worktree 必须提供 --reason');
    }
    const acquiredAt =
      active && current.threadId === identity.threadId
        ? current.acquiredAt
        : new Date(now).toISOString();
    const owner = {
      version: 1,
      threadId: identity.threadId,
      changeId: text(options.changeId) || text(current?.changeId) || null,
      cwd: identity.cwd,
      worktreeRoot: identity.worktreeRoot || identity.cwd,
      branch: identity.branch || null,
      commit: identity.commit || null,
      acquiredAt,
      heartbeatAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlSeconds * 1000).toISOString(),
      ...(foreign
        ? {
            takeover: {
              previousThreadId: current.threadId,
              reason: String(options.reason).trim(),
              at: new Date(now).toISOString(),
            },
          }
        : {}),
    };
    writeOwnerFile(file, owner);
    writeManagedMarker(cwd, owner);
    return {
      enforced: true,
      claimed: true,
      renewed: Boolean(active && current.threadId === identity.threadId),
      owner,
      file,
    };
  });
}

function releaseWorktreeOwner(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const identity = readWorkspaceIdentity(cwd);
  const file = path.join(cwd, OWNER_RELATIVE_FILE);
  if (!fs.existsSync(file)) {
    return { released: false, active: false, file };
  }
  return withOwnerLock(file, () => {
    const current = readOwnerFile(file);
    assertValidOwnerState(current, file);
    if (!current) return { released: false, active: false, file };
    const expectedThreadId = text(options.expectedThreadId);
    const expectedChangeId = text(options.expectedChangeId);
    if (
      (expectedThreadId && text(current.threadId) !== expectedThreadId) ||
      (expectedChangeId && text(current.changeId) !== expectedChangeId)
    ) {
      const error = new Error(
        'WORKTREE_OWNER_STATE_CHANGED: worktree owner 与待释放的精确任务/change 不一致，禁止清理'
      );
      error.code = 'WORKTREE_OWNER_STATE_CHANGED';
      error.owner = current;
      throw error;
    }
    const foreign =
      identity.threadId &&
      current.threadId &&
      current.threadId !== identity.threadId &&
      isOwnerActive(current, Date.now());
    if (foreign && !options.force) throw ownershipError(current, identity);
    if (foreign && !String(options.reason || '').trim()) {
      throw new Error('强制释放其他任务的 worktree 所有权必须提供 --reason');
    }
    fs.rmSync(file, { force: true });
    return { released: true, active: false, previousOwner: current, file };
  });
}

function assertOrClaimWorktreeOwner(options = {}) {
  return claimWorktreeOwner(options);
}

function ownershipError(owner, identity) {
  const error = new Error(
    [
      `当前 worktree 已由另一个 Codex 任务占用: ${owner.threadId}`,
      owner.changeId ? `change=${owner.changeId}` : '',
      owner.branch ? `branch=${owner.branch}` : '',
      `请为任务 ${identity.threadId} 创建独立 git worktree 后继续；不要在共享目录覆盖对方源码。`,
      '确认原任务已结束时，可执行 workspace ownership claim --force --reason "..." 显式接管。',
    ]
      .filter(Boolean)
      .join(' ')
  );
  error.code = 'WORKTREE_OWNED_BY_ANOTHER_TASK';
  error.owner = owner;
  return error;
}

function readOwnerFile(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { __invalidOwnerState: true };
  }
}

function assertValidOwnerState(owner, file) {
  if (!owner?.__invalidOwnerState) return;
  const error = new Error(
    `WORKTREE_OWNER_STATE_INVALID: ownership 文件无法解析，禁止覆盖或释放: ${file}`
  );
  error.code = 'WORKTREE_OWNER_STATE_INVALID';
  throw error;
}

function writeManagedMarker(cwd, owner) {
  const file = managedWorktreeMarkerFile({ cwd });
  if (fs.existsSync(file)) return file;
  writeOwnerFile(file, {
    version: 1,
    managedBy: 'openxiangda',
    createdAt: new Date().toISOString(),
    firstThreadId: owner.threadId,
    branch: owner.branch || null,
  });
  return file;
}

function managedWorktreeMarkerFile(options = {}) {
  const cwd = normalizeWorktreeRoot(
    path.resolve(options.cwd || process.cwd())
  );
  const commonDir = resolveGitCommonDir(cwd);
  if (!commonDir) return path.join(cwd, MANAGED_RELATIVE_FILE);
  const key = crypto
    .createHash('sha256')
    .update(cwd)
    .digest('hex');
  return path.join(
    commonDir,
    'openxiangda-managed-worktrees',
    `${key}.json`
  );
}

function hasManagedWorktreeMarker(options = {}) {
  return fs.existsSync(managedWorktreeMarkerFile(options));
}

function writeOwnerFile(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, file);
}

function withOwnerLock(file, operation) {
  const lockFile = resolveOwnerLockFile(file);
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  let fd = null;
  for (let attempt = 0; attempt < LOCK_RETRIES; attempt += 1) {
    try {
      fd = fs.openSync(lockFile, 'wx', 0o600);
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        const age = Date.now() - fs.statSync(lockFile).mtimeMs;
        if (age > LOCK_STALE_MS) {
          fs.rmSync(lockFile, { force: true });
          continue;
        }
      } catch {}
      synchronousWait(LOCK_RETRY_MS);
    }
  }
  if (fd === null) throw new Error(`无法获取 worktree ownership lock: ${lockFile}`);
  try {
    return operation();
  } finally {
    try {
      fs.closeSync(fd);
    } finally {
      fs.rmSync(lockFile, { force: true });
    }
  }
}

function resolveOwnerLockFile(file) {
  const worktreeRoot = normalizeWorktreeRoot(
    path.dirname(path.dirname(path.resolve(file)))
  );
  const commonDir = resolveGitCommonDir(worktreeRoot);
  if (commonDir) {
    const key = crypto
      .createHash('sha256')
      .update(worktreeRoot)
      .digest('hex');
    return path.join(
      commonDir,
      'openxiangda-owner-locks',
      `${key}.lock`
    );
  }
  return `${file}.lock`;
}

function resolveGitCommonDir(worktreeRoot) {
  const result = spawnSync(
    'git',
    ['-C', worktreeRoot, 'rev-parse', '--git-common-dir'],
    {
      encoding: 'utf8',
      timeout: 5_000,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
      },
    }
  );
  if (!result.error && result.status === 0) {
    const raw = String(result.stdout || '').trim();
    const commonDir = path.isAbsolute(raw)
      ? raw
      : path.resolve(worktreeRoot, raw);
    return commonDir;
  }
  return null;
}

function normalizeWorktreeRoot(value) {
  try {
    return fs.realpathSync.native(value);
  } catch {
    return path.resolve(value);
  }
}

function withWorktreeOwnerLock(options = {}, operation) {
  const cwd = path.resolve(options.cwd || process.cwd());
  return withOwnerLock(
    path.join(cwd, OWNER_RELATIVE_FILE),
    operation
  );
}

function synchronousWait(milliseconds) {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, milliseconds);
}

function isOwnerActive(owner, now = Date.now()) {
  if (!owner?.threadId || !owner?.expiresAt) return false;
  const expiresAt = new Date(owner.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Number(now);
}

function normalizeTtl(value) {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_OWNER_TTL_SECONDS;
  }
  const ttl = Number(value);
  if (!Number.isSafeInteger(ttl) || ttl < 300 || ttl > 86_400) {
    throw new Error('worktree ownership ttl 必须是 300-86400 秒之间的整数');
  }
  return ttl;
}

function text(value) {
  return String(value || '').trim();
}

module.exports = {
  DEFAULT_OWNER_TTL_SECONDS,
  MANAGED_RELATIVE_FILE,
  OWNER_RELATIVE_FILE,
  assertOrClaimWorktreeOwner,
  claimWorktreeOwner,
  getWorktreeOwnerStatus,
  hasManagedWorktreeMarker,
  isOwnerActive,
  managedWorktreeMarkerFile,
  releaseWorktreeOwner,
  withWorktreeOwnerLock,
};
