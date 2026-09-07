---
description: src/forms/** glob — 精准引导到 openxiangda-form skill
glob: src/forms/**/*
alwaysApply: false
---

# OpenXiangda React SPA Form Files

You are editing files under `src/forms/<formCode>/`. Use the **`openxiangda-form`** skill.

## Required structure

```text
src/forms/<formCode>/
├── schema.ts   # defineFormSchema() default export
└── page.tsx    # presentation only
```

## Common pitfalls

- 平台字段组件优先于 `antd` / `antd-mobile` 包装和自定义业务组件。
- `schema.ts` 定义字段、选项、规则与行为；`page.tsx` 只负责展示。
- 禁止直接写原生 `<input>` / `<select>` / `<textarea>` / file input，禁止手写人员、部门、上传和 picker 组件。
- 选项字段必须提供非空 `options`；跨表数据使用 `SelectField` + `optionSource.type: "linkedForm"`。
- 顶层 `schema.rules` 只用于 `FormEffect[]`；字段校验放字段自己的 `rules`。
- 平台系统字段由平台维护，不要重复创建。
- 派生键和隐式权限键使用 `behavior: "HIDDEN"` + `valueSync`。

## Release

```bash
openxiangda resource validate form-setting --only <formCode> --profile <name>
openxiangda resource plan form-setting --only <formCode> --profile <name>
openxiangda resource publish form-setting --only <formCode> --change <change> --profile <name>
```

正式环境托管发布仍必须走 candidate → preproduction deploy/test → 同 candidate promotion，禁止直接激活生产资源。
