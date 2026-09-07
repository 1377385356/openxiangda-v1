import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const cli = path.join(repoRoot, 'bin', 'openxiangda.js');
const require = createRequire(import.meta.url);
const { sha256Canonical } = require(
  path.join(repoRoot, 'lib', 'application-environments.js'),
);
const {
  inspectSucceededPreproductionDeployment,
  recoveredPreproductionShipPatch,
  selectSucceededPreproductionDeployment,
} = require(path.join(repoRoot, 'lib', 'cli.js'));
const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'openxiangda-release-ship-gate-'),
);
const home = path.join(tempRoot, 'home');
const workspace = path.join(tempRoot, 'workspace');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: workspace,
    env: { ...process.env, HOME: home },
    encoding: 'utf8',
  });
}

const recoveryCandidate = {
  id: 'e976f2aa-9ab7-457b-8e1d-73d8cb7d8b12',
  candidateHash: 'candidate-hash-f0a1707',
  testPlanHash: 'test-plan-hash-f0a1707',
};
const recoveryTarget = {
  environmentId: '10000000-0000-4000-8000-000000000001',
  environmentKind: 'preproduction',
  appType: 'APP_PRE',
};
const replacementEvidence = {
  schemaVersion: 1,
  deploymentId: 'b0514c77-c6cf-4b25-bd0a-14a83b7f2cf0',
  candidateId: recoveryCandidate.id,
  candidateHash: recoveryCandidate.candidateHash,
  testPlanHash: recoveryCandidate.testPlanHash,
  environmentId: recoveryTarget.environmentId,
  environmentKind: 'preproduction',
  appType: recoveryTarget.appType,
  appReleaseId: 'bee304af-cb3c-4f55-b526-4e6b09bcfc12',
  outcome: 'passed',
  finishedAt: '2030-01-01T00:00:00.000Z',
  validUntil: '2030-01-02T00:00:00.000Z',
};
const replacementDeployment = {
  id: replacementEvidence.deploymentId,
  kind: 'deploy',
  candidateId: recoveryCandidate.id,
  targetEnvironmentId: recoveryTarget.environmentId,
  targetAppReleaseId: replacementEvidence.appReleaseId,
  status: 'succeeded',
  evidenceSummary: replacementEvidence,
  evidenceHash: sha256Canonical(replacementEvidence),
  createdAt: '2030-01-01T00:00:00.000Z',
};
const recoveryContext = {
  candidate: recoveryCandidate,
  target: recoveryTarget,
  currentAppReleaseId: replacementEvidence.appReleaseId,
};
const historicalFailedDeployment = {
  ...replacementDeployment,
  id: 'ce046010-3a34-46f8-82ad-39c0320fbf56',
  status: 'failed',
  evidenceSummary: null,
  evidenceHash: null,
  createdAt: '2029-12-31T00:00:00.000Z',
};
const recoveredDeployment = selectSucceededPreproductionDeployment(
  [historicalFailedDeployment, replacementDeployment],
  recoveryContext,
  Date.parse('2030-01-01T01:00:00.000Z'),
);
assert.equal(
  recoveredDeployment?.id,
  replacementDeployment.id,
  'a failed ship deployment must yield to the latest sealed succeeded deployment for the same candidate and preproduction head',
);
const recoveredPatch = recoveredPreproductionShipPatch(
  {
    deployment: recoveredDeployment,
    replacedDeploymentId: historicalFailedDeployment.id,
    replacedDeploymentStatus: historicalFailedDeployment.status,
  },
  recoveryCandidate,
  recoveryTarget,
  '2030-01-01T01:00:00.000Z',
);
assert.equal(recoveredPatch.preproductionDeploymentId, replacementDeployment.id);
assert.equal(recoveredPatch.preproductionStatus, 'succeeded');
assert.equal(
  recoveredPatch.preproductionEvidenceLineage.evidenceHash,
  replacementDeployment.evidenceHash,
);
assert.equal(
  recoveredPatch.preproductionRecovery.replacedDeploymentId,
  historicalFailedDeployment.id,
);

for (const [label, invalidDeployment] of [
  [
    'different candidate',
    { ...replacementDeployment, candidateId: 'different-candidate' },
  ],
  [
    'different environment',
    { ...replacementDeployment, targetEnvironmentId: 'different-environment' },
  ],
  ['failed replacement', { ...replacementDeployment, status: 'failed' }],
]) {
  assert.equal(
    selectSucceededPreproductionDeployment(
      [invalidDeployment],
      recoveryContext,
      Date.parse('2030-01-01T01:00:00.000Z'),
    ),
    null,
    `${label} must not authorize production promotion`,
  );
}
for (const [label, evidenceOverride] of [
  ['candidate hash mismatch', { candidateHash: 'different-hash' }],
  ['test plan hash mismatch', { testPlanHash: 'different-test-plan' }],
  ['evidence environment mismatch', { environmentId: 'different-environment' }],
]) {
  const invalidEvidence = {
    ...replacementEvidence,
    ...evidenceOverride,
  };
  const invalidDeployment = {
    ...replacementDeployment,
    evidenceSummary: invalidEvidence,
    evidenceHash: sha256Canonical(invalidEvidence),
  };
  assert.equal(
    selectSucceededPreproductionDeployment(
      [invalidDeployment],
      recoveryContext,
      Date.parse('2030-01-01T01:00:00.000Z'),
    ),
    null,
    `${label} must not authorize production promotion`,
  );
}
assert.equal(
  inspectSucceededPreproductionDeployment(
    {
      ...replacementDeployment,
      targetAppReleaseId: 'different-active-release',
    },
    recoveryContext,
    Date.parse('2030-01-01T01:00:00.000Z'),
  ).accepted,
  false,
  'a succeeded deployment that is no longer the current preproduction AppRelease must be rejected',
);

try {
  fs.mkdirSync(workspace, { recursive: true });
  writeJson(path.join(home, '.openxiangda', 'profiles.json'), {
    version: 1,
    currentProfile: 'dev',
    profiles: {
      dev: {
        baseUrl: 'http://127.0.0.1:9/service',
        token: { accessToken: 'test-access-token' },
      },
    },
  });
  writeJson(path.join(workspace, '.openxiangda', 'state.json'), {
    version: 1,
    logicalApp: {
      id: 'logical-app-1',
      code: 'sample-app',
      name: 'Sample App',
      sourceRepositoryId: 'sha256:sample',
    },
    currentTarget: 'sample-pre',
    targets: {
      'sample-pre': {
        targetName: 'sample-pre',
        profile: 'dev',
        environmentId: '10000000-0000-4000-8000-000000000001',
        kind: 'preproduction',
        appType: 'APP_PRE',
        resources: {},
      },
      'sample-prod': {
        targetName: 'sample-prod',
        profile: 'dev',
        environmentId: '10000000-0000-4000-8000-000000000002',
        kind: 'production',
        appType: 'APP_PROD',
        resources: {},
      },
    },
  });
  fs.writeFileSync(
    path.join(workspace, 'app-workspace.config.ts'),
    'export default { runtimeMode: "react-spa" };\n',
  );

  const unsupportedDryRun = run([
    'release',
    'ship',
    '--change',
    'sample-change',
    '--dry-run',
    '--profile',
    'dev',
    '--json',
  ]);
  assert.notEqual(unsupportedDryRun.status, 0);
  assert.match(
    unsupportedDryRun.stderr,
    /RELEASE_SHIP_UNSUPPORTED_FLAG.*--dry-run/,
  );
  assert.doesNotMatch(
    unsupportedDryRun.stderr,
    /ECONNREFUSED|fetch failed/,
    'unsupported flags must fail before the first remote write or request',
  );
  assert.equal(
    fs.existsSync(
      path.join(
        workspace,
        '.openxiangda',
        'releases',
        'sample-change',
        'ship.json',
      ),
    ),
    false,
    'unsupported flags must not create a local ship journal',
  );

  for (const invalidAdoptionArgs of [
    ['--adopt-online-baseline'],
    ['--adopt-online-baseline', '--adoption-reason', 'short'],
    ['--adoption-reason', 'historical mixed release lineage'],
  ]) {
    const invalidAdoption = run([
      'release',
      'ship',
      '--change',
      'sample-change',
      ...invalidAdoptionArgs,
      '--profile',
      'dev',
      '--json',
    ]);
    assert.notEqual(invalidAdoption.status, 0);
    assert.match(
      invalidAdoption.stderr,
      /RELEASE_SHIP_ADOPTION_(?:FLAG|REASON)_REQUIRED/,
    );
    assert.doesNotMatch(invalidAdoption.stderr, /ECONNREFUSED|fetch failed/);
    assert.equal(
      fs.existsSync(
        path.join(
          workspace,
          '.openxiangda',
          'releases',
          'sample-change',
          'ship.json',
        ),
      ),
      false,
      'invalid adoption flags must fail before creating a ship journal',
    );
  }

  for (const invalidReplacementArgs of [
    ['--replace-manifest'],
    ['--replace-manifest', '--reason', 'short'],
  ]) {
    const invalidReplacement = run([
      'release',
      'ship',
      '--change',
      'sample-change',
      ...invalidReplacementArgs,
      '--profile',
      'dev',
      '--json',
    ]);
    assert.notEqual(invalidReplacement.status, 0);
    assert.match(
      invalidReplacement.stderr,
      /RELEASE_SHIP_REPLACE_MANIFEST_(?:FLAG|REASON)_REQUIRED/,
    );
    assert.doesNotMatch(invalidReplacement.stderr, /ECONNREFUSED|fetch failed/);
    assert.equal(
      fs.existsSync(
        path.join(
          workspace,
          '.openxiangda',
          'releases',
          'sample-change',
          'ship.json',
        ),
      ),
      false,
      'invalid replacement flags must fail before creating a ship journal',
    );
  }

  const unscopedReason = run([
    'release',
    'ship',
    '--change',
    'sample-change',
    '--reason',
    'audited but missing scoped release exception',
    '--profile',
    'dev',
  ]);
  assert.notEqual(unscopedReason.status, 0);
  assert.match(
    unscopedReason.stderr,
    /RELEASE_SHIP_SCOPED_REASON_FLAG_REQUIRED/,
  );
  assert.doesNotMatch(unscopedReason.stderr, /ECONNREFUSED|fetch failed/);

  for (const invalidRuntimeRollbackArgs of [
    ['--allow-runtime-rollback'],
    ['--allow-runtime-rollback', '--reason', 'short'],
  ]) {
    const invalidRuntimeRollback = run([
      'release',
      'ship',
      '--change',
      'sample-change',
      ...invalidRuntimeRollbackArgs,
      '--profile',
      'dev',
    ]);
    assert.notEqual(invalidRuntimeRollback.status, 0);
    assert.match(
      invalidRuntimeRollback.stderr,
      /RELEASE_SHIP_RUNTIME_ROLLBACK_REASON_REQUIRED/,
    );
    assert.doesNotMatch(
      invalidRuntimeRollback.stderr,
      /ECONNREFUSED|fetch failed/,
    );
  }

  const supportedReplacement = run([
    'release',
    'ship',
    '--change',
    'sample-change',
    '--replace-manifest',
    '--reason',
    'reviewed exact manifest replacement',
    '--profile',
    'dev',
    '--json',
  ]);
  assert.notEqual(supportedReplacement.status, 0);
  assert.doesNotMatch(
    supportedReplacement.stderr,
    /RELEASE_SHIP_(?:UNSUPPORTED_FLAG|REPLACE_MANIFEST_(?:FLAG|REASON)_REQUIRED)/,
    'valid replacement flags must pass the ship argument gate',
  );

  const supportedAdoption = run([
    'release',
    'ship',
    '--change',
    'sample-change',
    '--adopt-online-baseline',
    '--adoption-reason',
    'historical mixed release lineage',
    '--profile',
    'dev',
    '--json',
  ]);
  assert.notEqual(supportedAdoption.status, 0);
  assert.doesNotMatch(
    supportedAdoption.stderr,
    /RELEASE_SHIP_(?:UNSUPPORTED_FLAG|ADOPTION_(?:FLAG|REASON)_REQUIRED)/,
    'valid adoption flags must pass the ship argument gate',
  );

  const supportedRuntimeRollback = run([
    'release',
    'ship',
    '--change',
    'sample-change',
    '--allow-runtime-rollback',
    '--reason',
    'audited Runtime source lineage rollback',
    '--profile',
    'dev',
  ]);
  assert.notEqual(supportedRuntimeRollback.status, 0);
  assert.doesNotMatch(
    supportedRuntimeRollback.stderr,
    /RELEASE_SHIP_(?:UNSUPPORTED_FLAG|RUNTIME_ROLLBACK_REASON_REQUIRED)/,
    'valid Runtime rollback flags must pass the ship argument gate',
  );

  for (const [releaseCommand, environmentArgs] of [
    ['deploy', ['--environment', 'sample-pre']],
    [
      'promote',
      ['--environment', 'sample-prod', '--confirm-production'],
    ],
  ]) {
    const invalidScopedRollback = run([
      'release',
      releaseCommand,
      '--candidate',
      '20000000-0000-4000-8000-000000000001',
      ...environmentArgs,
      '--allow-runtime-rollback',
      '--reason',
      'short',
      '--profile',
      'dev',
    ]);
    assert.notEqual(invalidScopedRollback.status, 0);
    assert.match(
      invalidScopedRollback.stderr,
      /RUNTIME_ROLLBACK_REASON_REQUIRED/,
      `release ${releaseCommand} must validate the rollback audit reason before loading the candidate or writing a deployment`,
    );
    assert.doesNotMatch(
      invalidScopedRollback.stderr,
      /本地候选版本不存在|ECONNREFUSED|fetch failed/,
    );

    const validScopedRollback = run([
      'release',
      releaseCommand,
      '--candidate',
      '20000000-0000-4000-8000-000000000001',
      ...environmentArgs,
      '--allow-runtime-rollback',
      '--reason',
      'audited Runtime source lineage rollback',
      '--profile',
      'dev',
    ]);
    assert.notEqual(validScopedRollback.status, 0);
    assert.doesNotMatch(
      validScopedRollback.stderr,
      /RUNTIME_ROLLBACK_REASON_REQUIRED/,
    );
    assert.match(validScopedRollback.stderr, /本地候选版本不存在/);
  }

  const directConfirmation = run([
    'release',
    'ship',
    '--change',
    'sample-change',
    '--confirm-production',
    '--profile',
    'dev',
  ]);
  assert.notEqual(directConfirmation.status, 0);
  assert.doesNotMatch(
    directConfirmation.stderr,
    /PREPRODUCTION_PHASE_REQUIRED/,
    'explicit production confirmation on the first invocation must enter the one-command preproduction path',
  );
  assert.match(directConfirmation.stderr, /change 不存在/);
  assert.equal(
    fs.existsSync(
      path.join(
        workspace,
        '.openxiangda',
        'releases',
        'sample-change',
        'ship.json',
      ),
    ),
    false,
    'a failure before candidate creation must not leave a ship journal',
  );

  const shipFile = path.join(
    workspace,
    '.openxiangda',
    'releases',
    'sample-change',
    'ship.json',
  );
  writeJson(shipFile, {
    schemaVersion: 'openxiangda_managed_ship_v1',
    changeId: 'sample-change',
    candidateId: 'candidate-1',
    preproductionDeploymentId: 'deployment-1',
    manifestReplacement: {
      enabled: true,
      reason: 'reviewed exact manifest replacement',
    },
  });
  const mismatchedConfirmation = run([
    'release',
    'ship',
    '--change',
    'sample-change',
    '--confirm-production',
    '--profile',
    'dev',
  ]);
  assert.notEqual(mismatchedConfirmation.status, 0);
  assert.match(
    mismatchedConfirmation.stderr,
    /RELEASE_SHIP_REPLACE_MANIFEST_INTENT_MISMATCH/,
  );
  assert.doesNotMatch(
    mismatchedConfirmation.stderr,
    /ECONNREFUSED|fetch failed/,
    'replacement intent mismatch must fail before any remote request',
  );
  fs.rmSync(shipFile);

  writeJson(shipFile, {
    schemaVersion: 'openxiangda_managed_ship_v1',
    changeId: 'sample-change',
    candidateId: '20000000-0000-4000-8000-000000000001',
    preproductionDeploymentId: 'deployment-1',
    manifestReplacement: {
      enabled: false,
      reason: null,
    },
  });
  const legacyAdoptionConfirmation = run([
    'release',
    'ship',
    '--change',
    'sample-change',
    '--confirm-production',
    '--adopt-online-baseline',
    '--adoption-reason',
    'historical mixed release lineage',
    '--profile',
    'dev',
  ]);
  assert.notEqual(legacyAdoptionConfirmation.status, 0);
  assert.doesNotMatch(
    legacyAdoptionConfirmation.stderr,
    /RELEASE_SHIP_ADOPTION_INTENT_MISMATCH/,
    'a pre-upgrade ship journal may explicitly supply the missing frozen adoption intent',
  );
  assert.match(legacyAdoptionConfirmation.stderr, /本地候选版本不存在/);
  fs.rmSync(shipFile);

  writeJson(shipFile, {
    schemaVersion: 'openxiangda_managed_ship_v1',
    changeId: 'sample-change',
    candidateId: '20000000-0000-4000-8000-000000000001',
    preproductionDeploymentId: 'deployment-1',
    manifestReplacement: {
      enabled: false,
      reason: null,
    },
    baselineAdoption: {
      enabled: true,
      reason: 'historical mixed release lineage',
    },
  });
  const inheritedAdoptionConfirmation = run([
    'release',
    'ship',
    '--change',
    'sample-change',
    '--confirm-production',
    '--profile',
    'dev',
  ]);
  assert.notEqual(inheritedAdoptionConfirmation.status, 0);
  assert.doesNotMatch(
    inheritedAdoptionConfirmation.stderr,
    /RELEASE_SHIP_ADOPTION_INTENT_MISMATCH/,
    'production confirmation must inherit frozen baseline adoption when the flags are omitted',
  );
  assert.match(
    inheritedAdoptionConfirmation.stderr,
    /本地候选版本不存在/,
    'the inherited intent must pass before the next candidate/deployment check',
  );

  const mismatchedAdoptionConfirmation = run([
    'release',
    'ship',
    '--change',
    'sample-change',
    '--confirm-production',
    '--adopt-online-baseline',
    '--adoption-reason',
    'a different audited lineage reason',
    '--profile',
    'dev',
  ]);
  assert.notEqual(mismatchedAdoptionConfirmation.status, 0);
  assert.match(
    mismatchedAdoptionConfirmation.stderr,
    /RELEASE_SHIP_ADOPTION_INTENT_MISMATCH/,
  );
  assert.doesNotMatch(
    mismatchedAdoptionConfirmation.stderr,
    /ECONNREFUSED|fetch failed/,
    'adoption intent mismatch must fail before any remote request',
  );
  fs.rmSync(shipFile);

  writeJson(shipFile, {
    schemaVersion: 'openxiangda_managed_ship_v1',
    changeId: 'sample-change',
    candidateId: '20000000-0000-4000-8000-000000000001',
    preproductionDeploymentId: 'deployment-1',
    manifestReplacement: {
      enabled: false,
      reason: null,
    },
  });
  const legacyRuntimeRollbackConfirmation = run([
    'release',
    'ship',
    '--change',
    'sample-change',
    '--confirm-production',
    '--allow-runtime-rollback',
    '--reason',
    'audited Runtime source lineage rollback',
    '--profile',
    'dev',
  ]);
  assert.notEqual(legacyRuntimeRollbackConfirmation.status, 0);
  assert.doesNotMatch(
    legacyRuntimeRollbackConfirmation.stderr,
    /RELEASE_SHIP_RUNTIME_ROLLBACK_INTENT_MISMATCH/,
    'a pre-upgrade ship journal may explicitly freeze the missing Runtime rollback intent',
  );
  assert.match(
    legacyRuntimeRollbackConfirmation.stderr,
    /本地候选版本不存在/,
  );
  fs.rmSync(shipFile);

  writeJson(shipFile, {
    schemaVersion: 'openxiangda_managed_ship_v1',
    changeId: 'sample-change',
    candidateId: '20000000-0000-4000-8000-000000000001',
    preproductionDeploymentId: 'deployment-1',
    manifestReplacement: {
      enabled: false,
      reason: null,
    },
    runtimeRollback: {
      enabled: true,
      reason: 'audited Runtime source lineage rollback',
    },
  });
  const inheritedRuntimeRollbackConfirmation = run([
    'release',
    'ship',
    '--change',
    'sample-change',
    '--confirm-production',
    '--profile',
    'dev',
  ]);
  assert.notEqual(inheritedRuntimeRollbackConfirmation.status, 0);
  assert.doesNotMatch(
    inheritedRuntimeRollbackConfirmation.stderr,
    /RELEASE_SHIP_RUNTIME_ROLLBACK_INTENT_MISMATCH/,
    'production confirmation must inherit the frozen Runtime rollback intent when flags are omitted',
  );
  assert.match(
    inheritedRuntimeRollbackConfirmation.stderr,
    /本地候选版本不存在/,
  );

  const mismatchedRuntimeRollbackConfirmation = run([
    'release',
    'ship',
    '--change',
    'sample-change',
    '--confirm-production',
    '--allow-runtime-rollback',
    '--reason',
    'a different audited Runtime rollback reason',
    '--profile',
    'dev',
  ]);
  assert.notEqual(mismatchedRuntimeRollbackConfirmation.status, 0);
  assert.match(
    mismatchedRuntimeRollbackConfirmation.stderr,
    /RELEASE_SHIP_RUNTIME_ROLLBACK_INTENT_MISMATCH/,
  );
  assert.doesNotMatch(
    mismatchedRuntimeRollbackConfirmation.stderr,
    /ECONNREFUSED|fetch failed/,
  );
  fs.rmSync(shipFile);

  const implicitManagedInvoke = run([
    'function',
    'invoke',
    'diagnose_target',
    '--body-json',
    '{}',
    '--profile',
    'dev',
    '--json',
  ]);
  assert.notEqual(implicitManagedInvoke.status, 0);
  assert.match(
    implicitManagedInvoke.stderr,
    /FUNCTION_INVOKE_ENVIRONMENT_REQUIRED/,
  );
  assert.doesNotMatch(
    implicitManagedInvoke.stderr,
    /ECONNREFUSED|fetch failed/,
    'managed Function invoke must reject an implicit target before the request',
  );

  const explicitManagedInvoke = run([
    'function',
    'invoke',
    'diagnose_target',
    '--body-json',
    '{}',
    '--environment',
    'sample-prod',
    '--profile',
    'dev',
    '--json',
  ]);
  assert.notEqual(explicitManagedInvoke.status, 0);
  assert.match(
    explicitManagedInvoke.stderr,
    /Resolved target:.*environment=sample-prod.*kind=production.*appType=APP_PROD/,
  );

  const help = run(['release', 'ship', '--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /首次只部署预发并停止/);
  assert.match(help.stdout, /人工验收备注可选/);
  assert.match(help.stdout, /不支持 --dry-run/);
  assert.match(help.stdout, /--adopt-online-baseline/);
  assert.match(help.stdout, /--replace-manifest/);
  assert.match(help.stdout, /--allow-runtime-rollback/);
  assert.match(help.stdout, /只透传给 runtime-stage/);
  assert.match(help.stdout, /app-finalize 不会收到/);
  assert.match(help.stdout, /Backend\/Runtime\/Root 始终使用 candidate sourceRevision/);
  assert.match(help.stdout, /正式确认必须复用/);
  assert.match(help.stdout, /精确非删除/);
  assert.match(help.stdout, /正式确认会从 ship\.json 自动复用/);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('release ship gate smoke passed');
