import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createReleaseTelemetry } = require('../lib/release-telemetry');

let now = Date.parse('2026-07-15T00:00:00.000Z');
const events = [];
let scheduled;
let cleared = false;
const timer = { unrefCalled: false, unref() { this.unrefCalled = true; } };
const telemetry = createReleaseTelemetry({
  operation: 'resource publish',
  now: () => now,
  onProgress: event => events.push(event),
  setInterval: callback => {
    scheduled = callback;
    return timer;
  },
  clearInterval: value => {
    assert.equal(value, timer);
    cleared = true;
  },
});

telemetry.start();
assert.equal(timer.unrefCalled, true);
await telemetry.runPhase('plan', { resourceCount: 99 }, async () => {
  now += 15_001;
  scheduled();
  now += 999;
});
await assert.rejects(
  telemetry.runPhase('activate', async () => {
    now += 25;
    const error = new Error('parent moved');
    error.code = 'APP_RELEASE_PARENT_MOVED';
    throw error;
  }),
  { code: 'APP_RELEASE_PARENT_MOVED' }
);
const snapshot = telemetry.stop();

assert.equal(cleared, true);
assert.equal(snapshot.operation, 'resource publish');
assert.equal(snapshot.durationMs, 16_025);
assert.deepEqual(
  snapshot.phases.map(phase => [phase.name, phase.status, phase.durationMs]),
  [
    ['plan', 'success', 16_000],
    ['activate', 'failed', 25],
  ]
);
assert.equal(
  snapshot.phases[1].metadata.errorCode,
  'APP_RELEASE_PARENT_MOVED'
);
assert.ok(events.some(event => event.type === 'heartbeat'));

console.log('release telemetry smoke passed');
