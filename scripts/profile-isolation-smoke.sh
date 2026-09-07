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

run_cli platform add dev https://dev.example.test >/dev/null
run_cli platform add prod https://prod.example.test >/dev/null

cd "$TMP_WORK"

run_cli workspace bind --profile dev --app-type APP_DEV >/dev/null
run_cli workspace bind --profile prod --app-type APP_PROD >/dev/null

run_cli form bind customer --form-uuid FORM_DEV --profile dev >/dev/null
run_cli form bind customer --form-uuid FORM_PROD --profile prod >/dev/null
run_cli page bind dashboard --page-id PAGE_DEV --profile dev >/dev/null
run_cli page bind dashboard --page-id PAGE_PROD --profile prod >/dev/null
run_cli workflow bind approval --workflow-id WF_DEV --form-code customer --profile dev >/dev/null
run_cli workflow bind approval --workflow-id WF_PROD --form-code customer --profile prod >/dev/null
run_cli automation bind notify --automation-id AU_DEV --form-code customer --profile dev >/dev/null
run_cli automation bind notify --automation-id AU_PROD --form-code customer --profile prod >/dev/null
run_cli menu bind dashboard_menu --menu-id MENU_DEV --profile dev >/dev/null
run_cli menu bind dashboard_menu --menu-id MENU_PROD --profile prod >/dev/null
run_cli permission role-bind sales --role-id ROLE_DEV --profile dev >/dev/null
run_cli permission role-bind sales --role-id ROLE_PROD --profile prod >/dev/null
run_cli permission page-group-bind sales_pages --group-id PG_DEV --profile dev >/dev/null
run_cli permission page-group-bind sales_pages --group-id PG_PROD --profile prod >/dev/null
run_cli permission form-group-bind customer_view --group-id FG_DEV --form-code customer --profile dev >/dev/null
run_cli permission form-group-bind customer_view --group-id FG_PROD --form-code customer --profile prod >/dev/null

node <<'NODE'
const fs = require('fs');
const state = JSON.parse(fs.readFileSync('.openxiangda/state.json', 'utf8'));
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(state.profiles.dev.appType === 'APP_DEV', 'dev appType mismatch');
assert(state.profiles.prod.appType === 'APP_PROD', 'prod appType mismatch');
assert(state.profiles.dev.resources.forms.customer.formUuid === 'FORM_DEV', 'dev form mapping mismatch');
assert(state.profiles.prod.resources.forms.customer.formUuid === 'FORM_PROD', 'prod form mapping mismatch');
assert(state.profiles.dev.resources.pages.dashboard.pageId === 'PAGE_DEV', 'dev page mapping mismatch');
assert(state.profiles.prod.resources.pages.dashboard.pageId === 'PAGE_PROD', 'prod page mapping mismatch');
assert(state.profiles.dev.resources.workflows.approval.workflowId === 'WF_DEV', 'dev workflow mapping mismatch');
assert(state.profiles.prod.resources.workflows.approval.workflowId === 'WF_PROD', 'prod workflow mapping mismatch');
assert(state.profiles.dev.resources.automations.notify.automationId === 'AU_DEV', 'dev automation mapping mismatch');
assert(state.profiles.prod.resources.automations.notify.automationId === 'AU_PROD', 'prod automation mapping mismatch');
assert(state.profiles.dev.resources.menus.dashboard_menu.menuId === 'MENU_DEV', 'dev menu mapping mismatch');
assert(state.profiles.prod.resources.menus.dashboard_menu.menuId === 'MENU_PROD', 'prod menu mapping mismatch');
assert(state.profiles.dev.resources.roles.sales.roleId === 'ROLE_DEV', 'dev role mapping mismatch');
assert(state.profiles.prod.resources.roles.sales.roleId === 'ROLE_PROD', 'prod role mapping mismatch');
assert(state.profiles.dev.resources.pagePermissionGroups.sales_pages.groupId === 'PG_DEV', 'dev page group mapping mismatch');
assert(state.profiles.prod.resources.pagePermissionGroups.sales_pages.groupId === 'PG_PROD', 'prod page group mapping mismatch');
assert(state.profiles.dev.resources.formPermissionGroups.customer_view.groupId === 'FG_DEV', 'dev form group mapping mismatch');
assert(state.profiles.prod.resources.formPermissionGroups.customer_view.groupId === 'FG_PROD', 'prod form group mapping mismatch');
assert(state.profiles.dev.resources.formPermissionGroups.customer_view.formUuid === 'FORM_DEV', 'dev form group formUuid mismatch');
assert(state.profiles.prod.resources.formPermissionGroups.customer_view.formUuid === 'FORM_PROD', 'prod form group formUuid mismatch');
assert(state.profiles.dev.resources.connectors && typeof state.profiles.dev.resources.connectors === 'object', 'dev connectors bucket missing');
assert(state.profiles.dev.resources.formSettings && typeof state.profiles.dev.resources.formSettings === 'object', 'dev formSettings bucket missing');
NODE

echo "profile isolation smoke passed"
