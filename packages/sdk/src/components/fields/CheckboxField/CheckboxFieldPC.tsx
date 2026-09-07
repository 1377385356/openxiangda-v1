import React from 'react';
import { Checkbox } from 'antd';
import type { CheckboxFieldProps, OptionItem } from '../../types';
import { useFormContext } from '../../core/FormContext';
import { renderOptionLabel } from '../shared/optionDisplay';

export function CheckboxFieldPC({
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
  const reachedMax = Boolean(maxCount && selectedValues.length >= maxCount);

  const handleChange = (vals: any[]) => {
    const selected = vals
      .map((v) => options.find((o) => o.value === v))
      .filter((o): o is OptionItem => o != null);
    setFieldValue(fieldId, selected);
    onChange?.(selected);
  };

  const style: React.CSSProperties =
    direction === 'vertical' ? { display: 'flex', flexDirection: 'column', gap: 8 } : {};
  const className = [inputClassName, coloredOptions ? 'sy-option-group-colored' : undefined]
    .filter(Boolean)
    .join(' ');

  return (
    <Checkbox.Group
      className={className}
      value={selectedValues}
      disabled={disabled}
      onChange={handleChange}
      data-testid={`checkboxfield-input-${fieldId}`}
      style={style}
    >
      {options.map((o) => (
        <Checkbox
          key={o.value}
          value={o.value}
          disabled={disabled || (reachedMax && !selectedValues.includes(o.value))}
        >
          {renderOptionLabel(o, coloredOptions)}
        </Checkbox>
      ))}
    </Checkbox.Group>
  );
}
