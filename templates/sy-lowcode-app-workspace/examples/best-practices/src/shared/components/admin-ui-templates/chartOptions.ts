export function createLineAreaOption(config: {
  colors: [string, string];
  labels: string[];
  primaryName: string;
  secondaryName?: string;
  primary: number[];
  secondary?: number[];
}) {
  return {
    color: config.colors,
    tooltip: { trigger: "axis" },
    grid: { left: 42, right: 24, top: 44, bottom: 32 },
    legend: {
      top: 4,
      left: 0,
      itemWidth: 10,
      itemHeight: 6,
      textStyle: { color: "#64748b", fontSize: 12 },
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: config.labels,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#dbe4f0" } },
      axisLabel: { color: "#64748b" },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "#64748b" },
      splitLine: { lineStyle: { color: "#e8eef7", type: "dashed" } },
    },
    series: [
      {
        name: config.primaryName,
        type: "line",
        smooth: true,
        symbolSize: 8,
        data: config.primary,
        areaStyle: { opacity: 0.16 },
        lineStyle: { width: 3 },
      },
      ...(config.secondary
        ? [
            {
              name: config.secondaryName || "对比值",
              type: "line",
              smooth: true,
              symbolSize: 7,
              data: config.secondary,
              areaStyle: { opacity: 0.08 },
              lineStyle: { width: 3 },
            },
          ]
        : []),
    ],
  };
}

export function createBarCompareOption(config: {
  labels: string[];
  series: Array<{ name: string; data: number[]; color: string }>;
}) {
  return {
    tooltip: { trigger: "axis" },
    grid: { left: 42, right: 16, top: 44, bottom: 32 },
    legend: {
      top: 4,
      left: 0,
      itemWidth: 10,
      itemHeight: 6,
      textStyle: { color: "#64748b", fontSize: 12 },
    },
    xAxis: {
      type: "category",
      data: config.labels,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#dbe4f0" } },
      axisLabel: { color: "#64748b" },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "#64748b" },
      splitLine: { lineStyle: { color: "#e8eef7", type: "dashed" } },
    },
    series: config.series.map((item) => ({
      name: item.name,
      type: "bar",
      data: item.data,
      itemStyle: { color: item.color, borderRadius: [6, 6, 0, 0] },
      barWidth: 12,
    })),
  };
}

export function createDonutOption(config: {
  centerLabel: string;
  centerValue: string;
  data: Array<{ name: string; value: number; color: string }>;
}) {
  return {
    tooltip: { trigger: "item" },
    color: config.data.map((item) => item.color),
    legend: {
      orient: "vertical",
      right: 0,
      top: "middle",
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: "#475569", fontSize: 12 },
    },
    graphic: [
      {
        type: "text",
        left: "23%",
        top: "43%",
        style: {
          text: `${config.centerValue}\n${config.centerLabel}`,
          textAlign: "center",
          fill: "#0f172a",
          fontSize: 14,
          lineHeight: 22,
          fontWeight: 600,
        },
      },
    ],
    series: [
      {
        name: config.centerLabel,
        type: "pie",
        radius: ["52%", "76%"],
        center: ["28%", "50%"],
        avoidLabelOverlap: true,
        label: { show: false },
        itemStyle: { borderColor: "#ffffff", borderWidth: 3 },
        data: config.data,
      },
    ],
  };
}
