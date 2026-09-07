# Phase 6: React SPA App Runtime

## 1. Summary

OpenXiangda 新应用应从“低代码平台里的单页面脚本上传模式”升级为“标准 React SPA 应用工程”。平台继续提供鉴权、权限、表单、流程、数据、文件、审计、托管等能力，但不再作为新应用的前端页面组织者。

目标形态：

- 旧应用继续走 `sy-lowcode-view`，默认不受影响。
- 新应用按 `appType` 命中 `react-spa` runtime 后，进入应用自己的 React SPA。
- React SPA 自己管理路由、布局、菜单、页面组织和用户端/后台端结构。
- OpenXiangda SDK 提供平台能力、默认模板、类型生成、本地调试和发布工具。
- 平台私有前端概念逐步收敛，不再把 `isRenderNav`、旧 workbench 判断链、页面配置式导航等模型暴露给新应用。

最终产品心智：

> OpenXiangda 是一个带低代码平台能力的标准 React 应用工程框架，而不是把 React 页面塞进旧 view 框架的工具。

## 2. Background

当前 OpenXiangda 已具备：

- 单包 SDK：`openxiangda`
- 工作区模板：`templates/sy-lowcode-app-workspace`
- 本地 Vite dev host 和 `/service` 同域代理
- HttpOnly Cookie rewrite 本地调试链路
- 后端 runtime route resolver
- 内置默认页：表单提交、流程提交、表单详情、流程详情、数据管理列表、文件预览
- `src/runtime/builtin-overrides.tsx` 默认页整页覆盖能力
- AI/Playwright 一次性验证登录链路和测试账号链路

这些能力已经能让新页面不进入旧 `sy-lowcode-view` workbench 判断链。但现有轻量 runtime 仍偏向“平台帮应用识别当前路径，然后渲染某个默认页或自定义页”。这比旧 view 清晰，但还不是标准 React 应用工程。

下一阶段应把控制权进一步交还给应用：

- 平台只判断当前 `appType` 应该返回哪个前端入口。
- 新应用拿到自己的 `index.html` 后，由应用内部 React Router 接管。
- SDK 默认页从“平台 runtime 的分支渲染”变成“应用可直接引用的普通 React 组件”。

## 3. Design Principles

### 3.1 Standard First

优先采用 React/Vite/React Router/TanStack Query 等前端标准范式。OpenXiangda 只在平台能力接入处提供适配，不重新发明路由、布局、数据缓存和页面组织模型。

### 3.2 App Owns Frontend Structure

新应用自己决定：

- 是否有后台管理端
- 是否有用户端门户
- 是否有公开访问页
- 顶部栏、侧边栏、面包屑、移动端 tab 如何呈现
- 每个路由使用默认模板还是自定义页面

平台不再通过页面参数决定前端是否渲染导航，例如 `isRenderNav` 这类参数不进入新 runtime。

### 3.3 Platform Remains Authoritative

前端应用可以决定展示方式，但不能决定安全边界：

- 登录态以后端 Cookie 为准
- 页面权限以后端接口为准
- 表单权限、字段权限、数据范围、流程审批权限以后端接口为准
- AI 验证通过真实用户身份进入，不提供绕权模式

### 3.4 Compatibility By Default

所有既有应用默认 `runtimeMode = legacy`，继续走旧 `sy-lowcode-view`。只有新建应用或显式迁移的应用才走 `runtimeMode = react-spa`。

### 3.5 Progressive Migration

不要求一次性替换所有能力。Phase 6 可以先让新应用拥有标准 SPA 入口，再逐步把默认后台框架、用户端模板、类型生成、发布流程、权限组件等能力补齐。

## 4. Target Architecture

### 4.1 High Level Flow

```txt
Browser
  |
  | GET /view/:appType/*
  v
Platform Runtime Gateway
  |
  | parse appType
  | load runtimeMode from cache / DB
  |
  +-- runtimeMode = legacy -----> old sy-lowcode-view index.html
  |
  +-- runtimeMode = react-spa --> app active release index.html
                                      |
                                      v
                              React SPA owns routing
                                      |
                                      v
                              OpenXiangda SDK calls /service/*
```

### 4.2 Responsibility Boundary

| Layer | Responsibility |
| --- | --- |
| Platform Gateway | `/view/:appType/*` 分流，返回旧 view 或新 SPA 的 `index.html` |
| Platform Backend | 鉴权、权限、表单、流程、数据、文件、审计、发布记录、测试账号、验证登录 |
| Static Hosting / CDN | 托管新应用 `dist/` 资源，支持版本化和回滚 |
| OpenXiangda SDK | Provider、hooks、API client、默认模板、权限组件、类型定义、开发代理 |
| OpenXiangda CLI | 初始化、类型生成、构建、发布、版本切换、技能刷新 |
| React App | 路由、布局、页面组合、菜单展示、业务交互、默认模板 override |

### 4.3 Runtime Modes

建议应用表或应用扩展配置增加：

```ts
type AppRuntimeMode = "legacy" | "react-spa";
```

默认值：

- 老应用：`legacy`
- 新 OpenXiangda 创建的应用：`react-spa`
- 不确定或缺失：`legacy`

可选扩展字段：

```ts
interface AppRuntimeSettings {
  runtimeMode: "legacy" | "react-spa";
  activeReleaseId?: string;
  activeBuildId?: string;
  indexUrl?: string;
  assetBaseUrl?: string;
  allowedDevOrigins?: string[];
  updatedAt: string;
}
```

## 5. Backend Gateway Design

### 5.1 URL Scope

Gateway 只处理文档入口：

```txt
/view/:appType/*
/view/submit/:appType/*
/view/file-preview*
```

静态资源不要全部经过业务后端转发。新 SPA 的 JS/CSS/assets 应走 CDN 或静态服务，使用版本化路径。

### 5.2 AppType Extraction

需要兼容历史路径：

```txt
/view/:appType/workbench/:pageKey
/view/:appType/admin/*
/view/:appType/portal/*
/view/:appType/forms/*
/view/:appType/data/*
/view/submit/:appType/:formUuid
/view/:appType/formDetail/:formUuid
/view/:appType/processDetail/:formUuid
/view/:appType/data-manage-list/:formUuid
/view/:appType/file-preview?ticket=...
/view/file-preview?ticket=...
```

抽取规则应集中在一个服务里，例如：

```ts
resolveAppTypeFromViewPath(pathname: string): string | null
```

不要在多个 controller / middleware 中复制路径解析逻辑。

文件预览有两类 URL，不要混用：

- 页面入口：`/view/:appType/file-preview?ticket=...`，推荐给用户打开。
- 文件流：`/service/file/preview-by-ticket/:ticket`，仅供预览页内部 iframe、PDF、图片或视频组件加载。

全局兼容入口 `/view/file-preview?ticket=...` 只有在后端能从 `?appType=`、ticket payload 或 `FILE_PREVIEW_APP_TYPE` 推导 appType 时，才会被 React SPA runtime 接管；否则继续 legacy fallback。优先级是 URL query 的 `appType`、`POST /file/access-ticket` 写入 ticket payload 的 `appType`、服务端配置 `FILE_PREVIEW_APP_TYPE`。

`FILE_PREVIEW_PAGE_PATH` 支持 `:appType` 占位符，推荐默认值为 `/view/:appType/file-preview`。如果请求 `/view/file-preview?ticket=...` 的响应头仍是 `X-OpenXiangda-Runtime-Mode: legacy`，依次检查 ticket 是否含 appType、URL 是否带 `appType`、目标应用是否已部署并激活 React SPA runtime、以及是否配置了 `FILE_PREVIEW_APP_TYPE`。

平台预览能力由 `POST /service/file/preview-capabilities` 和 ticket metadata 统一判定。表单上下文使用 `AttachmentField` 和 `ImageField`；普通自定义 React SPA 页面使用 `AttachmentPreviewList`、`ImagePreviewGrid`，自定义卡片或表格操作使用 `useFilePreview`。这些公开 API 都只为 `canPreview: true` 的文件显示或执行预览，不要在应用页自行维护扩展名白名单，也不要为只读文件伪造 `FormProvider`。图片使用同组弹窗画廊，视频、音频和文档使用站内弹窗，不需要打开新页面。独立预览页仍用于复制链接、外部打开和历史链接兼容。

```tsx
import {
  AttachmentPreviewList,
  ImagePreviewGrid,
  useFilePreview,
} from "openxiangda/runtime/react"

<AttachmentPreviewList items={record.attachments || []} />
<ImagePreviewGrid items={record.photos || []} />
```

`useFilePreview({ items })` 返回 `canPreview`、`open`、`download` 和必须渲染一次的 `host`，用于应用自定义展示结构。它从 `usePageSdk()` 取得当前应用上下文，并通过 PageSdk 的受控 transport 读取 ticket metadata 和二进制内容；应用代码不要直接引用内部 `FilePreviewContent` 或 `useFilePreviewController`。

自定义编辑页确需把 `AttachmentField`、`ImageField` 等平台字段放进 `FormProvider` 时，必须使用 SDK 提供的 PageSdk 适配器：

```tsx
import { AttachmentField, FormProvider } from "openxiangda"
import { usePageFormRuntimeApi } from "openxiangda/runtime/react"

const api = usePageFormRuntimeApi()
const config = useMemo(() => ({
  api,
  appType,
  formUuid: "training_lesson",
  mode: "edit" as const,
}), [api, appType])

<FormProvider config={config} schema={schema} initialValues={values}>
  <AttachmentField fieldId="materials" label="课时资料" />
</FormProvider>
```

非 Hook 场景使用 `createPageFormRuntimeApi(sdk)`。这两个 API 会把普通请求交给 `sdk.transport.request`，把 `responseType: "blob"` 的请求交给 `sdk.transport.download`，统一接入上传、下载 ticket 与文件访问 ticket，并按当前 PageSdk `servicePrefix` 将 ticket 中的 `/file/*` 内容地址归一化为 `/service/file/*`。`previewPageUrl` 等 `/view/*` 页面地址和绝对 OSS URL 不会改写。应用不得手写 `api.request: config => sdk.request(...)`，也不要自行拼接 `/service`；PageSdk 的 JSON 请求通道不能替代 Blob 下载通道。

默认预览矩阵：

- 浏览器原生：JPG/JPEG/PNG/GIF/BMP/WebP/SVG/AVIF/ICO、MP4/WebM/OGG/MOV/M4V、MP3/WAV/OGG/M4A/AAC/FLAC。
- 平台与浏览器解析器：PDF、TIFF、HEIC/HEIF、DOCX、XLSX、CSV/TSV、常见文本和代码文件。
- 可选 ONLYOFFICE：DOC/DOCM/DOT、XLS/XLSM/XLSB、PPT/PPTX/PPS/POT、ODT/ODS/ODP 等 Office 和 OpenDocument 格式。

开源选型保持分层而不是引入一个重型统一服务：PDF 使用 [PDF.js](https://github.com/mozilla/pdf.js)（旧 view 独立页）或浏览器内联渲染；DOCX 使用 [docx-preview](https://github.com/VolodymyrBaydalka/docxjs)；平台 XLSX 使用 ExcelJS 限量解析，直连存储 XLSX 使用 [SheetJS CE](https://docs.sheetjs.com/)；TIFF 由服务端 Sharp 转 WebP，HEIC/HEIF 由浏览器 heic2any 转换；高保真 Office 格式使用可选 [ONLYOFFICE Docs](https://api.onlyoffice.com/docs/docs-api/get-started/how-it-works/)。没有默认引入 kkFileView，因为它会额外增加 JVM/LibreOffice 服务、文件回源和运维边界；如部署方已有该服务，可在应用覆盖页中作为自定义 provider 接入。

资源上限由 `FILE_PREVIEW_EXCEL_MAX_BYTES`、`FILE_PREVIEW_EXCEL_MAX_ROWS`、`FILE_PREVIEW_EXCEL_MAX_COLUMNS`、`FILE_PREVIEW_TEXT_MAX_BYTES`、`FILE_PREVIEW_DOCX_MAX_BYTES` 和 `FILE_PREVIEW_IMAGE_MAX_BYTES` 控制。配置 `ONLYOFFICE_DOCUMENT_SERVER_URL` 后启用高保真 Office 预览；同时配置的 `ONLYOFFICE_JWT_SECRET` 必须与 Document Server 一致，且 Document Server 必须能回源访问平台的 ticket 文件流。标准 nginx 部署应把 `FILE_PUBLIC_BASE_URL` 设置为外部 `/service` 基址，例如 `https://lowcode.example.com/service`。

DOCX 原始字节应以 ZIP 魔数 `PK`（十六进制 `50 4b 03 04`）开头。Chrome DevTools 的 Response 面板可能把二进制响应表示成 `UEsDB...`，因此不能只凭面板文本认定服务端返回了 Base64；应通过 `response.arrayBuffer()`、下载文件或服务端探针检查真实前四字节。只有真实字节本身是 ASCII `UEsDB` 时，才属于历史 Base64 包装对象，平台服务端与 SDK 会在严格 ZIP 校验后兼容解码。若真实字节已经是 `PK` 但组件仍提示“文件内容响应不是二进制数据”，优先检查自定义 `FormProvider` 是否使用了 `usePageFormRuntimeApi()`，而不是把 Blob 请求错误转给 `sdk.request()`。

### 5.3 Cache Strategy

分流性能可以忽略不计，但要避免每次访问都查数据库。

建议：

- 本地内存 LRU：5 到 15 分钟
- Redis：30 分钟到 2 小时
- 发布、应用设置变更、runtimeMode 切换时主动失效
- 查询失败时默认 legacy，避免误伤老应用

缓存内容：

```ts
interface RuntimeRouteCacheEntry {
  appType: string;
  runtimeMode: "legacy" | "react-spa";
  activeReleaseId?: string;
  indexUrl?: string;
  assetBaseUrl?: string;
  updatedAt: string;
}
```

### 5.4 Response Strategy

推荐后端直接返回对应 `index.html` 内容，或使用内部静态映射，不对浏览器做多次 302 跳转。

缓存头建议：

- `index.html`：短缓存或 no-cache，确保发布切换生效
- JS/CSS/assets：文件名带 hash，`Cache-Control: public, max-age=31536000, immutable`

### 5.5 Rollback

每个应用必须支持快速回滚：

- 切回上一条 SPA release
- 或把 `runtimeMode` 临时切回 `legacy`
- 分流缓存主动失效
- 记录操作者、时间、原因

## 6. React SPA Application Model

### 6.1 Default Project Structure

新模板建议从当前 `sy-lowcode-app-workspace` 演进为标准 SPA 结构：

```txt
src/
  main.tsx
  App.tsx
  app/
    provider.tsx
    router.tsx
    routes.tsx
  layouts/
    AdminShell.tsx
    UserShell.tsx
    PublicShell.tsx
  pages/
    admin/
    portal/
    public/
    errors/
  forms/
    README.md
  workflows/
  resources/
    menus/
    roles/
    permissions/
    data-views/
    workflows/
  generated/
    forms.gen.ts
    routes.gen.ts
    permissions.gen.ts
    resources.gen.ts
  runtime/
    sdk.ts
    auth.ts
    permission.ts
    dev.ts
  styles/
    index.css
  tests/
    e2e/
```

### 6.2 Router

应用内部使用标准路由工具。

默认推荐：

- 第一阶段：`react-router`
- 后续可提供 `tanstack-router` 模板

示例：

```tsx
createBrowserRouter(
  [
    {
      path: "/view/:appType",
      element: <UserShell />,
      children: [
        { index: true, element: <PortalHomePage /> },
        { path: "forms/:formUuid/new", element: <StandardFormPage /> },
        { path: "forms/:formUuid/:formInstId", element: <FormDetailPage /> },
        { path: "process/:formUuid/:formInstId", element: <ProcessDetailPage /> },
        { path: "data/:formUuid", element: <DataManagementList /> },
      ],
    },
    {
      path: "/view/:appType/admin",
      element: <AdminShell />,
      children: [
        { index: true, element: <AdminDashboard /> },
      ],
    },
    {
      path: "/view/:appType/public",
      element: <PublicShell />,
      children: [
        { path: "*", element: <PublicRouteRenderer /> },
      ],
    },
  ],
  { basename: "/" },
)
```

### 6.3 Layouts

默认提供三类 shell。

#### AdminShell

适合后台管理：

- 左侧菜单
- 顶部用户信息
- 面包屑
- 内容区
- 权限过滤菜单
- 统一 403 / 404 / loading / error

#### UserShell

适合用户端：

- 顶部导航或轻侧边导航
- 入口卡片
- 我的提交 / 我的审批 / 常用申请
- 移动端适配

#### PublicShell

适合公开页面：

- 无登录或轻登录
- 不默认加载组织菜单
- 明确公开访问状态
- 独立错误页和过期页

### 6.4 OpenXiangdaProvider And Page SDK Context

SDK 提供标准 Provider：

```tsx
import {
  OpenXiangdaPageProvider,
  OpenXiangdaProvider,
} from "openxiangda/runtime/react"

<OpenXiangdaProvider
  appType={appType}
  servicePrefix="/service"
>
  <OpenXiangdaPageProvider>
    <RouterProvider router={router} />
  </OpenXiangdaPageProvider>
</OpenXiangdaProvider>
```

`OpenXiangdaProvider` 负责：

- API client
- 当前用户
- 当前应用信息
- 菜单权限
- 表单权限摘要
- 登录状态
- 统一错误处理
- 本地 dev host 适配
- Playwright 验证登录后的会话刷新

`OpenXiangdaPageProvider` 负责把 runtime/bootstrap 转成 Page SDK 上下文。任何会调用 `usePageSdk()`、`usePageContext()`、`useDataSource()`、`useFormViewPermissions()` 的 React SPA 页面，都必须渲染在 `OpenXiangdaPageProvider` 内。缺少这层时页面会抛出 `usePageSdkStore 必须在 PageProvider 内使用`。公开页面同样需要这层 provider；`PublicAccessGate` 只创建 scoped public session，不替代 Page SDK provider。

### 6.5 SDK Hooks

建议提供：

```ts
useOpenXiangda()
useCurrentUser()
useAppInfo()
useAppMenus()
usePermission()
useFormSchema(formUuid)
useFormData(formUuid, formInstId)
useWorkflow(formUuid, formInstId)
useDataView(code, params)
useConnector(name)
useFilePreview({ items })
```

`useFilePreview({ items })` 已由 `openxiangda/runtime/react` 提供，并把 capability、ticket、metadata、二进制响应归一和登录态处理封装在 SDK 内。其余数据 hooks 可以基于 `@tanstack/react-query`，但同样要把 query key、错误归一和登录态失效处理封装在 SDK 内。

## 7. Default Pages And Templates

### 7.1 Built-In Components

现有默认页继续保留，但定位调整为 SDK 组件：

```tsx
import {
  StandardFormPage,
  FormDetailTemplate,
  ProcessDetailTemplate,
  DataManagementList,
} from "openxiangda"
```

它们不再要求平台 runtime 外部分支决定渲染，而是由应用路由直接引用。

### 7.2 Override Model

保留整页 override，但优先靠 React 路由表达：

```tsx
{
  path: "forms/customer/new",
  element: <CustomerSubmitPage />,
}
```

对仍想集中配置的应用，可以提供：

```ts
export const builtinRouteOverrides = {
  "form-submit": {
    "*": SubmitShell,
    customer: CustomerSubmitPage,
  },
}
```

但它只是应用内部工具，不是平台运行协议。

### 7.3 Template Configuration

轻量差异通过组件 props 或 SDK config 管理：

```tsx
<StandardFormPage
  formUuid="customer"
  title="客户登记"
  submitSuccessAction="detail"
  enableDraft
/>
```

不要再通过平台页面参数控制前端布局。

## 8. Admin And User Mode Starters

### 8.1 Starter List

OpenXiangda CLI 初始化时提供模板选项：

```txt
blank
admin-basic
admin-pro
portal
admin-portal
public-site
```

建议默认使用 `admin-portal`：

- `/admin/*`：后台管理
- `/portal/*`：用户端
- `/public/*`：公开页
- `/forms/*`：表单相关默认页
- `/process/*`：流程相关默认页
- `/data/*`：数据列表

### 8.2 Admin Basic

最小后台：

- Ant Design Layout
- 菜单来自 `useAppMenus()`
- 基础 dashboard
- 表单列表入口
- 权限边界

### 8.3 Admin Pro

完整后台：

- 菜单搜索
- 面包屑
- tab / keep alive 可选
- 通用列表页
- 通用详情页
- 操作审计入口
- 组织/角色/权限辅助组件

### 8.4 Portal

用户端：

- 首页入口卡片
- 我的提交
- 我的审批
- 常用申请
- 消息提醒
- 移动端响应式

### 8.5 Blank

完全空白：

- 只装 Provider 和 SDK
- 适合重设计或特殊项目

### 8.6 UI Direction For Starters

React SPA 模板不能只提供技术骨架，还需要提供可直接交付的默认 UI。默认后台风格建议采用现代简洁、macOS 风格的工作台界面：

- 安静、轻量、克制，不做厚重低代码平台感。
- 以内容和操作效率为核心，避免营销式大卡片和过度装饰。
- 背景使用浅灰或柔和中性色，主体区域清晰分层。
- 卡片半径保持克制，默认 8px 左右。
- 使用清晰的工具栏、筛选区、表格、详情抽屉、表单分组。
- 菜单图标使用标准图标库，不手绘私有 SVG。
- 管理后台优先桌面效率，用户端兼顾移动端。
- 样式表达优先使用 Tailwind CSS，不依赖平台统一 theme tokens。

样式策略：

- 平台不再默认提供全局 theme tokens，避免业务页面硬绑定平台变量导致视觉异常。
- 新模板以 Tailwind CSS 作为主要样式表达方式。
- 应用级主题差异通过 `tailwind.config`、局部 CSS class 或应用自己的 CSS 变量处理。
- OpenXiangda SDK 组件只提供稳定基础样式和必要 className / slot 覆盖点。
- 后台框架可以提供默认 Tailwind preset，但该 preset 应轻量、可替换，不应成为平台强约束。
- 不要求所有应用长得完全一样；要求默认模板有清晰、一致、可维护的视觉基础。

第一批需要设计稿的页面：

| Template | Screen | Purpose |
| --- | --- | --- |
| `admin-basic` | Admin dashboard | 应用后台首页，展示关键入口、待办、数据概览 |
| `admin-basic` | Admin list page | 标准列表、筛选、批量操作、分页 |
| `admin-basic` | Admin form page | 标准新建/编辑表单容器 |
| `admin-basic` | Admin detail drawer/page | 标准详情、操作区、变更记录 |
| `admin-pro` | Dense data workspace | 高密度后台，适合运营和审批管理 |
| `portal` | User portal home | 用户端首页、常用申请、我的待办 |
| `portal` | Mobile user portal | 移动端用户入口 |
| `public-site` | Public form landing | 公开表单/公开查询页 |
| shared | 401 / 403 / 404 / unpublished | 统一错误和无权限状态 |
| shared | Verification login success/failure | AI 验证登录和 ticket 失败状态 |

这些设计稿应在实现模板前完成，并作为模板验收依据。

### 8.7 Product Design Workflow

UI 设计稿走 Product Design 流程，不直接从文字进入代码实现。

流程：

```txt
confirm design brief
generate exactly 3 visual directions
choose one direction
turn chosen direction into starter UI spec
implement starter
compare implementation screenshot with selected mock
iterate until visually aligned
```

本轮设计 brief 草案：

- Product: OpenXiangda React SPA starter templates.
- Screens: admin dashboard, admin list/detail/form, user portal, public page, error states.
- Visual direction: modern clean / macOS-like productivity UI.
- Interaction level for first mockups: static visual concepts with realistic states and data.
- Implementation target after selection: React + Ant Design + OpenXiangda SDK, responsive desktop-first with mobile portal coverage.

当前已选第一套 starter 视觉基准：`mac-admin`。

设计基准文件：

```txt
docs/design/phase6/
  mac-admin-01-runtime-workspace.png
  mac-admin-02-data-list-drawer.png
  mac-admin-03-form-workflow.png
  mac-admin-04-user-portal.png
  mac-admin-05-public-states.png
  selected-direction.md
```

`mac-admin` 作为 Phase 6 第一套默认 starter 的实现依据。后续仍可以扩展 `compact-ops`、`portal-hybrid` 等其他 starter preset，但不能影响 `mac-admin` 的稳定基准。

### 8.8 mac-admin Starter Visual Baseline

`mac-admin` 是 Phase 6 的第一套默认视觉基准。它基于现代 macOS productivity UI：浅色中性背景、白色内容面、清晰边框、克制阴影、蓝/绿/橙状态点缀，以及可分组折叠的左侧菜单。

参考文件：

| Screen | Reference | Purpose |
| --- | --- | --- |
| Runtime Workspace | [mac-admin-01-runtime-workspace.png](design/phase6/mac-admin-01-runtime-workspace.png) | 后台首页、运行时状态、折叠菜单、SDK 状态 |
| Data List Drawer | [mac-admin-02-data-list-drawer.png](design/phase6/mac-admin-02-data-list-drawer.png) | 数据管理、筛选、表格、详情抽屉 |
| Form Workflow | [mac-admin-03-form-workflow.png](design/phase6/mac-admin-03-form-workflow.png) | 表单提交、流程预览、字段权限提示 |
| User Portal | [mac-admin-04-user-portal.png](design/phase6/mac-admin-04-user-portal.png) | 用户门户、常用入口、待办、移动端预览 |
| Public States | [mac-admin-05-public-states.png](design/phase6/mac-admin-05-public-states.png) | 公开页、错误页、未发布、验证登录状态 |
| Design Spec | [selected-direction.md](design/phase6/selected-direction.md) | 视觉原则、菜单规则、页面基准、验收标准 |

视觉原则：

- 保持干净、专业、轻量，不回到旧低代码平台视觉。
- 允许少量色彩点缀，但色彩服务于状态、分组和操作优先级。
- 默认使用 Tailwind CSS，不提供平台全局 theme tokens。
- 面板和卡片默认半径不超过 8px。
- 主要使用边框、留白、分组建立层级，阴影只用于抽屉、浮层等必要场景。
- 后台页面强调可扫描、可操作；用户端门户强调入口清晰和移动端可适配。

菜单基准：

- 左侧菜单必须支持分组折叠。
- 分组标题带 chevron，支持展开/收起状态。
- 当前菜单使用轻色背景和左侧蓝色 active rail。
- 菜单图标使用标准线性图标库。
- 文案过长时省略，不撑开布局。
- 桌面默认展开，窄屏支持收起或切换到移动导航。

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

实现验收：

- `AdminShell`、`UserShell`、`PublicShell` 都应继承 `mac-admin` 的结构语言。
- 表格、筛选、抽屉、表单、流程、公开页、状态页都要有统一视觉基础。
- 401 / 403 / 404 / unpublished / verification ticket failure 必须有清晰状态。
- 实现后用 Playwright 在桌面和移动断点截图，与参考图进行视觉对照。

## 9. Deployment Model

### 9.1 User Mental Model

用户只需要理解：

```bash
pnpm dev
pnpm build
openxiangda deploy --profile example
```

或者：

```bash
openxiangda workspace publish --profile example
```

内部可以继续复用 workspace publish 能力，但对新 SPA 应用建议逐步引入更直观的 `deploy` 命令。

### 9.2 Build Output

标准 Vite `dist/`：

```txt
dist/
  index.html
  assets/
    index.[hash].js
    index.[hash].css
    ...
```

发布记录保存：

- appType
- buildId
- version
- index object key / URL
- asset base URL
- commit hash
- package version
- build time
- operator

### 9.3 Manifest Role

不把 `app manifest` 作为用户心智核心。

内部仍需要最小发布元信息：

- 记录 active release
- 做资源回滚
- 做资产清理
- 做审计

这可以是平台发布记录，不必暴露成复杂 manifest 文件。

### 9.4 Resource Publishing

React SPA 代码发布和平台资源发布要分层：

- `openxiangda deploy`：发布前端 dist
- `openxiangda resource publish`：发布菜单、权限、表单设置、流程、数据视图等
- `openxiangda publish` 或 `workspace publish`：组合命令，按计划执行两者

组合发布顺序：

```txt
validate resources
typegen
build React SPA
upload dist
register release
publish resources
activate release
invalidate runtime cache
smoke check
```

## 10. Type Generation

### 10.1 Generated Files

生成文件放在：

```txt
src/generated/
  forms.gen.ts
  workflows.gen.ts
  menus.gen.ts
  permissions.gen.ts
  data-views.gen.ts
  app.gen.ts
```

### 10.2 Example

```ts
export const forms = {
  customer: {
    code: "customer",
    formUuid: "FORM_xxx",
    fields: {
      name: "textField_xxx",
      phone: "textField_yyy",
    },
  },
} as const
```

AI 写代码时可以使用：

```ts
forms.customer.fields.name
```

而不是猜字段 ID。

### 10.3 Generation Timing

建议命令：

```bash
openxiangda typegen --profile example
openxiangda typegen --watch
```

发布前必须校验 generated 文件和平台资源状态一致。

## 11. Local Development

### 11.1 Dev Server

继续使用 Vite：

```env
OPENXIANGDA_BASE_URL=https://platform.example.com
OPENXIANGDA_APP_TYPE=APP_XXXX
APP_SERVICE_PREFIX=/service
```

Vite 代理：

- `/service/*` -> `OPENXIANGDA_BASE_URL/service/*`
- `changeOrigin: true`
- `cookieDomainRewrite: ""`
- `cookiePathRewrite: "/"`

### 11.2 Local URL

```txt
http://127.0.0.1:5174/view/:appType/*
```

本地 dev server 应和生产入口路径一致，让 React Router、Cookie、SDK 请求都在同一套路径下验证。

### 11.3 AI Verification

Playwright 流程：

```txt
create verification login link
page.goto(loginUrl)
backend writes cookies through local proxy
redirect to local /view/:appType/*
test real UI with real user permissions
```

测试账号仍使用：

```txt
__ox_ai_test__:<appType>:<key>
```

## 12. Permission And Security

### 12.1 Frontend Permission

前端权限只用于体验：

- 菜单过滤
- 按钮隐藏
- 无权限状态
- 字段只读展示

不作为安全边界。

### 12.2 Backend Permission

后端必须继续兜底：

- 页面访问
- 表单提交
- 表单详情
- 字段可见性
- 数据范围
- 流程审批动作
- 文件预览
- 连接器调用

### 12.3 Public Access

公开访问不复用旧 view 参数模型。旧 `?publicAccess=guest` 仅用于 `sy-lowcode-view` 兼容，新 React SPA 应用禁止继续采用。

新链路固定为：

```txt
/view/:appType/public/*
```

由应用 `PublicShell` 或普通 React Router route 处理展示。进入公开页时，应用通过 `PublicAccessGate` / `createPublicAccessClient` 调用：

```txt
POST /openxiangda-api/v1/apps/:appType/public/session
```

请求体以真实后端 DTO 为准：

```ts
interface PublicAccessSessionInput {
  policyCode?: string;
  routeCode?: string;
  path?: string;
  ticket?: string;
  guestIdentifier?: string;
  domain?: string;
  ipAddress?: string;
  userAgent?: string;
}
```

后端签发 guest/public token，token 中包含 scoped `publicAccess` claim。公开 guest 对 form、dataView、function、connector 的默认权限是拒绝；只有 policy grant 明确列出的资源可访问，并且仍受表单权限组、dataView 权限组等后端权限控制。敏感公开入口使用 `mode: "ticket"`。

public session 返回 scoped bearer token。React SDK 会把 token 注入后续 runtime/bootstrap、dataView、function、connector 请求；新公开访问不要依赖认证 cookie，也不要回退到旧 `?publicAccess=guest`。

公开访问验证必须同时检查 HTTP 状态和 JSON envelope。平台运行时接口可能返回 HTTP 200 但 `code: "PUBLIC_GRANT_DENIED"`；这代表拒绝访问。测试脚本和自定义 fetch wrapper 只能把 `code === 200`、`code === "200"` 或兼容成功码 `0` 视为成功，并且必须把 `success: false` 当失败。

### 12.4 Phase 6.1 Menu And Page Permission Scope

第一期需要保留旧平台里“自动安装角色、自动隐藏菜单、自动控制页面访问”的产品能力，但不能把旧 `sy-lowcode-view` 的前端判断链搬进 React SPA。

推荐第一期目标：

- OpenXiangda workspace 继续声明角色、菜单、页面权限组。
- 发布时自动同步角色、菜单、页面权限组到平台。
- 后端按当前用户和角色返回已过滤菜单树。
- 后端返回当前用户可访问的 route permission map。
- React SPA 只消费后端结果渲染菜单和无权限状态。
- 直接输入 URL 访问页面时，后端仍能判断 route 权限。
- 表单权限、字段权限、数据范围、审批动作继续走现有表单/流程权限组。

第一期不做：

- 不把角色判断硬编码在 React 页面里。
- 不让前端拿完整菜单后自行过滤。
- 不把字段权限、数据范围合并进页面权限组。
- 不要求旧应用迁移到新的 route/menu 权限模型。

### 12.5 SPA Resource Model

React SPA 需要把“菜单”和“路由权限对象”拆开。

菜单用于导航展示：

```ts
interface AppMenuResource {
  code: string;
  title: string;
  icon?: string;
  path?: string;
  parentCode?: string;
  sort?: number;
  hidden?: boolean;
  collapsible?: boolean;
  routeCode?: string;
}
```

路由用于访问控制：

```ts
interface AppRouteResource {
  code: string;
  pathPattern: string;
  title?: string;
  kind:
    | "admin"
    | "portal"
    | "public"
    | "form-submit"
    | "process-submit"
    | "form-detail"
    | "process-detail"
    | "data-manage-list"
    | "file-preview"
    | "custom";
  menuCode?: string;
  publicAccess?: "none" | "guest" | "ticket";
  publicPolicyCode?: string;
}
```

文件预览默认页固定为 `/view/:appType/file-preview?ticket=...`。表单页优先使用 `AttachmentField` / `ImageField`；自定义 React SPA 页面优先使用 `AttachmentPreviewList` / `ImagePreviewGrid` / `useFilePreview` 在当前页面内预览。只有需要复制链接、分享或新窗口打开时，才通过 React SPA PageSdk（`usePageSdk()` 返回的 `sdk`）调用 `sdk.createFileAccessTicket(bucketName, objectName, fileName, "preview", { appType })`，并直接打开返回的 `previewPageUrl`。不要把 `/service/file/preview-by-ticket/:ticket` 当作用户入口。`previewPageUrl` 是可直接打开的页面链接；`previewUrl` 是文件内容流链接，仅供预览组件内部使用。

`useFilePreview` 适合自定义当前页面里的附件展示交互。只有需要替换完整、可分享的独立预览页 UI 时，才在 `src/runtime/default-page-overrides.tsx` 覆盖 `file-preview`。覆盖组件可以替换工具栏和布局，但文件读取仍应走平台 ticket metadata 与 `/service/file/*` 预览接口。

公开策略资源：

```ts
interface AppPublicAccessPolicyResource {
  code: string;
  name?: string;
  enabled?: boolean;
  mode: "guest" | "ticket";
  routeCode?: string;
  pathPattern?: string;
  externalRoleCodes: string[];
  grants: {
    forms?: string[];
    dataViews?: string[];
    functions?: string[];
    connectors?: string[];
  };
  ticketConfig?: {
    ttlSeconds?: number;
    /**
     * Ticket defaults to single-use. Set false only for explicitly reusable links.
     */
    singleUse?: boolean;
    [key: string]: unknown;
  };
  rateLimit?: Record<string, unknown>;
  expiresAt?: string;
}
```

页面权限组绑定稳定 resource code，而不是绑定临时 URL：

```ts
interface AppPagePermissionGroupResource {
  code: string;
  name: string;
  roleCodes: string[];
  menuCodes?: string[];
  routeCodes?: string[];
  pathPatterns?: string[];
}
```

规则：

- `routeCodes` 是第一优先级。
- `menuCodes` 用于控制菜单可见性，也可以推导关联 route。
- `pathPatterns` 只作为兼容或高级场景，不作为主要建模方式。
- 详情页、编辑页、审批页可以没有菜单，但必须有 route resource。
- `public` route 必须有 route resource 和 public access policy；外部角色码来自 policy claim，可以继续用于页面权限组、表单权限组、dataView 权限组。

### 12.6 Workspace File Convention

第一期可以先采用资源文件约定，后续再补可视化配置。

建议结构：

```txt
src/resources/
  roles/
    admin.json
    submitter.json
    viewer.json
  menus/
    admin.json
    portal.json
  routes/
    admin.routes.json
    portal.routes.json
  public-access/
    public-register.json
  permissions/
    page-groups/
      admin.json
      submitter.json
      viewer.json
```

发布顺序：

```txt
roles -> routes -> menus -> page permission groups -> form permission groups
```

原因：

- 权限组引用 `roleCode`、`routeCode`、`menuCode`。
- 菜单可以引用 route。
- route 是页面访问控制的最小稳定对象。

### 12.7 Runtime Bootstrap Contract

React SPA 启动后应通过 SDK 获取运行时上下文：

```http
GET /openxiangda-api/v1/apps/:appType/runtime/bootstrap
```

建议返回：

```ts
interface RuntimeBootstrapResponse {
  app: {
    appType: string;
    name: string;
    runtimeMode: "react-spa";
    releaseId?: string;
  };
  currentUser: {
    userId: string;
    name: string;
    avatar?: string;
  };
  currentRole?: {
    code: string;
    name: string;
  };
  menus: AppMenuResource[];
  routePermissions: {
    allowedRouteCodes: string[];
    deniedRouteCodes?: string[];
    hasFullAccess?: boolean;
  };
}
```

约束：

- `menus` 必须是后端过滤后的树或列表。
- `routePermissions` 只返回当前用户实际命中的权限。
- 前端可以基于该结果做体验层拦截，但不能把它当成安全边界。
- SDK 应缓存 bootstrap，但用户切换角色、权限发布、登录态刷新后必须失效。

### 12.8 Route Guard Contract

前端路由进入时可以通过 SDK 做体验层判断：

```tsx
<PermissionBoundary routeCode="admin.customer.detail">
  <CustomerDetailPage />
</PermissionBoundary>
```

但后端仍需要提供 route 判断能力，用于直链访问、刷新和审计：

```http
POST /openxiangda-api/v1/apps/:appType/runtime/routes/check
```

请求：

```ts
interface CheckRoutePermissionRequest {
  path?: string;
  routeCode?: string;
}
```

返回：

```ts
interface CheckRoutePermissionResponse {
  allowed: boolean;
  routeCode?: string;
  reason?: "anonymous" | "forbidden" | "not_found" | "public_expired";
}
```

第一期可以先让 SDK 基于 bootstrap 本地判断 routeCode；平台在 resolver 和关键 API 上兜底。`routes/check` 可作为 Phase 6.1 的增强接口，或在第一期后半段补齐。

### 12.9 SDK Permission API

SDK 第一期开口：

```ts
useRuntimeBootstrap()
useAppMenus()
useRoutePermission(routeCode)
useCanAccessRoute(routeCode)
PermissionBoundary
```

行为：

- `useAppMenus()` 只返回后端过滤后的菜单。
- `useCanAccessRoute()` 优先用 bootstrap 中的 `allowedRouteCodes`。
- 无权限时渲染统一 `403` 状态。
- 未登录时交给统一登录跳转或 verification login flow。
- 不提供 `hasRole("admin")` 这类鼓励前端硬编码角色的主 API。

### 12.10 Backward Compatibility

平台应保留现有 `menuFormUuids`、旧 page id、旧 workbench page key 的权限模型。

兼容策略：

- 老应用继续按 legacy 模型过滤菜单和页面。
- classic OpenXiangda workspace 继续发布旧页面权限组。
- React SPA 应用新增 `routeCodes`、`menuCodes`、`pathPatterns` 等 additive 字段。
- 平台内部可以把旧字段和新字段统一归一到 `resource target`，但接口必须保持旧字段可用。
- CLI 检测到旧 workspace 时，不自动生成 SPA route/menu 权限资源。

### 12.11 Platform Permission Configuration Tasks

React SPA 模式下，平台不能再只依赖内置菜单树感知应用页面。对平台来说，新应用只有一个 SPA 入口，具体页面、详情页、后台页、用户端页都由应用内部 React Router 管理。

因此用户可见菜单权限需要支持两种资源来源：

| App Type | Permission Resource Source | Platform UI |
| --- | --- | --- |
| legacy / classic | 平台内置菜单树、formUuid、旧 page id、旧 page key | 继续使用现有菜单权限配置 |
| react-spa | OpenXiangda 发布的 `menuCode` / `routeCode` / `pathPattern` manifest | 新增 SPA resource tree 权限配置 |

第一期需要作为任务实现：

- 平台页面权限配置根据 `runtimeMode` 决定展示旧菜单树还是 SPA resource tree。
- React SPA resource tree 来自 OpenXiangda workspace 发布的 routes / menus manifest。
- 权限配置支持按角色勾选 `menuCode` 和 `routeCode`。
- 菜单节点和页面节点分开展示：菜单控制导航可见，route 控制直链访问。
- 支持“勾选菜单时自动带出关联 route”的便捷能力，但详情、编辑、审批等无菜单 route 必须能单独配置。
- manifest 中已删除或改名的 resource target 不能静默丢失权限，应在平台 UI 中显示为 unknown / stale target 并提示处理。
- 平台审计需要记录页面权限组中 route/menu target 的新增、删除和角色变更。
- 旧应用权限配置 UI 和旧接口行为必须保持不变。

建议 SPA 权限配置 UI 形态：

```txt
页面权限组：销售人员
角色：sales

可见菜单
  [x] 客户管理        menuCode=admin.customer
  [x] 我的客户        menuCode=portal.myCustomers

可访问页面
  [x] 客户列表        routeCode=admin.customer.list
  [x] 客户详情        routeCode=admin.customer.detail
  [x] 新增客户        routeCode=admin.customer.create
  [ ] 删除客户        routeCode=admin.customer.delete
```

### 12.12 AI Usage Documentation Tasks

这一系列能力实现后，必须同步写进 OpenXiangda skills 或项目级 agent 指南，否则后续 AI 仍会按旧页面上传和旧菜单权限模型开发。

第一期只记录任务，不立即修改 skill / agent 文件：

- 更新 `openxiangda-app` skill：说明新建应用默认优先 `react-spa`，旧应用必须先识别 workspace generation。
- 更新 `openxiangda-permission-settings` skill：说明 React SPA 权限使用 `routeCode` / `menuCode`，不要再只依赖 `form-codes` / 旧 page code。
- 更新 `openxiangda-page` skill：说明新 SPA 页面应作为标准 React route / component 开发，不走旧单页面脚本上传心智。
- 更新发布相关 skill：说明 `resource publish` 与 `deploy` 的顺序，以及 routes / menus / page permission groups 的发布顺序。
- 更新测试/验证指南：AI 必须用 verification login link 分别以不同真实角色验证菜单树、route 访问和无权限状态。
- 增加项目级 `AGENTS.md` 或等价 agent 指南：约束 AI 使用 React Router、SDK hooks、generated constants、后端权限结果，不在页面里硬编码角色判断。
- 增加迁移指南：classic workspace 不自动升级；旧项目维护时继续用旧发布流程。
- 在模板 README 中写清楚：React SPA 的权限资源来自 `src/resources/routes`、`src/resources/menus`、`src/resources/permissions/page-groups`。

## 13. Legacy Compatibility

### 13.1 Default Legacy

所有未标记应用继续 legacy。

### 13.2 Per-App Switch

切换粒度：

- appType 级别
- 后续可增加灰度用户 / 灰度租户，但不是第一阶段必需

### 13.3 Fallback

如果 `react-spa` 应用没有 active release：

- 管理员可见明确错误
- 普通用户看到可理解的应用未发布状态
- 不自动进入旧 view，避免误导

如果 runtimeMode 读取失败：

- 默认 legacy
- 打日志和审计

### 13.4 Existing OpenXiangda Workspace Compatibility

使用旧版本 OpenXiangda 开发的应用也必须兼容支持，不能因为 Phase 6 引入 React SPA 就要求所有项目立刻迁移。

需要区分三类应用：

| Category | Description | Default Handling |
| --- | --- | --- |
| Platform legacy app | 完全依赖旧 `sy-lowcode-view` 的存量应用 | 固定 `runtimeMode = legacy` |
| OpenXiangda classic workspace | 旧版 OpenXiangda 创建的 workspace，按页面/表单/资源发布，仍可能依赖旧 view 或当前 lightweight runtime | 继续支持 `workspace publish` 和旧访问方式，不自动切换 |
| OpenXiangda React SPA | Phase 6 新模板创建的标准 React SPA 应用 | 使用 `runtimeMode = react-spa` |

兼容策略：

- 旧 workspace 的 `package.json`、`.openxiangda/state.json`、`app-workspace.config.ts` 需要被 CLI 识别为 classic generation。
- `openxiangda update` 不应自动重写旧 workspace 结构。
- `openxiangda workspace publish` 继续支持 classic workspace。
- 新的 `openxiangda deploy` 只作为 React SPA 的主发布命令，不替代旧项目的发布链路。
- 如果旧应用只是日常维护，建议锁定当前可用的 `openxiangda` 版本，不强制升级到 Phase 6 模板。
- 如果旧应用要迁移到 React SPA，必须显式运行迁移命令，并生成迁移报告和回滚方案。
- CLI 在检测到旧 workspace 时，应给出清晰提示：当前项目是 classic workspace，建议继续使用旧发布流程，除非明确执行迁移。

建议增加 workspace generation：

```ts
type OpenXiangdaWorkspaceGeneration =
  | "classic-pages"
  | "lightweight-runtime"
  | "react-spa";
```

该字段可以来自：

- `.openxiangda/workspace.json`
- `openxiangda.config.ts`
- 旧项目缺失字段时由 CLI heuristics 推断

### 13.5 Upgrade Guidance

升级建议按风险分层：

- **只维护旧应用**：不建议升级项目结构；可以继续固定旧版 OpenXiangda 和旧发布命令。
- **旧应用加少量页面**：继续用 classic workspace，除非业务明确需要新的 SPA 框架体验。
- **新建应用**：默认使用 React SPA 模板。
- **旧应用大改版**：新建 React SPA 分支或新 appType 先验证，再切换 runtimeMode。
- **生产迁移**：必须支持一键切回 legacy 或上一条 release。

版本策略：

- Phase 6 初期应保持向后兼容，尽量以 additive 能力发布。
- 如果默认模板、发布命令或运行时行为发生破坏性变化，应考虑 `openxiangda@2.x` 或明确的 migration guide。
- 技能和 README 中要明确：老项目不要盲目升级；AI 代理在旧 workspace 中必须先运行 `openxiangda workspace doctor` 或等价检查。

## 14. Observability

### 14.1 Logs

Gateway 日志：

- appType
- runtimeMode
- releaseId
- cacheHit
- request path
- userId if available
- latency
- fallback reason

### 14.2 Metrics

建议指标：

- legacy / react-spa 命中数量
- cache hit ratio
- index.html response latency
- SPA release 404 数量
- SDK API 401 / 403 / 500 数量
- verification login success / failure

### 14.3 Audit

审计：

- runtimeMode 修改
- release 激活 / 回滚
- dev origin 配置
- verification login link 创建和消费
- test user 创建和过期

## 15. CLI And Workspace Changes

### 15.1 Init

新增：

```bash
openxiangda workspace init ./my-app \
  --profile example \
  --app-name "示例应用" \
  --runtime react-spa \
  --template admin-portal
```

默认：

- 新建应用：`react-spa`
- 绑定旧应用：读取平台 runtimeMode，不擅自切换

### 15.2 Dev

```bash
openxiangda dev --profile example
```

可作为 `pnpm dev` 包装：

- 检查登录态
- 检查 app binding
- 写入 dev env
- 启动 Vite
- 可选创建 verification login link

### 15.3 Deploy

```bash
openxiangda deploy --profile example
openxiangda deploy --profile example --preview
openxiangda deploy --profile example --activate
openxiangda deploy rollback --profile example --to <releaseId>
```

### 15.4 Typegen

```bash
openxiangda typegen --profile example
openxiangda typegen --profile example --watch
```

### 15.5 Migration Commands

```bash
openxiangda runtime status --profile example
openxiangda runtime switch --profile example --mode react-spa
openxiangda runtime switch --profile example --mode legacy
```

Switch 命令必须要求确认，且写审计。

## 16. Platform API Changes

### 16.1 Runtime Settings

```http
GET /openxiangda-api/v1/apps/:appType/runtime/settings
PUT /openxiangda-api/v1/apps/:appType/runtime/settings
```

### 16.2 Releases

```http
GET /openxiangda-api/v1/apps/:appType/runtime/releases
POST /openxiangda-api/v1/apps/:appType/runtime/releases
POST /openxiangda-api/v1/apps/:appType/runtime/releases/:releaseId/activate
POST /openxiangda-api/v1/apps/:appType/runtime/releases/:releaseId/rollback
```

### 16.3 Gateway Internal Service

内部服务：

```ts
resolveRuntimeEntryForViewPath(pathname: string): Promise<RuntimeEntry>
```

返回：

```ts
interface RuntimeEntry {
  appType: string;
  runtimeMode: "legacy" | "react-spa";
  indexHtml?: string;
  indexUrl?: string;
  assetBaseUrl?: string;
  releaseId?: string;
  fallbackReason?: string;
}
```

### 16.4 Existing Route Resolver

`runtime/routes/resolve` 仍保留，但定位变化：

- 作为 SDK 可选能力
- 用于默认模板需要后端识别旧兼容路径时
- 不再是新 SPA 的主路由系统

## 17. Migration Path

### Stage A: Keep Current Lightweight Runtime Stable

继续保留当前 `/view` lightweight runtime 和默认页能力，作为向 SPA 迁移的技术基础。

### Stage B: Add Backend Runtime Gateway

实现 appType 级分流，但先只让测试应用使用 `react-spa`。

### Stage C: Add React SPA Template

新增标准 SPA 模板，不删除旧 workspace 模板。

### Stage D: Deploy First SPA App

用 example 测试应用完整验证：

- admin shell
- portal shell
- 默认表单页
- 默认流程页
- 详情页
- 数据列表
- custom route
- Playwright verification login

### Stage E: Switch New App Creation Default

确认稳定后，新 `openxiangda workspace init --app-name` 默认创建 `react-spa`。

### Stage F: Optional Legacy Migration

给老应用提供迁移工具，但不自动迁移。

## 18. Task List

### Phase 6.1: Architecture And Contracts

- [ ] 定义 `runtimeMode` 数据模型和默认值策略。
- [ ] 定义 appType 从 `/view` 路径抽取规则。
- [ ] 定义 runtime release 表结构或复用现有 page release 表的扩展方式。
- [ ] 定义 Gateway 返回 legacy / react-spa index 的行为。
- [ ] 定义分流缓存策略、缓存键和失效事件。
- [ ] 定义 SPA release 的审计字段。
- [ ] 明确旧 `runtime/routes/resolve` 在 SPA 模式下的保留边界。
- [ ] 定义 SPA menu resource contract：`code`、`title`、`icon`、`path`、`parentCode`、`routeCode`、`sort`、`hidden`。
- [x] 定义 SPA route resource contract：`code`、`pathPattern`、`kind`、`menuCode`、`publicAccess`、`publicPolicyCode`。
- [x] 定义公开访问 policy resource contract：`code`、`mode`、`routeCode/pathPattern`、`externalRoleCodes`、`grants`、`ticketConfig`、`rateLimit`。
- [ ] 定义 SPA page permission group contract：`roleCodes`、`menuCodes`、`routeCodes`、`pathPatterns`。
- [ ] 明确菜单可见性和页面访问权限的关系：菜单隐藏不等于页面无权限，route 权限必须独立存在。
- [x] 明确 public route 通过 `/view/:appType/public/*` + scoped public session + policy grant；旧 `?publicAccess=guest` 只兼容旧 view。
- [ ] 输出平台 API contract 文档。

Acceptance:

- 老应用缺省仍 legacy。
- 新应用可显式标记 react-spa。
- 设计能覆盖 `/view/:appType/*` 和 `/view/submit/:appType/*`。
- route resource 能覆盖有菜单页面和无菜单详情页。
- 旧页面权限字段保持兼容，新 SPA 字段 additive 增加。

### Phase 6.2: Backend Runtime Gateway

- [ ] 新增 `RuntimeGatewayService`。
- [ ] 集中实现 `resolveAppTypeFromViewPath()`。
- [ ] 新增 runtime settings 读写接口。
- [ ] 新增 runtime release 注册和激活接口。
- [ ] 在 `/view` 静态入口处接入 appType 分流。
- [ ] 加内存缓存和 Redis 缓存。
- [ ] runtimeMode / release 激活时主动失效缓存。
- [ ] 增加 gateway 日志和基础指标。
- [ ] 增加回滚能力。
- [ ] 新增或扩展 `runtime/bootstrap`，返回当前用户、当前角色、过滤后菜单和 route permission map。
- [ ] 新增或规划 `runtime/routes/check`，支持按 `routeCode` 或 `path` 判断页面访问权限。
- [ ] 菜单树过滤统一走后端权限结果，禁止返回完整菜单后交给前端自滤。
- [ ] 权限发布、角色变更、菜单变更时失效 bootstrap / menu permission 缓存。

Acceptance:

- `legacy` 应用仍返回旧 view。
- `react-spa` 应用返回应用自己的 index。
- 缓存命中不影响发布切换。
- 未配置或异常时不误伤旧应用。
- React SPA 能一次 bootstrap 得到可渲染菜单和 route 权限。
- 直接访问无菜单的详情路由时仍能被后端判权。

### Phase 6.3: React SPA Template

- [ ] 新增 `templates/openxiangda-react-spa` 或升级现有 workspace 模板为双模式。
- [ ] 引入 React Router。
- [ ] 新增 `OpenXiangdaProvider` 示例。
- [ ] 新增 `AdminShell`。
- [ ] 新增 `UserShell`。
- [ ] 新增 `PublicShell`。
- [ ] 新增统一错误页：401、403、404、500。
- [ ] 新增默认 routes 示例。
- [ ] 保留 `src/forms`、`src/resources`、`src/generated` 约定。
- [ ] 增加本地 dev proxy 和 Cookie rewrite 默认配置。

Acceptance:

- `pnpm install && pnpm dev` 可启动。
- 本地 `/view/:appType/admin` 可打开后台壳。
- 本地 `/view/:appType/portal` 可打开用户端壳。
- 不依赖旧 view workbench。

### Phase 6.4: SDK Provider And Hooks

- [ ] 新增或整理 `OpenXiangdaProvider`。
- [ ] 新增 `useOpenXiangda()`。
- [ ] 新增 `useCurrentUser()`。
- [ ] 新增 `useAppMenus()`。
- [ ] 新增 `usePermission()`。
- [ ] 新增统一 API error 类型。
- [ ] 新增登录失效处理。
- [ ] 新增 `PermissionBoundary`。
- [ ] 新增 `MenuBoundary` 或菜单过滤工具。
- [ ] 新增 `useRuntimeBootstrap()`。
- [ ] 新增 `useRoutePermission(routeCode)`。
- [ ] 新增 `useCanAccessRoute(routeCode)`。
- [ ] 避免提供鼓励页面硬编码角色的主 API，例如 `hasRole("admin")`。
- [ ] 评估是否内置 TanStack Query。

Acceptance:

- 应用不用手写 `/service` fetch 细节。
- 401 / 403 能统一呈现。
- 菜单和权限可以被 layout 直接消费。
- AdminShell / UserShell 渲染的菜单只来自后端过滤结果。
- 无权限页面由 `PermissionBoundary` 统一展示。

### Phase 6.5: Built-In Pages As React Components

- [ ] 确认 `StandardFormPage` 可脱离 route resolver 独立使用。
- [ ] 确认流程提交页可通过 schema `formType=process` 启用流程能力。
- [ ] 确认 `FormDetailTemplate` 支持标准 route params。
- [ ] 确认 `ProcessDetailTemplate` 支持审批动作。
- [ ] 确认 `DataManagementList` 支持新增、详情跳转自定义。
- [ ] 新增 `FilePreviewPage` SDK 组件。
- [ ] 所有默认页支持 shell 内嵌展示。
- [ ] 所有默认页支持 props 配置和 override。

Acceptance:

- 应用可直接在 React Router 中引用默认页。
- 不要求平台前端分支渲染。
- 后端拒绝时显示清晰无权限状态。

### Phase 6.6: Typegen

- [ ] 设计 `src/generated` 输出格式。
- [ ] 实现 forms typegen。
- [ ] 实现 workflows typegen。
- [ ] 实现 menus typegen。
- [ ] 实现 permissions typegen。
- [ ] 实现 data views typegen。
- [ ] 发布前检查 generated 是否过期。
- [ ] 在技能文档中要求 AI 优先使用 generated 常量。

Acceptance:

- AI 不需要猜 `formUuid`、字段 ID、权限 key。
- 类型文件可重复生成且 diff 稳定。
- 绑定不同 profile 时能正确生成 profile-local ID。

### Phase 6.7: Deploy Command

- [ ] 设计 `openxiangda deploy` 命令。
- [ ] Vite build 后上传 dist assets。
- [ ] 注册 runtime release。
- [ ] 支持 preview release。
- [ ] 支持 activate。
- [ ] 支持 rollback。
- [ ] 发布后 smoke check index 和 assets。
- [ ] 与 `workspace publish` 的关系文档化。

Acceptance:

- 新 SPA 应用可以按正常前端方式发布。
- 发布记录可审计。
- 回滚不需要重新构建。

### Phase 6.8: Resource Integration

- [ ] 明确 `deploy` 与 `resource publish` 的组合顺序。
- [ ] 菜单资源支持指向 SPA route，而不是旧 page key。
- [ ] 页面权限组支持 SPA route / route pattern。
- [ ] 平台用户可见菜单权限配置根据 `runtimeMode` 切换 legacy menu tree / SPA resource tree。
- [ ] React SPA 权限配置 UI 支持按角色勾选 `menuCode` 和 `routeCode`。
- [ ] React SPA 权限配置 UI 区分菜单可见性和 route 访问权。
- [ ] 支持勾选菜单时自动带出关联 route，但允许无菜单 route 单独授权。
- [ ] 对 manifest 中已删除或改名的 stale resource target 给出可见提示，不静默删除权限。
- [ ] route 资源支持无菜单页面，例如详情、编辑、审批、文件预览。
- [ ] page permission group 发布支持 `roleCodes`、`menuCodes`、`routeCodes`。
- [ ] 兼容旧 `menuFormUuids`、旧 page id、旧 page key，不破坏 classic workspace。
- [ ] 发布时按 `roles -> routes -> menus -> page permission groups -> form permission groups` 顺序执行。
- [ ] 生成 `src/generated/routes.gen.ts`、`menus.gen.ts`、`permissions.gen.ts` 的稳定常量。
- [ ] 表单权限继续绑定 formUuid。
- [ ] 流程权限继续绑定 workflow / formUuid。
- [ ] 数据视图继续只读发布。

Acceptance:

- AdminShell 菜单来自平台资源，但渲染由应用决定。
- 菜单点击进入 SPA route。
- 权限组能控制 route 可见性。
- 平台权限配置能感知 OpenXiangda 发布的 SPA 页面资源。
- 隐藏菜单不影响用户通过有权限的直链进入页面。
- 没有菜单的详情页仍受 route permission 控制。
- 老应用页面权限组发布和运行不受影响。

### Phase 6.9: AI Verification E2E

- [ ] 用新模板创建 example 测试应用。
- [ ] 创建 submitter 测试账号。
- [ ] 创建 viewer 测试账号。
- [ ] 配置不同角色、菜单、表单权限、字段权限、数据范围。
- [ ] Playwright 使用 verification login link 登录 submitter。
- [ ] 验证 admin shell。
- [ ] 验证 portal shell。
- [ ] 验证表单提交。
- [ ] 验证流程提交。
- [ ] 验证表单详情。
- [ ] 验证流程详情和审批。
- [ ] 验证数据列表。
- [ ] 验证无权限状态。
- [ ] 验证不同角色登录后菜单树不同。
- [ ] 验证有菜单页面、无菜单详情页、隐藏菜单直链的 route 权限。
- [ ] 验证前端隐藏按钮后，后端仍拒绝无权限 API 操作。
- [ ] 验证 ticket 二次访问失败。
- [ ] 验证本地 Cookie 刷新后仍有效。

Acceptance:

- 全链路不进入旧 view workbench。
- 不绕过后端权限。
- 本地和已发布环境行为一致。

### Phase 6.10: Documentation And Skills

- [ ] 更新 README 新应用心智模型。
- [ ] 更新 workspace 结构文档。
- [ ] 更新 page skill，减少旧页面上传模型描述。
- [ ] 更新 app skill，加入 runtimeMode 和模板选择。
- [ ] 更新 permission skill，说明 SPA route 权限。
- [ ] 更新 permission skill，说明 React SPA 使用 `routeCode` / `menuCode` 授权，不只依赖旧 `form-codes` / page code。
- [ ] 更新 app skill，要求新建应用优先判断 `runtimeMode` 和 workspace generation。
- [ ] 更新 page skill，要求 React SPA 页面按标准 route/component 开发。
- [ ] 更新 publish flow，说明 deploy / resource publish / workspace publish。
- [ ] 更新 publish flow，说明 routes / menus / page permission groups 的发布顺序。
- [ ] 新增或更新项目级 `AGENTS.md`，要求 AI 使用 React Router、SDK hooks、generated constants 和后端权限结果。
- [ ] 新增 AI 验证指南：用 verification login link 以不同真实角色验证菜单、route 权限和无权限状态。
- [ ] 增加 AI 开发规范：优先标准 React、React Router、SDK hooks、generated constants。
- [ ] 增加迁移指南：legacy -> react-spa。

Acceptance:

- AI 新建应用时默认走 React SPA 心智。
- 旧应用维护文档仍可找到。
- 私有平台概念减少暴露。
- 后续 AI 不会继续按旧单页面上传和旧菜单权限模型实现新 React SPA 应用。

### Phase 6.11: Classic OpenXiangda Compatibility

- [ ] 定义 workspace generation 检测规则。
- [ ] 在 CLI 中实现 classic / lightweight-runtime / react-spa 识别。
- [ ] 为旧 workspace 增加 `openxiangda workspace doctor` 检查。
- [ ] `openxiangda update` 检测到旧 workspace 时提示风险，不自动改结构。
- [ ] 保留 classic workspace 的 `workspace publish` 能力。
- [ ] 为旧项目提供推荐版本锁定说明。
- [ ] 设计 `classic -> react-spa` 迁移报告格式。
- [ ] 迁移命令必须支持 dry-run。
- [ ] 迁移后必须支持 runtimeMode 回滚。
- [ ] 技能文档要求 AI 在旧 workspace 中先判断 generation，再决定是否升级。

Acceptance:

- 旧 OpenXiangda 项目不升级也能继续维护和发布。
- 新 CLI 不会误把旧项目改成 React SPA。
- 迁移必须显式触发，且有回滚路径。

### Phase 6.12: Starter UI Design And Visual QA

- [x] 通过 Product Design `get-context` 确认 starter UI 设计 brief。
- [x] 生成 3 个视觉方向，不直接进入代码实现。
- [x] 用户选择 `mac-admin` 方向作为 Phase 6 starter UI 基准。
- [x] 把选中设计稿保存到 `docs/design/phase6/`。
- [x] 补充 `selected-direction.md`，记录视觉原则、色彩、间距、字体、组件密度。
- [ ] 将 AdminShell、UserShell、PublicShell 的实现任务绑定到选中设计稿。
- [ ] 实现后用 Playwright 截图与设计稿对照。
- [ ] 修正明显视觉偏差：间距、字号、边框、半径、密度、响应式断点。
- [ ] 将最终截图补进设计验证记录。

Acceptance:

- starter UI 不是临时代码拼出来的，有明确视觉基准。
- 后台默认风格现代简洁，接近 macOS productivity UI。
- 用户端和公开页也有统一视觉语言。
- 实现截图和选中设计稿差异可解释、可接受。

## 19. Test Plan

### 19.1 Unit Tests

- appType path parser
- runtimeMode default logic
- workspace generation detection
- SPA menu resource schema validation
- SPA route resource schema validation
- page permission group route/menu target validation
- route pattern matching
- cache key and invalidation
- release activation selection
- SDK API error normalization
- generated constants stable output

### 19.2 Integration Tests

- legacy app `/view` still returns old index
- classic OpenXiangda workspace still publishes through existing flow
- react-spa app `/view` returns SPA index
- missing release returns friendly unpublished state
- runtimeMode switch invalidates cache
- release rollback changes index
- `/service` proxy keeps Cookie on local domain
- `openxiangda update` warns instead of rewriting old workspace
- `runtime/bootstrap` returns filtered menu tree for current user
- `runtime/bootstrap` returns allowed route codes for current user
- page permission publish supports route/menu targets and keeps old fields compatible

### 19.3 E2E Tests

- local dev login through verification link
- admin shell menu permission
- portal shell navigation
- grouped collapsible menu renders filtered items
- direct URL access checks route permission
- hidden menu route can still open when route permission allows
- no-menu detail route is still protected
- normal form submit
- process submit
- form detail
- process detail approval
- data list data range
- public page
- no permission route
- file preview

### 19.4 Visual QA

- compare AdminShell implementation against selected design mock
- compare UserShell implementation against selected design mock
- compare PublicShell implementation against selected design mock
- verify desktop and mobile breakpoints
- verify text does not overflow in menu, toolbar, card, table, and button states
- verify loading, empty, 403, 404, unpublished, and login failure states

### 19.5 Performance Tests

- gateway cache hit latency
- gateway DB fallback latency
- index response size and TTFB
- SPA first load assets cache behavior
- SDK menu/profile bootstrap request count

## 20. Risks And Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| 误把旧应用切到新 runtime | 老应用不可访问 | 默认 legacy，切换需显式操作和审计 |
| 新 SPA 没 active release | 用户看到空白 | Gateway 返回明确未发布页 |
| 发布后缓存未失效 | 用户仍访问旧版本 | release 激活主动失效 Redis 和本地 LRU |
| 应用自己写权限判断不完整 | 越权风险 | 后端权限始终兜底，SDK 只做展示 |
| 只隐藏菜单但未保护路由 | 用户可通过直链进入 | 菜单资源和 route 资源拆开，route permission 独立校验 |
| route path 变化导致权限失效 | 页面无法访问或误放开 | 权限优先绑定稳定 `routeCode`，`pathPattern` 只作为解析和兼容 |
| AI 继续使用旧页面模型 | 工程化目标失败 | 更新 skills、模板、README 和 examples |
| 每个应用复制太多框架代码 | 后续维护困难 | Shell、hooks、默认页尽量来自 SDK |
| Router base path 配错 | 刷新 404 | 模板固化 `/view/:appType` 路由约定，E2E 覆盖刷新 |
| 静态资源走后端转发 | 性能和缓存差 | 资源走 CDN/hash，后端只处理 index 入口 |
| 旧 OpenXiangda workspace 被新 CLI 误迁移 | 存量项目发布风险 | CLI 检测 generation，升级只提示不自动改结构 |
| starter UI 缺少设计基准 | 默认框架粗糙，后续难统一 | 先做 3 个设计方向并选定，再实现模板 |

## 21. Open Questions

- `react-spa` release 是否复用现有 custom page release 表，还是新建 app runtime release 表？
- route permission 第一优先绑定 `routeCode`，但平台内部 resource target 表如何建模还需要设计。
- `admin` 和 `portal` 是否默认同一个 SPA，还是允许双 entry？
- 是否强制引入 TanStack Query，还是保持 SDK 内部可选？
- 旧 `workbench/:pageKey` 路径在新应用中是否继续兼容一段时间？
- 公开访问是否统一走 `/public/*`，还是继续兼容旧 publicAccess URL？
- 首个生产级 starter 选择 `admin-basic` 还是 `admin-portal`？
- Phase 6 是否继续用 `openxiangda@1.x` additive 发布，还是在默认模板切换时进入 `2.x`？
- classic workspace 的 LTS 支持周期需要多长？
- 默认后台视觉方向最终选 modern mac、compact productivity，还是 portal hybrid？

## 22. Recommended First Implementation Slice

第一轮不要一次性做完整 Phase 6。建议最小闭环：

1. 平台增加 `runtimeMode` 和 `/view` appType 分流。
2. CLI 增加 workspace generation 检测，保证旧 OpenXiangda 项目不被误迁移。
3. 通过 Product Design 生成 3 个 starter UI 方向并选定一个。
4. OpenXiangda 增加 `react-spa` 模板，默认 `AdminShell + UserShell + React Router`。
5. CLI 支持初始化 `--runtime react-spa --template admin-portal`。
6. 第一版 route/menu/page permission resource 支持发布，后端 bootstrap 返回过滤菜单和 route 权限。
7. CLI 支持构建上传 SPA dist 并注册 active release。
8. SDK 默认页可直接作为 React Router element 使用。
9. example 新建一个测试应用跑完整 E2E，覆盖不同角色菜单、直链 route 权限和无权限状态。

这一轮成功后，再做更完整 typegen、更多 starter、迁移工具和可视化权限配置。
