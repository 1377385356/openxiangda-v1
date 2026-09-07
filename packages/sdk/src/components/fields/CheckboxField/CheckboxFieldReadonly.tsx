import React from 'react';
import type { CheckboxFieldProps } from '../../types';
import { useFormContext } from '../../core/FormContext';
import { renderReadonlyOptions, resolveReadonlyOptionItems } from '../shared/optionDisplay';

export function CheckboxFieldReadonly({
  fieldId,
  readonlyClassName,
  coloredOptions,
  options,
}: CheckboxFieldProps) {
  const { formData } = useFormContext();
  const value = resolveReadonlyOptionItems(formData[fieldId], options);
  const display = renderReadonlyOptions(value, coloredOptions, true);

  return (
    <div
      className={readonlyClassName || 'sy-field-readonly-value'}
      data-testid={`checkboxfield-readonly-${fieldId}`}
    >
      {display}
    </div>
  );
}
