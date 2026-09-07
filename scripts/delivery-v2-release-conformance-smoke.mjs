import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createDeliveryV2Executor,
  decorateSteps,
  deliveryV2RuntimeBuildId,
  packageWorkspaceRoot,
  releaseTargets,
} = require('../lib/delivery-v2-executor');
const { deliveryV2SourceRevision } = require('../lib/delivery-v2-cli');
const {
  normalizeReleaseSourceRevisionForBaseline,
} = require('../lib/application-environments');
const { buildWorkspaceReleaseSteps } = require('../lib/release-plan');
const { canonicalJson, sha256Canonical } = require('../lib/delivery-v2-package');

const FORMS = ['member', 'member_type', 'organization', 'union'];
const FUNCTIONS = ['member_sync', 'member_type_sync'];
const DATA_VIEWS = ['member_list_joined', 'member_stats'];
const FORM_PERMISSION_GROUPS = Array.from(
  { length: 15 },
  (_, index) => `member_permission_${String(index + 1).padStart(2, '0')}`,
);
const CHANGE_ID = 'union-example-equivalent-release-certification';
const RUNTIME_DIGEST = digest('runtime-layer');

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fingerprints(codes, prefix) {
  return Object.fromEntries(codes.map((code) => [code, digest(`${prefix}:${code}`)]));
}

function argAfter(step, name) {
  const index = step.args.indexOf(name);
  assert.notEqual(index, -1, `${step.id} must include ${name}`);
  return step.args[index + 1];
}

function stagedResource(kind, code, index) {
  const releaseId = `${kind.toLowerCase()}-${index + 1}`;
  return {
    kind,
    identity: {
      releaseId,
      ...(kind === 'FormRelease' ? { formUuid: `FORM_${code.toUpperCase()}` } : {}),
    },
    action: 'update',
    hash: digest(`${kind}:${code}`),
    metadata: { code },
  };
}

const formPermissionGroupForms = Object.fromEntries(
  FORM_PERMISSION_GROUPS.map((code, index) => [code, [FORMS[index % FORMS.length]]]),
);
const configuration = {
  'data-view': DATA_VIEWS,
  'form-permission-group': FORM_PERMISSION_GROUPS,
};
const resourceFingerprints = {
  forms: fingerprints(FORMS, 'current-form'),
  functions: fingerprints(FUNCTIONS, 'current-function'),
  automations: {},
  workflows: {},
  configuration: {
    'data-view': fingerprints(DATA_VIEWS, 'current-data-view'),
    'form-permission-group': fingerprints(
      FORM_PERMISSION_GROUPS,
      'current-form-permission-group',
    ),
  },
};
const previousResourceFingerprints = {
  forms: fingerprints(FORMS, 'previous-form'),
  functions: fingerprints(FUNCTIONS, 'previous-function'),
  automations: {},
  workflows: {},
  configuration: {
    'data-view': fingerprints(DATA_VIEWS, 'previous-data-view'),
    'form-permission-group': fingerprints(
      FORM_PERMISSION_GROUPS,
      'previous-form-permission-group',
    ),
  },
};
const manifest = {
  schemaVersion: 'openxiangda-app-package-v2',
  runtimeMode: 'react-spa',
  resources: {
    forms: FORMS,
    functions: FUNCTIONS,
    automations: [],
    workflows: [],
    configuration,
    formDependencies: FORMS,
    formPermissionGroupForms,
    formDependenciesByResource: {
      backend: Object.fromEntries(FUNCTIONS.map((code) => [`function:${code}`, FORMS])),
      workflow: {},
      configuration: {
        ...Object.fromEntries(DATA_VIEWS.map((code) => [`data-view:${code}`, FORMS])),
        ...Object.fromEntries(
          FORM_PERMISSION_GROUPS.map((code) => [
            `form-permission-group:${code}`,
            formPermissionGroupForms[code],
          ]),
        ),
      },
    },
    resourceFingerprints,
  },
  layers: [
    { kind: 'source', digest: digest('current-source-layer'), files: [] },
    { kind: 'form', digest: digest('current-form-layer') },
    { kind: 'configuration', digest: digest('current-configuration-layer') },
    { kind: 'backend', digest: digest('current-backend-layer') },
    { kind: 'runtime', digest: RUNTIME_DIGEST },
  ],
};
const PACKAGE_DIGEST = sha256Canonical(manifest);
const previousManifest = {
  runtimeMode: 'react-spa',
  resources: {
    forms: FORMS,
    functions: FUNCTIONS,
    automations: [],
    workflows: [],
    configuration,
    resourceFingerprints: previousResourceFingerprints,
  },
  layers: [
    { kind: 'form', digest: digest('previous-form-layer') },
    { kind: 'configuration', digest: digest('previous-configuration-layer') },
    { kind: 'backend', digest: digest('previous-backend-layer') },
    { kind: 'runtime', digest: digest('previous-runtime-layer') },
  ],
};

const targets = releaseTargets(manifest, previousManifest);
assert.deepEqual(targets.forms, FORMS);
assert.deepEqual(targets.functions, FUNCTIONS);
assert.deepEqual(targets.resourceSelectors.dataViews, DATA_VIEWS);
assert.deepEqual(
  targets.resourceSelectors.formPermissionGroups,
  FORM_PERMISSION_GROUPS,
);
assert.deepEqual(targets.resourceDeletes, {});
assert.equal(targets.runtime, true);

const steps = buildWorkspaceReleaseSteps(targets, 'react-spa', 'example', CHANGE_ID);
assert.deepEqual(
  steps.map((step) => step.id),
  [
    'form-ensure',
    'form-stage',
    'config-data-view',
    'backend-stage',
    'runtime-stage',
    'app-finalize',
  ],
  'the equivalent-scale release must compile into one deterministic ordered plan',
);
assert.deepEqual(argAfter(steps[0], '--only').split(','), FORMS);
assert.deepEqual(argAfter(steps[1], '--only').split(','), [
  ...FORMS.map((code) => `form-setting:${code}`),
  ...FORM_PERMISSION_GROUPS.map((code) => `form-permission-group:${code}`),
]);
assert.equal(steps[1].args[2], 'form-setting,form-permission-group');
assert.deepEqual(argAfter(steps[2], '--only').split(','), DATA_VIEWS);
assert.deepEqual(argAfter(steps[3], '--only').split(','), FUNCTIONS);
assert.equal(steps.filter((step) => step.id === 'app-finalize').length, 1);
assert.deepEqual(argAfter(steps.at(-1), '--finalize-data-views').split(','), DATA_VIEWS);

const executionRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'openxiangda-delivery-v2-conformance-'),
);
const retryWorkspaceRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'openxiangda-delivery-v2-conformance-retry-'),
);
try {
  const target = {
    appType: 'APP_SZGH_PREPRODUCTION',
    profileName: 'example',
    targetName: 'preproduction',
    environmentKind: 'preproduction',
    environmentId: '10000000-0000-4000-8000-000000000001',
    deploymentId: 'deployment-union-example-certification',
  };
  const run = {
    id: 'run-union-example-certification',
    packageDigest: PACKAGE_DIGEST,
    control: {
      changeId: CHANGE_ID,
      baselineId: 'baseline-union-example-certification',
      clientSessionId: 'client-union-example-certification',
      deploymentId: target.deploymentId,
    },
    result: {},
  };
  const formReleases = FORMS.map((code, index) =>
    stagedResource('FormRelease', code, index),
  );
  const backendRelease = stagedResource('BackendRelease', 'backend', 0);
  const runtimeRelease = stagedResource('RuntimeRelease', 'runtime', 0);

  const executedCommands = [];
  let injectRuntimeFailure = true;
  let activeRun;
  const executor = createDeliveryV2Executor({
    clearDeliveryContext() {},
    async downloadWithAuth() {
      return { buffer: Buffer.from(canonicalJson(manifest)) };
    },
    installDeliveryContext() {},
    async requestFormWithAuth() {
      throw new Error('sealed package execution must not upload new artifacts');
    },
    async requestWithAuth(_config, _profile, apiPath, options = {}) {
      if (apiPath.endsWith('/delivery/runs?limit=100')) return { items: [] };
      if (apiPath.endsWith('/delivery/runs') && options.method === 'POST') {
        activeRun = {
          id: 'run-union-example-executor-certification',
          attempt: 1,
          appType: target.appType,
          environmentId: target.environmentId,
          environmentKind: target.environmentKind,
          packageDigest: options.body.packageDigest,
          packageManifest: options.body.packageManifest,
          status: 'packaged',
          checkpoints: {},
          result: {},
          control: {
            changeId: CHANGE_ID,
            baselineId: 'baseline-union-example-executor-certification',
            clientSessionId: options.body.clientSessionId,
            deploymentId: target.deploymentId,
          },
        };
        return activeRun;
      }
      if (
        apiPath.endsWith('/delivery/runs/run-union-example-executor-certification/fail') &&
        options.method === 'POST'
      ) {
        activeRun.status = 'failed';
        activeRun.failure = options.body;
        return activeRun;
      }
      if (
        apiPath.endsWith('/delivery/runs/run-union-example-executor-certification/retry') &&
        options.method === 'POST'
      ) {
        activeRun.attempt += 1;
        activeRun.status = 'packaged';
        return activeRun;
      }
      if (apiPath.endsWith('/delivery/runs/run-union-example-executor-certification')) {
        return activeRun;
      }
      if (
        apiPath.endsWith('/delivery/runs/run-union-example-executor-certification/checkpoints') &&
        options.method === 'POST'
      ) {
        activeRun.status = options.body.status || activeRun.status;
        activeRun.stage = options.body.stage;
        activeRun.checkpoints[options.body.stage] = options.body;
        if (options.body.result) activeRun.result[options.body.stage] = options.body.result;
        return activeRun;
      }
      if (apiPath.endsWith('/app-releases/head')) {
        return { activeAppReleaseId: 'app-release-union-example-certification' };
      }
      if (apiPath.endsWith('/runtime/releases/head')) {
        return {
          activeRuntimeReleaseId: 'runtime-release-1',
          activeRuntimeBuildId: deliveryV2RuntimeBuildId(RUNTIME_DIGEST, PACKAGE_DIGEST),
        };
      }
      throw new Error(`unexpected conformance request: ${apiPath}`);
    },
    async runOpenXiangdaInProcess(args) {
      executedCommands.push(args);
      if (args[0] === 'form' && args[1] === 'ensure') {
        return {
          forms: FORMS.map((code) => ({
            code,
            formUuid: `FORM_${code.toUpperCase()}`,
            action: 'existing',
          })),
        };
      }
      if (args[0] === 'resource' && args[2]?.includes('form-setting')) {
        return { id: 'form-stage-result', stagedResources: formReleases };
      }
      if (args[0] === 'resource' && args[2] === 'data-view') {
        return { id: 'data-view-stage-result' };
      }
      if (args[0] === 'resource' && args[2] === 'function') {
        return { id: 'backend-stage-result', stagedResource: backendRelease };
      }
      if (args[0] === 'runtime') {
        if (injectRuntimeFailure) {
          injectRuntimeFailure = false;
          throw Object.assign(new Error('injected runtime upload failure'), {
            code: 'DELIVERY_CERTIFICATION_INJECTED_FAILURE',
          });
        }
        return { id: 'runtime-stage-result', stagedResource: runtimeRelease };
      }
      if (args[0] === 'release' && args[1] === 'app-finalize') {
        return { activated: { id: 'app-release-union-example-certification' } };
      }
      throw new Error(`unexpected conformance command: ${args.join(' ')}`);
    },
  });
  let deploymentFailure;
  try {
    await executor.deploy({
      config: {},
      target,
      workspaceRoot: executionRoot,
      packageDigest: PACKAGE_DIGEST,
      clientSessionId: 'client-union-example-executor-certification',
    });
    assert.fail('the injected Runtime failure must stop the first attempt');
  } catch (error) {
    deploymentFailure = error;
  }
  assert.equal(deploymentFailure.deliveryFailure.code, 'DELIVERY_CERTIFICATION_INJECTED_FAILURE');
  assert.equal(deploymentFailure.deliveryFailure.stage, 'runtime-stage');
  assert.equal(deploymentFailure.deliveryFailure.progressPreserved, true);
  assert.equal(activeRun.status, 'failed');

  const deployed = await executor.retry({
    config: {},
    target,
    workspaceRoot: retryWorkspaceRoot,
    runId: activeRun.id,
  });
  assert.equal(deployed.run.status, 'succeeded');
  assert.equal(deployed.run.attempt, 2);
  assert.equal(deployed.verification.appReleaseId, 'app-release-union-example-certification');
  assert.deepEqual(
    executedCommands.map((args) => args.slice(0, 3).join(' ')),
    [
      'form ensure --only',
      'resource publish form-setting,form-permission-group',
      'resource publish data-view',
      'resource publish function',
      'runtime deploy --no-activate',
      'form ensure --only',
      'runtime deploy --no-activate',
      'release app-finalize --staged-resources-json',
    ],
    'the real retry loop must replay only local Form bindings and unfinished remote stages',
  );
  assert.equal(executedCommands[5].includes('--replay-local'), true);
  const retryExecutionRoot = packageWorkspaceRoot(retryWorkspaceRoot, PACKAGE_DIGEST);
  const restoredResources = JSON.parse(
    fs.readFileSync(
      path.join(
        retryExecutionRoot,
        '.openxiangda',
        'releases',
        CHANGE_ID,
        target.deploymentId,
        'staged-resources.json',
      ),
      'utf8',
    ),
  );
  assert.equal(restoredResources.length, 6);
  assert.deepEqual(
    restoredResources
      .filter((resource) => resource.kind === 'FormRelease')
      .map((resource) => resource.metadata.code),
    FORMS,
  );

  const decorated = decorateSteps(steps, target, run, manifest, executionRoot);
  const runtimeStep = decorated.find((step) => step.id === 'runtime-stage');
  assert.equal(
    argAfter(runtimeStep, '--build-id'),
    deliveryV2RuntimeBuildId(RUNTIME_DIGEST, PACKAGE_DIGEST),
  );
  assert.ok(runtimeStep.args.includes('--recover-stale-source-mismatch'));
  assert.notEqual(
    deliveryV2RuntimeBuildId(RUNTIME_DIGEST, PACKAGE_DIGEST),
    deliveryV2RuntimeBuildId(RUNTIME_DIGEST, digest('resealed-package')),
    'a re-sealed package must never collide with an uploaded RuntimeRelease from an earlier run',
  );
  assert.equal(argAfter(decorated.at(-1), '--delivery-run-id'), run.id);
  assert.equal(argAfter(decorated.at(-1), '--environment-id'), target.environmentId);

  const logicalRepositoryId = `sha256:${digest('trusted-logical-repository')}`;
  const sourceRevision = deliveryV2SourceRevision(
    { logicalApp: { sourceRepositoryId: logicalRepositoryId } },
    PACKAGE_DIGEST,
  );
  assert.deepEqual(sourceRevision.repoAliases, [
    `sha256:${PACKAGE_DIGEST}`,
    logicalRepositoryId,
  ].sort());
  assert.equal(
    normalizeReleaseSourceRevisionForBaseline(
      { logicalApp: { sourceRepositoryId: logicalRepositoryId } },
      { repo: `sha256:${PACKAGE_DIGEST}` },
      sourceRevision,
      { errorCode: 'RELEASE_SOURCE_REPOSITORY_MISMATCH' },
    ).repo,
    `sha256:${PACKAGE_DIGEST}`,
  );

  console.log('delivery v2 equivalent-scale release conformance smoke passed');
} finally {
  fs.rmSync(packageWorkspaceRoot(executionRoot, PACKAGE_DIGEST), {
    recursive: true,
    force: true,
  });
  fs.rmSync(packageWorkspaceRoot(retryWorkspaceRoot, PACKAGE_DIGEST), {
    recursive: true,
    force: true,
  });
  fs.rmSync(executionRoot, { recursive: true, force: true });
  fs.rmSync(retryWorkspaceRoot, { recursive: true, force: true });
}
