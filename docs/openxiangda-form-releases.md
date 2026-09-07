# OpenXiangda Form Release / CAS Contract

Form configuration is one immutable release stream. Schema, packages, settings,
indexes, data-management policy, runtime-write policy, and public access must not
be published as independent last-writer-wins updates.

## Mutation Contract

1. Read `GET /forms/:formUuid/snapshot` once and freeze `revision`, `etag`, and
   `activeFormReleaseHead`.
2. Build the complete intended mutation from that frozen snapshot. Resource
   publishing sends declared Form configuration in one `POST /bundle` request.
   This request is stage-only by default and does not change the live Form head.
3. Send `If-Match`, `expectedRevision`, `expectedParent`, and a stable
   `artifactId` with every mutation. Form creation uses `If-Match: 0` and
   `expectedRevision: 0`.
4. On a head/revision conflict, stop without retrying or adopting the newer head.
   Re-plan and explicitly merge the competing change first.
5. Persist the returned revision/head only after the mutation succeeds.

Use `openxiangda resource publish form-settings --only <code> --activate` only
when the staged bundle should be activated immediately. The CLI sends the
explicit JSON boolean `activate: true`; without that flag the response reports
`releaseStatus: "staged"`. The stable artifact ID excludes this activation
control, so a later explicit activation reuses the already staged release.

`schema-plan` is a planning operation. It must return the frozen revision/etag/head
and must not activate or rewrite live Form configuration.

## Release Inspection and Recovery

```bash
openxiangda form release-head <formCode> --profile <name> --json
openxiangda form release-list <formCode> --profile <name> --json
openxiangda form release-detail <formCode> --release-id <id> --profile <name> --json
openxiangda form release-diff <formCode> --from <id> --to <id> --profile <name> --json
openxiangda form release-activate <formCode> --release-id <id> --profile <name>
openxiangda form release-rollback <formCode> --release-id <id> --reason "..." --profile <name>
openxiangda form release-abort <formCode> --release-id <id> --reason "..." --profile <name>
```

Activation and rollback are CAS writes and therefore require a current publish
lease/change baseline. A conflict is a merge decision, not a transient error.
