import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { explainReleaseExecution } = require('../lib/release-explain');

assert.deepEqual(explainReleaseExecution(null), {
  state: 'not-started',
  resumable: false,
  writeReviewRequired: false,
  summary: '本地没有该 change 的 release execution journal。',
  nextAction: '先运行 release publish --dry-run 检查计划，再开始正式发布。',
});

const uncertain = explainReleaseExecution({
  status: 'write-review-required',
  steps: [
    { id: 'lease-and-capture', status: 'completed' },
    {
      id: 'backend-stage',
      status: 'failed',
      errorCode: 'ETIMEDOUT',
      error: 'request result unknown',
    },
    { id: 'app-finalize', status: 'pending' },
  ],
});
assert.equal(uncertain.writeReviewRequired, true);
assert.equal(uncertain.progress.currentStep, 'backend-stage');
assert.match(uncertain.nextAction, /resume-after-review/);

const resumable = explainReleaseExecution({
  status: 'staged-resumable',
  steps: [
    { id: 'backend-stage', status: 'completed' },
    { id: 'runtime-stage', status: 'pending' },
  ],
});
assert.equal(resumable.resumable, true);
assert.equal(resumable.progress.completed, 1);
assert.match(resumable.nextAction, /同一条 release publish/);

console.log('release explain smoke passed');
