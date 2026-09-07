import { Button, Card, Space, Typography } from "antd";
import { useReducer } from "react";

import { ConfigPanel } from "./components/ConfigPanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { initialWorkbenchState, workbenchReducer } from "./reducer";

export function WorkbenchPage() {
  const [state, dispatch] = useReducer(workbenchReducer, initialWorkbenchState);
  return (
    <main className="bp-workbench">
      <section className="bp-workbench__header">
        <div>
          <Typography.Title level={3}>交互工作台</Typography.Title>
          <Typography.Text type="secondary">
            reducer 管理交互状态，面板拆分，页面只负责组合。
          </Typography.Text>
        </div>
        <Space>
          <Button disabled={!state.dirty} onClick={() => dispatch({ type: "saved" })}>
            保存
          </Button>
          <Button type="primary">发布</Button>
        </Space>
      </section>
      <section className="bp-workbench__grid">
        <Card title="配置">
          <ConfigPanel state={state} dispatch={dispatch} />
        </Card>
        <Card title="预览">
          <PreviewPanel state={state} />
        </Card>
      </section>
    </main>
  );
}
