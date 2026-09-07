import React from 'react';
import { Radio } from 'antd';
import type { RadioFieldProps, OptionItem } from '../../types';
import { useFormContext } from '../../core/FormContext';
import { renderOptionLabel } from '../shared/optionDisplay';

export function RadioFieldPC({
  fieldId,
  value: controlledValue,
  inputClassName,
  behavior,
  options,
  direction,
  optionType,
  buttonStyle,
  size,
  coloredOptions,
  onChange,
}: RadioFieldProps) {
  const { formData, setFieldValue } = useFormContext();
  const value =
    controlledValue !== undefined
      ? (controlledValue as OptionItem | null)
      : (formData[fieldId] as OptionItem | null | undefined);
  const disabled = behavior === 'DISABLED';

  const handleChange = (e: any) => {
    const val = e.target.value as string;
    const option = options.find((o) => o.value === val) ?? null;
    setFieldValue(fieldId, option);
    onChange?.(option);
  };

  const style: React.CSSProperties =
    direction === 'vertical' ? { display: 'flex', flexDirection: 'column', gap: 8 } : {};
  const className = [inputClassName, coloredOptions ? 'sy-option-group-colored' : undefined]
    .filter(Boolean)
    .join(' ');

  return (
    <Radio.Group
      className={className}
      value={value?.value ?? undefined}
      disabled={disabled}
      optionType={optionType}
      buttonStyle={buttonStyle}
      size={size}
      onChange={handleChange}
      data-testid={`radiofield-input-${fieldId}`}
      style={style}
    >
      {options.map((o) => (
        <Radio key={o.value} value={o.value}>
          {renderOptionLabel(o, coloredOptions)}
        </Radio>
      ))}
    </Radio.Group>
  );
}
