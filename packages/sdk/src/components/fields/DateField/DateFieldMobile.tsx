import React, { useState } from 'react';
import { Calendar } from 'antd-mobile';
import dayjs from 'dayjs';
import type { DateFieldProps } from '../../types';
import { useFormContext } from '../../core/FormContext';
import { getDateMinMax } from './dateRestrictionUtils';
import { formatDateValue, getDateDisplayFormat, shouldShowDateTime } from './dateFormat';
import { MobileBottomSheet, MobileFieldTrigger, MobileSheetHeader } from '../shared/MobileField';
import { formatMobileTime, MobileTimePickerView } from '../shared/MobileDatePicker';
import { MobileLocaleProvider } from '../shared/MobileLocaleProvider';

export function DateFieldMobile({
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
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<'date' | 'time'>('date');
  const format = getDateDisplayFormat(dateFormat, showTime);
  const inferredShowTime = shouldShowDateTime(dateFormat, showTime);
  const pickerValue = value && dayjs(value).isValid() ? dayjs(value).toDate() : new Date();
  const [tempDate, setTempDate] = useState<Date>(pickerValue);
  const { min, max } = getDateMinMax(dateRestriction);

  const openPicker = () => {
    if (disabled) return;
    setTempDate(pickerValue);
    setMode('date');
    setVisible(true);
  };

  const mergeDatePart = (date: Date | null) => {
    if (!date) return;
    const current = dayjs(tempDate);
    setTempDate(
      dayjs(date)
        .hour(current.hour())
        .minute(current.minute())
        .second(current.second())
        .millisecond(0)
        .toDate(),
    );
  };

  const handleConfirm = () => {
    const dateStr = dayjs(tempDate).format(format);
    setFieldValue(fieldId, dateStr);
    onChange?.(dateStr);
    setVisible(false);
  };

  const handleClear = () => {
    setFieldValue(fieldId, '');
    onChange?.('');
  };

  return (
    <div className={inputClassName} data-testid={`datefield-input-${fieldId}`}>
      <MobileFieldTrigger
        value={value ? formatDateValue(value, dateFormat, showTime) : undefined}
        placeholder={placeholder || '请选择日期'}
        disabled={disabled}
        clearable={Boolean(value)}
        onClick={openPicker}
        onClear={handleClear}
        testId={`datefield-trigger-${fieldId}`}
      />
      <MobileBottomSheet
        visible={visible}
        onClose={() => setVisible(false)}
        testId={`datefield-popup-${fieldId}`}
      >
        <MobileLocaleProvider>
          <div className="sy-mobile-date-sheet">
            <MobileSheetHeader
              onCancel={() => setVisible(false)}
              onConfirm={handleConfirm}
              confirmTestId={`datefield-confirm-${fieldId}`}
            />
            {mode === 'time' ? (
              <>
                <MobileTimePickerView value={tempDate} dateFormat={format} onChange={setTempDate} />
                <div className="sy-mobile-date-time-footer">
                  <span>选择时间</span>
                  <button type="button" className="sy-mobile-time-pill is-active">
                    {formatMobileTime(tempDate, format)}
                  </button>
                </div>
              </>
            ) : (
              <>
                <Calendar
                  selectionMode="single"
                  value={tempDate}
                  min={min}
                  max={max}
                  allowClear={false}
                  onChange={mergeDatePart}
                />
                {inferredShowTime ? (
                  <div className="sy-mobile-date-time-footer">
                    <button
                      type="button"
                      className="sy-mobile-date-time-label"
                      onClick={() => setMode('time')}
                      data-testid={`datefield-time-trigger-${fieldId}`}
                    >
                      选择时间
                    </button>
                    <button
                      type="button"
                      className="sy-mobile-time-pill"
                      onClick={() => setMode('time')}
                    >
                      {formatMobileTime(tempDate, format)}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </MobileLocaleProvider>
      </MobileBottomSheet>
    </div>
  );
}
