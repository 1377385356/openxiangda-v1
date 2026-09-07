---
name: openxiangda-form
description: "Create, edit, and publish OpenXiangda normal forms and workflow forms in sy-lowcode-app-workspace: schema, fields, options, validation, layout, linkedForm select sources, hidden permission scope keys, FormEffect, workflow form bundles, and single-form publish. Use platform form components first. Trigger on 创建表单, 表单字段, 表单录入, schema, SelectField, linkedForm, workflow form, formCode, or src/forms changes."
---

# OpenXiangda Form

## When to use this skill

- User wants to **create / edit a form (`src/forms/<code>/`)**, change fields, options, layout, validation, or top-level FormEffect.
- User wants a **workflow form page** (used together with `openxiangda-workflow-automation`).
- User wants to **publish only a form** (`workspace publish --form <code>`) or pull / inspect an existing form schema.
- User asks how form values are persisted (option `{label, value}`, attachment shape, member fields, etc.).

## Quick recipe

```bash
# 1. preflight
openxiangda env --profile <name>
openxiangda form list --profile <name>

# 2. edit source
#   src/forms/<formCode>/schema.ts   — fields, options, rules, top-level FormEffect[]
#   src/forms/<formCode>/page.tsx    — presentation only

# 3. normal release: stage the exact Form bundle, then Root App finalize
openxiangda resource plan form-setting --only <formCode> --profile <name>
openxiangda resource publish form-setting --only <formCode> --change <change> --profile <name>
openxiangda release app-finalize --staged-resources-json .openxiangda/releases/<change>/staged-resources.json --change <change> --profile <name>
```

## DO / DO NOT

- ✅ `defineFormSchema` from `openxiangda` and default-export it.
- ✅ Every visible field has a concise user-facing `placeholder`. Use `tips` only for special constraints.
- ✅ Use `SelectField` / `RadioField` for enums; for cross-form sources use `SelectField` with `optionSource.type: "linkedForm"` (and `remoteSearch: true` + `searchFieldId` when source is large).
- ✅ Permission scope keys / sync keys / derived fields stay in schema with `behavior: "HIDDEN"`, derived from visible select/person/department fields via `valueSync`.
- ✅ Always provide `options` for option components (Select / MultiSelect / Radio / Checkbox / CascadeSelect).
- ✅ `schema.ts` is the source of data fields and platform field components; `page.tsx` is presentation only and should render through the OpenXiangda standard form/runtime.
- ✅ Use built-in `JSONField` for editable structured JSON. Customize one field with `renderer` / `editor`, or pass a `components` registry through `StandardFormPage` / `DataManagementList` when the whole surface needs a domain-specific JSON component.
- ✅ If a custom layout or widget is truly needed, wrap OpenXiangda platform components first. If no platform component exists, wrap `antd` / `antd-mobile` and preserve their props, refs, keyboard behavior, and overlay handling.
- ❌ `AssociationFormField` for new form work (use `linkedForm` SelectField).
- ❌ Top-level `schema.rules` as validation array. Top-level `rules` is `FormEffect[]` only (`when` / `then`).
- ❌ Extra fields for system metadata (creator / updater / created/updated time / depts) — platform creates them automatically.
- ❌ Developer notes / implementation comments inside labels / placeholders / tips / section titles / empty states.
- ❌ `openxiangda form create` as page generation; it is a low-level repair command.
- ❌ Copy `formUuid` from dev to prod — each profile has its own `formUuid` under `.openxiangda/state.json`.
- ❌ Raw native form controls in app/workspace source: `<input>`, `<select>`, `<textarea>`, `<input type="file">`, hand-written pickers, hand-written uploaders, and custom employee/department selectors. These belong only inside OpenXiangda SDK/platform component internals.

## Required Workspace Flow

```bash
openxiangda env --profile <name>
openxiangda form list --profile <name>
cd /path/to/sy-lowcode-app-workspace
```

If the workspace does not exist yet, create it before writing form source:

```bash
openxiangda workspace init ./my-app-workspace --profile <name> --app-name "应用名称"
cd ./my-app-workspace
pnpm install
```

Use `--app-type APP_XXX` only when the user explicitly provides an existing app to reuse.

Create or edit workspace source:

```text
src/forms/<formCode>/
├── schema.ts
└── page.tsx
```

Then stage the exact Form bundle:

```bash
openxiangda resource publish form-setting --only <formCodes> --change <change> --profile <name>
```

For a single form edit, still keep the child staged until Root App finalize:

```bash
openxiangda resource publish form-setting --only <formCode> --change <change> --profile <name>
```

The Form resource bundle carries schema, settings, indexes, data-management, runtime-write, public-access configuration, and changed form permission groups under one CAS parent. It returns a canonical staged FormRelease and the CLI records it in the change-scoped staged-resources file. `workspace publish --form` is limited to an intentional first-time bootstrap or isolated repair outside a governed multi-resource release; it is not the normal release path.

An exact staged FormRelease remains usable across a fresh release baseline/lease for the same app/profile/change/deployment only after the CLI re-verifies its immutable, inactive, non-aborted server state, identity/hash, frozen schema/formType, finalized resources, parent/base revision, and current Form head. Workflow planning reads that frozen contract even when the live Form head is intentionally not activated and local `schemaSyncedAt` is absent. Never synthesize `schemaSyncedAt`, direct-publish the schema, or activate the Form early as a workaround; all conflicts fail closed.

For Phase 6 React SPA workspaces, `app-workspace.config.ts` should declare
`runtimeMode: "react-spa"`. In that mode, `workspace publish --form <code>` is
schema-only by default: it creates/binds the form and syncs schema, but skips
the legacy form page bundle, OSS upload, and bundle register. The app-level
React runtime renders submit/detail/list pages. Pass `--legacy-form-bundle`
only when intentionally maintaining compatibility with an old embedded form
page bundle.

## Low-level Commands

Use these only for diagnosis, binding existing resources, or repairing a broken publish state:

```bash
openxiangda form bind customer --form-uuid FORM_XXX --profile <name>
openxiangda form pull customer --profile <name> --json
openxiangda form create customer --name "客户信息" --profile <name>
openxiangda form publish customer --bundle-url <url> --profile <name>
```

Do not use `openxiangda form create` as the normal way to generate a user-facing page. It creates the old platform form shell and will show the legacy default schema until a workspace bundle is published.

## Form Release / CAS Safety

- Treat all Form configuration as one immutable release stream. Freeze `revision`, `etag`, and `activeFormReleaseHead` from one snapshot before writing.
- Publish declared schema, packages, settings, indexes, data-management, runtime-write, public-access configuration, and `formPermissionGroups` through one Form `bundle` mutation. `resource publish form-setting,form-permission-group --only <codes> --change <change>` groups changes by `formUuid`, stages one immutable FormRelease per form, and never falls back to direct live permission-group writes. Resource Form bundles return immutable `contentHash` plus a canonical `stagedResource` (stable identity is `formUuid`); the CLI merges each entry into `.openxiangda/releases/<change>/staged-resources.json`. Root `app-finalize` atomically switches all child heads plus the App head. Use direct `--activate` only for an intentional form-only repair outside a governed multi-resource release; never use `workspace publish --form` inside an atomic React SPA release.
- Every mutation must carry `If-Match`, `expectedRevision`, `expectedParent`, and a stable artifact ID. Creation starts at revision `0`.
- A revision/head conflict is not retryable. Stop with zero later writes, re-plan, and explicitly merge the competing change; never silently adopt the newer live head.
- Use `openxiangda form release-head|release-list|release-detail|release-diff` for inspection and `release-activate|release-rollback|release-abort` for controlled recovery. See `docs/openxiangda-form-releases.md` in the OpenXiangda tool repository.

## Data Export

Use `openxiangda form export` for read-only data delivery. It reuses the active profile token and the workspace app binding, so do not hand-write export URLs or ask for AK/SK.

```bash
openxiangda form export customer --mode xlsx --profile dev
openxiangda form export customer --mode xlsx-images --profile dev --all
openxiangda form export customer --mode package --profile dev --output ./exports/
```

Modes:

- `xlsx`: normal Excel export. Images and attachments stay as links/text.
- `xlsx-images`: Excel export with `ImageField` images embedded when the server can read a supported `png` / `jpg` / `gif`; failures degrade to links.
- `package`: zip export containing `data.xlsx`, `attachments/`, and `manifest.json`; attachment/image cells use package-relative paths and the `Attachments` sheet lists one file per row.

Useful filters:

```bash
openxiangda form export customer --mode package --profile dev --all --fields formInstId,instance_title,field_xxx
openxiangda form export customer --mode xlsx --profile dev --filters-json ./filters.json --order-json ./order.json
openxiangda form export customer --mode xlsx --profile dev --page 1 --page-size 100 --condition-type and --search-keyword 张三 --instance-status completed
```

## Workspace Form Rules

Read these references only when writing or reviewing schema:

- `references/forms/form-schema.md`
- `references/forms/component-registry.md`
- `references/forms/layout-and-rules.md`
- `references/platform-data-model.md` — how each field type is persisted (JSONB, `{label, value}` for option fields, attachment shape). Consult before designing schema or wiring values.
- `references/component-guide.md` — platform component first, `antd` / `antd-mobile` fallback, and native-control ban for AI-authored app code.
- `references/best-practices.md` — status lifecycle fields, ownership redundancy, role-governance fields, and the boundary between normal forms and workflow forms.

## Rules

- Prefer deterministic `formCode` as local key; bind live `formUuid` under the active profile.
- Every visible field should have a concise, user-facing `placeholder` that tells the user what to enter or select.
- Use `tips` sparingly. Add tips only for special constraints, unusual formats, or non-obvious business rules; ordinary fields should not have tips.
- Use `SelectField` or `RadioField` for enumerable business values. Do not model enums as `TextField` values that users must type manually.
- When a value is maintained by another form or data source, such as class, college, customer, project, category, or asset, use `SelectField` with `optionSource.type: "linkedForm"`. The runtime queries the source form through the SDK, converts records to `{ label, value }` options, and can use `remoteSearch: true` plus `searchFieldId` for large datasets. Do not use `AssociationFormField` for new form work, and do not make users maintain raw ID text fields for those values.
- Display only fields the user needs to interact with. Permission scope keys, computed fields, sync fields, and developer/internal fields should normally be derived from visible select/person/department fields and stay in the schema with `behavior: "HIDDEN"` instead of appearing on the form page. For select-derived scalar keys, use `valueSync`.
- Do not create separate fields for platform system metadata such as creator, updater, creator department, updater department, created time, or updated time unless the user explicitly asks for a separate business concept. The platform creates those system fields for every form.
- All labels, placeholders, tips, section titles, empty states, and helper text must be end-user-facing business copy. Do not write developer explanations or implementation notes into visible page copy.
- For business lifecycles, model status with normal form fields (`status`, owner/responsibility fields, action-log relation fields) unless the scenario has real approval tasks. Do not create workflow forms for ordinary status transitions.
- For permission isolation, collect user-facing ownership with select, personnel, or department fields. If form permission groups require scalar matching, add hidden derived keys such as `collegeScopeKey`, `classScopeKey`, `ownerDeptScopeKey`, and `ownerUserScopeKey`; never expose those keys as editable text inputs.
- For multi-platform publishing, create or bind the form separately for each profile.
- Do not copy `formUuid` from dev to prod unless the target platform explicitly already uses that ID.
- Keep `schema.ts` and `page.tsx` as the source for fields/layout/rules and presentation; generated build output is not the source of truth.
- In `schema.ts`, import `defineFormSchema` from `openxiangda` and default-export the schema.
- Treat `schema.ts` as the field/component contract. Prefer platform field components listed in `references/forms/component-registry.md`; do not replace them with raw JSX controls in `page.tsx`.
- Keep `page.tsx` presentation-only. It may customize layout, wrappers, sections, or routing, but should render a complete OpenXiangda standard form/runtime rather than assembling isolated raw controls.
- If a platform field is missing for a real business need, submit feedback with `openxiangda feedback submit --yes` and then use an `antd` / `antd-mobile` wrapper as a local workaround. Report the workaround and fingerprint to the user.
- Put validation on field-level `rules`; never generate old top-level validation arrays under `schema.rules`. Top-level `rules` is only for `FormEffect[]` with `when` and `then`.
- Always provide `options` for option components. `SelectField`, `MultiSelectField`, `RadioField`, `CheckboxField`, and `CascadeSelectField` must not be emitted with `options` undefined. See `references/component-guide.md` for the full list and `references/platform-data-model.md` for the `{label, value}` storage contract.
- Do not emit raw native form controls in app/workspace source. For basic entry use `TextField`, `TextAreaField`, `NumberField`, `DateField`, `SelectField`, `RadioField`, etc.; for platform-specific entry use `UserSelectField`, `DepartmentSelectField`, `AttachmentField`, `ImageField`, `EditorField`, `DigitalSignatureField`, and `LocationField`.
- For image thumbnails or lightweight detail previews, configure `imageCompression` on `ImageField` or `AttachmentField`. The submitted value still keeps the original `url`; compressed variants are written to `thumbUrl`, `previewUrl`, and `variants`.
- React SPA custom edit surfaces that render `FormProvider` must set `config.api` from `usePageFormRuntimeApi()` or `createPageFormRuntimeApi(sdk)`. Do not map all field requests to `sdk.request`, because attachment and image preview require the PageSdk Blob download channel.
- For OSS-backed image or attachment fields, declare a storage resource first, then set `uploadProvider: "oss"` and `storageCode`. Do not hardcode OSS URLs or credentials in schema/page source; if compressed output uses `webp`, storage `allowedExtensions` must include `webp`.
- Workflow form pages use the same workspace form structure plus workflow v3 configuration. In legacy workspaces, publish the form page bundle through workspace publish before treating it as complete. In React SPA workspaces, `workspace publish --form` syncs schema only, and the SPA default process pages render through `runtime deploy`.
- After editing one form, use `workspace publish --form <formCode>` or preview `--changed --dry-run`; do not run full workspace publish by default.
- Use `openxiangda form pull` or app snapshot before overwriting an existing form.
- Before assuming a value shape (e.g. dates, attachments, member fields, option fields), verify against `references/platform-data-model.md` instead of guessing.
