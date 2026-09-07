# OpenXiangda 开发提速与发布隔离路线图

## 目标

这份路线图解决三类问题：小改动被完整 SDD 流程放大、多个任务发布时互相覆盖，以及 Function/Automation 数量增长后全量读取与构建越来越慢。

最终应满足：

- L1 小改动只描述精确文件和资源，完成必要校验即可发布；L2/L3 仍保留完整治理。
- 开发可以并行，应用的 promotion 同一时刻只能有一个持有者。
- 每次计划、构建、校验和发布只处理变更资源及其静态依赖闭包。
- 所有可覆盖写入都具备 lease、CAS 或不可变版本基线，冲突返回 409，不能静默 last-write-wins。
- 一次发布可追溯到 change、Git commit、资源版本、Runtime build 和校验证据，并可整体回滚。

## 当前状态

- **已落地：** 精确 change/code scope、批量构建与缓存、并发安全 state、Function/Automation/Runtime CAS、静态依赖闭包、L1 quick SDD、分阶段 verify、worktree ownership、应用 promotion lease、不可变 App/Backend/Form/Workflow/Runtime Release。
- **2026-07-24 P0：** Function/Automation 同时校验本地期望资源声明和线上有效绑定。Automation 的外层 manifest 与 runtime definition 必须精确一致；Function 允许省略 runtime 重复声明，但显式声明时必须一致。`source_only` 至少包含全部期望绑定，`manifest_replacement` 必须精确相等；App 激活后重新读取线上绑定，缺失或错绑会使发布失败，避免“源码正常、线上清单陈旧”。
- **2026-07-24 P1：** SDD 作用域拆为 `changedResources`、`runtimeDependencies`、`deployTargets`。共享源码影响只用于审查和依赖证明，不再静默扩大部署集合。candidate 在冻结源码、创建远端 candidate 或 deployment 之前完成 release plan + SDD prepublish 只读预检；失败不写远端、不生成执行日志、不改 reviewed SDD 文件。
- **2026-07-24 P2：** candidate 记录真实发布输入文件及哈希。晋级时不再要求当前主线仍停在 candidate 的完全相同 HEAD，而是要求 candidate commit 是当前已推送主线的祖先，并且所有 sealed 输入文件逐字节未变。服务端每个目标环境只允许一个 `running/deployed` deployment，CLI 在任何部署写入前等待应用 lease 和目标部署槽位；同资源冲突继续由 change baseline 的资源 Head CAS 阻断。
- **后续：** 继续补齐统一发布队列可视化、剩余直接写接口的 revision/ETag，以及 Runtime route overlay 与持续度量面板。

## 推荐开发与发布模型

1. 每个任务使用独立 worktree，分别提交和验证；不要让多个任务共享脏工作区。
2. 任务通过评审后合入并推送权威 `master`，再从主线创建 sealed candidate。
3. 不相干任务可以继续合入主线。旧 candidate 只有在其 commit 仍是主线祖先且自身输入哈希未变化时才可继续预发或晋级；改到同一输入文件必须重新创建 candidate。
4. 同一目标环境由服务端 deployment coordinator 串行化；CLI 自动等待 lease/部署槽位。等待超时只终止本次发布，不修改线上资源。
5. 真正写入时仍以 change baseline 冻结资源 Head，任何同资源并发变化返回稳定 409；禁止读取新 revision 后带旧 payload 自动重试。

### 紧急热修通道

紧急不等于绕过资源契约、CAS 或生产确认。热修应使用 L1 `narrow-fix`，把 `changedResources` 和 `deployTargets` 收缩到精确 code；只修改 Function/Automation 源码时保持 `source_only`，不要使用整包 manifest replacement。创建 candidate 后仍先部署预发，运行与改动直接相关的最小 smoke，再用同一 candidate 晋级生产。可用 `--wait-seconds 0` 做 fail-fast 探测，但不得抢占正在激活的发布。

### 灰度与分批

当前平台的安全灰度边界是独立 preproduction 应用，而不是生产流量百分比。标准顺序是 candidate → preproduction deploy/test → 同 candidate production promotion。没有流量路由、用户分群和自动回滚证据前，不要把“直接上生产一部分资源”称为 canary；跨资源的局部激活会破坏 App Release 原子性。

## 实施顺序

### P0：立即止损

1. **精确 change scope**
   - `workspace plan/check`、`sdd context/status/verify/archive` 支持显式 `--change`。
   - `resource validate/plan/publish` 支持类型 + code selector。
   - 不再从多个 active change 中隐式选择第一个。
2. **增量 JS_CODE 构建**
   - 一次 TypeScript/Vite 批处理多个 Function/Automation。
   - 缓存包含源码、传递依赖、工具版本和产物哈希。
3. **本地状态并发安全**
   - `.openxiangda/state.json` 使用文件锁、三方合并和原子替换。
4. **平台 CAS**
   - Runtime head、Function revision、Automation group version 均支持前置条件。
   - 数据库约束保证单 active Runtime 和单 published Automation。
5. **技能瘦身**
   - 总入口只做风险路由；详细规则按任务加载，避免每轮重复读取长文档。

验收：两个任务使用不同 change/code 同时计划与构建互不扩散；对同一资源的陈旧写入稳定返回 409。

### P1：影响面与 SDD 提速

1. **TypeScript 静态依赖图**
   - 解析相对路径、`@/` alias 和共享模块的传递依赖。
   - 从资源 manifest 建立源码到 Function/Automation code 的反向索引。
   - 识别字面量形式的平台资源调用，并校验声明的 `resourceBindings`。
2. **L1 quick change**
   - 一条命令生成精确 files/resources、风险等级和批准记录。
   - schema、权限、认证、公开访问、数据迁移、破坏性变更不能降级为 L1。
3. **分阶段 verify**
   - `implementation`：静态检查、单测、构建。
   - `prepublish`：覆盖范围、批准状态、发布基线。
   - `postpublish`：线上探针和发布证据。
   - `archive`：完整证据与归档条件。

验收：修改共享模块时只选择真实受影响资源；发布前不会因缺少“发布后证据”而被循环阻塞。

### P2：应用级 promotion 隔离

1. **应用发布租约**
   - `(tenant, app)` 同一时刻只允许一个有效 lease。
   - 支持 acquire/renew/release/status、TTL 过期接管和 holder 隐私摘要。
   - Runtime 激活、Function 更新和 Automation 更新/发布可校验 lease。
2. **CLI release session**
   - release begin/status/renew/end 绑定 change、app、profile、workspace identity 和 base revision。
   - `resource publish`、`runtime deploy/activate` 自动携带 leaseId。
   - 进程退出尽力释放；长发布自动续租；失租立即停止后续写入。
3. **工作区所有权**
   - 开发默认使用独立 Git worktree/branch。
   - `sdd propose|quick|context` 按 `CODEX_THREAD_ID` 自动占用当前 worktree；另一个任务必须切换 worktree，强制接管需要原因。
   - promotion 记录 branch、commit、change、clientSessionId 和 workspace identity；共享脏目录只允许只读/诊断。

验收：两个任务可以同时开发和验证；只有租约持有者可以 promotion，另一个任务收到可恢复的 409，而不是覆盖前者。

### P2.5：冻结 change baseline 与字段级写入

1. **发布基线与整体 preflight**
   - `release begin --change` 冻结 reviewed Git base 和所有精确目标的远端字段 head。
   - 在第一条 live write 前一次性校验完整目标集合，避免发布到一半才发现后续资源冲突。
   - 旧 worktree 返回 `SOURCE_BASE_DIVERGED`；远端字段在基线后变化返回 `RESOURCE_FIELD_CONFLICT`。
2. **Function/Automation source-only PATCH**
   - 源码依赖触发时默认只 PATCH 构建后的 source snapshot。
   - 平台保留线上 `resourceBindings`、input/output contracts、名称描述等 metadata、Automation trigger/view 配置以及 enabled/published state。
   - 整包 manifest 替换必须精确 `--only/--code`，并显式 `--replace-manifest --reason "..."`。
3. **发布收尾**
   - 冲突后不得用新 GET 的 revision 携带旧整包 payload 重试；必须合并、重建、重新计划并开始新 release。
   - 成功、放弃或可恢复失败后均显式执行 `release end`。

验收：一个旧 worktree 即使在前一任务发布完成后才开始 promotion，也不能用旧 manifest 回滚线上字段；源码小改不会重写未选择的 Function/Automation 配置。

### P3：原子发布与回滚（进行中）

1. **不可变 App Release Manifest**
   - 内容寻址记录 forms/pages/functions/automations/workflows/runtime 的目标版本和哈希。
   - 发布分为 prepare、verify、activate；activate 只切换一个 app release head。
   - 回滚只切换到历史 manifest，不重新执行一组可变写操作。
2. **低层 PATCH/CAS**
   - 在已完成的 Function/Automation source-field PATCH 基础上，补齐 Workflow 与其余直接写接口的 revision/ETag。
   - enable/disable/unpublish/delete 等尚未覆盖的状态操作也需要前置条件和 lease。
3. **共享 App Backend Release**
   - 已完成：多个 Function/Automation 以不可变 manifest/hash 形成一个 Backend Release，parent 与冻结 change baseline 一起 CAS。
   - 已完成：`prepare`/`verify` 不改资源；`activate` 先锁定并校验完整集合，再在一个事务内更新全部目标；任一 stale 时零写入，noop 不更新。
   - 已完成：CLI 复用共享上传缓存，99 个目标只发一次 prepare/verify/activate；仅 feature probe 明确 404 才告警降级旧 source PATCH。
   - 已完成：head/list/detail/diff/rollback/abort/post-commit retry 可审计；回滚创建新不可变发布，不改写历史记录。
4. **Runtime route overlay 评估与落地**
   - 将页面级路由/静态资源覆盖与应用 Runtime head 解耦。
   - 仅在权限、导航、缓存失效和回滚语义全部明确后启用。

验收：一次发布要么整体可见、要么完全不可见；任意历史版本可通过单次 head 切换回滚；共享代码修改只重建依赖闭包。

## 持续度量

CLI 和平台需要统一记录以下指标：

- change scope 中的文件数、直接资源数和依赖闭包资源数。
- plan/fetch/build/verify/upload/activate 各阶段耗时。
- JS_CODE cache hit/miss 及失效原因。
- lease 等待、冲突、过期接管和 CAS 冲突次数。
- 每次发布的实际资源集合与计划集合差异。
- 小改动从开始到可验证、可发布的端到端耗时。

回归门槛：任何改动若让未选择资源重新进入 fetch/build/publish，或恢复隐式 active change 选择，都应由 smoke test 阻止。
