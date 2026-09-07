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

# 场景 1：在 init 后的 workspace 上跑 bootstrap，应该全部 unchanged。
TARGET="$TMP_WORK/initialized-workspace"
run_cli workspace init "$TARGET" --name initialized-workspace --json >"$TMP_HOME/init.json"
run_cli skill bootstrap "$TARGET" --json >"$TMP_HOME/bootstrap-initialized.json"
node - "$TMP_HOME/bootstrap-initialized.json" <<'NODE'
const fs = require('fs');
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
function assert(cond, msg) { if (!cond) throw new Error(msg); }
assert(result.dryRun === false, 'expected dryRun=false');
const nonUnchanged = result.files.filter(f => f.action !== 'unchanged');
if (nonUnchanged.length > 0) {
  throw new Error('expected all files unchanged in fresh workspace, got: ' + JSON.stringify(nonUnchanged));
}
assert(result.packageJson.action === 'unchanged', 'expected package.json unchanged in fresh workspace, got: ' + result.packageJson.action);
NODE

# 场景 2：在裸 workspace（仅有 package.json，没有任何 4 件套）上跑 bootstrap：
#   - 所有 13 个文件应该 install
#   - package.json 应该被 patch 加上 7 个 guard scripts
BARE="$TMP_WORK/bare-workspace"
mkdir -p "$BARE"
cat >"$BARE/package.json" <<'JSON'
{
  "name": "bare-workspace",
  "private": true,
  "version": "0.0.1",
  "scripts": {
    "publish:all": "lowcode-workspace publish-all"
  }
}
JSON

run_cli skill bootstrap "$BARE" --json >"$TMP_HOME/bootstrap-bare.json"
node - "$TMP_HOME/bootstrap-bare.json" "$BARE" <<'NODE'
const fs = require('fs');
const path = require('path');
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const bareDir = process.argv[3];
function assert(cond, msg) { if (!cond) throw new Error(msg); }

const installed = result.files.filter(f => f.action === 'install').map(f => f.path).sort();
const expected = [
  'AGENTS.md',
  'DELIVERY.md',
  'scripts/guard-publish.mjs',
  '.qoder/rules/openxiangda.md',
  '.qoder/rules/openxiangda-form.md',
  '.qoder/rules/openxiangda-page.md',
  '.qoder/rules/openxiangda-workflow-automation.md',
  '.qoder/rules/openxiangda-resources.md',
  '.cursor/rules/openxiangda.mdc',
  '.cursor/rules/openxiangda-form.mdc',
  '.cursor/rules/openxiangda-page.mdc',
  '.cursor/rules/openxiangda-workflow-automation.mdc',
  '.cursor/rules/openxiangda-resources.mdc',
].sort();
assert(JSON.stringify(installed) === JSON.stringify(expected),
  'unexpected installed list: ' + JSON.stringify(installed));

assert(result.packageJson.action === 'patch', 'expected package.json patch, got: ' + result.packageJson.action);
const addedGuards = result.packageJson.added.sort();
assert(addedGuards.includes('_guard:publish'), 'expected _guard:publish added');
assert(addedGuards.includes('prepublish:all'), 'expected prepublish:all added');
assert(addedGuards.includes('prepublish:oss'), 'expected prepublish:oss added');
assert(addedGuards.includes('preregister'), 'expected preregister added');
assert(addedGuards.includes('preregister-bundle'), 'expected preregister-bundle added');
assert(addedGuards.includes('prepublish:changed'), 'expected prepublish:changed added');
assert(addedGuards.includes('preopenxiangda:publish'), 'expected preopenxiangda:publish added');

// 文件被实际写入
for (const rel of expected) {
  assert(fs.existsSync(path.join(bareDir, rel)), 'file not actually written: ' + rel);
}
const pkg = JSON.parse(fs.readFileSync(path.join(bareDir, 'package.json'), 'utf8'));
assert(pkg.scripts['_guard:publish'] === 'node scripts/guard-publish.mjs', 'guard script not patched');
assert(pkg.scripts['prepublish:all'] === 'pnpm _guard:publish', 'prepublish:all not patched');
assert(pkg.scripts['publish:all'] === 'lowcode-workspace publish-all', 'pre-existing publish:all should be preserved');
const agentsMd = fs.readFileSync(path.join(bareDir, 'AGENTS.md'), 'utf8');
assert(agentsMd.includes('openxiangda design gates --topic permissions --json'), 'bootstrapped AGENTS.md must mention permissions design gate');
assert(agentsMd.includes('openxiangda workspace cleanup --apply'), 'bootstrapped AGENTS.md must define safe task worktree cleanup');
assert(agentsMd.includes('managed-platform-account'), 'bootstrapped AGENTS.md must mention managed platform account mode');
assert(agentsMd.includes('query-param-context'), 'bootstrapped AGENTS.md must mention query-param context mode');
assert(agentsMd.includes('apiPermissionCodes'), 'bootstrapped AGENTS.md must mention role apiPermissionCodes');
assert(agentsMd.includes('app:role:manage'), 'bootstrapped AGENTS.md must mention role setting permission');
const qoderRule = fs.readFileSync(path.join(bareDir, '.qoder', 'rules', 'openxiangda.md'), 'utf8');
assert(qoderRule.includes('openxiangda workspace cleanup'), 'bootstrapped qoder rule must mention task worktree cleanup');
assert(qoderRule.includes('openxiangda design gates --topic permissions --json'), 'bootstrapped qoder rule must mention permissions design gate');
assert(qoderRule.includes('apiPermissionCodes'), 'bootstrapped qoder rule must mention role apiPermissionCodes');
const cursorRule = fs.readFileSync(path.join(bareDir, '.cursor', 'rules', 'openxiangda.mdc'), 'utf8');
assert(cursorRule.includes('openxiangda workspace cleanup'), 'bootstrapped cursor rule must mention task worktree cleanup');
assert(cursorRule.includes('managed-platform-account'), 'bootstrapped cursor rule must mention permission modes');
assert(cursorRule.includes('app:role:manage'), 'bootstrapped cursor rule must mention role setting permission');
NODE

# 场景 3：dry-run 不写文件，但报告与正式跑一致。
DRYRUN="$TMP_WORK/dryrun-workspace"
mkdir -p "$DRYRUN"
cat >"$DRYRUN/package.json" <<'JSON'
{ "name": "dryrun-workspace", "private": true, "version": "0.0.1" }
JSON

run_cli skill bootstrap "$DRYRUN" --dry-run --json >"$TMP_HOME/bootstrap-dryrun.json"
node - "$TMP_HOME/bootstrap-dryrun.json" "$DRYRUN" <<'NODE'
const fs = require('fs');
const path = require('path');
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const dryrunDir = process.argv[3];
function assert(cond, msg) { if (!cond) throw new Error(msg); }
assert(result.dryRun === true, 'expected dryRun=true');
assert(!fs.existsSync(path.join(dryrunDir, 'AGENTS.md')), 'dry-run should not write AGENTS.md');
assert(!fs.existsSync(path.join(dryrunDir, 'scripts', 'guard-publish.mjs')), 'dry-run should not write guard script');
assert(!fs.existsSync(path.join(dryrunDir, '.qoder')), 'dry-run should not create .qoder dir');
assert(!fs.existsSync(path.join(dryrunDir, '.cursor')), 'dry-run should not create .cursor dir');
const pkg = JSON.parse(fs.readFileSync(path.join(dryrunDir, 'package.json'), 'utf8'));
assert(!pkg.scripts || !pkg.scripts['_guard:publish'], 'dry-run should not modify package.json');
NODE

# 场景 4：force 覆盖差异
FORCE_DIR="$TMP_WORK/force-workspace"
run_cli workspace init "$FORCE_DIR" --name force-workspace --json >"$TMP_HOME/init-force.json"
# 故意把 AGENTS.md 改成空字符串模拟 drift
echo "stale" >"$FORCE_DIR/AGENTS.md"
run_cli skill bootstrap "$FORCE_DIR" --json >"$TMP_HOME/bootstrap-force-skip.json"
node - "$TMP_HOME/bootstrap-force-skip.json" <<'NODE'
const fs = require('fs');
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const agentsOp = result.files.find(f => f.path === 'AGENTS.md');
if (!agentsOp || agentsOp.action !== 'skip') throw new Error('expected AGENTS.md to be skipped without --force, got: ' + JSON.stringify(agentsOp));
NODE

run_cli skill bootstrap "$FORCE_DIR" --force --json >"$TMP_HOME/bootstrap-force.json"
node - "$TMP_HOME/bootstrap-force.json" "$FORCE_DIR" <<'NODE'
const fs = require('fs');
const path = require('path');
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const dir = process.argv[3];
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const agentsOp = result.files.find(f => f.path === 'AGENTS.md');
assert(agentsOp && agentsOp.action === 'overwrite', 'expected AGENTS.md to be overwritten with --force, got: ' + JSON.stringify(agentsOp));
const restored = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
assert(restored.includes('openxiangda deploy'), 'AGENTS.md Delivery V2 content was not restored from template');
NODE

# 场景 5：React SPA bootstrap 必须提供完整的 13 个文件，且包含 Delivery V2 说明。
REACT_DIR="$TMP_WORK/react-spa-workspace"
mkdir -p "$REACT_DIR"
cat >"$REACT_DIR/package.json" <<'JSON'
{ "name": "react-spa-workspace", "private": true, "version": "0.0.1" }
JSON
cat >"$REACT_DIR/app-workspace.config.ts" <<'TS'
export default {
  runtimeMode: "react-spa",
};
TS

run_cli skill bootstrap "$REACT_DIR" --json >"$TMP_HOME/bootstrap-react.json"
node - "$TMP_HOME/bootstrap-react.json" "$REACT_DIR" <<'NODE'
const fs = require('fs');
const path = require('path');
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const dir = process.argv[3];
function assert(cond, msg) { if (!cond) throw new Error(msg); }
assert(result.runtime === 'react-spa', 'expected react-spa runtime');
assert(result.files.length === 13, 'expected 13 bootstrap files');
assert(result.files.every(item => item.action === 'install'),
  'react-spa bootstrap must install every source: ' + JSON.stringify(result.files));
for (const item of result.files) {
  assert(fs.existsSync(path.join(dir, item.path)), 'missing react-spa file: ' + item.path);
}
const guard = fs.readFileSync(path.join(dir, 'scripts', 'guard-publish.mjs'), 'utf8');
assert(guard.includes('发布前必须先把批准的提交合并并 push 到权威主线'),
  'react-spa guard must require mainline integration before release');
assert(!guard.includes('正式激活后还必须 merge/push 冻结 SHA'),
  'react-spa guard must not require a post-activation merge');
NODE

echo "skill bootstrap smoke passed"
