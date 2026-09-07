# OpenXiangda 样式体系参考

> 面向 AI Agent 的代码页、表单页和自定义节点样式基线。默认直接使用 Tailwind 原生工具类和 Tailwind 任意值；平台 token 是兼容能力和平台组件内部能力，不是业务页面的强制范式。

---

## 1. 默认规则

1. **业务页面默认写原生 Tailwind**：优先使用 `bg-white`、`border`、`border-slate-200`、`text-slate-600`、`shadow-sm`、`rounded-lg`、`p-4`、`gap-4`、`grid-cols-[240px_1fr]` 这类 Tailwind 原生类和任意值。
2. **不要强制平台 token**：不要把 `bg-container`、`text-secondary`、`rounded-form`、`shadow-card` 当默认示例或默认范式。历史项目或平台组件需要时可以兼容使用，但新业务页面不推荐主动依赖。
3. **不要直接套 shadcn token**：`bg-card`、`text-muted-foreground`、`text-foreground`、`bg-background` 等不是 Tailwind 原生类。除非项目已经在 `tailwind.config.cjs` 明确配置这些 token，否则必须改成 Tailwind 原生类或任意值。
4. **默认不启用样式隔离**：新发布页面默认 `cssIsolation: "none"`，Tailwind 类按原样输出，不需要 `.sy-app-workspace` 前缀即可生效。
5. **legacy 隔离仅用于兼容**：历史页面或显式配置 `cssIsolation: "namespace" | "shadow"` 时，runtime 仍会保留 `.sy-app-workspace`、legacy portal 和旧样式前缀。
6. **CSS 作用域要收敛**：页面级 CSS 写在 `styles.css`，选择器优先限定在页面根类下，避免无意覆盖宿主平台或其他页面。

---

## 2. 推荐写法

### 2.1 页面容器

```tsx
export function DashboardPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-5 text-slate-900">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">排队预约</h1>
        <p className="mt-1 text-sm text-slate-600">查看排队申请、安排上机时间、处理冲突。</p>
      </section>
    </main>
  );
}
```

### 2.2 卡片和状态

```tsx
<div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
  <div className="text-sm text-slate-500">待分配</div>
  <div className="mt-2 text-2xl font-semibold text-amber-700">2</div>
</div>

<span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
  已完成
</span>
```

### 2.3 精确布局和品牌色

```tsx
<div className="grid min-h-[calc(100vh-64px)] grid-cols-[280px_1fr] gap-5">
  <aside className="border-r border-slate-200 bg-white" />
  <section className="bg-[#f7fafc] p-6" />
</div>

<button className="rounded-md bg-[#1677ff] px-4 py-2 text-sm font-medium text-white hover:bg-[#0958d9]">
  提交
</button>
```

### 2.4 局部 CSS

```css
.queue-booking-page {
  min-height: 100%;
  background: #f8fafc;
}

.queue-booking-page .queue-booking-page__calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(120px, 1fr));
  gap: 12px;
}
```

---

## 3. Tailwind 配置要求

OpenXiangda workspace 的 `tailwind.config.cjs` 必须保留：

```js
const openxiangdaPath = require("node:path");
const openxiangdaPresetModule = require("openxiangda/tailwind-preset");
const openxiangdaPreset =
  openxiangdaPresetModule.default ?? openxiangdaPresetModule;

function resolveOpenXiangdaContent() {
  try {
    const packagePath = require.resolve("openxiangda");
    const distDir = openxiangdaPath.dirname(packagePath);
    return [openxiangdaPath.join(distDir, "..", "**/*.{js,mjs,cjs}")];
  } catch {
    return [];
  }
}

const openxiangdaContent = resolveOpenXiangdaContent();

module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    ...openxiangdaContent,
  ],
  blocklist: ["[-:T]", "[-:TZ.]"],
  presets: [openxiangdaPreset],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

这个配置的作用：

- `openxiangdaPreset` 保留平台组件 safelist、平台 token 兼容类和平台组件需要的工具类；不再强制 Tailwind 输出 `.sy-app-workspace` 前缀。
- `...openxiangdaContent` 确保平台组件内部 class 会被 Tailwind 扫描到。
- `blocklist` 避免 Tailwind 误生成日期字符串相关的异常类。

不要移除这些平台构建能力；自由写 Tailwind 原生类和保留平台组件兼容能力并不冲突。

---

## 4. 入口 CSS 要求

`src/index.css` 默认只需要 Tailwind 指令和少量基础样式：

```css
@layer tailwind-base {
  @tailwind base;
}

@tailwind components;
@tailwind utilities;

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  background: #f8fafc;
  color: #0f172a;
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

#root {
  min-height: 100dvh;
}
```

`openxiangda/styles/tokens.css` 不再是新业务页面的默认依赖。旧项目已经引入时可以保留，或在确实需要平台 CSS 变量统一主题时手动引入。

---

## 5. Ant Design 和弹层

PC 控件优先用 `antd`，移动端控件优先用 `antd-mobile`。默认 `cssIsolation: "none"` 时使用 Ant Design 默认 `ant` class 和 `document.body` 弹层容器即可；只有 legacy `namespace/shadow` 页面才需要显式挂到当前隔离容器：

```tsx
<ConfigProvider>
  <App />
</ConfigProvider>
```

legacy 页面可使用 `getPopupContainer={(trigger) => trigger?.closest(".sy-app-workspace") ?? document.body}`。不要无作用域覆盖 `.ant-select-selector`、`.ant-modal` 等私有 class；确实需要覆盖时限定在页面根类下。

---

## 6. 平台 Token 兼容说明

OpenXiangda 仍保留部分平台语义类和 CSS 变量，主要用于：

- 平台标准表单、数据管理列表、审批时间线等组件内部样式。
- 老项目兼容。
- 多应用统一主题或深度主题定制。

常见兼容类包括 `text-primary`、`text-secondary`、`bg-container`、`bg-layout`、`border-secondary`、`rounded-form`、`shadow-card` 等。AI 编写新业务页面时不要默认使用这些类；除非用户明确要求跟随平台变量主题，或当前项目已有一致的 token 体系。

如果需要统一主题，推荐把主题限制在应用根类下；兼容旧页面时也可以同时声明 `.sy-app-workspace`：

```css
.theme-brand,
.sy-app-workspace.theme-brand {
  --sy-color-primary: #0f766e;
  --sy-radius-md: 8px;
}
```

---

## 7. 构建期提醒

OpenXiangda 构建会扫描源码里的 shadcn token 类。如果发现 `bg-card`、`text-muted-foreground`、`text-foreground` 等类，但项目没有显式配置对应 token，会输出 warning。

收到 warning 时优先修正为：

- Tailwind 原生类：`bg-white border border-slate-200 text-slate-600`
- Tailwind 任意值：`bg-[#1677ff] text-[13px] grid-cols-[240px_1fr]`
- 或在 `tailwind.config.cjs` 中显式配置这些 shadcn token

warning 不会阻断构建，但它通常意味着页面会出现“颜色、边框、文本层级异常”的视觉问题。

---

## 8. 提交前检查

- [ ] 页面样式默认使用 Tailwind 原生类和任意值，而不是平台 token 类？
- [ ] 没有使用未配置的 shadcn token 类，例如 `bg-card`、`text-muted-foreground`、`text-foreground`？
- [ ] `tailwind.config.cjs` 保留 OpenXiangda preset、content 扫描和 blocklist？
- [ ] 业务 CSS 限定在页面根类下，而不是全局裸覆盖？
- [ ] 只有 legacy `namespace/shadow` 页面才额外配置 `.sy-app-workspace` 弹层容器？
