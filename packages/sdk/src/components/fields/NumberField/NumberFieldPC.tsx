import React from 'react';
import { InputNumber } from 'antd';
import type { NumberFieldProps } from '../../types';
import { useFormContext } from '../../core/FormContext';

export function NumberFieldPC({
  fieldId,
  value: controlledValue,
  placeholder,
  inputClassName,
  behavior,
  min,
  max,
  step,
  precision,
  unit,
  unitPosition,
  thousandSeparator,
  controls,
  keyboard,
  stringMode,
  variant,
  size,
  onChange,
  onBlur,
}: NumberFieldProps) {
  const { formData, setFieldValue } = useFormContext();
  const value =
    controlledValue !== undefined
      ? (controlledValue as number | null)
      : (formData[fieldId] as number | null | undefined);
  const disabled = behavior === 'DISABLED';

  const handleChange = (v: number | null) => {
    setFieldValue(fieldId, v);
    onChange?.(v);
  };

  const handleBlur = () => {
    onBlur?.(value ?? null);
  };

  const formatter = thousandSeparator
    ? (val: number | string | undefined) => {
        if (val === undefined || val === '') return '';
        const str = String(val);
        const [intPart, decPart] = str.split('.');
        const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return decPart !== undefined ? `${formattedInt}.${decPart}` : formattedInt;
      }
    : undefined;

  const parser = thousandSeparator
    ? (val: string | undefined) => {
        return val ? Number(val.replace(/,/g, '')) : 0;
      }
    : undefined;

  return (
    <InputNumber
      className={inputClassName}
      style={{ width: '100%' }}
      value={value ?? null}
      placeholder={placeholder}
      disabled={disabled}
      min={min}
      max={max}
      step={step}
      precision={precision}
      prefix={unitPosition === 'prefix' ? unit : undefined}
      suffix={unitPosition !== 'prefix' && unit ? unit : undefined}
      controls={controls}
      keyboard={keyboard}
      stringMode={stringMode}
      variant={variant}
      size={size}
      formatter={formatter}
      parser={parser}
      onChange={handleChange}
      onBlur={handleBlur}
      data-testid={`numberfield-input-${fieldId}`}
    />
  );
}
