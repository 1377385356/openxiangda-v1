const path = require('path');
const { spawnSync } = require('child_process');

const { readGitSourceBase } = require('./change-baseline');
const {
  identitiesIntersect,
  remoteUrlHashes,
} = require('./git-remote-identity');
const { listRuntimeBuildInputChanges } = require('./runtime-lineage');

const GIT_OUTPUT_LIMIT = 16 * 1024 * 1024;

function prepareReleaseSourceRevision(options = {}) {
  assertNoMainlineOverride(options);
  const cwd = path.resolve(options.cwd || process.cwd());
  const sourceRevision = readGitSourceBase(cwd, 'HEAD');
  const branch = readCurrentBranch(cwd);
  if (!branch) {
    throw releaseMainlineError(
      'RELEASE_SOURCE_BRANCH_REQUIRED',
      '正式发布必须从具名 Git 分支冻结源码；detached HEAD 只能用于只读检查或本地构建'
    );
  }

  const dirtyPaths = listRuntimeBuildInputChanges(cwd);
  if (dirtyPaths.length > 0) {
    throw releaseMainlineError(
      'RELEASE_SOURCE_DIRTY',
      `正式发布前必须提交全部源码和构建配置；未提交路径: ${summarizePaths(dirtyPaths)}`,
      { dirtyPaths }
    );
  }

  const mainline = resolveAuthoritativeMainline({ cwd });
  ensureCommitAvailable(
    cwd,
    mainline.tipCommit,
    mainline.remoteName,
    mainline.branchName
  );
  if (branch !== mainline.branchName) {
    throw releaseMainlineError(
      'RELEASE_SOURCE_MAINLINE_REQUIRED',
      `正式发布只能从权威主分支 ${formatMainline(mainline)} 执行；当前分支为 ${branch}。请先把已批准变更合并到主分支并切换过去`,
      { branch, mainline }
    );
  }
  if (sourceRevision.baseCommit !== mainline.tipCommit) {
    throw releaseMainlineError(
      'RELEASE_SOURCE_MAINLINE_NOT_PUSHED',
      `本地主分支 ${shortCommit(sourceRevision.baseCommit)} 尚未与远端 ${formatMainline(mainline)}@${shortCommit(mainline.tipCommit)} 完全一致；请先 fast-forward/push，再从该提交一次发布`,
      { sourceRevision, mainline }
    );
  }
  if (
    !isGitAncestor(cwd, mainline.tipCommit, sourceRevision.baseCommit, {
      remoteName: mainline.remoteName,
      branchName: mainline.branchName,
    })
  ) {
    throw releaseMainlineError(
      'RELEASE_SOURCE_BEHIND_MAIN',
      `发布提交 ${shortCommit(sourceRevision.baseCommit)} 未包含权威主分支 ${formatMainline(mainline)}@${shortCommit(mainline.tipCommit)}；请先合并主分支、重新测试并重新开始 release`,
      { sourceRevision, mainline }
    );
  }

  return {
    ...sourceRevision,
    branch,
    worktreeRoot: readGit(cwd, ['rev-parse', '--show-toplevel']).stdout,
    remoteName: mainline.remoteName,
    remoteUrlHash: mainline.remoteUrlHash,
    remoteUrlHashAliases: mainline.remoteUrlHashAliases,
    mainBranch: mainline.branchName,
    mainTipCommit: mainline.tipCommit,
    mainlineSource: mainline.source,
    mainlinePolicy: 'publish-from-main-v1',
    capturedAt: new Date().toISOString(),
  };
}

function assertReleaseSourceRevisionStable(sourceRevision, options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const expected = normalizeSourceRevision(sourceRevision);
  const current = readGitSourceBase(cwd, 'HEAD');
  const dirtyPaths = listRuntimeBuildInputChanges(cwd);
  const sameRepository = identitiesIntersect(
    [expected.repo, ...(expected.repoAliases || [])],
    [current.repo, ...(current.repoAliases || [])]
  );
  const exact =
    sameRepository &&
    expected.baseCommit === current.baseCommit &&
    expected.treeHash === current.treeHash &&
    dirtyPaths.length === 0;
  if (exact) {
    return {
      ...current,
      stabilityMode: 'exact',
      frozenCommit: expected.baseCommit,
    };
  }

  if (
    options.allowDescendant === true &&
    sameRepository &&
    dirtyPaths.length === 0
  ) {
    ensureCommitAvailable(cwd, expected.baseCommit);
    const frozen = readGitSourceBase(cwd, expected.baseCommit);
    const branch = readCurrentBranch(cwd);
    const mainline = resolveAuthoritativeMainline({ cwd });
    ensureCommitAvailable(
      cwd,
      mainline.tipCommit,
      mainline.remoteName,
      mainline.branchName
    );
    const frozenRemoteMatches =
      (!expected.remoteName ||
        expected.remoteName === mainline.remoteName) &&
      (!expected.mainBranch ||
        expected.mainBranch === mainline.branchName) &&
      (!expected.remoteUrlHash ||
        identitiesIntersect(
          [
            expected.remoteUrlHash,
            ...(expected.remoteUrlHashAliases || []),
          ],
          [
            mainline.remoteUrlHash,
            ...(mainline.remoteUrlHashAliases || []),
          ]
        ));
    const descendant =
      frozen.treeHash === expected.treeHash &&
      frozenRemoteMatches &&
      branch === mainline.branchName &&
      current.baseCommit === mainline.tipCommit &&
      isGitAncestor(cwd, expected.baseCommit, current.baseCommit, {
        remoteName: mainline.remoteName,
        branchName: mainline.branchName,
      });
    if (descendant) {
      return {
        ...current,
        stabilityMode: 'mainline-descendant',
        frozenCommit: expected.baseCommit,
        mainBranch: mainline.branchName,
        mainTipCommit: mainline.tipCommit,
      };
    }
  }

  {
    throw releaseMainlineError(
      'RELEASE_PUBLISH_REVISION_CHANGED',
      [
        `release 已冻结 ${shortCommit(expected.baseCommit)}，当前源码为 ${shortCommit(current.baseCommit)}`,
        dirtyPaths.length > 0
          ? `且存在未提交路径: ${summarizePaths(dirtyPaths)}`
          : '',
        '发布期间禁止切换提交或修改构建输入；请完成当前提交的主线回合并结束 release 后重新计划',
      ]
        .filter(Boolean)
        .join(' '),
      { expected, current, dirtyPaths }
    );
  }
}

function inspectReleaseSourceIntegration(sourceRevision, options = {}) {
  assertNoMainlineOverride(options);
  const cwd = path.resolve(options.cwd || process.cwd());
  const source = normalizeSourceRevision(sourceRevision);
  const currentRepository = readGitSourceBase(cwd, 'HEAD');
  if (
    !identitiesIntersect(
      [source.repo, ...(source.repoAliases || [])],
      [currentRepository.repo, ...(currentRepository.repoAliases || [])]
    )
  ) {
    throw releaseMainlineError(
      'RELEASE_SOURCE_REPOSITORY_MISMATCH',
      '冻结的发布提交与当前 Git 仓库不一致，不能验证主分支回合状态'
    );
  }
  ensureCommitAvailable(cwd, source.baseCommit);
  const mainline = resolveAuthoritativeMainline({ cwd });
  if (
    source.remoteName !== mainline.remoteName ||
    source.mainBranch !== mainline.branchName ||
    !identitiesIntersect(
      [source.remoteUrlHash, ...(source.remoteUrlHashAliases || [])],
      [mainline.remoteUrlHash, ...(mainline.remoteUrlHashAliases || [])]
    )
  ) {
    throw releaseMainlineError(
      'RELEASE_MAINLINE_TARGET_CHANGED',
      `release 冻结的权威主线 ${source.remoteName}/${source.mainBranch} 与当前远端默认分支 ${mainline.remoteName}/${mainline.branchName} 不一致；禁止改 remote/默认分支绕过回合校验，请恢复原权威远端后重试`,
      {
        frozen: {
          remoteName: source.remoteName,
          remoteUrlHash: source.remoteUrlHash,
          mainBranch: source.mainBranch,
        },
        current: mainline,
      }
    );
  }
  ensureCommitAvailable(
    cwd,
    mainline.tipCommit,
    mainline.remoteName,
    mainline.branchName
  );
  const integrated = isGitAncestor(
    cwd,
    source.baseCommit,
    mainline.tipCommit,
    {
      remoteName: mainline.remoteName,
      branchName: mainline.branchName,
    }
  );
  return {
    integrated,
    repositoryId: source.repo,
    sourceCommit: source.baseCommit,
    sourceTreeHash: source.treeHash,
    sourceBranch: source.branch || null,
    remoteName: mainline.remoteName,
    remoteUrlHash: mainline.remoteUrlHash,
    mainBranch: mainline.branchName,
    mainTipCommit: mainline.tipCommit,
    mainlineSource: mainline.source,
    verifiedAt: new Date().toISOString(),
  };
}

function assertReleaseSourceIntegrated(sourceRevision, options = {}) {
  const status = inspectReleaseSourceIntegration(sourceRevision, options);
  if (status.integrated) return status;
  throw releaseMainlineError(
    'RELEASE_MAIN_MERGE_PENDING',
    `已发布提交 ${shortCommit(status.sourceCommit)} 尚未以保留提交血缘的方式合并并推送到 ${formatMainline(status)}@${shortCommit(status.mainTipCommit)}；请完成 merge/push 后重试 release end（squash/rebase 不保留发布提交，不能通过）`,
    status
  );
}

function resolveAuthoritativeMainline(options = {}) {
  assertNoMainlineOverride(options);
  const cwd = path.resolve(options.cwd || process.cwd());
  const remotes = listLines(
    readGit(cwd, ['remote'], { allowFailure: true }).stdout
  );
  const remoteName =
    (remotes.includes('origin')
      ? 'origin'
      : remotes.length === 1
        ? remotes[0]
        : null);

  if (remoteName) {
    return resolveRemoteMainline({ cwd, remoteName });
  }
  if (remotes.length > 1) {
    throw releaseMainlineError(
      'RELEASE_GIT_REMOTE_UNRESOLVED',
      `存在多个 Git remote（${remotes.join(', ')}）且没有 origin；请把权威远端规范为 origin 后重试`
    );
  }
  throw releaseMainlineError(
    'RELEASE_GIT_REMOTE_REQUIRED',
    '正式发布必须配置可在线验证的权威 Git remote（默认使用 origin）；仅有本地 main/master 不能证明已推送主分支'
  );
}

function resolveRemoteMainline({ cwd, remoteName }) {
  const remoteUrlHashAliases = readRemoteUrlHashes(cwd, remoteName);
  const remoteUrlHash = remoteUrlHashAliases[0];
  const remoteHead = readGit(
    cwd,
    ['ls-remote', '--symref', remoteName, 'HEAD'],
    { allowFailure: true }
  );
  if (remoteHead.ok) {
    const parsed = parseRemoteHead(remoteHead.stdout);
    if (parsed) {
      assertSafeDefaultBranch(remoteName, parsed.branchName);
      return {
        remoteName,
        remoteUrlHash,
        remoteUrlHashAliases,
        branchName: parsed.branchName,
        tipCommit: parsed.tipCommit,
        source: 'remote-head',
      };
    }
  }

  const candidates = ['main', 'master']
    .map(candidate => ({
      branchName: candidate,
      tipCommit: readRemoteBranchTip(cwd, remoteName, candidate, {
        optional: true,
      }),
    }))
    .filter(candidate => candidate.tipCommit);
  if (candidates.length === 1) {
    return {
      remoteName,
      remoteUrlHash,
      remoteUrlHashAliases,
      ...candidates[0],
      source: 'remote-main-master-fallback',
    };
  }
  if (candidates.length > 1) {
    throw releaseMainlineError(
      'RELEASE_MAIN_BRANCH_AMBIGUOUS',
      `远端 ${remoteName} 同时存在 main 与 master 且无法读取 remote HEAD；请先修复远端默认分支 HEAD`
    );
  }
  if (isGitAuthenticationError(remoteHead.stderr)) {
    throw releaseMainlineError(
      'RELEASE_GIT_AUTH_REQUIRED',
      `无法认证权威远端 ${remoteName}。请先解锁系统钥匙串或配置可用的 Git credential helper，并确认 \`git ls-remote --symref ${remoteName} HEAD\` 可成功执行；发布会在获取平台租约前停止，不会留下远端发布状态`
    );
  }
  const detail = remoteHead.stderr
    ? `: ${sanitizeGitError(remoteHead.stderr)}`
    : '';
  throw releaseMainlineError(
    'RELEASE_MAIN_BRANCH_UNRESOLVED',
    `无法解析远端 ${remoteName} 的权威主分支${detail}`
  );
}

function isGitAuthenticationError(value) {
  return /(?:authentication failed|could not read (?:username|password)|terminal prompts? disabled|credential|keychain|access denied|http basic: access denied|response:\s*(?:401|403)|returned error:\s*(?:401|403))/i.test(
    String(value || '')
  );
}

function readRemoteBranchTip(cwd, remoteName, branchName, options = {}) {
  const result = readGit(
    cwd,
    ['ls-remote', remoteName, `refs/heads/${branchName}`],
    { allowFailure: true }
  );
  if (!result.ok) {
    if (options.optional) return null;
    throw releaseMainlineError(
      'RELEASE_MAIN_REF_UNVERIFIED',
      `无法读取 ${remoteName}/${branchName}: ${sanitizeGitError(result.stderr)}`
    );
  }
  const line = listLines(result.stdout)[0] || '';
  const tipCommit = line.split(/\s+/)[0] || '';
  if (!isObjectId(tipCommit)) {
    if (options.optional) return null;
    throw releaseMainlineError(
      'RELEASE_MAIN_REF_UNVERIFIED',
      `远端主分支不存在: ${remoteName}/${branchName}`
    );
  }
  return tipCommit.toLowerCase();
}

function parseRemoteHead(output) {
  const lines = listLines(output);
  const refLine = lines.find(
    line => line.startsWith('ref: refs/heads/') && /\sHEAD$/.test(line)
  );
  const tipLine = lines.find(line =>
    /^[0-9a-f]{40,64}\s+HEAD$/i.test(line)
  );
  if (!refLine || !tipLine) return null;
  const branchName = refLine
    .replace(/^ref: refs\/heads\//, '')
    .replace(/\s+HEAD$/, '');
  const tipCommit = tipLine.split(/\s+/)[0].toLowerCase();
  if (!branchName || !isObjectId(tipCommit)) return null;
  return { branchName, tipCommit };
}

function ensureCommitAvailable(cwd, commit, remoteName, branchName) {
  const exists = readGit(cwd, ['cat-file', '-e', `${commit}^{commit}`], {
    allowFailure: true,
  });
  if (exists.ok) return;
  if (remoteName) {
    const fetched = readGit(
      cwd,
      [
        'fetch',
        '--quiet',
        '--no-tags',
        remoteName,
        branchName ? `refs/heads/${branchName}` : commit,
      ],
      { allowFailure: true }
    );
    if (
      fetched.ok &&
      readGit(cwd, ['cat-file', '-e', `${commit}^{commit}`], {
        allowFailure: true,
      }).ok
    ) {
      return;
    }
  }
  throw releaseMainlineError(
    'RELEASE_MAIN_REF_UNVERIFIED',
    `本地缺少提交 ${shortCommit(commit)}，无法验证主分支血缘；请 fetch 完整历史后重试`
  );
}

function isGitAncestor(cwd, ancestorCommit, descendantCommit, options = {}) {
  let result = readGit(
    cwd,
    ['merge-base', '--is-ancestor', ancestorCommit, descendantCommit],
    { allowFailure: true }
  );
  if (result.status === 0) return true;
  if (result.status !== 1) {
    throw releaseMainlineError(
      'RELEASE_GIT_HISTORY_UNVERIFIED',
      `无法验证提交血缘: ${sanitizeGitError(result.stderr) || `git merge-base 退出 ${result.status}`}`
    );
  }

  const shallow = readGit(cwd, ['rev-parse', '--is-shallow-repository'], {
    allowFailure: true,
  }).stdout === 'true';
  if (!shallow) return false;
  if (options.remoteName && options.branchName) {
    readGit(
      cwd,
      [
        'fetch',
        '--quiet',
        '--no-tags',
        '--deepen=1000',
        options.remoteName,
        `refs/heads/${options.branchName}`,
      ],
      { allowFailure: true }
    );
    result = readGit(
      cwd,
      ['merge-base', '--is-ancestor', ancestorCommit, descendantCommit],
      { allowFailure: true }
    );
    if (result.status === 0) return true;
    if (result.status !== 1) {
      throw releaseMainlineError(
        'RELEASE_GIT_HISTORY_UNVERIFIED',
        `加深历史后仍无法验证提交血缘: ${sanitizeGitError(result.stderr) || `git merge-base 退出 ${result.status}`}`
      );
    }
  }
  throw releaseMainlineError(
    'RELEASE_GIT_HISTORY_UNVERIFIED',
    '当前为浅克隆且历史不足，无法可靠判断发布提交与主分支血缘；请 fetch 完整历史后重试'
  );
}

function readCurrentBranch(cwd) {
  return readGit(cwd, ['branch', '--show-current'], {
    allowFailure: true,
  }).stdout;
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
    throw releaseMainlineError(
      'RELEASE_GIT_COMMAND_FAILED',
      `Git 校验失败: git ${args.join(' ')}${stderr ? `: ${sanitizeGitError(stderr)}` : ''}`
    );
  }
  return { ok, stdout, stderr, status: result.status, error: result.error };
}

function normalizeSourceRevision(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw releaseMainlineError(
      'RELEASE_SOURCE_LINEAGE_REQUIRED',
      '发布会话缺少冻结的 releaseSourceRevision；禁止无主线证据结束，请先人工核对线上状态'
    );
  }
  const repo = String(value.repo || value.repositoryId || '').trim();
  const baseCommit = String(value.baseCommit || value.commit || '')
    .trim()
    .toLowerCase();
  const treeHash = String(value.treeHash || '').trim().toLowerCase();
  const remoteName = normalizeOptionalName(value.remoteName, 'remote');
  const mainBranch = String(value.mainBranch || '').trim();
  const remoteUrlHash = String(value.remoteUrlHash || '').trim().toLowerCase();
  const remoteUrlHashAliases = Array.from(
    new Set(
      [
        remoteUrlHash,
        ...(Array.isArray(value.remoteUrlHashAliases)
          ? value.remoteUrlHashAliases
          : []),
      ]
        .map(item => String(item || '').trim().toLowerCase())
        .filter(item => /^sha256:[0-9a-f]{64}$/.test(item))
    )
  );
  const repoAliases = Array.from(
    new Set(
      [repo, ...(Array.isArray(value.repoAliases) ? value.repoAliases : [])]
        .map(item => String(item || '').trim().toLowerCase())
        .filter(item => /^sha256:[0-9a-f]{64}$/.test(item))
    )
  );
  if (
    !/^sha256:[0-9a-f]{64}$/i.test(repo) ||
    !isObjectId(baseCommit) ||
    !isObjectId(treeHash) ||
    !remoteName ||
    !['main', 'master'].includes(mainBranch) ||
    !/^sha256:[0-9a-f]{64}$/.test(remoteUrlHash)
  ) {
    throw releaseMainlineError(
      'RELEASE_SOURCE_LINEAGE_REQUIRED',
      'releaseSourceRevision 缺少有效的 repo/baseCommit/treeHash/remoteName/remoteUrlHash/mainBranch'
    );
  }
  return {
    ...value,
    repo,
    repositoryId: repo,
    repoAliases,
    baseCommit,
    treeHash,
    remoteName,
    remoteUrlHash,
    remoteUrlHashAliases,
    mainBranch,
  };
}

function readRemoteUrlHashes(cwd, remoteName) {
  const result = readGit(cwd, ['remote', 'get-url', remoteName]);
  if (!result.stdout) {
    throw releaseMainlineError(
      'RELEASE_GIT_REMOTE_UNRESOLVED',
      `无法读取权威远端地址: ${remoteName}`
    );
  }
  return remoteUrlHashes(result.stdout);
}

function assertSafeDefaultBranch(remoteName, branchName) {
  if (['main', 'master'].includes(branchName)) return;
  throw releaseMainlineError(
    'RELEASE_MAIN_BRANCH_UNSAFE',
    `远端 ${remoteName} 的默认分支为 ${branchName}，不是受支持的 main/master；请先修复远端默认分支，不能用 feature branch 代替主线`
  );
}

function assertNoMainlineOverride(options = {}) {
  if (
    options.remoteName ||
    options.branchName ||
    options.mainlineRemote ||
    options.mainlineBranch
  ) {
    throw releaseMainlineError(
      'RELEASE_MAINLINE_OVERRIDE_FORBIDDEN',
      '权威主线只能来自 Git remote 的实时默认分支；禁止通过参数或环境变量改写'
    );
  }
}

function normalizeOptionalName(value, label) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(text)) {
    throw releaseMainlineError(
      'RELEASE_GIT_REF_INVALID',
      `非法 ${label}: ${text}`
    );
  }
  return text;
}

function releaseMainlineError(code, message, details) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function sanitizeGitError(value) {
  return String(value || '')
    .replace(/https?:\/\/[^\s/@]+@/gi, 'https://***@')
    .replace(/\s+/g, ' ')
    .slice(0, 500);
}

function summarizePaths(paths, limit = 8) {
  const selected = paths.slice(0, limit).join(', ');
  return paths.length > limit
    ? `${selected}（另有 ${paths.length - limit} 项）`
    : selected;
}

function shortCommit(value) {
  return String(value || '').slice(0, 12) || '-';
}

function formatMainline(value) {
  return value.remoteName
    ? `${value.remoteName}/${value.branchName || value.mainBranch}`
    : value.branchName || value.mainBranch;
}

function listLines(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function isObjectId(value) {
  return /^[0-9a-f]{40,64}$/i.test(String(value || ''));
}

module.exports = {
  assertReleaseSourceIntegrated,
  assertReleaseSourceRevisionStable,
  inspectReleaseSourceIntegration,
  isGitAuthenticationError,
  prepareReleaseSourceRevision,
  resolveAuthoritativeMainline,
};
