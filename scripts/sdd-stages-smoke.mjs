import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sdd = require(path.join(repoRoot, 'lib', 'sdd.js'));
const releaseMainline = require(path.join(repoRoot, 'lib', 'release-mainline.js'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectQuickRejection(options, expectedFragment) {
  const validation = sdd.validateQuickSddScope(options);
  assert(!validation.valid, `quick scope should be rejected: ${JSON.stringify(options)}`);
  assert(
    validation.errors.some(message => message.includes(expectedFragment)),
    `quick rejection should mention ${expectedFragment}: ${validation.errors.join('; ')}`,
  );
}

function completeSection(file, sectionName) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  let active = false;
  const updated = lines.map(line => {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      active = heading[1].trim().toLowerCase() === sectionName.toLowerCase();
      return line;
    }
    return active ? line.replace(/^- \[ \]/, '- [x]') : line;
  });
  fs.writeFileSync(file, updated.join('\n'));
}

function hasError(result, name) {
  return result.errors.some(error => error.name === name);
}

function hasWarning(result, name) {
  return result.warnings.some(warning => warning.name === name);
}

function expectArchiveLineageRequired(options, label) {
  let archiveError = null;
  try {
    sdd.archiveSddChange(options);
  } catch (error) {
    archiveError = error;
  }
  assert(
    archiveError?.code === 'SDD_RELEASE_SOURCE_LINEAGE_REQUIRED',
    `${label} must require release source lineage: ${archiveError?.code || 'no error'}`,
  );
}

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr || result.stdout || args.join(' '));
  }
}

function initGitWithOrigin(cwd) {
  git(['init', '-b', 'main'], cwd);
  git(['config', 'user.email', 'sdd-stages@example.test'], cwd);
  git(['config', 'user.name', 'SDD Stages Smoke'], cwd);
  git(['add', '.'], cwd);
  git(['commit', '-m', 'baseline'], cwd);
  const remote = path.join(tempRoot, 'origin.git');
  git(['init', '--bare', '--initial-branch=main', remote], tempRoot);
  git(['remote', 'add', 'origin', remote], cwd);
  git(['push', '-u', 'origin', 'main'], cwd);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openxiangda-sdd-stages-'));
try {
  expectQuickRejection(
    {
      riskTier: 'L1',
      changeKind: 'schema',
      affected: { pages: ['customer'], files: ['src/pages/customer/index.tsx'] },
    },
    'changeKind',
  );
  expectQuickRejection(
    {
      riskTier: 'L1',
      changeKind: 'copy',
      affected: { forms: ['customer'], files: ['src/forms/customer/schema.ts'] },
    },
    '表单',
  );
  expectQuickRejection(
    {
      riskTier: 'L1',
      changeKind: 'narrow-fix',
      affected: { functions: ['lookup'], files: ['src/functions/lookup/index.ts'] },
    },
    'riskAssessment.confirmed=true',
  );
  expectQuickRejection(
    {
      riskTier: 'L1',
      changeKind: 'narrow-fix',
      riskAssessment: {
        confirmed: true,
        schema: true,
        permission: false,
        auth: false,
        publicAccess: false,
        dataMigration: false,
        destructive: false,
        crossResource: false,
      },
      affected: { functions: ['lookup'], files: ['src/functions/lookup/index.ts'] },
    },
    'riskAssessment.schema=false',
  );
  expectQuickRejection(
    {
      riskTier: 'L1',
      changeKind: 'binding',
      affected: { pages: ['customer'], files: ['src/pages/customer/index.tsx'] },
    },
    'crossResource=false',
  );
  expectQuickRejection(
    {
      riskTier: 'L1',
      changeKind: 'copy',
      affected: { pages: ['../customer'], files: ['src/pages/customer/index.tsx'] },
    },
    '精确安全 code',
  );
  expectQuickRejection(
    {
      riskTier: 'L1',
      changeKind: 'narrow-fix',
      riskAssessment: {
        confirmed: true,
        schema: false,
        permission: false,
        auth: false,
        publicAccess: false,
        dataMigration: false,
        destructive: false,
        crossResource: false,
      },
      affected: { functions: ['lookup'], files: ['src/resources/functions/other.json'] },
    },
    '超出精确 page/function scope',
  );

  const functionScope = sdd.validateQuickSddScope({
    riskTier: 'L1',
    changeKind: 'narrow-fix',
    riskAssessment: {
      confirmed: true,
      schema: false,
      permission: false,
      auth: false,
      publicAccess: false,
      dataMigration: false,
      destructive: false,
      crossResource: false,
    },
    affected: { functions: ['lookup'], files: ['src/functions/lookup/index.ts'] },
  });
  assert(functionScope.valid, `safe exact Function quick scope should pass: ${functionScope.errors}`);

  const workspace = path.join(tempRoot, 'workspace');
  sdd.initSddWorkspace({ cwd: workspace });
  initGitWithOrigin(workspace);
  const quick = sdd.createQuickSddChange({
    cwd: workspace,
    changeId: 'fix-customer-card-copy',
    title: 'Fix customer card copy',
    changeKind: 'copy',
    approvalSummary: '用户明确要求修正 customer 页面的一处文案。',
    affected: {
      pages: ['customer'],
      files: ['src/pages/customer/index.tsx'],
    },
  });
  assert(quick.approved, 'quick change should be created and approved atomically');
  assert(quick.change.status === 'approved', 'quick change should persist approved status');
  assert(quick.change.riskTier === 'L1', 'quick change should persist L1 risk tier');
  assert(quick.change.changeMode === 'quick', 'quick change should persist quick mode');
  assert(quick.change.changeKind === 'copy', 'quick change should persist explainable kind');
  assert(quick.change.riskMetadata?.classification === 'explicit-l1-quick', 'missing quick risk metadata');
  assert(quick.change.scopePolicy?.exact === true, 'quick change should persist exact-scope policy');
  assert(quick.change.approvalMode === 'quick-explicit-intent', 'quick approval should record its mode');

  const changeDir = path.join(workspace, 'openspec', 'changes', quick.change.id);
  const rendered = sdd.renderSddDocumentation({
    cwd: workspace,
    changeId: quick.change.id,
  });
  assert(rendered.rendered.length === 5, 'optional SDD prose should be rendered on demand');
  const tasksFile = path.join(changeDir, 'tasks.md');
  const evidenceFile = path.join(changeDir, 'evidence.md');
  const releaseFile = path.join(changeDir, 'release.json');
  for (const compactJson of ['change.json', 'coverage.json', 'release.json']) {
    assert(
      fs.readFileSync(path.join(changeDir, compactJson), 'utf8').trim().split(/\r?\n/).length === 1,
      `${compactJson} should stay compact for L1 quick changes`,
    );
  }
  const targets = {
    forms: [],
    pages: ['customer'],
    functions: [],
    automations: [],
    workflows: [],
    jsCodeNodes: [],
    resources: false,
    runtime: true,
    other: [],
  };
  const changedFiles = ['src/pages/customer/index.tsx'];
  const baseVerify = { cwd: workspace, changeId: quick.change.id, targets, files: changedFiles };

  const unfinishedImplementation = sdd.verifySddChange({ ...baseVerify, stage: 'implementation' });
  assert(unfinishedImplementation.passed, 'implementation stage should keep normal coding unblocked');
  assert(!hasError(unfinishedImplementation, 'sdd-unfinished-tasks'), 'implementation should not require prose checklist completion');
  assert(!hasError(unfinishedImplementation, 'sdd-evidence-incomplete'), 'implementation must not require evidence');
  assert(!hasError(unfinishedImplementation, 'sdd-release-invalid'), 'implementation must not require release metadata');

  completeSection(tasksFile, 'Implementation');
  const initialRelease = fs.readFileSync(releaseFile, 'utf8');
  fs.rmSync(releaseFile);
  const implementation = sdd.verifySddChange({ ...baseVerify, stage: 'implementation' });
  assert(implementation.passed, `implementation stage should pass independently: ${JSON.stringify(implementation.errors)}`);
  assert(implementation.stageRequirements.evidence.length === 0, 'implementation should expose no evidence requirement');
  assert(implementation.stageRequirements.release === false, 'implementation should expose no release requirement');
  fs.writeFileSync(releaseFile, initialRelease);

  const releasePlan = {
    targets,
    changedFiles,
    commands: [
      `openxiangda runtime deploy --no-activate --profile dev --change ${quick.change.id}`,
      `openxiangda release app-finalize --staged-resources-json .openxiangda/releases/${quick.change.id}/staged-resources.json --wait --profile dev --change ${quick.change.id}`,
    ],
  };
  const unfinishedPrepublish = sdd.verifySddChange({
    ...baseVerify,
    stage: 'prepublish',
    releasePlan,
  });
  assert(unfinishedPrepublish.passed, 'streamlined prepublish should not block on documentation checklists');
  assert(hasWarning(unfinishedPrepublish, 'sdd-unfinished-tasks'), 'missing prepublish task warning');
  assert(hasWarning(unfinishedPrepublish, 'sdd-evidence-incomplete'), 'missing prepublish evidence warning');
  const strictPrepublish = sdd.verifySddChange({
    ...baseVerify,
    stage: 'prepublish',
    releasePlan,
    configText:
      'export default { governance: { sdd: { enabled: true, strictHighRisk: true, strictDocumentation: true, path: "openspec" } } };',
  });
  assert(!strictPrepublish.passed, 'strictDocumentation should restore prose completion as a hard gate');
  assert(hasError(strictPrepublish, 'sdd-unfinished-tasks'), 'strictDocumentation should block unfinished tasks');
  assert(hasError(strictPrepublish, 'sdd-evidence-incomplete'), 'strictDocumentation should block unfinished evidence');

  completeSection(tasksFile, 'Prepublish');
  completeSection(evidenceFile, 'Verification');
  const prepublish = sdd.verifySddChange({
    ...baseVerify,
    stage: 'prepublish',
    releasePlan,
    writeMetadata: true,
  });
  assert(prepublish.passed, `prepublish should pass without online/archive evidence: ${JSON.stringify(prepublish.errors)}`);
  assert(prepublish.metadataWritten, 'passing prepublish should write verification metadata');
  assert(prepublish.release.verificationStage === 'prepublish', 'release should record prepublish stage');
  assert(prepublish.change.verification?.prepublish?.passed, 'change metadata should record prepublish result');
  assert(/## Postpublish[\s\S]*- \[ \]/.test(fs.readFileSync(tasksFile, 'utf8')), 'postpublish task should remain open');
  assert(/## Archive[\s\S]*- \[ \]/.test(fs.readFileSync(tasksFile, 'utf8')), 'archive task should remain open');
  assert(/## Release[\s\S]*- \[ \]/.test(fs.readFileSync(evidenceFile, 'utf8')), 'online release evidence should remain open');

  const legacyDefault = sdd.verifySddChange(baseVerify);
  assert(legacyDefault.passed, 'default verify should stop at the prepublish boundary');
  assert(!hasError(legacyDefault, 'sdd-unfinished-tasks'), 'default verify must not require postpublish/archive tasks');
  assert(!hasError(legacyDefault, 'sdd-evidence-incomplete'), 'default verify must not require future online evidence');

  const unfinishedPostpublish = sdd.verifySddChange({ ...baseVerify, stage: 'postpublish' });
  assert(unfinishedPostpublish.passed, 'streamlined postpublish should warn instead of blocking on prose');
  assert(hasWarning(unfinishedPostpublish, 'sdd-unfinished-tasks'), 'postpublish should expose the unfinished checklist warning');
  completeSection(tasksFile, 'Postpublish');
  completeSection(evidenceFile, 'Release');
  const postpublish = sdd.verifySddChange({ ...baseVerify, stage: 'postpublish' });
  assert(postpublish.passed, `postpublish should pass before archive: ${JSON.stringify(postpublish.errors)}`);

  const unfinishedArchive = sdd.verifySddChange({ ...baseVerify, stage: 'archive' });
  assert(unfinishedArchive.passed, 'streamlined archive verify should leave readiness prose as a warning');
  assert(hasWarning(unfinishedArchive, 'sdd-unfinished-tasks'), 'archive should expose the unfinished checklist warning');
  completeSection(tasksFile, 'Archive');
  const archiveVerify = sdd.verifySddChange({ ...baseVerify, stage: 'archive' });
  assert(archiveVerify.passed, `archive verification should pass after all stages: ${JSON.stringify(archiveVerify.errors)}`);
  assert(sdd.verifySddChange(baseVerify).passed, 'default verify should pass once every stage is complete');

  let forcedArchiveError = null;
  try {
    sdd.archiveSddChange({ ...baseVerify, force: true });
  } catch (error) {
    forcedArchiveError = error;
  }
  assert(
    forcedArchiveError?.code === 'SDD_RELEASE_SOURCE_LINEAGE_REQUIRED',
    `--force must not bypass missing release source lineage: ${forcedArchiveError?.code || 'no error'}`,
  );

  const legacyWorkspace = path.join(tempRoot, 'legacy-archive-risk');
  sdd.initSddWorkspace({ cwd: legacyWorkspace });
  const legacy = sdd.proposeSddChange({
    cwd: legacyWorkspace,
    changeId: 'legacy-archive-risk',
    affected: {
      functions: ['legacy_lookup'],
      files: ['src/functions/legacy_lookup/index.ts'],
    },
  });
  sdd.approveSddChange({
    cwd: legacyWorkspace,
    changeId: legacy.change.id,
    summary: 'approved legacy archive risk fixture',
  });
  const legacyDir = path.join(
    legacyWorkspace,
    'openspec',
    'changes',
    legacy.change.id,
  );
  const legacyMetaFile = path.join(legacyDir, 'change.json');
  const legacyCoverageFile = path.join(legacyDir, 'coverage.json');
  const legacyReleaseFile = path.join(legacyDir, 'release.json');
  const legacyMeta = JSON.parse(fs.readFileSync(legacyMetaFile, 'utf8'));
  const legacyCoverage = JSON.parse(fs.readFileSync(legacyCoverageFile, 'utf8'));
  const legacyRelease = JSON.parse(fs.readFileSync(legacyReleaseFile, 'utf8'));
  legacyMeta.schemaVersion = 'openxiangda-sdd-v1';
  const emptyAffected = {
    forms: [],
    pages: [],
    functions: [],
    automations: [],
    workflows: [],
    jsCodeNodes: [],
    files: [],
    resources: false,
    runtime: false,
    backend: false,
    contracts: false,
  };
  const emptyCoverage = {
    schemaVersion: 'openxiangda-sdd-v1',
    changeId: legacy.change.id,
    resources: {},
    requirements: [],
  };
  delete legacyRelease.mainlinePolicy;
  delete legacyRelease.releaseSourceRevision;

  fs.writeFileSync(
    legacyMetaFile,
    `${JSON.stringify({ ...legacyMeta, affected: emptyAffected }, null, 2)}\n`,
  );
  fs.writeFileSync(
    legacyCoverageFile,
    `${JSON.stringify(emptyCoverage, null, 2)}\n`,
  );
  fs.writeFileSync(
    legacyReleaseFile,
    `${JSON.stringify({ ...legacyRelease, targets: { functions: ['legacy_lookup'] } }, null, 2)}\n`,
  );
  expectArchiveLineageRequired(
    {
      cwd: legacyWorkspace,
      changeId: legacy.change.id,
      releasePlan: { targets: {} },
      force: true,
    },
    'empty plan over recorded release targets',
  );

  fs.writeFileSync(
    legacyReleaseFile,
    `${JSON.stringify({ ...legacyRelease, targets: {} }, null, 2)}\n`,
  );
  fs.writeFileSync(
    legacyCoverageFile,
    `${JSON.stringify(legacyCoverage, null, 2)}\n`,
  );
  expectArchiveLineageRequired(
    {
      cwd: legacyWorkspace,
      changeId: legacy.change.id,
      releasePlan: { targets: {} },
      force: true,
    },
    'coverage-only legacy risk',
  );

  fs.writeFileSync(
    legacyCoverageFile,
    `${JSON.stringify(emptyCoverage, null, 2)}\n`,
  );
  fs.writeFileSync(
    legacyMetaFile,
    `${JSON.stringify(legacyMeta, null, 2)}\n`,
  );
  expectArchiveLineageRequired(
    {
      cwd: legacyWorkspace,
      changeId: legacy.change.id,
      releasePlan: { targets: {} },
      force: true,
    },
    'change metadata-only legacy risk',
  );

  git(['add', '.'], workspace);
  git(['commit', '-m', 'release source'], workspace);
  git(['push', 'origin', 'main'], workspace);
  const releaseSourceRevision = releaseMainline.prepareReleaseSourceRevision({ cwd: workspace });
  sdd.recordSddReleaseSourceRevision({
    cwd: workspace,
    changeId: quick.change.id,
    releaseSourceRevision,
  });
  const archived = sdd.archiveSddChange(baseVerify);
  assert(archived.archiveDir.includes('openspec/changes/archive/'), 'archive should enforce and then move the change');

  assert(sdd.normalizeSddVerifyStage('pre-publish') === 'prepublish', 'pre-publish alias should normalize');
  assert(sdd.normalizeSddVerifyStage('legacy') === 'default', 'legacy alias should preserve default behavior');

  process.stdout.write('sdd staged verification smoke passed\n');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
