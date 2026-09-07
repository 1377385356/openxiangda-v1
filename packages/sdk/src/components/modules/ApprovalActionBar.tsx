import React, { useMemo, useState } from 'react';
import { Form, Input, Modal, Select } from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  RollbackOutlined,
  SaveOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import type { ProcessAction, ReturnPolicy, ReturnableNode, UserItem } from '../types';
import type { ActionConfig } from './FormActionBar';
import { StickyActionBar } from './StickyActionBar';
import { FormContext } from '../core/FormContext';
import { createFormRuntimeApi } from '../core/runtimeApi';
import { UserPicker } from '../fields/shared/UserPicker';
import { getUserId, getUserName } from '../fields/shared/fieldFormat';
import { useDeviceDetect } from '../hooks/useDeviceDetect';

export interface ApprovalActionBarProps {
  actions: ProcessAction[];
  onApprove?: (comments?: string) => Promise<void> | void;
  onReject?: (comments?: string) => Promise<void> | void;
  onTransfer?: (userId: string, reason?: string) => Promise<void> | void;
  onReturn?: (nodeId: string, reason?: string) => Promise<void> | void;
  onWithdraw?: (reason?: string) => Promise<void> | void;
  onSave?: () => Promise<void> | void;
  onResubmit?: (comments?: string) => Promise<void> | void;
  onCallback?: () => Promise<void> | void;
  returnableNodes?: ReturnableNode[];
  returnPolicy?: ReturnPolicy | null;
  onLoadReturnableNodes?: () => Promise<ReturnableNode[] | void> | void;
  renderTransferSelector?: (props: {
    value?: string;
    onChange: (userId: string) => void;
  }) => React.ReactNode;
  renderReturnNodeLabel?: (node: ReturnableNode) => React.ReactNode;
  renderActionModalExtra?: (action: ProcessAction) => React.ReactNode;
  maxMobileButtons?: number;
  className?: string;
  inDrawer?: boolean;
  maxWidth?: number | string;
}

type ModalAction = 'agree' | 'rejected' | 'withdraw' | 'transfer' | 'return' | 'resubmit' | null;

const actionPriority: Record<string, number> = {
  agree: 10,
  approved: 10,
  return: 20,
  transfer: 30,
  resubmit: 40,
  save: 80,
  withdraw: 90,
  rejected: 100,
  reject: 100,
};

function getActionLabel(action: ProcessAction) {
  return action.name?.zh_CN || action.text?.zh_CN || action.action;
}

function normalizeAction(action: string): ModalAction | 'save' | 'callback' {
  if (action === 'approved') return 'agree';
  if (action === 'reject') return 'rejected';
  if (
    action === 'agree' ||
    action === 'rejected' ||
    action === 'withdraw' ||
    action === 'transfer' ||
    action === 'return' ||
    action === 'resubmit'
  ) {
    return action;
  }
  if (action === 'save' || action === 'callback') return action;
  return 'agree';
}

function getModalTitle(action: ModalAction) {
  switch (action) {
    case 'agree':
      return '审批意见';
    case 'rejected':
      return '拒绝理由';
    case 'withdraw':
      return '撤销流程';
    case 'transfer':
      return '转交任务';
    case 'return':
      return '退回任务';
    case 'resubmit':
      return '重新提交';
    default:
      return '确认操作';
  }
}

function formatReturnPolicy(policy?: ReturnPolicy | null) {
  if (!policy?.resubmitMode) return null;
  return policy.resubmitMode === 'resume_current' ? '从当前节点审批' : '重新依次审批';
}

function DefaultTransferSelector({
  value,
  onChange,
}: {
  value?: string;
  onChange: (userId: string) => void;
}) {
  const formContext = React.useContext(FormContext);
  const { isMobile } = useDeviceDetect();
  const fallbackApi = useMemo(() => createFormRuntimeApi(), []);
  const api = formContext?.api ?? fallbackApi;
  const [open, setOpen] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<UserItem[]>([]);

  const selectedLabel = selectedUsers[0] ? getUserName(selectedUsers[0]) : value;

  return (
    <>
      <Input
        readOnly
        value={selectedLabel}
        onChange={() => undefined}
        placeholder="请选择转交用户"
        addonAfter={
          <span className="cursor-pointer text-blue-600" onClick={() => setOpen(true)}>
            选择
          </span>
        }
      />
      <UserPicker
        api={api}
        open={open}
        onOpenChange={setOpen}
        mobile={isMobile}
        multiple={false}
        value={selectedUsers}
        onCancel={() => setOpen(false)}
        onConfirm={(items) => {
          const next = items.slice(0, 1);
          setSelectedUsers(next);
          const userId = next[0] ? getUserId(next[0]) : '';
          onChange(userId);
        }}
      />
    </>
  );
}

export const ApprovalActionBar: React.FC<ApprovalActionBarProps> = ({
  actions,
  onApprove,
  onReject,
  onTransfer,
  onReturn,
  onWithdraw,
  onSave,
  onResubmit,
  onCallback,
  returnableNodes = [],
  returnPolicy,
  onLoadReturnableNodes,
  renderTransferSelector,
  renderReturnNodeLabel,
  renderActionModalExtra,
  maxMobileButtons = 2,
  className = '',
  inDrawer = false,
  maxWidth,
}) => {
  const [form] = Form.useForm();
  const [modalAction, setModalAction] = useState<ModalAction>(null);
  const [activeAction, setActiveAction] = useState<ProcessAction | null>(null);
  const [loading, setLoading] = useState(false);

  const visibleActions = useMemo(
    () =>
      actions
        .filter((action) => !action.hidden)
        .sort((a, b) => (actionPriority[a.action] ?? 50) - (actionPriority[b.action] ?? 50)),
    [actions],
  );

  const openModal = async (action: ProcessAction, target: ModalAction) => {
    setActiveAction(action);
    const defaultComments = action.remark?.content?.zh_CN;
    form.setFieldsValue({
      comments: defaultComments || '',
      reason: '',
      userId: undefined,
      nodeId: undefined,
    });
    if (target === 'return') {
      const loadedNodes = (await onLoadReturnableNodes?.()) || returnableNodes;
      if (loadedNodes.length === 1) {
        form.setFieldsValue({ nodeId: loadedNodes[0].nodeId || loadedNodes[0].id || '' });
      }
    }
    setModalAction(target);
  };

  const executeDirect = async (action: ProcessAction) => {
    const normalized = normalizeAction(action.action);
    if (normalized === 'save') {
      await onSave?.();
      return;
    }
    if (normalized === 'callback') {
      await onCallback?.();
      return;
    }
    if (normalized === 'agree') {
      await onApprove?.();
      return;
    }
    if (normalized === 'rejected') {
      await onReject?.();
      return;
    }
    if (normalized === 'resubmit') {
      await onResubmit?.();
    }
  };

  const handleActionClick = async (action: ProcessAction) => {
    const normalized = normalizeAction(action.action);
    if (normalized === 'save' || normalized === 'callback') {
      await executeDirect(action);
      return;
    }
    if (normalized === 'resubmit' && !action.remark?.popUp) {
      await executeDirect(action);
      return;
    }
    await openModal(action, normalized);
  };

  const handleOk = async () => {
    if (!modalAction) return;
    const values = await form.validateFields();
    setLoading(true);
    try {
      if (modalAction === 'agree') await onApprove?.(values.comments || undefined);
      if (modalAction === 'rejected') await onReject?.(values.comments || undefined);
      if (modalAction === 'withdraw')
        await onWithdraw?.(values.reason || values.comments || undefined);
      if (modalAction === 'transfer') await onTransfer?.(values.userId, values.reason || undefined);
      if (modalAction === 'return') await onReturn?.(values.nodeId, values.reason || undefined);
      if (modalAction === 'resubmit') await onResubmit?.(values.comments || undefined);
      setModalAction(null);
      setActiveAction(null);
      form.resetFields();
    } finally {
      setLoading(false);
    }
  };

  const actionConfigs: ActionConfig[] = visibleActions.map((action) => {
    const normalized = normalizeAction(action.action);
    const danger = normalized === 'rejected' || normalized === 'withdraw';
    return {
      key: action.action,
      label: getActionLabel(action),
      type: normalized === 'agree' ? 'primary' : danger ? 'danger' : 'default',
      icon:
        normalized === 'agree' ? (
          <CheckOutlined />
        ) : normalized === 'rejected' ? (
          <CloseOutlined />
        ) : normalized === 'transfer' ? (
          <SwapOutlined />
        ) : normalized === 'return' || normalized === 'withdraw' ? (
          <RollbackOutlined />
        ) : normalized === 'save' ? (
          <SaveOutlined />
        ) : undefined,
      onClick: () => handleActionClick(action),
      placement: danger || normalized === 'save' ? 'right' : 'left',
      priority: actionPriority[action.action] ?? 50,
    } as ActionConfig;
  });

  const requiredComment =
    activeAction?.remark?.required || modalAction === 'rejected' || modalAction === 'withdraw';

  return (
    <>
      <StickyActionBar
        actions={actionConfigs}
        layoutMode="approval"
        maxMobileButtons={maxMobileButtons}
        className={className}
        inDrawer={inDrawer}
        maxWidth={maxWidth}
      />
      <Modal
        getContainer={false}
        title={getModalTitle(modalAction)}
        open={modalAction !== null}
        okText="确认"
        cancelText="取消"
        confirmLoading={loading}
        onOk={handleOk}
        onCancel={() => {
          setModalAction(null);
          setActiveAction(null);
          form.resetFields();
        }}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          {modalAction === 'transfer' && (
            <Form.Item
              name="userId"
              label="转交给"
              rules={[{ required: true, message: '请选择转交用户' }]}
            >
              {renderTransferSelector ? (
                renderTransferSelector({
                  value: form.getFieldValue('userId'),
                  onChange: (userId) => form.setFieldsValue({ userId }),
                })
              ) : (
                <DefaultTransferSelector
                  value={form.getFieldValue('userId')}
                  onChange={(userId) => form.setFieldsValue({ userId })}
                />
              )}
            </Form.Item>
          )}
          {modalAction === 'return' && (
            <>
              {formatReturnPolicy(returnPolicy) && (
                <div className="mb-3 text-sm text-gray-500">
                  退回后审批逻辑：{formatReturnPolicy(returnPolicy)}
                </div>
              )}
              <Form.Item
                name="nodeId"
                label="退回到节点"
                rules={[{ required: true, message: '请选择退回节点' }]}
              >
                <Select
                  placeholder="请选择退回节点"
                  getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
                  options={returnableNodes.map((node) => ({
                    value: node.nodeId || node.id || '',
                    label: renderReturnNodeLabel
                      ? renderReturnNodeLabel(node)
                      : node.nodeName || node.name || node.nodeId || node.id,
                  }))}
                />
              </Form.Item>
            </>
          )}
          <Form.Item
            name={
              modalAction === 'withdraw' || modalAction === 'transfer' || modalAction === 'return'
                ? 'reason'
                : 'comments'
            }
            label={
              modalAction === 'withdraw'
                ? '撤销原因'
                : modalAction === 'transfer'
                  ? '转交原因'
                  : modalAction === 'return'
                    ? '退回原因'
                    : '审批意见'
            }
            rules={[{ required: requiredComment, message: '请填写说明' }]}
          >
            <Input.TextArea rows={4} maxLength={500} showCount placeholder="请输入说明" />
          </Form.Item>
          {activeAction && renderActionModalExtra?.(activeAction)}
        </Form>
      </Modal>
    </>
  );
};
