# Phase 3: 三包合并为 openxiangda 与 CLI 上架 npm

## 1. 任务目标

将当前三个独立 npm 包合并为单一聚合包 `openxiangda`：
- `sy-lowcode-workspace-tools`（构建 CLI）
- `sy-page-sdk`（页面运行时）
- `sy-form-components`（表单/组件库）

同时将 `openxiangda` CLI 自身发布到 npm，实现 `npm install -g openxiangda` 全局安装与版本自动更新提示。

## 2. 背景与问题

当前三个包独立维护、独立发版：
| 包 | 当前版本 | 角色 |
| --- | --- | --- |
| `sy-lowcode-workspace-tools` | `0.1.17`（带 3 个 patch） | 构建 CLI |
| `sy-page-sdk` | `0.1.4` | 页面运行时 SDK |
| `sy-form-components` | `0.2.58` | 表单组件库 |

由此产生的痛点：
1. **认知成本高**：AI 与开发者需要分别了解三个包的 API、版本关系、互相依赖，新手上手成本陡峭。
2. **版本漂移**：三个包的小版本经常组合错误，出现「能 build 但运行时报错」等隐性兼容问题。
3. **安装繁琐**：每次新建项目要执行三条 `npm install`。
4. **CLI 不可全局安装**：openxiangda CLI 当前只能通过 `git clone + npm link` 使用，没有 `npm publish`，无法 `npm install -g`，也无版本检查/自动更新提示机制。

合并后达到的状态：
- 一条命令 `npm install openxiangda` 装齐所有运行时/组件/构建工具。
- CLI 通过 `npm install -g openxiangda` 或 `npx openxiangda@latest ...` 直接使用。
- CLI 启动时非阻塞检查 npm registry，发现新版本时在命令结束后提示升级。

## 3. 相关项目和文件路径

### 3.1 openxiangda CLI
路径：`/home/developer/code/openxiangda`
- `package.json` — 当前包配置
- `bin/openxiangda.js` — CLI 入口
- `lib/cli.js` — 命令实现
- `lib/skills.js` — 技能安装
- `lib/workspace-init.js` — 工作区初始化
- `lib/config.js` / `lib/http.js` / `lib/utils.js`

### 3.2 sy-form-components
路径：`/home/developer/lowcode/sy-form-components`
- `package.json`
- `src/index.ts`
- `src/tailwind.preset.ts`
- `src/components/**`

### 3.3 sy-page-sdk
路径：`/home/developer/lowcode/sy-page-sdk`（若不存在，用 `search_file` 在 `/home/developer/lowcode` 下查找 `"name": "sy-page-sdk"` 所在的 `package.json`）
- `src/createReactPage.ts` 或 `src/react/index.ts`
- `src/runtime/**`

### 3.4 sy-lowcode-workspace-tools
路径：`/home/developer/lowcode/sy-lowcode-workspace-tools`（同上方法定位）
- `bin/lowcode-workspace.mjs`
- `src/commands/build-forms.ts`
- `src/commands/build-pages.ts`
- `src/commands/publish-all.ts`
- `src/commands/sync-schema.ts`

### 3.5 patch 参考
路径：`/home/developer/code/zjnu-dxyq-lowcode/patches/sy-lowcode-workspace-tools@0.1.17.patch`

包含 3 处必须合入的修复：
1. `pathToFileURL` 修复 ESM 动态 import
2. Windows 路径分隔符归一化
3. 表单 API 常量替换的宽松正则

## 4. 详细实施方案

### Step 1 — 创建 `openxiangda` 仓库骨架

建议路径：在 openxiangda repo 内使用 `packages/sdk`，发布包名仍为根包 `openxiangda`。

目录结构：
```
openxiangda/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── bin/
│   └── lowcode-workspace.mjs
├── src/
│   ├── build/          # 原 sy-lowcode-workspace-tools
│   │   ├── index.ts
│   │   ├── commands/
│   │   └── utils/
│   ├── runtime/        # 原 sy-page-sdk
│   │   ├── index.ts
│   │   └── createReactPage.ts
│   ├── components/     # 原 sy-form-components
│   │   ├── index.ts
│   │   └── ...
│   ├── styles/
│   │   ├── tokens.css
│   │   ├── tailwind-preset.ts
│   │   └── antd-theme.ts
│   └── types/
│       └── index.ts
└── dist/               # 构建产物
```

### Step 2 — 迁移 sy-lowcode-workspace-tools

1. 把源码复制到 `src/build/`，保留原目录结构。
2. **合入 3 个 patch**：
   - 读取 `/home/developer/code/zjnu-dxyq-lowcode/patches/sy-lowcode-workspace-tools@0.1.17.patch`，逐条把修改翻译为新源码。
   - 重点：所有 `import(filePath)` 改为 `import(pathToFileURL(filePath).href)`；路径处理走 `path.posix` 或 `slash()` 归一化；表单 API 替换正则放宽。
3. 把 CLI 入口 `bin/lowcode-workspace.mjs` 改为：
   ```js
   #!/usr/bin/env node
   import('../dist/build/cli.mjs').then(m => m.run(process.argv));
   ```
4. 保持原 CLI 子命令名称不变：`build-forms` / `build-pages` / `build` / `publish-all` / `publish-form` / `publish-page` / `sync-schema` / `dev`。

### Step 3 — 迁移 sy-page-sdk

1. 源码复制到 `src/runtime/`。
2. 主要导出：
   ```ts
   export { createReactPage } from './createReactPage';
   export { useRuntimeResource } from './useRuntimeResource';
   export type { CreatePageOptions, PageInstance } from './types';
   ```
3. 如 Phase 2 已完成，同步切换为 CSS Namespace 实现；否则保留原 Shadow DOM 逻辑，在 Phase 2 完成后单独 PR 替换。

### Step 4 — 迁移 sy-form-components

1. 源码复制到 `src/components/`，保持现有 export 不变。
2. 把 `tailwind.preset.ts` 移动到 `src/styles/tailwind-preset.ts`。
3. 把 `tokens.css` 放在 `src/styles/tokens.css`（如 Phase 2 已建好，直接复用）。
4. 把 antd 主题预设抽到 `src/styles/antd-theme.ts`：
   ```ts
   export const antdTheme = {
     cssVar: { prefix: 'sy-ant' },
     token: { colorPrimary: 'var(--sy-color-primary)' },
   };
   ```

### Step 5 — 配置多入口 exports

`package.json`：
```json
{
  "name": "openxiangda",
  "version": "1.0.0",
  "type": "module",
  "sideEffects": ["**/*.css"],
  "bin": {
    "lowcode-workspace": "./bin/lowcode-workspace.mjs"
  },
  "exports": {
    ".": {
      "types": "./dist/components/index.d.ts",
      "import": "./dist/components/index.mjs"
    },
    "./runtime": {
      "types": "./dist/runtime/index.d.ts",
      "import": "./dist/runtime/index.mjs"
    },
    "./build": {
      "types": "./dist/build/index.d.ts",
      "import": "./dist/build/index.mjs"
    },
    "./tailwind-preset": {
      "import": "./dist/styles/tailwind-preset.mjs",
      "require": "./dist/styles/tailwind-preset.cjs"
    },
    "./styles/tokens.css": "./dist/styles/tokens.css",
    "./antd-theme": {
      "types": "./dist/styles/antd-theme.d.ts",
      "import": "./dist/styles/antd-theme.mjs"
    }
  },
  "files": ["dist/", "bin/"],
  "peerDependencies": {
    "react": ">=18",
    "react-dom": ">=18",
    "antd": ">=6",
    "antd-mobile": ">=5"
  }
}
```

`tsup.config.ts`：
```ts
import { defineConfig } from 'tsup';

export default defineConfig([
  // 浏览器侧 (components + runtime + styles)
  {
    entry: {
      'components/index': 'src/components/index.ts',
      'runtime/index':    'src/runtime/index.ts',
      'styles/tailwind-preset': 'src/styles/tailwind-preset.ts',
      'styles/antd-theme':      'src/styles/antd-theme.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    external: ['react', 'react-dom', 'antd', 'antd-mobile'],
    treeshake: true,
  },
  // Node 侧 (build CLI)
  {
    entry: { 'build/index': 'src/build/index.ts', 'build/cli': 'src/build/cli.ts' },
    format: ['esm'],
    dts: true,
    platform: 'node',
    target: 'node18',
  },
]);
```

并把 `src/styles/tokens.css` 通过 `tsup` 的 `publicDir` 或 `copy` 钩子直接拷贝到 `dist/styles/tokens.css`。

### Step 6 — openxiangda CLI npm 化

#### 6.1 调整 `/home/developer/code/openxiangda/package.json`
```json
{
  "name": "openxiangda",
  "version": "1.0.0",
  "type": "module",
  "bin": { "openxiangda": "./bin/openxiangda.js" },
  "files": [
    "bin/",
    "lib/",
    "openxiangda-skills/",
    "templates/",
    "README.md"
  ],
  "engines": { "node": ">=18" },
  "publishConfig": { "access": "public" }
}
```

确认 `bin/openxiangda.js` 顶部存在 `#!/usr/bin/env node`，并具有可执行权限。

#### 6.2 新增 `lib/version-check.js`
```js
// 非阻塞版本检查
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';

const CACHE_FILE = path.join(os.homedir(), '.openxiangda', 'version-check-cache.json');
const TTL = 24 * 60 * 60 * 1000; // 24h

export async function maybeNotifyNewVersion(currentVersion) {
  try {
    const cached = readCache();
    if (cached && Date.now() - cached.checkedAt < TTL) {
      compareAndPrint(currentVersion, cached.latest);
      return;
    }
    const latest = await fetchLatest('openxiangda');
    writeCache({ checkedAt: Date.now(), latest });
    compareAndPrint(currentVersion, latest);
  } catch { /* 静默失败 */ }
}
```
要点：
- 在 CLI 主流程的 `process.on('exit')` 中触发（避免阻塞主命令）。
- 失败一律静默；缓存损坏时丢弃。
- 命中新版本时使用统一格式：
  ```
  ╭─────────────────────────────────────────────╮
  │ openxiangda 1.0.3 → 1.1.0                   │
  │ Run: npm i -g openxiangda@latest            │
  ╰─────────────────────────────────────────────╯
  ```

#### 6.3 Skill 版本同步
在 `lib/skills.js` 的 `install`/`update` 流程中：
1. 安装时把 CLI 版本写入 `~/.codex/skills/.install-manifest.json`：
   ```json
   {
     "openxiangda-core":   { "installedByCli": "1.0.0", "installedAt": "2026-05-29T10:00:00Z" },
     "openxiangda-form":   { "installedByCli": "1.0.0", "installedAt": "..." }
   }
   ```
2. 每次 CLI 启动时比对当前 CLI 版本与 manifest，发现不一致就提示：
   ```
   Detected CLI upgrade (1.0.0 → 1.1.0). Run: openxiangda skill update
   ```
3. `openxiangda skill update` 重新写入 manifest，并按现有 install 流程刷新 Skill 文件。

### Step 7 — 发布与端到端验证

1. 先构建 SDK：`npm run build:sdk`，再从 openxiangda 根包发布：`npm publish --access public`
2. 再发 CLI：`cd openxiangda && npm publish`
3. 在干净环境（容器/虚拟机）验证：
   ```bash
   npm install -g openxiangda
   openxiangda --version            # 输出 1.0.0
   openxiangda workspace init demo  # 成功生成项目
   cd demo
   npm install                      # openxiangda 安装成功
   npm run dev                      # dev 服务器启动
   npm run build                    # lowcode-workspace build 成功
   ```
4. 在 demo 项目中验证 import：
   ```ts
   import { FormProvider } from 'openxiangda';
   import { createReactPage } from 'openxiangda/runtime';
   ```

## 5. 验收标准

| # | 验收项 | 验证方式 |
| --- | --- | --- |
| 1 | `npm install -g openxiangda` 成功 | 在干净环境执行 |
| 2 | `npx openxiangda@latest workspace init ./test` 成功 | 临时目录执行 |
| 3 | 新项目 `npm install openxiangda` 后 `npm run build` 成功 | 端到端跑通 |
| 4 | `import { FormProvider } from 'openxiangda'` 类型与运行均正常 | tsc --noEmit + 实际渲染 |
| 5 | `import { createReactPage } from 'openxiangda/runtime'` 正常 | 同上 |
| 6 | `lowcode-workspace build` 全局可执行 | `npx -p openxiangda lowcode-workspace --help` |
| 7 | CLI 启动时若 npm 有新版本，命令结束后看到升级提示 | 手动把本地 version 改低后运行 |
| 8 | Skill 升级提示在 CLI 版本变化时出现 | 修改 manifest 中 installedByCli 字段后运行 |

## 6. 注意事项和约束

1. **tree-shaking**：必须 `"type": "module"` + 显式 `sideEffects` 列表（仅 CSS 标记副作用），否则用户产物体积会爆炸。
2. **Node API 与浏览器代码分离打包**：`src/build/` 依赖 `fs` / `path` 等 Node API，必须 `platform: 'node'`；浏览器 entry 不可引入 build 目录任何模块。
3. **peerDependencies**：react ≥18、antd ≥6、antd-mobile ≥5；不要把它们打进 dist。
4. **向后兼容窗口**：保留 `sy-form-components` / `sy-page-sdk` / `sy-lowcode-workspace-tools` 至少 1 个 minor 周期的 npm 重定向版本（在 README 中声明 deprecated 并 re-export 自 `openxiangda`），便于旧项目平滑迁移。
5. **模板同步**：`openxiangda/templates/sy-lowcode-app-workspace/package.json` 必须改为依赖 `openxiangda`（具体由 Phase 5 完成）。
6. **CLI 版本检查不可阻塞主流程**：放在 `process.on('beforeExit')` 或独立 fire-and-forget Promise；超时阈值 1.5s。
7. **私有 registry**：用户可能在企业内网，若 npm registry 不可达，version-check 必须静默失败。
8. **首次 publish 前**：在 `npm publish --dry-run` 中确认 `files` 字段产物完整，禁止把 `src/` 或 `.codegraph/` 误打入包。
9. **packageManager 字段**：建议固定 `"packageManager": "pnpm@9.x"`，避免协作者用错包管理器。
10. **CHANGELOG**：在 sdk 与 CLI 各自仓库维护 `CHANGELOG.md`，记录 break change，方便后续 Phase 4/5 协同。
