import React, { useMemo } from 'react';
import { Select } from 'antd';
import type { SelectFieldProps, OptionItem } from '../../types';
import { useFormContext } from '../../core/FormContext';
import { toAntdOptions } from '../shared/optionDisplay';
import { useLinkedFormRemoteOptions } from './useLinkedFormRemoteOptions';
import { syncSelectValueToFields } from './valueSync';

export function SelectFieldPC({
  fieldId,
  value: controlledValue,
  placeholder,
  inputClassName,
  behavior,
  options,
  allowClear,
  showSearch,
  optionFilterProp,
  optionLabelProp,
  placement,
  variant,
  size,
  coloredOptions,
  optionSource,
  valueSync,
  onChange,
}: SelectFieldProps) {
  const { formData, setFieldValue } = useFormContext();
  const value =
    controlledValue !== undefined
      ? (controlledValue as OptionItem | null)
      : (formData[fieldId] as OptionItem | null | undefined);
  const disabled = behavior === 'DISABLED';
  const selectedOptions = useMemo(() => (value ? [value] : []), [value]);
  const remote = useLinkedFormRemoteOptions(optionSource, options, selectedOptions);
  const displayOptions = remote.options;

  const handleChange = (val: string | undefined) => {
    if (val === undefined) {
      setFieldValue(fieldId, null);
      syncSelectValueToFields(valueSync, null, setFieldValue);
      onChange?.(null);
    } else {
      const option = displayOptions.find((o) => o.value === val) ?? null;
      setFieldValue(fieldId, option);
      syncSelectValueToFields(valueSync, option, setFieldValue);
      onChange?.(option);
    }
  };

  return (
    <Select
      className={inputClassName}
      style={{ width: '100%' }}
      value={value?.value ?? undefined}
      placeholder={placeholder}
      disabled={disabled}
      allowClear={allowClear}
      optionFilterProp={optionFilterProp || 'label'}
      optionLabelProp={optionLabelProp}
      placement={placement}
      variant={variant}
      size={size}
      options={toAntdOptions(displayOptions, coloredOptions)}
      filterOption={remote.enabled ? false : undefined}
      notFoundContent={remote.loading ? '加载中...' : undefined}
      onSearch={remote.enabled ? remote.search : undefined}
      onChange={handleChange}
      showSearch={remote.enabled || showSearch}
      data-testid={`selectfield-input-${fieldId}`}
    />
  );
}
