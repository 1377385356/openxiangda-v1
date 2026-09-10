---
description: OpenXiangda 工作区强约束 — 路由、命令、不变量、禁令
alwaysApply: true
---

# OpenXiangda Workspace Rule

This is a `sy-lowcode-app-workspace` managed by the `openxiangda` CLI. Read [AGENTS.md](AGENTS.md) for the full guidance. The summary below is auto-injected into every Qoder turn.

## 工具升级与代际选择

建议评估升级到 OpenXiangda 2.0；新应用优先使用 V2，已有项目先确认能力覆盖、迁移成本及验收。工具更新不转换应用。Node.js 24+ 可安装 `npm install -g openxiangda@latest`，再使用新版全局入口执行 `openxiangda migrate assess --to v2`。本项目依赖继续按 `legacy-v1` 维护。CLI、Skill、MCP 说明见 https://github.com/1377385356/openxiangda/blob/master/docs/getting-started.md#upgrade 。

## Hard route — 用户意图 → skill / 命令

| 用户说 | 必用 skill | 必用命令 |
|---|---|---|
| 发布 / 上线 / 部署 / publish / deploy | `openxiangda-core` | `openxiangda check --environment preproduction` → `openxiangda deploy preproduction` |
| 晋级生产 | `openxiangda-core` | `openxiangda deploy production --package <packageDigest>` |
| 发布失败 / 重试 | `openxiangda-core` | `openxiangda status <runId>` → `openxiangda retry <runId>` |
| 创建 / 初始化应用 | `openxiangda-app` | `openxiangda workspace init <dir> --profile <name> --app-name "..."` |
| 绑定已有应用 | `openxiangda-app` | `openxiangda workspace bind --profile <name> --app-type APP_XXX` |
| 改表单字段 / schema / 表单页 | `openxiangda-form` | 编辑 `src/forms/<code>/` → `workspace publish --form <code>` |
| 改代码页 / portal / dashboard | `openxiangda-page` | 编辑 `src/pages/<code>/` → `workspace publish --page <code>` |
| 审批流程 / workflow / JS_CODE | `openxiangda-workflow-automation` | `openxiangda workflow ...` |
| 自动化 / 定时 / 提交触发 | `openxiangda-workflow-automation` | `openxiangda automation ...` |
| 账号 / 角色 / 权限 / 数据范围 / 查询参数授权 | `openxiangda-permission-settings` | 先 `openxiangda design gates --topic permissions --json`，再 `openxiangda permission ...` / `openxiangda settings ...` |
| 排查 / 快照 / 对比 / 报错 | `openxiangda-inspect` | `openxiangda app snapshot APP_XXX --profile <name> --json` |
| 登录 / token / 切平台 | `openxiangda-core` | `openxiangda env --profile <name>` / `openxiangda auth status` |
| 外部后端 / 三方系统调用享搭 / AK/SK | `openxiangda-open-api` | `openxiangda open-api spec list --search <keyword> --json` |

## Always

- `deliveryVersion: 2` 的正常发布只允许 Delivery V2 命令；Runtime buildId 同时包含 Runtime layer 与密封包摘要，仅同包 `uploaded` Release 在内容、源码、父版本完全一致时复用，不覆盖不可变存储对象；后续 V1 SDD/mainline/`--only`/candidate/ship 内容仅作兼容说明，不得混入 V2。
- V2 `check --json` 是权威预检：确认精确资源差异和执行计划。删除与未密封第三方构建依赖在写入前失败；包执行只用 CLI 工具链且不链接工作区 `node_modules`。`status`/`retry` 自动定位环境，retry 以 attempt 隔离旧执行器并仅重放跨机器所需的本地 Form 绑定。
- 每个任务使用独立 worktree/branch 和一个开发 change，但 feature worktree 不发布。批准提交先合并并 push 到远端默认主分支，再创建一个 `sdd bundle`，从同步且干净的 main/master 一次发布。
- 合并、push、发布和 `release end` 后，回到 canonical 主工作区先审阅 `openxiangda workspace cleanup`，再执行 `openxiangda workspace cleanup --apply` 应用精确哈希计划。CLI 在 owner lock 内复核，只删除已审阅的 managed `SAFE` 项，不顺带处理后来才安全的项，也不执行全局 `git worktree prune`；stale 记录单独人工审阅。
- L0 只读/文档/测试无需 SDD；L1 窄小可逆改动记录精确范围且不重复确认；表单结构、业务函数、自动化/流程、权限、登录/公开访问、数据写入、runtime/config 等 L2/L3 走完整 SDD，live evidence/archive 放到发布后。
- 极小的文案、样式、绑定修正可使用 `openxiangda sdd quick <change> ...`，但必须限制在精确的低风险范围内；用户已明确要求该小改时不再重复 propose/approve。
- SDD 默认 streamlined：approval 与结构化精确范围是硬门禁，未完成的 task/evidence/spec 文案只告警；只有 `strictDocumentation: true` 才阻断。
- Function/Automation 源码触发默认走服务端 source-field PATCH，保留线上 bindings/contracts/metadata/trigger/view/enabled/published state；无源码且 `definitionJson.version="v3"` 完整的新建 Automation 自动走 manifest create，只有替换已有整包 manifest 才必须精确 `--only/--code` 并加 `--replace-manifest --reason "..."`。
- 相同 change 的 staged FormRelease 只有经服务端重新核验 immutable/inactive/non-aborted、identity/hash、冻结 schema/formType、finalized 资源、parent/base revision 与当前 Form Head 后，才可重挂接新 baseline/session。`schemaSyncedAt` 不是发布证据；禁止伪造、直发 schema 或提前激活 Form 绕过 Workflow 校验。
- Form 设置与表单权限组同时发布时，必须合并为一条 `resource publish form-setting,form-permission-group`，并使用 `form-setting:<code>`、`form-permission-group:<code>` 精确 selector；SDD 生成与校验共享同一契约，禁止缺失、夹带或拆分 FormRelease。
- 环境托管 `release ship --replace-manifest --reason "..."` 必须成对、reason 至少 8 字符且仅限精确 Backend selector；正式确认复用与预发完全相同的参数，不透传 Form/Workflow/Runtime/配置或全量步骤。
- `release ship` 始终顺序执行 candidate → 预发 → 生产。日常分两次确认；明确授权紧急发布时首条命令可带 `--confirm-production` 一次完成，但不跳过预发/证据/CAS。candidate 封存环境/资源绑定、sourceRevision 及两目标 Runtime 哈希产物；后续主线 HEAD 只作安全门禁，Backend/Runtime/Root 不改写候选来源，且每条服务端 deployment 必须闭环为 `succeeded`。
- 预发 UAT 失败使用 `release fail --deployment <id> --message "..." [--code <code>] [--details-json <JSON|file>] --environment preproduction` 写审计；CLI 先校验 deployment 属于所选预发环境，禁止 production 或环境不匹配写入。
- 托管发布完成后运行 `release integration-status --change <change> --profile <name> --check`；CLI 从私有 `ship.json` 或其引用的 production/preproduction deployment execution 日志恢复血缘，无法恢复时指出实际缺失的文件或字段。
- 写入平台前只从与权威远端 tip 完全一致的 clean main/master 执行 `release begin`。feature branch 或未 push 主线在任何写入前失败；clone primary 只有在冻结仓库 ID 已存在于 `repoAliases` 时才会 canonicalize，无交集在 Release prepare 前失败关闭；激活后直接运行 `integration-status` 和 `release end`，无需发布后再合并。
- 环境托管工作区禁止直发：已有工作区先用 `environment attach` 接入，旧映射只能迁移到 appType 相同的预发 target，正式 target 必须为空。然后执行 `release candidate`、`release deploy --environment preproduction`、`release test`，最后将同一 candidate 用 `release promote --environment production --confirm-production` 晋级。两套环境的 appType、资源 ID 和数据不可互拷；用 `openxiangda studio` 查看状态。只有用户明确授权的投产前重分类可执行 `environment swap --reason "..." --confirm-production`；它不移动应用数据或 Release Head，且默认不放开副作用。
- 单独修改某个环境的副作用策略只能使用 `environment policy update <preproduction|production> --side-effect-policy-json <JSON|file> --reason "..."`：先执行 `--dry-run`，正式环境额外要求 `--confirm-production`，不得借用 `environment swap`。patch 只校验本次提交字段并原样保留未知历史字段，`--full-replace` 才按完整目标删除遗漏字段。`organizationWrites=explicit_capability_only` 只解除环境级 deny，仍强制 `app:organization:manage`。发布硬门禁只保留明确 scope/profile/target、权限、干净且已推送主线、不可变版本、CAS/租约与生产确认；文案和人工验收说明默认是建议，只有显式 strict 模式才阻断。
- 单文件改动默认按 change 和逻辑目标发布：先 `workspace plan --profile <name> --change <change> --changed`，再 `workspace publish --profile <name> --change <change> --only pages/a,forms/b --dry-run`。
- 账号/角色/权限/RBAC/组织账号/查询参数授权需求先选权限模式：`managed-platform-account` / `existing-platform-user-assignment` / `static-role-permission` / `query-param-context`，并输出权限矩阵。
- 角色能新增角色、分配成员、授接口权限、维护权限组或管理组织账号时，`src/resources/roles/<code>.json` 必须声明 `apiPermissionCodes`，例如 `app:role:manage`、`app:page-permission-group:manage`、`app:form-permission-group:manage`、`app:organization:manage`。
- 任何写操作前确认当前 profile：`openxiangda env --profile <name>`。
- `.openxiangda/state.json` 是 profile 到 appType / 资源 ID 的持久权威映射；临时 release/deployment 进度只写私有 `.openxiangda/releases/` journal。两者均由 CLI 维护，不要手改。
- 多 target 的托管工作区执行 `function invoke` 必须显式传 `--environment <target>`，并核对 stderr 回显的最终 target。
- 用户 token 在 `.openxiangda/profiles.json`；共享 env 在 `~/.openxiangda/.env`。
- 表单字段必须有 user-facing `placeholder`；选项使用 `SelectField` / `RadioField`，跨表用 `linkedForm` SelectField。
- 表单录入组件顺序：OpenXiangda 平台组件 → `antd` / `antd-mobile` 包装 → 必要时自定义业务组件。
- 发现平台缺陷、能力缺口、规则不清、反复 workaround、AI 不确定点、用户可见体验问题时，主动 `openxiangda feedback submit --yes`；提交后告诉用户反馈内容和 fingerprint。
- 页面默认 `cssIsolation: "none"` + 原生 Tailwind utilities；正式入口必须是 app-shell。

## Never

- ❌ `pnpm publish:all` / `pnpm publish:oss` / `pnpm register` / `lowcode-workspace publish-*` 直接调用。它们由 `_guard:publish` 拦截，缺少 `OPENXIANGDA_PROFILE` 时会 fail-fast。
- ❌ 要求用户在对话中粘贴 AK / SK / appKey / appSecret；获授权的外部后端集成使用 `open-api credential` 安全交付。
- ❌ 在没有本地 `.openxiangda/state.json` 绑定时，去平台搜索同名应用"复用"。
- ❌ 把 `formUuid` / `pageId` / `workflowId` / `automationId` 从 dev 复制到 prod。
- ❌ 对已经登记环境的 preproduction / production 执行 `release publish`，或绕过有效预发证据直接晋级正式。
- ❌ 改一处就全量发布。
- ❌ 在临时发布副本中做仓库没有的 hot patch，或让一个任务发布其他会话的 dirty 文件。
- ❌ 只隐藏按钮、只判断 query 参数、硬编码角色、前端模拟权限、假账号/假 ID、或用 `PermissionBoundary` 代替真实授权。
- ❌ 给用户挂“管理员”业务角色但不给该角色绑定 `app:role:manage` 等角色设置接口权限。
- ❌ 绕过 `sdk.organization` / `ctx.organization` 直接写平台账号/部门。
- ❌ `openxiangda form create` / `form publish` / `page publish` 当作页面生成方式（仅底层修复）。
- ❌ 把 token / AK / SK / 第三方密钥写进项目文件。
- ❌ `npm publish` — 本工作区 `"private": true`，不发 npm 包。
- ❌ 在 AI 生成的 `src/forms/**` / `src/pages/**` 直接写原生 `<input>` / `<select>` / `<textarea>` / file input、手写 picker/uploader、手写人员/部门选择器。

## When unsure

读 [AGENTS.md](AGENTS.md) 与全局 skill：`~/.qoder/skills/openxiangda/SKILL.md`。

## 并行 candidate

candidate 只可跨越不相干的后续主线提交：其 commit 必须仍是干净、已推送主线的祖先，且 sealed 输入哈希全部不变。同一目标一次只允许一个 running / evidence-pending deployment；等待 lease/槽位，紧急修复也走精确 candidate → preproduction → production。

平台登录态只使用当前工作区的 `.openxiangda/profiles.json`，不再读取或合并用户主目录的全局 profiles。升级后请进入每个项目运行 `openxiangda login <platform-url>`；子目录沿最近应用根目录定位，不跨嵌套应用或 Git 边界。登录文件及临时文件会自动加入忽略规则，请勿提交或打包。新项目先用 `openxiangda login <platform-url> --cwd <directory>` 在目标目录登录，再在该目录运行 `openxiangda workspace init`。
