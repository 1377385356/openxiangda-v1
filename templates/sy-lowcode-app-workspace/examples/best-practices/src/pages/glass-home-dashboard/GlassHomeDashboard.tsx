import { App as AntdApp, Button, Select, Space, Tag } from "antd";
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
  RankingList,
  TemplateActionDrawer,
} from "@/shared/components/admin-ui-templates/DashboardPrimitives";
import {
  createDonutOption,
  createLineAreaOption,
} from "@/shared/components/admin-ui-templates/chartOptions";
import {
  activities,
  glassMetrics,
  quickActions,
  rankingItems,
  standardNavItems,
} from "@/shared/components/admin-ui-templates/sampleData";
import type {
  DrawerMode,
  QuickAction,
} from "@/shared/components/admin-ui-templates/types";

type ViewState = "ready" | "loading" | "empty" | "error";
type RangeKey = "7" | "30" | "90";

const labels = ["03-04", "03-05", "03-06", "03-07", "03-08", "03-09", "03-10"];

export function GlassHomeDashboard() {
  const { message } = AntdApp.useApp();
  const [activeNav, setActiveNav] = useState("home");
  const [range, setRange] = useState<RangeKey>("7");
  const [viewState, setViewState] = useState<ViewState>("ready");
  const [drawerAction, setDrawerAction] = useState<QuickAction | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");

  const lineOption = useMemo(
    () =>
      createLineAreaOption({
        colors: ["#3b82f6", "#10b981"],
        labels,
        primaryName: "销售额（元）",
        secondaryName: "订单数（笔）",
        primary: range === "7" ? [72, 48, 70, 66, 88, 76, 98] : [48, 66, 74, 82, 92, 88, 108],
        secondary: range === "7" ? [42, 28, 45, 35, 54, 39, 50] : [30, 43, 52, 59, 68, 62, 76],
      }),
    [range],
  );

  const donutOption = useMemo(
    () =>
      createDonutOption({
        centerLabel: "总销售额",
        centerValue: "¥632,316",
        data: [
          { name: "官网商城 35.6%", value: 35.6, color: "#3b82f6" },
          { name: "移动端 28.3%", value: 28.3, color: "#10b981" },
          { name: "合作伙伴 17.8%", value: 17.8, color: "#8b5cf6" },
          { name: "线下门店 11.6%", value: 11.6, color: "#fb923c" },
          { name: "其他渠道 6.7%", value: 6.7, color: "#cbd5e1" },
        ],
      }),
    [],
  );

  function refresh() {
    setViewState("loading");
    window.setTimeout(() => {
      setViewState("ready");
      message.success("数据已刷新");
    }, 500);
  }

  function openActionDrawer(action: QuickAction, mode: DrawerMode = "create") {
    setDrawerAction(action);
    setDrawerMode(mode);
  }

  const topbar = (
    <AdminTopbar
      title="首页"
      searchPlaceholder="搜索功能、数据、报表"
      userName="管理员"
      extra={
        <Space size={8}>
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
  );

  return (
    <AdminShell
      variant="glass"
      activeKey={activeNav}
      navItems={standardNavItems}
      brandTitle="未来数据管理平台"
      brandSubtitle="企业级数据决策中台"
      topbar={topbar}
      onNavChange={setActiveNav}
    >
      {viewState !== "ready" ? (
        <Panel className="bp-glass-state-panel">
          <QueryState
            loading={viewState === "loading"}
            empty={viewState === "empty"}
            error={viewState === "error" ? "模拟接口异常，请点击重试恢复。" : null}
            onRetry={() => setViewState("ready")}
          />
        </Panel>
      ) : (
        <>
          <section className="bp-glass-hero-grid">
            <Panel className="bp-glass-hero">
              <div className="bp-glass-hero__copy">
                <h1>晚上好，超级管理员 👋</h1>
                <p>欢迎使用未来科技管理平台，今天是 2026年03月10日 星期二</p>
                <div className="bp-glass-hero__pills">
                  <Tag color="blue">今日访问 1,268</Tag>
                  <Tag color="red">待办事项 8</Tag>
                  <Tag color="purple">系统消息 12</Tag>
                </div>
              </div>
              <div className="bp-glass-hero__visual" aria-hidden="true">
                <i className="card card-a" />
                <i className="card card-b" />
                <i className="card card-c" />
                <i className="wave" />
              </div>
            </Panel>
            <Panel title="快捷操作" extra={<Button size="small">自定义</Button>}>
              <QuickActionGrid
                actions={quickActions}
                onAction={(action) => openActionDrawer(action)}
              />
            </Panel>
          </section>

          <section className="bp-glass-metrics">
            {glassMetrics.map((metric) => (
              <MetricCard key={metric.id} metric={metric} />
            ))}
          </section>

          <section className="bp-glass-main-grid">
            <Panel
              title="数据概览"
              className="bp-glass-chart-panel"
              extra={
                <Space size={4}>
                  {(["7", "30", "90"] as RangeKey[]).map((item) => (
                    <Button
                      key={item}
                      size="small"
                      type={range === item ? "primary" : "text"}
                      onClick={() => setRange(item)}
                    >
                      近{item}天
                    </Button>
                  ))}
                </Space>
              }
            >
              <div className="bp-glass-chart-split">
                <DashboardChart option={lineOption} height={255} />
                <DashboardChart option={donutOption} height={255} />
              </div>
            </Panel>
            <div className="bp-glass-side-stack">
              <Panel title="排行榜">
                <RankingList items={rankingItems} />
              </Panel>
              <Panel title="最近动态">
                <ActivityList items={activities} />
              </Panel>
            </div>
          </section>

          <section className="bp-glass-bottom-grid">
            <Panel title="目标达成">
              <div className="bp-glass-targets">
                {glassMetrics.slice(0, 4).map((item, index) => (
                  <div key={item.id}>
                    <span>{item.label}目标</span>
                    <strong>{index === 1 ? "55.1%" : "52.7%"}</strong>
                    <div>
                      <i style={{ width: `${index === 1 ? 55 : 52}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="系统健康度">
              <HealthScore value={98} />
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
