const crypto = require('crypto');
const { createDeliveryV2Executor } = require('./delivery-v2-executor');
const { parseArgs, print, warn, writeJson } = require('./utils');

function createDeliveryV2Cli(dependencies) {
  const deps = assertDependencies(dependencies);
  const executor = createDeliveryV2Executor(deps);

  async function run(command, argv = []) {
    const { flags, positional } = parseArgs(argv);
    if (flags.help || flags.h) {
      printHelp(command);
      return;
    }
    const config = deps.loadConfig();
    if (command === 'check') {
      const target = resolveTarget(config, flags, positional, false);
      const inspected = await executor.inspect({
        config,
        target,
        workspaceRoot: process.cwd(),
        skipBuild: flags.build !== true,
        buildCommand: stringFlag(flags, 'build-command'),
        distDir: stringFlag(flags, 'dist'),
        onBuildOutput: buildOutput(flags),
      });
      return output(
        flags,
        {
          ok: true,
          appType: target.appType,
          environment: target.targetName || target.environmentKind || null,
          packageDigest: inspected.compiled.packageDigest,
          summary: inspected.compiled.summary,
          targets: inspected.targets,
          plan: inspected.plan,
          previousPackageDigest: inspected.previous?.packageDigest || null,
        },
        `Delivery V2 检查通过: ${inspected.compiled.packageDigest}`
      );
    }
    if (command === 'deploy') {
      const target = resolveTarget(config, flags, positional, true);
      const packageDigest = stringFlag(flags, 'package');
      const result = await executor.deploy({
        config,
        target,
        workspaceRoot: process.cwd(),
        packageDigest,
        buildCommand: stringFlag(flags, 'build-command'),
        distDir: stringFlag(flags, 'dist'),
        clientSessionId: createClientSessionId(),
        onBuildOutput: buildOutput(flags),
      });
      return output(
        flags,
        result,
        `Delivery V2 发布成功: run=${result.run.id} package=${result.packageDigest}`
      );
    }
    if (command === 'status') {
      const runId = positional[0] || stringFlag(flags, 'run');
      if (!runId) {
        throw usageError('用法: openxiangda status <runId> [--json]');
      }
      const resolved = await resolveRunTarget(config, flags, runId);
      const result = resolved.run;
      return output(
        flags,
        result,
        `Delivery V2: run=${result.id} status=${result.status} stage=${result.stage}`
      );
    }
    if (command === 'retry') {
      const runId = positional[0] || stringFlag(flags, 'run');
      if (!runId) {
        throw usageError('用法: openxiangda retry <runId> [--json]');
      }
      const resolved = await resolveRunTarget(config, flags, runId);
      const target = resolved.target;
      const result = await executor.retry({
        config,
        target,
        runId,
        workspaceRoot: process.cwd(),
      });
      return output(
        flags,
        result,
        `Delivery V2 重试成功: run=${result.run.id} status=${result.run.status}`
      );
    }
    if (command === 'rollback') {
      const target = resolveTarget(config, flags, positional, true);
      const releaseId = stringFlag(flags, 'to');
      if (!releaseId) {
        throw usageError(
          '用法: openxiangda rollback <environment> --to <appReleaseId>'
        );
      }
      const result = await executor.rollback({
        config,
        target,
        releaseId,
        workspaceRoot: process.cwd(),
        clientSessionId: createClientSessionId(),
      });
      return output(
        flags,
        result,
        `Delivery V2 回滚成功: run=${result.run.id} package=${result.packageDigest}`
      );
    }
    throw usageError(`未知 Delivery V2 命令: ${command}`);
  }

  function resolveTarget(config, flags, positional, environmentRequired) {
    const environment =
      positional[0] ||
      stringFlag(flags, 'environment') ||
      stringFlag(flags, 'target');
    if (environmentRequired && !environment) {
      throw usageError(
        '必须指定环境，例如 openxiangda deploy preproduction'
      );
    }
    return deps.getWorkspaceTarget(
      config,
      stringFlag(flags, 'profile') || config.currentProfile,
      {
        ...flags,
        ...(environment ? { environment } : {}),
      }
    );
  }

  async function resolveRunTarget(config, flags, runId) {
    const explicitEnvironment =
      stringFlag(flags, 'environment') || stringFlag(flags, 'target');
    if (explicitEnvironment) {
      const target = resolveTarget(
        config,
        { ...flags, environment: explicitEnvironment },
        [],
        false
      );
      return {
        target,
        run: await executor.status({ config, target, runId }),
      };
    }

    const candidates = [];
    const addCandidate = candidate => {
      if (!candidate) return;
      const key = [
        candidate.profileName,
        candidate.appType,
        candidate.environmentId || 'direct',
      ].join(':');
      if (candidates.some(item => item.key === key)) return;
      candidates.push({ key, target: candidate });
    };
    try {
      addCandidate(resolveTarget(config, flags, [], false));
    } catch {
      // A multi-environment workspace may require an explicit target; probe
      // the canonical targets below before returning a not-found error.
    }
    for (const environment of ['preproduction', 'production']) {
      try {
        addCandidate(
          deps.getWorkspaceTarget(
            config,
            stringFlag(flags, 'profile') || config.currentProfile,
            { ...flags, environment }
          )
        );
      } catch {
        // This workspace does not define the candidate environment.
      }
    }

    let notFound = null;
    for (const candidate of candidates) {
      try {
        const run = await executor.status({
          config,
          target: candidate.target,
          runId,
        });
        return { target: candidate.target, run };
      } catch (error) {
        if (!isRunNotFoundError(error)) throw error;
        notFound = error;
      }
    }
    if (notFound) throw notFound;
    throw usageError(
      `无法解析 ReleaseRun ${runId} 所属环境；请显式添加 --environment preproduction|production`
    );
  }

  return { run };
}

function isRunNotFoundError(error) {
  return (
    Number(error?.status || error?.statusCode) === 404 ||
    /DELIVERY_RUN_NOT_FOUND|HTTP 404/i.test(String(error?.message || ''))
  );
}

function output(flags, value, message) {
  if (flags.json) return writeJson(value);
  print(message);
  if (value?.run?.failure?.code) {
    warn(
      `${value.run.failure.code}: ${value.run.failure.message || '发布失败'}`
    );
  }
  return value;
}

function buildOutput(flags) {
  if (flags.json || flags.quiet) return undefined;
  return (stream, text) => {
    if (stream === 'stderr') warn(text.trimEnd());
    else print(text.trimEnd());
  };
}

function stringFlag(flags, name) {
  const value = flags?.[name];
  if (value === undefined || value === null || value === false) return '';
  return String(value).trim();
}

function createClientSessionId() {
  return `delivery-v2-${process.pid}-${crypto
    .randomBytes(10)
    .toString('hex')}`;
}

function deliveryV2SourceRevision(target, packageDigest) {
  const packageRepositoryId = `sha256:${packageDigest}`;
  const logicalRepositoryId = String(
    target?.logicalApp?.sourceRepositoryId ||
      target?.state?.logicalApp?.sourceRepositoryId ||
      ''
  )
    .trim()
    .toLowerCase();
  const repoAliases = Array.from(
    new Set(
      [packageRepositoryId, logicalRepositoryId].filter(value =>
        /^sha256:[a-f0-9]{64}$/.test(value)
      )
    )
  ).sort();
  return {
    repo: packageRepositoryId,
    repositoryId: packageRepositoryId,
    repoAliases,
    baseCommit: packageDigest,
    treeHash: packageDigest,
    branch: 'delivery-v2',
    mainBranch: null,
    remoteName: null,
    remoteUrlHash: null,
  };
}

function usageError(message) {
  const error = new Error(message);
  error.code = 'DELIVERY_USAGE_ERROR';
  error.retryable = false;
  return error;
}

function printHelp(command) {
  const lines = {
    check: [
      '用法: openxiangda check [--environment <name>] [--build] [--json]',
      '编译并校验密封 App Package，输出精确资源差异和执行计划；默认复用现有 dist。',
      '删除或未进入密封工具链的第三方构建依赖会在远程写入前失败。',
    ],
    deploy: [
      '用法: openxiangda deploy <environment> [--package <sha256>] [--json]',
      '不带 --package 时从当前工作区构建；带 --package 时直接部署已封存制品。',
    ],
    status: [
      '用法: openxiangda status <runId> [--environment <name>] [--json]',
      '未指定环境时自动在预发和生产定位 ReleaseRun。',
    ],
    retry: [
      '用法: openxiangda retry <runId> [--environment <name>] [--json]',
      '从服务端检查点继续；隔离旧 attempt，并在跨机器场景重建本地 Form 绑定。',
    ],
    rollback: [
      '用法: openxiangda rollback <environment> --to <appReleaseId> [--json]',
    ],
  };
  print((lines[command] || ['Delivery V2']).join('\n'));
}

function assertDependencies(value) {
  const required = [
    'clearDeliveryContext',
    'downloadWithAuth',
    'getWorkspaceTarget',
    'installDeliveryContext',
    'loadConfig',
    'requestFormWithAuth',
    'requestWithAuth',
    'runOpenXiangdaInProcess',
  ];
  for (const key of required) {
    if (typeof value?.[key] !== 'function') {
      throw new Error(`Delivery V2 CLI dependency 缺失: ${key}`);
    }
  }
  return value;
}

module.exports = {
  createDeliveryV2Cli,
  deliveryV2SourceRevision,
};
