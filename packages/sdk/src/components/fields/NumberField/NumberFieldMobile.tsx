import React from 'react';
import { Input } from 'antd-mobile';
import type { NumberFieldProps } from '../../types';
import { useFormContext } from '../../core/FormContext';

function joinClassNames(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(' ');
}

function formatWithThousandSeparator(val: number | string): string {
  const str = String(val);
  const [intPart, decPart] = str.split('.');
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decPart !== undefined ? `${formattedInt}.${decPart}` : formattedInt;
}

export function NumberFieldMobile({
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
  onChange,
  onBlur,
}: NumberFieldProps) {
  const { formData, setFieldValue } = useFormContext();
  const value = controlledValue !== undefined ? controlledValue : formData[fieldId];
  const disabled = behavior === 'DISABLED';

  const handleChange = (v: string) => {
    // Strip thousand separators before parsing
    const cleaned = thousandSeparator ? v.replace(/,/g, '') : v;
    const num = cleaned === '' ? null : Number(cleaned);
    let finalValue = num !== null && isNaN(num) ? null : num;
    // Clamp to min/max
    if (finalValue != null) {
      if (min != null && finalValue < min) finalValue = min;
      if (max != null && finalValue > max) finalValue = max;
      if (precision != null) {
        finalValue = Number(finalValue.toFixed(precision));
      }
    }
    setFieldValue(fieldId, finalValue);
    onChange?.(finalValue);
  };

  const handleBlur = () => {
    onBlur?.(value ?? null);
  };

  const displayValue = (() => {
    if (value == null) return '';
    let str = String(value);
    if (precision != null) {
      str = Number(value).toFixed(precision);
    }
    if (thousandSeparator) {
      str = formatWithThousandSeparator(str);
    }
    return str;
  })();

  const unitPrefix = unitPosition === 'prefix' ? unit : undefined;
  const unitSuffix = unitPosition !== 'prefix' && unit ? unit : undefined;

  return (
    <div
      className={joinClassNames(inputClassName, 'sy-mobile-line-input sy-mobile-number-input')}
      data-testid={`numberfield-input-${fieldId}`}
      style={{ display: 'flex', alignItems: 'center', gap: 4 }}
    >
      {unitPrefix && <span className="sy-number-unit-prefix">{unitPrefix}</span>}
      <Input
        type={thousandSeparator ? 'text' : 'number'}
        value={displayValue}
        placeholder={placeholder}
        disabled={disabled}
        step={step != null ? String(step) : undefined}
        onChange={handleChange}
        onBlur={handleBlur}
      />
      {unitSuffix && <span className="sy-number-unit-suffix">{unitSuffix}</span>}
    </div>
  );
}
