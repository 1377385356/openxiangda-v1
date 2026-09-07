import React from 'react';
import type { RadioFieldProps } from '../../types';
import { useFormContext } from '../../core/FormContext';
import { renderReadonlyOptions, resolveReadonlyOptionItems } from '../shared/optionDisplay';

export function RadioFieldReadonly({
  fieldId,
  readonlyClassName,
  coloredOptions,
  options,
}: RadioFieldProps) {
  const { formData } = useFormContext();
  const value = resolveReadonlyOptionItems(formData[fieldId], options);
  const display = renderReadonlyOptions(value, coloredOptions);

  return (
    <div
      className={readonlyClassName || 'sy-field-readonly-value'}
      data-testid={`radiofield-readonly-${fieldId}`}
    >
      {display}
    </div>
  );
}
