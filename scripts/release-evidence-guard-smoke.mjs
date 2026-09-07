import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { verifyReleaseEvidence } from './release-evidence-guard.mjs';

function signedEvidence(overrides = {}) {
  const evidence = {
    schemaVersion: 'openxiangda_test_evidence_v1',
    commit: 'commit-1',
    suite: 'release',
    toolchain: {
      openxiangda: '1.2.3',
      node: process.versions.node,
    },
    generatedAt: '2030-01-01T00:00:00.000Z',
    concurrency: 1,
    passed: 2,
    failed: 0,
    results: [
      { name: 'test:one', passed: true, durationMs: 1 },
      { name: 'test:two', passed: true, durationMs: 2 },
    ],
    ...overrides,
  };
  evidence.evidenceHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(evidence))
    .digest('hex');
  return evidence;
}

const expected = {
  commit: 'commit-1',
  version: '1.2.3',
  node: process.versions.node,
};
assert.equal(verifyReleaseEvidence(signedEvidence(), expected).passed, 2);

for (const [label, evidence, code] of [
  [
    'commit drift',
    signedEvidence({ commit: 'commit-2' }),
    /RELEASE_TEST_EVIDENCE_COMMIT_MISMATCH/,
  ],
  [
    'version drift',
    signedEvidence({
      toolchain: { openxiangda: '1.2.4', node: process.versions.node },
    }),
    /RELEASE_TEST_EVIDENCE_VERSION_MISMATCH/,
  ],
  [
    'failed suite',
    signedEvidence({ passed: 1, failed: 1 }),
    /RELEASE_TEST_EVIDENCE_FAILED/,
  ],
]) {
  assert.throws(() => verifyReleaseEvidence(evidence, expected), code, label);
}

const tampered = signedEvidence();
tampered.results[0].durationMs = 999;
assert.throws(
  () => verifyReleaseEvidence(tampered, expected),
  /RELEASE_TEST_EVIDENCE_HASH_MISMATCH/,
  'tampered evidence must fail closed'
);

console.log('release evidence guard smoke passed');
