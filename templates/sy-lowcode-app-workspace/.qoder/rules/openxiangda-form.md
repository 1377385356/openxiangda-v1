---
description: src/forms/** glob — 精准引导到 openxiangda-form skill
glob: src/forms/**/*
alwaysApply: false
---

# OpenXiangda Form Files

You are editing files under `src/forms/<formCode>/`. Use the **`openxiangda-form`** skill.

## Required structure

```text
src/forms/<formCode>/
├── schema.ts   # defineFormSchema() default export — fields / options / rules / top-level FormEffect[]
└── page.tsx    # presentation only
```

## Common pitfalls (high signal)

- 表单录入组件优先级：OpenXiangda 平台字段组件 → `antd` / `antd-mobile` 包装 → 必要时自定义业务组件。
- `schema.ts` 定义字段与平台组件；`page.tsx` 只做展示布局，优先渲染 OpenXiangda 标准表单 / runtime，不要拼原生控件。
- `src/forms/**` 禁止直接写原生 `<input>` / `<select>` / `<textarea>` / `<input type="file">`、手写 picker/uploader、手写人员/部门选择器。
- 选项字段（Select / MultiSelect / Radio / Checkbox / Cascade）必须有 `options`，不要给空。
- 跨表数据 → `SelectField` + `optionSource.type: "linkedForm"`，**禁止** `AssociationFormField`。
- 顶层 `schema.rules` 仅用于 `FormEffect[]`（`when` / `then`），**不要**写成校验数组；校验放字段 `rules`。
- 平台系统字段（创建人 / 修改人 / 创建时间 / 修改时间 / 部门）由平台自动维护，**不要重复创建**。
- 隐式权限键 / 派生键 → `behavior: "HIDDEN"` + `valueSync`。
- 平台字段缺能力时，先 `openxiangda feedback submit --yes` 反馈能力缺口，再用 `antd` / `antd-mobile` 包装做临时 workaround，并告诉用户 fingerprint。

## Publish

```bash
openxiangda workspace publish --profile <name> --form <formCode> --dry-run
openxiangda workspace publish --profile <name> --form <formCode>
```

不要用 `openxiangda form create` / `form publish` 作为日常路径（仅底层修复）。
