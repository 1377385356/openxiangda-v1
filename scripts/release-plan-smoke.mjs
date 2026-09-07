import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildWorkspaceReleaseSteps,
  normalizeReleaseTargets,
  releasePlanHash,
} = require('../lib/release-plan');
const {
  assertReleasePublishAdoptionFlags,
  assertReleasePublishAdoptionScope,
  buildResourceManifestSddTargets,
  decorateEnvironmentReleaseSteps,
} = require('../lib/cli');
const { loadLocalFormSchema } = require('../lib/form-schema-loader');

const functions = Array.from({ length: 17 }, (_, index) => `function_${index + 1}`);
const automations = Array.from(
  { length: 24 },
  (_, index) => `automation_${index + 1}`,
);
const targets = {
  forms: ['external_application'],
  pages: ['admin.external'],
  functions,
  automations,
  runtime: true,
};
const normalized = normalizeReleaseTargets(targets, 'react-spa');
assert.deepEqual(normalized.logicalTargets.pages, ['admin.external']);
assert.deepEqual(
  normalized.activationTargets.pages,
  [],
  'React source pages activate through Runtime, not independent PageRelease',
);
assert.equal(normalized.activationTargets.runtime, true);

const steps = buildWorkspaceReleaseSteps(
  targets,
  'react-spa',
  'instrument-example-dygx',
  'instrument-example-external-module-v1',
);
assert.deepEqual(
  steps.map(step => step.id),
  [
    'form-ensure',
    'form-stage',
    'backend-stage',
    'runtime-stage',
    'app-finalize',
  ],
);
const backend = steps.find(step => step.id === 'backend-stage');
assert.equal(backend.stagedKind, 'BackendRelease');
assert.match(backend.command, /resource publish function,automation/);
assert.match(backend.command, /--stage-only/);
assert.match(
  backend.command,
  /--staged-form-contracts external_application/,
);
assert.ok(
  functions.every(code => backend.command.includes(`function:${code}`)),
  'all Function selectors must be handled by the mixed Backend stage',
);
assert.ok(
  automations.every(code => backend.command.includes(`automation:${code}`)),
  'all mixed Backend selectors must be handled by one staged child',
);
assert.ok(
  steps.every(
    step =>
      step.command.includes('--profile instrument-example-dygx') &&
      step.command.includes('--change instrument-example-external-module-v1'),
  ),
  'every write step must retain the exact profile and change',
);
assert.match(
  steps.find(step => step.id === 'runtime-stage').command,
  /runtime deploy --no-activate/,
);
assert.match(
  steps.find(step => step.id === 'app-finalize').command,
  /release app-finalize --staged-resources-json/,
);
assert.ok(
  !steps.some(step => /workspace publish .*--form/.test(step.command)),
  'Form schema must never fall back to direct workspace activation',
);
const workflowSteps = buildWorkspaceReleaseSteps(
  { workflows: ['approval_flow'] },
  'react-spa',
  'instrument-example-dygx',
  'workflow-change',
);
assert.deepEqual(
  workflowSteps.map(step => step.id),
  ['workflow-stage', 'app-finalize'],
);
assert.equal(workflowSteps[0].stagedKind, 'WorkflowRelease');
assert.match(
  workflowSteps[0].command,
  /resource publish workflow --only approval_flow --stage-only/,
);
assert.ok(
  workflowSteps.every(
    step =>
      step.command.includes('--profile instrument-example-dygx') &&
      step.command.includes('--change workflow-change'),
  ),
  'Workflow staging and activation must retain the exact profile and change',
);
assert.throws(
  () =>
    buildWorkspaceReleaseSteps(
      {
        resources: true,
      },
      'react-spa',
      'instrument-example-dygx',
      'generic-resource-change',
    ),
  error =>
    error?.code === 'RELEASE_ATOMIC_TARGET_UNSUPPORTED' &&
    /generic-resources/.test(error.message),
  'an unscoped generic resource closure must remain blocked',
);
const narrowedLegacyResourceTargets = normalizeReleaseTargets(
  {
    resources: true,
    resourceSelectors: { publicAccessPolicies: ['public_register'] },
  },
  'react-spa',
);
assert.equal(
  narrowedLegacyResourceTargets.activationTargets.resources,
  false,
  'resources=true is a legacy category marker when an exact supported selector exists',
);
const publicAccessSteps = buildWorkspaceReleaseSteps(
  {
    resources: true,
    resourceSelectors: { publicAccessPolicies: ['public_register'] },
    functions: ['external_registration_submit'],
    runtime: true,
  },
  'react-spa',
  'instrument-example-dygx',
  'instrument-example-external-attachment-frontend-required-20260721',
);
assert.deepEqual(
  publicAccessSteps.map(step => step.id),
  ['config-public-access', 'backend-stage', 'runtime-stage', 'app-finalize'],
  'exact public-access configuration must stay in the managed release flow',
);
assert.match(
  publicAccessSteps[0].command,
  /resource publish public-access --only public_register/,
);
assert.throws(
  () =>
    buildWorkspaceReleaseSteps(
      { resourceSelectors: { publicAccessPolicies: ['*'] } },
      'react-spa',
      'instrument-example-dygx',
      'wildcard-resource-change',
    ),
  error =>
    error?.code === 'RELEASE_ATOMIC_TARGET_UNSUPPORTED' &&
    /publicAccessPolicies:\*/.test(error.message),
  'wildcard generic resource selectors must remain blocked',
);
const exactPublicAccessSddTargets = buildResourceManifestSddTargets(
  {
    publicAccessPolicies: [{ code: 'public_register' }],
  },
  [{ action: 'update', kind: 'publicAccessPolicy', code: 'public_register' }],
);
assert.equal(exactPublicAccessSddTargets.resources, false);
assert.deepEqual(exactPublicAccessSddTargets.resourceSelectors, {
  publicAccessPolicies: ['public_register'],
});
const configurationSteps = buildWorkspaceReleaseSteps(
  {
    resourceSelectors: {
      dataViews: ['analysis_summary'],
      pagePermissionGroups: ['analysis_pages'],
    },
  },
  'react-spa',
  'instrument-example-dygx',
  'configuration-change',
);
assert.deepEqual(
  configurationSteps.map(step => step.id),
  [
    'config-data-view',
    'config-page-permission-group',
    'app-finalize',
  ],
);
assert.match(
  configurationSteps[0].command,
  /resource publish data-view --only analysis_summary/,
);
assert.match(
  configurationSteps[1].command,
  /resource publish page-permission-group --only analysis_pages/,
);
assert.doesNotMatch(
  configurationSteps[2].command,
  /--staged-resources-json/,
  'configuration-only releases should still create the managed AppRelease without pretending mutable resources are staged children',
);
const stagedFormDataViewSteps = buildWorkspaceReleaseSteps(
  {
    forms: ['club'],
    resourceSelectors: {
      dataViews: ['club_summary'],
    },
  },
  'react-spa',
  'example',
  'digital-union-data-view',
);
assert.deepEqual(
  stagedFormDataViewSteps.map(step => step.id),
  [
    'form-ensure',
    'form-stage',
    'config-data-view',
    'app-finalize',
  ],
  'DataView configuration must be staged before the form head moves and finalized inside the existing App finalize checkpoint',
);
assert.match(
  stagedFormDataViewSteps.at(-1).command,
  /--finalize-data-views club_summary/,
);
assert.equal(
  stagedFormDataViewSteps.filter(step => step.id === 'app-finalize').length,
  1,
  'DataView materialization must not add a second release checkpoint',
);
const formBundleSteps = buildWorkspaceReleaseSteps(
  {
    forms: ['business_task', 'deletion_job'],
    resourceSelectors: {
      formPermissionGroups: [
        'business_task_admin',
        'deletion_job_admin',
      ],
    },
  },
  'react-spa',
  'instrument-example-dygx',
  'form-bundle-change',
);
assert.deepEqual(
  formBundleSteps.map(step => step.id),
  ['form-ensure', 'form-stage', 'app-finalize'],
  'form schema/settings and form permission groups must share one immutable FormRelease step',
);
assert.match(
  formBundleSteps[1].command,
  /resource publish form-setting,form-permission-group/,
);
assert.match(
  formBundleSteps[1].command,
  /form-setting:business_task/,
);
assert.match(
  formBundleSteps[1].command,
  /form-permission-group:deletion_job_admin/,
);
const legacyAdoptionSteps = buildWorkspaceReleaseSteps(
  {
    forms: ['contract'],
    runtime: true,
  },
  'react-spa',
  'prod_rebuild',
  'contract-baseline-adoption',
);
const adoptionFlags = {
  'adopt-online-baseline': true,
  'adoption-reason': 'audited historical form release lineage',
};
assert.doesNotThrow(() =>
  assertReleasePublishAdoptionFlags(adoptionFlags),
);
decorateEnvironmentReleaseSteps(
  legacyAdoptionSteps,
  {
    profileName: 'prod_rebuild',
    appType: 'APP_LEGACY',
    environmentId: null,
    targetName: null,
  },
  adoptionFlags,
);
assert.doesNotThrow(() =>
  assertReleasePublishAdoptionScope(legacyAdoptionSteps, adoptionFlags),
);
assert.match(
  legacyAdoptionSteps.find(step => step.id === 'form-stage').command,
  /resource publish form-setting --only contract .*--adopt-online-baseline --adoption-reason 'audited historical form release lineage'/,
  'legacy release publish must forward audited baseline adoption to form-stage',
);
assert.ok(
  legacyAdoptionSteps
    .filter(step => step.id !== 'form-stage')
    .every(step => !step.command.includes('--adopt-online-baseline')),
  'legacy release publish must not leak baseline adoption to form ensure, Runtime, or App finalize',
);
assert.throws(
  () =>
    assertReleasePublishAdoptionFlags({
      'adoption-reason': 'reason without adoption flag',
    }),
  error => error?.code === 'RELEASE_PUBLISH_ADOPTION_FLAG_REQUIRED',
);
assert.throws(
  () =>
    assertReleasePublishAdoptionFlags({
      'adopt-online-baseline': true,
      'adoption-reason': 'short',
    }),
  error => error?.code === 'RELEASE_PUBLISH_ADOPTION_REASON_REQUIRED',
);
assert.throws(
  () =>
    assertReleasePublishAdoptionScope(
      buildWorkspaceReleaseSteps(
        { runtime: true },
        'react-spa',
        'prod_rebuild',
        'runtime-only-adoption',
      ),
      adoptionFlags,
    ),
  error => error?.code === 'RELEASE_PUBLISH_ADOPTION_SCOPE_REQUIRED',
  'adoption intent without an exact resource stage must fail before release writes',
);
assert.ok(
  !formBundleSteps.some(step => step.id === 'config-form-permission-group'),
  'a second permission-only FormRelease would replace the staged schema snapshot',
);
const permissionOnlyFormBundleSteps = buildWorkspaceReleaseSteps(
  {
    resourceSelectors: {
      formPermissionGroups: ['business_task_admin'],
    },
  },
  'react-spa',
  'instrument-example-dygx',
  'form-permission-only-change',
);
assert.deepEqual(
  permissionOnlyFormBundleSteps.map(step => step.id),
  ['form-stage', 'app-finalize'],
);
assert.match(
  permissionOnlyFormBundleSteps[0].command,
  /resource publish form-permission-group --only business_task_admin/,
);
assert.equal(
  releasePlanHash({ targets, commands: steps.map(step => step.command) }),
  releasePlanHash({ commands: steps.map(step => step.command), targets }),
  'release plan hash must be canonical',
);

const workspace = fs.mkdtempSync(
  path.join(os.tmpdir(), 'openxiangda-form-schema-'),
);
try {
  const schemaDir = path.join(
    workspace,
    'src',
    'forms',
    'external_application',
  );
  const sharedDir = path.join(workspace, 'src', 'shared');
  const sdkPackageDir = path.join(workspace, 'node_modules', 'openxiangda');
  fs.mkdirSync(schemaDir, { recursive: true });
  fs.mkdirSync(sharedDir, { recursive: true });
  fs.mkdirSync(sdkPackageDir, { recursive: true });
  fs.writeFileSync(
    path.join(sdkPackageDir, 'package.json'),
    JSON.stringify({ name: 'openxiangda', main: 'index.js' }),
  );
  fs.writeFileSync(
    path.join(sdkPackageDir, 'index.js'),
    [
      "require('./global.css');",
      "throw new Error('full browser SDK must not load during schema validation');",
      '',
    ].join('\n'),
  );
  fs.writeFileSync(path.join(sdkPackageDir, 'global.css'), ':root {}');
  fs.writeFileSync(
    path.join(sharedDir, 'form-schema.ts'),
    [
      "import { defineFormSchema } from 'openxiangda';",
      'export const createFormSchema = input => defineFormSchema(input);',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(schemaDir, 'schema.ts'),
    [
      "import { createFormSchema } from '@/shared/form-schema';",
      'export default createFormSchema({',
      "  formMeta: { formUuid: 'FORM_EXTERNAL', title: '校外申请', formType: 'receipt' },",
      '  fields: [',
      "    { fieldId: 'applicantName', componentName: 'TextField', label: '申请人' },",
      "    { fieldId: 'reason', componentName: 'TextAreaField', label: '事由' },",
      '  ],',
      '});',
      '',
    ].join('\n'),
  );
  const loaded = await loadLocalFormSchema(
    workspace,
    'external_application',
  );
  assert.equal(loaded.name, '校外申请');
  assert.equal(loaded.fieldCount, 2);
  const pageSchema = JSON.parse(loaded.schema);
  assert.equal(
    pageSchema.componentsTree[0].children[1].componentName,
    'TextareaField',
  );
  assert.deepEqual(
    fs.readdirSync(workspace, { recursive: true }).filter(item =>
      String(item).includes('.openxiangda'),
    ),
    [],
    'in-memory schema compilation must not write generated source into the workspace',
  );
} finally {
  fs.rmSync(workspace, { recursive: true, force: true });
}

console.log('release plan smoke passed');
