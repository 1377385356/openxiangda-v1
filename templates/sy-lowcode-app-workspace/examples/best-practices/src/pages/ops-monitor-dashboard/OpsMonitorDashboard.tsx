import { App as AntdApp, Button, DatePicker, Select, Space, Tag } from "antd";
import { useMemo, useState } from "react";

import { QueryState } from "@/shared/components/QueryState";
import {
  ActivityList,
  AdminShell,
  AdminTopbar,
  DashboardChart,
  HealthScore,
  MetricCard,
  Panel,
  QuickActionGrid,
  TaskProgressList,
  TemplateActionDrawer,
} from "@/shared/components/admin-ui-templates/DashboardPrimitives";
import {
  createDonutOption,
  createLineAreaOption,
} from "@/shared/components/admin-ui-templates/chartOptions";
import {
  activities,
  monitorNavItems,
  opsMetrics,
  quickActions,
  taskProgressItems,
} from "@/shared/components/admin-ui-templates/sampleData";
import type {
  DrawerMode,
  QuickAction,
} from "@/shared/components/admin-ui-templates/types";

type ViewState = "ready" | "loading" | "empty" | "error";
type TrafficMode = "realtime" | "7" | "30";

const hourLabels = [
  "00:00",
  "02:00",
  "04:00",
  "06:00",
  "08:00",
  "10:00",
  "12:00",
  "14:00",
  "16:00",
  "18:00",
  "20:00",
  "22:00",
  "24:00",
];

const alerts = [
  ["数据库响应超时", "严重", "未处理", "10秒前", "red"],
  ["API接口调用失败率高", "警告", "未处理", "2分钟前", "orange"],
  ["存储空间使用率超过85%", "警告", "处理中", "5分钟前", "orange"],
  ["用户登录异常检测", "提示", "已处理", "15分钟前", "blue"],
  ["计划任务执行延迟", "提示", "已处理", "30分钟前", "blue"],
] as const;

export function OpsMonitorDashboard() {
  const { message } = AntdApp.useApp();
  const [activeNav, setActiveNav] = useState("monitor");
  const [trafficMode, setTrafficMode] = useState<TrafficMode>("realtime");
  const [viewState, setViewState] = useState<ViewState>("ready");
  const [drawerAction, setDrawerAction] = useState<QuickAction | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");

  const trafficOption = useMemo(
    () =>
      createLineAreaOption({
        colors: ["#4f46e5", "#14b8a6"],
        labels: hourLabels,
        primaryName: "访问量",
        secondaryName: "独立访客",
        primary:
          trafficMode === "realtime"
            ? [3400, 7600, 8400, 10100, 12000, 10600, 11300, 9846, 7200, 11600, 6500, 5900, 8600]
            : [6200, 7000, 7600, 8300, 9100, 9600, 10200, 11000, 10400, 11200, 11800, 12100, 12600],
        secondary:
          trafficMode === "realtime"
            ? [2200, 4200, 4800, 6200, 7200, 6600, 6900, 5800, 4300, 6500, 3900, 3500, 5200]
            : [3800, 4400, 4800, 5300, 6000, 6300, 6800, 7200, 7000, 7400, 7800, 8100, 8400],
      }),
    [trafficMode],
  );

  const deviceOption = useMemo(
    () =>
      createDonutOption({
        centerLabel: "总设备数",
        centerValue: "1,268",
        data: [
          { name: "在线设备 78.2%", value: 78.2, color: "#3b82f6" },
          { name: "离线设备 14.4%", value: 14.4, color: "#8b5cf6" },
          { name: "告警设备 4.6%", value: 4.6, color: "#f59e0b" },
          { name: "维护设备 2.8%", value: 2.8, color: "#ef4444" },
        ],
      }),
    [],
  );

  function refresh() {
    setViewState("loading");
    window.setTimeout(() => {
      setViewState("ready");
      message.success("监控数据已刷新");
    }, 500);
  }

  function openActionDrawer(action: QuickAction, mode: DrawerMode = "create") {
    setDrawerAction(action);
    setDrawerMode(mode);
  }

  return (
    <AdminShell
      variant="ops"
      activeKey={activeNav}
      navItems={monitorNavItems}
      brandTitle="智能运营管理平台"
      brandSubtitle="平台专业版"
      topbar={
        <AdminTopbar
          title="运营监控中心"
          subtitle="晚上好，超级管理员，欢迎回来！"
          searchPlaceholder="搜索功能、数据、报表..."
          userName="管理员"
          extra={
            <Space size={8}>
              <DatePicker />
              <Button onClick={refresh}>刷新</Button>
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
            </Space>
          }
        />
      }
      sidebarFooter={
        <>
          <div className="bp-ops-license">
            <strong>平台专业版</strong>
            <span>已授权 356 天</span>
            <Button size="small" type="primary">
              升级授权
            </Button>
            <i />
          </div>
        </>
      }
      onNavChange={setActiveNav}
    >
      {viewState !== "ready" ? (
        <Panel className="bp-ops-state-panel">
          <QueryState
            loading={viewState === "loading"}
            empty={viewState === "empty"}
            error={viewState === "error" ? "模拟监控接口异常，请点击重试恢复。" : null}
            onRetry={() => setViewState("ready")}
          />
        </Panel>
      ) : (
        <>
          <section className="bp-ops-metrics">
            {opsMetrics.map((metric) => (
              <MetricCard key={metric.id} metric={metric} />
            ))}
            <Panel className="bp-ops-alert-mini">
              <Tag color="red">系统告警数</Tag>
              <strong>128</strong>
              <span>较昨日 ↓ 12.5%</span>
            </Panel>
            <Panel className="bp-ops-alert-mini is-pink">
              <Tag color="magenta">平均响应时间</Tag>
              <strong>386 ms</strong>
              <span>较昨日 ↓ 6.3%</span>
            </Panel>
          </section>

          <section className="bp-ops-grid">
            <Panel
              title="访问量趋势"
              className="bp-ops-traffic"
              extra={
                <Space size={4}>
                  {(["realtime", "7", "30"] as TrafficMode[]).map((mode) => (
                    <Button
                      key={mode}
                      size="small"
                      type={trafficMode === mode ? "primary" : "text"}
                      onClick={() => setTrafficMode(mode)}
                    >
                      {mode === "realtime" ? "实时" : mode === "7" ? "近7天" : "近30天"}
                    </Button>
                  ))}
                </Space>
              }
            >
              <DashboardChart option={trafficOption} height={306} />
              <div className="bp-ops-traffic-summary">
                {[
                  ["今日总访问量", "32,568,129", "12.6%"],
                  ["今日独立访客", "12,853,529", "9.3%"],
                  ["今日页面浏览量", "68,392,681", "10.2%"],
                  ["平均访问时长", "00:06:35", "4.1%"],
                  ["跳出率", "32.45%", "2.7%"],
                ].map(([label, value, delta]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <small>较昨日 ↑ {delta}</small>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="任务执行情况">
              <TaskProgressList items={taskProgressItems} />
            </Panel>
            <Panel title="系统健康度">
              <HealthScore value={92} tone="cyan" />
            </Panel>
            <Panel title="核心系统状态">
              <div className="bp-ops-system-rings">
                {[
                  ["CPU使用率", "23%"],
                  ["内存使用率", "46%"],
                  ["磁盘使用率", "62%"],
                  ["网络负载", "32%"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <i style={{ "--ring-value": value } as React.CSSProperties} />
                    <strong>{value}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="设备在线状态">
              <DashboardChart option={deviceOption} height={230} />
            </Panel>
            <Panel title="告警实时监控" className="bp-ops-alert-list-panel">
              <div className="bp-ops-alert-list">
                {alerts.map(([title, level, status, time, tone]) => (
                  <div key={title} className={`bp-ops-alert-row is-${tone}`}>
                    <span>{title}</span>
                    <Tag color={tone}>{level}</Tag>
                    <Tag>{status}</Tag>
                    <time>{time}</time>
                  </div>
                ))}
              </div>
            </Panel>
          </section>

          <section className="bp-ops-bottom">
            <Panel title="快捷操作">
              <QuickActionGrid
                actions={quickActions.slice(4, 9)}
                compact
                onAction={(action) => openActionDrawer(action)}
              />
            </Panel>
            <Panel title="平台公告">
              <ActivityList items={activities.slice(0, 4)} />
            </Panel>
            <Panel title="今日数据摘要">
              <div className="bp-ops-digest">
                {[
                  ["新增用户", "6,732", "15.3%"],
                  ["订单总数", "3,528", "8.1%"],
                  ["交易金额", "¥1,268,732", "11.7%"],
                  ["转化率", "4.35%", "2.4%"],
                ].map(([label, value, delta]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <small>较昨日 ↑ {delta}</small>
                  </div>
                ))}
              </div>
            </Panel>
          </section>
        </>
      )}

      <TemplateActionDrawer
        open={Boolean(drawerAction)}
        title={drawerAction ? `${drawerAction.label}` : "新增任务"}
        mode={drawerMode}
        onClose={() => setDrawerAction(null)}
        onSubmit={() => {
          setDrawerAction(null);
          message.success("任务已提交");
        }}
      />
    </AdminShell>
  );
}
