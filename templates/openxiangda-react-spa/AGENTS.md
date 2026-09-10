<!-- OpenXiangda-Policy-Version: 7 -->

# AGENTS.md — OpenXiangda React SPA 应用工作区

本工作区是标准 React 18 + Vite + React Router 应用。默认模板只提供应用壳、账号菜单和一个首页，不是开发验证控制台。

## 工具升级与代际选择

建议评估升级到 OpenXiangda 2.0；新应用优先使用 V2，已有项目先确认能力覆盖、迁移成本及验收。工具更新不转换应用。Node.js 24+ 可安装 `npm install -g openxiangda@latest`，再使用新版全局入口执行 `openxiangda migrate assess --to v2`。本项目依赖继续按 `legacy-v1` 维护。CLI、Skill、MCP 说明见 https://github.com/1377385356/openxiangda/blob/master/docs/getting-started.md#upgrade 。

## Delivery V2（发布唯一入口）

本工作区声明 `deliveryVersion: 2`，正常发布只使用 `openxiangda check`、`openxiangda deploy`、`openxiangda status`、`openxiangda retry`、`openxiangda rollback`，完整约定见 [DELIVERY.md](DELIVERY.md)。V2 按资源指纹计算精确范围，使用不依赖工作区 `node_modules` 的 CLI 密封工具链，并在服务端持久化 ReleaseRun、attempt 和检查点；跨机器重试只重放本地 Form 绑定。Runtime buildId 同时包含 Runtime layer 与密封包摘要，避免相同 Runtime 字节在不同包之间发生来源碰撞；同包重试仅在历史 Release 为 `uploaded` 且内容、源码、父版本完全一致时复用，不覆盖不可变存储对象。删除和未密封构建依赖在写入前失败关闭。`status`/`retry` 未指定环境时会自动定位预发或生产。V2 不要求 SDD、Git clean、主线 ancestry、`--change`、`--only` 或生产确认参数。本文后续出现的 `resource publish`、`runtime deploy`、`release publish/ship`、candidate、SDD/mainline 发布门禁均为 V1 底层兼容说明，不得用于 V2 正常发布。

## 开发原则

- 架构类需求先运行 `openxiangda doctor --json` 和 `openxiangda design gates --topic <code> --json`。只有仍存在会改变实现方向的业务、安全或数据选择时才输出设计并等待确认；用户已经给出具体需求与验收标准时，直接记录结构化 SDD 范围并实现，不再写长篇设计或重复确认。
- 先按风险分级：只读/文档/测试为 L0；纯文案样式或单一既有资源绑定等可逆窄改为 L1，可用受限的 `openxiangda sdd quick` 记录精确范围；表单结构、业务函数、自动化/流程、权限、登录/公开访问、数据写入和 runtime/config 为 L2；不可逆、生产迁移或应用级扩权为 L3。L2/L3 必须挂完整 SDD，并由 `coverage.json` 把需求与场景映射到精确的文件、表单、页面及工程资源范围。
- 一个开发任务只使用一个显式 change，并从 `openxiangda sdd context --change <change> --changed --json` 开始；默认只维护 change/coverage/release 三份结构化事实源，需要文档时才执行 `openxiangda sdd render <change>`。结构化 approval、资源和文件范围是硬约束，任务/证据/规格文案默认只告警。只有明确配置 `strictDocumentation: true` 才把文案完成度恢复为门禁。
- 多会话开发把规范的 `main`/`master` 检出专用于集成和发布；每个开发任务从最新远端主线使用独立 Git worktree/branch，禁止为了发布 stash/restore 或覆盖其他任务的文件。feature worktree 不发布。把已批准提交合并并 push 到权威默认主分支后，用 `sdd bundle <release-change> --changes ...` 聚合范围；只从与远端 tip 完全一致的 clean `main`/`master` 一次发布。
- 任务关闭必须从 canonical 主工作区执行：合并、push、发布及 `release end` 后先审阅 `openxiangda workspace cleanup`，再对这一份精确 `SAFE` 计划执行 `openxiangda workspace cleanup --apply`。CLI 只清理 OpenXiangda/Codex 管理、已进入实时主线、干净、无 owner/journal/lease 的 worktree，并在 owner lock 内复核；不会顺带清理后来才安全的项，也不会全局 `git worktree prune`。stale 记录需单独人工审阅，禁止直接 `rm -rf`。
- 调查预算默认为一次覆盖完整调用链的 CodeGraph 查询，只有明确缺失符号时再补一次精确查询；普通任务只加载一个领域技能。租约、构建或部署状态未变化时不重复输出相同进度，使用 `openxiangda task status --watch` 等待状态变化。
- 账号、角色、权限、数据范围、组织账号、RBAC、查询参数授权需求必须先运行 `openxiangda design gates --topic permissions --json`，选择 `managed-platform-account` / `existing-platform-user-assignment` / `static-role-permission` / `query-param-context`，输出权限矩阵后再实现。
- 应用角色只读查询组织账号时声明 `app:organization:read`；创建、修改账号/部门或重置密码时声明 `app:organization:manage`。创建角色、分配成员或维护权限组也必须在角色资源的 `apiPermissionCodes` 声明对应的 `app:role:manage`、`app:page-permission-group:manage`、`app:form-permission-group:manage`。
- 家校关系页面调用 `sdk.organization.schoolContact.*`；用 `SCHOOL_HEAD_TEACHER` 判断全局班主任身份，用 `teachers.list` 的 `isHeadTeacher`、`teacher.managedClasses` 和 `class.headTeachers` 判断具体班级双向关系。已登录非游客用户无需绑定应用角色权限，默认范围是当前租户全部关系。只有明确需要本人或任教班级限制时才声明 `:self:read` / `:class:read`。
- 默认用户界面保持克制：左侧应用导航、顶部账号信息、首页内容区域。
- 不在默认可见页面展示 SDK、Runtime、Cookie、Proxy、Playwright、AI 验证、调试上下文、构建号等开发语言。
- 使用 React Router 管理路由，路由定义在 `src/app/router.tsx`。
- 使用 Tailwind CSS 表达样式，不依赖平台 theme tokens。
- 菜单和首页文案优先改 `src/app/navigation.ts`、`src/app/starter-content.ts` 与 `src/pages/admin/AdminDashboardPage.tsx`。
- 页面、表单、字段、数据范围、流程动作、文件、连接器权限以后端接口为准；前端只做展示保护和清晰状态页。
- 查询参数只能作为上下文、筛选或 ticket 输入，不能作为敏感数据授权依据；敏感读写必须由 public-access grants、平台角色、页面/表单权限组或 App Function 后端校验保护。
- 应用查询平台账号/部门时必须走 `sdk.organization` / `ctx.organization`，当前操作者至少具备 `app:organization:read`；写入和密码操作必须具备 `app:organization:manage`。
- 应用不得直连钉钉、读取系统表或根据同班关系推断亲属；家长学生关系必须走 `sdk.organization.schoolContact` / `ctx.organization.schoolContact`。
- 只给用户分配“管理员”业务角色不等于授权其设置角色；缺少 `app:role:manage` 时角色创建、成员分配和角色接口权限授予会被后端拒绝。
- 本地开发通过 Vite `/service` 代理远端平台，保持 HttpOnly Cookie 同域访问。
- 新公开访问页使用 `/view/:appType/public/*`、`src/resources/routes/`、`src/resources/public-access/` 和 `PublicAccessGate`。不要使用旧 `?publicAccess=guest`。
- 公开页上传必须在 `grants.forms` 使用 `{code, actions: ["upload", "preview"], fields?: [...]}` 显式绑定表单与动作；`AttachmentField` / `ImageField` 自动携带 guest 凭据和 `appType/formUuid/fieldId`。禁止匿名放开 `/service/file/upload`，bucket/MIME/扩展名/大小限制写在 form `upload` 或 `grants.storage`。
- 外部后端或三方系统调用享搭时，使用 `openxiangda-open-api` 与 `openxiangda open-api spec describe`；不要把 AK/SK 或开放 API token 放进 React SPA。

## 常用命令

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm typecheck:js-code
pnpm build
pnpm build-js-code
openxiangda resource publish form-setting --only <formCode> --change <change> --profile <name>
openxiangda form export <formCode> --mode package --profile <name> --output ./exports/
openxiangda doctor --profile <name> --json
openxiangda design gates --topic public-access --json
openxiangda sdd context --change <change> --changed --json
openxiangda sdd verify <change> --changed --stage implementation
openxiangda resource plan <type> --only <code1,code2> --profile <name>
openxiangda sdd bundle <release-change> --changes <change-a,change-b>
openxiangda release publish --change <release-change> --profile <name>
openxiangda release ship --change <release-change> --profile <name>
# 确认预发结果后，另一次命令晋级同一 candidate；验收备注可选
openxiangda release ship --change <release-change> --profile <name> --confirm-production
openxiangda studio
openxiangda commands --json
```

未登记环境的旧工作区只有在平台已核验“精确非删除目标来自多次历史发布、无法对应单一 Git 基线”时，才可在同一条 `release publish` 上增加 `--adopt-online-baseline --adoption-reason "..."`。CLI 只把该意图传给精确 `resource publish --only/--code` 阶段；表单 ensure、Runtime 与 App finalize 不接收，原因不足或没有精确资源阶段会在获取租约前失败关闭。

模板已停用无范围的 `pnpm deploy` 聚合入口。日常变更必须使用 `resource plan|publish <type> --only <codes>`（单资源可用 `--code <code>`）。Form bundle、Backend Release 和 Runtime 都先暂存；CLI 会按 `--change` 自动聚合 `.openxiangda/releases/<change>/staged-resources.json`，最后只由一次 Root App finalize 原子激活。Form Release 一旦 abort 绝不能作为幂等结果复用；重新执行相同精确表单发布时，CLI 会淘汰旧 staged 索引，平台会创建新的不可变 attempt，再由 Root App 一次事务重试。相同 change 的既有 staged FormRelease 只有在 CLI 重新核验服务端不可变状态、identity/hash、冻结 schema/formType、finalized 资源、parent/base revision 和当前 Form Head 后，才可重挂接到新的 baseline/session；`schemaSyncedAt` 只是本地缓存元数据。禁止伪造它、提前激活 Form 或用顺序激活多张表单绕过失败。不要使用 `workspace publish --form`、单独 `runtime activate`、`pnpm publish:all`、`pnpm openxiangda:publish` 或 `lowcode-workspace publish-all`。

同一发布同时包含 Form 设置和表单权限组时，必须由一条 `resource publish form-setting,form-permission-group` 命令暂存，并在 `--only` 中分别使用 `form-setting:<code>`、`form-permission-group:<code>`。SDD bundle 与 prepublish 校验使用同一精确契约；缺失、夹带、拆成两个 FormRelease 或提前激活都应失败关闭。

工作区一旦通过 `environment init` 登记或 `environment attach` 接入，`release publish` 即不再是入口。`release ship` 始终按 candidate → preproduction → production 执行：日常首条命令在预发停止，后续 `--confirm-production` 晋级；用户明确授权紧急发布时，首条命令可直接携带 `--confirm-production`，在一个命令内顺序执行两阶段，但不跳过预发、证据、CAS 或确认。candidate 封存源码、public、构建配置/脚本、稳定环境/资源绑定和两目标 Runtime 哈希产物；部署不再现场构建，Backend/Runtime/Root 子发布始终使用 candidate sourceRevision，并将两条服务端 deployment 都闭环为 `succeeded`。两套环境身份仍完全隔离，人工验收默认建议且可用 `--acceptance-note` 留痕；swap、policy 和权限规则保持不变。`openxiangda studio` 用于查看绑定、漂移、候选、部署和证据。

DataView 的 `status` 是平台生命周期观察值；同一托管部署在预发暂存和正式确认之间发生 `active → draft → active` 不构成候选漂移。候选仍严格校验 `dataViewId`、`materializedViewName`、`storageMode`、其他资源状态、哈希、环境身份、CAS、租约和来源主线。

预发 UAT 未通过时，使用 `release fail --deployment <id> --message "..." [--code <code>] [--details-json <JSON|file>] --environment preproduction --profile <name>` 留下平台审计记录。CLI 会先核对 deployment 属于所选预发环境；禁止对 production target 或不匹配的 deployment 使用。

托管发布完成后运行 `release integration-status --change <change> --profile <name> --check`。CLI 会从私有 `ship.json` 恢复血缘，必要时自动沿 production/preproduction deployment ID 查找对应 `execution.json`；失败信息必须指出实际缺失的日志或字段。

只有已审计代码早已进入权威主线、而精确非删除目标在线上来自多次历史发布且无法对应单一 Git 基线时，第一次 `release ship` 才可增加 `--adopt-online-baseline --adoption-reason "..."`。该意图会冻结进私有 `ship.json`，后续 `--confirm-production` 自动复用；它不会放松冻结 online heads、change/lease、删除/全量拒绝、服务端 CAS、staged children 或单次 App finalize 原子激活。

环境托管发布需要完整替换 Function/Automation manifest 时，`release ship` 可成对增加 `--replace-manifest --reason "..."`；reason 至少 8 字符，只会进入精确 Backend selector，正式确认必须复用与预发完全相同的参数，绝不扩散到表单、流程、Runtime、配置资源或全量范围。

环境托管发布确需审计式 Runtime 源码血缘回退时，`release ship`、恢复命令 `release deploy` 和 `release promote` 可成对增加 `--allow-runtime-rollback --reason "..."`；reason 至少 8 字符，只进入 `runtime-stage`，不进入资源阶段或 `app-finalize`。ship 会冻结该意图，正式确认自动复用；省略时继续失败关闭。

受支持的配置资源（如 `publicAccessPolicies`）以精确 `resourceSelectors` 为发布边界；历史 `resources=true` 类别标记会被精确 selector 收窄。缺失 selector、未知类型、通配符 `*`、删除和真正全量资源仍必须 fail closed。

`resource plan` 与 publish dry-run 严格只允许 GET/HEAD。遇到 `READ_ONLY_AUTH_REQUIRED` 时，先执行 `openxiangda auth refresh --profile <name>` 或重新登录再重试；不得在 plan 内自动 POST 刷新 token。

完整发布顺序：

```bash
# 先合并所有 approved task commits 到 main/master 并 push
openxiangda sdd bundle <release-change> --changes <change-a,change-b>
# 未登记环境的旧工作区：commit/push bundle 后由一个可恢复命令完成原子发布
openxiangda release publish --change <release-change> --profile <name>
# 已登记环境的工作区：第一次只准备预发
openxiangda release ship --change <release-change> --profile <name>
# 确认预发结果后，第二次晋级同一候选
openxiangda release ship --change <release-change> --profile <name> --confirm-production
```

`pnpm build-js-code` 会检查并打包 `src/js-code-nodes/<code>/index.ts`、`src/automations/<code>/index.ts`、`src/functions/<code>/index.ts`，供 JS_CODE V2、代码自动化和 App Function 资源发布使用。批量目标使用 `pnpm build-js-code --scripts functions:a,functions:b,automations:c`，也兼容重复的 `--script a --script b --source functions`。正式 `resource plan/publish` 由 CLI 内置 scoped builder 一次批量构建选中入口及其传递/shared/ambient 依赖，不再为每个资源启动工作区 `pnpm`。缓存写入 `.openxiangda/build-cache.cli-v4.json`，稳定 `source_lineage_v1` 只按 authored source/dependencies 比较，不因构建器升级制造假冲突；需要强制重建时追加 `--force`。

App Function 第三方凭据只能在 Function manifest 顶层声明 `secretRefs: [{name, required}]`，并使用 `function_v2` + `runtimeContractVersion: "trusted_node_v2"`；源码通过 `await ctx.secrets.get(name)` 获取。值只能经 `openxiangda secret create|rotate --value-stdin --change <id> --profile <name>` 或隐藏 TTY 配置，禁止进入 Git、`.env`、manifest、源码、构建产物、plan、日志和异常。本地测试只使用 `openxiangda function test --secret-from-env logical=ENV` 的隔离子进程注入。

App Function 查询应用角色及维护角色成员必须使用正式的 `ctx.platform.roles`：`findByCode(roleCode)`、`list()`、`get(roleId)`、`listUsers(roleId)`、`addUsers(roleId, userIds)`、`removeUser(roleId, userId)`。该 API 固定到 `ctx.app.appType`，按真实 operator 校验 `app:role:manage` 并保留调用审计；不要依赖自定义的 `ctx.platform.roles` 声明，也不要用泛型 `ctx.platform.api` 绕过角色契约。

`openxiangda runtime deploy --no-activate` 会构建并上传不可变预览版本；发布前先提交所有可能进入构建的源码/配置。所有 Runtime deploy（包括 `--no-activate`）都会先获取应用发布 lease，并在任何构建和上传前冻结 clean `HEAD` 与当前 active Runtime 父血缘；旧分支返回 `RUNTIME_SOURCE_BASE_DIVERGED`，不能先上传旧 preview 再激活。`openspec/` SDD 证据和生成/状态目录不算源码 dirty。仅审批的回退可使用 `--allow-runtime-rollback --reason "至少 8 个字符"`；`--no-build` 不会跳过守卫。不要手工修改 `dist/index.html`。

Function/Automation 走 Backend Release v2；同一个 child 可以混合源码 create、无 `sourceFile` 的完整 v3 声明式 Automation manifest create、source-only update 与显式 manifest replacement，并对整个集合做 CAS。声明式 create 自动选路且不需要 `--replace-manifest`；替换已有资源才需要该显式授权。正式多资源发布必须使用 canonical 精确 selector 和 `--stage-only`。`release begin` 只接受与权威远端默认主分支完全一致的 clean HEAD；feature branch 或未 push 的 main 会在任何平台写入前失败。clone primary 与冻结仓库 ID 不同时，只有该冻结 ID 已存在于 `repoAliases` 才会统一用于 Backend/Workflow/Root App Release；无交集继续失败关闭。成功激活后主线证据天然成立，不再补做发布后合并。

## 应用结构

- `src/layouts/AdminShell.tsx`：管理后台应用壳、侧边栏、顶部栏、用户菜单。
- `src/pages/admin/AdminDashboardPage.tsx`：默认首页。
- `src/pages/defaults/*`：表单、流程、数据列表、文件预览等默认页。
- `src/runtime/default-page-overrides.tsx`：整页覆盖默认页的入口。
- `src/js-code-nodes/*`、`src/automations/*`、`src/functions/*`：后端执行脚本源码。
- `scripts/build-js-code.mjs`：JS_CODE V2、代码自动化和 App Function 的 TypeScript 构建脚本。

## 权限资源

React SPA 页面需要声明菜单 code、route code 和 path pattern。默认菜单资源在 `src/resources/menus/menus.json`；可以用 `children` 声明树形菜单，`resource validate|plan|publish` 会展开成独立菜单资源：

```json
{
  "code": "admin_dashboard",
  "name": "工作台",
  "routeCode": "admin.dashboard",
  "path": "/view/:appType/admin"
}
```

页面中可以使用：

```tsx
import {
  PermissionBoundary,
  useAppMenus,
  useRuntimeBootstrap,
} from "openxiangda/runtime/react";
```

`PermissionBoundary` 只能做展示保护，不能替代后端权限。不要硬编码角色、前端模拟权限、只判断 query 参数或用空数组兜底伪装成功。后端返回 401 时跳登录，403 时展示无权限状态。

公开页面需要同时声明 route 和 public access policy：

```json
{
  "code": "public.register",
  "pathPattern": "/view/:appType/public/register",
  "publicAccess": "guest",
  "publicPolicyCode": "public_register"
}
```

```json
{
  "code": "public_register",
  "mode": "guest",
  "routeCode": "public.register",
  "externalRoleCodes": ["external_visitor"],
  "grants": {
    "forms": [],
    "dataViews": [],
    "functions": [],
    "connectors": []
  }
}
```

表单、dataView、function、connector 没有被 policy `grants` 显式列出时，公开 guest 默认无权访问。需要数据访问时，把同一个外部角色码加入对应后端权限组。

资源诊断或小步修复可以使用一等 CLI：`route`、`public-access`、`auth-config`、`function`、`connector`、`notification`、`data-view`、`menu`、`permission`。正式多资源开发仍优先写 `src/resources/**` 后走 `openxiangda resource validate|plan|publish`。直接 CLI 写平台资源时，先加 `--dry-run` 看 path/body；需要保持仓库为来源时加 `--write-manifest`；删除、发送、覆盖类高风险动作必须加 `--force`。

## 默认页与覆盖

- 表单提交：`/view/:appType/admin/forms/:formUuid/new`
- 表单详情：`/view/:appType/admin/forms/:formUuid/:formInstId`
- 流程详情：`/view/:appType/admin/process/:formUuid/:formInstId`
- 数据列表：`/view/:appType/admin/data/:formUuid`
- 文件预览：`/view/:appType/file-preview?ticket=...`

附件预览约定：

- 表单上下文使用 `AttachmentField` / `ImageField`；不要为只读业务数据伪造 `FormProvider`。普通自定义页面从 `openxiangda/runtime/react` 导入 `AttachmentPreviewList` / `ImagePreviewGrid`；自定义卡片、表格和详情操作使用 `useFilePreview({ items })`，并渲染返回的 `host`。
- 自定义编辑页确需在 `FormProvider` 内使用平台字段时，从 `openxiangda/runtime/react` 调用 `usePageFormRuntimeApi()` 并把返回值设置为 `config.api`。非 Hook 场景使用 `createPageFormRuntimeApi(sdk)`。不要手写 `api.request: config => sdk.request(...)`；它会丢失 `responseType: "blob"`，并绕过下载 ticket 的 `servicePrefix` 归一化，导致预览拿不到二进制 Blob，或下载错误打开站点根 `/file/*`。应用也不要自行给 ticket URL 拼 `/service`。
- 上述独立组件和 hook 必须位于 `OpenXiangdaProvider` + `OpenXiangdaPageProvider` 内。它们自动使用当前 PageSdk `appType`，复用平台 capability、ticket metadata 和受控二进制下载。
- 只有需要复制、分享或新窗口打开时，才通过 PageSdk（`usePageSdk()` 返回的 `sdk`）调用 `sdk.createFileAccessTicket(bucketName, objectName, fileName, "preview", { appType })` 获取 `previewPageUrl` 后打开。
- `previewPageUrl` 是给用户打开的页面入口；`previewUrl` / `/service/file/preview-by-ticket/:ticket` 是文件内容流，只供预览页内部 iframe、PDF、图片或视频组件加载。
- 不要自行维护“可预览扩展名”列表，也不要直接引用内部 `FilePreviewContent` / `useFilePreviewController`。公开组件会调用平台 capability API，只在服务端确认 `canPreview: true` 时展示预览；图片使用同组弹窗画廊，视频、音频和文档使用站内弹窗。
- 默认支持 PDF、常见图片/视频/音频、文本、DOCX 和 XLSX；DOC/XLS/PPT、ODF 等格式需要部署侧配置 ONLYOFFICE。文件过大时平台会按 `FILE_PREVIEW_*_MAX_*` 上限降级为仅下载。
- 全局兼容入口 `/view/file-preview?ticket=...` 只有在后端能从 URL、ticket payload 或 `FILE_PREVIEW_APP_TYPE` 推导 appType 时才会被 React SPA runtime 接管。若响应头仍是 `X-OpenXiangda-Runtime-Mode: legacy`，检查 ticket 是否含 appType、URL 是否带 `appType`、runtime release 是否已激活、以及服务端兜底配置。
- 需要自定义文件预览 UI 时，在 `src/runtime/default-page-overrides.tsx` 覆盖 `file-preview`；自定义组件仍应读取 ticket metadata 和 `/service/file/*` 接口，不要直接拼旧 view/workbench 参数。

需要自定义默认页时，在 `src/runtime/default-page-overrides.tsx` 中按页面类型和 `formUuid` 注册覆盖组件。不要回到旧平台 `isRenderNav` 或 workbench 参数模型。

## 并行候选与紧急发布

- candidate 创建后允许主线继续合入不相干任务；晋级时要求 candidate commit 仍是已推送主线祖先，且 sealed 输入文件哈希全部不变。任一输入变化都必须重建 candidate。
- 同一目标环境一次只允许一个 running / evidence-pending deployment；CLI 会先等待应用 lease 和部署槽位。`--wait-seconds 0` 只用于快速发现占用，不能绕过 CAS。
- 紧急修复使用精确 L1 scope，仍按 candidate → preproduction → production 发布；不得跳过应用/环境资源映射校验、预发证据或生产确认。应用内逐函数 `resources` 仅作映射和审计，不是权限白名单。
