import { Alert, Button, Empty, Spin } from "antd";

export function QueryState(props: {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  onRetry?: () => void;
}) {
  if (props.loading) {
    return (
      <div className="bp-query-state">
        <Spin />
      </div>
    );
  }
  if (props.error) {
    return (
      <Alert
        type="error"
        showIcon
        message="加载失败"
        description={props.error}
        action={
          props.onRetry ? (
            <Button size="small" onClick={props.onRetry}>
              重试
            </Button>
          ) : null
        }
      />
    );
  }
  if (props.empty) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />;
  }
  return null;
}
