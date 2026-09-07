# Phase 5: 模板项目与 Skill 体系同步升级

## 1. 任务目标

升级 `openxiangda` 的 workspace 模板项目与 Skill 知识体系，使其完全适配：
- Phase 2 — CSS Namespace 隔离 + 三层样式变量
- Phase 3 — `openxiangda` 单包聚合
- Phase 4 — 增量构建

确保 `openxiangda workspace init` 创建出的新项目 **开箱即用**：`npm install && npm run dev / build / publish` 全链路畅通；同时 Skill 文件中的所有示例代码、配置片段、命令说明与新架构一致。

## 2. 背景与问题

当前模板项目 `/home/developer/code/openxiangda/templates/sy-lowcode-app-workspace/`：
- 依赖 3 个独立包（`sy-form-components` / `sy-page-sdk` / `sy-lowcode-workspace-tools`）。
- `app-workspace.config.ts` 中 `cssIsolation` 仍是 `"shadow"`。
- 没有增量构建相关配置（`.gitignore` 未排除 cache 文件）。
- import 路径分散在多个包中。

Skill 文件 `/home/developer/code/openxiangda/openxiangda-skills/` 下的 `SKILL.md` 与 `references/*.md` 中，所有示例同样使用旧包名与旧 import 路径。

Phase 2 ~ 4 完成后，必须由本 Phase 把模板与 Skill 同步过来，否则用户走 `workspace init` 拿到的仍是旧架构产物。

## 3. 相关项目和文件路径

### 3.1 模板项目（重点）
路径前缀：`/home/developer/code/openxiangda/templates/sy-lowcode-app-workspace/`

| 文件 | 变更类型 |
| --- | --- |
| `package.json` | 依赖收敛为 `openxiangda`；scripts 微调 |
| `app-workspace.config.ts` | `cssIsolation: "namespace"` |
| `vite.config.ts` | 移除 Shadow 相关配置（如有） |
| `tailwind.config.cjs` | preset 改为 `openxiangda/tailwind-preset` |
| `postcss.config.cjs` | 精简（namespace 由 SDK 构建插件处理） |
| `index.html` | 检查 root 容器与字体引用 |
| `src/main.tsx` | 入口 import 路径替换 |
| `src/index.css` | 加 `@import 'openxiangda/styles/tokens.css'` |
| `src/dev/App.tsx` | dev 预览页 import 替换 |
| `src/shared/form-schema.ts` | 若 import 自旧包，替换 |
| `src/types/app-workspace.types.ts` | 类型 import 替换 |
| `src/forms/README.md` | 文档示例替换 |
| `scripts/build-js-code.mjs` | 引用替换；如调用构建 CLI 路径需同步 |
| `.gitignore` | 新增 `.openxiangda/build-cache.json` |

### 3.2 Skill 体系
路径前缀：`/home/developer/code/openxiangda/openxiangda-skills/`

需要扫描并同步的文件：
- `SKILL.md`（顶层）
- `skills/openxiangda-app/SKILL.md`
- `skills/openxiangda-core/SKILL.md`
- `skills/openxiangda-form/SKILL.md`
- `skills/openxiangda-inspect/SKILL.md`
- `skills/openxiangda-page/SKILL.md`
- `skills/openxiangda-permission-settings/SKILL.md`
- `skills/openxiangda-workflow-automation/SKILL.md`
- `references/pages/page-sdk.md`
- `references/pages/workspace-structure.md`
- `references/pages/publish-flow.md`
- `references/forms/form-schema.md`
- `references/forms/component-registry.md`
- `references/forms/layout-and-rules.md`
- `references/architecture-patterns.md`
- `references/automation-v3.md`
- `references/component-guide.md`
- `references/openxiangda-api.md`
- `references/permissions-settings.md`
- `references/platform-data-model.md`
- `references/style-system.md`（Phase 2 蓝图，已最新，但需确认 import 示例一致）
- `references/troubleshooting.md`
- `references/workflow-v3.md`
- `references/workspace-state.md`

### 3.3 CLI 初始化逻辑
- `/home/developer/code/openxiangda/lib/workspace-init.js` — 模板复制与变量替换
- `/home/developer/code/openxiangda/scripts/workspace-init-smoke.sh` — 烟囱测试

### 3.4 任务日志
- `/home/developer/code/openxiangda/docs/task-log.md` — 同步追加本次升级记录

## 4. 详细实施方案

### Step 1 — 更新模板 `package.json`

```json
{
  "name": "__WORKSPACE_PACKAGE_NAME__",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "lowcode-workspace build",
    "build:forms": "lowcode-workspace build-forms",
    "build:pages": "lowcode-workspace build-pages",
    "build:force": "lowcode-workspace build --force",
    "build-js-code": "node scripts/build-js-code.mjs",
    "publish:all": "lowcode-workspace publish-all",
    "sync:schema": "lowcode-workspace sync-schema",
    "type-check": "tsc -p tsconfig.app.json --noEmit"
  },
  "dependencies": {
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "antd": "^6.3.7",
    "@ant-design/icons": "^6",
    "antd-mobile": "^5.37.0",
    "openxiangda": "latest"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4",
    "autoprefixer": "^10",
    "postcss": "^8",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

**注意**：保留 `__WORKSPACE_PACKAGE_NAME__` 占位符，CLI 初始化时由 `lib/workspace-init.js` 替换。

### Step 2 — 更新 `app-workspace.config.ts`

```ts
import { defineAppWorkspaceConfig } from 'openxiangda/build';

export default defineAppWorkspaceConfig({
  workspaceCode: '__WORKSPACE_CODE__',
  defaults: {
    cssIsolation: 'namespace',
    frameworkVersion: '18.3.1',
    ossDir: 'lowcode',
  },
  forms: { dir: 'src/forms' },
  pages: { dir: 'src/pages' },
});
```

### Step 3 — 更新 `tailwind.config.cjs`

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('openxiangda/tailwind-preset')],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    // 让 Tailwind 扫描 SDK 中的类（确保组件库用到的工具类被生成）
    './node_modules/openxiangda/dist/**/*.{mjs,cjs}',
  ],
  // 注意：important 已在 preset 内固化为 '.sy-app-workspace'，此处无需重复
};
```

### Step 4 — 更新 `postcss.config.cjs`

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
    // namespace prefix 插件由 SDK 构建工具内置，模板侧无需配置
  },
};
```

### Step 5 — 更新 `src/index.css`

```css
@import 'openxiangda/styles/tokens.css';

@tailwind base;
@tailwind components;
@tailwind utilities;
```

### Step 6 — 替换全部 import 路径

按以下映射表，使用 `grep_code` 在模板与 Skill 目录全量搜索并替换：

| 旧路径 | 新路径 |
| --- | --- |
| `from 'sy-form-components'` | `from 'openxiangda'` |
| `from 'sy-form-components/...'` | `from 'openxiangda/...'`（按子路径具体映射） |
| `from 'sy-page-sdk'` | `from 'openxiangda/runtime'` |
| `from 'sy-page-sdk/react'` | `from 'openxiangda/runtime'` |
| `require('sy-form-components/tailwind-preset')` | `require('openxiangda/tailwind-preset')` |
| `import 'sy-form-components/styles/...'` | `import 'openxiangda/styles/...'` |
| 命令 `npx sy-lowcode-workspace ...` | `npx lowcode-workspace ...`（CLI 名不变，仅来源包变化） |
| 配置 `cssIsolation: 'shadow'` | `cssIsolation: 'namespace'` |

执行步骤：
1. `grep_code regex="sy-form-components" path=/home/developer/code/openxiangda` 列出所有命中。
2. `grep_code regex="sy-page-sdk" path=/home/developer/code/openxiangda` 同上。
3. `grep_code regex="sy-lowcode-workspace-tools" path=/home/developer/code/openxiangda` 同上。
4. `grep_code regex="cssIsolation" path=/home/developer/code/openxiangda` 同上。
5. 按命中清单逐个用 `search_replace` 修正（注意区分 SKILL.md 中的代码块与正文叙述，正文中若提到「历史上曾使用 sy-form-components」可保留，但要补一句「现已统一为 openxiangda」）。

### Step 7 — 调整 `lib/workspace-init.js`

读取 `/home/developer/code/openxiangda/lib/workspace-init.js`，确认：
1. 复制模板时 **保留** `__WORKSPACE_PACKAGE_NAME__` / `__WORKSPACE_CODE__` 等占位符替换逻辑。
2. 若初始化流程内有「自动 `npm install` 步骤」，确认依赖名称与新 `package.json` 一致。
3. 写入项目的 `.openxiangda/state.json` 不受影响。
4. 若 `lib/workspace-init.js` 中硬编码了任何旧包名（如校验、回退依赖），同步替换。

### Step 8 — 更新模板 `.gitignore`

确保包含：

```gitignore
# build artifacts
dist/
node_modules/

# openxiangda
.openxiangda/build-cache.json

# editor
.vscode/
.idea/
.DS_Store
```

注意 **不要** 忽略 `.openxiangda/state.json`（CLI 状态文件，应入库）。`build-cache.json` 单独排除。

### Step 9 — 更新 Skill 文档示例

对每个 `SKILL.md` / `references/*.md`：
1. 替换 import / require 路径（参见 Step 6 映射表）。
2. `cssIsolation` 描述更新为 namespace，并补充一句「Phase 2 已废弃 Shadow DOM，保留 `'shadow'` 仅作兼容」。
3. `references/style-system.md` 重读一遍，与 Phase 2 落地结果对齐（变量名、PostCSS 插件、ConfigProvider 用法）。
4. `references/pages/page-sdk.md`：
   - 替换 `createReactPage` 示例（移除 Shadow DOM 创建语句，展示 ConfigProvider）。
5. `references/pages/workspace-structure.md`：
   - 加上 `.openxiangda/build-cache.json`（增量构建产物）说明。
6. `references/forms/form-schema.md`：
   - 替换 sy-form-components import 示例。
7. 顶层 `SKILL.md`：
   - 在「快速开始」段落写明 `npm i openxiangda`、`npm i -g openxiangda`。

### Step 10 — 同步任务日志

在 `/home/developer/code/openxiangda/docs/task-log.md` 末尾追加：

```markdown
## [YYYY-MM-DD] Phase 5: 模板与 Skill 升级
- 模板依赖收敛到 openxiangda
- cssIsolation 默认切换为 namespace
- .gitignore 新增 .openxiangda/build-cache.json
- 所有 SKILL.md / references 中的旧包名 / 旧 import / 旧 cssIsolation 已同步
```

### Step 11 — 端到端验证

按下列脚本完整跑一遍：

```bash
# 1. 链接当前 CLI（或安装已发布版本）
cd /home/developer/code/openxiangda && npm link

# 2. 在临时目录初始化新项目
cd /tmp && rm -rf test-app
openxiangda workspace init ./test-app
cd test-app

# 3. 安装与开发
npm install
npm run type-check
npm run dev      # 验证 dev server 启动；按 Ctrl+C 退出

# 4. 构建（首次全量）
npm run build

# 5. 二次构建（应跳过）
npm run build

# 6. 修改一个表单后再次构建（应增量）
echo "// touch" >> src/forms/<one>/schema.ts
npm run build

# 7. 发布（需要 token）
openxiangda workspace publish --profile <profile>
```

可补充到 `scripts/workspace-init-smoke.sh`，使该脚本覆盖以上 1-6 步。

## 5. 验收标准

| # | 验收项 | 验证方式 |
| --- | --- | --- |
| 1 | `openxiangda workspace init ./test-app` 生成项目结构正确 | 对比模板文件树 |
| 2 | 新项目 `npm install` 0 error | 看 npm 输出 |
| 3 | 新项目 `npm run dev` 成功启动 dev server | 浏览器访问 localhost |
| 4 | 新项目 `npm run build` 成功 | 看 dist/ 产物 |
| 5 | dev 页面中的 antd Select / DatePicker 弹层样式正常 | 肉眼检查 |
| 6 | 新项目根目录 `.gitignore` 包含 `.openxiangda/build-cache.json` | `grep` 检查 |
| 7 | 所有 SKILL.md / references 中 grep `sy-form-components` / `sy-page-sdk` / `sy-lowcode-workspace-tools` 仅出现在「迁移说明 / 历史变更」上下文 | `grep_code` 复核 |
| 8 | 所有 SKILL.md 中 grep `cssIsolation: 'shadow'` 仅在「兼容说明」上下文 | `grep_code` 复核 |
| 9 | `openxiangda workspace publish --profile xxx` 走通发布链路 | 端到端 |
| 10 | `docs/task-log.md` 已追加 Phase 5 条目 | 阅读 |
| 11 | `scripts/workspace-init-smoke.sh` 通过 | 执行脚本 |

## 6. 注意事项和约束

1. **依赖前置**：本 Phase 必须在 Phase 2（CSS Namespace）与 Phase 3（`openxiangda` 已发布到 npm）完成后才能最终验证；如这两个 Phase 尚未完成，可先准备所有代码改动并在本地 `npm link openxiangda` 验证，待 SDK 正式发版后再做最终回归。
2. **模板变量保留**：模板里的 `__WORKSPACE_PACKAGE_NAME__` / `__WORKSPACE_CODE__` 等占位符是 `lib/workspace-init.js` 的替换目标，**绝对不要**改名或删除。
3. **Phase 1 reference 引用保护**：Phase 1 在各 SKILL.md 顶部新增的 `references/*.md` 引用块（用于 Skill 自动加载知识）必须保留，本次只修改其内部示例代码而非引用结构。
4. **不要破坏 antd 与 antd-mobile 双端共存**：模板代码中如有同时引入 PC / H5 组件的示例，保持双端配置（`ConfigProvider` 两端各一份）。
5. **dev 页面**：`src/dev/App.tsx` 是开发预览入口，不参与 publish；其样式包裹也要包一层 `<div className="sy-app-workspace">` 以确保与生产一致。
6. **build-cache.json**：是开发环境产物，模板项目初次生成 **不应** 携带该文件；`.gitignore` 仅声明排除即可。
7. **lockfile 选择**：模板默认不带 lockfile（由用户首次 install 时生成）；若需要锁定 SDK 版本，请在 `package.json` 用精确版本而非 `latest`。
8. **README 同步**：模板自带 `README.md`（如有）也需要替换示例命令与 import 路径。
9. **CI 一致性**：如 openxiangda 主仓 CI 跑 `workspace-init-smoke.sh`，需要确保 CI 环境能解析到 `openxiangda`（若用 npm registry 公共版本则无需特殊处理；若依赖私有源，需在 CI 注入 token）。
10. **回滚预案**：保留 git tag `pre-phase5` 指向升级前模板状态；如发现新模板严重问题，可一键回滚。
