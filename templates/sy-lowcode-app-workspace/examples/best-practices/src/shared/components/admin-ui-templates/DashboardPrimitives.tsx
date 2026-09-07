import {
  AlertOutlined,
  AppstoreOutlined,
  AuditOutlined,
  BarChartOutlined,
  BellOutlined,
  CheckCircleOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  DownloadOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  HomeOutlined,
  InboxOutlined,
  LineChartOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  PlusOutlined,
  ProductOutlined,
  ProjectOutlined,
  QuestionCircleOutlined,
  SearchOutlined,
  SettingOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  SolutionOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  UploadOutlined,
  UserOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import {
  Avatar,
  Badge,
  Button,
  DatePicker,
  Descriptions,
  Dropdown,
  Drawer,
  Form,
  Input,
  Progress,
  Select,
  Space,
  Tag,
} from "antd";
import type { MenuProps } from "antd";
import type { ReactNode } from "react";
import { useEffect } from "react";

import type {
  ActivityItem,
  DrawerMode,
  IconName,
  MetricItem,
  NavItem,
  NoticeItem,
  QuickAction,
  RankingItem,
  TaskProgressItem,
  TemplateTone,
  TodoItem,
  WorkOrderPriority,
  WorkOrderRecord,
  WorkOrderStatus,
} from "./types";

const iconMap: Record<IconName, ReactNode> = {
  home: <HomeOutlined />,
  analytics: <LineChartOutlined />,
  business: <ProjectOutlined />,
  customer: <TeamOutlined />,
  order: <ShoppingCartOutlined />,
  product: <ProductOutlined />,
  finance: <WalletOutlined />,
  supply: <CloudServerOutlined />,
  hr: <SolutionOutlined />,
  system: <SettingOutlined />,
  app: <AppstoreOutlined />,
  ticket: <FileTextOutlined />,
  task: <CheckCircleOutlined />,
  monitor: <BarChartOutlined />,
  alert: <AlertOutlined />,
  device: <DatabaseOutlined />,
  report: <FileDoneOutlined />,
  setting: <SettingOutlined />,
  import: <UploadOutlined />,
  export: <DownloadOutlined />,
  help: <QuestionCircleOutlined />,
  user: <UserOutlined />,
  cart: <ShoppingCartOutlined />,
  approval: <AuditOutlined />,
  contract: <InboxOutlined />,
  dashboard: <ThunderboltOutlined />,
};

const toneHex: Record<TemplateTone, string> = {
  blue: "#3b82f6",
  cyan: "#06b6d4",
  green: "#16a34a",
  mint: "#10b981",
  purple: "#7c3aed",
  orange: "#f97316",
  red: "#ef4444",
  slate: "#64748b",
};

const toneGradient: Record<TemplateTone, string> = {
  blue: "linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)",
  cyan: "linear-gradient(135deg, #22d3ee 0%, #0891b2 100%)",
  green: "linear-gradient(135deg, #34d399 0%, #059669 100%)",
  mint: "linear-gradient(135deg, #5eead4 0%, #10b981 100%)",
  purple: "linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)",
  orange: "linear-gradient(135deg, #fdba74 0%, #f97316 100%)",
  red: "linear-gradient(135deg, #fb7185 0%, #ef4444 100%)",
  slate: "linear-gradient(135deg, #cbd5e1 0%, #64748b 100%)",
};

const workOrderStatusMeta: Record<
  WorkOrderStatus,
  { label: string; color: string }
> = {
  pending: { label: "待处理", color: "gold" },
  processing: { label: "处理中", color: "blue" },
  done: { label: "已完成", color: "green" },
  cancelled: { label: "已取消", color: "default" },
};

const priorityMeta: Record<WorkOrderPriority, { label: string; color: string }> = {
  high: { label: "高", color: "red" },
  medium: { label: "中", color: "gold" },
  low: { label: "低", color: "green" },
};

function toneClass(tone: TemplateTone) {
  return `bp-admin-tone-${tone}`;
}

export function IconGlyph(props: {
  name: IconName;
  tone?: TemplateTone;
  className?: string;
}) {
  return (
    <span
      className={`bp-admin-icon ${props.tone ? toneClass(props.tone) : ""} ${
        props.className || ""
      }`}
    >
      {iconMap[props.name]}
    </span>
  );
}

export function AdminShell(props: {
  variant: "glass" | "mint" | "ops" | "work";
  activeKey: string;
  navItems: NavItem[];
  brandTitle: string;
  brandSubtitle: string;
  topbar: ReactNode;
  children: ReactNode;
  sidebarFooter?: ReactNode;
  onNavChange?: (key: string) => void;
}) {
  return (
    <main className={`bp-admin-shell bp-admin-shell--${props.variant}`}>
      <aside className="bp-admin-sidebar">
        <div className="bp-admin-brand">
          <span className="bp-admin-brand__mark">A</span>
          <div>
            <strong>{props.brandTitle}</strong>
            <small>{props.brandSubtitle}</small>
          </div>
          {props.variant === "ops" ? (
            <Button
              className="bp-admin-collapse"
              shape="circle"
              icon={<MenuFoldOutlined />}
            />
          ) : null}
        </div>
        <nav className="bp-admin-nav">
          {props.navItems.map((item) => (
            <div key={item.key}>
              <button
                type="button"
                className={`bp-admin-nav__item ${
                  props.activeKey === item.key ? "is-active" : ""
                }`}
                onClick={() => props.onNavChange?.(item.key)}
              >
                <IconGlyph name={item.icon} />
                <span>{item.label}</span>
              </button>
              {item.children ? (
                <div className="bp-admin-nav__children">
                  {item.children.map((child) => (
                    <button
                      type="button"
                      key={child.key}
                      className={`bp-admin-nav__child ${
                        props.activeKey === child.key ? "is-active" : ""
                      }`}
                      onClick={() => props.onNavChange?.(child.key)}
                    >
                      {child.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </nav>
        {props.sidebarFooter ? (
          <div className="bp-admin-sidebar__footer">{props.sidebarFooter}</div>
        ) : null}
      </aside>
      <section className="bp-admin-main">
        {props.topbar}
        <div className="bp-admin-content">{props.children}</div>
      </section>
    </main>
  );
}

export function AdminTopbar(props: {
  title: string;
  subtitle?: string;
  searchPlaceholder?: string;
  extra?: ReactNode;
  userName?: string;
}) {
  const displayName = props.userName || "管理员";
  const userMenuItems: MenuProps["items"] = [
    {
      key: "profile",
      icon: <UserOutlined />,
      label: "个人信息",
    },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "退出登录",
      danger: true,
    },
  ];

  return (
    <header className="bp-admin-topbar">
      <div className="bp-admin-topbar__title">
        <strong>{props.title}</strong>
        {props.subtitle ? <span>{props.subtitle}</span> : null}
      </div>
      <div className="bp-admin-topbar__actions">
        <Input
          className="bp-admin-search"
          prefix={<SearchOutlined />}
          placeholder={props.searchPlaceholder || "搜索功能、数据、报表"}
          allowClear
        />
        {props.extra}
        <Badge count={12} size="small">
          <Button shape="circle" icon={<BellOutlined />} />
        </Badge>
        <Dropdown
          menu={{ items: userMenuItems }}
          placement="bottomRight"
          trigger={["click"]}
        >
          <Button type="text" className="bp-admin-user-menu" aria-label="用户菜单">
            <Avatar>{displayName.slice(0, 1)}</Avatar>
            <span className="bp-admin-user-menu__name">{displayName}</span>
          </Button>
        </Dropdown>
      </div>
    </header>
  );
}

export function Panel(props: {
  title?: string;
  extra?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`bp-admin-panel ${props.className || ""}`}>
      {props.title || props.extra ? (
        <div className="bp-admin-panel__header">
          {props.title ? <h3>{props.title}</h3> : <span />}
          {props.extra}
        </div>
      ) : null}
      {props.children}
    </section>
  );
}

export function Sparkline(props: {
  values: number[];
  tone: TemplateTone;
  filled?: boolean;
}) {
  const min = Math.min(...props.values);
  const max = Math.max(...props.values);
  const span = Math.max(max - min, 1);
  const points = props.values
    .map((value, index) => {
      const x = (index / Math.max(props.values.length - 1, 1)) * 120;
      const y = 42 - ((value - min) / span) * 34;
      return `${x},${y}`;
    })
    .join(" ");
  const fillPoints = `0,48 ${points} 120,48`;

  return (
    <svg className="bp-admin-sparkline" viewBox="0 0 120 52" aria-hidden="true">
      {props.filled ? (
        <polygon
          points={fillPoints}
          fill={toneHex[props.tone]}
          opacity="0.12"
        />
      ) : null}
      <polyline
        points={points}
        fill="none"
        stroke={toneHex[props.tone]}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
    </svg>
  );
}

export function MetricCard({ metric }: { metric: MetricItem }) {
  const positive = metric.direction !== "down";

  return (
    <article className="bp-admin-metric">
      <div className="bp-admin-metric__head">
        <span>{metric.label}</span>
        <IconGlyph name={metric.icon} tone={metric.tone} />
      </div>
      <strong>{metric.value}</strong>
      <div className="bp-admin-metric__delta">
        <span>较昨日</span>
        <b className={positive ? "is-up" : "is-down"}>
          {positive ? "↑" : "↓"} {metric.delta}
        </b>
      </div>
      <Sparkline values={metric.trend} tone={metric.tone} filled />
    </article>
  );
}

export function QuickActionGrid(props: {
  actions: QuickAction[];
  onAction?: (action: QuickAction) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`bp-admin-quick-grid ${
        props.compact ? "bp-admin-quick-grid--compact" : ""
      }`}
    >
      {props.actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className="bp-admin-quick-action"
          onClick={() => props.onAction?.(action)}
        >
          <span
            className="bp-admin-quick-action__icon"
            style={{ background: toneGradient[action.tone] }}
          >
            {iconMap[action.icon]}
          </span>
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
}

export function RankingList({ items }: { items: RankingItem[] }) {
  return (
    <ol className="bp-admin-ranking">
      {items.map((item) => (
        <li key={item.id}>
          <span className={`bp-admin-ranking__rank rank-${item.rank}`}>
            {item.rank}
          </span>
          <span>{item.name}</span>
          <strong>{item.amount}</strong>
        </li>
      ))}
    </ol>
  );
}

export function ActivityList({ items }: { items: ActivityItem[] }) {
  return (
    <div className="bp-admin-activity">
      {items.map((item) => (
        <div key={item.id} className="bp-admin-activity__item">
          <i className={toneClass(item.tone)} />
          <span>{item.content}</span>
          <time>{item.time}</time>
        </div>
      ))}
    </div>
  );
}

export function NoticeList({ items }: { items: NoticeItem[] }) {
  return (
    <div className="bp-admin-notices">
      {items.map((item) => (
        <div key={item.id} className="bp-admin-notice">
          <IconGlyph name="app" tone={item.tone} />
          <div>
            <strong>{item.title}</strong>
            <span>{item.description}</span>
          </div>
          <time>{item.time}</time>
        </div>
      ))}
    </div>
  );
}

export function TodoList({ items }: { items: TodoItem[] }) {
  return (
    <div className="bp-admin-todo">
      {items.map((item) => (
        <label key={item.id} className="bp-admin-todo__item">
          <input type="checkbox" defaultChecked={item.done} />
          <span>{item.title}</span>
          <Tag color={toneHex[item.tone]}>{item.owner}</Tag>
          <time>{item.due}</time>
        </label>
      ))}
    </div>
  );
}

export function TaskProgressList({ items }: { items: TaskProgressItem[] }) {
  return (
    <div className="bp-admin-task-progress">
      {items.map((item) => (
        <div key={item.id} className="bp-admin-task-progress__item">
          <div>
            <span>{item.title}</span>
            <b>{item.percent}%</b>
            <small>{item.status}</small>
          </div>
          <Progress
            percent={item.percent}
            showInfo={false}
            strokeColor={toneHex[item.tone]}
            railColor="#e2e8f0"
          />
        </div>
      ))}
    </div>
  );
}

export function HealthScore(props: {
  value: number;
  title?: string;
  tone?: TemplateTone;
}) {
  const tone = props.tone || "mint";

  return (
    <div className="bp-admin-health">
      <Progress
        type="circle"
        percent={props.value}
        strokeColor={toneHex[tone]}
        railColor="#e8eef7"
        format={() => (
          <span className="bp-admin-health__score">
            {props.value}
            <small>{props.title || "健康"}</small>
          </span>
        )}
      />
      <div className="bp-admin-health__checks">
        {["服务器状态", "接口服务", "数据库状态", "存储空间"].map((item) => (
          <span key={item}>
            <CheckCircleOutlined /> {item}
            <b>正常</b>
          </span>
        ))}
      </div>
    </div>
  );
}

export function DashboardChart(props: {
  option: Record<string, unknown>;
  height?: number;
}) {
  return (
    <ReactECharts
      option={props.option}
      style={{ height: props.height || 260, width: "100%" }}
      opts={{ renderer: "svg" }}
      notMerge
      lazyUpdate
    />
  );
}

export function TemplateActionDrawer(props: {
  open: boolean;
  title: string;
  mode: DrawerMode;
  onClose: () => void;
  onSubmit: () => void;
}) {
  if (!props.open) {
    return null;
  }
  return <TemplateActionDrawerInner {...props} />;
}

function TemplateActionDrawerInner(props: {
  open: boolean;
  title: string;
  mode: DrawerMode;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (props.open) {
      form.setFieldsValue({
        subject: props.title,
        owner: "张伟",
        priority: "medium",
        department: "运营部",
      });
    } else {
      form.resetFields();
    }
  }, [form, props.open, props.title]);

  return (
    <Drawer
      title={props.title}
      open={props.open}
      size={560}
      push={false}
      destroyOnHidden
      onClose={props.onClose}
      footer={
        <div className="bp-admin-drawer-footer">
          <Button onClick={props.onClose}>取消</Button>
          <Button type="primary" onClick={() => form.submit()}>
            保存
          </Button>
        </div>
      }
    >
      <Form
        form={form}
        layout="vertical"
        className="bp-admin-drawer-form"
        onFinish={props.onSubmit}
      >
        <Form.Item
          name="subject"
          label="事项名称"
          rules={[{ required: true, message: "请输入事项名称" }]}
        >
          <Input placeholder="请输入事项名称" />
        </Form.Item>
        <Form.Item
          name="owner"
          label="负责人"
          rules={[{ required: true, message: "请选择负责人" }]}
        >
          <Select
            options={[
              { value: "张伟", label: "张伟" },
              { value: "李明", label: "李明" },
              { value: "王芳", label: "王芳" },
            ]}
          />
        </Form.Item>
        <Form.Item name="department" label="所属部门">
          <Select
            options={[
              { value: "运营部", label: "运营部" },
              { value: "技术部", label: "技术部" },
              { value: "产品部", label: "产品部" },
            ]}
          />
        </Form.Item>
        <Form.Item name="priority" label="优先级">
          <Select
            options={[
              { value: "high", label: "高" },
              { value: "medium", label: "中" },
              { value: "low", label: "低" },
            ]}
          />
        </Form.Item>
        <Form.Item name="dueDate" label="截止时间">
          <DatePicker className="bp-admin-full" showTime />
        </Form.Item>
        <Form.Item name="description" label="说明">
          <Input.TextArea rows={5} placeholder="补充业务背景、处理要求或备注" />
        </Form.Item>
      </Form>
    </Drawer>
  );
}

export function WorkOrderStatusTag({ status }: { status: WorkOrderStatus }) {
  const meta = workOrderStatusMeta[status];
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

export function PriorityTag({ priority }: { priority: WorkOrderPriority }) {
  const meta = priorityMeta[priority];
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

export function WorkOrderDrawer(props: {
  mode: DrawerMode | null;
  record: WorkOrderRecord | null;
  onClose: () => void;
  onSubmit: () => void;
  onSwitchMode?: (mode: DrawerMode) => void;
}) {
  if (!props.mode) {
    return null;
  }
  return <WorkOrderDrawerInner {...props} mode={props.mode} />;
}

function WorkOrderDrawerInner(props: {
  mode: DrawerMode;
  record: WorkOrderRecord | null;
  onClose: () => void;
  onSubmit: () => void;
  onSwitchMode?: (mode: DrawerMode) => void;
}) {
  const [form] = Form.useForm();
  const open = true;
  const isDetail = props.mode === "detail";
  const record = props.record;
  const title =
    props.mode === "create"
      ? "新建工单"
      : props.mode === "edit"
        ? "编辑工单"
        : props.mode === "process"
          ? "处理工单"
          : "工单详情";

  useEffect(() => {
    if (open && record) {
      form.setFieldsValue({
        title: record.title,
        owner: record.owner,
        department: record.department,
        priority: record.priority,
        status: record.status,
        description: record.description,
      });
    }
    if (open && !record) {
      form.setFieldsValue({
        owner: "李明",
        department: "运营部",
        priority: "medium",
        status: "pending",
      });
    }
    if (!open) {
      form.resetFields();
    }
  }, [form, open, record]);

  return (
    <Drawer
      title={title}
      open={open}
      size={560}
      push={false}
      destroyOnHidden
      onClose={props.onClose}
      footer={
        <div className="bp-admin-drawer-footer">
          <Button onClick={props.onClose}>{isDetail ? "关闭" : "取消"}</Button>
          {isDetail ? (
            <>
              <Button onClick={() => props.onSwitchMode?.("edit")}>编辑</Button>
              <Button type="primary" onClick={() => props.onSwitchMode?.("process")}>
                处理工单
              </Button>
            </>
          ) : (
            <Button type="primary" onClick={() => form.submit()}>
              {props.mode === "process" ? "提交处理" : "保存"}
            </Button>
          )}
        </div>
      }
    >
      {isDetail && record ? (
        <>
          <Form form={form} component={false} onFinish={props.onSubmit} />
          <div className="bp-admin-drawer-detail">
            <div className="bp-admin-drawer-detail__title">
              <WorkOrderStatusTag status={record.status} />
              <strong>{record.title}</strong>
              <span>工单编号：{record.id}</span>
            </div>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="负责人">
                <Avatar size="small">{record.avatar}</Avatar> {record.owner}
              </Descriptions.Item>
              <Descriptions.Item label="所属部门">{record.department}</Descriptions.Item>
              <Descriptions.Item label="优先级">
                <PriorityTag priority={record.priority} />
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">{record.createdAt}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{record.updatedAt}</Descriptions.Item>
              <Descriptions.Item label="来源">{record.source}</Descriptions.Item>
              <Descriptions.Item label="联系方式">{record.contact}</Descriptions.Item>
              <Descriptions.Item label="相关系统">{record.relatedSystem}</Descriptions.Item>
            </Descriptions>
            <div className="bp-admin-drawer-block">
              <h4>工单描述</h4>
              <p>{record.description}</p>
            </div>
            <div className="bp-admin-drawer-attachment">
              <FileTextOutlined />
              <span>{record.attachmentName}</span>
              <small>2.34 MB</small>
            </div>
            <div className="bp-admin-drawer-block">
              <h4>操作时间线</h4>
              <div className="bp-admin-drawer-timeline">
                {record.timeline.map((item) => (
                  <div key={item.id}>
                    <i />
                    <strong>{item.title}</strong>
                    <span>
                      {item.operator} · {item.time}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <Form
          form={form}
          layout="vertical"
          className="bp-admin-drawer-form"
          onFinish={props.onSubmit}
        >
          <Form.Item
            name="title"
            label="工单标题"
            rules={[{ required: true, message: "请输入工单标题" }]}
          >
            <Input placeholder="请输入工单标题" />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { value: "pending", label: "待处理" },
                { value: "processing", label: "处理中" },
                { value: "done", label: "已完成" },
                { value: "cancelled", label: "已取消" },
              ]}
            />
          </Form.Item>
          <Form.Item name="priority" label="优先级">
            <Select
              options={[
                { value: "high", label: "高" },
                { value: "medium", label: "中" },
                { value: "low", label: "低" },
              ]}
            />
          </Form.Item>
          <Form.Item name="owner" label="负责人">
            <Select
              options={[
                { value: "李明", label: "李明" },
                { value: "王芳", label: "王芳" },
                { value: "张伟", label: "张伟" },
                { value: "陈强", label: "陈强" },
              ]}
            />
          </Form.Item>
          <Form.Item name="department" label="所属部门">
            <Select
              options={[
                { value: "运营部", label: "运营部" },
                { value: "技术部", label: "技术部" },
                { value: "产品部", label: "产品部" },
              ]}
            />
          </Form.Item>
          <Form.Item name="description" label="工单描述">
            <Input.TextArea rows={6} placeholder="请输入问题描述和处理要求" />
          </Form.Item>
        </Form>
      )}
    </Drawer>
  );
}
