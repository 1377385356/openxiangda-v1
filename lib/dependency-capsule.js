const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CAPSULE_SCHEMA = 'openxiangda_dependency_capsule_v1';
const LOCKFILES = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['package-lock.json', 'npm'],
  ['npm-shrinkwrap.json', 'npm'],
  ['yarn.lock', 'yarn'],
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function gitCommonDir(cwd) {
  const result = spawnSync('git', ['rev-parse', '--git-common-dir'], {
    cwd,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `DEPENDENCY_CAPSULE_GIT_REQUIRED: ${String(result.stderr || result.stdout).trim()}`
    );
  }
  const value = String(result.stdout || '').trim();
  return path.resolve(cwd, value);
}

function resolveDependencyContract(cwd) {
  const packageFile = path.join(cwd, 'package.json');
  if (!fs.existsSync(packageFile)) {
    throw new Error('DEPENDENCY_CAPSULE_PACKAGE_REQUIRED: 缺少 package.json');
  }
  const lock = LOCKFILES.find(([name]) => fs.existsSync(path.join(cwd, name)));
  if (!lock) {
    throw new Error(
      'DEPENDENCY_CAPSULE_LOCKFILE_REQUIRED: 缺少 pnpm-lock.yaml/package-lock.json/yarn.lock'
    );
  }
  const [lockfile, packageManager] = lock;
  const packageJson = fs.readFileSync(packageFile);
  const lockContent = fs.readFileSync(path.join(cwd, lockfile));
  const fingerprint = sha256(
    Buffer.concat([
      Buffer.from(`${CAPSULE_SCHEMA}\0${process.platform}\0${process.arch}\0${process.versions.node}\0`),
      packageJson,
      Buffer.from('\0'),
      lockContent,
    ])
  );
  return {
    schemaVersion: CAPSULE_SCHEMA,
    fingerprint,
    packageManager,
    lockfile,
    packageFile,
  };
}

function installCommand(contract) {
  if (contract.packageManager === 'pnpm') {
    return ['pnpm', ['install', '--frozen-lockfile', '--ignore-scripts=false']];
  }
  if (contract.packageManager === 'yarn') {
    return ['yarn', ['install', '--immutable']];
  }
  return ['npm', ['ci', '--no-audit', '--no-fund']];
}

function buildDependencyCapsulePlan(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const contract = resolveDependencyContract(cwd);
  const commonDir = gitCommonDir(cwd);
  const capsuleDir = path.join(
    commonDir,
    'openxiangda',
    'dependencies',
    contract.fingerprint
  );
  const capsuleNodeModules = path.join(capsuleDir, 'node_modules');
  const markerFile = path.join(capsuleDir, 'capsule.json');
  const workspaceNodeModules = path.join(cwd, 'node_modules');
  let marker = null;
  try {
    marker = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
  } catch {
    marker = null;
  }
  const capsuleReady = Boolean(
    marker?.schemaVersion === CAPSULE_SCHEMA &&
      marker?.fingerprint === contract.fingerprint &&
      fs.existsSync(capsuleNodeModules)
  );
  const currentTarget = fs.existsSync(workspaceNodeModules)
    ? fs.realpathSync(workspaceNodeModules)
    : null;
  const linked = Boolean(
    capsuleReady &&
      currentTarget &&
      currentTarget === fs.realpathSync(capsuleNodeModules)
  );
  const [command, args] = installCommand(contract);
  return {
    ...contract,
    cwd,
    commonDir,
    capsuleDir,
    capsuleNodeModules,
    markerFile,
    workspaceNodeModules,
    capsuleReady,
    linked,
    command,
    args,
  };
}

function copyDependencyInputs(plan) {
  fs.mkdirSync(plan.capsuleDir, { recursive: true, mode: 0o700 });
  fs.copyFileSync(plan.packageFile, path.join(plan.capsuleDir, 'package.json'));
  fs.copyFileSync(
    path.join(plan.cwd, plan.lockfile),
    path.join(plan.capsuleDir, plan.lockfile)
  );
}

function acquireInstallLock(plan) {
  const lockDir = `${plan.capsuleDir}.lock`;
  try {
    fs.mkdirSync(lockDir, { recursive: false, mode: 0o700 });
  } catch (error) {
    if (error.code === 'EEXIST') {
      const busy = new Error(
        `DEPENDENCY_CAPSULE_BUSY: 另一个任务正在准备 ${plan.fingerprint.slice(0, 12)}；稍后重试`
      );
      busy.code = 'DEPENDENCY_CAPSULE_BUSY';
      throw busy;
    }
    throw error;
  }
  return () => fs.rmSync(lockDir, { recursive: true, force: true });
}

function writeMarker(plan) {
  const marker = {
    schemaVersion: CAPSULE_SCHEMA,
    fingerprint: plan.fingerprint,
    packageManager: plan.packageManager,
    lockfile: plan.lockfile,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    preparedAt: new Date().toISOString(),
  };
  const temporary = `${plan.markerFile}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(marker, null, 2)}\n`, {
    mode: 0o600,
  });
  fs.renameSync(temporary, plan.markerFile);
}

function linkWorkspaceNodeModules(plan, options = {}) {
  if (plan.linked) return 'already-linked';
  if (fs.existsSync(plan.workspaceNodeModules)) {
    const stats = fs.lstatSync(plan.workspaceNodeModules);
    if (!stats.isSymbolicLink() && !options.force) {
      const error = new Error(
        'DEPENDENCY_CAPSULE_LOCAL_NODE_MODULES: 当前 node_modules 不是 capsule 链接；使用 --force 前请确认没有正在运行的构建'
      );
      error.code = 'DEPENDENCY_CAPSULE_LOCAL_NODE_MODULES';
      throw error;
    }
    fs.rmSync(plan.workspaceNodeModules, { recursive: true, force: true });
  }
  fs.symlinkSync(plan.capsuleNodeModules, plan.workspaceNodeModules, 'junction');
  return 'linked';
}

function prepareDependencyCapsule(options = {}) {
  let plan = buildDependencyCapsulePlan(options);
  if (options.check) {
    return {
      ready: plan.capsuleReady && plan.linked,
      capsuleReady: plan.capsuleReady,
      linked: plan.linked,
      fingerprint: plan.fingerprint,
      packageManager: plan.packageManager,
      lockfile: plan.lockfile,
      recommendedCommand: plan.capsuleReady
        ? 'openxiangda workspace prepare --force'
        : 'openxiangda workspace prepare',
    };
  }
  if (!plan.capsuleReady) {
    fs.mkdirSync(path.dirname(plan.capsuleDir), { recursive: true, mode: 0o700 });
    const releaseLock = acquireInstallLock(plan);
    try {
      copyDependencyInputs(plan);
      const result = spawnSync(plan.command, plan.args, {
        cwd: plan.capsuleDir,
        encoding: 'utf8',
        stdio: options.quiet ? 'pipe' : 'inherit',
        env: {
          ...process.env,
          CI: process.env.CI || 'true',
        },
      });
      if (result.status !== 0) {
        fs.rmSync(plan.capsuleDir, { recursive: true, force: true });
        const error = new Error(
          `DEPENDENCY_CAPSULE_INSTALL_FAILED: ${plan.command} ${plan.args.join(' ')}`
        );
        error.code = 'DEPENDENCY_CAPSULE_INSTALL_FAILED';
        throw error;
      }
      if (!fs.existsSync(plan.capsuleNodeModules)) {
        throw new Error('DEPENDENCY_CAPSULE_INSTALL_EMPTY: 安装完成但 node_modules 不存在');
      }
      writeMarker(plan);
    } finally {
      releaseLock();
    }
    plan = buildDependencyCapsulePlan(options);
  }
  const action = linkWorkspaceNodeModules(plan, options);
  return {
    ready: true,
    capsuleReady: true,
    linked: true,
    action,
    fingerprint: plan.fingerprint,
    packageManager: plan.packageManager,
    lockfile: plan.lockfile,
    capsuleDir: plan.capsuleDir,
  };
}

module.exports = {
  CAPSULE_SCHEMA,
  buildDependencyCapsulePlan,
  prepareDependencyCapsule,
  resolveDependencyContract,
};
