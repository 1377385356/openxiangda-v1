<!-- OpenXiangda-Policy-Version: 7 -->

# AGENTS.md — OpenXiangda 工作区 AI 强约束

> 任何 AI（Qoder / Claude / Codex / Cursor / Copilot 等）在本工作区操作前 **必须先读完本文件**。
> 这是 `sy-lowcode-app-workspace`，由 `openxiangda` CLI 统一管理；普通 npm 习惯不适用于此工作区的发布与生命周期操作。

## 工具升级与代际选择

建议评估升级到 OpenXiangda 2.0；新应用优先使用 V2，已有项目先确认能力覆盖、迁移成本及验收。工具更新不转换应用。Node.js 24+ 可安装 `npm install -g openxiangda@latest`，再使用新版全局入口执行 `openxiangda migrate assess --to v2`。本项目依赖继续按 `legacy-v1` 维护。CLI、Skill、MCP 说明见 https://github.com/1377385356/openxiangda/blob/master/docs/getting-started.md#upgrade 。

## 一句话原则

**本工作区声明 `deliveryVersion: 2`。所有“发布 / 上线 / 部署 / publish / deploy / ship / release”请求只使用 `openxiangda check`、`openxiangda deploy`、`openxiangda status`、`openxiangda retry`、`openxiangda rollback`，完整约定见 [DELIVERY.md](DELIVERY.md)。**

Delivery V2 自动从期望状态按资源指纹计算精确范围，使用 CLI 密封工具链封存内容寻址 App Package，并在服务端持久化 ReleaseRun、attempt 和检查点；包执行不链接工作区 `node_modules`。`status`/`retry` 可自动定位预发或生产环境，跨机器重试只重放本地 Form 绑定并跳过已完成的平台写入。Runtime buildId 同时包含 Runtime layer 与密封包摘要，避免相同 Runtime 字节在不同包之间发生来源碰撞；同包重试仅在历史 Release 为 `uploaded` 且内容、源码、父版本完全一致时复用，绝不覆盖不可变存储对象。删除和未密封的第三方构建依赖会在远程写入前失败关闭。它不要求 SDD、Git clean、主线 ancestry、`--change`、`--only` 或生产确认参数。本文后续出现的 `workspace publish`、`resource publish`、`runtime deploy`、`release publish/ship`、candidate、SDD/mainline 发布门禁均属于 V1 底层兼容说明，不得用于 V2 正常发布。

**架构类需求先过设计门。** 新应用、复杂页面、登录注册、公开访问、权限数据范围、流程自动化、连接器/通知等需求，先 `openxiangda doctor --json` + `openxiangda design gates --topic <code> --json`。只有仍存在会改变实现方向的业务、安全或数据选择时才输出设计并等待确认；用户已经给出具体需求与验收标准时，直接记录结构化 SDD 范围并实现，不再写长篇设计或重复确认。

共享应用仓库把规范 `main`/`master` 检出专用于集成和发布；每个开发任务从最新远端主线使用独立 Git worktree/branch，禁止为了发布 stash/restore 或覆盖其他任务文件。调查默认只做一次完整 CodeGraph 查询，明确缺失时最多补一次精确查询；普通任务只加载一个领域技能。等待状态未变化时使用 `openxiangda task status --watch`，不要重复输出相同进度。

任务关闭必须回到 canonical 主工作区：合并、push、发布及 `release end` 后先审阅 `openxiangda workspace cleanup`，再对这一份精确 `SAFE` 计划执行 `openxiangda workspace cleanup --apply`。CLI 只清理 OpenXiangda/Codex 管理、已进入实时主线、干净、无 owner/journal/lease 的 worktree，并在 owner lock 内复核；不会顺带清理后来才安全的项，也不会全局 `git worktree prune`。stale 记录需单独人工审阅，禁止直接 `rm -rf`。

**按风险分级治理。** 只读/文档/测试为 L0；纯文案样式或单一既有资源绑定等窄小可逆改动为 L1，可用受限的 `openxiangda sdd quick` 记录精确范围；表单结构、业务 Function、Automation/Workflow、权限、登录/公开访问、数据写入和 runtime/config 为 L2；不可逆、生产迁移或应用级扩权为 L3。L2/L3 必须挂完整 SDD，并由 `coverage.json` 把需求与场景映射到精确的文件、表单、页面及工程资源范围。

**开发 change 与发布 bundle 分离。** 每个任务在独立 worktree/branch 维护一个显式 change，从 `openxiangda sdd context --change <change> --changed --json` 开始；结构化范围是硬约束，任务/证据/规格文案默认只告警。所有批准提交先合并并 push 到主分支，再执行 `openxiangda sdd bundle <release-change> --changes ...`，从与远端完全一致的 clean `main`/`master` 一次发布；feature worktree 不直接发布。

工作区内的 npm scripts（`publish:all` / `publish:oss` / `register`）已加 `_guard:publish` 守卫；缺少 `OPENXIANGDA_PROFILE` 环境变量时会立即 fail，提示重新走 CLI 入口。

## 路由表 — 用户意图 → 命令 / skill

| 用户说（中 / 英）                                         | 用 skill                          | 第一条命令                                                                                                             |
| --------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 发布 / 上线 / 部署 / publish / deploy                     | `openxiangda-core`                | `openxiangda check --environment preproduction` → `openxiangda deploy preproduction`                                   |
| 晋级生产                                                  | `openxiangda-core`                | `openxiangda deploy production --package <packageDigest>`                                                              |
| 发布失败 / 断点续跑                                       | `openxiangda-core`                | `openxiangda status <runId>` → `openxiangda retry <runId>`                                                             |
| 创建应用 / 新建 app / 初始化工作区                        | `openxiangda-app`                 | `openxiangda workspace init <dir> --profile <name> --app-name "..."`                                                   |
| 绑定已有应用                                              | `openxiangda-app`                 | `openxiangda workspace bind --profile <name> --app-type APP_XXX`                                                       |
| 创建 / 改表单字段、schema、表单页                         | `openxiangda-form`                | 编辑表单并声明 form-setting bundle → `resource publish form-setting --only <code>` 暂存；整应用由 `app-finalize` 激活  |
| 导出表单数据 / 图片 / 附件 / Excel / zip                  | `openxiangda-form`                | `openxiangda form export <formCode> --mode xlsx                                                                        | xlsx-images   | package --profile <name>` |
| 创建 / 改自定义代码页、portal、看板                       | `openxiangda-page`                | 编辑 `src/pages/<code>/` → `workspace publish --page <code>`                                                           |
| 审批流程 / 流程节点 / JS_CODE                             | `openxiangda-workflow-automation` | `openxiangda workflow validate / create / publish`                                                                     |
| 自动化 / 定时任务 / 提交触发 / cron                       | `openxiangda-workflow-automation` | `openxiangda automation validate / create / publish / enable`                                                          |
| 账号 / 角色 / 权限组 / 字段权限 / 数据范围 / 查询参数授权 | `openxiangda-permission-settings` | 先 `openxiangda design gates --topic permissions --json`，再 `openxiangda permission ...` / `openxiangda settings ...` |
| 查应用结构 / 快照 / 对比 / 排查 / 报错                    | `openxiangda-inspect`             | `openxiangda app snapshot <APP_XXX> --profile <name> --json`                                                           |
| 登录 / 切平台 / token / whoami                            | `openxiangda-core`                | `openxiangda env --profile <name>` / `openxiangda auth status`                                                         |
| 多表只读联表查询 / 报表数据源                             | `openxiangda-form`（data view）   | 在 `src/resources/data-views/<code>.json` 声明 → `resource publish`                                                    |
| 调外部 / 第三方 API / 钉钉 / 自建系统                     | `openxiangda-page`（connector）   | 在 `src/resources/connectors/<code>.json` 声明 → `sdk.connector.invoke()`                                              |
| 外部后端 / 三方系统调用享搭 / AK/SK / 开放接口            | `openxiangda-open-api`            | `openxiangda open-api spec list --search <keyword> --json`                                                             |
| 资源诊断 / 小步修复 / 同步 manifest                       | 对应资源 skill                    | `openxiangda route                                                                                                     | public-access | auth-config               | function | connector | notification | data-view | menu | permission ... --dry-run` |

## 必须遵守

- ✅ 先 preflight：`openxiangda env --profile <name>` + `openxiangda auth status --profile <name>` + `openxiangda update check --json`。
- ✅ 架构类需求先 plan gate：`openxiangda doctor --profile <name> --json` + `openxiangda design gates --topic <code> --json`，用户确认后再实现。
- ✅ L2/L3 保留 context → propose → 用户确认 → approve；默认只创建 change/coverage/release，完整文档由 `sdd render` 按需生成。approval、coverage 与实际发布范围为硬门禁，未完成的任务/证据/规格文案只告警。需要严格文档门禁时显式配置 `strictDocumentation: true`。
- ✅ 涉及账号、角色、权限、数据范围、组织账号、RBAC、查询参数授权时，先跑 `openxiangda design gates --topic permissions --json`，选择 `managed-platform-account` / `existing-platform-user-assignment` / `static-role-permission` / `query-param-context`，并输出权限矩阵后再改资源。
- ✅ 某个应用角色如果要查询组织账号，声明 `app:organization:read`；如需创建、修改账号/部门或重置密码，再声明 `app:organization:manage`。角色设置、页面/表单权限组等能力同样通过 `src/resources/roles/<code>.json` 的 `apiPermissionCodes` 显式授权，例如 `app:role:manage`、`app:page-permission-group:manage`、`app:form-permission-group:manage`。
- ✅ 查询家校通讯录的家长、学生、教师、班主任身份和班级/监护关系时使用 `sdk.organization.schoolContact.*` / `ctx.organization.schoolContact.*`。`SCHOOL_HEAD_TEACHER` 只判断全局身份，具体班级必须读取 `teachers.list` 的 `isHeadTeacher`、`teacher.managedClasses` 和 `class.headTeachers`。已登录非游客用户无需绑定应用角色权限，默认查询当前租户全部关系；只有明确要求时才声明 `:self:read` 或 `:class:read` 收紧。
- ✅ 单文件改动默认按 change 和逻辑资源增量发布：`workspace plan --profile <name> --change <change> --changed`，再 `workspace publish --profile <name> --change <change> --only pages/a,forms/b --dry-run` → 正式发布。
- ✅ 用户 token 在 `.openxiangda/profiles.json`；项目 state 在 `.openxiangda/state.json`（只存 ID）。
- ✅ 共享环境（`APP_OSS_*`、反馈机器人等）在 `~/.openxiangda/.env`，项目 `.env` 仅做 per-workspace override。
- ✅ 多 profile（dev / prod / ...）资源 ID 互不复用；每个 profile 的 `appType` / `formUuid` / `pageId` / `workflowId` / `automationId` 独立维护。
- ✅ 改已有应用前先 `openxiangda app snapshot APP_XXX --profile <name> --json`。
- ✅ 表单录入组件选择顺序：OpenXiangda 平台表单组件 → `antd` / `antd-mobile` 包装 → 只有两者都不满足时才写自定义业务组件。
- ✅ 发现平台缺陷、能力缺口、规则不清、反复 workaround、AI 不确定点、用户可见体验问题时，主动 `openxiangda feedback submit --yes`；发送后告诉用户反馈内容和 fingerprint。
- ✅ 正式多资源开发优先写 `src/resources/**` 后执行 `openxiangda resource validate|plan|publish <type> --only <codes>`；单资源可用 `--code <code>`。直接 CLI 写平台资源时先 `--dry-run`，需要避免漂移就加 `--write-manifest`。
- ✅ `resource plan` 与 publish dry-run 严格只允许 GET/HEAD；遇到 `READ_ONLY_AUTH_REQUIRED` 时先执行 `openxiangda auth refresh --profile <name>` 或重新登录，不得在 plan 内自动 POST 刷新 token。
- ✅ Function/Automation 使用 Backend Release v2；正式多资源发布用精确 `--only/--code` 加 `--stage-only` 暂存，同一 child 可混合源码 create、无 `sourceFile` 的完整 v3 声明式 Automation manifest create、source-only update 和显式 manifest replacement，再由 Root App finalize 原子激活。声明式 create 自动选路；替换已有资源的整包 manifest 才需要另加 `--replace-manifest --reason "..."`。clone primary 与冻结仓库 ID 不同时，只有冻结 ID 已存在于 `repoAliases` 才会统一用于 Backend/Workflow/Root App Release；无交集继续失败关闭。
- ✅ 相同 change 已有 staged FormRelease 时，不要直发 schema、伪造 `schemaSyncedAt` 或提前激活 Form。CLI 只在重新核验服务端不可变状态、identity/hash、冻结 schema/formType、finalized 资源、parent/base revision 与当前 Form Head 后，才将 child 重挂接到新的 baseline/session；冲突继续失败关闭。
- ✅ 同一发布同时包含 Form 设置和表单权限组时，必须使用一条 `resource publish form-setting,form-permission-group`，并以 `form-setting:<code>`、`form-permission-group:<code>` 精确限定 `--only`；SDD bundle 与 prepublish 校验共享该契约，禁止缺失、夹带、拆分发布或提前激活。
- ✅ 未登记环境的旧工作区，正式 promotion 先聚合 mainline bundle 并 commit/push，再运行 `release publish --change <id> --profile <name>`。平台核验精确非删除目标来自多次历史 lineage 后，可成对增加 `--adopt-online-baseline --adoption-reason "..."`；参数只进入精确 `resource publish --only/--code` 阶段，不进入 ensure、Runtime 或 App finalize，无精确资源范围时在获取租约前失败关闭。
- ✅ 旧工作区已有 Root、且操作者明确授权无条件恢复时，可执行 `release app-activate <releaseId> --force-activate-without-validation --profile <name>`。该命令不读取 detail/capture，不要求 change、租约、baseline、源码 lineage、状态、parent、hash、resource head 或环境发布门禁；服务端直接在目标 tenant/appType 内以单事务切换 Root 与可识别的 staged children。
- ✅ 已通过 `environment init` 或 `environment attach` 接入的工作区使用 `release ship`，始终按 candidate → preproduction → production 执行。日常首条命令在预发停止，后续 `--confirm-production` 晋级；用户明确授权紧急发布时，首条命令可携带 `--confirm-production` 在一个命令内顺序完成两阶段，但不跳过预发、证据、CAS 或确认。candidate 封存源码、public、构建配置/脚本、稳定环境/资源绑定和两目标 Runtime 哈希产物；部署不现场重建，Backend/Runtime/Root 子发布始终使用 candidate sourceRevision，并将两条服务端 deployment 闭环为 `succeeded`。两套环境身份仍完全隔离，人工验收建议和 swap/policy/权限门禁保持不变。
- ✅ DataView `status` 仅是平台生命周期观察值；同一托管部署导致的 `active → draft → active` 不应让候选失效。`dataViewId`、`materializedViewName`、`storageMode`、其他资源状态、哈希、环境身份、CAS、租约和来源主线仍严格校验。
- ✅ 预发 UAT 未通过时，使用 `release fail --deployment <id> --message "..." [--code <code>] [--details-json <JSON|file>] --environment preproduction --profile <name>` 写入平台审计。CLI 会先核对 deployment 属于所选预发环境；production target 或不匹配的 deployment 必须在写入前拒绝。
- ✅ 托管发布完成后运行 `release integration-status --change <change> --profile <name> --check`。CLI 会从私有 `ship.json` 恢复血缘，必要时自动沿 production/preproduction deployment ID 查找对应 `execution.json`；失败信息必须指出实际缺失的日志或字段。
- ✅ 只有已审计目标早已进入权威主线、线上却由多次历史 lineage 组成且无法对应单一 Git 基线时，第一次 `release ship` 才可增加 `--adopt-online-baseline --adoption-reason "..."`；该意图冻结进私有 `ship.json` 并由后续 `--confirm-production` 自动复用。仅允许精确非删除 selectors，冻结 Head、change/lease、服务端 CAS、staged children 与单次 App finalize 仍是硬门禁。
- ✅ 环境托管发布需要完整替换 Function/Automation manifest 时，`release ship` 可成对增加 `--replace-manifest --reason "..."`；reason 至少 8 字符，只透传精确 Backend selector，正式确认必须复用同一对参数，不扩散到 Form/Workflow/Runtime/配置或全量范围。
- ✅ 环境托管发布确需审计式 Runtime 源码血缘回退时，`release ship`、恢复命令 `release deploy` 和 `release promote` 可成对增加 `--allow-runtime-rollback --reason "..."`；reason 至少 8 字符，只透传 `runtime-stage`，不进入资源阶段或 `app-finalize`。ship 冻结该意图并由正式确认自动复用；默认仍失败关闭。
- ✅ 受支持的配置资源（如 `publicAccessPolicies`）以精确 `resourceSelectors` 为边界；历史 `resources=true` 类别标记会被精确 selector 收窄。缺失 selector、未知类型、通配符 `*`、删除和真正全量资源仍 fail closed。
- ✅ 本地开发者可运行 `openxiangda studio` 查看两套环境、差异、候选、部署和测试证据；该页面只监听回环地址且只暴露注册动作，生产操作仍需显式确认。

## 严禁

- ❌ 直接 `pnpm publish:all` / `pnpm publish:oss` / `pnpm register` / `lowcode-workspace publish-*`。它们是工作区内部脚本，不会注入 `OPENXIANGDA_PROFILE / BASE_URL / ACCESS_TOKEN / APP_TYPE`，发到错的环境也无人提醒。
- ❌ 要求用户在对话中粘贴 AK / SK / appKey / appSecret。普通工作区流程使用用户 token；获授权的外部后端集成使用 `open-api credential` 安全交付。
- ❌ 在没有本地 `.openxiangda/state.json` 绑定时，去平台搜索同名应用尝试"复用"。空目录 / 无绑定 → 直接 `workspace init --app-name` 创建新应用。
- ❌ 把 `openxiangda form create` / `form publish` / `page publish` 当作日常页面生成方式。它们仅作底层修复 / 诊断。
- ❌ 改一个文件就 `workspace publish` 全量。
- ❌ 用“先 GET 最新 revision，再 PUT 旧整包 definition”的方式重试 Function/Automation 冲突；源码小改不得顺带覆盖线上 bindings/contracts/metadata/state。
- ❌ 用户确认架构设计前就实现、写平台资源、发布、部署或发送通知。
- ❌ 只隐藏按钮、只判断 query 参数、硬编码角色、前端模拟权限、假账号/假 ID、或用 `PermissionBoundary` 代替真实授权。敏感数据必须由角色、页面/表单权限组、public-access grants 或 App Function 后端校验保护。
- ❌ 只给用户分配“管理员”业务角色，却不给该角色绑定 `app:role:manage` 等角色设置接口权限，然后期望他能新增账号、角色或权限组。
- ❌ 直接绕过 SDK 调平台账号/组织写接口；应用管理平台账号/部门必须使用 `sdk.organization` / `ctx.organization`，且当前操作者具备 `app:organization:manage`。
- ❌ 直连钉钉或根据班级成员推断、复制家长学生关系；应用只消费平台组织中心维护的家校关系读模型。
- ❌ 把 token、AK、SK、第三方密钥写进项目文件。
- ❌ `npm publish` —— 这个工作区是 `"private": true` 的应用工作区，不是要发到 npm 的 package。
- ❌ 在 AI 生成的 `src/forms/**` / `src/pages/**` 里直接写原生 `<input>` / `<select>` / `<textarea>` / `<input type="file">`、手写 picker、手写 uploader、手写人员/部门选择器。原生控件只允许出现在 OpenXiangda SDK / 平台组件内部。

## 表单 / 页面写作约束（高频踩坑）

- 表单字段：可见字段必须有用户能看懂的 `placeholder`；`tips` 只用于特殊约束。
- 表单录入：优先在 `schema.ts` 使用 `TextField` / `SelectField` / `DateField` / `UserSelectField` / `AttachmentField` 等平台字段；`page.tsx` 只做展示布局，不要拼原生控件。
- 表单选项：用 `SelectField` / `RadioField` 表枚举；跨表数据用 `SelectField` + `optionSource.type: "linkedForm"`（数据量大时加 `remoteSearch: true` + `searchFieldId`）。**禁止**新建 `AssociationFormField`。
- 权限隐式键、计算字段、同步字段：在 schema 中保留 `behavior: "HIDDEN"`，由可见字段通过 `valueSync` 派生，不要让用户填裸 ID。
- 页面筛选 / 弹窗 / 抽屉 / 行内编辑：平台数据字段优先平台组件；普通 UI 控件用 `antd` / `antd-mobile`，不要用原生表单控件。
- 页面默认 `cssIsolation: "none"` + 原生 Tailwind utilities（`bg-white`、`border-slate-200`、`grid-cols-[240px_1fr]` 等），不要用 `bg-card` / `text-muted-foreground` 这类未配置的 shadcn token。
- 列表页用 `DataManagementList` 模式 + 分页 + 结构化 `filterGroup`，不要 `pageSize=10000` 然后前端过滤。
- 结构化 JSON 录入用 `JSONField`；单字段扩展用 `renderer` / `editor`，列表详情或新增抽屉的统一替换通过 `DataManagementList components={{ JSONField: CustomJsonField }}` 透传。
- 正式入口（管理后台 / PC 门户 / 移动门户）必须是 app-shell：`page.config.ts` 里 `entry: { mode: "app-shell", hidePlatformNav: true, defaultRoute: "<home>" }`。
- 对外接口走 `src/resources/connectors/`；多表只读联表走 `src/resources/data-views/`；通知模板走 `src/resources/notifications/`。
- 新 React SPA 公开访问使用 `/view/:appType/public/*` + `src/resources/routes/` + `src/resources/public-access/` + `PublicAccessGate`。旧 `?publicAccess=guest` 只用于旧 `sy-lowcode-view` 兼容，新应用禁止采用。

## JS_CODE 批量构建

`pnpm build-js-code --scripts functions:a,functions:b,automations:c` 可在一次进程中构建多个 App Function / Automation / JS_CODE 目标；也兼容重复的 `--script a --script b --source functions`。正式 `resource plan/publish` 使用 CLI 内置 scoped builder 和 `.openxiangda/build-cache.cli-v4.json`，按 authored source/dependencies 的稳定血缘增量构建；手工运行模板内 `pnpm build-js-code` 使用 `.openxiangda/build-cache.json`。两者都不能只因 `dist/**/index.cjs` 存在就视为有效；强制重建使用 `--force`。

App Function 第三方凭据只能在 Function manifest 顶层声明 `secretRefs: [{name, required}]`，并使用 `function_v2` + `runtimeContractVersion: "trusted_node_v2"`；源码通过 `await ctx.secrets.get(name)` 获取。值只能用 `openxiangda secret create|rotate --value-stdin --change <id> --profile <name>` 或隐藏 TTY 配置，禁止写入 Git、`.env`、manifest、源码、构建产物、plan、日志和异常。本地联调只允许 `openxiangda function test --secret-from-env logical=ENV`，它不会把值写入 workspace/cache/state。

App Function 查询应用角色及维护角色成员必须使用正式的 `ctx.platform.roles`：`findByCode(roleCode)`、`list()`、`get(roleId)`、`listUsers(roleId)`、`addUsers(roleId, userIds)`、`removeUser(roleId, userId)`。该 API 固定到 `ctx.app.appType`，按真实 operator 校验 `app:role:manage` 并保留调用审计；不要依赖自定义的 `ctx.platform.roles` 声明，也不要用泛型 `ctx.platform.api` 绕过角色契约。

## 工作区结构速查

```text
sy-lowcode-app-workspace/
├── AGENTS.md                        # 本文件
├── .qoder/rules/openxiangda.md      # Qoder always-on 项目规则
├── .cursor/rules/openxiangda.mdc    # Cursor always-on 项目规则
├── openspec/                        # SDD v2 specs / changes / coverage / release / archive
├── .openxiangda/state.json          # profile → appType → 资源 ID 的权威映射（CLI 维护）
├── app-workspace.config.ts
├── package.json                     # publish:all/publish:oss/register 都被 _guard:publish 守卫
├── src/
│   ├── forms/<formCode>/{schema.ts,page.tsx}    # 表单页源（openxiangda-form）
│   ├── pages/<pageCode>/                         # 自定义代码页源（openxiangda-page）
│   ├── workflows/<code>/workflow.ts              # 代码优先工作流（openxiangda-workflow-automation）
│   ├── automations/<code>/index.ts               # 代码优先自动化
│   ├── js-code-nodes/<code>/index.ts             # JS_CODE V2 trusted_node TS 源
│   └── resources/                                 # data-views / connectors / notifications / roles / ...
└── examples/best-practices/                       # 仅参考；不发布
```

## 还想看更细的

- 全局 V1 skill：`~/.qoder/skills/openxiangda-v1/SKILL.md`（V1 决策卡）+ 9 个子 skill；`openxiangda` 由统一分发入口管理。
- 资源 / 连接器 manifest：`docs/openxiangda-resources-and-connectors.md`（来自 openxiangda 仓库）。
- 平台数据模型：`references/platform-data-model.md`（option `{label, value}`、附件、成员字段等持久化形态）。
- 排错清单：`references/troubleshooting.md`。

## 升级现有工作区

如果这份文件是后加上来的，请确认下面三件事：

1. `package.json` 的 `publish:all` / `publish:oss` / `register` 已加上 `pnpm _guard:publish && ...` 前缀。
2. `.qoder/rules/openxiangda.md` 与 `.cursor/rules/openxiangda.mdc` 都存在。
3. `openxiangda update check --json` 显示已是最新，并跑过 `openxiangda skill install --force`。

## 并行候选与紧急发布

- candidate 创建后允许主线继续合入不相干任务；晋级时要求 candidate commit 仍是已推送主线祖先，且 sealed 输入文件哈希全部不变。任一输入变化都必须重建 candidate。
- 同一目标环境一次只允许一个 running / evidence-pending deployment；CLI 会先等待应用 lease 和部署槽位。`--wait-seconds 0` 只用于快速发现占用，不能绕过 CAS。
- 紧急修复使用精确 L1 scope，仍按 candidate → preproduction → production 发布；不得跳过应用/环境资源映射校验、预发证据或生产确认。应用内逐函数 `resources` 仅作映射和审计，不是权限白名单。

平台登录态只使用当前工作区的 `.openxiangda/profiles.json`，不再读取或合并用户主目录的全局 profiles。升级后请进入每个项目运行 `openxiangda login <platform-url>`；子目录沿最近应用根目录定位，不跨嵌套应用或 Git 边界。登录文件及临时文件会自动加入忽略规则，请勿提交或打包。新项目先用 `openxiangda login <platform-url> --cwd <directory>` 在目标目录登录，再在该目录运行 `openxiangda workspace init`。
