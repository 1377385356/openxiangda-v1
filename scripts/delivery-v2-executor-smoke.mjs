import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  compactStepResult,
  createDeliveryV2Executor,
  decorateSteps,
  deliveryV2RuntimeBuildId,
  normalizeLegacyPackageTargetsForExecution,
  packageWorkspaceRoot,
  prepareAppFinalizeStep,
  releaseTargets,
  restoreDeliveryCheckpointFiles,
  structuredFailure,
} = require('../lib/delivery-v2-executor');
const {
  resolveDeliveryV2BackendManifestReplacementIntent,
  resolveReleaseCommandScopedFiles,
  resolveDataViewSourceFormCodes,
  stagedDataViewFormReleaseDependencies,
} = require('../lib/cli');
const {
  createDeliveryV2Cli,
  deliveryV2SourceRevision,
} = require('../lib/delivery-v2-cli');
const {
  normalizeReleaseSourceRevisionForBaseline,
} = require('../lib/application-environments');
const {
  buildWorkspaceReleaseSteps,
} = require('../lib/release-plan');
const {
  runWorkspaceJsCodeBuildBatch,
} = require('../lib/js-code-build');
const {
  canonicalJson,
  sha256,
  sha256Canonical,
} = require('../lib/delivery-v2-package');

const root = fs.mkdtempSync(
  path.join(os.tmpdir(), 'openxiangda-delivery-v2-executor-')
);
try {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'app-workspace.config.ts'),
    'export default { deliveryVersion: 2, runtimeMode: "legacy" };\n'
  );
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'delivery-v2-executor-test' })
  );
  fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'export default 1;\n');

  const artifacts = new Set();
  const downloads = new Map();
  const checkpointBodies = [];
  let activeRun = null;
  let runSequence = 0;
  let installed = 0;
  let cleared = 0;
  let executeStep = async () => {
    throw new Error('empty legacy package must not create release steps');
  };
  const target = {
    appType: 'APP_DELIVERY_TEST',
    profileName: 'test',
    environmentId: '00000000-0000-4000-8000-000000000001',
    environmentKind: 'preproduction',
    targetName: 'preproduction',
  };
  const requestWithAuth = async (_config, _profile, apiPath, options = {}) => {
    if (apiPath.endsWith('/delivery/runs?limit=100')) {
      return { items: [] };
    }
    const artifactMatch = apiPath.match(
      /\/delivery\/artifacts\/([a-f0-9]{64})$/
    );
    if (artifactMatch && (options.method || 'GET') === 'GET') {
      if (artifacts.has(artifactMatch[1])) {
        return { digest: artifactMatch[1] };
      }
      const error = new Error('HTTP 404: DELIVERY_ARTIFACT_NOT_FOUND');
      error.status = 404;
      throw error;
    }
    if (
      apiPath.endsWith('/delivery/runs') &&
      options.method === 'POST'
    ) {
      activeRun = {
        id: `run-${++runSequence}`,
        appType: target.appType,
        environmentId: target.environmentId,
        environmentKind: target.environmentKind,
        packageDigest: options.body.packageDigest,
        packageManifest: options.body.packageManifest,
        status: 'packaged',
        checkpoints: { packaged: { packageDigest: options.body.packageDigest } },
        result: {},
        control: {
          publishLeaseId: 'lease-1',
          baselineId: 'baseline-1',
          changeId: 'delivery-v2-test',
          clientSessionId: options.body.clientSessionId,
          leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      };
      return activeRun;
    }
    if (
      activeRun &&
      apiPath.endsWith(`/delivery/runs/${activeRun.id}/checkpoints`) &&
      options.method === 'POST'
    ) {
      checkpointBodies.push(structuredClone(options.body));
      activeRun.status =
        options.body.status ||
        (options.body.stage === 'succeeded'
          ? 'succeeded'
          : activeRun.status);
      activeRun.stage = options.body.stage;
      activeRun.checkpoints[options.body.stage] = options.body;
      if (options.body.result) {
        activeRun.result[options.body.stage] = options.body.result;
      }
      return activeRun;
    }
    if (apiPath.endsWith('/app-releases/head')) {
      return { activeAppReleaseId: 'app-release-1' };
    }
    if (apiPath.endsWith('/runtime/releases/head')) {
      return {
        activeRuntimeReleaseId: null,
        activeRuntimeBuildId: null,
      };
    }
    throw new Error(`unexpected request: ${apiPath}`);
  };
  const executor = createDeliveryV2Executor({
    clearDeliveryContext() {
      cleared += 1;
    },
    async downloadWithAuth(_config, _profile, apiPath) {
      const digest = apiPath.match(/\/([a-f0-9]{64})\/content$/)?.[1];
      const buffer = downloads.get(digest);
      if (!buffer) throw new Error(`unexpected download: ${apiPath}`);
      return { buffer };
    },
    installDeliveryContext() {
      installed += 1;
    },
    async requestFormWithAuth(
      _config,
      _profile,
      apiPath,
      formDataFactory
    ) {
      assert.ok(formDataFactory() instanceof FormData);
      const match = apiPath.match(
        /\/delivery\/artifacts\/([a-f0-9]{64})/
      );
      assert.ok(match);
      artifacts.add(match[1]);
      return { digest: match[1] };
    },
    requestWithAuth,
    async runOpenXiangdaInProcess(args) {
      return await executeStep(args);
    },
  });

  const deployed = await executor.deploy({
    config: {},
    target,
    workspaceRoot: root,
    clientSessionId: 'client-session-1',
  });
  assert.equal(deployed.run.status, 'succeeded');
  assert.equal(deployed.run.result.succeeded.appReleaseId, 'app-release-1');
  assert.equal(installed, 1);
  assert.equal(cleared, 1);
  assert.ok(artifacts.size >= 2);
  assert.deepEqual(
    checkpointBodies
      .filter(body => body.status)
      .map(body => body.status),
    ['preparing', 'activating', 'verifying', 'succeeded'],
    'a plan without app-finalize must retain its existing lifecycle'
  );

  const lifecycleRoot = path.join(root, 'resource-finalize-lifecycle');
  fs.mkdirSync(path.join(lifecycleRoot, 'src', 'functions', 'hello'), {
    recursive: true,
  });
  fs.mkdirSync(
    path.join(lifecycleRoot, 'src', 'resources', 'functions'),
    { recursive: true }
  );
  fs.writeFileSync(
    path.join(lifecycleRoot, 'app-workspace.config.ts'),
    'export default { deliveryVersion: 2, runtimeMode: "legacy" };\n'
  );
  fs.writeFileSync(
    path.join(lifecycleRoot, 'package.json'),
    JSON.stringify({ name: 'delivery-v2-lifecycle-test' })
  );
  fs.writeFileSync(
    path.join(lifecycleRoot, 'src', 'functions', 'hello', 'index.ts'),
    'export default async () => "hello";\n'
  );
  fs.writeFileSync(
    path.join(
      lifecycleRoot,
      'src',
      'resources',
      'functions',
      'hello.json'
    ),
    JSON.stringify({
      code: 'hello',
      definitionJson: {
        sourceFile: { localPath: 'src/functions/hello/index.ts' },
      },
    })
  );
  const lifecycleCheckpointStart = checkpointBodies.length;
  const lifecycleStepStatuses = [];
  executeStep = async args => {
    const stepId = args[0] === 'release' ? 'app-finalize' : 'backend-stage';
    lifecycleStepStatuses.push({ stepId, status: activeRun.status });
    if (stepId === 'backend-stage') {
      if (activeRun.status !== 'preparing') {
        const error = new Error(
          `HTTP 409: ReleaseRun cannot transition from ${activeRun.status} to preparing`
        );
        error.status = 409;
        throw error;
      }
      return {
        stagedResource: {
          kind: 'BackendRelease',
          releaseId: 'backend-release-1',
          resourceHash: 'd'.repeat(64),
        },
      };
    }
    assert.equal(
      activeRun.status,
      'activating',
      'app-finalize must execute only after the run enters activating'
    );
    return { activated: { id: 'app-release-1' } };
  };
  const lifecycleDeployment = await executor.deploy({
    config: {},
    target,
    workspaceRoot: lifecycleRoot,
    clientSessionId: 'client-session-lifecycle',
  });
  assert.equal(lifecycleDeployment.run.status, 'succeeded');
  assert.deepEqual(lifecycleStepStatuses, [
    { stepId: 'backend-stage', status: 'preparing' },
    { stepId: 'app-finalize', status: 'activating' },
  ]);
  const lifecycleCheckpoints = checkpointBodies.slice(
    lifecycleCheckpointStart
  );
  assert.ok(
    lifecycleCheckpoints.findIndex(body => body.stage === 'done-backend-stage') <
      lifecycleCheckpoints.findIndex(body => body.status === 'activating'),
    'all resource checkpoints must complete before activating begins'
  );
  executeStep = async () => {
    throw new Error('sealed package without release steps must stay empty');
  };

  const sealedSourceRoot = path.join(root, 'sealed-source-workspace');
  fs.mkdirSync(path.join(sealedSourceRoot, 'node_modules'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(sealedSourceRoot, 'node_modules', 'workspace-only.txt'),
    'must not leak into package execution\n'
  );
  const sealedFiles = new Map(
    [
      [
        'package.json',
        Buffer.from(JSON.stringify({ name: 'sealed-delivery-package' })),
      ],
      [
        'tsconfig.js-code-nodes.json',
        Buffer.from(
          JSON.stringify({
            compilerOptions: {
              target: 'ES2022',
              module: 'ESNext',
              moduleResolution: 'Bundler',
              strict: true,
              skipLibCheck: true,
              types: ['node'],
            },
          })
        ),
      ],
      [
        'src/functions/hello/index.ts',
        Buffer.from(
          'import "openxiangda/workflow";\nimport { createHash } from "node:crypto";\nexport default async () => createHash("sha256").update("sealed").digest("hex");\n'
        ),
      ],
    ].map(([relativePath, buffer]) => [relativePath, buffer])
  );
  const sealedFileDescriptors = [...sealedFiles.entries()].map(
    ([relativePath, buffer]) => ({
      path: relativePath,
      digest: sha256(buffer),
      size: buffer.length,
      contentType: relativePath.endsWith('.json')
        ? 'application/json'
        : 'text/plain',
    })
  );
  const sealedManifest = {
    schemaVersion: 'openxiangda-app-package-v2',
    compilerVersion: 'delivery-v2.1',
    mode: 'trusted-developer',
    runtimeMode: 'legacy',
    buildRequirements: {
      contractVersion: 'delivery_v2_build_closure_v1',
      sealed: true,
      runtime: 'not-required',
      authoredResources: 'openxiangda-bundled-toolchain',
      workspaceNodeModules: 'forbidden',
      externalPackages: [],
    },
    resources: {
      forms: [],
      functions: [],
      automations: [],
      workflows: [],
      configuration: {},
    },
    layers: [
      {
        kind: 'source',
        digest: 'b'.repeat(64),
        sourceHash: 'c'.repeat(64),
        files: sealedFileDescriptors,
      },
    ],
  };
  const sealedPackageDigest = sha256Canonical(sealedManifest);
  downloads.set(
    sealedPackageDigest,
    Buffer.from(canonicalJson(sealedManifest))
  );
  for (const [relativePath, buffer] of sealedFiles) {
    const descriptor = sealedFileDescriptors.find(
      item => item.path === relativePath
    );
    downloads.set(descriptor.digest, buffer);
  }
  const sealedDeployment = await executor.deploy({
    config: {},
    target,
    workspaceRoot: sealedSourceRoot,
    packageDigest: sealedPackageDigest,
    clientSessionId: 'client-session-sealed',
  });
  const sealedExecutionRoot = packageWorkspaceRoot(
    sealedSourceRoot,
    sealedPackageDigest
  );
  assert.equal(sealedDeployment.materialized, true);
  assert.equal(
    fs.existsSync(
      path.join(sealedExecutionRoot, 'node_modules', 'workspace-only.txt')
    ),
    false,
    'sealed package execution must not expose the caller workspace node_modules'
  );
  assert.equal(
    fs.realpathSync(
      path.join(sealedExecutionRoot, 'node_modules', 'openxiangda')
    ),
    fs.realpathSync(path.resolve('.')),
    'sealed package execution must expose only the installed OpenXiangda toolchain'
  );
  const sealedBuild = runWorkspaceJsCodeBuildBatch(
    sealedExecutionRoot,
    [{ sourceKind: 'functions', scriptCode: 'hello' }],
    { forceCanonical: true }
  );
  assert.equal(
    sealedBuild.status,
    0,
    `sealed canonical build failed:\n${sealedBuild.stdout}\n${sealedBuild.stderr}`
  );
  assert.equal(sealedBuild.openxiangdaBuildMode, 'canonical-scoped');
  assert.equal(
    fs.existsSync(
      path.join(
        sealedExecutionRoot,
        'dist',
        'functions',
        'hello',
        'index.cjs'
      )
    ),
    true
  );

  const probedEnvironments = [];
  const statusCli = createDeliveryV2Cli({
    clearDeliveryContext() {},
    async downloadWithAuth() {
      throw new Error('status must not download artifacts');
    },
    getWorkspaceTarget(_config, _profile, flags = {}) {
      const environment = flags.environment || 'preproduction';
      return {
        appType:
          environment === 'production' ? 'APP_PRODUCTION' : 'APP_PREPRODUCTION',
        profileName: 'test',
        environmentId:
          environment === 'production' ? 'env-production' : 'env-preproduction',
        environmentKind: environment,
        targetName: environment,
      };
    },
    installDeliveryContext() {},
    loadConfig() {
      return { currentProfile: 'test' };
    },
    async requestFormWithAuth() {
      throw new Error('status must not upload artifacts');
    },
    async requestWithAuth(_config, _profile, apiPath) {
      const environment = apiPath.includes('APP_PRODUCTION')
        ? 'production'
        : 'preproduction';
      probedEnvironments.push(environment);
      if (environment === 'preproduction') {
        const error = new Error('HTTP 404: DELIVERY_RUN_NOT_FOUND');
        error.status = 404;
        throw error;
      }
      return {
        id: 'run-production',
        status: 'failed',
        stage: 'runtime-stage',
        environmentKind: 'production',
      };
    },
    async runOpenXiangdaInProcess() {
      throw new Error('status must not execute child commands');
    },
  });
  const autoResolvedStatus = await statusCli.run('status', [
    'run-production',
  ]);
  assert.equal(autoResolvedStatus.id, 'run-production');
  assert.deepEqual(probedEnvironments, ['preproduction', 'production']);

  const currentManifest = {
    runtimeMode: 'react-spa',
    resources: {
      forms: ['customer'],
      functions: ['hello'],
      automations: [],
      workflows: [],
      configuration: { role: ['admin'] },
    },
    layers: [
      { kind: 'form', digest: 'a' },
      { kind: 'configuration', digest: 'b' },
      { kind: 'backend', digest: 'c' },
      { kind: 'runtime', digest: 'd' },
    ],
  };
  const previousManifest = {
    layers: [
      { kind: 'form', digest: 'a' },
      { kind: 'configuration', digest: 'old-b' },
      { kind: 'backend', digest: 'old-c' },
      { kind: 'runtime', digest: 'd' },
    ],
  };
  assert.deepEqual(
    releaseTargets(currentManifest, previousManifest),
    {
      forms: [],
      formDependencies: [],
      pages: [],
      functions: ['hello'],
      automations: [],
      workflows: [],
      jsCodeNodes: [],
      resources: false,
      resourceSelectors: { roles: ['admin'] },
      resourceDeletes: {},
      runtime: false,
      other: [],
    }
  );
  const fineGrainedCurrent = {
    runtimeMode: 'react-spa',
    resources: {
      forms: ['customer', 'orders'],
      functions: ['hello', 'unchanged'],
      automations: [],
      workflows: [],
      configuration: {
        role: ['admin', 'member'],
        'form-permission-group': ['customer_read'],
      },
      formDependencies: ['customer', 'orders'],
      formDependenciesByResource: {
        backend: {
          'function:hello': ['customer'],
          'function:unchanged': ['orders'],
        },
        workflow: {},
        configuration: {
          'form-permission-group:customer_read': ['customer'],
        },
      },
      formPermissionGroupForms: { customer_read: ['customer'] },
      resourceFingerprints: {
        forms: { customer: 'form-a', orders: 'form-b' },
        functions: { hello: 'fn-new', unchanged: 'fn-same' },
        automations: {},
        workflows: {},
        configuration: {
          role: { admin: 'role-new', member: 'role-same' },
          'form-permission-group': { customer_read: 'permission-new' },
        },
        shared: {
          form: 'shared-form',
          backend: 'shared-backend',
          workflow: 'shared-workflow',
          configuration: 'shared-config',
        },
      },
    },
    layers: [
      { kind: 'form', digest: 'form-layer-same' },
      { kind: 'configuration', digest: 'config-layer-new' },
      { kind: 'backend', digest: 'backend-layer-same' },
    ],
  };
  const fineGrainedPrevious = {
    resources: {
      forms: ['customer', 'orders'],
      functions: ['hello', 'unchanged', 'removed'],
      automations: [],
      workflows: [],
      configuration: {
        role: ['admin', 'member'],
        'form-permission-group': ['customer_read'],
      },
      resourceFingerprints: {
        forms: { customer: 'form-a', orders: 'form-b' },
        functions: {
          hello: 'fn-old',
          unchanged: 'fn-same',
          removed: 'fn-removed',
        },
        automations: {},
        workflows: {},
        configuration: {
          role: { admin: 'role-old', member: 'role-same' },
          'form-permission-group': { customer_read: 'permission-old' },
        },
        shared: {
          form: 'shared-form',
          backend: 'shared-backend',
          workflow: 'shared-workflow',
          configuration: 'shared-config',
        },
      },
    },
    layers: [
      { kind: 'form', digest: 'form-layer-same' },
      { kind: 'configuration', digest: 'config-layer-old' },
      { kind: 'backend', digest: 'backend-layer-same' },
    ],
  };
  assert.deepEqual(
    releaseTargets(fineGrainedCurrent, fineGrainedPrevious),
    {
      forms: ['customer'],
      formDependencies: [],
      pages: [],
      functions: ['hello'],
      automations: [],
      workflows: [],
      jsCodeNodes: [],
      resources: false,
      resourceSelectors: {
        roles: ['admin'],
        formPermissionGroups: ['customer_read'],
      },
      resourceDeletes: { functions: ['removed'] },
      runtime: false,
      other: [],
    },
    'Delivery V2 must diff exact resources, stage permission-affected forms, and fail closed on removals'
  );
  const permissionAffectedTargets = releaseTargets(
    fineGrainedCurrent,
    fineGrainedPrevious
  );
  const permissionAffectedPlan = buildWorkspaceReleaseSteps(
    { ...permissionAffectedTargets, resourceDeletes: {} },
    'react-spa',
    'test',
    'delivery-v2-permission-scope'
  );
  const permissionAffectedFormStage = permissionAffectedPlan.find(
    step => step.id === 'form-stage'
  );
  assert.ok(
    permissionAffectedFormStage,
    'a changed permission group must create a FormRelease stage for its owning form'
  );
  assert.match(
    permissionAffectedFormStage.command,
    /form-setting:customer/
  );
  assert.match(
    permissionAffectedFormStage.command,
    /form-permission-group:customer_read/
  );
  assert.equal(
    permissionAffectedPlan.at(-1).id,
    'app-finalize',
    'permission-affected FormRelease scope must flow into the single root finalize step'
  );
  const dependencyOnlySteps = buildWorkspaceReleaseSteps(
    {
      forms: [],
      formDependencies: ['customer'],
      functions: ['hello'],
    },
    'react-spa',
    'test',
    'delivery-v2-dependency-only'
  );
  assert.deepEqual(dependencyOnlySteps[0], {
    id: 'form-ensure',
    args: [
      'form',
      'ensure',
      '--only',
      'customer',
      '--profile',
      'test',
      '--change',
      'delivery-v2-dependency-only',
    ],
    command:
      'openxiangda form ensure --only customer --profile test --change delivery-v2-dependency-only',
    writes: true,
    stagedKind: null,
    resumeMode: 'replay-local',
  });
  const authoritativeBackendPackageDigest = 'c'.repeat(64);
  const authoritativeBackendIntent =
    resolveDeliveryV2BackendManifestReplacementIntent({
      flags: { 'stage-only': true },
      typeFilters: new Set(['functions']),
      codeFilters: [
        { key: 'functions', code: 'hello', raw: 'hello' },
      ],
      manifest: {
        functions: [{ code: 'hello' }],
        automations: [],
      },
      deliveryContext: {
        runId: 'run-backend-authoritative',
        packageDigest: authoritativeBackendPackageDigest,
        targets: {
          functions: ['hello'],
          automations: [],
        },
      },
    });
  assert.deepEqual(authoritativeBackendIntent, {
    mode: 'manifest_replacement',
    authority: 'delivery_v2_sealed_package',
    runId: 'run-backend-authoritative',
    packageDigest: authoritativeBackendPackageDigest,
    selectors: ['Function:hello'],
    reason:
      `Delivery V2 ReleaseRun run-backend-authoritative sealed package ${authoritativeBackendPackageDigest} ` +
      'authoritative backend manifest and binding contract replacement',
  });
  assert.deepEqual(
    compactStepResult('backend-stage', {
      deliveryV2BackendManifestReplacement: authoritativeBackendIntent,
    }).backendManifestReplacement,
    authoritativeBackendIntent,
    'Backend stage checkpoint must retain the automatically generated authoritative replacement audit'
  );
  assert.throws(
    () =>
      resolveDeliveryV2BackendManifestReplacementIntent({
        flags: { 'stage-only': true },
        typeFilters: new Set(['functions']),
        codeFilters: [
          { key: 'functions', code: 'other', raw: 'other' },
        ],
        manifest: {
          functions: [{ code: 'other' }],
          automations: [],
        },
        deliveryContext: {
          runId: 'run-backend-authoritative',
          packageDigest: authoritativeBackendPackageDigest,
          targets: {
            functions: ['hello'],
            automations: [],
          },
        },
      }),
    error =>
      error.code === 'DELIVERY_BACKEND_SCOPE_MISMATCH' &&
      error.retryable === false,
    'Delivery V2 must never widen or substitute the sealed Backend selector'
  );
  const dataViewFinalizeSteps = decorateSteps(
    buildWorkspaceReleaseSteps(
      {
        forms: ['club'],
        resourceSelectors: { dataViews: ['club_summary'] },
      },
      'react-spa',
      'test',
      'delivery-v2-data-view'
    ),
    target,
    {
      id: 'run-data-view',
      control: { changeId: 'delivery-v2-data-view' },
    },
    currentManifest,
    root
  );
  const dataViewAppFinalize = dataViewFinalizeSteps.find(
    step => step.id === 'app-finalize'
  );
  assert.match(
    dataViewAppFinalize.command,
    /--finalize-data-views club_summary/,
    'the sealed DataView selector must survive executor decoration'
  );
  assert.match(
    dataViewAppFinalize.command,
    /--delivery-run-id run-data-view/,
    'DataView finalization must remain inside the existing App finalize checkpoint'
  );
  assert.equal(
    dataViewFinalizeSteps.filter(step => step.id === 'app-finalize').length,
    1
  );
  const runtimeDigest = 'a'.repeat(64);
  const firstRuntimePackageDigest = 'b'.repeat(64);
  const secondRuntimePackageDigest = 'c'.repeat(64);
  assert.equal(
    deliveryV2RuntimeBuildId(runtimeDigest, firstRuntimePackageDigest),
    `pkg-${'a'.repeat(20)}-${'b'.repeat(12)}`,
    'Delivery V2 Runtime buildId must include both Runtime content and sealed package provenance'
  );
  assert.notEqual(
    deliveryV2RuntimeBuildId(runtimeDigest, firstRuntimePackageDigest),
    deliveryV2RuntimeBuildId(runtimeDigest, secondRuntimePackageDigest),
    're-sealing the same Runtime bytes into a different package must not collide with an immutable Runtime release'
  );
  const provenanceScopedRuntimeSteps = decorateSteps(
    [{ id: 'runtime-stage', args: ['runtime', 'deploy'] }],
    target,
    {
      id: 'run-runtime-provenance',
      packageDigest: firstRuntimePackageDigest,
      control: { changeId: 'delivery-v2-runtime-provenance' },
    },
    { layers: [{ kind: 'runtime', digest: runtimeDigest }] },
    root
  );
  const runtimeBuildIdIndex =
    provenanceScopedRuntimeSteps[0].args.indexOf('--build-id');
  assert.equal(
    provenanceScopedRuntimeSteps[0].args[runtimeBuildIdIndex + 1],
    deliveryV2RuntimeBuildId(runtimeDigest, firstRuntimePackageDigest),
    'runtime-stage must execute with the provenance-scoped deterministic buildId'
  );
  assert.ok(
    provenanceScopedRuntimeSteps[0].args.includes(
      '--recover-stale-source-mismatch'
    ),
    'Delivery V2 runtime-stage must safely recover an exact uploaded source-lineage residue'
  );
  const stagedClub = {
    formUuid: 'FORM_CLUB',
    releaseId: 'form-release-club',
    contentHash: 'f'.repeat(64),
    baseRevision: 1,
    parentReleaseId: null,
  };
  assert.deepEqual(
    resolveDataViewSourceFormCodes(
      [
        {
          code: 'club_summary',
          definition: {
            base: { formCode: 'club', alias: 'club' },
          },
        },
      ],
      {
        resources: {
          forms: { club: { formUuid: 'FORM_CLUB' } },
        },
      }
    ),
    ['club']
  );
  assert.deepEqual(
    stagedDataViewFormReleaseDependencies(
      {
        definition: {
          base: { formUuid: 'FORM_CLUB', alias: 'club' },
        },
      },
      new Map([['club', stagedClub]])
    ),
    [
      {
        formUuid: 'FORM_CLUB',
        releaseId: 'form-release-club',
        contentHash: 'f'.repeat(64),
        baseRevision: 1,
        parentReleaseId: null,
      },
    ],
    'the DataView write must carry the exact verified staged FormRelease evidence'
  );
  const legacyDataViewRoot = path.join(root, 'legacy-data-view-package');
  fs.mkdirSync(
    path.join(legacyDataViewRoot, 'src', 'resources', 'data-views'),
    { recursive: true }
  );
  fs.writeFileSync(
    path.join(
      legacyDataViewRoot,
      'src',
      'resources',
      'data-views',
      'member_stats.json'
    ),
    JSON.stringify({
      code: 'member_stats',
      definition: {
        base: { kind: 'form', code: 'member_profile' },
      },
      joins: [{ formCode: 'member_profile', alias: 'member' }],
      permissionGroups: [{ code: 'member_stats_global' }],
    })
  );
  assert.deepEqual(
    normalizeLegacyPackageTargetsForExecution(
      {
        resourceSelectors: {
          dataViews: [
            'member_profile',
            'member_stats',
            'member_stats_global',
            'unknown_data_view',
          ],
          roles: ['admin'],
        },
      },
      legacyDataViewRoot
    ),
    {
      resourceSelectors: {
        dataViews: ['member_stats', 'unknown_data_view'],
        roles: ['admin'],
      },
    },
    'retry must remove proven nested codes while retaining unknown selectors for fail-closed validation'
  );
  assert.deepEqual(
    structuredFailure(
      Object.assign(new Error('boom'), { code: 'TEST_FAILED' }),
      'run-2',
      'runtime-stage',
      'RuntimeRelease'
    ),
    {
      runId: 'run-2',
      stage: 'runtime-stage',
      component: 'RuntimeRelease',
      code: 'TEST_FAILED',
      message: 'boom',
      retryable: true,
      progressPreserved: true,
    }
  );
  assert.deepEqual(
    resolveReleaseCommandScopedFiles(
      { change: 'delivery-v2-missing-local-sdd' },
      'test',
      { runId: 'run-2' }
    ),
    [],
    'Delivery V2 child commands must not resolve a local SDD change'
  );
  const packageDigest = 'd'.repeat(64);
  const logicalRepositoryId = `sha256:${'e'.repeat(64)}`;
  const managedDeliveryTarget = {
    logicalApp: { sourceRepositoryId: logicalRepositoryId },
  };
  const deliverySourceRevision = deliveryV2SourceRevision(
    managedDeliveryTarget,
    packageDigest
  );
  assert.deepEqual(
    deliverySourceRevision,
    {
      repo: `sha256:${packageDigest}`,
      repositoryId: `sha256:${packageDigest}`,
      repoAliases: [
        `sha256:${packageDigest}`,
        logicalRepositoryId,
      ].sort(),
      baseCommit: packageDigest,
      treeHash: packageDigest,
      branch: 'delivery-v2',
      mainBranch: null,
      remoteName: null,
      remoteUrlHash: null,
    },
    'sealed package identity must retain the logical repository as a trusted lineage alias'
  );
  const frozenDeliveryRevision =
    normalizeReleaseSourceRevisionForBaseline(
      managedDeliveryTarget,
      { repo: `sha256:${packageDigest}` },
      deliverySourceRevision,
      { errorCode: 'RELEASE_SOURCE_REPOSITORY_MISMATCH' }
    );
  assert.equal(
    frozenDeliveryRevision.repo,
    `sha256:${packageDigest}`,
    'immutable child releases must canonicalize back to the package baseline'
  );
  assert.deepEqual(
    frozenDeliveryRevision.repoAliases,
    [`sha256:${packageDigest}`, logicalRepositoryId].sort()
  );

  const formRelease = {
    kind: 'FormRelease',
    identity: {
      releaseId: 'form-release-1',
      formUuid: 'form-uuid-1',
    },
    action: 'update',
    hash: 'a'.repeat(64),
    metadata: { formCode: 'customer' },
  };
  const compactedFormStage = compactStepResult('form-stage', {
    stagedResources: [formRelease],
    satisfiedSelectors: ['form:unchanged'],
  });
  assert.deepEqual(compactedFormStage.stagedResources, [formRelease]);
  assert.deepEqual(compactedFormStage.satisfiedSelectors, [
    'form:unchanged',
  ]);

  const restoredRoot = path.join(root, 'restored-on-another-machine');
  fs.mkdirSync(restoredRoot, { recursive: true });
  const retryRun = {
    id: 'run-retry',
    control: {
      changeId: 'delivery-v2-retry',
      baselineId: 'baseline-retry',
      clientSessionId: 'client-retry',
    },
    result: {
      'done-form-stage': compactedFormStage,
    },
  };
  const restored = restoreDeliveryCheckpointFiles(
    restoredRoot,
    retryRun,
    target
  );
  assert.deepEqual(restored, {
    stagedResourceCount: 1,
    restored: true,
    backendBindingContracts: false,
  });
  const restoredReleaseDir = path.join(
    restoredRoot,
    '.openxiangda',
    'releases',
    'delivery-v2-retry'
  );
  assert.deepEqual(
    JSON.parse(
      fs.readFileSync(
        path.join(restoredReleaseDir, 'staged-resources.json'),
        'utf8'
      )
    ),
    [formRelease],
    'retry must restore staged children from the durable server checkpoint'
  );
  const restoredContext = JSON.parse(
    fs.readFileSync(
      path.join(restoredReleaseDir, 'staged-resources.context.json'),
      'utf8'
    )
  );
  assert.equal(restoredContext.baselineId, 'baseline-retry');
  assert.equal(restoredContext.clientSessionId, 'client-retry');
  assert.deepEqual(restoredContext.satisfiedSelectors, [
    'form:unchanged',
  ]);

  const configOnlyRoot = path.join(root, 'config-only-noop-child');
  fs.mkdirSync(configOnlyRoot, { recursive: true });
  const configOnlyRun = {
    id: 'run-config-only',
    control: {
      changeId: 'delivery-v2-config-only',
      baselineId: 'baseline-config-only',
      clientSessionId: 'client-config-only',
    },
    result: {
      'done-form-stage': { id: null, ok: true },
      'done-config-role': { id: null, ok: true },
    },
  };
  const configOnlySteps = [
    {
      id: 'form-stage',
      stagedKind: 'FormRelease',
      args: ['form', 'stage'],
    },
    {
      id: 'config-role',
      args: ['role', 'sync'],
    },
    {
      id: 'app-finalize',
      args: [
        'release',
        'app-finalize',
        '--staged-resources-json',
        '.openxiangda/releases/delivery-v2-config-only/staged-resources.json',
      ],
    },
  ];
  const emptyStagedFile = path.join(
    configOnlyRoot,
    '.openxiangda',
    'releases',
    'delivery-v2-config-only',
    'staged-resources.json'
  );
  fs.mkdirSync(path.dirname(emptyStagedFile), { recursive: true });
  fs.writeFileSync(emptyStagedFile, '[]\n');
  const initialConfigOnlyFinalize = structuredClone(
    configOnlySteps.at(-1)
  );
  assert.deepEqual(
    prepareAppFinalizeStep(initialConfigOnlyFinalize, {
      executionRoot: configOnlyRoot,
      run: configOnlyRun,
      target,
      steps: configOnlySteps,
    }),
    {
      mode: 'frozen-capture',
      stagedResourceCount: 0,
    },
    'initial config-only execution must finalize from the frozen capture when every child stage is a no-op'
  );
  assert.equal(
    initialConfigOnlyFinalize.args.includes('--staged-resources-json'),
    false,
    'an empty staged-resources file must never be forwarded to app-finalize'
  );

  fs.rmSync(emptyStagedFile);
  const retryConfigOnlyFinalize = structuredClone(configOnlySteps.at(-1));
  assert.deepEqual(
    prepareAppFinalizeStep(retryConfigOnlyFinalize, {
      executionRoot: configOnlyRoot,
      run: configOnlyRun,
      target,
      steps: configOnlySteps,
    }),
    {
      mode: 'frozen-capture',
      stagedResourceCount: 0,
    },
    'cross-machine retry must not require a local staged-resources file for legitimate no-op children'
  );

  const deploymentTarget = {
    ...target,
    deploymentId: 'deployment-config-only',
  };
  const deploymentRun = {
    ...retryRun,
    id: 'run-deployment',
    control: {
      ...retryRun.control,
      changeId: 'delivery-v2-deployment',
      deploymentId: deploymentTarget.deploymentId,
    },
    result: {
      'done-form-stage': compactedFormStage,
    },
  };
  const decoratedDeploymentSteps = decorateSteps(
    [
      {
        id: 'form-stage',
        stagedKind: 'FormRelease',
        args: ['form', 'stage'],
      },
      {
        id: 'app-finalize',
        args: [
          'release',
          'app-finalize',
          '--staged-resources-json',
          '.openxiangda/releases/delivery-v2-deployment/staged-resources.json',
        ],
      },
    ],
    deploymentTarget,
    deploymentRun,
    { layers: [] },
    configOnlyRoot
  );
  const deploymentFinalize = decoratedDeploymentSteps.at(-1);
  assert.equal(
    deploymentFinalize.args[
      deploymentFinalize.args.indexOf('--staged-resources-json') + 1
    ],
    '.openxiangda/releases/delivery-v2-deployment/deployment-config-only/staged-resources.json',
    'deployment-scoped retry must read the same staged-resources path that checkpoint restoration writes'
  );
  assert.deepEqual(
    prepareAppFinalizeStep(deploymentFinalize, {
      executionRoot: configOnlyRoot,
      run: deploymentRun,
      target: deploymentTarget,
      steps: decoratedDeploymentSteps,
    }),
    {
      mode: 'staged-children',
      stagedResourceCount: 1,
    }
  );
  assert.ok(
    fs.existsSync(
      path.join(
        configOnlyRoot,
        '.openxiangda',
        'releases',
        'delivery-v2-deployment',
        'deployment-config-only',
        'staged-resources.json'
      )
    )
  );

  console.log('delivery v2 executor smoke passed');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
