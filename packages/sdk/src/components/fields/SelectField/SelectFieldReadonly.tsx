import React from 'react';
import type { SelectFieldProps } from '../../types';
import { useFormContext } from '../../core/FormContext';
import { renderReadonlyOptions, resolveReadonlyOptionItems } from '../shared/optionDisplay';

export function SelectFieldReadonly({
  fieldId,
  readonlyClassName,
  coloredOptions,
  options,
}: SelectFieldProps) {
  const { formData } = useFormContext();
  const value = resolveReadonlyOptionItems(formData[fieldId], options);
  const display = renderReadonlyOptions(value, coloredOptions);

  return (
    <div
      className={readonlyClassName || 'sy-field-readonly-value'}
      data-testid={`selectfield-readonly-${fieldId}`}
    >
      {display}
    </div>
  );
}
