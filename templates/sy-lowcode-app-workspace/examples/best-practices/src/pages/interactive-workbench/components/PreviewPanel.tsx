import { Descriptions, Tag } from "antd";

import type { WorkbenchState } from "../reducer";

export function PreviewPanel({ state }: { state: WorkbenchState }) {
  return (
    <Descriptions column={1} size="small">
      <Descriptions.Item label="方案">{state.draftName}</Descriptions.Item>
      <Descriptions.Item label="模式">{state.selectedMode}</Descriptions.Item>
      <Descriptions.Item label="状态">
        <Tag color={state.dirty ? "warning" : "success"}>
          {state.dirty ? "有未保存修改" : "已保存"}
        </Tag>
      </Descriptions.Item>
    </Descriptions>
  );
}
