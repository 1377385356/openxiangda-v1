#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_HOME="$(mktemp -d)"
TMP_WORK="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_HOME" "$TMP_WORK"
}
trap cleanup EXIT

run_cli() {
  HOME="$TMP_HOME" node "$ROOT_DIR/bin/openxiangda.js" "$@"
}

TARGET="$TMP_WORK/my-app-workspace"

run_cli workspace init "$TARGET" --name my-app-workspace --json >"$TMP_HOME/workspace-init.json"

node - "$TARGET" "$TMP_HOME/workspace-init.json" <<'NODE'
const fs = require('fs');
const path = require('path');

const target = process.argv[2];
const initResult = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
const gitignore = fs.readFileSync(path.join(target, '.gitignore'), 'utf8');
assert(gitignore.includes('.openxiangda/build-cache.cli-v4.json'), 'legacy template must ignore CLI scoped build cache');
assert(gitignore.includes('.openxiangda/build-cache.cli-v4.json.lock'), 'legacy template must ignore CLI scoped build cache lock');
assert(pkg.name === 'my-app-workspace', 'package name was not replaced');
assert(initResult.nextSteps.some(step => step.includes('openxiangda deploy preproduction')), 'workspace init next steps must use Delivery V2 preproduction');
assert(initResult.nextSteps.some(step => step.includes('openxiangda deploy production --package')), 'workspace init next steps must promote the sealed package');
assert(pkg.scripts['openxiangda:publish'] === 'lowcode-workspace publish-all', 'missing openxiangda publish script');
assert(pkg.scripts['_guard:publish'] === 'node scripts/guard-publish.mjs', 'missing _guard:publish script');
assert(pkg.scripts['prepublish:all'] === 'pnpm _guard:publish', 'publish:all not guarded');
assert(pkg.scripts['prepublish:oss'] === 'pnpm _guard:publish', 'publish:oss not guarded');
assert(pkg.scripts['preregister'] === 'pnpm _guard:publish', 'register not guarded');
assert(pkg.scripts['preregister-bundle'] === 'pnpm _guard:publish', 'register-bundle not guarded');
assert(pkg.scripts['prepublish:changed'] === 'pnpm _guard:publish', 'publish:changed not guarded');
assert(pkg.scripts['preopenxiangda:publish'] === 'pnpm _guard:publish', 'openxiangda:publish not guarded');
assert(fs.existsSync(path.join(target, 'app-workspace.config.ts')), 'missing app-workspace.config.ts');
assert(fs.readFileSync(path.join(target, 'app-workspace.config.ts'), 'utf8').includes('deliveryVersion: 2'), 'legacy template must enable Delivery V2');
assert(fs.existsSync(path.join(target, 'DELIVERY.md')), 'legacy template must include Delivery V2 runbook');
assert(fs.existsSync(path.join(target, 'openspec', 'config.yaml')), 'missing openspec/config.yaml');
assert(fs.existsSync(path.join(target, 'openspec', 'specs', 'app', 'spec.md')), 'missing openspec application spec');
assert(fs.readFileSync(path.join(target, 'openspec', 'config.yaml'), 'utf8').includes('openxiangda-sdd-v2'), 'openspec config must use SDD v2');
assert(fs.existsSync(path.join(target, 'AGENTS.md')), 'missing AGENTS.md');
assert(fs.existsSync(path.join(target, '.qoder', 'rules', 'openxiangda.md')), 'missing .qoder/rules/openxiangda.md');
assert(fs.existsSync(path.join(target, '.qoder', 'rules', 'openxiangda-form.md')), 'missing .qoder glob rule for forms');
assert(fs.existsSync(path.join(target, '.qoder', 'rules', 'openxiangda-page.md')), 'missing .qoder glob rule for pages');
assert(fs.existsSync(path.join(target, '.qoder', 'rules', 'openxiangda-workflow-automation.md')), 'missing .qoder glob rule for workflow/automation');
assert(fs.existsSync(path.join(target, '.qoder', 'rules', 'openxiangda-resources.md')), 'missing .qoder glob rule for resources');
assert(fs.existsSync(path.join(target, '.cursor', 'rules', 'openxiangda.mdc')), 'missing .cursor/rules/openxiangda.mdc');
assert(fs.existsSync(path.join(target, '.cursor', 'rules', 'openxiangda-form.mdc')), 'missing .cursor glob rule for forms');
assert(fs.existsSync(path.join(target, '.cursor', 'rules', 'openxiangda-page.mdc')), 'missing .cursor glob rule for pages');
assert(fs.existsSync(path.join(target, '.cursor', 'rules', 'openxiangda-workflow-automation.mdc')), 'missing .cursor glob rule for workflow/automation');
assert(fs.existsSync(path.join(target, '.cursor', 'rules', 'openxiangda-resources.mdc')), 'missing .cursor glob rule for resources');
assert(fs.existsSync(path.join(target, 'scripts', 'guard-publish.mjs')), 'missing scripts/guard-publish.mjs');
const agentsMd = fs.readFileSync(path.join(target, 'AGENTS.md'), 'utf8');
assert(agentsMd.includes('openxiangda deploy'), 'AGENTS.md must point to Delivery V2 deploy');
assert(agentsMd.includes('_guard:publish'), 'AGENTS.md must mention the _guard:publish guard');
assert(agentsMd.includes('openxiangda sdd context'), 'AGENTS.md must mention SDD context');
assert(agentsMd.includes('coverage.json'), 'AGENTS.md must mention SDD coverage.json');
assert(agentsMd.includes('openxiangda design gates --topic permissions --json'), 'AGENTS.md must mention permissions design gate');
assert(agentsMd.includes('openxiangda workspace cleanup --apply'), 'AGENTS.md must define safe task worktree cleanup');
assert(agentsMd.includes('managed-platform-account'), 'AGENTS.md must mention managed platform account mode');
assert(agentsMd.includes('query-param-context'), 'AGENTS.md must mention query-param context mode');
assert(agentsMd.includes('query 参数'), 'AGENTS.md must warn about query parameter authorization');
assert(agentsMd.includes('apiPermissionCodes'), 'AGENTS.md must mention role apiPermissionCodes');
assert(agentsMd.includes('app:role:manage'), 'AGENTS.md must mention role setting permission');
const qoderRule = fs.readFileSync(path.join(target, '.qoder', 'rules', 'openxiangda.md'), 'utf8');
assert(qoderRule.startsWith('---\n'), '.qoder/rules/openxiangda.md must have frontmatter');
assert(qoderRule.includes('alwaysApply: true'), '.qoder rule must be alwaysApply: true');
assert(qoderRule.includes('openxiangda design gates --topic permissions --json'), '.qoder rule must mention permissions design gate');
assert(qoderRule.includes('openxiangda workspace cleanup'), '.qoder rule must mention task worktree cleanup');
assert(qoderRule.includes('apiPermissionCodes'), '.qoder rule must mention role apiPermissionCodes');
const cursorRule = fs.readFileSync(path.join(target, '.cursor', 'rules', 'openxiangda.mdc'), 'utf8');
assert(cursorRule.startsWith('---\n'), '.cursor/rules/openxiangda.mdc must have frontmatter');
assert(cursorRule.includes('alwaysApply: true'), '.cursor rule must be alwaysApply: true');
assert(cursorRule.includes('managed-platform-account'), '.cursor rule must mention permission modes');
assert(cursorRule.includes('openxiangda workspace cleanup'), '.cursor rule must mention task worktree cleanup');
assert(cursorRule.includes('app:role:manage'), '.cursor rule must mention role setting permission');
assert(fs.existsSync(path.join(target, 'src', 'main.tsx')), 'missing src/main.tsx');
assert(fs.existsSync(path.join(target, 'src', 'forms', '.gitkeep')), 'missing src/forms');
assert(fs.existsSync(path.join(target, 'src', 'forms', 'README.md')), 'missing src/forms/README.md');
assert(fs.existsSync(path.join(target, 'src', 'shared', 'form-schema.ts')), 'missing src/shared/form-schema.ts');
assert(fs.existsSync(path.join(target, 'src', 'pages', '.gitkeep')), 'missing src/pages');
assert(fs.existsSync(path.join(target, 'src', 'js-code-nodes', 'types.d.ts')), 'missing js-code node types');
assert(fs.existsSync(path.join(target, 'scripts', 'build-js-code.mjs')), 'missing build-js-code script');
assert(fs.existsSync(path.join(target, 'examples', 'forms', 'customer', 'schema.ts')), 'missing example form schema');
assert(fs.existsSync(path.join(target, 'examples', 'best-practices', 'catalog.json')), 'missing best-practices catalog');
assert(fs.existsSync(path.join(target, 'examples', 'best-practices', 'access-governance.md')), 'missing access governance example');
assert(fs.existsSync(path.join(target, 'examples', 'best-practices', 'decision-guide.md')), 'missing best-practices decision guide');
assert(fs.existsSync(path.join(target, 'examples', 'best-practices', 'src', 'domain', 'service-ticket', 'state-machine.ts')), 'missing service ticket state machine example');
assert(fs.existsSync(path.join(target, 'examples', 'best-practices', 'src', 'pages', 'service-ticket-ops', 'page.config.ts')), 'missing service ticket ops page example');
assert(fs.existsSync(path.join(target, 'tsconfig.examples.json')), 'missing examples tsconfig');

const catalog = JSON.parse(fs.readFileSync(path.join(target, 'examples', 'best-practices', 'catalog.json'), 'utf8'));
assert(catalog.publishedByDefault === false, 'best-practices must not publish by default');
assert(catalog.templates.some(item => item.code === 'access-governance'), 'best-practices catalog must include access-governance');
assert(!fs.existsSync(path.join(target, 'src', 'pages', 'service-ticket-ops', 'page.config.ts')), 'best-practices must not be copied into publishable src/pages');
assert(pkg.scripts['examples:check'] === 'tsc -p tsconfig.examples.json --noEmit', 'missing examples check script');
assert(pkg.scripts['publish:changed'] === 'lowcode-workspace publish-all --changed', 'missing changed publish script');

const formHelper = fs.readFileSync(path.join(target, 'src', 'shared', 'form-schema.ts'), 'utf8');
assert(formHelper.includes('defineFormSchema'), 'form helper must use defineFormSchema');
assert(!formHelper.includes('type: "validation"'), 'form helper must not generate top-level validation rules');
assert(formHelper.includes('needsOptionsArray'), 'form helper must guard option components without options');

const tailwindConfig = fs.readFileSync(path.join(target, 'tailwind.config.cjs'), 'utf8');
assert(tailwindConfig.includes('openxiangda/tailwind-preset'), 'tailwind config must include openxiangda preset');
NODE

REACT_TARGET="$TMP_WORK/my-react-app"
run_cli workspace init "$REACT_TARGET" --name my-react-app --runtime react-spa --json >"$TMP_HOME/react-workspace-init.json"

node - "$REACT_TARGET" <<'NODE'
const fs = require('fs');
const path = require('path');

const target = process.argv[2];
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
const gitignore = fs.readFileSync(path.join(target, '.gitignore'), 'utf8');
assert(gitignore.includes('.openxiangda/build-cache.cli-v4.json'), 'react-spa template must ignore CLI scoped build cache');
assert(gitignore.includes('.openxiangda/build-cache.cli-v4.json.lock'), 'react-spa template must ignore CLI scoped build cache lock');
assert(!fs.existsSync(path.join(target, 'node_modules')), 'react-spa template must not copy node_modules');
assert(!fs.existsSync(path.join(target, '.pnpm')), 'react-spa template must not copy .pnpm');
assert(!fs.existsSync(path.join(target, '.vite')), 'react-spa template must not copy .vite');
assert(!fs.existsSync(path.join(target, '.vite-temp')), 'react-spa template must not copy .vite-temp');
assert(!fs.existsSync(path.join(target, 'dist')), 'react-spa template must not copy dist');
assert(pkg.scripts['build-js-code'] === 'node scripts/build-js-code.mjs', 'react-spa missing build-js-code script');
assert(pkg.scripts['build:js-code'] === 'node scripts/build-js-code.mjs', 'react-spa missing build:js-code script');
assert(pkg.scripts['typecheck:js-code'] === 'tsc -p tsconfig.js-code-nodes.json --noEmit', 'react-spa missing js-code typecheck script');
assert(pkg.scripts['_guard:publish'] === 'node scripts/guard-publish.mjs', 'react-spa missing _guard:publish script');
assert(pkg.scripts['prepublish:all'] === 'pnpm _guard:publish', 'react-spa publish:all not guarded');
assert(pkg.scripts['preopenxiangda:publish'] === 'pnpm _guard:publish', 'react-spa openxiangda:publish not guarded');
assert(pkg.scripts['deploy'] === 'node scripts/deploy.mjs', 'react-spa deploy must require explicit profile');
assert(fs.existsSync(path.join(target, 'scripts', 'build-js-code.mjs')), 'react-spa missing build-js-code script file');
assert(fs.existsSync(path.join(target, 'scripts', 'guard-publish.mjs')), 'react-spa missing guard-publish script file');
assert(fs.existsSync(path.join(target, 'scripts', 'deploy.mjs')), 'react-spa missing deploy script file');
assert(fs.existsSync(path.join(target, 'tsconfig.js-code-nodes.json')), 'react-spa missing js-code tsconfig');
assert(fs.readFileSync(path.join(target, 'app-workspace.config.ts'), 'utf8').includes('deliveryVersion: 2'), 'react-spa template must enable Delivery V2');
assert(fs.existsSync(path.join(target, 'DELIVERY.md')), 'react-spa template must include Delivery V2 runbook');
assert(fs.existsSync(path.join(target, 'openspec', 'config.yaml')), 'react-spa missing openspec/config.yaml');
assert(fs.existsSync(path.join(target, 'openspec', 'specs', 'app', 'spec.md')), 'react-spa missing openspec application spec');
assert(fs.readFileSync(path.join(target, 'openspec', 'config.yaml'), 'utf8').includes('openxiangda-sdd-v2'), 'react-spa openspec config must use SDD v2');
assert(fs.existsSync(path.join(target, '.qoder', 'rules', 'openxiangda.md')), 'react-spa missing .qoder/rules/openxiangda.md');
assert(fs.existsSync(path.join(target, '.qoder', 'rules', 'openxiangda-resources.md')), 'react-spa missing .qoder/rules/openxiangda-resources.md');
assert(fs.existsSync(path.join(target, '.cursor', 'rules', 'openxiangda.mdc')), 'react-spa missing .cursor/rules/openxiangda.mdc');
assert(fs.existsSync(path.join(target, '.cursor', 'rules', 'openxiangda-resources.mdc')), 'react-spa missing .cursor/rules/openxiangda-resources.mdc');
const agentsMd = fs.readFileSync(path.join(target, 'AGENTS.md'), 'utf8');
assert(
  agentsMd.includes('openxiangda sdd bundle <release-change> --changes'),
  'react-spa AGENTS.md must mention mainline release bundling',
);
assert(agentsMd.includes('pnpm build-js-code'), 'react-spa AGENTS.md must mention build-js-code');
assert(agentsMd.includes('src/functions'), 'react-spa AGENTS.md must mention App Function source');
assert(agentsMd.includes('openxiangda sdd context'), 'react-spa AGENTS.md must mention SDD context');
assert(agentsMd.includes('coverage.json'), 'react-spa AGENTS.md must mention SDD coverage.json');
assert(agentsMd.includes('openxiangda design gates --topic permissions --json'), 'react-spa AGENTS.md must mention permissions design gate');
assert(agentsMd.includes('openxiangda workspace cleanup --apply'), 'react-spa AGENTS.md must define safe task worktree cleanup');
assert(agentsMd.includes('managed-platform-account'), 'react-spa AGENTS.md must mention managed platform account mode');
assert(agentsMd.includes('query-param-context'), 'react-spa AGENTS.md must mention query-param context mode');
assert(agentsMd.includes('查询参数只能作为上下文'), 'react-spa AGENTS.md must warn about query parameter authorization');
assert(agentsMd.includes('apiPermissionCodes'), 'react-spa AGENTS.md must mention role apiPermissionCodes');
assert(agentsMd.includes('app:role:manage'), 'react-spa AGENTS.md must mention role setting permission');
NODE

if run_cli workspace init "$TARGET" >"$TMP_HOME/openxiangda-workspace-init-conflict.log" 2>&1; then
  echo "workspace init did not reject a non-empty directory" >&2
  exit 1
fi

run_cli platform add dev https://dev.example.test >/dev/null
BOUND_TARGET="$TMP_WORK/bound-workspace"
run_cli workspace init "$BOUND_TARGET" --profile dev --app-type APP_DEV --json >"$TMP_HOME/workspace-init-bound.json"

node - "$BOUND_TARGET" <<'NODE'
const fs = require('fs');
const path = require('path');

const target = process.argv[2];
const state = JSON.parse(fs.readFileSync(path.join(target, '.openxiangda', 'state.json'), 'utf8'));
if (state.profiles.dev.appType !== 'APP_DEV') {
  throw new Error('workspace init did not bind appType');
}
if (state.profiles.dev.baseUrl !== 'https://dev.example.test/service') {
  throw new Error('workspace init did not persist profile baseUrl');
}
if (!state.profiles.dev.resources.connectors) {
  throw new Error('workspace init did not create connector resource bucket');
}
if (!state.profiles.dev.resources.notifications?.templates || !state.profiles.dev.resources.notifications?.typeConfigs) {
  throw new Error('workspace init did not create notification resource buckets');
}
if (!state.profiles.dev.resources.formSettings) {
  throw new Error('workspace init did not create form settings resource bucket');
}
NODE

echo "workspace init smoke passed"
