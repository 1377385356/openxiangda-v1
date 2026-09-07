import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Button, message, Modal, Select } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';
import type {
  FormSchema,
  FormEngineConfig,
  InitiatorSelectedApprovers,
  InitiatorSelectRequirement,
  OptionItem,
  ProcessDefinition,
  ProcessRoute,
  UserItem,
} from '../types';
import { FormProvider } from '../core/FormProvider';
import { FormRenderer } from '../core/FormRenderer';
import { FormShell } from '../core/FormShell';
import { useFormContext } from '../core/FormContext';
import {
  getInitiatorSelectRequirements,
  getProcessDefinition,
  previewProcess,
} from '../core/processApi';
import { validateAndNotify } from '../core/validationFeedback';
import { useDraftStorage } from '../hooks/useDraftStorage';
import { useFormNavigation } from '../hooks/useFormNavigation';
import { DraftManager } from '../modules/DraftManager';
import { InitiatorApproverSelector } from '../modules/InitiatorApproverSelector';
import { ProcessPreview } from '../modules/ProcessPreview';
import { RuntimePageShell } from '../modules/RuntimePageShell';
import { StickyActionBar } from '../modules/StickyActionBar';
import type { ActionConfig } from '../modules/FormActionBar';
import { dateRangeToSubmitValue } from '../fields/DateField/dateFormat';

export interface SubmitSuccessInfo {
  formInstanceId: string;
  message?: string;
}

const SUPERVISOR_APPROVER_TYPE = 'ext_target_approval_department_supervisor';

const unwrapRuntimePayload = (value: any) => value?.data ?? value?.result ?? value;

const normalizeSubmitFormType = (value?: string): 'form' | 'process' => {
  const raw = String(value || '').toLowerCase();
  return raw === 'process' || raw === 'flow' ? 'process' : 'form';
};

const resolveSubmitBehavior = (config: FormEngineConfig) => {
  if (config.submitBehavior && config.submitBehavior !== 'auto') {
    return config.submitBehavior;
  }
  return config.mode === 'edit' && config.formInstanceId ? 'update' : 'create';
};

const isSaveDraftSubmitBehavior = (config: FormEngineConfig) =>
  resolveSubmitBehavior(config) === 'save-draft';

const hasDepartmentSupervisorApproval = (definition: ProcessDefinition | any): boolean => {
  const raw = definition?.definitionJson || definition?.viewJson || definition;
  const nodes = Array.isArray(raw?.nodes) ? raw.nodes : [];
  return nodes.some(
    (node: any) =>
      node?.type === 'approval' && node?.data?.approverType === SUPERVISOR_APPROVER_TYPE,
  );
};

const normalizeDepartmentOptions = (
  departments?: Array<{
    id?: string;
    value?: string;
    key?: string;
    departmentId?: string;
    name?: string;
    label?: string;
    title?: string;
    departmentName?: string;
  }>,
) =>
  (departments || [])
    .map((department) => {
      const id =
        department?.id ?? department?.value ?? department?.departmentId ?? department?.key ?? '';
      return {
        value: String(id),
        label:
          department?.name ||
          department?.label ||
          department?.departmentName ||
          department?.title ||
          String(id),
      };
    })
    .filter((department) => department.value);

const pickFormInstanceId = (value: any): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return undefined;

  const direct = value.formInstanceId || value.formInstId || value.instanceId || value.id;
  if (direct) return pickFormInstanceId(direct);
  for (const candidate of [value.result, value.data, value.raw]) {
    const picked = pickFormInstanceId(candidate);
    if (picked) return picked;
  }
  return undefined;
};

const getSubmitResultFormInstanceId = (
  submitResponse: any,
  config: FormEngineConfig,
  submitBehavior: ReturnType<typeof resolveSubmitBehavior>,
): string => {
  const responseId = pickFormInstanceId(submitResponse);
  if (responseId) return responseId;
  if (submitBehavior !== 'create' && config.formInstanceId) {
    return config.formInstanceId;
  }
  throw new Error(
    '提交接口未返回 formInstId/formInstanceId。保存接口只返回实例标识和已生成的流水号；如需完整数据、公式回填或其他服务端字段，请保存成功后再查询详情。',
  );
};

const normalizeFormDataForSubmit = (
  schema: FormSchema,
  formData: Record<string, any>,
): Record<string, any> => {
  const next = { ...formData };
  for (const field of schema.fields) {
    if (!Object.prototype.hasOwnProperty.call(next, field.fieldId)) continue;
    if (field.componentName === 'CascadeDateField') {
      next[field.fieldId] = dateRangeToSubmitValue(next[field.fieldId]);
      continue;
    }
    if (field.componentName === 'SubFormField' && Array.isArray(next[field.fieldId])) {
      const columns = Array.isArray((field as any).columns) ? (field as any).columns : [];
      next[field.fieldId] = next[field.fieldId].map((row: Record<string, any>) => {
        const nextRow = { ...(row || {}) };
        for (const column of columns) {
          if (
            column?.componentName === 'CascadeDateField' &&
            Object.prototype.hasOwnProperty.call(nextRow, column.fieldId)
          ) {
            nextRow[column.fieldId] = dateRangeToSubmitValue(nextRow[column.fieldId]);
          }
        }
        return nextRow;
      });
    }
  }
  return next;
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

export interface FormSubmitTemplateProps {
  schema: FormSchema;
  config: FormEngineConfig;
  formType?: 'form' | 'process';
  submitSuccessMode?: 'redirect' | 'stay' | 'continue';
  enableDraft?: boolean;
  enableProcessPreview?: boolean;
  enableSubmissionDepartmentSelect?: boolean;
  departmentOptions?: OptionItem[];
  header?: React.ReactNode;
  footer?: React.ReactNode;
  beforeForm?: React.ReactNode;
  afterForm?: React.ReactNode;
  renderDepartmentSelector?: (props: {
    value?: string;
    onChange: (value?: string) => void;
    options: OptionItem[];
  }) => React.ReactNode;
  renderForm?: (props: { schema: FormSchema; config: FormEngineConfig }) => React.ReactNode;
  renderSuccess?: (info: SubmitSuccessInfo) => React.ReactNode;
  onSubmitSuccess?: (formInstId: string) => void;
  initialValues?: Record<string, any>;
  components?: Record<string, React.ComponentType<any>>;
  inDrawer?: boolean;
}

interface SubmitSuccessCardProps {
  info: SubmitSuccessInfo;
  mode: 'redirect' | 'stay' | 'continue';
  isRedirecting: boolean;
  countdown: number;
  onContinue: () => void;
  onViewDetail: () => void;
  renderSuccess?: (info: SubmitSuccessInfo) => React.ReactNode;
}

const SubmitSuccessCard: React.FC<SubmitSuccessCardProps> = ({
  info,
  mode,
  isRedirecting,
  countdown,
  onContinue,
  onViewDetail,
  renderSuccess,
}) => {
  if (renderSuccess) {
    return <>{renderSuccess(info)}</>;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex flex-col items-center py-16 animate-[fadeIn_0.3s_ease-out,scaleIn_0.3s_ease-out]">
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <CheckCircleFilled className="text-2xl text-green-500" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">提交成功</h2>
        <p className="text-sm text-gray-500 mb-6">{info.message || '已成功创建一条新记录'}</p>
        <div className="flex gap-3">
          {(mode === 'stay' || mode === 'redirect') && (
            <Button onClick={onContinue}>继续提交</Button>
          )}
          <Button type="primary" onClick={onViewDetail}>
            查看详情
          </Button>
        </div>
        {isRedirecting && (
          <div className="mt-6 w-48">
            <div className="text-xs text-gray-400 text-center mb-1">{countdown}秒后自动跳转</div>
            <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-1000"
                style={{ width: `${(countdown / 3) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface InnerFormContentProps {
  schema: FormSchema;
  config: FormEngineConfig;
  formType: 'form' | 'process';
  submitSuccessMode: 'redirect' | 'stay' | 'continue';
  enableDraft: boolean;
  enableProcessPreview: boolean;
  enableSubmissionDepartmentSelect: boolean;
  departmentOptions: OptionItem[];
  header?: React.ReactNode;
  footer?: React.ReactNode;
  beforeForm?: React.ReactNode;
  afterForm?: React.ReactNode;
  renderDepartmentSelector?: (props: {
    value?: string;
    onChange: (value?: string) => void;
    options: OptionItem[];
  }) => React.ReactNode;
  renderForm?: (props: { schema: FormSchema; config: FormEngineConfig }) => React.ReactNode;
  renderSuccess?: (info: SubmitSuccessInfo) => React.ReactNode;
  onSubmitSuccess?: (formInstId: string) => void;
  inDrawer?: boolean;
}

const InnerFormContent: React.FC<InnerFormContentProps> = ({
  schema,
  config,
  formType,
  submitSuccessMode,
  enableDraft,
  enableProcessPreview,
  enableSubmissionDepartmentSelect,
  departmentOptions,
  header,
  footer,
  beforeForm,
  afterForm,
  renderDepartmentSelector,
  renderForm,
  renderSuccess,
  onSubmitSuccess,
  inDrawer = false,
}) => {
  const { validateAllWithErrors, getFormData, setFieldValue, resetForm, api } = useFormContext();
  const [submitted, setSubmitted] = useState(false);
  const [successInfo, setSuccessInfo] = useState<SubmitSuccessInfo | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [departmentId, setDepartmentId] = useState<string | undefined>();
  const [submissionDepartmentModalOpen, setSubmissionDepartmentModalOpen] = useState(false);
  const [submissionDepartmentOptions, setSubmissionDepartmentOptions] = useState<OptionItem[]>([]);
  const [selectedSubmissionDepartmentId, setSelectedSubmissionDepartmentId] = useState<
    string | undefined
  >();
  const submissionDepartmentResolverRef = useRef<((value: string | null) => void) | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewRoutes, setPreviewRoutes] = useState<ProcessRoute[]>([]);
  const [pendingFormData, setPendingFormData] = useState<Record<string, any> | null>(null);
  const [pendingSubmissionDepartmentId, setPendingSubmissionDepartmentId] = useState<
    string | undefined
  >();
  const [pendingInitiatorSelectedApprovers, setPendingInitiatorSelectedApprovers] = useState<
    InitiatorSelectedApprovers | undefined
  >();
  const pendingSubmissionDepartmentIdRef = useRef<string | undefined>(undefined);
  const pendingInitiatorSelectedApproversRef = useRef<InitiatorSelectedApprovers | undefined>(
    undefined,
  );
  const [initiatorApproverOpen, setInitiatorApproverOpen] = useState(false);
  const [initiatorApproverRequirements, setInitiatorApproverRequirements] = useState<
    InitiatorSelectRequirement[]
  >([]);

  const { hasDraft, draftTimestamp, saveDraft, restoreDraft, clearDraft } = useDraftStorage({
    appType: config.appType,
    formUuid: config.formUuid,
  });

  const { navigateToDetail, navigateToProcessDetail, isRedirecting, countdown, handlePostSubmit } =
    useFormNavigation({
      appType: config.appType,
      formUuid: config.formUuid,
      formType,
      mode: submitSuccessMode === 'continue' ? 'stay' : submitSuccessMode,
      basePath: config.navigation?.basePath,
    });

  useEffect(() => {
    return () => {
      submissionDepartmentResolverRef.current?.(null);
      submissionDepartmentResolverRef.current = null;
    };
  }, []);

  const closeSubmissionDepartmentModal = useCallback((value: string | null = null) => {
    setSubmissionDepartmentModalOpen(false);
    setSubmissionDepartmentOptions([]);
    setSelectedSubmissionDepartmentId(undefined);
    submissionDepartmentResolverRef.current?.(value);
    submissionDepartmentResolverRef.current = null;
  }, []);

  const promptSubmissionDepartmentSelection = useCallback(
    (options: OptionItem[], preferredDepartmentId?: string) => {
      return new Promise<string | null>((resolve) => {
        const selected = options.some((option) => option.value === preferredDepartmentId)
          ? preferredDepartmentId
          : options[0]?.value;
        setSubmissionDepartmentOptions(options);
        setSelectedSubmissionDepartmentId(selected);
        submissionDepartmentResolverRef.current = resolve;
        setSubmissionDepartmentModalOpen(true);
      });
    },
    [],
  );

  const resolveSubmissionDepartmentId = useCallback(async (): Promise<
    string | null | undefined
  > => {
    if (formType !== 'process') {
      return undefined;
    }

    const definition = await getProcessDefinition(api.request, config.formUuid);
    if (!hasDepartmentSupervisorApproval(definition)) {
      return departmentId;
    }

    const runtimeUser = schema.runtime?.currentUser as UserItem | undefined;
    const loadedUser = runtimeUser || unwrapRuntimePayload(await api.getUserById('current'));
    const departments = normalizeDepartmentOptions(loadedUser?.departments);

    if (departments.length === 0) {
      message.error('当前账号未分配部门，无法发起主管审批流程');
      return null;
    }

    if (departments.length === 1) {
      const onlyDepartmentId = departments[0].value;
      setDepartmentId(onlyDepartmentId);
      return onlyDepartmentId;
    }

    return promptSubmissionDepartmentSelection(departments, departmentId);
  }, [api, config.formUuid, departmentId, formType, promptSubmissionDepartmentSelection, schema]);

  const performSubmit = useCallback(
    async (
      formData: Record<string, any>,
      submissionDepartmentId?: string,
      initiatorSelectedApprovers?: InitiatorSelectedApprovers,
    ) => {
      const submitData = normalizeFormDataForSubmit(schema, formData);
      setSubmitting(true);
      try {
        const submitBehavior = resolveSubmitBehavior(config);
        if (submitBehavior === 'start-existing-process' && !config.formInstanceId) {
          throw new Error('formInstanceId 不能为空，无法从已有表单实例发起流程');
        }
        const submitResponse =
          submitBehavior === 'start-existing-process'
            ? await api.startProcessFromExistingInstance({
                appType: config.appType,
                formUuid: config.formUuid,
                formInstId: config.formInstanceId,
                formInstanceId: config.formInstanceId,
                updateFormDataJson: JSON.stringify(submitData),
                submissionDepartmentId: submissionDepartmentId ?? departmentId,
                selectedApprovers: initiatorSelectedApprovers,
                initiatorSelectedApprovers,
              })
            : submitBehavior === 'update' && config.formInstanceId
            ? await api.updateFormData({
                appType: config.appType,
                formUuid: config.formUuid,
                formInstId: config.formInstanceId,
                formInstanceId: config.formInstanceId,
                updateFormDataJson: JSON.stringify(submitData),
              })
            : await api.submitFormData({
                appType: config.appType,
                formUuid: config.formUuid,
                data: submitData,
                saveAsDraft: submitBehavior === 'save-draft' ? true : undefined,
                startProcess: submitBehavior === 'save-draft' ? false : undefined,
                processStartMode:
                  submitBehavior === 'save-draft' ? 'manual' : undefined,
                submissionDepartmentId: submissionDepartmentId ?? departmentId,
                selectedApprovers: initiatorSelectedApprovers,
                initiatorSelectedApprovers,
              });

        const formInstId = getSubmitResultFormInstanceId(submitResponse, config, submitBehavior);

        if (config.submit?.afterSubmit) {
          await config.submit.afterSubmit({
            formInstanceId: formInstId,
            data: submitData,
            response: submitResponse,
          });
        }

        if (enableDraft) {
          clearDraft();
        }

        onSubmitSuccess?.(formInstId);

        if (submitSuccessMode === 'continue') {
          resetForm();
        } else {
          setSuccessInfo({
            formInstanceId: formInstId,
            message:
              submitBehavior === 'save-draft'
                ? '草稿已保存，可稍后发起审批'
                : undefined,
          });
          setSubmitted(true);
          handlePostSubmit(formInstId);
        }
      } catch (error) {
        console.error('[FormSubmitTemplate] Submit failed:', error);
        message.error(error instanceof Error ? error.message : '提交失败');
      } finally {
        setSubmitting(false);
      }
    },
    [
      api,
      clearDraft,
      config,
      schema,
      enableDraft,
      handlePostSubmit,
      onSubmitSuccess,
      resetForm,
      submitSuccessMode,
      departmentId,
    ],
  );

  const continuePreparedSubmit = useCallback(
    async (
      submitData: Record<string, any>,
      submissionDepartmentId?: string,
      initiatorSelectedApprovers?: InitiatorSelectedApprovers,
    ) => {
      if (
        formType === 'process' &&
        enableProcessPreview &&
        !isSaveDraftSubmitBehavior(config)
      ) {
        setPendingFormData(submitData);
        setPendingSubmissionDepartmentId(submissionDepartmentId);
        pendingSubmissionDepartmentIdRef.current = submissionDepartmentId;
        setPendingInitiatorSelectedApprovers(initiatorSelectedApprovers);
        pendingInitiatorSelectedApproversRef.current = initiatorSelectedApprovers;
        setPreviewOpen(true);
        setPreviewLoading(true);
        try {
          const routes = await previewProcess(api.request, {
            appType: config.appType,
            formUuid: config.formUuid,
            data: submitData,
            submissionDepartmentId,
            selectedApprovers: initiatorSelectedApprovers,
            initiatorSelectedApprovers,
          });
          setPreviewRoutes(Array.isArray(routes) ? routes : []);
        } catch (error) {
          console.error('[FormSubmitTemplate] Preview failed:', error);
          setPreviewRoutes([]);
        } finally {
          setPreviewLoading(false);
        }
        return;
      }

      await performSubmit(submitData, submissionDepartmentId, initiatorSelectedApprovers);
    },
    [api.request, config, enableProcessPreview, formType, performSubmit],
  );

  const prepareSubmit = useCallback(async () => {
    const valid = await validateAndNotify(validateAllWithErrors);
    if (!valid) return;

    const formData = getFormData();
    const submitData = normalizeFormDataForSubmit(schema, formData);

    if (config.submit?.beforeSubmit) {
      const shouldContinue = await config.submit.beforeSubmit(formData);
      if (shouldContinue === false) {
        return;
      }
    }

    const saveDraftSubmit = isSaveDraftSubmitBehavior(config);
    let submissionDepartmentId: string | null | undefined;
    try {
      submissionDepartmentId = saveDraftSubmit
        ? undefined
        : await resolveSubmissionDepartmentId();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '提交失败');
      return;
    }
    if (submissionDepartmentId === null) {
      return;
    }

    if (formType === 'process' && !saveDraftSubmit) {
      try {
        const requirements = await getInitiatorSelectRequirements(api.request, {
          appType: config.appType,
          formUuid: config.formUuid,
          data: submitData,
          submissionDepartmentId,
        });
        if (requirements.length > 0) {
          setPendingFormData(submitData);
          setPendingSubmissionDepartmentId(submissionDepartmentId);
          pendingSubmissionDepartmentIdRef.current = submissionDepartmentId;
          setPendingInitiatorSelectedApprovers(undefined);
          pendingInitiatorSelectedApproversRef.current = undefined;
          setInitiatorApproverRequirements(requirements);
          setInitiatorApproverOpen(true);
          return;
        }
      } catch (error) {
        console.error('[FormSubmitTemplate] Load initiator approver requirements failed:', error);
        message.error(error instanceof Error ? error.message : '加载审批人选择要求失败');
        return;
      }
    }

    await continuePreparedSubmit(submitData, submissionDepartmentId);
  }, [
    validateAllWithErrors,
    getFormData,
    schema,
    config,
    api,
    formType,
    resolveSubmissionDepartmentId,
    continuePreparedSubmit,
  ]);

  const handlePreviewConfirm = useCallback(async () => {
    const data = pendingFormData ?? getFormData();
    const submissionDepartmentId =
      pendingSubmissionDepartmentIdRef.current ?? pendingSubmissionDepartmentId;
    const initiatorSelectedApprovers =
      pendingInitiatorSelectedApproversRef.current ?? pendingInitiatorSelectedApprovers;
    setPreviewOpen(false);
    setPendingFormData(null);
    setPendingSubmissionDepartmentId(undefined);
    setPendingInitiatorSelectedApprovers(undefined);
    pendingSubmissionDepartmentIdRef.current = undefined;
    pendingInitiatorSelectedApproversRef.current = undefined;
    await performSubmit(data, submissionDepartmentId, initiatorSelectedApprovers);
  }, [
    getFormData,
    pendingFormData,
    pendingInitiatorSelectedApprovers,
    pendingSubmissionDepartmentId,
    performSubmit,
  ]);

  const handleInitiatorApproverConfirm = useCallback(
    async (selectedUsersByNode: Record<string, Array<{ id?: string }>>) => {
      const data = pendingFormData;
      if (!data) {
        setInitiatorApproverOpen(false);
        setInitiatorApproverRequirements([]);
        return;
      }

      const submissionDepartmentId =
        pendingSubmissionDepartmentIdRef.current ?? pendingSubmissionDepartmentId;
      const selectedApprovers = normalizeSelectedApprovers(selectedUsersByNode);
      setInitiatorApproverOpen(false);
      setInitiatorApproverRequirements([]);
      await continuePreparedSubmit(data, submissionDepartmentId, selectedApprovers);
    },
    [continuePreparedSubmit, pendingFormData, pendingSubmissionDepartmentId],
  );

  const handleInitiatorApproverCancel = useCallback(() => {
    setInitiatorApproverOpen(false);
    setInitiatorApproverRequirements([]);
    setPendingFormData(null);
    setPendingSubmissionDepartmentId(undefined);
    setPendingInitiatorSelectedApprovers(undefined);
    pendingSubmissionDepartmentIdRef.current = undefined;
    pendingInitiatorSelectedApproversRef.current = undefined;
  }, []);

  const handleSaveDraft = useCallback(() => {
    const data = getFormData();
    saveDraft(data);
  }, [getFormData, saveDraft]);

  const handleRestoreDraft = useCallback(() => {
    const data = restoreDraft();
    if (!data) return;
    Object.entries(data).forEach(([fieldId, value]) => {
      setFieldValue(fieldId, value);
    });
  }, [restoreDraft, setFieldValue]);

  const handleContinue = useCallback(() => {
    setSubmitted(false);
    setSuccessInfo(null);
    resetForm();
  }, [resetForm]);

  const handleViewDetail = useCallback(() => {
    if (!successInfo) return;
    if (formType === 'process') {
      navigateToProcessDetail(successInfo.formInstanceId);
    } else {
      navigateToDetail(successInfo.formInstanceId);
    }
  }, [successInfo, formType, navigateToDetail, navigateToProcessDetail]);

  const actions: ActionConfig[] = [];
  if (enableDraft) {
    actions.push({
      key: 'draft',
      label: '暂存',
      type: 'default',
      onClick: handleSaveDraft,
    });
  }
  actions.push({
    key: 'submit',
    label: isSaveDraftSubmitBehavior(config) ? '保存草稿' : '提交',
    type: 'primary',
    loading: submitting,
    onClick: prepareSubmit,
  });

  const departmentSelector =
    formType === 'process' && enableSubmissionDepartmentSelect ? (
      <div className="mb-5 rounded-lg border border-ant-border-secondary bg-ant-bg-elevated px-4 py-3">
        <div className="mb-2 text-sm font-medium text-ant-color-text">提交部门</div>
        {renderDepartmentSelector ? (
          renderDepartmentSelector({
            value: departmentId,
            onChange: setDepartmentId,
            options: departmentOptions,
          })
        ) : (
          <Select
            allowClear
            className="w-full"
            placeholder="请选择本次提交流程所属部门"
            value={departmentId}
            options={departmentOptions}
            onChange={setDepartmentId}
          />
        )}
      </div>
    ) : null;

  const actionsNode = !submitted ? (
    <StickyActionBar
      actions={actions}
      inDrawer={inDrawer}
      position="inline"
      align="left"
      surface="transparent"
      className="mt-auto pt-6"
    />
  ) : null;

  return (
    <RuntimePageShell
      className="sy-submit-runtime-page"
      inDrawer={inDrawer}
      maxWidth={inDrawer ? '100%' : 1240}
      contentClassName={inDrawer ? 'md:px-5 md:py-4' : ''}
    >
      <div className="sy-submit-page flex min-h-full flex-1 flex-col space-y-6">
        {header}

        {enableDraft && hasDraft && !submitted && (
          <div>
            <DraftManager
              hasDraft={hasDraft}
              draftTimestamp={draftTimestamp}
              onRestore={handleRestoreDraft}
              onDiscard={clearDraft}
            />
          </div>
        )}

        {!submitted ? (
          <div
            className={`sy-submit-card flex flex-1 flex-col rounded-lg border border-ant-border-secondary bg-ant-bg-container ${
              inDrawer ? 'p-5 md:p-6' : 'p-6 shadow-sm md:p-8'
            }`}
          >
            <FormShell
              appearance={schema.template?.appearance}
              className="sy-form-shell sy-submit-form-shell"
            >
              {departmentSelector}
              {beforeForm}
              {renderForm ? (
                renderForm({ schema, config })
              ) : (
                <FormRenderer
                  columns={schema.template?.appearance?.columns ?? 2}
                  size={schema.template?.appearance?.rendererSize ?? 'default'}
                />
              )}
              {afterForm}
              {actionsNode}
            </FormShell>
          </div>
        ) : (
          successInfo && (
            <SubmitSuccessCard
              info={successInfo}
              mode={submitSuccessMode}
              isRedirecting={isRedirecting}
              countdown={countdown}
              onContinue={handleContinue}
              onViewDetail={handleViewDetail}
              renderSuccess={renderSuccess}
            />
          )
        )}

        {footer}
      </div>
      <InitiatorApproverSelector
        open={initiatorApproverOpen}
        formUuid={config.formUuid}
        appType={config.appType}
        api={api}
        requirements={initiatorApproverRequirements}
        onOk={handleInitiatorApproverConfirm}
        onCancel={handleInitiatorApproverCancel}
      />
      <ProcessPreview
        open={previewOpen}
        routes={previewRoutes}
        loading={previewLoading}
        onClose={() => {
          setPreviewOpen(false);
          setPendingFormData(null);
          setPendingSubmissionDepartmentId(undefined);
          setPendingInitiatorSelectedApprovers(undefined);
          pendingSubmissionDepartmentIdRef.current = undefined;
          pendingInitiatorSelectedApproversRef.current = undefined;
        }}
        onConfirm={handlePreviewConfirm}
      />
      <Modal
        getContainer={false}
        open={submissionDepartmentModalOpen}
        title="该流程包含部门主管审批，请选择提交部门后再发起"
        okText="确定"
        cancelText="取消"
        onOk={() => {
          if (!selectedSubmissionDepartmentId) {
            message.error('请选择提交部门');
            return;
          }
          setDepartmentId(selectedSubmissionDepartmentId);
          closeSubmissionDepartmentModal(selectedSubmissionDepartmentId);
        }}
        onCancel={() => closeSubmissionDepartmentModal(null)}
        destroyOnHidden
      >
        <Select
          className="w-full"
          placeholder="请选择提交部门"
          value={selectedSubmissionDepartmentId}
          options={submissionDepartmentOptions}
          onChange={setSelectedSubmissionDepartmentId}
        />
      </Modal>
    </RuntimePageShell>
  );
};

export const FormSubmitTemplate: React.FC<FormSubmitTemplateProps> = ({
  schema,
  config,
  formType = schema.template?.formType || 'form',
  submitSuccessMode = 'redirect',
  enableDraft = false,
  enableProcessPreview,
  enableSubmissionDepartmentSelect = false,
  departmentOptions = [],
  header,
  footer,
  beforeForm,
  afterForm,
  renderDepartmentSelector,
  renderForm,
  renderSuccess,
  onSubmitSuccess,
  initialValues,
  components,
  inDrawer = false,
}) => {
  const resolvedFormType = normalizeSubmitFormType(formType);
  const resolvedEnableProcessPreview =
    enableProcessPreview ?? schema.template?.enableProcessPreview ?? resolvedFormType === 'process';

  return (
    <FormProvider
      schema={schema}
      config={config}
      initialValues={initialValues}
      components={components}
    >
      <InnerFormContent
        schema={schema}
        config={config}
        formType={resolvedFormType}
        submitSuccessMode={submitSuccessMode}
        enableDraft={enableDraft}
        enableProcessPreview={resolvedEnableProcessPreview}
        enableSubmissionDepartmentSelect={enableSubmissionDepartmentSelect}
        departmentOptions={departmentOptions}
        header={header}
        footer={footer}
        beforeForm={beforeForm}
        afterForm={afterForm}
        renderDepartmentSelector={renderDepartmentSelector}
        renderForm={renderForm}
        renderSuccess={renderSuccess}
        onSubmitSuccess={onSubmitSuccess}
        inDrawer={inDrawer}
      />
    </FormProvider>
  );
};
