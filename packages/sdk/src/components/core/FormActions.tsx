import React, { useState, useCallback } from 'react';
import { Button } from 'antd';
import { useFormContext } from './FormContext';
import { validateAndNotify } from './validationFeedback';

export interface FormActionsProps {
  className?: string;
  submitText?: string;
  resetText?: string;
  showReset?: boolean;
  onSubmit?: (values: Record<string, any>) => Promise<void>;
  submitSuccessMode?: 'stay' | 'callback';
}

export function FormActions({
  className,
  submitText = '提交',
  resetText = '重置',
  showReset = true,
  onSubmit,
}: FormActionsProps) {
  const { mode, validateAllWithErrors, getFormData, resetForm, api, config } = useFormContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    setSubmitError(null);
    const valid = await validateAndNotify(validateAllWithErrors);
    if (!valid) return;

    const values = getFormData();
    setIsSubmitting(true);
    try {
      const beforeResult = await config.submit?.beforeSubmit?.(values);
      if (beforeResult === false) return;

      let response: any;
      if (onSubmit) {
        response = await onSubmit(values);
      } else if (mode === 'edit' && config.formInstanceId) {
        response = await api.updateFormData({
          appType: config.appType,
          formUuid: config.formUuid,
          formInstId: config.formInstanceId,
          updateFormDataJson: JSON.stringify(values),
        });
      } else {
        response = await api.submitFormData({
          appType: config.appType,
          formUuid: config.formUuid,
          data: values,
        });
      }

      await config.submit?.afterSubmit?.(response);

      if (config.submit?.submitSuccessMode === 'redirect' && config.submit.redirectUrl) {
        window.location.href = config.submit.redirectUrl;
      }
    } catch (e: any) {
      setSubmitError(e?.message || '提交失败');
    } finally {
      setIsSubmitting(false);
    }
  }, [api, config, getFormData, mode, onSubmit, validateAllWithErrors]);

  const handleReset = useCallback(() => {
    resetForm();
  }, [resetForm]);

  if (mode === 'readonly') return null;

  return (
    <div className={className ?? 'sy-form-actions'} data-testid="form-actions">
      <Button
        type="primary"
        htmlType="submit"
        loading={isSubmitting}
        onClick={handleSubmit}
        data-testid="form-submit-btn"
      >
        {submitText}
      </Button>
      {showReset && (
        <Button
          htmlType="reset"
          disabled={isSubmitting}
          onClick={handleReset}
          data-testid="form-reset-btn"
        >
          {resetText}
        </Button>
      )}
      {submitError && (
        <span className="sy-field-error" role="alert" data-testid="form-submit-error">
          {submitError}
        </span>
      )}
    </div>
  );
}
