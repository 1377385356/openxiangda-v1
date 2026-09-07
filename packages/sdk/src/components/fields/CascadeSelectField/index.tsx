import React, { useEffect } from 'react';
import { Cascader } from 'antd';
import type { CascadeSelectFieldProps, OptionItem } from '../../types';
import { FieldWrapper } from '../../core/FieldWrapper';
import { useFormContext } from '../../core/FormContext';

const toValuePath = (value: any, multiple?: boolean) => {
  if (!value) return multiple ? [] : [];
  if (multiple && Array.isArray(value) && Array.isArray(value[0])) {
    return value.map((path: OptionItem[]) => path.map((item) => item.value));
  }
  if (Array.isArray(value)) return value.map((item) => item.value);
  return [];
};

const normalizePath = (selectedOptions?: any[]) =>
  (selectedOptions ?? []).map((item) => ({
    label: String(item?.label ?? item?.title ?? item?.value ?? ''),
    value: String(item?.value ?? ''),
  }));

export function CascadeSelectField(props: CascadeSelectFieldProps) {
  const {
    fieldId,
    label,
    behavior: propBehavior,
    required,
    tips,
    className,
    labelClassName,
    tipsClassName,
    inputClassName,
    placeholder,
    defaultValue,
    options = [],
    multiple = false,
    allowClear = true,
    changeOnSelect,
    showSearch,
    fieldNames,
    onChange,
  } = props;
  const { formData, fieldBehaviors, setFieldValue, registerField, unregisterField } =
    useFormContext();
  const behavior = propBehavior ?? fieldBehaviors[fieldId] ?? 'NORMAL';
  const value = formData[fieldId] ?? (multiple ? [] : []);

  useEffect(() => {
    registerField(fieldId);
    if (defaultValue !== undefined && formData[fieldId] === undefined) {
      setFieldValue(fieldId, defaultValue);
    }
    return () => unregisterField(fieldId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldId]);

  if (behavior === 'HIDDEN') return null;
  const readonlyText = Array.isArray(value)
    ? (multiple && Array.isArray(value[0]) ? value.flat() : value)
        .map((item: any) => item?.label ?? item?.value ?? item)
        .join(' / ')
    : '--';

  return (
    <FieldWrapper
      fieldId={fieldId}
      label={label}
      required={required}
      tips={tips}
      className={className}
      labelClassName={labelClassName}
      tipsClassName={tipsClassName}
    >
      {behavior === 'READONLY' ? (
        <div
          className="sy-field-readonly-value"
          data-testid={`cascadeselectfield-readonly-${fieldId}`}
        >
          {readonlyText || '--'}
        </div>
      ) : (
        <Cascader
          className={inputClassName}
          style={{ width: '100%' }}
          options={options}
          multiple={multiple}
          allowClear={allowClear}
          changeOnSelect={changeOnSelect}
          showSearch={showSearch}
          fieldNames={fieldNames as any}
          disabled={behavior === 'DISABLED'}
          placeholder={placeholder}
          value={toValuePath(value, multiple) as any}
          onChange={(_nextValue: any, selectedOptions: any) => {
            const next = multiple
              ? ((selectedOptions as any[][]) ?? []).map((path) => normalizePath(path))
              : normalizePath(selectedOptions as any[]);
            setFieldValue(fieldId, next);
            onChange?.(next);
          }}
          data-testid={`cascadeselectfield-input-${fieldId}`}
        />
      )}
    </FieldWrapper>
  );
}
