import React from 'react';
import type { CheckboxFieldProps, OptionItem } from '../../types';
import { useFormContext } from '../../core/FormContext';
import { renderOptionLabel } from '../shared/optionDisplay';

export function CheckboxFieldMobile({
  fieldId,
  value: controlledValue,
  inputClassName,
  behavior,
  options,
  direction,
  maxCount,
  coloredOptions,
  onChange,
}: CheckboxFieldProps) {
  const { formData, setFieldValue } = useFormContext();
  const value =
    controlledValue !== undefined
      ? ((controlledValue as OptionItem[] | undefined) ?? [])
      : ((formData[fieldId] as OptionItem[] | undefined) ?? []);
  const disabled = behavior === 'DISABLED';
  const selectedValues = value.map((v) => v.value);

  const handleChange = (vals: string[]) => {
    const selected = vals
      .map((v) => options.find((o) => o.value === v))
      .filter((o): o is OptionItem => o != null);
    setFieldValue(fieldId, selected);
    onChange?.(selected);
  };

  return (
    <div className={inputClassName} data-testid={`checkboxfield-input-${fieldId}`}>
      <div
        className={`sy-mobile-choice-group ${
          direction === 'vertical' ? 'is-vertical' : 'is-horizontal'
        }`}
        data-testid="antd-mobile-checkbox-group"
        data-disabled={disabled ? 'true' : undefined}
        onClick={(event) => {
          if (disabled) return;
          const target = event.target as HTMLElement;
          const optionValue = target.getAttribute('data-checkbox-value');
          if (!optionValue) return;
          const active = selectedValues.includes(optionValue);
          const option = options.find((item) => item.value === optionValue);
          if (
            option?.disabled ||
            Boolean(maxCount && selectedValues.length >= maxCount && !active)
          ) {
            return;
          }
          const nextValues = active
            ? selectedValues.filter((item) => item !== optionValue)
            : [...selectedValues, optionValue];
          handleChange(nextValues);
        }}
      >
        {options.map((option) => {
          const active = selectedValues.includes(option.value);
          const optionDisabled =
            disabled ||
            option.disabled ||
            Boolean(maxCount && selectedValues.length >= maxCount && !active);
          return (
            <button
              key={option.value}
              type="button"
              className={`sy-mobile-choice-item is-checkbox ${active ? 'is-active' : ''}`}
              disabled={optionDisabled}
              onClick={(event) => {
                event.stopPropagation();
                if (optionDisabled) return;
                const nextValues = active
                  ? selectedValues.filter((item) => item !== option.value)
                  : [...selectedValues, option.value];
                handleChange(nextValues);
              }}
              data-checkbox-value={option.value}
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
