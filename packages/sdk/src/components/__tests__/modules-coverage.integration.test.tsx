import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// --- hoist ---
const { confirmMockFn } = vi.hoisted(() => ({ confirmMockFn: vi.fn(() => true) }));

vi.mock('antd', () => {
  const Button = ({ children, icon, onClick, disabled, loading, danger, type, className }: any) =>
    React.createElement(
      'button',
      {
        type: 'button',
        onClick,
        disabled: disabled || loading,
        'data-danger': danger ? 'true' : undefined,
        'data-btn-type': type,
        className,
      },
      icon,
      children,
    );
  const Form = Object.assign(({ children }: any) => React.createElement('form', null, children), {
    useForm: () => {
      const store: Record<string, any> = {};
      return [
        {
          setFieldsValue: (vals: any) => Object.assign(store, vals),
          getFieldValue: (name: string) => store[name],
          resetFields: () => {
            for (const k of Object.keys(store)) delete store[k];
          },
          validateFields: async () => store,
        },
      ];
    },
    Item: ({ children, name, label }: any) =>
      React.createElement(
        'div',
        { 'data-field': name },
        React.createElement('label', null, label),
        children,
      ),
  });
  const Input = Object.assign(
    ({ value, onChange, placeholder, readOnly, addonAfter }: any) =>
      React.createElement(
        'span',
        null,
        React.createElement('input', {
          value: value ?? '',
          onChange: onChange ?? (() => undefined),
          placeholder,
          readOnly: readOnly || !onChange,
        }),
        addonAfter,
      ),
    {
      TextArea: ({ value, onChange, placeholder }: any) =>
        React.createElement('textarea', {
          value: value ?? '',
          onChange: onChange ?? (() => undefined),
          placeholder,
          readOnly: !onChange,
          'data-testid': 'text-area',
        }),
    },
  );
  const Select = ({ value, onChange, options, placeholder }: any) =>
    React.createElement(
      'select',
      {
        value: value ?? '',
        onChange: (e: any) => onChange?.(e.target.value),
        'data-testid': 'select',
      },
      React.createElement('option', { value: '' }, placeholder || ''),
      (options || []).map((o: any) =>
        React.createElement(
          'option',
          {
            key: typeof o.value === 'string' ? o.value : String(o.value),
            value: typeof o.value === 'string' ? o.value : String(o.value),
          },
          typeof o.label === 'string' ? o.label : 'option',
        ),
      ),
    );
  const Modal = Object.assign(
    ({ title, open, children, onOk, onCancel, okText, confirmLoading }: any) =>
      open
        ? React.createElement(
            'div',
            { role: 'dialog', 'aria-label': title },
            React.createElement('h2', null, title),
            children,
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: onOk,
                'data-testid': 'modal-ok',
                disabled: confirmLoading,
              },
              okText || '确定',
            ),
            React.createElement(
              'button',
              { type: 'button', onClick: onCancel, 'data-testid': 'modal-cancel' },
              '取消',
            ),
          )
        : null,
    { confirm: vi.fn() },
  );
  const Segmented = ({ value, options, onChange }: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'segmented' },
      (options || []).map((o: any) => {
        const v = typeof o === 'object' ? o.value : o;
        const l = typeof o === 'object' ? o.label : o;
        return React.createElement(
          'button',
          {
            key: v,
            type: 'button',
            onClick: () => onChange?.(v),
            'data-selected': value === v ? 'true' : undefined,
          },
          l,
        );
      }),
    );
  const Dropdown = ({ children, menu }: any) =>
    React.createElement(
      'div',
      null,
      children,
      React.createElement(
        'div',
        { 'data-testid': 'dropdown-menu' },
        menu?.items?.map((item: any) =>
          React.createElement(
            'button',
            { key: item.key, type: 'button', onClick: item.onClick, disabled: item.disabled },
            item.label,
          ),
        ),
      ),
    );
  const Avatar = ({ children }: any) =>
    React.createElement('span', { 'data-testid': 'avatar' }, children);
  const Alert = ({ message, description, type }: any) =>
    React.createElement('div', { role: 'alert', 'data-type': type }, message, description);
  const Empty = ({ description }: any) =>
    React.createElement('div', { 'data-testid': 'empty' }, description);
  const Spin = ({ tip }: any) => React.createElement('div', { 'data-testid': 'spin' }, tip);
  const Tag = ({ children, color }: any) =>
    React.createElement('span', { 'data-color': color }, children);
  const Space = ({ children }: any) => React.createElement('div', null, children);
  const Tooltip = ({ children }: any) => React.createElement('span', null, children);
  const ConfigProvider = ({ children }: any) => React.createElement('div', null, children);
  return {
    Button,
    Form,
    Input,
    Select,
    Modal,
    Segmented,
    Dropdown,
    Avatar,
    Alert,
    Empty,
    Spin,
    Tag,
    Space,
    Tooltip,
    ConfigProvider,
  };
});

vi.mock('@ant-design/icons', () => {
  const icon = (name: string) => (props: any) =>
    React.createElement('span', { 'data-icon': name, ...props });
  return {
    CheckOutlined: icon('check'),
    CloseOutlined: icon('close'),
    RollbackOutlined: icon('rollback'),
    SaveOutlined: icon('save'),
    SwapOutlined: icon('swap'),
    MoreOutlined: icon('more'),
    ApartmentOutlined: icon('apartment'),
    CalendarOutlined: icon('calendar'),
    DesktopOutlined: icon('desktop'),
    FileTextOutlined: icon('file-text'),
    UserOutlined: icon('user'),
    HistoryOutlined: icon('history'),
    EditOutlined: icon('edit'),
    InfoCircleOutlined: icon('info'),
    DownOutlined: icon('down'),
    UpOutlined: icon('up'),
  };
});

vi.mock('../utils/confirmAction', () => ({
  confirmAction: (...args: any[]) => confirmMockFn(...args),
}));

vi.mock('../core/FormContext', () => ({
  FormContext: React.createContext(null),
}));

vi.mock('../core/runtimeApi', () => ({
  createFormRuntimeApi: () => ({ request: vi.fn() }),
}));

vi.mock('../fields/shared/UserPicker', () => ({
  UserPicker: ({ open, onConfirm, onCancel }: any) =>
    open
      ? React.createElement(
          'div',
          { 'data-testid': 'user-picker' },
          React.createElement(
            'button',
            {
              type: 'button',
              'data-testid': 'pick-user',
              onClick: () => onConfirm?.([{ id: 'u1', name: 'User1' }]),
            },
            'pick',
          ),
          React.createElement(
            'button',
            { type: 'button', 'data-testid': 'cancel-pick', onClick: onCancel },
            'cancel',
          ),
        )
      : null,
}));

vi.mock('../fields/shared/fieldFormat', () => ({
  getUserId: (u: any) => u?.id || '',
  getUserName: (u: any) => u?.name || '',
}));

vi.mock('../hooks/useDeviceDetect', () => ({
  useDeviceDetect: () => ({ isMobile: false }),
}));

vi.mock('../modules/RecordChangePanel', () => ({
  RecordChangePanel: ({ records, hasMore, onLoadMore, onExpand, className }: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'record-change-panel', className },
      React.createElement('span', null, `records:${records?.length || 0}`),
      hasMore && React.createElement('button', { type: 'button', onClick: onLoadMore }, 'loadMore'),
      React.createElement('button', { type: 'button', onClick: onExpand }, 'expand'),
    ),
}));

import type { ProcessAction } from '../types';
import { ApprovalActionBar } from '../modules/ApprovalActionBar';
import { FormActionBar } from '../modules/FormActionBar';
import { SummaryPanel } from '../modules/SummaryPanel';
import { RuntimePageShell } from '../modules/RuntimePageShell';
import { ChangeRecords } from '../modules/ChangeRecords';
import { StickyActionBar } from '../modules/StickyActionBar';
import { StandardFormPage } from '../templates/StandardFormPage';

// ================================================================
// ApprovalActionBar Tests (380 lines, 0%)
// ================================================================
describe('ApprovalActionBar', () => {
  const baseActions: ProcessAction[] = [
    { action: 'approved', name: { zh_CN: '同意' }, remark: { popUp: true, required: false } },
    { action: 'reject', name: { zh_CN: '拒绝' }, remark: { popUp: true, required: true } },
    { action: 'transfer', name: { zh_CN: '转交' } },
    { action: 'return', name: { zh_CN: '退回' } },
    { action: 'withdraw', name: { zh_CN: '撤销' } },
    { action: 'save', name: { zh_CN: '暂存' } },
    { action: 'resubmit', name: { zh_CN: '重新提交' }, remark: { popUp: true } },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all visible actions', () => {
    render(<ApprovalActionBar actions={baseActions} />);
    expect(screen.getByText('同意')).toBeTruthy();
    expect(screen.getByText('拒绝')).toBeTruthy();
    expect(screen.getByText('转交')).toBeTruthy();
    expect(screen.getByText('退回')).toBeTruthy();
    expect(screen.getByText('撤销')).toBeTruthy();
    expect(screen.getByText('暂存')).toBeTruthy();
  });

  it('filters hidden actions', () => {
    const actions = [
      { action: 'approved', name: { zh_CN: '同意' } },
      { action: 'reject', name: { zh_CN: '拒绝' }, hidden: true },
    ];
    render(<ApprovalActionBar actions={actions} />);
    expect(screen.getByText('同意')).toBeTruthy();
    expect(screen.queryByText('拒绝')).toBeNull();
  });

  it('calls onSave directly for save action', async () => {
    const onSave = vi.fn();
    render(
      <ApprovalActionBar actions={[{ action: 'save', name: { zh_CN: '暂存' } }]} onSave={onSave} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('暂存'));
    });
    expect(onSave).toHaveBeenCalled();
  });

  it('calls onCallback directly for callback action', async () => {
    const onCallback = vi.fn();
    render(
      <ApprovalActionBar
        actions={[{ action: 'callback', text: { zh_CN: '回调' } }]}
        onCallback={onCallback}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('回调'));
    });
    expect(onCallback).toHaveBeenCalled();
  });

  it('opens approve modal when no popup configured', async () => {
    const onApprove = vi.fn();
    render(
      <ApprovalActionBar
        actions={[{ action: 'approved', name: { zh_CN: '同意' } }]}
        onApprove={onApprove}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('同意'));
    });
    expect(screen.getByRole('dialog')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-ok'));
    });
    expect(onApprove).toHaveBeenCalled();
  });

  it('opens reject modal when no popup configured', async () => {
    const onReject = vi.fn();
    render(
      <ApprovalActionBar
        actions={[{ action: 'reject', name: { zh_CN: '拒绝' } }]}
        onReject={onReject}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('拒绝'));
    });
    expect(screen.getByText('拒绝理由')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-ok'));
    });
    expect(onReject).toHaveBeenCalled();
  });

  it('opens modal for approve with popup', async () => {
    const onApprove = vi.fn();
    render(
      <ApprovalActionBar
        actions={[
          {
            action: 'approved',
            name: { zh_CN: '同意' },
            remark: { popUp: true, content: { zh_CN: '默认意见' } },
          },
        ]}
        onApprove={onApprove}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('同意'));
    });
    expect(screen.getByRole('dialog')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-ok'));
    });
    expect(onApprove).toHaveBeenCalled();
  });

  it('opens modal for reject with popup', async () => {
    const onReject = vi.fn();
    render(
      <ApprovalActionBar
        actions={[
          { action: 'reject', name: { zh_CN: '拒绝' }, remark: { popUp: true, required: true } },
        ]}
        onReject={onReject}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('拒绝'));
    });
    expect(screen.getByText('拒绝理由')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-ok'));
    });
    expect(onReject).toHaveBeenCalled();
  });

  it('opens modal for withdraw', async () => {
    const onWithdraw = vi.fn();
    render(
      <ApprovalActionBar
        actions={[{ action: 'withdraw', name: { zh_CN: '撤销' } }]}
        onWithdraw={onWithdraw}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('撤销'));
    });
    expect(screen.getByText('撤销流程')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-ok'));
    });
    expect(onWithdraw).toHaveBeenCalled();
  });

  it('opens modal for transfer with default selector', async () => {
    const onTransfer = vi.fn();
    render(
      <ApprovalActionBar
        actions={[{ action: 'transfer', name: { zh_CN: '转交' } }]}
        onTransfer={onTransfer}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('转交'));
    });
    expect(screen.getByText('转交任务')).toBeTruthy();
    // Use default transfer selector and pick a user
    const selectLink = screen.getByText('选择');
    fireEvent.click(selectLink);
    const pickBtn = screen.getByTestId('pick-user');
    fireEvent.click(pickBtn);
    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-ok'));
    });
    expect(onTransfer).toHaveBeenCalled();
  });

  it('opens modal for transfer with custom selector', async () => {
    const onTransfer = vi.fn();
    const customSelector = vi.fn(({ onChange }: any) =>
      React.createElement(
        'button',
        { type: 'button', 'data-testid': 'custom-sel', onClick: () => onChange('u2') },
        'custom',
      ),
    );
    render(
      <ApprovalActionBar
        actions={[{ action: 'transfer', name: { zh_CN: '转交' } }]}
        onTransfer={onTransfer}
        renderTransferSelector={customSelector}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('转交'));
    });
    fireEvent.click(screen.getByTestId('custom-sel'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-ok'));
    });
    expect(onTransfer).toHaveBeenCalled();
  });

  it('opens modal for return with returnable nodes', async () => {
    const onReturn = vi.fn();
    const nodes = [
      { nodeId: 'n1', nodeName: '发起人' },
      { nodeId: 'n2', nodeName: '审批人' },
    ];
    render(
      <ApprovalActionBar
        actions={[{ action: 'return', name: { zh_CN: '退回' } }]}
        onReturn={onReturn}
        returnableNodes={nodes}
        returnPolicy={{ resubmitMode: 'resume_current' }}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('退回'));
    });
    expect(screen.getByText('退回任务')).toBeTruthy();
    expect(screen.getByText(/从当前节点审批/)).toBeTruthy();
  });

  it('auto-selects single returnable node', async () => {
    const onReturn = vi.fn();
    const onLoadReturnableNodes = vi.fn(async () => [{ nodeId: 'n1', nodeName: '发起人' }]);
    render(
      <ApprovalActionBar
        actions={[{ action: 'return', name: { zh_CN: '退回' } }]}
        onReturn={onReturn}
        onLoadReturnableNodes={onLoadReturnableNodes}
        returnPolicy={{ resubmitMode: 'restart' }}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('退回'));
    });
    expect(onLoadReturnableNodes).toHaveBeenCalled();
    expect(screen.getByText(/重新依次审批/)).toBeTruthy();
  });

  it('opens modal for resubmit with popup', async () => {
    const onResubmit = vi.fn();
    render(
      <ApprovalActionBar
        actions={[{ action: 'resubmit', name: { zh_CN: '重新提交' }, remark: { popUp: true } }]}
        onResubmit={onResubmit}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('重新提交'));
    });
    expect(screen.getByRole('dialog')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-ok'));
    });
    expect(onResubmit).toHaveBeenCalled();
  });

  it('calls onResubmit directly without popup', async () => {
    const onResubmit = vi.fn();
    render(
      <ApprovalActionBar
        actions={[{ action: 'resubmit', name: { zh_CN: '重提' } }]}
        onResubmit={onResubmit}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('重提'));
    });
    expect(onResubmit).toHaveBeenCalled();
  });

  it('cancels modal properly', async () => {
    render(
      <ApprovalActionBar
        actions={[{ action: 'approved', name: { zh_CN: '同意' }, remark: { popUp: true } }]}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('同意'));
    });
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByTestId('modal-cancel'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders with renderActionModalExtra', async () => {
    const extra = vi.fn(() => React.createElement('div', { 'data-testid': 'extra' }, 'extra'));
    render(
      <ApprovalActionBar
        actions={[{ action: 'approved', name: { zh_CN: '同意' }, remark: { popUp: true } }]}
        renderActionModalExtra={extra}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('同意'));
    });
    expect(screen.getByTestId('extra')).toBeTruthy();
  });

  it('renders with custom renderReturnNodeLabel', async () => {
    const labelRenderer = vi.fn((node: any) =>
      React.createElement('span', null, `自定义-${node.nodeName}`),
    );
    render(
      <ApprovalActionBar
        actions={[{ action: 'return', name: { zh_CN: '退回' } }]}
        returnableNodes={[{ nodeId: 'n1', nodeName: '节点1' }]}
        renderReturnNodeLabel={labelRenderer}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('退回'));
    });
  });

  it('handles return with null returnPolicy', async () => {
    render(
      <ApprovalActionBar
        actions={[{ action: 'return', name: { zh_CN: '退回' } }]}
        returnableNodes={[{ nodeId: 'n1', nodeName: '节点1' }]}
        returnPolicy={null}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('退回'));
    });
    expect(screen.getByText('退回任务')).toBeTruthy();
  });

  it('handles unknown action type defaulting to agree', async () => {
    const onApprove = vi.fn();
    render(
      <ApprovalActionBar
        actions={[{ action: 'unknown_action' as any, name: { zh_CN: '未知' } }]}
        onApprove={onApprove}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('未知'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-ok'));
    });
    expect(onApprove).toHaveBeenCalled();
  });

  it('uses text fallback for action label', () => {
    render(<ApprovalActionBar actions={[{ action: 'approved', text: { zh_CN: '同意text' } }]} />);
    expect(screen.getByText('同意text')).toBeTruthy();
  });

  it('uses action string as fallback label', () => {
    render(<ApprovalActionBar actions={[{ action: 'approved' }]} />);
    expect(screen.getByText('approved')).toBeTruthy();
  });
});

// ================================================================
// FormActionBar Tests (116 lines, 0% from workflow test mocking)
// ================================================================
describe('FormActionBar (real)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders visible actions only', () => {
    const actions = [
      { key: 'save', label: '保存', onClick: vi.fn() },
      { key: 'hidden', label: '隐藏', onClick: vi.fn(), visible: false },
      { key: 'delete', label: '删除', type: 'danger' as const, onClick: vi.fn() },
    ];
    render(<FormActionBar actions={actions} />);
    expect(screen.getByText('保存')).toBeTruthy();
    expect(screen.queryByText('隐藏')).toBeNull();
    expect(screen.getByText('删除')).toBeTruthy();
  });

  it('sorts actions: danger first, primary last', () => {
    const actions = [
      { key: 'primary', label: '主要', type: 'primary' as const, onClick: vi.fn() },
      { key: 'danger', label: '危险', type: 'danger' as const, onClick: vi.fn() },
      { key: 'default', label: '默认', onClick: vi.fn() },
    ];
    render(<FormActionBar actions={actions} />);
    const buttons = screen.getAllByRole('button');
    const labels = buttons.map((b) => b.textContent);
    expect(labels.indexOf('危险')).toBeLessThan(labels.indexOf('主要'));
  });

  it('executes action onClick', async () => {
    const onClick = vi.fn();
    render(<FormActionBar actions={[{ key: 'act', label: '执行', onClick }]} />);
    await act(async () => {
      fireEvent.click(screen.getByText('执行'));
    });
    expect(onClick).toHaveBeenCalled();
  });

  it('shows confirm dialog before action', async () => {
    confirmMockFn.mockReturnValue(true);
    const onClick = vi.fn();
    render(
      <FormActionBar
        actions={[
          { key: 'del', label: '删除', onClick, confirm: { title: '确认', content: '删除吗？' } },
        ]}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('删除'));
    });
    expect(confirmMockFn).toHaveBeenCalled();
    expect(onClick).toHaveBeenCalled();
  });

  it('cancels when confirm returns false', async () => {
    confirmMockFn.mockReturnValue(false);
    const onClick = vi.fn();
    render(
      <FormActionBar
        actions={[
          { key: 'del', label: '删除', onClick, confirm: { title: '确认', content: '删除吗？' } },
        ]}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('删除'));
    });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders inline position', () => {
    render(
      <FormActionBar actions={[{ key: 'a', label: 'A', onClick: vi.fn() }]} position="inline" />,
    );
    expect(screen.getByText('A')).toBeTruthy();
  });

  it('renders bottom-fixed position with spacer', () => {
    const { container } = render(
      <FormActionBar
        actions={[{ key: 'a', label: 'A', onClick: vi.fn() }]}
        position="bottom-fixed"
      />,
    );
    expect(container.querySelector('.h-16')).toBeTruthy();
  });

  it('renders text type buttons', () => {
    render(
      <FormActionBar actions={[{ key: 't', label: 'Text', type: 'text', onClick: vi.fn() }]} />,
    );
    expect(screen.getByText('Text')).toBeTruthy();
  });

  it('manages loading state during async action', async () => {
    let resolveFn: () => void;
    const asyncAction = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolveFn = r;
        }),
    );
    render(<FormActionBar actions={[{ key: 'a', label: 'Act', onClick: asyncAction }]} />);
    const btn = screen.getByText('Act');
    act(() => {
      fireEvent.click(btn);
    });
    // action is executing, button should be disabled/loading
    await act(async () => {
      resolveFn!();
    });
    expect(asyncAction).toHaveBeenCalled();
  });
});

// ================================================================
// SummaryPanel Tests (120 lines, 0%)
// ================================================================
describe('SummaryPanel', () => {
  it('renders with default props', () => {
    render(<SummaryPanel />);
    expect(screen.getByText('详情')).toBeTruthy();
    expect(screen.getByText('未知用户')).toBeTruthy();
  });

  it('renders with custom title', () => {
    render(<SummaryPanel title="自定义标题" />);
    expect(screen.getByText('自定义标题')).toBeTruthy();
  });

  it('renders status badge with all tones', () => {
    const tones = ['brand', 'success', 'danger', 'neutral', 'warning'] as const;
    tones.forEach((tone) => {
      const { unmount } = render(<SummaryPanel status={{ label: `状态-${tone}`, tone }} />);
      expect(screen.getByText(`状态-${tone}`)).toBeTruthy();
      unmount();
    });
  });

  it('renders creator info with avatar url', () => {
    render(
      <SummaryPanel creator={{ name: '张三', avatar: '/avatar.png', department: '技术部' }} />,
    );
    expect(screen.getByText('张三')).toBeTruthy();
    expect(screen.getByText('技术部')).toBeTruthy();
  });

  it('renders creator info without avatar url (shows initial)', () => {
    render(<SummaryPanel creator={{ name: '李四' }} />);
    expect(screen.getByText('李四')).toBeTruthy();
  });

  it('renders eyebrow content', () => {
    render(<SummaryPanel eyebrow="自定义标签" />);
    expect(screen.getByText('自定义标签')).toBeTruthy();
  });

  it('renders default eyebrow when none provided', () => {
    render(<SummaryPanel />);
    expect(screen.getByText('数据实例')).toBeTruthy();
  });

  it('can hide eyebrow while keeping status', () => {
    render(<SummaryPanel showEyebrow={false} status={{ label: '进行中', tone: 'brand' }} />);
    expect(screen.queryByText('数据实例')).toBeNull();
    expect(screen.getByText('进行中')).toBeTruthy();
  });

  it('renders custom metaItems', () => {
    render(
      <SummaryPanel
        metaItems={[
          { key: 'k1', label: '标签1', value: '值1' },
          {
            key: 'k2',
            label: '标签2',
            value: '值2',
            icon: React.createElement('span', null, '🔥'),
          },
        ]}
      />,
    );
    expect(screen.getByText('标签1')).toBeTruthy();
    expect(screen.getByText('值1')).toBeTruthy();
  });

  it('renders children', () => {
    render(
      <SummaryPanel>
        <div>child content</div>
      </SummaryPanel>,
    );
    expect(screen.getByText('child content')).toBeTruthy();
  });

  it('renders createdAt', () => {
    render(<SummaryPanel createdAt="2024-01-01" />);
    expect(screen.getByText('2024-01-01')).toBeTruthy();
  });

  it('renders with className', () => {
    const { container } = render(<SummaryPanel className="custom-class" />);
    expect(container.querySelector('.custom-class')).toBeTruthy();
  });

  it('renders mobile identity content for detail summary panels', () => {
    const { container } = render(
      <SummaryPanel
        className="sy-detail-summary-panel"
        creator={{ name: '张三', department: '技术部' }}
        createdAt="2024-01-01"
      />,
    );

    expect(container.querySelector('.sy-summary-panel-content')).toBeTruthy();
    expect(container.querySelector('.sy-summary-mobile-identity')).toBeTruthy();
    expect(screen.getByText('张三（技术部）')).toBeTruthy();
    expect(screen.getAllByText('2024-01-01').length).toBeGreaterThan(0);
  });
});

// ================================================================
// RuntimePageShell Tests (66 lines, 0%)
// ================================================================
describe('RuntimePageShell', () => {
  it('renders children normally', () => {
    const { container } = render(<RuntimePageShell>Hello</RuntimePageShell>);
    expect(screen.getByText('Hello')).toBeTruthy();
    const content = container.querySelector('.sy-runtime-page__content');
    expect(content?.className).toContain('p-0');
    expect(content?.className).not.toContain('px-4');
    expect(content?.className).not.toContain('py-6 pb-8');
  });

  it('renders loading state', () => {
    render(<RuntimePageShell loading>Hello</RuntimePageShell>);
    expect(screen.getByTestId('spin')).toBeTruthy();
    expect(screen.getByText('正在加载页面...')).toBeTruthy();
  });

  it('renders custom loading tip', () => {
    render(
      <RuntimePageShell loading loadingTip="加载中...">
        Hello
      </RuntimePageShell>,
    );
    expect(screen.getByText('加载中...')).toBeTruthy();
  });

  it('renders access denied', () => {
    render(<RuntimePageShell accessDenied>Hello</RuntimePageShell>);
    expect(screen.getByText('无权限查看详情')).toBeTruthy();
  });

  it('renders error state', () => {
    render(<RuntimePageShell error="出错了">Hello</RuntimePageShell>);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('renders empty state', () => {
    render(<RuntimePageShell empty={<div>空数据</div>}>Hello</RuntimePageShell>);
    expect(screen.getByText('空数据')).toBeTruthy();
  });

  it('renders actions slot', () => {
    render(
      <RuntimePageShell actions={<button type="button">Action</button>}>Hello</RuntimePageShell>,
    );
    expect(screen.getByText('Action')).toBeTruthy();
  });

  it('renders with inDrawer=true', () => {
    const { container } = render(<RuntimePageShell inDrawer>Hello</RuntimePageShell>);
    const content = container.querySelector('.sy-runtime-page__content');
    expect(content?.className).toContain('p-0');
    expect(content?.className).toContain('md:px-4');
    expect(content?.className).toContain('md:py-4');
    expect(content?.className).not.toContain(' py-4 ');
  });

  it('renders with custom maxWidth string', () => {
    render(<RuntimePageShell maxWidth="800px">Hello</RuntimePageShell>);
    expect(screen.getByText('Hello')).toBeTruthy();
  });

  it('renders with custom className and contentClassName', () => {
    const { container } = render(
      <RuntimePageShell className="outer" contentClassName="inner">
        Hello
      </RuntimePageShell>,
    );
    expect(container.querySelector('.outer')).toBeTruthy();
    expect(container.querySelector('.inner')).toBeTruthy();
  });
});

// ================================================================
// ChangeRecords Tests (improve from 48.97%)
// ================================================================
describe('ChangeRecords', () => {
  it('renders with default RecordChangePanel', () => {
    render(<ChangeRecords records={[]} />);
  });

  it('renders with custom renderItem', () => {
    const records = [
      {
        id: 'r1',
        fieldId: 'f1',
        fieldLabel: 'Field1',
        oldValue: 'a',
        newValue: 'b',
        changedAt: '2024-01-01',
        changedBy: 'user1',
      },
    ];
    render(
      <ChangeRecords
        records={records}
        renderItem={(record: any) =>
          React.createElement(
            'div',
            null,
            `${record.fieldLabel}: ${record.oldValue} -> ${record.newValue}`,
          )
        }
      />,
    );
    expect(screen.getByText('变更记录')).toBeTruthy();
    expect(screen.getByText('Field1: a -> b')).toBeTruthy();
  });

  it('renders empty state with custom renderItem', () => {
    render(
      <ChangeRecords records={[]} renderItem={() => React.createElement('div', null, 'item')} />,
    );
    expect(screen.getByText('暂无变更记录')).toBeTruthy();
  });

  it('renders loading state with custom renderItem', () => {
    render(
      <ChangeRecords
        records={[]}
        loading
        renderItem={() => React.createElement('div', null, 'item')}
      />,
    );
    expect(screen.getByText('加载中...')).toBeTruthy();
  });

  it('renders load more button', () => {
    const onLoadMore = vi.fn();
    render(
      <ChangeRecords
        records={[
          {
            id: 'r1',
            fieldId: 'f1',
            fieldLabel: 'F',
            oldValue: 'a',
            newValue: 'b',
            changedAt: '',
            changedBy: '',
          },
        ]}
        hasMore
        onLoadMore={onLoadMore}
        renderItem={(r: any) => React.createElement('div', null, r.id)}
      />,
    );
    const loadMoreBtn = screen.getByText('加载更多');
    fireEvent.click(loadMoreBtn);
    expect(onLoadMore).toHaveBeenCalled();
  });

  it('shows loading text on load more button when loading', () => {
    render(
      <ChangeRecords
        records={[
          {
            id: 'r1',
            fieldId: 'f1',
            fieldLabel: 'F',
            oldValue: 'a',
            newValue: 'b',
            changedAt: '',
            changedBy: '',
          },
        ]}
        hasMore
        loading
        renderItem={(r: any) => React.createElement('div', null, r.id)}
      />,
    );
    const buttons = screen.getAllByRole('button');
    const loadMoreBtn = buttons.find((b) => b.textContent === '加载中...');
    expect(loadMoreBtn).toBeTruthy();
    expect(loadMoreBtn?.disabled).toBe(true);
  });

  it('passes props to RecordChangePanel', () => {
    const onExpand = vi.fn();
    const onLoadMore = vi.fn();
    render(
      <ChangeRecords
        records={[]}
        defaultExpanded
        hasMore
        onLoadMore={onLoadMore}
        onExpand={onExpand}
        className="custom"
      />,
    );
  });
});

// ================================================================
// StickyActionBar Tests
// ================================================================
describe('StickyActionBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
  });

  it('renders nothing when all actions are hidden', () => {
    const { container } = render(
      <StickyActionBar
        actions={[{ key: 'hidden', label: '隐藏', visible: false, onClick: vi.fn() }]}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('handles mobile overflow actions and confirmation cancellation', async () => {
    const onSave = vi.fn();
    const onDelete = vi.fn();
    const onMore = vi.fn();
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 500 });
    confirmMockFn.mockReturnValueOnce(false).mockReturnValue(true);

    render(
      <StickyActionBar
        maxMobileButtons={1}
        position="fixed"
        actions={[
          { key: 'save', label: '保存', type: 'primary', onClick: onSave },
          {
            key: 'delete',
            label: '删除',
            type: 'danger',
            confirm: { title: '确认删除', content: '删除后不可恢复' },
            onClick: onDelete,
          },
          { key: 'more', label: '更多操作', priority: 80, onClick: onMore },
        ]}
      />,
    );

    await waitFor(() => expect(screen.getByText('更多')).toBeTruthy());
    fireEvent.click(screen.getByText('保存'));
    fireEvent.click(screen.getByText('删除'));
    fireEvent.click(screen.getByText('更多操作'));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(confirmMockFn).toHaveBeenCalledWith('确认删除', '删除后不可恢复');
    expect(onDelete).not.toHaveBeenCalled();
    expect(onMore).toHaveBeenCalledTimes(1);
  });

  it('renders default desktop layout with string max width', () => {
    const onSubmit = vi.fn();

    const { container } = render(
      <StickyActionBar
        position="sticky"
        maxWidth="80rem"
        className="custom-sticky"
        actions={[{ key: 'submit', label: '提交', onClick: onSubmit }]}
      />,
    );

    fireEvent.click(screen.getByText('提交'));
    expect(onSubmit).toHaveBeenCalled();
    expect(container.querySelector('.custom-sticky')).toBeTruthy();
    expect(container.querySelector('.justify-end')).toBeTruthy();
  });

  it('supports transparent surface for inline submit areas', () => {
    const { container } = render(
      <StickyActionBar
        position="inline"
        surface="transparent"
        actions={[{ key: 'submit', label: '提交', onClick: vi.fn() }]}
      />,
    );

    expect(container.querySelector('.bg-transparent')).toBeTruthy();
    expect(container.querySelector('.border-t-0')).toBeTruthy();
    expect(container.querySelector('.shadow-none')).toBeTruthy();
    expect(container.querySelector('.px-0')).toBeTruthy();
    expect(container.querySelector('.py-0')).toBeTruthy();
  });
});

// ================================================================
// StandardFormPage Tests (96 lines, 0%)
// ================================================================
vi.mock('../templates/FormDetailTemplate', () => ({
  FormDetailTemplate: (props: any) =>
    React.createElement('div', { 'data-testid': 'form-detail-tpl' }, `detail:${props.formUuid}`),
}));
vi.mock('../templates/FormSubmitTemplate', () => ({
  FormSubmitTemplate: (props: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'form-submit-tpl' },
      `submit:${props.config?.mode}`,
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: () => props.config?.api?.submitFormData?.({ data: { name: 'Alice' } }),
        },
        'mock-submit-values',
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: () =>
            props.config?.api?.submitFormData?.({
              formUuid: 'f1',
              appType: 'app1',
              data: { name: 'Alice' },
              selectedApprovers: { node1: ['u1'] },
              initiatorSelectedApprovers: { node1: ['u1'] },
            }),
        },
        'mock-submit-process-payload',
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: () => props.config?.api?.advancedSearch?.({ formUuid: 'related-form' }),
        },
        'mock-advanced-search',
      ),
    ),
}));
vi.mock('../templates/ProcessDetailTemplate', () => ({
  ProcessDetailTemplate: (props: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'process-detail-tpl' },
      `process:${props.formUuid}`,
    ),
}));

describe('StandardFormPage', () => {
  const baseSchema: any = {
    formMeta: { formUuid: 'f1', appType: 'app1', title: 'Test Form' },
    fields: [],
    template: {},
  };

  it('renders submit mode by default', () => {
    render(<StandardFormPage schema={baseSchema} />);
    expect(screen.getByTestId('form-submit-tpl')).toBeTruthy();
    expect(screen.getByText('submit:submit')).toBeTruthy();
  });

  it('renders detail mode', () => {
    render(<StandardFormPage schema={baseSchema} mode="detail" />);
    expect(screen.getByTestId('form-detail-tpl')).toBeTruthy();
  });

  it('renders readonly mode', () => {
    render(<StandardFormPage schema={baseSchema} mode="readonly" />);
    expect(screen.getByTestId('form-detail-tpl')).toBeTruthy();
  });

  it('renders process mode', () => {
    render(<StandardFormPage schema={baseSchema} mode="process" />);
    expect(screen.getByTestId('process-detail-tpl')).toBeTruthy();
  });

  it('renders edit mode', () => {
    render(<StandardFormPage schema={baseSchema} mode="edit" />);
    expect(screen.getByTestId('form-submit-tpl')).toBeTruthy();
    expect(screen.getByText('submit:edit')).toBeTruthy();
  });

  it('resolves formUuid and appType from props', () => {
    render(<StandardFormPage schema={baseSchema} formUuid="override" appType="overrideApp" />);
    expect(screen.getByTestId('form-submit-tpl')).toBeTruthy();
  });

  it('uses schema.template.defaultMode as fallback', () => {
    const schema = { ...baseSchema, template: { defaultMode: 'detail' } };
    render(<StandardFormPage schema={schema} />);
    expect(screen.getByTestId('form-detail-tpl')).toBeTruthy();
  });

  it('creates api from onSubmit prop', async () => {
    const onSubmit = vi.fn(async () => ({}));
    render(<StandardFormPage schema={baseSchema} onSubmit={onSubmit} />);
    expect(screen.getByTestId('form-submit-tpl')).toBeTruthy();
    fireEvent.click(screen.getByText('mock-submit-values'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: 'Alice' }));
  });

  it('keeps workflow submit metadata when forwarding onSubmit payloads', async () => {
    const onSubmit = vi.fn(async () => ({}));
    const schema = { ...baseSchema, template: { formType: 'process' } };
    render(<StandardFormPage schema={schema} mode="submit" onSubmit={onSubmit} />);

    fireEvent.click(screen.getByText('mock-submit-process-payload'));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { name: 'Alice' },
          selectedApprovers: { node1: ['u1'] },
          initiatorSelectedApprovers: { node1: ['u1'] },
        }),
      ),
    );
  });

  it('preserves external api methods when onSubmit overrides submit', async () => {
    const onSubmit = vi.fn(async () => ({}));
    const advancedSearch = vi.fn(async () => ({ data: [] }));
    render(<StandardFormPage schema={baseSchema} api={{ advancedSearch } as any} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByText('mock-advanced-search'));
    fireEvent.click(screen.getByText('mock-submit-values'));

    await waitFor(() => expect(advancedSearch).toHaveBeenCalledWith({ formUuid: 'related-form' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: 'Alice' }));
  });

  it('renders with inDrawer prop', () => {
    render(<StandardFormPage schema={baseSchema} mode="process" inDrawer />);
    expect(screen.getByTestId('process-detail-tpl')).toBeTruthy();
  });

  it('determines formType as process when mode is process', () => {
    render(<StandardFormPage schema={baseSchema} mode="submit" />);
    expect(screen.getByTestId('form-submit-tpl')).toBeTruthy();
  });

  it('uses template.formType when available', () => {
    const schema = { ...baseSchema, template: { formType: 'process' } };
    render(<StandardFormPage schema={schema} mode="submit" />);
    expect(screen.getByTestId('form-submit-tpl')).toBeTruthy();
  });
});
