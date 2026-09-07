import {
  DownloadOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  App as AntdApp,
  Avatar,
  Button,
  DatePicker,
  Input,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import type { TableProps } from "antd";
import type { Key } from "react";
import { useMemo, useState } from "react";

import { QueryState } from "@/shared/components/QueryState";
import {
  AdminShell,
  AdminTopbar,
  IconGlyph,
  Panel,
  PriorityTag,
  WorkOrderDrawer,
  WorkOrderStatusTag,
} from "@/shared/components/admin-ui-templates/DashboardPrimitives";
import {
  workOrderNavItems,
  workOrders,
} from "@/shared/components/admin-ui-templates/sampleData";
import type {
  DrawerMode,
  WorkOrderPriority,
  WorkOrderRecord,
  WorkOrderStatus,
} from "@/shared/components/admin-ui-templates/types";

type StatusFilter = "all" | WorkOrderStatus;
type ViewState = "ready" | "loading" | "empty" | "error";

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待处理" },
  { value: "processing", label: "处理中" },
  { value: "done", label: "已完成" },
  { value: "cancelled", label: "已取消" },
];

const priorityOptions: Array<{ value: "all" | WorkOrderPriority; label: string }> = [
  { value: "all", label: "全部优先级" },
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "low", label: "低" },
];

export function WorkOrderListDrawerPage() {
  const { message } = AntdApp.useApp();
  const [activeNav, setActiveNav] = useState("ticket-list");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | WorkOrderPriority>("all");
  const [viewState, setViewState] = useState<ViewState>("ready");
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [drawerMode, setDrawerMode] = useState<DrawerMode | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<WorkOrderRecord | null>(null);

  const filteredRows = useMemo(() => {
    const nextRows = workOrders.filter((item) => {
      const keywordMatched =
        !keyword ||
        item.title.includes(keyword) ||
        item.id.includes(keyword) ||
        item.description.includes(keyword);
      const statusMatched =
        statusFilter === "all" ? true : item.status === statusFilter;
      const priorityMatched =
        priorityFilter === "all" ? true : item.priority === priorityFilter;
      return keywordMatched && statusMatched && priorityMatched;
    });
    return viewState === "empty" ? [] : nextRows;
  }, [keyword, priorityFilter, statusFilter, viewState]);

  const statusStats = useMemo(
    () => [
      {
        key: "all" as StatusFilter,
        label: "全部工单",
        value: workOrders.length,
        icon: "ticket" as const,
        tone: "blue" as const,
      },
      {
        key: "pending" as StatusFilter,
        label: "待处理",
        value: workOrders.filter((item) => item.status === "pending").length,
        icon: "task" as const,
        tone: "orange" as const,
      },
      {
        key: "processing" as StatusFilter,
        label: "处理中",
        value: workOrders.filter((item) => item.status === "processing").length,
        icon: "monitor" as const,
        tone: "blue" as const,
      },
      {
        key: "done" as StatusFilter,
        label: "已完成",
        value: workOrders.filter((item) => item.status === "done").length,
        icon: "approval" as const,
        tone: "green" as const,
      },
      {
        key: "cancelled" as StatusFilter,
        label: "已取消",
        value: workOrders.filter((item) => item.status === "cancelled").length,
        icon: "setting" as const,
        tone: "slate" as const,
      },
    ],
    [],
  );

  const columns: TableProps<WorkOrderRecord>["columns"] = [
    {
      title: "工单编号",
      dataIndex: "id",
      width: 150,
      fixed: "left",
    },
    {
      title: "标题",
      dataIndex: "title",
      width: 220,
      ellipsis: true,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (status: WorkOrderStatus) => <WorkOrderStatusTag status={status} />,
    },
    {
      title: "优先级",
      dataIndex: "priority",
      width: 90,
      render: (priority: WorkOrderPriority) => <PriorityTag priority={priority} />,
    },
    {
      title: "负责人",
      dataIndex: "owner",
      width: 110,
      render: (_value: string, record) => (
        <Space size={6}>
          <Avatar size="small">{record.avatar}</Avatar>
          {record.owner}
        </Space>
      ),
    },
    {
      title: "所属部门",
      dataIndex: "department",
      width: 110,
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      width: 150,
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      width: 150,
    },
    {
      title: "操作",
      key: "actions",
      width: 150,
      fixed: "right",
      render: (_value: unknown, record) => (
        <Space size={6}>
          <Button type="link" size="small" onClick={() => openDrawer("detail", record)}>
            查看
          </Button>
          <Button type="link" size="small" onClick={() => openDrawer("edit", record)}>
            编辑
          </Button>
          <Button type="link" size="small" onClick={() => openDrawer("process", record)}>
            处理
          </Button>
        </Space>
      ),
    },
  ];

  function openDrawer(mode: DrawerMode, record: WorkOrderRecord | null) {
    setDrawerMode(mode);
    setSelectedRecord(record);
  }

  function refresh() {
    setViewState("loading");
    window.setTimeout(() => {
      setViewState("ready");
      message.success("工单列表已刷新");
    }, 500);
  }

  function submitDrawer() {
    setDrawerMode(null);
    message.success("操作已提交");
  }

  return (
    <AdminShell
      variant="work"
      activeKey={activeNav}
      navItems={workOrderNavItems}
      brandTitle="OpenXiangda"
      brandSubtitle="运营管理后台"
      topbar={
        <AdminTopbar
          title="工作台 / 工单管理 / 工单列表"
          searchPlaceholder="搜索功能、工单、人员"
          userName="管理员"
          extra={
            <Select<ViewState>
              size="small"
              value={viewState}
              onChange={setViewState}
              options={[
                { value: "ready", label: "正常" },
                { value: "loading", label: "加载" },
                { value: "empty", label: "空态" },
                { value: "error", label: "错误" },
              ]}
            />
          }
        />
      }
      onNavChange={setActiveNav}
    >
      <Panel className="bp-work-filter-panel">
        <div className="bp-work-filter-grid">
          <label>
            <span>关键词</span>
            <Input.Search
              allowClear
              value={keyword}
              placeholder="请输入标题/编号/内容"
              onChange={(event) => setKeyword(event.target.value)}
              onSearch={setKeyword}
            />
          </label>
          <label>
            <span>状态</span>
            <Select<StatusFilter>
              value={statusFilter}
              onChange={setStatusFilter}
              options={statusOptions}
            />
          </label>
          <label>
            <span>优先级</span>
            <Select<"all" | WorkOrderPriority>
              value={priorityFilter}
              onChange={setPriorityFilter}
              options={priorityOptions}
            />
          </label>
          <label>
            <span>创建时间</span>
            <DatePicker.RangePicker />
          </label>
          <div className="bp-work-filter-actions">
            <Button onClick={() => setViewState("ready")}>重置</Button>
            <Button type="primary" onClick={() => setViewState("ready")}>
              筛选
            </Button>
          </div>
        </div>
      </Panel>

      <div className="bp-work-toolbar">
        <Space wrap>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => openDrawer("create", null)}
          >
            新建记录
          </Button>
          <Button>批量操作</Button>
          <Button icon={<DownloadOutlined />}>导出</Button>
          <Button icon={<ReloadOutlined />} loading={viewState === "loading"} onClick={refresh}>
            刷新
          </Button>
        </Space>
        <span>已选择 {selectedRowKeys.length} 项</span>
      </div>

      <section className="bp-work-stats">
        {statusStats.map((item) => (
          <button
            key={item.key}
            type="button"
            className={statusFilter === item.key ? "is-active" : ""}
            onClick={() => {
              setStatusFilter(item.key);
              setViewState("ready");
            }}
          >
            <div>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>较昨日 +5.2%</small>
            </div>
            <IconGlyph name={item.icon} tone={item.tone} />
          </button>
        ))}
      </section>

      {viewState === "error" ? (
        <Panel className="bp-work-state-panel">
          <QueryState
            error="模拟列表接口异常，请点击重试恢复。"
            onRetry={() => setViewState("ready")}
          />
        </Panel>
      ) : (
        <Panel className="bp-work-table-panel">
          {viewState === "empty" ? (
            <QueryState empty />
          ) : null}
          <Table<WorkOrderRecord>
            rowKey="id"
            size="small"
            columns={columns}
            dataSource={filteredRows}
            loading={viewState === "loading"}
            rowSelection={{
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys),
            }}
            scroll={{ x: 1200 }}
            pagination={{
              pageSize: 8,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
            }}
            onRow={(record) => ({
              onDoubleClick: () => openDrawer("detail", record),
            })}
          />
        </Panel>
      )}

      <WorkOrderDrawer
        mode={drawerMode}
        record={selectedRecord}
        onClose={() => setDrawerMode(null)}
        onSubmit={submitDrawer}
        onSwitchMode={setDrawerMode}
      />
    </AdminShell>
  );
}
