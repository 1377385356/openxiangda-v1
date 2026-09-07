import React, { useEffect, useMemo, useState } from 'react';
import type { SelectFieldProps, OptionItem } from '../../types';
import { useFormContext } from '../../core/FormContext';
import {
  MobileBottomSheet,
  MobileFieldTrigger,
  MobileSearchBox,
  MobileSheetFooter,
} from '../shared/MobileField';
import { renderOptionLabel } from '../shared/optionDisplay';
import { useLinkedFormRemoteOptions } from './useLinkedFormRemoteOptions';
import { syncSelectValueToFields } from './valueSync';

export function SelectFieldMobile({
  fieldId,
  value: controlledValue,
  placeholder,
  inputClassName,
  behavior,
  options,
  allowClear,
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
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState('');
  const [tempValue, setTempValue] = useState<OptionItem | null>(value ?? null);
  const selectedOptions = useMemo(() => (value ? [value] : tempValue ? [tempValue] : []), [
    tempValue,
    value,
  ]);
  const {
    enabled: remoteEnabled,
    loading: remoteLoading,
    options: remoteOptions,
    reset: resetRemoteOptions,
    search: searchRemoteOptions,
  } = useLinkedFormRemoteOptions(optionSource, options, selectedOptions);

  const filteredOptions = useMemo(() => {
    if (remoteEnabled) return remoteOptions;
    const keyword = search.trim().toLowerCase();
    if (!keyword) return options;
    return options.filter((option) =>
      String(option.label ?? option.value)
        .toLowerCase()
        .includes(keyword),
    );
  }, [options, remoteEnabled, remoteOptions, search]);

  useEffect(() => {
    if (!visible || !remoteEnabled) return;
    searchRemoteOptions(search);
  }, [remoteEnabled, search, searchRemoteOptions, visible]);

  const openSheet = () => {
    if (disabled) return;
    setTempValue(value ?? null);
    setSearch('');
    resetRemoteOptions();
    setVisible(true);
  };

  const handleConfirm = () => {
    setFieldValue(fieldId, tempValue);
    syncSelectValueToFields(valueSync, tempValue, setFieldValue);
    onChange?.(tempValue);
    setVisible(false);
  };

  const handleClear = () => {
    setTempValue(null);
    setFieldValue(fieldId, null);
    syncSelectValueToFields(valueSync, null, setFieldValue);
    onChange?.(null);
  };

  return (
    <div className={inputClassName} data-testid={`selectfield-input-${fieldId}`}>
      <MobileFieldTrigger
        value={value?.label}
        placeholder={placeholder ?? '请选择'}
        disabled={disabled}
        clearable={allowClear}
        onClick={openSheet}
        onClear={handleClear}
        testId={`selectfield-trigger-${fieldId}`}
      />
      <MobileBottomSheet
        visible={visible}
        onClose={() => setVisible(false)}
        height="80vh"
        testId={`selectfield-popup-${fieldId}`}
      >
        <div className="sy-mobile-option-sheet">
          <div className="sy-mobile-option-search">
            <MobileSearchBox value={search} onChange={setSearch} />
          </div>
          <div className="sy-mobile-option-list">
            {remoteLoading ? <div className="sy-mobile-option-row">加载中...</div> : null}
            {!remoteLoading && filteredOptions.length === 0 ? (
              <div className="sy-mobile-option-row">暂无数据</div>
            ) : null}
            {!remoteLoading &&
              filteredOptions.map((option) => {
                const active = tempValue?.value === option.value;
                return (
                  <button
                    type="button"
                    key={option.value}
                    className={`sy-mobile-option-row ${active ? 'is-active' : ''}`}
                    disabled={option.disabled}
                    onClick={() => setTempValue(option)}
                    data-testid={`selectfield-option-${option.value}`}
                  >
                    <span className="sy-mobile-option-check is-radio" aria-hidden="true" />
                    <span className="sy-mobile-option-label">
                      {renderOptionLabel(option, coloredOptions)}
                    </span>
                  </button>
                );
              })}
          </div>
          <MobileSheetFooter onCancel={() => setVisible(false)} onConfirm={handleConfirm} />
        </div>
      </MobileBottomSheet>
    </div>
  );
}
