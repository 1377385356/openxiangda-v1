# OpenXiangda Delivery V2

This workspace uses `deliveryVersion: 2`. Delivery V2 is desired-state based,
content-addressed, resumable, and independent from Git/SDD cleanliness.

Normal release commands are deliberately limited to:

```bash
openxiangda check --environment preproduction
openxiangda deploy preproduction --json
openxiangda deploy production --package <packageDigest> --json
openxiangda status <runId> --json
openxiangda retry <runId> --json
openxiangda rollback production --to <appReleaseId> --json
```

Rules:

- Do not assemble a release by choosing low-level `workspace publish`,
  `resource publish`, `runtime deploy`, `release publish`, `release ship`, or
  `app-finalize` commands. Delivery V2 owns that orchestration.
- Do not add `--only`, `--change`, SDD bypass flags, Git-clean workarounds, or
  production-confirmation flags. The package compiler derives the exact delta.
- Preproduction compiles and uploads one immutable App Package. Production
  deploys that exact `packageDigest` without rebuilding.
- `check --json` shows the exact resource delta, dependency-only Form bindings,
  and ordered plan. Resource deletion fails before any remote write.
- Authored Form/Backend/Workflow code uses the CLI-sealed toolchain. Package
  execution never links workspace `node_modules`; undeclared third-party build
  dependencies fail preflight.
- On failure, keep the `runId`. `status` and `retry` auto-locate its environment
  when omitted. Retry preserves successful checkpoints, fences the previous
  attempt, and safely replays local Form bindings on another machine. Runtime
  build IDs include the Runtime layer and sealed package digests, preventing
  cross-package provenance collisions. A same-package retry reuses an existing
  Runtime release only in `uploaded` state after exact content, source, and
  parent verification; storage is never overwritten.
- Project `.env`, credentials, private keys, `.git`, `node_modules`, `dist`,
  and generated `.openxiangda` state are never included in the authored source
  layer. Runtime output is a separate immutable layer.

Low-level V1 commands remain installed only for diagnostics and compatibility
with old workspaces that do not declare `deliveryVersion: 2`.
