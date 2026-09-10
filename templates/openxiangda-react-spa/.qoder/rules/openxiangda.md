---
description: OpenXiangda React SPA 工作区强约束 — 路由、命令、不变量、禁令
alwaysApply: true
---

# OpenXiangda React SPA Rule

This is an OpenXiangda React SPA workspace using Delivery V2. Read [DELIVERY.md](DELIVERY.md) and [AGENTS.md](AGENTS.md). Low-level V1 resource/runtime commands are compatibility tools, not the normal release entrypoint.

## 工具升级与代际选择

建议评估升级到 OpenXiangda 2.0；新应用优先使用 V2，已有项目先确认能力覆盖、迁移成本及验收。工具更新不转换应用。Node.js 24+ 可安装 `npm install -g openxiangda@latest`，再使用新版全局入口执行 `openxiangda migrate assess --to v2`。本项目依赖继续按 `legacy-v1` 维护。CLI、Skill、MCP 说明见 https://github.com/1377385356/openxiangda/blob/master/docs/getting-started.md#upgrade 。

## Hard route

| 用户说 | 必用命令 |
|---|---|
| 发布 / 完整部署 | `openxiangda check --environment preproduction` → `openxiangda deploy preproduction` |
| 正式 promotion | `openxiangda deploy production --package <packageDigest>` |
| 状态 / 失败重试 | `openxiangda status <runId>` → `openxiangda retry <runId>` |
| 回滚 | `openxiangda rollback production --to <appReleaseId>` |
| 诊断 / 环境 | `openxiangda doctor --profile <name> --json` / `openxiangda env --profile <name>` |
| 外部后端 / 三方系统开放接口 | `openxiangda-open-api` + `openxiangda open-api spec describe ...` |

## Always

- Delivery V2 自动计算精确范围，不要求 SDD、Git clean、`--change`、`--only` 或 candidate/ship。
- `check --json` 是 V2 权威预检：确认精确资源差异和执行计划。删除与未密封第三方构建依赖在写入前失败；包执行只用 CLI 工具链且不链接工作区 `node_modules`。`status`/`retry` 自动定位环境，retry 以 attempt 隔离旧执行器并仅重放跨机器所需的本地 Form 绑定。Runtime buildId 同时包含 Runtime layer 与密封包摘要；仅同包 `uploaded` Release 在内容、源码、父版本完全一致时复用，不覆盖不可变存储对象。
- 发布和写平台资源必须显式传 `--profile <name>`。
- 架构类需求先跑 `openxiangda design gates --topic <code> --json` 并等用户确认。
- 每个任务使用独立 worktree/branch 和一个开发 change，但 feature worktree 不发布。批准提交先合并并 push 到远端默认主分支，再创建一个 `sdd bundle <release-change> --changes ...`，从同步且干净的 main/master 一次发布。
- 合并、push、发布和 `release end` 后，回到 canonical 主工作区先审阅 `openxiangda workspace cleanup`，再执行 `openxiangda workspace cleanup --apply` 应用精确哈希计划。CLI 在 owner lock 内复核，只删除已审阅的 managed `SAFE` 项，不顺带处理后来才安全的项，也不执行全局 `git worktree prune`；stale 记录单独人工审阅。
- L0 只读/文档/测试无需 SDD；L1 使用 quick；L2/L3 保留批准和结构化范围。默认 streamlined 模式下，未完成的 task/evidence/spec 文案只告警；只有 `strictDocumentation: true` 才阻断。
- 账号/角色/权限/RBAC/组织账号/查询参数授权需求先跑 `openxiangda design gates --topic permissions --json`，选择 `managed-platform-account` / `existing-platform-user-assignment` / `static-role-permission` / `query-param-context` 并输出权限矩阵。
- 角色能新增角色、分配成员、授接口权限、维护权限组或管理组织账号时，角色资源必须声明 `apiPermissionCodes`，例如 `app:role:manage`、`app:page-permission-group:manage`、`app:form-permission-group:manage`、`app:organization:manage`。
- `src/resources/**` 是工程化资源来源，正式多资源变更走 `validate -> plan -> publish`。
- 默认按逻辑资源 code 使用 `--only` 或单资源 `--code`；全类型/全应用发布必须由批准的依赖闭包明确覆盖。
- Function/Automation 源码触发默认走服务端 source-field PATCH，保留线上 bindings/contracts/metadata/trigger/view/enabled/published state；无源码且 `definitionJson.version="v3"` 完整的新建 Automation 自动走 manifest create，只有替换已有整包 manifest 才必须加 `--replace-manifest --reason "..."`。
- 相同 change 的 staged FormRelease 只有经服务端重新核验 immutable/inactive/non-aborted、identity/hash、冻结 schema/formType、finalized 资源、parent/base revision 与当前 Form Head 后，才可重挂接新 baseline/session。`schemaSyncedAt` 不是发布证据；禁止伪造、直发 schema 或提前激活 Form 绕过 Workflow 校验。
- Form 设置与表单权限组同时发布时，必须合并为一条 `resource publish form-setting,form-permission-group`，并使用 `form-setting:<code>`、`form-permission-group:<code>` 精确 selector；SDD 生成与校验共享同一契约，禁止缺失、夹带或拆分 FormRelease。
- 环境托管 `release ship --adopt-online-baseline --adoption-reason "..."` 会把审计意图冻结进私有 ship journal，后续 `--confirm-production` 自动复用；显式传入不同参数会在任何请求前失败。
- 环境托管 `release ship --replace-manifest --reason "..."` 必须成对、reason 至少 8 字符且仅限精确 Backend selector；正式确认复用与预发完全相同的参数，不透传 Form/Workflow/Runtime/配置或全量步骤。
- `release ship` 始终顺序执行 candidate → 预发 → 生产。日常分两次确认；明确授权紧急发布时首条命令可带 `--confirm-production` 一次完成，但不跳过预发/证据/CAS。candidate 封存环境/资源绑定、sourceRevision 及两目标 Runtime 哈希产物；后续主线 HEAD 只作安全门禁，Backend/Runtime/Root 不改写候选来源，且每条服务端 deployment 必须闭环为 `succeeded`。
- 预发 UAT 失败使用 `release fail --deployment <id> --message "..." [--code <code>] [--details-json <JSON|file>] --environment preproduction` 写审计；CLI 先校验 deployment 属于所选预发环境，禁止 production 或环境不匹配写入。
- 托管发布完成后运行 `release integration-status --change <change> --profile <name> --check`；CLI 从私有 `ship.json` 或其引用的 production/preproduction deployment execution 日志恢复血缘，无法恢复时指出实际缺失的文件或字段。
- 多 target 的托管工作区执行 `function invoke` 必须显式传 `--environment <target>`，并先核对 stderr 回显的最终 target 再判断响应。
- Promotion 必须持有 `release begin/end` 租约；`release begin` 只接受与权威远端 tip 完全一致的 clean main/master。feature branch 或未 push 主线在任何写入前失败。clone primary 只有在冻结仓库 ID 已存在于 `repoAliases` 时才会 canonicalize；无交集在 Release prepare 前失败关闭。激活后直接运行 `integration-status` 和 `release end`，不再补做发布后合并。
- 已有工作区通过 `environment attach` 接入环境组，旧资源映射只迁移到 appType 相同的预发 target，正式 target 必须为空。preproduction / production 分别拥有独立 appType、资源 ID、数据和副作用策略；禁止直接 `release publish`，禁止跨环境复制 ID，使用 `openxiangda studio` 查看状态。只有用户明确授权的投产前重分类可执行 `environment swap --reason "..." --confirm-production`；它不移动应用数据或 Release Head，且默认不放开副作用。
- 单独修改某个环境的副作用策略只能使用 `environment policy update <preproduction|production> --side-effect-policy-json <JSON|file> --reason "..."`：先执行 `--dry-run`，正式环境额外要求 `--confirm-production`，不得借用 `environment swap`。patch 只校验本次提交字段并原样保留未知历史字段，`--full-replace` 才按完整目标删除遗漏字段。`organizationWrites=explicit_capability_only` 只解除环境级 deny，仍强制 `app:organization:manage`。发布硬门禁只保留明确 scope/profile/target、权限、干净且已推送主线、不可变版本、CAS/租约与生产确认；文案和人工验收说明默认是建议，只有显式 strict 模式才阻断。
- React SPA 路由由 `src/app/router.tsx` 管理，前端包通过 `openxiangda runtime deploy` 发布。
- 表单附件预览使用 `AttachmentField` / `ImageField`；普通自定义页面使用 `AttachmentPreviewList` / `ImagePreviewGrid` / `useFilePreview`，不要伪造表单上下文、直接引用内部预览实现或维护扩展名白名单。
- 页面权限、表单权限、公开访问 grants、App Function 后端检查是授权依据；前端只做展示保护。
- 公开 guest 上传必须使用带 `code/actions/fields` 的结构化表单 grant；禁止匿名放开通用 `/file/upload`，客户端 app/form/field 上下文只能与签名 guest claim 比对，不能单独授权。
- 查询参数只能做上下文、筛选或 ticket 输入，不能作为敏感数据授权依据。
- 外部后端使用 `/dingtalk-api/v1.0` 时由后端自己保管 AK/SK 和 token；React SPA 不得接收这些凭证。

## Never

- 不要直接运行 `lowcode-workspace publish-all`、`pnpm publish:all` 或 `pnpm openxiangda:publish`。
- 不要省略 `--profile` 发布。
- 不要在临时发布副本中做仓库没有的 hot patch，也不要直接激活未合并会话构建的 Runtime。
- 不要使用旧 `?publicAccess=guest`、`isRenderNav` 或 workbench 参数模型开发新 React SPA。
- 不要只隐藏按钮、只判断 query 参数、硬编码角色、前端模拟权限、假账号/假 ID、或用 `PermissionBoundary` 代替真实授权。
- 不要给用户挂“管理员”业务角色但不给该角色绑定 `app:role:manage` 等角色设置接口权限。
- 不要绕过 `sdk.organization` / `ctx.organization` 直接写平台账号/部门。
- 不要把 token、AK、SK、第三方密钥写入项目文件。

## 并行 candidate

candidate 只可跨越不相干的后续主线提交：其 commit 必须仍是干净、已推送主线的祖先，且 sealed 输入哈希全部不变。同一目标一次只允许一个 running / evidence-pending deployment；等待 lease/槽位，紧急修复也走精确 candidate → preproduction → production。
