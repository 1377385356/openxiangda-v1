import React, { useEffect } from 'react';
import { Input } from 'antd';
import type { SerialNumberFieldProps } from '../../types';
import { FieldWrapper } from '../../core/FieldWrapper';
import { useFormContext } from '../../core/FormContext';

export function SerialNumberField(props: SerialNumberFieldProps) {
  const {
    fieldId,
    label,
    behavior: propBehavior = 'READONLY',
    required,
    tips,
    className,
    labelClassName,
    tipsClassName,
    inputClassName,
    placeholder = '自动生成',
    defaultValue,
  } = props;
  const { formData, fieldBehaviors, setFieldValue, registerField, unregisterField } =
    useFormContext();
  const behavior = propBehavior ?? fieldBehaviors[fieldId] ?? 'READONLY';
  const value = (formData[fieldId] as string | undefined) ?? '';

  useEffect(() => {
    registerField(fieldId);
    if (defaultValue !== undefined && formData[fieldId] === undefined) {
      setFieldValue(fieldId, defaultValue);
    }
    return () => unregisterField(fieldId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldId]);

  if (behavior === 'HIDDEN') return null;

  return (
    <FieldWrapper
      fieldId={fieldId}
      label={label}
      required={required}
      tips={tips}
      className={className}
      labelClassName={labelClassName}
      tipsClassName={tipsClassName}
    >
      {behavior === 'READONLY' ? (
        <div
          className="sy-field-readonly-value"
          data-testid={`serialnumberfield-readonly-${fieldId}`}
        >
          {value || '--'}
        </div>
      ) : (
        <Input
          className={inputClassName}
          style={{ width: '100%' }}
          value={value}
          placeholder={placeholder}
          readOnly
          disabled={behavior === 'DISABLED'}
          data-testid={`serialnumberfield-input-${fieldId}`}
        />
      )}
    </FieldWrapper>
  );
}
