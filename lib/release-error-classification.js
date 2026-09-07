const DEFINITELY_PRE_WRITE_CODES = new Set([
  'APP_RELEASE_STAGED_SCOPE_MISMATCH',
  'APP_RELEASE_STAGED_SCOPE_REQUIRED',
  'BASELINE_SCOPE_MISSING',
  'FORM_FIELD_CONTRACT_INVALID',
  'PUBLISH_CONTEXT_REQUIRED',
  'RELEASE_GIT_AUTH_REQUIRED',
  'RELEASE_MAIN_BRANCH_UNRESOLVED',
  'RELEASE_MAIN_REF_UNVERIFIED',
  'RELEASE_PUBLISH_REVISION_CHANGED',
  'RELEASE_SOURCE_BEHIND_MAIN',
  'RELEASE_SOURCE_BRANCH_REQUIRED',
  'RELEASE_SOURCE_DIRTY',
  'RELEASE_SOURCE_MAINLINE_NOT_PUSHED',
  'RELEASE_SOURCE_MAINLINE_REQUIRED',
  'RESOURCE_FIELD_CONFLICT',
  'SDD_PREPUBLISH_FAILED',
  'SOURCE_BASE_DIVERGED',
]);

function isDefinitelyPreWriteReleaseError(error) {
  const code = String(error?.code || '').trim();
  if (DEFINITELY_PRE_WRITE_CODES.has(code)) return true;
  return /^(?:SDD_|RELEASE_(?:SOURCE|GIT|MAINLINE|MAIN_BRANCH|MAIN_REF)|RUNTIME_(?:SOURCE|BUILD|PACKAGE|DEPENDENCY))/.test(
    code
  );
}

function classifyReleaseExecutionFailure({
  stagedWriteOccurred = false,
  writeAttempted = false,
} = {}) {
  if (stagedWriteOccurred) return 'staged-resumable';
  if (writeAttempted) return 'write-review-required';
  return 'failed';
}

module.exports = {
  classifyReleaseExecutionFailure,
  isDefinitelyPreWriteReleaseError,
};
