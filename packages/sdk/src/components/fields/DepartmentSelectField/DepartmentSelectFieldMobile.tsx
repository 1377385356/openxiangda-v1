import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as MobileAntd from 'antd-mobile';
import type { DepartmentSelectFieldProps, DepartmentTreeNode } from '../../types';
import { useFormContext } from '../../core/FormContext';
import {
  flattenDepartments,
  getDepartmentId,
  getDepartmentName,
  normalizeDepartmentNode,
  normalizeDepartmentArray,
  getDepartmentFullPath,
  filterTreeByScope,
} from '../shared/fieldFormat';
import { DepartmentPicker } from '../shared/DepartmentPicker';
import { MobileFieldTrigger } from '../shared/MobileField';

const EMPTY_TREE_DATA: DepartmentTreeNode[] = [];

function toDepartmentValue(item: any) {
  const normalized = normalizeDepartmentNode(item);
  return { id: getDepartmentId(normalized), name: getDepartmentName(normalized) };
}

const getMobilePopup = () => {
  try {
    return (MobileAntd as any).Popup;
  } catch {
    return undefined;
  }
};

export function DepartmentSelectFieldMobile({
  fieldId,
  behavior,
  placeholder,
  inputClassName,
  multiple = false,
  treeData,
  allowClear = true,
  maxCount,
  showSearch = true,
  searchScope = 'loaded',
  searchMinLength = 1,
  searchDebounceMs = 300,
  showFullPath,
  scopeType,
  specifiedDepts,
  onChange,
}: DepartmentSelectFieldProps) {
  const { formData, setFieldValue, api } = useFormContext();
  const rawValue = formData[fieldId];
  const value = useMemo(() => normalizeDepartmentArray(rawValue), [rawValue]);
  const disabled = behavior === 'DISABLED';
  const [showPicker, setShowPicker] = useState(false);
  const configuredTreeData = treeData ?? EMPTY_TREE_DATA;
  const remoteLoadedRef = useRef(false);
  const [loadedTreeData, setLoadedTreeData] = useState<DepartmentTreeNode[]>(configuredTreeData);

  useEffect(() => {
    if (configuredTreeData.length) {
      setLoadedTreeData(configuredTreeData.map(normalizeDepartmentNode));
    }
  }, [configuredTreeData]);

  const ensureDepartments = async () => {
    if (configuredTreeData.length || loadedTreeData.length || remoteLoadedRef.current) return;
    remoteLoadedRef.current = true;
    const roots = await api.getDepartmentRoots();
    setLoadedTreeData((roots as DepartmentTreeNode[]).map(normalizeDepartmentNode));
  };

  // 应用范围过滤
  const scopedTreeData = filterTreeByScope(loadedTreeData, scopeType, specifiedDepts);
  const allDepts = flattenDepartments(scopedTreeData);

  const handleSelect = (deptId: string) => {
    const dept = allDepts.find((d) => d.id === deptId);
    /* v8 ignore next */
    if (!dept) return;
    const selectedDept = normalizeDepartmentNode(dept.node ?? dept);

    let newValue: DepartmentTreeNode[];
    if (multiple) {
      const exists = value.some((d) => getDepartmentId(d) === deptId);
      newValue = exists
        ? value.filter((d) => getDepartmentId(d) !== deptId)
        : [...value, selectedDept];
      newValue = newValue.slice(0, maxCount ?? newValue.length);
    } else {
      newValue = [selectedDept];
      setShowPicker(false);
    }
    const normalized = newValue.map(toDepartmentValue);
    setFieldValue(fieldId, normalized);
    onChange?.(normalized);
  };

  const handleConfirm = (items: { id: string; name: string }[]) => {
    const next = (multiple ? items.slice(0, maxCount ?? items.length) : items.slice(0, 1)).map(
      toDepartmentValue,
    );
    setFieldValue(fieldId, next);
    onChange?.(next);
    setShowPicker(false);
  };

  const openPicker = () => {
    if (disabled) return;
    setShowPicker(true);
    void ensureDepartments();
  };

  const handleClear = () => {
    setFieldValue(fieldId, []);
    onChange?.([]);
    setShowPicker(false);
  };

  const displayValue = value.length
    ? value
        .map((d) =>
          showFullPath
            ? getDepartmentFullPath(getDepartmentId(d), scopedTreeData) || getDepartmentName(d)
            : getDepartmentName(d),
        )
        .join(', ')
    : undefined;

  return (
    <div className={inputClassName} data-testid={`deptselectfield-mobile-${fieldId}`}>
      <MobileFieldTrigger
        value={displayValue}
        placeholder={placeholder ?? '请选择'}
        disabled={disabled}
        clearable={allowClear}
        onClick={openPicker}
        onClear={handleClear}
        testId={`deptselectfield-mobile-trigger-${fieldId}`}
      />
      {showPicker && getMobilePopup() ? (
        <DepartmentPicker
          api={api}
          open={showPicker}
          onOpenChange={setShowPicker}
          mobile
          multiple={multiple}
          value={value}
          treeData={treeData}
          showSearch={showSearch}
          searchScope={searchScope}
          showFullPath={showFullPath}
          searchMinLength={searchMinLength}
          searchDebounceMs={searchDebounceMs}
          onConfirm={handleConfirm}
          onCancel={() => setShowPicker(false)}
        />
      ) : showPicker ? (
        <ul data-testid={`deptselectfield-mobile-list-${fieldId}`}>
          {allDepts.map((dept) => (
            <li key={dept.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => handleSelect(dept.id)}
                data-testid={`deptselectfield-mobile-option-${dept.id}`}
              >
                {getDepartmentName(dept)}
                {value.some((d) => getDepartmentId(d) === dept.id) ? ' ✓' : ''}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
