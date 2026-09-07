---
description: src/{workflows,automations,js-code-nodes}/** glob — 精准引导到 openxiangda-workflow-automation skill
glob: src/{workflows,automations,js-code-nodes}/**/*
alwaysApply: false
---

# OpenXiangda Workflow / Automation / JS_CODE Files

You are editing files under one of:

- `src/workflows/<code>/workflow.ts`        # 代码优先工作流（推荐用于无需画布编辑的场景）
- `src/automations/<code>/index.ts`         # 代码优先自动化（automation_code_ts，推荐）
- `src/js-code-nodes/<code>/index.ts`       # JS_CODE V2 trusted_node 后端脚本

Use the **`openxiangda-workflow-automation`** skill.

## Boundary — workflow vs. status field

**大多数业务流转不是工作流。** `pending → processing → resolved → closed` 用表单 + `status` 字段 + 状态机 + automation/JS_CODE。
仅当存在**真正的审批语义**（审批人 / 审批任务 / 同意/驳回 / 意见 / 节点字段权限 / 流程记录 / 节点副作用）时创建 workflow。

## JS_CODE 适用与不适用

- ✅ 跨表查询、批量更新、终止流程、平台 API、外部 HTTP、复杂编排。
- ✅ `ctx.logger.debug/info/warn/error(message, data?)` 在每个关键步骤埋点。
- ❌ 简单 UI 交互、普通表单校验、纯展示逻辑 → 应在 React 代码页里。

## 构建与发布

```bash
# JS_CODE V2 本地构建
pnpm build-js-code --script <scriptCode>

# workflow / automation 校验 + 发布
openxiangda workflow  validate / create / publish --profile <name>
openxiangda automation validate / create / publish / enable --profile <name>

# 排查
openxiangda automation executions <code> --profile <name>
openxiangda automation logs <instanceId> --profile <name>
openxiangda automation diagnose <code> --profile <name>
```

不要把 `workflowId` / `automationId` 跨 profile 复制；每个 profile 独立维护。

详见 `references/automation-v3.md` / `workflow-v3.md` / `resource-manifest-cheatsheet.md`。
