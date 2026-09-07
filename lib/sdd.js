const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { readGitSourceBase } = require('./change-baseline');
const { assertReleaseSourceIntegrated } = require('./release-mainline');
const {
  buildWorkspaceReleaseCommands,
  normalizeReleaseTargets,
  releasePlanHash,
} = require('./release-plan');

const DEFAULT_SDD_DIR = 'openspec';
const SDD_CONFIG_FILE = 'config.yaml';
const CHANGE_META_FILE = 'change.json';
const COVERAGE_FILE = 'coverage.json';
const RELEASE_FILE = 'release.json';
const BYPASS_LOG_FILE = path.join('changes', 'bypass-log.md');
const SDD_SCHEMA_VERSION = 'openxiangda-sdd-v2';
const LEGACY_SDD_SCHEMA_VERSION = 'openxiangda-sdd-v1';
const SDD_SCOPE_MODEL_VERSION = 'openxiangda-sdd-scopes-v1';
const CODE_RESOURCE_TARGETS = ['functions', 'automations', 'workflows', 'jsCodeNodes'];
const SDD_VERIFY_STAGES = ['implementation', 'prepublish', 'postpublish', 'archive'];
const QUICK_SDD_RISK_TIER = 'L1';
const QUICK_SDD_ALLOWED_KINDS = ['copy', 'style', 'binding', 'metadata', 'narrow-fix'];
const QUICK_FUNCTION_SAFETY_FIELDS = [
  'schema',
  'permission',
  'auth',
  'publicAccess',
  'dataMigration',
  'destructive',
  'crossResource',
];
const QUICK_SDD_MAX_TARGETS = 3;
const QUICK_SDD_MAX_FILES = 12;

const DEFAULT_SPEC_CONTENT = `# Application Specification

This directory is the source of truth for this application's agreed behavior.

## Purpose

Record user-facing behavior, data rules, permissions, workflows, automations, and runtime contracts for this OpenXiangda application. Platform governance rules live in OpenXiangda skills and references, not in this application spec.

## Requirements

`;

const PLACEHOLDER_PATTERNS = [
  /\bTODO\b/i,
  /\bTBD\b/i,
  /Describe the behavior/i,
  /填写|补充|待确认/,
  /-\s*\*\*(Given|When|Then)\*\*\s*$/im,
];

function nowIso() {
  return new Date().toISOString();
}

function normalizeRelPath(value) {
  const input = String(value || '').trim();
  if (!input) return DEFAULT_SDD_DIR;
  const normalized = input.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!normalized || normalized.includes('..') || path.isAbsolute(normalized)) {
    throw new Error(`非法 SDD 目录: ${value}`);
  }
  return normalized;
}

function normalizeChangeId(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('缺少 change id');
  const id = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!id) throw new Error(`非法 change id: ${value}`);
  return id;
}

function slug(value, fallback = 'item') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFileIfMissing(file, content, operations, force = false) {
  const existed = fs.existsSync(file);
  if (existed && !force) {
    operations.push({ path: file, action: 'unchanged' });
    return;
  }
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content);
  operations.push({ path: file, action: existed && force ? 'overwrite' : 'create' });
}

function readJsonFile(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return {
      __invalid: true,
      error: error.message,
      file,
    };
  }
}

function writeJsonFile(file, value, options = {}) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(
    file,
    `${JSON.stringify(value, null, options.compact ? 0 : 2)}\n`
  );
}

function extractSddBlock(configText) {
  const governanceIndex = String(configText || '').indexOf('governance');
  const sddIndex = String(configText || '').indexOf('sdd', governanceIndex >= 0 ? governanceIndex : 0);
  if (sddIndex < 0) return '';
  const start = String(configText).indexOf('{', sddIndex);
  if (start < 0) return '';
  let depth = 0;
  for (let index = start; index < configText.length; index += 1) {
    const char = configText[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return configText.slice(start, index + 1);
    }
  }
  return '';
}

function readConfigYamlSchema(rootDir) {
  const file = path.join(rootDir, SDD_CONFIG_FILE);
  if (!fs.existsSync(file)) return null;
  const content = fs.readFileSync(file, 'utf8');
  return content.match(/^\s*schema\s*:\s*([^\s#]+)/m)?.[1] || null;
}

function getSddGovernanceConfig(options = {}) {
  const cwd = options.cwd || process.cwd();
  const configText = options.configText || '';
  const block = extractSddBlock(configText);
  const configured = Boolean(block);
  const enabled =
    configured && /enabled\s*:\s*false/.test(block)
      ? false
      : configured
        ? true
        : fs.existsSync(path.join(cwd, DEFAULT_SDD_DIR));
  const strictHighRisk =
    configured && /strictHighRisk\s*:\s*false/.test(block)
      ? false
      : enabled;
  const strictDocumentation = Boolean(
    configured && /strictDocumentation\s*:\s*true/.test(block)
  );
  const documentationModeMatch = block.match(
    /documentationMode\s*:\s*['"]?(structured|full)['"]?/
  );
  const documentationMode = strictDocumentation
    ? 'full'
    : documentationModeMatch?.[1] || 'structured';
  const pathMatch = block.match(/path\s*:\s*['"]([^'"]+)['"]/);
  const schemaMatch = block.match(/schemaVersion\s*:\s*['"]([^'"]+)['"]/);
  const sddPath = normalizeRelPath(pathMatch?.[1] || DEFAULT_SDD_DIR);
  const rootDir = path.join(cwd, sddPath);
  const initialized =
    fs.existsSync(path.join(rootDir, SDD_CONFIG_FILE)) ||
    fs.existsSync(path.join(rootDir, 'specs')) ||
    fs.existsSync(path.join(rootDir, 'changes'));
  const schemaVersion =
    schemaMatch?.[1] ||
    readConfigYamlSchema(rootDir) ||
    (initialized ? LEGACY_SDD_SCHEMA_VERSION : SDD_SCHEMA_VERSION);
  return {
    enabled,
    strictHighRisk,
    strictDocumentation,
    documentationMode,
    path: sddPath,
    rootDir,
    initialized,
    configured,
    schemaVersion,
    source: configured ? 'app-workspace.config.ts' : initialized ? 'openspec' : 'none',
  };
}

function buildDefaultConfigYaml() {
  return [
    `schema: ${SDD_SCHEMA_VERSION}`,
    'description: OpenXiangda native SDD workspace records inspired by OpenSpec.',
    'artifacts:',
    '  proposal: proposal.md',
    '  specs: specs/**/*.md',
    '  design: design.md',
    '  tasks: tasks.md',
    '  evidence: evidence.md',
    '  coverage: coverage.json',
    '  release: release.json',
    '  metadata: change.json',
    '  documentationMode: structured',
    'rules:',
    '  requireApprovalForHighRisk: true',
    '  requireAffectedCoverage: true',
    '  requireCoverageManifest: true',
    '  requireScenarioEvidence: false',
    '  requireChecklistCompletion: false',
    '  releaseModel: publish-from-main-v1',
    '  archiveMergesDeltaSpecs: true',
    '',
  ].join('\n');
}

function initSddWorkspace(options = {}) {
  const cwd = options.cwd || process.cwd();
  const sddPath = normalizeRelPath(options.path || DEFAULT_SDD_DIR);
  const rootDir = path.join(cwd, sddPath);
  const operations = [];
  const force = Boolean(options.force || options.upgrade);

  ensureDir(rootDir);
  ensureDir(path.join(rootDir, 'changes'));
  ensureDir(path.join(rootDir, 'changes', 'archive'));
  ensureDir(path.join(rootDir, 'specs', 'app'));
  ensureDir(path.join(rootDir, 'templates', 'change'));

  writeFileIfMissing(path.join(rootDir, SDD_CONFIG_FILE), buildDefaultConfigYaml(), operations, force);
  writeFileIfMissing(path.join(rootDir, 'specs', 'app', 'spec.md'), DEFAULT_SPEC_CONTENT, operations, false);
  writeFileIfMissing(path.join(rootDir, 'changes', '.gitkeep'), '', operations, false);
  writeFileIfMissing(path.join(rootDir, 'changes', 'archive', '.gitkeep'), '', operations, false);
  writeFileIfMissing(
    path.join(rootDir, 'templates', 'change', 'README.md'),
    [
      '# Change Artifact Template',
      '',
      'Create changes with `openxiangda sdd propose <change-id>`.',
      'High-risk implementation starts only after `openxiangda sdd approve <change-id>`.',
      'Before release, `coverage.json`, `release.json`, `tasks.md`, delta specs, and `evidence.md` must pass `openxiangda sdd verify <change> --changed`.',
      '',
    ].join('\n'),
    operations,
    force
  );

  return {
    cwd,
    path: sddPath,
    rootDir,
    initialized: true,
    schemaVersion: SDD_SCHEMA_VERSION,
    operations: operations.map(item => ({
      path: path.relative(cwd, item.path).replace(/\\/g, '/'),
      action: item.action,
    })),
  };
}

function listMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  const visit = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        result.push(entryPath);
      }
    }
  };
  visit(dir);
  return result.sort();
}

function listChangeDirs(rootDir, includeArchive = false) {
  const changesDir = path.join(rootDir, 'changes');
  if (!fs.existsSync(changesDir)) return [];
  const dirs = [];
  for (const entry of fs.readdirSync(changesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'archive') {
      if (!includeArchive) continue;
      const archiveDir = path.join(changesDir, entry.name);
      for (const archived of fs.readdirSync(archiveDir, { withFileTypes: true })) {
        if (archived.isDirectory()) dirs.push(path.join(archiveDir, archived.name));
      }
      continue;
    }
    dirs.push(path.join(changesDir, entry.name));
  }
  return dirs.sort();
}

function readChange(changeDir) {
  const meta = readJsonFile(path.join(changeDir, CHANGE_META_FILE), null);
  const id = meta?.id || path.basename(changeDir);
  const coverage = readJsonFile(path.join(changeDir, COVERAGE_FILE), null);
  return {
    id,
    dir: changeDir,
    relativeDir: changeDir.split(path.sep).slice(-2).join('/'),
    metadata: meta,
    coverage,
    valid: Boolean(meta && !meta.__invalid),
  };
}

function listChanges(rootDir, options = {}) {
  return listChangeDirs(rootDir, Boolean(options.includeArchive)).map(readChange);
}

function splitList(value) {
  if (value === undefined || value === null || value === false) return [];
  if (Array.isArray(value)) return value.flatMap(splitList);
  if (value === true) return ['*'];
  return String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeResourceSelectors(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, selectors]) => [
        String(key || '').trim(),
        Array.from(new Set(splitList(selectors))).sort(),
      ])
      .filter(([key, selectors]) => key && selectors.length > 0)
  );
}

function normalizeAffected(input = {}) {
  const affected = input.affected || input;
  return {
    forms: splitList(affected.forms || affected.form),
    pages: splitList(affected.pages || affected.page),
    functions: splitList(affected.functions || affected.function),
    automations: splitList(affected.automations || affected.automation),
    workflows: splitList(affected.workflows || affected.workflow),
    jsCodeNodes: splitList(affected.jsCodeNodes || affected.jsCode || affected['js-code-nodes']),
    files: splitList(affected.files || affected.file),
    resourceSelectors: normalizeResourceSelectors(
      affected.resourceSelectors || affected.resourceTargets
    ),
    resources: affected.resources === true || affected.resources === 'true' || splitList(affected.resources).includes('*'),
    runtime: affected.runtime === true || affected.runtime === 'true',
    backend: affected.backend === true || affected.backend === 'true',
    contracts: affected.contracts === true || affected.contracts === 'true',
  };
}

function mergeAffectedScopes(...inputs) {
  const scopes = inputs.filter(Boolean).map(input => normalizeAffected(input));
  const mergeList = key =>
    Array.from(new Set(scopes.flatMap(scope => scope[key] || []))).sort();
  const hasFlag = key => scopes.some(scope => Boolean(scope[key]));
  const resourceSelectorKeys = Array.from(
    new Set(scopes.flatMap(scope => Object.keys(scope.resourceSelectors || {})))
  ).sort();
  return {
    forms: mergeList('forms'),
    pages: mergeList('pages'),
    functions: mergeList('functions'),
    automations: mergeList('automations'),
    workflows: mergeList('workflows'),
    jsCodeNodes: mergeList('jsCodeNodes'),
    files: mergeList('files'),
    resourceSelectors: Object.fromEntries(
      resourceSelectorKeys.map(key => [
        key,
        Array.from(
          new Set(
            scopes.flatMap(scope => scope.resourceSelectors?.[key] || [])
          )
        ).sort(),
      ])
    ),
    resources: hasFlag('resources'),
    runtime: hasFlag('runtime'),
    backend: hasFlag('backend'),
    contracts: hasFlag('contracts'),
  };
}

function normalizeSddScopeModel(input = {}, fallbackChangedResources = {}) {
  const source = input.scopeModel || input.scopes || input;
  const changedResources = normalizeAffected(
    source.changedResources ||
      source.changed ||
      fallbackChangedResources
  );
  const deployTargets = normalizeAffected(
    source.deployTargets ||
      source.targets ||
      changedResources
  );
  deployTargets.files = [];
  return {
    schemaVersion: SDD_SCOPE_MODEL_VERSION,
    changedResources,
    runtimeDependencies: normalizeAffected(
      source.runtimeDependencies || source.dependencies || {}
    ),
    deployTargets,
  };
}

function hasExplicitSddScopeModel(value) {
  return Boolean(value?.scopes || value?.scopeModel);
}

function normalizeQuickScopeFile(value) {
  const file = String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (
    !file ||
    path.isAbsolute(file) ||
    file.split('/').includes('..') ||
    file.endsWith('/') ||
    /[*?\[\]{}]/.test(file)
  ) {
    return null;
  }
  return file;
}

function normalizeQuickChangeKind(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
}

function normalizeQuickRiskAssessment(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    confirmed: value.confirmed === true,
    schema: value.schema,
    permission: value.permission ?? value.permissions,
    auth: value.auth ?? value.authentication,
    publicAccess: value.publicAccess ?? value.public,
    dataMigration: value.dataMigration ?? value.migration,
    destructive: value.destructive,
    crossResource: value.crossResource ?? value.crossResources,
  };
}

function validateQuickSddScope(options = {}) {
  const affected = normalizeAffected(options);
  affected.pages = Array.from(new Set(affected.pages));
  affected.functions = Array.from(new Set(affected.functions));
  affected.files = Array.from(new Set(affected.files.map(normalizeQuickScopeFile).filter(Boolean))).sort();
  if (affected.pages.length > 0) affected.runtime = true;
  const errors = [];
  const requestedRisk = String(
    options.riskTier || options.riskLevel || options.risk || QUICK_SDD_RISK_TIER
  ).trim().toUpperCase();
  if (!['L1', 'LOW'].includes(requestedRisk)) {
    errors.push(`quick change 仅允许 ${QUICK_SDD_RISK_TIER}/low，收到 ${requestedRisk || '(empty)'}`);
  }

  const changeKind = normalizeQuickChangeKind(options.changeKind || options.kind);
  if (!QUICK_SDD_ALLOWED_KINDS.includes(changeKind)) {
    errors.push(
      `quick change 必须声明可解释的 L1 changeKind：${QUICK_SDD_ALLOWED_KINDS.join(', ')}；收到 ${changeKind || '(empty)'}`
    );
  }
  if (
    affected.forms.length > 0 ||
    affected.automations.length > 0 ||
    affected.workflows.length > 0 ||
    affected.jsCodeNodes.length > 0 ||
    affected.resources ||
    affected.backend ||
    affected.contracts
  ) {
    errors.push('quick change 不能覆盖表单、Automation、Workflow、JS_CODE、通用资源、后端或契约变更');
  }
  if (affected.runtime && affected.pages.length === 0) {
    errors.push('quick change 仅允许由精确 page target 引起的 Runtime 发布');
  }

  const logicalTargets = [...affected.pages, ...affected.functions];
  if (logicalTargets.length === 0) {
    errors.push('quick change 至少需要一个精确 page 或 function target');
  }
  if (logicalTargets.length > QUICK_SDD_MAX_TARGETS) {
    errors.push(`quick change 最多允许 ${QUICK_SDD_MAX_TARGETS} 个逻辑 target`);
  }
  if (logicalTargets.some(item => !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(item))) {
    errors.push('quick change target 必须是精确安全 code，不能包含路径或通配符');
  }
  if (affected.files.length === 0) {
    errors.push('quick change 必须声明精确 files');
  }
  if (affected.files.length > QUICK_SDD_MAX_FILES) {
    errors.push(`quick change 最多允许 ${QUICK_SDD_MAX_FILES} 个文件`);
  }

  const selectedPages = new Set(affected.pages);
  const selectedFunctions = new Set(affected.functions);
  const riskAssessment = normalizeQuickRiskAssessment(options.riskAssessment);
  if (selectedFunctions.size > 0) {
    if (!riskAssessment?.confirmed) {
      errors.push('Function quick change 必须提供 riskAssessment.confirmed=true 并逐项排除高风险行为');
    }
    for (const field of QUICK_FUNCTION_SAFETY_FIELDS) {
      if (riskAssessment?.[field] !== false) {
        errors.push(`Function quick change 必须明确确认 riskAssessment.${field}=false`);
      }
    }
    if (!['metadata', 'narrow-fix'].includes(changeKind)) {
      errors.push('Function quick change 仅允许 changeKind=metadata 或 narrow-fix');
    }
  } else if (changeKind === 'binding' && riskAssessment?.crossResource !== false) {
    errors.push('binding quick change 必须明确确认 riskAssessment.crossResource=false');
  }
  for (const rawFile of normalizeAffected(options).files) {
    if (!normalizeQuickScopeFile(rawFile)) {
      errors.push(`quick change file 不是精确安全路径: ${rawFile}`);
    }
  }
  for (const file of affected.files) {
    const pageCode = file.match(/^src\/pages\/([^/]+)\//)?.[1];
    const functionCode = file.match(/^src\/functions\/([^/]+)\//)?.[1];
    const functionManifestCode = file.match(/^src\/resources\/functions\/([^/]+)\.json$/)?.[1];
    if (pageCode && selectedPages.has(pageCode)) continue;
    if (functionCode && selectedFunctions.has(functionCode)) continue;
    if (functionManifestCode && selectedFunctions.has(functionManifestCode)) continue;
    errors.push(`quick change file 超出精确 page/function scope: ${file}`);
  }
  for (const pageCode of selectedPages) {
    if (!affected.files.some(file => file.startsWith(`src/pages/${pageCode}/`))) {
      errors.push(`page ${pageCode} 缺少对应精确 file`);
    }
  }
  for (const functionCode of selectedFunctions) {
    const hasSource = affected.files.some(file => file.startsWith(`src/functions/${functionCode}/`));
    const hasManifest = affected.files.includes(`src/resources/functions/${functionCode}.json`);
    if (!hasSource && !hasManifest) {
      errors.push(`function ${functionCode} 缺少对应源码或 function manifest file`);
    }
  }

  return {
    valid: errors.length === 0,
    errors: Array.from(new Set(errors)),
    affected,
    risk: {
      tier: QUICK_SDD_RISK_TIER,
      level: 'low',
      mode: 'quick',
      changeKind,
      assessment: riskAssessment,
      prohibitedFunctionImpacts: QUICK_FUNCTION_SAFETY_FIELDS,
      exactScope: true,
      maxTargets: QUICK_SDD_MAX_TARGETS,
      maxFiles: QUICK_SDD_MAX_FILES,
    },
  };
}

function assertQuickSddScope(options = {}) {
  const validation = validateQuickSddScope(options);
  if (validation.valid) return validation;
  const error = new Error(`不能创建 quick SDD change: ${validation.errors[0]}`);
  error.code = 'SDD_QUICK_SCOPE_REJECTED';
  error.details = validation.errors;
  throw error;
}

function extractCodeFromPath(file, prefix) {
  if (!file.startsWith(prefix)) return null;
  const rest = file.slice(prefix.length);
  const first = rest.split('/').filter(Boolean)[0] || '';
  return first.replace(/\.json$/i, '') || null;
}

function coversCodeTarget(normalized, key, code) {
  return Boolean(normalized.resources || normalized.backend || includesAll(normalized[key], [code]));
}

function createChangeMetadata(changeId, options = {}) {
  const affected = normalizeAffected(options);
  const scopes = normalizeSddScopeModel(
    options.scopes || options.scopeModel || {},
    affected
  );
  const metadata = {
    schemaVersion: SDD_SCHEMA_VERSION,
    id: changeId,
    title: options.title || changeId,
    status: 'proposed',
    riskLevel: options.riskLevel || options.risk || 'medium',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    approvedAt: null,
    approvedBy: null,
    approvalSummary: null,
    // affected remains as a backwards-compatible alias for the authored
    // change facts. It must never be used to infer deployment closure.
    affected: scopes.changedResources,
    scopes,
    release: {
      plannedCommands: [],
      lastVerifiedAt: null,
    },
    evidence: {
      files: ['evidence.md'],
      bypasses: [],
    },
  };
  if (options.changeMode) metadata.changeMode = options.changeMode;
  if (options.riskTier) metadata.riskTier = options.riskTier;
  if (options.changeKind) metadata.changeKind = options.changeKind;
  if (options.riskMetadata) metadata.riskMetadata = options.riskMetadata;
  if (options.scopePolicy) metadata.scopePolicy = options.scopePolicy;
  try {
    const sourceBase =
      options.sourceBase ||
      readGitSourceBase(options.cwd || process.cwd(), options.sourceBaseRef || 'HEAD');
    if (sourceBase?.baseCommit && sourceBase?.treeHash) {
      metadata.sourceBase = {
        repo: sourceBase.repo,
        baseCommit: sourceBase.baseCommit,
        treeHash: sourceBase.treeHash,
      };
      metadata.baseRevision = sourceBase.baseCommit;
    }
  } catch {
    // SDD can still be used before a workspace is initialized as a Git repo.
    // Release begin will require a reproducible source base for stale-worktree protection.
  }
  return metadata;
}

function formatAffectedList(items) {
  return items.length ? items.join(', ') : '(none)';
}

function createProposalContent(meta) {
  if (meta.changeMode === 'quick') {
    return [
      `# Quick Change: ${meta.title}`,
      '',
      `User intent and approval are recorded in \`${CHANGE_META_FILE}\`.`,
      `Exact resource/file scope is recorded in \`${COVERAGE_FILE}\`; no additional proposal prose is required.`,
      '',
    ].join('\n');
  }
  return `# Proposal: ${meta.title}

## Intent

Deliver "${meta.title}" as one focused OpenXiangda application change.

## Scope

- Forms: ${formatAffectedList(meta.affected.forms)}
- Pages: ${formatAffectedList(meta.affected.pages)}
- Resources: ${meta.affected.resources ? 'yes' : 'no'}
- Runtime: ${meta.affected.runtime ? 'yes' : 'no'}
- Backend logic: ${meta.affected.backend ? 'yes' : 'no'}

## Out Of Scope

- Platform-level governance changes.
- Unrelated application behavior outside the affected resources above.

## Acceptance

- Requirements in \`specs/**/spec.md\` describe the user-visible behavior.
- \`coverage.json\` maps requirements and scenarios to affected resources.
- \`evidence.md\` records verification commands before release.
`;
}

function createDesignContent(meta) {
  if (meta.changeMode === 'quick') {
    return [
      '# Design',
      '',
      'L1 exact-scope change; implementation stays inside coverage.json and uses the generated atomic release plan.',
      '',
    ].join('\n');
  }
  return `# Design: ${meta.title}

## OpenXiangda Resource Impact

- Forms: ${formatAffectedList(meta.affected.forms)}
- Pages: ${formatAffectedList(meta.affected.pages)}
- Functions: ${formatAffectedList(meta.affected.functions)}
- Automations: ${formatAffectedList(meta.affected.automations)}
- Workflows: ${formatAffectedList(meta.affected.workflows)}
- JS_CODE nodes: ${formatAffectedList(meta.affected.jsCodeNodes)}
- Resources: ${meta.affected.resources ? 'yes' : 'no'}
- Runtime: ${meta.affected.runtime ? 'yes' : 'no'}
- Contracts/config: ${meta.affected.contracts ? 'yes' : 'no'}

## Data And Contract Notes

- Keep application specs focused on observable behavior; implementation details stay here or in source code.
- Resource IDs remain profile-local under \`.openxiangda/state.json\`.

## Publish Plan

- Run \`openxiangda sdd verify ${meta.id} --changed\`.
- Run \`openxiangda workspace check --changed\`.
- Publish with the commands recorded in \`release.json\`.
`;
}

function createTasksContent(meta = {}) {
  if (meta.changeMode === 'quick') {
    return [
      '# Tasks',
      '',
      '## Implementation',
      '',
      '- [ ] Implement the exact covered change',
      '',
      '## Prepublish',
      '',
      '- [ ] Run the focused check and confirm the generated release plan',
      '',
      '## Postpublish',
      '',
      '- [ ] Record atomic publish and mainline integration status',
      '',
      '## Archive',
      '',
      '- [ ] Archive the released change',
      '',
    ].join('\n');
  }
  return [
    '# Tasks',
    '',
    '## Implementation',
    '',
    '- [ ] Confirm proposal and affected scope',
    '- [ ] Sharpen delta specs into behavior-first requirements and scenarios',
    '- [ ] Implement changes',
    '- [ ] Update coverage.json if affected resources change',
    '',
    '## Prepublish',
    '',
    '- [ ] Record verification evidence',
    '- [ ] Run release plan/check commands',
    '',
    '## Postpublish',
    '',
    '- [ ] Record publish/deploy result',
    '- [ ] Merge/fast-forward the frozen release SHA and push the authoritative default branch',
    '',
    '## Archive',
    '',
    '- [ ] Confirm the released change is ready to archive',
    '',
  ].join('\n');
}

function createEvidenceContent(meta = {}) {
  if (meta.changeMode === 'quick') {
    return [
      '# Evidence',
      '',
      '## Verification',
      '',
      '- [ ] Record the focused check result',
      '',
      '## Release',
      '',
      '- [ ] Record the atomic publish result',
      '',
    ].join('\n');
  }
  return [
    '# Evidence',
    '',
    '## Verification',
    '',
    '- [ ] Record implementation test/check output',
    '- [ ] Record workspace/resource/runtime check or dry-run output',
    '',
    '## Release',
    '',
    '- [ ] Record publish/deploy command output or explain why this change was not released',
    '- [ ] Record `openxiangda release integration-status` proving the frozen SHA is on the authoritative default branch',
    '',
    '## Bypass Log',
    '',
    '- None',
    '',
  ].join('\n');
}

function createDeltaSpecContent(meta, domain) {
  if (meta.changeMode === 'quick') {
    return [
      `# ${domain} Delta Spec`,
      '',
      '## ADDED Requirements',
      '',
      `### Requirement: ${meta.title}`,
      'The application SHALL preserve existing behavior except for the exact approved L1 scope.',
      '',
      '#### Scenario: Focused change',
      '- **Given** the existing application behavior',
      `- **When** ${meta.title} is applied`,
      '- **Then** only the covered target changes and unrelated behavior remains unchanged',
      '',
    ].join('\n');
  }
  return `# ${domain} Delta Spec

## ADDED Requirements

### Requirement: ${meta.title}
The application SHALL provide the approved "${meta.title}" behavior for the affected OpenXiangda resources.

#### Scenario: Main path
- **Given** an authorized user is using the affected application area
- **When** the user follows the approved ${meta.title} workflow
- **Then** the application produces the expected business result without relying on mock data or frontend-only authorization
`;
}

function renderSddDocumentation(options = {}) {
  const loaded = options.loaded || loadSddChange(options);
  const meta = loaded.meta;
  const requirementSpec = loaded.coverage?.requirements?.find(
    item => typeof item?.spec === 'string' && item.spec.trim()
  )?.spec;
  const specRelativePath =
    requirementSpec && !requirementSpec.includes('..')
      ? requirementSpec.replace(/\\/g, '/')
      : 'specs/app/spec.md';
  const specMatch = specRelativePath.match(/^specs\/([^/]+)\/spec\.md$/);
  const domain = options.domain || specMatch?.[1] || 'app';
  const files = {
    proposal: path.join(loaded.changeDir, 'proposal.md'),
    design: path.join(loaded.changeDir, 'design.md'),
    tasks: path.join(loaded.changeDir, 'tasks.md'),
    evidence: path.join(loaded.changeDir, 'evidence.md'),
    spec: path.join(loaded.changeDir, 'specs', domain, 'spec.md'),
  };
  const contents = {
    proposal: createProposalContent(meta),
    design: createDesignContent(meta),
    tasks: createTasksContent(meta),
    evidence: createEvidenceContent(meta),
    spec: createDeltaSpecContent(meta, domain),
  };
  const rendered = [];
  const skipped = [];
  for (const [kind, file] of Object.entries(files)) {
    if (fs.existsSync(file) && !options.force) {
      skipped.push(path.relative(options.cwd || process.cwd(), file).replace(/\\/g, '/'));
      continue;
    }
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, contents[kind]);
    rendered.push(path.relative(options.cwd || process.cwd(), file).replace(/\\/g, '/'));
  }
  return {
    schemaVersion: meta.schemaVersion || SDD_SCHEMA_VERSION,
    changeId: loaded.changeId,
    mode: 'full',
    rendered,
    skipped,
  };
}

function createCoverageManifest(meta, domain) {
  const reqId = `req-${slug(meta.title || meta.id, meta.id)}`;
  const scopes = normalizeSddScopeModel(meta, meta.affected);
  const changedResources = scopes.changedResources;
  return {
    schemaVersion: SDD_SCHEMA_VERSION,
    changeId: meta.id,
    generatedAt: nowIso(),
    scopeModel: scopes,
    resources: changedResources,
    requirements: [
      {
        id: reqId,
        title: meta.title,
        spec: `specs/${domain}/spec.md`,
        scenarios: [
          {
            id: 'main-path',
            title: 'Main path',
            evidence: [],
          },
        ],
        covers: changedResources,
      },
    ],
  };
}

function createReleaseManifest(meta) {
  const scopes = normalizeSddScopeModel(meta, meta.affected);
  return {
    schemaVersion: SDD_SCHEMA_VERSION,
    changeId: meta.id,
    scopeModel: scopes,
    targets: {
      ...scopes.deployTargets,
      other: [],
    },
    changedFiles: [],
    commands: [],
    verifiedAt: null,
  };
}

function proposeSddChange(options = {}) {
  const governance = getSddGovernanceConfig(options);
  if (!governance.initialized) initSddWorkspace({ cwd: options.cwd, path: governance.path });
  const changeId = normalizeChangeId(options.changeId);
  const rootDir = governance.rootDir;
  const domain = options.domain || 'app';
  const changeDir = path.join(rootDir, 'changes', changeId);
  if (fs.existsSync(changeDir) && !options.force) {
    throw new Error(`change 已存在: ${changeId}`);
  }
  ensureDir(changeDir);
  ensureDir(path.join(changeDir, 'specs', domain));
  const meta = createChangeMetadata(changeId, options);
  const coverage = createCoverageManifest(meta, domain);
  const release = createReleaseManifest(meta);
  const jsonWriteOptions = {
    compact: meta.changeMode === 'quick',
  };
  writeJsonFile(path.join(changeDir, CHANGE_META_FILE), meta, jsonWriteOptions);
  writeJsonFile(path.join(changeDir, COVERAGE_FILE), coverage, jsonWriteOptions);
  writeJsonFile(path.join(changeDir, RELEASE_FILE), release, jsonWriteOptions);
  const loaded = {
    governance,
    changeId,
    changeDir,
    meta,
    coverage,
  };
  const documentation =
    governance.documentationMode === 'full' || options.renderDocumentation
      ? renderSddDocumentation({
          cwd: options.cwd,
          loaded,
          domain,
          force: true,
        })
      : {
          mode: 'structured',
          rendered: [],
          skipped: [],
        };
  return {
    schemaVersion: SDD_SCHEMA_VERSION,
    change: meta,
    coverage,
    release,
    documentation,
    dir: path.relative(options.cwd || process.cwd(), changeDir).replace(/\\/g, '/'),
    nextActions:
      documentation.mode === 'full'
        ? [
            `Review openspec/changes/${changeId}/proposal.md`,
            `Sharpen openspec/changes/${changeId}/specs/${domain}/spec.md`,
            `Run openxiangda sdd approve ${changeId} after user confirmation`,
          ]
        : [
            `Review openspec/changes/${changeId}/change.json and coverage.json`,
            `Run openxiangda sdd approve ${changeId} after user confirmation`,
            `Optional: openxiangda sdd render ${changeId}`,
          ],
  };
}

function createMainlineSddBundle(options = {}) {
  const governance = getSddGovernanceConfig(options);
  if (!governance.initialized) {
    throw new Error('SDD 尚未初始化，不能创建 mainline bundle');
  }
  const changeId = normalizeChangeId(options.changeId);
  const sourceIds = Array.from(
    new Set(splitList(options.changes || options.changeIds).map(normalizeChangeId))
  ).filter(id => id !== changeId);
  if (sourceIds.length === 0) {
    throw new Error('mainline bundle 至少需要一个 --changes <change-a,change-b>');
  }
  const sourceChanges = sourceIds.map(id =>
    loadSddChange({ cwd: options.cwd, configText: options.configText, changeId: id })
  );
  const invalid = sourceChanges.find(
    item => item.meta.status !== 'approved' || !item.meta.approvedAt
  );
  if (invalid) {
    const error = new Error(
      `SDD_MAINLINE_BUNDLE_CHANGE_NOT_APPROVED: ${invalid.changeId} 尚未 approved`
    );
    error.code = 'SDD_MAINLINE_BUNDLE_CHANGE_NOT_APPROVED';
    throw error;
  }
  const nested = sourceChanges.find(item => item.meta.changeMode === 'mainline-bundle');
  if (nested) {
    throw new Error(`mainline bundle 不允许嵌套: ${nested.changeId}`);
  }
  const bundleSourceBase = resolveMainlineBundleSourceBase(
    sourceChanges,
    options
  );
  const integratedChanges = sourceChanges.map(item => {
    const sourceBase =
      normalizeSddSourceBase(item.meta.sourceBase) || bundleSourceBase;
    const task = options.integration?.requiredCommits?.find(
      candidate => candidate.changeId === item.changeId
    );
    return {
      changeId: item.changeId,
      sourceBase,
      baseRevision:
        item.meta.baseRevision || sourceBase.baseCommit,
      ...(task
        ? {
            commit: task.commit,
            treeHash: task.treeHash,
            sourceBranch: task.sourceBranch,
          }
        : {}),
    };
  });

  const sourceScopeModels = sourceChanges.map(item => {
    const explicit = loadedSddScopeModel(item);
    if (explicit) return explicit;
    const changedResources = mergeAffectedScopes(
      item.meta.affected,
      normalizeCoverageResources(item.coverage, {}),
      { files: item.release?.changedFiles || [] }
    );
    return {
      schemaVersion: SDD_SCOPE_MODEL_VERSION,
      changedResources,
      runtimeDependencies: normalizeAffected({}),
      deployTargets: mergeAffectedScopes(
        item.meta.affected,
        item.release?.targets
      ),
    };
  });
  const scopes = {
    schemaVersion: SDD_SCOPE_MODEL_VERSION,
    changedResources: mergeAffectedScopes(
      ...sourceScopeModels.map(item => item.changedResources)
    ),
    runtimeDependencies: mergeAffectedScopes(
      ...sourceScopeModels.map(item => item.runtimeDependencies)
    ),
    deployTargets: mergeAffectedScopes(
      ...sourceScopeModels.map(item => item.deployTargets)
    ),
  };
  if (
    scopes.changedResources.functions.length > 0 ||
    scopes.changedResources.automations.length > 0
  ) {
    scopes.changedResources.backend = true;
  }
  const runtimeMode = /runtimeMode\s*:\s*['"]react-spa['"]/.test(
    options.configText || ''
  )
    ? 'react-spa'
    : 'legacy';
  const normalizedTargets = normalizeReleaseTargets(
    scopes.deployTargets,
    runtimeMode
  );
  const profile = String(options.profile || '<profile>').trim() || '<profile>';
  const commands = buildWorkspaceReleaseCommands(
    normalizedTargets.logicalTargets,
    runtimeMode,
    profile,
    changeId
  );
  const createdAt = nowIso();
  const meta = {
    ...createChangeMetadata(changeId, {
      cwd: options.cwd,
      title: options.title || `Mainline release: ${sourceIds.join(', ')}`,
      affected: scopes.changedResources,
      scopes,
      changeMode: 'mainline-bundle',
      riskLevel: 'medium',
      sourceBase: bundleSourceBase,
    }),
    status: 'approved',
    approvedAt: createdAt,
    approvedBy: 'mainline-release-coordinator',
    approvalSummary: `Aggregate approved changes on authoritative mainline: ${sourceIds.join(', ')}`,
    bundledChanges: sourceIds,
    integratedChanges,
    createdAt,
    updatedAt: createdAt,
  };
  const coverage = {
    schemaVersion: SDD_SCHEMA_VERSION,
    changeId,
    generatedAt: createdAt,
    scopeModel: scopes,
    resources: scopes.changedResources,
    requirements: sourceChanges.map((item, index) => ({
      id: `bundle-${slug(item.changeId, 'change')}`,
      title: item.meta.title || item.changeId,
      spec: 'specs/app/spec.md',
      scenarios: [
        {
          id: `${slug(item.changeId, 'change')}-merged`,
          title: `${item.changeId} is included in the mainline release`,
          evidence: [],
        },
      ],
      covers: sourceScopeModels[index].changedResources,
    })),
  };
  const release = {
    schemaVersion: SDD_SCHEMA_VERSION,
    changeId,
    mainlinePolicy: 'publish-from-main-v1',
    bundledChanges: sourceIds,
    sourceBase: bundleSourceBase,
    baseRevision: bundleSourceBase.baseCommit,
    integratedChanges,
    ...(options.integration ? { integration: options.integration } : {}),
    scopeModel: scopes,
    targets: normalizedTargets.activationTargets,
    logicalTargets: normalizedTargets.logicalTargets,
    changedFiles: scopes.changedResources.files,
    commands,
    entryCommand:
      `openxiangda release publish --change ${changeId} --profile ${profile}`,
    planHash: releasePlanHash({
      changeId,
      baseRevision: bundleSourceBase.baseCommit,
      integratedChanges,
      runtimeMode,
      targets: normalizedTargets.activationTargets,
      commands,
    }),
    verifiedAt: null,
  };
  const changeDir = path.join(governance.rootDir, 'changes', changeId);
  if (fs.existsSync(changeDir) && !options.force) {
    throw new Error(`change 已存在: ${changeId}`);
  }
  if (fs.existsSync(changeDir)) fs.rmSync(changeDir, { recursive: true, force: true });
  ensureDir(path.join(changeDir, 'specs', 'app'));
  writeJsonFile(path.join(changeDir, CHANGE_META_FILE), meta);
  writeJsonFile(path.join(changeDir, COVERAGE_FILE), coverage);
  writeJsonFile(path.join(changeDir, RELEASE_FILE), release);
  fs.writeFileSync(
    path.join(changeDir, 'proposal.md'),
    `# Mainline Release Bundle: ${changeId}\n\nApproved changes: ${sourceIds.join(', ')}.\n\nThe exact structured scope in coverage.json is authoritative.\n`
  );
  fs.writeFileSync(
    path.join(changeDir, 'design.md'),
    '# Design\n\nAll bundled changes are merged and pushed before one staged, atomic application activation.\n'
  );
  fs.writeFileSync(
    path.join(changeDir, 'tasks.md'),
    '# Tasks\n\n## Implementation\n\n- [x] Aggregate approved changes\n\n## Prepublish\n\n- [x] Generate exact structured release scope\n\n## Postpublish\n\n- [ ] Record publish result\n'
  );
  fs.writeFileSync(
    path.join(changeDir, 'evidence.md'),
    '# Evidence\n\n## Verification\n\n- [x] Source changes were approved before bundling\n\n## Release\n\n- [ ] Record atomic activation result\n'
  );
  fs.writeFileSync(
    path.join(changeDir, 'specs', 'app', 'spec.md'),
    `# Mainline Bundle Spec\n\n## ADDED Requirements\n\n### Requirement: Publish ${sourceIds.length} approved changes together\nThe application SHALL activate the exact bundled scope from one authoritative mainline commit.\n\n#### Scenario: Atomic mainline activation\n- **Given** all bundled changes are approved and merged to the remote default branch\n- **When** the release coordinator publishes bundle ${changeId}\n- **Then** changed child releases activate together and unrelated resources remain unchanged\n`
  );
  return {
    schemaVersion: SDD_SCHEMA_VERSION,
    change: meta,
    coverage,
    release,
    bundledChanges: sourceIds,
    dir: path.relative(options.cwd || process.cwd(), changeDir).replace(/\\/g, '/'),
  };
}

function normalizeSddSourceBase(value) {
  if (!value?.baseCommit || !value?.treeHash) return null;
  return {
    repo: value.repo,
    baseCommit: String(value.baseCommit),
    treeHash: String(value.treeHash),
  };
}

function runSddGit(cwd, args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: cwd || process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0 && !options.allowFailure) {
    const error = new Error(
      String(result.stderr || result.stdout || `git ${args.join(' ')} failed`).trim()
    );
    error.code = 'SDD_SOURCE_BASE_GIT_FAILED';
    throw error;
  }
  return {
    ok: result.status === 0,
    stdout: String(result.stdout || '').trim(),
  };
}

function resolveMainlineBundleSourceBase(sourceChanges, options = {}) {
  const cwd = options.cwd || process.cwd();
  if (options.sourceBaseRef) {
    return readGitSourceBase(cwd, options.sourceBaseRef);
  }
  const missing = sourceChanges.filter(
    item => !normalizeSddSourceBase(item.meta.sourceBase)
  );
  if (missing.length > 0) {
    const error = new Error(
      `SDD_SOURCE_BASE_REQUIRED: ${missing
        .map(item => item.changeId)
        .join(', ')} 缺少创建变更时冻结的 sourceBase；请用 --source-base-ref <commit> 明确指定共同基线`
    );
    error.code = 'SDD_SOURCE_BASE_REQUIRED';
    error.changes = missing.map(item => item.changeId);
    throw error;
  }
  const sourceBases = sourceChanges.map(item =>
    normalizeSddSourceBase(item.meta.sourceBase)
  );
  const repos = Array.from(
    new Set(sourceBases.map(item => item.repo).filter(Boolean))
  );
  if (repos.length > 1) {
    const error = new Error(
      'SDD_SOURCE_BASE_REPOSITORY_MISMATCH: mainline bundle 的来源变更不属于同一 Git 仓库'
    );
    error.code = 'SDD_SOURCE_BASE_REPOSITORY_MISMATCH';
    throw error;
  }
  for (const item of sourceChanges) {
    const task = options.integration?.requiredCommits?.find(
      candidate => candidate.changeId === item.changeId
    );
    if (
      task?.commit &&
      !runSddGit(cwd, [
        'merge-base',
        '--is-ancestor',
        item.meta.sourceBase.baseCommit,
        task.commit,
      ], { allowFailure: true }).ok
    ) {
      const error = new Error(
        `SDD_SOURCE_BASE_NOT_ANCESTOR: ${item.changeId} 的 sourceBase 不是任务提交 ${String(task.commit).slice(0, 12)} 的祖先`
      );
      error.code = 'SDD_SOURCE_BASE_NOT_ANCESTOR';
      error.changeId = item.changeId;
      throw error;
    }
  }
  const commits = Array.from(
    new Set(sourceBases.map(item => item.baseCommit))
  );
  const commonCommit =
    commits.length === 1
      ? commits[0]
      : runSddGit(cwd, ['merge-base', '--octopus', ...commits]).stdout;
  if (!commonCommit) {
    const error = new Error(
      'SDD_SOURCE_BASE_COMMON_ANCESTOR_REQUIRED: 来源变更没有可验证的共同 Git 基线'
    );
    error.code = 'SDD_SOURCE_BASE_COMMON_ANCESTOR_REQUIRED';
    throw error;
  }
  return readGitSourceBase(cwd, commonCommit);
}

function loadSddChange(options = {}) {
  const governance = getSddGovernanceConfig(options);
  const changeId = normalizeChangeId(options.changeId);
  const changeDir = path.join(governance.rootDir, 'changes', changeId);
  if (!fs.existsSync(changeDir)) throw new Error(`change 不存在: ${changeId}`);
  const metaFile = path.join(changeDir, CHANGE_META_FILE);
  const meta = readJsonFile(metaFile, null);
  if (!meta || meta.__invalid) {
    throw new Error(`change metadata 无效: ${metaFile}`);
  }
  const coverageFile = path.join(changeDir, COVERAGE_FILE);
  const releaseFile = path.join(changeDir, RELEASE_FILE);
  const coverage = readJsonFile(coverageFile, null);
  const release = readJsonFile(releaseFile, null);
  return {
    governance,
    changeId,
    changeDir,
    meta,
    metaFile,
    coverage,
    coverageFile,
    release,
    releaseFile,
  };
}

function approveSddChange(options = {}) {
  const loaded = loadSddChange(options);
  const meta = {
    ...loaded.meta,
    schemaVersion: loaded.meta.schemaVersion || loaded.governance.schemaVersion || LEGACY_SDD_SCHEMA_VERSION,
    status: 'approved',
    approvedAt: nowIso(),
    approvedBy: options.approvedBy || os.userInfo().username || 'unknown',
    approvalSummary: options.summary || options.note || loaded.meta.approvalSummary || '',
    ...(options.approvalMode ? { approvalMode: options.approvalMode } : {}),
    ...(options.approvalBasis ? { approvalBasis: options.approvalBasis } : {}),
    updatedAt: nowIso(),
  };
  writeJsonFile(loaded.metaFile, meta, {
    compact: meta.changeMode === 'quick',
  });
  return {
    schemaVersion: meta.schemaVersion,
    change: meta,
    coverage: loaded.coverage,
    dir: path.relative(options.cwd || process.cwd(), loaded.changeDir).replace(/\\/g, '/'),
    nextActions: [
      `Implement only the approved scope in openspec/changes/${loaded.changeId}`,
      `Complete tasks.md and evidence.md`,
      `Run openxiangda sdd verify ${loaded.changeId} --changed before release`,
    ],
  };
}

function proposeQuickSddChange(options = {}) {
  const validation = assertQuickSddScope(options);
  return proposeSddChange({
    ...options,
    affected: validation.affected,
    riskLevel: validation.risk.level,
    riskTier: validation.risk.tier,
    changeMode: validation.risk.mode,
    changeKind: validation.risk.changeKind,
    riskMetadata: {
      tier: validation.risk.tier,
      level: validation.risk.level,
      classification: 'explicit-l1-quick',
      changeKind: validation.risk.changeKind,
      exactScope: true,
      assessment: validation.risk.assessment,
      prohibitedFunctionImpacts: validation.risk.prohibitedFunctionImpacts,
    },
    scopePolicy: {
      exact: true,
      allowedTargets: ['pages', 'functions'],
      maxTargets: validation.risk.maxTargets,
      maxFiles: validation.risk.maxFiles,
    },
  });
}

function approveQuickSddChange(options = {}) {
  const loaded = loadSddChange(options);
  if (loaded.meta.changeMode !== 'quick' || loaded.meta.riskTier !== QUICK_SDD_RISK_TIER) {
    throw new Error(`change ${loaded.changeId} 不是可 quick approve 的 L1 change`);
  }
  assertQuickSddScope({
    affected: loaded.meta.affected,
    riskTier: loaded.meta.riskTier,
    changeKind: loaded.meta.changeKind,
    riskAssessment: loaded.meta.riskMetadata?.assessment,
  });
  const summary = String(
    options.summary || options.note || options.userIntent || ''
  ).trim();
  if (!summary) {
    throw new Error('quick approve 需要 summary/userIntent 记录用户的明确变更意图');
  }
  return approveSddChange({
    ...options,
    summary,
    approvalMode: 'quick-explicit-intent',
    approvalBasis: 'explicit-user-request',
  });
}

function createQuickSddChange(options = {}) {
  const summary = String(
    options.approvalSummary || options.summary || options.note || options.userIntent || ''
  ).trim();
  if (!summary) {
    throw new Error('quick change 需要 approvalSummary/summary/userIntent 才能创建并批准');
  }
  assertQuickSddScope(options);
  const proposed = proposeQuickSddChange(options);
  const approved = approveQuickSddChange({
    cwd: options.cwd,
    configText: options.configText,
    changeId: proposed.change.id,
    summary,
    approvedBy: options.approvedBy,
  });
  return {
    ...proposed,
    change: approved.change,
    approved: true,
    nextActions: [
      `Implement only the exact L1 scope in openspec/changes/${proposed.change.id}`,
      `Run staged verification: implementation -> prepublish -> postpublish -> archive`,
    ],
  };
}

function includesAll(list, required) {
  if (!required || required.length === 0) return true;
  if ((list || []).includes('*')) return true;
  return required.every(item => (list || []).includes(item));
}

function hasHighRiskTargets(targets = {}) {
  return (
    (targets.forms || []).length > 0 ||
    (targets.pages || []).length > 0 ||
    CODE_RESOURCE_TARGETS.some(key => (targets[key] || []).length > 0) ||
    Boolean(targets.resources) ||
    Boolean(targets.runtime)
  );
}

function classifyHighRiskFiles(files = []) {
  const highRisk = [];
  for (const file of files || []) {
    if (
      file === 'app-workspace.config.ts' ||
      file.startsWith('src/forms/') ||
      file.startsWith('src/pages/') ||
      file.startsWith('src/resources/') ||
      file.startsWith('src/functions/') ||
      file.startsWith('src/automations/') ||
      file.startsWith('src/workflows/') ||
      file.startsWith('src/js-code-nodes/') ||
      file.startsWith('src/runtime/')
    ) {
      highRisk.push(file);
    }
  }
  return highRisk;
}

function affectedCoversTargets(affected, targets = {}) {
  const normalized = normalizeAffected(affected);
  const missing = [];
  if (!includesAll(normalized.forms, targets.forms || [])) {
    missing.push(`forms:${(targets.forms || []).filter(item => !normalized.forms.includes(item)).join(',')}`);
  }
  if (!includesAll(normalized.pages, targets.pages || [])) {
    missing.push(`pages:${(targets.pages || []).filter(item => !normalized.pages.includes(item)).join(',')}`);
  }
  for (const key of CODE_RESOURCE_TARGETS) {
    const required = targets[key] || [];
    if (required.length === 0) continue;
    if (normalized.resources || normalized.backend || includesAll(normalized[key], required)) continue;
    missing.push(`${key}:${required.filter(item => !normalized[key].includes(item)).join(',')}`);
  }
  if (targets.resources && !normalized.resources && !normalized.backend) missing.push('resources');
  for (const [key, required] of Object.entries(targets.resourceSelectors || {})) {
    if (normalized.resources || includesAll(normalized.resourceSelectors?.[key], required)) {
      continue;
    }
    missing.push(
      `resourceSelectors.${key}:${required
        .filter(item => !(normalized.resourceSelectors?.[key] || []).includes(item))
        .join(',')}`
    );
  }
  if (targets.runtime && !normalized.runtime) missing.push('runtime');
  return {
    covered: missing.length === 0,
    missing,
  };
}

function affectedCoversHighRiskFiles(affected, files = []) {
  const normalized = normalizeAffected(affected);
  const missing = [];
  for (const file of files) {
    if (includesAll(normalized.files, [file])) continue;
    if (file === 'app-workspace.config.ts' && !normalized.contracts && !normalized.runtime) {
      missing.push(file);
    } else if (file.startsWith('src/forms/')) {
      const formCode = file.split('/')[2];
      if (!includesAll(normalized.forms, [formCode])) missing.push(file);
    } else if (file.startsWith('src/pages/')) {
      const pageCode = file.split('/')[2];
      if (!normalized.runtime && !includesAll(normalized.pages, [pageCode])) missing.push(file);
    } else if (file.startsWith('src/resources/functions/')) {
      const code = extractCodeFromPath(file, 'src/resources/functions/');
      const isScopedContainer =
        normalized.resources || normalized.backend || normalized.functions.length > 0;
      if (code && !isScopedContainer && !coversCodeTarget(normalized, 'functions', code)) {
        missing.push(file);
      }
    } else if (file.startsWith('src/resources/automations/')) {
      const code = extractCodeFromPath(file, 'src/resources/automations/');
      const isScopedContainer =
        normalized.resources || normalized.backend || normalized.automations.length > 0;
      if (code && !isScopedContainer && !coversCodeTarget(normalized, 'automations', code)) {
        missing.push(file);
      }
    } else if (file.startsWith('src/resources/workflows/')) {
      const code = extractCodeFromPath(file, 'src/resources/workflows/');
      const isScopedContainer =
        normalized.resources || normalized.backend || normalized.workflows.length > 0;
      if (code && !isScopedContainer && !coversCodeTarget(normalized, 'workflows', code)) {
        missing.push(file);
      }
    } else if (file.startsWith('src/resources/js-code-nodes/')) {
      const code = extractCodeFromPath(file, 'src/resources/js-code-nodes/');
      if (code && !coversCodeTarget(normalized, 'jsCodeNodes', code)) missing.push(file);
    } else if (file.startsWith('src/resources/') && !normalized.resources) {
      missing.push(file);
    } else if (file.startsWith('src/functions/')) {
      const code = file.split('/')[2];
      if (!normalized.backend && !normalized.resources && !includesAll(normalized.functions, [code])) missing.push(file);
    } else if (file.startsWith('src/automations/')) {
      const code = file.split('/')[2];
      if (!normalized.backend && !normalized.resources && !includesAll(normalized.automations, [code])) missing.push(file);
    } else if (file.startsWith('src/workflows/')) {
      const code = file.split('/')[2];
      if (!normalized.backend && !normalized.resources && !includesAll(normalized.workflows, [code])) missing.push(file);
    } else if (file.startsWith('src/js-code-nodes/')) {
      const code = file.split('/')[2];
      if (!normalized.backend && !normalized.resources && !includesAll(normalized.jsCodeNodes, [code])) missing.push(file);
    } else if (file.startsWith('src/runtime/') && !normalized.runtime) {
      missing.push(file);
    }
  }
  return {
    covered: missing.length === 0,
    missing,
  };
}

function normalizeCoverageResources(coverage, fallbackAffected = {}, options = {}) {
  const fallback = options.allowFallback ? normalizeAffected(fallbackAffected) : normalizeAffected({});
  const resources = coverage?.resources || {};
  const requirementCovers = Array.isArray(coverage?.requirements)
    ? coverage.requirements.map(item => item.covers || {})
    : [];
  const mergeList = key => [
    ...splitList(resources[key]),
    ...requirementCovers.flatMap(item => splitList(item[key])),
    ...fallback[key],
  ];
  const hasBool = key =>
    resources[key] === true ||
    resources[key] === 'true' ||
    requirementCovers.some(item => item[key] === true || item[key] === 'true') ||
    Boolean(fallback[key]);
  const selectorSources = [
    resources.resourceSelectors,
    ...requirementCovers.map(item => item.resourceSelectors),
    fallback.resourceSelectors,
  ].map(normalizeResourceSelectors);
  const selectorKeys = Array.from(
    new Set(selectorSources.flatMap(item => Object.keys(item)))
  ).sort();
  return {
    forms: Array.from(new Set(mergeList('forms'))),
    pages: Array.from(new Set(mergeList('pages'))),
    functions: Array.from(new Set(mergeList('functions'))),
    automations: Array.from(new Set(mergeList('automations'))),
    workflows: Array.from(new Set(mergeList('workflows'))),
    jsCodeNodes: Array.from(new Set(mergeList('jsCodeNodes'))),
    files: Array.from(new Set(mergeList('files'))),
    resourceSelectors: Object.fromEntries(
      selectorKeys.map(key => [
        key,
        Array.from(
          new Set(selectorSources.flatMap(item => item[key] || []))
        ).sort(),
      ])
    ),
    resources: hasBool('resources'),
    runtime: hasBool('runtime'),
    backend: hasBool('backend'),
    contracts: hasBool('contracts'),
  };
}

function coverageCoversTargets(coverage, affected, targets = {}, options = {}) {
  return affectedCoversTargets(normalizeCoverageResources(coverage, affected, options), targets);
}

function coverageCoversHighRiskFiles(coverage, affected, files = [], options = {}) {
  return affectedCoversHighRiskFiles(normalizeCoverageResources(coverage, affected, options), files);
}

function getApprovedActiveChanges(rootDir) {
  return listChanges(rootDir)
    .filter(item => item.valid && item.metadata.status === 'approved' && item.metadata.approvedAt)
    .map(item => ({
      ...item.metadata,
      coverage: item.coverage,
    }));
}

function summarizeSpecFile(rootDir, file) {
  const content = fs.readFileSync(file, 'utf8');
  const rel = path.relative(path.join(rootDir, 'specs'), file).replace(/\\/g, '/');
  const title = content.match(/^#\s+(.+)$/m)?.[1] || rel;
  const purposeIndex = content.indexOf('## Purpose');
  let purpose = '';
  if (purposeIndex >= 0) {
    purpose = content
      .slice(purposeIndex)
      .split(/\r?\n/)
      .slice(1)
      .find(line => line.trim() && !line.startsWith('#')) || '';
  }
  return {
    path: `specs/${rel}`,
    title,
    purpose: purpose.trim(),
    requirementCount: (content.match(/^### Requirement:/gm) || []).length,
  };
}

function summarizeChange(cwd, item) {
  return {
    id: item.id,
    status: item.metadata?.status || 'invalid',
    approvedAt: item.metadata?.approvedAt || null,
    schemaVersion: item.metadata?.schemaVersion || LEGACY_SDD_SCHEMA_VERSION,
    affected: item.metadata?.affected || null,
    coverage: summarizeCoverage(item.coverage),
    dir: path.relative(cwd, item.dir).replace(/\\/g, '/'),
  };
}

function summarizeCoverage(coverage) {
  if (!coverage || coverage.__invalid) return null;
  const resources = normalizeCoverageResources(coverage, {});
  return {
    requirements: Array.isArray(coverage.requirements) ? coverage.requirements.length : 0,
    forms: resources.forms,
    pages: resources.pages,
    functions: resources.functions,
    automations: resources.automations,
    workflows: resources.workflows,
    jsCodeNodes: resources.jsCodeNodes,
    resources: resources.resources,
    runtime: resources.runtime,
  };
}

function chooseActiveChange(changes, targets = {}, highRiskFiles = [], options = {}) {
  const requestedChangeId = options.changeId
    ? normalizeChangeId(options.changeId)
    : null;
  const candidates = changes
    .filter(item => item.valid && !['archived', 'rejected'].includes(item.metadata.status))
    .filter(item => item.metadata.status === 'approved' && item.metadata.approvedAt)
    .filter(item => !requestedChangeId || item.id === requestedChangeId);
  return (
    candidates.find(item => {
      const legacyMode = (item.metadata?.schemaVersion || LEGACY_SDD_SCHEMA_VERSION) !== SDD_SCHEMA_VERSION;
      const allowFallback = legacyMode && (!item.coverage || item.coverage.__invalid);
      const explicitScopes =
        hasExplicitSddScopeModel(item.metadata) ||
        hasExplicitSddScopeModel(item.coverage);
      const scopeModel = explicitScopes
        ? normalizeSddScopeModel(
            item.metadata.scopes || item.coverage?.scopeModel,
            item.metadata.affected
          )
        : null;
      return (
        (scopeModel
          ? affectedCoversTargets(scopeModel.deployTargets, targets)
          : coverageCoversTargets(
              item.coverage,
              item.metadata.affected,
              targets,
              { allowFallback }
            )
        ).covered &&
        coverageCoversHighRiskFiles(
          item.coverage,
          scopeModel?.changedResources || item.metadata.affected,
          highRiskFiles,
          { allowFallback }
        ).covered
      );
    }) || null
  );
}

function loadedSddScopeModel(loaded) {
  const explicit =
    hasExplicitSddScopeModel(loaded.meta) ||
    hasExplicitSddScopeModel(loaded.coverage) ||
    hasExplicitSddScopeModel(loaded.release);
  if (!explicit) return null;
  const meta = normalizeSddScopeModel(
    loaded.meta.scopes || {},
    loaded.meta.affected
  );
  const emptyScope = normalizeAffected({});
  const coverage = hasExplicitSddScopeModel(loaded.coverage)
    ? normalizeSddScopeModel(
        loaded.coverage.scopeModel,
        loaded.coverage?.resources
      )
    : {
        changedResources: normalizeAffected(
          loaded.coverage?.resources || {}
        ),
        runtimeDependencies: emptyScope,
        deployTargets: emptyScope,
      };
  const release = hasExplicitSddScopeModel(loaded.release)
    ? normalizeSddScopeModel(
        loaded.release.scopeModel,
        loaded.release?.targets
      )
    : {
        changedResources: emptyScope,
        runtimeDependencies: emptyScope,
        deployTargets: emptyScope,
      };
  return {
    schemaVersion: SDD_SCOPE_MODEL_VERSION,
    changedResources: mergeAffectedScopes(
      meta.changedResources,
      coverage.changedResources,
      loaded.meta.affected,
      loaded.coverage?.resources
    ),
    runtimeDependencies: mergeAffectedScopes(
      meta.runtimeDependencies,
      coverage.runtimeDependencies,
      release.runtimeDependencies
    ),
    deployTargets: mergeAffectedScopes(
      meta.deployTargets,
      coverage.deployTargets,
      release.deployTargets,
      loaded.release?.targets
    ),
  };
}

function getSddChangeScope(options = {}) {
  const loaded = loadSddChange(options);
  const affected = normalizeAffected(loaded.meta.affected || {});
  const coverage = normalizeCoverageResources(loaded.coverage, {});
  const releaseTargets = loaded.release && !loaded.release.__invalid
    ? loaded.release.targets || {}
    : {};
  const scopeModel = loadedSddScopeModel(loaded);
  const targetSources = scopeModel
    ? [scopeModel.deployTargets, releaseTargets]
    : [releaseTargets, coverage, affected];
  const mergeList = key => Array.from(new Set([
    ...targetSources.flatMap(source => splitList(source?.[key])),
  ])).sort();
  const targets = {
    forms: mergeList('forms'),
    pages: mergeList('pages'),
    functions: mergeList('functions'),
    automations: mergeList('automations'),
    workflows: mergeList('workflows'),
    jsCodeNodes: mergeList('jsCodeNodes'),
    resourceSelectors: Object.fromEntries(
      Array.from(
        new Set([
          ...targetSources.flatMap(source =>
            Object.keys(source?.resourceSelectors || {})
          ),
        ])
      )
        .sort()
        .map(key => [
          key,
          Array.from(
            new Set([
              ...targetSources.flatMap(source =>
                splitList(source?.resourceSelectors?.[key])
              ),
            ])
          ).sort(),
        ])
    ),
    resources: targetSources.some(source => Boolean(source?.resources)),
    runtime: targetSources.some(source => Boolean(source?.runtime)),
    other: Array.from(new Set(splitList(releaseTargets.other))).sort(),
  };
  const recordedChangedFiles = splitList(loaded.release?.changedFiles);
  const changedResourceScope =
    scopeModel?.changedResources ||
    mergeAffectedScopes(coverage, affected);
  const ownedFiles = Array.from(new Set([
    ...splitList(changedResourceScope.files),
  ])).sort();
  const changedFiles = Array.from(new Set([
    ...recordedChangedFiles,
    ...ownedFiles,
  ])).sort();
  const releaseCommands = Array.isArray(loaded.release?.commands)
    ? loaded.release.commands.filter(command => String(command || '').trim())
    : [];
  const plannedCommands = Array.isArray(loaded.meta?.release?.plannedCommands)
    ? loaded.meta.release.plannedCommands.filter(command => String(command || '').trim())
    : [];
  return {
    changeId: loaded.changeId,
    change: loaded.meta,
    coverage: loaded.coverage,
    release: loaded.release,
    scopeModel,
    scopeModelExplicit: Boolean(scopeModel),
    targets,
    changedFiles,
    recordedChangedFiles,
    ownedFiles,
    commands: releaseCommands.length > 0 ? releaseCommands : plannedCommands,
    releaseCommands,
    plannedCommands,
  };
}

function buildNextActions(governance, activeChanges, activeChange, targets, highRiskFiles) {
  if (!governance.enabled) return ['Enable SDD governance or run without SDD for low-risk work.'];
  if (!governance.initialized) return ['Run `openxiangda sdd init --upgrade`.'];
  if (hasHighRiskTargets(targets) || highRiskFiles.length > 0) {
    if (!activeChanges.length) return ['Run `openxiangda sdd propose <change>` before editing high-risk files.'];
    if (!activeChange) return ['Approve or create an SDD change whose coverage matches the changed resources.'];
    if (activeChange.metadata?.status !== 'approved') {
      return [`Run \`openxiangda sdd approve ${activeChange.id}\` after user confirmation.`];
    }
    return [
      `Complete openspec/changes/${activeChange.id}/tasks.md and evidence.md`,
      `Run openxiangda sdd verify ${activeChange.id} --changed`,
      `Archive with openxiangda sdd archive ${activeChange.id} after release`,
    ];
  }
  return activeChanges.length
    ? ['Continue or archive active SDD changes when finished.']
    : ['No high-risk SDD action required for the current release target.'];
}

function buildSddGovernanceReport(options = {}) {
  const governance = getSddGovernanceConfig(options);
  const targets = options.targets || {};
  const files = options.files || [];
  const highRiskFiles = classifyHighRiskFiles(files);
  const checks = [];
  const warnings = [];
  const errors = [];
  let activeChanges = [];
  let activeChange = null;
  let coverage = null;

  if (!governance.enabled) {
    warnings.push('未启用 SDD governance；运行 openxiangda sdd init 可开启高风险变更记录。');
    checks.push({ name: 'sdd', status: 'warn', message: warnings[0] });
    return {
      schemaVersion: governance.schemaVersion,
      governance,
      releaseTargets: targets,
      highRiskFiles,
      activeChange,
      coverage,
      activeChanges,
      checks,
      warnings,
      errors,
      blockingErrors: errors,
      nextActions: buildNextActions(governance, activeChanges, activeChange, targets, highRiskFiles),
    };
  }

  if (!governance.initialized) {
    const message = `SDD 已配置但未初始化: ${governance.path}。运行 openxiangda sdd init --upgrade`;
    if (governance.strictHighRisk && (hasHighRiskTargets(targets) || highRiskFiles.length > 0)) {
      errors.push({ name: 'sdd-not-initialized', message });
      checks.push({ name: 'sdd', status: 'error', message });
    } else {
      warnings.push(message);
      checks.push({ name: 'sdd', status: 'warn', message });
    }
    return {
      schemaVersion: governance.schemaVersion,
      governance,
      releaseTargets: targets,
      highRiskFiles,
      activeChange,
      coverage,
      activeChanges,
      checks,
      warnings,
      errors,
      blockingErrors: errors,
      nextActions: buildNextActions(governance, activeChanges, activeChange, targets, highRiskFiles),
    };
  }

  const requestedChangeId = options.changeId
    ? normalizeChangeId(options.changeId)
    : null;
  const changes = listChanges(governance.rootDir);
  activeChanges = changes.filter(
    item => item.valid && !['archived', 'rejected'].includes(item.metadata.status)
  );
  activeChange = chooseActiveChange(activeChanges, targets, highRiskFiles, {
    changeId: requestedChangeId,
  });
  coverage = activeChange?.coverage || null;
  const approvedAll = getApprovedActiveChanges(governance.rootDir);
  const approved = requestedChangeId
    ? approvedAll.filter(item => item.id === requestedChangeId)
    : approvedAll;
  if (!governance.strictHighRisk || (!hasHighRiskTargets(targets) && highRiskFiles.length === 0)) {
    checks.push({ name: 'sdd', status: 'ok', message: `${activeChanges.length} active changes` });
    return {
      schemaVersion: governance.schemaVersion,
      governance,
      releaseTargets: targets,
      highRiskFiles,
      activeChange: activeChange ? summarizeChange(options.cwd || process.cwd(), activeChange) : null,
      coverage: summarizeCoverage(coverage),
      activeChanges: activeChanges.map(item => summarizeChange(options.cwd || process.cwd(), item)),
      checks,
      warnings,
      errors,
      blockingErrors: errors,
      nextActions: buildNextActions(governance, activeChanges, activeChange, targets, highRiskFiles),
    };
  }

  const requestedChange = requestedChangeId
    ? activeChanges.find(item => item.id === requestedChangeId)
    : null;
  if (requestedChangeId && !requestedChange) {
    errors.push({
      name: 'sdd-change-not-found',
      message: `指定的 SDD change 不存在或已归档: ${requestedChangeId}`,
    });
  } else if (requestedChangeId && approved.length === 0) {
    errors.push({
      name: 'sdd-change-not-approved',
      message: `指定的 SDD change 尚未 approve: ${requestedChangeId}`,
    });
  } else if (approved.length === 0) {
    errors.push({
      name: 'sdd-approved-change-required',
      message: '高风险变更发布前必须存在 approved SDD change；先运行 openxiangda sdd propose <change> 并经 openxiangda sdd approve <change> 确认。',
    });
  } else if (!activeChange) {
    errors.push({
      name: 'sdd-coverage-required',
      message: requestedChangeId
        ? `指定 change ${requestedChangeId} 的 coverage.json 未覆盖本次发布目标或高风险文件。`
        : 'approved SDD change 的 coverage.json 未覆盖本次发布目标或高风险文件。',
    });
  } else {
    const verify = verifySddChange({
      cwd: options.cwd,
      configText: options.configText,
      changeId: activeChange.id,
      targets,
      files,
      stage: options.stage || options.verifyStage,
      releasePlan: {
        targets,
        changedFiles: files,
        commands: options.commands || [],
        actualCommands: options.actualCommands === true,
      },
    });
    if (!verify.passed) {
      errors.push(...verify.errors);
      warnings.push(...verify.warnings.map(item => `${item.name}: ${item.message}`));
    }
  }

  checks.push({
    name: 'sdd',
    status: errors.length > 0 ? 'error' : 'ok',
    message: errors.length > 0 ? `${errors.length} 个 SDD gate 错误` : `${approved.length} approved active changes`,
  });
  return {
    schemaVersion: governance.schemaVersion,
    governance,
    releaseTargets: targets,
    highRiskFiles,
    activeChange: activeChange ? summarizeChange(options.cwd || process.cwd(), activeChange) : null,
    coverage: summarizeCoverage(coverage),
    activeChanges: activeChanges.map(item => summarizeChange(options.cwd || process.cwd(), item)),
    checks,
    warnings,
    errors,
    blockingErrors: errors,
    nextActions: buildNextActions(governance, activeChanges, activeChange, targets, highRiskFiles),
  };
}

function readUncheckedChecklist(file, missingMessage) {
  if (!fs.existsSync(file)) return [missingMessage || `${path.basename(file)} 缺失`];
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line, index) => ({ line, index: index + 1 }))
    .filter(item => /^-\s*\[\s\]/.test(item.line))
    .map(item => `${path.basename(file)}:${item.index} ${item.line}`);
}

function normalizeSddVerifyStage(value) {
  const stage = String(value || 'default').trim().toLowerCase();
  if (['default', 'legacy', 'all'].includes(stage)) return 'default';
  if (stage === 'pre-publish') return 'prepublish';
  if (stage === 'post-publish') return 'postpublish';
  if (!SDD_VERIFY_STAGES.includes(stage)) {
    throw new Error(
      `未知 SDD verify stage: ${value}。可选 implementation, prepublish, postpublish, archive`
    );
  }
  return stage;
}

function getSddVerifyStagePolicy(stageValue) {
  const stage = normalizeSddVerifyStage(stageValue);
  if (stage === 'default') {
    return {
      stage,
      // An unspecified verify is a prepublish check. Postpublish/archive
      // evidence cannot exist yet and must never block ordinary development.
      taskStages: new Set(['implementation', 'prepublish']),
      evidenceStages: new Set(['prepublish']),
      requireRelease: true,
    };
  }
  const rank = SDD_VERIFY_STAGES.indexOf(stage);
  return {
    stage,
    taskStages:
      stage === 'implementation'
        ? new Set()
        : new Set(SDD_VERIFY_STAGES.slice(0, rank + 1)),
    evidenceStages:
      stage === 'implementation'
        ? new Set()
        : new Set(SDD_VERIFY_STAGES.slice(1, rank + 1)),
    requireRelease: stage !== 'implementation',
  };
}

function inferChecklistStage(kind, section, line) {
  const explicit = line.match(/sdd-stage\s*:\s*(implementation|prepublish|postpublish|archive)/i)?.[1];
  if (explicit) return explicit.toLowerCase();
  const normalizedSection = String(section || '').toLowerCase().replace(/[^a-z]/g, '');
  if (normalizedSection.includes('implementation')) return 'implementation';
  if (normalizedSection.includes('prepublish') || normalizedSection.includes('verification')) {
    return 'prepublish';
  }
  if (normalizedSection.includes('postpublish') || normalizedSection === 'release') {
    return 'postpublish';
  }
  if (normalizedSection.includes('archive')) return 'archive';
  if (/archive|归档/i.test(line)) return 'archive';
  if (/publish\/deploy result|publish output|release output|发布结果|上线结果/i.test(line)) {
    return 'postpublish';
  }
  if (
    kind === 'evidence' ||
    /verification evidence|release plan|workspace\/resource\/runtime check|dry-run|发布计划|验证证据/i.test(line)
  ) {
    return 'prepublish';
  }
  return 'implementation';
}

function readUncheckedChecklistForStages(file, options = {}) {
  const requiredStages = options.requiredStages || new Set(SDD_VERIFY_STAGES);
  if (requiredStages.size === 0) return [];
  if (!fs.existsSync(file)) {
    return [options.missingMessage || `${path.basename(file)} 缺失`];
  }
  const result = [];
  let section = '';
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      section = heading[1].trim();
      continue;
    }
    if (!/^-\s*\[\s\]/.test(line)) continue;
    const stage = inferChecklistStage(options.kind || 'tasks', section, line);
    if (!requiredStages.has(stage)) continue;
    result.push(`${path.basename(file)}:${index + 1} [${stage}] ${line}`);
  }
  return result;
}

function readUncheckedTasks(changeDir, stagePolicy = getSddVerifyStagePolicy('default')) {
  return readUncheckedChecklistForStages(path.join(changeDir, 'tasks.md'), {
    kind: 'tasks',
    requiredStages: stagePolicy.taskStages,
    missingMessage: 'tasks.md 缺失',
  });
}

function validateCoverageManifest(
  coverage,
  meta,
  targets,
  highRiskFiles,
  legacyMode = false,
  options = {}
) {
  const errors = [];
  const warnings = [];
  const addDocumentationIssue = issue => {
    if (options.strictDocumentation) errors.push(issue);
    else warnings.push(issue);
  };
  if (!coverage || coverage.__invalid) {
    const message = coverage?.__invalid
      ? `coverage.json 无效: ${coverage.error}`
      : 'coverage.json 缺失';
    if (legacyMode) warnings.push({ name: 'sdd-coverage-missing', message });
    else errors.push({ name: 'sdd-coverage-missing', message });
    return { errors, warnings };
  }
  if (coverage.schemaVersion && coverage.schemaVersion !== SDD_SCHEMA_VERSION) {
    warnings.push({
      name: 'sdd-coverage-schema-version',
      message: `coverage schemaVersion=${coverage.schemaVersion}，建议升级为 ${SDD_SCHEMA_VERSION}`,
    });
  }
  if (!Array.isArray(coverage.requirements) || coverage.requirements.length === 0) {
    addDocumentationIssue({
      name: 'sdd-coverage-empty',
      message: 'coverage.json 建议包含 requirements 映射；streamlined 模式仅以精确资源和文件范围作为发布硬门禁',
    });
  } else {
    for (const requirement of coverage.requirements) {
      if (!requirement.id || !requirement.title || !requirement.spec) {
        addDocumentationIssue({
          name: 'sdd-coverage-requirement-invalid',
          message: 'coverage requirement 缺少 id/title/spec',
        });
        break;
      }
      if (!Array.isArray(requirement.scenarios) || requirement.scenarios.length === 0) {
        addDocumentationIssue({
          name: 'sdd-coverage-scenarios-missing',
          message: `coverage requirement ${requirement.id} 缺少 scenarios`,
        });
        break;
      }
    }
  }
  const authoredChangeScope =
    options.scopeModel?.changedResources || meta.affected;
  const coverageTargets = options.scopeModel
    ? authoredChangeScope
    : targets;
  const targetCoverage = coverageCoversTargets(
    coverage,
    authoredChangeScope,
    coverageTargets
  );
  if (!targetCoverage.covered) {
    errors.push({
      name: 'sdd-change-targets-uncovered',
      message: `coverage 未覆盖发布目标: ${targetCoverage.missing.join(', ')}`,
    });
  }
  const fileCoverage = coverageCoversHighRiskFiles(
    coverage,
    authoredChangeScope,
    highRiskFiles
  );
  if (!fileCoverage.covered) {
    errors.push({
      name: 'sdd-change-files-uncovered',
      message: `coverage 未覆盖高风险文件: ${fileCoverage.missing.join(', ')}`,
    });
  }
  return { errors, warnings };
}

function splitDeltaSections(content) {
  const sections = [];
  const regex = /^##\s+(ADDED|MODIFIED|REMOVED)\s+Requirements\b.*$/gim;
  const matches = [...content.matchAll(regex)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? content.length;
    sections.push({
      type: match[1].toUpperCase(),
      body: content.slice(start, end),
    });
  }
  return sections;
}

function parseRequirementBlocks(sectionBody) {
  const regex = /^###\s+Requirement:\s*(.+)$/gim;
  const matches = [...sectionBody.matchAll(regex)];
  const blocks = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = match.index;
    const end = matches[index + 1]?.index ?? sectionBody.length;
    blocks.push({
      title: match[1].trim(),
      content: sectionBody.slice(start, end).trim(),
    });
  }
  return blocks;
}

function parseDeltaSpec(content) {
  const sections = splitDeltaSections(content);
  const result = { added: [], modified: [], removed: [] };
  for (const section of sections) {
    const key = section.type.toLowerCase();
    result[key].push(...parseRequirementBlocks(section.body));
  }
  return result;
}

function validateDeltaSpecFile(file, rootDir) {
  const rel = path.relative(rootDir, file).replace(/\\/g, '/');
  const content = fs.readFileSync(file, 'utf8');
  const errors = [];
  const warnings = [];
  const sections = splitDeltaSections(content);
  if (sections.length === 0) {
    errors.push({ name: 'sdd-delta-section-missing', message: `${rel} 缺少 ADDED/MODIFIED/REMOVED Requirements 段落` });
    return { errors, warnings };
  }
  const delta = parseDeltaSpec(content);
  const all = [...delta.added, ...delta.modified, ...delta.removed];
  if (all.length === 0) {
    errors.push({ name: 'sdd-delta-requirement-missing', message: `${rel} 缺少 Requirement` });
  }
  for (const requirement of [...delta.added, ...delta.modified]) {
    if (!/####\s+Scenario:/i.test(requirement.content)) {
      errors.push({ name: 'sdd-scenario-missing', message: `${rel} requirement "${requirement.title}" 缺少 Scenario` });
      continue;
    }
    if (!/\bGiven\b|\*\*Given\*\*/i.test(requirement.content) || !/\bWhen\b|\*\*When\*\*/i.test(requirement.content) || !/\bThen\b|\*\*Then\*\*/i.test(requirement.content)) {
      errors.push({ name: 'sdd-scenario-unverifiable', message: `${rel} requirement "${requirement.title}" 场景必须包含 Given/When/Then` });
    }
    if (PLACEHOLDER_PATTERNS.some(pattern => pattern.test(requirement.content))) {
      errors.push({ name: 'sdd-spec-placeholder', message: `${rel} requirement "${requirement.title}" 仍包含占位内容` });
    }
  }
  for (const requirement of delta.removed) {
    if (!/because|reason|原因|废弃|移除/i.test(requirement.content)) {
      warnings.push({ name: 'sdd-removed-reason-missing', message: `${rel} removed requirement "${requirement.title}" 建议写明原因` });
    }
  }
  return { errors, warnings };
}

function validateDeltaSpecs(changeDir) {
  const specRoot = path.join(changeDir, 'specs');
  const files = listMarkdownFiles(specRoot);
  const errors = [];
  const warnings = [];
  if (files.length === 0) {
    errors.push({ name: 'sdd-delta-specs-missing', message: 'change 缺少 specs/**/*.md delta spec' });
    return { errors, warnings, files: [] };
  }
  for (const file of files) {
    const validation = validateDeltaSpecFile(file, changeDir);
    errors.push(...validation.errors);
    warnings.push(...validation.warnings);
  }
  return {
    errors,
    warnings,
    files: files.map(file => path.relative(changeDir, file).replace(/\\/g, '/')),
  };
}

function buildUpdatedReleaseManifest(loaded, releasePlan, verificationStage = 'default') {
  const verifiedAt = nowIso();
  const reviewedCommands = Array.isArray(loaded.release?.commands)
    ? loaded.release.commands.filter(command => String(command || '').trim())
    : [];
  const canonicalCommands = Array.isArray(releasePlan?.commands)
    ? releasePlan.commands.filter(command => String(command || '').trim())
    : [];
  const actualExecution = releasePlan?.actualCommands === true;
  return {
    schemaVersion: SDD_SCHEMA_VERSION,
    changeId: loaded.changeId,
    ...(loaded.release && !loaded.release.__invalid ? loaded.release : {}),
    targets:
      actualExecution
        ? loaded.release?.targets || {}
        : releasePlan?.activationTargets ||
          releasePlan?.targets ||
          loaded.release?.targets ||
          {},
    changedFiles:
      actualExecution
        ? loaded.release?.changedFiles || []
        : releasePlan?.changedFiles || loaded.release?.changedFiles || [],
    commands:
      !actualExecution && canonicalCommands.length > 0
        ? canonicalCommands
        : reviewedCommands,
    verifiedAt,
    verificationStage,
    verificationStages: {
      ...(loaded.release?.verificationStages || {}),
      [verificationStage]: { verifiedAt },
    },
  };
}

function updateReleaseManifest(loaded, releasePlan, verificationStage = 'default') {
  const release = buildUpdatedReleaseManifest(loaded, releasePlan, verificationStage);
  writeJsonFile(loaded.releaseFile, release);
  return release;
}

function writeReleaseAttestation(cwd, changeId, name, value) {
  const root = path.resolve(cwd || process.cwd());
  const dir = path.join(
    root,
    '.openxiangda',
    'releases',
    normalizeChangeId(changeId)
  );
  ensureDir(dir);
  const file = path.join(dir, name);
  const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempFile, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  fs.renameSync(tempFile, file);
  return path.relative(root, file).replace(/\\/g, '/');
}

function readReleaseAttestation(cwd, changeId, name) {
  const file = path.join(
    path.resolve(cwd || process.cwd()),
    '.openxiangda',
    'releases',
    normalizeChangeId(changeId),
    name
  );
  if (!fs.existsSync(file)) return null;
  const value = readJsonFile(file, null);
  return value && !value.__invalid ? value : null;
}

function recordSddReleaseSourceRevision(options = {}) {
  const loaded = loadSddChange(options);
  const input = options.releaseSourceRevision;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('releaseSourceRevision 必须是对象');
  }
  const releaseSourceRevision = {
    repo: String(input.repo || input.repositoryId || '').trim(),
    baseCommit: String(input.baseCommit || '').trim().toLowerCase(),
    treeHash: String(input.treeHash || '').trim().toLowerCase(),
    branch: String(input.branch || '').trim() || null,
    remoteName: String(input.remoteName || '').trim() || null,
    remoteUrlHash: String(input.remoteUrlHash || '').trim().toLowerCase() || null,
    remoteUrlHashAliases: Array.isArray(input.remoteUrlHashAliases)
      ? input.remoteUrlHashAliases
          .map(value => String(value || '').trim().toLowerCase())
          .filter(value => /^sha256:[0-9a-f]{64}$/.test(value))
      : [],
    repoAliases: Array.isArray(input.repoAliases)
      ? input.repoAliases
          .map(value => String(value || '').trim().toLowerCase())
          .filter(value => /^sha256:[0-9a-f]{64}$/.test(value))
      : [],
    mainBranch: String(input.mainBranch || '').trim() || null,
    mainTipCommit: String(input.mainTipCommit || '').trim().toLowerCase() || null,
    capturedAt: input.capturedAt || nowIso(),
  };
  if (
    !/^sha256:[0-9a-f]{64}$/i.test(releaseSourceRevision.repo) ||
    !/^[0-9a-f]{40,64}$/.test(releaseSourceRevision.baseCommit) ||
    !/^[0-9a-f]{40,64}$/.test(releaseSourceRevision.treeHash) ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(releaseSourceRevision.remoteName || '') ||
    !/^sha256:[0-9a-f]{64}$/.test(releaseSourceRevision.remoteUrlHash || '') ||
    !['main', 'master'].includes(releaseSourceRevision.mainBranch)
  ) {
    throw new Error(
      'releaseSourceRevision 缺少有效的 repo/baseCommit/treeHash/remoteName/remoteUrlHash/mainBranch'
    );
  }
  const existing =
    readReleaseAttestation(
      options.cwd || process.cwd(),
      loaded.changeId,
      'source-revision.json'
    )?.releaseSourceRevision ||
    loaded.release?.releaseSourceRevision;
  if (
    existing?.baseCommit &&
    (existing.baseCommit !== releaseSourceRevision.baseCommit ||
      existing.treeHash !== releaseSourceRevision.treeHash ||
      existing.repo !== releaseSourceRevision.repo ||
      existing.remoteName !== releaseSourceRevision.remoteName ||
      existing.remoteUrlHash !== releaseSourceRevision.remoteUrlHash ||
      existing.mainBranch !== releaseSourceRevision.mainBranch)
  ) {
    const error = new Error(
      `RELEASE_PUBLISH_REVISION_CHANGED: change ${loaded.changeId} 已冻结 ${existing.baseCommit}，不能改为 ${releaseSourceRevision.baseCommit}`
    );
    error.code = 'RELEASE_PUBLISH_REVISION_CHANGED';
    throw error;
  }
  writeReleaseAttestation(
    options.cwd || process.cwd(),
    loaded.changeId,
    'source-revision.json',
    {
      schemaVersion: SDD_SCHEMA_VERSION,
      changeId: loaded.changeId,
      mainlinePolicy: 'publish-from-main-v1',
      releaseSourceRevision,
    }
  );
  return {
    ...(loaded.release && !loaded.release.__invalid ? loaded.release : {}),
    releaseSourceRevision,
  };
}

function validateReleaseManifest(
  release,
  releasePlan,
  legacyMode = false,
  options = {}
) {
  const errors = [];
  const warnings = [];
  if (!release || release.__invalid) {
    const issue = {
      name: 'sdd-release-invalid',
      message: release?.__invalid ? `release.json 无效: ${release.error}` : 'release.json 缺失',
    };
    if (legacyMode) warnings.push(issue);
    else errors.push(issue);
    return { errors, warnings };
  }
  const plannedTargets =
    releasePlan?.activationTargets || releasePlan?.targets || null;
  const targets = plannedTargets || release.targets || {};
  if (plannedTargets) {
    const releaseTargetCoverage = affectedCoversTargets(
      release.targets || {},
      plannedTargets
    );
    if (!releaseTargetCoverage.covered) {
      errors.push({
        name: 'sdd-release-targets-uncovered',
        message: `release.json targets 未覆盖发布目标: ${releaseTargetCoverage.missing.join(', ')}`,
      });
    }
  }
  if (hasHighRiskTargets(targets) && !Array.isArray(release.commands)) {
    errors.push({ name: 'sdd-release-commands-missing', message: 'release.json commands 必须是数组' });
  }
  if (
    !options.actualExecution &&
    releasePlan?.commands?.length &&
    (!Array.isArray(release.commands) || release.commands.length === 0)
  ) {
    errors.push({ name: 'sdd-release-commands-empty', message: 'release.json 未记录发布命令' });
  }
  if (
    !legacyMode &&
    !options.actualExecution &&
    Array.isArray(release.commands) &&
    release.commands.length > 0
  ) {
    errors.push(
      ...validateAtomicReleaseCommands(
        release.commands,
        targets,
        release.changeId
      )
    );
  }
  return { errors, warnings };
}

function commandFlagValue(command, name) {
  const match = String(command || '').match(
    new RegExp(`(?:^|\\s)--${escapeRegExp(name)}(?:=|\\s+)([^\\s]+)`)
  );
  return match ? match[1] : null;
}

function normalizedCommandSelectors(command) {
  return Array.from(
    new Set(
      String(commandFlagValue(command, 'only') || commandFlagValue(command, 'code') || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
    )
  ).sort();
}

function normalizedResourcePublishTypes(command) {
  const match = String(command || '').match(
    /^openxiangda\s+resource\s+publish(?:\s+([^\s-][^\s]*))?/
  );
  if (!match?.[1]) return [];
  const aliases = {
    functions: 'function',
    automations: 'automation',
    workflows: 'workflow',
    'form-settings': 'form-setting',
  };
  return Array.from(
    new Set(
      match[1]
        .split(',')
        .map(value => value.trim().toLowerCase())
        .filter(Boolean)
        .map(value => aliases[value] || value)
    )
  ).sort();
}

function sameStringSet(left, right) {
  const normalizedLeft = Array.from(new Set(left || [])).sort();
  const normalizedRight = Array.from(new Set(right || [])).sort();
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  );
}

function validateAtomicReleaseCommands(
  commands,
  targets,
  changeId,
  options = {}
) {
  const errors = [];
  const requireCompletePlan = options.requireCompletePlan !== false;
  const normalized = commands.map(command => String(command || '').trim());
  const expectedFormPermissionGroups =
    targets.resourceSelectors?.formPermissionGroups || [];
  const expectedFormTypes = [
    ...((targets.forms || []).length > 0 ? ['form-setting'] : []),
    ...(expectedFormPermissionGroups.length > 0
      ? ['form-permission-group']
      : []),
  ].sort();
  const qualifyFormSelectors = expectedFormTypes.length > 1;
  const expectedFormSelectors = [
    ...(targets.forms || []).map(code =>
      qualifyFormSelectors ? `form-setting:${code}` : String(code)
    ),
    ...expectedFormPermissionGroups.map(code =>
      qualifyFormSelectors ? `form-permission-group:${code}` : String(code)
    ),
  ].sort();
  const publishCommands = normalized.filter(command =>
    /^openxiangda\s+(?:workspace\s+publish|resource\s+publish|runtime\s+deploy|release\s+app-finalize)\b/.test(
      command
    )
  );
  for (const command of publishCommands) {
    const commandTypes = normalizedResourcePublishTypes(command);
    if (!/\s--profile(?:=|\s+)\S+/.test(command) || /<profile>/.test(command)) {
      errors.push({
        name: 'sdd-release-profile-missing',
        message: `发布命令必须显式指定真实 --profile: ${command}`,
      });
    }
    if (
      changeId &&
      !new RegExp(`\\s--change(?:=|\\s+)${escapeRegExp(changeId)}(?:\\s|$)`).test(
        command
      )
    ) {
      errors.push({
        name: 'sdd-release-change-missing',
        message: `发布命令必须绑定 --change ${changeId}: ${command}`,
      });
    }
    if (/^openxiangda\s+workspace\s+publish\b/.test(command) && /\s--form(?:=|\s+)/.test(command)) {
      errors.push({
        name: 'sdd-release-direct-form-schema-forbidden',
        message: `React SPA Form 必须走 staged form-setting bundle，禁止 workspace publish --form: ${command}`,
      });
    }
    if (
      commandTypes.some(type =>
        ['form-setting', 'form-permission-group'].includes(type)
      ) &&
      /\s--activate(?:\s|$)/.test(command)
    ) {
      errors.push({
        name: 'sdd-release-direct-form-activation-forbidden',
        message: `Form bundle 必须保持 staged，禁止在 Root App finalize 前 --activate: ${command}`,
      });
    }
    if (
      /^openxiangda\s+resource\s+publish\b/.test(command) &&
      !/\s--(?:only|code)(?:=|\s+)/.test(command)
    ) {
      errors.push({
        name: 'sdd-release-resource-scope-missing',
        message: `resource publish 必须使用 --only/--code 精确范围: ${command}`,
      });
    }
    if (
      /^openxiangda\s+runtime\s+deploy\b/.test(command) &&
      !/\s--no-activate(?:\s|$)/.test(command)
    ) {
      errors.push({
        name: 'sdd-release-runtime-direct-activation-forbidden',
        message: `Runtime 必须先 --no-activate 暂存，再由 App Release 原子激活: ${command}`,
      });
    }
    const expectedBackendTypes = [
      ...((targets.functions || []).length > 0 ? ['function'] : []),
      ...((targets.automations || []).length > 0 ? ['automation'] : []),
    ].sort();
    if (
      commandTypes.some(type => ['function', 'automation'].includes(type)) &&
      expectedBackendTypes.length > 0
    ) {
      const qualified = expectedBackendTypes.length > 1;
      const expectedSelectors = [
        ...(targets.functions || []).map(code =>
          qualified ? `function:${code}` : String(code)
        ),
        ...(targets.automations || []).map(code =>
          qualified ? `automation:${code}` : String(code)
        ),
      ].sort();
      if (!/\s--stage-only(?:\s|$)/.test(command)) {
        errors.push({
          name: 'sdd-release-backend-direct-activation-forbidden',
          message: `Function/Automation 必须使用 --stage-only: ${command}`,
        });
      }
      if (
        !sameStringSet(commandTypes, expectedBackendTypes) ||
        !sameStringSet(normalizedCommandSelectors(command), expectedSelectors)
      ) {
        errors.push({
          name: 'sdd-release-backend-scope-inexact',
          message: `Function/Automation 命令必须精确覆盖审核 selector，不能缺失或夹带资源: ${command}`,
        });
      }
    }
    if (
      commandTypes.some(type =>
        ['form-setting', 'form-permission-group'].includes(type)
      ) &&
      (!sameStringSet(commandTypes, expectedFormTypes) ||
        !sameStringSet(
          normalizedCommandSelectors(command),
          expectedFormSelectors
        ))
    ) {
      errors.push({
        name: 'sdd-release-form-scope-inexact',
        message: `Form bundle 命令必须以一条命令精确覆盖审核的 Form 与权限组 selector，不能缺失或夹带资源: ${command}`,
      });
    }
  }

  if (!requireCompletePlan) return errors;

  const backendCodes = [
    ...(targets.functions || []),
    ...(targets.automations || []),
  ];
  if (backendCodes.length > 0) {
    const backendStage = normalized.find(
      command =>
        /^openxiangda\s+resource\s+publish\b/.test(command) &&
        /\s--stage-only(?:\s|$)/.test(command) &&
        sameStringSet(normalizedResourcePublishTypes(command), [
          ...((targets.functions || []).length > 0 ? ['function'] : []),
          ...((targets.automations || []).length > 0 ? ['automation'] : []),
        ]) &&
        sameStringSet(normalizedCommandSelectors(command), [
          ...(targets.functions || []).map(code =>
            (targets.automations || []).length > 0
              ? `function:${code}`
              : String(code)
          ),
          ...(targets.automations || []).map(code =>
            (targets.functions || []).length > 0
              ? `automation:${code}`
              : String(code)
          ),
        ])
    );
    if (!backendStage) {
      errors.push({
        name: 'sdd-release-backend-stage-missing',
        message: 'Function/Automation 必须由一条精确 --only 的 --stage-only Backend Release 命令覆盖。',
      });
    }
  }
  if (expectedFormTypes.length > 0) {
    const formStage = normalized.find(
      command =>
        /^openxiangda\s+resource\s+publish\b/.test(command) &&
        !/\s--activate(?:\s|$)/.test(command) &&
        sameStringSet(
          normalizedResourcePublishTypes(command),
          expectedFormTypes
        ) &&
        sameStringSet(normalizedCommandSelectors(command), expectedFormSelectors)
    );
    if (!formStage) {
      errors.push({
        name: 'sdd-release-form-stage-missing',
        message: 'Form 与权限组必须由一条精确 bundle 命令暂存为 FormRelease。',
      });
    }
  }
  if (targets.runtime) {
    const runtimeStage = normalized.find(
      command =>
        /^openxiangda\s+runtime\s+deploy\b/.test(command) &&
        /\s--no-activate(?:\s|$)/.test(command)
    );
    if (!runtimeStage) {
      errors.push({
        name: 'sdd-release-runtime-stage-missing',
        message: 'Runtime 目标缺少 runtime deploy --no-activate 暂存命令。',
      });
    }
  }
  if (
    backendCodes.length > 0 ||
    expectedFormTypes.length > 0 ||
    targets.runtime
  ) {
    const finalize = normalized.find(
      command =>
        /^openxiangda\s+release\s+app-finalize\b/.test(command) &&
        /\s--staged-resources-json(?:=|\s+)\S+/.test(command)
    );
    if (!finalize) {
      errors.push({
        name: 'sdd-release-app-finalize-missing',
        message: '暂存的 Form/Backend/Runtime 必须由 app-finalize 一次原子激活。',
      });
    }
  }
  return errors;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function verifySddChange(options = {}) {
  const loaded = loadSddChange(options);
  const scopeModel = loadedSddScopeModel(loaded);
  const stagePolicy = getSddVerifyStagePolicy(options.stage || options.phase);
  const verificationStage = stagePolicy.stage;
  const targets = options.targets || options.releasePlan?.targets || {};
  const highRiskFiles = classifyHighRiskFiles(options.files || options.releasePlan?.changedFiles || []);
  const legacyMode = (loaded.meta.schemaVersion || LEGACY_SDD_SCHEMA_VERSION) !== SDD_SCHEMA_VERSION;
  const errors = [];
  const warnings = [];
  if (loaded.meta.status !== 'approved' || !loaded.meta.approvedAt) {
    errors.push({ name: 'sdd-change-not-approved', message: `change ${loaded.changeId} 未 approve` });
  }
  const targetCoverage = affectedCoversTargets(
    scopeModel?.deployTargets || loaded.meta.affected,
    targets
  );
  if (!targetCoverage.covered) {
    errors.push({
      name: 'sdd-change-targets-uncovered',
      message: `affected 未覆盖发布目标: ${targetCoverage.missing.join(', ')}`,
    });
  }
  const fileCoverage = affectedCoversHighRiskFiles(
    scopeModel?.changedResources || loaded.meta.affected,
    highRiskFiles
  );
  if (!fileCoverage.covered) {
    errors.push({
      name: 'sdd-change-files-uncovered',
      message: `affected 未覆盖高风险文件: ${fileCoverage.missing.join(', ')}`,
    });
  }
  const strictDocumentation = Boolean(loaded.governance.strictDocumentation);
  const coverageValidation = validateCoverageManifest(
    loaded.coverage,
    loaded.meta,
    targets,
    highRiskFiles,
    legacyMode,
    { strictDocumentation, scopeModel }
  );
  errors.push(...coverageValidation.errors);
  warnings.push(...coverageValidation.warnings);
  const deltaValidation = validateDeltaSpecs(loaded.changeDir);
  if (strictDocumentation) errors.push(...deltaValidation.errors);
  else warnings.push(...deltaValidation.errors);
  warnings.push(...deltaValidation.warnings);
  const uncheckedTasks = readUncheckedTasks(loaded.changeDir, stagePolicy);
  if (uncheckedTasks.length > 0) {
    const issue = {
      name: 'sdd-unfinished-tasks',
      message: `${uncheckedTasks.length} 个 tasks.md 任务未完成；streamlined 模式不阻断主线发布`,
      details: uncheckedTasks,
    };
    if (strictDocumentation) errors.push(issue);
    else warnings.push(issue);
  }
  const evidenceFile = path.join(loaded.changeDir, 'evidence.md');
  const uncheckedEvidence = readUncheckedChecklistForStages(evidenceFile, {
    kind: 'evidence',
    requiredStages: stagePolicy.evidenceStages,
    missingMessage: 'evidence.md 缺失',
  });
  if (uncheckedEvidence.length > 0) {
    const issue = {
      name: 'sdd-evidence-incomplete',
      message: `${uncheckedEvidence.length} 个 evidence.md 证据项未完成；streamlined 模式不阻断主线发布`,
      details: uncheckedEvidence,
    };
    if (strictDocumentation) errors.push(issue);
    else warnings.push(issue);
  }
  const actualExecution = options.releasePlan?.actualCommands === true;
  const release =
    options.releasePlan &&
    loaded.release &&
    !loaded.release.__invalid &&
    !actualExecution
      ? buildUpdatedReleaseManifest(
          loaded,
          options.releasePlan,
          verificationStage
        )
      : loaded.release;
  if (stagePolicy.requireRelease) {
    const releaseValidation = validateReleaseManifest(
      release,
      options.releasePlan,
      legacyMode,
      { actualExecution }
    );
    errors.push(...releaseValidation.errors);
    warnings.push(...releaseValidation.warnings);
    const reviewedPlannedCommands = loaded.meta?.release?.plannedCommands;
    if (
      strictDocumentation &&
      !legacyMode &&
      Array.isArray(reviewedPlannedCommands) &&
      reviewedPlannedCommands.length > 0
    ) {
      errors.push(
        ...validateAtomicReleaseCommands(
          reviewedPlannedCommands,
          targets,
          loaded.changeId
        )
      );
    }
  }
  if (
    !legacyMode &&
    options.releasePlan?.actualCommands === true &&
    Array.isArray(options.releasePlan.commands) &&
    options.releasePlan.commands.length > 0
  ) {
    errors.push(
      ...validateAtomicReleaseCommands(
        options.releasePlan.commands,
        targets,
        loaded.changeId,
        { requireCompletePlan: false }
      )
    );
  }
  const passed = errors.length === 0;
  const verifiedAt = nowIso();
  const verifiedMeta = {
    ...loaded.meta,
    release: {
      ...(loaded.meta.release || {}),
      plannedCommands:
        release?.commands || options.releasePlan?.commands || [],
      lastVerifiedAt: verifiedAt,
    },
    verification: {
      ...(loaded.meta.verification || {}),
      [verificationStage]: {
        passed,
        verifiedAt,
      },
    },
    updatedAt: verifiedAt,
  };
  let metadataWritten = false;
  let attestationFile = null;
  if (options.writeMetadata && passed) {
    attestationFile = writeReleaseAttestation(
      options.cwd || process.cwd(),
      loaded.changeId,
      `verification-${verificationStage}.json`,
      {
        schemaVersion: SDD_SCHEMA_VERSION,
        changeId: loaded.changeId,
        stage: verificationStage,
        passed,
        verifiedAt,
        planHash: releasePlanHash({
          targets,
          commands: release?.commands || [],
          changedFiles:
            options.releasePlan?.changedFiles ||
            loaded.release?.changedFiles ||
            [],
        }),
      }
    );
    metadataWritten = true;
  }
  return {
    schemaVersion: loaded.meta.schemaVersion || loaded.governance.schemaVersion || LEGACY_SDD_SCHEMA_VERSION,
    change: verifiedMeta,
    coverage: loaded.coverage,
    release,
    deltaSpecs: deltaValidation.files,
    errors,
    warnings,
    blockingErrors: errors,
    passed,
    metadataWritten,
    trackedMetadataWritten: false,
    attestationFile,
    targets,
    scopeModel,
    highRiskFiles,
    stage: verificationStage,
    stageRequirements: {
      tasks: Array.from(stagePolicy.taskStages),
      evidence: Array.from(stagePolicy.evidenceStages),
      release: stagePolicy.requireRelease,
    },
  };
}

function appendToEvidence(changeDir, lines) {
  const file = path.join(changeDir, 'evidence.md');
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, `\n${lines.join('\n')}\n`);
}

function appendBypassLog(options = {}) {
  const governance = getSddGovernanceConfig(options);
  if (!governance.initialized) {
    throw new Error('SDD bypass 需要已初始化 openspec；先运行 openxiangda sdd init');
  }
  const reason = String(options.reason || '').trim();
  if (!reason) throw new Error('--sdd-bypass 需要同时提供 --reason "..."');
  const file = path.join(governance.rootDir, BYPASS_LOG_FILE);
  ensureDir(path.dirname(file));
  const entry = [
    `## ${nowIso()}`,
    '',
    `- command: ${options.command || '-'}`,
    `- reason: ${reason}`,
    `- targets: ${JSON.stringify(options.targets || {})}`,
    `- followUp: 补齐对应 change 的 evidence.md，并在发布后 archive`,
    `- user: ${os.userInfo().username || 'unknown'}`,
    '',
  ];
  fs.appendFileSync(file, entry.join('\n'));

  const requestedChangeId = options.changeId ? normalizeChangeId(options.changeId) : null;
  const approved = listChanges(governance.rootDir).find(
    item =>
      item.valid &&
      item.metadata.status === 'approved' &&
      item.metadata.approvedAt &&
      (!requestedChangeId || item.id === requestedChangeId)
  );
  if (approved) {
    appendToEvidence(approved.dir, [
      '## SDD Bypass',
      '',
      `- ${nowIso()} ${options.command || '-'} bypassed SDD gate: ${reason}`,
    ]);
  }

  return {
    file: path.relative(options.cwd || process.cwd(), file).replace(/\\/g, '/'),
    reason,
    evidenceChange: approved?.id || null,
  };
}

function buildSddStatus(options = {}) {
  const governance = getSddGovernanceConfig(options);
  const specsDir = path.join(governance.rootDir, 'specs');
  const changes = governance.initialized ? listChanges(governance.rootDir) : [];
  const archived = governance.initialized ? listChanges(governance.rootDir, { includeArchive: true }).filter(item => item.dir.includes(`${path.sep}archive${path.sep}`)) : [];
  const releasePlan = options.releasePlan || {};
  const highRiskFiles = classifyHighRiskFiles(releasePlan.changedFiles || []);
  const activeChange = chooseActiveChange(changes, releasePlan.targets || {}, highRiskFiles, {
    changeId: options.changeId,
  });
  const report = buildSddGovernanceReport({
    cwd: options.cwd,
    configText: options.configText,
    targets: releasePlan.targets || {},
    files: releasePlan.changedFiles || [],
    commands: releasePlan.commands || [],
    changeId: options.changeId,
    stage: options.stage || options.verifyStage,
  });
  return {
    cwd: options.cwd || process.cwd(),
    schemaVersion: governance.schemaVersion,
    governance,
    specs: listMarkdownFiles(specsDir).map(file => path.relative(governance.rootDir, file).replace(/\\/g, '/')),
    specSummaries: governance.initialized
      ? listMarkdownFiles(specsDir).map(file => summarizeSpecFile(governance.rootDir, file))
      : [],
    activeChange: activeChange ? summarizeChange(options.cwd || process.cwd(), activeChange) : null,
    releaseTargets: releasePlan.targets || {},
    coverage: summarizeCoverage(activeChange?.coverage),
    activeChanges: changes.map(item => summarizeChange(options.cwd || process.cwd(), item)),
    archivedChanges: archived.slice(-10).map(item => ({
      id: item.id,
      dir: path.relative(options.cwd || process.cwd(), item.dir).replace(/\\/g, '/'),
    })),
    bypassLog: governance.initialized && fs.existsSync(path.join(governance.rootDir, BYPASS_LOG_FILE))
      ? path.join(governance.path, BYPASS_LOG_FILE).replace(/\\/g, '/')
      : null,
    nextActions: report.nextActions,
    blockingErrors: report.blockingErrors,
  };
}

function findRequirementBlock(content, title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^###\\s+Requirement:\\s*${escaped}\\s*$`, 'mi');
  const match = content.match(regex);
  if (!match || match.index === undefined) return null;
  const start = match.index;
  const next = content.slice(start + match[0].length).search(/^###\s+Requirement:/mi);
  const end = next >= 0 ? start + match[0].length + next : content.length;
  return { start, end };
}

function mergeDeltaIntoSpec(current, delta, targetRel) {
  let content = current.trimEnd();
  const errors = [];
  const warnings = [];
  if (!content) {
    const domain = targetRel.replace(/\/spec\.md$/, '') || 'app';
    content = `# ${domain} Specification\n\n## Purpose\n\nCurrent behavior for ${domain}.\n\n## Requirements\n`;
  }
  if (!/##\s+Requirements/i.test(content)) {
    content += '\n\n## Requirements\n';
  }
  for (const requirement of delta.added) {
    const existing = findRequirementBlock(content, requirement.title);
    if (existing) {
      warnings.push({ name: 'sdd-added-existing-requirement', message: `${targetRel} 已存在 requirement "${requirement.title}"，跳过 ADDED` });
      continue;
    }
    content = `${content.trimEnd()}\n\n${requirement.content}\n`;
  }
  for (const requirement of delta.modified) {
    const existing = findRequirementBlock(content, requirement.title);
    if (!existing) {
      errors.push({ name: 'sdd-modified-requirement-missing', message: `${targetRel} 不存在要修改的 requirement "${requirement.title}"` });
      continue;
    }
    content = `${content.slice(0, existing.start).trimEnd()}\n\n${requirement.content}\n\n${content.slice(existing.end).trimStart()}`;
  }
  for (const requirement of delta.removed) {
    const existing = findRequirementBlock(content, requirement.title);
    if (!existing) {
      warnings.push({ name: 'sdd-removed-requirement-missing', message: `${targetRel} 不存在要移除的 requirement "${requirement.title}"` });
      continue;
    }
    content = `${content.slice(0, existing.start).trimEnd()}\n\n${content.slice(existing.end).trimStart()}`;
  }
  return { content: `${content.trimEnd()}\n`, errors, warnings };
}

function syncSddChange(options = {}) {
  const loaded = loadSddChange(options);
  const specRoot = path.join(loaded.changeDir, 'specs');
  const specFiles = listMarkdownFiles(specRoot);
  const synced = [];
  const errors = [];
  const warnings = [];
  const plannedWrites = [];
  for (const deltaFile of specFiles) {
    const rel = path.relative(specRoot, deltaFile).replace(/\\/g, '/');
    const target = path.join(loaded.governance.rootDir, 'specs', rel);
    const deltaContent = fs.readFileSync(deltaFile, 'utf8');
    const delta = parseDeltaSpec(deltaContent);
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    const merged = mergeDeltaIntoSpec(current, delta, rel);
    errors.push(...merged.errors);
    warnings.push(...merged.warnings);
    if (merged.errors.length === 0) {
      plannedWrites.push({ target, content: merged.content });
    }
  }
  if (errors.length > 0 && !options.force) {
    const first = errors[0];
    throw new Error(`SDD sync 失败: ${first.message}`);
  }
  for (const item of plannedWrites) {
    ensureDir(path.dirname(item.target));
    fs.writeFileSync(item.target, item.content);
    synced.push(path.relative(loaded.governance.rootDir, item.target).replace(/\\/g, '/'));
  }
  return {
    schemaVersion: loaded.meta.schemaVersion || loaded.governance.schemaVersion,
    change: loaded.meta,
    synced,
    warnings,
    errors,
  };
}

function archiveSddChange(options = {}) {
  const releaseLoaded = loadSddChange(options);
  const sourceRevisionAttestation = readReleaseAttestation(
    options.cwd || process.cwd(),
    releaseLoaded.changeId,
    'source-revision.json'
  );
  const releaseSourceRevision =
    sourceRevisionAttestation?.releaseSourceRevision ||
    releaseLoaded.release?.releaseSourceRevision ||
    null;
  const coverageTargets = normalizeCoverageResources(releaseLoaded.coverage, {});
  const releaseTargets = mergeAffectedScopes(
    options.targets,
    options.releasePlan?.targets,
    releaseLoaded.release?.targets,
    coverageTargets,
    releaseLoaded.meta,
    { files: options.files },
    { files: options.releasePlan?.changedFiles },
    { files: releaseLoaded.release?.changedFiles }
  );
  const riskAssessment =
    releaseLoaded.meta?.riskMetadata?.assessment ||
    releaseLoaded.meta?.riskAssessment ||
    {};
  const metadataDeclaresHighRisk =
    ['l2', 'l3'].includes(String(releaseLoaded.meta?.riskTier || '').toLowerCase()) ||
    ['high', 'critical'].includes(
      String(releaseLoaded.meta?.riskLevel || '').toLowerCase()
    ) ||
    [
      'schema',
      'permission',
      'auth',
      'publicAccess',
      'dataMigration',
      'destructive',
      'crossResource',
    ].some(key => riskAssessment[key] === true);
  const requiresMainlineClosure =
    hasHighRiskTargets(releaseTargets) ||
    Boolean(releaseTargets.backend) ||
    Boolean(releaseTargets.contracts) ||
    classifyHighRiskFiles(releaseTargets.files).length > 0 ||
    metadataDeclaresHighRisk ||
    Boolean(releaseLoaded.release?.mainlinePolicy) ||
    Boolean(releaseSourceRevision);
  if (requiresMainlineClosure) {
    if (
      !releaseLoaded.release ||
      releaseLoaded.release.__invalid ||
      !releaseSourceRevision
    ) {
      const error = new Error(
        'SDD_RELEASE_SOURCE_LINEAGE_REQUIRED: 高风险 change 归档必须保留冻结发布提交的本地 attestation；--force 不能绕过主分支回合证据'
      );
      error.code = 'SDD_RELEASE_SOURCE_LINEAGE_REQUIRED';
      throw error;
    }
    assertReleaseSourceIntegrated(releaseSourceRevision, {
      cwd: options.cwd || process.cwd(),
    });
  }
  const verify = verifySddChange({ ...options, stage: 'archive' });
  if (!verify.passed && !options.force) {
    const first = verify.errors[0];
    throw new Error(`change 不能归档: ${first.message}`);
  }
  const loaded = loadSddChange(options);
  const sync = syncSddChange(options);
  const archiveName = `${new Date().toISOString().slice(0, 10)}-${loaded.changeId}`;
  const archiveDir = path.join(loaded.governance.rootDir, 'changes', 'archive', archiveName);
  ensureDir(path.dirname(archiveDir));
  if (fs.existsSync(archiveDir)) throw new Error(`archive 已存在: ${archiveName}`);
  const meta = {
    ...loaded.meta,
    status: 'archived',
    archivedAt: nowIso(),
    syncedSpecs: sync.synced,
    updatedAt: nowIso(),
  };
  writeJsonFile(loaded.metaFile, meta);
  fs.renameSync(loaded.changeDir, archiveDir);
  return {
    schemaVersion: meta.schemaVersion || loaded.governance.schemaVersion,
    change: meta,
    archiveDir: path.relative(options.cwd || process.cwd(), archiveDir).replace(/\\/g, '/'),
    synced: sync.synced,
    warnings: [...verify.warnings, ...sync.warnings],
  };
}

module.exports = {
  DEFAULT_SDD_DIR,
  QUICK_FUNCTION_SAFETY_FIELDS,
  QUICK_SDD_ALLOWED_KINDS,
  QUICK_SDD_RISK_TIER,
  SDD_SCHEMA_VERSION,
  SDD_SCOPE_MODEL_VERSION,
  SDD_VERIFY_STAGES,
  appendBypassLog,
  approveQuickSddChange,
  archiveSddChange,
  buildSddGovernanceReport,
  buildSddStatus,
  createQuickSddChange,
  createMainlineSddBundle,
  getSddGovernanceConfig,
  getSddChangeScope,
  getSddVerifyStagePolicy,
  initSddWorkspace,
  normalizeAffected,
  normalizeSddScopeModel,
  normalizeSddVerifyStage,
  proposeQuickSddChange,
  proposeSddChange,
  recordSddReleaseSourceRevision,
  renderSddDocumentation,
  approveSddChange,
  syncSddChange,
  validateQuickSddScope,
  verifySddChange,
};
