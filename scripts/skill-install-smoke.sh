#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_HOME="$(mktemp -d)"
TMP_CODEX_HOME="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_HOME" "$TMP_CODEX_HOME"
}
trap cleanup EXIT

run_cli() {
  HOME="$TMP_HOME" CODEX_HOME="$TMP_CODEX_HOME" node "$ROOT_DIR/bin/openxiangda.js" "$@"
}

SKILLS_DIR="$TMP_CODEX_HOME/skills"

mkdir -p "$SKILLS_DIR/openxiangda"
printf '%s\n' 'unified launcher router' >"$SKILLS_DIR/openxiangda/SKILL.md"

mkdir -p "$SKILLS_DIR/openxiangda-v2"
printf '%s\n' 'independently managed unified 2.0 skill' >"$SKILLS_DIR/openxiangda-v2/SKILL.md"

for retired_skill in openxiangda-v2-architecture openxiangda-v1-maintenance; do
  mkdir -p "$SKILLS_DIR/$retired_skill"
  printf '%s\n' 'obsolete embedded skill' >"$SKILLS_DIR/$retired_skill/SKILL.md"
done
printf '%s\n' '{"manager":"openxiangda","packageVersion":"1.0.266","sourceRelativePath":"v2/skills/openxiangda-v2-architecture"}' >"$SKILLS_DIR/openxiangda-v2-architecture/.openxiangda-skill-install.json"
printf '%s\n' '{"manager":"openxiangda","packageVersion":"1.0.266","sourceRelativePath":"v2/skills/openxiangda-v1-maintenance"}' >"$SKILLS_DIR/openxiangda-v1-maintenance/.openxiangda-skill-install.json"

run_cli skill install --json >"$TMP_HOME/openxiangda-skill-install.json"

node - "$SKILLS_DIR" <<'NODE'
const fs = require('fs');
const path = require('path');

const skillsDir = process.argv[2];
if (fs.readFileSync(path.join(skillsDir, "openxiangda", "SKILL.md"), "utf8").trim() !== "unified launcher router") throw new Error("V1 overwrote the unified routing skill");
const expected = [
  'openxiangda-v1',
  'openxiangda-core',
  'openxiangda-app',
  'openxiangda-architecture-design',
  'openxiangda-form',
  'openxiangda-page',
  'openxiangda-workflow-automation',
  'openxiangda-permission-settings',
  'openxiangda-inspect',
  'openxiangda-open-api',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const name of expected) {
  const dir = path.join(skillsDir, name);
  const skillFile = path.join(dir, 'SKILL.md');
  const manifestFile = path.join(dir, '.openxiangda-skill-install.json');
  const agentFile = path.join(dir, 'agents', 'openai.yaml');
  assert(fs.existsSync(skillFile), `${name} missing SKILL.md`);
  assert(fs.readFileSync(skillFile, 'utf8').startsWith('---\n'), `${name} missing frontmatter`);
  assert(fs.existsSync(manifestFile), `${name} missing install manifest`);
  assert(fs.existsSync(agentFile), `${name} missing agents/openai.yaml`);
}

assert(
  fs.existsSync(path.join(skillsDir, 'openxiangda-v2-architecture')),
  'V1 must preserve skills owned by the former V2 distribution'
);
assert(
  fs.existsSync(path.join(skillsDir, 'openxiangda-v1-maintenance')),
  'V1 must not delete the former V2 bridge skill'
);
assert(
  fs.readFileSync(path.join(skillsDir, 'openxiangda-v2', 'SKILL.md'), 'utf8').includes('independently managed'),
  'independently managed unified 2.0 skill was removed'
);

const formSkill = fs.readFileSync(path.join(skillsDir, 'openxiangda-form', 'SKILL.md'), 'utf8');
assert(!formSkill.includes('../../references/'), 'subskill reference path was not rewritten');
assert(
  fs.existsSync(path.join(skillsDir, 'openxiangda-form', 'references', 'forms', 'form-schema.md')),
  'subskill references were not copied'
);
assert(
  fs.existsSync(path.join(skillsDir, 'openxiangda-v1', 'references', 'openxiangda-api.md')),
  'root references were not copied'
);
assert(
  fs.existsSync(path.join(skillsDir, 'openxiangda-v1', 'references', 'resource-manifest-cheatsheet.md')),
  'resource-manifest-cheatsheet.md not installed to root skill references'
);
assert(
  fs.existsSync(path.join(skillsDir, 'openxiangda-v1', 'references', 'architecture-design.md')),
  'architecture-design.md not installed to root skill references'
);
assert(
  fs.existsSync(path.join(skillsDir, 'openxiangda-form', 'references', 'resource-manifest-cheatsheet.md')),
  'resource-manifest-cheatsheet.md not installed to subskill references'
);
assert(
  fs.existsSync(path.join(skillsDir, 'openxiangda-architecture-design', 'references', 'architecture-design.md')),
  'architecture-design.md not installed to architecture design subskill references'
);
assert(
  fs.existsSync(path.join(skillsDir, 'openxiangda-open-api', 'references', 'dingtalk-api.openapi.json')),
  'DingTalk OpenAPI snapshot not installed to open API subskill'
);
assert(
  fs.existsSync(path.join(skillsDir, 'openxiangda-open-api', 'references', 'backend-authentication.md')),
  'backend authentication reference not installed to open API subskill'
);
assert(
  !fs.existsSync(path.join(skillsDir, 'openxiangda-form', 'references', 'dingtalk-api.openapi.json')),
  'large DingTalk OpenAPI snapshot leaked into unrelated subskills'
);
assert(
  !fs.existsSync(path.join(skillsDir, 'openxiangda-v1', 'skills')),
  'root skill must not contain nested subskills'
);
const rootSkill = fs.readFileSync(path.join(skillsDir, 'openxiangda-v1', 'SKILL.md'), 'utf8');
assert(!rootSkill.includes('`skills/openxiangda-core/SKILL.md`'), 'root skill still points at nested subskills');
assert(rootSkill.includes('`../openxiangda-core/SKILL.md`'), 'root skill did not rewrite subskill paths');
assert(rootSkill.includes('`../openxiangda-open-api/SKILL.md`'), 'root skill did not link open API subskill');
NODE

mkdir -p "$SKILLS_DIR/openxiangda/skills/openxiangda-core"
printf '%s\n' 'legacy nested subskill' >"$SKILLS_DIR/openxiangda/skills/openxiangda-core/SKILL.md"
run_cli skill install --json >"$TMP_HOME/openxiangda-skill-install-second.json"
node - "$SKILLS_DIR" <<'NODE'
const fs = require('fs');
const path = require('path');
const manifest = JSON.parse(
  fs.readFileSync(path.join(process.argv[2], 'openxiangda-v1', '.openxiangda-skill-install.json'), 'utf8')
);
if (manifest.manager !== 'openxiangda') {
  throw new Error('idempotent install lost OpenXiangda manager marker');
}
if (fs.existsSync(path.join(process.argv[2], 'openxiangda-v1', 'skills'))) {
  throw new Error('idempotent install did not remove legacy nested subskills');
}
NODE

DRY_RUN_HOME="$(mktemp -d)"
trap 'rm -rf "$TMP_HOME" "$TMP_CODEX_HOME" "$DRY_RUN_HOME"' EXIT
HOME="$TMP_HOME" CODEX_HOME="$DRY_RUN_HOME" node "$ROOT_DIR/bin/openxiangda.js" skill install --dry-run --json >"$TMP_HOME/openxiangda-skill-dry-run.json"
if [ -e "$DRY_RUN_HOME/skills/openxiangda-v1" ]; then
  echo "dry-run created skill files" >&2
  exit 1
fi

CONFLICT_HOME="$(mktemp -d)"
trap 'rm -rf "$TMP_HOME" "$TMP_CODEX_HOME" "$DRY_RUN_HOME" "$CONFLICT_HOME"' EXIT
mkdir -p "$CONFLICT_HOME/skills/openxiangda-v1"
printf '%s\n' 'foreign skill' >"$CONFLICT_HOME/skills/openxiangda-v1/SKILL.md"
if HOME="$TMP_HOME" CODEX_HOME="$CONFLICT_HOME" node "$ROOT_DIR/bin/openxiangda.js" skill install >"$TMP_HOME/openxiangda-skill-conflict.log" 2>&1; then
  echo "install did not reject foreign skill" >&2
  exit 1
fi
HOME="$TMP_HOME" CODEX_HOME="$CONFLICT_HOME" node "$ROOT_DIR/bin/openxiangda.js" skill install --force --json >"$TMP_HOME/openxiangda-skill-force.json"
node - "$CONFLICT_HOME/skills" <<'NODE'
const fs = require('fs');
const path = require('path');
const manifest = JSON.parse(
  fs.readFileSync(path.join(process.argv[2], 'openxiangda-v1', '.openxiangda-skill-install.json'), 'utf8')
);
if (manifest.manager !== 'openxiangda') {
  throw new Error('--force did not replace foreign skill');
}
NODE

run_cli skill status --json >"$TMP_HOME/openxiangda-skill-status.json"

echo "skill install smoke passed"
