---
description: src/pages/** glob — 精准引导到 openxiangda-page skill
glob: src/pages/**/*
alwaysApply: false
---

# OpenXiangda Page Files

You are editing files under `src/pages/<pageCode>/`. Use the **`openxiangda-page`** skill.

## Required structure（复杂页面拆分）

```text
src/pages/<pageCode>/
├── page.config.ts                    # entry / route / navigation
├── page.tsx                          # 薄视图层
├── domain/                           # 业务规则、状态机、查询构造器（可被 PC/移动复用）
├── shared/{services,hooks}/          # 数据访问层、复用 hook
├── components/                       # 页面内组件
└── styles.css                        # 页面级样式
```

## Strong defaults

- 正式入口（管理后台 / PC 门户 / 移动门户）必须 `entry: { mode: "app-shell", hidePlatformNav: true, defaultRoute: "<home>" }`。
- 默认 `cssIsolation: "none"` + 原生 Tailwind utilities（`bg-white`, `border-slate-200`, `grid-cols-[240px_1fr]`），不要 `bg-card` / `text-muted-foreground` 这些未配置的 shadcn token。
- 列表页：用 `DataManagementList` 模式 + 分页 + 结构化 `filterGroup`，**不要** `pageSize=10000` 然后前端过滤。
- 筛选、搜索、弹窗、抽屉、行内编辑：平台数据字段优先 OpenXiangda 平台组件；普通 UI 控件用 `antd` / `antd-mobile`。
- AI-authored `src/pages/**` 禁止直接写原生 `<input>` / `<select>` / `<textarea>` / file input、手写 picker/uploader、手写人员/部门选择器。
- 外部接口：`src/resources/connectors/` + `sdk.connector.call()`；多表只读联表：`src/resources/data-views/` + `sdk.dataView.query()`；通知：`src/resources/notifications/` + `sdk.notification`。

## Publish

```bash
openxiangda workspace publish --profile <name> --page <pageCode> --dry-run
openxiangda workspace publish --profile <name> --page <pageCode>
```

不要用 `openxiangda page publish` 作为日常路径（仅底层修复）。
