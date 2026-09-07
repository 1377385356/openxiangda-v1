const { execFileSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');

const { saveProjectState } = require('./config');

const DEFAULT_CLI_PUBLISH_LEASE_TTL_SECONDS = 120;
const PUBLISH_LEASE_RENEW_WINDOW_SECONDS = 60;

function getStoredPublishLease(target) {
  const lease = target?.bound?.promotion?.publishLease;
  return lease && typeof lease === 'object' ? lease : null;
}

function getUsableStoredPublishLease(target, now = Date.now()) {
  const lease = getStoredPublishLease(target);
  if (!lease?.leaseId || !lease?.expiresAt) return null;
  const expiresAt = new Date(lease.expiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Number(now)) return null;
  if (lease.appType && lease.appType !== target.appType) return null;
  if (lease.profile && lease.profile !== target.profileName) return null;
  if (!isPublishLeaseOwnedByCurrentSession(lease)) return null;
  return lease;
}

function isPublishLeaseExpired(lease, now = Date.now()) {
  if (!lease?.expiresAt) return true;
  const expiresAt = new Date(lease.expiresAt).getTime();
  return !Number.isFinite(expiresAt) || expiresAt <= Number(now);
}

function currentCodexThreadId(env = process.env) {
  return String(env?.CODEX_THREAD_ID || '').trim();
}

function createPublishClientSessionId(env = process.env, options = {}) {
  const threadId = currentCodexThreadId(env);
  const nonce = String(
    typeof options.randomUUID === 'function'
      ? options.randomUUID()
      : crypto.randomUUID()
  ).trim();
  if (!threadId) return `cli:${nonce}`;
  const candidate = `codex:${threadId}:${nonce}`;
  if (candidate.length <= 128) return candidate;
  const threadDigest = crypto
    .createHash('sha256')
    .update(threadId)
    .digest('hex')
    .slice(0, 24);
  return `codex:${threadDigest}:${nonce}`;
}

function isPublishLeaseOwnedByCurrentSession(lease, env = process.env) {
  const ownerThreadId = String(lease?.workspace?.threadId || '').trim();
  const threadId = currentCodexThreadId(env);
  if (ownerThreadId && threadId) return ownerThreadId === threadId;
  return true;
}

function shouldRenewPublishLease(
  lease,
  now = Date.now(),
  renewWindowSeconds = PUBLISH_LEASE_RENEW_WINDOW_SECONDS
) {
  if (!lease?.expiresAt) return true;
  const expiresAt = new Date(lease.expiresAt).getTime();
  if (!Number.isFinite(expiresAt)) return true;
  return expiresAt - Number(now) <= Number(renewWindowSeconds) * 1000;
}

function savePublishLease(target, input, options = {}) {
  const lease = normalizePublishLease(input, target);
  target.bound.promotion = {
    ...(target.bound.promotion || {}),
    publishLease: lease,
  };
  target.bound.updatedAt = new Date().toISOString();
  persistTargetBinding(target);
  (options.saveState || saveProjectState)(target.state, options.cwd || process.cwd());
  return lease;
}

function clearPublishLease(target, leaseId, options = {}) {
  const current = getStoredPublishLease(target);
  if (!current) return false;
  if (leaseId && current.leaseId !== leaseId) return false;
  target.bound.promotion = { ...(target.bound.promotion || {}) };
  delete target.bound.promotion.publishLease;
  if (Object.keys(target.bound.promotion).length === 0) {
    delete target.bound.promotion;
  }
  target.bound.updatedAt = new Date().toISOString();
  persistTargetBinding(target);
  (options.saveState || saveProjectState)(target.state, options.cwd || process.cwd());
  return true;
}

function persistTargetBinding(target) {
  const targetName = String(target?.targetName || '').trim();
  if (targetName) {
    target.state.targets ||= {};
    target.state.targets[targetName] = target.bound;
  } else if (target.state.profiles?.[target.profileName]) {
    target.state.profiles[target.profileName] = target.bound;
  }
}

function normalizePublishLease(input, target) {
  const leaseId = String(input?.leaseId || '').trim();
  const expiresAt = normalizeDate(input?.expiresAt, 'expiresAt');
  if (!leaseId) throw new Error('publish lease response 缺少 leaseId');
  const currentWorkspace = readWorkspaceIdentity(optionsCwd(target));
  const suppliedWorkspace =
    input?.workspace && typeof input.workspace === 'object'
      ? input.workspace
      : {};
  return {
    leaseId,
    appType: String(input?.appType || target?.appType || '').trim(),
    profile: String(target?.profileName || '').trim(),
    changeId: String(input?.changeId || '').trim() || null,
    clientSessionId: String(input?.clientSessionId || '').trim() || null,
    baseRevision: String(input?.baseRevision || '').trim() || null,
    expiresAt,
    holder: input?.holder === 'other' ? 'other' : 'self',
    workspace: {
      ...currentWorkspace,
      ...suppliedWorkspace,
      cwd: currentWorkspace.cwd,
      worktreeRoot:
        suppliedWorkspace.worktreeRoot || currentWorkspace.worktreeRoot,
      threadId: currentCodexThreadId() || suppliedWorkspace.threadId || null,
    },
    updatedAt: new Date().toISOString(),
  };
}

function buildPublishBaseRevision(snapshot) {
  const app = unwrapRecord(snapshot?.app) || {};
  const runtime = unwrapRecord(snapshot?.runtime) || {};
  const updatedAt = textValue(
    app.updatedAt || runtime.updatedAt || snapshot?.updatedAt
  );
  const activeReleaseId = textValue(
    app.activeRuntimeReleaseId ||
      runtime.activeReleaseId ||
      snapshot?.activeRuntimeReleaseId
  );
  const activeBuildId = textValue(
    app.activeRuntimeBuildId || runtime.activeBuildId || snapshot?.activeRuntimeBuildId
  );
  return [
    `appUpdatedAt=${updatedAt || '-'}`,
    `runtimeRelease=${activeReleaseId || '-'}`,
    `runtimeBuild=${activeBuildId || '-'}`,
  ].join(';');
}

function readWorkspaceIdentity(cwd = process.cwd()) {
  const resolvedCwd = path.resolve(cwd);
  return {
    cwd: resolvedCwd,
    branch: readGitValue(resolvedCwd, ['branch', '--show-current']),
    commit: readGitValue(resolvedCwd, ['rev-parse', 'HEAD']),
    worktreeRoot: readGitValue(resolvedCwd, ['rev-parse', '--show-toplevel']),
    threadId: currentCodexThreadId(),
  };
}

function readGitValue(cwd, args) {
  try {
    return String(
      execFileSync('git', ['-C', cwd, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    ).trim();
  } catch {
    return '';
  }
}

function optionsCwd(target) {
  return target?.cwd || process.cwd();
}

function normalizeDate(value, field) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`publish lease response ${field} 无效`);
  }
  return date.toISOString();
}

function unwrapRecord(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.data && typeof value.data === 'object') return value.data;
  return value;
}

function textValue(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

module.exports = {
  DEFAULT_CLI_PUBLISH_LEASE_TTL_SECONDS,
  PUBLISH_LEASE_RENEW_WINDOW_SECONDS,
  buildPublishBaseRevision,
  clearPublishLease,
  createPublishClientSessionId,
  currentCodexThreadId,
  getStoredPublishLease,
  getUsableStoredPublishLease,
  isPublishLeaseExpired,
  isPublishLeaseOwnedByCurrentSession,
  readWorkspaceIdentity,
  savePublishLease,
  shouldRenewPublishLease,
};
