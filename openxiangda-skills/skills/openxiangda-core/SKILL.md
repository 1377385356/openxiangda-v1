---
name: openxiangda-core
description: Core OpenXiangda CLI workflow for profiles, login, workspace state, precise planning, release, runtime deployment, and version diagnostics.
---

# OpenXiangda Core

Use this skill for login/profile/state questions and any plan, publish, deploy, or release operation. It intentionally contains only release-critical rules; load domain skills for forms, pages, permissions, Functions, Automation, or Workflow behavior.

## Delivery V2

If `app-workspace.config.ts` declares `deliveryVersion: 2`, this section
overrides the V1 release material below. The normal flow has no SDD, Git clean,
mainline ancestry, explicit change id, `--only`, candidate, or ship gate:

```bash
openxiangda check --environment preproduction
openxiangda deploy preproduction --json
openxiangda deploy production --package <packageDigest> --json
```

Use `openxiangda status <runId>` and `openxiangda retry <runId>` for a failed or
interrupted run. Use `openxiangda rollback <environment> --to <appReleaseId>`
for rollback. Never ask the AI to choose or sequence low-level
`workspace/resource/runtime/app-finalize` commands for a V2 release.

`check --json` is the authoritative preflight: inspect its exact resource delta
and ordered plan. Deletes and authored third-party build dependencies are
unsupported and fail before remote writes. V2 executes authored builds with the
CLI-sealed toolchain, never a workspace `node_modules` or custom builder.
`status`/`retry` auto-resolve the run environment if omitted. Retry preserves
completed checkpoints, fences the older attempt, and replays only local Form
bindings when resuming on a different machine. Deterministic Runtime build IDs
combine the Runtime layer and sealed package digests, preventing provenance
collisions across packages with identical Runtime bytes. An `uploaded` release
is reused only for an exact same-package retry when its content hash, source
revision, and parent Runtime release match; all other identities fail closed.

## Resolve the boundary

Before a write or release, establish all four values:

- workspace root;
- explicit profile;
- bound `appType` for that profile;
- one change id and its base revision.

```bash
openxiangda env --profile <name>
openxiangda auth status --profile <name>
openxiangda sdd context --change <change> --changed --json
```

Run `openxiangda update check --json` once per substantial task, on a suspected mismatch, or when the cached check is older than one day. If an update is installed, refresh skills once with `openxiangda skill install --force`.
Use `openxiangda update install` for the upgrade itself so npm reuses its cache, skips peer-resolution stalls and auxiliary audit/fund requests, reports a heartbeat, and exits on a bounded timeout. A bare `npm install -g` is only the bootstrap fallback before the CLI exists.

Every write/release command must include `--profile <name>`. In a shared app repository the canonical main checkout is integration/release-only; parallel tasks develop in isolated Git worktrees/branches and never stash or restore another task's files. Merge approved commits into the authoritative remote default branch, create one `sdd bundle` for the intended changes, commit/push it, and publish once from a clean local `main`/`master` that exactly equals the remote tip.

After merge, push, release, and `release end`, return to the canonical main checkout and run `openxiangda workspace cleanup`. Apply only the exact reviewed `SAFE` plan. The CLI revalidates OpenXiangda/Codex-managed worktrees under the owner lock and leaves newly-safe, malformed-owner, unmerged, dirty, journal-bearing, and stale-record entries untouched. It never runs global `git worktree prune`; review stale records separately. Never remove a worktree directory directly; local task branches close with the worktree, while remote branches follow the repository retention policy.

Keep investigation proportional: one complete CodeGraph survey plus at most one focused follow-up, normally one domain subskill, and no optional prose for a request whose requirements and acceptance criteria are already explicit. Unchanged lease waits should use `task status --watch` and emit only material transitions.

SDD is structured-first by default: only `change.json`, `coverage.json`, and `release.json` are created. Generate optional prose with `openxiangda sdd render <change>`; missing checklist/evidence/spec prose is a warning, while approval, exact structured scope, actual argv, mainline identity, child CAS, lease, and atomic activation remain hard gates. Set `strictDocumentation: true` only when prose completion must intentionally block a workspace.

First-class direct configuration writes (form/page/menu/role/permission/workflow/connector/notification/auth/route/public-access/scope/data-view/storage/settings) also require `--change <id>` or a complete stored session created by `openxiangda release begin --change <id>`. Missing context fails locally with `PUBLISH_CONTEXT_REQUIRED` before any HTTP write. Dry-run, schema planning, validation, query/invoke/export/submit/execution/upload, and other data-plane actions do not acquire a lease. Direct Workflow publish/unpublish/delete additionally requires the frozen `--expected-revision`; never fetch the latest revision merely to replay an older payload.

## Exact planning

Use the same change id for every stage:

```bash
openxiangda workspace plan --profile <name> --change <change> --changed --json
openxiangda workspace check --profile <name> --change <change> --changed
openxiangda sdd verify <change> --changed --stage implementation
```

The approved change scope, not the checkout's global dirty set, is the release boundary. If another change owns a file/resource or the remote revision moved, stop and re-plan.

Treat `scopes.changedResources`, `scopes.runtimeDependencies`, and `scopes.deployTargets` as different contracts. The first owns changed files/resources, the second records shared/transitive impact, and only the third authorizes writes. Dependency analysis may fail closed when an impact was not declared, but it must not silently expand `deployTargets`. Candidate preflight runs release-plan and SDD prepublish checks before source freeze or remote candidate/deployment writes; failure leaves reviewed SDD and private execution state untouched.

For React SPA releases that contain both Form settings and form permission groups, keep them in one immutable FormRelease command: `resource publish form-setting,form-permission-group --only form-setting:<form>,form-permission-group:<group>`. The SDD generator and prepublish/actual-argv validators use this same canonical qualified-selector contract; missing, extra, split, unscoped, or directly activated Form resources remain blocked.

For engineering resources, select type and exact codes:

```bash
openxiangda resource validate function --only function_a,function_b --profile <name>
openxiangda resource plan function --only function_a,function_b --profile <name> --json
openxiangda resource publish function --only function_a,function_b --profile <name> --dry-run
openxiangda resource publish function --only function_a,function_b --profile <name>
```

`resource plan` and `resource publish --dry-run` are strictly GET/HEAD-only. If a read gets HTTP 401, the CLI returns `READ_ONLY_AUTH_REQUIRED` without automatically calling the refresh POST. Run `openxiangda auth refresh --profile <name>` or log in again before retrying; never weaken the plan guard to refresh credentials or mutate platform state.

`--code <code>` is the single-resource equivalent of `--only <codes>`. Type-only planning is appropriate for an intentional shared dependency closure. Unscoped full-resource planning/publishing is app-wide and requires an app-wide approved change.

Selectors apply before manifest parsing, source dependency analysis, and JS_CODE typecheck/build. A scoped Function/Automation plan must touch only the selected targets plus their transitive/shared/ambient dependencies; an unscoped plan intentionally retains full-workspace behavior. Resource commands use the canonical scoped builder packaged with the installed CLI for standard workspaces, so old checked-in builders still receive the optimization; refresh/bootstrap the workspace script only for equivalent manual `pnpm build-js-code` behavior. Nonstandard custom builders remain an explicit compatibility fallback.

Function/Automation source analysis also extracts statically declared Form filter and order fields. `resource plan` resolves them through the target application's resource registry, compares them with each Form's frozen online schema, and reports `formFieldContracts`; publish fails before lease/write when the application mapping or field is missing. A source reference does not need to be repeated in every Function/Automation manifest. Fix the application mapping/source or stage the Form schema in the same reviewed release instead of waiting for a production SQL-column error. Dynamic field names remain runtime-validated by the platform and return `FORM_FIELD_NOT_FOUND` as a configuration error.

Source-triggered Function/Automation targets use Backend Release v2 when the platform exposes that capability. One child may mix source-backed create, source-free declarative Automation manifest create, source-only update, and manifest replacement update through explicit per-resource `operation/mode`; the CLI freezes the current Backend Release parent plus Git/change baseline, then runs `prepare -> verify -> activate` or stops verified for `--stage-only`. A new Automation with a complete `definitionJson.version="v3"` and no `sourceFile` automatically uses manifest create without `--replace-manifest`; an incomplete definition still fails closed. Activation CAS-checks the entire set and applies all updates in one transaction. `--stage-only` and Secret-bound Function publishing fail closed when Backend Release v2 is unavailable; compatibility fallback is limited to non-staged, non-Secret publishing after an explicit Backend head 404. Existing online bindings, contracts, metadata, trigger/view configuration, and enabled/published state remain unchanged; noops do not advance versions/timestamps. A deliberate whole-definition replacement of an existing resource requires exact `--only/--code` and `--replace-manifest --reason "<why>"`; SDD bypass does not imply replacement authority.

Resource declarations are mapping, audit, and impact-analysis metadata rather than per-Function authorization. Trusted application code may use any Form/DataView in its current tenant and app; the platform still rejects cross-app/cross-tenant access. Statically discovered source references that are absent from a Function/Automation manifest are warnings, not publish blockers. When an outer Automation `resources` declaration and runtime `definitionJson.resources` are both explicitly present they must still match, and explicit resource bindings remain sealed/read back so environment-specific code-to-ID mappings cannot silently drift.

Repository identity remains strict across immutable releases. If a clone-derived primary repository ID differs from the frozen change source base, the CLI may canonicalize Backend, Workflow, and Root App Release payloads to the frozen ID only when that ID is already present in `releaseSourceRevision.repoAliases`; no alias intersection fails with `RELEASE_SOURCE_REPOSITORY_MISMATCH` before prepare.

Functions with a top-level `secretRefs` field use `backend_release_v2`, including an explicit empty list that removes bindings. This path never falls back to source PATCH. It requires the per-app Secret capability probe to grant `app_function_secrets_v1`, `trusted_node_v2`, `backend_release_v2`, and `atomic_staged_children_v2`; otherwise plan/publish fails closed.

For whole-app atomic activation, publish the exact mixed Function/Automation scope with `resource publish function,automation --only function:<code>,automation:<code> --stage-only --change <change>`. This stops after Backend Release verify and returns `stagedResource` plus every handled selector; the CLI automatically merges it with other changed staged children in `.openxiangda/releases/<change>/staged-resources.json` for `release app-finalize --staged-resources-json`. A Backend Release that was already activated returns `activeResource` and must not be presented as staged.

Standard workspaces use the CLI-bundled scoped JS_CODE builder directly, including isolated Git-base checks; do not invoke `pnpm` merely to rebuild a selected Function/Automation. New snapshots carry `source_lineage_v1.sourceHash`, which is derived from authored source/dependencies rather than generated bundle bytes, so a builder upgrade does not falsely report source divergence.

Use `openxiangda release backend-head|backend-list|backend-detail|backend-diff` to inspect immutable history. `backend-rollback <releaseId> --change <change> --reason "..."` prepares, verifies, and activates a new release from the historical snapshot; it never mutates or directly reactivates the old row. `backend-abort` stops prepared/verified work and `backend-retry` retries only recorded post-commit side effects. Do not fetch newer revisions to replay an older payload.

Use `openxiangda release app-capture` for the platform's authoritative transactionally consistent whole-app manifest. Normal publishing stages changed Runtime/Page/Backend/Form children first, then runs `app-finalize --change <change> --staged-resources-json <JSON|file>`. The overlay contains only changed immutable child entries; Runtime/Page/Backend use singleton kind identity and FormRelease uses `formUuid`. The CLI preserves unmodified active children from the capture and performs `prepare -> verify -> activateStagedChildren=true`, atomically switching all child heads and the App head (`atomic_staged_children_v1`). Child drift or a lost lease causes zero root activation; never auto-refresh or conflict-retry. An aborted Form Release must never be reused as an idempotent result. Rerun the same exact form resource publish: the CLI discards the aborted staged entry, the platform creates a new immutable attempt automatically, and the Root App transaction is retried. Never sequentially activate forms as a workaround. `app-prepare` accepts the same overlay for manual review, and `app-activate <releaseId> --activate-staged-children` performs the explicit transaction switch. A platform administrator may recover a legacy, already verified immutable Root with `app-activate <releaseId> --activate-staged-children --break-glass-adopt-verified-root --reason "..."`. This audited path skips only workspace/baseline/source compatibility checks; it still requires a fresh lease/baseline and enforces Root parent CAS, exact child identity/hash/parent/head, and atomic activation. For an explicitly authorized unconditional legacy recovery, `app-activate <releaseId> --force-activate-without-validation --profile <name>` performs one direct activation write without detail/capture/change/lease/baseline/source/status/parent/hash/resource-head/environment/child-lineage gates; only authentication, the bound tenant/appType data boundary, target-row existence, database constraints, and the transaction remain inherent. No-overlay finalize remains retrospective compatibility only. `app-rollback <releaseId> --change <change> --reason "..."` prepares an audited rollback manifest.

## Classic workspace

Publish only named pages/forms:

```bash
openxiangda workspace publish --profile <name> --change <change> --only pages/dashboard,forms/customer --dry-run
openxiangda workspace publish --profile <name> --change <change> --only pages/dashboard,forms/customer
```

`--page`, `--form`, and `--changed` remain supported. Full `workspace publish` is only for intentional shared/config releases.

Do not call `lowcode-workspace publish-all`, `pnpm publish:all`, `pnpm publish:oss`, or legacy publish scripts directly; they bypass the selected profile contract.

## React SPA

Forms, Backend resources, and frontend Runtime are staged children of one Root App release:

```bash
openxiangda sdd bundle <release-change> --changes <change-a,change-b>
# Commit and push the bundle on main/master.
openxiangda release publish --change <release-change> --profile <name>
```

Environment-managed application:

```bash
openxiangda release ship --change <release-change> --profile <name>
# Stop by default and validate preproduction.
openxiangda release ship --change <release-change> --profile <name> \
  --confirm-production
```

Once `environment init` registers a logical application, or `environment attach` connects an existing workspace, `preproduction` and `production` are separate target bindings with separate app/resource/data IDs. Never copy IDs between them. Existing legacy resource mappings may seed only the appType-matching target. `release ship` always runs candidate → preproduction → production. Normally the first invocation stops at `awaiting_production_confirmation` and a later `--confirm-production` invocation promotes the same candidate. When the user explicitly authorizes an emergency release, `--confirm-production` may be supplied on the first invocation to execute both phases in one command; it bypasses no preproduction, evidence, CAS, or confirmation gate. Candidate sealing includes source/build/public/script inputs, stable environment/resource bindings, and hashed target-specific Runtime artifacts. Deployment reuses those artifacts without rebuilding and completes both server deployment records to `succeeded`. Human acceptance remains recommended and an optional `--acceptance-note` records it. Direct `release publish` to either managed target fails closed. Environment swap and policy updates retain their existing explicit authorization, CAS, and permission rules. `openxiangda studio` is the local loopback-only developer view and exposes only registered safe actions.

Treat DataView `status` as a platform lifecycle observation during candidate binding checks. The same deployment may change `resources.dataViews.<code>.status` between `draft` and `active`, including between preproduction and production confirmation, without invalidating the sealed candidate. Continue to validate the DataView ID, materialized-view name, storage mode, every other resource status, hashes, environment identity, CAS, lease, and source/mainline evidence exactly.

A sealed candidate may continue from a later clean, pushed authoritative mainline commit only when its commit remains a Git ancestor and all sealed release inputs retain their exact hashes. The later HEAD is only a safety gate: Backend, Runtime, and Root children keep the sealed candidate `sourceRevision`, and `backend-abort` uses the same publish lease/baseline/session as the staged release. If any input changed, create a new candidate; never edit the private candidate file. The CLI waits for the app lease and target deployment slot before writes, and the platform permits one running or evidence-pending deployment per target. Emergency releases still use a narrow L1 scope and the same candidate → preproduction → production path; `--wait-seconds 0` only fails fast.

When a reviewed catch-up contains exact non-delete targets that are already on authoritative mainline but the active application combines several historical release lineages, the first ship invocation may add `--adopt-online-baseline --adoption-reason "..."`. Ship validates and freezes the pair before candidate/deployment creation. The later `--confirm-production` invocation automatically reuses the same intent from `ship.json` and forwards it only to exact scoped resource stages. It does not relax frozen online heads, change/lease ownership, delete/prune/force rejection, server CAS, staged-child verification, or the single atomic App finalize.

An environment-managed release may intentionally replace complete Function/Automation manifests with `release ship --replace-manifest --reason "..."`. The two flags are inseparable, the reason is at least 8 characters, only an exact Backend stage receives them, and production confirmation must repeat the exact preproduction intent. They never widen Form, Workflow, Runtime, configuration, wildcard, or app-wide stages.

For an audited Runtime source rollback, managed `release ship`, recovery `release deploy`, and `release promote` accept `--allow-runtime-rollback --reason "..."` with a reason of at least 8 characters. This pair is scoped only to `runtime-stage` and never reaches resource stages or `app-finalize`. Ship freezes it in `ship.json`; production confirmation inherits it automatically. The default remains fail closed.

`release publish` is the normal whole-app entrypoint for legacy unmanaged workspaces: it verifies SDD without mutating reviewed files, waits for the promotion lease, freezes one App capture, stages the exact Form/Backend/Runtime children, resumes from a private execution journal, finalizes once, and releases the lease. For an approved historical-lineage catch-up, add `--adopt-online-baseline --adoption-reason "..."`; the pair reaches only exact `resource publish --only/--code` stages, never Form ensure, Runtime, or App finalize, and invalid or empty scopes fail before lease acquisition. Managed applications use two-phase `release ship` and its deployment-scoped journal. Individual candidate/deploy/test/fail/promote commands are recovery/diagnostic primitives. `release fail --deployment <id> --message <text> [--code <code>] [--details-json <JSON|file>] --environment preproduction` records an audited UAT failure only after verifying the deployment belongs to the selected preproduction environment; production targets and mismatched deployment identities fail before the write.

Reviewed bundle commands may retain `<profile>` as a template. The explicit real `release publish --profile <name>` value is bound to actual child argv without rewriting tracked SDD. React SPA page codes remain logical coverage targets and activate through the single Runtime child; they do not require PageRelease. If local lease state disappears, `release end --change <id>` reconciles a self-owned remote lease from the private execution journal and never reports inactive while a remote lease is active.

Exact `resourceSelectors` are authoritative for supported configuration resources such as `publicAccessPolicies`. A legacy `resources=true` category marker is narrowed by those exact selectors and must not become an app-wide generic-resource release. Missing selectors, unknown resource types, wildcard `*`, deletes, and genuine app-wide resource closures remain fail closed.

`runtime deploy --no-activate` uploads an immutable preview release from a clean committed mainline `HEAD`. It reads a narrow Runtime head instead of the full app snapshot. Before acquiring a lease, the CLI confirms `package.json#scripts.build` and existing dependencies; it uses `npm run build` to execute the declared script so pnpm worktree symlinks do not trigger a reinstall. Immutable Git-base artifact hashes are cached under the Git common directory. `release begin` requires local main/master and the live remote default tip to be identical, so `integration-status --change <change>` is already satisfied after activation and `release end` does not wait for a later merge. For a completed managed ship, `--change` recovers lineage from private `ship.json` or the referenced production/preproduction deployment execution journal and reports the exact missing file or field when recovery fails.

`release app-head` and `runtime releases` return compact summaries by default. Use `--full` only when the complete manifest is required.

`resource plan`, `resource publish`, and `runtime deploy` report coarse phases on stderr and emit a heartbeat after 15 seconds without completion. JSON stdout stays machine-readable and includes `timings`; use it to identify whether time is spent in plan, preflight, build, upload, write, or activate instead of rerunning an opaque command.

Use `--upload-mode legacy-json` only for an old platform that lacks staged uploads. Keep timeout/progress on stderr so `--json` stdout remains machine-readable.

## Login and profiles

```bash
openxiangda login https://lowcode.example.com --profile dev
openxiangda platform add prod https://lowcode.example.com/platform
openxiangda platform use dev
```

Root, `/platform`, and `/view` URLs normalize to `<origin>/service`. Normal work uses the user's profile token and `/openxiangda-api/v1`; never ask for AK/SK. Each profile has independent `appType` and resource IDs.

Durable local resource/environment mappings live in `.openxiangda/state.json`; volatile candidate/deployment progress lives in the private `.openxiangda/releases/` journal. User tokens live in `~/.openxiangda/profiles.json`; shared environment values live in `~/.openxiangda/.env`. Never copy resource IDs between profiles or put tokens in the workspace.

For an environment-managed workspace with more than one target, `function invoke` requires an explicit `--environment <target>` and prints the resolved profile, environment, kind, appType, and environmentId to stderr before the request. Treat this line as part of the diagnostic evidence; do not infer production behavior from an invocation whose resolved target is preproduction.

## Workspace creation/binding

If a local binding exists, use it. If the user explicitly names an existing `appType`, bind that exact app. Otherwise initialize a new workspace; do not search by a similar app name.

```bash
openxiangda workspace init ./my-app --profile dev --app-name "示例应用" --runtime react-spa
openxiangda workspace bind --profile dev --app-type APP_XXXX
```

## Failure handling

- Wrong/missing profile: stop before writes and resolve `env`/`auth status`.
- Dirty shared checkout: isolate the task; do not broaden its change coverage.
- `SOURCE_BASE_DIVERGED`: the worktree no longer descends from the frozen Git base; merge onto the reviewed head, rebuild, and start a new release. Only when approved code was historically merged before release and the online app has multiple verified release lineages may an exact non-delete catch-up use `--adopt-online-baseline --adoption-reason "..."` under the same change/lease; never use it for a stale branch, delete, prune, force, or full-app wildcard.
- `RESOURCE_FIELD_CONFLICT`: a selected remote field changed after the frozen baseline; fetch the conflicting fields, reconcile the intended change, and re-plan the whole set before writing anything.
- `RUNTIME_HEAD_MOVED` or resource revision conflict: fetch the new baseline, merge, rebuild, and re-plan.
- `RUNTIME_SOURCE_BASE_DIVERGED`: the Runtime build comes from an old/different Git lineage; merge the online release source into a clean committed `HEAD`, rebuild, and retry. Use audited rollback only when the rollback itself is the approved intent.
- `RUNTIME_SOURCE_DIRTY` or `RUNTIME_SOURCE_LINEAGE_REQUIRED`: commit all build inputs in an auditable Git repository; generated `dist/` and `.openxiangda/` state do not count, and `--no-build` is not an escape hatch.
- `PUBLISH_LEASE_HELD`: another change owns promotion; keep developing/testing locally or wait for its release/expiry. Never bypass it with an unleased write.
- `PUBLISH_LEASE_LOST`: heartbeat renewal failed or the lease expired during a long phase; stop immediately, inspect the active head, re-plan, and start a new release. Never replay the remaining writes with a newly fetched revision.
- `RELEASE_SOURCE_DIRTY` or `RELEASE_PUBLISH_REVISION_CHANGED`: commit all build inputs and restart from a stable mainline SHA.
- `RELEASE_SOURCE_MAINLINE_REQUIRED` or `RELEASE_SOURCE_MAINLINE_NOT_PUSHED`: merge approved task commits and the generated bundle into the remote default branch, switch to the synchronized local main/master, then begin the release.
- `WORKTREE_OWNED_BY_ANOTHER_TASK`: another Codex task owns this source directory; switch to an isolated worktree. Only force-claim with an explicit reason after confirming the original task ended.
- Plan unexpectedly includes unrelated resources: do not publish; correct `--change`/`--only` or dependency closure.
- A write updates state: let the CLI use its lock/atomic merge; do not hand-edit state or run conflicting legacy clients.
- Platform defect or repeated workaround: submit sanitized feedback when configured and report its fingerprint.

## References

- `references/workspace-state.md` — state shape and profile isolation.
- `references/openxiangda-api.md` — exact endpoint contracts.
- `references/resource-manifest-cheatsheet.md` — resource examples.
- `references/connector-resources.md` — Function/connector boundaries.

Load a reference only when the current task needs its contract details.
