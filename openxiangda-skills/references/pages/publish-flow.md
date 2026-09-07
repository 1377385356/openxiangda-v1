# Code Page Publish Flow

Preferred React SPA release entry:

```bash
openxiangda workspace plan --change <change> --changed --profile <name>
```

Do not run `lowcode-workspace publish-all`, `pnpm publish:all`, or legacy
project scripts such as `scripts/openxiangda-publish.mjs` directly for live
publishing. Those commands are workspace internals. They may skip OpenXiangda's
normal-user token/profile injection and fall back to old `APP_KEY` /
`APP_SECRET` behavior, or publish with a buildId that the platform menu does not
activate. Use the staged Form/Backend/Runtime commands emitted by the workspace
plan, then one Root App finalize.

For day-to-day AI edits, prefer a targeted publish:

```bash
# First ask OpenXiangda for the release plan and reliability checks.
openxiangda workspace plan --changed --json
openxiangda workspace check --changed

# Preview what git-touched forms/pages would publish.
openxiangda workspace publish --profile <name> --changed --dry-run

# Stage one exact Form bundle; React page changes are staged in Runtime.
openxiangda resource publish form-setting --only customer --change <change> --profile <name>
openxiangda runtime deploy --no-activate --change <change> --profile <name>

# Atomically activate every staged child and the App head.
openxiangda release app-finalize --staged-resources-json .openxiangda/releases/<change>/staged-resources.json --change <change> --profile <name>
```

Do not use full workspace publish as a reflex. Full publish is only appropriate
when many modules were intentionally changed, shared/config changes affect many
pages, or the incremental cache needs a repair pass. For a single page edit,
publish that page.

Targeted publish skips `src/resources` by default. Add `--resources` if resource
manifests changed too, or run `openxiangda resource plan|publish` separately.
Use `--skip-resources` when you explicitly want forms/pages only.

React SPA workspaces use a fixed staged release order:

```bash
openxiangda workspace plan --change <change> --changed --profile <name> --json
openxiangda resource publish form-setting --only <formCode> --change <change> --profile <name>
openxiangda resource publish function,automation --only function:<code>,automation:<code> --stage-only --change <change> --profile <name>
openxiangda runtime deploy --no-activate --change <change> --profile <name>
openxiangda release app-finalize --staged-resources-json .openxiangda/releases/<change>/staged-resources.json --change <change> --profile <name>
```

If `workspace check --changed` reports risky AI fallback code, missing schema,
or direct platform API calls, fix those issues before publishing.

The CLI injects:

- `OPENXIANGDA_PROFILE`
- `OPENXIANGDA_BASE_URL`
- `OPENXIANGDA_ACCESS_TOKEN`
- `OPENXIANGDA_APP_TYPE`

Workspace tools then:

1. Scan `src/forms/*/schema.ts` and `page.tsx` for normal and workflow form pages.
2. Scan `src/pages/*/page.config.ts` and React entries for custom code pages.
3. Create or bind platform form shells only as needed.
4. Build shared form/page runtimes and per-form/per-page bundles.
5. Upload assets to OSS.
6. Sync form metadata and register form/page bundles through `/openxiangda-api/v1`.

Direct code page publish:

```bash
openxiangda page publish <pageCode> \
  --entry-url <url> \
  --css-urls <url1,url2> \
  --version <version> \
  --build-id <buildId> \
  --profile <name>
```

Use direct publish only for already built assets or targeted repair. It is not the normal AI generation flow.
