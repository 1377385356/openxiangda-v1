import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import type { FormSchema } from '../types';
import { FormDetailTemplate } from './FormDetailTemplate';
import { FormSubmitTemplate } from './FormSubmitTemplate';
import { ProcessDetailTemplate } from './ProcessDetailTemplate';

vi.mock('../core/defaultRegistry', () => ({
  defaultComponentRegistry: {},
}));

vi.mock('../core/FormRenderer', () => ({
  FormRenderer: ({ columns }: any) => <div data-testid="form-renderer">columns:{columns}</div>,
}));

vi.mock('../modules/FormSummaryCard', () => ({
  FormSummaryCard: ({ title, status }: any) => (
    <div data-testid="summary-card">
      {title}
      {status?.label}
    </div>
  ),
}));

vi.mock('../modules/ChangeRecords', () => ({
  ChangeRecords: ({ records, onLoadMore, onExpand }: any) => (
    <div data-testid="change-records">
      {records.length}
      <button type="button" onClick={onLoadMore}>
        loadMore
      </button>
      <button type="button" onClick={onExpand}>
        expand
      </button>
    </div>
  ),
}));

vi.mock('../modules/FormActionBar', () => ({
  FormActionBar: ({ actions }: any) => (
    <div data-testid="action-bar">
      {actions.map((action: any) => (
        <button key={action.key} type="button" onClick={action.onClick}>
          {action.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('../modules/RuntimePageShell', () => ({
  RuntimePageShell: ({
    children,
    actions,
    accessDenied,
    className,
    contentClassName,
    maxWidth,
  }: any) => (
    <div
      className={className}
      data-class-name={className}
      data-content-class-name={contentClassName}
      data-max-width={maxWidth}
      data-testid="runtime-shell"
    >
      {accessDenied ? <div>暂无访问权限</div> : children}
      {actions}
    </div>
  ),
}));

vi.mock('../modules/SummaryPanel', () => ({
  SummaryPanel: ({ title, status, className, creator, createdAt }: any) => (
    <div className={className} data-status-label={status?.label} data-testid="summary-card">
      {title}
      {status?.label}
      {creator && (
        <span data-testid="summary-mobile-person">
          {creator.department ? `${creator.name}（${creator.department}）` : creator.name}
        </span>
      )}
      {createdAt && <span data-testid="summary-created-at">{createdAt}</span>}
    </div>
  ),
}));

vi.mock('../modules/RecordChangePanel', () => ({
  RecordChangePanel: ({ records, onLoadMore, onExpand }: any) => (
    <div data-testid="change-records">
      {records.length}
      <button type="button" onClick={onLoadMore}>
        loadMore
      </button>
      <button type="button" onClick={onExpand}>
        expand
      </button>
    </div>
  ),
}));

vi.mock('../modules/StickyActionBar', () => ({
  StickyActionBar: ({ actions, align, className, maxWidth, surface }: any) => (
    <div
      className={className}
      data-align={align}
      data-class-name={className}
      data-max-width={maxWidth}
      data-surface={surface}
      data-testid="action-bar"
    >
      {actions.map((action: any) => (
        <button key={action.key} type="button" onClick={action.onClick}>
          {action.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('../modules/DraftManager', () => ({
  DraftManager: ({ onRestore, onDiscard }: any) => (
    <div data-testid="draft-manager">
      <button type="button" onClick={onRestore}>
        restore
      </button>
      <button type="button" onClick={onDiscard}>
        discard
      </button>
    </div>
  ),
}));

vi.mock('../modules/ApprovalTimeline', () => ({
  ApprovalTimeline: ({ tasks }: any) => <div data-testid="approval-timeline">{tasks.length}</div>,
}));

vi.mock('../modules/ProcessPreview', () => ({
  ProcessPreview: ({ open, routes, onConfirm, onClose }: any) =>
    open ? (
      <div data-testid="process-preview">
        {routes.length}
        <button type="button" onClick={onConfirm}>
          确认提交
        </button>
        <button type="button" onClick={onClose}>
          关闭预览
        </button>
      </div>
    ) : null,
}));

vi.mock('../modules/ApprovalActions', () => ({
  ApprovalActions: ({ actions, onApprove, onReject, onWithdraw, onSave }: any) => (
    <div data-testid="approval-actions">
      {actions.map((action: any) => (
        <button
          key={action.action}
          type="button"
          onClick={() => {
            if (action.action === 'agree') onApprove('ok');
            if (action.action === 'rejected') onReject('no');
            if (action.action === 'withdraw') onWithdraw('back');
            if (action.action === 'save') onSave();
          }}
        >
          {action.name?.zh_CN || action.action}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('../modules/ApprovalActionBar', () => ({
  ApprovalActionBar: ({
    actions,
    onApprove,
    onReject,
    onTransfer,
    onReturn,
    onWithdraw,
    onSave,
    onResubmit,
    onCallback,
    maxWidth,
  }: any) => (
    <div data-max-width={maxWidth} data-testid="approval-actions">
      {actions.map((action: any) => (
        <button
          key={action.action}
          type="button"
          onClick={() => {
            if (action.action === 'agree') onApprove('ok');
            if (action.action === 'rejected') onReject('no');
            if (action.action === 'transfer') onTransfer('u2', '转交');
            if (action.action === 'return') onReturn('node-1', '退回');
            if (action.action === 'withdraw') onWithdraw('back');
            if (action.action === 'save') onSave();
            if (action.action === 'resubmit') onResubmit('again');
            if (action.action === 'callback') onCallback();
          }}
        >
          {action.name?.zh_CN || action.action}
        </button>
      ))}
    </div>
  ),
}));

const formDetailState = vi.hoisted(() => ({
  value: {} as any,
}));
const changeRecordsState = vi.hoisted(() => ({
  loadMore: vi.fn(),
  refresh: vi.fn(),
}));
const processDetailState = vi.hoisted(() => ({
  value: {} as any,
}));
const approvalState = vi.hoisted(() => ({
  approve: vi.fn(),
  reject: vi.fn(),
  transfer: vi.fn(),
  returnTo: vi.fn(),
  withdraw: vi.fn(),
  save: vi.fn(),
  resubmit: vi.fn(),
  callbackTask: vi.fn(),
  returnableNodes: [],
  returnPolicy: null,
  loadReturnableNodes: vi.fn(),
}));
const draftState = vi.hoisted(() => ({
  hasDraft: false,
  saveDraft: vi.fn(),
  restoreDraft: vi.fn(),
  clearDraft: vi.fn(),
}));
const navigationState = vi.hoisted(() => ({
  navigateToDetail: vi.fn(),
  navigateToProcessDetail: vi.fn(),
  handlePostSubmit: vi.fn(),
  isRedirecting: false,
  countdown: 3,
}));
const processApiMocks = vi.hoisted(() => ({
  previewProcess: vi.fn(),
  getProcessDefinition: vi.fn(),
  getInitiatorSelectRequirements: vi.fn(),
  getResubmitInitiatorSelectRequirements: vi.fn(),
  getInitiatorSelectCandidates: vi.fn(),
}));

vi.mock('../hooks/useFormDetail', () => ({
  useFormDetail: () => formDetailState.value,
}));

vi.mock('../hooks/useChangeRecords', () => ({
  useChangeRecords: () => ({
    records: [{ id: 'r1' }],
    loading: false,
    hasMore: true,
    loadMore: changeRecordsState.loadMore,
    refresh: changeRecordsState.refresh,
  }),
}));

vi.mock('../hooks/useProcessDetail', () => ({
  useProcessDetail: () => processDetailState.value,
}));

vi.mock('../hooks/useApprovalActions', () => ({
  useApprovalActions: () => approvalState,
}));

vi.mock('../hooks/useDraftStorage', () => ({
  useDraftStorage: () => ({
    hasDraft: draftState.hasDraft,
    draftTimestamp: 1,
    saveDraft: draftState.saveDraft,
    restoreDraft: draftState.restoreDraft,
    clearDraft: draftState.clearDraft,
  }),
}));

vi.mock('../hooks/useFormNavigation', () => ({
  useFormNavigation: () => navigationState,
}));

vi.mock('../core/processApi', () => ({
  previewProcess: (...args: any[]) => processApiMocks.previewProcess(...args),
  getProcessDefinition: (...args: any[]) => processApiMocks.getProcessDefinition(...args),
  getInitiatorSelectRequirements: (...args: any[]) =>
    processApiMocks.getInitiatorSelectRequirements(...args),
  getResubmitInitiatorSelectRequirements: (...args: any[]) =>
    processApiMocks.getResubmitInitiatorSelectRequirements(...args),
  getInitiatorSelectCandidates: (...args: any[]) =>
    processApiMocks.getInitiatorSelectCandidates(...args),
}));

const schema: FormSchema = {
  formMeta: { formUuid: 'form-1', appType: 'app', title: '测试表单' },
  fields: [{ fieldId: 'name', componentName: 'TextField', label: '姓名' }],
};

const detailBase = {
  loading: false,
  mode: 'readonly',
  formData: { name: 'Alice' },
  instanceInfo: {
    formInstanceId: 'inst-1',
    formUuid: 'form-1',
    appType: 'app',
    data: { name: 'Alice' },
    creator: { userId: 'u1', name: 'Alice', department: 'IT' },
    createdAt: '2026-01-01',
  },
  fieldBehaviors: { name: 'READONLY' },
  switchToEdit: vi.fn(),
  switchToReadonly: vi.fn(),
  saveChanges: vi.fn().mockResolvedValue(true),
  deleteInstance: vi.fn().mockResolvedValue(true),
  canEdit: true,
  canDelete: true,
  canViewChangeRecords: true,
};

const processBase = {
  loading: false,
  processInfo: {
    instanceId: 'inst-1',
    processStatus: 'running',
    formUuid: 'form-1',
    appType: 'app',
    originatorId: 'u1',
    originatorName: 'Alice',
    originatorDepartment: '用户服务部',
    createdAt: '2026-01-01',
  },
  processStatus: 'running',
  currentTask: {
    taskId: 'task-1',
    nodeId: 'n1',
    nodeType: 'approval',
    nodeName: '审批',
    status: 'pending',
  },
  progressList: [
    { taskId: 'task-1', nodeId: 'n1', nodeType: 'approval', nodeName: '审批', status: 'pending' },
  ],
  formData: { name: 'Alice' },
  accessDenied: false,
  loadError: null,
  isApprover: false,
  activeActions: [],
  fieldBehaviors: { name: 'READONLY' },
  mode: 'readonly',
  isOriginatorReturn: false,
  isProcessCompleted: false,
  canWithdraw: false,
  canEdit: false,
  canDelete: false,
  canViewWorkflow: true,
  canViewChangeRecords: false,
  dataVersion: 1,
  switchToEdit: vi.fn(),
  switchToReadonly: vi.fn(),
  saveChanges: vi.fn().mockResolvedValue(true),
  deleteInstance: vi.fn().mockResolvedValue(true),
  refreshDetail: vi.fn(),
  refreshProgress: vi.fn(),
};

beforeEach(() => {
  formDetailState.value = { ...detailBase };
  processDetailState.value = { ...processBase };
  draftState.hasDraft = false;
  navigationState.isRedirecting = false;
  navigationState.countdown = 3;
  vi.clearAllMocks();
  processApiMocks.getProcessDefinition.mockResolvedValue({ processId: 'p1', nodes: [] });
  processApiMocks.previewProcess.mockResolvedValue([]);
  processApiMocks.getInitiatorSelectRequirements.mockResolvedValue([]);
  processApiMocks.getResubmitInitiatorSelectRequirements.mockResolvedValue([]);
  processApiMocks.getInitiatorSelectCandidates.mockResolvedValue({ items: [], total: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FormDetailTemplate', () => {
  it('renders loading, readonly actions, change records and callbacks', async () => {
    formDetailState.value = { ...detailBase, loading: true };
    const { rerender } = render(
      <FormDetailTemplate
        schema={schema}
        formUuid="form-1"
        appType="app"
        formInstanceId="inst-1"
      />,
    );
    expect(document.querySelector('.ant-skeleton')).toBeTruthy();

    const onDelete = vi.fn();
    formDetailState.value = { ...detailBase };
    rerender(
      <FormDetailTemplate
        schema={schema}
        formUuid="form-1"
        appType="app"
        formInstanceId="inst-1"
        enableDelete
        enableChangeRecords
        onDelete={onDelete}
      />,
    );

    expect(screen.getByTestId('summary-card')).toHaveTextContent('测试表单');
    expect(screen.getByTestId('runtime-shell')).toHaveAttribute(
      'data-content-class-name',
      'sy-detail-page',
    );
    expect(screen.getByTestId('runtime-shell')).toHaveAttribute('data-max-width', '100%');
    expect(document.querySelector('.sy-detail-header')).toBeTruthy();
    expect(document.querySelector('.sy-detail-main')).toBeTruthy();
    expect(document.querySelector('.sy-detail-card')).toBeTruthy();
    expect(screen.getByTestId('summary-card')).toHaveClass('sy-detail-summary-panel');
    expect(screen.getByTestId('action-bar')).toHaveAttribute('data-align', 'center');
    expect(screen.getByTestId('change-records')).toHaveTextContent('1');
    fireEvent.click(screen.getByText('编辑'));
    expect(formDetailState.value.switchToEdit).toHaveBeenCalled();
    fireEvent.click(screen.getByText('删除'));
    await waitFor(() => expect(onDelete).toHaveBeenCalled());
    fireEvent.click(screen.getByText('loadMore'));
    fireEvent.click(screen.getByText('expand'));
    expect(changeRecordsState.loadMore).toHaveBeenCalled();
    expect(changeRecordsState.refresh).toHaveBeenCalled();
  });

  it('renders edit mode save/cancel and custom summary/actions', async () => {
    const onSave = vi.fn();
    const renderActions = vi.fn((actions: any[]) => (
      <div>
        {actions.map((action) => (
          <button key={action.key} type="button" onClick={action.onClick}>
            custom-{action.label}
          </button>
        ))}
      </div>
    ));
    const saveChanges = vi.fn().mockResolvedValue(true);
    formDetailState.value = { ...detailBase, mode: 'edit', saveChanges };
    render(
      <FormDetailTemplate
        schema={schema}
        formUuid="form-1"
        appType="app"
        formInstanceId="inst-1"
        header={<div>header</div>}
        footer={<div>footer</div>}
        renderSummary={(data) => <div data-testid="custom-summary">{data.creator?.name}</div>}
        renderActions={renderActions}
        onSave={onSave}
      />,
    );

    expect(screen.getByTestId('custom-summary')).toHaveTextContent('Alice');
    expect(screen.getByText('正在编辑，修改后请保存')).toBeInTheDocument();
    fireEvent.click(screen.getByText('custom-保存'));
    await waitFor(() => expect(saveChanges).toHaveBeenCalledWith({ name: 'Alice' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ name: 'Alice' }));
    fireEvent.click(screen.getByText('custom-取消'));
    expect(formDetailState.value.switchToReadonly).toHaveBeenCalled();
  });
});

describe('FormSubmitTemplate', () => {
  const config = {
    mode: 'submit' as const,
    formUuid: 'form-1',
    appType: 'app',
    api: {
      submitFormData: vi.fn().mockResolvedValue({ data: { formInstanceId: 'new-1' } }),
      updateFormData: vi.fn().mockResolvedValue({ result: { formInstId: 'edit-1' } }),
    },
  };

  it('handles draft, submit success, continue and view detail', async () => {
    draftState.hasDraft = true;
    draftState.restoreDraft.mockReturnValue({ name: '草稿姓名' });
    navigationState.isRedirecting = true;
    navigationState.countdown = 2;
    const onSubmitSuccess = vi.fn();
    render(
      <FormSubmitTemplate
        schema={schema}
        config={config}
        enableDraft
        submitSuccessMode="stay"
        onSubmitSuccess={onSubmitSuccess}
      />,
    );

    expect(document.querySelector('.sy-submit-page')).toBeTruthy();
    expect(screen.getByTestId('runtime-shell')).toHaveAttribute(
      'data-class-name',
      'sy-submit-runtime-page',
    );
    expect(document.querySelector('.sy-submit-card')).toBeTruthy();
    expect(document.querySelector('.sy-submit-form-shell')).toBeTruthy();
    expect(screen.getByTestId('action-bar').getAttribute('data-class-name')).toContain('mt-auto');
    expect(screen.getByTestId('action-bar').getAttribute('data-class-name')).not.toContain('-mb-');
    expect(screen.getByTestId('action-bar')).toHaveAttribute('data-surface', 'transparent');
    expect(screen.getByTestId('draft-manager')).toBeInTheDocument();
    fireEvent.click(screen.getByText('restore'));
    fireEvent.click(screen.getByText('discard'));
    expect(draftState.restoreDraft).toHaveBeenCalled();
    expect(draftState.clearDraft).toHaveBeenCalled();
    fireEvent.click(screen.getByText('暂存'));
    expect(draftState.saveDraft).toHaveBeenCalled();
    fireEvent.click(screen.getByText('提交'));

    await screen.findByText('提交成功');
    expect(screen.getByText('2秒后自动跳转')).toBeInTheDocument();
    expect(onSubmitSuccess).toHaveBeenCalled();
    fireEvent.click(screen.getByText('查看详情'));
    expect(navigationState.navigateToDetail).toHaveBeenCalled();
    fireEvent.click(screen.getByText('继续提交'));
    expect(screen.getByTestId('form-renderer')).toBeInTheDocument();
  });

  it('handles edit submit, custom renderers and process detail navigation', async () => {
    const editConfig = { ...config, mode: 'edit' as const, formInstanceId: 'inst-1' };
    render(
      <FormSubmitTemplate
        schema={schema}
        config={editConfig}
        formType="process"
        enableProcessPreview={false}
        submitSuccessMode="redirect"
        renderForm={() => <div data-testid="custom-form">custom-form</div>}
        renderSuccess={(info) => (
          <button onClick={() => navigationState.navigateToProcessDetail(info.formInstanceId)}>
            success-{info.formInstanceId}
          </button>
        )}
        header={<div>custom-header</div>}
        footer={<div>custom-footer</div>}
        beforeForm={<div>before</div>}
        afterForm={<div>after</div>}
      />,
    );
    expect(screen.getByTestId('custom-form')).toHaveTextContent('custom-form');
    fireEvent.click(screen.getByText('提交'));
    await screen.findByText('success-edit-1');
    fireEvent.click(screen.getByText('success-edit-1'));
    expect(navigationState.navigateToProcessDetail).toHaveBeenCalledWith('edit-1');
  });

  it('starts a process from an existing form instance when submitBehavior is explicit', async () => {
    const startProcessFromExistingInstance = vi.fn().mockResolvedValue({
      data: { formInstanceId: 'draft-1', processInstanceId: 'process-1' },
    });

    render(
      <FormSubmitTemplate
        schema={schema}
        config={{
          ...config,
          formInstanceId: 'draft-1',
          submitBehavior: 'start-existing-process',
          api: {
            ...config.api,
            startProcessFromExistingInstance,
          },
        }}
        formType="process"
        enableProcessPreview={false}
        submitSuccessMode="stay"
      />,
    );

    fireEvent.click(screen.getByText('提交'));

    await waitFor(() =>
      expect(startProcessFromExistingInstance).toHaveBeenCalledWith(
        expect.objectContaining({
          appType: 'app',
          formUuid: 'form-1',
          formInstId: 'draft-1',
          formInstanceId: 'draft-1',
          updateFormDataJson: expect.any(String),
        }),
      ),
    );
    expect(JSON.parse(startProcessFromExistingInstance.mock.calls[0][0].updateFormDataJson)).toEqual(
      {},
    );
    expect(config.api.submitFormData).not.toHaveBeenCalledWith(
      expect.objectContaining({ formInstId: 'draft-1' }),
    );
    await screen.findByText('提交成功');
  });

  it('saves a process form draft without preview or initiator selection', async () => {
    const submitFormData = vi.fn().mockResolvedValue({
      data: { formInstanceId: 'draft-1' },
    });

    render(
      <FormSubmitTemplate
        schema={schema}
        config={{
          ...config,
          submitBehavior: 'save-draft',
          api: {
            ...config.api,
            submitFormData,
          },
        }}
        formType="process"
        enableProcessPreview
        submitSuccessMode="stay"
      />,
    );

    fireEvent.click(screen.getByText('保存草稿'));

    await waitFor(() =>
      expect(submitFormData).toHaveBeenCalledWith(
        expect.objectContaining({
          appType: 'app',
          formUuid: 'form-1',
          saveAsDraft: true,
          startProcess: false,
          processStartMode: 'manual',
          selectedApprovers: undefined,
          initiatorSelectedApprovers: undefined,
        }),
      ),
    );
    expect(processApiMocks.getInitiatorSelectRequirements).not.toHaveBeenCalled();
    expect(processApiMocks.previewProcess).not.toHaveBeenCalled();
    await screen.findByText('草稿已保存，可稍后发起审批');
  });

  it('runs beforeSubmit, afterSubmit, continue mode and submission department selector', async () => {
    const beforeSubmit = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(undefined);
    const afterSubmit = vi.fn();
    const onSubmitSuccess = vi.fn();
    const submitFormData = vi.fn().mockResolvedValue('string-inst-1');
    const renderDepartmentSelector = vi.fn(({ value, onChange, options }) => (
      <button type="button" onClick={() => onChange(options[0]?.value)}>
        dept-{value || 'none'}
      </button>
    ));

    render(
      <FormSubmitTemplate
        schema={schema}
        config={{
          ...config,
          api: { submitFormData },
          submit: { beforeSubmit, afterSubmit },
        }}
        formType="process"
        enableProcessPreview={false}
        submitSuccessMode="continue"
        enableDraft
        enableSubmissionDepartmentSelect
        departmentOptions={[{ label: '研发部', value: 'dept-1' }]}
        renderDepartmentSelector={renderDepartmentSelector}
        onSubmitSuccess={onSubmitSuccess}
        inDrawer
      />,
    );

    fireEvent.click(screen.getByText('dept-none'));
    fireEvent.click(screen.getByText('提交'));
    await waitFor(() => expect(beforeSubmit).toHaveBeenCalledTimes(1));
    expect(submitFormData).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('提交'));
    await waitFor(() =>
      expect(submitFormData).toHaveBeenCalledWith(
        expect.objectContaining({ submissionDepartmentId: 'dept-1' }),
      ),
    );
    await waitFor(() =>
      expect(afterSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ formInstanceId: 'string-inst-1', response: 'string-inst-1' }),
      ),
    );
    expect(onSubmitSuccess).toHaveBeenCalledWith('string-inst-1');
    expect(screen.queryByText('提交成功')).not.toBeInTheDocument();
  });

  it('normalizes date range values before submit', async () => {
    const submitFormData = vi.fn().mockResolvedValue({ data: { formInstanceId: 'date-1' } });
    const dateRangeSchema: FormSchema = {
      formMeta: { formUuid: 'form-1', appType: 'app', title: '测试表单' },
      fields: [{ fieldId: 'range', componentName: 'CascadeDateField', label: '日期区间' }],
    };

    render(
      <FormSubmitTemplate
        schema={dateRangeSchema}
        config={{ ...config, api: { submitFormData } }}
        initialValues={{ range: { start: '2026-05-04 00:00:00', end: '2026-05-04 00:00:07' } }}
        submitSuccessMode="stay"
      />,
    );

    fireEvent.click(screen.getByText('提交'));
    await waitFor(() =>
      expect(submitFormData).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            range: ['2026-05-04 00:00:00', '2026-05-04 00:00:07'],
          },
        }),
      ),
    );
  });

  it('previews process routes before submit and handles preview failure', async () => {
    processApiMocks.previewProcess
      .mockResolvedValueOnce([{ nodeId: 'n1', nodeName: '审批人' }])
      .mockRejectedValueOnce(new Error('preview failed'));
    const submitFormData = vi.fn().mockResolvedValue({ data: { result: { id: 'nested-inst' } } });
    const { unmount } = render(
      <FormSubmitTemplate
        schema={schema}
        config={{ ...config, api: { submitFormData, request: vi.fn() } }}
        formType="process"
        enableProcessPreview
        submitSuccessMode="stay"
      />,
    );

    fireEvent.click(screen.getByText('提交'));
    await screen.findByTestId('process-preview');
    expect(processApiMocks.previewProcess).toHaveBeenCalled();
    fireEvent.click(screen.getByText('确认提交'));
    await screen.findByText('提交成功');
    expect(submitFormData).toHaveBeenCalled();

    unmount();
    submitFormData.mockClear();
    render(
      <FormSubmitTemplate
        schema={schema}
        config={{ ...config, api: { submitFormData, request: vi.fn() } }}
        formType="process"
        enableProcessPreview
        submitSuccessMode="stay"
      />,
    );
    fireEvent.click(screen.getByText('提交'));
    await screen.findByTestId('process-preview');
    expect(screen.getByTestId('process-preview')).toHaveTextContent('0');
  });

  it('enables process preview by default for process forms', async () => {
    processApiMocks.previewProcess.mockResolvedValueOnce([{ nodeId: 'n1', nodeName: '审批人' }]);
    const submitFormData = vi.fn().mockResolvedValue({ data: { formInstanceId: 'new-1' } });

    render(
      <FormSubmitTemplate
        schema={schema}
        config={{ ...config, api: { submitFormData, request: vi.fn() } }}
        formType="process"
        submitSuccessMode="stay"
      />,
    );

    fireEvent.click(screen.getByText('提交'));
    await screen.findByTestId('process-preview');
    expect(processApiMocks.previewProcess).toHaveBeenCalled();
    expect(submitFormData).not.toHaveBeenCalled();
  });

  it('prompts for submission department when supervisor approval has multiple departments', async () => {
    processApiMocks.getProcessDefinition.mockResolvedValue({
      processId: 'p1',
      nodes: [
        {
          id: 'n1',
          type: 'approval',
          data: { approverType: 'ext_target_approval_department_supervisor' },
        },
      ],
    });
    processApiMocks.previewProcess.mockResolvedValueOnce([{ nodeId: 'n1', nodeName: '审批人' }]);
    const submitFormData = vi.fn().mockResolvedValue({ data: { formInstanceId: 'new-1' } });
    const getUserById = vi.fn().mockResolvedValue({
      departments: [
        { id: 'dept-1', name: '研发部' },
        { id: 'dept-2', name: '产品部' },
      ],
    });

    render(
      <FormSubmitTemplate
        schema={schema}
        config={{ ...config, api: { submitFormData, request: vi.fn(), getUserById } }}
        formType="process"
        submitSuccessMode="stay"
      />,
    );

    fireEvent.click(screen.getByText('提交'));
    await screen.findByText('该流程包含部门主管审批，请选择提交部门后再发起');
    fireEvent.click(screen.getByRole('button', { name: /确\s*定/ }));

    await screen.findByTestId('process-preview');
    expect(processApiMocks.previewProcess).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ submissionDepartmentId: 'dept-1' }),
    );
  });

  it('confirms submission department on every submit and uses current selection as default', async () => {
    processApiMocks.getProcessDefinition.mockResolvedValue({
      processId: 'p1',
      nodes: [
        {
          id: 'n1',
          type: 'approval',
          data: { approverType: 'ext_target_approval_department_supervisor' },
        },
      ],
    });
    processApiMocks.previewProcess.mockResolvedValue([{ nodeId: 'n1', nodeName: '审批人' }]);
    const submitFormData = vi.fn().mockResolvedValue({ data: { formInstanceId: 'new-1' } });
    const getUserById = vi.fn().mockResolvedValue({
      departments: [
        { id: 'dept-1', name: '研发部' },
        { id: 'dept-2', name: '产品部' },
      ],
    });
    const renderDepartmentSelector = vi.fn(({ value, onChange, options }) => (
      <button type="button" onClick={() => onChange(options[1]?.value)}>
        dept-{value || 'none'}
      </button>
    ));

    render(
      <FormSubmitTemplate
        schema={schema}
        config={{ ...config, api: { submitFormData, request: vi.fn(), getUserById } }}
        formType="process"
        submitSuccessMode="stay"
        enableSubmissionDepartmentSelect
        departmentOptions={[
          { label: '研发部', value: 'dept-1' },
          { label: '产品部', value: 'dept-2' },
        ]}
        renderDepartmentSelector={renderDepartmentSelector}
      />,
    );

    fireEvent.click(screen.getByText('dept-none'));
    fireEvent.click(screen.getByText('提交'));
    await screen.findByText('该流程包含部门主管审批，请选择提交部门后再发起');
    fireEvent.click(screen.getByRole('button', { name: /确\s*定/ }));
    await screen.findByTestId('process-preview');
    expect(processApiMocks.previewProcess).toHaveBeenLastCalledWith(
      expect.any(Function),
      expect.objectContaining({ submissionDepartmentId: 'dept-2' }),
    );

    fireEvent.click(screen.getByText('关闭预览'));
    fireEvent.click(screen.getByText('提交'));
    await screen.findByText('该流程包含部门主管审批，请选择提交部门后再发起');
    expect(processApiMocks.previewProcess).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /确\s*定/ }));

    await waitFor(() => expect(processApiMocks.previewProcess).toHaveBeenCalledTimes(2));
    expect(processApiMocks.previewProcess).toHaveBeenLastCalledWith(
      expect.any(Function),
      expect.objectContaining({ submissionDepartmentId: 'dept-2' }),
    );
    fireEvent.click(screen.getByText('确认提交'));

    await waitFor(() =>
      expect(submitFormData).toHaveBeenCalledWith(
        expect.objectContaining({ submissionDepartmentId: 'dept-2' }),
      ),
    );
  });

  it('logs submit failures without switching to success state', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const submitFormData = vi.fn().mockRejectedValue(new Error('submit failed'));
    render(<FormSubmitTemplate schema={schema} config={{ ...config, api: { submitFormData } }} />);

    fireEvent.click(screen.getByText('提交'));
    await waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        '[FormSubmitTemplate] Submit failed:',
        expect.any(Error),
      ),
    );
    expect(screen.queryByText('提交成功')).not.toBeInTheDocument();
  });

  it('does not create a fake form instance id when submit response omits it', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const submitFormData = vi.fn().mockResolvedValue({ data: { ok: true } });
    const onSubmitSuccess = vi.fn();
    render(
      <FormSubmitTemplate
        schema={schema}
        config={{ ...config, api: { submitFormData } }}
        onSubmitSuccess={onSubmitSuccess}
      />,
    );

    fireEvent.click(screen.getByText('提交'));
    await waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        '[FormSubmitTemplate] Submit failed:',
        expect.any(Error),
      ),
    );
    expect(onSubmitSuccess).not.toHaveBeenCalled();
    expect(screen.queryByText('提交成功')).not.toBeInTheDocument();
  });

  it('reads form instance id from raw submit envelope when data has no id', async () => {
    const submitFormData = vi.fn().mockResolvedValue({
      data: { ok: true },
      raw: { formInstanceId: 'raw-inst-1' },
    });
    const onSubmitSuccess = vi.fn();
    render(
      <FormSubmitTemplate
        schema={schema}
        config={{ ...config, api: { submitFormData } }}
        onSubmitSuccess={onSubmitSuccess}
      />,
    );

    fireEvent.click(screen.getByText('提交'));

    await waitFor(() => expect(onSubmitSuccess).toHaveBeenCalledWith('raw-inst-1'));
    await screen.findByText('提交成功');
  });
});

describe('ProcessDetailTemplate', () => {
  it('renders loading, approval actions and custom timeline/actions', async () => {
    processDetailState.value = { ...processBase, loading: true };
    const { rerender } = render(
      <ProcessDetailTemplate
        schema={schema}
        formUuid="form-1"
        appType="app"
        formInstanceId="inst-1"
      />,
    );
    expect(document.querySelector('.ant-skeleton')).toBeTruthy();

    const renderActions = vi.fn((actions: any[]) => (
      <button type="button" onClick={() => actions[0] && approvalState.approve('custom')}>
        custom-actions
      </button>
    ));
    processDetailState.value = {
      ...processBase,
      isApprover: true,
      activeActions: [{ action: 'agree', name: { zh_CN: '同意' } }],
    };
    rerender(
      <ProcessDetailTemplate
        schema={schema}
        formUuid="form-1"
        appType="app"
        formInstanceId="inst-1"
        renderTimeline={(tasks) => <div data-testid="custom-timeline">{tasks.length}</div>}
        renderActions={renderActions}
      />,
    );
    expect(screen.getByTestId('runtime-shell')).toHaveAttribute(
      'data-content-class-name',
      'sy-detail-page',
    );
    expect(screen.getByTestId('runtime-shell')).toHaveAttribute('data-max-width', '100%');
    expect(document.querySelector('.sy-detail-header')).toBeTruthy();
    expect(document.querySelector('.sy-detail-main')).toBeTruthy();
    expect(document.querySelector('.sy-detail-card')).toBeTruthy();
    expect(screen.getByTestId('summary-card')).toHaveClass('sy-detail-summary-panel');
    expect(screen.getByTestId('summary-card')).not.toHaveAttribute('data-status-label');
    expect(screen.getByTestId('summary-mobile-person')).toHaveTextContent('Alice（用户服务部）');
    expect(screen.getByTestId('summary-created-at')).toHaveTextContent('2026-01-01 00:00:00');
    expect(document.querySelector('.sy-process-summary-with-stamp')).toBeTruthy();
    expect(document.querySelector('.sy-process-status-stamp-running')).toHaveTextContent('流程中');
    expect(screen.getByTestId('custom-timeline')).toHaveTextContent('1');
    fireEvent.click(screen.getByText('custom-actions'));
    expect(approvalState.approve).toHaveBeenCalledWith('custom');
  });

  it('renders process status stamps for every process status without summary tags', async () => {
    processDetailState.value = {
      ...processBase,
      processStatus: 'completed',
      isProcessCompleted: true,
    };
    const { rerender } = render(
      <ProcessDetailTemplate
        schema={schema}
        formUuid="form-1"
        appType="app"
        formInstanceId="inst-1"
      />,
    );

    expect(document.querySelector('.sy-process-status-stamp-approved')).toHaveTextContent('已同意');
    expect(screen.getByTestId('summary-card')).not.toHaveTextContent('已完成');
    expect(screen.getByTestId('summary-card')).not.toHaveAttribute('data-status-label');

    processDetailState.value = {
      ...processBase,
      processStatus: 'terminated',
      canViewWorkflow: false,
    };
    rerender(
      <ProcessDetailTemplate
        schema={schema}
        formUuid="form-1"
        appType="app"
        formInstanceId="inst-1"
      />,
    );

    expect(document.querySelector('.sy-process-status-stamp-rejected')).toHaveTextContent('已拒绝');
    expect(screen.getByTestId('summary-card')).not.toHaveTextContent('已拒绝');
    expect(screen.getByTestId('summary-card')).not.toHaveAttribute('data-status-label');

    processDetailState.value = {
      ...processBase,
      processStatus: 'exception',
      canViewWorkflow: false,
    };
    rerender(
      <ProcessDetailTemplate
        schema={schema}
        formUuid="form-1"
        appType="app"
        formInstanceId="inst-1"
      />,
    );

    expect(document.querySelector('.sy-process-status-stamp-danger')).toHaveTextContent('流程异常');
    expect(screen.getByTestId('summary-card')).not.toHaveTextContent('流程异常');
    expect(screen.getByTestId('summary-card')).not.toHaveAttribute('data-status-label');

    processDetailState.value = {
      ...processBase,
      processStatus: 'withdrawn',
      canViewWorkflow: false,
    };
    rerender(
      <ProcessDetailTemplate
        schema={schema}
        formUuid="form-1"
        appType="app"
        formInstanceId="inst-1"
      />,
    );

    expect(document.querySelector('.sy-process-status-stamp-neutral')).toHaveTextContent('已撤销');
    expect(screen.getByTestId('summary-card')).not.toHaveTextContent('已撤销');
    expect(screen.getByTestId('summary-card')).not.toHaveAttribute('data-status-label');

    processDetailState.value = {
      ...processBase,
      processStatus: 'cancelled',
      canViewWorkflow: false,
    };
    rerender(
      <ProcessDetailTemplate
        schema={schema}
        formUuid="form-1"
        appType="app"
        formInstanceId="inst-1"
      />,
    );

    expect(document.querySelector('.sy-process-status-stamp-neutral')).toHaveTextContent('已取消');
    expect(screen.getByTestId('summary-card')).not.toHaveTextContent('已取消');
    expect(screen.getByTestId('summary-card')).not.toHaveAttribute('data-status-label');
  });

  it('renders access denied and default approval action handlers', async () => {
    processDetailState.value = { ...processBase, accessDenied: true };
    const { rerender } = render(
      <ProcessDetailTemplate
        schema={schema}
        formUuid="form-1"
        appType="app"
        formInstanceId="inst-1"
      />,
    );
    expect(screen.getByText('暂无访问权限')).toBeInTheDocument();

    processDetailState.value = {
      ...processBase,
      isApprover: true,
      activeActions: [
        { action: 'agree', name: { zh_CN: '同意' } },
        { action: 'rejected', name: { zh_CN: '拒绝' } },
        { action: 'transfer', name: { zh_CN: '转交' } },
        { action: 'return', name: { zh_CN: '退回' } },
        { action: 'withdraw', name: { zh_CN: '撤回' } },
        { action: 'save', name: { zh_CN: '保存' } },
        { action: 'resubmit', name: { zh_CN: '重提' } },
        { action: 'callback', name: { zh_CN: '取回' } },
      ],
    };
    rerender(
      <ProcessDetailTemplate
        schema={schema}
        formUuid="form-1"
        appType="app"
        formInstanceId="inst-1"
        renderTransferSelector={({ onChange }) => (
          <button type="button" onClick={() => onChange('u2')}>
            selector
          </button>
        )}
        renderReturnNodeLabel={(node) => <span>{node.name}</span>}
        renderActionModalExtra={(action) => <span>extra-{action.action}</span>}
      />,
    );
    expect(screen.getByTestId('approval-actions')).toHaveAttribute('data-max-width', '1180');

    for (const label of ['同意', '拒绝', '转交', '退回', '撤回', '保存', '重提', '取回']) {
      fireEvent.click(screen.getByText(label));
    }
    await waitFor(() => expect(approvalState.approve).toHaveBeenCalledWith('ok'));
    expect(approvalState.reject).toHaveBeenCalledWith('no');
    expect(approvalState.transfer).toHaveBeenCalledWith('u2', '转交');
    expect(approvalState.returnTo).toHaveBeenCalledWith('node-1', '退回');
    expect(approvalState.withdraw).toHaveBeenCalledWith('back');
    expect(approvalState.save).toHaveBeenCalled();
    expect(approvalState.resubmit).toHaveBeenCalledWith('again');
    expect(approvalState.callbackTask).toHaveBeenCalled();
  });

  it('renders originator return and withdraw actions', async () => {
    const { rerender } = render(
      <ProcessDetailTemplate
        schema={schema}
        formUuid="form-1"
        appType="app"
        formInstanceId="inst-1"
      />,
    );
    expect(screen.getByTestId('approval-timeline')).toHaveTextContent('1');

    processDetailState.value = { ...processBase, isOriginatorReturn: true, mode: 'readonly' };
    rerender(
      <ProcessDetailTemplate
        schema={schema}
        formUuid="form-1"
        appType="app"
        formInstanceId="inst-1"
      />,
    );
    fireEvent.click(screen.getByText('编辑'));
    expect(processDetailState.value.switchToEdit).toHaveBeenCalled();

    processDetailState.value = {
      ...processBase,
      isOriginatorReturn: true,
      mode: 'readonly',
      canWithdraw: true,
    };
    rerender(
      <ProcessDetailTemplate
        schema={schema}
        formUuid="form-1"
        appType="app"
        formInstanceId="inst-1"
      />,
    );
    expect(screen.getByText('撤销')).toBeInTheDocument();

    processDetailState.value = { ...processBase, isOriginatorReturn: true, mode: 'edit' };
    rerender(
      <ProcessDetailTemplate
        schema={schema}
        formUuid="form-1"
        appType="app"
        formInstanceId="inst-1"
      />,
    );
    fireEvent.click(screen.getByText('取消'));
    fireEvent.click(screen.getByText('重新提交'));
    expect(processDetailState.value.switchToReadonly).toHaveBeenCalled();
    await waitFor(() => expect(approvalState.resubmit).toHaveBeenCalled());

    processDetailState.value = {
      ...processBase,
      isOriginatorReturn: true,
      mode: 'edit',
      canWithdraw: true,
    };
    rerender(
      <ProcessDetailTemplate
        schema={schema}
        formUuid="form-1"
        appType="app"
        formInstanceId="inst-1"
      />,
    );
    expect(screen.getByText('撤销')).toBeInTheDocument();

    processDetailState.value = { ...processBase, canWithdraw: true };
    rerender(
      <ProcessDetailTemplate
        schema={schema}
        formUuid="form-1"
        appType="app"
        formInstanceId="inst-1"
      />,
    );
    expect(screen.getByText('撤销')).toBeInTheDocument();
  });

  it('renders completed process edit and delete actions', async () => {
    const saveChanges = vi.fn().mockResolvedValue(true);
    const deleteInstance = vi.fn().mockResolvedValue(true);
    const onSave = vi.fn();
    const onDelete = vi.fn();

    processDetailState.value = {
      ...processBase,
      processStatus: 'completed',
      isProcessCompleted: true,
      canEdit: true,
      canDelete: true,
      saveChanges,
      deleteInstance,
    };
    const { rerender } = render(
      <ProcessDetailTemplate
        schema={schema}
        formUuid="form-1"
        appType="app"
        formInstanceId="inst-1"
        onSave={onSave}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByTestId('action-bar')).toHaveAttribute('data-align', 'center');
    expect(screen.getByTestId('action-bar')).toHaveAttribute('data-max-width', '1180');
    fireEvent.click(screen.getByText('编辑'));
    expect(processDetailState.value.switchToEdit).toHaveBeenCalled();
    fireEvent.click(screen.getByText('删除'));
    await waitFor(() => expect(deleteInstance).toHaveBeenCalled());
    await waitFor(() => expect(onDelete).toHaveBeenCalled());

    processDetailState.value = {
      ...processBase,
      processStatus: 'completed',
      isProcessCompleted: true,
      canEdit: true,
      mode: 'edit',
      saveChanges,
    };
    rerender(
      <ProcessDetailTemplate
        schema={schema}
        formUuid="form-1"
        appType="app"
        formInstanceId="inst-1"
        onSave={onSave}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByText('保存'));
    await waitFor(() => expect(saveChanges).toHaveBeenCalledWith({ name: 'Alice' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ name: 'Alice' }));
  });

  it('renders custom footer actions and change records panel', async () => {
    const renderFooterActions = vi.fn((actions: any[]) => (
      <div data-testid="footer-actions">
        {actions.map((action) => (
          <button key={action.key} type="button" onClick={action.onClick}>
            footer-{action.label}
          </button>
        ))}
      </div>
    ));
    processDetailState.value = {
      ...processBase,
      processStatus: 'completed',
      isProcessCompleted: true,
      canEdit: true,
      canDelete: false,
      canViewChangeRecords: true,
    };
    render(
      <ProcessDetailTemplate
        schema={schema}
        formUuid="form-1"
        appType="app"
        formInstanceId="inst-1"
        enableChangeRecords
        renderFooterActions={renderFooterActions}
      />,
    );

    expect(screen.getByTestId('footer-actions')).toHaveTextContent('footer-编辑');
    expect(screen.getByTestId('change-records')).toHaveTextContent('1');
    fireEvent.click(screen.getByText('footer-编辑'));
    expect(processDetailState.value.switchToEdit).toHaveBeenCalled();
  });
});
