import React, { useEffect, useMemo, useState } from 'react';
import * as MobileAntd from 'antd-mobile';
import type { UserSelectFieldProps, UserItem } from '../../types';
import { useFormContext } from '../../core/FormContext';
import {
  getUserId,
  normalizeUser,
  normalizeUserArray,
  formatUserDisplay,
} from '../shared/fieldFormat';
import { UserPicker } from '../shared/UserPicker';
import { MobileFieldTrigger } from '../shared/MobileField';

const getMobilePopup = () => {
  try {
    return (MobileAntd as any).Popup;
  } catch {
    return undefined;
  }
};

export function UserSelectFieldMobile({
  fieldId,
  behavior,
  placeholder,
  inputClassName,
  multiple = true,
  dataSource = [],
  treeData,
  allowClear = true,
  maxCount,
  displayFormat,
  onChange,
}: UserSelectFieldProps) {
  const { formData, setFieldValue, api } = useFormContext();
  const rawValue = formData[fieldId];
  const value = useMemo(() => normalizeUserArray(rawValue), [rawValue]);
  const disabled = behavior === 'DISABLED';
  const [showPicker, setShowPicker] = useState(false);
  const [optionsSource, setOptionsSource] = useState<UserItem[]>(() =>
    dataSource.map(normalizeUser),
  );
  const pickerDataSource = dataSource.length > 0 ? dataSource : undefined;

  useEffect(() => {
    if (dataSource.length) {
      setOptionsSource(dataSource.map(normalizeUser));
    }
  }, [dataSource]);

  useEffect(() => {
    setOptionsSource((current) => {
      const merged = [...current];
      let changed = false;
      for (const item of value) {
        if (!merged.some((existing) => getUserId(existing) === getUserId(item))) {
          merged.push(item);
          changed = true;
        }
      }
      return changed ? merged : current;
    });
  }, [value]);

  const ensureUsers = async () => {
    if (dataSource.length || optionsSource.length) return;
    const users = await api.getUserList();
    setOptionsSource(users.map(normalizeUser));
  };

  const handleSelect = (userId: string) => {
    const user = optionsSource.find((u) => getUserId(u) === userId);
    /* v8 ignore next */
    if (!user) return;

    let newValue: UserItem[];
    if (multiple) {
      const exists = value.some((u) => getUserId(u) === userId);
      newValue = exists ? value.filter((u) => getUserId(u) !== userId) : [...value, user];
      newValue = newValue.slice(0, maxCount ?? newValue.length);
    } else {
      newValue = [user];
      setShowPicker(false);
    }
    setFieldValue(fieldId, newValue);
    onChange?.(newValue);
  };

  const handleConfirm = (items: UserItem[]) => {
    const next = (multiple ? items.slice(0, maxCount ?? items.length) : items.slice(0, 1)).map(
      normalizeUser,
    );
    setFieldValue(fieldId, next);
    onChange?.(next);
    setShowPicker(false);
  };

  const openPicker = () => {
    if (disabled) return;
    setShowPicker(true);
    void ensureUsers();
  };

  const handleClear = () => {
    setFieldValue(fieldId, []);
    onChange?.([]);
    setShowPicker(false);
  };

  const displayValue = value.length
    ? value.map((u) => formatUserDisplay(u, displayFormat)).join(', ')
    : undefined;

  return (
    <div className={inputClassName} data-testid={`userselectfield-mobile-${fieldId}`}>
      <MobileFieldTrigger
        value={displayValue}
        placeholder={placeholder ?? '请选择'}
        disabled={disabled}
        clearable={allowClear}
        onClick={openPicker}
        onClear={handleClear}
        testId={`userselectfield-mobile-trigger-${fieldId}`}
      />
      {showPicker && getMobilePopup() ? (
        <UserPicker
          api={api}
          open={showPicker}
          onOpenChange={setShowPicker}
          mobile
          multiple={multiple}
          value={value}
          dataSource={pickerDataSource}
          treeData={treeData}
          displayFormat={displayFormat}
          onConfirm={handleConfirm}
          onCancel={() => setShowPicker(false)}
        />
      ) : showPicker ? (
        <ul data-testid={`userselectfield-mobile-list-${fieldId}`}>
          {optionsSource.map((user) => (
            <li key={getUserId(user)}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => handleSelect(getUserId(user))}
                data-testid={`userselectfield-mobile-option-${getUserId(user)}`}
              >
                {formatUserDisplay(user, displayFormat)}
                {value.some((u) => getUserId(u) === getUserId(user)) ? ' ✓' : ''}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
