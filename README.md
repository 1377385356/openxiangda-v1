<!-- OpenXiangda-Policy-Version: 7 -->

# OpenXiangda

OpenXiangda is a lightweight CLI and skill package for private low-code platforms.

## Repository boundary

This repository contains only the stable OpenXiangda 1.x maintenance toolchain.
It maintains existing resource-based applications and its legacy Delivery V2
protocol. Stable applications keep this runtime and are not migrated by a
platform upgrade.

OpenXiangda 2.0 is developed and released from the independent
`tools/openxiangda-v2` repository pinned by the platform orchestration
repository. A new 2.0 workspace must use that repository's current public
packages, unified AI skill, templates, and documentation. It must not use the
1.x resource/SDD publishing commands or any historical embedded copy of the
2.0 toolchain.

Normal OpenXiangda app development uses platform-user login tokens through `/openxiangda-api/v1`; it does not use AK/SK. External backend and third-party integrations use the separate `openxiangda-open-api` skill, `/dingtalk-api/v1.0`, and a platform-managed AK/SK credential.

Private platform routing is fixed: backend APIs are under `/service`, platform management is under `/platform`, and app runtime access is under `/view`. Passing a root domain such as `https://platform.example.com/` to the CLI is supported; OpenXiangda stores the API base as `https://platform.example.com/service`.

## 升级到 OpenXiangda 2.0

建议评估升级到 OpenXiangda 2.0；新应用优先使用 V2，现有应用先确认能力覆盖、迁移成本与验收方案。准备 Node.js 24+，安装最新统一入口：

```bash
npm install -g openxiangda@latest --registry=https://registry.npmjs.org
# 进入原 V1 项目，使用新版全局入口
openxiangda version --json
openxiangda migrate assess --to v2 --json
```

`latest` / `stable-v2` 是 V2 稳定渠道，`legacy-v1` 是 V1 维护渠道。统一入口继续用原项目的 V1 引擎；不会自动迁移配置、数据或流程。V1 项目用 `openxiangda update install --target workspace` 更新同代维护版；全局入口用 `--target launcher` 更新。项目锁定的 V1 CLI 不提供 `migrate` 命令，评估时使用新版全局命令。

版本查询、更新检查/安装、Skill 安装后会展示建议；JSON 调用通过 `migrationAdvice` 字段提供同样信息。CLI、Skill、MCP 如何安装、刷新以及配置客户端，见[统一安装升级说明](https://github.com/1377385356/openxiangda/blob/master/docs/getting-started.md#upgrade)。工具更新与应用迁移分别执行。

## OpenXiangda 1.x Delivery V2 (maintenance)

New workspaces declare `deliveryVersion: 2`. The release flow is intentionally
small and deterministic:

```bash
openxiangda check --environment preproduction
openxiangda deploy preproduction --json
openxiangda deploy production --package <packageDigest> --json
openxiangda status <runId> --json
openxiangda retry <runId> --json
openxiangda rollback production --to <appReleaseId> --json
```

The preproduction deploy compiles one content-addressed App Package containing
source, form, configuration, backend, workflow, and Runtime layers. Production
downloads that exact package and does not rebuild it. ReleaseRun state and
checkpoints live on the platform, so a CLI/AI interruption does not discard
completed work. V2 does not require SDD, a clean/pushed Git mainline,
`--change`, `--only`, or candidate/ship orchestration.

`check --json` reports the exact changed resources, dependency-only Form
bindings, and ordered execution plan. Authored Form/Backend/Workflow code is
built only with the CLI-sealed toolchain; a V2 package never links the caller's
`node_modules`, and undeclared third-party build dependencies fail before any
remote write. Resource removals also fail closed until a dedicated migration
path is used.

`status` and `retry` locate the run across preproduction and production when
`--environment` is omitted. Retry resumes only unfinished checkpoints, safely
replays local Form bindings on another machine, and uses a server-side attempt
fence so an older executor cannot continue writing after takeover. Runtime
build IDs include both the Runtime layer and sealed package digests, so a newly
sealed package cannot collide with an older package that happens to contain the
same Runtime bytes. An exact same-package retry may reuse an `uploaded` release
only after verifying its content hash, source revision, and Runtime parent;
immutable storage objects are never overwritten.

The package release gate includes an equivalent-scale conformance scenario with
four Forms, fifteen form permission groups, two Functions, two DataViews, one
Runtime, repository aliases, preproduction execution, injected failure, and
cross-machine checkpoint recovery. A CLI/SDK package cannot be published when
that combined compiler → plan → executor → retry contract fails, even if its
smaller component tests still pass.

The lower-level commands later in this README remain available for V1
compatibility and diagnostics; do not use them to assemble a normal V2 release.

```bash
npm install -g openxiangda@latest --registry=https://registry.npmjs.org --prefer-offline --legacy-peer-deps --no-audit --no-fund
openxiangda update check
openxiangda skill install

# during local development:
npm link

openxiangda skill status
openxiangda platform add dev https://dev-lowcode.example.com
openxiangda login --profile dev
openxiangda env
openxiangda workspace init ./my-app-workspace --profile dev --app-name "示例应用"
cd ./my-app-workspace
pnpm install
openxiangda check --environment preproduction
openxiangda deploy preproduction --json
openxiangda menu list --profile dev
openxiangda workflow list --profile dev
openxiangda automation list --profile dev
openxiangda automation executions daily_ticket_digest --profile dev
openxiangda automation diagnose daily_ticket_digest --profile dev
openxiangda permission role-list --profile dev
openxiangda permission role-users sales --profile dev
openxiangda permission role-add-users sales --user-ids <user-id> --change <change-id> --profile dev
openxiangda settings get customer --profile dev
openxiangda data-view list --profile dev
openxiangda data-view status ticket_with_customer --profile dev
openxiangda doctor --profile dev --json
openxiangda design gates --topic public-access --json
openxiangda sdd context --change add-customer-page --changed --json
openxiangda sdd propose add-customer-page --pages customer --runtime
openxiangda sdd approve add-customer-page --summary "用户确认"
openxiangda sdd verify add-customer-page --changed --stage implementation --profile dev
openxiangda sdd ready add-customer-page --profile dev
openxiangda task status --change add-customer-page
openxiangda resource validate function --only customer_get,customer_save --profile dev
openxiangda resource plan function --only customer_get,customer_save --profile dev
# merge/push approved task commits to main, then create and push one release bundle
openxiangda sdd bundle mainline-release --changes add-customer-page,fix-customer-api
# verify, wait for the lease, stage exact children, atomically finalize, and release
openxiangda release publish --change mainline-release --profile dev
# 仅限平台已核验的旧式多历史 lineage、精确非删除恢复
openxiangda release publish --change mainline-release --profile dev \
  --adopt-online-baseline \
  --adoption-reason "已合入主线的目标来自多次历史发布，无法对应单一 Git 基线"
openxiangda release status --change mainline-release --watch
openxiangda release explain --change mainline-release --profile dev
# 环境托管应用一次性登记（已有应用通常作为 preproduction）
openxiangda environment init --logical-app example-app --name "示例应用" --kind preproduction --app-type APP_PRE --profile dev
openxiangda environment bind production --app-type APP_PROD --profile dev
openxiangda environment attach --logical-app example-app --preproduction-target example-pre --production-target example-prod --profile dev
openxiangda environment status --json
# 仅限投产前环境角色重分类：原子交换两个既有应用的角色，应用数据和 Release Head 不移动
openxiangda environment swap --reason "投产前将现有业务应用调整为正式应用" --confirm-production --profile dev
# 单独调整一个环境的副作用策略：先只读预览，再按当前 revision 审计式更新；不会交换环境角色
openxiangda environment policy update preproduction \
  --side-effect-policy-json '{"organizationWrites":"explicit_capability_only"}' \
  --reason "为预发真实 UAT 开放受权限保护的组织写入" --dry-run --profile dev
openxiangda environment policy update preproduction \
  --side-effect-policy-json '{"organizationWrites":"explicit_capability_only"}' \
  --reason "为预发真实 UAT 开放受权限保护的组织写入" --profile dev
openxiangda studio
# 环境托管应用日常发布：首次命令只部署预发并停止
openxiangda release ship --change mainline-release --profile dev

# 仅限已审计的多历史 lineage、精确非删除恢复；仍保留冻结 Head、CAS、租约和原子 finalize
openxiangda release ship --change mainline-release --profile dev \
  --adopt-online-baseline \
  --adoption-reason "已合入主线的目标来自多次历史发布，无法对应单一 Git 基线"

# 确认预发结果后，再以同一 candidate 晋级正式；验收备注可选
openxiangda release ship --change mainline-release --profile dev \
  --confirm-production
openxiangda policy check
openxiangda resource explain public-access --json
openxiangda inspect app --profile dev --json
openxiangda app snapshot APP_XXXX --profile dev --json
```

User tokens are stored in `~/.openxiangda/profiles.json` with `0600` permissions. Shared workspace environment values, including `APP_OSS_*`, can live in `~/.openxiangda/.env` and are inherited by new workspaces. Project `.env` files still work and override the global defaults. Project state is stored in `.openxiangda/state.json` and contains only durable profile-specific resource IDs and environment bindings; volatile candidate/deployment progress lives in the private `.openxiangda/releases/` journal so a release does not dirty the reviewed Git state. Durable CLI writes use a workspace lock plus atomic merge/rename so concurrent processes do not truncate another profile's state.

An environment-managed workspace keeps one logical application with independent `preproduction` and `production` targets. Each target owns its own `appType`, resource IDs, release heads, data, and side-effect policy; IDs must never be copied across targets. `release ship` always executes the same ordered candidate → preproduction → production protocol. The normal first invocation seals the candidate, deploys only to preproduction, and stops at `awaiting_production_confirmation`; a later invocation with `--confirm-production` promotes it. For an explicitly authorized emergency, supplying `--confirm-production` on the first invocation runs both phases in one command without bypassing preproduction, CAS, evidence, or production confirmation. Candidate sealing covers source, `public/`, build controls/scripts, stable environment/resource bindings, and target-specific hashed Runtime artifacts. Both deployments upload those artifacts with `--no-build`; Backend, Runtime, and Root children all retain the sealed candidate `sourceRevision`, even when promotion starts from a later clean descendant mainline commit. Each deployment is completed with evidence and reaches terminal `succeeded`, so it cannot leave the target slot blocked. Unrelated commits may land on authoritative mainline between phases only while the sealed commit remains an ancestor and every sealed input/binding/artifact still validates. Real human acceptance remains the recommended default and `--acceptance-note` records it. For audited historical-lineage adoption or reviewed Backend manifest replacement, the existing paired flags and exact-scope gates remain mandatory. Supported configuration resources use exact `resourceSelectors`; unknown, wildcard, destructive, and genuinely unscoped generic resources remain blocked. Lower-level candidate/deploy/test/fail/promote commands are recovery primitives. `release fail` requires an explicit preproduction target, deployment ID, and audit message; it verifies the deployment belongs to that preproduction environment before writing optional code/details to the platform failure audit. Direct `release publish` is retained only for legacy unmanaged workspaces.

DataView `status` is a last-observed lifecycle value, not a stable candidate binding: the same managed deployment legitimately moves it between `draft` and `active`. Candidate creation and validation therefore omit only `resources.dataViews.<code>.status`, including when resuming a candidate sealed by an older CLI. `dataViewId`, `materializedViewName`, `storageMode`, candidate hashes, environment identity, CAS, lease, source and every non-DataView status remain fail-closed.

Exact, non-destructive configuration selectors such as Data Views and permission groups are now sequenced automatically inside the same ship journal instead of requiring separate SDD changes. New forms are idempotently ensured per environment before their immutable FormRelease is staged. Unscoped resources and destructive configuration deletes remain fail-closed.

When a release contains both Form settings and form permission groups, `sdd bundle` emits one atomic `resource publish form-setting,form-permission-group` command with qualified `form-setting:<code>` and `form-permission-group:<code>` selectors. The prepublish verifier applies that same canonical contract, requires exact coverage of both sets, and still rejects missing, extra, split, unscoped, or directly activated Form resources.

Existing workspaces connect to a server-side environment set with `environment attach`. If the legacy `profiles.<profile>` binding has the same `appType` as one environment, its resource mappings are copied only into that matching target (normally preproduction). Production starts with an empty mapping, and later writes update only the selected target even when both targets reuse one login profile.

`environment swap` is a commissioning/reclassification operation, not a release shortcut. It requires `--confirm-production` and a reason, atomically exchanges the two existing environment roles, preserves each application's data and Release Heads, and remaps local resource IDs by appType. Existing side-effect policies remain restricted unless explicit replacement policy JSON is supplied.

Use `environment policy update <kind|id>` when only one environment's side-effect policy must change. The CLI reads the current revision and shows the exact before/after diff; `--dry-run` performs GET only. Policy handling is a tolerant-reader/precise-writer protocol: patch mode validates only the fields supplied by the caller and preserves any unrecognized historical fields already stored by another platform version; `--full-replace` validates the caller's complete target and intentionally removes omitted fields. The write uses CAS, increments only that environment revision, and writes a durable before/after audit. Production writes additionally require `--confirm-production`. `organizationWrites=explicit_capability_only` removes the environment-level deny but still requires `app:organization:manage`; there is no unrestricted bypass mode. Release hard gates stay limited to explicit scope/profile/target, authorization, a clean pushed mainline, immutable candidate identity, CAS/lease, and explicit production confirmation; documentation and human acceptance remain advisory unless strict mode was intentionally configured.

`openxiangda studio` starts a loopback-only local Developer Center with a random session token. It shows target bindings, candidate/deployment status, Git state, test evidence, drift, and the next safe action. Its buttons invoke only registered OpenXiangda operations; it does not expose arbitrary shell execution. Production promotion and rollback still require an explicit production confirmation.

`resource plan` and `resource publish --dry-run` run behind a strict GET/HEAD-only HTTP guard. If a read receives HTTP 401, the command fails with `READ_ONLY_AUTH_REQUIRED` and never calls the token refresh POST from inside the plan. Run `openxiangda auth refresh --profile <name>` (or log in again) before retrying; a plan must not mutate auth state or platform resources.

For Function/Automation plans, `formFieldContracts` resolves statically
referenced Forms through the target application's registry and checks
filter/order fields against frozen online Form schemas. A missing application
mapping or field makes publish fail before lease/write; repeating every source
reference in every Function manifest is not required. Dynamic field names are
checked again by the platform before SQL and return `FORM_FIELD_NOT_FOUND`
instead of a database-column error.

React SPA workspaces publish their frontend with `openxiangda runtime deploy`. Every finalized Runtime release is built from a clean, committed Git `HEAD`; the CLI freezes `sourceRevision`, the current active release, and its source revision before any build/upload. Deploy fails with `RUNTIME_SOURCE_BASE_DIVERGED` when its `HEAD` does not descend from the online Runtime source, including with `--no-activate`, so an old isolated worktree cannot stage and later activate a silent rollback. `.openxiangda/`, `openspec/`, `dist/`, and other pure generated/governance/state paths do not make the source dirty, but `--no-build` cannot bypass the lineage gate. An intentional rollback requires `--allow-runtime-rollback --reason "<at least 8 characters>"`, which is persisted for audit and never bypasses dirty/non-Git checks.

Environment-managed `release ship`, recovery `release deploy`, and `release promote` accept the same audited Runtime rollback pair. It is forwarded only to `runtime-stage`, never to resource stages or `app-finalize`. Ship freezes the intent in its private journal so production confirmation can inherit it automatically; without the explicit pair, lineage divergence remains blocked.

Before publishing the OpenXiangda npm package, run `npm run test:release` once on the final clean version commit. The full suite always includes the equivalent-scale Delivery V2 conformance scenario above. For an AdminList-only SDK patch, use the fixed `npm run test:release:sdk-admin-list` profile instead; it runs the AdminList state and response contracts plus the release-evidence guard without exercising unrelated deployment orchestration. Both commands write hash-bound evidence under `.openxiangda/evidence/tests/<HEAD>/release.json`. `npm publish` validates that evidence against the exact Git commit, package version, Node version, and complete passing result, then runs the mainline guard; it does not execute the selected suite a second time. Unknown or cross-module changes should continue to use the full release suite. Any commit, version, runtime, result, or evidence-hash drift remains fail closed.

Parallel tasks develop and test in isolated worktrees, but feature worktrees do not publish. After approved commits are merged and pushed, `sdd bundle <release-change> --changes ...` unions their exact structured scope and preserves the source changes' common Git baseline instead of adopting the post-merge `HEAD`. Old imported changes that predate source-base metadata must pass `--source-base-ref <commit>` explicitly. Commit/push the bundle, then run `release publish --change <release-change> --profile <name>` from a clean local main/master whose commit exactly equals the authoritative remote tip. It verifies without rewriting reviewed SDD files, waits for the app lease, freezes one authoritative App capture, executes exact Form/Backend/Runtime staged steps, atomically finalizes the Root App release, and records a resumable local execution journal. Runtime checks use the narrow head endpoint; immutable Git-base artifact hashes are reused across plans.

Because promotion starts from an already-pushed authoritative mainline commit, `openxiangda release integration-status --change <change> --profile <name>` should pass immediately after activation. After a managed ship has ended, `--change` recovers lineage directly from the private `ship.json` or follows its production/preproduction deployment IDs to the matching `execution.json`; a recovery failure names the missing file or field. Run it and `release end`; there is no post-release merge step.

Task worktrees are disposable only after the release lifecycle is closed. From the synchronized canonical main checkout, run `openxiangda workspace cleanup` for a dry-run inventory. A worktree is `SAFE` only when it is OpenXiangda/Codex-managed, its commit is contained in live remote mainline, it is clean and unowned, and it has no private candidate/release journal or promotion lease/baseline. `--apply` is bound to the exact hashed dry-run plan, revalidates under the worktree owner lock, and removes only those reviewed entries plus their unchanged local branches. Newly-safe worktrees are left for the next review. Malformed owner state fails closed. Stale records are reported for explicit manual review because the CLI never runs repository-wide `git worktree prune`. Remote branches are retained.

`openxiangda task status --change <id>` is the compact, read-only answer to
“现在到哪一步”：it combines SDD、TaskResult、IntegrationBundle、execution
journal、lease 和 post-commit outbox，输出进度、ETA、是否已经发生平台写入、
当前阻塞层和下一条动作。`release status --watch` only polls those read APIs; it
does not renew leases, retry writes, or change release state. A successful
`sdd ready` releases the worktree owner only when the current thread/change owns
that exact record; stale owners expire after the canonical two-hour TTL.

Workflow changes participate through an immutable WorkflowRelease child. Generic
resources that do not yet have an immutable staged/versioned platform model are
rejected by the unified atomic release before any live write. Use their explicit
direct maintenance commands only when a reviewed non-atomic operation is intended;
OpenXiangda never silently falls back from `--stage-only` or Root App release to
direct publishing.

The canonical engineering rules are machine-readable:

```bash
openxiangda policy show --json
openxiangda policy check
openxiangda policy render
```

`policy check` detects drift in installed skills, workspace templates, and AI
entrypoints. Generated documents carry `OpenXiangda-Policy-Version`; edit the
canonical policy first instead of independently changing duplicate instructions.

Source-triggered Function and Automation publishing is source-only by default. Backend Release v2 can mix source-backed create, source-free declarative Automation manifest create, source-only update, and manifest replacement update in one immutable child; a stale target therefore causes zero resource writes instead of failing halfway through 88 Functions and 11 Automations. A new Automation with a complete `definitionJson.version="v3"` definition and no `sourceFile` automatically uses manifest create and does not require `--replace-manifest`; incomplete definitions still fail closed. `--stage-only` stops after verification, reports all handled selectors, and never falls back to direct Function/Automation writes when the platform is missing or incompatible. The release preserves online `resourceBindings`, input/output contracts, descriptive metadata, trigger/view configuration, and enabled/published state, and planned noops do not advance resource versions or timestamps. To intentionally make a complete local manifest replace an existing online definition, select exact codes and opt in explicitly with `--replace-manifest --reason "<why this replacement is safe>"`; `--sdd-bypass` does not widen that scope. Standard workspaces use the CLI-bundled scoped builder without spawning workspace `pnpm`, and `source_lineage_v1` compares authored source/dependencies independently from generated bundle bytes.

React SPA templates include stable Vite manual chunk grouping for React, antd, ECharts, editor dependencies, and OpenXiangda runtime/component entrypoints. The SDK keeps large UI dependencies such as `antd-mobile` and `dayjs` external so the application bundler can split them by route. Applications should import from public package entrypoints such as `openxiangda`, `openxiangda/runtime`, and `openxiangda/runtime/react`; do not import `openxiangda/packages/sdk/dist/...` internals to chase bundle size.

Feedback can be sent to a DingTalk custom robot from the CLI. AI agents should proactively report platform defects, missing capabilities, unclear design rules, repeated workarounds, implementation uncertainty, and user-visible UX gaps during development. Store the robot settings in `~/.openxiangda/.env`, not in project files:

```env
OPENXIANGDA_FEEDBACK_DINGTALK_WEBHOOK=https://oapi.dingtalk.com/robot/send?access_token=...
OPENXIANGDA_FEEDBACK_DINGTALK_SECRET=SEC...
```

Submit directly when the report is clear; use preview when robot env is missing or you need to inspect the sanitized payload:

```bash
openxiangda feedback preview --profile dev --summary "发布后资源 404" --description "..."
openxiangda feedback submit --profile dev --summary "发布后资源 404" --description "..." --yes
```

Feedback messages include the logged-in user's name when available, profile/platform/app binding, workspace path, Git branch/commit, CLI/Node/OS versions, OSS bucket metadata, command, error text, logs, and optional context files. Token, cookie, secret, access key secret, phone, and email patterns are redacted before sending.

Use the official npm registry for OpenXiangda updates:

```bash
npm install -g openxiangda@latest --registry=https://registry.npmjs.org --prefer-offline --legacy-peer-deps --no-audit --no-fund
openxiangda update check --json
openxiangda update install
```

Domestic npm mirrors may lag and return an older OpenXiangda version. `openxiangda update check --json` is designed for AI agents: it returns the installed version, latest official npm version, whether an update is available, and the compatibility commands to run after updating. `openxiangda update install` installs from the official registry, prefers the local npm cache, bypasses the expensive peer resolver, disables audit/fund network calls, limits fetch retries, prints a heartbeat every 15 seconds, and stops after 300 seconds instead of appearing stuck. Override that bound with `--timeout-seconds <30-1800>` when a known slow network needs more time. Skills are refreshed by default after a successful update.

## AI design gate and resource CLI

Architecture-class requests run the relevant design gate first. AI agents pause only for unresolved business, security, or data choices that would change the implementation. When the user already supplied concrete requirements and acceptance criteria, agents record the structured SDD scope and implement without a long design essay or duplicate confirmation.

Risk is tiered. Read-only/docs/tests are L0. Narrow reversible fixes are L1 and use `sdd quick`; L2/L3 retain explicit approval and exact structured coverage. SDD is structured-first by default: `change.json`, `coverage.json`, and `release.json` are authoritative, while proposal/design/tasks/evidence/spec prose is generated only by `openxiangda sdd render <change>` or `documentationMode: 'full'`. Workspaces that intentionally require prose completion may set `strictDocumentation: true`. Actual argv, exact scope, mainline identity, lease, CAS, destructive operations, Secrets, and Root App atomic activation remain hard gates.

L1 quick records are generated in a compact form and should not be expanded into design essays. Mainline bundles may keep `<profile>` in reviewed command templates; `release publish --profile <name>` binds the real profile to actual argv without rewriting tracked SDD. React SPA page codes remain logical coverage and activate through one Runtime child. `release app-head` and `runtime releases` return compact summaries by default; add `--full` for the complete manifest.

Every concurrent task uses its own Git worktree/branch and development change. The canonical main checkout is reserved for integration and release; tasks never stash/restore each other's files to make it publishable. The mainline release coordinator bundles selected approved changes after merge; dependency impact outside the approved scope is reported as a warning rather than silently widening a small release. Live commands still require canonical exact selectors, and app-wide/delete operations need explicit authority.

After the mainline release and `release end`, the coordinator runs `workspace cleanup` from canonical main and applies only `SAFE` entries. Dirty/unmerged/owned worktrees and worktrees with private release or promotion state remain blocked for recovery.

Agent investigation is bounded to one complete CodeGraph survey plus at most one focused follow-up, and ordinary work loads one domain skill. Unchanged lease/build waits use `task status --watch` and produce updates only on material transitions.

Before confirmation, agents may read, inspect, snapshot, dry-run, ask questions, and output/write the architecture document. They must not edit source files, mutate platform resources, publish, deploy, send notifications, or call live write/delete endpoints.

Use the discoverable gate commands:

```bash
openxiangda doctor --profile dev --json
openxiangda design gates --topic new-app,public-access --json
openxiangda design template --topic auth,public-access
openxiangda commands --json
```

For formal multi-resource development, keep the repository as the source of truth and use `src/resources/**`:

```bash
openxiangda resource validate function --only customer_get,customer_save --profile dev
openxiangda resource plan function --only customer_get,customer_save --profile dev
openxiangda resource publish function --only customer_get,customer_save --change <change> --profile dev

# Only for an intentional whole-definition replacement:
openxiangda resource publish function --code customer_get --change <change> --profile dev \
  --replace-manifest --reason "reviewed manifest is the complete desired definition"
```

Exact `--only` / `--code` selectors are applied before unrelated manifests, source dependencies, and JS_CODE targets are read or built. Shared/transitive dependencies of the selected targets remain in scope; omitting a selector intentionally preserves full-workspace validation and planning. Resource commands use the packaged canonical scoped builder for standard workspaces, so an older checked-in `scripts/build-js-code.mjs` does not need to be upgraded before the installed CLI gains this optimization; refresh the workspace template only when developers also need the same behavior from a manual `pnpm build-js-code` command.

For source-only Function/Automation changes, the final command does not reconstruct whole definitions with client-side GET+PUT. `release begin` captures the Git/change baseline, one preflight covers every selected code, and Backend Release performs one `prepare -> verify -> activate` sequence for all eligible updates. Repository identity is alias-aware but fail-closed: when a clone-derived primary ID differs from the frozen source base, the CLI uses the frozen canonical ID only if it is present in `releaseSourceRevision.repoAliases`; Backend, Workflow, and Root App Release writes all carry that same ID, while a disjoint identity set fails before prepare. Inspect history with `openxiangda release backend-head|backend-list|backend-detail`, compare it with `backend-diff`, or create an audited immutable rollback with `backend-rollback <releaseId> --change <change> --reason "..."`. Always merge/push the frozen SHA and run `release end` when promotion finishes. A lost or expired lease retains the pending-mainline evidence instead of silently clearing it.

Page repair publishing is staged by default. It first freezes `pages/snapshot`, sends the active Page Release parent plus every page revision, and uses revision `0` only for a genuinely new page. Review with `openxiangda page head|releases|detail|diff`; activate an immutable complete release explicitly with `page activate <releaseId> --change <change>`. Historical activation requires `page rollback <releaseId> --rollback --change <change> --reason "..."`. Parent or revision conflicts are never refreshed or retried automatically.

Use `openxiangda release app-capture` to read the platform's transactionally consistent whole-app manifest. For a normal multi-resource release, stage the changed Runtime/Page/Backend/Form child releases; commands carrying the same `--change` atomically accumulate their canonical immutable entries in `.openxiangda/releases/<change>/staged-resources.json`. Then run `app-finalize --change <change> --staged-resources-json <JSON|file>`. The CLI overlays Runtime/Page/Backend by singleton kind and Form by `formUuid`, preserves every unmodified active child from the read-only capture, and sends the complete frozen manifest through `prepare -> verify -> activate` with `activateStagedChildren=true`. Runtime staging never rewrites local active Runtime state, and a malformed staged response fails closed. The child heads and App head therefore switch in one database transaction (`atomic_staged_children_v1`); any parent, revision, asset, or hash drift stops with zero root activation and is never refreshed or retried. An aborted Form Release is never an idempotent success: rerunning the same scoped form publish removes its aborted staged index and creates a new immutable attempt automatically, after which the whole App is retried atomically. Never work around an App failure by sequentially activating forms. `app-prepare` accepts the same overlay for a manual reviewed flow, and `app-activate <releaseId> --activate-staged-children` performs the explicit atomic activation. For a legacy workspace whose already verified immutable Root cannot pass historical baseline/session compatibility, a platform administrator may use the audited break-glass path: `app-activate <releaseId> --activate-staged-children --break-glass-adopt-verified-root --reason "..."`. It skips only workspace/baseline/source compatibility checks; a fresh lease/baseline plus Root parent CAS, exact child identity/hash/parent/head, and the atomic transaction remain mandatory. When the operator explicitly requires an unconditional legacy recovery, `app-activate <releaseId> --force-activate-without-validation --profile <name>` sends a single activation write without reading detail/capture or requiring change, lease, baseline, source, status, parent, hash, resource-head, environment, or child-lineage checks. Authentication, the bound tenant/appType data boundary, target-row existence, database constraints, and the one database transaction remain inherent execution requirements. Calling `app-finalize` without an overlay remains a compatibility-only retrospective aggregation of already-active children. `app-rollback <releaseId> --change <change> --reason "..."` prepares the audited rollback manifest.

If exact FormRelease children were already staged for the same change before a new release baseline or lease is acquired, the CLI reuses them only after checking the server's immutable, inactive, non-aborted release, exact app/form identity and content hash, frozen schema/formType, finalized resources, parent/base revision, and current Form head. Verified children are rebound to the newly owned baseline/session; local `schemaSyncedAt` is not treated as release evidence. Missing or conflicting evidence still fails closed, and neither direct schema synchronization nor early Form activation is required.

For small live fixes, diagnosis, or AI command discovery, use first-class resource commands. They all accept `--profile`, `--app-type`, `--json`, `--json-file`, `--dry-run`, and write commands can use `--write-manifest` to avoid repo/platform drift:

```bash
openxiangda route upsert --json-file src/resources/routes/public_register.json --dry-run
openxiangda public-access upsert --json-file src/resources/public-access/public_register.json --write-manifest
openxiangda public-access session-test public_register --path /view/APP_XXX/public/register --json
openxiangda public-access grant-check public_register --form-code registration_form --json
openxiangda auth-config methods --json
openxiangda function invoke submit_public_registration --body-json '{"input":{}}'
openxiangda connector invoke sms.sendCode --body-json '{"body":{"phone":"13800000000"}}'
openxiangda notification preview public_register_notice --body-json '{"payload":{"title":"测试"}}'
openxiangda organization capabilities --profile dev --json
openxiangda organization department-list --profile dev --json
openxiangda organization account-list --profile dev --keyword alice --json
openxiangda permission snapshot --form-codes customer,orders --json
openxiangda permission audit --json

# external backend Open API contract and one-time credential management:
openxiangda open-api spec list --search submitFormData --json
openxiangda open-api spec describe /dingtalk-api/v1.0/forms/submitFormData --method post --json
openxiangda open-api credential list --profile dev --json
```

调用和测试类命令会检查 JSON envelope。HTTP 200 但 `code: "PUBLIC_GRANT_DENIED"`、`success: false` 或其他字符串业务错误码会被当作失败。

角色资源里的 `apiPermissionCodes` 依赖平台端已存在的 API 权限点。比如校区管理员需要维护应用角色时，manifest 应声明 `app:role:manage`；如果 `resource publish` 提示缺少这个权限点，说明当前平台租户的 `api_permissions` seed 不完整，通常是平台版本未包含 seed、服务启动 seed 没跑成功，或租户创建在 seed 之后。处理方式是升级/重启平台并补齐权限点 seed，或由平台管理员补入 `app:role:manage`、`app:page-permission-group:manage`、`app:form-permission-group:manage` 等应用级权限点；不要为了通过发布删除 manifest 里的权限声明。

Codex skills are installed separately from login/profile state. Run `openxiangda skill install` after installing or linking the CLI. It installs the `openxiangda` root skill plus the 9 top-level subskills into `${CODEX_HOME:-~/.codex}/skills` by default:

- `openxiangda`
- `openxiangda-core`
- `openxiangda-app`
- `openxiangda-architecture-design`
- `openxiangda-form`
- `openxiangda-page`
- `openxiangda-workflow-automation`
- `openxiangda-permission-settings`
- `openxiangda-inspect`
- `openxiangda-open-api`

Use `openxiangda skill install --dest <skills-dir>` to target a different Codex skills directory. If a same-name skill exists but was not installed by OpenXiangda, the command refuses to overwrite it unless `--force` is provided. Restart Codex after installing skills.

For existing app workspaces created before AGENTS.md / `.qoder/rules/` / `.cursor/rules/` / `scripts/guard-publish.mjs` / `package.json` `_guard:publish` were added, run:

```bash
openxiangda skill bootstrap                 # current dir, dry-run by default? no — write
openxiangda skill bootstrap --dry-run --json # preview
openxiangda skill bootstrap --force          # overwrite drifted local copies
```

It copies the AI-guidance bundle (AGENTS.md, Qoder/Cursor always-on + glob rules, the publish guard script) and patches `package.json` with the `_guard:publish` script plus `prepublish:all` / `prepublish:oss` / `preregister` / `preregister-bundle` / `prepublish:changed` / `preopenxiangda:publish` hooks so that direct `pnpm publish:all` / `pnpm publish:oss` / `pnpm register` calls fail-fast unless invoked through `openxiangda workspace publish ...`.

Create a new publishable app workspace with `openxiangda workspace init <dir>`. The command writes a minimal `sy-lowcode-app-workspace` template with React, Ant Design, the single `openxiangda` package, and the required `publish:all` / `openxiangda:publish` scripts. Use `--install` to run `pnpm install` immediately, or run it manually after creation.

New OpenXiangda code pages and form custom pages publish with `cssIsolation: "none"` by default, so Tailwind utilities and normal Ant Design styles apply without a `.sy-app-workspace` prefix. Explicit `namespace` and `shadow` settings are kept only for legacy compatibility.

OpenXiangda workspaces include a lightweight runtime preview for new user pages. `/view` remains the user-facing URL prefix, but local development does not enter the legacy `sy-lowcode-view` workbench checks; the Vite dev host mounts `src/pages/*` directly and sends SDK requests through the configured service proxy.

```env
OPENXIANGDA_BASE_URL=https://dev-lowcode.example.com
OPENXIANGDA_APP_TYPE=APP_XXXX
OPENXIANGDA_DEV_HOST=myapp.local
OPENXIANGDA_DEV_PORT=5174
APP_SERVICE_PREFIX=/service
```

```bash
npm run dev
```

When `OPENXIANGDA_BASE_URL` or `APP_PLATFORM_URL` is set, the workspace Vite server proxies `/service/*` to the platform backend with `changeOrigin`, `cookieDomainRewrite: ""`, and `cookiePathRewrite: "/"`. This keeps local browser requests same-origin and lets HttpOnly `access_token` / `refresh_token` cookies be saved on the local dev domain.

The dev host also calls the backend runtime route resolver for the current `/view/...` URL. Workbench code-page routes select and mount the matching local `src/pages/<page>/index.tsx`; built-in routes such as form submit, detail, process detail, data list, and file preview render the SDK default pages directly instead of accidentally mounting the first local page.

Built-in route defaults come from the `openxiangda` SDK: `StandardFormPage`, `FormSubmitTemplate`, `FormDetailTemplate`, `ProcessDetailTemplate`, and `DataManagementList`. Workspaces can override whole built-in pages from `src/runtime/builtin-overrides.tsx`; exact `formUuid` entries win before the `*` fallback.

```tsx
import type { BuiltinRouteOverrides } from "openxiangda/runtime";

export const runtimeRouteOverrides: BuiltinRouteOverrides = {
  "form-submit": {
    customer: CustomerSubmitPage,
    "*": SubmitShell,
  },
  "form-detail": {},
  "process-detail": {},
  "data-manage-list": {},
};
```

AI / Playwright verification should use real user identity, not a bypass mode. The backend exposes `POST /openxiangda-api/v1/apps/:appType/verification-login-links` for platform admins to create a short-lived, single-use `loginUrl` for a target user and redirect URI. Playwright can open the returned URL directly; the backend writes cookies and redirects back to the local or tenant `/view/...` page. Test users can be created with `POST /openxiangda-api/v1/apps/:appType/test-users`; they use the `__ox_ai_test__:<appType>:<key>` ID prefix and are intended to be used through verification login links.

An independent production user shell can call `resolveBrowserRuntimeRoute()` from `openxiangda/runtime` first. It posts the current `/view/...` path to `/openxiangda-api/v1/apps/:appType/runtime/routes/resolve`; the backend classifies the route as `custom-page`, `builtin-route`, `legacy-fallback`, or `not-found`. Code pages return backend-authorized bootstrap data directly, so the shell can pass that to `mountBrowserPageRuntime()` or mount with `createBrowserPageContext()` without reusing the legacy view workbench logic. Built-in routes can be rendered with `BuiltinRouteRenderer`, which loads form schema through the same `/service` proxy and keeps backend permission checks authoritative.

```ts
import { resolveBrowserRuntimeRoute } from "openxiangda/runtime";

const route = await resolveBrowserRuntimeRoute({
  appType: "APP_XXXX",
  path: window.location.pathname,
  search: window.location.search,
});
```

Local workspace state is authoritative. If the current folder has no `.openxiangda/state.json` app binding, create a new app instead of searching the platform for a similar app name:

```bash
openxiangda workspace init ./my-app-workspace --profile dev --app-name "示例应用"
```

Bind to an existing app only when the user explicitly provides an `appType` or asks to reuse an existing platform app:

```bash
openxiangda workspace init ./my-app-workspace --profile dev --app-type APP_XXXX
openxiangda workspace bind --profile dev --app-type APP_XXXX
```

表单页、流程表单页和自定义代码页都应在 `sy-lowcode-app-workspace` 中实现，由 `openxiangda workspace publish --profile <name>` 统一构建、上传 OSS 并注册到平台。`openxiangda form create`、`form publish`、`page publish` 只作为底层修复/诊断命令，不作为 AI 生成页面的主入口。

表单数据导出使用 `openxiangda form export`，不要手写下载接口 URL：

```bash
openxiangda form export customer --mode xlsx --profile dev
openxiangda form export customer --mode xlsx-images --profile dev --all
openxiangda form export customer --mode package --profile dev --output ./exports/
```

`xlsx` 是普通 Excel；`xlsx-images` 会尽量把 `ImageField` 图片嵌入单元格；`package` 会下载 zip，包含 `data.xlsx`、`attachments/` 和 `manifest.json`。`--output` 指向目录时使用服务端文件名，指向文件路径时按该路径写入；`--json` 只输出 `{ file, filename, mime, bytes, mode, formUuid }` 摘要，不把二进制写到 stdout。

运行时页面读取当前用户信息时，优先使用 `sdk.user.getCurrent<PageUserRecord>()`。用户对象会返回常规组织成员关系 `departments`，也会返回系统维护的所属单位字段 `affiliatedDepartmentId` / `affiliatedDepartment`。`departments` 表示用户真实所在的部门、班级、专业等成员关系；`affiliatedDepartment` 表示业务上用于统计、筛选和展示的归属单位，通常是学院、单位或在源单位缺失时可用的具体部门节点，不用于替代权限部门成员关系。

钉钉家校通讯录的家长、学生、教师身份和明确监护关系使用 `sdk.organization.schoolContact.*`（页面）或 `ctx.organization.schoolContact.*`（App Function）。已登录非游客用户无需给应用角色额外绑定权限，默认可查询当前租户全部关系，返回平台用户 ID、手机号、钉钉 userid 和姓名；`teachers.list` 还返回 `teacher.managedClasses`、`class.headTeachers` 和同步/人工 `source`，用于班主任双向查询。应用可显式声明 `:self:read` / `:class:read` 收紧范围。完整示例见 [`docs/dingtalk-school-contact-relations.md`](docs/dingtalk-school-contact-relations.md)。

```ts
import type { PageUserRecord } from "openxiangda/runtime";

const currentUser = await sdk.user.getCurrent<PageUserRecord>();
const user = currentUser.result;

const affiliatedDepartmentName = user?.affiliatedDepartment?.name;
const affiliatedDepartmentExternalId = user?.affiliatedDepartment?.externalId;
```

工程化资源放在工作区 `src/resources/` 下，由 `openxiangda resource validate|plan|publish|pull` 管理。`workspace publish` 会先构建并注册 workspace 表单/页面，再执行非破坏性资源 upsert，这样菜单、权限组、流程和表单设置可以解析最新的 profile-local ID。需要删除平台中 manifest 未声明的资源时，显式传 `--prune`。连接器页面运行时通过 `sdk.connector.invoke()` / `sdk.connector.call("connector.api")` 调用平台运行时接口，第三方密钥只保存在后端连接器配置中。

React SPA 新应用的无需登录访问统一使用 `/view/:appType/public/*`。应用在 `src/resources/routes/*.json` 声明公开路由，在 `src/resources/public-access/*.json` 声明公开策略、外部角色和可访问资源 grant，页面用 `PublicAccessGate` 或 `createPublicAccessClient` 创建 scoped public session。React SPA 路由树必须在 `OpenXiangdaProvider` 内再包一层 `OpenXiangdaPageProvider`；页面只要调用 `usePageSdk()`、`usePageContext()`、`useDataSource()` 等 Page SDK hooks，就依赖这层 provider。公开 guest 的 form、dataView、function、connector、storage 默认全部拒绝，只有 policy `grants` 明确列出的资源可访问，并且仍受对应表单权限组、dataView 权限组、storage grant 等后端权限控制。

`mode: "ticket"` 的公开策略默认按单次 ticket 使用；只有明确配置 `ticketConfig.singleUse: false` 时才允许复用。新 public session 只返回 bearer token，SDK 会把 token 注入后续 runtime/bootstrap、dataView、function、connector 请求，不依赖认证 cookie。

公开页上传图片或附件时，不要放开游客全局 `/service/file/upload`。public-access policy 必须用结构化表单 grant（例如 `grants.forms: [{"code":"registration","actions":["upload","preview"],"fields":["materials"]}]`）明确绑定表单、动作和可选字段；需要自定义限制时，再在该 form grant 的 `upload` 或 `grants.storage` 声明 bucket、MIME、扩展名、大小、visibility 和 `pathPrefix`。`ImageField` / `AttachmentField` 会携带 public guest 凭据及 `appType/formUuid/fieldId` 上下文，服务端以当前启用策略重新核验并生成 objectName；这些前端参数只用于与签名 claim 比对，不能单独授权。私有文件预览/下载仍通过 access ticket，并再次校验 `preview/download` action。

```json
{
  "grants": {
    "storage": [
      {
        "bucketName": "images",
        "actions": ["upload", "preview"],
        "allowedMimeTypes": ["image/jpeg", "image/png", "image/webp"],
        "allowedExtensions": ["jpg", "jpeg", "png", "webp"],
        "maxSizeBytes": 15728640,
        "visibility": "private",
        "pathPrefix": "public/register/images/"
      },
      {
        "bucketName": "attachments",
        "actions": ["upload", "preview", "download"],
        "allowedMimeTypes": [
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "text/plain",
          "text/csv",
          "application/json"
        ],
        "allowedExtensions": [
          "pdf",
          "docx",
          "xlsx",
          "pptx",
          "txt",
          "csv",
          "json"
        ],
        "maxSizeBytes": 31457280,
        "visibility": "private",
        "pathPrefix": "public/register/attachments/"
      }
    ]
  }
}
```

公开访问和测试脚本不能只判断 HTTP 状态。平台部分运行时接口可能返回 HTTP 200，同时在 JSON envelope 中返回业务错误码，例如 `code: "PUBLIC_GRANT_DENIED"`。只有 `code` 为 `200`、`"200"` 或兼容成功码 `0` 时才算成功；字符串错误码、`success: false` 或非 2xx HTTP 都必须当作失败。

旧 `?publicAccess=guest` 和表单 `settings/forms/*.json` 里的 `publicAccess` 只用于旧 `sy-lowcode-view` 兼容。新 React SPA 应用不要再设计或生成这种链接。

公开页面里的图片和附件分两类处理。真正可以对公网长期公开的资产，例如仪器封面图、公开说明书、门户 banner，应上传到平台公开文件区，默认 bucket 为 `public-assets`，上传后保存的 `url` / `previewUrl` / `downloadUrl` 会是 `/file/public/...`，未登录浏览器可以直接读取并被浏览器/CDN 缓存。仍可能包含隐私、审批材料、订单报告、结算单、维保现场照片的附件不要放入公开区，应继续保存在私有 bucket，并通过登录态或受控文件票据访问。

```ts
import { createFormRuntimeApi } from "openxiangda";

const api = createFormRuntimeApi({ baseUrl: "/service" });
const file = await api.uploadPublicFile(imageFile, "public-assets");

// file.url === "/service/file/public/public-assets/..."
// file.visibility === "public"
```

图片字段和附件字段支持浏览器端压缩图。对用户上传的大图，可以在 `ImageField` 或 `AttachmentField` 上启用 `imageCompression`，运行时会保留原图 `url`，并额外上传缩略图和预览图，保存到 `thumbUrl`、`previewUrl` 和 `variants`。非图片、GIF、SVG、小于阈值的图片，以及浏览器不支持 canvas 压缩时会自动退回原上传流程。

图片和附件预览由运行时统一处理：图片点击后进入同组弹窗画廊，视频、音频和文档在站内弹窗中打开；预览动作只在平台 capability API 返回 `canPreview: true` 时展示。表单上下文继续使用 `ImageField` 和 `AttachmentField`；自定义 React SPA 页面展示任意业务数据里的文件时，直接使用 `ImagePreviewGrid`、`AttachmentPreviewList`，或用 `useFilePreview` 接入自定义卡片和表格。不要为只读附件伪造 `FormProvider`，也不要自行维护扩展名白名单。

```tsx
import {
  AttachmentPreviewList,
  ImagePreviewGrid,
} from "openxiangda/runtime/react"

<AttachmentPreviewList items={record.attachments || []} />
<ImagePreviewGrid items={record.photos || []} />
```

这些独立 API 必须在模板默认提供的 `OpenXiangdaProvider` 和 `OpenXiangdaPageProvider` 内使用。它们会从 PageSdk 获取当前 `appType`，并统一处理 preview ticket、metadata 和二进制文件响应。默认覆盖 PDF、常见媒体、文本、DOCX 和 XLSX，更多 DOC/XLS/PPT、ODF 格式由部署侧 ONLYOFFICE 配置决定。只有在需要复制、分享或新窗口打开预览页时，才通过 PageSdk `sdk.createFileAccessTicket(..., "preview", { appType })` 获取并打开 `previewPageUrl`；不要直接打开文件内容流 `previewUrl`。

```tsx
import { ImageField } from "openxiangda";

<ImageField
  fieldId="photos"
  label="现场照片"
  uploadProvider="oss"
  storageCode="evaluate_oss"
  imageCompression={{
    enabled: true,
    skipBelowBytes: 200 * 1024,
    thumb: { maxWidth: 320, maxHeight: 320, quality: 0.72 },
    preview: { maxWidth: 1280, maxHeight: 1280, quality: 0.82 },
  }}
/>;
```

压缩默认 `format: "source"`，会尽量沿用原图片格式。如果显式输出 `webp`、`png` 或 `jpeg`，对应 OSS storage resource 的 `allowedExtensions` 也要包含该扩展名。

```json
{
  "code": "public_register",
  "mode": "guest",
  "routeCode": "public.register",
  "pathPattern": "/view/:appType/public/register",
  "externalRoleCodes": ["external_visitor"],
  "grants": {
    "forms": ["registration_form"],
    "dataViews": ["public_registration_lookup"],
    "functions": ["submit_public_registration"],
    "connectors": ["sms.sendCode"],
    "storage": [
      {
        "bucketName": "images",
        "actions": ["upload", "preview"],
        "allowedMimeTypes": ["image/jpeg", "image/png", "image/webp"],
        "allowedExtensions": ["jpg", "jpeg", "png", "webp"],
        "maxSizeBytes": 15728640,
        "visibility": "private",
        "pathPrefix": "public/register/images/"
      }
    ]
  }
}
```

```tsx
import {
  OpenXiangdaPageProvider,
  OpenXiangdaProvider,
  PublicAccessGate,
} from "openxiangda/runtime/react"

const PublicLoading = () => <div role="status">正在进入公开页面</div>
const PublicAccessError = ({ error }: { error: { message?: string } }) => (
  <div role="alert">{error.message || "公开链接不可用或已过期"}</div>
)

<OpenXiangdaProvider appType={appType} servicePrefix="/service">
  <OpenXiangdaPageProvider>
    <PublicAccessGate
      errorFallback={error => <PublicAccessError error={error} />}
      fallback={<PublicLoading />}
      policyCode="public_register"
      routeCode="public.register"
    >
      <PublicRegisterPage />
    </PublicAccessGate>
  </OpenXiangdaPageProvider>
</OpenXiangdaProvider>
```

不要把 `PublicAccessGate` 单独放在没有 `OpenXiangdaProvider` / `OpenXiangdaPageProvider` 的页面树下；否则 public session 不能注入后续 SDK 请求，`usePageSdk()` 也会抛出 `usePageSdkStore 必须在 PageProvider 内使用`。公开页面必须给 `PublicAccessGate` 配 `fallback` 和 `errorFallback`，避免慢网、缺 ticket、ticket 过期时出现空白页。

多表只读查询和固定口径统计优先声明 `src/resources/data-views/*.json` 数据视图，而不是在页面里手写多次单表查询再拼数据。默认 `storageMode: "materialized"` 会创建 PostgreSQL materialized view，适合读多写少和可接受刷新延迟的列表/报表；`storageMode: "live"` 每次查询实时编译逻辑视图，适合强实时但数据量可控的复杂查询。`viewType: "aggregate"` 是统计聚合视图，适合按客户、状态、月份等维度聚合 count/sum/avg/min/max。发布时 CLI 会把 `formCode` 解析为当前 profile 的 `formUuid`；页面通过 `sdk.dataView.query(code, params)` 查询行级视图，通过 `sdk.dataView.stats(code, params)` 查询聚合视图，也可以用 `sdk.dataSource.run()` 路由 `dataView.query` / `dataView.stats`。materialized 模式应为常用筛选、排序、统计维度和时间桶声明 `indexes`，并确认用户能接受的刷新延迟；live 模式忽略 `indexes`，不需要刷新。

后端业务逻辑优先声明为 App Function：源码放在 `src/functions/<functionCode>/index.ts`，资源 manifest 放在 `src/resources/functions/<functionCode>.json`。函数运行在 trusted_node 中，通过 `ctx.form.queryOne/queryMany/getById/createOne/updateOne/updateById`、`ctx.files.readAsBase64`、`ctx.process.startFromExistingInstance/resolveCapabilities/resubmitTask/withdraw/transferTask`、`ctx.dataView`、`ctx.connector`、`ctx.notification`、`ctx.organization`、`ctx.platform.roles`、`ctx.platform.api` 等受控 API 访问平台能力；自动化、流程和运行时接口都可以调用同一个 function。`ctx.files.readAsBase64` 只读取当前 `formData` 已授权的图片附件，或由当前应用的 `formCode/formUuid + formInstId + fieldId` 定位的图片；它不会下载任意 URL，单文件上限为 10 MiB，Base64 不应写入日志、函数返回值或业务表。已发布可信代码可以访问当前租户、当前应用内的资源，Function `resources` 是可选的环境映射、审计和影响分析信息，不再是逐函数权限白名单；跨应用、跨租户和外部敏感能力仍受平台边界限制。`ctx.process` 复用正式工作流服务，以真实运行时 operator 执行，流程实例、任务授权、操作日志、事件和 replay 语义与 PageSdk 后端接口一致。角色查询和角色成员维护优先使用 `ctx.platform.roles.list/findByCode/addUsers/removeUser`，底层 `ctx.platform.api` 返回 HTTP 包装和平台 envelope，需要业务代码自行解包。运行时页面调用会在 `ctx.operator`、`ctx.currentUser`、`ctx.permissions` 中注入可信的角色上下文；敏感业务动作必须读取这些服务端上下文，不要信任页面 input 里传入的角色字段。`ctx.form.createOne/updateOne/updateById` 是后端受控写入，不是页面用户对目标表单的直接提交入口；内部多表写入应走 App Function，不要为了函数写入给普通用户开放原始 submit 权限。内部业务表单需要关闭原始写入接口时，在表单 settings 中设置 `runtimeWrite.mode="function_only"`。

`trusted_node_v2` 的应用角色正式契约和完整 TypeScript 示例见 [App Function 角色 API](docs/app-function-role-api.md)。业务函数应直接声明 `ctx: AppFunctionContextV2` 后调用 `ctx.platform.roles`；不再自行扩展上下文类型，也不要通过 `ctx.platform.api` 拼角色管理 URL。

App Function 访问第三方凭据时使用 `app_function_secrets_v1`：manifest 顶层只声明 `secretRefs: [{ "name": "dingtalk_org_app_key", "required": true }]`，同时使用 `definitionJson.version="function_v2"`、`runtimeContractVersion="trusted_node_v2"`；源码通过 `await ctx.secrets.get(name)` 解析，并通过 `ctx.utils.http` 访问受控公网 HTTPS（该桥接不会携带平台 Runtime token）。值只能经 `openxiangda secret create|rotate --value-stdin --change <id> --profile <name>` 或隐藏 TTY 输入，禁止进入 Git、manifest、源码、构建产物、plan、日志或异常。带 `secretRefs` 的 Function 必须走 `backend_release_v2`；需要整应用原子发布时先执行 `resource publish function --only <code> --stage-only`，再把返回的真实 `stagedResource` 交给 `release app-finalize --staged-resources-json ...` 完成 `atomic_staged_children_v2`。默认直接激活的 Backend Release 只返回 `activeResource`，不会伪装成 staged；旧平台 capability 不完整时 CLI 会失败关闭，绝不忽略绑定。

平台部门和账号管理走 app-scoped organization 能力。只读查询要求目标应用的 `app:organization:read` 或 `app:organization:manage`，创建、更新和密码操作要求 `app:organization:manage`；平台管理员天然可用，普通应用角色需要显式授权。Runtime service principal 不会直接放行，`ctx.organization` 会按真实操作人 / audit actor 校验权限。新接口不提供删除；`account-update` 不能携带 `password`，重置他人密码必须走 `account-reset-password`，当前用户改密用 SDK / `ctx.organization.accounts.changeMyPassword({ oldPassword, newPassword })`。

CLI 写操作必须加 `--force`：

```bash
openxiangda organization capabilities --profile dev --json
openxiangda organization department-list --profile dev --json
openxiangda organization department-create --profile dev --body-json '{"name":"销售部","parentId":"dept-root"}' --force
openxiangda organization department-update dept-sales --profile dev --body-json '{"name":"华东销售部"}' --force
openxiangda organization account-list --profile dev --keyword alice --page 1 --page-size 20 --json
openxiangda organization account-create --profile dev --body-json '{"id":"user-alice","username":"alice","password":"P@ssw0rd","name":"Alice","departmentIds":["dept-sales"],"affiliatedDepartmentId":"dept-sales"}' --force
openxiangda organization account-update user-alice --profile dev --body-json '{"name":"Alice Chen","departmentIds":["dept-sales"]}' --force
openxiangda organization account-reset-password user-alice --profile dev --body-json '{"newPassword":"NewP@ssw0rd"}' --force
```

页面 SDK 和 App Function 使用同一套后端权限：

```ts
const capabilities = await sdk.organization.capabilities();
if (!capabilities.result?.canManage) {
  throw new Error("当前账号没有组织账号管理权限");
}

await sdk.organization.departments.create({
  name: "销售部",
  parentId: "dept-root",
});

await sdk.organization.accounts.create({
  id: "user-alice",
  username: "alice",
  password: initialPassword,
  name: "Alice",
  departmentIds: ["dept-sales"],
});

// App Function / trusted JS uses ctx.organization with the same permission check.
await ctx.organization.accounts.resetPassword("user-alice", {
  newPassword,
});
```

应用登录能力通过 auth resource 和 runtime SDK 提供：登录配置放在 `src/resources/auth/<code>.json`，默认 React SPA 模板已包含 `/view/:appType/login`，自定义页面可使用 `createAuthClient({ appType, servicePrefix })` 或 `LoginPage` / `useAuth` from `openxiangda/runtime/react`。钉钉登录默认使用 `dingtalkFlow="auto"`：只有明确位于钉钉容器且 JSAPI 可用时才走免登码，普通浏览器会请求应用级 OAuth 地址并跳转钉钉认证页；自定义页可调用 `getDingTalkOAuthUrl({ returnUrl })` 接入相同能力。手机号验证码、CAS/SSO 或其他外部登录可以由 App Function provider 校验外部凭证，但 provider 只能返回 `phone` / `email` / `externalId` / `unionId` 等身份声明；平台后端按 auth resource 策略执行账号匹配、绑定、创建或拒绝，并由平台统一签发 token/cookie。默认注册策略是拒绝，开启自动注册或白名单注册前必须确认身份匹配键、默认角色、验证码 TTL/频率/失败次数、审计字段和错误文案策略。

常用数据视图命令：

```bash
openxiangda resource validate --profile dev
openxiangda resource plan --profile dev
openxiangda resource publish --profile dev
openxiangda data-view list --profile dev
openxiangda data-view status ticket_with_customer --profile dev
openxiangda data-view refresh ticket_with_customer --profile dev
openxiangda data-view query ticket_with_customer --query-json query.json --profile dev
openxiangda data-view stats ticket_stats_by_customer --query-json stats-query.json --profile dev
```

AI-authored automation can use code-first resources:

- Source: `src/automations/<resourceCode>/index.ts`
- Definition: `src/resources/automations/<resourceCode>/definition.code.json`
- Preview: `src/resources/automations/<resourceCode>/preview.json`
- Logs: `openxiangda automation executions|logs|diagnose`

AI-authored workflows can use compile-time SDK resources:

- Source: `src/workflows/<resourceCode>/workflow.ts`
- Manifest: `src/resources/workflows/<resourceCode>/workflow.json`
- Compiled graph: `definition.v3.json`
- Read-only preview: `preview.json`
- Local check: `openxiangda workflow compile src/workflows/<resourceCode>/workflow.ts --check`
- Runtime operations: use `sdk.process.resolveCapabilities(...)` or `ProcessActionBar` / `ProcessTimeline` from `openxiangda/runtime/react` instead of hard-coded workflow buttons.
- Runtime task centers: use `sdk.workCenter.listItems({ boxType: "todo" })` and `sdk.workCenter.getStats()` for the current user's todo/done/cc/initiated lists and counts; do not build end-user todo pages by reading workflow operation logs or raw process-task tables.
- Delayed approval start: save a process-form draft without starting workflow via `StandardFormPage submitBehavior="save-draft"` or `sdk.form.create({ formUuid, data, saveAsDraft: true, startProcess: false })`; later call `sdk.process.startFromExistingInstance({ formUuid, formInstId })` or render `StandardFormPage` with `submitBehavior="start-existing-process"` to start approval in place. Do not create a second process instance and delete the draft.
- AI workflow cookbook and action payload table: read `openxiangda-skills/references/workflow-v3.md` for the draft -> start existing instance -> return to initiator -> resubmit flow, and for operation payload details such as `approve` using process `instanceId` while `transfer` / `return` / `resubmit` use `taskId`.

Resource and connector manifest guide: [docs/openxiangda-resources-and-connectors.md](docs/openxiangda-resources-and-connectors.md).

Skill migration plan: [docs/skill-refactor-plan.md](docs/skill-refactor-plan.md).

Release isolation and speed roadmap: [docs/release-isolation-and-speed-roadmap.md](docs/release-isolation-and-speed-roadmap.md).

Reproduced concurrency incidents and regression invariants: [docs/release-concurrency-incident-matrix.md](docs/release-concurrency-incident-matrix.md).
