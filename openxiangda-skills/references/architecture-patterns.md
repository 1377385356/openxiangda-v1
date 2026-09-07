# Architecture Patterns

> 面向 AI Agent 的平台架构范式指南：理解「表单为数据存储中枢、代码页承载业务逻辑」的低代码开发模型，并据此构建可发布的应用。

---

## 1. 平台设计理念

### 1.1 表单 = 数据存储

- **每个表单（Form）= 一张数据表**：表单 schema 定义即数据结构（字段、类型、校验、关联）。
- 平台底层按字段建表：简单字段使用原生 SQL 类型列，复杂字段使用 json/jsonb 列存储结构化对象。AI 无需关心建表 DDL、迁移脚本或 CRUD 接口。
- 表单除了承担「数据录入 UI」，还会自动暴露：列表查询、详情、增删改查 API、字段级权限、流程触发钩子。

### 1.2 低代码 = Schema + 代码页

```
低代码应用 = 表单（定义数据结构）+ 代码页（实现业务逻辑/编排/可视化）
```

- **表单层**：声明式 schema (`src/forms/xxx/schema.ts`)，负责字段与数据契约。
- **代码页层**：React/TSX (`src/pages/xxx/`)，负责非录入场景下的业务交互、数据可视化、聚合操作。

### 1.3 「零后端开发」数据管理模式

| 传统后端 | OpenXiangda 模式 |
| --- | --- |
| 设计表结构 + 迁移 | 编写表单 schema |
| 编写 REST API | 平台自动生成数据 API |
| 维护权限中间件 | 表单字段级权限 + 部门/角色 |
| 自建文件存储 | `AttachmentField` 直接接入平台存储 |
| 业务状态流转 | 表单 + `status` 字段 + 操作日志 + domain/service |
| 真审批流程 | 表单 + workflow + js-code-nodes |

AI Agent 在该平台上写代码时，**不应该考虑数据库、表结构、后端接口**——这些由表单 schema 自动派生。

---

## 2. 标准 CRUD 数据流

### 2.1 数据流向

```
┌──────────────┐    ┌─────────────────┐    ┌────────────────┐    ┌────────────┐
│ 表单页       │───▶│ 数据存储        │───▶│ 数据管理页     │───▶│ 详情页     │
│ (录入/编辑)  │    │ (平台数据表)    │    │ (列表/查询)    │    │ (查看)     │
└──────────────┘    └─────────────────┘    └────────────────┘    └────────────┘
       ▲                                            │
       └────────────────────────────────────────────┘
                     (从列表点编辑回填)
```

### 2.2 实现步骤

1. **定义表单 schema**：`src/forms/xxx/schema.ts` → 生成数据表 + 录入页。
2. **编写数据管理页**：`src/pages/xxx/index.tsx` 内使用 `DataManagementList` 组件做列表/查询/批量操作。
3. **绑定菜单入口**：`openxiangda menu create --type=page --target=/pages/xxx`（指向自定义代码页，**而不是** view 类型）。

### 2.3 反模式：不要使用平台内置 View

> ❌ `openxiangda menu create --type=view --formUuid=FORM_XXX`

平台内置 View 视图灵活性差：列宽/操作列/筛选项受限、无法嵌入业务交互、无法做联动。

> ✅ **统一使用「自定义代码页 + `DataManagementList`」组合**。

#### `DataManagementList` 的优势

- 完全自定义列渲染（`render` 函数、React 节点）。
- 自定义行操作 / 批量操作按钮。
- 自定义筛选区（部门选择、人员选择、级联）。
- 与页面内其他组件（Drawer、Modal、Tabs）自由组合。
- 仍复用平台分页、查询、导出能力。

---

## 3. 数据管理页的标准构建方式

### 3.1 最小可用示例

```tsx
// src/pages/instrument-list/index.tsx
import { DataManagementList } from 'openxiangda';
import { Tag, message } from 'antd';
import { useNavigate } from 'react-router-dom';

export default function InstrumentListPage() {
  const navigate = useNavigate();

  return (
    <DataManagementList
      formUuid="FORM_INSTRUMENT"
      columns={[
        { fieldId: 'name', title: '仪器名称' },
        { fieldId: 'code', title: '编号', width: 140 },
        {
          fieldId: 'status',
          title: '状态',
          render: (val) => (
            <Tag color={val.value === 'idle' ? 'green' : 'orange'}>
              {val.label}
            </Tag>
          ),
        },
        { fieldId: 'department', title: '所属部门' },
      ]}
      actions={[
        {
          label: '预约',
          onClick: (record) => navigate(`/forms/reservation/new?instrumentId=${record.id}`),
        },
        {
          label: '编辑',
          onClick: (record) => navigate(`/forms/instrument/${record.id}/edit`),
        },
      ]}
      batchActions={['export', 'delete']}
      filters={[
        { fieldId: 'status', type: 'select' },
        { fieldId: 'department', type: 'department-select' },
        { fieldId: 'owner', type: 'user-select' },
      ]}
      onRowClick={(record) => navigate(`/pages/instrument-detail/${record.id}`)}
    />
  );
}
```

### 3.2 关键 Props 速查

| Prop | 类型 | 说明 |
| --- | --- | --- |
| `formUuid` | `string` | 绑定的表单（数据源） |
| `columns` | `Column[]` | 列定义；`render` 可返回任意 React 节点 |
| `actions` | `Action[]` | 行级操作按钮 |
| `batchActions` | `('export' \| 'delete' \| BatchAction)[]` | 批量操作 |
| `filters` | `Filter[]` | 筛选区字段；支持 `select` / `date-range` / `user-select` / `department-select` 等 |
| `queryParams` | `Record<string, any>` | 固定查询条件（如「只看我创建的」） |
| `onRowClick` | `(record) => void` | 行点击事件，常用于跳转详情 |

---

## 4. 页面类型与适用场景

| 页面类型 | 实现方式 | 适用场景 |
| --- | --- | --- |
| 表单录入 / 编辑页 | `src/forms/xxx/` (`schema.ts` + `page.tsx`) | 新增数据、修改数据 |
| 数据管理页 | `src/pages/xxx/` 使用 `DataManagementList` | 列表、查询、批量操作、导出 |
| 状态流转页 | 普通表单 + 状态字段 + 操作日志 + 代码页 service | 工单、订单、任务等业务状态变化 |
| 流程表单页 | `src/forms/xxx/` 关联 workflow | 真实审批流程发起、节点处理、审批意见 |
| 自定义业务页 | `src/pages/xxx/` 自由编码 | 仪表盘、看板、复杂交互、对外门户 |
| 详情页 | `src/pages/xxx/[id].tsx` 使用 `FormSummaryCard` 等 | 查看单条数据、关联记录 |

> AI Agent 在创建新页面前，先按上表判断「应该走表单还是代码页」，避免把列表场景误塞进表单页。

### 4.1 状态流转不是审批流

- 普通业务流转默认使用普通表单：`status` 字段、可维护的责任人/归属字段、必要的隐藏权限键、操作日志表、domain 状态机、service 统一提交。
- 每次状态变更都由 service 完成，统一写操作日志并更新责任人、归属、更新时间和隐藏权限键等派生字段。
- workflow 只用于真实审批：审批人、审批任务、同意/驳回、审批意见、节点权限、流程记录明确存在的场景。
- 不要把「待处理 / 处理中 / 已完成 / 已关闭」这类状态流转建成流程表单。

---

## 5. 多端架构（PC / Mobile）

### 5.1 分离策略

- **页面层按端独立**：`src/pages/pc/xxx/` 与 `src/pages/mobile/xxx/`，避免单文件内 `if (isMobile)` 满天飞。
- **入口统一调度**：

  ```tsx
  // src/pages/instrument/index.tsx
  import { useDeviceDetect } from 'openxiangda';
  import PcPage from './pc';
  import MobilePage from './mobile';

  export default function InstrumentEntry() {
    const { isMobile } = useDeviceDetect();
    return isMobile ? <MobilePage /> : <PcPage />;
  }
  ```

- **UI 库分端**：
  - PC → `antd`
  - Mobile → `antd-mobile`
- **逻辑层共享**：`src/domain/` 与 `src/shared/services/` 在两端复用，确保业务规则一处实现。

### 5.2 共享 / 分离原则

| 层 | PC/Mobile 是否共享 |
| --- | --- |
| 业务规则（domain） | ✅ 共享 |
| 数据服务（services） | ✅ 共享 |
| Hooks（hooks） | ✅ 多数共享，端相关的拆 `usePcXxx` / `useMobileXxx` |
| 表单 schema | ✅ 共享（平台组件已多端适配） |
| 页面布局 / 组件 | ❌ 分离 |

---

## 6. 目录组织规范

```
src/
├── forms/                  # 表单（每个目录 = 一张数据表）
│   └── instrument/
│       ├── schema.ts       # 字段定义
│       └── page.tsx        # 录入页（可选自定义布局）
├── pages/                  # 自定义代码页（含数据管理页）
│   ├── instrument-list/    # 列表/管理
│   ├── instrument-detail/  # 详情
│   └── dashboard/          # 仪表盘等业务页
├── domain/                 # 纯业务逻辑（无 UI、可单测）
│   └── instrument/
│       ├── rules.ts
│       └── types.ts
├── shared/
│   ├── services/           # 数据服务层（封装 SDK 调用）
│   ├── hooks/              # 跨页面 hooks
│   ├── components/         # 跨页面共享组件
│   └── utils/              # 通用工具函数
└── js-code-nodes/          # 工作流 JS 脚本（由 build-js-code.mjs 打包）
```

### 6.1 命名约定

- 目录与文件统一 `kebab-case`：`instrument-list/`，`use-instrument-form.ts`。
- React 组件文件首字母大写：`DataPanel.tsx`，与默认导出一致。
- 表单目录名 = 表单业务名（不含 `Form` 后缀）。
- 数据管理页目录名建议 `xxx-list`，详情页 `xxx-detail`。

### 6.2 依赖方向（单向）

```
pages ──▶ shared ──▶ domain
forms ──▶ shared ──▶ domain
```

- `domain/` 不依赖 `shared/` 或 UI。
- `shared/` 不依赖 `pages/` 或 `forms/`。
- 反向依赖（如 domain 导入 pages）= 立刻拒绝。

---

## 7. 查询与交互性能

- 列表必须走分页接口，传 `currentPage`、`pageSize`、排序和结构化条件。
- 禁止一次取大 `pageSize` 再在页面内筛选。
- 默认不要使用 `searchKeyWord`；多字段模糊查询用 `filterGroup` + `OR`，并显式指定字段。
- 查询条件构造放在 `domain/` 或 `shared/services/`，不要散落在 TSX 事件处理里。
- 列表刷新时保留当前数据，使用局部刷新态，避免整页闪烁。
- 操作需要统一的确认、pending、成功反馈、失败刷新或回滚。

---

## 速查 Checklist（AI Agent 自检）

- [ ] 新增数据场景：是否已经定义表单 schema？
- [ ] 列表/查询场景：是否使用 `DataManagementList` 而非平台 view？
- [ ] 查询：是否使用分页和结构化条件，而不是大 pageSize、页面内过滤或 `searchKeyWord`？
- [ ] 流程判断：是否确认这是「真审批」，而不是普通状态流转？
- [ ] 菜单绑定：是否指向代码页 `--type=page`？
- [ ] PC/Mobile：是否分离页面、共享 domain？
- [ ] 目录：业务逻辑是否落在 `domain/`，未污染 UI 层？
