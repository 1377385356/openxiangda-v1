const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const JS_CODE_SOURCE_KINDS = new Set(['js-code-nodes', 'automations', 'functions']);
const CANONICAL_BUILD_SCRIPT = path.join(
  __dirname,
  '..',
  'templates',
  'openxiangda-react-spa',
  'scripts',
  'build-js-code.mjs'
);

function normalizeJsCodeBuildTargets(targets = []) {
  const normalized = [];
  const seen = new Set();
  for (const target of targets) {
    const sourceKind = String(target?.sourceKind || target?.kind || '').trim();
    const scriptCode = String(target?.scriptCode || target?.code || '').trim();
    if (!JS_CODE_SOURCE_KINDS.has(sourceKind)) {
      throw new Error(`unsupported JS_CODE source: ${sourceKind || '<empty>'}`);
    }
    if (
      !scriptCode ||
      scriptCode === '.' ||
      scriptCode === '..' ||
      scriptCode.includes('/') ||
      scriptCode.includes('\\')
    ) {
      throw new Error(`invalid JS_CODE script code: ${scriptCode || '<empty>'}`);
    }
    const key = `${sourceKind}:${scriptCode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ sourceKind, scriptCode });
  }
  return normalized;
}

function buildJsCodeBatchArgs(targets, options = {}) {
  const normalized = normalizeJsCodeBuildTargets(targets);
  if (normalized.length === 0) {
    throw new Error('JS_CODE batch build requires at least one target');
  }
  const specs = normalized.map(target => `${target.sourceKind}:${target.scriptCode}`);
  return [
    'build-js-code',
    '--scripts',
    specs.join(','),
    ...(options.force ? ['--force'] : []),
  ];
}

function readWorkspacePackage(workspaceRoot) {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8')
    );
  } catch {
    return null;
  }
}

function isStandardWorkspaceJsCodeBuilder(workspaceRoot) {
  const command = String(
    readWorkspacePackage(workspaceRoot)?.scripts?.['build-js-code'] || ''
  ).trim().replace(/\\/g, '/');
  if (!command) return true;
  // Only bypass the exact template-shaped command. Extra flags, command
  // chaining, or wrappers may be meaningful custom preprocessing and must keep
  // using the workspace builder.
  const matched = command.match(
    /^(?:node\s+)?((?:\.\/)?scripts\/build-js-code\.(?:mjs|cjs|js))$/
  );
  if (!matched) return false;
  try {
    const source = fs.readFileSync(path.resolve(workspaceRoot, matched[1]), 'utf8');
    return [
      'tsconfig.js-code-nodes.json',
      'sourceKinds',
      'buildScript',
    ].every(marker => source.includes(marker)) &&
      (source.includes('resolveBuildTargets') ||
        source.includes('resolveBuildSelection'));
  } catch {
    return false;
  }
}

function findWorkspaceTargetEntry(workspaceRoot, target) {
  const base = path.join(
    workspaceRoot,
    'src',
    target.sourceKind,
    target.scriptCode,
    'index'
  );
  return ['.ts', '.tsx']
    .map(extension => `${base}${extension}`)
    .find(filePath => fs.existsSync(filePath));
}

function canUseCanonicalJsCodeBuilder(workspaceRoot, targets, options = {}) {
  if (
    options.forceCanonical !== true &&
    (options.preferWorkspaceBuilder ||
      process.env.OPENXIANGDA_USE_WORKSPACE_JS_CODE_BUILDER === '1')
  ) {
    return false;
  }
  if (
    !fs.existsSync(CANONICAL_BUILD_SCRIPT) ||
    !fs.existsSync(path.join(workspaceRoot, 'tsconfig.js-code-nodes.json')) ||
    (options.forceCanonical !== true &&
      !isStandardWorkspaceJsCodeBuilder(workspaceRoot))
  ) {
    return false;
  }
  return targets.every(target => findWorkspaceTargetEntry(workspaceRoot, target));
}

function resolveWorkspaceJsCodeBuildCommand(workspaceRoot, targets, options = {}) {
  const normalized = normalizeJsCodeBuildTargets(targets);
  const packageArgs = buildJsCodeBatchArgs(normalized, options);
  if (canUseCanonicalJsCodeBuilder(workspaceRoot, normalized, options)) {
    return {
      mode: 'canonical-scoped',
      command: options.nodeBinary || process.execPath,
      args: [CANONICAL_BUILD_SCRIPT, ...packageArgs.slice(1)],
      env: {
        OPENXIANGDA_WORKSPACE_ROOT: path.resolve(workspaceRoot),
      },
    };
  }
  return {
    mode: 'workspace-script',
    command: options.packageManager || 'pnpm',
    args: packageArgs,
    env: {},
  };
}

function runWorkspaceJsCodeBuildBatch(workspaceRoot, targets, options = {}) {
  const resolved = resolveWorkspaceJsCodeBuildCommand(
    workspaceRoot,
    targets,
    options
  );
  const spawnOptions = {
    cwd: workspaceRoot,
    encoding: 'utf8',
    ...options.spawnOptions,
  };
  if (resolved.mode === 'canonical-scoped') {
    spawnOptions.env = {
      ...process.env,
      ...(options.spawnOptions?.env || {}),
      ...resolved.env,
    };
  }
  const result = spawnSync(resolved.command, resolved.args, spawnOptions);
  Object.defineProperty(result, 'openxiangdaBuildMode', {
    value: resolved.mode,
    enumerable: false,
  });
  return result;
}

module.exports = {
  buildJsCodeBatchArgs,
  normalizeJsCodeBuildTargets,
  resolveWorkspaceJsCodeBuildCommand,
  runWorkspaceJsCodeBuildBatch,
};
