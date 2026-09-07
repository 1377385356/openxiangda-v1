# OpenXiangda Skill Refactor Plan

## Goal

把 `ai-lowcode-skills` 从“控制台产品 + 固定全链路编排 + 严格 contracts”重构为 OpenXiangda 的轻量 skill 包。

OpenXiangda 只负责让 AI 工具安全、稳定地操作私有化低代码平台：

- 用户先指定平台域名。
- 用户通过普通平台登录完成授权。
- CLI 保存用户 token 和 profile。
- AI 通过 CLI/API 进行应用、表单、页面、流程、自动化、权限等操作。
- 不再要求 AK/SK。
- 不再内置 Spec 门禁、PM 文档、固定多 agent 流程和控制台前端。

## Current Inventory

`ai-lowcode-skills` 当前是重型体系：

- 32 个 skill。
- 48 个 schema contract、47 个 markdown contract。
- 多个 supporting apps：`codex-backend`、`codex-frontend`、`codex-desktop`。
- 以 `Router -> Spec -> architecture-plan -> page-plan -> design/provision -> review` 为固定主链路。

OpenXiangda 目标形态：

- 1 个根 skill。
- 5 到 7 个可选子 skill。
- 少量 reference 文档，不再复制大量 contracts。
- 平台真实操作下沉到 `openxiangda` CLI 和 `/openxiangda-api/v1`。

## Keep / Merge / Drop

### Keep As OpenXiangda Core

| Old skill | OpenXiangda target | Action |
| --- | --- | --- |
| `ai-lowcode-app-provision` | `openxiangda-app` + `openxiangda-workspace` | 保留应用创建、工作区初始化、profile/appType 绑定；去掉 GitLab/控制台态。 |
| `ai-lowcode-app-memory` | `openxiangda-workspace` | 改成 `.openxiangda/state.json` 轻量资源映射；不再维护 `.ai-lowcode` 长期记忆层。 |
| `ai-lowcode-platform-api-inspect` | `openxiangda-inspect` | 从旧 `/dingtalk-api/v1.0` 改成 `/openxiangda-api/v1` + snapshot/read endpoints。 |
| `sy-lowcode-form-schema` | `openxiangda-form` reference | 保留 FormSchema 类型、字段组件、布局规则；不作为重型 contract 输出链路。 |
| `ai-lowcode-form-provision` | `openxiangda-form` | 改为 workspace publish + user token。 |
| `ai-lowcode-code-page-dev` | `openxiangda-page` | 保留 React/AntD/sy-page-sdk 开发规范。 |
| `ai-lowcode-code-page-release` | `openxiangda-page` | 改为 `openxiangda workspace publish --profile ...`。 |
| `ai-lowcode-workflow-design` | `openxiangda-workflow` | 保留 v3 workflow 定义规则。 |
| `ai-lowcode-workflow-provision` | `openxiangda-workflow` | 改为新 API 的 user token 权限执行。 |
| `ai-lowcode-automation-design` | `openxiangda-automation` | 保留 designer-v3 自动化定义规则。 |
| `ai-lowcode-automation-provision` | `openxiangda-automation` | 改为新 API 的 user token 权限执行。 |
| `ai-lowcode-permission-design` | `openxiangda-permission` | 保留权限拓扑设计方法。 |
| `ai-lowcode-permission-provision` | `openxiangda-permission` | 改为新 API 的 user token 权限执行。 |
| `ai-lowcode-form-settings-*` | `openxiangda-settings` | 合并为单个设置能力说明。 |
| `ai-lowcode-app-settings-*` | `openxiangda-settings` | 合并为单个设置能力说明。 |
| `ai-lowcode-menu-assembly` | `openxiangda-app` reference | 菜单树规则保留为 reference。 |

### Drop From OpenXiangda Package

| Old skill / area | Reason |
| --- | --- |
| `ai-lowcode-console-router` | 这是控制台产品入口，不适合 OpenXiangda；交给使用者自己的 AI 工具。 |
| `ai-lowcode-orchestrator` | 固定编排过重；OpenXiangda 只提供能力，不规定流程。 |
| `ai-lowcode-spec-gate` | 不再强制 Spec 门禁。 |
| `ai-lowcode-requirement-analysis`、`ai-lowcode-page-design` | 可作为 AI 自行分析参考，不作为 OpenXiangda 必备 skill。 |
| `ai-lowcode-pm-prd`、`ai-lowcode-product-doc` | 产品文档不是 OpenXiangda 核心能力。 |
| `ai-lowcode-ui-design`、`ai-lowcode-visual-review` | 视觉设计交给 AI 工具自身；OpenXiangda 不绑定 imagegen 流程。 |
| `ai-lowcode-integration-test` | 保留为项目测试建议，不进入核心 skill。 |
| `ai-lowcode-knowledge` | 平台级知识库是控制台能力，不进入 OpenXiangda。 |
| `ai-lowcode-deploy-ops` | 这是旧控制台部署运维，不进入 OpenXiangda。 |
| `antd`、`ui-ux-pro-max` | 通用技能，不内置到 OpenXiangda。 |
| `apps/codex-*`、`deploy/*` | 不是 skill 能力，全部剥离。 |

## Target Skill Structure

```text
openxiangda/
├── bin/openxiangda.js
├── lib/
├── docs/
└── openxiangda-skills/
    ├── SKILL.md
    ├── skills/
    │   ├── openxiangda-core/
    │   ├── openxiangda-app/
    │   ├── openxiangda-form/
    │   ├── openxiangda-page/
    │   ├── openxiangda-workflow-automation/
    │   ├── openxiangda-permission-settings/
    │   └── openxiangda-inspect/
    └── references/
        ├── openxiangda-api.md
        ├── workspace-state.md
        ├── form-schema.md
        ├── page-sdk.md
        ├── publish-flow.md
        ├── workflow-v3.md
        ├── automation-v3.md
        └── permissions-settings.md
```

### Skill Responsibilities

`openxiangda-core`

- 平台域名、profile、多平台切换。
- 登录、刷新、退出、环境检查。
- 任何操作前检查 `openxiangda env` 和 `auth status`。

`openxiangda-app`

- 应用创建、列表、绑定。
- 菜单树、应用快照。
- `.openxiangda/state.json` 的 app/resource 映射规则。

`openxiangda-form`

- FormSchema 生成规则。
- 表单 bundle 结构。
- 表单发布、更新、资源 ID 回填。

`openxiangda-page`

- `sy-lowcode-app-workspace` 代码页开发规范。
- `sy-page-sdk` 使用规范。
- 代码页发布、版本、路由和菜单绑定。

`openxiangda-workflow-automation`

- 流程 v3 定义。
- 自动化 designer-v3 定义。
- 保存、发布、启用、资源回填。

`openxiangda-permission-settings`

- 应用角色、页面权限组、表单权限组。
- 表单基础设置、索引、数据管理页、公开访问。
- 不再拆 design/provision 两套 skill。

`openxiangda-inspect`

- 只读诊断。
- `app snapshot`、资源状态核对、发布问题排查。
- 写操作必须回到对应能力 skill。

## Backend API Needed

已完成基础：

- `POST /openxiangda-api/v1/auth/cli-sessions`
- `GET /openxiangda-api/v1/auth/cli-sessions/:sessionId`
- `GET /openxiangda-api/v1/auth/cli-sessions/:sessionId/login`
- `POST /openxiangda-api/v1/auth/cli-sessions/:sessionId/confirm`
- `GET /openxiangda-api/v1/auth/whoami`
- `POST /openxiangda-api/v1/auth/refresh`
- `POST /openxiangda-api/v1/auth/logout`
- `GET /openxiangda-api/v1/apps`
- `POST /openxiangda-api/v1/apps`
- `GET /openxiangda-api/v1/apps/:appType`
- `PUT /openxiangda-api/v1/apps/:appType`
- `GET /openxiangda-api/v1/apps/:appType/forms`
- `GET /openxiangda-api/v1/apps/:appType/menus`
- `GET /openxiangda-api/v1/apps/:appType/snapshot`
- `POST /openxiangda-api/v1/apps/:appType/forms`
- `GET /openxiangda-api/v1/apps/:appType/forms/:formUuid`
- `PUT /openxiangda-api/v1/apps/:appType/forms/:formUuid`
- `PUT /openxiangda-api/v1/apps/:appType/forms/:formUuid/schema`
- `POST /openxiangda-api/v1/apps/:appType/forms/:formUuid/publish`
- `GET /openxiangda-api/v1/apps/:appType/forms/:formUuid/settings`
- `PUT /openxiangda-api/v1/apps/:appType/forms/:formUuid/settings`
- `GET /openxiangda-api/v1/apps/:appType/forms/:formUuid/field-indexes`
- `PUT /openxiangda-api/v1/apps/:appType/forms/:formUuid/field-indexes`
- `GET /openxiangda-api/v1/apps/:appType/forms/:formUuid/data-management`
- `PUT /openxiangda-api/v1/apps/:appType/forms/:formUuid/data-management`
- `GET /openxiangda-api/v1/apps/:appType/forms/:formUuid/public-access`
- `PUT /openxiangda-api/v1/apps/:appType/forms/:formUuid/public-access`
- `DELETE /openxiangda-api/v1/apps/:appType/forms/:formUuid/public-access`
- `GET /openxiangda-api/v1/apps/:appType/pages`
- `POST /openxiangda-api/v1/apps/:appType/pages/manifest/import`
- `GET /openxiangda-api/v1/apps/:appType/pages/releases`
- `POST /openxiangda-api/v1/apps/:appType/pages/releases/activate`
- `POST /openxiangda-api/v1/apps/:appType/pages/publish`
- `POST /openxiangda-api/v1/apps/:appType/pages/:pageCode/publish`
- `GET /openxiangda-api/v1/apps/:appType/pages/:pageKey/bootstrap`
- `POST /openxiangda-api/v1/apps/:appType/menus`
- `PUT /openxiangda-api/v1/apps/:appType/menus/:menuId`
- `DELETE /openxiangda-api/v1/apps/:appType/menus/:menuId`
- `PUT /openxiangda-api/v1/apps/:appType/menus/actions/sort`
- `GET /openxiangda-api/v1/apps/:appType/workflows`
- `POST /openxiangda-api/v1/apps/:appType/workflows`
- `POST /openxiangda-api/v1/apps/:appType/workflows/definition/validate`
- `GET /openxiangda-api/v1/apps/:appType/workflows/:workflowId`
- `PUT /openxiangda-api/v1/apps/:appType/workflows/:workflowId`
- `POST /openxiangda-api/v1/apps/:appType/workflows/:workflowId/publish`
- `DELETE /openxiangda-api/v1/apps/:appType/workflows/:workflowId`
- `GET /openxiangda-api/v1/apps/:appType/automations`
- `POST /openxiangda-api/v1/apps/:appType/automations`
- `POST /openxiangda-api/v1/apps/:appType/automations/definition/validate`
- `POST /openxiangda-api/v1/apps/:appType/automations/cron/validate`
- `GET /openxiangda-api/v1/apps/:appType/automations/:automationId`
- `PUT /openxiangda-api/v1/apps/:appType/automations/:automationId`
- `POST /openxiangda-api/v1/apps/:appType/automations/:automationId/publish`
- `POST /openxiangda-api/v1/apps/:appType/automations/:automationId/unpublish`
- `POST /openxiangda-api/v1/apps/:appType/automations/:automationId/enable`
- `POST /openxiangda-api/v1/apps/:appType/automations/:automationId/disable`
- `DELETE /openxiangda-api/v1/apps/:appType/automations/:automationId`
- `GET /openxiangda-api/v1/apps/:appType/automations/:automationId/versions`
- `GET /openxiangda-api/v1/apps/:appType/automations/:automationId/executions`
- `GET /openxiangda-api/v1/apps/:appType/roles`
- `POST /openxiangda-api/v1/apps/:appType/roles`
- `GET /openxiangda-api/v1/apps/:appType/roles/:roleId`
- `PUT /openxiangda-api/v1/apps/:appType/roles/:roleId`
- `DELETE /openxiangda-api/v1/apps/:appType/roles/:roleId`
- `GET /openxiangda-api/v1/apps/:appType/roles/:roleId/users`
- `POST /openxiangda-api/v1/apps/:appType/roles/:roleId/users`
- `DELETE /openxiangda-api/v1/apps/:appType/roles/:roleId/users/:userId`
- `GET /openxiangda-api/v1/apps/:appType/page-permission-groups`
- `POST /openxiangda-api/v1/apps/:appType/page-permission-groups`
- `GET /openxiangda-api/v1/apps/:appType/page-permission-groups/:groupId`
- `PUT /openxiangda-api/v1/apps/:appType/page-permission-groups/:groupId`
- `DELETE /openxiangda-api/v1/apps/:appType/page-permission-groups/:groupId`
- `GET /openxiangda-api/v1/apps/:appType/page-permission-groups/user-menu-permissions`
- `GET /openxiangda-api/v1/apps/:appType/forms/:formUuid/permission-groups`
- `POST /openxiangda-api/v1/apps/:appType/forms/:formUuid/permission-groups`
- `GET /openxiangda-api/v1/apps/:appType/forms/:formUuid/permission-groups/:groupId`
- `PUT /openxiangda-api/v1/apps/:appType/forms/:formUuid/permission-groups/:groupId`
- `DELETE /openxiangda-api/v1/apps/:appType/forms/:formUuid/permission-groups/:groupId`
- `GET /openxiangda-api/v1/apps/:appType/forms/:formUuid/permission-summary`
- `GET /openxiangda-api/v1/apps/:appType/forms/:formUuid/field-permissions`

下一批必须补齐：

| Area | Endpoints |
| --- | --- |
| Real platform acceptance | dev/prod profile isolation test with real private platform domains and扫码登录 |

API 设计原则：

- 全部走 Bearer token。
- 权限与前端用户一致。
- 响应结构为 AI 友好摘要，不暴露无关内部字段。
- 写接口使用 logical code 支持幂等 upsert，避免多平台资源 ID 混用。

## CLI Needed

已完成基础：

- `openxiangda login`
- `openxiangda platform add/list/use/remove`
- `openxiangda auth status/refresh/logout`
- `openxiangda env`
- `openxiangda app list/create/snapshot`
- `openxiangda workspace bind/publish`
- `openxiangda form list/create/bind/pull/publish`
- `openxiangda page list/publish/bind/releases/activate`
- `openxiangda menu list/create/bind/delete`
- `openxiangda workflow list/create/bind/pull/publish/delete/validate`
- `openxiangda automation list/create/bind/pull/publish/unpublish/enable/disable/delete/validate/cron-validate`
- `openxiangda permission role-list/role-create/role-bind/role-users/role-add-users`
- `openxiangda permission page-group-list/page-group-create/page-group-bind`
- `openxiangda permission form-group-list/form-group-create/form-group-bind/form-summary/menu-permissions`
- `openxiangda settings get/save/indexes/indexes-save/data-management/data-management-save/public-access/public-access-save/public-access-delete`
- `openxiangda inspect app/form/workflow/automation/permissions`
- `sy-lowcode-workspace-tools` supports `OPENXIANGDA_BASE_URL`、`OPENXIANGDA_ACCESS_TOKEN`、`OPENXIANGDA_APP_TYPE`

下一批 CLI：

```bash
openxiangda form list --profile dev
openxiangda form pull <formCode> --profile dev
openxiangda form publish <formCode> --profile dev

openxiangda page list --profile dev
openxiangda page publish <pageCode> --profile dev

openxiangda inspect app --profile dev --json
```

## Workspace State

Replace old `.ai-lowcode/` with:

```json
{
  "version": 1,
  "profiles": {
    "dev": {
      "baseUrl": "https://dev.example.com",
      "appType": "APP_DEV",
      "resources": {
        "forms": {
          "customer": { "formUuid": "FORM_..." }
        },
        "pages": {
          "dashboard": { "pageId": "..." }
        },
        "workflows": {},
        "automations": {},
        "menus": {},
        "roles": {},
        "pagePermissionGroups": {},
        "formPermissionGroups": {}
      }
    }
  }
}
```

Rules:

- Local key is always logical code.
- Live ID is always nested under profile.
- Never store tokens in project state.
- `workspace publish --profile prod` must never read IDs from `dev`.

## Migration Phases

### Phase 1: Stabilize OpenXiangda Auth And Profile

- Finish browser login page integration with existing frontend redirect behavior.
- Add CLI session confirmation UX.
- Add token masking to CLI errors and backend logs.
- Add auth endpoint tests.

Exit criteria:

- `openxiangda login <domain> --profile dev` works on a real private platform.
- `openxiangda auth status` returns current user/tenant/admin scope.

### Phase 2: Build Token-Based Publish API

- Add OpenXiangda form/page publish endpoints.
- Update `sy-lowcode-app-workspace` publish scripts to read:
  - `OPENXIANGDA_BASE_URL`
  - `OPENXIANGDA_ACCESS_TOKEN`
  - `OPENXIANGDA_APP_TYPE`
- Remove AK/SK assumptions from workspace publish path.

Exit criteria:

- Same workspace can publish to `dev` and `prod` by changing only `--profile`.

### Phase 3: Compress Skills

- Create the 7 target subskills.
- Move only essential rules from old skills into references.
- Remove copied contract duplicates.
- Replace fixed task/result contracts with CLI-first examples.

Exit criteria:

- OpenXiangda skill package can fit in one lightweight install.
- Root `SKILL.md` tells AI what to do without forcing a fixed workflow.

### Phase 4: Migrate Core Domain Knowledge

- FormSchema: migrate component registry, layout, rules.
- Code page: migrate workspace structure, SDK API, publish flow.
- Workflow/automation: migrate v3 schema rules and blockers.
- Permission/settings: migrate platform truth docs.

Exit criteria:

- AI can create app/forms/pages/workflows/permissions using OpenXiangda skills without loading old `ai-lowcode-*`.

### Phase 5: Retire Heavy Console Coupling

- Remove dependency on:
  - `apps/codex-*`
  - `.ai-lowcode/`
  - OpenSpec gate
  - product doc chain
  - old dingtalk AK/SK API
- Keep old repo only as archive/reference during transition.

Exit criteria:

- New work starts from `openxiangda` only.
- Old skills are not installed by default.

## First Implementation Backlog

1. Backend: implement `/openxiangda-api/v1/apps/:appType/forms/*`.
2. Backend: implement `/openxiangda-api/v1/apps/:appType/pages/*`.
3. Workspace: migrate publish scripts to `OPENXIANGDA_ACCESS_TOKEN`. Done in `sy-lowcode-app-workspace` commit `3ae294f`.
4. CLI: add `inspect app`.
5. Skills: create `openxiangda-app`, `openxiangda-form`, `openxiangda-page`. Done in OpenXiangda task 4.
6. References: migrate `form-schema-types.md`, `component-registry.md`, `workspace-structure.md`, `page-sdk-api.md`, `publish-flow.md`. Initial lightweight references done in OpenXiangda task 4.
7. Backend/CLI: implement workflow and automation APIs and commands. Done in backend commit `1bcb6ab`.
8. Backend/CLI: implement role and permission group APIs and commands. Done in backend commit `d134c2f`.
9. Backend/CLI: implement form settings, field indexes, data management, and public access APIs and commands. Done in backend commit `006caf0`.
10. CLI/skills: implement read-only inspect aliases. Done in OpenXiangda task 9.
11. Tests: dev/prod profile isolation smoke test with two local profiles. Done in OpenXiangda task 10.
12. Acceptance: run the same flow against real dev/prod private platform domains after domains and login are available.
