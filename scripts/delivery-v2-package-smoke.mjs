import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  canonicalJson,
  compileAppPackage,
  layerForSourceFile,
  sha256Canonical,
  shouldIncludeSourceFile,
} = require('../lib/delivery-v2-package');
const { releaseTargets } = require('../lib/delivery-v2-executor');
const { buildWorkspaceReleaseSteps } = require('../lib/release-plan');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openxiangda-delivery-v2-'));
try {
  fs.mkdirSync(path.join(root, 'src', 'functions', 'hello'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(root, 'src', 'automations', 'notify_customer'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(root, 'src', 'automations', '_shared'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(root, 'src', 'forms', 'customer'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(root, 'src', 'pages'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'shared'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'resources', 'roles'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(root, 'src', 'resources', 'data-views'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(root, 'src', 'resources', 'functions'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(root, 'src', 'resources', 'automations'), {
    recursive: true,
  });
  fs.mkdirSync(
    path.join(root, 'src', 'resources', 'permissions', 'form-groups'),
    { recursive: true }
  );
  fs.mkdirSync(path.join(root, 'dist', 'assets'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'app-workspace.config.ts'),
    'export default { deliveryVersion: 2, runtimeMode: "react-spa" };\n'
  );
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'delivery-v2-test', scripts: { build: 'true' } })
  );
  fs.writeFileSync(
    path.join(root, 'tsconfig.js-code-nodes.json'),
    JSON.stringify({ compilerOptions: { target: 'ES2020' } })
  );
  fs.writeFileSync(
    path.join(root, 'src', 'functions', 'hello', 'index.ts'),
    'import { stableHelper } from "@/shared/stable-helper";\nexport default async () => stableHelper;\n'
  );
  fs.writeFileSync(
    path.join(root, 'src', 'automations', 'notify_customer', 'index.ts'),
    'import { automationHelper } from "../_shared/helper";\nexport default async () => automationHelper;\n'
  );
  fs.writeFileSync(
    path.join(root, 'src', 'automations', '_shared', 'helper.ts'),
    'export const automationHelper = "notify";\n'
  );
  fs.writeFileSync(
    path.join(root, 'src', 'shared', 'stable-helper.ts'),
    'export const stableHelper = "hello";\n'
  );
  fs.writeFileSync(
    path.join(root, 'src', 'resources', 'functions', 'hello.json'),
    JSON.stringify({
      code: 'hello',
      resources: { forms: ['customer'] },
      definitionJson: {
        sourceFile: { localPath: 'src/functions/hello/index.ts' },
      },
    })
  );
  fs.writeFileSync(
    path.join(
      root,
      'src',
      'resources',
      'automations',
      'notify_customer.json'
    ),
    JSON.stringify({
      code: 'notify_customer',
      triggerConfig: { mode: 'event' },
      definitionJson: {
        sourceFile: {
          localPath: 'src/automations/notify_customer/index.ts',
        },
      },
    })
  );
  fs.writeFileSync(
    path.join(root, 'src', 'forms', 'customer', 'schema.ts'),
    'export default { code: "customer" };\n'
  );
  fs.writeFileSync(
    path.join(root, 'src', 'forms', 'member-common.ts'),
    'export const sharedMemberField = "name";\n'
  );
  fs.writeFileSync(
    path.join(root, 'src', 'pages', 'Home.tsx'),
    'export default function Home(){ return null; }\n'
  );
  fs.writeFileSync(
    path.join(root, 'src', 'resources', 'roles', 'roles.json'),
    '{"roles":[{"code":"admin","name":"Admin"}]}\n'
  );
  fs.writeFileSync(
    path.join(root, 'src', 'resources', 'data-views', 'member_stats.json'),
    JSON.stringify({
      code: 'member_stats',
      name: 'Member Stats',
      definition: {
        base: { kind: 'form', code: 'member_profile' },
        select: [{ field: 'name', alias: 'memberName' }],
      },
      permissionGroups: [
        { code: 'member_stats_global', roles: ['admin'] },
        { code: 'member_stats_group', roles: ['group_admin'] },
      ],
    })
  );
  fs.writeFileSync(
    path.join(
      root,
      'src',
      'resources',
      'permissions',
      'form-groups',
      'customer-read.json'
    ),
    JSON.stringify({
      code: 'customer_read',
      formCode: 'customer',
      roles: ['admin'],
      actions: ['view'],
    })
  );
  fs.writeFileSync(path.join(root, 'dist', 'index.html'), '<div>v1</div>');
  fs.writeFileSync(
    path.join(root, 'dist', 'assets', 'index.js'),
    'console.log("v1")'
  );
  fs.writeFileSync(path.join(root, '.env'), 'APP_SECRET=never-package-me');

  assert.equal(layerForSourceFile('src/functions/a/index.ts'), 'backend');
  assert.equal(layerForSourceFile('src/resources/roles/a.json'), 'configuration');
  assert.equal(layerForSourceFile('src/pages/Home.tsx'), 'runtime');
  assert.equal(shouldIncludeSourceFile('.env'), false);
  assert.equal(shouldIncludeSourceFile('src/pages/Home.tsx'), true);
  assert.equal(
    shouldIncludeSourceFile('tsconfig.js-code-nodes.json'),
    true
  );

  const first = await compileAppPackage({
    workspaceRoot: root,
    skipBuild: true,
  });
  assert.match(first.packageDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(first.packageManifest.buildRequirements, {
    contractVersion: 'delivery_v2_build_closure_v1',
    sealed: true,
    runtime: 'prebuilt-runtime-layer',
    authoredResources: 'openxiangda-bundled-toolchain',
    workspaceNodeModules: 'forbidden',
    externalPackages: [],
  });
  assert.equal(
    first.packageManifest.layers
      .find(layer => layer.kind === 'source')
      .files.some(file => file.path === 'tsconfig.js-code-nodes.json'),
    true,
    'build-time tsconfig must be materializable from the sealed package'
  );
  assert.deepEqual(first.packageManifest.resources.forms, ['customer']);
  assert.deepEqual(first.packageManifest.resources.functions, ['hello']);
  assert.deepEqual(
    first.packageManifest.resources.automations,
    ['notify_customer'],
    'automation source directories without a resource manifest are shared code, not deployable targets'
  );
  const firstTargets = releaseTargets(first.packageManifest, null);
  assert.deepEqual(firstTargets.automations, ['notify_customer']);
  const backendStep = buildWorkspaceReleaseSteps(
    firstTargets,
    'react-spa',
    'preproduction',
    'delivery-v2-package-smoke'
  ).find(step => step.id === 'backend-stage');
  assert.deepEqual(
    backendStep.args[backendStep.args.indexOf('--only') + 1].split(','),
    ['function:hello', 'automation:notify_customer'],
    'backend-stage must contain only manifest-backed automation selectors'
  );
  assert.deepEqual(first.packageManifest.resources.configuration.role, [
    'admin',
  ]);
  assert.deepEqual(
    first.packageManifest.resources.configuration['data-view'],
    ['member_stats'],
    'data-view inventory must exclude nested base and permission-group codes'
  );
  assert.deepEqual(first.packageManifest.resources.formDependencies, [
    'customer',
    'member_profile',
  ]);
  assert.deepEqual(
    first.packageManifest.resources.formDependenciesByResource.backend[
      'function:hello'
    ],
    ['customer']
  );
  assert.deepEqual(
    first.packageManifest.resources.formDependenciesByResource.configuration[
      'data-view:member_stats'
    ],
    ['member_profile']
  );
  assert.deepEqual(
    first.packageManifest.resources.formPermissionGroupForms,
    { customer_read: ['customer'] }
  );
  assert.match(
    first.packageManifest.resources.resourceFingerprints.functions.hello,
    /^[a-f0-9]{64}$/
  );
  assert.equal(
    first.packageDigest,
    sha256Canonical(first.packageManifest),
    'package digest uses canonical manifest bytes'
  );
  assert.equal(
    canonicalJson(first.packageManifest),
    first.artifacts.find(
      artifact => artifact.digest === first.packageDigest
    ).buffer.toString('utf8')
  );
  assert.equal(
    first.artifacts.some(artifact =>
      artifact.buffer.toString('utf8').includes('never-package-me')
    ),
    false
  );

  fs.writeFileSync(
    path.join(root, 'src', 'automations', '_shared', 'helper.ts'),
    'export const automationHelper = "notify-v2";\n'
  );
  const automationSharedDependencyChanged = await compileAppPackage({
    workspaceRoot: root,
    skipBuild: true,
    previousManifest: first.packageManifest,
  });
  assert.notEqual(
    automationSharedDependencyChanged.packageManifest.resources
      .resourceFingerprints.automations.notify_customer,
    first.packageManifest.resources.resourceFingerprints.automations
      .notify_customer,
    'a shared automation dependency must update its manifest-backed owner fingerprint'
  );
  assert.deepEqual(
    automationSharedDependencyChanged.packageManifest.resources.automations,
    ['notify_customer'],
    'shared automation dependencies must not become deployable resources'
  );
  fs.writeFileSync(
    path.join(root, 'src', 'automations', '_shared', 'helper.ts'),
    'export const automationHelper = "notify";\n'
  );

  fs.writeFileSync(
    path.join(root, 'src', 'shared', 'stable-helper.ts'),
    'export const stableHelper = "hello-from-shared-v2";\n'
  );
  const sharedDependencyChanged = await compileAppPackage({
    workspaceRoot: root,
    skipBuild: true,
    previousManifest: first.packageManifest,
  });
  assert.notEqual(
    sharedDependencyChanged.packageManifest.resources.resourceFingerprints
      .functions.hello,
    first.packageManifest.resources.resourceFingerprints.functions.hello,
    'a transitive shared source change must update its owning resource fingerprint'
  );
  assert.equal(
    sharedDependencyChanged.summary.layers.find(
      layer => layer.kind === 'backend'
    ).reused,
    true,
    'resource fingerprints must detect transitive changes even when the authored backend layer is reused'
  );
  fs.writeFileSync(
    path.join(root, 'src', 'shared', 'stable-helper.ts'),
    'export const stableHelper = "hello";\n'
  );

  fs.writeFileSync(
    path.join(root, 'src', 'functions', 'hello', 'index.ts'),
    'import "left-pad";\nexport default async () => "hello";\n'
  );
  await assert.rejects(
    () =>
      compileAppPackage({
        workspaceRoot: root,
        skipBuild: true,
        previousManifest: first.packageManifest,
      }),
    error => error.code === 'DELIVERY_BUILD_DEPENDENCY_NOT_SEALED',
    'authored resources must not rely on packages absent from the sealed build closure'
  );
  fs.mkdirSync(path.join(root, 'src', 'shared'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src', 'shared', 'backend-helper.ts'),
    'import leftPad from "left-pad";\nexport const helper = leftPad("x", 2);\n'
  );
  fs.writeFileSync(
    path.join(root, 'src', 'functions', 'hello', 'index.ts'),
    'import { helper } from "@/shared/backend-helper";\nexport default async () => helper;\n'
  );
  await assert.rejects(
    () =>
      compileAppPackage({
        workspaceRoot: root,
        skipBuild: true,
        previousManifest: first.packageManifest,
      }),
    error => error.code === 'DELIVERY_BUILD_DEPENDENCY_NOT_SEALED',
    'transitive shared dependencies must also remain inside the sealed build closure'
  );
  fs.rmSync(path.join(root, 'src', 'shared', 'backend-helper.ts'));

  fs.writeFileSync(
    path.join(root, 'src', 'functions', 'hello', 'index.ts'),
    'export default async () => "hello-v2";\n'
  );
  const second = await compileAppPackage({
    workspaceRoot: root,
    skipBuild: true,
    previousManifest: first.packageManifest,
  });
  const layers = Object.fromEntries(
    second.summary.layers.map(layer => [layer.kind, layer])
  );
  assert.equal(layers.backend.reused, false);
  assert.equal(layers.runtime.reused, true);
  assert.equal(layers.runtime.built, false);
  assert.equal(layers.configuration.reused, true);
  assert.notEqual(second.packageDigest, first.packageDigest);

  const third = await compileAppPackage({
    workspaceRoot: root,
    skipBuild: true,
    previousManifest: second.packageManifest,
  });
  assert.equal(third.packageDigest, second.packageDigest);
  assert.equal(third.summary.layers.every(layer => layer.reused), true);

  console.log('delivery v2 package smoke passed');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
