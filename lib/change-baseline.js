const { spawnSync } = require('child_process');
const {
  legacyRemoteIdentity,
  remoteRepositoryHashes,
} = require('./git-remote-identity');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { saveProjectState } = require('./config');
const { runWorkspaceJsCodeBuildBatch } = require('./js-code-build');
const { version: OPENXIANGDA_VERSION } = require('../package.json');

const SOURCE_KIND_BY_RESOURCE_KIND = Object.freeze({
  Function: 'functions',
  Automation: 'automations',
});

function getStoredChangeBaseline(target, options = {}) {
  const baseline = target?.bound?.promotion?.changeBaseline;
  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) return null;
  assertStoredChangeBaseline(target, baseline, options);
  return baseline;
}

function saveChangeBaseline(target, input, options = {}) {
  const identity = assertTargetIdentity(target);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw changeBaselineError(
      'CHANGE_BASELINE_INVALID',
      'change baseline 必须是对象'
    );
  }

  const existing = target.bound?.promotion?.changeBaseline;
  if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
    assertStoredChangeBaseline(target, existing, options);
  }
  assertInputIdentity(input, identity);

  const env = options.env || process.env;
  const currentThreadId = currentCodexThreadId(env);
  const inputOwnerThreadId = getChangeBaselineOwnerThreadId(input);
  if (inputOwnerThreadId && inputOwnerThreadId !== currentThreadId) {
    throw ownershipError(inputOwnerThreadId, currentThreadId);
  }

  const merged = {
    ...(existing ? cloneJson(existing) : {}),
    ...cloneJson(input),
  };
  const workspace = {
    ...(existing?.workspace && typeof existing.workspace === 'object'
      ? cloneJson(existing.workspace)
      : {}),
    ...(input.workspace && typeof input.workspace === 'object'
      ? cloneJson(input.workspace)
      : {}),
  };
  const ownerThreadId = currentThreadId || inputOwnerThreadId;
  if (ownerThreadId) workspace.threadId = ownerThreadId;
  else delete workspace.threadId;

  const baseline = {
    ...merged,
    appType: identity.appType,
    profile: identity.profile,
    resourceHeads: clonePreservedField(input, existing, 'resourceHeads', {}),
    sourceBase: clonePreservedField(input, existing, 'sourceBase', null),
    clientSessionId: normalizeOptionalString(
      preservedField(input, existing, 'clientSessionId', null)
    ),
    localBaseArtifactHashes: clonePreservedField(
      input,
      existing,
      'localBaseArtifactHashes',
      {}
    ),
    workspace,
    updatedAt: normalizeNow(options.now),
  };

  target.bound.promotion = {
    ...(target.bound.promotion || {}),
    changeBaseline: baseline,
  };
  persistTargetState(target, options);
  return baseline;
}

function clearChangeBaseline(target, baselineIdOrOptions, maybeOptions = {}) {
  const hasOptionsAsSecondArgument =
    baselineIdOrOptions &&
    typeof baselineIdOrOptions === 'object' &&
    !Array.isArray(baselineIdOrOptions);
  const options = hasOptionsAsSecondArgument
    ? baselineIdOrOptions
    : maybeOptions;
  const baselineId = hasOptionsAsSecondArgument
    ? null
    : normalizeOptionalString(baselineIdOrOptions);

  const baseline = target?.bound?.promotion?.changeBaseline;
  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) return false;
  assertStoredChangeBaseline(target, baseline, options);

  const storedId = normalizeOptionalString(baseline.baselineId || baseline.id);
  if (baselineId && storedId !== baselineId) return false;

  target.bound.promotion = { ...(target.bound.promotion || {}) };
  delete target.bound.promotion.changeBaseline;
  if (Object.keys(target.bound.promotion).length === 0) {
    delete target.bound.promotion;
  }
  persistTargetState(target, options);
  return true;
}

function clearChangeBaselineForReconciliation(target, expected = {}, options = {}) {
  const baseline = target?.bound?.promotion?.changeBaseline;
  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) return false;
  assertStoredChangeBaseline(target, baseline, {
    ...options,
    access: 'reconciliation-read',
  });

  const expectedBaselineId = normalizeOptionalString(expected.baselineId || expected.id);
  const expectedChangeId = normalizeOptionalString(expected.changeId);
  const expectedClientSessionId = normalizeOptionalString(expected.clientSessionId);
  const expectedSourceCommit = normalizeOptionalString(
    expected.releaseSourceRevision?.baseCommit || expected.sourceCommit
  );
  const hasExpectedLeaseId = Object.prototype.hasOwnProperty.call(
    expected,
    'leaseId'
  );
  const expectedLeaseId = normalizeOptionalString(expected.leaseId);
  if (
    !expectedBaselineId ||
    !expectedChangeId ||
    !expectedClientSessionId ||
    !expectedSourceCommit ||
    !hasExpectedLeaseId
  ) {
    throw changeBaselineError(
      'CHANGE_BASELINE_RECONCILIATION_INVALID',
      'reconciliation 清理必须提供精确 baselineId/changeId/clientSessionId/sourceCommit/leaseId（无 lease 时显式传 null）'
    );
  }

  if (
    normalizeOptionalString(baseline.baselineId || baseline.id) !== expectedBaselineId ||
    normalizeOptionalString(baseline.changeId) !== expectedChangeId ||
    normalizeOptionalString(baseline.clientSessionId) !== expectedClientSessionId ||
    normalizeOptionalString(baseline.releaseSourceRevision?.baseCommit) !== expectedSourceCommit
  ) {
    return false;
  }

  const lease = target?.bound?.promotion?.publishLease;
  if (expectedLeaseId) {
    if (
      !lease ||
      normalizeOptionalString(lease.leaseId) !== expectedLeaseId ||
      normalizeOptionalString(lease.changeId) !== expectedChangeId ||
      normalizeOptionalString(lease.clientSessionId) !== expectedClientSessionId ||
      normalizeOptionalString(lease.workspace?.commit) !== expectedSourceCommit
    ) {
      return false;
    }
  } else if (lease) {
    return false;
  }

  // Validate both pieces of release evidence before mutating either one, then
  // persist once so a failed baseline CAS can never leave a lease-only partial
  // cleanup behind.
  target.bound.promotion = { ...(target.bound.promotion || {}) };
  delete target.bound.promotion.publishLease;
  delete target.bound.promotion.changeBaseline;
  if (Object.keys(target.bound.promotion).length === 0) {
    delete target.bound.promotion;
  }
  persistTargetState(target, options);
  return true;
}

function isChangeBaselineOwnedByCurrentSession(baseline, env = process.env) {
  const ownerThreadId = getChangeBaselineOwnerThreadId(baseline);
  if (!ownerThreadId) return true;
  const threadId = currentCodexThreadId(env);
  return Boolean(threadId) && ownerThreadId === threadId;
}

function readGitSourceBase(cwd = process.cwd(), baseRef = 'HEAD') {
  const repository = resolveGitRepository(cwd);
  const normalizedBaseRef = normalizeBaseRef(baseRef);
  const baseCommit = resolveExactCommit(repository.root, normalizedBaseRef);
  const treeHash = runGit(repository.root, [
    'rev-parse',
    '--verify',
    `${baseCommit}^{tree}`,
  ]).trim();
  assertGitObjectId(treeHash, 'treeHash');

  let remote = tryRunGit(repository.root, [
    'config',
    '--get',
    'remote.origin.url',
  ]).trim();
  if (!remote) {
    const remotes = tryRunGit(repository.root, ['remote'])
      .split(/\r?\n/)
      .map(item => item.trim())
      .filter(Boolean);
    if (remotes.length === 1) {
      remote = tryRunGit(repository.root, [
        'config',
        '--get',
        `remote.${remotes[0]}.url`,
      ]).trim();
    }
  }
  const commonGitDirValue = tryRunGit(repository.root, [
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir',
  ]).trim() || tryRunGit(repository.root, [
    'rev-parse',
    '--git-common-dir',
  ]).trim();
  const commonGitDir = commonGitDirValue
    ? fs.realpathSync(
        path.isAbsolute(commonGitDirValue)
          ? commonGitDirValue
          : path.resolve(repository.root, commonGitDirValue)
      )
    : repository.root;
  const repositoryIds = remote
    ? remoteRepositoryHashes(remote)
    : [];
  const identitySeed = remote
    ? `remote:${legacyRemoteIdentity(remote)}`
    : `local:${commonGitDir}`;
  const repositoryId = `sha256:${sha256Buffer(Buffer.from(identitySeed, 'utf8'))}`;

  return {
    repo: repositoryId,
    repositoryId,
    repoAliases: Array.from(new Set([repositoryId, ...repositoryIds])),
    baseCommit,
    treeHash,
  };
}

function buildGitBaseSourceArtifacts({
  cwd = process.cwd(),
  baseCommit,
  targets,
  env = process.env,
  packageManager = 'pnpm',
} = {}) {
  const normalizedTargets = normalizeArtifactTargets(targets);
  const cacheFile =
    env?.FAKE_BATCH_FAIL || env?.OPENXIANGDA_DISABLE_ARTIFACT_CACHE === '1'
      ? null
      : resolveGitArtifactCacheFile({
          cwd,
          baseCommit,
          targets: normalizedTargets,
          packageManager,
        });
  const cached = cacheFile
    ? readGitArtifactCache(cacheFile, baseCommit, normalizedTargets)
    : null;
  if (cached) return { ...cached, cacheHit: true };
  const built = withGitBaseWorkspace({ cwd, baseCommit, env }, context => {
    const {
      buildRoot,
      buildEnv,
      resolvedCommit,
    } = context;
    prepareExactArtifactBuild(buildRoot, normalizedTargets);
    const specs = normalizedTargets
      .map(target => `${target.sourceKind}:${target.code}`)
      .join(',');
    const batchProcess = runWorkspaceJsCodeBuildBatch(
      buildRoot,
      normalizedTargets.map(target => ({
        sourceKind: target.sourceKind,
        scriptCode: target.code,
      })),
      {
        packageManager,
        spawnOptions: {
          env: buildEnv,
          maxBuffer: 16 * 1024 * 1024,
        },
      }
    );
    const batch = normalizeBuildProcessResult(batchProcess, [
      packageManager,
      'build-js-code',
      '--scripts',
      specs,
    ]);

    let buildMode =
      batchProcess.openxiangdaBuildMode === 'canonical-scoped'
        ? 'canonical-scoped'
        : 'batch';
    if (!batch.ok) {
      if (batchProcess.openxiangdaBuildMode === 'canonical-scoped') {
        throw buildFailureError(normalizedTargets[0], batch);
      }
      buildMode = 'legacy-fallback';
      for (const target of normalizedTargets) {
        const legacy = runBuildCommand(
          packageManager,
          [
            'build-js-code',
            '--script',
            target.code,
            '--source',
            target.sourceKind,
          ],
          buildRoot,
          buildEnv
        );
        if (!legacy.ok) {
          throw buildFailureError(target, batch, legacy);
        }
      }
    }

    const artifacts = {};
    const localBaseArtifactHashes = {};
    for (const target of normalizedTargets) {
      const relativePath = path.posix.join(
        'dist',
        target.sourceKind,
        target.code,
        'index.cjs'
      );
      const artifactPath = path.resolve(buildRoot, ...relativePath.split('/'));
      assertArtifactFileSafe(buildRoot, artifactPath, target);
      const artifactHash = sha256File(artifactPath);
      const sourceHash = readBuiltSourceHash(
        buildRoot,
        target.sourceKind,
        target.code
      );
      const key = `${target.kind}:${target.code}`;
      artifacts[key] = {
        kind: target.kind,
        code: target.code,
        sourceKind: target.sourceKind,
        relativePath,
        artifactHash,
        sha256: artifactHash,
        ...(sourceHash ? { sourceHash } : {}),
      };
      localBaseArtifactHashes[key] = artifactHash;
    }

    return {
      baseCommit: resolvedCommit,
      buildMode,
      artifacts,
      localBaseArtifactHashes,
    };
  });
  if (cacheFile) writeGitArtifactCache(cacheFile, built);
  return { ...built, cacheHit: false };
}

function resolveGitArtifactCacheFile({
  cwd,
  baseCommit,
  targets,
  packageManager,
}) {
  const commit = String(baseCommit || '').trim().toLowerCase();
  if (!/^[0-9a-f]{40,64}$/.test(commit)) return null;
  const repository = resolveGitRepository(cwd);
  const commonDirValue =
    tryRunGit(repository.root, [
      'rev-parse',
      '--path-format=absolute',
      '--git-common-dir',
    ]).trim() ||
    tryRunGit(repository.root, ['rev-parse', '--git-common-dir']).trim();
  if (!commonDirValue) return null;
  const commonDir = path.resolve(repository.root, commonDirValue);
  const key = canonicalJsonSha256({
    schemaVersion: 'git_base_artifacts_v2',
    openxiangdaVersion: OPENXIANGDA_VERSION,
    baseCommit: commit,
    packageManager,
    targets,
  });
  return path.join(
    commonDir,
    'openxiangda-cache',
    'git-base-artifacts-v2',
    `${key}.json`
  );
}

function readGitArtifactCache(file, baseCommit, targets) {
  if (!fs.existsSync(file)) return null;
  let value;
  try {
    value = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  if (
    value?.schemaVersion !== 'git_base_artifacts_v2' ||
    value?.openxiangdaVersion !== OPENXIANGDA_VERSION ||
    value?.result?.baseCommit !== String(baseCommit).toLowerCase()
  ) {
    return null;
  }
  const expectedKeys = targets
    .map(target => `${target.kind}:${target.code}`)
    .sort();
  const artifactKeys = Object.keys(value.result.artifacts || {}).sort();
  if (
    expectedKeys.length !== artifactKeys.length ||
    expectedKeys.some((key, index) => key !== artifactKeys[index])
  ) {
    return null;
  }
  if (
    artifactKeys.some(
      key =>
        !/^[a-f0-9]{64}$/.test(
          String(value.result.artifacts[key]?.artifactHash || '')
        )
    )
  ) {
    return null;
  }
  return cloneJson(value.result);
}

function writeGitArtifactCache(file, result) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(
    tempFile,
    `${JSON.stringify(
      {
        schemaVersion: 'git_base_artifacts_v2',
        openxiangdaVersion: OPENXIANGDA_VERSION,
        createdAt: new Date().toISOString(),
        result,
      },
      null,
      2
    )}\n`,
    { mode: 0o600 }
  );
  fs.renameSync(tempFile, file);
}

function readBuiltSourceHash(buildRoot, sourceKind, code) {
  const key = `${sourceKind}/${code}`;
  for (const filename of [
    'build-cache.json',
    'build-cache.cli-v4.json',
    'build-cache.cli-v3.json',
  ]) {
    try {
      const cache = JSON.parse(
        fs.readFileSync(
          path.join(buildRoot, '.openxiangda', filename),
          'utf8'
        )
      );
      const sourceHash = String(
        cache?.targets?.[key]?.sourceHash || ''
      ).toLowerCase();
      if (/^[a-f0-9]{64}$/.test(sourceHash)) return sourceHash;
    } catch {
      // Custom builders are allowed to omit the optional lineage cache.
    }
  }
  return null;
}

function withGitBaseWorkspace(
  {
    cwd = process.cwd(),
    baseCommit,
    env = process.env,
    copyProjectState = false,
  } = {},
  callback
) {
  if (typeof callback !== 'function') {
    throw changeBaselineError(
      'CHANGE_BASELINE_CALLBACK_REQUIRED',
      'Git 基线工作区必须提供同步 callback'
    );
  }
  const workspace = createGitBaseWorkspace({
    cwd,
    baseCommit,
    env,
    copyProjectState,
  });
  let callbackError = null;
  try {
    return callback(workspace);
  } catch (error) {
    callbackError = error;
    throw error;
  } finally {
    try {
      assertCopiedProjectStateUnchanged(workspace);
    } catch (stateError) {
      if (!callbackError) throw stateError;
    } finally {
      fs.rmSync(workspace.tempRoot, { recursive: true, force: true });
    }
  }
}

function createGitBaseWorkspace({
  cwd,
  baseCommit,
  env,
  copyProjectState,
}) {
  const repository = resolveGitRepository(cwd);
  const immutableCommit = normalizeImmutableCommit(baseCommit);
  const resolvedCommit = resolveExactCommit(repository.root, immutableCommit);
  if (resolvedCommit.toLowerCase() !== immutableCommit.toLowerCase()) {
    throw changeBaselineError(
      'CHANGE_BASELINE_COMMIT_NOT_EXACT',
      `baseCommit 必须是完整且不可变的 commit id: ${baseCommit}`
    );
  }

  const currentWorkspaceRoot = fs.realpathSync(path.resolve(cwd));
  const workspaceRelative = path.relative(repository.root, currentWorkspaceRoot);
  if (isOutsidePath(workspaceRelative)) {
    throw changeBaselineError(
      'CHANGE_BASELINE_WORKSPACE_OUTSIDE_REPOSITORY',
      'cwd 必须位于 Git 仓库内'
    );
  }

  const currentNodeModules = path.join(currentWorkspaceRoot, 'node_modules');
  let currentNodeModulesRealPath;
  try {
    currentNodeModulesRealPath = fs.realpathSync(currentNodeModules);
  } catch {
    throw changeBaselineError(
      'CHANGE_BASELINE_NODE_MODULES_MISSING',
      '构建 Git 基线前必须先在当前工作区安装 node_modules'
    );
  }
  if (!fs.statSync(currentNodeModulesRealPath).isDirectory()) {
    throw changeBaselineError(
      'CHANGE_BASELINE_NODE_MODULES_INVALID',
      '当前工作区 node_modules 不是目录'
    );
  }

  const tempRoot = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'openxiangda-change-baseline-'))
  );
  const archivePath = path.join(tempRoot, 'source.tar');
  const extractRoot = path.join(tempRoot, 'source');

  try {
    fs.mkdirSync(extractRoot, { recursive: true });
    validateGitTreeForSafeArchive(repository.root, resolvedCommit);
    runGit(repository.root, [
      'archive',
      '--format=tar',
      `--output=${archivePath}`,
      resolvedCommit,
    ]);
    validateTarEntryNames(archivePath);
    runCommand('tar', ['-xf', archivePath, '-C', extractRoot], {
      code: 'CHANGE_BASELINE_ARCHIVE_EXTRACT_FAILED',
      message: '无法安全解包 Git 基线归档',
    });
    assertExtractedTreeSafe(extractRoot);

    const buildRoot = path.resolve(extractRoot, workspaceRelative || '.');
    if (!isPathInside(extractRoot, buildRoot) || !isDirectory(buildRoot)) {
      throw changeBaselineError(
        'CHANGE_BASELINE_WORKSPACE_NOT_IN_COMMIT',
        'baseCommit 中不存在当前工作区目录'
      );
    }
    if (!fs.existsSync(path.join(buildRoot, 'package.json'))) {
      throw changeBaselineError(
        'CHANGE_BASELINE_PACKAGE_MISSING',
        'baseCommit 工作区缺少 package.json，不能执行基线校验'
      );
    }

    const archivedNodeModules = path.join(buildRoot, 'node_modules');
    if (fs.existsSync(archivedNodeModules)) {
      throw changeBaselineError(
        'CHANGE_BASELINE_ARCHIVE_NODE_MODULES_CONFLICT',
        'baseCommit 不应包含 node_modules'
      );
    }
    fs.symlinkSync(
      currentNodeModulesRealPath,
      archivedNodeModules,
      process.platform === 'win32' ? 'junction' : 'dir'
    );

    const stateSnapshot = copyProjectState
      ? copyReadonlyProjectState(currentWorkspaceRoot, buildRoot)
      : null;
    return {
      tempRoot,
      extractRoot,
      buildRoot,
      currentWorkspaceRoot,
      repositoryRoot: repository.root,
      resolvedCommit,
      stateSnapshot,
      buildEnv: buildIsolatedEnvironment(env, {
        currentWorkspaceRoot,
        buildRoot,
        repositoryRoot: repository.root,
        extractRoot,
      }),
    };
  } catch (error) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

function copyReadonlyProjectState(currentWorkspaceRoot, buildRoot) {
  const sourcePath = path.join(
    currentWorkspaceRoot,
    '.openxiangda',
    'state.json'
  );
  if (!fs.existsSync(sourcePath)) {
    throw changeBaselineError(
      'CHANGE_BASELINE_PROJECT_STATE_MISSING',
      '当前工作区缺少 .openxiangda/state.json，不能在 Git 基线中解析应用绑定'
    );
  }
  const destinationDir = path.join(buildRoot, '.openxiangda');
  const destinationPath = path.join(destinationDir, 'state.json');
  fs.mkdirSync(destinationDir, { recursive: true });
  const content = fs.readFileSync(sourcePath);
  fs.writeFileSync(destinationPath, content, { mode: 0o444 });
  try {
    fs.chmodSync(destinationPath, 0o444);
  } catch {
    // chmod is best-effort on non-POSIX filesystems; the before/after hash below
    // still proves that the read-only child plan did not mutate project state.
  }
  return {
    path: destinationPath,
    sha256: sha256Buffer(content),
  };
}

function assertCopiedProjectStateUnchanged(workspace) {
  const snapshot = workspace?.stateSnapshot;
  if (!snapshot) return;
  let currentHash = null;
  try {
    currentHash = sha256File(snapshot.path);
  } catch {
    // Missing/renamed state is also a mutation.
  }
  if (currentHash !== snapshot.sha256) {
    throw changeBaselineError(
      'CHANGE_BASELINE_PROJECT_STATE_MUTATED',
      'Git 基线 resource plan 修改了只读 .openxiangda/state.json，已中止发布'
    );
  }
}

function canonicalJsonSha256(value) {
  const canonical = canonicalizeJson(value, new Set(), '$');
  return sha256Buffer(Buffer.from(JSON.stringify(canonical), 'utf8'));
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function canonicalizeJson(value, ancestors, pathLabel) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw changeBaselineError(
        'CHANGE_BASELINE_CANONICAL_JSON_INVALID',
        `${pathLabel} 包含非有限数字`
      );
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) return throwCircularJson(pathLabel);
    ancestors.add(value);
    const result = value.map((item, index) =>
      canonicalizeJson(item, ancestors, `${pathLabel}[${index}]`)
    );
    ancestors.delete(value);
    return result;
  }
  if (value && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw changeBaselineError(
        'CHANGE_BASELINE_CANONICAL_JSON_INVALID',
        `${pathLabel} 不是普通 JSON 对象`
      );
    }
    if (ancestors.has(value)) return throwCircularJson(pathLabel);
    ancestors.add(value);
    const result = {};
    for (const key of Object.keys(value).sort()) {
      const item = value[key];
      if (
        item === undefined ||
        typeof item === 'function' ||
        typeof item === 'symbol' ||
        typeof item === 'bigint'
      ) {
        throw changeBaselineError(
          'CHANGE_BASELINE_CANONICAL_JSON_INVALID',
          `${pathLabel}.${key} 不是有效 JSON 值`
        );
      }
      result[key] = canonicalizeJson(item, ancestors, `${pathLabel}.${key}`);
    }
    ancestors.delete(value);
    return result;
  }
  throw changeBaselineError(
    'CHANGE_BASELINE_CANONICAL_JSON_INVALID',
    `${pathLabel} 不是有效 JSON 值`
  );
}

function throwCircularJson(pathLabel) {
  throw changeBaselineError(
    'CHANGE_BASELINE_CANONICAL_JSON_INVALID',
    `${pathLabel} 包含循环引用`
  );
}

function assertStoredChangeBaseline(target, baseline, options = {}) {
  const identity = assertTargetIdentity(target);
  const baselineAppType = normalizeOptionalString(baseline.appType);
  const baselineProfile = normalizeOptionalString(baseline.profile);
  if (baselineAppType !== identity.appType) {
    throw changeBaselineError(
      'CHANGE_BASELINE_APP_MISMATCH',
      `change baseline 属于应用 ${baselineAppType || '<missing>'}，不能用于 ${identity.appType}`
    );
  }
  if (baselineProfile !== identity.profile) {
    throw changeBaselineError(
      'CHANGE_BASELINE_PROFILE_MISMATCH',
      `change baseline 属于 profile ${baselineProfile || '<missing>'}，不能用于 ${identity.profile}`
    );
  }
  if (
    options.access !== 'reconciliation-read' &&
    !isChangeBaselineOwnedByCurrentSession(baseline, options.env || process.env)
  ) {
    throw ownershipError(
      getChangeBaselineOwnerThreadId(baseline),
      currentCodexThreadId(options.env || process.env)
    );
  }
}

function assertTargetIdentity(target) {
  if (!target?.state || !target?.bound || !target?.profileName) {
    throw changeBaselineError(
      'CHANGE_BASELINE_TARGET_INVALID',
      'change baseline target 缺少 state、bound 或 profileName'
    );
  }
  const profile = String(target.profileName).trim();
  const appType = String(target.appType || target.bound.appType || '').trim();
  if (!profile || !appType) {
    throw changeBaselineError(
      'CHANGE_BASELINE_TARGET_INVALID',
      'change baseline target 缺少 appType 或 profileName'
    );
  }
  const boundAppType = normalizeOptionalString(target.bound.appType);
  const managedStateBound = resolveManagedStateBinding(target, appType);
  const stateBound = managedStateBound || target.state.profiles?.[profile];
  const stateAppType = normalizeOptionalString(stateBound?.appType);
  if (
    (boundAppType && boundAppType !== appType) ||
    (stateAppType && stateAppType !== appType)
  ) {
    throw changeBaselineError(
      'CHANGE_BASELINE_TARGET_INVALID',
      'change baseline target 的 appType 与 profile binding 不一致'
    );
  }
  return { appType, profile };
}

function resolveManagedStateBinding(target, appType) {
  const targetName = normalizeOptionalString(target?.targetName);
  if (!targetName) return null;
  const binding = target.state?.targets?.[targetName];
  const bindingAppType = normalizeOptionalString(binding?.appType);
  const environmentId = normalizeOptionalString(target.environmentId);
  const bindingEnvironmentId = normalizeOptionalString(binding?.environmentId);
  if (
    !binding ||
    bindingAppType !== appType ||
    (environmentId && bindingEnvironmentId !== environmentId)
  ) {
    throw changeBaselineError(
      'CHANGE_BASELINE_TARGET_INVALID',
      `change baseline managed target ${targetName} 与 state.targets binding 不一致`
    );
  }
  return binding;
}

function assertInputIdentity(input, identity) {
  const appType = normalizeOptionalString(input.appType);
  const profile = normalizeOptionalString(input.profile);
  if (appType && appType !== identity.appType) {
    throw changeBaselineError(
      'CHANGE_BASELINE_APP_MISMATCH',
      `不能把应用 ${appType} 的 baseline 保存到 ${identity.appType}`
    );
  }
  if (profile && profile !== identity.profile) {
    throw changeBaselineError(
      'CHANGE_BASELINE_PROFILE_MISMATCH',
      `不能把 profile ${profile} 的 baseline 保存到 ${identity.profile}`
    );
  }
}

function persistTargetState(target, options) {
  target.bound.updatedAt = normalizeNow(options.now);
  const targetName = normalizeOptionalString(target.targetName);
  if (targetName) {
    target.state.targets ||= {};
    target.state.targets[targetName] = target.bound;
  } else if (target.state.profiles?.[target.profileName]) {
    target.state.profiles[target.profileName] = target.bound;
  }
  (options.saveState || saveProjectState)(
    target.state,
    options.cwd || target.cwd || process.cwd()
  );
}

function normalizeArtifactTargets(targets) {
  if (!Array.isArray(targets) || targets.length === 0) {
    throw changeBaselineError(
      'CHANGE_BASELINE_TARGETS_REQUIRED',
      'Git 基线构建至少需要一个精确 Function/Automation target'
    );
  }
  const normalized = [];
  const seen = new Set();
  for (const target of targets) {
    const kind = String(target?.kind || '').trim();
    const code = String(target?.code || '').trim();
    const expectedSourceKind = SOURCE_KIND_BY_RESOURCE_KIND[kind];
    if (!expectedSourceKind) {
      throw changeBaselineError(
        'CHANGE_BASELINE_TARGET_INVALID',
        `不支持的 Git 基线资源类型: ${kind || '<empty>'}`
      );
    }
    if (!isSafeCode(code)) {
      throw changeBaselineError(
        'CHANGE_BASELINE_TARGET_INVALID',
        `无效的 Git 基线资源 code: ${code || '<empty>'}`
      );
    }
    const sourceKind = String(target.sourceKind || expectedSourceKind).trim();
    if (sourceKind !== expectedSourceKind) {
      throw changeBaselineError(
        'CHANGE_BASELINE_TARGET_INVALID',
        `${kind}:${code} 的 sourceKind 必须是 ${expectedSourceKind}`
      );
    }
    const key = `${kind}:${code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ kind, code, sourceKind });
  }
  return normalized;
}

function prepareExactArtifactBuild(buildRoot, targets) {
  for (const target of targets) {
    const outputDir = path.join(buildRoot, 'dist', target.sourceKind, target.code);
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  fs.rmSync(path.join(buildRoot, '.openxiangda', 'build-cache.json'), {
    force: true,
  });
  fs.rmSync(path.join(buildRoot, '.openxiangda', 'build-cache.json.lock'), {
    force: true,
  });
}

function runBuildCommand(packageManager, args, cwd, env) {
  const result = spawnSync(packageManager, args, {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    error: result.error || null,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    command: [packageManager, ...args],
  };
}

function normalizeBuildProcessResult(result, fallbackCommand) {
  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    error: result.error || null,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    command:
      Array.isArray(result.spawnargs) && result.spawnargs.length > 0
        ? result.spawnargs
        : fallbackCommand,
  };
}

function buildIsolatedEnvironment(
  env,
  { currentWorkspaceRoot, buildRoot, repositoryRoot, extractRoot }
) {
  const replacements = [
    [currentWorkspaceRoot, buildRoot],
    [repositoryRoot, extractRoot],
  ].sort((left, right) => right[0].length - left[0].length);
  const isolated = {};
  for (const [key, rawValue] of Object.entries(env || {})) {
    if (rawValue === undefined || rawValue === null) continue;
    let value = String(rawValue);
    for (const [currentPath, archivedPath] of replacements) {
      value = value.split(currentPath).join(archivedPath);
    }
    isolated[key] = value;
  }
  return {
    ...isolated,
    // Git-base builds are always non-interactive. Force CI even when the
    // parent shell explicitly carries CI=false so pnpm never prompts to purge
    // a linked node_modules directory and then aborts because no TTY exists.
    CI: 'true',
    INIT_CWD: buildRoot,
    LOWCODE_WORKSPACE_ROOT: buildRoot,
    OPENXIANGDA_WORKSPACE_ROOT: buildRoot,
    PWD: buildRoot,
    npm_config_local_prefix: buildRoot,
    npm_package_json: path.join(buildRoot, 'package.json'),
  };
}

function buildFailureError(target, batch, legacy) {
  const output = [
    summarizeCommandFailure('batch', batch),
    ...(legacy
      ? [summarizeCommandFailure(`legacy ${target.kind}:${target.code}`, legacy)]
      : []),
  ].join('\n');
  return changeBaselineError(
    'CHANGE_BASELINE_BUILD_FAILED',
    `无法从 Git baseCommit 构建精确源码产物\n${output}`
  );
}

function summarizeCommandFailure(label, result) {
  const detail = [result.error?.message, result.stdout, result.stderr]
    .filter(Boolean)
    .join('\n')
    .trim()
    .slice(-4000);
  return `${label} (${result.command.join(' ')}) status=${result.status ?? 'spawn-error'}${
    detail ? `\n${detail}` : ''
  }`;
}

function assertArtifactFileSafe(buildRoot, artifactPath, target) {
  if (!isPathInside(buildRoot, artifactPath)) {
    throw changeBaselineError(
      'CHANGE_BASELINE_ARTIFACT_UNSAFE',
      `${target.kind}:${target.code} 产物路径越界`
    );
  }
  let stat;
  try {
    stat = fs.lstatSync(artifactPath);
  } catch {
    throw changeBaselineError(
      'CHANGE_BASELINE_ARTIFACT_MISSING',
      `Git baseCommit 构建未生成 ${target.kind}:${target.code} 的 index.cjs`
    );
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw changeBaselineError(
      'CHANGE_BASELINE_ARTIFACT_UNSAFE',
      `${target.kind}:${target.code} 产物必须是普通文件`
    );
  }
  const realPath = fs.realpathSync(artifactPath);
  if (!isPathInside(buildRoot, realPath)) {
    throw changeBaselineError(
      'CHANGE_BASELINE_ARTIFACT_UNSAFE',
      `${target.kind}:${target.code} 产物指向临时 Git 基线之外`
    );
  }
}

function validateGitTreeForSafeArchive(repoRoot, commit) {
  const result = runGitBuffer(repoRoot, [
    'ls-tree',
    '-r',
    '-z',
    '--full-tree',
    commit,
  ]);
  for (const recordBuffer of splitNullBuffer(result)) {
    const record = recordBuffer.toString('utf8');
    const tab = record.indexOf('\t');
    if (tab < 0) {
      throw changeBaselineError(
        'CHANGE_BASELINE_ARCHIVE_UNSAFE',
        'Git tree 包含无法解析的条目'
      );
    }
    const metadata = record.slice(0, tab).split(' ');
    const entryPath = record.slice(tab + 1);
    const mode = metadata[0];
    const type = metadata[1];
    if (type !== 'blob' || mode === '120000') {
      throw changeBaselineError(
        'CHANGE_BASELINE_ARCHIVE_UNSAFE',
        `Git baseCommit 包含不允许归档的 ${type || 'unknown'} 条目`
      );
    }
    assertSafeArchivePath(entryPath);
  }
}

function validateTarEntryNames(archivePath) {
  const result = runCommand('tar', ['-tf', archivePath], {
    code: 'CHANGE_BASELINE_ARCHIVE_LIST_FAILED',
    message: '无法检查 Git 基线归档',
    encoding: 'utf8',
  });
  for (const entry of String(result.stdout || '').split(/\r?\n/).filter(Boolean)) {
    assertSafeArchivePath(entry.replace(/\/$/, ''));
  }
}

function assertSafeArchivePath(value) {
  const entry = String(value || '');
  const normalized = path.posix.normalize(entry);
  const segments = entry.split('/');
  if (
    !entry ||
    entry.includes('\\') ||
    /[\0\r\n]/.test(entry) ||
    path.posix.isAbsolute(entry) ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized !== entry.replace(/\/$/, '') ||
    segments.some(segment => segment === '..' || segment === '.git')
  ) {
    throw changeBaselineError(
      'CHANGE_BASELINE_ARCHIVE_UNSAFE',
      'Git baseCommit 归档包含不安全路径'
    );
  }
}

function assertExtractedTreeSafe(root) {
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      const stat = fs.lstatSync(entryPath);
      if (stat.isSymbolicLink()) {
        throw changeBaselineError(
          'CHANGE_BASELINE_ARCHIVE_UNSAFE',
          'Git baseCommit 归档不能包含符号链接'
        );
      }
      if (!isPathInside(root, fs.realpathSync(entryPath))) {
        throw changeBaselineError(
          'CHANGE_BASELINE_ARCHIVE_UNSAFE',
          'Git baseCommit 解包路径越界'
        );
      }
      if (entry.isDirectory()) visit(entryPath);
    }
  };
  visit(root);
}

function resolveGitRepository(cwd) {
  const resolvedCwd = path.resolve(cwd || process.cwd());
  if (!isDirectory(resolvedCwd)) {
    throw changeBaselineError(
      'CHANGE_BASELINE_GIT_REQUIRED',
      'cwd 不是可用目录'
    );
  }
  const root = runGit(resolvedCwd, ['rev-parse', '--show-toplevel']).trim();
  if (!root) {
    throw changeBaselineError(
      'CHANGE_BASELINE_GIT_REQUIRED',
      '当前工作区不是 Git 仓库'
    );
  }
  return { root: fs.realpathSync(path.resolve(root)) };
}

function resolveExactCommit(repoRoot, ref) {
  const commit = runGit(repoRoot, [
    'rev-parse',
    '--verify',
    `${ref}^{commit}`,
  ]).trim();
  assertGitObjectId(commit, 'baseCommit');
  return commit;
}

function normalizeBaseRef(value) {
  const ref = String(value || 'HEAD').trim();
  if (!ref || ref.startsWith('-') || /[\0\r\n]/.test(ref)) {
    throw changeBaselineError(
      'CHANGE_BASELINE_REF_INVALID',
      'Git baseRef 无效'
    );
  }
  return ref;
}

function normalizeImmutableCommit(value) {
  const commit = String(value || '').trim();
  if (!/^[0-9a-f]{40,64}$/i.test(commit)) {
    throw changeBaselineError(
      'CHANGE_BASELINE_COMMIT_NOT_EXACT',
      'baseCommit 必须是完整的 Git commit id，不能使用 HEAD、branch 或短 hash'
    );
  }
  return commit;
}

function assertGitObjectId(value, label) {
  if (!/^[0-9a-f]{40,64}$/i.test(String(value || ''))) {
    throw changeBaselineError(
      'CHANGE_BASELINE_GIT_OBJECT_INVALID',
      `Git ${label} 无效`
    );
  }
}

function runGit(cwd, args) {
  const result = runCommand('git', ['-C', cwd, ...args], {
    code: 'CHANGE_BASELINE_GIT_FAILED',
    message: `Git 命令失败: git ${args.join(' ')}`,
    encoding: 'utf8',
  });
  return String(result.stdout || '');
}

function tryRunGit(cwd, args) {
  const result = spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return result.status === 0 && !result.error ? String(result.stdout || '') : '';
}

function runGitBuffer(cwd, args) {
  const result = runCommand('git', ['-C', cwd, ...args], {
    code: 'CHANGE_BASELINE_GIT_FAILED',
    message: `Git 命令失败: git ${args.join(' ')}`,
  });
  return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout || '');
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: options.encoding,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const detail = [
      result.error?.message,
      Buffer.isBuffer(result.stderr)
        ? result.stderr.toString('utf8')
        : result.stderr,
      Buffer.isBuffer(result.stdout)
        ? result.stdout.toString('utf8')
        : result.stdout,
    ]
      .filter(Boolean)
      .join('\n')
      .trim()
      .slice(-4000);
    throw changeBaselineError(
      options.code || 'CHANGE_BASELINE_COMMAND_FAILED',
      `${options.message || `${command} 执行失败`}${detail ? `\n${detail}` : ''}`
    );
  }
  return result;
}

function splitNullBuffer(buffer) {
  const records = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0) continue;
    if (index > start) records.push(buffer.subarray(start, index));
    start = index + 1;
  }
  if (start < buffer.length) records.push(buffer.subarray(start));
  return records;
}

function getChangeBaselineOwnerThreadId(baseline) {
  return String(
    baseline?.workspace?.threadId || baseline?.ownerThreadId || ''
  ).trim();
}

function currentCodexThreadId(env = process.env) {
  return String(env?.CODEX_THREAD_ID || '').trim();
}

function ownershipError(ownerThreadId, currentThreadId) {
  return changeBaselineError(
    'CHANGE_BASELINE_OWNED_BY_ANOTHER_TASK',
    `change baseline 由另一个任务持有 (${ownerThreadId || 'unknown'})；当前任务 ${
      currentThreadId || '<none>'
    } 不能复用、覆盖或清除`
  );
}

function preservedField(input, existing, key, fallback) {
  if (Object.prototype.hasOwnProperty.call(input, key)) return input[key];
  if (existing && Object.prototype.hasOwnProperty.call(existing, key)) {
    return existing[key];
  }
  return fallback;
}

function clonePreservedField(input, existing, key, fallback) {
  return cloneJson(preservedField(input, existing, key, fallback));
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function normalizeOptionalString(value) {
  const text = String(value === undefined || value === null ? '' : value).trim();
  return text || null;
}

function normalizeNow(value) {
  const date = value === undefined ? new Date() : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw changeBaselineError(
      'CHANGE_BASELINE_INVALID',
      'change baseline updatedAt 无效'
    );
  }
  return date.toISOString();
}

function isSafeCode(code) {
  return Boolean(
    code &&
      code !== '.' &&
      code !== '..' &&
      !/[\\/,:\0\r\n]/.test(code)
  );
}

function isDirectory(value) {
  try {
    return fs.statSync(value).isDirectory();
  } catch {
    return false;
  }
}

function isOutsidePath(relativePath) {
  return (
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  );
}

function isPathInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return !isOutsidePath(relative);
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function changeBaselineError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

module.exports = {
  buildGitBaseSourceArtifacts,
  canonicalJsonSha256,
  clearChangeBaseline,
  clearChangeBaselineForReconciliation,
  getStoredChangeBaseline,
  isChangeBaselineOwnedByCurrentSession,
  readGitSourceBase,
  saveChangeBaseline,
  sha256File,
  withGitBaseWorkspace,
};
