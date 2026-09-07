import React from 'react';
import { Tag } from 'antd';
import type { OptionItem } from '../../types';

const PRESET_COLORS: Record<string, string> = {
  processing: 'blue',
  success: 'green',
  error: 'red',
  warning: 'gold',
};

const LEGACY_LIGHT_COLORS: Record<string, string> = {
  '#e0f0ff': 'blue',
  '#cce5ff': 'blue',
  '#d4f7d4': 'green',
  '#d4edda': 'green',
  '#fff3cd': 'gold',
  '#f8d7da': 'red',
  '#f5c6cb': 'red',
  '#fde8e8': 'red',
  '#d1ecf1': 'cyan',
  '#e2d9f3': 'purple',
};

function normalizeColor(color: string) {
  const normalized = color.trim().toLowerCase();
  return PRESET_COLORS[normalized] || LEGACY_LIGHT_COLORS[normalized] || color;
}

export function renderOptionLabel(option: OptionItem, coloredOptions?: boolean) {
  if (!coloredOptions || !option.color) return option.label;
  return (
    <Tag color={normalizeColor(option.color)} className="sy-option-color-tag">
      {option.label}
    </Tag>
  );
}

export function toAntdOptions(options: OptionItem[], coloredOptions?: boolean) {
  return options.map((option) => ({
    ...option,
    label: renderOptionLabel(option, coloredOptions),
  }));
}

function optionValue(option: any) {
  return String(option?.value ?? option?.id ?? option?.key ?? option?.label ?? option ?? '');
}

export function resolveReadonlyOptionItems(value: unknown, sourceOptions?: OptionItem[]) {
  const values = Array.isArray(value)
    ? value
    : value === undefined || value === null || value === ''
      ? []
      : [value];
  const sourceMap = new Map((sourceOptions || []).map((option) => [String(option.value), option]));
  return values
    .map((item) => {
      const rawValue = optionValue(item);
      if (!rawValue) return null;
      const matched = sourceMap.get(rawValue);
      if (typeof item === 'object' && item !== null) {
        const option = item as OptionItem & { name?: string; title?: string };
        return {
          ...matched,
          ...option,
          value: rawValue,
          label: String(option.label ?? option.name ?? option.title ?? matched?.label ?? rawValue),
          color: option.color ?? matched?.color,
        } as OptionItem;
      }
      return {
        ...matched,
        value: rawValue,
        label: String(matched?.label ?? rawValue),
      } as OptionItem;
    })
    .filter(Boolean) as OptionItem[];
}

export function renderReadonlyOptions(
  options: OptionItem[],
  coloredOptions?: boolean,
  tagWhenPlain = false,
) {
  if (options.length === 0) return '--';
  if (!coloredOptions && !tagWhenPlain) return options.map((option) => option.label).join(', ');
  return (
    <span className="sy-option-readonly-list">
      {options.map((option) =>
        coloredOptions && option.color ? (
          <React.Fragment key={option.value}>
            {renderOptionLabel(option, coloredOptions)}
          </React.Fragment>
        ) : (
          <Tag key={option.value}>{option.label}</Tag>
        ),
      )}
    </span>
  );
}
