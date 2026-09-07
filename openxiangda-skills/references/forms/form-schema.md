# FormSchema

Form source lives in `sy-lowcode-app-workspace`. `schema.ts` describes fields, persistence, and rules; `page.tsx` renders the actual form page using platform components. The generated platform page must come from the workspace bundle, not the legacy default platform schema page.

Typical file:

```text
src/forms/<formCode>/schema.ts
src/forms/<formCode>/page.tsx
```

The schema must default-export a `defineFormSchema(...)` result from `openxiangda`.

Minimal schema:

```ts
import { defineFormSchema } from "openxiangda";

export default defineFormSchema({
  formMeta: {
    formUuid: "",
    appType: process.env.OPENXIANGDA_APP_TYPE || "APP_XXXX",
    title: "客户信息",
  },
  fields: [
    {
      fieldId: "customer_name",
      componentName: "TextField",
      label: "客户名称",
      required: true,
      rules: [{ required: true, message: "请填写客户名称" }],
      placeholder: "请输入客户名称",
    },
    {
      fieldId: "customer_type",
      componentName: "SelectField",
      label: "客户类型",
      placeholder: "请选择客户类型",
      options: [
        { value: "enterprise", label: "企业客户" },
        { value: "individual", label: "个人客户" },
      ],
    },
  ],
});
```

## Required Metadata

- `formMeta.formUuid`: live form ID. It may start empty during local authoring; publish tools can create and write it back.
- `formMeta.appType`: target app. In OpenXiangda mode, `OPENXIANGDA_APP_TYPE` may override local config.
- `formMeta.title`: user-facing form name.
- Do not require `formMeta.formType`; the current `openxiangda` schema type only requires `formUuid`, `appType`, and `title`.

## Field Rules

- Each persisted field needs a stable `fieldId`.
- Field labels should be user-facing Chinese names when the app is Chinese.
- Each visible field should include a concise user-facing `placeholder`. Hidden/internal fields do not need placeholders.
- Use `tips` only for special constraints, unusual formats, compliance notes, or non-obvious business rules. Do not add tips to every field.
- Use `SelectField` / `RadioField` for enum values and always provide `options`.
- Use `SelectField` with `optionSource.type: "linkedForm"` for values maintained in another form or data source, such as class, college, customer, project, category, or asset. The runtime queries source form data through the SDK and builds `{ label, value }` options. For large source forms, set `remoteSearch: true`, an explicit `searchFieldId`, and a modest `pageSize` so typing in the dropdown triggers remote search. Do not use `AssociationFormField` for new form pages, and do not ask users to type raw IDs in `TextField`.
- Keep only user-needed fields visible. If a scalar key is needed for permissions, synchronization, computed state, or internal logic, derive it from a visible select/person/department field and keep it in the schema with `behavior: "HIDDEN"`. For `SelectField`, use `valueSync` when the selected option value should be copied into a hidden scalar field.
- Do not create duplicate platform system fields such as creator, updater, creator department, updater department, created time, or updated time unless the user explicitly needs a distinct business field. The platform already creates system metadata for every form.
- Labels, placeholders, tips, section titles, descriptions, and empty states must be end-user-facing. Do not write developer-facing implementation explanations into visible form copy.
- Use platform-supported field components from `component-registry.md`.
- Do not generate fields that are only visual layout containers.
- Put validation rules on fields as `field.rules`. Do not put validation objects in top-level `schema.rules`.
- For option components (`SelectField`, `MultiSelectField`, `RadioField`, `CheckboxField`, `CascadeSelectField`), always include `options`. If a linked lookup is not ready, use `options: []` instead of omitting it.

Linked form dropdown example:

```ts
{
  fieldId: "college",
  componentName: "SelectField",
  label: "所属学院",
  placeholder: "请选择所属学院",
  showSearch: true,
  allowClear: true,
  options: [],
  valueSync: [{ targetFieldId: "collegeScopeKey", valuePath: "value" }],
  optionSource: {
    type: "linkedForm",
    linkedForm: {
      formUuid: "FORM_COLLEGE_PROFILE",
      fieldId: "collegeName",
      labelFieldId: "collegeName",
      valueFieldId: "collegeCode",
      searchFieldId: "collegeName",
      sortField: "collegeName",
      pageSize: 20,
      remoteSearch: true,
      deduplicate: true,
    },
  },
}
```

## Effects vs Validation

Top-level `schema.rules` is reserved for `FormEffect[]`, not validation. A `FormEffect` must have both `when` and `then`:

```ts
rules: [
  {
    id: "show_invoice_title",
    when: { field: "need_invoice", operator: "eq", value: "yes" },
    then: [{ action: "show", target: "invoice_title" }],
  },
]
```

Do not generate old-style top-level validation rules like this:

```ts
// Wrong: this causes runtime white screens because `when` is missing.
rules: [
  { id: "rule_required_name", type: "validation", field: "name", required: true },
]
```

Use field-level validation instead:

```ts
{
  fieldId: "name",
  componentName: "TextField",
  label: "姓名",
  required: true,
  rules: [{ required: true, message: "请填写姓名" }],
}
```

## Layout

`layout` is optional. If omitted, the standard runtime renders fields in declaration order. When using `layout`, only use `FormLayoutNode` structures supported by `openxiangda` (`field`, `section`, `grid`, `tabs`, `steps`).

## Publish Rules

- Build output is registered through `openxiangda workspace publish --profile <name>`.
- The publish path uses `/openxiangda-api/v1` with `OPENXIANGDA_ACCESS_TOKEN`.
- Do not use AK/SK for new OpenXiangda work.
- Do not stop after `openxiangda form create`; that only creates the platform form shell. A form page is complete only after workspace publish builds and registers the bundle.
- If a published form page is blank and the browser console says `Cannot use 'in' operator to search for 'all' in undefined`, check for invalid top-level `schema.rules` entries missing `when`.
- If a published form page is blank and the browser console says `Cannot read properties of undefined (reading 'map')` near `SelectField`, check for option components missing `options`.
