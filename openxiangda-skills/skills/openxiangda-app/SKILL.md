---
name: openxiangda-app
description: Manage OpenXiangda low-code apps and workspaces — create / scaffold / bind / inspect / publish apps, manage menus / nav / 导航 / 菜单, app snapshots, and the profile-isolated `.openxiangda/state.json` resource map. Trigger on 创建应用 / 新建 app / scaffold app / 初始化工作区 / workspace init / workspace bind / appType / APP_XXX / app snapshot / 应用快照 / 菜单 / menu / nav, or when the user starts work in an empty folder that should become a sy-lowcode-app-workspace.
---

# OpenXiangda App

## When to use this skill

- User wants to **create / scaffold a new app** or initialize a `sy-lowcode-app-workspace`.
- User wants to **bind** the workspace to an existing platform app (`APP_XXX`) for one profile.
- User asks about **menus / navigation / app snapshot / appType / .openxiangda/state.json shape**.
- Before scaffolding a real business app: read the architecture-pattern decision via `references/best-practices.md`.

## Decision card — new app vs. bind existing

| Situation | Action |
|---|---|
| Empty folder, no `.openxiangda/state.json`, user did NOT mention an `appType` | `openxiangda workspace init <dir> --profile <name> --app-name "..."` (creates a NEW app) |
| User explicitly provides `APP_XXX` or asks to reuse an existing app | `workspace init <dir> --profile <name> --app-type APP_XXX` |
| Existing workspace, no binding for the target profile | `openxiangda workspace bind --profile <name> --app-type APP_XXX` |
| Workspace already bound for the target profile | use it; never re-bind silently |

**Never** search the platform for similar app names to "reuse" — local `.openxiangda/state.json` is authoritative.

## Required Context

Always start from the current profile and workspace binding:

```bash
openxiangda env --profile <name>
openxiangda auth status --profile <name>
```

If the workspace is not bound:

```bash
openxiangda workspace init ./my-app-workspace --profile <name> --app-name "应用名称"
cd ./my-app-workspace
pnpm install
```

For new Phase 6 React SPA apps, use the standard React application template:

```bash
openxiangda workspace init ./my-react-app \
  --profile <name> \
  --app-name "应用名称" \
  --runtime react-spa
cd ./my-react-app
pnpm install
pnpm dev
```

React SPA workspaces use React Router, Tailwind CSS, `OpenXiangdaProvider`
from `openxiangda/runtime/react`, and resources under `src/resources/`.
Do not use old `isRenderNav`, app-shell, or workbench page parameters inside
React SPA routes.

Publish React SPA apps with:

```bash
openxiangda resource publish --profile <name>
openxiangda runtime deploy --profile <name>
```

`runtime deploy` builds and activates the app-level SPA release for `/view/:appType/*`. It uploads `dist/` through staged multipart file uploads by default; use `--upload-mode legacy-json` only as an older-server fallback.
Publish React SPA forms separately with `openxiangda workspace publish --form <formCode>`;
with `runtimeMode: "react-spa"` this is schema-only and does not require OSS.

Bind to an existing app only when the user explicitly provides `appType` or asks to reuse an existing platform app:

```bash
openxiangda workspace init ./my-app-workspace --profile <name> --app-type APP_XXX
openxiangda workspace bind --profile <name> --app-type APP_XXX
```

For menu work:

```bash
openxiangda menu list --profile <name>
openxiangda menu create main --name "主菜单" --type nav --profile <name>
openxiangda menu create customer-entry --name "客户信息" --type receipt --form-code customer --profile <name>
```

If the user explicitly asks to create an app without initializing a workspace:

```bash
openxiangda app create "应用名称" --profile <name>
openxiangda app create "React应用名称" --profile <name> --runtime react-spa
openxiangda workspace bind --profile <name> --app-type APP_XXX
```

## Rules

- Never ask for AK/SK.
- Always pass `--profile` for publish or cross-platform operations.
- Local `.openxiangda/state.json` is authoritative. If the user starts from a new empty directory or the workspace has no app binding, create a new app with `openxiangda workspace init <dir> --profile <name> --app-name "应用名称"`.
- Do not search platform apps or reuse similar app names unless the user explicitly asks to reuse an existing app or gives an `appType`.
- Store platform-specific IDs only in `.openxiangda/state.json`.
- Use logical local codes for forms, pages, workflows, automations, and menus.
- Before scaffolding a new business app, read `references/best-practices.md` and pick an architecture from the initialized `examples/best-practices/` catalog. Do not generate a large single-file app page when a template pattern already covers the scenario.
- For Phase 6 React SPA apps, use `--runtime react-spa`. The generated app owns routing/layouts/menus with React Router and Tailwind CSS; platform permissions still come from backend runtime bootstrap and route checks.
- React SPA form publish is schema-only by default. Do not add OSS credentials or old embedded form bundles unless explicitly maintaining legacy compatibility with `--legacy-form-bundle`.
- When publishing after app edits, prefer targeted commands (`workspace publish --changed --dry-run`, then `--changed`, `--page`, `--form`, or `--only`). Do not publish all forms/pages just because one page changed.
- Use `openxiangda app snapshot <APP_XXX> --profile <name> --json` before changing an existing app.

## Resource State

Read `references/workspace-state.md` when changing `.openxiangda/state.json`.

Read `references/openxiangda-api.md` when exact endpoint fields are needed.

Read `references/resource-manifest-cheatsheet.md` before creating shared resources such as data views, connectors, notifications, App Functions, workflows, automations, permissions, settings, or menus.

Read `references/architecture-patterns.md` to understand the overall app structure (how forms, pages, menus, workflows, and permissions compose into an app, and the recommended `src/forms` / `src/pages` layout) before scaffolding or restructuring an app workspace.

Read `references/best-practices.md` before implementing app-level patterns such as status lifecycles, role governance, PC/mobile portals, high-performance data management pages, workflow boundaries, and automation.
