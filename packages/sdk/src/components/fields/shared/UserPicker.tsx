import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Button,
  Checkbox,
  Empty,
  Input,
  List,
  Modal,
  Pagination,
  Space,
  Spin,
  Tag,
  Tree,
} from 'antd';
import { SearchOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import * as MobileAntd from 'antd-mobile';
import type {
  DepartmentTreeNode,
  FormRuntimeApi,
  UserDisplayFormat,
  UserItem,
} from '../../types';
import {
  formatUserDisplay,
  getDepartmentId,
  getDepartmentName,
  getUserId,
  getUserName,
  normalizeUser,
} from './fieldFormat';
import { useLazyDepartmentTree } from './useLazyDepartmentTree';

const DEFAULT_MEMBER_PAGE_SIZE = 10;

const getMobileComponent = (name: string) => {
  try {
    return (MobileAntd as any)[name];
  } catch {
    return undefined;
  }
};

interface UserPickerPanelProps {
  api: FormRuntimeApi;
  multiple?: boolean;
  value: UserItem[];
  dataSource?: UserItem[];
  treeData?: DepartmentTreeNode[];
  displaySearch?: boolean;
  displayFormat?: UserDisplayFormat;
  loadAllWhenNoDepartment?: boolean;
  onConfirm: (items: UserItem[]) => void;
  onCancel: () => void;
  mobile?: boolean;
}

function normalizeUsers(users?: UserItem[]) {
  return (users || []).map(normalizeUser).filter((user) => getUserId(user));
}

export function UserPickerPanel({
  api,
  multiple = true,
  value,
  dataSource,
  treeData,
  displaySearch = true,
  displayFormat,
  loadAllWhenNoDepartment = true,
  onConfirm,
  onCancel,
  mobile = false,
}: UserPickerPanelProps) {
  const {
    treeData: deptTreeData,
    treeLoading,
    nodeMap,
    parentMap,
    flatNodes,
    loadChildren,
  } = useLazyDepartmentTree(api, treeData);
  const [departmentKeyword, setDepartmentKeyword] = useState('');
  const [memberKeyword, setMemberKeyword] = useState('');
  const [mobileKeyword, setMobileKeyword] = useState('');
  const [currentDeptId, setCurrentDeptId] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [members, setMembers] = useState<UserItem[]>(() => normalizeUsers(dataSource));
  const [memberPage, setMemberPage] = useState(1);
  const [memberPageSize, setMemberPageSize] = useState(DEFAULT_MEMBER_PAGE_SIZE);
  const [memberTotal, setMemberTotal] = useState(() => normalizeUsers(dataSource).length);
  const [memberReloadKey, setMemberReloadKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<UserItem[]>(() => normalizeUsers(value));
  const selectedIds = selected.map(getUserId);
  const MobileSearchBar = getMobileComponent('SearchBar');
  const activeMemberKeyword = (mobile ? mobileKeyword : memberKeyword).trim();
  const staticUsers = useMemo(() => normalizeUsers(dataSource), [dataSource]);
  const hasStaticUserSource = staticUsers.length > 0;

  useEffect(() => {
    if (mobile) return;
    if (currentDeptId || deptTreeData.length === 0) return;
    setExpandedKeys(deptTreeData.map((node) => getDepartmentId(node)));
    if (loadAllWhenNoDepartment) {
      setCurrentDeptId(getDepartmentId(deptTreeData[0]));
    }
  }, [currentDeptId, deptTreeData, loadAllWhenNoDepartment, mobile]);

  useEffect(() => {
    setMemberPage(1);
  }, [activeMemberKeyword, currentDeptId, dataSource, mobile]);

  const handleDepartmentSelect = useCallback((deptId: string) => {
    const nextDeptId = String(deptId || '');
    setCurrentDeptId(nextDeptId);
    setMemberKeyword('');
    setMemberPage(1);
    setMemberReloadKey((current) => current + 1);
  }, []);

  useEffect(() => {
    let active = true;
    const keyword = activeMemberKeyword;
    if (hasStaticUserSource) {
      const lower = keyword.toLowerCase();
      const filtered = staticUsers.filter((user) =>
        keyword
          ? [getUserName(user), user.jobNumber]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(lower))
          : true,
      );
      const start = (memberPage - 1) * memberPageSize;
      setMembers(filtered.slice(start, start + memberPageSize));
      setMemberTotal(filtered.length);
      setLoading(false);
      return;
    }
    if (!loadAllWhenNoDepartment && !keyword && !currentDeptId) {
      setMembers([]);
      setMemberTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(
      () => {
        const pageParams = { page: memberPage, pageSize: memberPageSize };
        const request = keyword
          ? api
              .getUserList({
                keyword,
                name: keyword,
                username: keyword,
                ...pageParams,
              })
              .then((users) => ({
                items: users,
                total: Array.isArray(users) ? users.length : 0,
                ...pageParams,
              }))
          : currentDeptId
            ? api.getDepartmentMembersPage
              ? api.getDepartmentMembersPage(currentDeptId, pageParams)
              : api.getDepartmentMembers(currentDeptId).then((users) => ({
                  items: users,
                  total: users.length,
                  ...pageParams,
                }))
            : api.getUserList(pageParams).then((users) => ({
                items: users,
                total: Array.isArray(users) ? users.length : 0,
                ...pageParams,
              }));
        request
          .then((result) => {
            if (!active) return;
            const items = Array.isArray(result) ? result : result.items;
            setMembers(normalizeUsers(items as UserItem[]));
            setMemberTotal(Number(Array.isArray(result) ? result.length : result.total) || 0);
          })
          .catch(() => {
            if (active) {
              setMembers([]);
              setMemberTotal(0);
            }
          })
          .finally(() => {
            if (active) setLoading(false);
          });
      },
      keyword ? 250 : 0,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    activeMemberKeyword,
    api,
    currentDeptId,
    hasStaticUserSource,
    loadAllWhenNoDepartment,
    memberPage,
    memberPageSize,
    memberReloadKey,
    staticUsers,
  ]);

  const currentPath = useMemo(() => {
    if (!currentDeptId) return [];
    const path: Array<{ id: string; name: string }> = [];
    let cursor: string | null = currentDeptId;
    while (cursor) {
      const node = nodeMap.get(cursor);
      if (!node) break;
      path.unshift({ id: cursor, name: getDepartmentName(node) });
      cursor = parentMap.get(cursor) ?? null;
    }
    return path;
  }, [currentDeptId, nodeMap, parentMap]);

  const mobileDepartments = useMemo(() => {
    const keyword = mobileKeyword.trim().toLowerCase();
    if (keyword) {
      return flatNodes
        .filter((item) => item.name.toLowerCase().includes(keyword))
        .map((item) => item.node);
    }
    if (!currentDeptId) return deptTreeData;
    return nodeMap.get(currentDeptId)?.children || [];
  }, [currentDeptId, deptTreeData, flatNodes, mobileKeyword, nodeMap]);

  const toggleUser = (user: UserItem, checked: boolean) => {
    const normalized = normalizeUser(user);
    const id = getUserId(normalized);
    if (!id) return;
    if (multiple) {
      setSelected((prev) => {
        if (checked)
          return prev.some((item) => getUserId(item) === id) ? prev : [...prev, normalized];
        return prev.filter((item) => getUserId(item) !== id);
      });
      return;
    }
    setSelected(checked ? [normalized] : []);
  };

  const renderSelected = () => (
    <div className="sy-user-picker-selected">
      <div className="sy-org-picker-selected-head">
        <span>已选 {selected.length} 人</span>
        <button type="button" onClick={() => setSelected([])} disabled={!selected.length}>
          清空
        </button>
      </div>
      {selected.length ? (
        <div className="sy-org-picker-tags">
          {selected.map((item) => (
            <Tag key={getUserId(item)} closable onClose={() => toggleUser(item, false)}>
              {formatUserDisplay(item, displayFormat)}
            </Tag>
          ))}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无选择" />
      )}
    </div>
  );

  const renderMemberList = () => (
    <div className="sy-user-picker-member-panel">
      <Spin spinning={loading} wrapperClassName="sy-user-picker-member-spin">
        <div className="sy-user-picker-list">
          <List
            dataSource={members}
            locale={{ emptyText: '暂无成员' }}
            renderItem={(user) => {
              const id = getUserId(user);
              const checked = selectedIds.includes(id);
              return (
                <List.Item key={id}>
                  <label className="sy-user-picker-row">
                    <Checkbox
                      checked={checked}
                      onChange={(event) => toggleUser(user, event.target.checked)}
                    />
                    <Avatar size={36} src={user.avatar} icon={!user.avatar && <UserOutlined />} />
                    <span>{formatUserDisplay(user, displayFormat)}</span>
                  </label>
                </List.Item>
              );
            }}
          />
        </div>
        <div className="sy-user-picker-pagination">
          <span>共 {memberTotal} 人</span>
          <Pagination
            size="small"
            current={memberPage}
            pageSize={memberPageSize}
            total={memberTotal}
            showSizeChanger
            pageSizeOptions={[10, 20, 50, 100]}
            onChange={(page, pageSize) => {
              setMemberPage(page);
              setMemberPageSize(pageSize);
            }}
          />
        </div>
      </Spin>
    </div>
  );

  if (mobile) {
    return (
      <div className="sy-user-picker sy-user-picker-mobile">
        <div className="sy-org-picker-mobile-head">
          <button type="button" onClick={onCancel}>
            取消
          </button>
          <strong>选择成员</strong>
          <button type="button" onClick={() => onConfirm(selected)}>
            确定
          </button>
        </div>
        {MobileSearchBar ? (
          <MobileSearchBar
            placeholder="搜索部门或成员"
            value={mobileKeyword}
            onChange={setMobileKeyword}
          />
        ) : (
          <input value={mobileKeyword} onChange={(event) => setMobileKeyword(event.target.value)} />
        )}
        <div className="sy-org-picker-breadcrumb">
          <button type="button" onClick={() => handleDepartmentSelect('')}>
            通讯录
          </button>
          {currentPath.map((item) => (
            <button key={item.id} type="button" onClick={() => handleDepartmentSelect(item.id)}>
              / {item.name}
            </button>
          ))}
        </div>
        <Spin spinning={treeLoading}>
          <List
            dataSource={mobileDepartments}
            locale={{ emptyText: null }}
            renderItem={(node) => {
              const id = getDepartmentId(node);
              return (
                <List.Item
                  key={id}
                  onClick={async () => {
                    await loadChildren(id);
                    handleDepartmentSelect(id);
                    setMobileKeyword('');
                  }}
                >
                  <List.Item.Meta avatar={<TeamOutlined />} title={getDepartmentName(node)} />
                </List.Item>
              );
            }}
          />
        </Spin>
        {renderMemberList()}
        {renderSelected()}
      </div>
    );
  }

  const lowerDepartmentKeyword = departmentKeyword.trim().toLowerCase();
  const filteredTreeData = lowerDepartmentKeyword
    ? deptTreeData.filter((node) =>
        getDepartmentName(node).toLowerCase().includes(lowerDepartmentKeyword),
      )
    : deptTreeData;

  return (
    <div className="sy-user-picker">
      <div className="sy-user-picker-main">
        <div className="sy-user-picker-depts">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索部门"
            value={departmentKeyword}
            onChange={(event) => setDepartmentKeyword(event.target.value)}
          />
          <Spin spinning={treeLoading}>
            <Tree
              selectedKeys={currentDeptId ? [currentDeptId] : []}
              expandedKeys={expandedKeys}
              onExpand={setExpandedKeys}
              onSelect={(keys, info: any) =>
                handleDepartmentSelect(String(info?.node?.key || keys[0] || ''))
              }
              loadData={(node) => loadChildren(String(node.key))}
              treeData={filteredTreeData}
              height={460}
            />
          </Spin>
        </div>
        <div className="sy-user-picker-members">
          {displaySearch && (
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索成员"
              value={memberKeyword}
              onChange={(event) => setMemberKeyword(event.target.value)}
            />
          )}
          {renderMemberList()}
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

export interface UserPickerProps extends Omit<UserPickerPanelProps, 'mobile'> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mobile?: boolean;
}

export function UserPicker({
  open,
  onOpenChange,
  mobile,
  onCancel,
  ...panelProps
}: UserPickerProps) {
  const handleCancel = () => {
    onOpenChange(false);
    onCancel();
  };
  const panel = (
    <UserPickerPanel
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
      title="选择成员"
      open={open}
      onCancel={handleCancel}
      footer={null}
      width="min(980px, calc(100vw - 48px))"
      destroyOnClose
    >
      {panel}
    </Modal>
  );
}
