import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function evidenceError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

export function verifyReleaseEvidence(evidence, expected) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw evidenceError('RELEASE_TEST_EVIDENCE_INVALID', '发布测试证据必须是对象');
  }
  if (evidence.schemaVersion !== 'openxiangda_test_evidence_v1') {
    throw evidenceError('RELEASE_TEST_EVIDENCE_SCHEMA_INVALID', '发布测试证据 schema 不受支持');
  }
  if (evidence.suite !== 'release') {
    throw evidenceError('RELEASE_TEST_EVIDENCE_SUITE_INVALID', '必须使用 release suite 证据');
  }
  if (evidence.commit !== expected.commit) {
    throw evidenceError(
      'RELEASE_TEST_EVIDENCE_COMMIT_MISMATCH',
      `证据 commit ${evidence.commit || '-'} 与当前 HEAD ${expected.commit} 不一致`
    );
  }
  if (evidence.toolchain?.openxiangda !== expected.version) {
    throw evidenceError(
      'RELEASE_TEST_EVIDENCE_VERSION_MISMATCH',
      `证据版本 ${evidence.toolchain?.openxiangda || '-'} 与待发布版本 ${expected.version} 不一致`
    );
  }
  if (evidence.toolchain?.node !== expected.node) {
    throw evidenceError(
      'RELEASE_TEST_EVIDENCE_NODE_MISMATCH',
      `证据 Node ${evidence.toolchain?.node || '-'} 与当前 Node ${expected.node} 不一致`
    );
  }
  if (
    !Array.isArray(evidence.results) ||
    evidence.results.length === 0 ||
    evidence.failed !== 0 ||
    evidence.passed !== evidence.results.length ||
    evidence.results.some(result => result?.passed !== true)
  ) {
    throw evidenceError('RELEASE_TEST_EVIDENCE_FAILED', '发布测试证据未记录完整通过结果');
  }
  const { evidenceHash, ...payload } = evidence;
  const expectedHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
  if (evidenceHash !== expectedHash) {
    throw evidenceError('RELEASE_TEST_EVIDENCE_HASH_MISMATCH', '发布测试证据哈希无效');
  }
  return {
    commit: evidence.commit,
    version: evidence.toolchain.openxiangda,
    node: evidence.toolchain.node,
    passed: evidence.passed,
    releaseProfile: evidence.releaseProfile || null,
    generatedAt: evidence.generatedAt,
    evidenceHash,
  };
}

function readCurrentCommit() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw evidenceError(
      'RELEASE_TEST_EVIDENCE_GIT_REQUIRED',
      String(result.stderr || '无法读取 Git HEAD').trim()
    );
  }
  return String(result.stdout).trim();
}

function main() {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
  );
  const commit = readCurrentCommit();
  const file = path.join(
    repoRoot,
    '.openxiangda',
    'evidence',
    'tests',
    commit,
    'release.json'
  );
  if (!fs.existsSync(file)) {
    throw evidenceError(
      'RELEASE_TEST_EVIDENCE_REQUIRED',
      `当前 HEAD 缺少发布测试证据；请先运行 npm run test:release（期望 ${path.relative(repoRoot, file)}）`
    );
  }
  const verified = verifyReleaseEvidence(
    JSON.parse(fs.readFileSync(file, 'utf8')),
    {
      commit,
      version: packageJson.version,
      node: process.versions.node,
    }
  );
  process.stdout.write(
    `release evidence guard passed: ${verified.commit} openxiangda@${verified.version}, ${verified.passed} tests${verified.releaseProfile ? `, profile ${verified.releaseProfile}` : ''}, evidence ${verified.evidenceHash}\n`
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : '';
if (import.meta.url === invokedPath) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error?.message || error}\n`);
    process.exitCode = 1;
  }
}
