import React, { useMemo, useState } from 'react';
import { Button, Dropdown, Form, Input, Modal } from 'antd';
import { MoreOutlined } from '@ant-design/icons';
import type { ProcessAction } from '../types';

export interface ApprovalActionsProps {
  actions: ProcessAction[];
  onApprove?: (comments?: string) => Promise<void> | void;
  onReject?: (comments?: string) => Promise<void> | void;
  onTransfer?: () => void;
  onReturn?: () => void;
  onWithdraw?: (reason?: string) => Promise<void> | void;
  onSave?: () => Promise<void> | void;
  layout?: 'horizontal' | 'vertical';
  maxVisible?: number;
  className?: string;
}

type ModalAction = 'approve' | 'reject' | 'withdraw' | null;

const priority: Record<string, number> = {
  agree: 10,
  approved: 10,
  transfer: 20,
  return: 30,
  save: 40,
  withdraw: 90,
  rejected: 100,
  reject: 100,
};

const getLabel = (action: ProcessAction) =>
  action.name?.zh_CN || action.text?.zh_CN || action.action;

export const ApprovalActions: React.FC<ApprovalActionsProps> = ({
  actions,
  onApprove,
  onReject,
  onTransfer,
  onReturn,
  onWithdraw,
  onSave,
  layout = 'horizontal',
  maxVisible = 3,
  className = '',
}) => {
  const [form] = Form.useForm();
  const [modalAction, setModalAction] = useState<ModalAction>(null);
  const [activeAction, setActiveAction] = useState<ProcessAction | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  const renderableActions = useMemo(
    () =>
      actions
        .filter((action) => !action.hidden)
        .sort((a, b) => (priority[a.action] ?? 50) - (priority[b.action] ?? 50)),
    [actions],
  );

  const openModal = (target: ModalAction, action: ProcessAction) => {
    setActiveAction(action);
    form.setFieldsValue({ comments: action.remark?.content?.zh_CN || '' });
    setModalAction(target);
  };

  const handleSave = async () => {
    setSaveLoading(true);
    try {
      await onSave?.();
    } finally {
      setSaveLoading(false);
    }
  };

  const handleAction = (action: ProcessAction) => {
    if (action.action === 'transfer') {
      onTransfer?.();
      return;
    }
    if (action.action === 'return') {
      onReturn?.();
      return;
    }
    if (action.action === 'save') {
      void handleSave();
      return;
    }
    if (action.action === 'withdraw') {
      openModal('withdraw', action);
      return;
    }
    if (action.action === 'rejected' || action.action === 'reject') {
      openModal('reject', action);
      return;
    }
    openModal('approve', action);
  };

  const handleConfirm = async () => {
    const values = await form.validateFields();
    setLoading(true);
    try {
      if (modalAction === 'approve') await onApprove?.(values.comments || undefined);
      if (modalAction === 'reject') await onReject?.(values.comments || undefined);
      if (modalAction === 'withdraw') await onWithdraw?.(values.comments || undefined);
      setModalAction(null);
      setActiveAction(null);
      form.resetFields();
    } finally {
      setLoading(false);
    }
  };

  const visibleButtons = renderableActions.slice(0, maxVisible);
  const moreButtons = renderableActions.slice(maxVisible);
  const title =
    modalAction === 'approve' ? '审批意见' : modalAction === 'reject' ? '拒绝理由' : '撤销原因';

  const button = (action: ProcessAction) => (
    <Button
      key={action.action}
      type={action.action === 'agree' || action.action === 'approved' ? 'primary' : 'default'}
      danger={
        action.action === 'rejected' || action.action === 'reject' || action.action === 'withdraw'
      }
      onClick={() => handleAction(action)}
      loading={action.action === 'save' && saveLoading}
    >
      {getLabel(action)}
    </Button>
  );

  return (
    <>
      <div
        className={`${
          layout === 'horizontal'
            ? 'flex items-center justify-center gap-3'
            : 'flex flex-col items-center gap-2'
        } ${className}`}
      >
        {visibleButtons.map(button)}
        {moreButtons.length > 0 && (
          <Dropdown
            trigger={['click']}
            getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
            menu={{
              items: moreButtons.map((action) => ({
                key: action.action,
                label: getLabel(action),
                danger:
                  action.action === 'rejected' ||
                  action.action === 'reject' ||
                  action.action === 'withdraw',
                onClick: () => handleAction(action),
              })),
            }}
          >
            <Button icon={<MoreOutlined />}>更多</Button>
          </Dropdown>
        )}
      </div>
      <Modal
        getContainer={false}
        title={title}
        open={modalAction !== null}
        okText="确认"
        cancelText="取消"
        confirmLoading={loading}
        onOk={handleConfirm}
        onCancel={() => {
          setModalAction(null);
          setActiveAction(null);
          form.resetFields();
        }}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="comments"
            label={modalAction === 'approve' ? '审批意见' : '请输入理由'}
            rules={[
              {
                required: Boolean(activeAction?.remark?.required) || modalAction !== 'approve',
                message: '请填写说明',
              },
            ]}
          >
            <Input.TextArea rows={4} maxLength={500} showCount placeholder="请输入说明" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
