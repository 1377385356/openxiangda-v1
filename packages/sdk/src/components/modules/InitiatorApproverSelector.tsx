import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Empty, Modal, Select, Space, Tag, Typography, message } from 'antd';
import type {
  FormRuntimeApi,
  InitiatorSelectCandidate,
  InitiatorSelectRequirement,
} from '../types';
import { getInitiatorSelectCandidates } from '../core/processApi';
import { UserPicker } from '../fields/shared/UserPicker';

export type SelectedApproverMap = Record<string, InitiatorSelectCandidate[]>;

interface InitiatorApproverSelectorProps {
  open: boolean;
  formUuid: string;
  appType: string;
  api: FormRuntimeApi;
  requirements: InitiatorSelectRequirement[];
  value?: SelectedApproverMap;
  onOk: (selected: SelectedApproverMap) => void;
  onCancel: () => void;
}

interface RequirementSelectProps {
  open: boolean;
  formUuid: string;
  appType: string;
  api: FormRuntimeApi;
  requirement: InitiatorSelectRequirement;
  selectedUsers: InitiatorSelectCandidate[];
  onChange: (nodeId: string, users: InitiatorSelectCandidate[]) => void;
}

const scopeText: Record<InitiatorSelectRequirement['scope'], string> = {
  all: '全部成员',
  members: '指定成员',
  roles: '指定角色',
};

const EMPTY_SELECTED_USERS: InitiatorSelectCandidate[] = [];
const EMPTY_SELECTED_MAP: SelectedApproverMap = {};

const getUserId = (user: any) =>
  String(user?.id ?? user?.userId ?? user?.userid ?? user?.value ?? '').trim();

const normalizeCandidate = (user: any): InitiatorSelectCandidate | null => {
  const id = getUserId(user);
  if (!id) return null;
  return {
    ...user,
    id,
    name: String(user?.name ?? user?.label ?? user?.username ?? id),
  };
};

const getUserLabel = (user: InitiatorSelectCandidate) => user.name || user.username || user.id;

const mergeUsers = (current: InitiatorSelectCandidate[], incoming: InitiatorSelectCandidate[]) => {
  const map = new Map<string, InitiatorSelectCandidate>();
  current.forEach((user) => map.set(user.id, user));
  incoming.forEach((user) => map.set(user.id, user));
  return Array.from(map.values());
};

const RequirementSelect: React.FC<RequirementSelectProps> = ({
  open,
  formUuid,
  appType,
  api,
  requirement,
  selectedUsers,
  onChange,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const initialCandidates = useMemo(
    () =>
      (requirement.candidateUsers || [])
        .map(normalizeCandidate)
        .filter(Boolean) as InitiatorSelectCandidate[],
    [requirement.candidateUsers],
  );
  const [optionsSource, setOptionsSource] = useState<InitiatorSelectCandidate[]>(initialCandidates);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setOptionsSource((current) =>
      mergeUsers(initialCandidates, mergeUsers(current, selectedUsers)),
    );
  }, [initialCandidates, selectedUsers]);

  const loadCandidates = useCallback(
    async (keyword?: string) => {
      setLoading(true);
      try {
        const result = await getInitiatorSelectCandidates(api.request, {
          formUuid,
          appType,
          nodeId: requirement.nodeId,
          keyword,
          page: 1,
          pageSize: 50,
        });
        setOptionsSource((current) =>
          mergeUsers(
            current,
            result.items.map(normalizeCandidate).filter(Boolean) as InitiatorSelectCandidate[],
          ),
        );
      } catch {
        if (requirement.scope === 'all' && typeof api.getUserList === 'function') {
          const users = await api.getUserList(
            keyword ? { name: keyword, username: keyword } : undefined,
          );
          setOptionsSource((current) =>
            mergeUsers(
              current,
              users.map(normalizeCandidate).filter(Boolean) as InitiatorSelectCandidate[],
            ),
          );
        } else if (initialCandidates.length === 0) {
          message.error('加载审批候选人失败');
        }
      } finally {
        setLoading(false);
      }
    },
    [api, appType, formUuid, initialCandidates.length, requirement.nodeId, requirement.scope],
  );

  useEffect(() => {
    if (requirement.scope !== 'all' && open && formUuid && appType && requirement.nodeId) {
      void loadCandidates();
    }
  }, [appType, formUuid, loadCandidates, open, requirement.nodeId, requirement.scope]);

  const options = useMemo(
    () =>
      optionsSource.map((user) => ({
        value: user.id,
        label: getUserLabel(user),
      })),
    [optionsSource],
  );

  if (requirement.scope === 'all') {
    return (
      <div className="rounded-lg border border-ant-border-secondary bg-ant-bg-container p-3">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <Typography.Text strong>{requirement.nodeName}</Typography.Text>
            <div className="mt-1 text-xs text-ant-color-text-tertiary">
              选择范围：{scopeText[requirement.scope] || '全部成员'}
            </div>
          </div>
          <Button onClick={() => setPickerOpen(true)}>
            {selectedUsers.length > 0 ? '重新选择成员' : '选择成员'}
          </Button>
        </div>
        {selectedUsers.length > 0 ? (
          <Space size={[4, 4]} wrap className="mt-2">
            {selectedUsers.map((user) => (
              <Tag key={user.id}>{getUserLabel(user)}</Tag>
            ))}
          </Space>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请从组织架构选择成员" />
        )}
        <UserPicker
          api={api}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          multiple
          value={selectedUsers}
          loadAllWhenNoDepartment={false}
          onConfirm={(items) => {
            onChange(
              requirement.nodeId,
              items.map(normalizeCandidate).filter(Boolean) as InitiatorSelectCandidate[],
            );
          }}
          onCancel={() => undefined}
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-ant-border-secondary bg-ant-bg-container p-3">
      <div className="mb-2">
        <Typography.Text strong>{requirement.nodeName}</Typography.Text>
        <div className="mt-1 text-xs text-ant-color-text-tertiary">
          选择范围：{scopeText[requirement.scope] || '全部成员'}
        </div>
      </div>
      <Select
        mode="multiple"
        className="w-full"
        allowClear
        showSearch
        filterOption={false}
        placeholder="请选择审批人"
        loading={loading}
        value={selectedUsers.map((user) => user.id)}
        options={options}
        notFoundContent={loading ? '加载中...' : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
        onSearch={(keyword) => {
          void loadCandidates(keyword);
        }}
        onChange={(ids: string[]) => {
          const next = ids
            .map(
              (id) =>
                optionsSource.find((user) => user.id === id) ||
                selectedUsers.find((user) => user.id === id),
            )
            .filter(Boolean) as InitiatorSelectCandidate[];
          onChange(requirement.nodeId, next);
        }}
      />
      {selectedUsers.length > 0 ? (
        <Space size={[4, 4]} wrap className="mt-2">
          {selectedUsers.map((user) => (
            <Tag key={user.id}>{getUserLabel(user)}</Tag>
          ))}
        </Space>
      ) : null}
    </div>
  );
};

export const InitiatorApproverSelector: React.FC<InitiatorApproverSelectorProps> = ({
  open,
  formUuid,
  appType,
  api,
  requirements,
  value,
  onOk,
  onCancel,
}) => {
  const [selected, setSelected] = useState<SelectedApproverMap>({});
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setSelected(value || EMPTY_SELECTED_MAP);
    }
    wasOpenRef.current = open;
  }, [open, value]);

  const missingNodes = requirements.filter(
    (requirement) => !(selected[requirement.nodeId] || []).length,
  );

  return (
    <Modal
      getContainer={false}
      title="选择审批人"
      open={open}
      width={760}
      okText="确定"
      cancelText="取消"
      onCancel={onCancel}
      onOk={() => {
        if (missingNodes.length > 0) {
          message.error('请为所有发起人自选节点选择审批人');
          return;
        }
        onOk(selected);
      }}
      destroyOnHidden
    >
      <Space direction="vertical" size={12} className="w-full">
        {requirements.map((requirement) => (
          <RequirementSelect
            key={requirement.nodeId}
            open={open}
            formUuid={formUuid}
            appType={appType}
            api={api}
            requirement={requirement}
            selectedUsers={selected[requirement.nodeId] ?? EMPTY_SELECTED_USERS}
            onChange={(nodeId, users) =>
              setSelected((current) => ({ ...current, [nodeId]: users }))
            }
          />
        ))}
      </Space>
    </Modal>
  );
};

export default InitiatorApproverSelector;
