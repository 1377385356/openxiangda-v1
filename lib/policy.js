const fs = require('fs');
const path = require('path');

const POLICY_FILE = path.join(
  __dirname,
  '..',
  'policy',
  'openxiangda-policy.json'
);
const POLICY_MARKER_PREFIX = 'OpenXiangda-Policy-Version:';
const POLICY_MARKER_FILES = [
  'README.md',
  'openxiangda-skills/SKILL.md',
  'templates/openxiangda-react-spa/AGENTS.md',
  'templates/sy-lowcode-app-workspace/AGENTS.md',
];

function loadEngineeringPolicy() {
  const policy = JSON.parse(fs.readFileSync(POLICY_FILE, 'utf8'));
  validateEngineeringPolicy(policy);
  return policy;
}

function validateEngineeringPolicy(policy) {
  const errors = [];
  if (policy?.schemaVersion !== 'openxiangda_engineering_policy_v1') {
    errors.push('schemaVersion 必须是 openxiangda_engineering_policy_v1');
  }
  if (!Number.isSafeInteger(policy?.policyVersion) || policy.policyVersion < 1) {
    errors.push('policyVersion 必须是正整数');
  }
  if (policy?.sdd?.verifyIsReadOnly !== true) {
    errors.push('sdd.verifyIsReadOnly 必须为 true');
  }
  if (policy?.git?.requireRemoteMainlineContainment !== true) {
    errors.push('git.requireRemoteMainlineContainment 必须为 true');
  }
  if (policy?.release?.unsupportedGenericMode !== 'fail-closed') {
    errors.push('release.unsupportedGenericMode 必须为 fail-closed');
  }
  if (
    policy?.release?.applicationEnvironmentMode !==
    'candidate-preproduction-evidence-production'
  ) {
    errors.push(
      'release.applicationEnvironmentMode 必须为 candidate-preproduction-evidence-production'
    );
  }
  if (
    policy?.release?.candidateImmutable !== true ||
    policy?.release?.productionDirectPublish !== false ||
    policy?.release?.sameCandidateRequiredForPromotion !== true
  ) {
    errors.push('应用环境发布必须冻结 candidate、禁止生产直发并同候选晋级');
  }
  if (
    policy?.release?.sealedAuthoredBuildClosure !== true ||
    policy?.release?.workspaceNodeModulesDuringExecution !== false ||
    policy?.release?.exactResourceFingerprintDiff !== true ||
    policy?.release?.deletionsFailClosed !== true ||
    policy?.release?.attemptFencing !== true ||
    policy?.release?.crossMachineBindingReplay !== true ||
    policy?.release?.deterministicRuntimeBuildIdentity !==
      'runtime-layer-plus-package-digest' ||
    policy?.release?.deterministicRuntimeUploadedReleaseReuse !==
      'exact-content-source-parent-only' ||
    policy?.release?.statusAutoResolvesEnvironment !== true
  ) {
    errors.push(
      'Delivery V2 必须启用密封构建、精确差异、删除关闭、attempt 隔离、跨机器绑定恢复、Runtime 包级身份与严格恢复，以及环境自动解析'
    );
  }
  const ttl = Number(policy?.ownership?.defaultTtlSeconds);
  if (!Number.isSafeInteger(ttl) || ttl < 300 || ttl > 86400) {
    errors.push('ownership.defaultTtlSeconds 必须在 300-86400 之间');
  }
  if (errors.length > 0) {
    const error = new Error(`OPENXIANGDA_POLICY_INVALID: ${errors.join('; ')}`);
    error.code = 'OPENXIANGDA_POLICY_INVALID';
    error.errors = errors;
    throw error;
  }
  return policy;
}

function checkEngineeringPolicyMarkers(options = {}) {
  const root = path.resolve(options.root || path.join(__dirname, '..'));
  const policy = loadEngineeringPolicy();
  const expected = `${POLICY_MARKER_PREFIX} ${policy.policyVersion}`;
  const files = POLICY_MARKER_FILES.map(relativePath => {
    const file = path.join(root, relativePath);
    const exists = fs.existsSync(file);
    const content = exists ? fs.readFileSync(file, 'utf8') : '';
    return {
      file: relativePath,
      exists,
      synchronized: exists && content.includes(expected),
    };
  });
  return {
    valid: files.every(item => item.synchronized),
    policyVersion: policy.policyVersion,
    expectedMarker: expected,
    files,
  };
}

function renderEngineeringPolicyMarkdown(policy = loadEngineeringPolicy()) {
  return [
    `<!-- ${POLICY_MARKER_PREFIX} ${policy.policyVersion} -->`,
    `Policy v${policy.policyVersion}:`,
    '',
    `- 风险按 ${policy.risk.classifyBy.join('、')} 分级；目录只作信号。`,
    '- SDD verify 只读；Markdown 是按需派生视图。',
    `- Delivery V${policy.release.normalDeliveryVersion} 是正常发布入口：${policy.release.normalCommands.join(
      ' / '
    )}；生产只消费预发验证过的封存包，ReleaseRun 与检查点由平台持久化。`,
    '- Delivery V2 信任平台开发者，不要求 SDD、Git 主线、`--change` 或 `--only`；下列 V1 规则只保留兼容性。',
    '- Delivery V2 authored build 使用 CLI 密封工具链且不链接工作区 node_modules；按资源指纹计算精确范围，删除在写入前失败关闭。',
    '- ReleaseRun retry 以 attempt 隔离旧执行器，并在另一台机器安全重建本地 Form 绑定；status/retry 可自动定位预发或生产环境。',
    '- 平台仓库直接开发权威 master；应用任务可用独立 worktree，但只从干净、已推送的权威主线发布。',
    '- 应用任务在主线发布和 release end 后从 canonical 主工作区执行 workspace cleanup；只删除已合并、干净、无 owner 和发布私有状态的 SAFE worktree/本地分支。',
    '- 环境托管应用冻结不可变 candidate，先部署预发并提交有效测试证据，再将同一 candidate 晋级生产；禁止生产直发。',
    `- 原子 child：${policy.release.atomicChildren.join(', ')}。`,
    `- 尚无 staged child 的通用资源必须 ${policy.release.unsupportedGenericMode}；维护直发必须显式选择并展示影响范围。`,
    `- 激活后的副作用进入 ${policy.release.postCommitMode}。`,
  ].join('\n');
}

module.exports = {
  POLICY_FILE,
  POLICY_MARKER_FILES,
  checkEngineeringPolicyMarkers,
  loadEngineeringPolicy,
  renderEngineeringPolicyMarkdown,
  validateEngineeringPolicy,
};
