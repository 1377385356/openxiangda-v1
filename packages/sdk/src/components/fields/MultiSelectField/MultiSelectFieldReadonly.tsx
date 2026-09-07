import React from 'react';
import type { MultiSelectFieldProps } from '../../types';
import { useFormContext } from '../../core/FormContext';
import { renderReadonlyOptions, resolveReadonlyOptionItems } from '../shared/optionDisplay';

export function MultiSelectFieldReadonly({
  fieldId,
  readonlyClassName,
  coloredOptions,
  options,
}: MultiSelectFieldProps) {
  const { formData } = useFormContext();
  const value = resolveReadonlyOptionItems(formData[fieldId], options);
  const display = renderReadonlyOptions(value, coloredOptions, true);

  return (
    <div
      className={readonlyClassName || 'sy-field-readonly-value'}
      data-testid={`multiselectfield-readonly-${fieldId}`}
    >
      {display}
    </div>
  );
}
