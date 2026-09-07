# Form Component Registry

Use platform-supported component names in FormSchema. AI-authored app code must prefer these platform fields for form-entry UX; do not replace them with raw `<input>`, `<select>`, `<textarea>`, file inputs, hand-written pickers, or hand-written uploaders in `src/forms/**` or `src/pages/**`.

Priority:

1. Use the platform field component in `schema.ts`.
2. If the standard form layout is not enough, customize presentation in `page.tsx` while still rendering the OpenXiangda standard form/runtime.
3. If a real field component is missing, submit feedback with `openxiangda feedback submit --yes`, then use an `antd` / `antd-mobile` wrapper as a local workaround.
4. Native HTML controls are only acceptable inside OpenXiangda SDK/platform component internals.

Common field components:

| Component | Use |
| --- | --- |
| `TextField` | Short text |
| `TextAreaField` | Long text |
| `NumberField` | Numeric value |
| `DateField` | Date or datetime |
| `CascadeDateField` | Date range |
| `SelectField` | Single select |
| `MultiSelectField` | Multi select |
| `RadioField` | Radio group |
| `CheckboxField` | Checkbox group |
| `UserSelectField` | User picker |
| `DepartmentSelectField` | Department picker |
| `AttachmentField` | File upload |
| `ImageField` | Image upload |
| `AddressField` | Address |
| `CascadeSelectField` | Cascading select |
| `LocationField` | Location |
| `EditorField` | Rich text |
| `JSONField` | Structured JSON |
| `SubFormField` | Child table; do not recursively flatten child fields unless the runtime requires it |

Must-use platform components:

| Scenario | Component |
| --- | --- |
| User picker | `UserSelectField` |
| Department picker | `DepartmentSelectField` |
| File upload | `AttachmentField` |
| Image upload | `ImageField` |
| Rich text | `EditorField` |
| Signature | `DigitalSignatureField` |
| Location | `LocationField` |

Preferred platform components:

| Scenario | Component |
| --- | --- |
| Text / textarea / number | `TextField` / `TextAreaField` / `NumberField` |
| Date / date range | `DateField` / `CascadeDateField` |
| Select / multi-select / radio / checkbox | `SelectField` / `MultiSelectField` / `RadioField` / `CheckboxField` |
| Cascading select | `CascadeSelectField` |
| Child rows | `SubFormField` |
| Standard form rendering | `FormProvider` + `FormRenderer` |

Rules:

- Prefer simple field types first.
- Prefer platform fields over page-level custom JSX controls for all normal data entry.
- Do not emit raw native controls in AI-authored workspace code. Use an `antd` / `antd-mobile` wrapper only when no platform field can represent the UX, and submit feedback for the platform gap.
- Do not use a code page where a normal form can solve the workflow.
- Keep option values stable; labels may be user-facing.
- Avoid generated random field IDs after initial creation.
- Use field-level `rules` for validation. Required fields should set both `required: true` and `rules: [{ required: true, message: "..." }]` when a custom message is needed.
- For option components (`SelectField`, `MultiSelectField`, `RadioField`, `CheckboxField`, `CascadeSelectField`), always provide an `options` array. Use `options: [{ value: "stable_code", label: "显示名" }]`; if options will be loaded elsewhere later, still emit `options: []` so the runtime does not crash on `options.map(...)`.
- Do not rely on custom `relation` metadata alone for normal form pages. A `SelectField` with `relation` but no `options` can white-screen with `Cannot read properties of undefined (reading 'map')`. Use static `options`, or use `SelectField` with `optionSource.type: "linkedForm"` so the runtime queries source form records through the SDK.
- Do not model business enums or data-source references as free text IDs. Use `SelectField` / `RadioField` with `options` for enums. For records maintained by another form, use `SelectField` with `options: []` and `optionSource.linkedForm`; set `remoteSearch: true`, `searchFieldId`, and a modest `pageSize` when the source data can be large.
- If a selected option value must also be stored as a hidden scalar key for permission conditions, add `valueSync: [{ targetFieldId: "scopeKey", valuePath: "value" }]` to the visible `SelectField`.
- `AssociationFormField` is kept only for backward compatibility. Do not use it for new form pages.
- For `NumberField`, prefer explicit `min`, `max`, `precision`, and `unit` when the business meaning is constrained.
- For `DateField`, use `mode: "date"` or `mode: "datetime"` and a stable `format` such as `YYYY-MM-DD` or `YYYY-MM-DD HH:mm`.
- For `CascadeDateField`, store a date range and document whether the value is inclusive.
- For `UserSelectField` and `DepartmentSelectField`, do not invent user or department IDs. Use runtime/platform selection.
- For `AttachmentField` and `ImageField`, do not hardcode OSS URLs in defaults unless the file has already been uploaded by platform tooling.
- For custom OSS attachment or image upload, first declare a `src/resources/storage/<code>.json` resource, optionally enable `configJson.cors.managed` for browser direct-upload CORS, then set `uploadProvider: "oss"` and `storageCode: "<code>"` on `AttachmentField` or `ImageField`. Never put OSS AK/SK values in schema, page code, or committed resource files.
- For image thumbnails or lightweight previews, set `imageCompression: { enabled: true }` on `ImageField` or `AttachmentField`. The runtime keeps the original `url` and adds `thumbUrl`, `previewUrl`, and `variants` when compressed image variants are created.
- For `SubFormField`, use `columns` for child fields and keep child `fieldId` values stable within the subform.
- `JSONField` renders a validated structured-text editor in `NORMAL` / `DISABLED` mode and a formatted value in `READONLY` mode. Invalid JSON becomes a form validation error and cannot be silently saved as an older value. For one field, use its `renderer` / `editor` callbacks; for a whole standard form or a `DataManagementList` detail/submit drawer, pass `components={{ JSONField: CustomJsonField }}` so the registry is preserved through `StandardFormPage` and `FormProvider`.
- `TextAreaField` is accepted by workspace tools and normalized to runtime `TextareaField`; prefer `TextAreaField` in OpenXiangda docs for readability.

Common validation rule examples:

```ts
rules: [{ required: true, message: "请填写名称" }]
rules: [{ preset: "phone", message: "请输入有效手机号" }]
rules: [{ min: 0, message: "不能小于 0" }]
```
