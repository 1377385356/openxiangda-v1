import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, Empty, Input, List, Modal, Space, Spin, Tag, Tree } from 'antd';
import type { TreeProps } from 'antd';
import { ApartmentOutlined, SearchOutlined } from '@ant-design/icons';
import * as MobileAntd from 'antd-mobile';
import type { DepartmentSearchScope, DepartmentTreeNode, FormRuntimeApi } from '../../types';
import { getDepartmentId, getDepartmentName } from './fieldFormat';
import {
  canSearchAllDepartments,
  getDepartmentPathText,
  normalizeDepartmentSearchItems,
  type DepartmentSearchNode,
} from './departmentSearch';
import { useLazyDepartmentTree, type LazyDepartmentNode } from './useLazyDepartmentTree';

const getMobileComponent = (name: string) => {
  try {
    return (MobileAntd as any)[name];
  } catch {
    return undefined;
  }
};

export interface DepartmentValue {
  id: string;
  name: string;
  fullPath?: string;
}

interface DepartmentPickerPanelProps {
  api: FormRuntimeApi;
  multiple?: boolean;
  value: DepartmentValue[];
  treeData?: DepartmentTreeNode[];
  onConfirm: (items: DepartmentValue[]) => void;
  onCancel: () => void;
  mobile?: boolean;
  showSearch?: boolean;
  searchScope?: DepartmentSearchScope;
  showFullPath?: boolean;
  searchMinLength?: number;
  searchDebounceMs?: number;
}

function normalizeSelection(items: DepartmentValue[]) {
  return items
    .map((item) => ({
      id: String(item.id || ''),
      name: String(item.name || item.id || ''),
      fullPath: item.fullPath,
    }))
    .filter((item) => item.id);
}

function matchSearch(nodes: LazyDepartmentNode[], keyword: string): LazyDepartmentNode[] {
  if (!keyword) return nodes;
  const lower = keyword.toLowerCase();
  return nodes
    .map((node) => {
      const name = getDepartmentName(node);
      const children = node.children ? matchSearch(node.children, keyword) : undefined;
      if (name.toLowerCase().includes(lower) || children?.length) {
        return { ...node, children };
      }
      return null;
    })
    .filter(Boolean) as LazyDepartmentNode[];
}

export function DepartmentPickerPanel({
  api,
  multiple = false,
  value,
  treeData,
  onConfirm,
  onCancel,
  mobile = false,
  showSearch = true,
  searchScope = 'loaded',
  showFullPath = false,
  searchMinLength = 1,
  searchDebounceMs = 300,
}: DepartmentPickerPanelProps) {
  const {
    treeData: loadedTreeData,
    treeLoading,
    nodeMap,
    parentMap,
    flatNodes,
    loadChildren,
  } = useLazyDepartmentTree(api, treeData);
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<DepartmentValue[]>(() => normalizeSelection(value));
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [currentDeptId, setCurrentDeptId] = useState<string | null>(null);
  const [remoteSearchResults, setRemoteSearchResults] = useState<DepartmentSearchNode[]>([]);
  const [remoteSearchLoading, setRemoteSearchLoading] = useState(false);
  const [remoteSearchError, setRemoteSearchError] = useState('');
  const searchSeqRef = useRef(0);
  const selectedIds = selected.map((item) => item.id);
  const MobileSearchBar = getMobileComponent('SearchBar');
  const trimmedKeyword = keyword.trim();
  const canRemoteSearch =
    showSearch &&
    searchScope === 'all' &&
    trimmedKeyword.length >= searchMinLength &&
    canSearchAllDepartments(api, treeData);
  const spinning = treeLoading || remoteSearchLoading;

  useEffect(() => {
    if (!canRemoteSearch) {
      searchSeqRef.current += 1;
      setRemoteSearchResults([]);
      setRemoteSearchLoading(false);
      setRemoteSearchError('');
      return;
    }
    const seq = searchSeqRef.current + 1;
    searchSeqRef.current = seq;
    setRemoteSearchLoading(true);
    setRemoteSearchError('');
    const timer = window.setTimeout(() => {
      api
        .searchDepartments?.({
          keyword: trimmedKeyword,
          page: 1,
          pageSize: 50,
          includePath: true,
        })
        .then((result) => {
          if (searchSeqRef.current !== seq) return;
          setRemoteSearchResults(normalizeDepartmentSearchItems(result));
        })
        .catch((error) => {
          if (searchSeqRef.current !== seq) return;
          setRemoteSearchResults([]);
          setRemoteSearchError(error?.message || '搜索失败');
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
  }, [api, canRemoteSearch, searchDebounceMs, trimmedKeyword]);

  const filteredTreeData = useMemo(
    () => (showSearch ? matchSearch(loadedTreeData, trimmedKeyword) : loadedTreeData),
    [loadedTreeData, showSearch, trimmedKeyword],
  );

  const currentPath = useMemo(() => {
    if (!currentDeptId) return [];
    const path: DepartmentValue[] = [];
    let cursor: string | null = currentDeptId;
    while (cursor) {
      const node = nodeMap.get(cursor);
      if (!node) break;
      path.unshift({ id: cursor, name: getDepartmentName(node) });
      cursor = parentMap.get(cursor) ?? null;
    }
    return path;
  }, [currentDeptId, nodeMap, parentMap]);

  const mobileList = useMemo(() => {
    if (canRemoteSearch) {
      return remoteSearchResults;
    }
    if (showSearch && trimmedKeyword) {
      const lower = trimmedKeyword.toLowerCase();
      return flatNodes
        .filter((item) => item.name.toLowerCase().includes(lower))
        .map((item) => item.node);
    }
    if (!currentDeptId) return loadedTreeData;
    return nodeMap.get(currentDeptId)?.children || [];
  }, [
    canRemoteSearch,
    currentDeptId,
    flatNodes,
    loadedTreeData,
    nodeMap,
    remoteSearchResults,
    showSearch,
    trimmedKeyword,
  ]);

  const getNodeValue = (node: LazyDepartmentNode | DepartmentSearchNode): DepartmentValue => {
    const id = getDepartmentId(node);
    const name = getDepartmentName(node);
    const fullPath = getDepartmentPathText(node);
    return {
      id,
      name,
      ...(fullPath && fullPath !== name ? { fullPath } : {}),
    };
  };

  const getSelectedLabel = (item: DepartmentValue) =>
    showFullPath ? item.fullPath || item.name : item.name;

  const upsertSelected = (department: DepartmentValue, checked: boolean) => {
    if (multiple) {
      setSelected((prev) => {
        if (checked) {
          return prev.some((item) => item.id === department.id) ? prev : [...prev, department];
        }
        return prev.filter((item) => item.id !== department.id);
      });
      return;
    }
    setSelected(checked ? [department] : []);
  };

  const handleTreeCheck: TreeProps['onCheck'] = (keys) => {
    const checkedKeys = Array.isArray(keys) ? keys : keys.checked;
    const next = checkedKeys
      .map((key) => {
        const node = nodeMap.get(String(key));
        return node ? getNodeValue(node) : undefined;
      })
      .filter(Boolean) as DepartmentValue[];
    setSelected(next);
  };

  const handleTreeSelect: TreeProps['onSelect'] = (keys) => {
    const id = String(keys[0] || '');
    const node = id ? nodeMap.get(id) : undefined;
    setSelected(node ? [getNodeValue(node)] : []);
  };

  const renderSelected = () => (
    <div className="sy-org-picker-selected">
      <div className="sy-org-picker-selected-head">
        <span>已选 {selected.length}</span>
        <button type="button" onClick={() => setSelected([])} disabled={!selected.length}>
          清空
        </button>
      </div>
      {selected.length ? (
        <div className="sy-org-picker-tags">
          {selected.map((item) => (
            <Tag key={item.id} closable onClose={() => upsertSelected(item, false)}>
              {getSelectedLabel(item)}
            </Tag>
          ))}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无选择" />
      )}
    </div>
  );

  const renderRemoteSearchResults = () => (
    <List
      dataSource={remoteSearchResults}
      locale={{ emptyText: remoteSearchError || '暂无部门' }}
      renderItem={(node) => {
        const id = getDepartmentId(node);
        const name = getDepartmentName(node);
        const selectedNow = selectedIds.includes(id);
        const pathText = getDepartmentPathText(node);
        return (
          <List.Item
            key={id}
            onClick={() => upsertSelected(getNodeValue(node), true)}
            actions={[
              <Checkbox
                key="select"
                checked={selectedNow}
                onChange={(event) => upsertSelected(getNodeValue(node), event.target.checked)}
              />,
            ]}
          >
            <List.Item.Meta
              avatar={<ApartmentOutlined />}
              title={
                <span>
                  <span>{name}</span>
                  {showFullPath && pathText && pathText !== name ? (
                    <span className="sy-org-picker-path"> {pathText}</span>
                  ) : null}
                </span>
              }
            />
          </List.Item>
        );
      }}
    />
  );

  if (mobile) {
    return (
      <div className="sy-org-picker sy-org-picker-mobile">
        <div className="sy-org-picker-mobile-head">
          <button type="button" onClick={onCancel}>
            取消
          </button>
          <strong>选择部门</strong>
          <button type="button" onClick={() => onConfirm(selected)}>
            确定
          </button>
        </div>
        {showSearch ? (
          MobileSearchBar ? (
            <MobileSearchBar placeholder="搜索部门" value={keyword} onChange={setKeyword} />
          ) : (
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          )
        ) : null}
        <div className="sy-org-picker-breadcrumb">
          <button type="button" onClick={() => setCurrentDeptId(null)}>
            部门
          </button>
          {currentPath.map((item) => (
            <button key={item.id} type="button" onClick={() => setCurrentDeptId(item.id)}>
              / {item.name}
            </button>
          ))}
        </div>
        <Spin spinning={spinning}>
          <List
            dataSource={mobileList}
            locale={{ emptyText: remoteSearchError || '暂无部门' }}
            renderItem={(node) => {
              const id = getDepartmentId(node);
              const name = getDepartmentName(node);
              const selectedNow = selectedIds.includes(id);
              const hasChildren = !canRemoteSearch && Boolean(node.hasChildren && !node.isLeaf);
              const pathText = getDepartmentPathText(node);
              return (
                <List.Item
                  key={id}
                  actions={[
                    <Checkbox
                      key="select"
                      checked={selectedNow}
                      onChange={(event) => upsertSelected(getNodeValue(node), event.target.checked)}
                    />,
                    hasChildren ? (
                      <button
                        key="children"
                        type="button"
                        onClick={async () => {
                          await loadChildren(id);
                          setCurrentDeptId(id);
                          setKeyword('');
                        }}
                      >
                        下级
                      </button>
                    ) : null,
                  ]}
                >
                  <List.Item.Meta
                    avatar={<ApartmentOutlined />}
                    title={
                      <span>
                        <span>{name}</span>
                        {showFullPath && pathText && pathText !== name ? (
                          <span className="sy-org-picker-path"> {pathText}</span>
                        ) : null}
                      </span>
                    }
                  />
                </List.Item>
              );
            }}
          />
        </Spin>
        {renderSelected()}
      </div>
    );
  }

  return (
    <div className="sy-org-picker">
      <div className="sy-org-picker-main">
        <div className="sy-org-picker-tree">
          {showSearch ? (
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索部门"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          ) : null}
          <Spin spinning={spinning}>
            {canRemoteSearch ? (
              renderRemoteSearchResults()
            ) : (
              <Tree
                checkable={multiple}
                checkedKeys={multiple ? selectedIds : undefined}
                selectedKeys={multiple ? undefined : selectedIds}
                expandedKeys={expandedKeys}
                onExpand={setExpandedKeys}
                onCheck={multiple ? handleTreeCheck : undefined}
                onSelect={multiple ? undefined : handleTreeSelect}
                loadData={(node) => loadChildren(String(node.key))}
                treeData={filteredTreeData}
                height={480}
              />
            )}
          </Spin>
        </div>
        {renderSelected()}
      </div>
      <div className="sy-org-picker-footer">
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" onClick={() => onConfirm(selected)}>
            确定
          </Button>
        </Space>
      </div>
    </div>
  );
}

export interface DepartmentPickerProps extends Omit<DepartmentPickerPanelProps, 'mobile'> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mobile?: boolean;
}

export function DepartmentPicker({
  open,
  onOpenChange,
  mobile,
  onCancel,
  ...panelProps
}: DepartmentPickerProps) {
  const handleCancel = () => {
    onOpenChange(false);
    onCancel();
  };
  const panel = (
    <DepartmentPickerPanel
      {...panelProps}
      mobile={mobile}
      onCancel={handleCancel}
      onConfirm={(items) => {
        panelProps.onConfirm(items);
        onOpenChange(false);
      }}
    />
  );

  if (mobile) {
    const MobilePopup = getMobileComponent('Popup');
    if (!MobilePopup) return open ? panel : null;
    return (
      <MobilePopup
        visible={open}
        onMaskClick={handleCancel}
        destroyOnClose
        bodyStyle={{ height: '90vh' }}
      >
        {panel}
      </MobilePopup>
    );
  }

  return (
    <Modal
      title="选择部门"
      open={open}
      onCancel={handleCancel}
      footer={null}
      width="min(760px, calc(100vw - 48px))"
      destroyOnClose
    >
      {panel}
    </Modal>
  );
}
