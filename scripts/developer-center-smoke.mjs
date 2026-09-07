import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { startDeveloperCenter } = require('../lib/developer-center');

const status = {
  deliveryGates: {
    candidateReady: true,
    evidenceValid: true,
    productionCommissioning: true,
    promotionReady: true,
    rollbackReady: false,
    testRegistrationReady: true,
  },
  drift: { sameAppRelease: false },
  git: {
    branch: 'master',
    clean: true,
    commit: 'a'.repeat(40),
    mainlineAligned: true,
    remoteHeadCommit: 'a'.repeat(40),
    upstream: 'origin/master',
    upstreamCommit: 'a'.repeat(40),
  },
  openxiangdaVersion: 'test',
  remote: {
    environments: [
      {
        appType: 'APP_PRE',
        heads: {
          appReleaseId: 'app-pre',
          backendReleaseId: 'backend-pre',
          pageReleaseId: 'page-pre',
          runtimeReleaseId: 'runtime-pre',
          workflowReleaseId: 'workflow-pre',
        },
        kind: 'preproduction',
        latestDeployment: {
          candidateId: 'candidate-pre',
          evidenceHash: 'evidence-pre',
          evidenceSummary: { validUntil: '2099-01-01T00:00:00.000Z' },
          id: 'deployment-pre',
          status: 'succeeded',
        },
      },
      {
        appType: 'APP_PROD',
        heads: {},
        kind: 'production',
        sideEffectPolicy: {
          environmentBanner: true,
          externalWrites: 'deny',
          notifications: 'tester_allowlist',
          organizationWrites: 'deny',
          payments: 'deny',
          publicIndexing: 'deny',
          scheduledAutomations: 'disabled',
        },
      },
    ],
  },
};

const center = await startDeveloperCenter({
  getStatus: async () => status,
  port: 0,
  runAction: async body => ({ received: body }),
});

try {
  const origin = `http://${center.host}:${center.port}`;
  const unauthorized = await fetch(`${origin}/api/status`);
  assert.equal(unauthorized.status, 401);

  const page = await fetch(center.url);
  assert.equal(page.status, 200);
  const html = await page.text();
  for (const required of [
    '交付门禁与环境差异',
    'RuntimeRelease',
    'BackendRelease',
    'PageRelease',
    'WorkflowRelease',
    '测试证据',
    '正式 commissioning',
    'candidateReady',
  ]) {
    assert.match(html, new RegExp(required));
  }

  const authenticated = await fetch(`${origin}/api/status`, {
    headers: { 'x-openxiangda-studio-token': center.token },
  });
  assert.equal(authenticated.status, 200);
  assert.deepEqual(await authenticated.json(), status);

  const action = await fetch(`${origin}/api/action`, {
    body: JSON.stringify({ action: 'refresh-contract' }),
    headers: {
      'content-type': 'application/json',
      'x-openxiangda-studio-token': center.token,
    },
    method: 'POST',
  });
  assert.equal(action.status, 200);
  assert.deepEqual(await action.json(), {
    received: { action: 'refresh-contract' },
  });
} finally {
  await new Promise((resolve, reject) =>
    center.server.close(error => (error ? reject(error) : resolve()))
  );
}

console.log('developer center smoke passed');
