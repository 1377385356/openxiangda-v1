import React from 'react';
import type { DateFieldProps } from '../../types';
import { useFormContext } from '../../core/FormContext';
import { formatDateValue } from './dateFormat';

export function DateFieldReadonly({
  fieldId,
  readonlyClassName,
  dateFormat,
  showTime,
}: DateFieldProps) {
  const { formData } = useFormContext();
  const value = formData[fieldId] as string | undefined;
  const display = formatDateValue(value, dateFormat, showTime);

  return (
    <div
      className={readonlyClassName || 'sy-field-readonly-value'}
      data-testid={`datefield-readonly-${fieldId}`}
    >
      {display}
    </div>
  );
}
