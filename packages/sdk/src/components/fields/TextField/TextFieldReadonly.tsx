import React from 'react';
import type { TextFieldProps } from '../../types';
import { useFormContext } from '../../core/FormContext';

export function TextFieldReadonly({ fieldId, readonlyClassName }: TextFieldProps) {
  const { formData } = useFormContext();
  const value = formData[fieldId];
  const display = value != null && value !== '' ? String(value) : '--';

  return (
    <div
      className={readonlyClassName || 'sy-field-readonly-value'}
      data-testid={`textfield-readonly-${fieldId}`}
    >
      {display}
    </div>
  );
}
