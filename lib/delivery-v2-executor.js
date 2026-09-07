const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  collectConfigurationManifestCodes,
  collectManifestCodes,
  compileAppPackage,
  sha256,
  sha256Canonical,
} = require('./delivery-v2-package');
const {
  buildWorkspaceReleaseSteps,
  commandFromArgs,
} = require('./release-plan');

const CONFIG_TARGET_BY_RESOURCE_TYPE = Object.freeze({
  role: 'roles',
  connector: 'connectors',
  notification: 'notifications',
  menu: 'menus',
  'data-view': 'dataViews',
  storage: 'storageConfigs',
  'auth-config': 'authConfigs',
  route: 'routes',
  'public-access': 'publicAccessPolicies',
  'page-permission-group': 'pagePermissionGroups',
  'form-permission-group': 'formPermissionGroups',
  'scope-dimension': 'scopeDimensions',
  'scope-grant-source': 'scopeGrantSources',
  'data-scope-policy': 'dataScopePolicies',
});

function createDeliveryV2Executor(dependencies) {
  const deps = assertDependencies(dependencies);

  async function inspect(input) {
    const previous = await latestSuccessfulRun(input.config, input.target);
    const compiled = await compileAppPackage({
      workspaceRoot: input.workspaceRoot,
      previousManifest: previous?.packageManifest || null,
      skipBuild: input.skipBuild === true,
      buildCommand: input.buildCommand,
      distDir: input.distDir,
      onBuildOutput: input.onBuildOutput,
    });
    const targets = releaseTargets(
      compiled.packageManifest,
      previous?.packageManifest || null
    );
    return {
      compiled,
      previous,
      targets,
      plan: describeExecutionPlan(
        targets,
        compiled.packageManifest.runtimeMode,
        input.target.profileName
      ),
    };
  }

  async function deploy(input) {
    const previous = await latestSuccessfulRun(input.config, input.target);
    let compiled;
    let executionRoot = path.resolve(input.workspaceRoot || process.cwd());
    let materialized = false;

    if (input.packageDigest) {
      const packageManifest = await downloadPackageManifest(
        input.config,
        input.target,
        input.packageDigest
      );
      executionRoot = await materializePackageWorkspace({
        config: input.config,
        target: input.target,
        packageDigest: input.packageDigest,
        packageManifest,
        sourceWorkspaceRoot: executionRoot,
      });
      compiled = {
        workspaceRoot: executionRoot,
        packageDigest: input.packageDigest,
        packageManifest,
        artifacts: [],
        summary: packageSummary(packageManifest, previous?.packageManifest),
      };
      materialized = true;
    } else {
      compiled = await compileAppPackage({
        workspaceRoot: executionRoot,
        previousManifest: previous?.packageManifest || null,
        buildCommand: input.buildCommand,
        distDir: input.distDir,
        onBuildOutput: input.onBuildOutput,
      });
    }

    const targets = releaseTargets(
      compiled.packageManifest,
      previous?.packageManifest || null,
      { forceAll: input.forceAll === true }
    );
    const plan = describeExecutionPlan(
      targets,
      compiled.packageManifest.runtimeMode,
      input.target.profileName
    );
    if (!input.packageDigest) {
      await uploadArtifacts(input.config, input.target, compiled.artifacts);
    }
    let run = await createRun({
      config: input.config,
      target: input.target,
      packageDigest: compiled.packageDigest,
      packageManifest: compiled.packageManifest,
      kind: input.kind || 'deploy',
      idempotencyKey:
        input.idempotencyKey ||
        defaultIdempotencyKey(
          input.kind || 'deploy',
          input.target,
          compiled.packageDigest
        ),
      clientSessionId: input.clientSessionId,
    });
    if (run.status === 'succeeded') {
      return {
        run,
        packageDigest: compiled.packageDigest,
        packageManifest: compiled.packageManifest,
        summary: compiled.summary,
        targets,
        plan,
        materialized,
        idempotent: true,
      };
    }
    if (run.status !== 'packaged') {
      if (run.status === 'failed') {
        run = await requestRunRetry(input.config, input.target, run);
      } else {
        throw runNotExecutableError(run, input.target);
      }
    }

    const result = await executeRun({
      config: input.config,
      target: input.target,
      run,
      packageDigest: compiled.packageDigest,
      packageManifest: compiled.packageManifest,
      targets,
      plan,
      executionRoot,
      skipCompleted: true,
    });
    return {
      ...result,
      summary: compiled.summary,
      targets,
      plan,
      materialized,
      idempotent: false,
    };
  }

  async function retry(input) {
    const current = await runDetail(
      input.config,
      input.target,
      input.runId
    );
    if (current.status === 'succeeded') {
      return { run: current, idempotent: true };
    }
    const run = await requestRunRetry(
      input.config,
      input.target,
      current
    );
    if (run.status !== 'packaged') {
      throw deliveryError(
        'DELIVERY_RUN_NOT_EXECUTABLE',
        `ReleaseRun ${run.id} 当前状态为 ${run.status}`,
        false
      );
    }
    const executionRoot = await materializePackageWorkspace({
      config: input.config,
      target: input.target,
      packageDigest: run.packageDigest,
      packageManifest: run.packageManifest,
      sourceWorkspaceRoot: input.workspaceRoot,
    });
    const previous = await latestSuccessfulRun(input.config, input.target, {
      excludeRunId: run.id,
    });
    const targets = releaseTargets(
      run.packageManifest,
      previous?.packageManifest || null
    );
    return await executeRun({
      config: input.config,
      target: input.target,
      run,
      packageDigest: run.packageDigest,
      packageManifest: run.packageManifest,
      targets,
      executionRoot,
      skipCompleted: true,
    });
  }

  async function rollback(input) {
    const targetRun = await findSuccessfulRunByRelease(
      input.config,
      input.target,
      input.releaseId
    );
    if (!targetRun) {
      throw deliveryError(
        'DELIVERY_ROLLBACK_RELEASE_NOT_FOUND',
        `未找到 App Release ${input.releaseId} 对应的成功 Delivery V2 记录`,
        false
      );
    }
    return await deploy({
      ...input,
      kind: 'rollback',
      packageDigest: targetRun.packageDigest,
      forceAll: true,
      idempotencyKey:
        input.idempotencyKey ||
        `rollback:${targetRun.id}:${Date.now().toString(36)}`,
    });
  }

  async function status(input) {
    return await runDetail(input.config, input.target, input.runId);
  }

  async function executeRun(input) {
    const originalCwd = process.cwd();
    const executionTarget = {
      ...input.target,
      deploymentId:
        input.run?.deploymentId ||
        input.run?.control?.deploymentId ||
        input.target.deploymentId ||
        null,
    };
    let activeRun = input.run;
    let currentStep = 'preparing';
    let currentComponent = 'delivery-v2';
    try {
      process.chdir(input.executionRoot);
      const executionTargets = normalizeLegacyPackageTargetsForExecution(
        input.targets,
        input.executionRoot
      );
      deps.installDeliveryContext(
        executionTarget,
        activeRun,
        executionTargets
      );
      restoreDeliveryCheckpointFiles(
        input.executionRoot,
        activeRun,
        executionTarget
      );
      const recordCheckpoint = async body => {
        const expectedAttempt = Number(activeRun?.attempt || 1);
        const updated = await checkpoint(
          input.config,
          executionTarget,
          activeRun.id,
          { ...body, expectedAttempt }
        );
        if (
          updated?.attempt !== undefined &&
          Number(updated.attempt) !== expectedAttempt
        ) {
          throw deliveryError(
            'DELIVERY_ATTEMPT_FENCED',
            `ReleaseRun ${activeRun.id} attempt ${expectedAttempt} 已被 attempt ${updated?.attempt || 'unknown'} 接管`,
            false
          );
        }
        return updated;
      };
      activeRun = await recordCheckpoint({
          stage: lifecycleStage('preparing', activeRun.attempt),
          status: 'preparing',
          component: 'package',
          progress: {
            packageDigest: input.packageDigest,
          },
        });
      const steps = decorateSteps(
        buildWorkspaceReleaseSteps(
          executionTargets,
          input.packageManifest.runtimeMode,
          executionTarget.profileName,
          activeRun.control?.changeId
        ),
        executionTarget,
        activeRun,
        input.packageManifest,
        input.executionRoot
      );

      const stepResults = {};
      for (const [index, step] of steps.entries()) {
        const doneStage = checkpointName('done', step.id);
        if (input.skipCompleted && activeRun.checkpoints?.[doneStage]) {
          const completedResult =
            activeRun.result?.[doneStage] || { resumed: true };
          if (step.resumeMode === 'replay-local') {
            currentStep = `${step.id}-replay-local`;
            currentComponent = step.stagedKind || step.id;
            const replayResult = await deps.runOpenXiangdaInProcess(
              [...step.args, '--replay-local'],
              { quiet: true }
            );
            stepResults[step.id] = {
              ...completedResult,
              resumed: true,
              localReplay: compactLocalReplayResult(replayResult),
            };
            activeRun = await recordCheckpoint({
              stage: lifecycleStage(
                `replay-${step.id}`,
                activeRun.attempt
              ),
              status: 'preparing',
              component: currentComponent,
              result: {
                mode: 'replay-local',
                ...compactLocalReplayResult(replayResult),
              },
            });
          } else {
            stepResults[step.id] = completedResult;
          }
          continue;
        }
        currentStep = step.id;
        currentComponent = step.stagedKind || step.id;
        if (step.id === 'app-finalize') {
          prepareAppFinalizeStep(step, {
            executionRoot: input.executionRoot,
            run: activeRun,
            target: executionTarget,
            steps,
          });
          activeRun = await recordCheckpoint({
            stage: lifecycleStage('activating', activeRun.attempt),
            status: 'activating',
            component: 'app-release',
            progress: {
              completed: index,
              total: steps.length,
            },
          });
        }
        const result = await deps.runOpenXiangdaInProcess(step.args, {
          quiet: true,
        });
        stepResults[step.id] = result;
        activeRun = await recordCheckpoint({
            stage: doneStage,
            component: currentComponent,
            progress: {
              completed: index + 1,
              total: steps.length,
            },
            result: compactStepResult(step.id, result, {
              executionRoot: input.executionRoot,
              run: activeRun,
              target: executionTarget,
            }),
          });
      }

      if (activeRun.status !== 'verifying') {
        if (activeRun.status !== 'activating') {
          activeRun = await recordCheckpoint({
              stage: lifecycleStage('activating', activeRun.attempt),
              status: 'activating',
              component: 'activation',
            });
        }
        activeRun = await recordCheckpoint({
            stage: lifecycleStage('verifying', activeRun.attempt),
            status: 'verifying',
            component: 'readback',
          });
      }
      const verification = await verifyActivation(
        input.config,
        executionTarget,
        stepResults
      );
      activeRun = await recordCheckpoint({
          stage: 'succeeded',
          status: 'succeeded',
          component: 'delivery-v2',
          progress: {
            completed: steps.length,
            total: steps.length,
          },
          result: {
            packageDigest: input.packageDigest,
            appReleaseId: verification.appReleaseId,
            runtimeReleaseId: verification.runtimeReleaseId,
          },
        });
      return {
        run: activeRun,
        packageDigest: input.packageDigest,
        packageManifest: input.packageManifest,
        steps: steps.map(step => ({
          id: step.id,
          command: step.command,
        })),
        verification,
      };
    } catch (error) {
      const failure = structuredFailure(
        error,
        activeRun?.id,
        currentStep,
        currentComponent
      );
      if (activeRun?.id) {
        try {
          await deps.requestWithAuth(
            input.config,
            executionTarget.profileName,
            runPath(
              executionTarget,
              `/${encodeURIComponent(activeRun.id)}/fail`
            ),
            {
              method: 'POST',
              retryTransient: true,
              body: {
                expectedAttempt: Number(activeRun?.attempt || 1),
                stage: failure.stage,
                component: failure.component,
                code: failure.code,
                message: failure.message,
                retryable: failure.retryable,
                details: {
                  progressPreserved: true,
                },
              },
            }
          );
        } catch {
          // The original execution failure remains authoritative.
        }
      }
      error.deliveryFailure = failure;
      error.data = failure;
      error.code = failure.code;
      throw error;
    } finally {
      try {
        deps.clearDeliveryContext(executionTarget, activeRun);
      } finally {
        process.chdir(originalCwd);
      }
    }
  }

  async function uploadArtifacts(config, target, artifacts) {
    for (const artifact of artifacts || []) {
      if (await artifactExists(config, target, artifact.digest)) continue;
      const query = new URLSearchParams({
        kind: artifact.kind,
        contentType: artifact.contentType || 'application/octet-stream',
        metadata: JSON.stringify(cleanObject(artifact.metadata)),
      });
      await deps.requestFormWithAuth(
        config,
        target.profileName,
        `${artifactPath(target, artifact.digest)}?${query.toString()}`,
        () => {
          const form = new FormData();
          form.append(
            'file',
            new Blob([artifact.buffer], {
              type: artifact.contentType || 'application/octet-stream',
            }),
            artifact.metadata?.path || artifact.digest
          );
          return form;
        },
        { retryTransient: true, retries: 2 }
      );
    }
  }

  async function artifactExists(config, target, digest) {
    try {
      await deps.requestWithAuth(
        config,
        target.profileName,
        artifactPath(target, digest),
        { retryTransient: true }
      );
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  async function downloadPackageManifest(config, target, digestInput) {
    const digest = normalizeDigest(digestInput);
    const downloaded = await deps.downloadWithAuth(
      config,
      target.profileName,
      `${artifactPath(target, digest)}/content`,
      { retries: 2 }
    );
    if (sha256(downloaded.buffer) !== digest) {
      throw deliveryError(
        'DELIVERY_PACKAGE_DOWNLOAD_DIGEST_MISMATCH',
        `下载的 package manifest 与 ${digest} 不一致`,
        true
      );
    }
    let manifest;
    try {
      manifest = JSON.parse(downloaded.buffer.toString('utf8'));
    } catch {
      throw deliveryError(
        'DELIVERY_PACKAGE_MANIFEST_INVALID',
        'package manifest 不是合法 JSON',
        false
      );
    }
    if (
      manifest.schemaVersion !== 'openxiangda-app-package-v2' ||
      sha256Canonical(manifest) !== digest
    ) {
      throw deliveryError(
        'DELIVERY_PACKAGE_MANIFEST_INVALID',
        'package manifest schema 或摘要无效',
        false
      );
    }
    return manifest;
  }

  async function materializePackageWorkspace(input) {
    const root = packageWorkspaceRoot(
      input.sourceWorkspaceRoot,
      input.packageDigest
    );
    fs.mkdirSync(root, { recursive: true });
    const sourceLayer = layerByKind(input.packageManifest, 'source');
    if (!sourceLayer) {
      throw deliveryError(
        'DELIVERY_PACKAGE_SOURCE_LAYER_MISSING',
        'package manifest 缺少 source layer',
        false
      );
    }
    await materializeFiles(
      input.config,
      input.target,
      root,
      sourceLayer.files || []
    );
    const stateSource = path.join(
      path.resolve(input.sourceWorkspaceRoot || process.cwd()),
      '.openxiangda',
      'state.json'
    );
    const stateTarget = path.join(root, '.openxiangda', 'state.json');
    if (fs.existsSync(stateSource)) {
      fs.mkdirSync(path.dirname(stateTarget), { recursive: true });
      fs.copyFileSync(stateSource, stateTarget);
    } else if (fs.existsSync(stateTarget)) {
      fs.unlinkSync(stateTarget);
    }
    const nodeModulesTarget = path.join(root, 'node_modules');
    const sealedBuild =
      input.packageManifest?.buildRequirements?.workspaceNodeModules ===
      'forbidden';
    if (sealedBuild) {
      materializeBundledBuildClosure(root);
    } else {
      const nodeModulesSource = path.join(
        path.resolve(input.sourceWorkspaceRoot || process.cwd()),
        'node_modules'
      );
      if (
        fs.existsSync(nodeModulesSource) &&
        !fs.existsSync(nodeModulesTarget)
      ) {
        fs.symlinkSync(nodeModulesSource, nodeModulesTarget, 'dir');
      }
    }
    const runtimeLayer = layerByKind(input.packageManifest, 'runtime');
    if (runtimeLayer) {
      await materializeFiles(
        input.config,
        input.target,
        path.join(root, 'dist'),
        runtimeLayer.files || []
      );
    }
    return root;
  }

  async function materializeFiles(config, target, root, files) {
    for (const descriptor of files) {
      const relative = safeRelativePath(descriptor.path);
      const destination = path.join(root, relative);
      if (fs.existsSync(destination)) {
        const existing = fs.readFileSync(destination);
        if (sha256(existing) === descriptor.digest) continue;
      }
      const downloaded = await deps.downloadWithAuth(
        config,
        target.profileName,
        `${artifactPath(target, descriptor.digest)}/content`,
        { retries: 2 }
      );
      if (sha256(downloaded.buffer) !== descriptor.digest) {
        throw deliveryError(
          'DELIVERY_ARTIFACT_DOWNLOAD_DIGEST_MISMATCH',
          `制品 ${descriptor.digest} 下载校验失败`,
          true
        );
      }
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const temporary = `${destination}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, downloaded.buffer, { mode: 0o600 });
      fs.renameSync(temporary, destination);
    }
  }

  async function latestSuccessfulRun(config, target, options = {}) {
    const list = await deps.requestWithAuth(
      config,
      target.profileName,
      `${runPath(target)}?limit=100`,
      { retryTransient: true }
    );
    const candidate = (list?.items || []).find(
      item =>
        item.status === 'succeeded' &&
        item.id !== options.excludeRunId &&
        sameEnvironment(item, target)
    );
    return candidate
      ? await runDetail(config, target, candidate.id)
      : null;
  }

  async function findSuccessfulRunByRelease(config, target, releaseId) {
    const list = await deps.requestWithAuth(
      config,
      target.profileName,
      `${runPath(target)}?limit=100`,
      { retryTransient: true }
    );
    for (const item of list?.items || []) {
      if (item.status !== 'succeeded' || !sameEnvironment(item, target)) {
        continue;
      }
      const detail = await runDetail(config, target, item.id);
      if (
        detail.result?.succeeded?.appReleaseId === releaseId ||
        detail.result?.activation?.appReleaseId === releaseId
      ) {
        return detail;
      }
    }
    return null;
  }

  async function runDetail(config, target, runId) {
    return await deps.requestWithAuth(
      config,
      target.profileName,
      runPath(target, `/${encodeURIComponent(runId)}`),
      { retryTransient: true }
    );
  }

  async function createRun(input) {
    return await deps.requestWithAuth(
      input.config,
      input.target.profileName,
      runPath(input.target),
      {
        method: 'POST',
        retryTransient: true,
        retries: 2,
        body: {
          environmentId: input.target.environmentId || null,
          environmentKind: input.target.environmentKind || null,
          kind: input.kind,
          packageDigest: input.packageDigest,
          packageManifest: input.packageManifest,
          idempotencyKey: input.idempotencyKey,
          clientSessionId: input.clientSessionId,
        },
      }
    );
  }

  async function requestRunRetry(config, target, run) {
    return await deps.requestWithAuth(
      config,
      target.profileName,
      runPath(target, `/${encodeURIComponent(run.id)}/retry`),
      {
        method: 'POST',
        retryTransient: true,
        body: { expectedAttempt: Number(run.attempt || 1) },
      }
    );
  }

  async function checkpoint(config, target, runId, body) {
    return await deps.requestWithAuth(
      config,
      target.profileName,
      runPath(target, `/${encodeURIComponent(runId)}/checkpoints`),
      {
        method: 'POST',
        retryTransient: true,
        retries: 2,
        body,
      }
    );
  }

  async function verifyActivation(config, target, stepResults) {
    const [appHead, runtimeHead] = await Promise.all([
      deps.requestWithAuth(
        config,
        target.profileName,
        appApiPath(target, '/app-releases/head'),
        { retryTransient: true }
      ),
      deps.requestWithAuth(
        config,
        target.profileName,
        appApiPath(target, '/runtime/releases/head'),
        { retryTransient: true }
      ),
    ]);
    const finalized = stepResults['app-finalize'];
    const expectedAppReleaseId =
      finalized?.activated?.id ||
      finalized?.verified?.id ||
      finalized?.prepared?.id ||
      null;
    const activeAppReleaseId =
      appHead?.activeAppReleaseId || appHead?.release?.id || null;
    if (
      expectedAppReleaseId &&
      activeAppReleaseId &&
      expectedAppReleaseId !== activeAppReleaseId
    ) {
      throw deliveryError(
        'DELIVERY_ACTIVATION_READBACK_MISMATCH',
        `App Release 激活读回不一致: expected=${expectedAppReleaseId} actual=${activeAppReleaseId}`,
        true
      );
    }
    return {
      appReleaseId: activeAppReleaseId || expectedAppReleaseId,
      runtimeReleaseId: runtimeHead?.activeRuntimeReleaseId || null,
      runtimeBuildId: runtimeHead?.activeRuntimeBuildId || null,
    };
  }

  return {
    deploy,
    inspect,
    retry,
    rollback,
    status,
  };
}

function packageWorkspaceRoot(sourceWorkspaceRoot, digestInput) {
  const sourceWorkspace = path.resolve(
    sourceWorkspaceRoot || process.cwd()
  );
  const workspaceKey = sha256(Buffer.from(sourceWorkspace)).slice(0, 20);
  return path.join(
    fs.realpathSync(os.tmpdir()),
    'openxiangda-delivery-v2',
    workspaceKey,
    normalizeDigest(digestInput)
  );
}

function materializeBundledBuildClosure(root) {
  const nodeModulesRoot = path.join(root, 'node_modules');
  if (
    fs.existsSync(nodeModulesRoot) &&
    fs.lstatSync(nodeModulesRoot).isSymbolicLink()
  ) {
    throw deliveryError(
      'DELIVERY_BUILD_CLOSURE_CONTAMINATED',
      `密封构建 node_modules 不能是软链接: ${nodeModulesRoot}`,
      false
    );
  }
  fs.mkdirSync(nodeModulesRoot, { recursive: true });
  ensureBuildClosureLink(
    path.join(nodeModulesRoot, 'openxiangda'),
    path.resolve(__dirname, '..')
  );
  const nodeTypesRoot = path.dirname(
    require.resolve('@types/node/package.json')
  );
  const scopedTypesRoot = path.join(nodeModulesRoot, '@types');
  fs.mkdirSync(scopedTypesRoot, { recursive: true });
  ensureBuildClosureLink(path.join(scopedTypesRoot, 'node'), nodeTypesRoot);
}

function ensureBuildClosureLink(target, source) {
  const resolvedSource = fs.realpathSync(source);
  if (fs.existsSync(target)) {
    const stat = fs.lstatSync(target);
    if (
      !stat.isSymbolicLink() ||
      fs.realpathSync(target) !== resolvedSource
    ) {
      throw deliveryError(
        'DELIVERY_BUILD_CLOSURE_CONTAMINATED',
        `密封构建依赖槽位被非预期内容占用: ${target}`,
        false
      );
    }
    return;
  }
  fs.symlinkSync(resolvedSource, target, 'dir');
}

function releaseTargets(manifest, previousManifest, options = {}) {
  const layerChanged = kind =>
    options.forceAll === true ||
    layerByKind(manifest, kind)?.digest !==
      layerByKind(previousManifest, kind)?.digest;
  const resources = manifest?.resources || {};
  const previousResources = previousManifest?.resources || {};
  const fingerprints = resources.resourceFingerprints || {};
  const previousFingerprints =
    previousResources.resourceFingerprints || {};
  const diffBucket = (kind, layerKind, currentCodes, previousCodes) =>
    diffResourceFingerprintBucket({
      current: fingerprints[kind],
      previous: previousFingerprints[kind],
      currentCodes,
      previousCodes,
      changed:
        layerChanged(layerKind) ||
        fingerprintBucketChanged(
          fingerprints[kind],
          previousFingerprints[kind]
        ),
      forceAll: options.forceAll === true,
      sharedChanged:
        fingerprints.shared?.[layerKind] !==
        previousFingerprints.shared?.[layerKind],
    });
  const formDiff = diffBucket(
    'forms',
    'form',
    resources.forms,
    previousResources.forms
  );
  const functionDiff = diffBucket(
    'functions',
    'backend',
    resources.functions,
    previousResources.functions
  );
  const automationDiff = diffBucket(
    'automations',
    'backend',
    resources.automations,
    previousResources.automations
  );
  const workflowDiff = diffBucket(
    'workflows',
    'workflow',
    resources.workflows,
    previousResources.workflows
  );
  const resourceSelectors = {};
  const resourceDeletes = {};
  const selectedConfigurationOwners = [];
  if (
    layerChanged('configuration') ||
    fingerprintBucketChanged(
      fingerprints.configuration,
      previousFingerprints.configuration
    )
  ) {
    const types = new Set([
      ...Object.keys(resources.configuration || {}),
      ...Object.keys(previousResources.configuration || {}),
    ]);
    for (const type of [...types].sort()) {
      const key = CONFIG_TARGET_BY_RESOURCE_TYPE[type];
      if (!key) continue;
      const diff = diffResourceFingerprintBucket({
        current: fingerprints.configuration?.[type],
        previous: previousFingerprints.configuration?.[type],
        currentCodes: resources.configuration?.[type],
        previousCodes: previousResources.configuration?.[type],
        changed: true,
        forceAll: options.forceAll === true,
        sharedChanged:
          fingerprints.shared?.configuration !==
          previousFingerprints.shared?.configuration,
      });
      if (diff.changed.length > 0) {
        resourceSelectors[key] = diff.changed;
        selectedConfigurationOwners.push(
          ...diff.changed.map(code => `${type}:${code}`)
        );
      }
      if (diff.removed.length > 0) {
        resourceDeletes[key] = diff.removed;
      }
    }
  }
  const permissionAffectedForms = uniqueStrings(
    (resourceSelectors.formPermissionGroups || []).flatMap(
      code => resources.formPermissionGroupForms?.[code] || []
    )
  );
  const forms = uniqueStrings([
    ...formDiff.changed,
    ...permissionAffectedForms,
  ]);
  const dependencyForms = new Set();
  const dependenciesByResource =
    resources.formDependenciesByResource || {};
  for (const owner of [
    ...functionDiff.changed.map(code => `function:${code}`),
    ...automationDiff.changed.map(code => `automation:${code}`),
  ]) {
    for (const code of dependenciesByResource.backend?.[owner] || []) {
      dependencyForms.add(String(code));
    }
  }
  for (const owner of workflowDiff.changed.map(code => `workflow:${code}`)) {
    for (const code of dependenciesByResource.workflow?.[owner] || []) {
      dependencyForms.add(String(code));
    }
  }
  for (const owner of selectedConfigurationOwners) {
    for (const code of
      dependenciesByResource.configuration?.[owner] || []) {
      dependencyForms.add(String(code));
    }
  }
  const hasResourceDependencyIndex =
    dependenciesByResource &&
    Object.keys(dependenciesByResource).length > 0;
  if (
    !hasResourceDependencyIndex &&
    (functionDiff.changed.length > 0 ||
      automationDiff.changed.length > 0 ||
      workflowDiff.changed.length > 0 ||
      selectedConfigurationOwners.length > 0)
  ) {
    for (const code of resources.formDependencies || []) {
      dependencyForms.add(String(code));
    }
  }
  for (const code of forms) dependencyForms.delete(code);
  if (formDiff.removed.length > 0) {
    resourceDeletes.forms = formDiff.removed;
  }
  if (functionDiff.removed.length > 0) {
    resourceDeletes.functions = functionDiff.removed;
  }
  if (automationDiff.removed.length > 0) {
    resourceDeletes.automations = automationDiff.removed;
  }
  if (workflowDiff.removed.length > 0) {
    resourceDeletes.workflows = workflowDiff.removed;
  }
  return {
    forms,
    formDependencies: uniqueStrings([...dependencyForms]),
    pages: [],
    functions: functionDiff.changed,
    automations: automationDiff.changed,
    workflows: workflowDiff.changed,
    jsCodeNodes: [],
    resources: false,
    resourceSelectors,
    resourceDeletes,
    runtime: Boolean(
      layerByKind(manifest, 'runtime') && layerChanged('runtime')
    ),
    other: [],
  };
}

function describeExecutionPlan(targets, runtimeMode, profileName) {
  const steps = buildWorkspaceReleaseSteps(
    targets,
    runtimeMode,
    profileName,
    'delivery-v2-plan'
  );
  return {
    stepCount: steps.length,
    steps: steps.map(step => ({
      id: step.id,
      command: step.command,
      resumeMode: step.resumeMode,
      stagedKind: step.stagedKind,
    })),
  };
}

function diffResourceFingerprintBucket(options = {}) {
  const currentCodes = uniqueStrings(options.currentCodes);
  const previousCodes = uniqueStrings(options.previousCodes);
  if (!options.changed) return { changed: [], removed: [] };
  const current = isPlainObject(options.current) ? options.current : null;
  const previous = isPlainObject(options.previous) ? options.previous : null;
  const removed = previousCodes.filter(code => !currentCodes.includes(code));
  if (
    options.forceAll ||
    options.sharedChanged ||
    !current ||
    !previous
  ) {
    return { changed: currentCodes, removed };
  }
  return {
    changed: currentCodes.filter(
      code => !previous[code] || previous[code] !== current[code]
    ),
    removed,
  };
}

function isPlainObject(value) {
  return Boolean(
    value && typeof value === 'object' && !Array.isArray(value)
  );
}

function fingerprintBucketChanged(current, previous) {
  if (!isPlainObject(current) && !isPlainObject(previous)) return false;
  return sha256Canonical(current || {}) !== sha256Canonical(previous || {});
}

function decorateSteps(
  steps,
  target,
  run,
  packageManifest,
  executionRoot
) {
  const result = [];
  for (const original of steps) {
    const step = {
      ...original,
      args: [...original.args],
    };
    if (target.targetName) {
      step.args.push('--environment', target.targetName);
    }
    if (target.deploymentId) {
      step.args.push('--deployment-id', target.deploymentId);
    }
    if (step.id === 'runtime-stage') {
      const runtime = layerByKind(packageManifest, 'runtime');
      step.args.push(
        '--no-build',
        '--dist',
        path.join(executionRoot, 'dist'),
        '--build-id',
        deliveryV2RuntimeBuildId(runtime?.digest, run?.packageDigest),
        '--upload-mode',
        'staged',
        '--recover-stale-source-mismatch'
      );
    }
    if (step.id === 'app-finalize') {
      if (target.environmentId) {
        step.args.push('--environment-id', target.environmentId);
      }
      step.args.push('--delivery-run-id', run.id);
      const stagedIndex = step.args.indexOf('--staged-resources-json');
      if (stagedIndex >= 0 && target.deploymentId) {
        step.args[stagedIndex + 1] = path
          .relative(
            executionRoot,
            path.join(
              deliveryReleaseDirectory(
                executionRoot,
                run.control?.changeId,
                target.deploymentId
              ),
              'staged-resources.json'
            )
          )
          .replace(/\\/g, '/');
      }
    }
    step.command = commandFromArgs(step.args);
    result.push(step);
  }
  return result;
}

function deliveryV2RuntimeBuildId(runtimeDigest, packageDigest) {
  const normalizedRuntimeDigest = String(runtimeDigest || '')
    .trim()
    .toLowerCase();
  const normalizedPackageDigest = String(packageDigest || '')
    .trim()
    .toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalizedRuntimeDigest)) {
    throw deliveryError(
      'DELIVERY_RUNTIME_LAYER_DIGEST_INVALID',
      'Runtime layer digest 必须是 64 位 SHA-256',
      false
    );
  }
  if (!/^[a-f0-9]{64}$/.test(normalizedPackageDigest)) {
    throw deliveryError(
      'DELIVERY_PACKAGE_DIGEST_INVALID',
      'package digest 必须是 64 位 SHA-256',
      false
    );
  }
  return `pkg-${normalizedRuntimeDigest.slice(0, 20)}-${normalizedPackageDigest.slice(0, 12)}`;
}

function packageSummary(manifest, previousManifest) {
  return {
    sourceFileCount: layerByKind(manifest, 'source')?.fileCount || 0,
    artifactUploadCount: 0,
    layers: (manifest.layers || []).map(layer => ({
      kind: layer.kind,
      digest: layer.digest,
      sourceHash: layer.sourceHash,
      reused:
        layer.digest === layerByKind(previousManifest, layer.kind)?.digest,
      built: false,
      fileCount: layer.fileCount,
      size: layer.size,
    })),
  };
}

function compactStepResult(stepId, result, context = {}) {
  if (!result || typeof result !== 'object') return { ok: true };
  if (stepId === 'app-finalize') {
    return {
      appReleaseId:
        result.activated?.id ||
        result.verified?.id ||
        result.prepared?.id ||
        null,
    };
  }
  const compact = {
    ok: true,
    id: result.id || result.release?.id || null,
  };
  const stagedResources = normalizeCheckpointStagedResources(
    Array.isArray(result.stagedResources)
      ? result.stagedResources
      : result.stagedResource
        ? [result.stagedResource]
        : []
  );
  if (stagedResources.length > 0) {
    compact.stagedResources = stagedResources;
  }
  const satisfiedSelectors = uniqueStrings(result.satisfiedSelectors);
  if (satisfiedSelectors.length > 0) {
    compact.satisfiedSelectors = satisfiedSelectors;
  }
  if (stepId === 'form-ensure') {
    const replay = compactLocalReplayResult(result);
    if (replay.forms) compact.formBindings = replay.forms;
  }
  if (stepId === 'backend-stage') {
    const bindingContracts = readDeliverySupportFile(
      context.executionRoot,
      context.run,
      context.target,
      'backend-binding-contracts.json'
    );
    if (bindingContracts) {
      compact.backendBindingContracts = bindingContracts;
    }
    if (result.deliveryV2BackendManifestReplacement) {
      compact.backendManifestReplacement =
        result.deliveryV2BackendManifestReplacement;
    }
  }
  return compact;
}

function prepareAppFinalizeStep(step, context = {}) {
  const stagedIndex = step.args.indexOf('--staged-resources-json');
  if (stagedIndex < 0) {
    return {
      mode: 'frozen-capture',
      stagedResourceCount: 0,
    };
  }

  const stagedStepIds = (context.steps || [])
    .filter(candidate => Boolean(candidate.stagedKind))
    .map(candidate => candidate.id);
  const incompleteStagedCheckpoints = stagedStepIds.filter(stepId => {
    const checkpointResult =
      context.run?.result?.[checkpointName('done', stepId)];
    if (!checkpointResult?.id) return false;
    return (
      normalizeCheckpointStagedResources(
        checkpointResult.stagedResources || []
      ).length === 0
    );
  });
  if (incompleteStagedCheckpoints.length > 0) {
    throw deliveryError(
      'DELIVERY_CHECKPOINT_STAGED_RESOURCES_MISSING',
      `服务端检查点 ${incompleteStagedCheckpoints.join(
        ', '
      )} 已记录子 Release，但缺少可恢复 stagedResources`,
      false
    );
  }

  const restored = restoreDeliveryCheckpointFiles(
    context.executionRoot,
    context.run,
    context.target
  );
  if (restored.stagedResourceCount === 0) {
    step.args.splice(stagedIndex, 2);
    step.command = commandFromArgs(step.args);
    return {
      mode: 'frozen-capture',
      stagedResourceCount: 0,
    };
  }

  const stagedResourcesPath = path.resolve(
    context.executionRoot,
    step.args[stagedIndex + 1]
  );
  if (!fs.existsSync(stagedResourcesPath)) {
    throw deliveryError(
      'DELIVERY_CHECKPOINT_FILE_MISSING',
      '服务端 stagedResources 检查点已恢复，但 app-finalize 暂存资源文件缺失',
      false
    );
  }
  step.command = commandFromArgs(step.args);
  return {
    mode: 'staged-children',
    stagedResourceCount: restored.stagedResourceCount,
  };
}

function restoreDeliveryCheckpointFiles(executionRoot, run, target) {
  const changeId = String(run?.control?.changeId || '').trim();
  if (!changeId) return { stagedResourceCount: 0, restored: false };
  const checkpointResults = Object.values(run?.result || {});
  const staged = new Map();
  const satisfiedSelectors = [];
  let backendBindingContracts = null;
  for (const result of checkpointResults) {
    for (const resource of normalizeCheckpointStagedResources(
      result?.stagedResources || []
    )) {
      staged.set(checkpointStagedResourceKey(resource), resource);
    }
    satisfiedSelectors.push(...uniqueStrings(result?.satisfiedSelectors));
    if (result?.backendBindingContracts) {
      backendBindingContracts = cloneJson(result.backendBindingContracts);
    }
  }
  if (staged.size === 0 && !backendBindingContracts) {
    return { stagedResourceCount: 0, restored: false };
  }
  const releaseDir = deliveryReleaseDirectory(
    executionRoot,
    changeId,
    target?.deploymentId
  );
  fs.mkdirSync(releaseDir, { recursive: true });
  const resources = Array.from(staged.values()).sort((left, right) =>
    checkpointStagedResourceKey(left).localeCompare(
      checkpointStagedResourceKey(right)
    )
  );
  if (resources.length > 0) {
    writeJsonAtomic(
      path.join(releaseDir, 'staged-resources.json'),
      resources
    );
    writeJsonAtomic(
      path.join(releaseDir, 'staged-resources.context.json'),
      {
        contractVersion: 'staged_resources_context_v1',
        appType: target.appType,
        profile: target.profileName,
        changeId,
        deploymentId: target.deploymentId || null,
        baselineId: run.control?.baselineId || null,
        clientSessionId: run.control?.clientSessionId || null,
        initializedAt: new Date().toISOString(),
        restoredFromDeliveryRunId: run.id,
        ...(uniqueStrings(satisfiedSelectors).length > 0
          ? { satisfiedSelectors: uniqueStrings(satisfiedSelectors) }
          : {}),
      }
    );
  }
  if (backendBindingContracts) {
    writeJsonAtomic(
      path.join(releaseDir, 'backend-binding-contracts.json'),
      backendBindingContracts
    );
  }
  return {
    stagedResourceCount: resources.length,
    restored: true,
    backendBindingContracts: Boolean(backendBindingContracts),
  };
}

function readDeliverySupportFile(
  executionRoot,
  run,
  target,
  fileName
) {
  const changeId = String(run?.control?.changeId || '').trim();
  if (!changeId || !executionRoot) return null;
  const file = path.join(
    deliveryReleaseDirectory(
      executionRoot,
      changeId,
      target?.deploymentId
    ),
    fileName
  );
  if (!fs.existsSync(file)) return null;
  try {
    return cloneJson(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    throw deliveryError(
      'DELIVERY_CHECKPOINT_FILE_INVALID',
      `${fileName} 不是合法 JSON，不能创建可恢复检查点`,
      false
    );
  }
}

function deliveryReleaseDirectory(executionRoot, changeId, deploymentId) {
  const normalizedChangeId = String(changeId || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalizedChangeId)) {
    throw deliveryError(
      'DELIVERY_CONTROL_INVALID',
      'ReleaseRun changeId 不能用于恢复暂存资源',
      false
    );
  }
  const base = path.join(
    path.resolve(executionRoot),
    '.openxiangda',
    'releases',
    normalizedChangeId
  );
  return deploymentId ? path.join(base, String(deploymentId)) : base;
}

function normalizeCheckpointStagedResources(values) {
  if (!Array.isArray(values)) return [];
  const supportedKinds = new Set([
    'RuntimeRelease',
    'PageRelease',
    'BackendRelease',
    'WorkflowRelease',
    'FormRelease',
  ]);
  return values
    .filter(value => value && typeof value === 'object' && !Array.isArray(value))
    .filter(value => supportedKinds.has(String(value.kind || '').trim()))
    .filter(value => {
      const releaseId = String(
        value.identity?.releaseId || value.releaseId || ''
      ).trim();
      const hash = String(value.hash || value.resourceHash || '')
        .trim()
        .toLowerCase();
      const formUuid = String(
        value.identity?.formUuid || value.formUuid || ''
      ).trim();
      return (
        Boolean(releaseId) &&
        /^[a-f0-9]{64}$/.test(hash) &&
        (value.kind !== 'FormRelease' || Boolean(formUuid))
      );
    })
    .map(cloneJson);
}

function checkpointStagedResourceKey(resource) {
  if (resource.kind === 'FormRelease') {
    return `FormRelease:${
      resource.identity?.formUuid || resource.formUuid
    }`;
  }
  return String(resource.kind);
}

function uniqueStrings(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map(value => String(value || '').trim())
        .filter(Boolean)
    )
  ).sort();
}

function writeJsonAtomic(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  fs.renameSync(temporary, file);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function structuredFailure(error, runId, stage, component) {
  const code =
    error?.code ||
    error?.payload?.errorCode ||
    error?.payload?.data?.code ||
    'DELIVERY_EXECUTION_FAILED';
  return {
    runId: runId || null,
    stage: stage || 'unknown',
    component: component || 'unknown',
    code: String(code),
    message: String(error?.message || 'Delivery V2 执行失败'),
    retryable: error?.retryable !== false,
    progressPreserved: true,
  };
}

function compactLocalReplayResult(result) {
  const forms = Array.isArray(result?.forms)
    ? result.forms
        .map(item => ({
          code: String(item?.code || '').trim(),
          formUuid: String(item?.formUuid || '').trim(),
          action: String(item?.action || '').trim(),
        }))
        .filter(item => item.code && item.formUuid)
        .sort((left, right) => left.code.localeCompare(right.code))
    : [];
  return {
    ok: true,
    ...(forms.length > 0 ? { forms } : {}),
  };
}

function runNotExecutableError(run, target) {
  const environment =
    target?.targetName || target?.environmentKind || '当前环境';
  const retryCommand = `openxiangda retry ${run?.id} --environment ${environment}`;
  const code =
    run?.status === 'cancelled'
      ? 'DELIVERY_RUN_CANCELLED'
      : 'DELIVERY_RUN_ALREADY_EXECUTING';
  const error = deliveryError(
    code,
    `ReleaseRun ${run?.id || 'unknown'} 当前状态为 ${run?.status || 'unknown'}；如确认原执行器已停止，请运行 ${retryCommand}`,
    false
  );
  error.runId = run?.id || null;
  error.runStatus = run?.status || null;
  error.nextAction = retryCommand;
  return error;
}

function layerByKind(manifest, kind) {
  return (manifest?.layers || []).find(layer => layer.kind === kind) || null;
}

function runPath(target, suffix = '') {
  return `${appApiPath(target, '/delivery/runs')}${suffix}`;
}

function artifactPath(target, digest) {
  return appApiPath(
    target,
    `/delivery/artifacts/${encodeURIComponent(digest)}`
  );
}

function appApiPath(target, suffix) {
  return `/openxiangda-api/v1/apps/${encodeURIComponent(
    target.appType
  )}${suffix}`;
}

function checkpointName(prefix, value) {
  return `${prefix}-${String(value || 'step')
    .replace(/[^a-z0-9-]+/gi, '-')
    .toLowerCase()}`.slice(0, 64);
}

function lifecycleStage(name, attempt) {
  return `${name}-attempt-${Math.max(Number(attempt) || 1, 1)}`;
}

function sameEnvironment(run, target) {
  return String(run.environmentId || '') === String(target.environmentId || '');
}

function defaultIdempotencyKey(kind, target, digest) {
  return [
    'delivery-v2',
    kind,
    target.appType,
    target.environmentId || 'direct',
    digest,
  ].join(':');
}

function normalizeLegacyPackageTargetsForExecution(targets, executionRoot) {
  const selectors = targets?.resourceSelectors?.dataViews;
  if (!Array.isArray(selectors) || selectors.length === 0) return targets;
  const dataViewDir = path.join(
    path.resolve(executionRoot),
    'src',
    'resources',
    'data-views'
  );
  if (!fs.existsSync(dataViewDir)) return targets;

  const actualCodes = new Set();
  const legacyNestedCodes = new Set();
  const visit = directory => {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      let value;
      try {
        value = JSON.parse(fs.readFileSync(absolute, 'utf8'));
      } catch {
        // The resource command remains responsible for reporting malformed
        // manifests. This compatibility normalization only narrows selectors.
        continue;
      }
      const topLevelCodes = collectConfigurationManifestCodes(
        'data-view',
        value
      );
      for (const code of topLevelCodes) {
        actualCodes.add(code);
      }
      const topLevelSet = new Set(topLevelCodes);
      for (const code of collectManifestCodes(value)) {
        if (!topLevelSet.has(code)) legacyNestedCodes.add(code);
      }
    }
  };
  visit(dataViewDir);
  if (actualCodes.size === 0 || legacyNestedCodes.size === 0) return targets;

  const filtered = selectors.filter(
    code => !legacyNestedCodes.has(String(code)) || actualCodes.has(String(code))
  );
  if (filtered.length === selectors.length) return targets;
  return {
    ...targets,
    resourceSelectors: {
      ...(targets.resourceSelectors || {}),
      dataViews: filtered,
    },
  };
}

function normalizeDigest(value) {
  const digest = String(value || '')
    .trim()
    .toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw deliveryError(
      'DELIVERY_PACKAGE_DIGEST_INVALID',
      'package digest 必须是 64 位 SHA-256',
      false
    );
  }
  return digest;
}

function safeRelativePath(value) {
  const normalized = String(value || '').replace(/\\/g, '/');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    normalized.includes('../') ||
    normalized === '..'
  ) {
    throw deliveryError(
      'DELIVERY_ARTIFACT_PATH_INVALID',
      `制品路径无效: ${value}`,
      false
    );
  }
  return normalized;
}

function isNotFound(error) {
  return (
    Number(error?.status || error?.statusCode) === 404 ||
    /\bHTTP 404\b|NOT_FOUND/i.test(String(error?.message || ''))
  );
}

function cleanObject(value) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, item]) => item !== undefined)
  );
}

function deliveryError(code, message, retryable) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.retryable = retryable;
  return error;
}

function assertDependencies(value) {
  const required = [
    'clearDeliveryContext',
    'downloadWithAuth',
    'installDeliveryContext',
    'requestFormWithAuth',
    'requestWithAuth',
    'runOpenXiangdaInProcess',
  ];
  for (const key of required) {
    if (typeof value?.[key] !== 'function') {
      throw new Error(`Delivery V2 executor dependency 缺失: ${key}`);
    }
  }
  return value;
}

module.exports = {
  CONFIG_TARGET_BY_RESOURCE_TYPE,
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
};
