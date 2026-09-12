---
description: src/resources/** glob — 精准引导到 connector / data-view / notification / role / permission / settings 资源 manifest
glob: src/resources/**/*
alwaysApply: false
---

# OpenXiangda Resource Manifests

You are editing engineering-managed resource manifests under `src/resources/`. **All平台资源 ID 由 CLI 解析**；本地只用逻辑 code。

## 必看：复制即用速查

`references/resource-manifest-cheatsheet.md`（installed at `~/.qoder/skills/openxiangda/references/resource-manifest-cheatsheet.md`）— connector / data-view / notification / workflow / automation / JS_CODE / role / page-group / form-group / settings / menu 骨架。

编辑 `roles`、`permissions/page-groups`、`permissions/form-groups` 前，如果需求涉及账号、角色、数据范围、组织账号、RBAC 或查询参数授权，先运行 `openxiangda design gates --topic permissions --json`，选择权限模式并输出权限矩阵。

如果 `roles/<code>.json` 代表的角色需要新增角色、分配成员、授接口权限、维护权限组或管理组织账号，必须声明 `apiPermissionCodes`；只写业务角色名不会获得这些后端接口权限。

## 文件夹与对应 skill

| 路径 | 用途 | 主导 skill |
|---|---|---|
| `src/resources/connectors/<code>.json` | 第三方 / 自建系统 HTTP 连接器 | `openxiangda-page` |
| `src/resources/data-views/<code>.json` | 多表只读联表（materialized view） | `openxiangda-form` |
| `src/resources/notifications/<code>.json` | 通知模板 + typeConfigs | `openxiangda-page` / `-workflow-automation` |
| `src/resources/workflows/<code>/{workflow.json,definition.v3.json,preview.json}` | 工作流 manifest | `openxiangda-workflow-automation` |
| `src/resources/automations/<code>/{definition.code.json,preview.json}` | 自动化 manifest | `openxiangda-workflow-automation` |
| `src/resources/roles/<code>.json` | 角色 | `openxiangda-permission-settings` |
| `src/resources/permissions/page-groups/<code>.json` | 页面权限组 | `openxiangda-permission-settings` |
| `src/resources/permissions/form-groups/<formCode>/<code>.json` | 表单权限组 | `openxiangda-permission-settings` |
| `src/resources/settings/forms/<formCode>.json` | 表单设置 / 索引 / 数据管理页 / 公开访问 | `openxiangda-permission-settings` |
| `src/resources/menus/<code>.json` | 菜单 | `openxiangda-app` |

## 命令

```bash
openxiangda resource validate <type> --only <codes> --profile <name> # 静态校验
openxiangda resource plan     <type> --only <codes> --profile <name> # diff 本地 vs. 平台
openxiangda resource publish  <type> --only <codes> --profile <name> # 精确 upsert
openxiangda resource publish  <type> --code <code> --profile <name>  # 单资源等价写法
openxiangda resource pull     --profile <name>          # 平台 → 本地
```

Function/Automation 仅因源码变化进入 scope 时，默认通过服务端字段 PATCH 只更新 source snapshot，并保留线上 bindings、contracts、metadata、trigger/view 配置和 enabled/published state。无源码且 `definitionJson.version="v3"` 完整的新建 Automation 自动走 manifest create；确需让本地整包 manifest 覆盖已有线上定义时，必须追加 `--replace-manifest --reason "..."`。正式发布先 `release begin --change <change>` 分别冻结 clean publish HEAD 与 change/远端 baseline 并整体 preflight；`SOURCE_BASE_DIVERGED` / `RELEASE_SOURCE_BEHIND_MAIN` / `RESOURCE_FIELD_CONFLICT` 不能强行重试。上线后 merge/push 冻结 SHA，验证 `release integration-status`，再正常 `release end`。

`resource plan` 与 publish dry-run 严格只允许 GET/HEAD。遇到 `READ_ONLY_AUTH_REQUIRED` 时，先执行 `openxiangda auth refresh --profile <name>` 或重新登录再重试；不得在 plan 内自动 POST 刷新 token。

精确 `--only/--code` 会在 manifest/source 分析与 JS_CODE 构建前收窄，只触碰目标及其传递/shared/ambient 依赖；只有明确的全工作区任务才省略 selector。

## 严禁

- ❌ 把 `formUuid` / `pageId` / `workflowId` 等平台 ID 直接写进 manifest（CLI 解析逻辑 code）。
- ❌ 把 API key / token / secret / password / authorization / headers / credential 写进 manifest（平台后台配置）。
- ✅ App Function 只在 manifest 顶层写逻辑名 `secretRefs`，使用 `function_v2` / `trusted_node_v2` 和 `ctx.secrets.get(name)`；值仅由 `openxiangda secret ... --value-stdin --change ... --profile ...` 管理。
- ✅ 外部回调在 `src/resources/webhooks/*.json` 只绑定固定 `targetFunctionCode`；验签必须先使用 `input.rawBody`，业务写入必须使用 `input.idempotencyKey` 幂等，Secret/签名规则不写进 Webhook manifest。
- ❌ data view 用作单表 CRUD、`linkedForm` 下拉、写回、强实时数据源。
- ❌ 只靠 query 参数、前端隐藏按钮、硬编码角色、mock 权限或 `PermissionBoundary` 作为敏感授权。
- ❌ 管理型角色缺少 `app:role:manage`、`app:page-permission-group:manage`、`app:form-permission-group:manage` 或 `app:organization:manage`。
- ❌ 在 page 源里 hardcode `/api/notification-config/*` 或 `/connectors/actions/invoke`（用 `sdk.notification` / `sdk.connector`）。
- ❌ 同时在 manifest 与平台后台编辑同一个资源（漂移源）。
