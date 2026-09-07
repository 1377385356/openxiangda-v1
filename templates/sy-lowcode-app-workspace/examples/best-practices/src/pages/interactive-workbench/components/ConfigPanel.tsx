import { Input, Segmented, Space } from "antd";
import type { Dispatch } from "react";

import type { WorkbenchAction, WorkbenchState } from "../reducer";

export function ConfigPanel(props: {
  state: WorkbenchState;
  dispatch: Dispatch<WorkbenchAction>;
}) {
  return (
    <Space direction="vertical" className="bp-workbench__panel" size="middle">
      <Input
        value={props.state.draftName}
        onChange={(event) =>
          props.dispatch({ type: "rename", name: event.target.value })
        }
      />
      <Segmented
        value={props.state.selectedMode}
        options={[
          { label: "规划", value: "plan" },
          { label: "预览", value: "preview" },
          { label: "发布", value: "publish" },
        ]}
        onChange={(mode) =>
          props.dispatch({
            type: "selectMode",
            mode: mode as WorkbenchState["selectedMode"],
          })
        }
      />
    </Space>
  );
}
