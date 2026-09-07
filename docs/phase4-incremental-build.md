# Phase 4: 基于内容 Hash 的增量构建

## 1. 任务目标

为 `lowcode-workspace` 构建工具实现 **基于文件内容 SHA-256 hash 的增量构建** 能力：只重新编译有实际变更的 `src/forms/*` 与 `src/pages/*` 模块，跳过未变更模块，大幅缩短构建/发布耗时。

## 2. 背景与问题

当前 `lowcode-workspace build` 与 `lowcode-workspace publish-all` 每次执行都会 **全量** 编译 `src/forms/*/` 和 `src/pages/*/` 下的所有模块。

以 `/home/developer/code/zjnu-dxyq-lowcode` 为例：
- `src/forms/` 下 24 个表单目录
- `src/pages/` 下 3 个页面目录
- 全量 build 一次耗时较长

而实际开发中，每次往往只动 1~2 个模块，全量构建造成显著时间浪费。同时 `publish-all` 会把所有 OSS 资源全量上传一次，浪费带宽与平台注册请求。

引入增量构建后预期收益：
- 无变更场景下构建耗时 < 2s（仅做 hash 比对）。
- 修改单模块时只编译该模块，发布只上传该模块。
- 输出友好的「Built/Published m/n (incremental)」摘要。

## 3. 相关项目和文件路径

### 3.1 构建工具源码
- **若 Phase 3 已完成**：源码位于 `openxiangda` 内的 `src/build/`
- **若 Phase 3 未完成**：源码位于 `sy-lowcode-workspace-tools`（路径 `/home/developer/lowcode/sy-lowcode-workspace-tools`，必要时通过 `search_file` 定位含 `"name": "sy-lowcode-workspace-tools"` 的 `package.json`）

关键文件：
- `bin/lowcode-workspace.mjs` — CLI 入口
- `src/commands/build-forms.ts` — 表单构建命令
- `src/commands/build-pages.ts` — 页面构建命令
- `src/commands/build.ts` — 聚合构建命令
- `src/commands/publish-all.ts` — 一键发布

### 3.2 实际项目参考
路径：`/home/developer/code/zjnu-dxyq-lowcode`
- `src/forms/` — 24 个表单（每个含 `schema.ts` / `page.tsx` 等）
- `src/pages/` — 3 个页面
- `src/shared/` — 共享代码（被多个模块复用）
- `scripts/build-workspace.mjs` — 自定义构建脚本，可作为现有构建调用方式的样例

### 3.3 配置文件参考
- `/home/developer/code/openxiangda/templates/sy-lowcode-app-workspace/app-workspace.config.ts`
- `/home/developer/code/openxiangda/templates/sy-lowcode-app-workspace/.gitignore`

## 4. 详细实施方案

### Step 1 — 设计 BuildCache 数据结构

新增缓存文件 `<projectRoot>/.openxiangda/build-cache.json`：

```ts
interface BuildCache {
  /** schema 版本，未来 break change 时递增 */
  version: 1;

  /** package-lock / pnpm-lock / yarn.lock 内容 hash；变化则视为依赖变更，全量重建 */
  lockfileHash: string;

  /** src/shared/ 目录聚合 hash；变化则视为公共代码变更，全量重建 */
  sharedHash: string;

  /** workspace 配置 (app-workspace.config.ts / tailwind.config.cjs 等) 聚合 hash；变化则全量重建 */
  configHash: string;

  /** 模块级缓存 */
  entries: Record<string, {
    /** 模块目录所有源文件聚合 SHA-256 */
    contentHash: string;
    /** 上次构建时间 (ISO) */
    lastBuildTime: string;
    /** 构建产物相对路径列表 (用于清理) */
    outputFiles: string[];
    /** 是否成功（失败时不写入，留作未来扩展） */
    success: true;
  }>;
}
```

`entries` 的 key 形如 `forms/customer` / `pages/dashboard`。

### Step 2 — 实现 hash 计算工具

新文件 `src/build/incremental/hash.ts`（位置随构建工具仓库调整）：

```ts
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import ignore from 'ignore';

function loadGitignore(root: string) {
  const ig = ignore();
  try {
    ig.add(readFileSync(path.join(root, '.gitignore'), 'utf8'));
  } catch { /* ignore */ }
  ig.add(['node_modules', 'dist', '.openxiangda', '.git']);
  return ig;
}

/** 计算目录的聚合 hash：按相对路径排序，逐文件 sha256 后再聚合 */
export function computeDirectoryHash(dirAbs: string, projectRoot: string): string {
  const ig = loadGitignore(projectRoot);
  const files: string[] = [];
  walk(dirAbs);

  files.sort(); // 跨平台一致性
  const agg = createHash('sha256');
  for (const f of files) {
    const rel = path.relative(projectRoot, f).split(path.sep).join('/');
    if (ig.ignores(rel)) continue;
    const content = readFileSync(f);
    agg.update(rel);
    agg.update('\0');
    agg.update(createHash('sha256').update(content).digest());
  }
  return agg.digest('hex');

  function walk(p: string) {
    const st = statSync(p);
    if (st.isDirectory()) {
      for (const name of readdirSync(p)) walk(path.join(p, name));
    } else if (st.isFile()) {
      files.push(p);
    }
  }
}

export function computeLockfileHash(root: string): string {
  const candidates = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'];
  const h = createHash('sha256');
  for (const name of candidates) {
    try {
      h.update(name).update('\0').update(readFileSync(path.join(root, name)));
    } catch { /* skip */ }
  }
  return h.digest('hex');
}

export function computeConfigHash(root: string): string {
  const files = [
    'app-workspace.config.ts',
    'tailwind.config.cjs',
    'postcss.config.cjs',
    'vite.config.ts',
    'tsconfig.json',
  ];
  const h = createHash('sha256');
  for (const f of files) {
    try {
      h.update(f).update('\0').update(readFileSync(path.join(root, f)));
    } catch { /* skip */ }
  }
  return h.digest('hex');
}

export function computeSharedHash(root: string): string {
  const sharedDir = path.join(root, 'src', 'shared');
  try {
    return computeDirectoryHash(sharedDir, root);
  } catch {
    return 'no-shared';
  }
}
```

### Step 3 — 实现增量判断

新文件 `src/build/incremental/plan.ts`：

```ts
import path from 'node:path';
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { computeDirectoryHash, computeLockfileHash, computeSharedHash, computeConfigHash } from './hash';

const CACHE_FILE = '.openxiangda/build-cache.json';

export interface BuildPlan {
  /** 需要重新编译的模块 (相对 src/ 的目录，如 'forms/customer') */
  changed: string[];
  /** 完整模块列表 */
  all: string[];
  /** 是否全量 (lockfile/shared/config 变化) */
  fullRebuild: boolean;
  /** 当前 hash 快照（构建成功后用于回写 cache） */
  nextSnapshot: {
    lockfileHash: string;
    sharedHash: string;
    configHash: string;
    moduleHashes: Record<string, string>;
  };
}

export function planBuild(projectRoot: string, opts: { force?: boolean; only?: string[] } = {}): BuildPlan {
  const cache = loadCache(projectRoot);
  const all = listModules(projectRoot);
  const moduleHashes: Record<string, string> = {};
  for (const m of all) {
    moduleHashes[m] = computeDirectoryHash(path.join(projectRoot, 'src', m), projectRoot);
  }

  const lockfileHash = computeLockfileHash(projectRoot);
  const sharedHash = computeSharedHash(projectRoot);
  const configHash = computeConfigHash(projectRoot);
  const nextSnapshot = { lockfileHash, sharedHash, configHash, moduleHashes };

  if (opts.force) {
    return { changed: opts.only ?? all, all, fullRebuild: true, nextSnapshot };
  }

  const fullRebuild =
    !cache ||
    cache.lockfileHash !== lockfileHash ||
    cache.sharedHash !== sharedHash ||
    cache.configHash !== configHash;

  if (fullRebuild) {
    return { changed: opts.only ?? all, all, fullRebuild: true, nextSnapshot };
  }

  let changed = all.filter(m => !cache!.entries[m] || cache!.entries[m].contentHash !== moduleHashes[m]);
  if (opts.only) changed = changed.filter(m => opts.only!.includes(m));
  return { changed, all, fullRebuild: false, nextSnapshot };
}

export function commitCache(projectRoot: string, plan: BuildPlan, builtModules: string[], outputsByModule: Record<string, string[]>) {
  const prev = loadCache(projectRoot);
  const entries = { ...(prev?.entries ?? {}) };
  const now = new Date().toISOString();
  for (const m of builtModules) {
    entries[m] = {
      contentHash: plan.nextSnapshot.moduleHashes[m],
      lastBuildTime: now,
      outputFiles: outputsByModule[m] ?? [],
      success: true,
    };
  }
  const next = {
    version: 1 as const,
    lockfileHash: plan.nextSnapshot.lockfileHash,
    sharedHash:   plan.nextSnapshot.sharedHash,
    configHash:   plan.nextSnapshot.configHash,
    entries,
  };
  const dir = path.join(projectRoot, '.openxiangda');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'build-cache.json'), JSON.stringify(next, null, 2));
}

function loadCache(root: string) {
  try { return JSON.parse(readFileSync(path.join(root, CACHE_FILE), 'utf8')); } catch { return null; }
}

function listModules(root: string): string[] {
  const out: string[] = [];
  for (const kind of ['forms', 'pages']) {
    const base = path.join(root, 'src', kind);
    try {
      for (const name of readdirSync(base)) {
        if (statSync(path.join(base, name)).isDirectory()) out.push(`${kind}/${name}`);
      }
    } catch { /* dir 不存在跳过 */ }
  }
  return out;
}
```

### Step 4 — 集成到构建命令

修改 `src/commands/build.ts`（伪代码）：

```ts
import { planBuild, commitCache } from '../incremental/plan';

export async function runBuild(args) {
  const root = process.cwd();
  const plan = planBuild(root, { force: args.force, only: parseOnly(args.only) });

  if (args.dryRun) {
    printPlan(plan); // "Would build: forms/customer, pages/dashboard"
    return;
  }

  if (plan.changed.length === 0) {
    console.log('✔ No changes detected. Skip build (took 0.8s).');
    return;
  }

  console.log(`Building ${plan.changed.length}/${plan.all.length} module(s)${plan.fullRebuild ? ' (full rebuild)' : ' (incremental)'}`);
  const outputs: Record<string, string[]> = {};
  for (const m of plan.changed) {
    outputs[m] = await buildSingleModule(root, m); // 复用原 Vite 构建逻辑
  }
  commitCache(root, plan, plan.changed, outputs);
  console.log(`✔ Built ${plan.changed.length} module(s).`);
}
```

`buildSingleModule` 需要在原 `build-forms` / `build-pages` 内部抽取，按模块逐个调用 Vite 的 `build({ build: { rollupOptions: { input: ... } } })`。如果原实现是「一次 Vite build 多入口」，请评估两条改造路径：
1. **拆分为单模块循环**：实现简单，缓存粒度准确，但 Vite 启动开销 × N。
2. **保留多入口，但传入过滤后的 entries 子集**：更接近原性能，需要把缓存读写包在外层。

推荐 **方案 2**，仅当变更模块 ≥ 3 时一次性给 Vite，否则也走多入口。

### Step 5 — 新增 CLI 参数

`bin/lowcode-workspace.mjs` 解析参数（commander/yargs/手写均可）：

```
lowcode-workspace build                          # 增量（默认）
lowcode-workspace build --force                  # 忽略 cache，全量
lowcode-workspace build --only=forms/customer,pages/dashboard
lowcode-workspace build --dry-run                # 只打印计划
lowcode-workspace build --clean-cache            # 删除 .openxiangda/build-cache.json
```

`build-forms` / `build-pages` 同样支持上述参数（行为自动限制在对应种类）。

### Step 6 — 发布流程的增量化

`publish-all` 改造：

```ts
export async function runPublishAll(args) {
  const root = process.cwd();
  const plan = planBuild(root, { force: args.force });
  if (plan.changed.length === 0 && !args.force) {
    console.log('✔ Nothing to publish.');
    return;
  }
  await runBuildForModules(root, plan.changed);
  const uploadResult = await uploadOss(plan.changed);             // 只上传变更模块
  const registerResult = await registerOnPlatform(plan.changed);  // 只注册变更
  commitCache(root, plan, plan.changed, uploadResult.outputs);
  console.log(`✔ Published ${countForms(plan.changed)}/${plan.all.length} forms, ${countPages(plan.changed)}/... pages (incremental).`);
}
```

要求：
- OSS 上传仅针对变更模块的 dist 产物。
- 平台注册（schema 同步、表单/页面登记）只对变更模块发起。
- 输出摘要必须显示「变更数 / 总数」与是否 incremental。

## 5. 验收标准

| # | 场景 | 期望结果 |
| --- | --- | --- |
| 1 | 首次执行 `build` | 全量编译，写出 `.openxiangda/build-cache.json` |
| 2 | 无任何变更再次 `build` | 输出 "No changes detected"，耗时 < 2s，不触发 Vite |
| 3 | 修改 `src/forms/customer/schema.ts` 后 `build` | 只编译 `forms/customer`，其余跳过 |
| 4 | 修改 `src/shared/utils.ts` 后 `build` | 全量重编译（sharedHash 变更触发） |
| 5 | 修改 `app-workspace.config.ts` 后 `build` | 全量重编译（configHash 变更触发） |
| 6 | 修改 `package.json` 依赖并 `pnpm install` 后 `build` | 全量重编译（lockfileHash 变更触发） |
| 7 | 删除 `build-cache.json` 后 `build` | 等同首次 = 全量 |
| 8 | `build --force` | 忽略 cache，全量重建 |
| 9 | `build --only=forms/customer,pages/dashboard` | 仅构建指定的 2 个模块 |
| 10 | `build --dry-run` | 打印待构建列表，无副作用，cache 不变 |
| 11 | 单模块构建中途 throw | cache 不更新，下次仍会重建该模块 |
| 12 | `publish-all` 仅发布变更模块 | OSS 上传数量 = 变更数 |

## 6. 注意事项和约束

1. **必须遵守 `.gitignore`**：hash 计算前用 `ignore` 包加载 gitignore；额外硬编码忽略 `node_modules` / `dist` / `.openxiangda` / `.git`。
2. **文件排序**：聚合 hash 前必须对文件相对路径 `sort()`，并统一使用 POSIX 分隔符，否则 Windows / macOS 结果不一致。
3. **build-cache.json 必须加入 `.gitignore`**：每个开发环境独立，不入库。Phase 5 同步修改模板。
4. **失败原子性**：模块构建失败时 **不要** 更新对应 entry，避免出现「cache 记录成功但产物不存在」的脏状态。建议先构建到临时目录、成功后再 rename。
5. **schema 演进**：在 cache 顶层加 `version: 1`；未来字段变更时升级版本号，旧 cache 直接丢弃。
6. **多入口 vs 单入口**：Vite 多入口构建效率显著高于循环单入口；优先方案 2，避免性能回退。
7. **CI 场景**：CI 通常是干净 workspace，cache 默认不存在 → 自然走全量。如果希望 CI 也享受增量，可把 cache 持久化到 CI artifacts 中（文档中提示即可，不强制实现）。
8. **monorepo 兼容**：若用户在 pnpm workspace 内执行，`projectRoot` 应取最近的 `package.json` 所在目录而非 git root。
9. **日志一致性**：所有输出统一使用 `✔` / `✖` / `⚠` 前缀，便于 grep。
10. **与 Phase 3 协同**：增量逻辑落在 `src/build/incremental/`，与 Phase 3 合并包后的目录结构一致，无需迁移。
11. **与 Phase 5 协同**：模板 `.gitignore` 中必须包含 `.openxiangda/build-cache.json`，由 Phase 5 落地。
