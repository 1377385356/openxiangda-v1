import React from 'react';
import { Input } from 'antd';
import type { TextFieldProps } from '../../types';
import { useFormContext } from '../../core/FormContext';

export function TextFieldPC({
  fieldId,
  value: controlledValue,
  placeholder,
  maxLength,
  showCount,
  allowClear,
  prefix,
  suffix,
  autoComplete,
  variant,
  size,
  inputClassName,
  behavior,
  onChange,
  onBlur,
}: TextFieldProps) {
  const { formData, setFieldValue } = useFormContext();
  const value = (controlledValue as string | undefined) ?? (formData[fieldId] as string) ?? '';
  const disabled = behavior === 'DISABLED';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setFieldValue(fieldId, v);
    onChange?.(v);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    onBlur?.(e.target.value);
  };

  return (
    <Input
      className={inputClassName}
      style={{ width: '100%' }}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      showCount={showCount}
      allowClear={allowClear}
      prefix={prefix}
      suffix={suffix}
      autoComplete={autoComplete}
      variant={variant}
      size={size}
      disabled={disabled}
      onChange={handleChange}
      onBlur={handleBlur}
      data-testid={`textfield-input-${fieldId}`}
    />
  );
}
