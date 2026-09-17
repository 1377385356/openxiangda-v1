# Legacy Mixed Release Plan Fix

## Problem evidence

- OpenXiangda V1 `1.0.270` generates `workspace publish` with both `forms/*`
  and `pages/*` for a legacy workspace.
- The same plan gives BackendRelease `--staged-form-contracts`, but does not
  create the required immutable FormRelease first.
- SDD verification therefore fails closed with
  `sdd-release-form-stage-missing`. The qfyy production bundle reproduces this
  with FormRelease, BackendRelease, and PageRelease targets in one change.
- After the initial planner fix, qfyy proved that `workspace publish` still
  activated PageRelease immediately. Root activation then failed with
  `APP_RELEASE_ACTIVE_CHILD_PREEXPOSED`: the new page head was outside the
  captured active Root and could not be adopted by the atomic transaction.
- The first stage-only adapter still called `page publish` once per selected
  page. Every call cloned the same active PageRelease parent, while the staged
  overlay has one singleton `PageRelease` slot. The last call therefore
  replaced the earlier staged descriptor and could silently omit earlier page
  changes from Root finalize.
- The same recovery also required an intentional Function binding replacement,
  but legacy `release publish` could not scope `--replace-manifest --reason` to
  its Backend stage.

## Capability owner

`lib/release-plan.js` is the authoritative owner of ordered V1 release steps.
SDD validates that plan; application workspaces must not hand-maintain a second
release algorithm.

## Stable invariants

- A changed Form or Form permission group is staged as one immutable
  FormRelease in both legacy and React SPA workspaces.
- Legacy pages continue to use PageRelease. They must not be converted to a
  RuntimeRelease by changing `runtimeMode`.
- BackendRelease is staged only after every declared staged Form contract is
  available.
- Changed Form, Page, and Backend children are activated once through the Root
  App finalize step. A failed child leaves every active head unchanged.
- A legacy workspace step runs with `OPENXIANGDA_PAGE_STAGE_ONLY=1`, records a
  verifiable PageRelease descriptor, and fails before Root finalize if that
  evidence is absent. All selected pages are submitted in one Page publish
  request, and its recorded `selectedPageCodes` must exactly equal the planned
  `pages/*` selectors. The temporary environment is restored after the step.
- Manifest replacement authority reaches exactly one scoped Backend stage and
  never Form, Page, Workflow, Runtime, configuration, or Root finalize.
- Exact profile, change id, type set, and selectors remain fail-closed.

## Affected contracts

- `buildWorkspaceReleaseSteps()` ordering for legacy workspaces.
- Step environment and staged kind are part of the private execution journal
  and release plan hash.
- `page publish` records its immutable staged PageRelease in the current
  change/baseline/session overlay.
- `page publish --pages-json <JSON|file>` accepts one bounded, duplicate-free
  batch and uses one frozen snapshot, one parent CAS, and one PageRelease write.
- Custom and bundled legacy workspace publishers may build/upload pages
  individually, but must perform one batch registration after every selected
  asset is available.
- Legacy `release publish --replace-manifest --reason` flag validation and
  exact Backend forwarding.
- SDD bundle and prepublish command validation for mixed Form/Page/Backend
  releases.
- No platform HTTP, database, resource schema, or application runtime contract
  changes.

## Failure and concurrency behavior

Form ensure may be replayed locally, but FormRelease, PageRelease, and
BackendRelease remain immutable staged children. Publish lease, frozen change
baseline, parent CAS, source lineage, and atomic Root activation remain
unchanged. The planner must not introduce direct Form or Page activation as a
fallback. A missing PageRelease descriptor stops the journal before Root
finalize; it is never interpreted as a no-op. A batch snapshots all page
revisions and active assets once. Any missing/extra selected code, duplicate
code, stale parent, revision drift, incomplete response, or second PageRelease
attempt fails the workspace step and prevents Root activation.

## Security and resource bounds

The change does not broaden resource selection or authorization. Every command
continues to use exact reviewed selectors, one application profile, and one
change id. It adds no new network endpoint, credential, retry, or unbounded
operation. Batch input is capped at 200 page definitions and 2 MiB of canonical
JSON before any network write.

## Rollback boundary

Rollback is the OpenXiangda V1 npm patch version and the corresponding V1
gitlink. No platform rollback or data migration is required. Applications can
remain on the preceding package until they need a legacy mixed release.

## Falsifiable verification

- A legacy Form + Backend + Page fixture generates, in order: Form ensure,
  FormRelease stage, BackendRelease stage, PageRelease workspace stage, and one
  Root finalize.
- The workspace step contains only `pages/*`; no `forms/*` target appears.
- The workspace step has `stagedKind=PageRelease` and the exact stage-only
  environment, which is included in the execution hash and restored afterward.
- A staged `page publish` writes a valid PageRelease entry; missing evidence
  blocks Root finalize.
- A two-page batch performs one `/pages/publish` POST without a single-page
  `If-Match`, carries the complete `expectedRevisions` and
  `expectedActiveAssets` maps, and records both exact selected codes.
- Two sequential one-page staged descriptors cannot satisfy a planned two-page
  workspace step; Root finalize fails with a stable scope error.
- Replacement flags appear only on the exact Backend stage and invalid/missing
  reason or Backend scope fails before lease acquisition.
- The generated plan passes the existing atomic SDD validator.
- React SPA release-plan tests remain unchanged and passing.
- The qfyy mainline bundle passes `sdd verify --changed --stage prepublish`
  with profile `zju-itservice` before any live write.
