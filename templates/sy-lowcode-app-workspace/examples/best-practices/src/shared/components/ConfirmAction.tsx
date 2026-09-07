import { Button, Popconfirm } from "antd";

export function ConfirmAction(props: {
  label: string;
  title?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Popconfirm
      title={props.title || `确认${props.label}？`}
      okText="确认"
      cancelText="取消"
      onConfirm={props.onConfirm}
    >
      <Button danger={props.danger} loading={props.loading} size="small">
        {props.label}
      </Button>
    </Popconfirm>
  );
}
