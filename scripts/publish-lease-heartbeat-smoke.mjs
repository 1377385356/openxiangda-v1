import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  PublishLeaseLostError,
  createPublishLeaseHeartbeat,
} = require('../lib/publish-lease-heartbeat');

const baseTime = Date.parse('2026-07-15T00:00:00.000Z');

{
  let now = baseTime;
  let renewCount = 0;
  let concurrent = 0;
  let maxConcurrent = 0;
  let resolveRenew;
  const heartbeat = createPublishLeaseHeartbeat({
    lease: {
      leaseId: 'lease-1',
      expiresAt: new Date(now + 10_000).toISOString(),
    },
    now: () => now,
    renewWindowMs: 20_000,
    renew: async lease => {
      renewCount += 1;
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise(resolve => {
        resolveRenew = resolve;
      });
      concurrent -= 1;
      return {
        ...lease,
        expiresAt: new Date(now + 600_000).toISOString(),
      };
    },
  });

  const first = heartbeat.beforeWrite();
  const second = heartbeat.beforeWrite();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(renewCount, 1, 'concurrent checks must share one renew request');
  resolveRenew();
  await Promise.all([first, second]);
  assert.equal(maxConcurrent, 1);
  assert.equal(heartbeat.shouldRenew(), false);
  now += 590_000;
  assert.equal(heartbeat.shouldRenew(), true);
  await heartbeat.stop();
}

{
  let writes = 0;
  let lost = null;
  const heartbeat = createPublishLeaseHeartbeat({
    lease: {
      leaseId: 'lease-2',
      expiresAt: new Date(baseTime + 1_000).toISOString(),
    },
    now: () => baseTime,
    renewWindowMs: 5_000,
    renew: async () => {
      const error = new Error('server says lease expired');
      error.code = 'PUBLISH_LEASE_EXPIRED';
      throw error;
    },
    onLost: error => {
      lost = error;
    },
  });

  await assert.rejects(heartbeat.beforeWrite(), error => {
    assert.equal(error.code, 'PUBLISH_LEASE_LOST');
    assert.ok(error instanceof PublishLeaseLostError);
    return true;
  });
  await assert.rejects(
    async () => {
      await heartbeat.beforeWrite();
      writes += 1;
    },
    { code: 'PUBLISH_LEASE_LOST' }
  );
  assert.equal(writes, 0, 'a poisoned heartbeat must block every later write');
  assert.equal(lost?.code, 'PUBLISH_LEASE_LOST');
  await heartbeat.stop();
}

{
  let scheduled = null;
  let cleared = false;
  const timer = { unrefCalled: false, unref() { this.unrefCalled = true; } };
  const heartbeat = createPublishLeaseHeartbeat({
    lease: {
      leaseId: 'lease-3',
      expiresAt: new Date(baseTime + 600_000).toISOString(),
    },
    now: () => baseTime,
    renew: async lease => lease,
    setInterval: callback => {
      scheduled = callback;
      return timer;
    },
    clearInterval: value => {
      assert.equal(value, timer);
      cleared = true;
    },
  });
  heartbeat.start();
  assert.equal(typeof scheduled, 'function');
  assert.equal(timer.unrefCalled, true);
  await heartbeat.stop();
  assert.equal(cleared, true);
}

{
  // Model the real 88 Function + 11 Automation release as eleven concurrent
  // write waves. Each expiry window must produce one shared renewal, never one
  // renewal per resource.
  let now = baseTime;
  let renewCount = 0;
  let concurrentRenewals = 0;
  let maxConcurrentRenewals = 0;
  let writes = 0;
  const resources = [
    ...Array.from({ length: 88 }, (_, index) => `Function:function_${index + 1}`),
    ...Array.from({ length: 11 }, (_, index) => `Automation:automation_${index + 1}`),
  ];
  const heartbeat = createPublishLeaseHeartbeat({
    lease: {
      leaseId: 'lease-99-resources',
      expiresAt: new Date(now + 190_000).toISOString(),
    },
    now: () => now,
    renewWindowMs: 180_000,
    renew: async lease => {
      renewCount += 1;
      concurrentRenewals += 1;
      maxConcurrentRenewals = Math.max(
        maxConcurrentRenewals,
        concurrentRenewals
      );
      await new Promise(resolve => setImmediate(resolve));
      concurrentRenewals -= 1;
      return {
        ...lease,
        expiresAt: new Date(now + 300_000).toISOString(),
      };
    },
  });

  for (let offset = 0; offset < resources.length; offset += 9) {
    now += 31_000;
    await Promise.all(
      resources.slice(offset, offset + 9).map(async resource => {
        assert.match(resource, /^(Function|Automation):/);
        await heartbeat.beforeWrite();
        writes += 1;
      })
    );
  }

  assert.equal(writes, 99);
  assert.equal(renewCount, 3, 'the long batch should renew once per expiry window');
  assert.equal(maxConcurrentRenewals, 1, 'renewals must never overlap');
  await heartbeat.stop();
}

console.log('publish lease heartbeat smoke passed');
