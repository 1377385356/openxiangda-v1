import React from 'react';
import type { NumberFieldProps } from '../../types';
import { useFormContext } from '../../core/FormContext';

export function NumberFieldReadonly({
  fieldId,
  readonlyClassName,
  unit,
  unitPosition,
  thousandSeparator,
  precision,
}: NumberFieldProps) {
  const { formData } = useFormContext();
  const value = formData[fieldId];

  const display = (() => {
    if (value == null) return '--';
    let str: string;
    if (precision != null) {
      str = Number(value).toFixed(precision);
    } else {
      str = String(value);
    }
    if (thousandSeparator) {
      const [intPart, decPart] = str.split('.');
      const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      str = decPart !== undefined ? `${formattedInt}.${decPart}` : formattedInt;
    }
    // Add unit
    if (unit) {
      if (unitPosition === 'prefix') {
        str = `${unit}${str}`;
      } else {
        str = `${str}${unit}`;
      }
    }
    return str;
  })();

  return (
    <div
      className={readonlyClassName || 'sy-field-readonly-value'}
      data-testid={`numberfield-readonly-${fieldId}`}
    >
      {display}
    </div>
  );
}
