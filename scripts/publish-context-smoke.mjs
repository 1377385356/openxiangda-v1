import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const {
  assertCompletePublishContext,
  buildPublishContextEnv,
  buildPublishContextHeaders,
  normalizePublishContext,
  readPublishContextEnv,
} = require(path.join(repoRoot, 'lib', 'publish-context.js'));

const context = normalizePublishContext({
  appType: 'APP_CONTEXT',
  profile: 'dev',
  leaseId: 'LEASE_1',
  baselineId: 'BASELINE_1',
  changeId: 'change-a',
  clientSessionId: 'codex:thread-a',
});

assert.deepEqual(buildPublishContextHeaders(context, { requireComplete: true }), {
  'x-openxiangda-publish-lease-id': 'LEASE_1',
  'x-openxiangda-change-baseline-id': 'BASELINE_1',
  'x-openxiangda-change-id': 'change-a',
  'x-openxiangda-client-session-id': 'codex:thread-a',
});

const env = buildPublishContextEnv(context, { requireComplete: true });
assert.deepEqual(readPublishContextEnv(env), {
  appType: null,
  profileName: null,
  publishLeaseId: 'LEASE_1',
  changeBaselineId: 'BASELINE_1',
  changeId: 'change-a',
  clientSessionId: 'codex:thread-a',
});

assert.throws(
  () => assertCompletePublishContext({ publishLeaseId: 'LEASE_ONLY' }),
  error =>
    error?.code === 'PUBLISH_CONTEXT_REQUIRED' &&
    error.missing.includes('changeBaselineId') &&
    error.missing.includes('changeId') &&
    error.missing.includes('clientSessionId')
);

assert.deepEqual(buildPublishContextHeaders(null), {});
console.log('publish context smoke passed');
