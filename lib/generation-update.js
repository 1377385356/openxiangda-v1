const fs = require('fs');
const path = require('path');

function resolveUpdateTarget(options = {}) {
  let root = path.resolve(options.cwd || process.cwd());
  let workspace = null;
  while (true) {
    const v1 = fs.existsSync(path.join(root, 'app-workspace.config.ts')) || fs.existsSync(path.join(root, '.openxiangda/state.json'));
    const v2 = fs.existsSync(path.join(root, 'openxiangda.config.ts')) || fs.existsSync(path.join(root, 'openxiangda-app.config.ts'));
    if (v1 && v2) throw new Error('WORKSPACE_GENERATION_CONFLICT: 同一目录存在 V1/V2 工作区标记');
    if (v2) throw new Error('WORKSPACE_ENGINE_GENERATION_MISMATCH: V1 CLI 不能升级 V2 项目；请使用统一入口');
    if (v1) { workspace = root; break; }
    const parent = path.dirname(root);
    if (parent === root) break;
    root = parent;
  }
  const target = options.target || (workspace ? 'workspace' : 'launcher');
  if (!['workspace', 'launcher'].includes(target)) throw new Error('DISTRIBUTION_UPDATE_TARGET_INVALID: 使用 workspace 或 launcher');
  if (target === 'workspace' && !workspace) throw new Error('DISTRIBUTION_WORKSPACE_REQUIRED: 未找到 V1 工作区');
  return { target, channel: target === 'workspace' ? 'v1' : 'latest', cwd: workspace || process.cwd() };
}

function buildGenerationUpdateCommand(selection, version) {
  if (!/^[12]\.\d+\.\d+$/.test(version)) throw new Error('DISTRIBUTION_UPDATE_VERSION_INVALID: 升级目标必须是已发布的稳定版本');
  if (selection.target === 'launcher') {
    if (!version.startsWith('2.')) throw new Error('DISTRIBUTION_UPDATE_GENERATION_MISMATCH: 全局入口需要 V2');
    if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('DISTRIBUTION_NODE_VERSION_REQUIRED: 全局统一入口需要 Node.js 24；当前 V1 项目环境不会自动改变');
    return { command: 'npm', args: ['install', '-g', `openxiangda@${version}`] };
  }
  if (!version.startsWith('1.')) throw new Error('DISTRIBUTION_UPDATE_GENERATION_MISMATCH: V1 项目只允许安装 V1');
  const file = path.join(selection.cwd, 'package.json');
  if (!fs.existsSync(file)) throw new Error('DISTRIBUTION_PACKAGE_MANIFEST_REQUIRED: 工作区缺少 package.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const pnpm = fs.existsSync(path.join(selection.cwd, 'pnpm-lock.yaml')) || manifest.packageManager?.startsWith('pnpm@');
  if (pnpm && fs.existsSync(path.join(selection.cwd, 'package-lock.json'))) throw new Error('DISTRIBUTION_PACKAGE_MANAGER_CONFLICT: 多个包管理器锁文件');
  if (fs.existsSync(path.join(selection.cwd, 'yarn.lock'))) throw new Error('DISTRIBUTION_PACKAGE_MANAGER_UNSUPPORTED: 请通过项目 Yarn 命令显式安装 openxiangda@v1');
  return { command: pnpm ? 'pnpm' : 'npm', args: pnpm
    ? ['add', ...(manifest.dependencies?.openxiangda ? [] : ['--save-dev']), '--save-exact', `openxiangda@${version}`, ...(fs.existsSync(path.join(selection.cwd, 'pnpm-workspace.yaml')) ? ['--workspace-root'] : [])]
    : ['install', manifest.dependencies?.openxiangda ? '--save-prod' : '--save-dev', '--save-exact', `openxiangda@${version}`] };
}

module.exports = { resolveUpdateTarget, buildGenerationUpdateCommand };
