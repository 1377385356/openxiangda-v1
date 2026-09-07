# OpenXiangda 常见问题排查指南

> 本文档面向 AI Agent，收录在实际低代码项目（如 zjnu-dxyq-lowcode）开发中遇到的典型问题及解决方案。遇到报错或异常现象时，请优先在此查找匹配项；若无匹配，再结合源码与日志分析。

## 快速索引

| # | 问题 | 关键报错 / 现象 |
| --- | --- | --- |
| 1 | antd/antd-mobile 弹层样式丢失 | Select/Modal 弹层无样式或跑到屏幕外 |
| 2 | SelectField options 为 undefined 导致 .map 报错 | `Cannot read properties of undefined (reading 'map')` |
| 3 | ESM 模块动态导入路径错误 | `ERR_UNSUPPORTED_ESM_URL_SCHEME` / `Cannot find module` |
| 4 | Windows 环境 OSS 上传路径错误 | 发布后资源 404，URL 含 `\` |
| 5 | 构建时表单 API 常量替换失败 | formApi.ts 中环境变量未替换 |
| 6 | Tailwind 样式被清除（PurgeCSS） | 生产构建后样式丢失 |
| 7 | React 多实例冲突 | `Invalid hook call` |
| 8 | 移动端 antd-mobile 组件样式不生效 | 组件渲染但无样式 |
| 9 | 数据格式理解错误导致展示异常 | 页面显示 `[object Object]` |
| 10 | workspace publish 环境变量缺失 | `OPENXIANGDA_ACCESS_TOKEN is not set` |
| 11 | DOCX 二进制契约异常 | 真实字节不是 `PK`，或自定义 FormProvider 把 Blob 请求错误转给 JSON 通道 |

---

## 问题：DOCX 响应是 Base64 文本

**症状**：ticket metadata 正常返回 `renderMode: "docx-html"` 和 `canPreview: true`，`/service/file/preview-by-ticket/:ticket` 也是 HTTP 200，但 Word 预览仍然解析失败或提示“文件内容响应不是二进制数据”。

**判定**：DOCX 本质是 ZIP，真实原始字节应以 `PK`（十六进制 `50 4B 03 04`）开头。Chrome DevTools 可能把二进制响应显示成 `UEsDB...`，这只是展示形式；使用 `response.arrayBuffer()`、下载文件或服务端探针检查真实前四字节。只有真实字节是 ASCII `UEsDB` 时，才是 Base64 包装对象。

**解决方案**：若真实字节是 `UEsDB`，升级平台服务端和 OpenXiangda SDK，使用严格 ZIP 校验后的兼容解码。若真实字节已经是 `PK`，检查自定义编辑页的 `FormProvider`：`config.api` 必须来自 `usePageFormRuntimeApi()`，非 Hook 场景使用 `createPageFormRuntimeApi(sdk)`。不要手写 `api.request: config => sdk.request(...)`，也不要在业务页面自行调用 `atob`。

**验证方式**：真实响应字节以 `PK` 开头；组件的 Blob 请求进入 `sdk.transport.download`，并最终向 DOCX 渲染器传入 `Blob`。若下载后的文件真实字节仍是 ASCII `UEsDB`，再检查服务端版本和多节点部署一致性。

---

## 问题：附件下载打开站点根 `/file/` 并返回 404

**症状**：附件下载 ticket 创建成功，但浏览器打开 `https://host/file/...`，实际平台文件接口位于 `https://host/service/file/...`。

**原因**：应用手写了 PageSdk 到 `FormProvider` 的不完整适配，或使用了未归一化的 ticket payload，绕过了当前 runtime 的 `servicePrefix`。

**解决方案**：升级 OpenXiangda，并让 `FormProvider.config.api` 来自 `usePageFormRuntimeApi()` 或 `createPageFormRuntimeApi(sdk)`。SDK 会把 ticket payload 中的 `/file/*` 内容地址补成当前 `servicePrefix`，同时保留 `/view/*` 页面地址和绝对 OSS URL。业务代码不要直接 `window.open(ticket.downloadUrl)` 后再自行猜测前缀。

**验证方式**：点击下载后地址应为 `/service/file/download-by-ticket/:ticket` 或服务端返回的绝对存储 URL，不应是站点根 `/file/*`。

---

## 问题：antd/antd-mobile 弹层样式丢失

**症状**：Select / Dropdown / Popup / Modal 等组件的弹出层没有样式，直接跑到屏幕外，或呈现为无样式的裸 HTML。

**根因**：新页面默认 `cssIsolation: "none"`，弹层使用 `document.body` 和默认 Ant Design 样式即可。只有历史页面显式启用 `cssIsolation: "namespace" | "shadow"` 时，弹层渲染到 `document.body` 才可能脱离 legacy 样式作用域；移动端 Popup 也可能因 namespace 未被继承而失去样式。

**解决方案**：
1. 新页面优先保持 `cssIsolation: "none"`，不要为了修弹层问题手动加 `.sy-app-workspace`。
2. legacy `shadow` 页面优先迁移为 `none`；无法迁移时可使用 `namespace` 兼容模式。
3. legacy 页面为 antd `ConfigProvider` 配置 `getPopupContainer` 指向页面根容器。
4. 对于 legacy antd-mobile 页面，确保 `Popup` / `Modal` 的 `getContainer` 指向正确容器，并按需补 namespace class。

**legacy 示例**：
```tsx
import { useRef } from 'react';
import { ConfigProvider } from 'antd';

const rootRef = useRef<HTMLDivElement>(null);

<div ref={rootRef} className="sy-app-workspace">
  <ConfigProvider getPopupContainer={() => rootRef.current!}>
    <App />
  </ConfigProvider>
</div>
```

**预防措施**：在 workspace 初始化阶段就统一约定弹层容器策略，避免后续逐个组件修复。

---

## 问题：SelectField options 为 undefined 导致 .map 报错

**症状**：渲染 `SelectField` / `RadioField` / `CheckboxField` 时抛出 `Cannot read properties of undefined (reading 'map')`。

**根因**：这些需要枚举值的字段组件在 schema 中未提供 `options` 属性，组件内部直接调用 `options.map(...)`。

**解决方案**：
- 确保所有选择类字段在 schema 中至少包含 `options: []`。
- 使用 `createFormSchema` 工厂函数，它会自动为缺失的 options 字段补齐空数组。

**预防措施**：
```typescript
// form-schema.ts 中的保护逻辑
const NEEDS_OPTIONS = ['SelectField', 'RadioField', 'CheckboxField'];

for (const field of schema.fields) {
  if (NEEDS_OPTIONS.includes(field.componentName) && !Array.isArray(field.options)) {
    field.options = [];
  }
}
```

---

## 问题：ESM 模块动态导入路径错误

**症状**：执行 `sync-schema` 等脚本时报 `ERR_UNSUPPORTED_ESM_URL_SCHEME` 或 `Cannot find module`。

**根因**：Node.js 的 `import()` 在部分环境下（尤其是 Windows）不接受纯文件路径，必须使用 `file://` URL 形式。

**解决方案**：
```javascript
import { pathToFileURL } from 'url';

// 错误写法（可能在 Windows 下报错）
const module = await import(tmpFile);

// 正确写法
const module = await import(pathToFileURL(tmpFile).href);
```

**预防措施**：所有动态 `import()` 文件路径统一通过 `pathToFileURL().href` 转换，CI 中加入 Windows 平台冒烟测试。

---

## 问题：Windows 环境 OSS 上传路径错误

**症状**：发布完成后访问页面，CSS / JS 资源返回 404，浏览器 Network 面板中可见 URL 内出现反斜杠 `\`。

**根因**：Windows 文件系统使用 `\` 作为路径分隔符，而 OSS 对象 key 必须使用 `/`，未做归一化时直接拼接路径会导致非法 key。

**解决方案**：
```javascript
function toOssKeyPath(file) {
  return String(file).replace(/\\/g, '/');
}

const ossKey = toOssKeyPath(path.relative(distDir, absFile));
await ossClient.put(ossKey, absFile);
```

**预防措施**：在上传函数入口处统一调用 `toOssKeyPath`，禁止直接拼接原始路径。

---

## 问题：构建时表单 API 常量替换失败

**症状**：生成的 `formApi.ts` 中，环境变量（如 `APP_ID`、`BASE_URL`）等常量值没有被正确替换为目标 profile 的真实值。

**根因**：旧的替换正则只覆盖了简单字符串字面量，无法匹配对象字面量、函数调用、模板字符串等复杂初始化表达式。

**解决方案**：使用更宽松的正则匹配 `=` 到 `;` 之间的任意表达式：
```javascript
const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const regex = new RegExp(
  `((?:export\\s+)?const\\s+${escaped}\\s*=\\s*)([^;]+);`
);
source = source.replace(regex, (_, prefix) => `${prefix}${JSON.stringify(value)};`);
```

**预防措施**：替换后立即写一个 sanity check，比较替换前后的 AST 是否仅常量值发生变化。

---

## 问题：Tailwind 样式被清除（PurgeCSS 问题）

**症状**：开发环境（`vite dev`）下页面样式正常，但 `vite build` 生产产物中部分组件样式丢失。

**根因**：Tailwind v3+ 的 `content` 配置未包含来自 SDK / 组件库的源文件，组件库内使用的类名在编译期被 PurgeCSS 误删。

**解决方案**：
```javascript
// tailwind.config.cjs
module.exports = {
  content: [
    './src/**/*.{ts,tsx}',
    './node_modules/openxiangda/packages/sdk/dist/**/*.{mjs,cjs}', // 关键：包含 SDK 分发文件
  ],
  presets: [require('openxiangda/tailwind-preset')],
};
```

**预防措施**：每次新增第三方组件库时，同步将其分发产物路径加入 `content` 数组；将 `pnpm build` 纳入 CI，对比构建产物体积异常增减。

---

## 问题：React 多实例冲突

**症状**：运行时抛出 `Invalid hook call. Hooks can only be called inside of the body of a function component.`，组件中所有 hooks 失效。

**根因**：项目最终打包产物中存在多个 React 实例，通常是因为组件库与宿主项目各自引入了不同版本的 `react` / `react-dom`。

**解决方案**：
```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom', 'antd'],
  },
});
```

**预防措施**：
- 在 `package.json` 中将 `react` / `react-dom` 设为 SDK 的 `peerDependencies`。
- 使用 `pnpm why react` 排查重复依赖。

---

## 问题：移动端 antd-mobile 组件样式不生效

**症状**：antd-mobile 组件 DOM 已渲染，但样式全部丢失，呈现裸 HTML。

**根因**：antd-mobile 使用 CSS-in-JS / 预编译样式，可能被 Tailwind 的 preflight 重置覆盖，或受 namespace 隔离影响。

**解决方案**：
1. 在 `vite.config.ts` 的 `optimizeDeps.include` 中显式添加 `antd-mobile`，避免运行时多次预构建。
2. 调整 Tailwind preflight 策略，确保不会覆盖 antd-mobile 的基础样式（必要时关闭 preflight 或使用 `important` 选择器）。
3. 仅 legacy `namespace/shadow` 页面需要确保 antd-mobile 组件渲染在 `sy-app-workspace` namespace 容器内，弹层 `getContainer` 指向该容器；新页面默认不需要。

**示例**：
```typescript
// vite.config.ts
export default defineConfig({
  optimizeDeps: {
    include: ['antd-mobile', 'antd-mobile/es/locales/zh-CN'],
  },
});
```

**预防措施**：移动端项目模板中预置好 antd-mobile 的 vite 与 Tailwind 配置，禁止业务方随意修改 preflight。

---

## 问题：数据格式理解错误导致展示异常

**症状**：页面显示 `[object Object]`、空白，或筛选条件无法命中数据。

**根因**：AI 将平台返回的 `{label, value}` 结构字段当作纯字符串处理，直接渲染对象到 JSX。

**解决方案**：参考 `platform-data-model.md`，选择类字段在平台中存储为对象（单选为对象，多选为对象数组），渲染时需取 `label` 字段：
```tsx
// 错误：直接展示对象
<span>{record.department}</span>           // 显示 [object Object]

// 正确：取 label
<span>{record.department?.label}</span>

// 多选字段
<span>{record.tags?.map(t => t.label).join(', ')}</span>
```

**预防措施**：
- 编辑器中为选择类字段统一定义 `OptionValue = { label: string; value: string }` 类型。
- 列表 / 详情页渲染前，封装 `formatOption(value)` 工具函数。

---

## 问题：workspace publish 环境变量缺失

**症状**：执行发布命令时报错 `OPENXIANGDA_ACCESS_TOKEN is not set` 或类似缺少配置项的错误。

**根因**：没有通过 `openxiangda` CLI 触发发布，CLI 负责从安全存储读取 profile 配置并注入到子进程的环境变量中；直接运行 `pnpm` 脚本会绕过这一步骤。

**解决方案**：
- 始终通过 CLI 发布：
  ```bash
  openxiangda workspace publish --profile <profile-name>
  ```
- **不要**直接执行 `pnpm run publish:all` / `node scripts/publish.js`，这些命令缺少 token 注入。

**预防措施**：
- 在 workspace 的 `package.json` 中将真正的发布脚本设为内部脚本（前缀 `_`），README 与 SKILL 文档统一引导走 CLI 入口。
- 必要时在脚本入口处增加守卫，检测到 `OPENXIANGDA_ACCESS_TOKEN` 缺失时输出明确指引：`请通过 openxiangda workspace publish 发布`。
