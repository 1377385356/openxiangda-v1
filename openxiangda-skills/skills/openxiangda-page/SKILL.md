---
name: openxiangda-page
description: "Build, edit, and publish OpenXiangda custom code pages in sy-lowcode-app-workspace/src/pages using React, Ant Design, and openxiangda/runtime. Covers portals, dashboards, workbenches, data-management lists, mobile pages, connector calls, filters, search forms, and single-page publish. Trigger on 创建页面, 修改页面, portal, dashboard, 看板, 工作台, 列表页, mobile portal, page.config.ts, pageCode, JSX, React, or src/pages changes."
---

# OpenXiangda Page

## When to use this skill

- User wants to **create / edit a custom code page** under `src/pages/<pageCode>/` (portal, dashboard, list/detail, workbench, mobile portal, etc.).
- User wants to **publish only a page** (`workspace publish --page <code>`) or rebuild a single page bundle.
- User asks about page SDK (`openxiangda/runtime`), `page.config.ts`, app-shell entry mode, namespace/style isolation, ECharts, drag-drop, antd icons, or named imports from `@ant-design/icons`.
- User asks about **portal / admin console / mobile portal entry** — these must be app-shell code pages.

## Quick recipe

```bash
# 1. preflight
openxiangda env --profile <name>
openxiangda page list --profile <name>

# 2. edit source under src/pages/<pageCode>/
#    page.config.ts (entry mode, route, navigation), domain/, shared/services/, shared/hooks/, components/, styles.css

# 3. preview + publish single page
openxiangda workspace publish --profile <name> --page <pageCode> --dry-run
openxiangda workspace publish --profile <name> --page <pageCode>
```

## DO / DO NOT

- ✅ Formal user-facing entries (admin console / PC portal / mobile portal) MUST be app-shell pages: `entry: { mode: "app-shell", hidePlatformNav: true, defaultRoute: "<home>" }` in `page.config.ts`.
- ✅ Default to **native Tailwind utilities** for new pages (`bg-white`, `border-slate-200`, `grid-cols-[240px_1fr]`, ...) and `cssIsolation: "none"`. Keep namespace/shadow only for explicit legacy compatibility.
- ✅ Split complex pages into `domain/`, `shared/services/`, `shared/hooks/`, `components/`, route/config files, `styles.css` (see `references/best-practices.md` and `references/architecture-patterns.md`).
- ✅ List/detail/CRUD pages: follow `DataManagementList` pattern from `references/architecture-patterns.md`. Pagination + structured `filterGroup` + `OR`. Never fetch huge `pageSize` and filter in browser.
- ✅ For external APIs use `src/resources/connectors/<code>.json` + `sdk.connector.invoke()`; for joined read-only lists use row data views + `sdk.dataView.query`; for stable dashboard metrics use aggregate data views + `sdk.dataView.stats`.
- ✅ Choose data view `storageMode` deliberately: `materialized` for refreshed reports/lists that tolerate delay, `live` for bounded real-time multi-form reads.
- ✅ For reusable backend orchestration use App Function (`src/functions/<functionCode>/index.ts` + `src/resources/functions/<functionCode>.json`) and call `sdk.function.invoke(code, { input })`; keep page components out of multi-table business orchestration.
- ✅ 家长、学生、教师、班主任身份或班级/监护关系页面使用 `sdk.organization.schoolContact.*`；先读 `references/school-contact-relations.md`。用 `SCHOOL_HEAD_TEACHER` 判断全局身份，用 `teachers.list({ classId, isHeadTeacher: true })` 判断具体班主任班级，并直接读取 `teacher.managedClasses` / `class.headTeachers`；默认使用已登录用户的租户内全部关系，仅在业务要求时声明 self/class 收紧范围，并保持服务端分页。
- ✅ Filters, search bars, modal forms, drawers, and inline edits use platform components for platform data fields, otherwise `antd` / `antd-mobile` controls.
- ❌ Single-file giant pages. Split per `references/best-practices.md`.
- ❌ Hardcoded `/view/...&isRenderNav=false` URLs scattered through page code; use the runtime navigation helper.
- ❌ shadcn token classes like `bg-card` / `text-muted-foreground` / `text-foreground` unless explicitly configured.
- ❌ Raw native form controls in AI-authored page code (`<input>`, `<select>`, `<textarea>`, file inputs, hand-written pickers/uploaders). Use platform components or `antd` / `antd-mobile`.
- ❌ Embed a single `FormProvider` field component temporarily; navigate to a full standard form page or render a complete `StandardFormPage` instead.
- ❌ Reuse one form UI for both PC and mobile without verifying overlay / picker / bottom-sheet behavior on both viewports.
- ❌ Hardcode notification or platform API URLs; use `openxiangda/runtime` and `src/resources/notifications/` declarations.

## CLI Flow

```bash
openxiangda env --profile <name>
openxiangda page list --profile <name>
cd /path/to/sy-lowcode-app-workspace
openxiangda workspace publish --profile <name>
```

For a page-only edit, prefer targeted publish:

```bash
openxiangda workspace publish --profile <name> --page <pageCode>
```

If multiple files changed and the target is not obvious, preview first:

```bash
openxiangda workspace publish --profile <name> --changed --dry-run
openxiangda workspace publish --profile <name> --changed
```

If the workspace does not exist yet, initialize it first:

```bash
openxiangda workspace init ./my-app-workspace --profile <name> --app-name "应用名称"
cd ./my-app-workspace
pnpm install
```

Use `--app-type APP_XXX` only when the user explicitly provides an existing app to reuse.

Direct publish is only for already built assets or targeted repair:

```bash
openxiangda page publish dashboard \
  --entry-url https://cdn.example.com/dashboard/index.js \
  --css-urls https://cdn.example.com/dashboard/style.css \
  --version 1.0.0 \
  --build-id 20260521120000 \
  --change <change> \
  --profile <name>

# The command above stages only. Review the immutable release:
openxiangda page releases --profile <name> --json

# In a normal app release, include its PageRelease entry in staged-resources.json
# and atomically activate it with the other staged children:
openxiangda release app-finalize --change <change> \
  --staged-resources-json staged-resources.json --profile <name>

# Page-only repair may still activate explicitly:
openxiangda page activate <releaseId> --change <change> --profile <name>

# Historical activation is explicit and audited:
openxiangda page rollback <releaseId> --rollback \
  --change <change> --reason "restore reviewed page release" --profile <name>
```

Direct Page publish always freezes `pages/snapshot` first and sends the active parent plus all page revisions and active-asset hashes; a new page uses expected revision `0`. A single-page patch clone-forwards unchanged pages from the active immutable Page Release, so the staged result remains a complete activatable app-level Page Release. It never refreshes or retries a stale parent. Keep it staged for normal multi-resource work and pass its `PageRelease` entry to root atomic `app-finalize`; use direct Page activation only for an intentional page-only repair.

## Development Rules

Read these references only when editing page code:

- `references/pages/workspace-structure.md`
- `references/pages/app-shell.md` — formal backend / PC portal / mobile portal entry pattern. Read before creating any user-facing main entry or admin console.
- `references/best-practices.md` — initialized examples for modular pages, status lifecycles, role governance, high-performance queries, portal shells, and interactive workbenches. Read before scaffolding complex pages or data management pages.
- `references/pages/page-sdk.md`
- `references/school-contact-relations.md` — 家校关系权限、分页查询、返回字段以及 Page SDK/App Function 示例。创建家长、学生或班级关系页面前读取。
- `references/notifications.md` — notification resources and `sdk.notification` usage. Read before adding reminders, alerts, or message templates to a page.
- `references/pages/publish-flow.md`
- `references/style-system.md` — style isolation defaults, Tailwind/CSS guidance, and legacy namespace compatibility. Read before writing substantial page CSS or Tailwind classes.
- `references/architecture-patterns.md` — CRUD data flow, `DataManagementList` pattern, and recommended `src/pages/<pageCode>/` layout. Read before scaffolding a new page or list view.
- `references/component-guide.md` — platform component first, `antd` / `antd-mobile` fallback, and native-control ban for AI-authored app code. Read before introducing a new component.
- `references/troubleshooting.md` — known failure modes (missing styles, `options` runtime errors, broken option rendering, etc.) and their fixes. Read when something does not behave as expected.

## Rules

- Keep `pageCode` stable and use it as the local logical key.
- Formal user-facing entries such as admin consoles, PC portals, and mobile portals must be app-shell code pages. Declare `entry: { mode: "app-shell", hidePlatformNav: true, defaultRoute: "<home-route>" }` in `page.config.ts`.
- Do not generate single-file large pages. Split complex code pages into `domain/`, `shared/services/`, `shared/hooks/`, shared/page-local `components/`, route/config files, and `styles.css` as described in `references/best-practices.md`.
- Keep view code thin. Page components call hooks/services; business rules, state transition rules, permission predicates, and query builders live outside TSX and are reusable by PC and mobile pages.
- All visible page copy must be end-user-facing business text. Do not put developer explanations, implementation notes, schema descriptions, or "this module is generated by..." text into sections, cards, alerts, empty states, tooltips, or helper copy.
- Store live `pageId`, `routeKey`, and `legacyFormUuid` under the current profile only.
- Use `openxiangda/runtime` for platform data access instead of hardcoding backend URLs in page code.
- 家校关系必须通过 `sdk.organization.schoolContact` / `ctx.organization.schoolContact` 读取；班主任班级使用 `teachers.list` 的 `isHeadTeacher`，不要用全局角色推断具体班级，也不要直连钉钉、查询系统表或用同班成员推断亲属关系。
- For reminders, alerts, and business messages, declare `src/resources/notifications/` first and call `sdk.notification`; do not hardcode notification API URLs.
- For backend business logic shared by pages, automations, or workflows, declare an App Function and call `sdk.function.invoke`; do not duplicate the same multi-form query/connector/notification orchestration in page code.
- Before hand-writing mature UI behavior, consult `references/component-guide.md` and use established libraries: platform components for platform data fields, antd/antd-mobile for controls and overlays, ECharts for charts, GSAP for complex animation timelines, and maintained packages such as dnd-kit for drag/drop. Do not rebuild mature controls with raw DOM/native inputs.
- Named imports from `@ant-design/icons` are supported by the `openxiangda` workspace build proxy, which enumerates icon module exports at runtime.
- Publish through `openxiangda workspace publish --profile <name>` unless there is a specific repair reason to call `page publish` directly.
- After editing one code page, publish with `--page <pageCode>` instead of triggering all forms/pages. Use `--changed --dry-run` before `--changed` when git touched several modules.
- Do not create custom code pages by writing platform schema directly. The source is React workspace code plus `page.config.ts`.
- Do not scatter hardcoded `/view/...&isRenderNav=false` URLs through page code. Use the runtime navigation API or the local route helper generated for the app shell.
- Platform menus should bind only the formal app-shell code page for user-facing entry points. Original forms, workflows, and native view pages may remain as development / maintenance resources or permission targets, but should not become the product navigation shell.
- For prod, explicitly run with `--profile prod`; never rely on the current profile for release operations.
- Follow the style system in `references/style-system.md`: default to native Tailwind utilities and arbitrary values for business pages (`bg-white`, `border`, `border-slate-200`, `text-slate-600`, `grid-cols-[240px_1fr]`, etc.). New pages default to `cssIsolation: "none"` and do not need `.sy-app-workspace`; keep namespace/shadow handling only for legacy pages that explicitly configure it. Do not treat platform token classes as the default authoring pattern, and do not use shadcn token classes such as `bg-card`, `text-muted-foreground`, or `text-foreground` unless the workspace explicitly configures them.
- For list / detail / CRUD pages, follow `references/architecture-patterns.md` (e.g. `DataManagementList`) before writing custom data-fetching loops.
- Query pages must use pagination with structured conditions. Do not fetch a large `pageSize` and filter in the browser; avoid default `searchKeyWord`, and build multi-field fuzzy search with explicit `filterGroup` + `OR`.
- Pick components per `references/component-guide.md`: prefer the platform component, fall back to Ant Design / antd-mobile wrappers, and only build a custom component when neither fits. In app/workspace page code, do not emit raw `<input>`, `<select>`, `<textarea>`, file inputs, hand-written pickers, or hand-written uploaders.
- When a page misbehaves (lost styles, `options is undefined`, option labels showing raw values, etc.), consult `references/troubleshooting.md` before patching symptoms.
- For custom portal pages and business modals, do not temporarily embed a single `FormProvider` field component from the standard form runtime. If a standard component is required, navigate to a full standard form page or render a complete `StandardFormPage` inside a dedicated carrier route.
- If a complete custom edit surface intentionally embeds platform fields in `FormProvider`, set `config.api` from `usePageFormRuntimeApi()` (or `createPageFormRuntimeApi(sdk)` outside hooks). Never hand-write a JSON-only `sdk.request` bridge; it breaks Blob preview and download contracts.
- Keep PC and mobile portal styles separate. Do not share one form UI implementation across both viewports unless the surrounding shell, modal layer, date picker, and bottom-sheet behavior have been tested in both contexts.
- After introducing Ant Design overlays, date/datetime fields, or mobile bottom-sheet selectors, verify that global button, modal, picker, and sheet styles do not leak into the host business page.
