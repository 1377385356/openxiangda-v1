import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TreeSelect } from 'antd';
import type { DepartmentSelectFieldProps, DepartmentTreeNode } from '../../types';
import { useFormContext } from '../../core/FormContext';
import {
  flattenDepartments,
  getDepartmentId,
  getDepartmentName,
  normalizeDepartmentNode,
  getDepartmentFullPath,
  filterTreeByScope,
  normalizeDepartmentArray,
} from '../shared/fieldFormat';
import {
  canSearchAllDepartments,
  getDepartmentPathText,
  normalizeDepartmentSearchItems,
  type DepartmentSearchNode,
} from '../shared/departmentSearch';
import { DepartmentPicker } from '../shared/DepartmentPicker';

const EMPTY_TREE_DATA: DepartmentTreeNode[] = [];

function toDepartmentValue(item: any) {
  const normalized = normalizeDepartmentNode(item);
  return { id: getDepartmentId(normalized), name: getDepartmentName(normalized) };
}

function convertTreeData(nodes: DepartmentTreeNode[]): any[] {
  return nodes.map((node) => ({
    value: getDepartmentId(node),
    title: getDepartmentName(node),
    isLeaf: node.isLeaf ?? !node.hasChildren,
    children: node.children ? convertTreeData(node.children) : undefined,
  }));
}

function convertSearchTreeData(nodes: DepartmentSearchNode[], showFullPath?: boolean): any[] {
  return nodes.map((node) => {
    const name = getDepartmentName(node);
    const pathText = getDepartmentPathText(node);
    return {
      value: getDepartmentId(node),
      title: showFullPath && pathText ? pathText : name,
      isLeaf: true,
    };
  });
}

export function DepartmentSelectFieldPC({
  fieldId,
  behavior,
  placeholder,
  inputClassName,
  multiple = false,
  treeData,
  allowClear = true,
  maxCount,
  notFoundContent,
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
  const configuredTreeData = treeData ?? EMPTY_TREE_DATA;
  const remoteLoadedRef = useRef(false);
  const [loadedTreeData, setLoadedTreeData] = useState<DepartmentTreeNode[]>(configuredTreeData);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [remoteSearchResults, setRemoteSearchResults] = useState<DepartmentSearchNode[]>([]);
  const [remoteSearchLoading, setRemoteSearchLoading] = useState(false);
  const [selectedPathMap, setSelectedPathMap] = useState<Record<string, string>>({});
  const searchSeqRef = useRef(0);

  useEffect(() => {
    if (configuredTreeData.length) {
      setLoadedTreeData(configuredTreeData.map(normalizeDepartmentNode));
      return;
    }
    if (remoteLoadedRef.current) return;
    remoteLoadedRef.current = true;
    api
      .getDepartmentRoots()
      .then((nodes) =>
        setLoadedTreeData((nodes as DepartmentTreeNode[]).map(normalizeDepartmentNode)),
      );
  }, [api, configuredTreeData]);

  const trimmedSearchKeyword = searchKeyword.trim();
  const canRemoteSearch =
    showSearch &&
    searchScope === 'all' &&
    trimmedSearchKeyword.length >= searchMinLength &&
    canSearchAllDepartments(api, configuredTreeData);

  useEffect(() => {
    if (!canRemoteSearch) {
      searchSeqRef.current += 1;
      setRemoteSearchResults([]);
      setRemoteSearchLoading(false);
      return;
    }
    const seq = searchSeqRef.current + 1;
    searchSeqRef.current = seq;
    setRemoteSearchLoading(true);
    const timer = window.setTimeout(() => {
      api
        .searchDepartments?.({
          keyword: trimmedSearchKeyword,
          page: 1,
          pageSize: 50,
          includePath: true,
        })
        .then((result) => {
          if (searchSeqRef.current !== seq) return;
          setRemoteSearchResults(normalizeDepartmentSearchItems(result));
        })
        .catch(() => {
          if (searchSeqRef.current !== seq) return;
          setRemoteSearchResults([]);
        })
        .finally(() => {
          if (searchSeqRef.current === seq) {
            setRemoteSearchLoading(false);
          }
        });
    }, searchDebounceMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [api, canRemoteSearch, searchDebounceMs, trimmedSearchKeyword]);

  // 应用范围过滤
  const scopedTreeData = filterTreeByScope(loadedTreeData, scopeType, specifiedDepts);
  const allDepts = flattenDepartments(scopedTreeData);
  const scopedRemoteSearchResults = useMemo(() => {
    if (scopeType !== 'specified' || !specifiedDepts?.length) {
      return remoteSearchResults;
    }
    const specifiedSet = new Set(specifiedDepts);
    return remoteSearchResults.filter((node) => {
      const id = getDepartmentId(node);
      if (specifiedSet.has(id)) return true;
      return node.path?.some((item) => specifiedSet.has(item.id));
    });
  }, [remoteSearchResults, scopeType, specifiedDepts]);
  const remoteDeptMap = useMemo(() => {
    const map = new Map<string, DepartmentSearchNode>();
    scopedRemoteSearchResults.forEach((node) => map.set(getDepartmentId(node), node));
    return map;
  }, [scopedRemoteSearchResults]);

  const handleChange = (selectedValue: any) => {
    const selectedValues = Array.isArray(selectedValue)
      ? selectedValue
      : selectedValue
        ? [selectedValue]
        : [];
    const nextPathMap = { ...selectedPathMap };
    const selected = selectedValues
      .map((item) => {
        const id = String(item?.value ?? item);
        const label = item?.label;
        const remoteDept = remoteDeptMap.get(id);
        const matched =
          remoteDept ??
          allDepts.find((dept) => dept.id === id)?.node ??
          value.find((dept) => getDepartmentId(dept) === id);
        if (remoteDept) {
          nextPathMap[id] = getDepartmentPathText(remoteDept);
        }
        const labelText =
          typeof label === 'string' || typeof label === 'number' ? String(label) : undefined;
        return { id, name: getDepartmentName(matched) || labelText || id };
      })
      .filter((item) => item.id);
    const result = (
      multiple ? selected.slice(0, maxCount ?? selected.length) : selected.slice(0, 1)
    ).map(toDepartmentValue);
    setSelectedPathMap(nextPathMap);
    setFieldValue(fieldId, result);
    onChange?.(result);
  };

  const handlePickerConfirm = (items: Array<{ id: string; name: string; fullPath?: string }>) => {
    setSelectedPathMap((current) => {
      const next = { ...current };
      items.forEach((item) => {
        if ((item as any).fullPath) {
          next[item.id] = String((item as any).fullPath);
        }
      });
      return next;
    });
    const result = (multiple ? items.slice(0, maxCount ?? items.length) : items.slice(0, 1)).map(
      toDepartmentValue,
    );
    setFieldValue(fieldId, result);
    onChange?.(result);
  };

  const treeDataConverted = convertTreeData(scopedTreeData);
  const searchTreeDataConverted = convertSearchTreeData(scopedRemoteSearchResults, showFullPath);
  const renderedTreeData = canRemoteSearch ? searchTreeDataConverted : treeDataConverted;
  const getDisplayLabel = (dept: DepartmentTreeNode) => {
    const id = getDepartmentId(dept);
    if (!showFullPath) return getDepartmentName(dept);
    return (
      getDepartmentFullPath(id, scopedTreeData) ||
      selectedPathMap[id] ||
      (remoteDeptMap.has(id) ? getDepartmentPathText(remoteDeptMap.get(id)) : '') ||
      getDepartmentName(dept)
    );
  };
  const selectValue = multiple
    ? value.map((d) => ({
        value: getDepartmentId(d),
        label: getDisplayLabel(d),
      }))
    : value[0]
      ? {
          value: getDepartmentId(value[0]),
          label: getDisplayLabel(value[0]),
        }
      : undefined;

  return (
    <div className="sy-select-with-picker">
      <TreeSelect
        className={inputClassName}
        style={{ width: '100%' }}
        multiple={multiple}
        maxCount={maxCount}
        allowClear={allowClear}
        labelInValue
        showSearch={showSearch}
        searchValue={searchKeyword}
        onSearch={setSearchKeyword}
        filterTreeNode={canRemoteSearch ? false : undefined}
        treeData={renderedTreeData}
        value={selectValue}
        placeholder={placeholder}
        notFoundContent={
          remoteSearchLoading ? '搜索中...' : notFoundContent || '暂无部门'
        }
        disabled={disabled}
        onChange={handleChange}
        loadData={async (node: any) => {
          if (configuredTreeData.length) return;
          const children = await api.getDepartmentChildren(String(node.value));
          setLoadedTreeData((current) => {
            const attach = (items: DepartmentTreeNode[]): DepartmentTreeNode[] =>
              items.map((item) => {
                const id = getDepartmentId(item);
                if (id === String(node.value)) {
                  return {
                    ...item,
                    children: (children as DepartmentTreeNode[]).map(normalizeDepartmentNode),
                  };
                }
                return item.children ? { ...item, children: attach(item.children) } : item;
              });
            return attach(current);
          });
        }}
        treeDefaultExpandAll={Boolean(configuredTreeData.length)}
        data-testid={`deptselectfield-input-${fieldId}`}
      />
      <button
        type="button"
        className="sy-picker-trigger"
        disabled={disabled}
        onClick={() => setPickerOpen(true)}
        data-testid={`deptselectfield-picker-trigger-${fieldId}`}
      >
        选择
      </button>
      {pickerOpen && (
        <DepartmentPicker
          api={api}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          multiple={multiple}
          value={value}
          treeData={treeData}
          showSearch={showSearch}
          searchScope={searchScope}
          showFullPath={showFullPath}
          searchMinLength={searchMinLength}
          searchDebounceMs={searchDebounceMs}
          onConfirm={handlePickerConfirm}
          onCancel={() => undefined}
        />
      )}
    </div>
  );
}
