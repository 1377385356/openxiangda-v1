import React from 'react';
import type { TextAreaFieldProps } from '../../types';
import { useFormContext } from '../../core/FormContext';

export function TextAreaFieldReadonly({ fieldId, readonlyClassName }: TextAreaFieldProps) {
  const { formData } = useFormContext();
  const value = formData[fieldId];
  const display = value != null && value !== '' ? String(value) : '--';

  return (
    <div
      className={readonlyClassName || 'sy-field-readonly-value'}
      data-testid={`textareafield-readonly-${fieldId}`}
      style={{ whiteSpace: 'pre-wrap' }}
    >
      {display}
    </div>
  );
}
