# Legacy Mixed Release Plan Fix

## Problem evidence

- OpenXiangda V1 `1.0.270` generates `workspace publish` with both `forms/*`
  and `pages/*` for a legacy workspace.
- The same plan gives BackendRelease `--staged-form-contracts`, but does not
  create the required immutable FormRelease first.
- SDD verification therefore fails closed with
  `sdd-release-form-stage-missing`. The qfyy production bundle reproduces this
  with FormRelease, BackendRelease, and PageRelease targets in one change.

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
- Exact profile, change id, type set, and selectors remain fail-closed.

## Affected contracts

- `buildWorkspaceReleaseSteps()` ordering for legacy workspaces.
- SDD bundle and prepublish command validation for mixed Form/Page/Backend
  releases.
- No platform HTTP, database, resource schema, or application runtime contract
  changes.

## Failure and concurrency behavior

Form ensure may be replayed locally, but FormRelease, PageRelease, and
BackendRelease remain immutable staged children. Publish lease, frozen change
baseline, parent CAS, source lineage, and atomic Root activation remain
unchanged. The planner must not introduce direct Form activation as a fallback.

## Security and resource bounds

The change does not broaden resource selection or authorization. Every command
continues to use exact reviewed selectors, one application profile, and one
change id. It adds no new network endpoint, credential, retry, or unbounded
operation.

## Rollback boundary

Rollback is the OpenXiangda V1 npm patch version and the corresponding V1
gitlink. No platform rollback or data migration is required. Applications can
remain on the preceding package until they need a legacy mixed release.

## Falsifiable verification

- A legacy Form + Backend + Page fixture generates, in order: Form ensure,
  FormRelease stage, BackendRelease stage, PageRelease workspace stage, and one
  Root finalize.
- The workspace step contains only `pages/*`; no `forms/*` target appears.
- The generated plan passes the existing atomic SDD validator.
- React SPA release-plan tests remain unchanged and passing.
- The qfyy mainline bundle passes `sdd verify --changed --stage prepublish`
  with profile `zju-itservice` before any live write.
