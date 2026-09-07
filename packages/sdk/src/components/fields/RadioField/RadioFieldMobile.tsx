import React from 'react';
import type { RadioFieldProps, OptionItem } from '../../types';
import { useFormContext } from '../../core/FormContext';
import { renderOptionLabel } from '../shared/optionDisplay';

export function RadioFieldMobile({
  fieldId,
  value: controlledValue,
  inputClassName,
  behavior,
  options,
  direction,
  coloredOptions,
  onChange,
}: RadioFieldProps) {
  const { formData, setFieldValue } = useFormContext();
  const value =
    controlledValue !== undefined
      ? (controlledValue as OptionItem | null)
      : (formData[fieldId] as OptionItem | null | undefined);
  const disabled = behavior === 'DISABLED';

  const handleChange = (val: string) => {
    const option = options.find((o) => o.value === val) ?? null;
    setFieldValue(fieldId, option);
    onChange?.(option);
  };

  return (
    <div className={inputClassName} data-testid={`radiofield-input-${fieldId}`}>
      <div
        className={`sy-mobile-choice-group ${
          direction === 'vertical' ? 'is-vertical' : 'is-horizontal'
        }`}
        data-testid="antd-mobile-radio-group"
        data-disabled={disabled ? 'true' : undefined}
        onClick={(event) => {
          if (disabled) return;
          const target = event.target as HTMLElement;
          const optionValue = target.getAttribute('data-radio-value');
          if (!optionValue) return;
          const option = options.find((item) => item.value === optionValue);
          if (option?.disabled) return;
          handleChange(optionValue);
        }}
      >
        {options.map((option) => {
          const active = value?.value === option.value;
          const optionDisabled = disabled || option.disabled;
          return (
            <button
              key={option.value}
              type="button"
              className={`sy-mobile-choice-item is-radio ${active ? 'is-active' : ''}`}
              disabled={optionDisabled}
              onClick={(event) => {
                event.stopPropagation();
                if (optionDisabled) return;
                handleChange(option.value);
              }}
              data-radio-value={option.value}
            >
              <span className="sy-mobile-choice-control" aria-hidden="true" />
              <span className="sy-mobile-choice-label">
                {renderOptionLabel(option, coloredOptions)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
