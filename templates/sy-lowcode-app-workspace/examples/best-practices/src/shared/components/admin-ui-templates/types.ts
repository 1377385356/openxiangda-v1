export type TemplateKey =
  | "glass-home-dashboard"
  | "mint-analytics-dashboard"
  | "ops-monitor-dashboard"
  | "work-order-list-drawer";

export type DrawerMode = "detail" | "create" | "edit" | "process";

export type TemplateTone =
  | "blue"
  | "cyan"
  | "green"
  | "mint"
  | "purple"
  | "orange"
  | "red"
  | "slate";

export interface AdminTemplateMeta {
  key: TemplateKey;
  uiTemplate: TemplateKey;
  name: string;
  recommendedFor: string[];
  description: string;
}

export interface NavItem {
  key: string;
  label: string;
  icon: IconName;
  children?: NavItem[];
}

export type IconName =
  | "home"
  | "analytics"
  | "business"
  | "customer"
  | "order"
  | "product"
  | "finance"
  | "supply"
  | "hr"
  | "system"
  | "app"
  | "ticket"
  | "task"
  | "monitor"
  | "alert"
  | "device"
  | "report"
  | "setting"
  | "import"
  | "export"
  | "help"
  | "user"
  | "cart"
  | "approval"
  | "contract"
  | "dashboard";

export interface MetricItem {
  id: string;
  label: string;
  value: string;
  delta: string;
  trend: number[];
  tone: TemplateTone;
  icon: IconName;
  helper?: string;
  direction?: "up" | "down";
}

export interface QuickAction {
  id: string;
  label: string;
  icon: IconName;
  tone: TemplateTone;
}

export interface RankingItem {
  id: string;
  name: string;
  amount: string;
  rank: number;
}

export interface ActivityItem {
  id: string;
  content: string;
  time: string;
  tone: TemplateTone;
}

export interface NoticeItem {
  id: string;
  title: string;
  description: string;
  time: string;
  tone: TemplateTone;
}

export interface TodoItem {
  id: string;
  title: string;
  owner: string;
  due: string;
  tone: TemplateTone;
  done?: boolean;
}

export interface TaskProgressItem {
  id: string;
  title: string;
  percent: number;
  status: string;
  tone: TemplateTone;
}

export type WorkOrderStatus =
  | "pending"
  | "processing"
  | "done"
  | "cancelled";

export type WorkOrderPriority = "high" | "medium" | "low";

export interface WorkOrderRecord {
  key: string;
  id: string;
  title: string;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  owner: string;
  avatar: string;
  department: string;
  createdAt: string;
  updatedAt: string;
  source: string;
  contact: string;
  relatedSystem: string;
  description: string;
  attachmentName: string;
  timeline: Array<{
    id: string;
    title: string;
    operator: string;
    time: string;
  }>;
}
