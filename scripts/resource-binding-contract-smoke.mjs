import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {
  diffResourceBindings,
  diffResourceDeclarations,
  formatResourceDeclarationDrift,
  normalizeResourceBindings,
  resourceBindingContractHash,
  summarizeBindingDifferences,
} = require('../lib/resource-binding-contract');

{
  const diff = diffResourceDeclarations(
    {
      forms: ['hgy_lockscreen_log', 'hgy_instrument'],
      connectors: ['hgy_lockscreen_gateway'],
    },
    {
      connectors: ['hgy_lockscreen_gateway'],
      forms: ['hgy_instrument', 'hgy_lockscreen_log'],
    }
  );
  assert.equal(diff.matches, true, 'declaration order must not matter');
}

{
  const diff = diffResourceDeclarations(
    {
      forms: ['hgy_lockscreen_log', 'hgy_instrument'],
    },
    {
      forms: ['hgy_instrument'],
    }
  );
  assert.equal(diff.matches, false);
  assert.deepEqual(diff.differences, [
    {
      resourceType: 'forms',
      missingInRuntime: ['hgy_lockscreen_log'],
      missingInOuter: [],
    },
  ]);
  assert.match(
    formatResourceDeclarationDrift(
      'Automation',
      'lockscreen_event_apply',
      diff
    ),
    /RESOURCE_DECLARATION_DRIFT:.*运行时缺少 forms=\[hgy_lockscreen_log\]/
  );
}

{
  const expected = {
    forms: {
      hgy_lockscreen_log: 'FORM_LOG',
      hgy_instrument: 'FORM_INSTRUMENT',
    },
  };
  const actual = {
    forms: {
      hgy_instrument: 'FORM_INSTRUMENT_OLD',
    },
  };
  const diff = diffResourceBindings(expected, actual);
  assert.equal(diff.matches, false);
  assert.deepEqual(summarizeBindingDifferences(diff), [
    'forms.missing=[hgy_lockscreen_log]',
    'forms.changed=[hgy_instrument]',
  ]);
}

{
  assert.deepEqual(
    normalizeResourceBindings({
      forms: {
        hgy_lockscreen_log: { formUuid: 'FORM_LOG' },
      },
      unsupported: { ignored: 'IGNORED' },
    }),
    {
      forms: {
        hgy_lockscreen_log: 'FORM_LOG',
      },
    }
  );
  const left = resourceBindingContractHash([
    {
      kind: 'Automation',
      code: 'lockscreen_event_apply',
      expected: {
        forms: {
          hgy_lockscreen_log: 'FORM_LOG',
          hgy_instrument: 'FORM_INSTRUMENT',
        },
      },
    },
  ]);
  const right = resourceBindingContractHash([
    {
      code: 'lockscreen_event_apply',
      kind: 'Automation',
      expected: {
        forms: {
          hgy_instrument: 'FORM_INSTRUMENT',
          hgy_lockscreen_log: 'FORM_LOG',
        },
      },
    },
  ]);
  assert.equal(left, right, 'contract hash must be canonical');
}

{
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), 'openxiangda-binding-validation-')
  );
  const tempHome = path.join(workspace, '.home');
  const functionsDir = path.join(workspace, 'src', 'resources', 'functions');
  const automationsDir = path.join(workspace, 'src', 'resources', 'automations');
  fs.mkdirSync(path.join(tempHome, '.openxiangda'), { recursive: true });
  fs.mkdirSync(path.join(workspace, '.openxiangda'), { recursive: true });
  fs.mkdirSync(functionsDir, { recursive: true });
  fs.mkdirSync(automationsDir, { recursive: true });
  const writeJson = (file, value) => {
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  };
  writeJson(path.join(workspace, '.openxiangda', 'profiles.json'), {
    version: 1,
    currentProfile: 'test',
    profiles: {
      test: {
        name: 'test',
        baseUrl: 'http://127.0.0.1:1/service',
        token: { accessToken: 'test-token' },
      },
    },
  });
  writeJson(path.join(workspace, '.openxiangda', 'state.json'), {
    version: 1,
    profiles: {
      test: {
        appType: 'APP_BINDING_VALIDATION',
        resources: {},
      },
    },
  });
  const validate = kind => {
    const result = spawnSync(
      process.execPath,
      [
        path.join(repoRoot, 'bin', 'openxiangda.js'),
        'resource',
        'validate',
        kind,
        '--json',
      ],
      {
        cwd: workspace,
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: tempHome,
          CODEX_THREAD_ID: 'resource-binding-contract-smoke',
        },
      }
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return JSON.parse(result.stdout);
  };

  writeJson(path.join(functionsDir, 'outer-only.json'), {
    code: 'outer_only',
    name: 'Outer-only Function',
    resources: { forms: ['customer'] },
    definitionJson: {
      kind: 'app_function',
      runtimeMode: 'trusted_node',
      sourceType: 'inline',
      code: 'module.exports = async () => ({ ok: true })',
    },
  });
  assert.equal(
    validate('function').valid,
    true,
    'a Function may use its outer resources declaration as the authority'
  );

  writeJson(path.join(automationsDir, 'strict.json'), {
    code: 'strict_automation',
    name: 'Strict Automation',
    resources: { forms: ['customer'] },
    triggerConfig: { mode: 'manual' },
    definitionJson: {
      version: 'v3',
      nodes: [],
      edges: [],
    },
  });
  const automationMismatch = validate('automation');
  assert.equal(automationMismatch.valid, false);
  assert.ok(
    automationMismatch.errors.some(error =>
      error.includes('RESOURCE_DECLARATION_DRIFT')
    ),
    'an Automation must repeat the exact resource declaration in its runtime definition'
  );

  writeJson(path.join(automationsDir, 'strict.json'), {
    code: 'strict_automation',
    name: 'Strict Automation',
    resources: { forms: ['customer'] },
    triggerConfig: { mode: 'manual' },
    definitionJson: {
      version: 'v3',
      resources: { forms: ['customer'] },
      nodes: [],
      edges: [],
    },
  });
  assert.equal(validate('automation').valid, true);

  writeJson(path.join(functionsDir, 'outer-only.json'), {
    code: 'outer_only',
    name: 'Outer-only Function',
    resources: { forms: ['customer'] },
    definitionJson: {
      kind: 'app_function',
      runtimeMode: 'trusted_node',
      sourceType: 'inline',
      resources: { forms: ['other_form'] },
      code: 'module.exports = async () => ({ ok: true })',
    },
  });
  const functionMismatch = validate('function');
  assert.equal(functionMismatch.valid, false);
  assert.ok(
    functionMismatch.errors.some(error =>
      error.includes('RESOURCE_DECLARATION_DRIFT')
    )
  );
}

console.log('resource binding contract smoke passed');
