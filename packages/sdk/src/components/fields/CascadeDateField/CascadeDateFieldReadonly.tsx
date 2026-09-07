import React from 'react';
import type { CascadeDateFieldProps } from '../../types';
import { useFormContext } from '../../core/FormContext';
import { formatDateValue, normalizeDateRangeValue } from '../DateField/dateFormat';

export function CascadeDateFieldReadonly({
  fieldId,
  readonlyClassName,
  dateFormat,
  showTime,
}: CascadeDateFieldProps) {
  const { formData } = useFormContext();
  const value = normalizeDateRangeValue(formData[fieldId]);
  const display =
    value && value.start && value.end
      ? `${formatDateValue(value.start, dateFormat, showTime)} ~ ${formatDateValue(value.end, dateFormat, showTime)}`
      : '--';

  return (
    <div
      className={readonlyClassName || 'sy-field-readonly-value'}
      data-testid={`cascadedatefield-readonly-${fieldId}`}
    >
      {display}
    </div>
  );
}
