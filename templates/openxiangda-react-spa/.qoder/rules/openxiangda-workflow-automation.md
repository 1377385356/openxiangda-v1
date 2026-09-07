---
description: src/{workflows,automations,js-code-nodes,functions}/** glob — 精准引导到 openxiangda-workflow-automation skill
glob: src/{workflows,automations,js-code-nodes,functions}/**/*
alwaysApply: false
---

# OpenXiangda React SPA Workflow / Automation / Function Files

Use the **`openxiangda-workflow-automation`** skill when editing:

- `src/workflows/<code>/workflow.ts`
- `src/automations/<code>/index.ts`
- `src/js-code-nodes/<code>/index.ts`
- `src/functions/<code>/index.ts`

## Boundaries

- 普通 `pending → processing → resolved → closed` 使用状态字段、领域状态机与 automation；只有真实审批语义才创建 workflow。
- 复用后端业务逻辑优先 App Function；JS_CODE 用于跨表、批量、流程、平台 API、外部 HTTP 与复杂编排。
- UI 交互、普通表单校验和展示逻辑留在 React 代码，不放进 JS_CODE。
- 每个关键步骤使用 `ctx.logger.debug/info/warn/error`；第三方凭据只通过 `secretRefs` 与 `ctx.secrets.get()` 获取。
- workflowId / automationId / functionId 不得跨 profile 复制。

## Build and release

```bash
pnpm typecheck:js-code
pnpm build-js-code --script <code>
openxiangda resource validate <workflow|automation|function> --only <code> --profile <name>
openxiangda resource plan <workflow|automation|function> --only <code> --profile <name>
openxiangda resource publish <workflow|automation|function> --only <code> --change <change> --profile <name>
```

资源发布只生成候选子版本；正式环境托管发布必须走 candidate → preproduction deploy/test → 同 candidate promotion。
