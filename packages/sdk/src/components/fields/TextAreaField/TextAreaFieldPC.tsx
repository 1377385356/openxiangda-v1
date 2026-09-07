import React from 'react';
import { Input } from 'antd';
import type { TextAreaFieldProps } from '../../types';
import { useFormContext } from '../../core/FormContext';

const { TextArea } = Input;

export function TextAreaFieldPC({
  fieldId,
  value: controlledValue,
  placeholder,
  inputClassName,
  behavior,
  rows,
  minRows,
  maxRows,
  autoSize,
  maxLength,
  showCount,
  allowClear,
  autoComplete,
  variant,
  size,
  onChange,
  onBlur,
}: TextAreaFieldProps) {
  const { formData, setFieldValue } = useFormContext();
  const value = (controlledValue as string | undefined) ?? (formData[fieldId] as string) ?? '';
  const disabled = behavior === 'DISABLED';

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setFieldValue(fieldId, v);
    onChange?.(v);
  };

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    onBlur?.(e.target.value);
  };

  return (
    <TextArea
      className={inputClassName}
      style={{ width: '100%' }}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      rows={rows}
      autoSize={autoSize ?? (minRows || maxRows ? { minRows, maxRows } : undefined)}
      maxLength={maxLength}
      showCount={showCount}
      allowClear={allowClear}
      autoComplete={autoComplete}
      variant={variant}
      size={size}
      onChange={handleChange}
      onBlur={handleBlur}
      data-testid={`textareafield-input-${fieldId}`}
    />
  );
}
