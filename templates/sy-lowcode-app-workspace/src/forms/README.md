# Forms

Create form source under `src/forms/<formCode>/schema.ts`.

Form-entry component priority is OpenXiangda platform fields first, `antd` / `antd-mobile` wrappers second, and custom business components only when neither fits. AI-authored workspace code must not replace platform fields with raw `<input>`, `<select>`, `<textarea>`, file inputs, hand-written pickers, or hand-written uploaders.

Use `defineFormSchema` from `openxiangda` and default-export the schema:

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
    },
  ],
});
```

Important: top-level `schema.rules` is for dynamic effects with `when` and `then`, not validation. Put validation on field-level `rules`.

Option components must always include an `options` array. For `SelectField`, `MultiSelectField`, `RadioField`, `CheckboxField`, and `CascadeSelectField`, use `options: []` when values will be wired later; omitting `options` can crash the runtime with `Cannot read properties of undefined (reading 'map')`.

For generated apps with many forms, prefer the safe helper in `src/shared/form-schema.ts`:

```ts
import { createFormSchema } from "../../shared/form-schema";

export default createFormSchema({
  formMeta: {
    formUuid: "",
    appType: process.env.OPENXIANGDA_APP_TYPE || "APP_XXXX",
    title: "客户信息",
  },
  fields: [{ fieldId: "customer_name", componentName: "TextField", label: "客户名称", required: true }],
});
```

The helper adds field-level required validation and never emits top-level validation rules.
It also normalizes option components without `options` to `options: []` as a runtime guard.

If a real business need exposes a missing platform field capability, report it with `openxiangda feedback submit --yes` and then use an `antd` / `antd-mobile` wrapper as a temporary workaround.
