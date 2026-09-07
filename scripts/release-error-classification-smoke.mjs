import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  classifyReleaseExecutionFailure,
  isDefinitelyPreWriteReleaseError,
} = require('../lib/release-error-classification');

for (const code of [
  'SOURCE_BASE_DIVERGED',
  'RESOURCE_FIELD_CONFLICT',
  'BASELINE_SCOPE_MISSING',
  'FORM_FIELD_CONTRACT_INVALID',
]) {
  const error = Object.assign(new Error(code), { code });
  assert.equal(isDefinitelyPreWriteReleaseError(error), true);
  assert.equal(
    classifyReleaseExecutionFailure({
      writeAttempted: false,
    }),
    'failed',
    `${code} must not create a false write-review-required incident`,
  );
}

assert.equal(
  classifyReleaseExecutionFailure({
    writeAttempted: true,
  }),
  'write-review-required',
  'an ambiguous transport failure still requires write reconciliation',
);
assert.equal(
  classifyReleaseExecutionFailure({
    stagedWriteOccurred: true,
    writeAttempted: true,
  }),
  'staged-resumable',
  'a real staged child must remain resumable even when the next preflight fails',
);

console.log('release error classification smoke passed');
