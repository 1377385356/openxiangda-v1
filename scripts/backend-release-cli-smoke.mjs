import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openxiangda-backend-release-'));
const tempHome = path.join(tempRoot, 'home');
const workspace = path.join(tempRoot, 'workspace');
const origin = path.join(tempRoot, 'origin.git');
const profileName = 'mock';
const appType = 'APP_BACKEND_RELEASE_SMOKE';
const functionCodes = Array.from({ length: 88 }, (_, index) =>
  `function_${String(index + 1).padStart(2, '0')}`
);
const automationCodes = Array.from({ length: 11 }, (_, index) =>
  `automation_${String(index + 1).padStart(2, '0')}`
);
const condolenceFunctionCode = 'condolence_service';
const condolenceCodeAutomationCode = 'condolence_vice_chair_role_sync';
const condolenceDeclarativeAutomationCodes = [
  'condolence_workflow_process_approved',
  'condolence_workflow_process_rejected',
  'condolence_workflow_process_withdrawn',
  'condolence_workflow_task_approved',
  'condolence_workflow_task_rejected',
  'condolence_workflow_task_returned',
  'condolence_workflow_task_transferred',
];
const workflowCodes = Array.from({ length: 12 }, (_, index) =>
  `workflow_${String(index + 1).padStart(2, '0')}`
);
const beforeSha = 'a'.repeat(64);
const desiredSha = 'b'.repeat(64);
const secretName = 'dingtalk_org_app_secret';
const secretRefs = [{ name: secretName, required: true }];
const parentReleaseId = '00000000-0000-4000-8000-000000000001';
const backendReleaseId = '00000000-0000-4000-8000-000000000002';
const workflowReleaseId = '00000000-0000-4000-8000-000000000003';
const stagedFormReleaseId = '00000000-0000-4000-8000-000000000004';
const stagedFormContentHash = '9'.repeat(64);
const calls = [];
let mode = 'stale';
let activated = false;
let secretRefsActivated = false;
let legacyFunctionSha = beforeSha;
let automationDetailInFlight = 0;
let maxAutomationDetailInFlight = 0;
let workflowDetailInFlight = 0;
let maxWorkflowDetailInFlight = 0;
let stagedFormAborted = false;
let stagedFormHeadRevision = 1;
let frozenRepositoryIdentity = null;

function write(relativePath, value) {
  const file = path.join(workspace, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

function writeJson(relativePath, value) {
  write(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function git(args, cwd = workspace) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr || result.stdout);
  }
  return String(result.stdout || '').trim();
}

function desiredFunctionDefinition(code) {
  return {
    kind: 'app_function',
    version: 'function_v1',
    functionCode: code,
    runtimeMode: 'trusted_node',
    sourceType: 'file_snapshot',
    sourceFile: {
      bucketName: 'files',
      objectName: `${code}.cjs`,
      sha256: desiredSha,
      size: 10,
    },
    sourceProvenance: { change: 'backend-release-smoke' },
    resourceBindings: {},
  };
}

function desiredSecretFunctionDefinition(code) {
  return {
    ...desiredFunctionDefinition(code),
    version: 'function_v2',
    runtimeContractVersion: 'trusted_node_v2',
  };
}

function desiredAutomationDefinition(code) {
  return {
    kind: 'automation_code_ts',
    version: 'code_v1',
    runtimeMode: 'trusted_node',
    sourceType: 'file_snapshot',
    sourceFile: {
      bucketName: 'files',
      objectName: `${code}.cjs`,
      sha256: desiredSha,
      size: 10,
    },
    sourceProvenance: { change: 'backend-release-smoke' },
  };
}

function desiredDeclarativeAutomationDefinition(code) {
  return {
    version: 'v3',
    nodes: [
      { id: 'start', type: 'start', data: {} },
      {
        id: 'invoke',
        type: 'function_call',
        data: {
          config: {
            functionCode: condolenceFunctionCode,
            input: { operation: code },
          },
        },
      },
      { id: 'end', type: 'end', data: {} },
    ],
    edges: [
      { id: 'start-invoke', source: 'start', target: 'invoke' },
      { id: 'invoke-end', source: 'invoke', target: 'end' },
    ],
  };
}

function functionRemote(code) {
  const usesSecretRefs = secretRefsActivated && code === functionCodes[0];
  const sha =
    mode === 'legacy' && code === functionCodes[0]
      ? legacyFunctionSha
      : activated
        ? desiredSha
        : beforeSha;
  return {
    id: `FUNC_${code}`,
    code,
    name: code,
    description: '',
    status: 'active',
    revision: activated ? 2 : 1,
    updatedAt: activated
      ? '2026-07-15T12:10:00.000Z'
      : '2026-07-15T12:00:00.000Z',
    definitionJson: {
      ...(usesSecretRefs
        ? desiredSecretFunctionDefinition(code)
        : desiredFunctionDefinition(code)),
      sourceFile: {
        ...desiredFunctionDefinition(code).sourceFile,
        sha256: sha,
      },
    },
    resourceBindings: {},
    ...(usesSecretRefs ? { secretRefs } : {}),
  };
}

function automationRemote(code) {
  const version = activated ? 2 : 1;
  const bindingContractMode =
    ['binding-contract', 'binding-contract-mismatch'].includes(mode) &&
    code === automationCodes[0];
  const bindingContractApplied =
    bindingContractMode &&
    activated &&
    mode === 'binding-contract';
  return {
    id: `AUTO_${code}_V${version}`,
    groupId: `GROUP_${code}`,
    resourceCode: code,
    name: code,
    description: '',
    formUuid: null,
    triggerConfig: { appType, mode: 'event' },
    definitionJson: {
      ...desiredAutomationDefinition(code),
      ...(bindingContractApplied
        ? {
            resources: { forms: ['customer'] },
            resourceBindings: {
              forms: { customer: 'FORM_CUSTOMER' },
            },
          }
        : {}),
      sourceFile: {
        ...desiredAutomationDefinition(code).sourceFile,
        sha256: activated ? desiredSha : beforeSha,
      },
    },
    viewJson: null,
    tags: null,
    version,
    isPublished: true,
    isEnabled: true,
    updatedAt: activated
      ? '2026-07-15T12:10:00.000Z'
      : '2026-07-15T12:00:00.000Z',
  };
}

function workflowRemote(code) {
  return {
    id: `WF_${code}`,
    resourceCode: code,
    formUuid: 'FORM_CUSTOMER',
    revision: 1,
    definitionJson: { version: 'v3', nodes: [], edges: [] },
    viewJson: null,
    isPublished: false,
  };
}

fs.mkdirSync(path.join(tempHome, '.openxiangda'), { recursive: true });
fs.mkdirSync(workspace, { recursive: true });
write('.gitignore', '.openxiangda/\nnode_modules/\n');
writeJson('package.json', { private: true });
git(['init', '--bare', '--initial-branch=main', origin], tempRoot);
for (const code of functionCodes) {
  writeJson(`src/resources/functions/${code}.json`, {
    code,
    name: code,
    description: '',
    definitionJson: desiredFunctionDefinition(code),
    status: 'active',
  });
}
for (const code of automationCodes) {
  writeJson(`src/resources/automations/${code}.json`, {
    code,
    name: code,
    description: '',
    triggerConfig: { mode: 'event' },
    definitionJson: desiredAutomationDefinition(code),
    publish: true,
    enable: true,
  });
}
for (const args of [
  ['init', '-b', 'main'],
  ['config', 'user.email', 'smoke@example.com'],
  ['config', 'user.name', 'Smoke'],
  ['add', '.'],
  ['commit', '-m', 'backend release fixture'],
  ['remote', 'add', 'origin', origin],
  ['push', '-u', 'origin', 'main'],
]) {
  git(args);
}
writeJson('.openxiangda/state.json', {
  version: 1,
  profiles: {
    [profileName]: {
      appType,
      resources: { forms: { customer: { formUuid: 'FORM_CUSTOMER' } } },
    },
  },
});

const readBody = request =>
  new Promise(resolve => {
    let raw = '';
    request.on('data', chunk => {
      raw += chunk;
    });
    request.on('end', () => {
      resolve(raw ? JSON.parse(raw) : {});
    });
  });

function respond(response, data, status = 200, errorCode) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.end(
    JSON.stringify(
      status >= 400
        ? { code: status, errorCode, message: data.message, data: data.data || null }
        : { code: status, data }
    )
  );
}

function baselineId() {
  return `10000000-0000-4000-8000-${
    mode === 'stale'
      ? '000000000001'
      : mode === 'success'
        ? '000000000002'
        : mode === 'noop'
          ? '000000000003'
          : '000000000004'
  }`;
}

function leaseId() {
  return `20000000-0000-4000-8000-${
    mode === 'stale'
      ? '000000000001'
      : mode === 'success'
        ? '000000000002'
        : mode === 'noop'
          ? '000000000003'
          : '000000000004'
  }`;
}

function baselineHeads() {
  return {
    Function: Object.fromEntries(
      functionCodes.map(code => [code, { headHash: `${code}:head`, fields: {} }])
    ),
    Automation: Object.fromEntries(
      automationCodes.map(code => [code, { headHash: `${code}:head`, fields: {} }])
    ),
    Workflow: Object.fromEntries(
      workflowCodes.map(code => [code, { headHash: `${code}:head`, fields: {} }])
    ),
    Runtime: {},
  };
}

function releaseResources(bodyResources) {
  return bodyResources.map(resource =>
    resource.kind === 'Function'
      ? {
          kind: 'Function',
          code: resource.code,
          action: resource.operation === 'create' ? 'create' : 'update',
          resourceId: `FUNC_${resource.code}`,
          groupId: null,
          baseRevision: resource.operation === 'create' ? null : 1,
          desired: {
            id: `FUNC_${resource.code}`,
            status: 'active',
            definitionJson:
              resource.replacement?.definitionJson ||
              (mode === 'secret-v2' && resource.code === functionCodes[0]
                ? desiredSecretFunctionDefinition(resource.code)
                : desiredFunctionDefinition(resource.code)),
            ...(resource.secretRefs ? { secretRefs: resource.secretRefs } : {}),
          },
          ...(resource.secretRefs ? { secretRefs: resource.secretRefs } : {}),
        }
      : {
          kind: 'Automation',
          code: resource.code,
          action: resource.operation === 'create' ? 'create' : 'update',
          resourceId: `AUTO_${resource.code}_V1`,
          groupId: `GROUP_${resource.code}`,
          baseMaxGroupVersion: 1,
          desired: {
            id: `AUTO_${resource.code}_V1`,
            formUuid: null,
            definitionJson:
              resource.replacement?.definitionJson ||
              desiredAutomationDefinition(resource.code),
          },
        }
  );
}

let preparedResources = [];
let preparedWorkflowResources = [];
function releaseDetail(status) {
  return {
    id: backendReleaseId,
    status,
    manifestHash: 'c'.repeat(64),
    verificationHash: status === 'prepared' ? null : 'd'.repeat(64),
    parentReleaseId,
    mode:
      mode === 'mixed-41' || mode === 'mixed-declarative-create'
        ? 'mixed'
        : ['binding-contract', 'binding-contract-mismatch'].includes(mode)
          ? 'manifest_replacement'
        : 'source_only',
    protocolVersion: 'backend_release_v2',
    postCommitStatus: 'not_required',
    resources: preparedResources,
  };
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  const body = request.method === 'GET' ? {} : await readBody(request);
  calls.push({ mode, method: request.method, path: url.pathname, body });
  const api = `/service/openxiangda-api/v1/apps/${appType}`;

  if (request.method === 'GET' && url.pathname === `${api}/secrets/capabilities`) {
    return respond(response, {
      enabled: true,
      contractVersion: 'app_function_secrets_v1',
      runtimeContractVersion: 'trusted_node_v2',
      app_function_secrets_v1: true,
      trusted_node_v2: true,
      backend_release_v2: true,
      atomic_staged_children_v2: true,
    });
  }
  if (request.method === 'GET' && url.pathname === `${api}/secrets`) {
    return respond(response, {
      items: [
        {
          name: secretName,
          status: 'active',
          revision: 1,
          activeVersion: 1,
          hasValue: true,
          referenceCount: secretRefsActivated ? 1 : 0,
          unused: !secretRefsActivated,
        },
      ],
      totalCount: 1,
    });
  }

  if (request.method === 'GET' && url.pathname === `${api}/functions`) {
    return respond(response, {
      items: functionCodes.map(functionRemote),
      totalCount: functionCodes.length,
    });
  }
  const functionDetail = url.pathname.match(new RegExp(`^${api}/functions/([^/]+)$`));
  if (request.method === 'GET' && functionDetail) {
    return respond(response, functionRemote(decodeURIComponent(functionDetail[1])));
  }
  if (request.method === 'GET' && url.pathname === `${api}/automations`) {
    return respond(response, {
      items: automationCodes.map(automationRemote),
      totalCount: automationCodes.length,
    });
  }
  const automationDetail = url.pathname.match(new RegExp(`^${api}/automations/([^/]+)$`));
  if (request.method === 'GET' && automationDetail) {
    const id = decodeURIComponent(automationDetail[1]);
    const code = automationCodes.find(item => id.includes(item));
    automationDetailInFlight += 1;
    maxAutomationDetailInFlight = Math.max(
      maxAutomationDetailInFlight,
      automationDetailInFlight
    );
    await new Promise(resolve => setTimeout(resolve, 15));
    automationDetailInFlight -= 1;
    return respond(response, automationRemote(code));
  }
  if (request.method === 'GET' && url.pathname === `${api}/workflows`) {
    return respond(response, {
      items: workflowCodes.map(workflowRemote),
      totalCount: workflowCodes.length,
    });
  }
  if (
    request.method === 'GET' &&
    url.pathname === `${api}/forms/FORM_CUSTOMER/releases/head`
  ) {
    return respond(response, {
      appType,
      formUuid: 'FORM_CUSTOMER',
      revision: stagedFormHeadRevision,
      etag: `"form-customer-r${stagedFormHeadRevision}"`,
      activeFormReleaseHead: {
        releaseId: null,
        releaseHash: null,
        revision: stagedFormHeadRevision,
      },
    });
  }
  if (
    request.method === 'GET' &&
    url.pathname ===
      `${api}/forms/FORM_CUSTOMER/releases/${stagedFormReleaseId}`
  ) {
    return respond(response, {
      id: stagedFormReleaseId,
      appType,
      formUuid: 'FORM_CUSTOMER',
      contentHash: stagedFormContentHash,
      parentReleaseId: null,
      baseRevision: 1,
      immutable: true,
      active: false,
      aborted: stagedFormAborted,
      snapshotJson: {
        form: {
          name: 'Customer',
          schema: { version: '1.0.0', componentsTree: [] },
          formType: 'process',
        },
      },
      resources: [
        {
          resourceKind: 'schema',
          resourceKey: 'schema',
          finalizedAt: '2026-07-22T00:00:00.000Z',
        },
      ],
      journal: [
        {
          action: stagedFormAborted ? 'abort' : 'stage',
        },
      ],
    });
  }
  const workflowDetail = url.pathname.match(new RegExp(`^${api}/workflows/([^/]+)$`));
  if (request.method === 'GET' && workflowDetail) {
    const id = decodeURIComponent(workflowDetail[1]);
    const code = workflowCodes.find(item => id.includes(item));
    workflowDetailInFlight += 1;
    maxWorkflowDetailInFlight = Math.max(
      maxWorkflowDetailInFlight,
      workflowDetailInFlight
    );
    await new Promise(resolve => setTimeout(resolve, 15));
    workflowDetailInFlight -= 1;
    return respond(response, workflowRemote(code));
  }
  if (request.method === 'POST' && url.pathname === `${api}/change-baselines`) {
    return respond(response, {
      baselineId: baselineId(),
      appType,
      changeId: body.changeId,
      clientSessionId: body.clientSessionId,
      sourceBase: body.sourceBase,
      headDigest: 'e'.repeat(64),
      resourceHeads: baselineHeads(),
    });
  }
  if (request.method === 'GET' && url.pathname === `${api}/snapshot`) {
    return respond(response, {
      app: { appType, updatedAt: '2026-07-15T12:00:00.000Z' },
    });
  }
  if (request.method === 'POST' && url.pathname === `${api}/publish-lease/acquire`) {
    return respond(response, {
      leaseId: leaseId(),
      appType,
      changeId: body.changeId,
      clientSessionId: body.clientSessionId,
      baseRevision: body.baseRevision,
      expiresAt: new Date(Date.now() + 1_800_000).toISOString(),
      holder: 'self',
    });
  }
  if (
    request.method === 'POST' &&
    url.pathname.startsWith(`${api}/change-baselines/`) &&
    url.pathname.endsWith('/preflight')
  ) {
    return respond(response, {
      ok: true,
      baselineId: baselineId(),
      checkedTargets: body.targets,
    });
  }
  if (
    request.method === 'POST' &&
    url.pathname.startsWith(`${api}/publish-lease/`) &&
    url.pathname.endsWith('/release')
  ) {
    return respond(response, { active: false, appType });
  }
  if (request.method === 'GET' && url.pathname === `${api}/backend-releases/head`) {
    if (mode === 'legacy') {
      return respond(response, { message: 'route not found' }, 404, 'NOT_FOUND');
    }
    return respond(response, {
      appType,
      activeBackendReleaseId: parentReleaseId,
      release: { id: parentReleaseId, status: 'active' },
    });
  }
  if (
    request.method === 'GET' &&
    url.pathname === `${api}/workflow-releases/head`
  ) {
    return respond(response, {
      appType,
      activeWorkflowReleaseId: null,
    });
  }
  if (
    request.method === 'POST' &&
    url.pathname === `${api}/workflow-releases`
  ) {
    assert.equal(body.parentReleaseId, null);
    assert.equal(body.publishLeaseId, leaseId());
    assert.equal(body.baselineId, baselineId());
    assert.ok(body.sourceRepositoryId.startsWith('sha256:'));
    if (frozenRepositoryIdentity) {
      assert.equal(
        body.sourceRepositoryId,
        frozenRepositoryIdentity.canonical
      );
      assert.ok(
        body.sourceRevision.repoAliases.includes(
          frozenRepositoryIdentity.primary
        )
      );
    }
    preparedWorkflowResources = body.resources.map(resource => ({
      code: resource.code,
      action: resource.operation,
      workflowId: `WF_RELEASE_${resource.code}`,
      formUuid: resource.formUuid,
      desiredHash: 'f'.repeat(64),
    }));
    return respond(response, {
      id: workflowReleaseId,
      status: 'prepared',
      manifestHash: 'e'.repeat(64),
      sourceRevision: body.sourceRevision,
      resources: preparedWorkflowResources,
    });
  }
  if (
    request.method === 'POST' &&
    url.pathname ===
      `${api}/workflow-releases/${workflowReleaseId}/verify`
  ) {
    assert.equal(body.manifestHash, 'e'.repeat(64));
    return respond(response, {
      id: workflowReleaseId,
      status: 'verified',
      manifestHash: 'e'.repeat(64),
      resources: preparedWorkflowResources,
    });
  }
  if (request.method === 'GET' && url.pathname === `${api}/backend-releases`) {
    return respond(response, {
      appType,
      items: [
        { id: backendReleaseId, status: activated ? 'active' : 'prepared' },
      ],
    });
  }
  if (
    request.method === 'GET' &&
    url.pathname === `${api}/backend-releases/${parentReleaseId}/diff/${backendReleaseId}`
  ) {
    return respond(response, {
      fromReleaseId: parentReleaseId,
      toReleaseId: backendReleaseId,
      resources: [],
    });
  }
  if (
    request.method === 'GET' &&
    url.pathname === `${api}/backend-releases/${backendReleaseId}`
  ) {
    return respond(response, releaseDetail(activated ? 'active' : 'prepared'));
  }
  if (request.method === 'POST' && url.pathname === `${api}/backend-releases/rollback`) {
    assert.equal(body.targetReleaseId, parentReleaseId);
    assert.equal(body.parentReleaseId, parentReleaseId);
    assert.equal(body.publishLeaseId, leaseId());
    assert.ok(body.sourceRepositoryId.startsWith('sha256:'));
    return respond(response, releaseDetail('prepared'));
  }
  if (request.method === 'POST' && url.pathname === `${api}/backend-releases`) {
    assert.equal(
      body.mode,
      mode === 'mixed-41' || mode === 'mixed-declarative-create'
        ? 'mixed'
        : ['binding-contract', 'binding-contract-mismatch'].includes(mode)
          ? 'manifest_replacement'
        : 'source_only'
    );
    if (mode !== 'commands') {
      assert.equal(body.protocolVersion, 'backend_release_v2');
    }
    assert.equal(body.parentReleaseId, parentReleaseId);
    assert.equal(body.publishLeaseId, leaseId());
    assert.equal(body.baselineId, baselineId());
    if (mode === 'mixed-41') {
      assert.equal(body.resources.length, 41);
      assert.equal(
        body.resources.filter(resource => resource.operation === 'create').length,
        17
      );
      assert.equal(
        body.resources.filter(
          resource => resource.mode === 'manifest_replacement'
        ).length,
        24
      );
      assert.equal(
        body.resources.filter(resource => resource.mode === 'source_only').length,
        17
      );
      assert.match(body.replacementReason, /approved mixed replacement/);
    } else if (mode === 'mixed-declarative-create') {
      assert.equal(body.resources.length, 9);
      assert.equal(
        body.resources.filter(resource => resource.operation === 'create').length,
        9
      );
      assert.equal(
        body.resources.filter(resource => resource.mode === 'source_only').length,
        2
      );
      assert.equal(
        body.resources.filter(
          resource => resource.mode === 'manifest_replacement'
        ).length,
        7
      );
      assert.equal(body.replacementReason, undefined);
      const functionCreate = body.resources.find(
        resource => resource.code === condolenceFunctionCode
      );
      assert.equal(functionCreate.kind, 'Function');
      assert.equal(functionCreate.mode, 'source_only');
      assert.ok(functionCreate.source.sourceFile);
      const codeAutomationCreate = body.resources.find(
        resource => resource.code === condolenceCodeAutomationCode
      );
      assert.equal(codeAutomationCreate.kind, 'Automation');
      assert.equal(codeAutomationCreate.mode, 'source_only');
      assert.equal(codeAutomationCreate.sources.length, 1);
      for (const code of condolenceDeclarativeAutomationCodes) {
        const declarativeCreate = body.resources.find(
          resource => resource.code === code
        );
        assert.equal(declarativeCreate.kind, 'Automation');
        assert.equal(declarativeCreate.mode, 'manifest_replacement');
        assert.equal(declarativeCreate.create.definitionJson.version, 'v3');
        assert.equal(declarativeCreate.sources, undefined);
        assert.equal(declarativeCreate.replacement, undefined);
      }
    } else if (
      ['binding-contract', 'binding-contract-mismatch'].includes(mode)
    ) {
      assert.equal(body.resources.length, 1);
      assert.equal(body.resources[0].kind, 'Automation');
      assert.equal(body.resources[0].code, automationCodes[0]);
      assert.equal(body.resources[0].operation, 'update');
      assert.equal(body.resources[0].mode, 'manifest_replacement');
      assert.deepEqual(
        body.resources[0].replacement.definitionJson.resourceBindings,
        {
          forms: { customer: 'FORM_CUSTOMER' },
        }
      );
      assert.match(body.replacementReason, /binding contract/);
    } else if (mode === 'secret-v2') {
      assert.equal(body.resources.length, 1);
      assert.equal(body.resources[0].kind, 'Function');
      assert.equal(body.resources[0].code, functionCodes[0]);
      assert.equal(body.resources[0].operation, 'update');
      assert.deepEqual(body.resources[0].secretRefs, secretRefs);
      assert.equal(body.resources[0].source.version, 'function_v2');
      assert.equal(
        body.resources[0].source.runtimeContractVersion,
        'trusted_node_v2'
      );
    } else if (mode === 'stage-v1' || mode === 'noop-stage') {
      assert.equal(body.resources.length, 1);
      assert.equal(body.resources[0].kind, 'Function');
    } else {
      assert.equal(body.resources.length, 99);
      assert.equal(body.resources.filter(item => item.kind === 'Function').length, 88);
      assert.equal(body.resources.filter(item => item.kind === 'Automation').length, 11);
    }
    assert.ok(body.sourceRepositoryId.startsWith('sha256:'));
    assert.equal(body.sourceRevision.repositoryId, body.sourceRepositoryId);
    if (frozenRepositoryIdentity) {
      assert.equal(
        body.sourceRepositoryId,
        frozenRepositoryIdentity.canonical
      );
      assert.ok(
        body.sourceRevision.repoAliases.includes(
          frozenRepositoryIdentity.primary
        )
      );
    }
    if (
      ![
        'mixed-41',
        'mixed-declarative-create',
        'binding-contract',
        'binding-contract-mismatch',
      ].includes(mode)
    ) {
      assert.ok(
        body.resources.every(
          resource =>
            resource.operation === 'update' && resource.mode === 'source_only'
        )
      );
      assert.equal(body.resources[0].source.sourceFile.sha256, desiredSha);
    }
    if (
      ![
        'secret-v2',
        'stage-v1',
        'noop-stage',
        'mixed-41',
        'mixed-declarative-create',
        'binding-contract',
        'binding-contract-mismatch',
      ].includes(mode)
    ) {
      assert.equal(body.resources.at(-1).sources[0].sourceFile.sha256, desiredSha);
    }
    if (mode === 'stale') {
      return respond(
        response,
        { message: 'one resource head moved' },
        409,
        'BACKEND_RESOURCE_MOVED'
      );
    }
    preparedResources = releaseResources(body.resources);
    return respond(response, releaseDetail('prepared'));
  }
  if (
    request.method === 'POST' &&
    url.pathname === `${api}/backend-releases/${backendReleaseId}/verify`
  ) {
    assert.equal(body.manifestHash, 'c'.repeat(64));
    if (mode !== 'commands') {
      assert.equal(body.protocolVersion, 'backend_release_v2');
    }
    const detail = releaseDetail('verified');
    if (mode === 'binding-contract-mismatch') {
      detail.resources = detail.resources.map(resource => ({
        ...resource,
        desired: {
          ...resource.desired,
          definitionJson: {
            ...resource.desired?.definitionJson,
            resourceBindings: {
              forms: { customer: 'FORM_WRONG' },
            },
          },
        },
      }));
    }
    return respond(response, detail);
  }
  if (
    request.method === 'POST' &&
    url.pathname === `${api}/backend-releases/${backendReleaseId}/activate`
  ) {
    activated = true;
    if (mode !== 'commands') {
      assert.equal(body.protocolVersion, 'backend_release_v2');
    }
    if (mode === 'secret-v2') {
      secretRefsActivated = true;
    }
    return respond(response, releaseDetail('active'));
  }
  if (
    request.method === 'POST' &&
    url.pathname === `${api}/backend-releases/${backendReleaseId}/abort`
  ) {
    assert.equal(body.publishLeaseId, leaseId());
    assert.equal(body.baselineId, baselineId());
    assert.equal(body.changeId, 'backend-release-commands');
    assert.ok(body.clientSessionId);
    return respond(response, { ...releaseDetail('aborted'), reason: body.reason });
  }
  if (
    request.method === 'POST' &&
    url.pathname === `${api}/backend-releases/${backendReleaseId}/post-commit/retry`
  ) {
    return respond(response, { status: 'completed', attempts: 1, failures: [] });
  }
  if (
    request.method === 'PATCH' &&
    url.pathname === `${api}/functions/${functionCodes[0]}/source` &&
    mode === 'legacy'
  ) {
    legacyFunctionSha = body.sourceFile.sha256;
    return respond(response, {
      ...functionRemote(functionCodes[0]),
      revision: 2,
      definitionJson: desiredFunctionDefinition(functionCodes[0]),
    });
  }
  return respond(
    response,
    { message: `unexpected ${request.method} ${url.pathname}` },
    500,
    'UNEXPECTED_WRITE'
  );
});

const listen = () =>
  new Promise(resolve =>
    server.listen(0, '127.0.0.1', () => resolve(server.address().port))
  );

const runCli = args =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(repoRoot, 'bin', 'openxiangda.js'), ...args],
      {
        cwd: workspace,
        env: {
          ...process.env,
          HOME: tempHome,
          CODEX_THREAD_ID: 'backend-release-cli-smoke',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, 30_000);
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr, timedOut });
    });
  });

const publishArgs = selectors => [
  'resource',
  'publish',
  ...(selectors ? ['--only', selectors] : ['--all']),
  '--profile',
  profileName,
  '--sdd-bypass',
  '--reason',
  'approved backend release smoke scope',
  '--json',
];

async function beginRelease(changeId) {
  frozenRepositoryIdentity = null;
  const begun = await runCli([
    'release',
    'begin',
    '--change',
    changeId,
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(begun.code, 0, begun.stderr || begun.stdout);
  return JSON.parse(begun.stdout);
}

function freezeBaselineToRepositoryAlias() {
  const stateFile = path.join(workspace, '.openxiangda', 'state.json');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const baseline =
    state.profiles?.[profileName]?.promotion?.changeBaseline;
  const revision = baseline?.releaseSourceRevision;
  const primary = revision?.repositoryId || revision?.repo;
  const canonical = revision?.repoAliases?.find(alias => alias !== primary);
  assert.ok(canonical, 'release fixture must expose a repository alias');
  baseline.sourceBase.repo = canonical;
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
  frozenRepositoryIdentity = { canonical, primary };
  return frozenRepositoryIdentity;
}

async function endRelease() {
  const ended = await runCli(['release', 'end', '--profile', profileName, '--json']);
  assert.equal(ended.code, 0, ended.stderr || ended.stdout);
}

try {
  const port = await listen();
  fs.writeFileSync(
    path.join(tempHome, '.openxiangda', 'profiles.json'),
    `${JSON.stringify(
      {
        version: 1,
        currentProfile: profileName,
        profiles: {
          [profileName]: {
            baseUrl: `http://127.0.0.1:${port}/service`,
            token: { accessToken: 'test-token' },
          },
        },
      },
      null,
      2
    )}\n`
  );

  await beginRelease('backend-release-stale');
  const stale = await runCli(publishArgs());
  assert.notEqual(stale.code, 0);
  assert.match(stale.stderr, /BACKEND_RESOURCE_MOVED|resource head moved/i);
  assert.equal(
    calls.filter(
      call =>
        call.mode === 'stale' &&
        (/\/source$/.test(call.path) || /\/verify$|\/activate$/.test(call.path))
    ).length,
    0,
    'stale prepare must cause zero sequential writes and no verify/activate'
  );
  await endRelease();

  mode = 'stage-v1';
  activated = false;
  await beginRelease('backend-release-v1-stage');
  const v1StageStart = calls.length;
  const v1Staged = await runCli([
    'resource',
    'publish',
    'function',
    '--only',
    functionCodes[0],
    '--stage-only',
    '--profile',
    profileName,
    '--sdd-bypass',
    '--reason',
    'approved v1 backend stage smoke',
    '--json',
  ]);
  assert.equal(v1Staged.code, 0, v1Staged.stderr || v1Staged.stdout);
  const v1StagedResult = JSON.parse(v1Staged.stdout);
  assert.equal(v1StagedResult.backendRelease.status, 'verified');
  assert.equal(
    v1StagedResult.backendRelease.protocolVersion,
    'backend_release_v2'
  );
  assert.equal(
    v1StagedResult.backendRelease.stagedResource.identity.releaseId,
    backendReleaseId
  );
  assert.equal(
    calls
      .slice(v1StageStart)
      .filter(call => call.path.endsWith(`/${backendReleaseId}/activate`))
      .length,
    0
  );
  await endRelease();

  // One v2 child must stage a realistic mixed batch: 17 new Functions plus
  // 13 existing Function and 11 existing Automation manifest replacements.
  const newFunctionCodes = Array.from(
    { length: 17 },
    (_, index) => `new_function_${String(index + 1).padStart(2, '0')}`
  );
  for (const code of newFunctionCodes) {
    writeJson(`src/resources/functions/${code}.json`, {
      code,
      name: code,
      description: '',
      definitionJson: desiredSecretFunctionDefinition(code),
      status: 'active',
    });
  }
  for (const args of [
    ['add', 'src/resources/functions'],
    ['commit', '-m', 'add mixed backend release create fixtures'],
    ['push', 'origin', 'main'],
  ]) {
    git(args);
  }
  mode = 'mixed-41';
  activated = false;
  await beginRelease('backend-release-mixed-41-stage');
  const mixedStart = calls.length;
  const mixedSelectors = [
    ...newFunctionCodes.map(code => `function:${code}`),
    ...functionCodes.slice(0, 13).map(code => `function:${code}`),
    ...automationCodes.map(code => `automation:${code}`),
  ];
  const mixed = await runCli([
    'resource',
    'publish',
    'function,automation',
    '--only',
    mixedSelectors.join(','),
    '--stage-only',
    '--replace-manifest',
    '--profile',
    profileName,
    '--sdd-bypass',
    '--reason',
    'approved mixed replacement smoke scope',
    '--json',
  ]);
  assert.equal(mixed.code, 0, mixed.stderr || mixed.stdout);
  const mixedResult = JSON.parse(mixed.stdout);
  assert.equal(mixedResult.backendRelease.status, 'verified');
  assert.equal(mixedResult.backendRelease.mode, 'mixed');
  assert.equal(mixedResult.backendRelease.resourceCount, 41);
  assert.equal(mixedResult.handledSelectors.length, 41);
  assert.equal(mixedResult.stagedResource.identity.releaseId, backendReleaseId);
  assert.equal(mixedResult.stagedResource.hash, 'c'.repeat(64));
  assert.equal(
    mixedResult.stagedResourcesFile,
    '.openxiangda/releases/backend-release-mixed-41-stage/staged-resources.json'
  );
  const collectedMixedResources = JSON.parse(
    fs.readFileSync(
      path.join(workspace, mixedResult.stagedResourcesFile),
      'utf8'
    )
  );
  assert.equal(collectedMixedResources.length, 1);
  assert.equal(collectedMixedResources[0].kind, 'BackendRelease');
  assert.equal(
    mixedResult.stagedResource.metadata.parentReleaseId,
    parentReleaseId
  );
  assert.equal(
    calls
      .slice(mixedStart)
      .filter(call => call.path === `${`/service/openxiangda-api/v1/apps/${appType}`}/backend-releases`)
      .length,
    1,
    'mixed 41 resources must prepare one Backend child'
  );
  assert.equal(
    calls
      .slice(mixedStart)
      .filter(
        call =>
          /\/backend-releases\/[^/]+\/activate$/.test(call.path) ||
          /\/(functions|automations)\/[^/]+(?:\/source)?$/.test(call.path) &&
            call.method !== 'GET'
      ).length,
    0,
    'mixed stage-only must not activate or fall back to direct writes'
  );
  await endRelease();
  fs.rmSync(path.join(workspace, 'src', 'resources', 'functions', 'new_function_01.json'));
  for (const code of newFunctionCodes.slice(1)) {
    fs.rmSync(path.join(workspace, 'src', 'resources', 'functions', `${code}.json`));
  }
  for (const args of [
    ['add', '-A'],
    ['commit', '-m', 'remove mixed backend release create fixtures'],
    ['push', 'origin', 'main'],
  ]) {
    git(args);
  }

  // A source Function, a code Automation, and seven source-free declarative
  // Automations must freeze into one verified mixed Backend Release child.
  writeJson(`src/resources/functions/${condolenceFunctionCode}.json`, {
    code: condolenceFunctionCode,
    name: condolenceFunctionCode,
    description: '',
    definitionJson: desiredSecretFunctionDefinition(condolenceFunctionCode),
    status: 'active',
  });
  writeJson(
    `src/resources/automations/${condolenceCodeAutomationCode}.json`,
    {
      code: condolenceCodeAutomationCode,
      name: condolenceCodeAutomationCode,
      description: '',
      triggerConfig: { mode: 'event' },
      definitionJson: desiredAutomationDefinition(
        condolenceCodeAutomationCode
      ),
      publish: false,
      enable: true,
    }
  );
  for (const code of condolenceDeclarativeAutomationCodes) {
    const isProcess = code.includes('_process_');
    writeJson(`src/resources/automations/${code}.json`, {
      code,
      name: code,
      description: '',
      triggerConfig: {
        version: 'trigger_v2',
        mode: 'event',
        enabled: true,
        appType,
        event: {
          source: isProcess ? 'workflow_process' : 'workflow_task',
          action: code.split('_').at(-1),
        },
      },
      definitionJson: desiredDeclarativeAutomationDefinition(code),
      publish: false,
      enable: true,
    });
  }
  for (const args of [
    ['add', 'src/resources/functions', 'src/resources/automations'],
    ['commit', '-m', 'add declarative backend create fixtures'],
    ['push', 'origin', 'main'],
  ]) {
    git(args);
  }
  mode = 'mixed-declarative-create';
  activated = false;
  await beginRelease('backend-release-mixed-declarative-create');
  freezeBaselineToRepositoryAlias();
  const declarativeStart = calls.length;
  const condolenceSelectors = [
    `function:${condolenceFunctionCode}`,
    `automation:${condolenceCodeAutomationCode}`,
    ...condolenceDeclarativeAutomationCodes.map(code => `automation:${code}`),
  ];
  const declarativeMixed = await runCli([
    'resource',
    'publish',
    'function,automation',
    '--only',
    condolenceSelectors.join(','),
    '--stage-only',
    '--profile',
    profileName,
    '--sdd-bypass',
    '--reason',
    'approved declarative backend create smoke scope',
    '--json',
  ]);
  assert.equal(
    declarativeMixed.code,
    0,
    declarativeMixed.stderr || declarativeMixed.stdout
  );
  const declarativeMixedResult = JSON.parse(declarativeMixed.stdout);
  assert.equal(declarativeMixedResult.backendRelease.status, 'verified');
  assert.equal(declarativeMixedResult.backendRelease.mode, 'mixed');
  assert.equal(declarativeMixedResult.backendRelease.resourceCount, 9);
  assert.deepEqual(
    declarativeMixedResult.backendRelease.handledSelectors,
    condolenceSelectors.slice().sort()
  );
  assert.equal(
    calls
      .slice(declarativeStart)
      .filter(call => call.path === `${`/service/openxiangda-api/v1/apps/${appType}`}/backend-releases`)
      .length,
    1,
    'declarative creates must prepare one Backend child'
  );
  assert.equal(
    calls
      .slice(declarativeStart)
      .filter(call => /\/backend-releases\/[^/]+\/activate$/.test(call.path))
      .length,
    0,
    'declarative stage-only must not activate the Backend child'
  );
  await endRelease();

  const invalidDeclarativeCode = 'condolence_invalid_declarative_create';
  writeJson(`src/resources/automations/${invalidDeclarativeCode}.json`, {
    code: invalidDeclarativeCode,
    name: invalidDeclarativeCode,
    triggerConfig: {
      version: 'trigger_v2',
      mode: 'event',
      event: { source: 'workflow_process', action: 'approved' },
    },
    definitionJson: { version: 'v3', nodes: [], edges: [] },
  });
  for (const args of [
    ['add', `src/resources/automations/${invalidDeclarativeCode}.json`],
    ['commit', '-m', 'add invalid declarative backend fixture'],
    ['push', 'origin', 'main'],
  ]) {
    git(args);
  }
  mode = 'invalid-declarative-create';
  await beginRelease('backend-release-invalid-declarative-create');
  const invalidStart = calls.length;
  const invalidDeclarative = await runCli([
    'resource',
    'publish',
    'automation',
    '--only',
    invalidDeclarativeCode,
    '--stage-only',
    '--profile',
    profileName,
    '--sdd-bypass',
    '--reason',
    'approved invalid declarative backend smoke scope',
    '--json',
  ]);
  assert.notEqual(invalidDeclarative.code, 0);
  assert.match(
    invalidDeclarative.stderr,
    /既不包含可发布的源码快照.*definitionJson\.version=v3/
  );
  assert.equal(
    calls
      .slice(invalidStart)
      .filter(call => call.path === `${`/service/openxiangda-api/v1/apps/${appType}`}/backend-releases`)
      .length,
    0,
    'invalid declarative create must fail before Backend Release prepare'
  );
  await endRelease();

  fs.rmSync(
    path.join(
      workspace,
      'src',
      'resources',
      'functions',
      `${condolenceFunctionCode}.json`
    )
  );
  for (const code of [
    condolenceCodeAutomationCode,
    ...condolenceDeclarativeAutomationCodes,
    invalidDeclarativeCode,
  ]) {
    fs.rmSync(
      path.join(workspace, 'src', 'resources', 'automations', `${code}.json`)
    );
  }
  for (const args of [
    ['add', '-A'],
    ['commit', '-m', 'remove declarative backend create fixtures'],
    ['push', 'origin', 'main'],
  ]) {
    git(args);
  }

  mode = 'success';
  await beginRelease('backend-release-success');
  const success = await runCli(publishArgs());
  assert.equal(success.code, 0, success.stderr || success.stdout);
  const successResult = JSON.parse(success.stdout);
  assert.equal(successResult.backendRelease.resourceCount, 99);
  assert.equal(successResult.backendRelease.updateCount, 99);
  assert.equal(successResult.published.length, 99);
  assert.ok(
    successResult.published.every(
      item => item.sourcePatchTransport === 'backend-release'
    )
  );
  assert.equal(
    calls.filter(
      call => call.mode === 'success' && call.path === `/service/openxiangda-api/v1/apps/${appType}/backend-releases`
    ).length,
    1,
    '88 Function + 11 Automation must use one prepare request'
  );
  assert.equal(
    calls.filter(
      call =>
        call.mode === 'success' &&
        (/\/functions\/[^/]+\/source$/.test(call.path) ||
          /\/automations\/[^/]+\/source$/.test(call.path))
    ).length,
    0,
    'atomic success must not issue per-resource source writes'
  );
  assert.equal(
    calls.filter(
      call =>
        call.mode === 'success' &&
        /\/functions\/function_[^/]+$/.test(call.path)
    ).length,
    0,
    'full Function list rows must avoid 88 redundant detail requests'
  );
  assert.ok(
    maxAutomationDetailInFlight > 1,
    'Automation detail planning should use bounded concurrency'
  );
  assert.ok(
    maxAutomationDetailInFlight <= 8,
    'Automation detail planning must stay within the concurrency limit'
  );
  assert.equal(
    calls.filter(
      call =>
        call.mode === 'success' &&
        /\/automations\/[^/]+\/(publish|enable|disable)$/.test(call.path)
    ).length,
    0,
    'already-matching publish/enable flags must not create state writes'
  );
  const state = JSON.parse(
    fs.readFileSync(path.join(workspace, '.openxiangda', 'state.json'), 'utf8')
  );
  assert.equal(
    state.profiles[profileName].resources.functions[functionCodes[0]].revision,
    2
  );
  assert.equal(
    state.profiles[profileName].resources.automations[automationCodes[0]].version,
    2
  );
  assert.equal(
    state.profiles[profileName].resources.automations[automationCodes[0]].automationId,
    `AUTO_${automationCodes[0]}_V2`
  );
  await endRelease();

  mode = 'noop';
  await beginRelease('backend-release-noop');
  const noopCallStart = calls.length;
  const noop = await runCli(publishArgs());
  assert.equal(noop.code, 0, noop.stderr || noop.stdout);
  const noopResult = JSON.parse(noop.stdout);
  assert.equal(noopResult.published.length, 99);
  assert.ok(noopResult.published.every(item => item.action === 'noop'));
  assert.equal(
    calls
      .slice(noopCallStart)
      .filter(
        call =>
          call.method !== 'GET' &&
          (/backend-releases/.test(call.path) || /\/source$/.test(call.path))
      ).length,
    0,
    'planned noops must not touch Backend Release or resource write endpoints'
  );
  await endRelease();

  const includeNoopWithoutStage = await runCli([
    'resource',
    'publish',
    'function',
    '--only',
    functionCodes[0],
    '--include-noop',
    '--profile',
    profileName,
    '--sdd-bypass',
    '--reason',
    'approved include noop scope validation smoke',
    '--json',
  ]);
  assert.notEqual(includeNoopWithoutStage.code, 0);
  assert.match(
    includeNoopWithoutStage.stderr,
    /--include-noop 仅允许与 --stage-only 一起使用/
  );

  mode = 'noop-stage';
  await beginRelease('backend-release-noop-stage');
  const noopStageStart = calls.length;
  const noopStaged = await runCli([
    'resource',
    'publish',
    'function',
    '--only',
    functionCodes[0],
    '--stage-only',
    '--include-noop',
    '--profile',
    profileName,
    '--sdd-bypass',
    '--reason',
    'approved immutable noop backend stage smoke',
    '--json',
  ]);
  assert.equal(noopStaged.code, 0, noopStaged.stderr || noopStaged.stdout);
  const noopStagedResult = JSON.parse(noopStaged.stdout);
  assert.equal(noopStagedResult.backendRelease.status, 'verified');
  assert.deepEqual(
    noopStagedResult.backendRelease.handledSelectors,
    [`function:${functionCodes[0]}`]
  );
  assert.equal(
    calls
      .slice(noopStageStart)
      .filter(call => call.method === 'POST' && call.path.endsWith('/backend-releases'))
      .length,
    1,
    'include-noop stage must prepare one immutable Backend Release'
  );
  assert.equal(
    calls
      .slice(noopStageStart)
      .filter(call => call.path.endsWith(`/${backendReleaseId}/activate`))
      .length,
    0,
    'include-noop stage must not activate before Root App activation'
  );
  await endRelease();

  mode = 'legacy';
  activated = true;
  legacyFunctionSha = beforeSha;
  await beginRelease('backend-release-legacy');
  const legacy = await runCli([
    'resource',
    'publish',
    'function',
    '--only',
    functionCodes[0],
    '--stage-only',
    '--profile',
    profileName,
    '--sdd-bypass',
    '--reason',
    'approved legacy stage fail closed smoke',
    '--json',
  ]);
  assert.notEqual(legacy.code, 0, legacy.stdout);
  assert.match(
    legacy.stderr,
    /BACKEND_RELEASE_V2_REQUIRED|必须支持 Backend Release v2/
  );
  assert.equal(
    calls.filter(
      call => call.mode === 'legacy' && call.path.endsWith('/source')
    ).length,
    0,
    '404 feature absence must fail closed without compatibility source PATCH'
  );
  await endRelease();

  mode = 'commands';
  await beginRelease('backend-release-commands');
  const head = await runCli(['release', 'backend-head', '--profile', profileName, '--json']);
  assert.equal(head.code, 0, head.stderr || head.stdout);
  assert.equal(JSON.parse(head.stdout).activeBackendReleaseId, parentReleaseId);
  const list = await runCli(['release', 'backend-list', '--limit', '5', '--profile', profileName, '--json']);
  assert.equal(list.code, 0, list.stderr || list.stdout);
  assert.equal(JSON.parse(list.stdout).items[0].id, backendReleaseId);
  const detail = await runCli(['release', 'backend-detail', backendReleaseId, '--profile', profileName, '--json']);
  assert.equal(detail.code, 0, detail.stderr || detail.stdout);
  assert.equal(JSON.parse(detail.stdout).id, backendReleaseId);
  const diff = await runCli(['release', 'backend-diff', parentReleaseId, backendReleaseId, '--profile', profileName, '--json']);
  assert.equal(diff.code, 0, diff.stderr || diff.stdout);
  assert.equal(JSON.parse(diff.stdout).toReleaseId, backendReleaseId);
  const aborted = await runCli(['release', 'backend-abort', backendReleaseId, '--reason', 'cancel smoke release', '--profile', profileName, '--json']);
  assert.equal(aborted.code, 0, aborted.stderr || aborted.stdout);
  assert.equal(JSON.parse(aborted.stdout).status, 'aborted');
  const retried = await runCli(['release', 'backend-retry', backendReleaseId, '--profile', profileName, '--json']);
  assert.equal(retried.code, 0, retried.stderr || retried.stdout);
  assert.equal(JSON.parse(retried.stdout).status, 'completed');
  const rolledBack = await runCli([
    'release',
    'backend-rollback',
    parentReleaseId,
    '--change',
    'backend-release-commands',
    '--reason',
    'restore reviewed historical backend release',
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(rolledBack.code, 0, rolledBack.stderr || rolledBack.stdout);
  assert.equal(JSON.parse(rolledBack.stdout).status, 'active');
  await endRelease();

  // A v2 Backend Release can remain verified so a Root App Release activates
  // it together with staged Runtime/Page/Form children. It must not be
  // activated early or mislabeled after activation.
  mode = 'secret-v2';
  activated = false;
  secretRefsActivated = false;
  writeJson(`src/resources/functions/${functionCodes[0]}.json`, {
    code: functionCodes[0],
    name: functionCodes[0],
    description: '',
    secretRefs,
    definitionJson: desiredSecretFunctionDefinition(functionCodes[0]),
    status: 'active',
  });
  for (const args of [
    ['add', `src/resources/functions/${functionCodes[0]}.json`],
    ['commit', '-m', 'stage trusted node v2 secret function'],
    ['push', 'origin', 'main'],
  ]) {
    git(args);
  }
  await beginRelease('backend-release-secret-stage');
  const stageStart = calls.length;
  const staged = await runCli([
    'resource',
    'publish',
    'function',
    '--only',
    functionCodes[0],
    '--stage-only',
    '--profile',
    profileName,
    '--sdd-bypass',
    '--reason',
    'approved verified backend stage smoke',
    '--json',
  ]);
  assert.equal(staged.code, 0, staged.stderr || staged.stdout);
  const stagedResult = JSON.parse(staged.stdout);
  assert.equal(stagedResult.backendRelease.status, 'verified');
  assert.equal(
    stagedResult.backendRelease.protocolVersion,
    'backend_release_v2'
  );
  assert.equal(
    stagedResult.backendRelease.stagedResource.identity.releaseId,
    backendReleaseId
  );
  assert.equal(stagedResult.backendRelease.activeResource, undefined);
  assert.equal(stagedResult.published[0].activation, 'staged');
  assert.equal(stagedResult.published[0].writeMode, 'backend-release-stage');
  assert.equal(secretRefsActivated, false);
  assert.equal(
    calls
      .slice(stageStart)
      .filter(call => call.path.endsWith(`/${backendReleaseId}/activate`))
      .length,
    0,
    'stage-only must not activate Backend Release before Root App activation'
  );
  assert.equal(
    calls
      .slice(stageStart)
      .filter(call => /\/functions\/[^/]+\/source$/.test(call.path)).length,
    0,
    'stage-only must not fall back to direct Function source PATCH'
  );
  await endRelease();

  activated = false;
  secretRefsActivated = false;
  await beginRelease('backend-release-secret-direct-activate');
  const activeStart = calls.length;
  const directlyActivated = await runCli([
    'resource',
    'publish',
    'function',
    '--only',
    functionCodes[0],
    '--profile',
    profileName,
    '--sdd-bypass',
    '--reason',
    'approved direct backend activation compatibility smoke',
    '--json',
  ]);
  assert.equal(
    directlyActivated.code,
    0,
    directlyActivated.stderr || directlyActivated.stdout
  );
  const activeResult = JSON.parse(directlyActivated.stdout);
  assert.equal(activeResult.backendRelease.status, 'active');
  assert.equal(
    activeResult.backendRelease.activeResource.identity.releaseId,
    backendReleaseId
  );
  assert.equal(activeResult.backendRelease.stagedResource, undefined);
  assert.equal(secretRefsActivated, true);
  assert.equal(
    calls
      .slice(activeStart)
      .filter(call => call.path.endsWith(`/${backendReleaseId}/activate`))
      .length,
    1
  );
  await endRelease();

  for (const code of workflowCodes) {
    writeJson(`src/resources/workflows/${code}/workflow.json`, {
      code,
      formCode: 'customer',
      kind: 'workflow_v3',
      definitionFile: 'definition.v3.json',
    });
    writeJson(`src/resources/workflows/${code}/definition.v3.json`, {
      version: 'v3',
      nodes: [{ id: `${code}_start`, type: 'start', data: {} }],
      edges: [],
    });
  }
  write(
    'src/forms/customer/schema.ts',
    `export default { formMeta: { formUuid: 'FORM_CUSTOMER', appType: '${appType}', title: 'Customer', formType: 'process' }, fields: [] };\n`
  );
  git(['add', 'src/resources/workflows', 'src/forms/customer/schema.ts']);
  git(['commit', '-m', 'add workflow release fixtures']);
  git(['push']);

  const stagedFormChange = 'workflow-staged-form-compat';
  writeJson(
    `.openxiangda/releases/${stagedFormChange}/staged-resources.json`,
    [
      {
        kind: 'FormRelease',
        identity: {
          releaseId: stagedFormReleaseId,
          formUuid: 'FORM_CUSTOMER',
        },
        action: 'update',
        hash: stagedFormContentHash,
        revision: { parentReleaseId: null, baseRevision: 1 },
        metadata: { formCode: 'customer', releaseStatus: 'staged' },
      },
    ]
  );
  writeJson(
    `.openxiangda/releases/${stagedFormChange}/staged-resources.context.json`,
    {
      contractVersion: 'staged_resources_context_v1',
      appType,
      profile: profileName,
      changeId: stagedFormChange,
      deploymentId: null,
      baselineId: '00000000-0000-4000-8000-000000000099',
      clientSessionId: 'stale-session',
    }
  );
  const stagedWorkflowPlanArgs = [
    'resource',
    'plan',
    'workflow',
    '--only',
    workflowCodes[0],
    '--change',
    stagedFormChange,
    '--profile',
    profileName,
    '--json',
  ];
  const stagedWorkflowPlan = await runCli(stagedWorkflowPlanArgs);
  assert.equal(
    stagedWorkflowPlan.code,
    0,
    stagedWorkflowPlan.stderr || stagedWorkflowPlan.stdout
  );
  assert.equal(
    JSON.parse(stagedWorkflowPlan.stdout).actions[0]?.kind,
    'workflow'
  );

  const stagedResourcesPath = path.join(
    workspace,
    '.openxiangda',
    'releases',
    stagedFormChange,
    'staged-resources.json'
  );
  const validStagedResources = JSON.parse(
    fs.readFileSync(stagedResourcesPath, 'utf8')
  );
  fs.rmSync(stagedResourcesPath);
  const missingStagedPlan = await runCli(stagedWorkflowPlanArgs);
  assert.notEqual(missingStagedPlan.code, 0);
  assert.match(
    missingStagedPlan.stderr,
    /本地 schema 尚未同步/
  );
  writeJson(
    `.openxiangda/releases/${stagedFormChange}/staged-resources.json`,
    validStagedResources
  );

  writeJson(
    `.openxiangda/releases/${stagedFormChange}/staged-resources.json`,
    [
      {
        ...validStagedResources[0],
        hash: '8'.repeat(64),
      },
    ]
  );
  const hashConflictPlan = await runCli(stagedWorkflowPlanArgs);
  assert.notEqual(hashConflictPlan.code, 0);
  assert.match(hashConflictPlan.stderr, /FORM_RELEASE_REUSE_HASH_MISMATCH/);
  writeJson(
    `.openxiangda/releases/${stagedFormChange}/staged-resources.json`,
    validStagedResources
  );

  writeJson(
    `.openxiangda/releases/${stagedFormChange}/staged-resources.json`,
    [
      {
        ...validStagedResources[0],
        revision: { parentReleaseId: null, baseRevision: 2 },
      },
    ]
  );
  const revisionConflictPlan = await runCli(stagedWorkflowPlanArgs);
  assert.notEqual(revisionConflictPlan.code, 0);
  assert.match(
    revisionConflictPlan.stderr,
    /FORM_RELEASE_REUSE_REVISION_MISMATCH/
  );
  writeJson(
    `.openxiangda/releases/${stagedFormChange}/staged-resources.json`,
    validStagedResources
  );

  stagedFormAborted = true;
  const abortedPlan = await runCli(stagedWorkflowPlanArgs);
  assert.notEqual(abortedPlan.code, 0);
  assert.match(abortedPlan.stderr, /FORM_RELEASE_REUSE_STATE_INVALID/);
  stagedFormAborted = false;

  stagedFormHeadRevision = 2;
  const parentConflictPlan = await runCli(stagedWorkflowPlanArgs);
  assert.notEqual(parentConflictPlan.code, 0);
  assert.match(parentConflictPlan.stderr, /FORM_RELEASE_REUSE_PARENT_CONFLICT/);
  stagedFormHeadRevision = 1;

  const reusedRelease = await beginRelease(stagedFormChange);
  assert.deepEqual(
    reusedRelease.reusedStagedFormReleases?.map(item => item.releaseId),
    [stagedFormReleaseId]
  );
  const reboundResources = JSON.parse(
    fs.readFileSync(stagedResourcesPath, 'utf8')
  );
  assert.equal(
    reboundResources[0]?.identity?.releaseId,
    stagedFormReleaseId
  );
  const reboundContext = JSON.parse(
    fs.readFileSync(
      path.join(
        workspace,
        '.openxiangda',
        'releases',
        stagedFormChange,
        'staged-resources.context.json'
      ),
      'utf8'
    )
  );
  assert.equal(reboundContext.baselineId, baselineId());
  assert.equal(
    reboundContext.reusedStagedFormReleases?.[0]?.releaseId,
    stagedFormReleaseId
  );
  await endRelease();

  const stateFile = path.join(workspace, '.openxiangda', 'state.json');
  const syncedState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  syncedState.profiles[profileName].resources.forms.customer.schemaSyncedAt =
    '2026-07-22T00:00:00.000Z';
  fs.writeFileSync(stateFile, `${JSON.stringify(syncedState, null, 2)}\n`);

  const concurrencyPlan = await runCli([
    'resource',
    'plan',
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(
    concurrencyPlan.code,
    0,
    concurrencyPlan.stderr || concurrencyPlan.stdout
  );
  assert.equal(
    JSON.parse(concurrencyPlan.stdout).actions.filter(
      action => action.kind === 'workflow'
    ).length,
    workflowCodes.length
  );
  assert.ok(
    maxWorkflowDetailInFlight > 1 && maxWorkflowDetailInFlight <= 8,
    'Workflow detail planning should run concurrently within the limit'
  );
  assert.equal(
    calls.some(call => call.path === `/service/openxiangda-api/v1/apps/${appType}/snapshot`),
    false,
    'release acquisition must not fetch the heavyweight app snapshot'
  );

  await beginRelease('workflow-release-stage');
  freezeBaselineToRepositoryAlias();
  const workflowStageStart = calls.length;
  const workflowStaged = await runCli([
    'resource',
    'publish',
    'workflow',
    '--only',
    workflowCodes.join(','),
    '--stage-only',
    '--profile',
    profileName,
    '--sdd-bypass',
    '--reason',
    'approved immutable workflow stage smoke',
    '--json',
  ]);
  assert.equal(
    workflowStaged.code,
    0,
    workflowStaged.stderr || workflowStaged.stdout
  );
  const workflowStageResult = JSON.parse(workflowStaged.stdout);
  assert.equal(workflowStageResult.workflowRelease.status, 'verified');
  assert.equal(
    workflowStageResult.workflowRelease.stagedResource.kind,
    'WorkflowRelease'
  );
  assert.equal(
    workflowStageResult.workflowRelease.stagedResource.identity.releaseId,
    workflowReleaseId
  );
  assert.equal(
    workflowStageResult.workflowRelease.handledSelectors.length,
    workflowCodes.length
  );
  assert.deepEqual(
    workflowStageResult.workflowRelease.handledSelectors,
    workflowCodes.map(code => `workflow:${code}`).sort()
  );
  const workflowStageCalls = calls.slice(workflowStageStart);
  assert.deepEqual(
    workflowStageCalls
      .filter(call => /\/workflow-releases(?:\/|$)/.test(call.path))
      .map(call => call.method),
    ['GET', 'POST', 'POST'],
    'Workflow stage-only must use only head, prepare, and verify'
  );
  assert.equal(
    workflowStageCalls.filter(
      call =>
        call.method !== 'GET' &&
        /\/workflows(?:\/|$)/.test(call.path)
    ).length,
    0,
    'Workflow stage-only must never fall back to live workflow mutation'
  );
  await endRelease();

  const bindingAutomationCode = automationCodes[0];
  writeJson(`src/resources/automations/${bindingAutomationCode}.json`, {
    code: bindingAutomationCode,
    name: bindingAutomationCode,
    description: '',
    triggerConfig: { mode: 'event' },
    resources: { forms: ['customer'] },
    definitionJson: {
      ...desiredAutomationDefinition(bindingAutomationCode),
      resources: { forms: ['customer'] },
    },
    publish: true,
    enable: true,
  });
  for (const args of [
    ['add', `src/resources/automations/${bindingAutomationCode}.json`],
    ['commit', '-m', 'add binding contract fixture'],
    ['push', 'origin', 'main'],
  ]) {
    git(args);
  }

  mode = 'binding-contract';
  activated = false;
  const bindingPlan = await runCli([
    'resource',
    'plan',
    'automation',
    '--only',
    bindingAutomationCode,
    '--profile',
    profileName,
    '--json',
  ]);
  assert.equal(
    bindingPlan.code,
    0,
    bindingPlan.stderr || bindingPlan.stdout
  );
  const bindingPlanAction = JSON.parse(bindingPlan.stdout).actions.find(
    action =>
      action.kind === 'automation' &&
      action.code === bindingAutomationCode
  );
  assert.equal(bindingPlanAction.action, 'update');
  assert.equal(bindingPlanAction.manifestReplacementRequired, true);
  assert.equal(
    bindingPlanAction.requiredPublishMode,
    'manifest_replacement'
  );
  assert.deepEqual(
    bindingPlanAction.resourceBindingContract.differences,
    ['forms.missing=[customer]']
  );

  await beginRelease('backend-binding-contract-guard');
  const guardStart = calls.length;
  const guarded = await runCli([
    'resource',
    'publish',
    'automation',
    '--only',
    bindingAutomationCode,
    '--stage-only',
    '--profile',
    profileName,
    '--sdd-bypass',
    '--reason',
    'approved binding contract guard smoke',
    '--json',
  ]);
  assert.notEqual(guarded.code, 0, guarded.stdout);
  assert.match(
    guarded.stderr,
    /RESOURCE_MANIFEST_REPLACEMENT_REQUIRED.*resourceBindings/
  );
  assert.equal(
    calls
      .slice(guardStart)
      .filter(
        call =>
          call.method === 'POST' &&
          call.path.endsWith('/backend-releases')
      ).length,
    0,
    'binding drift must fail before Backend Release prepare'
  );
  await endRelease();

  await beginRelease('backend-binding-contract-v2-authoritative-stage');
  activated = false;
  const deliveryV2AuthoritativeStage = await runCli([
    'resource',
    'publish',
    'automation',
    '--only',
    bindingAutomationCode,
    '--stage-only',
    '--replace-manifest',
    '--profile',
    profileName,
    '--sdd-bypass',
    '--reason',
    `Delivery V2 sealed package ${'f'.repeat(64)} authoritative binding contract replacement`,
    '--json',
  ]);
  assert.equal(
    deliveryV2AuthoritativeStage.code,
    0,
    deliveryV2AuthoritativeStage.stderr ||
      deliveryV2AuthoritativeStage.stdout
  );
  const deliveryV2AuthoritativeStageResult = JSON.parse(
    deliveryV2AuthoritativeStage.stdout
  );
  assert.equal(
    deliveryV2AuthoritativeStageResult.backendRelease.status,
    'verified'
  );
  assert.equal(
    deliveryV2AuthoritativeStageResult.backendRelease.mode,
    'manifest_replacement'
  );
  assert.equal(
    deliveryV2AuthoritativeStageResult.stagedResource.kind,
    'BackendRelease'
  );
  assert.equal(
    deliveryV2AuthoritativeStageResult.backendRelease.bindingVerification
      .status,
    'passed'
  );
  assert.equal(
    activated,
    false,
    'Delivery V2 authoritative Backend stage must remain verified until app-finalize'
  );
  await endRelease();

  await beginRelease('backend-binding-contract-replacement');
  const replacement = await runCli([
    'resource',
    'publish',
    'automation',
    '--only',
    bindingAutomationCode,
    '--replace-manifest',
    '--profile',
    profileName,
    '--sdd-bypass',
    '--reason',
    'approved binding contract replacement smoke',
    '--json',
  ]);
  assert.equal(
    replacement.code,
    0,
    replacement.stderr || replacement.stdout
  );
  const replacementResult = JSON.parse(replacement.stdout);
  assert.equal(
    replacementResult.backendRelease.mode,
    'manifest_replacement'
  );
  assert.equal(
    replacementResult.backendRelease.bindingVerification.status,
    'passed'
  );
  assert.equal(
    replacementResult.backendRelease.bindingVerification.checkedResourceCount,
    1
  );
  await endRelease();

  mode = 'binding-contract-mismatch';
  activated = false;
  await beginRelease('backend-binding-contract-verify-mismatch');
  const mismatchStart = calls.length;
  const mismatchedVerifiedBinding = await runCli([
    'resource',
    'publish',
    'automation',
    '--only',
    bindingAutomationCode,
    '--replace-manifest',
    '--profile',
    profileName,
    '--sdd-bypass',
    '--reason',
    'approved binding contract mismatch smoke',
    '--json',
  ]);
  assert.notEqual(
    mismatchedVerifiedBinding.code,
    0,
    mismatchedVerifiedBinding.stdout
  );
  assert.match(
    mismatchedVerifiedBinding.stderr,
    /BACKEND_RELEASE_BINDING_SNAPSHOT_MISMATCH/
  );
  assert.equal(
    calls
      .slice(mismatchStart)
      .filter(call =>
        call.path.endsWith(`/${backendReleaseId}/activate`)
      ).length,
    0,
    'a verified binding mismatch must fail before Backend activation'
  );
  assert.equal(activated, false);
  await endRelease();

  console.log('backend release CLI smoke passed');
} finally {
  server.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
