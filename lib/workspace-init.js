const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { getProfile, loadConfig, saveProjectState } = require('./config');
const { initSddWorkspace } = require('./sdd');

const ROOT_DIR = path.join(__dirname, '..');
const LEGACY_TEMPLATE_DIR = path.join(ROOT_DIR, 'templates', 'sy-lowcode-app-workspace');
const REACT_SPA_TEMPLATE_DIR = path.join(ROOT_DIR, 'templates', 'openxiangda-react-spa');
const TEMPLATE_IGNORE_NAMES = new Set([
  'node_modules',
  '.pnpm',
  'dist',
  '.vite',
  '.vite-temp',
  '.cache',
  'coverage',
]);
const TEMPLATE_IGNORE_PATHS = new Set([
  '.openxiangda/build-cache.json',
  '.openxiangda/build-cache.json.lock',
  '.openxiangda/build-cache.cli-v4.json',
  '.openxiangda/build-cache.cli-v4.json.lock',
  '.openxiangda/worktree-owner.json',
  '.openxiangda/worktree-owner.json.lock',
]);

function initWorkspace(options = {}) {
  const targetDir = path.resolve(options.dir || process.cwd());
  const packageName =
    options.name || path.basename(targetDir) || 'sy-lowcode-app-workspace';
  const force = Boolean(options.force);
  const install = Boolean(options.install);
  const profileName = options.profile || null;
  const appType = options.appType || null;
  const runtime = normalizeRuntime(options.runtime || options.template);
  const templateDir =
    runtime === 'react-spa' ? REACT_SPA_TEMPLATE_DIR : LEGACY_TEMPLATE_DIR;

  if ((profileName && !appType) || (!profileName && appType)) {
    throw new Error('workspace init 绑定应用时必须同时提供 --profile 和 --app-type');
  }

  ensureCanInitialize(targetDir, force, templateDir);
  copyTemplate(templateDir, targetDir, {
    __WORKSPACE_PACKAGE_NAME__: packageName,
  });
  const sdd = initSddWorkspace({ cwd: targetDir });

  let bound = null;
  if (profileName && appType) {
    const config = loadConfig();
    const resolved = getProfile(config, profileName);
    const state = {
      version: 1,
      profiles: {
        [resolved.profileName]: {
          baseUrl: resolved.profile.baseUrl,
          appType,
          resources: {
            forms: {},
            pages: {},
            workflows: {},
            automations: {},
            menus: {},
            roles: {},
            connectors: {},
            dataViews: {},
            storageConfigs: {},
            notifications: {
              templates: {},
              typeConfigs: {},
            },
            pagePermissionGroups: {},
            formPermissionGroups: {},
            formSettings: {},
          },
          updatedAt: new Date().toISOString(),
        },
      },
    };
    saveProjectState(state, targetDir);
    bound = {
      profile: resolved.profileName,
      appType,
    };
  }

  if (install) {
    runInstall(targetDir);
  }

  return {
    targetDir,
    packageName,
    runtime,
    templateDir,
    installedDependencies: install,
    bound,
    sdd,
    nextSteps: buildNextSteps(targetDir, install, bound, runtime),
  };
}

function assertCanInitializeWorkspace(options = {}) {
  const targetDir = path.resolve(options.dir || process.cwd());
  const runtime = normalizeRuntime(options.runtime || options.template);
  const templateDir =
    runtime === 'react-spa' ? REACT_SPA_TEMPLATE_DIR : LEGACY_TEMPLATE_DIR;
  ensureCanInitialize(targetDir, Boolean(options.force), templateDir);
  return targetDir;
}

function ensureCanInitialize(targetDir, force, templateDir) {
  if (!fs.existsSync(templateDir)) {
    throw new Error(`workspace 模板不存在: ${templateDir}`);
  }
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    return;
  }
  if (!fs.statSync(targetDir).isDirectory()) {
    throw new Error(`目标路径不是目录: ${targetDir}`);
  }
  const entries = fs
    .readdirSync(targetDir)
    .filter(name => !['.DS_Store'].includes(name));
  if (entries.length > 0 && !force) {
    throw new Error(`目标目录非空: ${targetDir}。如需写入请传 --force`);
  }
}

function normalizeRuntime(value) {
  return value === 'react-spa' || value === 'spa' ? 'react-spa' : 'legacy';
}

function copyTemplate(sourceDir, targetDir, replacements, baseDir = sourceDir) {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    if (shouldSkipTemplateEntry(baseDir, sourcePath, entry.name)) continue;
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(targetPath, { recursive: true });
      copyTemplate(sourcePath, targetPath, replacements, baseDir);
      continue;
    }
    if (!entry.isFile()) continue;
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const content = fs.readFileSync(sourcePath, 'utf8');
    fs.writeFileSync(targetPath, applyReplacements(content, replacements));
  }
}

function shouldSkipTemplateEntry(baseDir, sourcePath, entryName) {
  if (TEMPLATE_IGNORE_NAMES.has(entryName)) return true;
  const relativePath = path.relative(baseDir, sourcePath).split(path.sep).join('/');
  return TEMPLATE_IGNORE_PATHS.has(relativePath);
}

function applyReplacements(content, replacements) {
  return Object.entries(replacements).reduce(
    (result, [key, value]) => result.split(key).join(value),
    content
  );
}

function runInstall(targetDir) {
  const result = spawnSync('pnpm', ['install'], {
    cwd: targetDir,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error('pnpm install 执行失败');
  }
}

function buildNextSteps(targetDir, installedDependencies, bound, runtime) {
  const steps = [`cd ${targetDir}`];
  if (!installedDependencies) steps.push('pnpm install');
  if (!bound) {
    steps.push('openxiangda workspace bind --profile <name> --app-type APP_XXXX');
  }
  const profileArg = bound ? bound.profile : '<name>';
  steps.push(`openxiangda env --profile ${profileArg}`);
  steps.push(
    '完成应用开发后运行 openxiangda check --environment preproduction'
  );
  steps.push('openxiangda deploy preproduction --json');
  steps.push(
    '从预发结果复制 packageDigest，然后运行 openxiangda deploy production --package <packageDigest>'
  );
  steps.push(
    '失败时运行 openxiangda status <runId>，修复外部原因后运行 openxiangda retry <runId>'
  );
  return steps;
}

module.exports = {
  assertCanInitializeWorkspace,
  initWorkspace,
};
