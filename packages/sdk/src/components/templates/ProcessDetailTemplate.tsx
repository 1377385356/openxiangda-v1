import React, { useCallback, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { Form as AntForm, Input, Modal, message } from 'antd';
import type {
  FormSchema,
  InitiatorSelectedApprovers,
  InitiatorSelectRequirement,
  ProcessTask,
  ProcessAction,
  FieldBehavior,
  ReturnableNode,
  ProcessStatus,
} from '../types';
import { FormProvider } from '../core/FormProvider';
import { useFormContext } from '../core/FormContext';
import { FormRenderer } from '../core/FormRenderer';
import { FormShell } from '../core/FormShell';
import { validateAndNotify } from '../core/validationFeedback';
import { getResubmitInitiatorSelectRequirements } from '../core/processApi';
import { useProcessDetail } from '../hooks/useProcessDetail';
import { useApprovalActions } from '../hooks/useApprovalActions';
import { useChangeRecords } from '../hooks/useChangeRecords';
import { ApprovalTimeline } from '../modules/ApprovalTimeline';
import { ApprovalActionBar } from '../modules/ApprovalActionBar';
import { RuntimePageShell } from '../modules/RuntimePageShell';
import { StickyActionBar } from '../modules/StickyActionBar';
import { SummaryPanel } from '../modules/SummaryPanel';
import { RecordChangePanel } from '../modules/RecordChangePanel';
import { InitiatorApproverSelector } from '../modules/InitiatorApproverSelector';
import type { ActionConfig } from '../modules/FormActionBar';
import { PageSkeleton } from './PageSkeleton';

export interface ProcessDetailTemplateProps {
  schema: FormSchema;
  formUuid: string;
  appType: string;
  formInstanceId: string;
  enableEdit?: boolean;
  enableDelete?: boolean;
  enableChangeRecords?: boolean;
  showApproverInfo?: boolean;
  header?: React.ReactNode;
  renderTimeline?: (tasks: ProcessTask[]) => React.ReactNode;
  renderActions?: (actions: ProcessAction[]) => React.ReactNode;
  renderFooterActions?: (actions: ActionConfig[]) => React.ReactNode;
  renderTransferSelector?: (props: {
    value?: string;
    onChange: (userId: string) => void;
  }) => React.ReactNode;
  renderReturnNodeLabel?: (node: ReturnableNode) => React.ReactNode;
  renderActionModalExtra?: (action: ProcessAction) => React.ReactNode;
  beforeForm?: React.ReactNode;
  afterForm?: React.ReactNode;
  onActionComplete?: (action: string) => Promise<void> | void;
  onSave?: (values: Record<string, any>) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  components?: Record<string, React.ComponentType<any>>;
  inDrawer?: boolean;
}

function FormDataBridge({
  formDataRef,
  validateRef,
}: {
  formDataRef: React.MutableRefObject<(() => Record<string, any>) | undefined>;
  validateRef: React.MutableRefObject<(() => Promise<Record<string, string>>) | undefined>;
}) {
  const { getFormData, validateAllWithErrors } = useFormContext();
  formDataRef.current = getFormData;
  validateRef.current = validateAllWithErrors;
  return null;
}

const formatDateTime = (value?: React.ReactNode) => {
  if (!value || typeof value !== 'string') return value || '-';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : value;
};

const normalizeSelectedApprovers = (
  selectedUsersByNode: Record<string, Array<{ id?: string }>> = {},
): InitiatorSelectedApprovers =>
  Object.fromEntries(
    Object.entries(selectedUsersByNode).map(([nodeId, users]) => [
      nodeId,
      (users || []).map((user) => user.id).filter(Boolean) as string[],
    ]),
  );

type ProcessStampTone = 'running' | 'approved' | 'rejected' | 'danger' | 'neutral';

const PROCESS_STATUS_STAMP: Partial<
  Record<ProcessStatus, { label: string; tone: ProcessStampTone }>
> = {
  running: { label: '流程中', tone: 'running' },
  waiting: { label: '流程中', tone: 'running' },
  pending: { label: '流程中', tone: 'running' },
  completed: { label: '已同意', tone: 'approved' },
  terminated: { label: '已拒绝', tone: 'rejected' },
  exception: { label: '流程异常', tone: 'danger' },
  withdrawn: { label: '已撤销', tone: 'neutral' },
  cancelled: { label: '已取消', tone: 'neutral' },
};

const STAMP_STAR_POINTS = [
  { left: '50%', top: '17%' },
  { left: '63%', top: '22%' },
  { left: '74%', top: '34%' },
  { left: '70%', top: '70%' },
  { left: '56%', top: '79%' },
  { left: '40%', top: '76%' },
  { left: '27%', top: '64%' },
  { left: '24%', top: '36%' },
  { left: '37%', top: '23%' },
];

function ProcessStatusStamp({ status }: { status?: ProcessStatus | null }) {
  const stamp = status ? PROCESS_STATUS_STAMP[status] : undefined;
  if (!stamp) return null;

  return (
    <div
      aria-label={`流程状态：${stamp.label}`}
      className={`sy-process-status-stamp sy-process-status-stamp-${stamp.tone}`}
      role="img"
    >
      <span className="sy-process-status-stamp-ring">
        {STAMP_STAR_POINTS.map((point, index) => (
          <span
            key={`${point.left}-${point.top}-${index}`}
            aria-hidden="true"
            className="sy-process-status-stamp-star"
            style={point}
          >
            ★
          </span>
        ))}
        <span className="sy-process-status-stamp-text">{stamp.label}</span>
      </span>
    </div>
  );
}

const InnerProcessContent: React.FC<ProcessDetailTemplateProps> = ({
  schema,
  formUuid,
  appType,
  formInstanceId,
  enableEdit = true,
  enableDelete = true,
  enableChangeRecords = true,
  showApproverInfo = true,
  header,
  renderTimeline,
  renderActions,
  renderFooterActions,
  renderTransferSelector,
  renderReturnNodeLabel,
  renderActionModalExtra,
  beforeForm,
  afterForm,
  onActionComplete,
  onSave,
  onDelete,
  components,
  inDrawer = false,
}) => {
  const formDataRef = useRef<(() => Record<string, any>) | undefined>(undefined);
  const validateRef = useRef<(() => Promise<Record<string, string>>) | undefined>(undefined);
  const [withdrawForm] = AntForm.useForm();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [initiatorApproverOpen, setInitiatorApproverOpen] = useState(false);
  const [initiatorApproverRequirements, setInitiatorApproverRequirements] = useState<
    InitiatorSelectRequirement[]
  >([]);
  const [pendingResubmitComments, setPendingResubmitComments] = useState<string | undefined>();
  const fieldIds = useMemo(() => schema.fields.map((field) => field.fieldId), [schema.fields]);
  const { api } = useFormContext();

  const {
    loading,
    processInfo,
    processStatus,
    currentTask,
    progressList,
    formData,
    instanceInfo,
    accessDenied,
    loadError,
    isApprover,
    activeActions,
    fieldBehaviors,
    mode,
    isOriginatorReturn,
    isProcessCompleted,
    canWithdraw,
    canEdit,
    canDelete,
    canViewWorkflow,
    canViewChangeRecords,
    dataVersion,
    switchToEdit,
    switchToReadonly,
    saveChanges,
    deleteInstance,
    refreshDetail,
  } = useProcessDetail({ formUuid, appType, formInstanceId, fieldIds });
  const currentTaskId = currentTask?.taskId ?? currentTask?.id;

  const {
    approve,
    reject,
    transfer,
    returnTo,
    withdraw,
    save,
    resubmit,
    callbackTask,
    returnableNodes,
    returnPolicy,
    loadReturnableNodes,
  } = useApprovalActions({
    formInstanceId,
    formUuid,
    appType,
    currentTaskId,
    onActionComplete: async (action: string) => {
      await onActionComplete?.(action);
      await refreshDetail();
    },
    getFormValues: () => formDataRef.current?.() ?? formData ?? {},
  });

  const {
    records,
    loading: recordsLoading,
    total: recordsTotal,
    page: recordsPage,
    hasMore,
    loadMore,
    refresh: refreshRecords,
  } = useChangeRecords({
    formUuid,
    appType,
    formInstanceId,
    autoLoad: enableChangeRecords && canViewChangeRecords,
  });

  const validateForm = useCallback(async () => {
    return validateRef.current ? validateAndNotify(validateRef.current) : true;
  }, []);

  const handleApprove = useCallback(
    async (comments?: string) => {
      if (!(await validateForm())) return;
      await approve(comments);
    },
    [approve, validateForm],
  );

  const handleReject = useCallback(
    async (comments?: string) => {
      await reject(comments);
    },
    [reject],
  );

  const handleTransfer = useCallback(
    async (userId: string, reason?: string) => {
      await transfer(userId, reason);
    },
    [transfer],
  );

  const handleReturn = useCallback(
    async (nodeId: string, reason?: string) => {
      await returnTo(nodeId, reason);
    },
    [returnTo],
  );

  const handleWithdraw = useCallback(
    async (reason?: string) => {
      await withdraw(reason);
    },
    [withdraw],
  );

  const handleSave = useCallback(async () => {
    if (!(await validateForm())) return;
    await save();
  }, [save, validateForm]);

  const handleResubmit = useCallback(
    async (comments?: string) => {
      if (!(await validateForm())) return;
      const values = formDataRef.current?.() ?? formData ?? {};
      if (!currentTaskId) {
        message.error('未找到发起人修改任务');
        return;
      }

      let requirements: InitiatorSelectRequirement[] = [];
      try {
        requirements = await getResubmitInitiatorSelectRequirements(api.request, {
          taskId: currentTaskId,
          formUuid,
          appType,
          data: values,
        });
      } catch (error) {
        console.error(
          '[ProcessDetailTemplate] Load resubmit initiator approver requirements failed:',
          error,
        );
        message.error(error instanceof Error ? error.message : '加载审批人选择要求失败');
        return;
      }
      if (requirements.length > 0) {
        setPendingResubmitComments(comments);
        setInitiatorApproverRequirements(requirements);
        setInitiatorApproverOpen(true);
        return;
      }

      await resubmit(comments);
    },
    [api.request, appType, currentTaskId, formData, formUuid, resubmit, validateForm],
  );

  const handleInitiatorApproverConfirm = useCallback(
    async (selectedUsersByNode: Record<string, Array<{ id?: string }>>) => {
      const selectedApprovers = normalizeSelectedApprovers(selectedUsersByNode);
      setInitiatorApproverOpen(false);
      setInitiatorApproverRequirements([]);
      const comments = pendingResubmitComments;
      setPendingResubmitComments(undefined);
      await resubmit(comments, selectedApprovers);
    },
    [pendingResubmitComments, resubmit],
  );

  const handleInitiatorApproverCancel = useCallback(() => {
    setInitiatorApproverOpen(false);
    setInitiatorApproverRequirements([]);
    setPendingResubmitComments(undefined);
  }, []);

  const handleCallback = useCallback(async () => {
    await callbackTask();
  }, [callbackTask]);

  const handleCompletedSave = useCallback(async () => {
    if (!(await validateForm())) return;
    const values = formDataRef.current?.() ?? formData;
    if (!values) return;
    setSaveLoading(true);
    try {
      const success = await saveChanges(values);
      if (success) {
        await onSave?.(values);
      }
    } finally {
      setSaveLoading(false);
    }
  }, [formData, onSave, saveChanges, validateForm]);

  const handleCompletedDelete = useCallback(async () => {
    setDeleteLoading(true);
    try {
      const success = await deleteInstance();
      if (success) {
        await onDelete?.();
      }
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteInstance, onDelete]);

  const handleFooterWithdraw = useCallback(async () => {
    const values = await withdrawForm.validateFields();
    setWithdrawLoading(true);
    try {
      await handleWithdraw(values.reason || undefined);
      setWithdrawOpen(false);
      withdrawForm.resetFields();
    } finally {
      setWithdrawLoading(false);
    }
  }, [handleWithdraw, withdrawForm]);

  const handleFooterWithdrawCancel = useCallback(() => {
    setWithdrawOpen(false);
    withdrawForm.resetFields();
  }, [withdrawForm]);

  const bottomActions: ActionConfig[] = useMemo(() => {
    if (isApprover && !isOriginatorReturn && activeActions.length > 0) return [];

    if (isProcessCompleted) {
      if (mode === 'readonly') {
        const actions: ActionConfig[] = [];
        if (enableEdit && canEdit) {
          actions.push({
            key: 'edit',
            label: '编辑',
            type: 'primary',
            onClick: switchToEdit,
          });
        }
        if (enableDelete && canDelete) {
          actions.push({
            key: 'delete',
            label: '删除',
            type: 'danger',
            loading: deleteLoading,
            onClick: handleCompletedDelete,
            confirm: { title: '确认删除', content: '删除后将无法恢复，确认要删除吗？' },
          });
        }
        return actions;
      }

      return [
        {
          key: 'cancel',
          label: '取消',
          type: 'default',
          onClick: switchToReadonly,
          placement: 'left',
        },
        {
          key: 'save',
          label: '保存',
          type: 'primary',
          loading: saveLoading,
          onClick: handleCompletedSave,
        },
      ];
    }

    if (isOriginatorReturn) {
      if (mode === 'readonly') {
        const actions: ActionConfig[] = [
          {
            key: 'edit',
            label: '编辑',
            type: 'primary',
            onClick: switchToEdit,
          },
        ];
        actions.push({
          key: 'resubmit',
          label: '重新提交',
          type: 'default',
          onClick: () => handleResubmit(),
        });
        if (canWithdraw) {
          actions.push({
            key: 'withdraw',
            label: '撤销',
            type: 'danger',
            onClick: () => setWithdrawOpen(true),
          });
        }
        return actions;
      }
      const actions: ActionConfig[] = [
        {
          key: 'cancel',
          label: '取消',
          type: 'default',
          onClick: switchToReadonly,
          placement: 'left',
        },
        {
          key: 'resubmit',
          label: '重新提交',
          type: 'primary',
          onClick: () => handleResubmit(),
        },
      ];
      if (canWithdraw) {
        actions.push({
          key: 'withdraw',
          label: '撤销',
          type: 'danger',
          onClick: () => setWithdrawOpen(true),
        });
      }
      return actions;
    }

    if (canWithdraw) {
      return [
        {
          key: 'withdraw',
          label: '撤销',
          type: 'danger',
          loading: withdrawLoading,
          onClick: () => setWithdrawOpen(true),
        },
      ];
    }

    return [];
  }, [
    activeActions.length,
    canDelete,
    canEdit,
    canWithdraw,
    deleteLoading,
    enableDelete,
    enableEdit,
    handleCompletedDelete,
    handleCompletedSave,
    handleResubmit,
    isApprover,
    isOriginatorReturn,
    isProcessCompleted,
    mode,
    saveLoading,
    switchToEdit,
    switchToReadonly,
    withdrawLoading,
  ]);

  const formConfig = {
    mode: mode === 'edit' ? ('edit' as const) : ('readonly' as const),
    formUuid,
    appType,
    formInstanceId,
    permissions: {
      fieldPermissions: fieldBehaviors as Record<string, FieldBehavior>,
      operations: [] as string[],
    },
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-ant-bg-layout">
        <div className="mx-auto max-w-4xl px-6 py-8 pb-24">
          <PageSkeleton type="process" />
        </div>
      </div>
    );
  }

  if (accessDenied || loadError) {
    return (
      <RuntimePageShell accessDenied={accessDenied} error={loadError} inDrawer={inDrawer}>
        <div />
      </RuntimePageShell>
    );
  }

  const showApprovalActions = isApprover && !isOriginatorReturn && activeActions.length > 0;
  const actionsNode = showApprovalActions ? (
    renderActions ? (
      renderActions(activeActions)
    ) : (
      <ApprovalActionBar
        actions={activeActions}
        onApprove={handleApprove}
        onReject={handleReject}
        onTransfer={handleTransfer}
        onReturn={handleReturn}
        onWithdraw={handleWithdraw}
        onSave={handleSave}
        onResubmit={handleResubmit}
        onCallback={handleCallback}
        returnableNodes={returnableNodes}
        returnPolicy={returnPolicy}
        onLoadReturnableNodes={loadReturnableNodes}
        renderTransferSelector={renderTransferSelector}
        renderReturnNodeLabel={renderReturnNodeLabel}
        renderActionModalExtra={renderActionModalExtra}
        inDrawer={inDrawer}
        maxWidth={1180}
      />
    )
  ) : bottomActions.length > 0 ? (
    renderFooterActions ? (
      renderFooterActions(bottomActions)
    ) : (
      <StickyActionBar actions={bottomActions} align="center" inDrawer={inDrawer} maxWidth={1180} />
    )
  ) : null;

  const hasStatusStamp = Boolean(processStatus && PROCESS_STATUS_STAMP[processStatus]);
  const submitterName =
    processInfo?.originatorName || instanceInfo?.creator?.name || instanceInfo?.createdByName;
  const submitterDepartment =
    processInfo?.originatorDepartment ||
    instanceInfo?.creator?.department ||
    instanceInfo?.createdByDepartmentName;
  const submittedAt = formatDateTime(processInfo?.createdAt || instanceInfo?.createdAt);
  const summaryCreator =
    submitterName || submitterDepartment
      ? {
          name: submitterName || '未知用户',
          department: submitterDepartment,
        }
      : undefined;

  return (
    <RuntimePageShell
      actions={actionsNode}
      contentClassName="sy-detail-page"
      inDrawer={inDrawer}
      maxWidth="100%"
    >
      <div className="sy-detail-header">
        <div className="sy-detail-header-inner">
          {header}

          <div
            className={`sy-process-summary ${hasStatusStamp ? 'sy-process-summary-with-stamp' : ''}`}
          >
            <SummaryPanel
              title={processInfo?.title || instanceInfo?.title || schema.formMeta.title}
              showEyebrow={false}
              creator={summaryCreator}
              createdAt={submittedAt}
              metaItems={[
                {
                  key: 'creator',
                  label: '提交人',
                  value: submitterName || '未知用户',
                },
                {
                  key: 'department',
                  label: '提交人部门',
                  value: submitterDepartment || '-',
                },
                {
                  key: 'createdAt',
                  label: '提交时间',
                  value: submittedAt,
                },
              ]}
              className="sy-detail-summary-panel"
            />
            <ProcessStatusStamp status={processStatus} />
          </div>
        </div>
      </div>

      <div className="sy-detail-main">
        {beforeForm}

        {mode === 'edit' && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 transition-all duration-150">
            {isProcessCompleted ? '正在编辑，修改后请保存' : '正在编辑表单，修改后请重新提交'}
          </div>
        )}

        <div className="sy-detail-card">
          <FormProvider
            key={`${mode}-${dataVersion}`}
            schema={schema}
            config={formConfig}
            initialValues={formData ?? undefined}
            components={components}
          >
            <FormShell appearance={schema.template?.appearance} className="sy-form-shell">
              <FormDataBridge formDataRef={formDataRef} validateRef={validateRef} />
              <FormRenderer
                columns={schema.template?.appearance?.columns ?? 2}
                size={schema.template?.appearance?.rendererSize ?? 'default'}
              />
            </FormShell>
          </FormProvider>
        </div>

        {afterForm}

        {canViewWorkflow && (
          <div className="sy-detail-card">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-ant-color-text">审批进度</h3>
                <p className="mt-1 text-xs text-ant-color-text-tertiary">
                  节点、审批人、处理意见和等待状态
                </p>
              </div>
            </div>
            {renderTimeline ? (
              renderTimeline(progressList)
            ) : (
              <ApprovalTimeline
                tasks={progressList}
                showRemarks
                showApproverInfo={showApproverInfo}
              />
            )}
          </div>
        )}

        {enableChangeRecords && canViewChangeRecords && (
          <RecordChangePanel
            records={records}
            loading={recordsLoading}
            total={recordsTotal}
            page={recordsPage}
            hasMore={hasMore}
            onLoadMore={loadMore}
            onRefresh={refreshRecords}
            onExpand={refreshRecords}
          />
        )}
      </div>
      <Modal
        getContainer={false}
        title="撤销流程"
        open={withdrawOpen}
        okText="确认撤销"
        cancelText="取消"
        confirmLoading={withdrawLoading}
        okButtonProps={{ danger: true }}
        onOk={handleFooterWithdraw}
        onCancel={handleFooterWithdrawCancel}
        destroyOnHidden
      >
        <AntForm form={withdrawForm} layout="vertical">
          <AntForm.Item
            name="reason"
            label="撤销原因"
            rules={[{ required: true, message: '请填写撤销原因' }]}
          >
            <Input.TextArea rows={4} maxLength={500} showCount placeholder="请输入撤销原因" />
          </AntForm.Item>
        </AntForm>
      </Modal>
      <InitiatorApproverSelector
        open={initiatorApproverOpen}
        formUuid={formUuid}
        appType={appType}
        api={api}
        requirements={initiatorApproverRequirements}
        onOk={handleInitiatorApproverConfirm}
        onCancel={handleInitiatorApproverCancel}
      />
    </RuntimePageShell>
  );
};

export const ProcessDetailTemplate: React.FC<ProcessDetailTemplateProps> = (props) => {
  const { schema, formUuid, appType, formInstanceId, components } = props;

  const wrapperConfig = {
    mode: 'readonly' as const,
    formUuid,
    appType,
    formInstanceId,
  };

  return (
    <FormProvider schema={schema} config={wrapperConfig} components={components}>
      <InnerProcessContent {...props} />
    </FormProvider>
  );
};
