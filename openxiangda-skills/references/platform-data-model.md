# 平台数据模型参考（Platform Data Model）

> 一句话总结：OpenXiangda 平台按表单 schema 字段直接建表（每个字段对应一个数据库列），简单字段使用原生类型存储，选择类/复杂字段使用 JSON 列存储 `{label, value}` 结构；**提交什么格式就存什么格式，查询时原样返回**，AI Agent 在开发时**不要做任何格式翻译**。

---

## 1. 核心原则

### 1.1 按字段建表 + JSON 列混合存储

- 平台按表单 schema **直接建表**：每个表单对应一张 PostgreSQL 数据表，每个字段对应一个数据库列。
- **简单字段**（文本、数字、日期等）使用原生 SQL 类型（`varchar`、`numeric`、`date` 等）存储。
- **复杂字段**（选择、人员、部门、附件、子表单等）使用 `json`/`jsonb` 列存储，直接保存完整的结构化对象。
- 数据库不做任何字典翻译或额外规范化。
- 虽然底层存储类型不同，但对 API 调用者来说**行为一致**：提交什么格式，查询就返回什么格式。

### 1.2 "存什么返什么"的设计哲学

- **写入端**：前端/Agent 提交什么格式，数据库就存什么格式。
- **读取端**：API 查询返回的就是原始 JSON 结构，**不会**额外执行字典翻译、用户名补全或部门名拼接。
- **展示端**：选择类字段的中文名（label）已经随数据写入，前端直接取 `item.label` 即可，**禁止**再次基于 `value` 去查字典。
- **操作端**：业务逻辑、过滤、查询条件统一以 `item.value` 为准（稳定、不随显示文案变化）。

> 这意味着：label 是"快照"，value 是"语义键"。一旦字段值落库，label 与 value 一起被冻结，后续即便选项字典改名也不会影响历史数据展示。

### 1.3 保存接口响应契约

- `sdk.form.create` / `saveFormData` / `submitFormData` 只承诺返回实例标识和保存时已生成的流水号字段，例如 `formInstId`、`formInstanceId`、`processInstanceId`、`serialNumber`、`serialNumbers`。
- 保存接口**不返回完整业务数据**，也不承诺返回公式回填或其他服务端格式化后的字段值。
- 需要读取完整行数据、公式回填或非流水号服务端字段时，必须在拿到 `formInstId` 后显式调用 `sdk.form.getDetail({ formUuid, formInstId })`。
- 禁止生成假 ID（例如 `inst_${Date.now()}`），禁止在业务代码中手写 `response.data || response.result` 猜返回结构。

---

## 2. 字段类型与存储格式对照表

下表是 AI Agent 开发时必须遵守的字段映射规范。**所有"存储格式"列即为"提交格式"，也即"查询返回格式"，三者完全一致**。

| 字段类型 | 组件名 | 存储格式（=提交格式=查询返回格式） | 展示方式 | 操作方式 |
|---|---|---|---|---|
| 单行文本 | `TextField` | `"张三"` (string) | 直接渲染字符串 | 直接比较字符串 |
| 多行文本 | `TextAreaField` | `"第一行\n第二行"` (string，可含 `\n`) | `white-space: pre-wrap` 渲染 | 直接比较字符串 |
| 数字 | `NumberField` | `100` 或 `100.5` (number) | 直接渲染，可格式化千分位 | 数值比较 |
| 日期 | `DateField` | `"2026-05-29"` (ISO 字符串) | 格式化为本地日期 | 字符串比较或 dayjs 解析 |
| 日期范围 | `DateRangeField` | `["2026-05-01", "2026-05-31"]` (string[]) | `start ~ end` | `value[0]` / `value[1]` |
| 单选 | `SelectField` (单选) | `{"label": "选项A", "value": "a"}` | `value.label` | `value.value` |
| 多选 | `SelectField` (多选) | `[{"label":"A","value":"a"},{"label":"B","value":"b"}]` | `items.map(i => i.label).join(', ')` | `items.some(i => i.value === 'a')` |
| 单选按钮 | `RadioField` | `{"label": "是", "value": "yes"}` | `value.label` | `value.value` |
| 复选框 | `CheckboxField` | `[{"label":"A","value":"a"}]` (始终数组) | `items.map(i => i.label).join(', ')` | `items.some(i => i.value === 'a')` |
| 人员选择（单） | `UserSelectField` (单选) | `{"label": "张三", "value": "user_001"}` | `value.label` | `value.value` 作为 userId |
| 人员选择（多） | `UserSelectField` (多选) | `[{"label":"张三","value":"user_001"},{"label":"李四","value":"user_002"}]` | `items.map(i => i.label).join(', ')` | `items.map(i => i.value)` 作为 userId 列表 |
| 部门选择 | `DepartmentSelectField` | 单选 `{"label": "研发部", "value": "dept_001"}`；多选 `[{...}, ...]` | `value.label` 或 `items.map(i => i.label)` | `value.value` / `items.map(i => i.value)` |
| 附件 | `AttachmentField` | `[{"name":"文件.pdf","url":"https://...","size":1024,"type":"application/pdf","provider":"platform或oss","storageCode":"evaluate_oss"}]` | 文件名+下载链接列表 | 通过 `url` 下载；OSS 附件保存真实 OSS URL |
| 图片 | `ImageField` | `[{"name":"图片.png","url":"https://...","thumbUrl":"https://...","previewUrl":"https://...","variants":{"thumb":{"url":"https://..."}}}]` | 缩略图网格 | `thumbUrl` 展示缩略图，`previewUrl` 预览，`url` 保留原图 |
| 子表单 | `SubFormField` | `[{字段A: ..., 字段B: ...}, {...}]` (对象数组) | 渲染为子行表格 | 遍历每行，按字段 code 取值 |
| 位置 | `LocationField` | `{"address":"杭州市xxx","lng":120.12,"lat":30.27}` | `value.address` | `value.lng`/`value.lat` 用于地图 |
| 富文本 | `EditorField` | `"<p>富文本内容</p>"` (HTML 字符串) | `dangerouslySetInnerHTML` | 一般不参与查询过滤 |

### 2.1 选择类字段统一约定

> 所有"选择类"字段（`SelectField` / `RadioField` / `CheckboxField` / `UserSelectField` / `DepartmentSelectField`）共享**同一种结构**：

```ts
type Option = { label: string; value: string };

// 单选 / 单值
type SingleSelectValue = Option;

// 多选 / 多值
type MultiSelectValue = Option[];
```

- **单选/多选的判定**取决于字段配置 `multiple: boolean`，而非字段类型本身。
- **多选字段始终为数组**，即使用户只勾选了一项，也是 `[{label, value}]`，**不要降级为对象**。

### 2.2 字段类型变更

- 字段创建后对应数据库列类型已经固定。`TextField` 是 `TEXT`，`SelectField` / `RadioField` / 附件 / 子表等复杂字段是 `JSONB`。
- 把 `TextField` 改成 `SelectField` 不是纯 UI 改动，而是 `TEXT -> JSONB` 的破坏性存储类型变更。
- 平台会阻断已有列的破坏性类型变更。需要迁移时采用显式 shadow migration：旧列重命名为 `fieldId__legacy_yyyymmdd`，再创建原 `fieldId` 的新类型列。
- 回填必须提供明确转换规则，例如文本 `"待处理"` 转 `{ "label": "待处理", "value": "pending" }`；平台和 AI 都不能自动猜。
- 发布前可用 `openxiangda form schema-plan <formCode> --schema-json <file> --json` 检查 `safeAdd`、`compatibleNoop`、`breakingTypeChanges`。

---

## 3. 提交数据示例

下面是一份完整的表单提交 payload（前端调用 `submitFormData` 时传入的 `formData` 字段）：

```json
{
  "name": "张三",
  "remark": "第一行备注\n第二行备注",
  "amount": 1280.50,
  "applyDate": "2026-05-29",
  "tripRange": ["2026-06-01", "2026-06-05"],
  "department": { "label": "研发部", "value": "dept_001" },
  "priority": { "label": "高", "value": "high" },
  "tags": [
    { "label": "紧急", "value": "urgent" },
    { "label": "重要", "value": "important" }
  ],
  "isAgree": { "label": "同意", "value": "yes" },
  "hobbies": [
    { "label": "阅读", "value": "reading" }
  ],
  "owner": { "label": "张三", "value": "user_001" },
  "ccList": [
    { "label": "李四", "value": "user_002" },
    { "label": "王五", "value": "user_003" }
  ],
  "attachments": [
    {
      "name": "合同.pdf",
      "url": "https://cdn.openxiangda.com/files/contract.pdf",
      "size": 204800,
      "type": "application/pdf"
    }
  ],
  "photos": [
    {
      "name": "现场.png",
      "url": "https://cdn.openxiangda.com/files/site.png",
      "thumbUrl": "https://cdn.openxiangda.com/files/site_thumb.png"
    }
  ],
  "items": [
    { "itemName": "笔记本", "itemQty": 2, "itemPrice": 5000 },
    { "itemName": "鼠标", "itemQty": 5, "itemPrice": 100 }
  ],
  "address": {
    "address": "杭州市西湖区文三路 100 号",
    "lng": 120.1234,
    "lat": 30.2741
  },
  "description": "<p>这是<strong>富文本</strong>内容</p>"
}
```

---

## 4. 查询数据示例（与提交一致）

调用 `getFormDataDetail` 等单条查询 API 后，返回的 `formData` 与提交时**完全一致**，无任何字段被翻译或重组：

```json
{
  "id": "rec_2026052900001",
  "formCode": "expense_apply",
  "createdAt": "2026-05-29T10:23:11Z",
  "updatedAt": "2026-05-29T10:23:11Z",
  "creator": { "label": "张三", "value": "user_001" },
  "formData": {
    "name": "张三",
    "amount": 1280.50,
    "applyDate": "2026-05-29",
    "department": { "label": "研发部", "value": "dept_001" },
    "priority": { "label": "高", "value": "high" },
    "tags": [
      { "label": "紧急", "value": "urgent" },
      { "label": "重要", "value": "important" }
    ],
    "ccList": [
      { "label": "李四", "value": "user_002" },
      { "label": "王五", "value": "user_003" }
    ],
    "attachments": [
      { "name": "合同.pdf", "url": "https://cdn.openxiangda.com/files/contract.pdf", "size": 204800, "type": "application/pdf" }
    ],
    "items": [
      { "itemName": "笔记本", "itemQty": 2, "itemPrice": 5000 },
      { "itemName": "鼠标", "itemQty": 5, "itemPrice": 100 }
    ]
  }
}
```

> 注意：`formData` 是 API 返回的聚合 JSON 对象（键为字段 code，值为各字段存储值），与提交时的结构**字字相同**。底层实现是按字段建表（简单字段原生类型列 + 复杂字段 json/jsonb 列），而非所有数据存在单一 JSONB 列中。AI Agent 不要假设后端会做字典补全。

---

## 5. 数据管理列表 API 返回格式

`advancedSearchDataManagement` 是数据列表查询 API，用于分页、筛选、排序。其返回结构如下：

```json
{
  "code": 200,
  "message": "ok",
  "data": {
    "total": 128,
    "page": 1,
    "pageSize": 20,
    "list": [
      {
        "id": "rec_2026052900001",
        "formCode": "expense_apply",
        "createdAt": "2026-05-29T10:23:11Z",
        "updatedAt": "2026-05-29T10:23:11Z",
        "creator": { "label": "张三", "value": "user_001" },
        "formData": {
          "name": "张三",
          "amount": 1280.50,
          "department": { "label": "研发部", "value": "dept_001" },
          "priority": { "label": "高", "value": "high" },
          "tags": [
            { "label": "紧急", "value": "urgent" }
          ]
        }
      },
      {
        "id": "rec_2026052900002",
        "formCode": "expense_apply",
        "createdAt": "2026-05-29T11:05:42Z",
        "updatedAt": "2026-05-29T11:05:42Z",
        "creator": { "label": "李四", "value": "user_002" },
        "formData": {
          "name": "李四",
          "amount": 320.00,
          "department": { "label": "市场部", "value": "dept_002" },
          "priority": { "label": "普通", "value": "normal" },
          "tags": []
        }
      }
    ]
  }
}
```

### 5.1 字段访问示例

```ts
// 渲染列表表格
list.map(row => ({
  id: row.id,
  申请人: row.formData.name,                          // 纯字符串
  金额: row.formData.amount,                          // number
  部门: row.formData.department?.label ?? '-',        // 选择类直接取 label
  优先级: row.formData.priority?.label ?? '-',
  标签: row.formData.tags?.map(t => t.label).join(', ') ?? '',
  创建人: row.creator.label,
}));

// 构造筛选条件（用 value，不用 label）
const filter = {
  'formData.priority.value': 'high',
  'formData.tags.value': { $in: ['urgent'] },
};
```

---

## 6. AI 开发注意事项（关键规则）

> 以下规则按重要程度排序。AI Agent 写代码前请逐条核对。

1. **展示选择类字段值时，直接取 `item.label`**，**不要**做 `options.find(o => o.value === item.value)?.label` 这种"翻译"操作——label 已经在字段里了。
2. **操作（查询/过滤/比较）时一律用 `item.value`**：value 是稳定 ID，label 可能因字典调整而失真。
3. **提交表单时必须组装完整 `{label, value}` 结构**：仅传 value 会导致历史展示丢失中文名。
4. **多选字段始终是数组**，即便只有一项也写成 `[{label, value}]`；空值用 `[]`，不要用 `null`。
5. **`UserSelectField` / `DepartmentSelectField` 与普通 `SelectField` 的格式完全一致**，唯一区别是 `value` 语义为 userId / departmentId。
6. **附件 / 图片字段始终是数组**：单文件场景也是 `[{name, url, ...}]`，没有则 `[]`。使用 OSS 自定义上传时，附件项会额外带 `provider: "oss"`、`storageCode`、`publicUrl` 等元信息，但仍以 `url` 作为主访问地址。启用图片压缩时，`thumbUrl` / `previewUrl` / `variants` 是附加访问地址，不要覆盖原图 `url`。
7. **子表单 `SubFormField` 是对象数组**，每个对象代表一行，键为子字段 code。读取时遍历数组，按字段 code 访问；空子表单为 `[]`。
8. **不要尝试"翻译"或"规范化" label/value**：数据库存的就是最终展示格式，前后端皆然。任何二次翻译都是 bug 来源。
9. **流程表单的数据格式与普通表单一致**：`formData` 结构与普通表单一致，流程节点信息走另外的字段，不影响业务字段结构。
10. **日期字段是字符串而非 Date 对象**：`DateField` 用 ISO 日期串 `"YYYY-MM-DD"`，`DateRangeField` 是 `[startISO, endISO]`，序列化时不要 `JSON.stringify(new Date())`。
11. **数字字段是原生 number**，不是字符串；金额建议在前端格式化展示，不要在存储时加货币符号。
12. **富文本是 HTML 字符串**，渲染需用 `dangerouslySetInnerHTML`，并自行处理 XSS 过滤；不要把它当作 markdown。
13. **位置字段 `LocationField` 是对象**，含 `address` / `lng` / `lat`，地图渲染用 `lng`/`lat`，列表显示用 `address`。
14. **空值约定**：未填写的字段在 `formData` 中可能**缺失键**，也可能为 `null`；读取时统一用可选链 `?.` 与默认值兜底。
15. **不要修改返回的 `formData` 引用**：列表场景下若需做格式化展示，请生成新对象，避免污染原始数据。

---

## 附录：TypeScript 类型定义参考

```ts
// 选项类（含人员/部门）
export interface Option {
  label: string;
  value: string;
}

// 附件
export interface AttachmentItem {
  name: string;
  url: string;
  size?: number;
  type?: string;
  provider?: 'platform' | 'oss';
  storageCode?: string;
  thumbUrl?: string;
  previewUrl?: string;
  variants?: {
    thumb?: ImageVariant;
    preview?: ImageVariant;
  };
}

export interface ImageVariant {
  url: string;
  objectName?: string;
  bucketName?: string;
  width?: number;
  height?: number;
  size?: number;
  contentType?: string;
}

// 图片
export interface ImageItem {
  name: string;
  url: string;
  thumbUrl?: string;
  previewUrl?: string;
  variants?: AttachmentItem['variants'];
}

// 位置
export interface LocationValue {
  address: string;
  lng: number;
  lat: number;
}

// 子表单一行（结构由具体子字段决定）
export type SubFormRow = Record<string, unknown>;

// 一条表单数据
export interface FormDataRecord {
  id: string;
  formCode: string;
  createdAt: string;
  updatedAt: string;
  creator: Option;
  formData: Record<string, unknown>; // 字段 code -> 上述任一格式
}
```

> 记住一句话：**按字段建表（简单字段原生类型 + 复杂字段 JSON 列）+ label/value 快照 + 不翻译**，这是 OpenXiangda 数据模型最重要的三个关键词。
