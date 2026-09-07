import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TableProps } from 'antd';
import {
  Alert,
  Button,
  Cascader,
  Checkbox,
  ConfigProvider,
  DatePicker,
  Divider,
  Drawer,
  Dropdown,
  Empty,
  Input,
  InputNumber,
  Modal,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Upload,
  message,
} from 'antd';
import dayjs from 'dayjs';
import {
  DeleteOutlined,
  DownloadOutlined,
  FilterOutlined,
  HistoryOutlined,
  ImportOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import type { FormRuntimeApi, FormRuntimeApiConfig, FormSchema } from '../types';
import { createFormRuntimeApi } from '../core/runtimeApi';
import { StandardFormPage } from '../templates/StandardFormPage';
import {
  advancedSearchDataManagement,
  batchApproveDataManagementRows,
  deleteDataManagementRows,
  downloadDataManagementImportTemplate,
  exportDataManagementRows,
  FORM_ACTION_PERMISSIONS,
  getDataManagementConfig,
  getDataManagementActionSummary,
  getDataManagementSchema,
  getDataManagementTransferRecords,
  getSystemFieldsForFormType,
  importDataManagementRows,
  importPreviewDataManagementRows,
  normalizeColumnConfig,
  normalizeDataManagementFields,
  saveDataManagementConfig,
  type DataManagementConfig,
  type DataManagementConfigScope,
  type DataManagementDensity,
  type DataManagementField,
  type DataManagementFilterGroup,
  type DataManagementFilterRule,
  type DataManagementSort,
  type DataManagementActionSummary,
  type FormActionPermission,
} from '../core/dataManagementApi';
import { confirmAction } from '../utils/confirmAction';
import { antdChineseLocale, antdDatePickerChineseLocale } from '../utils/dateLocale';

type DetailRenderer = (props: {
  record: any;
  formInstanceId?: string;
  onClose: () => void;
}) => React.ReactNode;

type DetailPageUrlBuilder = (props: { record: any; formInstanceId: string }) => string | undefined;

type SubmitRenderer = (props: { onClose: () => void; onSubmitted: () => void }) => React.ReactNode;

type DataManagementFetchState = {
  current?: number;
  pageSize?: number;
  searchKeyWord?: string;
  filterGroup?: DataManagementFilterGroup;
  sort?: DataManagementSort[];
};

export interface DataManagementRowAction {
  key: string;
  label: string;
  danger?: boolean;
  requiredAction?: FormActionPermission;
  onClick: (record: any) => void;
}

export type DataManagementPermissionMode = 'auto' | 'manual' | 'off';

export type DataManagementActionOverrides = Partial<Record<FormActionPermission, boolean>>;

export interface DataManagementListProps {
  appType: string;
  formUuid: string;
  detailBasePath?: string;
  menuFormUuid?: string;
  readonly?: boolean;
  fullHeight?: boolean;
  configScope?: DataManagementConfigScope;
  title?: string;
  formTitle?: string;
  formType?: string;
  schema?: FormSchema;
  components?: Record<string, React.ComponentType<any>>;
  forcedConfig?: DataManagementConfig;
  showForcedConfig?: boolean;
  detailRenderer?: DetailRenderer;
  detailPageUrlBuilder?: DetailPageUrlBuilder;
  submitRenderer?: SubmitRenderer;
  requestOverride?: FormRuntimeApi['request'] | FormRuntimeApiConfig;
  allowSchemaFallback?: boolean;
  rowActions?: DataManagementRowAction[];
  maxVisibleRowActions?: number;
  permissionMode?: DataManagementPermissionMode;
  actionOverrides?: DataManagementActionOverrides;
}

type RenderableRowAction = {
  key: string;
  label: React.ReactNode;
  danger?: boolean;
  icon?: React.ReactNode;
  onClick: () => void;
};

const DEFAULT_MAX_VISIBLE_ROW_ACTIONS = 4;
const ACTION_COLUMN_MIN_WIDTH = 96;
const ACTION_BUTTON_ESTIMATED_WIDTH = 56;
const ACTION_MORE_BUTTON_WIDTH = 36;
const ACTION_COLUMN_HORIZONTAL_PADDING = 24;

function normalizeMaxVisibleRowActions(maxVisibleRowActions: number | undefined) {
  if (typeof maxVisibleRowActions !== 'number' || !Number.isFinite(maxVisibleRowActions)) {
    return DEFAULT_MAX_VISIBLE_ROW_ACTIONS;
  }
  return Math.max(0, Math.floor(maxVisibleRowActions));
}

const createGroup = (): DataManagementFilterGroup => ({
  id: `group_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  logic: 'AND',
  rules: [],
  conditions: [],
});

const operatorAliases: Record<string, string> = {
  contains: 'CONTAINS',
  like: 'CONTAINS',
  eq: 'EQ',
  ne: 'NEQ',
  neq: 'NEQ',
  gt: 'GT',
  gte: 'GTE',
  ge: 'GTE',
  lt: 'LT',
  lte: 'LTE',
  le: 'LTE',
  between: 'BETWEEN',
  in: 'IN',
  not_contains: 'NOT_CONTAINS',
  empty: 'IS_NULL',
  notEmpty: 'IS_NOT_NULL',
  not_empty: 'IS_NOT_NULL',
  is_null: 'IS_NULL',
  is_not_null: 'IS_NOT_NULL',
};

const noValueOperators = new Set(['IS_NULL', 'IS_NOT_NULL']);

const normalizeOperator = (operator?: string) => {
  const raw = String(operator || '').trim();
  if (!raw) return 'EQ';
  return operatorAliases[raw] || operatorAliases[raw.toLowerCase()] || raw.toUpperCase();
};

const getFieldKind = (field?: DataManagementField) => {
  const componentName = field?.componentName || 'TextField';
  if (['NumberField'].includes(componentName)) return 'number';
  if (['DateField', 'DateTimeField', 'CascadeDateField'].includes(componentName)) return 'date';
  if (['SelectField', 'RadioField'].includes(componentName)) return 'singleOption';
  if (['CheckboxField', 'MultiSelectField'].includes(componentName)) return 'multiOption';
  if (['CascadeSelectField'].includes(componentName)) return 'cascadeOption';
  if (['UserSelectField', 'EmployeeSelectField'].includes(componentName)) return 'user';
  if (['DepartmentSelectField'].includes(componentName)) return 'department';
  return 'text';
};

const getDefaultOperator = (field?: DataManagementField) => {
  const kind = getFieldKind(field);
  if (kind === 'text') return 'CONTAINS';
  if (kind === 'multiOption') return 'IN';
  return 'EQ';
};

const getOperatorOptions = (field?: DataManagementField) => {
  const kind = getFieldKind(field);
  const commonNull = [
    { label: '为空', value: 'IS_NULL' },
    { label: '不为空', value: 'IS_NOT_NULL' },
  ];
  if (kind === 'text') {
    return [
      { label: '包含', value: 'CONTAINS' },
      { label: '等于', value: 'EQ' },
      { label: '不等于', value: 'NEQ' },
      { label: '不包含', value: 'NOT_CONTAINS' },
      ...commonNull,
    ];
  }
  if (kind === 'number' || kind === 'date') {
    return [
      { label: '等于', value: 'EQ' },
      { label: '不等于', value: 'NEQ' },
      { label: '大于', value: 'GT' },
      { label: '大于等于', value: 'GTE' },
      { label: '小于', value: 'LT' },
      { label: '小于等于', value: 'LTE' },
      { label: '区间', value: 'BETWEEN' },
      ...commonNull,
    ];
  }
  return [
    { label: '等于', value: 'EQ' },
    { label: '不等于', value: 'NEQ' },
    { label: '包含任一', value: 'IN' },
    ...commonNull,
  ];
};

const getDefaultValueForOperator = (operator: string) => {
  const normalized = normalizeOperator(operator);
  if (noValueOperators.has(normalized)) return null;
  if (normalized === 'BETWEEN') return [null, null];
  if (normalized === 'IN') return [];
  return '';
};

const createRule = (field?: DataManagementField): DataManagementFilterRule => ({
  id: `rule_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  key: field?.fieldId || '',
  operator: getDefaultOperator(field),
  value: getDefaultValueForOperator(getDefaultOperator(field)),
  componentName: field?.componentName,
});

const getRecordId = (record: any) =>
  record?.formInstanceId ||
  record?.formInstId ||
  record?.form_instance_id ||
  record?.instanceId ||
  record?.id ||
  record?.processInstanceId;

const getSelectedRecordId = (record: any, fallback: React.Key) =>
  record?.formInstId ||
  record?.formInstanceId ||
  record?.form_instance_id ||
  record?.id ||
  fallback;

const hydrateFilterGroup = (group?: DataManagementFilterGroup): DataManagementFilterGroup => {
  if (!group) return createGroup();
  return {
    id: group.id || createGroup().id,
    logic: group.logic === 'OR' ? 'OR' : 'AND',
    rules: Array.isArray(group.rules)
      ? group.rules.map((rule) => ({
          ...rule,
          id: rule.id || `rule_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          operator: normalizeOperator(rule.operator),
        }))
      : [],
    conditions: Array.isArray(group.conditions) ? group.conditions.map(hydrateFilterGroup) : [],
  };
};

const hasFilterContent = (group?: DataManagementFilterGroup) =>
  Boolean(group && ((group.rules || []).length > 0 || (group.conditions || []).length > 0));

const combineFilterGroups = (
  forced?: DataManagementFilterGroup,
  personal?: DataManagementFilterGroup,
): DataManagementFilterGroup | undefined => {
  const forcedGroup = hasFilterContent(forced) ? hydrateFilterGroup(forced) : undefined;
  const personalGroup = hasFilterContent(personal) ? hydrateFilterGroup(personal) : undefined;
  if (forcedGroup && personalGroup) {
    return {
      id: `group_forced_${Date.now()}`,
      logic: 'AND',
      rules: [],
      conditions: [forcedGroup, personalGroup],
    };
  }
  return forcedGroup || personalGroup;
};

const uniqueStrings = (values: Array<string | undefined | null>) => {
  const result: string[] = [];
  values.forEach((value) => {
    const normalized = String(value || '').trim();
    if (normalized && !result.includes(normalized)) result.push(normalized);
  });
  return result;
};

const combineSearchKeywords = (forced?: string, personal?: string) => {
  const values = uniqueStrings([forced, personal]);
  return values.length > 0 ? values.join(' ') : undefined;
};

const uniqueFields = (fields: DataManagementField[]) => {
  const seen = new Set<string>();
  return fields.filter((field) => {
    const key = String(field.fieldId || field.id || '').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const createSelectedIdFilterGroup = (
  selectedIds: string[],
): DataManagementFilterGroup | undefined => {
  const ids = uniqueStrings(selectedIds);
  if (ids.length === 0) return undefined;
  return {
    id: `group_selected_export_${Date.now()}`,
    logic: 'OR',
    rules: ids.map((id) => ({
      id: `selected_${id}`,
      key: 'form_instance_id',
      operator: 'EQ',
      value: id,
    })),
    conditions: [],
  };
};

const mergeSorts = (forced: DataManagementSort[] = [], personal: DataManagementSort[] = []) => {
  const used = new Set<string>();
  const result: DataManagementSort[] = [];
  [...forced, ...personal].forEach((item) => {
    if (!item?.id || used.has(item.id)) return;
    used.add(item.id);
    result.push(item);
  });
  return result;
};

const stripForcedConfigPatch = (
  patch: DataManagementConfig,
  forced: DataManagementConfig | undefined,
): DataManagementConfig => {
  if (!forced) return patch;
  const forcedShowFields = new Set(forced.showFields || []);
  const forcedLockFields = new Set(forced.lockFieldIds || []);
  const forcedSortIds = new Set((forced.sort || []).map((item) => item.id));
  const next = { ...patch };
  if (Array.isArray(next.showFields)) {
    next.showFields = next.showFields.filter((fieldId) => !forcedShowFields.has(fieldId));
  }
  if (Array.isArray(next.lockFieldIds)) {
    next.lockFieldIds = next.lockFieldIds.filter((fieldId) => !forcedLockFields.has(fieldId));
  }
  if (Array.isArray(next.sort)) {
    next.sort = next.sort.filter((item) => !forcedSortIds.has(item.id));
  }
  return next;
};

const buildFallbackFormSchema = ({
  appType,
  formUuid,
  title,
  formType,
  fields,
}: {
  appType: string;
  formUuid: string;
  title?: string;
  formType?: string;
  fields: DataManagementField[];
}): FormSchema => ({
  formMeta: {
    appType,
    formUuid,
    title: title || formUuid,
  },
  template: {
    type: 'standard',
    formType: isProcessFormType(formType) ? 'process' : 'form',
    enableDraft: true,
    submitSuccessMode: 'stay',
  },
  fields: fields.filter((field) => !field.system),
  layout: fields
    .filter((field) => !field.system)
    .map((field) => ({
      id: `layout_${field.fieldId}`,
      type: 'field' as const,
      fieldId: field.fieldId,
    })),
  rules: [],
});

const formatPrimitive = (value: any) => {
  if (value === undefined || value === null || value === '')
    return <span className="text-ant-color-text-quaternary">--</span>;
  return String(value);
};

const formatDateTime = (value: any) => {
  if (value === undefined || value === null || value === '') return formatPrimitive('');
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : String(value);
};

const pickOptionLabel = (field: DataManagementField, value: any) => {
  const options =
    field.options || field.optionList || field.option_list || field.componentProps?.options || [];
  const scalar =
    typeof value === 'object' ? (value?.value ?? value?.id ?? value?.label ?? value?.name) : value;
  const match = Array.isArray(options)
    ? options.find((option: any) => String(option.value ?? option.id) === String(scalar))
    : undefined;
  return match?.label || match?.name || value?.label || value?.name || scalar;
};

const renderStatusTag = (value: any, fieldId: string) => {
  const raw = String(value || '');
  const statusMap: Record<string, { label: string; color: string }> = {
    pending: { label: '待处理', color: 'processing' },
    running: { label: '审批中', color: 'processing' },
    waiting: { label: '等待中', color: 'default' },
    exception: { label: '流程异常', color: 'error' },
    completed: { label: '已完成', color: 'success' },
    terminated: { label: '已拒绝', color: 'error' },
    withdrawn: { label: '已撤销', color: 'default' },
    processing: { label: '审批中', color: 'processing' },
    approved: { label: '同意', color: 'success' },
    rejected: { label: '拒绝', color: 'error' },
  };
  if (fieldId !== 'processInstanceStatus' && fieldId !== 'approvalResult') return null;
  const meta = statusMap[raw];
  return <Tag color={meta?.color}>{meta?.label || raw || '--'}</Tag>;
};

const renderCellValue = (value: any, field: DataManagementField) => {
  const status = renderStatusTag(value, field.fieldId);
  if (status) return status;

  if (field.componentName === 'DateField' || field.componentName === 'DateTimeField') {
    return formatDateTime(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return formatPrimitive('');
    if (field.componentName === 'ImageField') {
      return (
        <div className="flex max-w-[180px] gap-1 overflow-hidden">
          {value.slice(0, 3).map((item: any, index) => (
            <img
              key={item?.uid || item?.id || item?.url || index}
              alt={item?.name || field.label}
              src={item?.url || item?.previewUrl}
              className="h-8 w-8 rounded object-cover"
            />
          ))}
        </div>
      );
    }
    if (field.componentName === 'AttachmentField') {
      return (
        <Space size={4} wrap>
          {value.slice(0, 3).map((item: any, index) => (
            <Tag key={item?.uid || item?.id || index}>
              {item?.name || item?.originalName || `附件${index + 1}`}
            </Tag>
          ))}
          {value.length > 3 && <Tag>+{value.length - 3}</Tag>}
        </Space>
      );
    }
    return (
      <Space size={4} wrap>
        {value.slice(0, 4).map((item, index) => (
          <Tag key={`${field.fieldId}_${index}`}>{pickOptionLabel(field, item)}</Tag>
        ))}
        {value.length > 4 && <Tag>+{value.length - 4}</Tag>}
      </Space>
    );
  }

  if (value && typeof value === 'object') {
    if (
      field.componentName === 'UserSelectField' ||
      field.componentName === 'DepartmentSelectField'
    ) {
      return value.name || value.label || value.username || formatPrimitive(value.id);
    }
    if (value.start || value.end) {
      return [value.start, value.end].filter(Boolean).join(' 至 ');
    }
    if (value.label || value.name || value.value) {
      return pickOptionLabel(field, value);
    }
    return (
      <Tooltip title={JSON.stringify(value)}>
        <span className="text-ant-color-text-secondary">对象数据</span>
      </Tooltip>
    );
  }

  if (
    ['SelectField', 'RadioField', 'CheckboxField', 'MultiSelectField'].includes(field.componentName)
  ) {
    return pickOptionLabel(field, value);
  }

  return formatPrimitive(value);
};

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const normalizeBasePath = (basePath?: string) => {
  const normalized = String(basePath || '').replace(/^\/+|\/+$/g, '');
  return normalized ? `/${normalized}` : '';
};

export const isProcessFormType = (formType?: string) => {
  const normalized = String(formType || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
  return ['process', 'workflow', 'flow', 'flowform', 'processform', 'workflowform'].includes(
    normalized,
  );
};

export function resolveDataManagementPopupContainer(
  rootEl?: HTMLElement | null,
  triggerNode?: HTMLElement,
) {
  if (rootEl) {
    return resolveDataManagementPortalContainer(rootEl);
  }
  return (
    triggerNode?.ownerDocument?.body ||
    (typeof document !== 'undefined' ? document.body : undefined)
  );
}

const DATA_MANAGEMENT_PORTAL_ATTR = 'data-sy-data-management-portal';
const DATA_MANAGEMENT_PORTAL_NAMESPACE_CLASS = 'sy-app-workspace';
const DATA_MANAGEMENT_PORTAL_OWNER_ATTR = 'data-sy-data-management-portal-owner';
const dataManagementPortalOwnerIds = new WeakMap<HTMLElement, string>();
let dataManagementPortalOwnerSeed = 0;

function markDataManagementPortal(portal: HTMLElement, ownerId?: string) {
  portal.classList.add(DATA_MANAGEMENT_PORTAL_NAMESPACE_CLASS);
  if (ownerId) {
    portal.setAttribute(DATA_MANAGEMENT_PORTAL_OWNER_ATTR, ownerId);
  }
  return portal;
}

function getDataManagementPortalOwnerId(rootEl: HTMLElement) {
  let ownerId = dataManagementPortalOwnerIds.get(rootEl);
  if (!ownerId) {
    dataManagementPortalOwnerSeed += 1;
    ownerId = `data_management_${dataManagementPortalOwnerSeed}`;
    dataManagementPortalOwnerIds.set(rootEl, ownerId);
  }
  return ownerId;
}

function getDataManagementPortalParent(rootEl: HTMLElement) {
  const rootNode = rootEl.getRootNode?.();
  if (typeof ShadowRoot !== 'undefined' && rootNode instanceof ShadowRoot) {
    return rootNode;
  }
  return rootEl.ownerDocument.body;
}

export function resolveDataManagementPortalContainer(rootEl?: HTMLElement | null) {
  if (!rootEl) return typeof document !== 'undefined' ? document.body : undefined;
  const ownerId = getDataManagementPortalOwnerId(rootEl);
  const parent = getDataManagementPortalParent(rootEl);
  const existing =
    parent.querySelector<HTMLElement>(
      `[${DATA_MANAGEMENT_PORTAL_ATTR}][${DATA_MANAGEMENT_PORTAL_OWNER_ATTR}="${ownerId}"]`,
    ) ||
    parent.querySelector<HTMLElement>(
      `[${DATA_MANAGEMENT_PORTAL_ATTR}]:not([${DATA_MANAGEMENT_PORTAL_OWNER_ATTR}])`,
    );
  if (existing) return markDataManagementPortal(existing, ownerId);
  const portal = rootEl.ownerDocument.createElement('div');
  portal.setAttribute(DATA_MANAGEMENT_PORTAL_ATTR, '');
  markDataManagementPortal(portal, ownerId);
  parent.appendChild(portal);
  return portal;
}

const inferBasePath = (appType: string) => {
  if (typeof window === 'undefined') return '';
  const pathname = window.location?.pathname || '';
  const marker = `/${appType}/`;
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex <= 0) return '';
  return pathname.slice(0, markerIndex);
};

const buildDefaultDetailUrl = ({
  appType,
  formUuid,
  formType,
  formInstanceId,
  basePath,
}: {
  appType: string;
  formUuid: string;
  formType?: string;
  formInstanceId: string;
  basePath?: string;
}) => {
  const prefix = normalizeBasePath(basePath ?? inferBasePath(appType));
  const detailType = isProcessFormType(formType) ? 'processDetail' : 'formDetail';
  return `${prefix}/${appType}/${detailType}/${formUuid}?formInstId=${encodeURIComponent(formInstanceId)}`;
};

const getHeaderValue = (headers: any, key: string) => {
  if (!headers) return '';
  if (typeof headers.get === 'function')
    return headers.get(key) || headers.get(key.toLowerCase()) || '';
  return headers[key] || headers[key.toLowerCase()] || '';
};

const resolveDownloadFilename = (headers: any, fallbackName: string) => {
  const disposition = getHeaderValue(headers, 'content-disposition');
  if (typeof disposition !== 'string') return fallbackName;
  const matchStar = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (matchStar?.[1]) return decodeURIComponent(matchStar[1]);
  const match = disposition.match(/filename="?([^";]+)"?/i);
  if (match?.[1]) return decodeURIComponent(match[1]);
  return fallbackName;
};

const downloadBlobResponse = async (response: any, fallbackName: string) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const headers = response?.headers;
  const payload = response?.blob ?? response?.data ?? response;
  const contentType = getHeaderValue(headers, 'content-type') || payload?.type || '';
  const hasBlob = typeof Blob !== 'undefined';

  if (hasBlob && payload instanceof Blob && String(contentType).includes('application/json')) {
    const text = await payload.text();
    try {
      const json = JSON.parse(text);
      throw new Error(json?.message || '下载失败');
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error('下载失败');
      if (error instanceof Error) throw error;
      throw new Error('下载失败');
    }
  }

  const blob =
    hasBlob && payload instanceof Blob
      ? payload
      : hasBlob && payload instanceof ArrayBuffer
        ? new Blob([payload], { type: contentType || 'application/octet-stream' })
        : new Blob([typeof payload === 'string' ? payload : JSON.stringify(payload ?? '')], {
            type: contentType || 'application/octet-stream',
          });
  const filename = response?.fileName || resolveDownloadFilename(headers, fallbackName);
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
};

const unwrapRuntimePayload = (payload: any) => {
  const data = payload?.data?.result ?? payload?.result ?? payload?.data ?? payload;
  return data?.items || data?.list || data?.data || data?.records || data || [];
};

const getRawFieldOptions = (field?: DataManagementField): any[] => {
  const options =
    field?.options ||
    field?.optionList ||
    field?.option_list ||
    field?.componentProps?.options ||
    field?.componentProps?.optionList ||
    [];
  return Array.isArray(options) ? options : [];
};

const getOptionValue = (option: any) => option?.value ?? option?.id ?? option?.key;

const normalizeSelectOptions = (field?: DataManagementField): { label: string; value: string }[] =>
  getRawFieldOptions(field)
    .map((option) => {
      const value = getOptionValue(option);
      if (value === undefined || value === null || value === '') return null;
      return {
        label: String(option?.label ?? option?.name ?? option?.title ?? value),
        value: String(value),
      };
    })
    .filter(Boolean) as { label: string; value: string }[];

const normalizeCascadeOptions = (field?: DataManagementField): any[] => {
  const visit = (items: any[]): any[] =>
    items
      .map((item) => {
        const value = getOptionValue(item);
        if (value === undefined || value === null || value === '') return null;
        const children = Array.isArray(item.children) ? visit(item.children) : undefined;
        return {
          label: String(item.label ?? item.name ?? item.title ?? value),
          value: String(value),
          children: children && children.length > 0 ? children : undefined,
        };
      })
      .filter(Boolean);
  return visit(getRawFieldOptions(field));
};

const flattenCascadeOptions = (options: any[]): { label: string; value: string }[] => {
  const result: { label: string; value: string }[] = [];
  const visit = (items: any[], parentLabels: string[] = []) => {
    items.forEach((item) => {
      const labels = [...parentLabels, item.label];
      result.push({ label: labels.join(' / '), value: item.value });
      if (Array.isArray(item.children)) visit(item.children, labels);
    });
  };
  visit(options);
  return result;
};

const findCascadePath = (options: any[], value: any): string[] => {
  const target = String(value ?? '');
  const visit = (items: any[], trail: string[] = []): string[] => {
    for (const item of items) {
      const nextTrail = [...trail, String(item.value)];
      if (String(item.value) === target) return nextTrail;
      if (Array.isArray(item.children)) {
        const found = visit(item.children, nextTrail);
        if (found.length) return found;
      }
    }
    return [];
  };
  return visit(options);
};

const formatDateFilterValue = (value: any, field?: DataManagementField) => {
  if (!value) return '';
  const format =
    field?.dateFormat ||
    field?.format ||
    (field?.componentName === 'DateTimeField' || field?.showTime
      ? 'YYYY-MM-DD HH:mm:ss'
      : 'YYYY-MM-DD');
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format(format) : String(value);
};

const normalizeEntityOption = (item: any) => {
  const value = item?.value ?? item?.id ?? item?.userid ?? item?.userId ?? item?.departmentId;
  if (value === undefined || value === null || value === '') return null;
  return {
    value: String(value),
    label: String(
      item?.label ?? item?.name ?? item?.title ?? item?.username ?? item?.departmentName ?? value,
    ),
  };
};

function AsyncEntityFilterSelect({
  api,
  entityType,
  operator,
  value,
  onChange,
}: {
  api: FormRuntimeApi;
  entityType: 'user' | 'department';
  operator: string;
  value: any;
  onChange: (value: any) => void;
}) {
  const [options, setOptions] = useState<{ label: string; value: string }[]>([]);
  const [fetching, setFetching] = useState(false);
  const multiple = normalizeOperator(operator) === 'IN';

  const loadOptions = useCallback(
    async (keyword = '') => {
      setFetching(true);
      try {
        let rows: any[] = [];
        if (entityType === 'user') {
          if (typeof api.getUserList === 'function') {
            rows = await api.getUserList(
              keyword
                ? { keyword, name: keyword, username: keyword, pageSize: 20 }
                : { pageSize: 20 },
            );
          } else {
            const response = await api.request({
              url: '/user/list',
              method: 'get',
              params: keyword ? { keyword, pageSize: 20 } : { pageSize: 20 },
            });
            rows = unwrapRuntimePayload(response);
          }
        } else {
          const response = await api.request({
            url: keyword ? '/department/list' : '/department/root',
            method: 'get',
          });
          rows = unwrapRuntimePayload(response);
          if (keyword) {
            const normalizedKeyword = keyword.toLowerCase();
            rows = rows.filter((item: any) =>
              String(item?.name ?? item?.label ?? item?.id ?? '')
                .toLowerCase()
                .includes(normalizedKeyword),
            );
          }
        }
        setOptions(
          rows.map(normalizeEntityOption).filter(Boolean) as { label: string; value: string }[],
        );
      } catch {
        setOptions([]);
      } finally {
        setFetching(false);
      }
    },
    [api, entityType],
  );

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  return (
    <Select
      showSearch
      allowClear
      mode={multiple ? 'multiple' : undefined}
      value={multiple ? (Array.isArray(value) ? value.map(String) : []) : value || undefined}
      options={options}
      filterOption={false}
      onSearch={(keyword) => void loadOptions(keyword)}
      onChange={(nextValue) => onChange(nextValue)}
      notFoundContent={fetching ? '加载中...' : null}
      placeholder={entityType === 'user' ? '选择人员' : '选择部门'}
    />
  );
}

function FilterValueEditor({
  api,
  field,
  operator,
  value,
  onChange,
}: {
  api: FormRuntimeApi;
  field?: DataManagementField;
  operator: string;
  value: any;
  onChange: (value: any) => void;
}) {
  const normalizedOperator = normalizeOperator(operator);
  const kind = getFieldKind(field);
  if (noValueOperators.has(normalizedOperator)) {
    return (
      <div className="flex h-8 items-center text-sm text-ant-color-text-tertiary">无需填写值</div>
    );
  }
  if (kind === 'number') {
    if (normalizedOperator === 'BETWEEN') {
      const range = Array.isArray(value) ? value : [undefined, undefined];
      return (
        <div className="flex w-full gap-2">
          <InputNumber
            className="w-full"
            placeholder="最小值"
            value={range[0] ?? null}
            onChange={(nextValue) => onChange([nextValue, range[1] ?? null])}
          />
          <InputNumber
            className="w-full"
            placeholder="最大值"
            value={range[1] ?? null}
            onChange={(nextValue) => onChange([range[0] ?? null, nextValue])}
          />
        </div>
      );
    }
    return (
      <InputNumber
        className="w-full"
        value={value === '' || value === undefined ? null : Number(value)}
        placeholder="输入筛选值"
        onChange={(nextValue) => onChange(nextValue)}
      />
    );
  }
  if (kind === 'date') {
    if (normalizedOperator === 'BETWEEN') {
      const range = Array.isArray(value) ? value : [];
      return (
        <DatePicker.RangePicker
          className="w-full"
          locale={antdDatePickerChineseLocale}
          value={
            range.length === 2 && range[0] && range[1] ? [dayjs(range[0]), dayjs(range[1])] : null
          }
          showTime={field?.componentName === 'DateTimeField' || field?.showTime}
          onChange={(dates) =>
            onChange(
              dates && dates[0] && dates[1]
                ? [formatDateFilterValue(dates[0], field), formatDateFilterValue(dates[1], field)]
                : [null, null],
            )
          }
        />
      );
    }
    return (
      <DatePicker
        className="w-full"
        locale={antdDatePickerChineseLocale}
        value={value ? dayjs(value) : null}
        showTime={field?.componentName === 'DateTimeField' || field?.showTime}
        placeholder="选择日期"
        onChange={(date) => onChange(date ? formatDateFilterValue(date, field) : '')}
      />
    );
  }
  if (kind === 'singleOption' || kind === 'multiOption') {
    const multiple = normalizedOperator === 'IN' || kind === 'multiOption';
    return (
      <Select
        allowClear
        mode={multiple ? 'multiple' : undefined}
        value={multiple ? (Array.isArray(value) ? value.map(String) : []) : value || undefined}
        options={normalizeSelectOptions(field)}
        placeholder="选择筛选值"
        onChange={(nextValue) => onChange(nextValue)}
      />
    );
  }
  if (kind === 'cascadeOption') {
    const cascadeOptions = normalizeCascadeOptions(field);
    if (normalizedOperator === 'IN') {
      return (
        <Select
          allowClear
          mode="multiple"
          value={Array.isArray(value) ? value.map(String) : []}
          options={flattenCascadeOptions(cascadeOptions)}
          placeholder="选择筛选值"
          onChange={(nextValue) => onChange(nextValue)}
        />
      );
    }
    return (
      <Cascader
        className="w-full"
        allowClear
        options={cascadeOptions}
        value={findCascadePath(cascadeOptions, value)}
        placeholder="选择筛选值"
        onChange={(nextValue) => {
          const pathValues = Array.isArray(nextValue) ? nextValue : [];
          onChange(pathValues.length ? pathValues[pathValues.length - 1] : '');
        }}
      />
    );
  }
  if (kind === 'user' || kind === 'department') {
    return (
      <AsyncEntityFilterSelect
        api={api}
        entityType={kind === 'department' ? 'department' : 'user'}
        operator={normalizedOperator}
        value={value}
        onChange={onChange}
      />
    );
  }
  if (normalizedOperator === 'IN') {
    return (
      <Select
        mode="tags"
        tokenSeparators={[',', '，']}
        value={Array.isArray(value) ? value.map(String) : []}
        placeholder="输入后回车"
        onChange={(nextValue) => onChange(nextValue)}
      />
    );
  }
  return (
    <Input
      value={value ?? ''}
      placeholder="输入筛选值"
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function FilterGroupEditor({
  group,
  fields,
  api,
  onChange,
  level = 0,
}: {
  group: DataManagementFilterGroup;
  fields: DataManagementField[];
  api: FormRuntimeApi;
  onChange: (group: DataManagementFilterGroup) => void;
  level?: number;
}) {
  const fieldOptions = fields.map((field) => ({ label: field.label, value: field.fieldId }));

  const updateRule = (ruleId: string, patch: Partial<DataManagementFilterRule>) => {
    onChange({
      ...group,
      rules: group.rules.map((rule) =>
        rule.id === ruleId
          ? {
              ...rule,
              ...patch,
              operator: patch.operator ? normalizeOperator(patch.operator) : rule.operator,
            }
          : rule,
      ),
    });
  };

  return (
    <div
      className={`${level > 0 ? 'ml-4 border-l border-ant-border-secondary pl-4' : ''} space-y-3`}
    >
      <div className="flex items-center justify-between">
        <Segmented
          size="small"
          value={group.logic}
          options={[
            { label: '满足全部', value: 'AND' },
            { label: '满足任一', value: 'OR' },
          ]}
          onChange={(value) => onChange({ ...group, logic: value as 'AND' | 'OR' })}
        />
        <Space>
          <Button
            size="small"
            onClick={() => onChange({ ...group, rules: [...group.rules, createRule(fields[0])] })}
          >
            添加条件
          </Button>
          <Button
            size="small"
            onClick={() => onChange({ ...group, conditions: [...group.conditions, createGroup()] })}
          >
            添加分组
          </Button>
        </Space>
      </div>
      {group.rules.map((rule) => (
        <div
          key={rule.id}
          className="grid grid-cols-[minmax(140px,1fr)_132px_minmax(180px,1.4fr)_auto] gap-2"
        >
          <Select
            showSearch
            placeholder="字段"
            value={rule.key}
            options={fieldOptions}
            optionFilterProp="label"
            onChange={(fieldId) => {
              const field = fields.find((item) => item.fieldId === fieldId);
              const nextOperator = getDefaultOperator(field);
              updateRule(rule.id, {
                key: fieldId,
                componentName: field?.componentName,
                operator: nextOperator,
                value: getDefaultValueForOperator(nextOperator),
              });
            }}
          />
          <Select
            value={normalizeOperator(rule.operator)}
            options={getOperatorOptions(fields.find((field) => field.fieldId === rule.key))}
            onChange={(operator) =>
              updateRule(rule.id, {
                operator,
                value: getDefaultValueForOperator(operator),
              })
            }
          />
          <FilterValueEditor
            api={api}
            field={fields.find((field) => field.fieldId === rule.key)}
            operator={rule.operator}
            value={rule.value}
            onChange={(value) => updateRule(rule.id, { value })}
          />
          <Button
            danger
            type="text"
            icon={<DeleteOutlined />}
            onClick={() =>
              onChange({ ...group, rules: group.rules.filter((item) => item.id !== rule.id) })
            }
          />
        </div>
      ))}
      {group.conditions.map((child) => (
        <FilterGroupEditor
          key={child.id}
          group={child}
          fields={fields}
          api={api}
          level={level + 1}
          onChange={(next) =>
            onChange({
              ...group,
              conditions: group.conditions.map((item) => (item.id === child.id ? next : item)),
            })
          }
        />
      ))}
      {group.rules.length === 0 && group.conditions.length === 0 && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无筛选条件" />
      )}
    </div>
  );
}

function ResizableColumnTitle({
  label,
  width,
  onResize,
  onResizeEnd,
}: {
  label: React.ReactNode;
  width: number;
  onResize: (width: number) => void;
  onResizeEnd: (width: number) => void;
}) {
  const dragRef = useRef({ startX: 0, startWidth: width, latestWidth: width });

  const handleMouseDown = (event: React.MouseEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      startX: event.clientX,
      startWidth: width,
      latestWidth: width,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.min(
        520,
        Math.max(96, dragRef.current.startWidth + moveEvent.clientX - dragRef.current.startX),
      );
      dragRef.current.latestWidth = nextWidth;
      onResize(nextWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      onResizeEnd(dragRef.current.latestWidth);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <span className="relative flex min-w-0 items-center pr-3">
      <span className="min-w-0 truncate">{label}</span>
      <span
        aria-hidden
        className="absolute -right-3 top-0 h-full w-4 cursor-col-resize after:absolute after:right-1 after:top-1/2 after:h-5 after:w-0.5 after:-translate-y-1/2 after:rounded after:bg-transparent hover:after:bg-ant-color-primary"
        onClickCapture={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onDoubleClickCapture={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onMouseDownCapture={handleMouseDown}
        title="拖拽调整列宽"
      />
    </span>
  );
}

export const DataManagementList: React.FC<DataManagementListProps> = ({
  appType,
  formUuid,
  detailBasePath,
  menuFormUuid,
  readonly = false,
  fullHeight = true,
  title,
  formTitle,
  formType: propFormType,
  schema: providedSchema,
  components,
  forcedConfig,
  showForcedConfig = true,
  detailRenderer,
  detailPageUrlBuilder,
  submitRenderer,
  requestOverride,
  allowSchemaFallback = false,
  rowActions = [],
  maxVisibleRowActions,
  permissionMode = 'auto',
  actionOverrides,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const api = useMemo(() => {
    if (typeof requestOverride === 'function') {
      return createFormRuntimeApi({ request: requestOverride });
    }
    return createFormRuntimeApi(requestOverride);
  }, [requestOverride]);

  const [fields, setFields] = useState<DataManagementField[]>([]);
  const [runtimeFormSchema, setRuntimeFormSchema] = useState<FormSchema | null>(null);
  const [config, setConfig] = useState<DataManagementConfig>({});
  const [formType, setFormType] = useState<string>('form');
  const [showFields, setShowFields] = useState<string[]>([]);
  const [lockFieldIds, setLockFieldIds] = useState<string[]>([]);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const widthsRef = useRef<Record<string, number>>({});
  const [sort, setSort] = useState<DataManagementSort[]>([]);
  const [density, setDensity] = useState<DataManagementDensity>('middle');
  const [detailOpenMode, setDetailOpenMode] = useState<'drawer' | 'newPage'>('drawer');
  const [searchKeyWord, setSearchKeyWord] = useState('');
  const [filterGroup, setFilterGroup] = useState<DataManagementFilterGroup>(createGroup);
  const [dataSource, setDataSource] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [current, setCurrent] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [schemaLoading, setSchemaLoading] = useState(true);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [columnOpen, setColumnOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<'selected' | 'all'>('all');
  const [exportFields, setExportFields] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importBase64, setImportBase64] = useState('');
  const [templateDownloading, setTemplateDownloading] = useState(false);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [recordTab, setRecordTab] = useState<'import' | 'export'>('export');
  const [transferRecords, setTransferRecords] = useState<any[]>([]);
  const [batchApprovalOpen, setBatchApprovalOpen] = useState(false);
  const [batchApprovalAction, setBatchApprovalAction] = useState<'approved' | 'rejected'>(
    'approved',
  );
  const [batchApprovalComments, setBatchApprovalComments] = useState('');
  const [batchApproving, setBatchApproving] = useState(false);
  const [activeRecord, setActiveRecord] = useState<any | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [actionSummary, setActionSummary] = useState<DataManagementActionSummary | null>(null);
  const [permissionLoading, setPermissionLoading] = useState(permissionMode === 'auto');
  const [permissionError, setPermissionError] = useState<Error | null>(null);
  const fetchStateRef = useRef<DataManagementFetchState>({});
  const isProcessForm = isProcessFormType(formType);

  const request = api.request;
  const getPopupContainer = useCallback(
    (triggerNode?: HTMLElement) =>
      resolveDataManagementPopupContainer(rootRef.current, triggerNode) as HTMLElement,
    [],
  );
  const getOverlayContainer = useCallback(
    () => resolveDataManagementPortalContainer(rootRef.current) as HTMLElement,
    [],
  );
  const drawerWidth = 'min(960px, calc(100vw - 48px))';
  const confirmDanger = useCallback((title: string, content: string, onOk: () => void) => {
    if (confirmAction(title, content)) onOk();
  }, []);

  useEffect(() => {
    let mounted = true;
    if (permissionMode !== 'auto') {
      setActionSummary(null);
      setPermissionLoading(false);
      setPermissionError(null);
      return () => {
        mounted = false;
      };
    }
    if (!appType || !formUuid) return undefined;
    setPermissionLoading(true);
    setPermissionError(null);
    getDataManagementActionSummary(request, { appType, formUuid })
      .then((summary) => {
        if (!mounted) return;
        setActionSummary(summary);
      })
      .catch((error) => {
        if (!mounted) return;
        setActionSummary(null);
        setPermissionError(error instanceof Error ? error : new Error(String(error)));
      })
      .finally(() => {
        if (mounted) setPermissionLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [appType, formUuid, permissionMode, request]);

  const baseActionCan = useMemo(() => {
    if (permissionMode === 'auto') {
      return FORM_ACTION_PERMISSIONS.reduce((result, action) => {
        result[action] = Boolean(actionSummary?.can?.[action]);
        return result;
      }, {} as Record<FormActionPermission, boolean>);
    }
    return FORM_ACTION_PERMISSIONS.reduce((result, action) => {
      result[action] = true;
      return result;
    }, {} as Record<FormActionPermission, boolean>);
  }, [actionSummary?.can, permissionMode]);

  const canAction = useCallback(
    (action: FormActionPermission) => {
      if (permissionLoading && permissionMode === 'auto') return false;
      if (permissionError && permissionMode === 'auto') return action === 'view';
      let allowed = permissionMode === 'off' ? true : Boolean(baseActionCan[action]);
      if (permissionMode === 'auto') {
        allowed = allowed && actionOverrides?.[action] !== false;
      } else if (actionOverrides?.[action] === false) {
        allowed = false;
      }
      if (readonly && ['create', 'edit', 'delete', 'import'].includes(action)) {
        return false;
      }
      return allowed;
    },
    [actionOverrides, baseActionCan, permissionError, permissionLoading, permissionMode, readonly],
  );
  const canCreate = canAction('create');
  const canDelete = canAction('delete');
  const canExport = canAction('export');
  const canImport = canAction('import');
  const canWorkflow = canAction('workflow');

  const visibleFields = useMemo(
    () =>
      showFields
        .map((fieldId) => fields.find((field) => field.fieldId === fieldId))
        .filter(Boolean) as DataManagementField[],
    [fields, showFields],
  );
  const forcedShowFieldIds = useMemo(
    () => new Set(forcedConfig?.showFields || []),
    [forcedConfig?.showFields],
  );
  const forcedLockFieldIds = useMemo(
    () => new Set(forcedConfig?.lockFieldIds || []),
    [forcedConfig?.lockFieldIds],
  );

  useEffect(() => {
    widthsRef.current = widths;
  }, [widths]);

  useEffect(() => {
    fetchStateRef.current = {
      current,
      pageSize,
      searchKeyWord,
      filterGroup,
      sort,
    };
  }, [current, filterGroup, pageSize, searchKeyWord, sort]);

  const loadData = useCallback(
    async (overrides: DataManagementFetchState = {}) => {
      if (!appType || !formUuid) return;
      const fetchState = { ...fetchStateRef.current, ...overrides };
      const nextCurrent = fetchState.current || 1;
      const nextPageSize = forcedConfig?.pageSize || fetchState.pageSize || 10;
      const nextFilterGroup = combineFilterGroups(
        forcedConfig?.filter?.group,
        fetchState.filterGroup,
      );
      const nextSort = mergeSorts(forcedConfig?.sort, fetchState.sort);
      const nextSearchKeyWord = combineSearchKeywords(
        forcedConfig?.filter?.searchKeyWord,
        fetchState.searchKeyWord,
      );
      fetchStateRef.current = {
        ...fetchState,
        current: nextCurrent,
        pageSize: nextPageSize,
      };
      setLoading(true);
      try {
        const result = await advancedSearchDataManagement(request, {
          appType,
          formUuid,
          currentPage: nextCurrent,
          pageSize: nextPageSize,
          searchKeyWord: nextSearchKeyWord,
          filters: nextFilterGroup,
          order: nextSort,
        });
        setDataSource(result.records);
        setTotal(result.total);
        setCurrent(nextCurrent);
        setPageSize(nextPageSize);
      } catch (error) {
        console.error('[DataManagementList] loadData failed:', error);
        message.error('加载数据失败');
      } finally {
        setLoading(false);
      }
    },
    [appType, forcedConfig, formUuid, request],
  );

  useEffect(() => {
    let mounted = true;
    const loadSchemaAndConfig = async () => {
      if (!appType || !formUuid) return;
      setSchemaLoading(true);
      setDataSource([]);
      setTotal(0);
      setSelectedRowKeys([]);
      try {
        const schemaResult = providedSchema
          ? normalizeDataManagementFields(
              { appType, formUuid, schema: providedSchema },
              { appType, formUuid },
            )
          : await getDataManagementSchema(request, { appType, formUuid });
        if (!mounted) return;
        const allFields = uniqueFields([
          ...schemaResult.fields,
          ...getSystemFieldsForFormType(schemaResult.formType),
        ]);
        const saved = await getDataManagementConfig(request, {
          appType,
          formUuid,
          menuFormUuid,
          scope: 'personal',
        }).catch(() => undefined);
        if (!mounted) return;
        const resolved = normalizeColumnConfig(saved, allFields);
        const forcedResolved = forcedConfig ? normalizeColumnConfig(forcedConfig, allFields) : null;
        const forcedShowFields = forcedResolved?.showFields || [];
        const forcedLockFieldIds = forcedResolved?.lockFieldIds || [];
        const nextShowFields =
          forcedConfig?.showFields && forcedConfig.showFields.length > 0
            ? uniqueStrings([...forcedShowFields, ...resolved.showFields])
            : resolved.showFields;
        const nextLockFieldIds = uniqueStrings([...forcedLockFieldIds, ...resolved.lockFieldIds]);
        const nextSort = mergeSorts(forcedResolved?.sort, resolved.sort);
        const nextSearchKeyWord = saved?.filter?.searchKeyWord || '';
        const nextFilterGroup = hydrateFilterGroup(saved?.filter?.group);
        const nextFormType = propFormType || schemaResult.formType || 'form';
        if (!schemaResult.schema && !allowSchemaFallback) {
          throw new Error(
            `表单 schema 不存在或未发布: ${formUuid}。请先发布表单 schema；严格模式不会生成兜底表单。`,
          );
        }
        setFields(allFields);
        setRuntimeFormSchema(
          schemaResult.schema ||
            buildFallbackFormSchema({
              appType,
              formUuid,
              title: formTitle || title,
              formType: nextFormType,
              fields: allFields,
            }),
        );
        setFormType(nextFormType);
        setConfig(saved || {});
        setShowFields(nextShowFields);
        setWidths(resolved.widths);
        setLockFieldIds(nextLockFieldIds);
        setSort(nextSort);
        setDensity(forcedConfig?.density || resolved.density);
        setDetailOpenMode(forcedConfig?.detailOpenMode || resolved.detailOpenMode);
        setPageSize(forcedConfig?.pageSize || resolved.pageSize);
        setSearchKeyWord(nextSearchKeyWord);
        setFilterGroup(nextFilterGroup);
        await loadData({
          current: 1,
          pageSize: forcedConfig?.pageSize || resolved.pageSize,
          searchKeyWord: nextSearchKeyWord,
          filterGroup: nextFilterGroup,
          sort: nextSort,
        });
      } catch (error) {
        console.error('[DataManagementList] load schema failed:', error);
        message.error(error instanceof Error ? error.message : '加载表单配置失败');
      } finally {
        if (mounted) setSchemaLoading(false);
      }
    };
    loadSchemaAndConfig();
    return () => {
      mounted = false;
    };
  }, [
    appType,
    allowSchemaFallback,
    forcedConfig,
    formTitle,
    formUuid,
    loadData,
    menuFormUuid,
    propFormType,
    providedSchema,
    request,
    title,
  ]);

  const persistConfig = useCallback(
    async (patch: DataManagementConfig) => {
      const personalPatch = stripForcedConfigPatch(patch, forcedConfig);
      const nextConfig = { ...config, ...personalPatch };
      setConfig(nextConfig);
      await saveDataManagementConfig(request, {
        appType,
        formUuid,
        menuFormUuid,
        scope: 'personal',
        config: nextConfig,
      }).catch((error) => {
        console.error('[DataManagementList] save config failed:', error);
        message.warning('配置保存失败，本次仅在当前页面生效');
      });
    },
    [appType, config, forcedConfig, formUuid, menuFormUuid, request],
  );

  const handleColumnCommit = async () => {
    setColumnOpen(false);
    await persistConfig({
      showFields,
      lockFieldIds,
      widths,
      sort,
      density,
      detailOpenMode,
      pageSize,
    });
    await loadData({ current: 1, pageSize, sort });
  };

  const handleSortChange = (index: number, patch: Partial<DataManagementSort>) => {
    setSort((prev) =>
      prev.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );
  };

  const handleAddSort = () => {
    const firstFieldId = showFields[0] || fields[0]?.fieldId;
    if (!firstFieldId) return;
    setSort((prev) => [...prev, { id: firstFieldId, isAsc: 'y' }]);
  };

  const handleRemoveSort = (index: number) => {
    setSort((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const updateColumnWidth = useCallback((fieldId: string, width: number) => {
    const nextWidth = Math.round(Math.max(96, Math.min(520, width)));
    widthsRef.current = { ...widthsRef.current, [fieldId]: nextWidth };
    setWidths(widthsRef.current);
  }, []);

  const commitColumnWidth = useCallback(
    (fieldId: string, width: number) => {
      const nextWidth = Math.round(Math.max(96, Math.min(520, width)));
      const nextWidths = { ...widthsRef.current, [fieldId]: nextWidth };
      widthsRef.current = nextWidths;
      setWidths(nextWidths);
      void persistConfig({ widths: nextWidths });
    },
    [persistConfig],
  );

  const handleDetail = useCallback(
    (record: any) => {
      const formInstanceId = getRecordId(record);
      if (!formInstanceId) {
        message.warning('当前记录缺少实例 ID，无法打开详情');
        return;
      }
      if (detailOpenMode === 'newPage' && typeof window !== 'undefined') {
        const detailUrl =
          detailPageUrlBuilder?.({ record, formInstanceId: String(formInstanceId) }) ||
          buildDefaultDetailUrl({
            appType,
            formUuid,
            formType,
            formInstanceId: String(formInstanceId),
            basePath: detailBasePath,
          });
        if (detailUrl) {
          window.open(detailUrl, '_blank');
          return;
        }
      }
      setActiveRecord(record);
      setDetailOpen(true);
    },
    [appType, detailBasePath, detailOpenMode, detailPageUrlBuilder, formType, formUuid],
  );

  const handleDelete = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      if (!canDelete) {
        message.error('无权限删除数据');
        return;
      }
      await deleteDataManagementRows(request, { appType, formUuid, formInstanceIds: ids });
      setSelectedRowKeys([]);
      await loadData({ current, pageSize });
    },
    [appType, canDelete, current, formUuid, loadData, pageSize, request],
  );

  const getSelectedRecordIds = useCallback(
    () =>
      selectedRowKeys.map((key) => {
        const record = dataSource.find((item) => String(getRecordId(item)) === String(key));
        return String(getSelectedRecordId(record, key));
      }),
    [dataSource, selectedRowKeys],
  );

  const handleBatchApprove = () => {
    if (!isProcessForm) return;
    if (selectedRowKeys.length === 0) return;
    setBatchApprovalOpen(true);
  };

  const handleBatchApprovalConfirm = async () => {
    const ids = getSelectedRecordIds();
    if (ids.length === 0) return;
    setBatchApproving(true);
    try {
      await batchApproveDataManagementRows(request, {
        appType,
        formUuid,
        formInstanceIds: ids,
        action: batchApprovalAction,
        comments: batchApprovalComments || undefined,
      });
      message.success(`批量${batchApprovalAction === 'approved' ? '通过' : '拒绝'}已提交`);
      setSelectedRowKeys([]);
      setBatchApprovalOpen(false);
      setBatchApprovalAction('approved');
      setBatchApprovalComments('');
      await loadData({ current, pageSize });
    } catch (error) {
      console.error('[DataManagementList] batch approval failed:', error);
      message.error('批量审批失败');
    } finally {
      setBatchApproving(false);
    }
  };

  const handleExport = async (scope: 'selected' | 'all') => {
    if (!canExport) {
      message.error('无权限导出数据');
      return;
    }
    const selectedIds = scope === 'selected' ? getSelectedRecordIds() : [];
    if (scope === 'selected' && selectedIds.length === 0) {
      message.warning('请先选择要导出的记录');
      return;
    }

    const selectedFilterGroup = createSelectedIdFilterGroup(selectedIds);
    const exportFilters =
      scope === 'selected'
        ? combineFilterGroups(forcedConfig?.filter?.group, selectedFilterGroup)
        : combineFilterGroups(forcedConfig?.filter?.group, filterGroup);
    const exportSort = mergeSorts(forcedConfig?.sort, sort);
    const exportSearchKeyWord = combineSearchKeywords(
      forcedConfig?.filter?.searchKeyWord,
      scope === 'selected' ? undefined : searchKeyWord,
    );

    setExporting(true);
    try {
      const response = await exportDataManagementRows(request, {
        appType,
        formUuid,
        currentPage: scope === 'selected' ? 1 : current,
        pageSize: scope === 'selected' ? selectedIds.length : pageSize,
        searchKeyWord: exportSearchKeyWord,
        filters: exportFilters,
        order: exportSort,
        exportAll: scope === 'all' ? 'y' : 'n',
        exportFields,
      });
      await downloadBlobResponse(
        response,
        `${scope === 'selected' ? '选中导出' : '全部导出'}-${formUuid}.xlsx`,
      );
      setExportOpen(false);
    } catch (error) {
      console.error('[DataManagementList] export failed:', error);
      message.error('导出失败');
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    if (!canImport) {
      message.error('无权限导入数据');
      return;
    }
    setTemplateDownloading(true);
    try {
      const response = await downloadDataManagementImportTemplate(request, { appType, formUuid });
      await downloadBlobResponse(response, `导入模板-${formUuid}.xlsx`);
      message.success('模板下载已开始');
    } catch (error) {
      console.error('[DataManagementList] download template failed:', error);
      message.error(error instanceof Error ? error.message : '下载导入模板失败');
    } finally {
      setTemplateDownloading(false);
    }
  };

  const loadTransferRecords = async (type: 'import' | 'export') => {
    if (type === 'import' && !canImport) return;
    if (type === 'export' && !canExport) return;
    setRecordTab(type);
    setRecordsOpen(true);
    const result = await getDataManagementTransferRecords(request, {
      appType,
      formUuid,
      type,
      currentPage: 1,
      pageSize: 10,
    });
    setTransferRecords(result.records);
  };

  const handleImportPreview = async (file: File) => {
    if (!canImport) {
      message.error('无权限导入数据');
      return Upload.LIST_IGNORE;
    }
    const base64 = await fileToBase64(file);
    setImportBase64(base64);
    const result = await importPreviewDataManagementRows(request, {
      appType,
      formUuid,
      fileBase64: base64,
    });
    const records = result?.data || result?.records || result?.list || result || [];
    setImportPreview(Array.isArray(records) ? records : []);
    return false;
  };

  const handleImportConfirm = async () => {
    if (!importBase64) return;
    if (!canImport) {
      message.error('无权限导入数据');
      return;
    }
    await importDataManagementRows(request, { appType, formUuid, fileBase64: importBase64 });
    message.success('导入任务已创建');
    setImportOpen(false);
    setImportPreview([]);
    setImportBase64('');
    await loadData({ current: 1, pageSize });
  };

  const visibleRowActionLimit = normalizeMaxVisibleRowActions(maxVisibleRowActions);
  const rowActionCount =
    1 +
    rowActions.filter((action) => !action.requiredAction || canAction(action.requiredAction))
      .length +
    (canDelete ? 1 : 0) +
    (isProcessForm && canWorkflow ? 1 : 0);
  const actionColumnWidth = Math.max(
    ACTION_COLUMN_MIN_WIDTH,
    Math.min(rowActionCount, visibleRowActionLimit) * ACTION_BUTTON_ESTIMATED_WIDTH +
      (rowActionCount > visibleRowActionLimit ? ACTION_MORE_BUTTON_WIDTH : 0) +
      ACTION_COLUMN_HORIZONTAL_PADDING,
  );

  const columns = useMemo<TableProps<any>['columns']>(() => {
    const baseColumns =
      visibleFields.map((field) => {
        const columnWidth = widths[field.fieldId] || field.width || 160;
        return {
          title: (
            <ResizableColumnTitle
              label={field.label}
              width={columnWidth}
              onResize={(width) => updateColumnWidth(field.fieldId, width)}
              onResizeEnd={(width) => commitColumnWidth(field.fieldId, width)}
            />
          ),
          dataIndex: field.fieldId,
          key: field.fieldId,
          width: columnWidth,
          fixed: lockFieldIds.includes(field.fieldId) ? ('left' as const) : undefined,
          ellipsis: true,
          render: (value: any) => renderCellValue(value, field),
        };
      }) || [];
    return [
      ...baseColumns,
      {
        title: '操作',
        key: '__actions',
        width: actionColumnWidth,
        fixed: 'right' as const,
        render: (_: any, record: any) => {
          const actions: RenderableRowAction[] = [
            {
              key: 'detail',
              label: '详情',
              onClick: () => handleDetail(record),
            },
            ...rowActions
              .filter((action) => !action.requiredAction || canAction(action.requiredAction))
              .map((action) => ({
                key: action.key,
                label: action.label,
                danger: action.danger,
                onClick: () => action.onClick(record),
              })),
            ...(canDelete
              ? [
                  {
                    key: 'delete',
                    label: '删除',
                    danger: true,
                    icon: <DeleteOutlined />,
                    onClick: () =>
                      confirmDanger('确认删除', '删除后不可恢复，确认继续吗？', () =>
                        handleDelete([String(getRecordId(record))]),
                      ),
                  },
                ]
              : []),
            ...(isProcessForm && canWorkflow
              ? [
                  {
                    key: 'workflow',
                    label: '流程日志',
                    icon: <HistoryOutlined />,
                    onClick: () => message.info('请通过 detailRenderer 接入流程日志或流程图入口'),
                  },
                ]
              : []),
          ];
          const visibleActions = actions.slice(0, visibleRowActionLimit);
          const moreActions = actions.slice(visibleRowActionLimit);

          return (
            <Space size={4}>
              {visibleActions.map((action) => (
                <Button
                  key={action.key}
                  type="link"
                  size="small"
                  danger={action.danger}
                  onClick={action.onClick}
                >
                  {action.label}
                </Button>
              ))}
              {moreActions.length > 0 && (
                <Dropdown
                  trigger={['click']}
                  getPopupContainer={getPopupContainer}
                  menu={{
                    items: moreActions.map((action) => ({
                      key: action.key,
                      label: action.label,
                      danger: action.danger,
                      icon: action.icon,
                      onClick: action.onClick,
                    })),
                  }}
                >
                  <Button
                    type="text"
                    size="small"
                    icon={<MoreOutlined />}
                    aria-label="更多操作"
                  />
                </Dropdown>
              )}
            </Space>
          );
        },
      },
    ];
  }, [
    actionColumnWidth,
    confirmDanger,
    commitColumnWidth,
    getPopupContainer,
    handleDelete,
    handleDetail,
    isProcessForm,
    lockFieldIds,
    canAction,
    canDelete,
    canWorkflow,
    rowActions,
    updateColumnWidth,
    visibleRowActionLimit,
    visibleFields,
    widths,
  ]);

  const tableSize = density === 'compact' ? 'small' : density === 'loose' ? 'large' : 'middle';
  const tableScrollX = Math.max(
    900,
    visibleFields.reduce(
      (sum, field) => sum + (widths[field.fieldId] || field.width || 160),
      actionColumnWidth,
    ),
  );

  const importPreviewColumns = useMemo<TableProps<any>['columns']>(() => {
    const keys = Array.from(
      new Set(importPreview.flatMap((record) => Object.keys(record || {}))),
    ).slice(0, 16);
    return keys.map((key) => {
      const field = fields.find((item) => item.fieldId === key || item.id === key);
      return {
        title: field?.label || key,
        dataIndex: key,
        key,
        width: 150,
        ellipsis: true,
        render: (value: any) => (field ? renderCellValue(value, field) : formatPrimitive(value)),
      };
    });
  }, [fields, importPreview]);

  return (
    <ConfigProvider getPopupContainer={getPopupContainer} locale={antdChineseLocale}>
      <div
        ref={rootRef}
        className={`relative w-full bg-ant-bg-layout ${
          fullHeight ? 'flex h-[calc(100vh-88px)] min-h-[560px] overflow-hidden' : ''
        }`}
      >
        <div className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-col px-4 py-4 md:px-6">
          {title && (
            <div className="mb-4">
              <h2 className="m-0 text-xl font-semibold text-ant-color-text">{title}</h2>
            </div>
          )}
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
            <Space wrap>
              {canCreate && (submitRenderer || runtimeFormSchema) && (
                <Button icon={<PlusOutlined />} type="primary" onClick={() => setSubmitOpen(true)}>
                  新增
                </Button>
              )}
              <Input.Search
                allowClear
                className="w-[260px]"
                placeholder="搜索关键字"
                value={searchKeyWord}
                onChange={(event) => setSearchKeyWord(event.target.value)}
                onSearch={(value) => {
                  const nextSearchKeyWord = String(value || '');
                  setSearchKeyWord(nextSearchKeyWord);
                  persistConfig({
                    filter: { searchKeyWord: nextSearchKeyWord, group: filterGroup },
                  });
                  loadData({
                    current: 1,
                    pageSize,
                    searchKeyWord: nextSearchKeyWord,
                    filterGroup,
                  });
                }}
              />
              <Button icon={<FilterOutlined />} onClick={() => setFilterOpen(true)}>
                筛选
              </Button>
              <Button icon={<SettingOutlined />} onClick={() => setColumnOpen(true)}>
                列设置
              </Button>
              {canExport && (
                <Dropdown
                  getPopupContainer={getPopupContainer}
                  menu={{
                    items: [
                      {
                        key: 'all',
                        label: '导出全部',
                        onClick: () => {
                          setExportScope('all');
                          setExportFields(showFields);
                          setExportOpen(true);
                        },
                      },
                      {
                        key: 'records',
                        label: '导出记录',
                        onClick: () => loadTransferRecords('export'),
                      },
                    ],
                  }}
                >
                  <Button icon={<DownloadOutlined />}>导出</Button>
                </Dropdown>
              )}
              {canImport && (
                <Dropdown
                  getPopupContainer={getPopupContainer}
                  menu={{
                    items: [
                      { key: 'import', label: '导入数据', onClick: () => setImportOpen(true) },
                      {
                        key: 'records',
                        label: '导入记录',
                        onClick: () => loadTransferRecords('import'),
                      },
                    ],
                  }}
                >
                  <Button icon={<ImportOutlined />}>导入</Button>
                </Dropdown>
              )}
              <Button icon={<ReloadOutlined />} onClick={() => loadData({ current, pageSize })} />
            </Space>
          </div>

          {selectedRowKeys.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ant-border-secondary bg-ant-bg-container px-4 py-3 shadow-sm">
              <span className="text-sm text-ant-color-text-secondary">
                已选 {selectedRowKeys.length} 条
              </span>
              <Space wrap>
                {canExport && (
                  <Button
                    icon={<DownloadOutlined />}
                    onClick={() => {
                      setExportScope('selected');
                      setExportFields(showFields);
                      setExportOpen(true);
                    }}
                  >
                    导出选中
                  </Button>
                )}
                {isProcessForm && canWorkflow && (
                  <Button icon={<SwapOutlined />} onClick={handleBatchApprove}>
                    批量审批
                  </Button>
                )}
                {canDelete && (
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() =>
                      confirmDanger(
                        '确认批量删除',
                        `将删除 ${selectedRowKeys.length} 条数据，确认继续吗？`,
                        () => handleDelete(selectedRowKeys.map(String)),
                      )
                    }
                  >
                    批量删除
                  </Button>
                )}
                <Button type="link" onClick={() => setSelectedRowKeys([])}>
                  取消选择
                </Button>
              </Space>
            </div>
          )}

          <div className="relative flex-1 overflow-hidden rounded-lg border border-ant-border-secondary bg-ant-bg-container">
            <Table
              rowKey={(record) => String(getRecordId(record))}
              loading={loading || schemaLoading}
              columns={columns}
              dataSource={dataSource}
              size={tableSize as TableProps<any>['size']}
              scroll={{
                x: tableScrollX,
                y: fullHeight
                  ? selectedRowKeys.length > 0
                    ? 'calc(100vh - 360px)'
                    : 'calc(100vh - 300px)'
                  : undefined,
              }}
              rowSelection={{
                selectedRowKeys,
                onChange: setSelectedRowKeys,
              }}
              pagination={{
                current,
                pageSize,
                total,
                showSizeChanger: true,
                showTotal: (count) => `共 ${count} 条`,
              }}
              onChange={(pagination) => {
                loadData({
                  current: pagination.current || 1,
                  pageSize: pagination.pageSize || pageSize,
                  sort,
                });
              }}
            />
          </div>
        </div>

        <Modal
          getContainer={getOverlayContainer}
          title="高级筛选"
          open={filterOpen}
          width={760}
          onCancel={() => setFilterOpen(false)}
          onOk={() => {
            setFilterOpen(false);
            persistConfig({ filter: { searchKeyWord, group: filterGroup } });
            loadData({ current: 1, pageSize, searchKeyWord, filterGroup });
          }}
          okText="应用筛选"
        >
          {showForcedConfig && hasFilterContent(forcedConfig?.filter?.group) && (
            <Alert
              className="mb-4"
              type="info"
              showIcon
              message="当前列表包含页面强制筛选条件"
              description="这些条件由页面设计配置固定生效，个人筛选会在此基础上继续叠加。"
            />
          )}
          <FilterGroupEditor
            group={filterGroup}
            fields={fields}
            api={api}
            onChange={setFilterGroup}
          />
        </Modal>

        <Modal
          getContainer={getOverlayContainer}
          title="列设置"
          open={columnOpen}
          width={920}
          onCancel={() => setColumnOpen(false)}
          onOk={handleColumnCommit}
        >
          <div className="space-y-5">
            <div>
              <div className="mb-2 text-sm font-medium text-ant-color-text">显示列</div>
              <Checkbox.Group
                className="grid grid-cols-2 gap-2 md:grid-cols-3"
                value={showFields}
                options={fields.map((field) => ({
                  label: field.label,
                  value: field.fieldId,
                  disabled: forcedShowFieldIds.has(field.fieldId),
                }))}
                onChange={(values) =>
                  setShowFields(
                    uniqueStrings([...Array.from(forcedShowFieldIds), ...values.map(String)]),
                  )
                }
              />
            </div>
            <div>
              <div className="mb-2 text-sm font-medium text-ant-color-text">冻结列</div>
              <Select
                mode="multiple"
                className="w-full"
                value={lockFieldIds}
                options={showFields.map((fieldId) => {
                  const field = fields.find((item) => item.fieldId === fieldId);
                  return {
                    label: field?.label || fieldId,
                    value: fieldId,
                    disabled: forcedLockFieldIds.has(fieldId),
                  };
                })}
                onChange={(values) =>
                  setLockFieldIds(uniqueStrings([...Array.from(forcedLockFieldIds), ...values]))
                }
              />
            </div>
            <Divider className="my-1" />
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-ant-color-text">排序规则</span>
                <Button size="small" onClick={handleAddSort} disabled={fields.length === 0}>
                  添加排序
                </Button>
              </div>
              <div className="space-y-2">
                {sort.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-ant-border-secondary px-3 py-4 text-center text-sm text-ant-color-text-tertiary">
                    暂无排序规则
                  </div>
                ) : (
                  sort.map((item, index) => (
                    <div key={`${item.id}_${index}`} className="flex items-center gap-2">
                      <Select
                        className="min-w-0 flex-1"
                        value={item.id}
                        options={fields.map((field) => ({
                          label: field.label,
                          value: field.fieldId,
                        }))}
                        onChange={(value) => handleSortChange(index, { id: value })}
                      />
                      <Segmented
                        value={item.isAsc}
                        options={[
                          { label: '升序', value: 'y' },
                          { label: '降序', value: 'n' },
                        ]}
                        onChange={(value) => handleSortChange(index, { isAsc: value as 'y' | 'n' })}
                      />
                      <Button
                        danger
                        type="text"
                        icon={<DeleteOutlined />}
                        onClick={() => handleRemoveSort(index)}
                      />
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <div className="mb-2 text-sm font-medium text-ant-color-text">表格密度</div>
                <Segmented
                  block
                  value={density}
                  options={[
                    { label: '紧凑', value: 'compact' },
                    { label: '标准', value: 'middle' },
                    { label: '宽松', value: 'loose' },
                  ]}
                  onChange={(value) => setDensity(value as DataManagementDensity)}
                />
              </div>
              <div>
                <div className="mb-2 text-sm font-medium text-ant-color-text">详情打开方式</div>
                <Segmented
                  block
                  value={detailOpenMode}
                  options={[
                    { label: '抽屉', value: 'drawer' },
                    { label: '新页', value: 'newPage' },
                  ]}
                  onChange={(value) => setDetailOpenMode(value as 'drawer' | 'newPage')}
                />
              </div>
              <div>
                <div className="mb-2 text-sm font-medium text-ant-color-text">页大小</div>
                <Select
                  className="w-full"
                  value={pageSize}
                  options={[10, 20, 50, 100].map((value) => ({ label: `${value} 条`, value }))}
                  onChange={setPageSize}
                />
              </div>
            </div>
          </div>
        </Modal>

        <Modal
          getContainer={getOverlayContainer}
          title={exportScope === 'selected' ? '导出选中数据' : '导出全部数据'}
          open={exportOpen}
          onCancel={() => setExportOpen(false)}
          footer={
            <Space>
              <Button onClick={() => setExportOpen(false)}>取消</Button>
              <Button
                type="primary"
                loading={exporting}
                disabled={exportScope === 'selected' && selectedRowKeys.length === 0}
                onClick={() => handleExport(exportScope)}
              >
                {exportScope === 'selected' ? `导出选中 (${selectedRowKeys.length})` : '导出全部'}
              </Button>
            </Space>
          }
        >
          <Checkbox.Group
            className="grid grid-cols-2 gap-2"
            value={exportFields}
            options={fields.map((field) => ({ label: field.label, value: field.fieldId }))}
            onChange={(values) => setExportFields(values.map(String))}
          />
        </Modal>

        <Modal
          getContainer={getOverlayContainer}
          title="批量审批"
          open={batchApprovalOpen}
          onCancel={() => setBatchApprovalOpen(false)}
          onOk={handleBatchApprovalConfirm}
          okText={batchApprovalAction === 'approved' ? '确认通过' : '确认拒绝'}
          confirmLoading={batchApproving}
        >
          <div className="space-y-4">
            <div className="text-sm text-ant-color-text-secondary">
              已选择 {selectedRowKeys.length} 条记录
            </div>
            <Segmented
              block
              value={batchApprovalAction}
              options={[
                { label: '同意', value: 'approved' },
                { label: '拒绝', value: 'rejected' },
              ]}
              onChange={(value) => setBatchApprovalAction(value as 'approved' | 'rejected')}
            />
            <Input.TextArea
              value={batchApprovalComments}
              rows={4}
              maxLength={500}
              showCount
              placeholder="填写审批意见"
              onChange={(event) => setBatchApprovalComments(event.target.value)}
            />
          </div>
        </Modal>

        <Modal
          getContainer={getOverlayContainer}
          title="导入数据"
          open={importOpen}
          width={720}
          onCancel={() => setImportOpen(false)}
          onOk={handleImportConfirm}
          okButtonProps={{ disabled: !importBase64 || !canImport }}
          okText="确认导入"
        >
          <div className="mb-3 flex flex-col gap-3 rounded-lg border border-ant-border-secondary bg-ant-bg-container px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-medium text-ant-color-text">导入模板</div>
              <div className="mt-1 text-xs text-ant-color-text-secondary">
                先下载模板填写数据，再上传 Excel 文件导入
              </div>
            </div>
            <Button
              icon={<DownloadOutlined />}
              loading={templateDownloading}
              disabled={!canImport}
              onClick={handleDownloadTemplate}
            >
              下载导入模板
            </Button>
          </div>
          <Upload.Dragger
            accept=".xlsx,.xls"
            maxCount={1}
            beforeUpload={handleImportPreview}
            onRemove={() => {
              setImportBase64('');
              setImportPreview([]);
            }}
          >
            <p className="text-ant-color-text-secondary">拖拽 Excel 文件到此处，或点击选择文件</p>
          </Upload.Dragger>
          {importPreview.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-sm font-medium text-ant-color-text">导入预览</div>
              <Table
                size="small"
                dataSource={importPreview}
                columns={importPreviewColumns}
                scroll={{ x: Math.max(600, (importPreviewColumns?.length || 0) * 150) }}
                pagination={false}
                rowKey={(_, index) => String(index)}
              />
            </div>
          )}
        </Modal>

        <Drawer
          styles={{ body: { padding: 24, overflow: 'auto' } }}
          getContainer={getOverlayContainer}
          title={recordTab === 'import' ? '导入记录' : '导出记录'}
          open={recordsOpen}
          size={drawerWidth}
          onClose={() => setRecordsOpen(false)}
        >
          <Segmented
            value={recordTab}
            options={[
              ...(canImport ? [{ label: '导入记录', value: 'import' }] : []),
              ...(canExport ? [{ label: '导出记录', value: 'export' }] : []),
            ]}
            onChange={(value) => loadTransferRecords(value as 'import' | 'export')}
          />
          <Table
            className="mt-4"
            size="small"
            dataSource={transferRecords}
            rowKey={(record) => record.id || record.recordId}
          />
        </Drawer>

        <Drawer
          styles={{ body: { padding: 0, overflow: 'auto' } }}
          getContainer={getOverlayContainer}
          title="详情"
          open={detailOpen}
          size={drawerWidth}
          onClose={() => setDetailOpen(false)}
          destroyOnClose
        >
          {activeRecord && detailRenderer ? (
            detailRenderer({
              record: activeRecord,
              formInstanceId: String(getRecordId(activeRecord)),
              onClose: () => setDetailOpen(false),
            })
          ) : activeRecord && runtimeFormSchema ? (
            <StandardFormPage
              schema={runtimeFormSchema}
              mode={isProcessForm ? 'process' : 'detail'}
              appType={appType}
              formUuid={formUuid}
              formInstanceId={String(getRecordId(activeRecord))}
              api={api}
              components={components}
              inDrawer
            />
          ) : (
            <Empty description="请通过 detailRenderer 接入详情模板" />
          )}
        </Drawer>

        <Drawer
          styles={{ body: { padding: 0, overflow: 'auto' } }}
          getContainer={getOverlayContainer}
          title="新增数据"
          open={submitOpen}
          size={drawerWidth}
          onClose={() => setSubmitOpen(false)}
          destroyOnClose
        >
          {submitRenderer ? (
            submitRenderer({
              onClose: () => setSubmitOpen(false),
              onSubmitted: () => {
                setSubmitOpen(false);
                loadData({ current: 1, pageSize });
              },
            })
          ) : runtimeFormSchema ? (
            <StandardFormPage
              schema={runtimeFormSchema}
              mode="submit"
              appType={appType}
              formUuid={formUuid}
              api={api}
              components={components}
              inDrawer
              onSubmitSuccess={() => {
                setSubmitOpen(false);
                loadData({ current: 1, pageSize });
              }}
            />
          ) : (
            <Empty description="请通过 submitRenderer 接入提交模板" />
          )}
        </Drawer>
      </div>
    </ConfigProvider>
  );
};
