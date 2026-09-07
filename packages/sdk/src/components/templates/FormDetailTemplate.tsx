import React, { useCallback, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import type { FormSchema, FormInstanceData, FieldBehavior } from '../types';
import { FormProvider } from '../core/FormProvider';
import { useFormContext } from '../core/FormContext';
import { FormRenderer } from '../core/FormRenderer';
import { FormShell } from '../core/FormShell';
import { validateAndNotify } from '../core/validationFeedback';
import { useFormDetail } from '../hooks/useFormDetail';
import { useChangeRecords } from '../hooks/useChangeRecords';
import { RuntimePageShell } from '../modules/RuntimePageShell';
import { SummaryPanel } from '../modules/SummaryPanel';
import { RecordChangePanel } from '../modules/RecordChangePanel';
import { StickyActionBar } from '../modules/StickyActionBar';
import type { ActionConfig } from '../modules/FormActionBar';
import { PageSkeleton } from './PageSkeleton';

export interface FormDetailTemplateProps {
  schema: FormSchema;
  formUuid: string;
  appType: string;
  formInstanceId: string;
  enableEdit?: boolean;
  enableDelete?: boolean;
  enableChangeRecords?: boolean;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  renderSummary?: (data: FormInstanceData) => React.ReactNode;
  renderActions?: (actions: ActionConfig[]) => React.ReactNode;
  onDelete?: () => void;
  onSave?: (values: Record<string, any>) => void;
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

const InnerDetailContent: React.FC<FormDetailTemplateProps> = ({
  schema,
  formUuid,
  appType,
  formInstanceId,
  enableEdit = true,
  enableDelete = false,
  enableChangeRecords = false,
  header,
  footer,
  renderSummary,
  renderActions,
  onDelete,
  onSave,
  components,
  inDrawer = false,
}) => {
  const formDataRef = useRef<(() => Record<string, any>) | undefined>(undefined);
  const validateRef = useRef<(() => Promise<Record<string, string>>) | undefined>(undefined);
  const [accessDenied, setAccessDenied] = useState(false);
  const fieldIds = useMemo(() => schema.fields.map((field) => field.fieldId), [schema.fields]);
  const {
    loading,
    mode,
    formData,
    instanceInfo,
    fieldBehaviors,
    switchToEdit,
    switchToReadonly,
    saveChanges,
    deleteInstance,
    canEdit,
    canDelete,
    canViewChangeRecords,
  } = useFormDetail({
    formUuid,
    appType,
    formInstanceId,
    fieldIds,
    onPermissionDenied: () => setAccessDenied(true),
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

  const handleSave = useCallback(async () => {
    if (validateRef.current && !(await validateAndNotify(validateRef.current))) return;
    const values = formDataRef.current?.() ?? formData;
    if (!values) return;
    const success = await saveChanges(values);
    if (success) {
      onSave?.(values);
    }
  }, [formData, saveChanges, onSave]);

  const handleDelete = useCallback(async () => {
    const success = await deleteInstance();
    if (success) {
      onDelete?.();
    }
  }, [deleteInstance, onDelete]);

  const handleCancel = useCallback(() => {
    switchToReadonly();
  }, [switchToReadonly]);

  const readonlyActions: ActionConfig[] = [];
  if (enableEdit && canEdit) {
    readonlyActions.push({
      key: 'edit',
      label: '编辑',
      type: 'primary',
      onClick: switchToEdit,
    });
  }
  if (enableDelete && canDelete) {
    readonlyActions.push({
      key: 'delete',
      label: '删除',
      type: 'danger',
      onClick: handleDelete,
      confirm: { title: '确认删除', content: '删除后将无法恢复，确认要删除吗？' },
    });
  }

  const editActions: ActionConfig[] = [
    { key: 'cancel', label: '取消', type: 'default', onClick: handleCancel },
    { key: 'save', label: '保存', type: 'primary', onClick: handleSave },
  ];

  const currentActions = mode === 'readonly' ? readonlyActions : editActions;

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
        <div className="max-w-4xl mx-auto py-8 px-6 pb-24">
          <PageSkeleton type="detail" />
        </div>
      </div>
    );
  }

  const actionsNode =
    currentActions.length > 0 ? (
      renderActions ? (
        renderActions(currentActions)
      ) : (
        <StickyActionBar actions={currentActions} align="center" inDrawer={inDrawer} />
      )
    ) : null;

  return (
    <RuntimePageShell
      actions={actionsNode}
      accessDenied={accessDenied}
      contentClassName="sy-detail-page"
      inDrawer={inDrawer}
      maxWidth="100%"
    >
      <div className="sy-detail-header">
        <div className="sy-detail-header-inner">
          {header}

          {renderSummary && instanceInfo ? (
            renderSummary(instanceInfo)
          ) : (
            <SummaryPanel
              title={instanceInfo?.title || instanceInfo?.instanceTitle || schema.formMeta.title}
              showEyebrow={false}
              creator={
                instanceInfo?.creator || instanceInfo?.createdByName
                  ? {
                      name: instanceInfo?.creator?.name || instanceInfo?.createdByName,
                      avatar: instanceInfo?.creator?.avatar,
                      department:
                        instanceInfo?.creator?.department || instanceInfo?.createdByDepartmentName,
                    }
                  : undefined
              }
              createdAt={formatDateTime(instanceInfo?.createdAt)}
              metaItems={[
                {
                  key: 'creator',
                  label: '提交人',
                  value: instanceInfo?.creator?.name || instanceInfo?.createdByName || '未知用户',
                },
                {
                  key: 'department',
                  label: '提交人部门',
                  value:
                    instanceInfo?.creator?.department ||
                    instanceInfo?.createdByDepartmentName ||
                    '-',
                },
                {
                  key: 'createdAt',
                  label: '提交时间',
                  value: formatDateTime(instanceInfo?.createdAt),
                },
              ]}
              className="sy-detail-summary-panel"
              status={mode === 'edit' ? { label: '编辑中', tone: 'brand' } : undefined}
            />
          )}
        </div>
      </div>

      <div className="sy-detail-main">
        {mode === 'edit' && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700 transition-all duration-150">
            正在编辑，修改后请保存
          </div>
        )}

        <div className="sy-detail-card">
          <FormProvider
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

        {enableChangeRecords && canViewChangeRecords && (
          <div className="mt-6">
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
          </div>
        )}

        {footer}
      </div>
    </RuntimePageShell>
  );
};

export const FormDetailTemplate: React.FC<FormDetailTemplateProps> = (props) => {
  const { schema, formUuid, appType, formInstanceId, components } = props;

  const wrapperConfig = {
    mode: 'readonly' as const,
    formUuid,
    appType,
    formInstanceId,
  };

  return (
    <FormProvider schema={schema} config={wrapperConfig} components={components}>
      <InnerDetailContent {...props} />
    </FormProvider>
  );
};
