import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const {
  checkEngineeringPolicyMarkers,
  loadEngineeringPolicy,
  renderEngineeringPolicyMarkdown,
} = require('../lib/policy');

const policy = loadEngineeringPolicy();
assert.equal(policy.sdd.verifyIsReadOnly, true);
assert.equal(policy.git.requireRemoteMainlineContainment, true);
assert.equal(policy.release.unsupportedGenericMode, 'fail-closed');
assert.equal(
  policy.release.applicationEnvironmentMode,
  'candidate-preproduction-evidence-production',
);
assert.equal(policy.release.candidateImmutable, true);
assert.equal(policy.release.productionDirectPublish, false);
assert.equal(policy.release.sameCandidateRequiredForPromotion, true);
assert.equal(policy.release.normalDeliveryVersion, 2);
assert.equal(policy.release.productionConsumesSealedPackage, true);
assert.equal(policy.release.serverPersistedReleaseRun, true);
assert.equal(policy.release.sealedAuthoredBuildClosure, true);
assert.equal(policy.release.workspaceNodeModulesDuringExecution, false);
assert.equal(policy.release.exactResourceFingerprintDiff, true);
assert.equal(policy.release.deletionsFailClosed, true);
assert.equal(policy.release.attemptFencing, true);
assert.equal(policy.release.crossMachineBindingReplay, true);
assert.equal(
  policy.release.deterministicRuntimeBuildIdentity,
  'runtime-layer-plus-package-digest',
);
assert.equal(
  policy.release.deterministicRuntimeUploadedReleaseReuse,
  'exact-content-source-parent-only',
);
assert.equal(policy.release.statusAutoResolvesEnvironment, true);
assert.equal(policy.release.v2RequiresSdd, false);
assert.equal(policy.release.v2RequiresGitMainline, false);
assert.ok(policy.release.atomicChildren.includes('WorkflowRelease'));
assert.match(renderEngineeringPolicyMarkdown(policy), /Policy v7/);
assert.match(renderEngineeringPolicyMarkdown(policy), /生产只消费预发验证过的封存包/);
assert.match(renderEngineeringPolicyMarkdown(policy), /不链接工作区 node_modules/);
assert.match(renderEngineeringPolicyMarkdown(policy), /attempt 隔离旧执行器/);
assert.match(
  renderEngineeringPolicyMarkdown(policy),
  /先部署预发并提交有效测试证据/,
);

const markers = checkEngineeringPolicyMarkers();
assert.equal(
  markers.valid,
  true,
  `policy markers out of sync: ${markers.files
    .filter(item => !item.synchronized)
    .map(item => item.file)
    .join(', ')}`,
);

const routerSkill = fs.readFileSync(
  path.join(repoRoot, 'openxiangda-skills', 'SKILL.md'),
  'utf8',
);
assert.match(routerSkill, /one broad CodeGraph exploration/);
assert.match(routerSkill, /at most one focused follow-up/);
assert.match(routerSkill, /three or more OpenXiangda subskills require stopping/);
assert.match(routerSkill, /reserve the canonical `main`\/`master` checkout/);
assert.match(routerSkill, /Do not turn a resolved request into a long design essay/);

const workspaceTemplate = fs.readFileSync(
  path.join(repoRoot, 'templates', 'openxiangda-react-spa', 'AGENTS.md'),
  'utf8',
);
assert.match(workspaceTemplate, /main`\/`master` 检出专用于集成和发布/);
assert.match(workspaceTemplate, /再补一次精确查询/);
assert.match(workspaceTemplate, /不再写长篇设计或重复确认/);

console.log('engineering policy smoke passed');
