const path = require('path');
const { spawnSync } = require('child_process');

const { readGitSourceBase } = require('./change-baseline');
const { identitiesIntersect } = require('./git-remote-identity');

const MIN_ROLLBACK_REASON_LENGTH = 8;
const PURE_RUNTIME_OUTPUT_PREFIXES = Object.freeze([
  '.codegraph',
  '.openxiangda',
  '.turbo',
  '.vite',
  'coverage',
  'dist',
  'node_modules',
  'openspec',
]);
const IGNORED_BUILD_INPUT_PATHS = Object.freeze([
  ':(glob).env',
  ':(glob).env.*',
  ':(glob)app-workspace.config.*',
  ':(glob)components.json',
  ':(glob)index.html',
  ':(glob)package.json',
  ':(glob)package-lock.json',
  ':(glob)pnpm-lock.yaml',
  ':(glob)yarn.lock',
  ':(glob)postcss.config.*',
  ':(glob)public/**',
  ':(glob)scripts/**',
  ':(glob)src/**',
  ':(glob)tailwind.config.*',
  ':(glob)tsconfig*.json',
  ':(glob)vite.config.*',
]);

function prepareRuntimeDeployLineage(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const app = normalizeAppSnapshot(options.app);
  const activate = options.activate !== false;
  const rollback = resolveRuntimeRollbackBypass(options);
  const parentReleaseId = normalizeNullableString(app.activeRuntimeReleaseId);
  const parentSourceRevision = normalizeRuntimeSourceRevision(
    app.activeRuntimeSourceRevision,
    { optional: true }
  );

  let sourceRevision;
  try {
    sourceRevision = normalizeRuntimeSourceRevision(
      options.sourceRevision || readGitSourceBase(cwd, 'HEAD')
    );
  } catch (error) {
    throw runtimeLineageError(
      'RUNTIME_SOURCE_LINEAGE_REQUIRED',
      `创建 Runtime release 前必须使用可审计的已提交源码版本；当前目录无法解析 Runtime source revision。${formatCause(error)}`
    );
  }

  assertRuntimeSourceClean(cwd);

  const legacyBootstrap = Boolean(parentReleaseId && !parentSourceRevision);
  if (parentSourceRevision) {
    const sameRepository = identitiesIntersect(
      [
        parentSourceRevision.repo,
        ...(parentSourceRevision.repoAliases || []),
      ],
      [sourceRevision.repo, ...(sourceRevision.repoAliases || [])]
    );
    const descendsFromActive =
      sameRepository &&
      isGitAncestor(cwd, parentSourceRevision.baseCommit, sourceRevision.baseCommit);
    if ((!sameRepository || !descendsFromActive) && !rollback.enabled) {
      const detail = sameRepository
        ? `线上基线 ${shortCommit(parentSourceRevision.baseCommit)} 不是当前 HEAD ${shortCommit(sourceRevision.baseCommit)} 的祖先`
        : '当前 Git 仓库与线上 Runtime 的源码仓库不一致';
      throw runtimeLineageError(
        'RUNTIME_SOURCE_BASE_DIVERGED',
        `${detail}；已在构建和上传前阻断。请合并线上 release head 后重试；确需审计式回退时使用 --allow-runtime-rollback --reason "至少 8 个字符的原因"。`,
        { sourceRevision, parentSourceRevision, parentReleaseId }
      );
    }
    return stripUndefinedValues({
      sourceRevision: sameRepository
        ? {
            ...sourceRevision,
            repo: parentSourceRevision.repo,
            repositoryId: parentSourceRevision.repo,
          }
        : sourceRevision,
      parentReleaseId,
      parentSourceRevision,
      lineageBypassReason: rollback.enabled ? rollback.reason : undefined,
      lineageStatus:
        rollback.enabled && (!sameRepository || !descendsFromActive)
          ? 'rollback-bypass'
          : activate
            ? 'descendant'
            : 'preview',
      auditable: true,
      activationAllowed: true,
    });
  }

  return stripUndefinedValues({
    sourceRevision,
    parentReleaseId,
    parentSourceRevision,
    lineageBypassReason: rollback.enabled ? rollback.reason : undefined,
    lineageStatus: legacyBootstrap ? 'legacy-bootstrap' : 'bootstrap',
    legacyBootstrap,
    auditable: true,
    activationAllowed: true,
  });
}

function assertRuntimeSourceClean(cwd = process.cwd()) {
  const root = path.resolve(cwd);
  const dirtyPaths = listRuntimeBuildInputChanges(root);
  if (dirtyPaths.length > 0) {
    throw runtimeLineageError(
      'RUNTIME_SOURCE_DIRTY',
      [
        '创建 Runtime release 前，所有可能进入构建的源码和配置必须提交到当前 HEAD。',
        `未提交路径: ${summarizePaths(dirtyPaths)}`,
        '请先提交/合并这些修改并重新构建；.openxiangda/、dist/ 等纯状态或生成目录不会触发此阻断。',
      ].join(' '),
      { dirtyPaths }
    );
  }
  return true;
}

function resolveRuntimeRollbackBypass(options = {}) {
  const enabled = Boolean(options.allowRollback);
  const reason = String(options.reason || '').trim();
  if (!enabled) return { enabled: false, reason: '' };
  if (reason.length < MIN_ROLLBACK_REASON_LENGTH) {
    throw runtimeLineageError(
      'RUNTIME_ROLLBACK_REASON_REQUIRED',
      `--allow-runtime-rollback 必须同时提供至少 ${MIN_ROLLBACK_REASON_LENGTH} 个字符的 --reason，原因会写入发布审计`
    );
  }
  return { enabled: true, reason };
}

function listRuntimeBuildInputChanges(cwd = process.cwd()) {
  const changed = runGitNameList(cwd, [
    'diff',
    '--name-only',
    '-z',
    '--relative',
    'HEAD',
    '--',
    '.',
  ]);
  const untracked = runGitNameList(cwd, [
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
    '--',
    '.',
  ]);
  const ignoredInputs = runGitNameList(
    cwd,
    [
      'ls-files',
      '--others',
      '--ignored',
      '--exclude-standard',
      '-z',
      '--',
      ...IGNORED_BUILD_INPUT_PATHS,
    ],
    { allowFailure: true }
  );
  return [...new Set([...changed, ...untracked, ...ignoredInputs])]
    .map(normalizeGitPath)
    .filter(Boolean)
    .filter(filePath => !isPureRuntimeOutputPath(filePath))
    .sort((left, right) => left.localeCompare(right));
}

function isPureRuntimeOutputPath(filePath) {
  const normalized = normalizeGitPath(filePath);
  const firstSegment = normalized.split('/')[0];
  return (
    PURE_RUNTIME_OUTPUT_PREFIXES.includes(firstSegment) ||
    /(^|\/)\.DS_Store$/.test(normalized) ||
    /\.tsbuildinfo$/.test(normalized)
  );
}

function isGitAncestor(cwd, ancestorCommit, descendantCommit) {
  const result = spawnSync(
    'git',
    ['-C', cwd, 'merge-base', '--is-ancestor', ancestorCommit, descendantCommit],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  );
  return !result.error && result.status === 0;
}

function runGitNameList(cwd, args, options = {}) {
  const result = spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'buffer',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    if (options.allowFailure) return [];
    const detail = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString('utf8').trim()
      : String(result.stderr || '').trim();
    throw runtimeLineageError(
      'RUNTIME_SOURCE_LINEAGE_REQUIRED',
      `无法检查 Runtime Git 工作区状态${detail ? `: ${detail}` : ''}`
    );
  }
  const stdout = Buffer.isBuffer(result.stdout)
    ? result.stdout
    : Buffer.from(result.stdout || '');
  return stdout
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
}

function normalizeRuntimeSourceRevision(value, options = {}) {
  if (value === undefined || value === null || value === '') {
    if (options.optional) return null;
    throw runtimeLineageError(
      'RUNTIME_SOURCE_LINEAGE_REQUIRED',
      'Runtime source revision 缺失'
    );
  }
  let input = value;
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input);
    } catch {
      input = null;
    }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw runtimeLineageError(
      'RUNTIME_SOURCE_LINEAGE_REQUIRED',
      '线上 Runtime source revision 无效'
    );
  }
  const repo = String(input.repo || input.repositoryId || '').trim();
  const baseCommit = String(input.baseCommit || '').trim().toLowerCase();
  const treeHash = String(input.treeHash || '').trim().toLowerCase();
  if (
    !/^sha256:[0-9a-f]{64}$/i.test(repo) ||
    !/^[0-9a-f]{40,64}$/.test(baseCommit) ||
    !/^[0-9a-f]{40,64}$/.test(treeHash)
  ) {
    throw runtimeLineageError(
      'RUNTIME_SOURCE_LINEAGE_REQUIRED',
      '线上 Runtime source revision 缺少有效的 repo/baseCommit/treeHash'
    );
  }
  const repoAliases = Array.from(
    new Set(
      [repo, ...(Array.isArray(input.repoAliases) ? input.repoAliases : [])]
        .map(item => String(item || '').trim().toLowerCase())
        .filter(item => /^sha256:[0-9a-f]{64}$/.test(item))
    )
  );
  return { repo, repoAliases, baseCommit, treeHash };
}

function normalizeAppSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value.app || value.application || value;
}

function normalizeNullableString(value) {
  const text = String(value === undefined || value === null ? '' : value).trim();
  return text || null;
}

function normalizeGitPath(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+|\/+$/g, '');
}

function summarizePaths(paths, limit = 8) {
  const selected = paths.slice(0, limit).join(', ');
  return paths.length > limit ? `${selected}（另有 ${paths.length - limit} 项）` : selected;
}

function shortCommit(value) {
  return String(value || '').slice(0, 12) || '-';
}

function formatCause(error) {
  const message = String(error?.message || '').trim();
  return message ? ` 原因: ${message}` : '';
}

function stripUndefinedValues(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  );
}

function runtimeLineageError(code, message, details = {}) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  Object.assign(error, details);
  return error;
}

module.exports = {
  MIN_ROLLBACK_REASON_LENGTH,
  assertRuntimeSourceClean,
  isPureRuntimeOutputPath,
  listRuntimeBuildInputChanges,
  normalizeRuntimeSourceRevision,
  prepareRuntimeDeployLineage,
  resolveRuntimeRollbackBypass,
};
