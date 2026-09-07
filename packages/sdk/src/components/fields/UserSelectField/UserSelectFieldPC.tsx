import React, { useEffect, useMemo, useState } from 'react';
import { Select } from 'antd';
import type { UserSelectFieldProps, UserItem } from '../../types';
import { useFormContext } from '../../core/FormContext';
import {
  getUserId,
  normalizeUser,
  normalizeUserArray,
  formatUserDisplay,
} from '../shared/fieldFormat';
import { UserPicker } from '../shared/UserPicker';

export function UserSelectFieldPC({
  fieldId,
  behavior,
  placeholder,
  inputClassName,
  multiple = true,
  searchable = true,
  dataSource = [],
  treeData,
  allowClear = true,
  maxCount,
  notFoundContent = '暂无数据',
  displayFormat,
  onChange,
}: UserSelectFieldProps) {
  const { formData, setFieldValue, api } = useFormContext();
  const rawValue = formData[fieldId];
  const value = useMemo(() => normalizeUserArray(rawValue), [rawValue]);
  const disabled = behavior === 'DISABLED';
  const [optionsSource, setOptionsSource] = useState<UserItem[]>(() =>
    dataSource.map(normalizeUser),
  );
  const [loading, setLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
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

  useEffect(() => {
    const missing = value.filter((item) => getUserId(item) && getUserNameLikeId(item));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(
      missing.map((item) =>
        api
          .getUserById(getUserId(item))
          .then(normalizeUser)
          .catch(() => item),
      ),
    ).then((resolved) => {
      if (cancelled) return;
      const resolvedMap = new Map(resolved.map((item) => [getUserId(item), item]));
      const next = value.map((item) => resolvedMap.get(getUserId(item)) || item);
      if (next.some((item, index) => item.name !== value[index]?.name)) {
        setFieldValue(fieldId, next);
      }
      setOptionsSource((current) => {
        const merged = [...current];
        let changed = false;
        for (const item of next) {
          if (!merged.some((existing) => getUserId(existing) === getUserId(item))) {
            merged.push(item);
            changed = true;
          }
        }
        return changed ? merged : current;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [api, fieldId, setFieldValue, value]);

  const fetchUsers = async (keyword?: string) => {
    if (dataSource.length) return;
    setLoading(true);
    try {
      const users = await api.getUserList(
        keyword ? { name: keyword, username: keyword } : undefined,
      );
      setOptionsSource(users.map(normalizeUser));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (selectedIds: string | string[]) => {
    const ids = Array.isArray(selectedIds) ? selectedIds : [selectedIds];
    const selected = ids
      .map(
        (id) =>
          optionsSource.find((u) => getUserId(u) === id) ?? value.find((u) => getUserId(u) === id),
      )
      .filter(Boolean) as UserItem[];
    const result = multiple ? selected.slice(0, maxCount ?? selected.length) : selected.slice(0, 1);
    setFieldValue(fieldId, result);
    onChange?.(result);
  };

  const handlePickerConfirm = (items: UserItem[]) => {
    const result = multiple ? items.slice(0, maxCount ?? items.length) : items.slice(0, 1);
    const normalized = result.map(normalizeUser);
    setOptionsSource((current) => {
      const merged = [...current];
      for (const item of normalized) {
        if (!merged.some((existing) => getUserId(existing) === getUserId(item))) merged.push(item);
      }
      return merged;
    });
    setFieldValue(fieldId, normalized);
    onChange?.(normalized);
  };

  const options = useMemo(
    () =>
      optionsSource.map((u) => ({
        value: getUserId(u),
        label: formatUserDisplay(u, displayFormat),
      })),
    [optionsSource, displayFormat],
  );
  const selectValue = multiple ? value.map(getUserId) : value[0] ? getUserId(value[0]) : undefined;

  return (
    <div className="sy-select-with-picker">
      <Select
        className={inputClassName}
        style={{ width: '100%' }}
        mode={multiple ? 'multiple' : undefined}
        value={selectValue}
        placeholder={placeholder}
        disabled={disabled}
        allowClear={allowClear}
        maxCount={maxCount}
        showSearch={searchable}
        filterOption={dataSource.length ? undefined : false}
        onSearch={searchable ? fetchUsers : undefined}
        loading={loading}
        notFoundContent={loading ? '加载中...' : notFoundContent}
        options={options}
        onChange={handleChange}
        data-testid={`userselectfield-input-${fieldId}`}
      />
      <button
        type="button"
        className="sy-picker-trigger"
        disabled={disabled}
        onClick={() => setPickerOpen(true)}
        data-testid={`userselectfield-picker-trigger-${fieldId}`}
      >
        选择
      </button>
      {pickerOpen && (
        <UserPicker
          api={api}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          multiple={multiple}
          value={value}
          dataSource={pickerDataSource}
          treeData={treeData}
          displaySearch={searchable}
          displayFormat={displayFormat}
          onConfirm={handlePickerConfirm}
          onCancel={() => undefined}
        />
      )}
    </div>
  );
}

function getUserNameLikeId(user: UserItem) {
  const id = getUserId(user);
  return Boolean(id && (!user.name || user.name === id));
}
