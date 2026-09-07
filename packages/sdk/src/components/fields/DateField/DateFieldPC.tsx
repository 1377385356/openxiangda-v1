import React from 'react';
import { DatePicker } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { DateFieldProps } from '../../types';
import { useFormContext } from '../../core/FormContext';
import { antdDatePickerChineseLocale } from '../../utils/dateLocale';
import { getDisabledDate } from './dateRestrictionUtils';
import { getDateDisplayFormat, shouldShowDateTime } from './dateFormat';

export function DateFieldPC({
  fieldId,
  placeholder,
  inputClassName,
  behavior,
  dateFormat,
  showTime,
  dateRestriction,
  onChange,
}: DateFieldProps) {
  const { formData, setFieldValue } = useFormContext();
  const value = formData[fieldId] as string | undefined;
  const disabled = behavior === 'DISABLED';
  const format = getDateDisplayFormat(dateFormat, showTime);
  const inferredShowTime = shouldShowDateTime(dateFormat, showTime);
  const pickerValue = value && dayjs(value).isValid() ? dayjs(value) : null;
  const disabledDate = getDisabledDate(dateRestriction);

  const handleChange = (_date: Dayjs | null, dateString: string | string[] | null) => {
    const val = Array.isArray(dateString) ? dateString[0] : (dateString ?? '');
    setFieldValue(fieldId, val || '');
    onChange?.(val || '');
  };

  return (
    <DatePicker
      className={inputClassName}
      style={{ width: '100%' }}
      value={pickerValue}
      placeholder={placeholder}
      disabled={disabled}
      locale={antdDatePickerChineseLocale}
      format={format}
      showTime={inferredShowTime}
      disabledDate={disabledDate}
      onChange={handleChange}
      data-testid={`datefield-input-${fieldId}`}
    />
  );
}
