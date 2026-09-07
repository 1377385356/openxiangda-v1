const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ENVIRONMENT_KINDS = new Set(['preproduction', 'production']);
const SIDE_EFFECT_POLICY_ENUMS = Object.freeze({
  notifications: ['disabled', 'tester_allowlist', 'enabled', 'real'],
  organizationWrites: ['deny', 'explicit_capability_only'],
  scheduledAutomations: ['disabled', 'enabled'],
  externalWrites: ['deny', 'allowlist', 'configured', 'sandbox'],
  payments: ['deny', 'configured', 'sandbox'],
  publicIndexing: ['deny', 'configured', 'enabled'],
});
const SIDE_EFFECT_POLICY_FIELDS = new Set([
  ...Object.keys(SIDE_EFFECT_POLICY_ENUMS),
  'notificationAllowlist',
  'environmentBanner',
  'externalDingTalkDepartmentRootId',
]);
const CANDIDATE_STATE_HASH_POLICY_V1 =
  'openxiangda-state-without-runtime-promotion-v1';
const CANDIDATE_STATE_HASH_POLICY =
  'openxiangda-state-stable-managed-bindings-v2';
const CANDIDATE_STATE_HASH_POLICIES = new Set([
  CANDIDATE_STATE_HASH_POLICY_V1,
  CANDIDATE_STATE_HASH_POLICY,
]);
const CANDIDATE_RESOURCE_OBSERVATION_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'syncedAt',
  'schemaSyncedAt',
  'bundlePublishedAt',
]);

function isCandidateResourceObservationField(pathParts, key) {
  if (CANDIDATE_RESOURCE_OBSERVATION_FIELDS.has(key)) return true;
  return (
    key === 'status' &&
    pathParts.length === 2 &&
    pathParts[0] === 'dataViews'
  );
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Canonical(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function normalizeEnvironmentKind(value, label = 'environment') {
  const kind = String(value || '').trim().toLowerCase();
  if (!ENVIRONMENT_KINDS.has(kind)) {
    throw new Error(`${label} 必须是 preproduction 或 production`);
  }
  return kind;
}

function normalizeTargetName(value, kind) {
  const targetName = String(value || kind || '').trim();
  if (!/^[a-z][a-z0-9-]*$/.test(targetName)) {
    throw new Error(
      'target 名称必须以小写字母开头，且只包含小写字母、数字和连字符'
    );
  }
  return targetName;
}

function cloneJsonValue(value) {
  return value === undefined
    ? undefined
    : JSON.parse(JSON.stringify(value));
}

function normalizeSideEffectPolicyInput(value, label = 'sideEffectPolicy') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象`);
  }
  for (const key of Object.keys(value)) {
    if (!SIDE_EFFECT_POLICY_FIELDS.has(key)) {
      throw new Error(`${label}.${key} 不是允许的副作用策略字段`);
    }
  }
  const result = {};
  for (const [key, allowed] of Object.entries(SIDE_EFFECT_POLICY_ENUMS)) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const normalized = String(value[key] || '').trim();
    if (!allowed.includes(normalized)) {
      throw new Error(`${label}.${key} 必须是 ${allowed.join('、')} 之一`);
    }
    result[key] = normalized;
  }
  if (Object.prototype.hasOwnProperty.call(value, 'notificationAllowlist')) {
    if (!Array.isArray(value.notificationAllowlist)) {
      throw new Error(`${label}.notificationAllowlist 必须是数组`);
    }
    if (value.notificationAllowlist.length > 500) {
      throw new Error(`${label}.notificationAllowlist 最多包含 500 项`);
    }
    result.notificationAllowlist = Array.from(
      new Set(
        value.notificationAllowlist.map((item, index) => {
          const normalized = String(item ?? '').trim();
          if (!normalized || normalized.length > 255) {
            throw new Error(
              `${label}.notificationAllowlist[${index}] 必须是 1-255 字符的字符串`,
            );
          }
          return normalized;
        }),
      ),
    );
  }
  if (Object.prototype.hasOwnProperty.call(value, 'environmentBanner')) {
    if (typeof value.environmentBanner !== 'boolean') {
      throw new Error(`${label}.environmentBanner 必须是布尔值`);
    }
    result.environmentBanner = value.environmentBanner;
  }
  if (
    Object.prototype.hasOwnProperty.call(
      value,
      'externalDingTalkDepartmentRootId',
    )
  ) {
    const raw = value.externalDingTalkDepartmentRootId;
    if (
      !['string', 'number'].includes(typeof raw) ||
      (typeof raw === 'number' && !Number.isSafeInteger(raw))
    ) {
      throw new Error(
        `${label}.externalDingTalkDepartmentRootId 必须是字符串或安全整数`,
      );
    }
    const normalized = String(raw).trim();
    if (!/^\d{1,64}$/.test(normalized)) {
      throw new Error(
        `${label}.externalDingTalkDepartmentRootId 必须是数字型钉钉部门 ID`,
      );
    }
    result.externalDingTalkDepartmentRootId = normalized;
  }
  return result;
}

function cloneExistingSideEffectPolicy(value, label = 'currentSideEffectPolicy') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象`);
  }
  return cloneJsonValue(value);
}

function buildSideEffectPolicyDiff(beforeInput, updateInput, options = {}) {
  // Existing policies are durable protocol data and may contain fields written
  // by an older/newer platform version. Patch validation must apply only to the
  // caller's update; revalidating the stored object would make a harmless read
  // incompatible with newly introduced policy fields.
  const before = cloneExistingSideEffectPolicy(
    beforeInput || {},
    'currentSideEffectPolicy',
  );
  const update = normalizeSideEffectPolicyInput(
    updateInput,
    'sideEffectPolicy',
  );
  const fullReplace = options.fullReplace === true;
  const after = fullReplace
    ? cloneJsonValue(update)
    : { ...before, ...update };
  const fields = Array.from(
    new Set([...Object.keys(before), ...Object.keys(after)]),
  ).sort();
  const changes = fields
    .filter(key => canonicalJson(before[key]) !== canonicalJson(after[key]))
    .map(key => ({
      field: key,
      before: Object.prototype.hasOwnProperty.call(before, key)
        ? cloneJsonValue(before[key])
        : null,
      after: Object.prototype.hasOwnProperty.call(after, key)
        ? cloneJsonValue(after[key])
        : null,
    }));
  return {
    fullReplace,
    changed: changes.length > 0,
    before,
    after,
    changes,
  };
}

function normalizeIdentityList(values) {
  return Array.from(
    new Set(
      values
        .map(value => String(value || '').trim().toLowerCase())
        .filter(value => /^sha256:[0-9a-f]{64}$/.test(value))
    )
  ).sort();
}

function normalizeManagedReleaseSourceRevision(
  target,
  sourceRevision,
  options = {}
) {
  const logicalApp = target?.logicalApp || target?.state?.logicalApp;
  const expectedRepositoryId = String(
    logicalApp?.sourceRepositoryId || ''
  )
    .trim()
    .toLowerCase();
  if (!expectedRepositoryId) return cloneJsonValue(sourceRevision);
  const revision =
    sourceRevision &&
    typeof sourceRevision === 'object' &&
    !Array.isArray(sourceRevision)
      ? cloneJsonValue(sourceRevision)
      : {};
  const repositoryAliases = normalizeIdentityList([
    revision.repo,
    revision.repositoryId,
    ...(Array.isArray(revision.repoAliases) ? revision.repoAliases : []),
  ]);
  if (!repositoryAliases.includes(expectedRepositoryId)) {
    const code =
      String(options.errorCode || '').trim() ||
      'MANAGED_SOURCE_REPOSITORY_MISMATCH';
    const error = new Error(
      `${code}: 当前 Git 仓库与 logical app 权威仓库不一致`
    );
    error.code = code;
    error.details = {
      expectedRepositoryId,
      repositoryAliases,
    };
    throw error;
  }
  const {
    capturedAt: _capturedAt,
    worktreeRoot: _worktreeRoot,
    ...stableRevision
  } = revision;
  return {
    ...stableRevision,
    repo: expectedRepositoryId,
    repositoryId: expectedRepositoryId,
    repoAliases: normalizeIdentityList([
      expectedRepositoryId,
      ...repositoryAliases,
    ]),
    ...(Array.isArray(revision.remoteUrlHashAliases)
      ? {
          remoteUrlHashAliases: normalizeIdentityList(
            revision.remoteUrlHashAliases
          ),
        }
      : {}),
  };
}

function normalizeReleaseSourceRevisionForBaseline(
  target,
  sourceBase,
  sourceRevision,
  options = {}
) {
  const revision = normalizeManagedReleaseSourceRevision(
    target,
    sourceRevision,
    options
  );
  const expectedRepositoryId = String(
    sourceBase?.repo || sourceBase?.repositoryId || ''
  )
    .trim()
    .toLowerCase();
  if (!expectedRepositoryId) return revision;
  const repositoryAliases = normalizeIdentityList([
    revision?.repo,
    revision?.repositoryId,
    ...(Array.isArray(revision?.repoAliases) ? revision.repoAliases : []),
  ]);
  if (!repositoryAliases.includes(expectedRepositoryId)) {
    const code =
      String(options.errorCode || '').trim() ||
      'RELEASE_SOURCE_REPOSITORY_MISMATCH';
    const error = new Error(
      `${code}: 当前 Git 仓库与冻结 change baseline 仓库不一致`
    );
    error.code = code;
    error.details = {
      expectedRepositoryId,
      repositoryAliases,
    };
    throw error;
  }
  return {
    ...revision,
    repo: expectedRepositoryId,
    repositoryId: expectedRepositoryId,
    repoAliases: normalizeIdentityList([
      expectedRepositoryId,
      ...repositoryAliases,
    ]),
  };
}

function normalizeManagedChangeSourceBase(
  target,
  sourceBase,
  releaseSourceRevision
) {
  const logicalApp = target?.logicalApp || target?.state?.logicalApp;
  if (!logicalApp?.sourceRepositoryId) {
    return cloneJsonValue(sourceBase);
  }
  return normalizeManagedReleaseSourceRevision(
    target,
    {
      ...(sourceBase || {}),
      repositoryId: sourceBase?.repo,
      repoAliases: [
        sourceBase?.repo,
        releaseSourceRevision?.repo,
        releaseSourceRevision?.repositoryId,
        ...(Array.isArray(releaseSourceRevision?.repoAliases)
          ? releaseSourceRevision.repoAliases
          : []),
      ],
    },
    { errorCode: 'RELEASE_SOURCE_BASE_REPOSITORY_MISMATCH' }
  );
}

function hasStateResourceMappings(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (!value || typeof value !== 'object') {
    return value !== undefined && value !== null && value !== '';
  }
  return Object.values(value).some(item => hasStateResourceMappings(item));
}

function resolveEnvironmentTarget(state, selector) {
  const targets = state?.targets || {};
  const requested = String(selector || state?.currentTarget || '').trim();
  if (!requested) {
    throw new Error(
      '当前工作区已启用应用环境，请显式使用 --environment <target|preproduction|production>'
    );
  }
  if (targets[requested]) {
    return { targetName: requested, binding: targets[requested] };
  }
  const matches = Object.entries(targets).filter(
    ([, binding]) => binding?.kind === requested
  );
  if (matches.length !== 1) {
    throw new Error(`应用环境 target 不存在或不唯一: ${requested}`);
  }
  return { targetName: matches[0][0], binding: matches[0][1] };
}

function bindEnvironmentTarget(state, input) {
  const kind = normalizeEnvironmentKind(input.kind);
  const targetName = normalizeTargetName(input.targetName, kind);
  const appType = String(input.appType || '').trim();
  const profile = String(input.profile || '').trim();
  const environmentId = String(input.environmentId || '').trim();
  if (!appType || !profile || !environmentId) {
    throw new Error('环境 target 缺少 appType、profile 或 environmentId');
  }
  state.targets = state.targets || {};
  const previous = state.targets[targetName] || {};
  const previousResources = previous.resources || {};
  const resources = input.replaceResources
    ? cloneJsonValue(input.seedResources || {}) || {}
    : hasStateResourceMappings(previousResources)
      ? previousResources
      : cloneJsonValue(input.seedResources || previousResources) || {};
  state.targets[targetName] = {
    ...previous,
    targetName,
    profile,
    environmentId,
    kind,
    appType,
    displayName: input.displayName || previous.displayName || kind,
    publicOrigin:
      input.publicOrigin === undefined
        ? previous.publicOrigin || null
        : input.publicOrigin,
    sideEffectPolicy:
      input.sideEffectPolicy === undefined
        ? previous.sideEffectPolicy || {}
        : input.sideEffectPolicy,
    revision:
      input.revision === undefined
        ? previous.revision || null
        : Number(input.revision),
    resources,
    updatedAt: new Date().toISOString(),
  };
  if (input.replaceAppScopedState) {
    const seedAppScopedState = input.seedAppScopedState || {};
    for (const key of [
      'lastDeploymentId',
      'lastCandidateId',
      'lastDeploymentStatus',
      'runtime',
    ]) {
      delete state.targets[targetName][key];
      if (
        Object.prototype.hasOwnProperty.call(seedAppScopedState, key) &&
        seedAppScopedState[key] !== undefined
      ) {
        state.targets[targetName][key] = cloneJsonValue(
          seedAppScopedState[key]
        );
      }
    }
  }
  if (!state.currentTarget || kind === 'preproduction') {
    state.currentTarget = targetName;
  }
  return state.targets[targetName];
}

function resolveManagedStateBinding(target) {
  if (!target?.targetName) return null;
  const binding = target.state?.targets?.[target.targetName];
  if (!binding) {
    throw new Error(`环境 target 状态不存在: ${target.targetName}`);
  }
  if (
    binding.appType !== target.appType ||
    (target.environmentId &&
      binding.environmentId !== target.environmentId)
  ) {
    throw new Error(
      `环境 target 状态与当前写入目标不一致: ${target.targetName}`
    );
  }
  return binding;
}

function candidateDirectory(cwd = process.cwd()) {
  return path.join(cwd, '.openxiangda', 'candidates');
}

function candidateFile(candidateId, cwd = process.cwd()) {
  const normalized = String(candidateId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(normalized)) {
    throw new Error('candidateId 必须是 UUID');
  }
  return path.join(candidateDirectory(cwd), `${normalized}.json`);
}

function writePrivateJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  fs.renameSync(temp, file);
}

function saveCandidate(candidate, cwd = process.cwd()) {
  if (!candidate?.id) throw new Error('候选版本缺少 id');
  const file = candidateFile(candidate.id, cwd);
  writePrivateJsonAtomic(file, candidate);
  return file;
}

function readCandidate(candidateId, cwd = process.cwd()) {
  const file = candidateFile(candidateId, cwd);
  if (!fs.existsSync(file)) {
    throw new Error(
      `本地候选版本不存在: ${path.relative(cwd, file)}；请先执行 release candidate`
    );
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`候选版本文件无效: ${error.message}`);
  }
}

function managedTargetDeploymentFile(target, cwd = process.cwd()) {
  const safeSegment = (value, fallback) =>
    String(value || fallback)
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .slice(0, 128);
  return path.join(
    cwd,
    '.openxiangda',
    'releases',
    'targets',
    safeSegment(target.logicalApp?.code, 'unmanaged'),
    `${safeSegment(
      target.targetName || target.environmentId || target.appType,
      'default'
    )}.json`
  );
}

function readRememberedTargetDeployment(target, cwd = process.cwd()) {
  const file = managedTargetDeploymentFile(target, cwd);
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      throw new Error(
        `MANAGED_TARGET_DEPLOYMENT_STATE_INVALID: ${path.relative(
          cwd,
          file
        )} 无法读取: ${error.message}`
      );
    }
  }
  if (
    target.bound?.lastDeploymentId ||
    target.bound?.lastCandidateId ||
    target.bound?.lastDeploymentStatus
  ) {
    return {
      schemaVersion: 'openxiangda_target_deployment_v1',
      deploymentId: target.bound.lastDeploymentId || null,
      candidateId: target.bound.lastCandidateId || null,
      status: target.bound.lastDeploymentStatus || null,
      migratedFromProjectState: true,
    };
  }
  return null;
}

function rememberTargetDeployment(
  target,
  deployment,
  cwd = process.cwd()
) {
  const record = {
    schemaVersion: 'openxiangda_target_deployment_v1',
    logicalAppCode: target.logicalApp?.code || null,
    targetName: target.targetName || null,
    environmentId: target.environmentId || null,
    appType: target.appType,
    deploymentId: deployment.id,
    candidateId: deployment.candidateId || null,
    status: deployment.status,
    updatedAt: new Date().toISOString(),
  };
  const file = managedTargetDeploymentFile(target, cwd);
  writePrivateJsonAtomic(file, record);
  return { record, file };
}

function readJsonInput(value, label, cwd = process.cwd()) {
  const input = String(value || '').trim();
  if (!input) throw new Error(`${label} 不能为空`);
  const possibleFile = path.resolve(cwd, input);
  const text = fs.existsSync(possibleFile)
    ? fs.readFileSync(possibleFile, 'utf8')
    : input;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} 必须是 JSON 或 JSON 文件: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} 必须是 JSON 对象`);
  }
  return parsed;
}

function hashWorkspaceFile(cwd, relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  const absolute = path.resolve(cwd, normalized);
  const relative = path.relative(cwd, absolute);
  if (
    !normalized ||
    relative.startsWith('..') ||
    path.isAbsolute(relative)
  ) {
    return null;
  }
  if (!fs.existsSync(absolute)) {
    return {
      path: normalized,
      exists: false,
      size: 0,
      sha256: null,
    };
  }
  if (!fs.statSync(absolute).isFile()) return null;
  const buffer = fs.readFileSync(absolute);
  return {
    path: normalized,
    exists: true,
    size: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
}

function candidateFileHashPolicy(relativePath) {
  return String(relativePath || '').replace(/\\/g, '/') ===
    '.openxiangda/state.json'
    ? CANDIDATE_STATE_HASH_POLICY
    : null;
}

function hashCandidateWorkspaceFile(cwd, relativePath, options = {}) {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  const hasExplicitPolicy = Object.prototype.hasOwnProperty.call(
    options,
    'hashPolicy'
  );
  const hashPolicy = hasExplicitPolicy
    ? options.hashPolicy
    : candidateFileHashPolicy(normalized);
  if (!hashPolicy) return hashWorkspaceFile(cwd, normalized);
  if (!CANDIDATE_STATE_HASH_POLICIES.has(hashPolicy)) {
    const error = new Error(
      `不支持的 candidate 文件哈希策略: ${hashPolicy}`
    );
    error.code = 'CANDIDATE_FILE_HASH_POLICY_UNSUPPORTED';
    throw error;
  }

  const raw = hashWorkspaceFile(cwd, normalized);
  if (!raw || raw.exists === false) {
    return raw ? { ...raw, hashPolicy } : raw;
  }

  let state;
  try {
    state = JSON.parse(
      fs.readFileSync(path.resolve(cwd, normalized), 'utf8')
    );
  } catch (error) {
    const invalid = new Error(
      `${normalized} 不是有效 JSON，不能生成稳定 candidate 输入哈希: ${error.message}`
    );
    invalid.code = 'CANDIDATE_STATE_INPUT_INVALID';
    throw invalid;
  }
  const normalizedState = normalizeCandidateProjectStateForHash(
    state,
    hashPolicy
  );
  const buffer = Buffer.from(canonicalJson(normalizedState), 'utf8');
  return {
    path: normalized,
    exists: true,
    size: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    hashPolicy,
  };
}

function normalizeCandidateProjectStateForHash(input, hashPolicy) {
  const state = cloneJsonValue(input);
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    const error = new Error(
      '.openxiangda/state.json 顶层必须是 JSON 对象'
    );
    error.code = 'CANDIDATE_STATE_INPUT_INVALID';
    throw error;
  }
  for (const collectionName of ['profiles', 'targets']) {
    const collection = state[collectionName];
    if (
      !collection ||
      typeof collection !== 'object' ||
      Array.isArray(collection)
    ) {
      continue;
    }
    for (const binding of Object.values(collection)) {
      if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
        continue;
      }
      // publish lease / change baseline are local execution state written by
      // release begin/end. Their persistence must not invalidate the candidate
      // that caused the release, while all durable binding fields remain hashed.
      delete binding.promotion;
      delete binding.updatedAt;
      if (
        collectionName === 'targets' &&
        hashPolicy === CANDIDATE_STATE_HASH_POLICY
      ) {
        // Managed release stages persist discovered/created resource IDs and
        // the activated runtime head as their durable local execution result.
        // The sealed environmentBindings manifest independently protects every
        // resource identity that existed before sealing, while intentionally
        // allowing additive bindings created by the candidate itself.
        delete binding.resources;
        delete binding.runtime;
      }
    }
  }
  return state;
}

function normalizeCandidateResourceBindings(value, pathParts = []) {
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      normalizeCandidateResourceBindings(item, [...pathParts, String(index)])
    );
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) => !isCandidateResourceObservationField(pathParts, key)
      )
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [
        key,
        normalizeCandidateResourceBindings(item, [...pathParts, key]),
      ])
  );
}

function buildCandidateEnvironmentBindings(state) {
  const targets =
    state?.targets && typeof state.targets === 'object'
      ? state.targets
      : {};
  return Object.fromEntries(
    Object.entries(targets)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([targetName, binding]) => [
        targetName,
        {
          targetName,
          profile: binding?.profile || null,
          environmentId: binding?.environmentId || null,
          kind: binding?.kind || null,
          appType: binding?.appType || null,
          publicOrigin: binding?.publicOrigin || null,
          sideEffectPolicy:
            cloneJsonValue(binding?.sideEffectPolicy || {}) || {},
          revision:
            binding?.revision === undefined
              ? null
              : binding.revision,
          resources:
            normalizeCandidateResourceBindings(binding?.resources || {}) ||
            {},
        },
      ])
  );
}

function candidateBindingValueContains(expected, current) {
  if (Array.isArray(expected)) {
    return (
      Array.isArray(current) &&
      expected.length === current.length &&
      expected.every((item, index) =>
        candidateBindingValueContains(item, current[index])
      )
    );
  }
  if (expected && typeof expected === 'object') {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return false;
    }
    return Object.entries(expected).every(([key, value]) =>
      candidateBindingValueContains(value, current[key])
    );
  }
  return expected === current;
}

function inspectCandidateEnvironmentBindings(candidate, state) {
  const expected =
    candidate?.sourceBundleManifest?.environmentBindings ||
    candidate?.environmentBindings ||
    {};
  const current = buildCandidateEnvironmentBindings(state);
  const mismatches = [];
  const expectedNames = Object.keys(expected).sort();
  const currentNames = Object.keys(current).sort();
  if (canonicalJson(expectedNames) !== canonicalJson(currentNames)) {
    mismatches.push({
      targetName: '(targets)',
      reason: 'target-set-changed',
      expected: expectedNames,
      current: currentNames,
    });
  }
  for (const targetName of expectedNames) {
    const expectedBinding = expected[targetName];
    const currentBinding = current[targetName];
    if (!currentBinding) continue;
    for (const field of [
      'targetName',
      'profile',
      'environmentId',
      'kind',
      'appType',
      'publicOrigin',
      'sideEffectPolicy',
      'revision',
    ]) {
      if (
        canonicalJson(expectedBinding?.[field]) !==
        canonicalJson(currentBinding?.[field])
      ) {
        mismatches.push({
          targetName,
          field,
          reason: 'changed',
          expected: expectedBinding?.[field],
          current: currentBinding?.[field],
        });
      }
    }
    const expectedResources = normalizeCandidateResourceBindings(
      expectedBinding?.resources || {}
    );
    const currentResources = normalizeCandidateResourceBindings(
      currentBinding.resources || {}
    );
    if (!candidateBindingValueContains(expectedResources, currentResources)) {
      mismatches.push({
        targetName,
        field: 'resources',
        reason: 'sealed-resource-binding-changed',
        expected: expectedResources,
        current: currentResources,
      });
    }
  }
  return {
    valid: mismatches.length === 0,
    checked: expectedNames.length,
    mismatches,
  };
}

function assertCandidateEnvironmentBindingsCurrent(candidate, state) {
  const inspection = inspectCandidateEnvironmentBindings(candidate, state);
  if (inspection.valid) return inspection;
  const error = new Error(
    `CANDIDATE_ENVIRONMENT_BINDINGS_CHANGED: sealed candidate 的环境或资源绑定已变化: ${inspection.mismatches
      .slice(0, 8)
      .map(
        item =>
          `${item.targetName}${
            item.field ? `.${item.field}` : ''
          }(${item.reason})`
      )
      .join(', ')}`
  );
  error.code = 'CANDIDATE_ENVIRONMENT_BINDINGS_CHANGED';
  error.details = inspection;
  throw error;
}

function buildCandidateBundle(input) {
  const cwd = path.resolve(input.cwd || process.cwd());
  const files = Array.from(new Set(input.files || []))
    .sort()
    .map(file => hashCandidateWorkspaceFile(cwd, file))
    .filter(Boolean);
  const testPlan = input.testPlan || {
    schemaVersion: 1,
    requiredGates: [
      'static',
      'schema',
      'appFunctions',
      'roles',
      'browser',
      'lifecycle',
      'cleanup',
    ],
    maximumEvidenceAgeHours: 24,
  };
  const sourceBundleManifest = {
    schemaVersion: 1,
    logicalAppCode: input.logicalAppCode,
    changeId: input.changeId,
    sourceRevision: input.sourceRevision,
    runtimeMode: input.runtimeMode,
    targets: input.targets,
    inputPolicy: 'candidate-inputs-v2',
    files,
    environmentBindings:
      cloneJsonValue(input.environmentBindings || {}) || {},
    runtimeArtifacts:
      cloneJsonValue(input.runtimeArtifacts || []) || [],
    testPlanHash: sha256Canonical(testPlan),
    prepublishVerificationHash:
      input.prepublishVerificationHash || null,
    candidatePreflightHash:
      input.candidatePreflightHash || null,
    openxiangdaVersion: input.openxiangdaVersion,
  };
  return {
    sourceBundleManifest,
    candidateHash: sha256Canonical(sourceBundleManifest),
    testPlan,
    testPlanHash: sourceBundleManifest.testPlanHash,
  };
}

function inspectCandidateBundleFiles(candidate, cwd = process.cwd()) {
  const manifest =
    candidate?.sourceBundleManifest &&
    typeof candidate.sourceBundleManifest === 'object'
      ? candidate.sourceBundleManifest
      : candidate;
  const expectedFiles = Array.isArray(manifest?.files)
    ? manifest.files
    : [];
  const mismatches = [];
  const seen = new Set();
  for (const expected of expectedFiles) {
    const file = String(expected?.path || '').replace(/\\/g, '/');
    if (!file || seen.has(file)) {
      mismatches.push({
        path: file || '(missing path)',
        reason: seen.has(file) ? 'duplicate' : 'invalid',
      });
      continue;
    }
    seen.add(file);
    const hashPolicy = expected.hashPolicy || null;
    if (hashPolicy && !CANDIDATE_STATE_HASH_POLICIES.has(hashPolicy)) {
      mismatches.push({
        path: file,
        reason: 'unsupported-hash-policy',
        hashPolicy,
      });
      continue;
    }
    let current;
    try {
      current = hashCandidateWorkspaceFile(path.resolve(cwd), file, {
        hashPolicy,
      });
    } catch (error) {
      mismatches.push({
        path: file,
        reason: 'invalid',
        errorCode: error.code || null,
      });
      continue;
    }
    const expectedExists = expected.exists !== false;
    if (!current || (expectedExists && current.exists === false)) {
      mismatches.push({ path: file, reason: 'missing' });
      continue;
    }
    if (!expectedExists) {
      if (current.exists !== false) {
        mismatches.push({ path: file, reason: 'reappeared', current });
      }
      continue;
    }
    if (
      current.size !== Number(expected.size) ||
      current.sha256 !== String(expected.sha256 || '').toLowerCase()
    ) {
      mismatches.push({
        path: file,
        reason: 'changed',
        expected: {
          size: Number(expected.size),
          sha256: String(expected.sha256 || '').toLowerCase(),
        },
        current,
      });
    }
  }
  return {
    valid: mismatches.length === 0,
    checked: expectedFiles.length,
    mismatches,
  };
}

function assertCandidateBundleFilesCurrent(candidate, cwd = process.cwd()) {
  const inspection = inspectCandidateBundleFiles(candidate, cwd);
  if (inspection.valid) return inspection;
  const error = new Error(
    `CANDIDATE_INPUTS_CHANGED: sealed candidate 的发布输入已变化: ${inspection.mismatches
      .slice(0, 8)
      .map(item => `${item.path}(${item.reason})`)
      .join(', ')}`
  );
  error.code = 'CANDIDATE_INPUTS_CHANGED';
  error.details = inspection;
  throw error;
}

function releaseExecutionPath(changeId, deploymentId, cwd = process.cwd()) {
  const base = path.join(
    cwd,
    '.openxiangda',
    'releases',
    String(changeId || '').trim()
  );
  const deployment = String(deploymentId || '').trim();
  return deployment
    ? path.join(base, deployment, 'execution.json')
    : path.join(base, 'execution.json');
}

function withManagedReleaseForwardedFlags(stepId, args = [], flags = {}) {
  let forwarded = [...args];
  if (stepId === 'runtime-stage' && flags['allow-runtime-rollback']) {
    forwarded.push('--allow-runtime-rollback');
    const rollbackReason = String(flags.reason || '').trim();
    if (rollbackReason) {
      forwarded.push('--reason', rollbackReason);
    }
    return forwarded;
  }
  const immutableResourceStages = new Set([
    'backend-stage',
    'workflow-stage',
  ]);
  if (
    immutableResourceStages.has(stepId) &&
    !forwarded.includes('--include-noop')
  ) {
    forwarded.push('--include-noop');
  }
  const isExactResourcePublish =
    forwarded[0] === 'resource' &&
    forwarded[1] === 'publish' &&
    (forwarded.includes('--only') || forwarded.includes('--code'));
  if (!isExactResourcePublish) {
    return forwarded;
  }
  if (stepId === 'backend-stage' && flags['replace-manifest']) {
    forwarded.push('--replace-manifest');
    const replacementReason = String(flags.reason || '').trim();
    if (replacementReason) {
      forwarded.push('--reason', replacementReason);
    }
  }
  forwarded = withOnlineBaselineAdoptionFlags(forwarded, flags);
  return forwarded;
}

function withOnlineBaselineAdoptionFlags(args = [], flags = {}) {
  const forwarded = [...args];
  const isExactResourcePublish =
    forwarded[0] === 'resource' &&
    forwarded[1] === 'publish' &&
    (forwarded.includes('--only') || forwarded.includes('--code'));
  if (!isExactResourcePublish) {
    return forwarded;
  }
  if (flags['adopt-online-baseline']) {
    forwarded.push('--adopt-online-baseline');
    const adoptionReason = String(
      flags['adoption-reason'] || flags.reason || ''
    ).trim();
    if (adoptionReason) {
      forwarded.push('--adoption-reason', adoptionReason);
    }
  }
  return forwarded;
}

function withReleaseClientSessionArgs(args = [], flags = {}) {
  const clientSessionId = String(flags['client-session-id'] || '').trim();
  return clientSessionId
    ? [...args, '--client-session-id', clientSessionId]
    : [...args];
}

function isRecoverablePostActivationDeploymentError(error, deployment) {
  if (
    deployment?.status !== 'deployed' ||
    !String(deployment?.targetAppReleaseId || '').trim()
  ) {
    return false;
  }
  const detail = [
    error?.code,
    error?.message,
    error?.publishLeaseCleanupError?.code,
    error?.publishLeaseCleanupError?.message,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    /(publish[\s_-]*lease|publishLease|发布租约)/i.test(detail) &&
    /(concurr|conflict|cleanup|release[\s_-]*end|并发冲突|清理|释放)/i.test(
      detail
    )
  );
}

module.exports = {
  assertCandidateBundleFilesCurrent,
  assertCandidateEnvironmentBindingsCurrent,
  bindEnvironmentTarget,
  buildCandidateEnvironmentBindings,
  buildSideEffectPolicyDiff,
  buildCandidateBundle,
  canonicalJson,
  isRecoverablePostActivationDeploymentError,
  normalizeEnvironmentKind,
  normalizeManagedChangeSourceBase,
  normalizeManagedReleaseSourceRevision,
  normalizeReleaseSourceRevisionForBaseline,
  normalizeSideEffectPolicyInput,
  normalizeTargetName,
  hasStateResourceMappings,
  inspectCandidateBundleFiles,
  inspectCandidateEnvironmentBindings,
  managedTargetDeploymentFile,
  readCandidate,
  readJsonInput,
  readRememberedTargetDeployment,
  releaseExecutionPath,
  rememberTargetDeployment,
  resolveManagedStateBinding,
  resolveEnvironmentTarget,
  saveCandidate,
  sha256Canonical,
  withManagedReleaseForwardedFlags,
  withOnlineBaselineAdoptionFlags,
  withReleaseClientSessionArgs,
  writePrivateJsonAtomic,
};
