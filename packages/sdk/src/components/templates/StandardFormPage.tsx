import React, { useMemo } from 'react';
import type { FormEngineConfig, FormSchema, StandardFormPageMode } from '../types';
import { FormDetailTemplate } from './FormDetailTemplate';
import { FormSubmitTemplate } from './FormSubmitTemplate';
import { ProcessDetailTemplate } from './ProcessDetailTemplate';

export interface StandardFormPageProps {
  schema: FormSchema;
  mode?: StandardFormPageMode;
  initialValues?: Record<string, any> | null;
  permissions?: FormEngineConfig['permissions'];
  api?: FormEngineConfig['api'];
  formUuid?: string;
  appType?: string;
  formInstanceId?: string;
  defaultUploadProvider?: FormEngineConfig['defaultUploadProvider'];
  submitBehavior?: FormEngineConfig['submitBehavior'];
  compatibility?: FormEngineConfig['compatibility'];
  onSubmit?: (values: Record<string, any>) => Promise<any>;
  onSubmitSuccess?: (formInstId: string) => void;
  components?: Record<string, React.ComponentType<any>>;
  inDrawer?: boolean;
}

const shouldForwardFullSubmitPayload = (
  payload: Record<string, any> | undefined,
  formType: 'form' | 'process',
) =>
  formType === 'process' ||
  !!payload?.selectedApprovers ||
  !!payload?.initiatorSelectedApprovers ||
  !!payload?.submissionDepartmentId;

const normalizeStandardFormType = (value?: string): 'form' | 'process' => {
  const raw = String(value || '').toLowerCase();
  return raw === 'process' || raw === 'flow' ? 'process' : 'form';
};

export const StandardFormPage: React.FC<StandardFormPageProps> = ({
  schema,
  mode,
  initialValues,
  permissions,
  api: externalApi,
  formUuid,
  appType,
  formInstanceId,
  defaultUploadProvider,
  submitBehavior,
  compatibility,
  onSubmit,
  onSubmitSuccess,
  components,
  inDrawer,
}) => {
  const resolvedMode = mode || schema.template?.defaultMode || 'submit';
  const resolvedFormUuid = formUuid || schema.formMeta.formUuid;
  const resolvedAppType = appType || schema.formMeta.appType;
  const formType = normalizeStandardFormType(
    schema.template?.formType || (resolvedMode === 'process' ? 'process' : 'form'),
  );

  const submitApi = useMemo<FormEngineConfig['api'] | undefined>(() => {
    if (!onSubmit) return undefined;
    return {
      submitFormData: async (payload) =>
        onSubmit(
          shouldForwardFullSubmitPayload(payload, formType) ? payload : (payload?.data ?? payload),
        ),
      updateFormData: async (payload) => {
        const raw = payload?.updateFormDataJson;
        const values = typeof raw === 'string' ? JSON.parse(raw) : payload;
        return onSubmit(values);
      },
      startProcessFromExistingInstance: async (payload) => onSubmit(payload),
    };
  }, [formType, onSubmit]);

  const api = useMemo<FormEngineConfig['api'] | undefined>(() => {
    if (!externalApi && !submitApi) return undefined;
    return {
      ...(externalApi ?? {}),
      ...(submitApi ?? {}),
    };
  }, [externalApi, submitApi]);

  if (resolvedMode === 'process') {
    return (
      <ProcessDetailTemplate
        schema={schema}
        formUuid={resolvedFormUuid}
        appType={resolvedAppType}
        formInstanceId={formInstanceId || ''}
        enableEdit={schema.template?.enableEdit}
        enableDelete={schema.template?.enableDelete}
        enableChangeRecords={schema.template?.enableChangeRecords}
        components={components}
        inDrawer={inDrawer}
      />
    );
  }

  if (resolvedMode === 'readonly' || resolvedMode === 'detail') {
    return (
      <FormDetailTemplate
        schema={schema}
        formUuid={resolvedFormUuid}
        appType={resolvedAppType}
        formInstanceId={formInstanceId || ''}
        enableEdit={schema.template?.enableEdit}
        enableDelete={schema.template?.enableDelete}
        enableChangeRecords={schema.template?.enableChangeRecords}
        components={components}
        inDrawer={inDrawer}
      />
    );
  }

  return (
    <FormSubmitTemplate
      schema={schema}
      config={{
        mode: resolvedMode,
        formUuid: resolvedFormUuid,
        appType: resolvedAppType,
        formInstanceId,
        defaultUploadProvider,
        submitBehavior,
        permissions,
        compatibility,
        api,
      }}
      formType={formType}
      submitSuccessMode={schema.template?.submitSuccessMode}
      enableDraft={schema.template?.enableDraft}
      enableProcessPreview={schema.template?.enableProcessPreview}
      initialValues={initialValues ?? undefined}
      onSubmitSuccess={onSubmitSuccess}
      components={components}
      inDrawer={inDrawer}
    />
  );
};
