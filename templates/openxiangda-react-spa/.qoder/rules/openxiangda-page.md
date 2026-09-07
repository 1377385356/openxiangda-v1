---
description: src/pages/** glob — 精准引导到 openxiangda-page skill
glob: src/pages/**/*
alwaysApply: false
---

# OpenXiangda React SPA Page Files

You are editing files under `src/pages/`. Use the **`openxiangda-page`** skill.

## Strong defaults

- 路由集中维护在 `src/app/router.tsx`，应用导航维护在 `src/app/navigation.ts`。
- 复杂页面拆分为薄视图、`domain/`、`shared/{services,hooks}/`、`components/` 和样式文件。
- 默认使用原生 Tailwind utilities，不使用未配置的 shadcn token。
- 列表必须服务端分页并使用结构化 `filterGroup`；禁止抓取超大页后在浏览器过滤。
- 平台数据字段优先使用 OpenXiangda 平台组件；普通 UI 使用 `antd` / `antd-mobile`。
- 禁止原生表单控件、手写 picker/uploader/人员部门选择器。
- 后端权限、公开访问 grants 与 App Function 检查才是授权依据；前端只做展示保护。

## Release

```bash
pnpm typecheck
pnpm build
openxiangda runtime deploy --no-activate --change <change> --profile <name>
```

Runtime 只暂存到候选发布；正式环境托管发布必须走 candidate → preproduction deploy/test → 同 candidate promotion。
