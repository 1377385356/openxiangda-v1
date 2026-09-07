const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const LEGACY_TEMPLATE_DIR = path.join(
  ROOT_DIR,
  'templates',
  'sy-lowcode-app-workspace'
);
const REACT_SPA_TEMPLATE_DIR = path.join(
  ROOT_DIR,
  'templates',
  'openxiangda-react-spa'
);
const TEMPLATE_DIR = LEGACY_TEMPLATE_DIR;

// AI 引导/守卫"四件套 + glob rules"清单。
// 这些路径相对于 workspace 根；源模板必须与现有 workspace runtime 匹配。
const BOOTSTRAP_FILES = [
  'AGENTS.md',
  'DELIVERY.md',
  'scripts/guard-publish.mjs',
  '.qoder/rules/openxiangda.md',
  '.qoder/rules/openxiangda-form.md',
  '.qoder/rules/openxiangda-page.md',
  '.qoder/rules/openxiangda-workflow-automation.md',
  '.qoder/rules/openxiangda-resources.md',
  '.cursor/rules/openxiangda.mdc',
  '.cursor/rules/openxiangda-form.mdc',
  '.cursor/rules/openxiangda-page.mdc',
  '.cursor/rules/openxiangda-workflow-automation.mdc',
  '.cursor/rules/openxiangda-resources.mdc',
];

// package.json 必须存在的守卫脚本与 prefoo hook。
const PACKAGE_JSON_GUARD_SCRIPTS = {
  '_guard:publish': 'node scripts/guard-publish.mjs',
  'prepublish:all': 'pnpm _guard:publish',
  'prepublish:oss': 'pnpm _guard:publish',
  'preregister': 'pnpm _guard:publish',
  'preregister-bundle': 'pnpm _guard:publish',
  'prepublish:changed': 'pnpm _guard:publish',
  'preopenxiangda:publish': 'pnpm _guard:publish',
};

function bootstrapWorkspace(options = {}) {
  const targetDir = path.resolve(options.dir || process.cwd());
  const force = Boolean(options.force);
  const dryRun = Boolean(options.dryRun);
  const templateDir = resolveWorkspaceTemplateDir(targetDir, options.runtime);

  if (!fs.existsSync(templateDir)) {
    throw new Error(`workspace 模板不存在: ${templateDir}`);
  }
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    throw new Error(`目标目录不存在或不是目录: ${targetDir}`);
  }

  const fileOps = BOOTSTRAP_FILES.map(rel =>
    planFileOp(rel, targetDir, force, templateDir)
  );
  const packageJsonOp = planPackageJsonOp(targetDir, force);

  if (!dryRun) {
    for (const op of fileOps) {
      if (op.action === 'install' || op.action === 'overwrite') {
        ensureDir(path.dirname(op.targetPath));
        fs.copyFileSync(op.sourcePath, op.targetPath);
      }
    }
    if (packageJsonOp.action === 'patch' || packageJsonOp.action === 'create-scripts') {
      writePackageJson(packageJsonOp.targetPath, packageJsonOp.nextContent);
    }
  }

  return {
    targetDir,
    runtime: templateDir === REACT_SPA_TEMPLATE_DIR ? 'react-spa' : 'legacy',
    dryRun,
    force,
    files: fileOps.map(op => ({
      path: op.relativePath,
      action: op.action,
      reason: op.reason || null,
    })),
    packageJson: {
      path: packageJsonOp.relativePath,
      action: packageJsonOp.action,
      added: packageJsonOp.added || [],
      changed: packageJsonOp.changed || [],
      reason: packageJsonOp.reason || null,
    },
    summary: buildSummary(fileOps, packageJsonOp),
  };
}

function planFileOp(relativePath, targetDir, force, templateDir = TEMPLATE_DIR) {
  const sourcePath = path.join(templateDir, relativePath);
  const targetPath = path.join(targetDir, relativePath);
  if (!fs.existsSync(sourcePath)) {
    return {
      relativePath,
      sourcePath,
      targetPath,
      action: 'missing-source',
      reason: '模板缺失，请升级 openxiangda',
    };
  }
  const sourceContent = fs.readFileSync(sourcePath);
  if (!fs.existsSync(targetPath)) {
    return {
      relativePath,
      sourcePath,
      targetPath,
      action: 'install',
    };
  }
  const targetContent = fs.readFileSync(targetPath);
  if (sourceContent.equals(targetContent)) {
    return {
      relativePath,
      sourcePath,
      targetPath,
      action: 'unchanged',
    };
  }
  if (force) {
    return {
      relativePath,
      sourcePath,
      targetPath,
      action: 'overwrite',
    };
  }
  return {
    relativePath,
    sourcePath,
    targetPath,
    action: 'skip',
    reason: '本地版本与模板不同；如需覆盖请传 --force',
  };
}

function resolveWorkspaceTemplateDir(targetDir, explicitRuntime) {
  const normalized = String(explicitRuntime || '').trim().toLowerCase();
  if (['react-spa', 'spa'].includes(normalized)) return REACT_SPA_TEMPLATE_DIR;
  if (['legacy', 'classic'].includes(normalized)) return LEGACY_TEMPLATE_DIR;
  const configFile = path.join(targetDir, 'app-workspace.config.ts');
  if (fs.existsSync(configFile)) {
    const configText = fs.readFileSync(configFile, 'utf8');
    if (/runtimeMode\s*:\s*["']react-spa["']/i.test(configText)) {
      return REACT_SPA_TEMPLATE_DIR;
    }
  }
  return LEGACY_TEMPLATE_DIR;
}

function planPackageJsonOp(targetDir, force) {
  const targetPath = path.join(targetDir, 'package.json');
  const relativePath = 'package.json';
  if (!fs.existsSync(targetPath)) {
    return {
      targetPath,
      relativePath,
      action: 'absent',
      reason: 'package.json 不存在；不是 npm 工作区',
    };
  }
  const raw = fs.readFileSync(targetPath, 'utf8');
  let pkg;
  try {
    pkg = JSON.parse(raw);
  } catch (error) {
    return {
      targetPath,
      relativePath,
      action: 'invalid-json',
      reason: `package.json 解析失败: ${error.message}`,
    };
  }
  const scripts = pkg.scripts ? { ...pkg.scripts } : null;
  if (!scripts) {
    const nextPkg = { ...pkg, scripts: { ...PACKAGE_JSON_GUARD_SCRIPTS } };
    return {
      targetPath,
      relativePath,
      action: 'create-scripts',
      added: Object.keys(PACKAGE_JSON_GUARD_SCRIPTS),
      changed: [],
      nextContent: stringifyPackageJson(raw, nextPkg),
    };
  }
  const added = [];
  const changed = [];
  for (const [name, value] of Object.entries(PACKAGE_JSON_GUARD_SCRIPTS)) {
    if (!(name in scripts)) {
      scripts[name] = value;
      added.push(name);
    } else if (scripts[name] !== value) {
      if (force) {
        scripts[name] = value;
        changed.push(name);
      } else {
        changed.push(`${name} (skipped, value differs; pass --force to overwrite)`);
      }
    }
  }
  if (added.length === 0 && changed.length === 0) {
    return {
      targetPath,
      relativePath,
      action: 'unchanged',
      added: [],
      changed: [],
    };
  }
  const nextPkg = { ...pkg, scripts };
  return {
    targetPath,
    relativePath,
    action: 'patch',
    added,
    changed,
    nextContent: stringifyPackageJson(raw, nextPkg),
  };
}

function stringifyPackageJson(originalRaw, nextPkg) {
  const indent = detectIndent(originalRaw);
  const trailingNewline = originalRaw.endsWith('\n') ? '\n' : '';
  return `${JSON.stringify(nextPkg, null, indent)}${trailingNewline}`;
}

function detectIndent(raw) {
  const match = raw.match(/^(\s+)\"/m);
  if (!match) return 2;
  if (match[1].includes('\t')) return '\t';
  return match[1].length;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writePackageJson(targetPath, nextContent) {
  fs.writeFileSync(targetPath, nextContent);
}

function buildSummary(fileOps, packageJsonOp) {
  const counts = { install: 0, overwrite: 0, unchanged: 0, skip: 0 };
  for (const op of fileOps) {
    if (counts[op.action] !== undefined) counts[op.action] += 1;
  }
  const parts = [];
  parts.push(`installed=${counts.install}`);
  parts.push(`overwritten=${counts.overwrite}`);
  parts.push(`unchanged=${counts.unchanged}`);
  parts.push(`skipped=${counts.skip}`);
  parts.push(`package.json=${packageJsonOp.action}`);
  return parts.join(' ');
}

module.exports = {
  BOOTSTRAP_FILES,
  PACKAGE_JSON_GUARD_SCRIPTS,
  bootstrapWorkspace,
  resolveWorkspaceTemplateDir,
};
