import { useState, useCallback } from 'react';

export interface SubmitConfig {
  beforeSubmit?: (values: Record<string, any>) => Promise<boolean | void>;
  afterSubmit?: (response: any) => Promise<void>;
  submitSuccessMode?: 'redirect' | 'stay' | 'callback';
  redirectUrl?: string;
}

export interface UseFormSubmitReturn {
  submit: (formData: Record<string, any>, validateFn: () => Promise<boolean>) => Promise<void>;
  isSubmitting: boolean;
  submitError: string | null;
}

export function useFormSubmit(config?: SubmitConfig): UseFormSubmitReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const submit = useCallback(
    async (formData: Record<string, any>, validateFn: () => Promise<boolean>) => {
      setSubmitError(null);

      // Validate
      const isValid = await validateFn();
      if (!isValid) {
        setSubmitError('表单校验失败');
        return;
      }

      setIsSubmitting(true);

      try {
        // beforeSubmit hook
        if (config?.beforeSubmit) {
          const result = await config.beforeSubmit(formData);
          if (result === false) {
            setIsSubmitting(false);
            return;
          }
        }

        // afterSubmit hook (simulates completion of submit)
        if (config?.afterSubmit) {
          await config.afterSubmit(formData);
        }
      } catch (e: any) {
        setSubmitError(e?.message || '提交失败');
      } finally {
        setIsSubmitting(false);
      }
    },
    [config],
  );

  return { submit, isSubmitting, submitError };
}
