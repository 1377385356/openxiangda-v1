import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const require = createRequire(import.meta.url);
const {
  assertCandidateBundleFilesCurrent,
  assertCandidateEnvironmentBindingsCurrent,
  bindEnvironmentTarget,
  buildCandidateEnvironmentBindings,
  buildCandidateBundle,
  buildSideEffectPolicyDiff,
  hasStateResourceMappings,
  inspectCandidateBundleFiles,
  inspectCandidateEnvironmentBindings,
  isRecoverablePostActivationDeploymentError,
  managedTargetDeploymentFile,
  normalizeManagedChangeSourceBase,
  normalizeManagedReleaseSourceRevision,
  normalizeReleaseSourceRevisionForBaseline,
  readCandidate,
  readRememberedTargetDeployment,
  releaseExecutionPath,
  rememberTargetDeployment,
  resolveManagedStateBinding,
  resolveEnvironmentTarget,
  saveCandidate,
  withManagedReleaseForwardedFlags,
  withOnlineBaselineAdoptionFlags,
  withReleaseClientSessionArgs,
} = require(path.join(repoRoot, 'lib', 'application-environments.js'));
const { startDeveloperCenter } = require(
  path.join(repoRoot, 'lib', 'developer-center.js')
);
const {
  deploymentEvidencePendingError,
  deploymentQueueWaitDecision,
} = require(path.join(repoRoot, 'lib', 'cli.js'));

assert.deepEqual(deploymentQueueWaitDecision('running'), {
  status: 'running',
  wait: true,
  evidencePending: false,
});
assert.deepEqual(deploymentQueueWaitDecision('deployed'), {
  status: 'deployed',
  wait: false,
  evidencePending: true,
});
assert.equal(
  deploymentQueueWaitDecision('succeeded').wait,
  false,
  'a finalized deployment must not keep the queue polling loop alive'
);
const evidencePendingError = deploymentEvidencePendingError({
  deploymentId: '30000000-0000-4000-8000-000000000099',
  status: 'deployed',
});
assert.equal(evidencePendingError.code, 'APP_DEPLOYMENT_EVIDENCE_PENDING');
assert.match(evidencePendingError.message, /待提交测试证据/);
assert.equal(evidencePendingError.data.nextAction, 'release test');

for (const template of [
  'openxiangda-react-spa',
  'sy-lowcode-app-workspace',
]) {
  assert.match(
    fs.readFileSync(
      path.join(repoRoot, 'templates', template, '.gitignore'),
      'utf8'
    ),
    /^\.openxiangda\/candidates\/$/m
  );
  assert.match(
    fs.readFileSync(
      path.join(repoRoot, 'templates', template, '.gitignore'),
      'utf8'
    ),
    /^\.openxiangda\/releases\/$/m
  );
  assert.match(
    fs.readFileSync(
      path.join(repoRoot, 'templates', template, '.gitignore'),
      'utf8'
    ),
    /^\.openxiangda\/worktree-managed\.json$/m
  );
}

const temp = fs.mkdtempSync(
  path.join(os.tmpdir(), 'openxiangda-application-environments-')
);
fs.mkdirSync(path.join(temp, 'src'), { recursive: true });
fs.writeFileSync(path.join(temp, 'src', 'index.ts'), 'export const value = 1;\n');

const state = {
  version: 1,
  logicalApp: {
    id: 'logical-app-1',
    code: 'sample-app',
    name: 'Sample App',
  },
  profiles: {
    sample: {
      appType: 'APP_PRE',
      resources: {
        forms: {
          customer: {
            formUuid: 'FORM_CUSTOMER',
            updatedAt: '2026-07-01T00:00:00.000Z',
            schemaSyncedAt: '2026-07-01T00:00:00.000Z',
            bundlePublishedAt: '2026-07-01T00:00:00.000Z',
          },
        },
        dataViews: {
          member_stats: {
            dataViewId: 'DATA_VIEW_MEMBER_STATS',
            materializedViewName: 'mv_member_stats',
            status: 'active',
            storageMode: 'materialized',
          },
        },
        storageConfigs: {
          member_assets: {
            storageConfigId: 'STORAGE_MEMBER_ASSETS',
            provider: 'minio',
            status: 'active',
          },
        },
      },
    },
  },
  targets: {},
};
const pre = bindEnvironmentTarget(state, {
  targetName: 'sample-pre',
  profile: 'sample',
  environmentId: '10000000-0000-4000-8000-000000000001',
  kind: 'preproduction',
  appType: 'APP_PRE',
  seedResources: state.profiles.sample.resources,
});
const prod = bindEnvironmentTarget(state, {
  targetName: 'sample-prod',
  profile: 'sample',
  environmentId: '10000000-0000-4000-8000-000000000002',
  kind: 'production',
  appType: 'APP_PROD',
});
assert.equal(pre.appType, 'APP_PRE');
assert.equal(prod.appType, 'APP_PROD');
assert.equal(pre.resources.forms.customer.formUuid, 'FORM_CUSTOMER');
assert.notEqual(pre.resources, state.profiles.sample.resources);
assert.equal(hasStateResourceMappings(pre.resources), true);
assert.equal(hasStateResourceMappings(prod.resources), false);
assert.equal(resolveEnvironmentTarget(state, 'preproduction').targetName, 'sample-pre');
assert.equal(resolveEnvironmentTarget(state, 'sample-prod').binding.appType, 'APP_PROD');
assert.equal(state.currentTarget, 'sample-pre');
const policyPatch = buildSideEffectPolicyDiff(
  {
    notifications: 'tester_allowlist',
    notificationAllowlist: [],
    organizationWrites: 'deny',
    scheduledAutomations: 'disabled',
    externalWrites: 'allowlist',
    payments: 'deny',
    publicIndexing: 'deny',
    environmentBanner: true,
  },
  {
    notifications: 'real',
    organizationWrites: 'explicit_capability_only',
    externalDingTalkDepartmentRootId: 996194759,
  },
);
assert.equal(policyPatch.changed, true);
assert.equal(policyPatch.after.payments, 'deny');
assert.equal(
  policyPatch.after.externalDingTalkDepartmentRootId,
  '996194759',
);
const policyReplacement = buildSideEffectPolicyDiff(
  policyPatch.before,
  { payments: 'deny' },
  { fullReplace: true },
);
assert.deepEqual(policyReplacement.after, { payments: 'deny' });
assert.equal(
  policyReplacement.changes.some(
    change => change.field === 'scheduledAutomations' && change.after === null,
  ),
  true,
);
assert.throws(
  () =>
    buildSideEffectPolicyDiff(policyPatch.before, {
      organizationWrites: 'unrestricted',
    }),
  /explicit_capability_only/,
);
const reassignedPre = bindEnvironmentTarget(state, {
  targetName: 'sample-pre',
  profile: 'sample',
  environmentId: '10000000-0000-4000-8000-000000000002',
  kind: 'preproduction',
  appType: 'APP_PROD',
  seedResources: prod.resources,
  replaceResources: true,
});
assert.equal(reassignedPre.appType, 'APP_PROD');
assert.equal(hasStateResourceMappings(reassignedPre.resources), false);
const restoredPre = bindEnvironmentTarget(state, {
  targetName: 'sample-pre',
  profile: 'sample',
  environmentId: '10000000-0000-4000-8000-000000000001',
  kind: 'preproduction',
  appType: 'APP_PRE',
  seedResources: pre.resources,
  replaceResources: true,
});
assert.equal(restoredPre.resources.forms.customer.formUuid, 'FORM_CUSTOMER');
assert.equal(
  resolveManagedStateBinding({
    state,
    targetName: 'sample-pre',
    appType: 'APP_PRE',
    environmentId: '10000000-0000-4000-8000-000000000001',
  }),
  restoredPre
);
assert.throws(
  () =>
    resolveManagedStateBinding({
      state,
      targetName: 'sample-pre',
      appType: 'APP_PROD',
      environmentId: '10000000-0000-4000-8000-000000000001',
    }),
  /状态与当前写入目标不一致/
);

const managedTarget = {
  logicalApp: {
    sourceRepositoryId: `sha256:${'a'.repeat(64)}`,
  },
};
const managedRevisionInput = {
  repo: `sha256:${'b'.repeat(64)}`,
  repositoryId: `sha256:${'b'.repeat(64)}`,
  repoAliases: [
    `sha256:${'b'.repeat(64)}`,
    `sha256:${'a'.repeat(64)}`,
  ],
  baseCommit: 'c'.repeat(40),
  treeHash: 'd'.repeat(40),
  branch: 'master',
  remoteName: 'origin',
  remoteUrlHash: `sha256:${'e'.repeat(64)}`,
  remoteUrlHashAliases: [
    `sha256:${'f'.repeat(64)}`,
    `sha256:${'e'.repeat(64)}`,
  ],
  mainBranch: 'master',
  mainTipCommit: 'c'.repeat(40),
  mainlinePolicy: 'publish-from-main-v1',
  capturedAt: '2026-07-19T10:00:00.000Z',
  worktreeRoot: '/private/workspace-one',
};
const managedRevision = normalizeManagedReleaseSourceRevision(
  managedTarget,
  managedRevisionInput
);
assert.equal(
  managedRevision.repositoryId,
  managedTarget.logicalApp.sourceRepositoryId
);
assert.equal(managedRevision.repo, managedTarget.logicalApp.sourceRepositoryId);
assert.equal(managedRevision.capturedAt, undefined);
assert.equal(managedRevision.worktreeRoot, undefined);
assert.deepEqual(
  managedRevision,
  normalizeManagedReleaseSourceRevision(managedTarget, {
    ...managedRevisionInput,
    capturedAt: '2026-07-19T11:00:00.000Z',
    worktreeRoot: '/private/workspace-two',
  })
);
assert.throws(
  () =>
    normalizeManagedReleaseSourceRevision(
      managedTarget,
      {
        ...managedRevisionInput,
        repoAliases: [`sha256:${'b'.repeat(64)}`],
      },
      { errorCode: 'CANDIDATE_REPOSITORY_MISMATCH' }
    ),
  /CANDIDATE_REPOSITORY_MISMATCH/
);
assert.equal(
  normalizeManagedChangeSourceBase(
    managedTarget,
    {
      repo: `sha256:${'b'.repeat(64)}`,
      baseCommit: '1'.repeat(40),
      treeHash: '2'.repeat(40),
    },
    managedRevision
  ).repo,
  managedTarget.logicalApp.sourceRepositoryId
);
assert.throws(
  () =>
    normalizeManagedChangeSourceBase(
      managedTarget,
      {
        repo: `sha256:${'f'.repeat(64)}`,
        baseCommit: '1'.repeat(40),
        treeHash: '2'.repeat(40),
      },
      {
        repo: `sha256:${'b'.repeat(64)}`,
        repoAliases: [`sha256:${'b'.repeat(64)}`],
      }
    ),
  /RELEASE_SOURCE_BASE_REPOSITORY_MISMATCH/
);

const cloneRepositoryId = `sha256:${'1'.repeat(64)}`;
const frozenRepositoryId = `sha256:${'2'.repeat(64)}`;
const baselineRevision = normalizeReleaseSourceRevisionForBaseline(
  {},
  { repo: frozenRepositoryId },
  {
    repo: cloneRepositoryId,
    repositoryId: cloneRepositoryId,
    repoAliases: [cloneRepositoryId, frozenRepositoryId],
    baseCommit: '3'.repeat(40),
    treeHash: '4'.repeat(40),
  },
  { errorCode: 'RELEASE_SOURCE_REPOSITORY_MISMATCH' }
);
assert.equal(baselineRevision.repo, frozenRepositoryId);
assert.equal(baselineRevision.repositoryId, frozenRepositoryId);
assert.deepEqual(baselineRevision.repoAliases, [
  cloneRepositoryId,
  frozenRepositoryId,
]);
assert.throws(
  () =>
    normalizeReleaseSourceRevisionForBaseline(
      {},
      { repo: `sha256:${'5'.repeat(64)}` },
      {
        repo: cloneRepositoryId,
        repoAliases: [cloneRepositoryId, frozenRepositoryId],
      },
      { errorCode: 'RELEASE_SOURCE_REPOSITORY_MISMATCH' }
    ),
  error =>
    error?.code === 'RELEASE_SOURCE_REPOSITORY_MISMATCH' &&
    error?.details?.expectedRepositoryId === `sha256:${'5'.repeat(64)}`
);

const candidateInput = {
  cwd: temp,
  logicalAppCode: 'sample-app',
  changeId: 'change-1',
  sourceRevision: {
    repo: 'sha256:repo',
    baseCommit: 'a'.repeat(40),
    treeHash: 'b'.repeat(40),
  },
  runtimeMode: 'react-spa',
  targets: { runtime: true, functions: ['hello'] },
  files: ['src/index.ts'],
  environmentBindings: buildCandidateEnvironmentBindings(state),
  runtimeArtifacts: [
    {
      targetName: 'sample-pre',
      appType: 'APP_PRE',
      buildId: 'candidate-build-1',
      artifactHash: '9'.repeat(64),
      files: [],
    },
  ],
  prepublishVerificationHash: 'f'.repeat(64),
  candidatePreflightHash: 'e'.repeat(64),
  openxiangdaVersion: '1.0.179',
};
const first = buildCandidateBundle(candidateInput);
const second = buildCandidateBundle(candidateInput);
assert.equal(first.candidateHash, second.candidateHash);
assert.equal(first.sourceBundleManifest.files.length, 1);
assert.equal(first.sourceBundleManifest.files[0].path, 'src/index.ts');
assert.equal(first.sourceBundleManifest.inputPolicy, 'candidate-inputs-v2');
assert.equal(first.sourceBundleManifest.runtimeArtifacts.length, 1);
assert.equal(
  first.sourceBundleManifest.environmentBindings['sample-pre']
    .resources.forms.customer.formUuid,
  'FORM_CUSTOMER'
);
assert.equal(
  first.sourceBundleManifest.environmentBindings['sample-pre']
    .resources.forms.customer.updatedAt,
  undefined,
  'candidate resource bindings must exclude mutable observation timestamps'
);
assert.deepEqual(
  first.sourceBundleManifest.environmentBindings['sample-pre']
    .resources.dataViews.member_stats,
  {
    dataViewId: 'DATA_VIEW_MEMBER_STATS',
    materializedViewName: 'mv_member_stats',
    storageMode: 'materialized',
  },
  'candidate data-view bindings must exclude only lifecycle status'
);
assert.equal(
  first.sourceBundleManifest.environmentBindings['sample-pre']
    .resources.storageConfigs.member_assets.status,
  'active',
  'non-data-view status must remain sealed'
);
assert.equal(
  first.sourceBundleManifest.prepublishVerificationHash,
  'f'.repeat(64),
);
assert.equal(
  first.sourceBundleManifest.candidatePreflightHash,
  'e'.repeat(64),
);
assert.equal(
  inspectCandidateBundleFiles(first.sourceBundleManifest, temp).valid,
  true,
);
assert.equal(
  assertCandidateBundleFilesCurrent(
    { sourceBundleManifest: first.sourceBundleManifest },
    temp,
  ).checked,
  1,
);
assert.equal(
  first.sourceBundleManifest.files[0].hashPolicy,
  undefined,
  'ordinary candidate files must keep legacy raw-byte hashing',
);

const stateFile = path.join(temp, '.openxiangda', 'state.json');
const writeState = () => {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
};
writeState();
const stateCandidate = buildCandidateBundle({
  ...candidateInput,
  files: ['.openxiangda/state.json'],
});
assert.equal(
  stateCandidate.sourceBundleManifest.files[0].hashPolicy,
  'openxiangda-state-stable-managed-bindings-v2',
);
state.targets['sample-pre'].promotion = {
  publishLease: {
    leaseId: 'lease-created-by-release-begin',
    changeId: 'change-1',
    expiresAt: '2026-07-28T03:10:00.000Z',
  },
  changeBaseline: {
    baselineId: 'baseline-created-by-release-begin',
    changeId: 'change-1',
    updatedAt: '2026-07-28T03:00:00.000Z',
  },
};
state.targets['sample-pre'].updatedAt = '2026-07-28T03:00:00.000Z';
state.targets['sample-pre'].resources.forms.created_by_form_ensure = {
  formUuid: 'FORM_CREATED_DURING_RELEASE',
  updatedAt: '2026-07-28T03:00:00.000Z',
  schemaSyncedAt: '2026-07-28T03:00:00.000Z',
};
state.targets['sample-pre'].runtime = {
  activeReleaseId: 'RUNTIME_CREATED_DURING_RELEASE',
  activeBuildId: 'candidate-build-1',
  updatedAt: '2026-07-28T03:00:00.000Z',
};
writeState();
assert.equal(
  inspectCandidateBundleFiles(
    stateCandidate.sourceBundleManifest,
    temp,
  ).valid,
  true,
  'release-managed promotion, resource, and runtime bindings must not invalidate state.json',
);
assert.equal(
  assertCandidateBundleFilesCurrent(
    { sourceBundleManifest: stateCandidate.sourceBundleManifest },
    temp,
  ).checked,
  1,
  'form/resource stages after release begin must accept the sealed state.json input',
);
assert.equal(
  assertCandidateEnvironmentBindingsCurrent(
    { sourceBundleManifest: stateCandidate.sourceBundleManifest },
    state,
  ).checked,
  2,
  'additive form bindings created by the candidate must remain valid',
);
state.targets['sample-pre'].appType = 'APP_TAMPERED';
writeState();
assert.equal(
  inspectCandidateBundleFiles(
    stateCandidate.sourceBundleManifest,
    temp,
  ).mismatches[0].reason,
  'changed',
  'real environment binding changes must remain candidate input changes',
);
assert.throws(
  () =>
    assertCandidateBundleFilesCurrent(
      { sourceBundleManifest: stateCandidate.sourceBundleManifest },
      temp,
    ),
  { code: 'CANDIDATE_INPUTS_CHANGED' },
);
state.targets['sample-pre'].appType = 'APP_PRE';
delete state.targets['sample-pre'].promotion;
delete state.targets['sample-pre'].updatedAt;
writeState();
assert.equal(
  assertCandidateEnvironmentBindingsCurrent(
    { sourceBundleManifest: first.sourceBundleManifest },
    state
  ).checked,
  2
);
state.targets['sample-pre'].resources.forms.customer.updatedAt =
  '2026-07-28T03:00:00.000Z';
state.targets['sample-pre'].resources.forms.customer.schemaSyncedAt =
  '2026-07-28T03:00:00.000Z';
state.targets['sample-pre'].resources.forms.customer.bundlePublishedAt =
  '2026-07-28T03:00:00.000Z';
assert.equal(
  inspectCandidateEnvironmentBindings(
    { sourceBundleManifest: first.sourceBundleManifest },
    state
  ).valid,
  true,
  'form-stage timestamp refreshes must not invalidate sealed resource identities'
);
state.targets['sample-pre'].resources.forms.customer.label =
  'allowed additive metadata';
assert.equal(
  inspectCandidateEnvironmentBindings(
    { sourceBundleManifest: first.sourceBundleManifest },
    state
  ).valid,
  true,
  'resource IDs created or enriched after candidate sealing may be additive'
);
const legacyActiveDataViewBindings = structuredClone(
  first.sourceBundleManifest.environmentBindings
);
legacyActiveDataViewBindings[
  'sample-pre'
].resources.dataViews.member_stats.status = 'active';
const legacyActiveDataViewCandidate = buildCandidateBundle({
  ...candidateInput,
  environmentBindings: legacyActiveDataViewBindings,
});
assert.equal(
  legacyActiveDataViewCandidate.sourceBundleManifest.environmentBindings[
    'sample-pre'
  ].resources.dataViews.member_stats.status,
  'active',
  'the compatibility fixture must retain the status sealed by 1.0.253'
);
state.targets['sample-pre'].resources.dataViews.member_stats.status = 'draft';
assert.equal(
  assertCandidateEnvironmentBindingsCurrent(
    { sourceBundleManifest: legacyActiveDataViewCandidate.sourceBundleManifest },
    state
  ).checked,
  2,
  'a 1.0.253 candidate sealed while active must survive its own active-to-draft stage'
);
const legacyDraftDataViewBindings = structuredClone(
  first.sourceBundleManifest.environmentBindings
);
legacyDraftDataViewBindings[
  'sample-pre'
].resources.dataViews.member_stats.status = 'draft';
const legacyDraftDataViewCandidate = buildCandidateBundle({
  ...candidateInput,
  environmentBindings: legacyDraftDataViewBindings,
});
state.targets['sample-pre'].resources.dataViews.member_stats.status = 'active';
assert.equal(
  inspectCandidateEnvironmentBindings(
    { sourceBundleManifest: legacyDraftDataViewCandidate.sourceBundleManifest },
    state
  ).valid,
  true,
  'a candidate sealed while draft must survive draft-to-active before production confirmation'
);
for (const [field, changedValue] of [
  ['dataViewId', 'DATA_VIEW_CHANGED'],
  ['materializedViewName', 'mv_member_stats_changed'],
  ['storageMode', 'virtual'],
]) {
  const original =
    state.targets['sample-pre'].resources.dataViews.member_stats[field];
  state.targets['sample-pre'].resources.dataViews.member_stats[field] =
    changedValue;
  assert.equal(
    inspectCandidateEnvironmentBindings(
      { sourceBundleManifest: first.sourceBundleManifest },
      state
    ).valid,
    false,
    `data-view ${field} drift must remain fail-closed`
  );
  state.targets['sample-pre'].resources.dataViews.member_stats[field] = original;
}
state.targets['sample-pre'].resources.storageConfigs.member_assets.status =
  'draft';
assert.equal(
  inspectCandidateEnvironmentBindings(
    { sourceBundleManifest: first.sourceBundleManifest },
    state
  ).valid,
  false,
  'status changes outside data-view bindings must remain fail-closed'
);
state.targets['sample-pre'].resources.storageConfigs.member_assets.status =
  'active';
state.targets['sample-pre'].resources.forms.customer.formUuid =
  'FORM_CHANGED';
writeState();
assert.equal(
  inspectCandidateBundleFiles(
    stateCandidate.sourceBundleManifest,
    temp,
  ).valid,
  true,
  'state file hashing delegates sealed managed resource identities to environmentBindings',
);
assert.throws(
  () =>
    assertCandidateEnvironmentBindingsCurrent(
      { sourceBundleManifest: first.sourceBundleManifest },
      state
    ),
  { code: 'CANDIDATE_ENVIRONMENT_BINDINGS_CHANGED' }
);
state.targets['sample-pre'].resources.forms.customer.formUuid =
  'FORM_CUSTOMER';

fs.writeFileSync(path.join(temp, 'src', 'index.ts'), 'export const value = 2;\n');
const changed = buildCandidateBundle(candidateInput);
assert.notEqual(changed.candidateHash, first.candidateHash);
assert.equal(
  inspectCandidateBundleFiles(first.sourceBundleManifest, temp).mismatches[0]
    .reason,
  'changed',
);
assert.throws(
  () =>
    assertCandidateBundleFilesCurrent(
      { sourceBundleManifest: first.sourceBundleManifest },
      temp,
    ),
  { code: 'CANDIDATE_INPUTS_CHANGED' },
);
const deletedInput = buildCandidateBundle({
  ...candidateInput,
  files: ['src/deleted.ts'],
});
assert.equal(deletedInput.sourceBundleManifest.files[0].exists, false);
assert.equal(
  inspectCandidateBundleFiles(deletedInput.sourceBundleManifest, temp).valid,
  true,
);
fs.writeFileSync(path.join(temp, 'src', 'deleted.ts'), 'reappeared\n');
assert.equal(
  inspectCandidateBundleFiles(deletedInput.sourceBundleManifest, temp)
    .mismatches[0].reason,
  'reappeared',
);

const candidateId = '20000000-0000-4000-8000-000000000001';
const candidatePath = saveCandidate(
  {
    id: candidateId,
    candidateHash: first.candidateHash,
    sourceBundleManifest: first.sourceBundleManifest,
  },
  temp
);
assert.equal(readCandidate(candidateId, temp).candidateHash, first.candidateHash);
assert.equal(fs.statSync(candidatePath).mode & 0o777, 0o600);
const deploymentTarget = {
  logicalApp: { code: 'sample-app' },
  targetName: 'sample-pre',
  environmentId: '10000000-0000-4000-8000-000000000001',
  appType: 'APP_PRE',
  bound: {
    resources: {},
  },
};
const deploymentState = rememberTargetDeployment(
  deploymentTarget,
  {
    id: 'deployment-1',
    candidateId,
    status: 'failed',
  },
  temp
);
assert.equal(
  deploymentState.file,
  managedTargetDeploymentFile(deploymentTarget, temp)
);
assert.equal(fs.statSync(deploymentState.file).mode & 0o777, 0o600);
assert.deepEqual(
  readRememberedTargetDeployment(deploymentTarget, temp),
  deploymentState.record
);
assert.deepEqual(
  deploymentTarget.bound,
  { resources: {} },
  'volatile deployment state must not dirty the durable target binding'
);
assert.deepEqual(
  readRememberedTargetDeployment(
    {
      ...deploymentTarget,
      targetName: 'legacy-target',
      bound: {
        lastDeploymentId: 'legacy-deployment',
        lastCandidateId: 'legacy-candidate',
        lastDeploymentStatus: 'succeeded',
      },
    },
    temp
  ),
  {
    schemaVersion: 'openxiangda_target_deployment_v1',
    deploymentId: 'legacy-deployment',
    candidateId: 'legacy-candidate',
    status: 'succeeded',
    migratedFromProjectState: true,
  },
  'old state.json deployment pointers must remain readable during migration'
);
assert.equal(
  releaseExecutionPath('change-1', 'deployment-1', temp),
  path.join(
    temp,
    '.openxiangda',
    'releases',
    'change-1',
    'deployment-1',
    'execution.json'
  )
);
assert.deepEqual(
  withOnlineBaselineAdoptionFlags(
    ['resource', 'publish', 'form-setting', '--only', 'contract'],
    {
      'adopt-online-baseline': true,
      'adoption-reason': 'historical releases were published in separate batches',
    }
  ),
  [
    'resource',
    'publish',
    'form-setting',
    '--only',
    'contract',
    '--adopt-online-baseline',
    '--adoption-reason',
    'historical releases were published in separate batches',
  ],
  'legacy release stages must forward baseline adoption to exact resource selectors'
);
assert.deepEqual(
  withOnlineBaselineAdoptionFlags(
    ['runtime', 'deploy', '--no-activate'],
    {
      'adopt-online-baseline': true,
      'adoption-reason': 'historical releases were published in separate batches',
    }
  ),
  ['runtime', 'deploy', '--no-activate'],
  'baseline adoption must never leak into Runtime stages'
);
assert.deepEqual(
  withManagedReleaseForwardedFlags(
    'backend-stage',
    ['resource', 'publish', '--only', 'function:hello'],
    {
      'adopt-online-baseline': true,
      'adoption-reason': 'historical releases were published in separate batches',
    }
  ),
  [
    'resource',
    'publish',
    '--only',
    'function:hello',
    '--include-noop',
    '--adopt-online-baseline',
    '--adoption-reason',
    'historical releases were published in separate batches',
  ]
);
assert.deepEqual(
  withManagedReleaseForwardedFlags(
    'backend-stage',
    ['resource', 'publish', '--only', 'function:portal_reservation_calendar'],
    {
      'replace-manifest': true,
      reason: 'reviewed exact Function manifest replacement',
    }
  ),
  [
    'resource',
    'publish',
    '--only',
    'function:portal_reservation_calendar',
    '--include-noop',
    '--replace-manifest',
    '--reason',
    'reviewed exact Function manifest replacement',
  ],
  'managed ship must forward manifest replacement only to an exact backend stage'
);
assert.deepEqual(
  withManagedReleaseForwardedFlags(
    'workflow-stage',
    ['resource', 'publish', '--only', 'workflow:reservation'],
    {
      'replace-manifest': true,
      reason: 'reviewed exact Function manifest replacement',
    }
  ),
  [
    'resource',
    'publish',
    '--only',
    'workflow:reservation',
    '--include-noop',
  ],
  'manifest replacement must not leak into workflow stages'
);
assert.deepEqual(
  withManagedReleaseForwardedFlags(
    'backend-stage',
    ['resource', 'publish', 'function', '--all'],
    {
      'replace-manifest': true,
      reason: 'reviewed exact Function manifest replacement',
    }
  ),
  [
    'resource',
    'publish',
    'function',
    '--all',
    '--include-noop',
  ],
  'manifest replacement must never be forwarded to an unscoped backend stage'
);
assert.deepEqual(
  withManagedReleaseForwardedFlags(
    'form-stage',
    ['resource', 'publish', '--only', 'example'],
    {
      'adopt-online-baseline': true,
      'adoption-reason': 'historical releases were published in separate batches',
    }
  ),
  [
    'resource',
    'publish',
    '--only',
    'example',
    '--adopt-online-baseline',
    '--adoption-reason',
    'historical releases were published in separate batches',
  ]
);
for (const stepId of ['backend-stage', 'workflow-stage']) {
  assert.deepEqual(
    withManagedReleaseForwardedFlags(
      stepId,
      ['resource', 'publish', '--only', 'example'],
      {
        'adopt-online-baseline': true,
        'adoption-reason': 'historical releases were published in separate batches',
      }
    ),
    [
      'resource',
      'publish',
      '--only',
      'example',
      '--include-noop',
      '--adopt-online-baseline',
      '--adoption-reason',
      'historical releases were published in separate batches',
    ]
  );
}
assert.deepEqual(
  withManagedReleaseForwardedFlags(
    'workflow-stage',
    ['resource', 'publish', '--only', 'example'],
    {}
  ),
  [
    'resource',
    'publish',
    '--only',
    'example',
    '--include-noop',
  ]
);
assert.deepEqual(
  withManagedReleaseForwardedFlags(
    'runtime-stage',
    ['runtime', 'deploy'],
    {
      'adopt-online-baseline': true,
      'adoption-reason': 'historical releases were published in separate batches',
    }
  ),
  ['runtime', 'deploy']
);
assert.deepEqual(
  withManagedReleaseForwardedFlags(
    'runtime-stage',
    ['runtime', 'deploy'],
    {
      'allow-runtime-rollback': true,
      reason: 'audited Runtime source lineage rollback',
    }
  ),
  [
    'runtime',
    'deploy',
    '--allow-runtime-rollback',
    '--reason',
    'audited Runtime source lineage rollback',
  ],
  'managed release must forward the audited rollback exception to runtime-stage'
);
for (const stepId of [
  'backend-stage',
  'workflow-stage',
  'form-stage',
  'app-finalize',
]) {
  const stepArgs =
    stepId === 'app-finalize'
      ? ['release', 'app-finalize', '--change', 'change-1']
      : ['resource', 'publish', '--only', 'example'];
  const forwarded = withManagedReleaseForwardedFlags(stepId, stepArgs, {
    'allow-runtime-rollback': true,
    reason: 'audited Runtime source lineage rollback',
  });
  assert.equal(
    forwarded.includes('--allow-runtime-rollback'),
    false,
    `Runtime rollback exception must not leak into ${stepId}`
  );
  assert.equal(
    forwarded.includes('audited Runtime source lineage rollback'),
    false,
    `Runtime rollback reason must not leak into ${stepId}`
  );
}
assert.deepEqual(
  withManagedReleaseForwardedFlags(
    'config-route',
    ['resource', 'publish', 'route', '--only', 'admin.dashboard'],
    {
      'adopt-online-baseline': true,
      'adoption-reason': 'historical releases were published in separate batches',
    }
  ),
  [
    'resource',
    'publish',
    'route',
    '--only',
    'admin.dashboard',
    '--adopt-online-baseline',
    '--adoption-reason',
    'historical releases were published in separate batches',
  ],
  'managed catch-up must forward adoption to exact generic resource stages'
);
assert.deepEqual(
  withManagedReleaseForwardedFlags(
    'config-route',
    ['resource', 'publish', 'route', '--all'],
    {
      'adopt-online-baseline': true,
      'adoption-reason': 'historical releases were published in separate batches',
    }
  ),
  ['resource', 'publish', 'route', '--all'],
  'managed catch-up must never forward adoption to an unscoped resource stage'
);
assert.deepEqual(
  withReleaseClientSessionArgs(
    ['release', 'begin', '--change', 'change-1'],
    { 'client-session-id': 'codex:managed-release-1' }
  ),
  [
    'release',
    'begin',
    '--change',
    'change-1',
    '--client-session-id',
    'codex:managed-release-1',
  ]
);
assert.deepEqual(
  withReleaseClientSessionArgs(
    ['release', 'begin', '--change', 'change-1'],
    {}
  ),
  ['release', 'begin', '--change', 'change-1']
);
assert.equal(
  isRecoverablePostActivationDeploymentError(
    {
      message:
        '项目状态并发冲突: targets.sample-pre.promotion.publishLease 已被其他进程修改',
    },
    {
      status: 'deployed',
      targetAppReleaseId: '30000000-0000-4000-8000-000000000001',
    }
  ),
  true
);
assert.equal(
  isRecoverablePostActivationDeploymentError(
    { message: 'post-commit health check failed' },
    {
      status: 'deployed',
      targetAppReleaseId: '30000000-0000-4000-8000-000000000001',
    }
  ),
  false
);
assert.equal(
  isRecoverablePostActivationDeploymentError(
    {
      message:
        '项目状态并发冲突: targets.sample-pre.promotion.publishLease 已被其他进程修改',
    },
    { status: 'failed', targetAppReleaseId: null }
  ),
  false
);

const actions = [];
const center = await startDeveloperCenter({
  port: 0,
  getStatus: async () => ({ ok: true }),
  runAction: async body => {
    actions.push(body);
    return { accepted: body.action };
  },
});
try {
  const page = await fetch(center.url);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /OpenXiangda Developer Center/);

  const unauthenticated = await fetch(
    `http://${center.host}:${center.port}/api/status`
  );
  assert.equal(unauthenticated.status, 401);

  const status = await fetch(
    `http://${center.host}:${center.port}/api/status`,
    { headers: { 'x-openxiangda-studio-token': center.token } }
  );
  assert.deepEqual(await status.json(), { ok: true });

  const action = await fetch(
    `http://${center.host}:${center.port}/api/action`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-openxiangda-studio-token': center.token,
      },
      body: JSON.stringify({ action: 'refresh' }),
    }
  );
  assert.deepEqual(await action.json(), { accepted: 'refresh' });
  assert.deepEqual(actions, [{ action: 'refresh' }]);
} finally {
  await new Promise(resolve => center.server.close(resolve));
}

console.log('application environments smoke passed');
