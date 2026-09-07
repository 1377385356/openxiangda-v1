# Phase 2: 样式系统重构 — 从 Shadow DOM 迁移到 CSS Namespace

## 1. 任务目标

将 sy-lowcode-app-workspace 页面运行时的样式隔离方案从 **Shadow DOM** 切换为 **CSS Namespace（命名空间前缀）**，并落地完整的「Design Tokens → Tailwind Preset → antd/antd-mobile 主题」三层样式变量体系，彻底解决 antd / antd-mobile 弹层（Popup / Dropdown / Modal / Select 等）样式丢失的问题。

## 2. 背景与问题

当前 sy-lowcode-app-workspace 模板项目在 `app-workspace.config.ts` 中配置了：

```ts
defaults: {
  cssIsolation: "namespace",
}
```

页面运行时由 `sy-page-sdk` 将用户页面挂载到 Shadow DOM 内部。这种隔离方式带来如下问题：

1. **弹层样式丢失**：antd 的 `Select` / `DatePicker` / `Dropdown` / `Modal`、antd-mobile 的 `Popup` / `Picker` / `ActionSheet` 等组件默认会通过 `ReactDOM.createPortal` 将真实 DOM 渲染到 `document.body`。这些节点天然落在 Shadow DOM 之外，无法被 Shadow Root 内注入的 CSS 命中，最终表现为「弹层完全没有样式」或「位置计算错乱」。
2. **getContainer 不通用**：antd 可以通过 `getPopupContainer` 重定向，但 antd-mobile 的部分 Popup 派生组件（如 `Toast`、部分内部 Popup）并不暴露 `getContainer`，无法强制塞回 Shadow Root。
3. **调试体验差**：DevTools 中查看 Shadow DOM 内样式不直观，主题变量难以在浏览器中 hot-tweak。
4. **构建工具复杂度高**：当前构建工具为支持 Shadow DOM，需要把 CSS 以 `<style>` 字符串注入到 ShadowRoot，引入了额外的 CSS 处理逻辑和运行时开销。

**目标方案（CSS Namespace）**：
- 把用户页面挂载到普通 DOM 节点 `<div class="sy-app-workspace" id="sy-page-${pageCode}">`。
- 所有用户 CSS（含 Tailwind 产物）在构建期自动加上 `.sy-app-workspace` 作用域前缀。
- antd / antd-mobile 通过 `ConfigProvider` 自定义 `prefixCls` 与 CSS 变量（`cssVar: { prefix: 'sy-ant' }`），并通过 `getPopupContainer` 把弹层固定回挂载根。
- 引入 `styles/tokens.css` 作为单一数据源，Tailwind preset 与 antd 主题均消费同一组 CSS 变量。

## 3. 相关项目和文件路径

### 3.1 组件库 `sy-form-components`
路径：`/home/developer/lowcode/sy-form-components`

| 文件 | 作用 |
| --- | --- |
| `src/tailwind.preset.ts` | 当前 Tailwind 预设（约 2600 行），样式映射主要在此 |
| `src/index.ts` | 组件统一导出入口 |
| `package.json` | 版本、peerDependencies、构建脚本 |

### 3.2 页面运行时 `sy-page-sdk`
路径：`/home/developer/lowcode/sy-page-sdk`（若不在此处，使用 `search_file` 在 `/home/developer/lowcode` 下定位 `package.json` 中 `"name": "sy-page-sdk"` 的包）

关键文件（按名称定位）：
- `src/createReactPage.ts` 或 `src/react/createReactPage.ts` — 页面挂载入口，当前包含 Shadow DOM 创建逻辑
- `src/runtime/*` — 运行时资源加载、生命周期
- `src/style/*` — CSS 注入相关

### 3.3 构建工具 `sy-lowcode-workspace-tools`
路径：`/home/developer/lowcode/sy-lowcode-workspace-tools`（同上，必要时通过 `search_file` 定位）

关注：
- `bin/lowcode-workspace.mjs` — CLI 入口
- `src/build/*` — 构建管线，可能存在 Shadow DOM 相关的 CSS 处理（如 `cssAsString` / `injectShadowStyles`）
- `src/config/*` — 消费 `app-workspace.config.ts` 中 `cssIsolation` 的逻辑

### 3.4 openxiangda 模板项目
路径：`/home/developer/code/openxiangda/templates/sy-lowcode-app-workspace/`

| 文件 | 作用 |
| --- | --- |
| `app-workspace.config.ts` | 配置 `cssIsolation` |
| `vite.config.ts` | 构建配置 |
| `tailwind.config.cjs` | Tailwind 配置（使用 sy-form-components 预设） |
| `postcss.config.cjs` | PostCSS 配置 |
| `src/main.tsx` | 应用入口 |
| `src/index.css` | 全局 CSS 入口 |

### 3.5 实际项目参考
路径：`/home/developer/code/zjnu-dxyq-lowcode`
- `tailwind.config.cjs` — 实际生产 tailwind 配置
- `app-workspace.config.ts` — 当前默认 `cssIsolation: "namespace"`
- `patches/sy-lowcode-workspace-tools@0.1.17.patch` — 已知 bug 修复

### 3.6 设计蓝图（必读）
路径：`/home/developer/code/openxiangda/openxiangda-skills/references/style-system.md`

此文档是本任务的样式体系设计蓝图，**实施前必须完整阅读**。

## 4. 详细实施方案

### Step 1 — 摸清当前 Shadow DOM 实现

1. 在 sy-page-sdk 中搜索关键字：`attachShadow` / `ShadowRoot` / `shadow` / `cssIsolation`，定位 `createReactPage` 中创建 Shadow Root 的位置。
2. 阅读样式注入路径：CSS 文本是从哪里来的（构建产物 manifest？运行时 fetch？），又如何 append 到 ShadowRoot。
3. 在 sy-lowcode-workspace-tools 中搜索 `cssIsolation` / `shadow`，定位构建期对 CSS 的特殊处理（例如把 CSS 改成 inline string、生成 `*.css.js` 模块）。
4. 在 `app-workspace.config.ts` 类型定义中，定位 `cssIsolation` 字段的取值与默认值。

输出：一份 5~10 行的总结说明「当前 Shadow DOM 是怎么工作的」，作为后续移除工作的依据。

### Step 2 — 实现 CSS Namespace 隔离

#### 2.1 改造 sy-page-sdk 的 `createReactPage`

```tsx
// 伪代码示意
import { ConfigProvider as AntConfigProvider } from 'antd';
import { ConfigProvider as MobileConfigProvider } from 'antd-mobile';

export function createReactPage(options) {
  const { container, pageCode, UserPage } = options;

  // 1. 创建普通 DOM 节点，加上 namespace class
  const rootElement = document.createElement('div');
  rootElement.className = 'sy-app-workspace';
  rootElement.id = `sy-page-${pageCode}`;
  container.appendChild(rootElement);

  // 2. 用 ConfigProvider 包裹用户页面
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <AntConfigProvider
      prefixCls="sy-ant"
      iconPrefixCls="sy-anticon"
      getPopupContainer={() => rootElement}
      theme={{ cssVar: { prefix: 'sy-ant' }, hashed: false }}
    >
      <MobileConfigProvider>
        <UserPage />
      </MobileConfigProvider>
    </AntConfigProvider>
  );

  return {
    unmount: () => { root.unmount(); rootElement.remove(); },
  };
}
```

要点：
- **删除** `attachShadow` 及 Shadow CSS 注入代码。
- `prefixCls="sy-ant"` 配合 `cssVar: { prefix: 'sy-ant' }` 使 antd 内置样式带前缀，避免与宿主页面 antd 冲突。
- `getPopupContainer={() => rootElement}` 把所有可重定向的弹层强制挂回 namespace 节点。
- antd-mobile 由于 Popup 不支持 getContainer，依赖「全局 CSS 加 namespace 前缀」来保证样式可见 —— 通过 Step 2.2 的 PostCSS 插件解决。

#### 2.2 在构建工具中添加 namespace PostCSS 插件

在 sy-lowcode-workspace-tools（或 `openxiangda/build`）中：

1. 引入 `postcss-prefix-selector` 或自实现一个 PostCSS 插件，对用户 CSS 添加前缀：
   ```js
   require('postcss-prefix-selector')({
     prefix: '.sy-app-workspace',
     transform(prefix, selector, prefixedSelector) {
       // :root / html / body 不加前缀；@keyframes 不处理
       if (/^(html|body|:root)$/.test(selector)) return ':root';
       return prefixedSelector;
     },
   })
   ```
2. 在 Vite 的 `css.postcss.plugins` 配置中接入。
3. **不要**对 antd 内置样式做二次前缀（antd 已通过 `prefixCls` 自带 `sy-ant-` 前缀）；只对用户 CSS（含 Tailwind 输出）应用 namespace。

#### 2.3 扩展 `cssIsolation` 配置

修改 `app-workspace.config.ts` 的类型定义与消费逻辑：

```ts
type CssIsolation = 'namespace' | 'shadow' | 'none';
// 'namespace': 推荐方案（本任务新增，默认值）
// 'shadow':    已废弃，保留兼容（输出 deprecation warning）
// 'none':      不做任何隔离（仅调试用途）
```

当 `cssIsolation === 'shadow'` 时，在 CLI 启动 / 构建时打印 deprecation 警告，引导迁移。

### Step 3 — 完善 tokens.css

新建 `src/styles/tokens.css`（位于 sy-form-components 或新的 `openxiangda`），完整定义 CSS 变量。参考 `references/style-system.md` 中的清单，至少覆盖：

```css
:root, .sy-app-workspace {
  /* color */
  --sy-color-primary: #1677ff;
  --sy-color-success: #52c41a;
  --sy-color-warning: #faad14;
  --sy-color-error:   #ff4d4f;
  --sy-color-text:    rgba(0, 0, 0, 0.88);
  --sy-color-text-secondary: rgba(0, 0, 0, 0.65);
  --sy-color-border:  #d9d9d9;
  --sy-color-bg:      #ffffff;
  --sy-color-bg-layout: #f5f5f5;

  /* spacing */
  --sy-spacing-xs: 4px;
  --sy-spacing-sm: 8px;
  --sy-spacing-md: 16px;
  --sy-spacing-lg: 24px;
  --sy-spacing-xl: 32px;

  /* radius */
  --sy-radius-sm: 4px;
  --sy-radius-md: 6px;
  --sy-radius-lg: 8px;

  /* font */
  --sy-font-size-sm: 12px;
  --sy-font-size-md: 14px;
  --sy-font-size-lg: 16px;

  /* shadow / z-index 等按 style-system.md 补充 */
}
```

通过 `package.json` 的 `exports` 暴露：

```json
"./styles/tokens.css": "./dist/styles/tokens.css"
```

模板项目在 `src/index.css` 顶部 `@import 'openxiangda/styles/tokens.css';`。

### Step 4 — 重构 tailwind-preset.ts

基于新 CSS 变量体系重写 `src/tailwind.preset.ts`：

```ts
import type { Config } from 'tailwindcss';

const preset: Partial<Config> = {
  important: '.sy-app-workspace',
  theme: {
    extend: {
      colors: {
        primary: 'var(--sy-color-primary)',
        success: 'var(--sy-color-success)',
        warning: 'var(--sy-color-warning)',
        error:   'var(--sy-color-error)',
        text:    'var(--sy-color-text)',
        border:  'var(--sy-color-border)',
      },
      spacing: {
        xs: 'var(--sy-spacing-xs)',
        sm: 'var(--sy-spacing-sm)',
        md: 'var(--sy-spacing-md)',
        lg: 'var(--sy-spacing-lg)',
        xl: 'var(--sy-spacing-xl)',
      },
      borderRadius: {
        sm: 'var(--sy-radius-sm)',
        md: 'var(--sy-radius-md)',
        lg: 'var(--sy-radius-lg)',
      },
      fontSize: {
        sm: 'var(--sy-font-size-sm)',
        base: 'var(--sy-font-size-md)',
        lg: 'var(--sy-font-size-lg)',
      },
    },
  },
  corePlugins: { preflight: false }, // 避免 reset 影响宿主页
};

export default preset;
```

要点：
- 加 `important: '.sy-app-workspace'`，保证用户 Tailwind 类的优先级高于宿主 / antd 默认样式。
- 关闭 `preflight`，防止 reset 把宿主页样式覆盖掉。
- **清理冗长 safelist**：原 preset 因为兼容旧场景包含大量 safelist，本次重构改为按需生成；如某些动态类名仍需保留，在 README 中以列表形式记录。

### Step 5 — 更新模板项目配置

`/home/developer/code/openxiangda/templates/sy-lowcode-app-workspace/`：

1. `app-workspace.config.ts`：
   ```ts
   defaults: {
     cssIsolation: 'namespace',
   }
   ```
2. `tailwind.config.cjs`：
   ```js
   module.exports = {
     presets: [require('openxiangda/tailwind-preset')]
     content: ['./src/**/*.{ts,tsx}'],
   };
   ```
3. `postcss.config.cjs`：保持精简，namespace 由构建工具内置 plugin 处理，模板侧无需配置。
4. `vite.config.ts`：移除 Shadow DOM 相关的 `optimizeDeps` 排除项（若存在）。
5. `src/index.css`：
   ```css
   @import 'openxiangda/styles/tokens.css';
   @tailwind base;
   @tailwind components;
   @tailwind utilities;
   ```

## 5. 验收标准

| # | 验收项 | 验证方式 |
| --- | --- | --- |
| 1 | antd `Select` / `Dropdown` / `DatePicker` 弹层样式正常 | 在 dev 页面拖入对应组件，肉眼检查 |
| 2 | antd-mobile `Popup` / `Picker` / `ActionSheet` 样式正常 | 在移动端 demo 页运行 |
| 3 | 页面内 CSS 不泄漏到宿主页 | 在宿主页放置 `<h1>` 等元素，确认不受用户页样式影响 |
| 4 | 宿主页 CSS 不影响用户页 | 宿主页定义 `.ant-btn { color: red }`，用户页按钮颜色不变 |
| 5 | 所有 Tailwind 类正常生效 | 在 dev 页面使用 `text-primary p-md rounded-md`，渲染符合预期 |
| 6 | CSS 变量可被覆盖 | 在 `.sy-app-workspace` 上设置 `--sy-color-primary: red`，按钮颜色变红 |
| 7 | 已废弃的 `cssIsolation: "shadow"` 仍能运行并输出 warning | 改回旧配置，启动 dev，控制台出现 deprecation 警告 |

## 6. 注意事项和约束

1. **antd v6** 才稳定支持 `cssVar` + `prefixCls` 同时配置；若 sy-form-components 当前依赖 antd v5，需要确认升级影响。
2. **antd-mobile v5** 的 ConfigProvider 仅暴露 `--adm-color-primary` 等变量，部分组件无法通过 getContainer 重定向，依赖 namespace 前缀方案兜底。
3. 不要破坏 sy-form-components 现有导出 API，**只改内部样式机制**。所有改动对组件使用者透明。
4. tailwind-preset 重构后，需在 `zjnu-dxyq-lowcode` 上回归一遍，确保现有项目类名仍生效。
5. 需要 **同时** 测试 PC（antd）和 H5（antd-mobile）两条产品线。
6. PostCSS 前缀插件不要处理 `@keyframes`、`:root`、CSS 变量声明本身。
7. 构建产物体积应 ≤ 旧 Shadow 方案（namespace 方案不需要额外打包 css-as-js）。
8. 若发现 antd 内部样式仍出现在 `<head>`，确认 `prefixCls` 是否生效；hashed 应设为 `false` 以便缓存命中。
9. 与 Phase 3 协同：本 Phase 的产物（tokens.css / 新 preset / namespace 构建插件）最终会被收编进 `openxiangda`，请保持模块边界清晰，便于后续迁移。
