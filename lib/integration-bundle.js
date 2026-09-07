const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TASK_RESULT_SCHEMA_VERSION = 'openxiangda_task_result_v2';
const LEGACY_TASK_RESULT_SCHEMA_VERSION = 'openxiangda_task_result_v1';
const INTEGRATION_BUNDLE_SCHEMA_VERSION = 'openxiangda_integration_bundle_v1';

function runGit(cwd, args, options = {}) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0 && !options.allowFailure) {
    const error = new Error(
      String(result.stderr || result.stdout || `git ${args.join(' ')} failed`).trim()
    );
    error.code = 'INTEGRATION_GIT_FAILED';
    throw error;
  }
  return {
    ok: result.status === 0,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function gitCommonStateDir(cwd) {
  const root = runGit(cwd, ['rev-parse', '--show-toplevel']).stdout;
  const common = runGit(cwd, ['rev-parse', '--git-common-dir']).stdout;
  const commonDir = path.isAbsolute(common) ? common : path.resolve(root, common);
  return path.join(commonDir, 'openxiangda');
}

function taskResultFile(cwd, changeId) {
  return path.join(
    gitCommonStateDir(cwd),
    'task-results',
    `${normalizeChangeId(changeId)}.json`
  );
}

function normalizeChangeId(value) {
  const changeId = String(value || '').trim();
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(changeId)) {
    const error = new Error(`INTEGRATION_CHANGE_ID_INVALID: ${value || '(empty)'}`);
    error.code = 'INTEGRATION_CHANGE_ID_INVALID';
    throw error;
  }
  return changeId.toLowerCase();
}

function recordIntegrationTaskResult(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const changeId = normalizeChangeId(options.changeId);
  const dirty = runGit(cwd, ['status', '--porcelain']).stdout;
  if (dirty) {
    const error = new Error(
      'INTEGRATION_TASK_RESULT_DIRTY: 请先提交该任务的实现、测试和 SDD 记录，再生成 task result'
    );
    error.code = 'INTEGRATION_TASK_RESULT_DIRTY';
    throw error;
  }
  const commit = runGit(cwd, ['rev-parse', 'HEAD']).stdout;
  const treeHash = runGit(cwd, ['rev-parse', 'HEAD^{tree}']).stdout;
  const branch = runGit(cwd, ['branch', '--show-current']).stdout;
  if (!branch) {
    const error = new Error(
      'INTEGRATION_TASK_BRANCH_REQUIRED: detached HEAD 不能生成可合并任务结果'
    );
    error.code = 'INTEGRATION_TASK_BRANCH_REQUIRED';
    throw error;
  }
  const result = {
    schemaVersion: TASK_RESULT_SCHEMA_VERSION,
    changeId,
    commit,
    treeHash,
    branch,
    ...(options.sourceBase?.baseCommit && options.sourceBase?.treeHash
      ? {
          sourceBase: {
            repo: options.sourceBase.repo,
            baseCommit: options.sourceBase.baseCommit,
            treeHash: options.sourceBase.treeHash,
          },
          baseRevision: options.sourceBase.baseCommit,
        }
      : {}),
    targets: options.targets || {},
    changedFiles: Array.from(
      new Set((options.changedFiles || []).map(String).filter(Boolean))
    ).sort(),
    recordedAt: new Date().toISOString(),
  };
  const file = taskResultFile(cwd, changeId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`, {
    mode: 0o600,
  });
  return { ...result, file };
}

function readIntegrationTaskResult(cwd, changeId) {
  const file = taskResultFile(cwd, changeId);
  if (!fs.existsSync(file)) return null;
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return [
      TASK_RESULT_SCHEMA_VERSION,
      LEGACY_TASK_RESULT_SCHEMA_VERSION,
    ].includes(value?.schemaVersion)
      ? { ...value, file }
      : null;
  } catch {
    return null;
  }
}

function commitIsAncestor(cwd, commit, descendant = 'HEAD') {
  return runGit(
    cwd,
    ['merge-base', '--is-ancestor', String(commit), String(descendant)],
    { allowFailure: true }
  ).ok;
}

function collectIntegrationTaskResults(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const changeIds = Array.from(
    new Set((options.changeIds || []).map(normalizeChangeId))
  ).sort();
  const results = changeIds.map(changeId => {
    const result = readIntegrationTaskResult(cwd, changeId);
    if (!result) {
      const error = new Error(
        `INTEGRATION_TASK_RESULT_REQUIRED: ${changeId} 缺少 task result；请在任务提交后运行 openxiangda sdd ready ${changeId}`
      );
      error.code = 'INTEGRATION_TASK_RESULT_REQUIRED';
      error.changeId = changeId;
      throw error;
    }
    if (!commitIsAncestor(cwd, result.commit, 'HEAD')) {
      const error = new Error(
        `INTEGRATION_TASK_COMMIT_NOT_MERGED: ${changeId}@${String(result.commit).slice(0, 12)} 尚未合并到当前主线 HEAD`
      );
      error.code = 'INTEGRATION_TASK_COMMIT_NOT_MERGED';
      error.changeId = changeId;
      error.commit = result.commit;
      throw error;
    }
    return result;
  });
  return {
    schemaVersion: INTEGRATION_BUNDLE_SCHEMA_VERSION,
    requiredChanges: changeIds,
    requiredCommits: results.map(result => ({
      changeId: result.changeId,
      commit: result.commit,
      treeHash: result.treeHash,
      sourceBranch: result.branch,
      ...(result.sourceBase?.baseCommit && result.sourceBase?.treeHash
        ? {
            sourceBase: result.sourceBase,
            baseRevision:
              result.baseRevision || result.sourceBase.baseCommit,
          }
        : {}),
    })),
    verifiedAgainst: runGit(cwd, ['rev-parse', 'HEAD']).stdout,
    createdAt: new Date().toISOString(),
  };
}

function inspectIntegrationBundleCommits(integration, options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const required = Array.isArray(integration?.requiredCommits)
    ? integration.requiredCommits
    : [];
  return {
    schemaVersion:
      integration?.schemaVersion || INTEGRATION_BUNDLE_SCHEMA_VERSION,
    valid: required.length > 0,
    requiredCommits: required.map(item => ({
      ...item,
      mergedIntoHead: commitIsAncestor(cwd, item.commit, 'HEAD'),
    })),
    checkedHead: runGit(cwd, ['rev-parse', 'HEAD']).stdout,
    checkedAt: new Date().toISOString(),
  };
}

function assertIntegrationBundleCommits(integration, options = {}) {
  const inspection = inspectIntegrationBundleCommits(integration, options);
  if (!inspection.valid) {
    const error = new Error(
      'INTEGRATION_BUNDLE_REQUIRED: mainline bundle 缺少 requiredCommits，禁止发布可能遗漏任务的主线'
    );
    error.code = 'INTEGRATION_BUNDLE_REQUIRED';
    throw error;
  }
  const missing = inspection.requiredCommits.filter(item => !item.mergedIntoHead);
  if (missing.length > 0) {
    const error = new Error(
      `INTEGRATION_TASK_COMMIT_NOT_MERGED: ${missing
        .map(item => `${item.changeId}@${String(item.commit).slice(0, 12)}`)
        .join(', ')} 尚未合并到当前主线 HEAD`
    );
    error.code = 'INTEGRATION_TASK_COMMIT_NOT_MERGED';
    error.missing = missing;
    throw error;
  }
  return inspection;
}

module.exports = {
  INTEGRATION_BUNDLE_SCHEMA_VERSION,
  TASK_RESULT_SCHEMA_VERSION,
  assertIntegrationBundleCommits,
  collectIntegrationTaskResults,
  inspectIntegrationBundleCommits,
  readIntegrationTaskResult,
  recordIntegrationTaskResult,
};
