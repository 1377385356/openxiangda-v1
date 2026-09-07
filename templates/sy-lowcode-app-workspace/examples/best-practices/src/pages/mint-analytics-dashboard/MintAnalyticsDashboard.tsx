import { App as AntdApp, Button, DatePicker, Select, Space, Tag } from "antd";
import { useMemo, useState } from "react";

import { QueryState } from "@/shared/components/QueryState";
import {
  AdminShell,
  AdminTopbar,
  DashboardChart,
  HealthScore,
  MetricCard,
  NoticeList,
  Panel,
  QuickActionGrid,
  TemplateActionDrawer,
  TodoList,
} from "@/shared/components/admin-ui-templates/DashboardPrimitives";
import {
  createBarCompareOption,
  createDonutOption,
  createLineAreaOption,
} from "@/shared/components/admin-ui-templates/chartOptions";
import {
  mintMetrics,
  notices,
  quickActions,
  standardNavItems,
  todos,
} from "@/shared/components/admin-ui-templates/sampleData";
import type {
  DrawerMode,
  QuickAction,
} from "@/shared/components/admin-ui-templates/types";

type ViewState = "ready" | "loading" | "empty" | "error";
type CompareMode = "day" | "week" | "month";

const labels = ["03-04", "03-05", "03-06", "03-07", "03-08", "03-09", "03-10"];

export function MintAnalyticsDashboard() {
  const { message } = AntdApp.useApp();
  const [activeNav, setActiveNav] = useState("home");
  const [compareMode, setCompareMode] = useState<CompareMode>("day");
  const [viewState, setViewState] = useState<ViewState>("ready");
  const [drawerAction, setDrawerAction] = useState<QuickAction | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");

  const revenueOption = useMemo(
    () =>
      createLineAreaOption({
        colors: ["#10b981", "#3b82f6"],
        labels,
        primaryName: "营业收入",
        secondaryName: "订单金额",
        primary: [520, 570, 760, 840, 1082, 650, 1160],
        secondary: [380, 430, 520, 580, 710, 480, 690],
      }),
    [],
  );

  const compareOption = useMemo(
    () =>
      createBarCompareOption({
        labels,
        series: [
          {
            name: compareMode === "day" ? "营业收入" : "本期收入",
            data: [1120, 1210, 980, 1130, 1280, 900, 1100],
            color: "#3b82f6",
          },
          {
            name: "订单金额",
            data: [940, 810, 730, 820, 1080, 620, 760],
            color: "#10b981",
          },
          {
            name: "支付金额",
            data: [650, 590, 510, 610, 760, 430, 540],
            color: "#f59e0b",
          },
        ],
      }),
    [compareMode],
  );

  const channelOption = useMemo(
    () =>
      createDonutOption({
        centerLabel: "总订单数",
        centerValue: "12,568",
        data: [
          { name: "线上商城 38.6%", value: 38.6, color: "#10b981" },
          { name: "移动端 APP 28.7%", value: 28.7, color: "#3b82f6" },
          { name: "小程序 17.3%", value: 17.3, color: "#f59e0b" },
          { name: "第三方平台 10.5%", value: 10.5, color: "#fbbf24" },
          { name: "线下门店 4.9%", value: 4.9, color: "#cbd5e1" },
        ],
      }),
    [],
  );

  function refresh() {
    setViewState("loading");
    window.setTimeout(() => {
      setViewState("ready");
      message.success("分析数据已更新");
    }, 500);
  }

  function openActionDrawer(action: QuickAction, mode: DrawerMode = "create") {
    setDrawerAction(action);
    setDrawerMode(mode);
  }

  return (
    <AdminShell
      variant="mint"
      activeKey={activeNav}
      navItems={standardNavItems}
      brandTitle="未来数智运营平台"
      brandSubtitle="企业级数据决策中台"
      topbar={
        <AdminTopbar
          title="首页总览"
          subtitle="全面掌握业务动态，数据驱动智能决策"
          searchPlaceholder="搜索菜单、功能、报表"
          userName="管理员"
          extra={
            <Space size={8}>
              <Tag className="bp-mint-time">数据更新时间：2026-03-10 23:40:00</Tag>
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
          <div className="bp-mint-shortcuts">
            <strong>快捷入口</strong>
            <span>数据报表</span>
            <span>自定义看板</span>
            <span>数据导出</span>
            <span>帮助中心</span>
          </div>
        </>
      }
      onNavChange={setActiveNav}
    >
      {viewState !== "ready" ? (
        <Panel className="bp-mint-state-panel">
          <QueryState
            loading={viewState === "loading"}
            empty={viewState === "empty"}
            error={viewState === "error" ? "模拟分析接口异常，请点击重试恢复。" : null}
            onRetry={() => setViewState("ready")}
          />
        </Panel>
      ) : (
        <>
          <section className="bp-mint-intro">
            <div>
              <h1>
                晚上好，超级管理员 <Tag color="green">管理员</Tag>
              </h1>
              <p>本周核心指标 03.04 - 03.10</p>
            </div>
            <DatePicker />
          </section>

          <section className="bp-mint-metrics">
            {mintMetrics.map((metric) => (
              <MetricCard key={metric.id} metric={metric} />
            ))}
          </section>

          <section className="bp-mint-grid">
            <Panel title="营业收入趋势" className="bp-mint-large-panel">
              <DashboardChart option={revenueOption} height={260} />
            </Panel>
            <Panel
              title="业务对比分析"
              className="bp-mint-large-panel"
              extra={
                <Space size={4}>
                  {(["day", "week", "month"] as CompareMode[]).map((mode) => (
                    <Button
                      key={mode}
                      size="small"
                      type={compareMode === mode ? "primary" : "text"}
                      onClick={() => setCompareMode(mode)}
                    >
                      {mode === "day" ? "按日" : mode === "week" ? "按周" : "按月"}
                    </Button>
                  ))}
                </Space>
              }
            >
              <DashboardChart option={compareOption} height={260} />
            </Panel>
            <Panel title="平台通知">
              <NoticeList items={notices} />
            </Panel>
            <Panel title="用户增长趋势" className="bp-mint-large-panel">
              <DashboardChart
                height={245}
                option={createLineAreaOption({
                  colors: ["#10b981", "#3b82f6"],
                  labels,
                  primaryName: "新增用户",
                  secondaryName: "活跃用户",
                  primary: [580, 820, 860, 1050, 980, 960, 1500],
                  secondary: [900, 1320, 1350, 2140, 1780, 1700, 2400],
                })}
              />
            </Panel>
            <Panel title="渠道资源分布">
              <DashboardChart option={channelOption} height={245} />
            </Panel>
            <Panel title="待办事项">
              <TodoList items={todos} />
            </Panel>
          </section>

          <section className="bp-mint-bottom">
            <Panel title="快捷操作">
              <QuickActionGrid
                actions={quickActions.slice(0, 5)}
                compact
                onAction={(action) => openActionDrawer(action)}
              />
            </Panel>
            <Panel title="业务概览">
              <div className="bp-mint-business-summary">
                {[
                  ["商品总数", "2,350", "5.2%"],
                  ["库存预警", "32", "11.1%"],
                  ["在售商品", "1,986", "3.8%"],
                  ["库存周转率", "4.62", "6.3%"],
                ].map(([label, value, delta], index) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <small className={index === 1 ? "is-down" : ""}>
                      较上周 {index === 1 ? "↓" : "↑"} {delta}
                    </small>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="系统健康度">
              <HealthScore value={98} tone="mint" />
            </Panel>
          </section>
        </>
      )}

      <TemplateActionDrawer
        open={Boolean(drawerAction)}
        title={drawerAction ? `${drawerAction.label}` : "新建事项"}
        mode={drawerMode}
        onClose={() => setDrawerAction(null)}
        onSubmit={() => {
          setDrawerAction(null);
          message.success("表单已保存");
        }}
      />
    </AdminShell>
  );
}
