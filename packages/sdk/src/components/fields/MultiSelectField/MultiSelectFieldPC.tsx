import React from 'react';
import { Select } from 'antd';
import type { MultiSelectFieldProps, OptionItem } from '../../types';
import { useFormContext } from '../../core/FormContext';
import { toAntdOptions } from '../shared/optionDisplay';

export function MultiSelectFieldPC({
  fieldId,
  value: controlledValue,
  placeholder,
  inputClassName,
  behavior,
  options,
  allowClear,
  showSearch,
  maxCount,
  maxTagCount,
  maxTagTextLength,
  optionFilterProp,
  optionLabelProp,
  placement,
  variant,
  size,
  coloredOptions,
  onChange,
}: MultiSelectFieldProps) {
  const { formData, setFieldValue } = useFormContext();
  const value =
    controlledValue !== undefined
      ? ((controlledValue as OptionItem[] | undefined) ?? [])
      : ((formData[fieldId] as OptionItem[] | undefined) ?? []);
  const disabled = behavior === 'DISABLED';

  const handleChange = (vals: string[]) => {
    const selected = vals
      .map((v) => options.find((o) => o.value === v))
      .filter((o): o is OptionItem => o != null);
    setFieldValue(fieldId, selected);
    onChange?.(selected);
  };

  return (
    <Select
      mode="multiple"
      className={inputClassName}
      style={{ width: '100%' }}
      value={value.map((v) => v.value)}
      placeholder={placeholder}
      disabled={disabled}
      allowClear={allowClear}
      showSearch={showSearch}
      maxCount={maxCount}
      maxTagCount={maxTagCount}
      maxTagTextLength={maxTagTextLength}
      optionFilterProp={optionFilterProp || 'label'}
      optionLabelProp={optionLabelProp}
      placement={placement}
      variant={variant}
      size={size}
      options={toAntdOptions(options, coloredOptions)}
      onChange={handleChange}
      data-testid={`multiselectfield-input-${fieldId}`}
    />
  );
}
