# Component Guide

> 面向 AI Agent 的组件使用策略：优先复用平台组件，按需基于 antd / antd-mobile 包装，绝不重造已存在的平台能力。

---

## 1. 核心原则

1. **平台组件优先**：表单录入、平台数据选择、文件能力和数据管理默认先用 `openxiangda` 平台组件。它们已经接入组织架构、文件存储、权限、多端适配和平台数据格式，重写一遍 = 丢能力 + 后续无法维护。
2. **antd / antd-mobile 是第二选择**：只有平台组件不存在、或正在做非平台数据的页面控件时，才使用 `antd` / `antd-mobile`。自定义组件必须包装它们，不能从原生 DOM 开始造。
3. **AI-authored app code 禁止原生表单控件**：`src/forms/**`、`src/pages/**`、workspace 模板和示例中不要直接写 `<input>`、`<select>`、`<textarea>`、`<input type="file">`、手写 picker、手写 uploader、手写人员/部门选择器。原生控件只允许出现在 OpenXiangda SDK / 平台组件内部实现。
4. **成熟能力先调研开源方案**：图表、动画、拖拽、虚拟列表、富文本、日历、导入导出、复杂表格等，不要直接手写。先查当前项目依赖、官方文档和维护状态，再决定使用库或轻量封装。
5. **样式默认走 Tailwind 原生类**：业务页面默认使用 Tailwind 原生工具类和任意值；平台变量、平台语义类和 Ant Design token 主要用于平台组件、主题兼容或确实需要统一主题时，不作为业务页面的强制范式。
6. **谨慎覆盖组件内部 class**：组件库内部类名（`ant-select-selector` 等）是私有 API，下个版本就可能变；确实需要覆盖时要限定页面作用域，并优先考虑组件 props、`className`、CSS 变量或 `ConfigProvider`。

---

## 1.1 组件选择梯度

| 优先级 | 使用对象 | 适用场景 | 禁止事项 |
| --- | --- | --- | --- |
| 1 | OpenXiangda 平台组件 | 表单字段、平台数据选择、文件/图片/富文本/签名/定位、数据管理列表、标准表单容器 | 不要用 antd 或原生控件复刻 |
| 2 | `antd` / `antd-mobile` | 页面筛选、弹窗、抽屉、步骤条、非平台数据控件、平台暂无组件时的临时包装 | 不要手写 DOM 行为；保留 props/ref/a11y/键盘能力 |
| 3 | 自定义组件 | 平台和 antd 都不能满足的特殊业务交互 | 先反馈平台缺口；实现只写业务适配层 |
| 4 | 原生 HTML 控件 | 仅 OpenXiangda SDK / 平台组件内部实现 | AI 生成的 app/workspace 代码禁止使用 |

---

## 1.2 开源库选型规则

AI 在实现成熟交互前必须先判断是否已有可靠组件或库：

| 场景 | 优先方案 | 说明 |
| --- | --- | --- |
| 表单录入字段 | `openxiangda` 平台字段组件 | 文本、数字、日期、选择、人员、部门、附件、图片、富文本、位置、子表等优先 schema/platform field。 |
| 平台数据录入能力 | `openxiangda` 平台字段组件 | 人员、部门、附件、图片、富文本、签名、位置、数据管理列表必须平台组件。 |
| PC 页面控件、筛选、弹窗、表格、步骤条 | `antd` | 仅用于非平台数据控件或平台组件缺失时的包装。不要用原生 `<input>` / `<select>` 复刻。 |
| 移动端操作、列表、弹层、Tab | `antd-mobile` | 移动端不要强行套 PC 组件；平台字段组件已多端适配时直接用平台组件。 |
| 图表、仪表盘、经营看板 | `echarts` + `echarts-for-react` | 不要手写 canvas/SVG 图表，除非只是非常小的装饰图形。 |
| 复杂时间轴动画、编排动画、滚动动画 | `gsap` | 需要动画库时先查 GSAP 官方文档；如果当前 Agent 有动画/GSAP skill，先读取该 skill。简单 hover/transition 用 CSS 即可。 |
| 拖拽排序、看板、可拖卡片 | `@dnd-kit/*` | 不要自己处理 pointer/mouse/touch 全套事件。 |
| 大列表虚拟滚动 | antd Table virtual / `rc-virtual-list` | 不要一次渲染几千行 DOM。 |
| 日期时间处理 | `dayjs` + antd 日期组件 | 不要手写日期解析、时区格式化。 |
| 富文本 | 平台 `EditorField` 或成熟编辑器封装 | 不要用 contenteditable 从零做编辑器。 |

选型流程：

1. 先查是否已有 OpenXiangda 平台组件或 schema 字段能表达。
2. 平台没有时，看模板 `package.json` 已有依赖，已有依赖优先复用。
3. 没有依赖但功能成熟复杂时，调研官方文档、维护状态、包体积和授权，再通过包管理器加入。
4. 页面代码只写业务适配层，不复制第三方库内部逻辑。
5. 新增依赖或平台能力缺口后，通过 `openxiangda feedback submit --yes` 反馈选择原因或能力缺口。

---

## 2. 必须使用平台组件（重做即丢能力）

| 场景 | 平台组件 | 不重做的原因 | 自动接入的能力 |
| --- | --- | --- | --- |
| 选择人员 | `UserSelectField` | 直接接入组织架构 | 人员列表、搜索、按部门筛选、层级树 |
| 选择部门 | `DepartmentSelectField` | 直接接入组织架构 | 部门树、搜索、多选 |
| 上传附件 | `AttachmentField` | 接入平台存储或声明式 OSS 存储 | 上传、预览、下载、鉴权 URL 或真实 OSS URL |
| 上传图片 | `ImageField` | 接入平台存储 | 上传、压缩、缩略图、预览 |
| 富文本编辑 | `EditorField` | 含图片上传集成 | 完整工具栏、平台图床、粘贴清洗 |
| 数字签名 | `DigitalSignatureField` | 平台级签名 | 签名采集、验证、归档 |
| 地理位置 | `LocationField` | 接入地图服务 | 定位、地图选点、地址解析 |
| 数据管理列表 | `DataManagementList` | 接入数据查询 API | 分页、筛选、导出、批量操作、字段权限、后端 action summary 按钮控制 |

### 示例

```tsx
import {
  UserSelectField,
  DepartmentSelectField,
  AttachmentField,
  ImageField,
} from 'openxiangda';

<UserSelectField name="owner" label="负责人" multiple={false} />
<DepartmentSelectField name="dept" label="所属部门" />
<AttachmentField name="files" label="附件" maxCount={5} />
<AttachmentField name="ossFiles" label="OSS 附件" uploadProvider="oss" storageCode="evaluate_oss" />
<ImageField name="photos" label="照片" imageCompression={{ enabled: true }} />
```

OSS 浏览器直传所需的 CORS 规则在 `src/resources/storage/<code>.json` 的 `configJson.cors.managed` 中声明，不要把 bucket 配置写进组件 props。

`AttachmentField` 和 `ImageField` 都可设置 `imageCompression`。启用后只压缩图片文件，保存值会额外包含 `thumbUrl`、`previewUrl` 和 `variants`，用于列表缩略图、小图预览或详情页轻量展示；原图 `url` 仍保留用于下载和高清预览。

预览能力也由运行时统一接管：表单上下文使用 `ImageField` / `AttachmentField`；自定义 React SPA 页面展示任意业务数据中的只读附件时，从 `openxiangda/runtime/react` 使用 `ImagePreviewGrid` / `AttachmentPreviewList`，或使用 `useFilePreview({ items })` 接入自定义卡片、表格和详情操作。不要为只读附件伪造 `FormProvider`。

自定义编辑页确需嵌入平台字段时，使用 `usePageFormRuntimeApi()` 生成 `FormProvider` 的 `config.api`；非 Hook 场景使用 `createPageFormRuntimeApi(sdk)`。不要把所有请求手工转给 `sdk.request()`，因为附件预览的 `responseType: "blob"` 必须走 PageSdk 二进制下载通道。

```tsx
import { AttachmentPreviewList, ImagePreviewGrid } from "openxiangda/runtime/react"

<AttachmentPreviewList items={record.attachments || []} />
<ImagePreviewGrid items={record.photos || []} />
```

这些 API 先调用平台 capability，只为 `canPreview: true` 的文件显示或执行预览，并在站内弹窗中打开图片画廊、视频、音频、PDF、DOCX、XLSX、文本等内容。不要在应用代码中维护扩展名白名单，不要直接引用内部 `FilePreviewContent` / `useFilePreviewController`，也不要把文件流 URL 当成页面入口。DOC/XLS/PPT、ODF 等格式是否可预览由部署侧 ONLYOFFICE 配置决定。

声明式 OSS 文件需要 bucket CORS 允许应用域名读取对象，浏览器端 DOCX/XLSX/HEIC 解析才能工作；平台私有附件由 ticket 文件流处理，不直接暴露对象地址。

业务应用只能从 `openxiangda`、`openxiangda/runtime`、`openxiangda/runtime/react` 等公开入口导入组件和 SDK。不要为了减小包体积去引用 `openxiangda/packages/sdk/dist/...` 内部文件；React SPA 模板已提供 vendor chunk 分组，SDK 会把 `antd-mobile`、`dayjs` 等大型 UI 依赖交给应用构建器按路由拆分。

`DataManagementList` 默认 `permissionMode="auto"`，进入页面会读取表单 action
summary，并用 `can.create/export/import/delete/workflow/change_records` 隐藏新增、
导入、导出、删除、流程等按钮。`readonly=true` 仍会强制关闭新增、编辑、删除和
导入。`actionOverrides` 只能关闭按钮，不能扩大后端权限；敏感授权必须依赖后端
form actions、`scope_policy` 或 App Function 服务端校验。

> ✅ 一句话原则：**这些场景看到了，直接抄上表，不要自己写。**

---

## 3. 推荐使用平台组件（可自定义但不建议从零重做）

| 场景 | 平台组件 | 何时考虑自定义 |
| --- | --- | --- |
| 短文本 | `TextField` | 需要复合输入（如扫码 + 输入）时，包装平台字段或 antd `Input` |
| 长文本 | `TextAreaField` | 需要模板片段、语音转写等增强时包装 |
| 数字 | `NumberField` | 需要特殊单位联动或计算器式输入时包装 |
| 下拉选择 | `SelectField` | 需要复杂远程搜索、级联、虚拟滚动时，包装而非重写 |
| 多选 / 单选 / 复选 | `MultiSelectField` / `RadioField` / `CheckboxField` | 需要特殊展示时包装 |
| 日期选择 | `DateField` | 特殊日期范围联动、节假日高亮 |
| 级联日期 / 级联选择 | `CascadeDateField` / `CascadeSelectField` | 需要特殊联动时包装 |
| 子表 | `SubFormField` | 需要完整行级业务动作时包装 |
| 表单容器 | `FormProvider` + `FormRenderer` | 需要极度定制布局（分栏、Tab 嵌套表单） |
| 审批时间线 | `ApprovalTimeline` | 需要自定义节点渲染（增加业务标签、跳转链接） |
| 摘要卡片 | `FormSummaryCard` | 需要高度自定义字段展示样式 |

自定义时仍应**包装**这些组件，而不是从 antd 从零实现一遍。

---

## 4. 自定义组件开发规范

### 4.1 推荐：平台组件缺失时，基于 antd 包装 + 原生 Tailwind 类

先判断平台组件确实不能满足；如果是平台能力缺口，先用 `openxiangda feedback submit --yes` 反馈，再写本地包装作为临时方案。

```tsx
import { Select, SelectProps } from 'antd';
import clsx from 'clsx';

type Option = { label: string; value: string };

interface CustomSelectProps extends Omit<SelectProps, 'options'> {
  options: Option[];
}

export function CustomSelect({ options, className, ...rest }: CustomSelectProps) {
  return (
    <Select
      className={clsx('w-full rounded-md', className)}
      getPopupContainer={(trigger) => trigger.parentElement ?? document.body}
      options={options}
      {...rest}
    />
  );
}
```

要点：
- 透传 `...rest`，保留 antd 全部 API。
- `getPopupContainer` 解决弹层被裁切问题（详见第 7 节常见错误）。
- 默认 `cssIsolation: "none"` 时不要额外给弹层加 `sy-app-workspace`；只有 legacy `namespace/shadow` 页面才需要给弹层或容器补 namespace class。
- 使用 `w-full`、`rounded-md`、`text-slate-600`、`border-slate-200` 等 Tailwind 原生类作为默认基线；如果组件视觉需要精调，可以继续使用 Tailwind 任意值或局部 CSS。

### 4.2 错误：从头实现选择器或原生表单控件

```tsx
// ❌ 反例：AI-authored app code 不要这样写。
// 丢失键盘导航、可访问性、移动端体验、平台主题和平台数据格式。
function BadSelect({ options }) {
  return (
    <div style={{ border: '1px solid #d9d9d9', borderRadius: '4px', padding: '4px 11px' }}>
      {options.map((opt) => (
        <div key={opt.value} onClick={() => /* ... */}>
          {opt.label}
        </div>
      ))}
    </div>
  );
}
```

```tsx
// ❌ 反例：表单录入不要直接写原生控件
<input value={name} onChange={(event) => setName(event.target.value)} />
<select value={type} onChange={(event) => setType(event.target.value)} />
<input type="file" onChange={uploadManually} />
```

问题清单：
- 硬编码颜色 `#d9d9d9` → 切主题失效。
- 丢失 antd 的键盘 / a11y / 输入法行为。
- 移动端无适配。
- 平台主题升级时不会跟随。
- 绕过平台表单 schema、字段权限、文件鉴权、组织架构和标准数据格式。

---

## 5. 平台组件的样式自定义

按推荐顺序由轻到重：

1. **className 注入 Tailwind 原生类**
   ```tsx
   <UserSelectField className="w-full max-w-md" />
   ```

2. **CSS 变量覆盖**
   ```css
   /* src/index.css */
   :root,
   .sy-app-workspace {
     /* 调整表单控件圆角和品牌色 */
     --sy-radius-md: 8px;
     --sy-color-primary: #2563eb;
   }
   ```

   > 平台变量可用于统一主题或平台组件兼容，但业务页面不必为了使用 token 牺牲视觉效果。需要页面专属视觉时，可以新增页面级 CSS 变量，建议加业务前缀，避免与平台变量冲突。

3. **antd `ConfigProvider` 主题**
   ```tsx
   <ConfigProvider theme={{ token: { colorPrimary: '#2563eb', borderRadius: 8 } }}>
     <App />
   </ConfigProvider>
   ```

4. **谨慎**：直接覆盖组件内部 class（`.ant-select-selector { ... }`）属于私有 API，升级风险较高。确实需要时必须限定在页面根类下；legacy 页面也可以兼容限定在 `.sy-app-workspace` 下。优先考虑 `ConfigProvider`、`className`、组件 props 或 CSS 变量是否能解决。

---

## 6. 移动端组件策略

| 场景 | PC | Mobile |
| --- | --- | --- |
| 基础组件库 | `antd` | `antd-mobile` |
| 平台业务组件（如 `UserSelectField`） | ✅ 内置多端适配，**直接用** | ✅ 同左 |
| 自定义组件 | 自行 `useDeviceDetect` 分支或拆两份实现 | 同左 |

```tsx
import { useDeviceDetect } from 'openxiangda';
import { Button as PcButton } from 'antd';
import { Button as MobileButton } from 'antd-mobile';

export function ActionButton(props) {
  const { isMobile } = useDeviceDetect();
  return isMobile ? <MobileButton {...props} /> : <PcButton {...props} />;
}
```

> 推荐：能用平台组件就别自己写多端分支；自定义组件且双端差异大时，按 `src/pages/pc` 与 `src/pages/mobile` 整体拆分（详见 `architecture-patterns.md`）。

---

## 7. 常见错误（AI Agent 高频踩坑）

| 错误 | 正确做法 |
| --- | --- |
| 在 `src/forms/**` 或 `src/pages/**` 直接写 `<input>` / `<select>` / `<textarea>` | 用平台字段组件；平台没有时包装 antd / antd-mobile |
| 自己写人员选择器（搜员工 + 列表） | 用 `UserSelectField` |
| 自己实现部门树 | 用 `DepartmentSelectField` |
| 用 `<input type="file">` 上传 | 用 `AttachmentField` / `ImageField` |
| 用第三方富文本（TinyMCE 等） | 用 `EditorField` |
| 自己写列表 + 分页 + 导出 | 用 `DataManagementList` |
| 常规组件大量写 `style={{ color: '#333', padding: 16 }}` | 优先 Tailwind 原生工具类、任意值或局部 CSS；动态值和少量精调 inline style 可接受 |
| Select / Date / Modal 弹层错位、被滚动容器裁切 | 默认加 `getPopupContainer={(trigger) => trigger.parentElement}`；legacy `namespace/shadow` 页面才额外使用 `sy-app-workspace` |
| 不分端，PC 组件直接放移动端 | 按端拆页 + 端内用对应 UI 库 |
| 无作用域覆盖 `.ant-xxx` 内部 class | 优先用 `className`、CSS 变量或 `ConfigProvider` 主题；必要覆盖时限定到页面命名空间 |
| 在自定义组件中不透传 `...rest` / `ref` | 透传 props 与 `forwardRef`，保留底层组件全部能力 |

---

## 速查 Checklist（提交前自检）

- [ ] 涉及人员 / 部门 / 文件 / 图片 / 富文本 / 签名 / 地图 / 列表 → 用了平台组件？
- [ ] 表单录入字段 → 优先使用了 `TextField` / `SelectField` / `DateField` 等平台字段，而不是 antd 或原生控件？
- [ ] 自定义组件 → 基于 antd / antd-mobile 包装并透传 props？
- [ ] app/workspace 源码 → 没有直接出现原生 `<input>` / `<select>` / `<textarea>` / file input / 手写 picker 或 uploader？
- [ ] 样式 → 默认用 Tailwind 原生类 / 任意值 / 局部 CSS；平台 token 只在主题兼容或平台组件需要时使用，且作用域收敛？
- [ ] 弹层 → 默认使用正常容器；只有 legacy 隔离页面才额外设置 `sy-app-workspace` 样式作用域？
- [ ] 多端 → PC 用 antd、Mobile 用 antd-mobile，业务逻辑共享？
