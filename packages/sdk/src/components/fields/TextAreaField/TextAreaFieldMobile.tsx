import React from 'react';
import { TextArea } from 'antd-mobile';
import type { TextAreaFieldProps } from '../../types';
import { useFormContext } from '../../core/FormContext';

function joinClassNames(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(' ');
}

export function TextAreaFieldMobile({
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
  onChange,
  onBlur,
}: TextAreaFieldProps) {
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
      className={joinClassNames(inputClassName, 'sy-mobile-line-input sy-mobile-textarea-input')}
      data-testid={`textareafield-input-${fieldId}`}
    >
      <TextArea
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        autoSize={autoSize ?? (minRows || maxRows ? { minRows, maxRows } : undefined)}
        maxLength={maxLength}
        showCount={showCount}
        onChange={handleChange}
        onBlur={handleBlur}
      />
    </div>
  );
}
