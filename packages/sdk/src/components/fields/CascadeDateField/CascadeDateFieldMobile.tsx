import React, { useState } from 'react';
import { Calendar } from 'antd-mobile';
import dayjs from 'dayjs';
import type { CascadeDateFieldProps } from '../../types';
import { useFormContext } from '../../core/FormContext';
import { getDateMinMax } from '../DateField/dateRestrictionUtils';
import {
  formatDateValue,
  getDateDisplayFormat,
  normalizeDateRangeValue,
  shouldShowDateTime,
} from '../DateField/dateFormat';
import { MobileBottomSheet, MobileFieldTrigger, MobileSheetHeader } from '../shared/MobileField';
import { MobileDateTimePickerView } from '../shared/MobileDatePicker';
import { MobileLocaleProvider } from '../shared/MobileLocaleProvider';

export function CascadeDateFieldMobile({
  fieldId,
  inputClassName,
  behavior,
  startLabel,
  endLabel,
  dateFormat,
  showTime,
  dateRestriction,
  onChange,
}: CascadeDateFieldProps) {
  const { formData, setFieldValue } = useFormContext();
  const value = normalizeDateRangeValue(formData[fieldId]);
  const disabled = behavior === 'DISABLED';
  const [visible, setVisible] = useState(false);
  const [tempRange, setTempRange] = useState<[Date, Date] | null>(null);
  const [timeStep, setTimeStep] = useState<'start' | 'end'>('start');
  const [tempStart, setTempStart] = useState<Date>(new Date());
  const [tempEnd, setTempEnd] = useState<Date>(new Date());
  const format = getDateDisplayFormat(dateFormat, showTime);
  const inferredShowTime = shouldShowDateTime(dateFormat, showTime);
  const startValue =
    value?.start && dayjs(value.start).isValid() ? dayjs(value.start).toDate() : undefined;
  const endValue = value?.end && dayjs(value.end).isValid() ? dayjs(value.end).toDate() : undefined;
  const { min, max } = getDateMinMax(dateRestriction);

  const hasValue = Boolean(value?.start || value?.end);
  const displayValue =
    value?.start && value?.end
      ? `${formatDateValue(value.start, dateFormat, showTime)} - ${formatDateValue(
          value.end,
          dateFormat,
          showTime,
        )}`
      : undefined;

  const openPicker = () => {
    if (disabled) return;
    if (inferredShowTime) {
      const fallbackStart = startValue ?? new Date();
      const fallbackEnd =
        endValue && dayjs(endValue).isAfter(fallbackStart) ? endValue : fallbackStart;
      setTempStart(fallbackStart);
      setTempEnd(fallbackEnd);
      setTimeStep('start');
    } else {
      setTempRange(startValue && endValue ? [startValue, endValue] : null);
    }
    setVisible(true);
  };

  const commitRange = (startDate: Date, endDate: Date) => {
    const newVal = {
      start: dayjs(startDate).format(format),
      end: dayjs(endDate).format(format),
    };
    setFieldValue(fieldId, newVal);
    onChange?.(newVal);
    setVisible(false);
  };

  const handleDateConfirm = () => {
    if (!tempRange) {
      setFieldValue(fieldId, null);
      onChange?.(null);
      setVisible(false);
      return;
    }
    commitRange(tempRange[0], tempRange[1]);
  };

  const handleTimeConfirm = () => {
    if (timeStep === 'start') {
      const nextEnd = dayjs(tempEnd).isBefore(tempStart) ? tempStart : tempEnd;
      setTempEnd(nextEnd);
      setTimeStep('end');
      return;
    }
    commitRange(tempStart, dayjs(tempEnd).isBefore(tempStart) ? tempStart : tempEnd);
  };

  const handleClear = () => {
    setFieldValue(fieldId, null);
    onChange?.(null);
  };

  const handleRangeChange = (dateRange: [Date, Date] | null) => {
    setTempRange(dateRange);
  };

  const updateTempStart = (nextStart: Date) => {
    setTempStart(nextStart);
    if (dayjs(tempEnd).isBefore(nextStart)) {
      setTempEnd(nextStart);
    }
  };

  const updateTempEnd = (nextEnd: Date) => {
    setTempEnd(dayjs(nextEnd).isBefore(tempStart) ? tempStart : nextEnd);
  };

  const endMin = min && dayjs(min).isAfter(tempStart) ? min : tempStart;

  return (
    <div className={inputClassName} data-testid={`cascadedatefield-input-${fieldId}`}>
      <MobileFieldTrigger
        value={displayValue}
        placeholder={
          startLabel || endLabel
            ? `${startLabel || '开始日期'} - ${endLabel || '结束日期'}`
            : '请选择日期区间'
        }
        contentClassName={inferredShowTime ? 'sy-mobile-date-range-value' : undefined}
        disabled={disabled}
        clearable={hasValue}
        onClick={openPicker}
        onClear={handleClear}
        testId={`cascadedatefield-trigger-${fieldId}`}
      />
      <MobileBottomSheet
        visible={visible}
        onClose={() => setVisible(false)}
        testId={`cascadedatefield-popup-${fieldId}`}
      >
        <MobileLocaleProvider>
          <div className="sy-mobile-date-sheet">
            <MobileSheetHeader
              title={
                inferredShowTime
                  ? timeStep === 'start'
                    ? '选择开始时间'
                    : '选择结束时间'
                  : undefined
              }
              confirmText={inferredShowTime && timeStep === 'start' ? '下一步' : '确定'}
              onCancel={() => setVisible(false)}
              onConfirm={inferredShowTime ? handleTimeConfirm : handleDateConfirm}
              confirmTestId={`cascadedatefield-confirm-${fieldId}`}
            />
            {inferredShowTime ? (
              <MobileDateTimePickerView
                value={timeStep === 'start' ? tempStart : tempEnd}
                dateFormat={format}
                min={timeStep === 'start' ? min : endMin}
                max={max}
                onChange={timeStep === 'start' ? updateTempStart : updateTempEnd}
              />
            ) : (
              <Calendar
                selectionMode="range"
                value={tempRange}
                min={min}
                max={max}
                allowClear={false}
                onChange={handleRangeChange}
              />
            )}
          </div>
        </MobileLocaleProvider>
      </MobileBottomSheet>
    </div>
  );
}
