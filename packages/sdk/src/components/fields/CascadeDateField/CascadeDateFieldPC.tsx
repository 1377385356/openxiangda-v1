import React from 'react';
import { DatePicker } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { CascadeDateFieldProps } from '../../types';
import { useFormContext } from '../../core/FormContext';
import { antdDatePickerChineseLocale } from '../../utils/dateLocale';
import { getDisabledDate } from '../DateField/dateRestrictionUtils';
import {
  getDateDisplayFormat,
  normalizeDateRangeValue,
  shouldShowDateTime,
} from '../DateField/dateFormat';

const { RangePicker } = DatePicker;

export function CascadeDateFieldPC({
  fieldId,
  placeholder,
  inputClassName,
  behavior,
  dateFormat,
  showTime,
  dateRestriction,
  onChange,
}: CascadeDateFieldProps) {
  const { formData, setFieldValue } = useFormContext();
  const value = normalizeDateRangeValue(formData[fieldId]);
  const disabled = behavior === 'DISABLED';
  const format = getDateDisplayFormat(dateFormat, showTime);
  const inferredShowTime = shouldShowDateTime(dateFormat, showTime);
  const startValue = value?.start && dayjs(value.start).isValid() ? dayjs(value.start) : null;
  const endValue = value?.end && dayjs(value.end).isValid() ? dayjs(value.end) : null;
  const pickerValue =
    startValue || endValue ? ([startValue, endValue] as [Dayjs | null, Dayjs | null]) : null;
  const disabledDate = getDisabledDate(dateRestriction);

  const handleChange = (
    _dates: null | [Dayjs | null, Dayjs | null],
    dateStrings: [string, string],
  ) => {
    const [start, end] = dateStrings;
    if (start && end) {
      const val = { start, end };
      setFieldValue(fieldId, val);
      onChange?.(val);
    } else {
      setFieldValue(fieldId, null);
      onChange?.(null);
    }
  };

  return (
    <RangePicker
      className={inputClassName}
      style={{ width: '100%' }}
      value={pickerValue}
      placeholder={placeholder ? [placeholder, placeholder] : undefined}
      disabled={disabled}
      locale={antdDatePickerChineseLocale}
      format={format}
      showTime={inferredShowTime}
      disabledDate={disabledDate}
      onChange={handleChange}
      data-testid={`cascadedatefield-input-${fieldId}`}
    />
  );
}
