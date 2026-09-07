# Phase 6 Selected Direction: mac-admin

## Summary

`mac-admin` 是 Phase 6 React SPA starter 的第一套默认视觉基准。它基于前期 `Mac Studio Admin` 方向继续细化：整体保持现代、干净、偏 macOS productivity 的后台体验，但加入更明确的蓝、绿、橙状态点缀，避免过于单调。

该方向用于指导：

- `AdminShell`
- `UserShell`
- `PublicShell`
- 默认表单页
- 默认流程页
- 数据管理列表
- 详情抽屉
- 401 / 403 / 404 / unpublished / verification login 状态页

## Reference Screens

| Screen | File | Purpose |
| --- | --- | --- |
| Runtime Workspace | `mac-admin-01-runtime-workspace.png` | 后台首页、运行时状态、折叠菜单、SDK 状态 |
| Data List Drawer | `mac-admin-02-data-list-drawer.png` | 数据管理、筛选、表格、详情抽屉 |
| Form Workflow | `mac-admin-03-form-workflow.png` | 表单提交、流程预览、字段权限提示 |
| User Portal | `mac-admin-04-user-portal.png` | 用户门户、常用入口、待办、移动端预览 |
| Public States | `mac-admin-05-public-states.png` | 公开页、错误页、未发布、验证登录状态 |

## Visual Principles

- 以标准 React SPA 应用为心智，不呈现旧低代码平台的前端配置感。
- 页面结构应像生产级后台应用，而不是单独页面 demo。
- 默认使用浅色中性背景和白色内容面，靠边框、留白、分组建立层级。
- 允许少量蓝、绿、橙作为状态和操作点缀，但不能变成多彩仪表盘。
- 卡片、面板、按钮半径默认不超过 8px。
- 少用阴影；只有抽屉、浮层、少数悬浮面板可以有轻阴影。
- 字号以 14px 到 16px 为主体，列表和辅助信息可降到 13px。
- 文本不得溢出菜单、按钮、标签、表格单元格和状态卡片。

## Style System

新模板优先使用 Tailwind CSS。

- 不默认提供平台全局 theme tokens。
- 不要求业务页硬绑定平台 CSS 变量。
- 可以提供轻量 Tailwind preset，但必须可替换。
- SDK 组件提供基础 className / slot 覆盖点。
- 应用级主题差异通过 `tailwind.config`、局部 CSS class 或应用自有 CSS 变量处理。

建议色彩基线：

| Role | Usage |
| --- | --- |
| Neutral background | 页面底色，接近 `#f6f7f9` |
| Surface | 主内容面，白色或近白 |
| Border | 面板、表格、菜单分隔线 |
| Blue | 主操作、当前菜单、链接、运行状态 |
| Green | 成功、已连接、通过、健康 |
| Amber | 待处理、警告、草稿、过期提醒 |
| Red | 错误、拒绝、失败，只少量使用 |
| Graphite | 主文本、侧边栏文字、图标 |

## Sidebar

左侧菜单是 `mac-admin` 的核心框架特征。

要求：

- 支持分组折叠。
- 分组标题带 chevron。
- 支持一级菜单和二级子菜单。
- 当前菜单用轻色背景 + 左侧蓝色 active rail。
- 图标使用标准线性图标库。
- 菜单文案过长时省略，不撑开布局。
- 支持桌面展开态和窄屏收起态。

默认分组：

```txt
应用工作台
  工作台
  用户门户
  公开页面

表单与流程
  发起申请
  表单详情
  流程详情
  待我审批

数据与报表
  数据列表
  数据视图
  文件预览

权限与系统
  角色权限
  AI 验证
  发布版本
  系统设置
```

## Page Baselines

### Runtime Workspace

后台首页应展示运行时状态，而不是营销式欢迎页。

必须包含：

- 当前 `runtimeMode`
- SDK 连接状态
- Cookie / proxy 状态
- 后端权限兜底状态
- active release 状态
- 关键 KPI
- 最近活动
- AI 验证状态

### Data List Drawer

数据列表页是后台效率核心。

必须包含：

- 结构化筛选区
- 表格工具栏
- 状态统计
- 表格行操作
- 右侧详情抽屉
- 后端权限提示
- 空态、加载、错误状态

### Form Workflow

表单和流程提交页要突出默认模板可用性。

必须包含：

- 表单分组
- 子表或明细区
- 附件区
- 流程预览
- 字段权限提示
- 草稿 / 提交 / 取消操作
- 后端校验说明

### User Portal

用户门户比后台更轻，但保持同一视觉语言。

必须包含：

- 常用入口
- 我的提交
- 待我审批
- 数据查询
- 文件预览
- 公开访问入口
- 移动端适配预览或移动端设计基准

### Public States

公开页和状态页要统一，不复用旧 `isRenderNav` 这类平台前端参数。

必须包含：

- 公开表单 landing
- 401 未登录
- 403 无权限
- 404 不存在
- unpublished 未发布
- verification login ticket consumed / expired / failed
- route diagnostic

## Implementation Acceptance

实现 `mac-admin` starter 时，需要用 Playwright 截图和参考图对照。

验收重点：

- 折叠菜单结构与参考图一致。
- 主要页面不出现旧 view workbench 视觉痕迹。
- 色彩点缀存在但不过载。
- 表格、筛选、抽屉、表单、状态页都可独立复用。
- 文本在 1440px、1280px、移动端断点下不溢出。
- 所有默认页可以被应用 route 正常挂载。
- 后端 401 / 403 / 404 / business error 有明确 UI 状态。
