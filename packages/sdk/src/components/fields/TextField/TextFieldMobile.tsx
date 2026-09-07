import React from 'react';
import { Input } from 'antd-mobile';
import type { TextFieldProps } from '../../types';
import { useFormContext } from '../../core/FormContext';

function joinClassNames(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(' ');
}

export function TextFieldMobile({
  fieldId,
  value: controlledValue,
  placeholder,
  maxLength,
  showCount,
  allowClear,
  prefix,
  suffix,
  inputClassName,
  behavior,
  onChange,
  onBlur,
}: TextFieldProps) {
  const { formData, setFieldValue } = useFormContext();
  const value = (controlledValue as string | undefined) ?? (formData[fieldId] as string) ?? '';
  const disabled = behavior === 'DISABLED';

  const handleChange = (v: string) => {
    setFieldValue(fieldId, v);
    onChange?.(v);
  };

  const handleBlur = () => {
    onBlur?.(value);
  };

  return (
    <div
      className={joinClassNames(inputClassName, 'sy-mobile-line-input sy-mobile-text-input')}
      data-testid={`textfield-input-${fieldId}`}
    >
      {prefix && <span className="sy-input-prefix">{prefix}</span>}
      <Input
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        clearable={allowClear}
        disabled={disabled}
        onChange={handleChange}
        onBlur={handleBlur}
      />
      {showCount && maxLength ? (
        <span className="sy-input-count">
          {value.length}/{maxLength}
        </span>
      ) : null}
      {suffix && <span className="sy-input-suffix">{suffix}</span>}
    </div>
  );
}
