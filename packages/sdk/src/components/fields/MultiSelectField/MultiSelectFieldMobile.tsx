import React, { useMemo, useState } from 'react';
import type { MultiSelectFieldProps, OptionItem } from '../../types';
import { useFormContext } from '../../core/FormContext';
import {
  MobileBottomSheet,
  MobileFieldTrigger,
  MobileSearchBox,
  MobileSheetFooter,
} from '../shared/MobileField';
import { renderOptionLabel } from '../shared/optionDisplay';

export function MultiSelectFieldMobile({
  fieldId,
  value: controlledValue,
  placeholder,
  inputClassName,
  behavior,
  options,
  maxCount,
  allowClear,
  coloredOptions,
  onChange,
}: MultiSelectFieldProps) {
  const { formData, setFieldValue } = useFormContext();
  const value =
    controlledValue !== undefined
      ? ((controlledValue as OptionItem[] | undefined) ?? [])
      : ((formData[fieldId] as OptionItem[] | undefined) ?? []);
  const disabled = behavior === 'DISABLED';
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState('');
  const [tempValues, setTempValues] = useState<OptionItem[]>(value);

  const filteredOptions = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return options;
    return options.filter((option) =>
      String(option.label ?? option.value)
        .toLowerCase()
        .includes(keyword),
    );
  }, [options, search]);

  const tempValueSet = useMemo(
    () => new Set(tempValues.map((option) => option.value)),
    [tempValues],
  );

  const openSheet = () => {
    if (disabled) return;
    setTempValues(value);
    setSearch('');
    setVisible(true);
  };

  const toggleOption = (option: OptionItem) => {
    const exists = tempValueSet.has(option.value);
    if (exists) {
      setTempValues((current) => current.filter((item) => item.value !== option.value));
      return;
    }
    if (maxCount && tempValues.length >= maxCount) return;
    setTempValues((current) => [...current, option]);
  };

  const commitValue = (nextValue: OptionItem[]) => {
    setFieldValue(fieldId, nextValue);
    onChange?.(nextValue);
  };

  const handleConfirm = () => {
    commitValue(tempValues);
    setVisible(false);
  };

  const handleClear = () => {
    setTempValues([]);
    commitValue([]);
  };

  return (
    <div className={inputClassName} data-testid={`multiselectfield-input-${fieldId}`}>
      <MobileFieldTrigger
        value={value.length ? value.map((option) => option.label).join(', ') : undefined}
        placeholder={placeholder ?? '请选择'}
        disabled={disabled}
        clearable={allowClear}
        onClick={openSheet}
        onClear={handleClear}
        testId={`multiselectfield-trigger-${fieldId}`}
      />
      <MobileBottomSheet
        visible={visible}
        onClose={() => setVisible(false)}
        height="80vh"
        testId={`multiselectfield-popup-${fieldId}`}
      >
        <div className="sy-mobile-option-sheet">
          <div className="sy-mobile-option-search">
            <MobileSearchBox value={search} onChange={setSearch} />
          </div>
          <div className="sy-mobile-option-list">
            {filteredOptions.map((option) => {
              const active = tempValueSet.has(option.value);
              const optionDisabled =
                option.disabled || Boolean(maxCount && tempValues.length >= maxCount && !active);
              return (
                <button
                  type="button"
                  key={option.value}
                  className={`sy-mobile-option-row ${active ? 'is-active' : ''}`}
                  disabled={optionDisabled}
                  onClick={() => toggleOption(option)}
                  data-testid={`multiselectfield-option-${option.value}`}
                >
                  <span className="sy-mobile-option-check is-checkbox" aria-hidden="true" />
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
