const fs = require('fs');
const os = require('os');
const path = require('path');
const { version: packageVersion } = require('../package.json');

const ROOT_DIR = path.join(__dirname, '..');
const SOURCE_SKILLS_DIR = path.join(ROOT_DIR, 'openxiangda-skills');
const SOURCE_REFERENCES_DIR = path.join(SOURCE_SKILLS_DIR, 'references');
const INSTALL_MANIFEST = '.openxiangda-skill-install.json';
const MANAGER = 'openxiangda';

const SKILL_SPECS = [
  {
    name: 'openxiangda-v1',
    displayName: 'OpenXiangda V1',
    shortDescription: 'OpenXiangda V1 维护入口，仅用于 V1 工作区。',
    sourceRelativePath: 'openxiangda-skills',
    type: 'root',
  },
  {
    name: 'openxiangda-core',
    displayName: 'OpenXiangda Core',
    shortDescription: '登录、profile、workspace 绑定与发布上下文。',
    sourceRelativePath: 'openxiangda-skills/skills/openxiangda-core',
    type: 'subskill',
  },
  {
    name: 'openxiangda-app',
    displayName: 'OpenXiangda App',
    shortDescription: '应用、菜单、快照和资源状态管理。',
    sourceRelativePath: 'openxiangda-skills/skills/openxiangda-app',
    type: 'subskill',
  },
  {
    name: 'openxiangda-architecture-design',
    displayName: 'OpenXiangda Architecture Design',
    shortDescription: '新应用和复杂需求的架构设计、详细设计和开发任务门禁。',
    sourceRelativePath: 'openxiangda-skills/skills/openxiangda-architecture-design',
    type: 'subskill',
  },
  {
    name: 'openxiangda-form',
    displayName: 'OpenXiangda Form',
    shortDescription: '表单页和流程表单页开发发布。',
    sourceRelativePath: 'openxiangda-skills/skills/openxiangda-form',
    type: 'subskill',
  },
  {
    name: 'openxiangda-page',
    displayName: 'OpenXiangda Page',
    shortDescription: '自定义代码页开发、绑定和发布。',
    sourceRelativePath: 'openxiangda-skills/skills/openxiangda-page',
    type: 'subskill',
  },
  {
    name: 'openxiangda-workflow-automation',
    displayName: 'OpenXiangda Workflow Automation',
    shortDescription: '流程、自动化、触发器和 JS_CODE 节点。',
    sourceRelativePath: 'openxiangda-skills/skills/openxiangda-workflow-automation',
    type: 'subskill',
  },
  {
    name: 'openxiangda-permission-settings',
    displayName: 'OpenXiangda Permission Settings',
    shortDescription: '角色、权限组、表单设置和公开访问。',
    sourceRelativePath: 'openxiangda-skills/skills/openxiangda-permission-settings',
    type: 'subskill',
  },
  {
    name: 'openxiangda-inspect',
    displayName: 'OpenXiangda Inspect',
    shortDescription: '只读快照、资源诊断和状态核对。',
    sourceRelativePath: 'openxiangda-skills/skills/openxiangda-inspect',
    type: 'subskill',
  },
  {
    name: 'openxiangda-open-api',
    displayName: 'OpenXiangda Open API',
    shortDescription: '外部后端开放接口契约与 AK/SK 管理。',
    defaultPrompt:
      'Use $openxiangda-open-api to implement a secure backend integration with the private low-code platform Open API.',
    sourceRelativePath: 'openxiangda-skills/skills/openxiangda-open-api',
    type: 'subskill',
  },
];

// V1 does not own V2 or the unified routing skill, including historical installs.
const RETIRED_SKILL_SPECS = [];

function getDefaultCodexSkillsDir(env = process.env) {
  const codexHome = env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return path.join(codexHome, 'skills');
}

function getDefaultClaudeSkillsDir(env = process.env) {
  const claudeHome = env.CLAUDE_HOME || path.join(os.homedir(), '.claude');
  return path.join(claudeHome, 'skills');
}

function getDefaultQoderSkillsDir(env = process.env) {
  const qoderHome = env.QODER_HOME || path.join(os.homedir(), '.qoder');
  return path.join(qoderHome, 'skills');
}

function resolveSkillsDir(dest, env = process.env) {
  if (!dest) return getDefaultCodexSkillsDir(env);
  if (typeof dest !== 'string') {
    throw new Error('缺少 --dest 参数值');
  }
  if (dest === '~') return os.homedir();
  if (dest.startsWith('~/')) return path.join(os.homedir(), dest.slice(2));
  return path.resolve(dest);
}

function validateAgent(agent) {
  const normalized = agent || 'dual';
  if (normalized !== 'codex' && normalized !== 'claude' && normalized !== 'qoder' && normalized !== 'dual') {
    throw new Error(`不支持的 skill agent: ${normalized}。支持的选项: codex, claude, qoder, dual`);
  }
  return normalized;
}

function getDualSkillsDirs(agent, env = process.env) {
  if (agent === 'codex') {
    return [getDefaultCodexSkillsDir(env)];
  } else if (agent === 'claude') {
    return [getDefaultClaudeSkillsDir(env)];
  } else if (agent === 'qoder') {
    return [getDefaultQoderSkillsDir(env)];
  } else if (agent === 'dual') {
    return [getDefaultCodexSkillsDir(env), getDefaultClaudeSkillsDir(env), getDefaultQoderSkillsDir(env)];
  }
  throw new Error(`不支持的 agent: ${agent}`);
}

function listLegacySkills(skillsDir) {
  try {
    return fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name.startsWith('ai-lowcode-'))
      .map(entry => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function readManifest(targetDir) {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(targetDir, INSTALL_MANIFEST), 'utf8')
    );
  } catch {
    return null;
  }
}

function getSkillStatus(spec, skillsDir) {
  const targetDir = path.join(skillsDir, spec.name);
  if (!fs.existsSync(targetDir)) {
    return {
      name: spec.name,
      status: 'missing',
      targetDir,
      sourceRelativePath: spec.sourceRelativePath,
    };
  }

  const manifest = readManifest(targetDir);
  if (!manifest || manifest.manager !== MANAGER) {
    return {
      name: spec.name,
      status: 'foreign',
      targetDir,
      sourceRelativePath: spec.sourceRelativePath,
    };
  }

  const isCurrent =
    manifest.packageVersion === packageVersion &&
    manifest.sourceRelativePath === spec.sourceRelativePath;
  return {
    name: spec.name,
    status: isCurrent ? 'installed' : 'outdated',
    targetDir,
    sourceRelativePath: spec.sourceRelativePath,
    installedVersion: manifest.packageVersion || null,
    installedAt: manifest.installedAt || null,
  };
}

function getRetiredSkillStatus(spec, skillsDir) {
  const targetDir = path.join(skillsDir, spec.name);
  if (!fs.existsSync(targetDir)) {
    return {
      name: spec.name,
      status: 'absent',
      targetDir,
      sourceRelativePath: spec.sourceRelativePath,
    };
  }

  const manifest = readManifest(targetDir);
  const isManagedRetiredSkill =
    manifest?.manager === MANAGER &&
    manifest.sourceRelativePath === spec.sourceRelativePath;
  return {
    name: spec.name,
    status: isManagedRetiredSkill ? 'retired-managed' : 'preserved-external',
    targetDir,
    sourceRelativePath: spec.sourceRelativePath,
  };
}

function removeRetiredManagedSkill(spec, skillsDir) {
  const status = getRetiredSkillStatus(spec, skillsDir);
  if (status.status === 'retired-managed') {
    fs.rmSync(status.targetDir, { recursive: true, force: true });
  }
}

function getSkillStatusReport(options = {}) {
  const agent = validateAgent(options.agent);
  const env = options.env || process.env;

  // 获取目标目录列表
  const skillsDirs = options.dest ? [path.resolve(options.dest)] : getDualSkillsDirs(agent, env);

  const results = [];
  for (const skillsDir of skillsDirs) {
    const skills = SKILL_SPECS.map(spec => getSkillStatus(spec, skillsDir));
    const retiredSkills = RETIRED_SKILL_SPECS.map(spec => getRetiredSkillStatus(spec, skillsDir));
    results.push({
      agent,
      skillsDir,
      skills,
      retiredSkills,
    });
  }

  const legacySkills = listLegacySkills(skillsDirs[0]); // 只取第一个目录的遗留技能
  const warnings = buildWarnings(legacySkills);

  return {
    agent,
    skillsDirs,
    packageVersion,
    results,
    legacySkills,
    warnings,
  };
}

function installSkills(options = {}) {
  const agent = validateAgent(options.agent);
  const dryRun = Boolean(options.dryRun);
  const force = Boolean(options.force);

  // 获取目标目录列表
  const skillsDirs = options.dest ? [path.resolve(options.dest)] : getDualSkillsDirs(agent, options.env);

  const results = [];
  for (const skillsDir of skillsDirs) {
    const before = SKILL_SPECS.map(spec => getSkillStatus(spec, skillsDir));
    const retiredBefore = RETIRED_SKILL_SPECS.map(spec => getRetiredSkillStatus(spec, skillsDir));
    const conflicts = before.filter(item => item.status === 'foreign');

    if (conflicts.length > 0 && !force && !dryRun) {
      const names = conflicts.map(item => item.name).join(', ');
      throw new Error(
        `目标目录存在非 OpenXiangda 管理的同名 skill: ${names}。如需覆盖请传 --force`
      );
    }

    const operations = before.map(item => ({
      name: item.name,
      operation: planOperation(item.status, force),
      targetDir: item.targetDir,
      sourceRelativePath: item.sourceRelativePath,
    }));
    const retiredOperations = retiredBefore.map(item => ({
      name: item.name,
      operation: item.status === 'retired-managed' ? 'remove-retired-managed' : 'preserve',
      targetDir: item.targetDir,
      sourceRelativePath: item.sourceRelativePath,
    }));

    if (!dryRun) {
      fs.mkdirSync(skillsDir, { recursive: true });
      for (const spec of SKILL_SPECS) {
        installOneSkill(spec, skillsDir);
      }
      for (const spec of RETIRED_SKILL_SPECS) {
        removeRetiredManagedSkill(spec, skillsDir);
      }
    }

    const after = dryRun
      ? before
      : SKILL_SPECS.map(spec => getSkillStatus(spec, skillsDir));
    const retiredAfter = dryRun
      ? retiredBefore
      : RETIRED_SKILL_SPECS.map(spec => getRetiredSkillStatus(spec, skillsDir));

    results.push({
      agent,
      skillsDir,
      packageVersion,
      dryRun,
      force,
      operations,
      retiredOperations,
      skills: after,
      retiredSkills: retiredAfter,
    });
  }

  const legacySkills = listLegacySkills(skillsDirs[0]); // 只取第一个目录的遗留技能
  const warnings = buildWarnings(legacySkills);

  return {
    agent,
    skillsDirs,
    packageVersion,
    dryRun,
    force,
    results,
    legacySkills,
    warnings,
    message: dryRun
      ? 'dry-run completed; no files were changed'
      : agent === 'dual'
        ? 'OpenXiangda skills installed to Claude, Codex, and Qoder. Restart all to pick up new skills.'
        : `OpenXiangda skills installed to ${agent}. Restart ${agent} to pick up new skills.`,
  };
}

function planOperation(status, force) {
  if (status === 'missing') return 'install';
  if (status === 'foreign') return force ? 'overwrite-foreign' : 'blocked';
  if (status === 'outdated') return 'update';
  return 'refresh';
}

function installOneSkill(spec, skillsDir) {
  const targetDir = path.join(skillsDir, spec.name);
  const stagingDir = path.join(
    skillsDir,
    `.openxiangda-${spec.name}-${process.pid}-${Date.now()}.tmp`
  );

  fs.rmSync(stagingDir, { recursive: true, force: true });
  try {
    if (spec.type === 'root') {
      copyRootSkill(stagingDir);
    } else {
      copySubskill(spec, stagingDir);
    }
    writeAgentMetadata(spec, stagingDir);
    writeInstallManifest(spec, stagingDir);

    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.renameSync(stagingDir, targetDir);
  } catch (error) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

function copyRootSkill(stagingDir) {
  fs.mkdirSync(stagingDir, { recursive: true });
  const skillMarkdown = fs
    .readFileSync(path.join(SOURCE_SKILLS_DIR, 'SKILL.md'), 'utf8')
    .replace(/`skills\/(openxiangda-[^`]+)\/SKILL\.md`/g, '`../$1/SKILL.md`');
  fs.writeFileSync(path.join(stagingDir, 'SKILL.md'), skillMarkdown);
  fs.cpSync(SOURCE_REFERENCES_DIR, path.join(stagingDir, 'references'), {
    recursive: true,
    dereference: false,
  });
}

function copySubskill(spec, stagingDir) {
  const sourceDir = path.join(ROOT_DIR, spec.sourceRelativePath);
  fs.mkdirSync(stagingDir, { recursive: true });
  fs.cpSync(sourceDir, stagingDir, {
    recursive: true,
    dereference: false,
  });
  const skillMarkdown = fs
    .readFileSync(path.join(sourceDir, 'SKILL.md'), 'utf8')
    .replace(/\.\.\/\.\.\/references\//g, 'references/');
  fs.writeFileSync(path.join(stagingDir, 'SKILL.md'), skillMarkdown);
  fs.cpSync(SOURCE_REFERENCES_DIR, path.join(stagingDir, 'references'), {
    recursive: true,
    dereference: false,
  });
}

function writeAgentMetadata(spec, skillDir) {
  const agentsDir = path.join(skillDir, 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });
  const defaultPrompt =
    spec.defaultPrompt ||
    (spec.name === 'openxiangda'
      ? '使用 $openxiangda-v1 处理 V1 工作区的登录、发布和诊断任务。'
      : `使用 $${spec.name} 处理对应的 OpenXiangda 低代码平台任务。`);
  const content = [
    'interface:',
    `  display_name: ${yamlQuote(spec.displayName)}`,
    `  short_description: ${yamlQuote(spec.shortDescription)}`,
    `  default_prompt: ${yamlQuote(defaultPrompt)}`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(agentsDir, 'openai.yaml'), content);
}

function writeInstallManifest(spec, skillDir) {
  const manifest = {
    manager: MANAGER,
    packageVersion,
    sourceRelativePath: spec.sourceRelativePath,
    installedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(skillDir, INSTALL_MANIFEST),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
}

function yamlQuote(value) {
  return JSON.stringify(String(value));
}

function buildWarnings(legacySkills) {
  if (legacySkills.length === 0) return [];
  return [
    `检测到旧 ai-lowcode skills: ${legacySkills.join(', ')}。OpenXiangda 不会自动删除它们，请按需手动清理以避免混用。`,
  ];
}

module.exports = {
  INSTALL_MANIFEST,
  RETIRED_SKILL_SPECS,
  SKILL_SPECS,
  getSkillStatusReport,
  installSkills,
  resolveSkillsDir,
};
