---
name: openxiangda-v1
description: "Use OpenXiangda for private low-code platform work: app workspaces, forms, pages, resources, functions, automations, workflows, permissions, publishing, deployment, diagnosis, profiles, and the openxiangda CLI."
---

<!-- OpenXiangda-Policy-Version: 7 -->

# OpenXiangda

OpenXiangda connects an AI coding workspace to the private low-code platform through a normal-user profile and `/openxiangda-api/v1`. External backends using AK/SK are a separate `openxiangda-open-api` flow.

This file is a router and safety card. Read only the one or two subskills selected below; do not load every OpenXiangda reference into the same turn.

## Select the runtime generation first

If the workspace contains `openxiangda.config.ts`, `apps/web`, and `apps/server`, it is a platform-2.0 application. Stop this 1.x resource flow and use the independently released `$openxiangda-v2` unified skill. The 2.0 CLI operates on one immutable application package and does not use SDD or per-resource publishing.

If the workspace contains `app-workspace.config.ts`, forms/pages/resource manifests, or an existing 1.x state directory, continue with this router. Never migrate a stable 1.x application merely because platform 2.0 is available.

## 1.x Delivery V2 is the normal 1.x release path

When `app-workspace.config.ts` declares `deliveryVersion: 2`, all later V1 SDD,
Git-mainline, candidate/ship, `--change`, and `--only` release rules are
compatibility notes only. Do not assemble a V2 release from low-level commands.

```bash
openxiangda check --environment preproduction
openxiangda deploy preproduction --json
openxiangda deploy production --package <packageDigest> --json
openxiangda status <runId> --json
openxiangda retry <runId> --json
openxiangda rollback production --to <appReleaseId> --json
```

The V2 compiler derives the exact desired-state delta, excludes secrets, builds
Runtime once, uploads content-addressed layers, and creates a server-persisted
ReleaseRun. Production consumes the sealed preproduction package without a
rebuild. `check --json` returns the exact resource delta and ordered plan;
resource deletion and undeclared third-party authored build dependencies fail
before remote writes. The package execution uses the CLI-bundled toolchain and
never links the caller workspace `node_modules`.

Keep the `runId`; failures preserve successful checkpoints. `status` and
`retry` auto-locate preproduction or production when no environment is given.
Retry fences the previous attempt and safely replays local Form bindings, so it
can resume from another machine without recreating completed platform writes.
Deterministic Runtime build IDs combine the Runtime layer and sealed package
digests, preventing cross-package provenance collisions. An exact same-package
retry reuses an existing `uploaded` release only after exact
content/source/parent verification and never overwrites immutable storage.

## Keep the agent loop small

- Start with one broad CodeGraph exploration that names the complete flow or feature. Use at most one focused follow-up when the first result explicitly omits a required symbol; do not repeat overlapping surveys.
- Ordinary work uses this router plus one domain subskill. Add a second domain subskill only when the accepted scope genuinely crosses domains; three or more OpenXiangda subskills require stopping and narrowing the task.
- When the user already supplied concrete requirements and acceptance criteria, record the structured SDD scope and implement. Do not turn a resolved request into a long design essay or ask for a duplicate confirmation.
- During an unchanged lease/build wait, report the first blocker and then only material state changes. Prefer `openxiangda task status --watch` over repeated narrative updates.

## Decide the track

| Intent                                                 | Read next                                                        | First action                                                               |
| ------------------------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Diagnose, snapshot, compare, explain an error          | `openxiangda-inspect`                                            | read-only snapshot/inspect                                                 |
| Login, profile, release, CLI/state issue               | `openxiangda-core`                                               | resolve explicit profile and workspace                                     |
| Create or bind an app                                  | `openxiangda-app`                                                | inspect local binding, then init/bind                                      |
| Form/schema/data view                                  | `openxiangda-form`                                               | inspect the target form and schema                                         |
| React/classic page                                     | `openxiangda-page`                                               | inspect the target route/page                                              |
| Function, automation, workflow, JS_CODE                | `openxiangda-workflow-automation`                                | inspect the exact resource codes                                           |
| Roles, permission groups, data scope                   | `openxiangda-permission-settings`                                | produce the permission matrix                                              |
| DingTalk school-contact guardian/student relationships | `openxiangda-page` plus `references/school-contact-relations.md` | use the platform relationship SDK, defaulting to unrestricted tenant scope |
| New app architecture, auth, public access              | `openxiangda-architecture-design` plus the relevant domain skill | run the design gate                                                        |
| External backend/OpenAPI/AK-SK                         | `openxiangda-open-api`                                           | describe the exact operation                                               |

## Scope before work

1. Work from the app workspace root and pass `--profile <name>` to every write or release command.
2. In a shared app repository, reserve the canonical `main`/`master` checkout for integration and release. Every development task uses an isolated Git worktree/branch from the latest remote mainline; never stash, restore, or overwrite another task's changes to make the canonical checkout publishable. Merge approved task commits into the authoritative remote default branch before any live release. Formal publish runs once from a clean local `main`/`master` that exactly equals the remote tip; feature worktrees never publish.
3. Close tasks from the canonical main checkout after merge, push, release, and `release end`. Run `openxiangda workspace cleanup` first and apply only that exact reviewed `SAFE` plan. Cleanup revalidates managed worktrees under the owner lock, never picks up newly-safe entries, and never performs global `git worktree prune`; stale records require separate review. Never delete a worktree directory directly. Local task branches close with the worktree; remote task branches follow a separate retention policy.
4. Give the task one stable SDD change id. Use `--change <id>` on context, plan, check, verify, publish, and archive commands when supported.
5. Plan and publish exact resource codes with `--only <codes>` or `--code <code>`; a type-only or full-resource publish is allowed only when the dependency closure intentionally contains the whole type/application.
6. A React SPA page change rebuilds one application runtime. Commit the complete build input first, upload/preview with `runtime deploy --no-activate`, and promote only from a clean merged release head that descends from the online Runtime source revision.

An exact Function/Automation selector is an early scope boundary: unrelated manifests, source dependency graphs, and JS_CODE targets must not be read, typechecked, or built. Transitive/shared/ambient dependencies of the selected entry remain included. No selector intentionally keeps full-workspace behavior.

Never infer a release scope from a globally dirty `git status` when multiple changes are present. Never publish a temporary source tree that differs from the reviewed patch.

## Risk and approval

- **L0 — no SDD:** read-only diagnosis, docs, tests, or tooling changes that do not mutate an app/platform release.
- **L1 — lightweight change:** copy/style-only UI edits, a single existing resource binding, or an equally narrow reversible fix. Record exact files/resources and verification. If the user already requested the concrete change after seeing its scope, do not ask for a redundant second confirmation.
- **L2 — full SDD:** forms/schema, business Function behavior, Automation/Workflow, permissions, auth/public access, data writes/migrations, runtime/config, or multi-resource changes.
- **L3 — full SDD plus promotion confirmation:** destructive/irreversible operations, production migrations, broad permission/public-access expansion, or an app-wide release.

For L2/L3 app work:

```bash
openxiangda sdd context --changed --change <change> --json
openxiangda sdd propose <change>
# record the user's approval, then:
openxiangda sdd approve <change>
openxiangda sdd verify <change> --changed --stage implementation --profile <name>
```

For an eligible L1 edit, create the exact approved record directly; the user's concrete request is the approval, so do not add a redundant proposal/approval loop:

```bash
openxiangda sdd quick <change> --kind copy --pages <page> --files <file> --summary "<explicit user intent>"
```

Function quick changes require the complete `--risk-json` assessment; Automation, Workflow, schema, permissions, auth/public access, migrations, destructive and cross-resource changes cannot use quick mode. Before release run `--stage prepublish`; use `postpublish` only after promotion and `archive` only when all evidence exists.

New SDD records use three independent scopes: `changedResources` records what the change owns, `runtimeDependencies` records extra resources affected through shared/transitive code, and `deployTargets` is the exact production write set. Never copy dependency impact into deploy targets automatically. Candidate preflight validates all three before source freeze or any remote candidate/deployment write; a failed preflight must not modify reviewed SDD files or create an execution journal.

Quick changes use compact generated JSON/prose. Do not expand them into proposal/design essays; implement the exact covered code, run the focused check, and let the mainline bundle own final atomic promotion.

Keep development lightweight: structured approval plus exact resource/file scope are authoritative. By default, only `change.json`, `coverage.json`, and `release.json` are created; use `openxiangda sdd render <change>` when prose is genuinely useful. Missing tasks/evidence/spec prose warns and does not block release; set `strictDocumentation: true` only for a workspace that intentionally wants prose as a gate. Actual publish argv, mainline identity, CAS, lease, destructive scope, and atomic activation remain hard gates.

The CLI regenerates one canonical command set from structured coverage instead of asking agents to maintain two command copies. A single Function uses `resource publish function --only <code>`; qualified selectors are used when Function and Automation are mixed. When Form settings and form permission groups are both present, they must share one `resource publish form-setting,form-permission-group` command with qualified `form-setting:<code>` and `form-permission-group:<code>` selectors so one immutable FormRelease contains both snapshots. Generated React SPA plans use exact Form bundles, one Backend `--stage-only` command, Runtime `--no-activate`, and Root `app-finalize`. Prepublish and actual-argv validation require those exact same type/selector sets and reject missing, extra, or split Form resources.

## Safe release recipes

Classic workspace, exact page/form:

```bash
openxiangda workspace plan --change <change> --changed --profile <name> --json
openxiangda workspace check --change <change> --changed --profile <name>
openxiangda workspace publish --change <change> --profile <name> --only pages/a,forms/b --dry-run
openxiangda workspace publish --change <change> --profile <name> --only pages/a,forms/b
```

React SPA resources/runtime:

```bash
# In task worktrees: implement, test, commit, then merge/fast-forward and push all approved changes.
# In the clean main checkout:
openxiangda sdd bundle <release-change> --changes <change-a,change-b>
# Commit and push the generated bundle on main, then:
openxiangda release publish --change <release-change> --profile <name>
```

Environment-managed application:

```bash
openxiangda release ship --change <release-change> --profile <name>
# Stop here by default and validate the preproduction environment.
openxiangda release ship --change <release-change> --profile <name> \
  --confirm-production
```

For a workspace registered by `environment init` or connected by `environment attach`, production is never a direct publish target. `release ship` always executes candidate → preproduction → production. The normal first invocation stops after preproduction; a later `--confirm-production` promotes the same candidate. If the user explicitly authorizes an emergency, putting `--confirm-production` on the first invocation runs both phases in one command without skipping preproduction, evidence, CAS, or confirmation. The sealed candidate contains source/build/public/script inputs, stable environment/resource bindings, and hashed target-specific Runtime artifacts; deployment uploads those exact artifacts with no rebuild and closes each server deployment as `succeeded`. Human acceptance remains recommended and may be recorded with `--acceptance-note`. Lower-level candidate/deploy/test/fail/promote commands are recovery primitives. `release fail` is preproduction-only: pass an explicit deployment and audit message, and the CLI verifies the deployment belongs to the selected preproduction environment before it writes optional code/details. Keep preproduction and production identities isolated, and retain the existing authorization/CAS rules for environment swap and policy changes. Use `openxiangda studio` for bindings, drift, evidence, and safe next actions.

Candidate binding checks treat only `resources.dataViews.<code>.status` as a mutable platform lifecycle observation, so a candidate survives its own `active → draft → active` staging sequence and older sealed candidates remain resumable. DataView IDs, materialized-view names, storage modes, other resource statuses, candidate hashes, environment identity, CAS, lease, and source/mainline checks remain exact.

A sealed candidate may be promoted from a later clean, pushed authoritative mainline commit only when the candidate commit remains its Git ancestor and every sealed candidate input file still has the exact recorded hash. This permits unrelated parallel merges without allowing stale candidate inputs to overwrite newer work. The later HEAD is only a safety gate: Backend, Runtime, and Root child releases all keep the sealed candidate `sourceRevision`; cleanup commands such as `backend-abort` remain protected by the same publish lease/baseline/session. Do not edit private candidate metadata to bypass `CANDIDATE_INPUTS_CHANGED`. The CLI waits for both the app lease and target deployment slot; each target permits only one running or evidence-pending deployment. Emergency fixes stay on the same candidate → preproduction → production path with a narrow L1 scope. `--wait-seconds 0` is fail-fast, not a binding-contract, CAS, or production-confirmation bypass.

For an audited catch-up whose exact non-delete targets are already merged but whose active resources combine multiple historical release lineages, the first ship invocation may add `--adopt-online-baseline --adoption-reason "..."`. Ship validates and freezes the pair before candidate/deployment creation; the later `--confirm-production` invocation automatically reuses the same intent from the private ship journal and forwards it only to exact scoped resource stages. Frozen online heads, change/lease ownership, delete/prune/force rejection, server CAS, staged-child verification, and the single atomic App finalize remain mandatory.

When an environment-managed release intentionally replaces complete Function/Automation manifests, `release ship` may add the inseparable `--replace-manifest --reason "..."` pair. The reason must be at least 8 characters; only an exact Backend selector receives it, and the production confirmation must repeat the exact preproduction pair. It never widens Form, Workflow, Runtime, configuration, wildcard, or app-wide stages.

When the sealed Runtime source intentionally does not descend from the active Runtime lineage, managed `release ship`, recovery `release deploy`, and `release promote` may add `--allow-runtime-rollback --reason "..."`. The reason must be at least 8 characters. The CLI forwards the pair only to `runtime-stage`, never to Backend/Form/Workflow/configuration or `app-finalize`; ship freezes the pair in `ship.json`, and production confirmation automatically inherits it. Without the explicit pair, Runtime lineage remains fail closed.

`resource plan` and publish dry-runs are strictly GET/HEAD-only. `READ_ONLY_AUTH_REQUIRED` means the access token expired; run `openxiangda auth refresh --profile <name>` or log in again before retrying. Never add an automatic refresh POST inside a plan.

`release publish` is the default promotion entrypoint only for legacy unmanaged workspaces. It verifies without rewriting reviewed `change.json`/`release.json`, waits for the app lease, freezes the App capture after ownership is acquired, executes deterministic exact staged steps, resumes from `.openxiangda/releases/<change>/execution.json`, atomically finalizes, verifies mainline integration, and releases the lease. When the same audited historical-lineage condition applies, legacy `release publish` accepts `--adopt-online-baseline --adoption-reason "..."` and forwards the pair only to exact `resource publish --only/--code` stages; missing reasons or plans without an exact resource stage fail before lease acquisition. Environment-managed applications use the two-phase `release ship`; candidate/deploy/test/fail/promote, `release begin`, and child commands remain recovery/diagnostic primitives.

Reviewed bundle commands may retain `<profile>` as a template. The explicit real `release publish --profile <name>` value is bound to actual child argv without rewriting tracked SDD. React SPA page codes are logical coverage targets and activate through one Runtime child; they do not require PageRelease. `release app-head` and `runtime releases` are compact by default; use `--full` only when the complete manifest is required.

Exact `resourceSelectors` are authoritative for supported configuration resources such as `publicAccessPolicies`. A legacy `resources=true` category marker is narrowed by those exact selectors and must not become an app-wide generic-resource release. Missing selectors, unknown resource types, wildcard `*`, deletes, and genuine app-wide resource closures remain fail closed.

`release begin --change` freezes a clean committed `HEAD` only when the current branch is the authoritative default `main`/`master` and its commit exactly equals the live remote tip. Before any live write, the CLI preflights the complete target set and rejects source changes during the release. A feature worktree or unpushed main receives `RELEASE_SOURCE_MAINLINE_REQUIRED` / `RELEASE_SOURCE_MAINLINE_NOT_PUSHED`; merge, test, push, and start the one mainline release instead of forcing it. Optional `.git` remote suffix differences and other recorded repository aliases are accepted only when the frozen source-base ID intersects `releaseSourceRevision.repoAliases`; Backend, Workflow, and Root App Release writes then use the frozen canonical ID. Genuinely different identity sets still fail closed before prepare.

Because promotion begins from the already-pushed authoritative mainline, `release integration-status --change <change>` should pass immediately after activation. For a completed managed ship it recovers lineage from private `ship.json`, then from the referenced production/preproduction deployment execution journal; a failure identifies the missing file or field. Run it, then `release end`; no post-release branch merge is required.

`runtime deploy` separately freezes the clean committed `HEAD` as `sourceRevision` together with the current active Runtime parent before any build or upload. Any deploy whose source does not descend from the online Runtime fails with `RUNTIME_SOURCE_BASE_DIVERGED`, including `--no-activate`; this prevents staging an old preview for later activation. `--no-build` does not bypass this guard. Only an intentional audited rollback may use `--allow-runtime-rollback --reason "<at least 8 characters>"`, and that flag never permits dirty or non-Git input. SDD evidence under `openspec/` and generated/state paths do not make Runtime source dirty.

For a whole-app release, keep changed Runtime/Page/Backend/Form children staged and run `openxiangda release app-finalize --change <change> --staged-resources-json <JSON|file> --profile <name>`. The JSON contains only changed immutable child entries; the CLI overlays Runtime/Page/Backend by singleton kind and FormRelease by `formUuid` onto one authoritative read-only capture, preserving every unmodified active child. It then performs `prepare -> verify -> activateStagedChildren=true`, switching child heads and the App head atomically (`atomic_staged_children_v1`, or `atomic_staged_children_v2` when a Backend Release v2 child is present). Never refresh or retry after a conflict. The flow requires the owned stored lease/change baseline and carries the same client session and Git lineage on every write. A platform administrator may recover a legacy, already verified immutable Root with `app-activate <releaseId> --activate-staged-children --break-glass-adopt-verified-root --reason "..."`. This audited recovery skips workspace/baseline/source compatibility only; it still requires a fresh lease/baseline and enforces Root parent CAS, exact child identity/hash/parent/head, and atomic activation. An explicitly authorized unconditional legacy recovery may use `app-activate <releaseId> --force-activate-without-validation --profile <name>`; this sends one activation write without local reads or release control/lineage/CAS gates. Authentication, bound tenant/appType scope, target-row existence, database constraints, and transactional execution remain inherent. Omitting the overlay is compatibility-only retrospective aggregation of already-active children.

When the same change already has staged FormRelease children before a fresh baseline/lease is acquired, keep them staged. The CLI may rebind each child into the new session only after server verification of immutable/inactive/non-aborted state, exact app/form identity and content hash, frozen schema/formType, finalized resources, parent/base revision, and current Form head. `schemaSyncedAt` is local cache metadata, not release evidence. Do not direct-publish or activate a Form to bypass Workflow validation; missing or conflicting staged evidence must fail closed.

When a Function or Automation is selected because its TypeScript source changed, publishing is source-only by default. Backend Release v2 accepts source-backed create, source-free declarative Automation manifest create, source-only update, and manifest replacement update in one immutable child and one database transaction, so a stale member produces zero resource writes and noops do not advance versions/timestamps. A new Automation with a complete `definitionJson.version="v3"` and no `sourceFile` automatically uses manifest create without `--replace-manifest`; an incomplete definition still fails closed. `--stage-only` is fail-closed: every selected mutation must enter that child, and a missing/incompatible Backend Release API never falls back to direct writes. Online bindings, input/output contracts, metadata, trigger/view configuration, and enabled/published state remain unchanged unless exact `--replace-manifest --reason "..."` authority was provided for an existing resource.

Treat resource declarations as environment mapping and release-observability metadata, not as per-Function authorization. Trusted code can access Forms/DataViews inside its current tenant and application without repeating every resource in every manifest; cross-app and cross-tenant access remains forbidden. Source analysis reports undeclared application resources as warnings. Explicit duplicate Automation outer/runtime declarations must still match, and explicit environment-specific code-to-ID mappings remain part of the sealed/read-back release contract.

An App Function may declare metadata-only top-level `secretRefs: [{ name, required }]` only with `function_v2` + `trusted_node_v2`; source resolves values with `await ctx.secrets.get(name)` and uses `ctx.utils.http` for controlled public HTTPS. Create/rotate values through hidden TTY or `openxiangda secret ... --value-stdin --change <change> --profile <name>`. Never put values in arguments, files, manifests, state, plans, logs, errors, or chat. Secret bindings require `backend_release_v2` and whole-app `atomic_staged_children_v2`; a missing capability is fail-closed and never uses the legacy source PATCH. For whole-app activation use exact-scope `resource publish <type> --only <code> --stage-only`, then pass the returned verified `stagedResource` to `release app-finalize`; an active Backend Release is never labeled staged.

The lease is app-level promotion ownership, while worktree ownership prevents two Codex tasks from editing through the same source directory. Different worktrees may keep developing and validating; only the clean synchronized main checkout publishes. Use full resource/runtime publish only when the approved bundle intentionally covers the whole dependency closure.

## Always

- Treat `.openxiangda/state.json` as CLI-maintained durable ID/environment mapping, not a task lock or merge mechanism. Volatile candidate/deployment progress belongs under the private `.openxiangda/releases/` journal.
- Keep resource IDs isolated per profile; never copy IDs from dev to prod.
- Use platform roles, permission groups, public grants, and backend Function checks for authorization; frontend hiding is presentation only.
- Keep tokens and secrets out of project files and chat.
- Use official public SDK entrypoints and platform form/file components.
- Read school-contact guardian/student and teacher/class relationships through
  `sdk.organization.schoolContact` or the trusted App Function bridge. Use
  `SCHOOL_HEAD_TEACHER` only for global identity and `teachers.list` for the
  exact class relationship; consume `teacher.managedClasses` and
  `class.headTeachers` for the two relationship directions and inspect
  `source` when synced/manual provenance matters. Keep the
  authenticated non-guest default tenant-wide scope without adding an app-role
  permission binding unless the product explicitly requires self/class
  restrictions; never infer relations from department membership.
- Report platform defects or repeated workarounds with `openxiangda feedback submit --yes` when a configured feedback channel is available.
- Run `openxiangda update check --json` once at the start of substantial work, when a version mismatch is suspected, or when the cached check is older than one day. Do not repeat it on every confirmation turn.
- Install an available update with `openxiangda update install`; it reuses the npm cache, avoids peer-resolution stalls, emits a heartbeat, and has a bounded timeout. Do not replace it with a bare repeated `npm install -g` unless bootstrapping the CLI for the first time.

## Never

- Do not call `pnpm publish:all`, `pnpm publish:oss`, `pnpm register`, or `lowcode-workspace publish-*` as the live entrypoint.
- Do not omit `--profile` on writes/releases.
- Do not run an unscoped full publish after a narrow edit.
- Do not use query parameters, hard-coded roles, fake IDs/data, or UI visibility as sensitive authorization.
- Do not ask the user to paste AK/SK/app secrets. Normal work uses the user profile; external integrations use the dedicated credential flow.
- Do not import SDK internals or hand-build legacy React SPA public/workbench routes.

## Subskills

- `../openxiangda-core/SKILL.md`
- `../openxiangda-app/SKILL.md`
- `../openxiangda-architecture-design/SKILL.md`
- `../openxiangda-form/SKILL.md`
- `../openxiangda-page/SKILL.md`
- `../openxiangda-workflow-automation/SKILL.md`
- `../openxiangda-permission-settings/SKILL.md`
- `../openxiangda-inspect/SKILL.md`
- `../openxiangda-open-api/SKILL.md`

Load a reference only when the selected subskill explicitly requires it. Workspace `AGENTS.md` remains authoritative for project-specific constraints.
