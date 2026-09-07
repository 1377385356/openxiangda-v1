import { Card, List } from "antd-mobile";

export function MobileHome() {
  return (
    <Card title="今日概览">
      <List>
        <List.Item extra="18">待处理</List.Item>
        <List.Item extra="5">超时风险</List.Item>
        <List.Item extra="64">本周完成</List.Item>
      </List>
    </Card>
  );
}
