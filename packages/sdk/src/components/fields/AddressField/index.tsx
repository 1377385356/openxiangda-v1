import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Cascader, Input, Space, Spin } from 'antd';
import * as MobileAntd from 'antd-mobile';
import type { AddressFieldProps, AddressValue, OptionItem } from '../../types';
import { FieldWrapper } from '../../core/FieldWrapper';
import { useFormContext } from '../../core/FormContext';
import { useDeviceDetect } from '../../hooks/useDeviceDetect';

const LEVELS = ['province', 'city', 'district', 'street'] as const;

type AddressLevel = (typeof LEVELS)[number];
type AddressOption = OptionItem & {
  level?: AddressLevel;
  isLeaf?: boolean;
  children?: AddressOption[];
};

const getMobileComponent = (name: string) => {
  try {
    return (MobileAntd as any)[name];
  } catch {
    return undefined;
  }
};

const modeDepth = (mode?: AddressFieldProps['mode']) => {
  if (mode === 'province-city') return 2;
  if (mode === 'province-city-district-street' || mode === 'province-city-district-street-detail') {
    return 4;
  }
  return 3;
};

const activeLevels = (mode?: AddressFieldProps['mode']) => LEVELS.slice(0, modeDepth(mode));

const stringifyValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value);
};

const normalizeAddressPart = (part: any): OptionItem | undefined => {
  if (part === undefined || part === null || part === '') return undefined;
  if (typeof part === 'object') {
    const value = stringifyValue(part.value ?? part.adcode ?? part.code ?? part.id ?? part.label);
    if (!value) return undefined;
    const label = stringifyValue(part.label ?? part.name ?? part.title) ?? '';
    return { label, value };
  }
  const value = stringifyValue(part);
  return value ? ({ label: '', value } as OptionItem) : undefined;
};

const normalizeAddressValue = (raw?: AddressValue | Record<string, any>) => {
  if (!raw || typeof raw !== 'object') return undefined;
  const next: AddressValue = {};
  LEVELS.forEach((level) => {
    const part = normalizeAddressPart((raw as any)[level]);
    if (part) next[level] = part;
  });
  if ((raw as any).detail !== undefined && (raw as any).detail !== null) {
    next.detail = String((raw as any).detail);
  }
  if (typeof (raw as any).fullAddress === 'string' && (raw as any).fullAddress) {
    next.fullAddress = (raw as any).fullAddress;
  }
  return Object.keys(next).length > 0 ? next : undefined;
};

const getDisplayLabel = (part?: Partial<OptionItem>) => {
  const label = part?.label?.trim();
  if (!label) return undefined;
  return label === part?.value ? undefined : label;
};

const valueToPath = (value: AddressValue | undefined, levels: readonly AddressLevel[]) =>
  levels.map((level) => value?.[level]?.value).filter(Boolean) as string[];

const normalizeDivision = (item: any, level: AddressLevel, depth: number, index: number) => ({
  label: String(item.name || item.label || item.adcode || item.value),
  value: String(item.adcode || item.value || item.id),
  level,
  isLeaf: index + 1 >= depth || item.isLeaf === true,
});

const composeFullAddress = (value?: AddressValue, levels: readonly AddressLevel[] = LEVELS) => {
  if (!value) return '';
  return [...levels.map((level) => getDisplayLabel(value[level])), value.detail]
    .filter(Boolean)
    .join('');
};

const mergeValuePathIntoOptions = (
  source: AddressOption[],
  value: AddressValue | undefined,
  levels: readonly AddressLevel[],
  depth: number,
): AddressOption[] => {
  if (!value) return source;
  const mergeAt = (items: AddressOption[], index: number): AddressOption[] => {
    const level = levels[index];
    const part = level ? value[level] : undefined;
    if (!level || !part?.value) return items;

    let matched = false;
    const nextItems = items.map((item) => {
      if (String(item.value) !== part.value) return item;
      matched = true;
      const label = getDisplayLabel(part) ?? getDisplayLabel(item) ?? '地址加载中';
      const hasNextPath = Boolean(levels[index + 1] && value[levels[index + 1]]?.value);
      return {
        ...item,
        label,
        level: item.level ?? level,
        isLeaf: index + 1 >= depth || (!hasNextPath && item.isLeaf === true),
        children: hasNextPath ? mergeAt(item.children ?? [], index + 1) : item.children,
      };
    });

    if (!matched) {
      const hasNextPath = Boolean(levels[index + 1] && value[levels[index + 1]]?.value);
      const option: AddressOption = {
        label: getDisplayLabel(part) ?? '地址加载中',
        value: part.value,
        level,
        isLeaf: index + 1 >= depth,
      };
      if (hasNextPath) option.children = mergeAt([], index + 1);
      nextItems.push(option);
    }
    return nextItems;
  };
  return mergeAt(source, 0);
};

const setNestedChildren = (
  source: AddressOption[],
  selectedOptions: AddressOption[],
  children: AddressOption[],
): AddressOption[] => {
  const [current, ...rest] = selectedOptions;
  if (!current) return source;
  const currentValue = String(current.value);
  let matched = false;
  const next = source.map((item) => {
    if (String(item.value) !== currentValue) return item;
    matched = true;
    return {
      ...item,
      children: rest.length ? setNestedChildren(item.children ?? [], rest, children) : children,
    };
  });

  if (!matched) {
    next.push({
      label: String(current.label || current.value),
      value: currentValue,
      level: current.level,
      isLeaf: false,
      children: rest.length ? setNestedChildren([], rest, children) : children,
    });
  }
  return next;
};

export function AddressField(props: AddressFieldProps) {
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
    defaultValue,
    mode = 'province-city-district',
    detailPlaceholder = '请输入详细地址',
    allowClear = true,
    onChange,
  } = props;
  const { formData, fieldBehaviors, setFieldValue, registerField, unregisterField, api } =
    useFormContext();
  const { isMobile } = useDeviceDetect();
  const behavior = propBehavior ?? fieldBehaviors[fieldId] ?? 'NORMAL';
  const rawValue = formData[fieldId] as AddressValue | Record<string, any> | undefined;
  const value = useMemo(() => normalizeAddressValue(rawValue), [rawValue]);
  const [options, setOptions] = useState<AddressOption[]>([]);
  const [loadingRoots, setLoadingRoots] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileLevelIndex, setMobileLevelIndex] = useState(0);
  const [mobileOptions, setMobileOptions] = useState<AddressOption[]>([]);
  const [mobileLoading, setMobileLoading] = useState(false);
  const [tempValue, setTempValue] = useState<AddressValue | undefined>();
  const depth = modeDepth(mode);
  const levels = useMemo(() => activeLevels(mode), [mode]);
  const valuePath = useMemo(() => valueToPath(value, levels), [levels, value]);
  const displayOptions = useMemo(
    () => mergeValuePathIntoOptions(options, value, levels, depth),
    [depth, levels, options, value],
  );
  const detailEnabled = mode === 'province-city-district-street-detail';
  const disabled = behavior === 'DISABLED';
  const MobilePopup = getMobileComponent('Popup');

  useEffect(() => {
    registerField(fieldId);
    return () => unregisterField(fieldId);
  }, [fieldId, registerField, unregisterField]);

  useEffect(() => {
    if (defaultValue !== undefined && rawValue === undefined) {
      setFieldValue(fieldId, defaultValue);
    }
  }, [defaultValue, fieldId, rawValue, setFieldValue]);

  const loadDivisions = useCallback(
    async (parentAdcode: string | undefined, level: AddressLevel, index: number) => {
      const list = await api.getChinaDivisions(parentAdcode);
      return list.map((item: any) => normalizeDivision(item, level, depth, index));
    },
    [api, depth],
  );

  useEffect(() => {
    let mounted = true;
    setLoadingRoots(true);
    loadDivisions(undefined, 'province', 0)
      .then((nextOptions) => {
        if (mounted) setOptions(nextOptions);
      })
      .finally(() => {
        if (mounted) setLoadingRoots(false);
      });
    return () => {
      mounted = false;
    };
  }, [loadDivisions]);

  useEffect(() => {
    if (!value) return;
    let cancelled = false;

    const hydrateMissingLabels = async () => {
      let nextValue: AddressValue = { ...value };
      let changed = false;
      let parentAdcode: string | undefined;

      for (let index = 0; index < levels.length; index += 1) {
        const level = levels[index];
        const part = nextValue[level];
        if (!part?.value) break;

        if (!getDisplayLabel(part)) {
          const divisions = await loadDivisions(parentAdcode, level, index);
          const matched = divisions.find((option) => option.value === part.value);
          if (matched) {
            nextValue = { ...nextValue, [level]: { label: matched.label, value: matched.value } };
            changed = true;
          }
        }
        parentAdcode = part.value;
      }

      const fullAddress = composeFullAddress(nextValue, levels);
      if (fullAddress && nextValue.fullAddress !== fullAddress) {
        nextValue = { ...nextValue, fullAddress };
        changed = true;
      }

      if (!cancelled && changed) {
        setFieldValue(fieldId, nextValue);
      }
    };

    hydrateMissingLabels().catch(() => {
      // Address label hydration is best-effort; the current value remains editable.
    });

    return () => {
      cancelled = true;
    };
  }, [fieldId, levels, loadDivisions, setFieldValue, value]);

  useEffect(() => {
    if (!mobileOpen) return;
    const level = levels[mobileLevelIndex] || 'province';
    const parentLevel = levels[mobileLevelIndex - 1];
    const parentAdcode = parentLevel ? tempValue?.[parentLevel]?.value : undefined;
    setMobileLoading(true);
    loadDivisions(parentAdcode, level, mobileLevelIndex)
      .then(setMobileOptions)
      .finally(() => setMobileLoading(false));
  }, [loadDivisions, mobileOpen, mobileLevelIndex, tempValue, levels]);

  if (behavior === 'HIDDEN') return null;

  const setAddressValue = (next: AddressValue | undefined) => {
    const normalized = next
      ? { ...next, fullAddress: composeFullAddress(next, levels) }
      : undefined;
    setFieldValue(fieldId, normalized);
    onChange?.(normalized);
  };

  const display = value?.fullAddress || composeFullAddress(value, levels) || '--';

  const renderDetailInput = (
    currentValue?: AddressValue,
    onCommit?: (next?: AddressValue) => void,
  ) =>
    detailEnabled ? (
      <Input
        value={currentValue?.detail ?? ''}
        disabled={disabled}
        placeholder={detailPlaceholder}
        onChange={(event) => {
          const next = {
            ...(currentValue ?? {}),
            detail: event.target.value,
          };
          onCommit?.(next);
        }}
      />
    ) : null;

  const mobilePicker = MobilePopup ? (
    <MobilePopup
      visible={mobileOpen}
      onMaskClick={() => setMobileOpen(false)}
      bodyStyle={{ height: '80vh' }}
    >
      <div className="sy-address-mobile">
        <div className="sy-address-mobile-head">
          <button
            type="button"
            disabled={mobileLevelIndex === 0}
            onClick={() => setMobileLevelIndex((prev) => Math.max(0, prev - 1))}
          >
            返回
          </button>
          <strong>{['省份', '城市', '区县', '街道'][mobileLevelIndex] || '地址'}</strong>
          <button type="button" onClick={() => setMobileOpen(false)}>
            关闭
          </button>
        </div>
        <div className="sy-address-mobile-path">
          {levels.map((level, index) => (
            <button
              type="button"
              key={level}
              className={index === mobileLevelIndex ? 'is-active' : undefined}
              disabled={!tempValue?.[level] && index > 0}
              onClick={() => setMobileLevelIndex(index)}
            >
              {tempValue?.[level]?.label || ['省', '市', '区', '街道'][index]}
            </button>
          ))}
        </div>
        <div className="sy-address-mobile-list">
          {mobileLoading ? (
            <Spin />
          ) : mobileOptions.length ? (
            mobileOptions.map((option) => (
              <button
                type="button"
                key={option.value}
                className={
                  tempValue?.[option.level || 'province']?.value === option.value
                    ? 'is-active'
                    : undefined
                }
                onClick={() => {
                  const level = levels[mobileLevelIndex];
                  if (!level) return;
                  const next: AddressValue = { ...(tempValue ?? {}) };
                  next[level] = { label: option.label, value: option.value };
                  levels.slice(mobileLevelIndex + 1).forEach((laterLevel) => {
                    delete next[laterLevel];
                  });
                  setTempValue(next);
                  if (mobileLevelIndex < levels.length - 1) {
                    setMobileLevelIndex(mobileLevelIndex + 1);
                  }
                }}
              >
                {option.label}
              </button>
            ))
          ) : (
            <div className="sy-empty">暂无数据</div>
          )}
        </div>
        {detailEnabled && (
          <div className="sy-address-mobile-detail">
            {renderDetailInput(tempValue, (next) => setTempValue(next))}
          </div>
        )}
        <div className="sy-address-mobile-footer">
          <Button onClick={() => setMobileOpen(false)}>取消</Button>
          <Button
            type="primary"
            onClick={() => {
              setAddressValue(tempValue);
              setMobileOpen(false);
            }}
          >
            确定
          </Button>
        </div>
      </div>
    </MobilePopup>
  ) : null;

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
        <div className="sy-field-readonly-value" data-testid={`addressfield-readonly-${fieldId}`}>
          {display}
        </div>
      ) : isMobile && MobilePopup ? (
        <div
          className={inputClassName}
          style={{ minWidth: 0, maxWidth: '100%' }}
          data-testid={`addressfield-input-${fieldId}`}
        >
          <Space.Compact style={{ width: '100%' }}>
            <Button
              className="sy-address-mobile-trigger"
              style={{ flex: 1, textAlign: 'left' }}
              disabled={disabled}
              onClick={() => {
                setTempValue(value);
                setMobileLevelIndex(0);
                setMobileOpen(true);
              }}
            >
              {display === '--' ? props.placeholder || '请选择地址' : display}
            </Button>
            {allowClear && (
              <Button disabled={disabled} onClick={() => setAddressValue(undefined)}>
                清空
              </Button>
            )}
          </Space.Compact>
          {mobilePicker}
        </div>
      ) : (
        <div className={inputClassName} data-testid={`addressfield-input-${fieldId}`}>
          <Cascader
            style={{ width: '100%' }}
            options={displayOptions}
            allowClear={allowClear}
            disabled={disabled}
            value={valuePath}
            placeholder={props.placeholder || '请选择地址'}
            loading={loadingRoots}
            displayRender={(labels) =>
              labels.filter(Boolean).join(' / ') || (valuePath.length ? '地址加载中' : '')
            }
            loadData={async (selectedOptions) => {
              const target = selectedOptions[selectedOptions.length - 1] as AddressOption;
              const nextLevel = levels[selectedOptions.length] ?? 'street';
              const children = await loadDivisions(target.value, nextLevel, selectedOptions.length);
              setOptions((currentOptions) =>
                setNestedChildren(currentOptions, selectedOptions as AddressOption[], children),
              );
            }}
            onChange={(_path, selectedOptions) => {
              if (!selectedOptions?.length) {
                setAddressValue(undefined);
                return;
              }
              const next: AddressValue = {};
              selectedOptions.forEach((item: any, index) => {
                const level = levels[index];
                if (level) next[level] = { label: item.label, value: item.value };
              });
              next.detail = value?.detail;
              setAddressValue(next);
            }}
          />
          {renderDetailInput(value, setAddressValue)}
        </div>
      )}
    </FieldWrapper>
  );
}
