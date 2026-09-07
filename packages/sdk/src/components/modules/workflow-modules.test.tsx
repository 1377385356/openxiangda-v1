import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ApprovalActions } from './ApprovalActions';
import { ApprovalTimeline } from './ApprovalTimeline';
import { ChangeRecords } from './ChangeRecords';
import { DraftManager } from './DraftManager';
import { FormActionBar } from './FormActionBar';
import { FormSummaryCard } from './FormSummaryCard';
import { ProcessPreview } from './ProcessPreview';
import { RecordChangePanel } from './RecordChangePanel';
import { PageSkeleton } from '../templates/PageSkeleton';
import type { ChangeRecord, ProcessAction, ProcessRoute, ProcessTask } from '../types';

const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }));

vi.mock('antd', () => {
  const Button = ({ children, icon, onClick, disabled, loading, className }: any) =>
    React.createElement(
      'button',
      {
        type: 'button',
        onClick,
        disabled,
        className,
        'data-loading': loading ? 'true' : undefined,
      },
      icon,
      children,
    );

  const Modal = Object.assign(
    ({
      title,
      open,
      children,
      footer,
      onOk,
      onCancel,
      okText = '确定',
      cancelText = '取消',
    }: any) =>
      open
        ? React.createElement(
            'div',
            { role: 'dialog', 'aria-label': title },
            React.createElement('h2', null, title),
            children,
            footer ??
              React.createElement(
                'div',
                null,
                React.createElement('button', { type: 'button', onClick: onOk }, okText),
                React.createElement('button', { type: 'button', onClick: onCancel }, cancelText),
              ),
          )
        : null,
    {
      confirm: (config: any) => {
        confirmMock(config);
        return config.onOk?.();
      },
    },
  );

  const TextArea = ({ value, onChange, placeholder }: any) =>
    React.createElement('textarea', {
      value: value ?? '',
      onChange,
      placeholder,
      'data-testid': 'approval-comments',
    });

  const Input = Object.assign(() => null, { TextArea });
  const formState = { values: {} as Record<string, any> };
  const Form = Object.assign(({ children }: any) => React.createElement('form', null, children), {
    useForm: () => [
      {
        setFieldsValue: (values: Record<string, any>) => {
          formState.values = { ...formState.values, ...values };
        },
        getFieldValue: (name: string) => formState.values[name],
        resetFields: () => {
          formState.values = {};
        },
        validateFields: async () => formState.values,
      },
    ],
    Item: ({ children, name }: any) =>
      React.createElement(
        'div',
        null,
        React.isValidElement(children)
          ? React.cloneElement(children as React.ReactElement<any>, {
              value: name ? (formState.values[name] ?? '') : undefined,
              onChange: (event: any) => {
                if (name) formState.values[name] = event?.target?.value;
                (children as React.ReactElement<any>).props.onChange?.(event);
              },
            })
          : children,
      ),
  });
  const Select = ({ options = [], value, onChange, placeholder }: any) =>
    React.createElement(
      'select',
      {
        value: value ?? '',
        onChange: (event: any) => onChange?.(event.target.value),
        'aria-label': placeholder || 'select',
      },
      React.createElement('option', { value: '' }, placeholder || ''),
      options.map((item: any) =>
        React.createElement('option', { key: item.value, value: item.value }, item.label),
      ),
    );

  return {
    Button,
    Form,
    Input,
    Select,
    Modal,
    Drawer: ({ title, open, children, footer }: any) =>
      open
        ? React.createElement(
            'section',
            { role: 'dialog', 'aria-label': title },
            React.createElement('h2', null, title),
            children,
            footer,
          )
        : null,
    Dropdown: ({ children, menu }: any) =>
      React.createElement(
        'div',
        null,
        children,
        React.createElement(
          'div',
          { role: 'menu' },
          menu.items.map((item: any) =>
            React.createElement(
              'button',
              { key: item.key, type: 'button', onClick: item.onClick },
              item.label,
            ),
          ),
        ),
      ),
    Empty: ({ description }: any) => React.createElement('div', null, description),
    Tag: ({ children }: any) => React.createElement('span', null, children),
    Tooltip: ({ children }: any) => React.createElement('span', null, children),
    Avatar: ({ children, alt }: any) =>
      React.createElement('span', { 'aria-label': alt }, children),
    Pagination: ({ onChange }: any) =>
      React.createElement('button', { type: 'button', onClick: () => onChange?.(2, 10) }, 'page'),
    Skeleton: Object.assign(
      ({ paragraph, title }: any) =>
        React.createElement(
          'div',
          { 'data-testid': 'skeleton' },
          JSON.stringify({ paragraph, title }),
        ),
      {
        Input: (props: any) =>
          React.createElement('span', { 'data-testid': 'skeleton-input' }, props.size),
        Button: (props: any) =>
          React.createElement('span', { 'data-testid': 'skeleton-button' }, props.size),
        Avatar: () => React.createElement('span', { 'data-testid': 'skeleton-avatar' }),
      },
    ),
  };
});

vi.mock('@ant-design/icons', () => ({
  ApiOutlined: () => React.createElement('span', { 'data-testid': 'api-icon' }),
  ArrowRightOutlined: () => React.createElement('span', { 'data-testid': 'arrow-right-icon' }),
  CheckCircleFilled: () => React.createElement('span', { 'data-testid': 'check-filled-icon' }),
  CheckCircleOutlined: () => React.createElement('span', { 'data-testid': 'check-icon' }),
  ClockCircleOutlined: () => React.createElement('span', { 'data-testid': 'clock-icon' }),
  CloseCircleFilled: () => React.createElement('span', { 'data-testid': 'close-filled-icon' }),
  CodeOutlined: () => React.createElement('span', { 'data-testid': 'code-icon' }),
  CopyOutlined: () => React.createElement('span', { 'data-testid': 'copy-icon' }),
  DownOutlined: () => React.createElement('span', { 'data-testid': 'down-icon' }),
  DesktopOutlined: () => React.createElement('span', { 'data-testid': 'desktop-icon' }),
  EditOutlined: () => React.createElement('span', { 'data-testid': 'edit-icon' }),
  FileTextOutlined: () => React.createElement('span', { 'data-testid': 'file-icon' }),
  HistoryOutlined: () => React.createElement('span', { 'data-testid': 'history-icon' }),
  LoadingOutlined: () => React.createElement('span', { 'data-testid': 'loading-icon' }),
  MoreOutlined: () => React.createElement('span', { 'data-testid': 'more-icon' }),
  NotificationOutlined: () => React.createElement('span', { 'data-testid': 'notification-icon' }),
  ReloadOutlined: () => React.createElement('span', { 'data-testid': 'reload-icon' }),
  RollbackOutlined: () => React.createElement('span', { 'data-testid': 'rollback-icon' }),
  UpOutlined: () => React.createElement('span', { 'data-testid': 'up-icon' }),
  UserOutlined: () => React.createElement('span', { 'data-testid': 'user-icon' }),
}));

const processActions: ProcessAction[] = [
  { action: 'agree', name: { zh_CN: '同意' }, remark: { popUp: true } },
  { action: 'rejected', name: { zh_CN: '拒绝' }, remark: { popUp: true } },
  { action: 'transfer', name: { zh_CN: '转交' } },
  { action: 'return', name: { zh_CN: '退回' } },
  { action: 'withdraw', name: { zh_CN: '撤销' } },
  { action: 'save', name: { zh_CN: '暂存' } },
];

describe('workflow modules', () => {
  beforeEach(() => {
    confirmMock.mockClear();
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders and executes approval actions', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    const onReject = vi.fn().mockResolvedValue(undefined);
    const onTransfer = vi.fn();
    const onReturn = vi.fn();
    const onWithdraw = vi.fn().mockResolvedValue(undefined);
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <ApprovalActions
        actions={processActions}
        maxVisible={3}
        onApprove={onApprove}
        onReject={onReject}
        onTransfer={onTransfer}
        onReturn={onReturn}
        onWithdraw={onWithdraw}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByText('转交'));
    fireEvent.click(screen.getByText('退回'));
    fireEvent.click(screen.getByText('暂存'));
    expect(onTransfer).toHaveBeenCalled();
    expect(onReturn).toHaveBeenCalled();
    await waitFor(() => expect(onSave).toHaveBeenCalled());

    fireEvent.click(screen.getByText('同意'));
    fireEvent.change(screen.getByTestId('approval-comments'), { target: { value: 'ok' } });
    fireEvent.click(screen.getByText('确认'));
    await waitFor(() => expect(onApprove).toHaveBeenCalledWith('ok'));

    fireEvent.click(screen.getByText('撤销'));
    fireEvent.click(screen.getByText('确认'));
    await waitFor(() => expect(onWithdraw).toHaveBeenCalledWith(undefined));

    fireEvent.click(screen.getByText('拒绝'));
    fireEvent.change(screen.getByTestId('approval-comments'), { target: { value: 'no' } });
    fireEvent.click(screen.getByText('确认'));
    await waitFor(() => expect(onReject).toHaveBeenCalledWith('no'));
  });

  it('sorts and executes action bar actions', async () => {
    const deleteAction = vi.fn().mockResolvedValue(undefined);
    const saveAction = vi.fn().mockResolvedValue(undefined);

    const { rerender } = render(
      <FormActionBar
        position="inline"
        actions={[
          { key: 'hidden', label: '隐藏', visible: false, onClick: vi.fn() },
          { key: 'save', label: '保存', type: 'primary', onClick: saveAction },
          {
            key: 'delete',
            label: '删除',
            type: 'danger',
            confirm: { title: '确认删除', content: '不可恢复' },
            onClick: deleteAction,
          },
          { key: 'cancel', label: '取消', type: 'text', disabled: true, onClick: vi.fn() },
        ]}
      />,
    );

    expect(screen.queryByText('隐藏')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('删除'));
    await waitFor(() => expect(deleteAction).toHaveBeenCalled());
    expect(window.confirm).toHaveBeenCalledWith('确认删除\n不可恢复');

    fireEvent.click(screen.getByText('保存'));
    await waitFor(() => expect(saveAction).toHaveBeenCalled());

    rerender(<FormActionBar actions={[{ key: 'ok', label: '确定', onClick: vi.fn() }]} />);
    expect(screen.getByText('确定')).toBeInTheDocument();
  });

  it('renders summary card variants', () => {
    const { rerender } = render(
      <FormSummaryCard
        title="费用报销"
        formInstanceId="inst-123456789"
        creator={{ name: 'Alice', avatar: '/avatar.png', department: 'Finance' }}
        createdAt="2026-05-13"
        status={{ label: '处理中', tone: 'brand' }}
      >
        <span>extra</span>
      </FormSummaryCard>,
    );

    expect(screen.getByText('费用报销')).toBeInTheDocument();
    expect(screen.getByText('#inst-123')).toBeInTheDocument();
    expect(screen.getByAltText('Alice')).toBeInTheDocument();
    expect(screen.getByText('extra')).toBeInTheDocument();

    rerender(
      <FormSummaryCard
        title="审批"
        creator={{ name: 'Bob', department: 'IT' }}
        status={{ label: '未知', tone: 'neutral' }}
      />,
    );
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('renders approval timeline states', () => {
    const tasks: ProcessTask[] = [
      {
        taskId: 'task-1',
        nodeId: 'node-1',
        nodeType: 'approval',
        nodeName: '主管审批',
        status: 'approved',
        assigneeName: 'Alice',
        departmentName: 'Finance',
        comments: '同意',
        actionAt: '2026-05-13',
      },
      {
        taskId: 'task-2',
        nodeId: 'node-2',
        nodeType: 'approval',
        nodeName: '总监审批',
        status: 'pending',
        assigneeName: 'Bob',
      },
      {
        taskId: 'task-3',
        nodeId: 'node-3',
        nodeType: 'copy',
        nodeName: '抄送',
        status: 'suspended',
        createdAt: '2026-05-14',
      },
    ];

    const { rerender } = render(<ApprovalTimeline tasks={[]} />);
    expect(screen.getByText('暂无审批记录')).toBeInTheDocument();

    rerender(<ApprovalTimeline tasks={tasks} showRemarks />);
    expect(screen.getByText('主管审批')).toBeInTheDocument();
    expect(screen.getByText(/当前审批人/)).toBeInTheDocument();
    expect(screen.getByText(/等待处理中/)).toBeInTheDocument();

    rerender(
      <ApprovalTimeline
        tasks={tasks}
        compactMode
        renderNode={(task, index) => <span>{`${index}-${task.nodeName}`}</span>}
      />,
    );
    expect(screen.getByText('0-主管审批')).toBeInTheDocument();

    rerender(<ApprovalTimeline tasks={tasks} compactMode />);
    expect(screen.getByText('2026-05-13')).toBeInTheDocument();
  });

  it('renders an empty approval timeline for non-array task input', () => {
    render(<ApprovalTimeline tasks={{ tasks: [] } as any} />);
    expect(screen.getByText('暂无审批记录')).toBeInTheDocument();
  });

  it('expands change records and loads more', () => {
    const onExpand = vi.fn();
    const onLoadMore = vi.fn();
    const records: ChangeRecord[] = [
      {
        id: 'rec-1',
        fieldId: 'amount',
        fieldLabel: '金额',
        oldValue: null,
        newValue: { value: 100 },
        operatorId: 'user-1',
        operatorName: 'Alice',
        operatedAt: '2026-05-13',
      },
    ];

    const { unmount } = render(<ChangeRecords loading defaultExpanded />);
    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
    unmount();

    render(<ChangeRecords records={records} hasMore onExpand={onExpand} onLoadMore={onLoadMore} />);
    fireEvent.click(screen.getByRole('button', { name: /变更记录/ }));
    expect(onExpand).toHaveBeenCalled();
    expect(screen.getByText('金额')).toBeInTheDocument();
    expect(screen.getByText('空')).toBeInTheDocument();
    fireEvent.click(screen.getByText('加载更多'));
    expect(onLoadMore).toHaveBeenCalled();
  });

  it('renders rich record change panel values and actions', () => {
    const onRefresh = vi.fn();
    const onPageChange = vi.fn();
    const onLoadMore = vi.fn();
    const records = [
      {
        id: 'r1',
        operationId: 'operation-abcdef',
        operatorName: '',
        operatorDepartmentName: '研发部',
        changeSource: 'automation',
        changeType: 'custom',
        changedCount: 2,
        operatedAt: '2026-01-01 10:00',
        changes: [
          {
            fieldKey: 'tags',
            fieldLabel: '标签',
            beforeValue: [{ label: '旧标签' }],
            afterValue: [{ value: '新标签' }],
          },
          {
            fieldKey: 'meta',
            fieldLabel: '元数据',
            beforeValue: { value: '旧值' },
            afterValue: { raw: true },
          },
        ],
      },
      {
        id: 'r2',
        fieldId: 'amount',
        fieldLabel: '金额',
        oldValue: null,
        newValue: '',
        changeSource: 'integration',
        changeType: 'update',
        createdAt: '2026-01-02 10:00',
      },
    ] as any;

    const { rerender } = render(
      <RecordChangePanel
        defaultExpanded
        records={records}
        total={30}
        pageSize={10}
        onRefresh={onRefresh}
        onPageChange={onPageChange}
      />,
    );

    expect(screen.getAllByText('系统')).toHaveLength(2);
    expect(screen.getByText('旧标签')).toBeInTheDocument();
    expect(screen.getByText('新标签')).toBeInTheDocument();
    expect(screen.getByText('旧值')).toBeInTheDocument();
    expect(screen.getByText(/"raw":true/)).toBeInTheDocument();
    expect(screen.getAllByText('空')).toHaveLength(2);
    expect(screen.getByText('自动化')).toBeInTheDocument();
    fireEvent.click(screen.getByText('刷新'));
    expect(onRefresh).toHaveBeenCalled();
    fireEvent.click(screen.getByText('page'));
    expect(onPageChange).toHaveBeenCalledWith(2, 10);

    rerender(
      <RecordChangePanel
        defaultExpanded
        records={records.slice(0, 1)}
        hasMore
        onLoadMore={onLoadMore}
      />,
    );
    fireEvent.click(screen.getByText('加载更多'));
    expect(onLoadMore).toHaveBeenCalled();

    rerender(<RecordChangePanel defaultExpanded loading records={[]} />);
    expect(screen.getByTestId('skeleton')).toBeInTheDocument();

    rerender(<RecordChangePanel defaultExpanded records={[]} />);
    expect(screen.getByText('暂无变更记录')).toBeInTheDocument();
  });

  it('renders draft manager and handles actions', () => {
    const onRestore = vi.fn();
    const onDiscard = vi.fn();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);

    const { container, rerender } = render(
      <DraftManager hasDraft={false} onRestore={onRestore} onDiscard={onDiscard} />,
    );
    expect(container).toBeEmptyDOMElement();

    rerender(
      <DraftManager
        hasDraft
        draftTimestamp={1_000_000 - 2 * 60_000}
        onRestore={onRestore}
        onDiscard={onDiscard}
      />,
    );
    expect(screen.getByText(/2分钟前/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('恢复填写'));
    fireEvent.click(screen.getByText('丢弃'));
    expect(onRestore).toHaveBeenCalled();
    expect(onDiscard).toHaveBeenCalled();

    rerender(
      <DraftManager
        hasDraft
        draftTimestamp={1_000_000 - 2 * 60 * 60_000}
        onRestore={onRestore}
        onDiscard={onDiscard}
      />,
    );
    expect(screen.getByText(/2小时前/)).toBeInTheDocument();

    rerender(
      <DraftManager
        hasDraft
        draftTimestamp={1_000_000 - 2 * 24 * 60 * 60_000}
        onRestore={onRestore}
        onDiscard={onDiscard}
      />,
    );
    expect(screen.getByText(/2天前/)).toBeInTheDocument();
    nowSpy.mockRestore();
  });

  it('renders process preview states', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    const routes: ProcessRoute[] = [
      {
        nodeId: 'node-1',
        nodeName: '发起',
        nodeType: 'start',
        assignees: [{ id: 'user-1', name: 'Alice' }],
      },
      { nodeId: 'node-2', nodeName: '结束', nodeType: 'end', assignees: [] },
    ];

    const { rerender } = render(
      <ProcessPreview open routes={[]} loading onClose={onClose} onConfirm={onConfirm} />,
    );
    expect(screen.getByTestId('skeleton')).toBeInTheDocument();

    rerender(<ProcessPreview open routes={[]} onClose={onClose} onConfirm={onConfirm} />);
    expect(screen.getByText('暂无流程节点')).toBeInTheDocument();

    rerender(<ProcessPreview open routes={routes} onClose={onClose} onConfirm={onConfirm} />);
    expect(screen.getByText('发起')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    fireEvent.click(screen.getByText('确认提交'));
    fireEvent.click(screen.getByText('取消'));
    expect(onConfirm).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('renders page skeleton variants', () => {
    const { rerender } = render(<PageSkeleton type="submit" />);
    expect(screen.getAllByTestId('skeleton-input').length).toBeGreaterThan(0);

    rerender(<PageSkeleton type="detail" />);
    expect(screen.getAllByTestId('skeleton-button').length).toBeGreaterThan(0);

    rerender(<PageSkeleton type="process" />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });
});
