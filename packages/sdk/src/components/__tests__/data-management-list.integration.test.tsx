import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import React from 'react';

// --- hoist mocks ---
const { apiMocks, messageMocks, confirmMockFn, standardFormPageMock } = vi.hoisted(() => ({
  apiMocks: {
    advancedSearch: vi.fn(),
    getSchema: vi.fn(),
    getConfig: vi.fn(),
    saveConfig: vi.fn(),
    deleteRows: vi.fn(),
    batchApprove: vi.fn(),
    exportRows: vi.fn(),
    downloadTemplate: vi.fn(),
    importPreview: vi.fn(),
    importRows: vi.fn(),
    getTransferRecords: vi.fn(),
    getActionSummary: vi.fn(),
  },
  messageMocks: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  confirmMockFn: vi.fn(() => true),
  standardFormPageMock: vi.fn(),
}));

// --- mock antd ---
vi.mock('antd', () => {
  const Button = ({
    children,
    icon,
    onClick,
    disabled,
    loading,
    danger,
    type,
    className,
    ...rest
  }: any) =>
    React.createElement(
      'button',
      {
        ...rest,
        type: 'button',
        onClick,
        disabled: disabled || loading,
        className,
        'data-danger': danger ? 'true' : undefined,
        'data-btn-type': type,
      },
      icon,
      children,
    );

  const Input = Object.assign(
    ({ value, onChange, placeholder, className, readOnly }: any) =>
      React.createElement('input', {
        value: value ?? '',
        onChange,
        placeholder,
        className,
        readOnly,
      }),
    {
      Search: ({ value, onChange, onSearch, placeholder, className }: any) =>
        React.createElement(
          'div',
          { className },
          React.createElement('input', {
            value: value ?? '',
            onChange,
            placeholder,
            'data-testid': 'search-input',
          }),
          React.createElement(
            'button',
            { type: 'button', onClick: () => onSearch?.(value), 'data-testid': 'search-btn' },
            'Search',
          ),
        ),
      TextArea: ({ value, onChange, placeholder }: any) =>
        React.createElement('textarea', {
          value: value ?? '',
          onChange,
          placeholder,
          'data-testid': 'textarea',
        }),
    },
  );

  const InputNumber = ({ value, onChange, placeholder, className }: any) =>
    React.createElement('input', {
      value: value ?? '',
      onChange: (event: any) =>
        onChange?.(event.target.value === '' ? null : Number(event.target.value)),
      placeholder,
      className,
    });

  const DatePickerBase = ({ value, onChange, placeholder, className }: any) =>
    React.createElement('input', {
      value: value ? String(value) : '',
      onChange: (event: any) => onChange?.(event.target.value || null),
      placeholder,
      className,
      'data-testid': 'date-picker',
    });

  const DatePicker = Object.assign(DatePickerBase, {
    RangePicker: ({ onChange, className }: any) =>
      React.createElement('input', {
        className,
        placeholder: '选择日期范围',
        'data-testid': 'range-picker',
        onChange: (event: any) => {
          const parts = String(event.target.value || '').split(',');
          onChange?.(parts.length === 2 ? parts : null);
        },
      }),
  });

  const Table = ({
    dataSource,
    columns,
    loading,
    rowSelection,
    pagination,
    onChange,
    rowKey,
  }: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'table', 'data-loading': loading ? 'true' : undefined },
      React.createElement(
        'span',
        { 'data-testid': 'table-total' },
        `rows:${dataSource?.length || 0}`,
      ),
      React.createElement(
        'div',
        { 'data-testid': 'table-headers' },
        columns?.map((col: any) =>
          React.createElement(
            'div',
            { key: col.key, 'data-testid': `header-${col.key}` },
            col.title,
          ),
        ),
      ),
      pagination &&
        React.createElement(
          'div',
          { 'data-testid': 'pagination' },
          React.createElement(
            'span',
            { 'data-testid': 'pagination-total' },
            pagination.showTotal?.(pagination.total || 0),
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              'data-testid': 'next-page',
              onClick: () => onChange?.({ current: 2, pageSize: pagination.pageSize }),
            },
            'Next',
          ),
        ),
      dataSource?.map((record: any, index: number) => {
        const key = typeof rowKey === 'function' ? rowKey(record) : record[rowKey] || index;
        return React.createElement(
          'div',
          { key, 'data-testid': `row-${index}` },
          columns?.map((col: any) =>
            React.createElement(
              'span',
              { key: col.key, 'data-testid': `cell-${col.key}` },
              typeof col.render === 'function'
                ? col.render(record[col.dataIndex], record, index)
                : record[col.dataIndex],
            ),
          ),
          rowSelection &&
            React.createElement('input', {
              type: 'checkbox',
              'data-testid': `select-${index}`,
              checked: rowSelection.selectedRowKeys?.includes(key),
              onChange: () => {
                const keys = rowSelection.selectedRowKeys || [];
                const next = keys.includes(key)
                  ? keys.filter((k: any) => k !== key)
                  : [...keys, key];
                rowSelection.onChange?.(next);
              },
            }),
        );
      }),
    );

  const Select = ({ value, onChange, options, mode, placeholder, className }: any) =>
    React.createElement(
      'select',
      {
        value: mode === 'multiple' ? undefined : (value ?? ''),
        onChange: (e: any) => onChange?.(e.target.value),
        'data-testid': 'select',
        className,
      },
      React.createElement('option', { value: '' }, placeholder || ''),
      (options || []).map((o: any) =>
        React.createElement('option', { key: o.value, value: o.value }, o.label),
      ),
    );

  const Cascader = ({ value, onChange, options, placeholder, className }: any) =>
    React.createElement(
      'select',
      {
        value: Array.isArray(value) ? value[value.length - 1] || '' : '',
        onChange: (e: any) => onChange?.([e.target.value]),
        'data-testid': 'cascader',
        className,
      },
      React.createElement('option', { value: '' }, placeholder || ''),
      (options || []).map((o: any) =>
        React.createElement('option', { key: o.value, value: o.value }, o.label),
      ),
    );

  const Checkbox = Object.assign(() => null, {
    Group: ({ value, options, onChange, className }: any) =>
      React.createElement(
        'div',
        { 'data-testid': 'checkbox-group', className },
        (options || []).map((o: any) =>
          React.createElement(
            'label',
            { key: o.value },
            React.createElement('input', {
              type: 'checkbox',
              checked: (value || []).includes(o.value),
              onChange: () => {
                const next = (value || []).includes(o.value)
                  ? (value || []).filter((v: string) => v !== o.value)
                  : [...(value || []), o.value];
                onChange?.(next);
              },
            }),
            o.label,
          ),
        ),
      ),
  });

  const Modal = ({ title, open, children, onOk, onCancel, footer, okText, okButtonProps }: any) =>
    open
      ? React.createElement(
          'div',
          { role: 'dialog', 'aria-label': title },
          React.createElement('h2', null, title),
          children,
          footer ??
            React.createElement(
              'div',
              null,
              React.createElement(
                'button',
                {
                  type: 'button',
                  onClick: onOk,
                  'data-testid': 'modal-ok',
                  disabled: okButtonProps?.disabled,
                },
                okText || '确定',
              ),
              React.createElement(
                'button',
                { type: 'button', onClick: onCancel, 'data-testid': 'modal-cancel' },
                '取消',
              ),
            ),
        )
      : null;

  const Drawer = ({ title, open, children, onClose, getContainer }: any) =>
    open
      ? React.createElement(
          'div',
          {
            role: 'complementary',
            'aria-label': title,
            'data-get-container': getContainer === false ? 'false' : typeof getContainer,
          },
          React.createElement('h2', null, title),
          children,
          React.createElement(
            'button',
            { type: 'button', onClick: onClose, 'data-testid': 'drawer-close' },
            'Close',
          ),
        )
      : null;

  const Tag = ({ children, color }: any) =>
    React.createElement('span', { 'data-color': color, className: 'tag' }, children);
  const Tooltip = ({ children }: any) => React.createElement('span', null, children);
  const Space = ({ children, wrap }: any) =>
    React.createElement('div', { className: 'space', 'data-wrap': wrap }, children);
  const Segmented = ({ value, options, onChange }: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'segmented' },
      (options || []).map((o: any) => {
        const optVal = typeof o === 'object' ? o.value : o;
        const optLabel = typeof o === 'object' ? o.label : o;
        return React.createElement(
          'button',
          {
            key: optVal,
            type: 'button',
            onClick: () => onChange?.(optVal),
            'data-selected': value === optVal ? 'true' : undefined,
          },
          optLabel,
        );
      }),
    );

  const Empty = Object.assign(
    ({ description }: any) => React.createElement('div', { 'data-testid': 'empty' }, description),
    { PRESENTED_IMAGE_SIMPLE: 'simple' },
  );
  const Divider = () => React.createElement('hr');
  const Dropdown = ({ children, menu }: any) =>
    React.createElement(
      'div',
      null,
      children,
      React.createElement(
        'div',
        { 'data-testid': 'dropdown-menu' },
        menu?.items?.map((item: any) =>
          React.createElement(
            'button',
            {
              key: item.key,
              type: 'button',
              onClick: item.onClick,
              'data-testid': `menu-${item.key}`,
            },
            item.label,
          ),
        ),
      ),
    );

  const Upload = Object.assign(() => null, {
    Dragger: ({ children, beforeUpload, onRemove }: any) =>
      React.createElement(
        'div',
        { 'data-testid': 'upload-dragger' },
        children,
        React.createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'upload-trigger',
            onClick: () => {
              const file = new File(['test'], 'test.xlsx', {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              });
              beforeUpload?.(file);
            },
          },
          'Upload',
        ),
        React.createElement(
          'button',
          { type: 'button', 'data-testid': 'upload-remove', onClick: onRemove },
          'Remove',
        ),
      ),
  });

  const ConfigProvider = ({ children }: any) => React.createElement('div', null, children);
  const Avatar = ({ children }: any) =>
    React.createElement('span', { 'data-testid': 'avatar' }, children);
  const Alert = ({ message, description }: any) =>
    React.createElement('div', { role: 'alert' }, message, description);
  const message = messageMocks;

  return {
    Alert,
    Button,
    Cascader,
    DatePicker,
    Input,
    InputNumber,
    Table,
    Select,
    Checkbox,
    Modal,
    Drawer,
    Tag,
    Tooltip,
    Space,
    Segmented,
    Empty,
    Divider,
    Dropdown,
    Upload,
    ConfigProvider,
    Avatar,
    message,
  };
});

vi.mock('@ant-design/icons', () => {
  const icon = (name: string) => (props: any) =>
    React.createElement('span', { 'data-icon': name, ...props });
  return {
    DeleteOutlined: icon('delete'),
    DownloadOutlined: icon('download'),
    FilterOutlined: icon('filter'),
    HistoryOutlined: icon('history'),
    ImportOutlined: icon('import'),
    MoreOutlined: icon('more'),
    PlusOutlined: icon('plus'),
    ReloadOutlined: icon('reload'),
    SettingOutlined: icon('setting'),
    SwapOutlined: icon('swap'),
    ApartmentOutlined: icon('apartment'),
    CalendarOutlined: icon('calendar'),
    DesktopOutlined: icon('desktop'),
    FileTextOutlined: icon('file-text'),
    UserOutlined: icon('user'),
    CheckOutlined: icon('check'),
    CloseOutlined: icon('close'),
    RollbackOutlined: icon('rollback'),
    SaveOutlined: icon('save'),
  };
});

vi.mock('../core/runtimeApi', () => ({
  createFormRuntimeApi: (config?: any) => ({
    request: config?.request || vi.fn(),
  }),
}));

vi.mock('../templates/StandardFormPage', () => ({
  StandardFormPage: (props: any) => {
    standardFormPageMock(props);
    return React.createElement('div', { 'data-testid': 'standard-form-page' });
  },
}));

vi.mock('../core/dataManagementApi', () => ({
  advancedSearchDataManagement: (...args: any[]) => apiMocks.advancedSearch(...args),
  getDataManagementSchema: (...args: any[]) => apiMocks.getSchema(...args),
  getDataManagementConfig: (...args: any[]) => apiMocks.getConfig(...args),
  saveDataManagementConfig: (...args: any[]) => apiMocks.saveConfig(...args),
  deleteDataManagementRows: (...args: any[]) => apiMocks.deleteRows(...args),
  batchApproveDataManagementRows: (...args: any[]) => apiMocks.batchApprove(...args),
  exportDataManagementRows: (...args: any[]) => apiMocks.exportRows(...args),
  downloadDataManagementImportTemplate: (...args: any[]) => apiMocks.downloadTemplate(...args),
  importPreviewDataManagementRows: (...args: any[]) => apiMocks.importPreview(...args),
  importDataManagementRows: (...args: any[]) => apiMocks.importRows(...args),
  getDataManagementTransferRecords: (...args: any[]) => apiMocks.getTransferRecords(...args),
  getDataManagementActionSummary: (...args: any[]) => apiMocks.getActionSummary(...args),
  FORM_ACTION_PERMISSIONS: ['view', 'create', 'edit', 'delete', 'export', 'import', 'workflow'],
  getSystemFieldsForFormType: (formType?: string) =>
    formType === 'process'
      ? [
          {
            id: 'processInstanceStatus',
            fieldId: 'processInstanceStatus',
            label: '流程状态',
            componentName: 'TextField',
            system: true,
            processOnly: true,
          },
          {
            id: 'approvalResult',
            fieldId: 'approvalResult',
            label: '审批结果',
            componentName: 'TextField',
            system: true,
            processOnly: true,
          },
        ]
      : [
          {
            id: 'createdBy',
            fieldId: 'createdBy',
            label: '创建人',
            componentName: 'TextField',
            system: true,
          },
          {
            id: 'createdAt',
            fieldId: 'createdAt',
            label: '创建时间',
            componentName: 'DateField',
            system: true,
          },
        ],
  normalizeColumnConfig: (config: any, allFields: any[]) => ({
    showFields: config?.showFields || allFields.map((f: any) => f.fieldId),
    widths: config?.widths || {},
    lockFieldIds: config?.lockFieldIds || [],
    sort: config?.sort || [],
    density: config?.density || 'middle',
    detailOpenMode: config?.detailOpenMode || 'drawer',
    pageSize: config?.pageSize || 10,
  }),
  normalizeDataManagementFields: (payload: any) => {
    const schema = payload?.schema;
    return {
      fields: Array.isArray(schema?.fields) ? schema.fields : [],
      formType: schema?.template?.formType,
      schema,
    };
  },
}));

vi.mock('../utils/confirmAction', () => ({
  confirmAction: (...args: any[]) => confirmMockFn(...args),
}));

const FIELDS = [
  { id: 'name', fieldId: 'name', label: '姓名', componentName: 'TextField' },
  { id: 'age', fieldId: 'age', label: '年龄', componentName: 'NumberField' },
  {
    id: 'status',
    fieldId: 'status',
    label: '状态',
    componentName: 'SelectField',
    options: [
      { label: '启用', value: 'active' },
      { label: '禁用', value: 'disabled' },
    ],
  },
];

const RECORDS = [
  { formInstanceId: 'inst-1', name: '张三', age: 25, status: 'active' },
  { formInstanceId: 'inst-2', name: '李四', age: 30, status: 'disabled' },
  { formInstanceId: 'inst-3', name: '王五', age: 28, status: 'active' },
];

function buildTestSchema(fields: any[] = FIELDS, formType = 'form') {
  return {
    formMeta: { appType: 'test-app', formUuid: 'form-1', title: '测试表单' },
    template: { type: 'standard', formType },
    fields,
    layout: fields
      .filter((field) => !field.system)
      .map((field) => ({
        id: `layout_${field.fieldId}`,
        type: 'field' as const,
        fieldId: field.fieldId,
      })),
  };
}

function setupDefaultMocks(options?: { formType?: string; config?: any }) {
  const formType = options?.formType || 'form';
  apiMocks.getSchema.mockResolvedValue({
    fields: FIELDS,
    formType,
    schema: buildTestSchema(FIELDS, formType),
  });
  apiMocks.getConfig.mockResolvedValue(options?.config || {});
  apiMocks.saveConfig.mockResolvedValue(undefined);
  apiMocks.advancedSearch.mockResolvedValue({ records: RECORDS, total: 3 });
  apiMocks.deleteRows.mockResolvedValue(undefined);
  apiMocks.batchApprove.mockResolvedValue(undefined);
  apiMocks.exportRows.mockResolvedValue(undefined);
  apiMocks.downloadTemplate.mockResolvedValue(new Blob(['data']));
  apiMocks.importPreview.mockResolvedValue({ data: [{ name: '预览' }] });
  apiMocks.importRows.mockResolvedValue(undefined);
  apiMocks.getTransferRecords.mockResolvedValue({ records: [{ id: 'r1', type: 'export' }] });
  apiMocks.getActionSummary.mockResolvedValue({
    can: {
      view: true,
      create: true,
      edit: true,
      delete: true,
      export: true,
      import: true,
      workflow: true,
    },
  });
}

function readVisibleRowActionLabels(row: HTMLElement) {
  return within(row)
    .getAllByRole('button')
    .filter((button) => button.getAttribute('data-btn-type') === 'link')
    .map((button) => button.textContent || '');
}

import {
  DataManagementList,
  isProcessFormType,
  resolveDataManagementPopupContainer,
  resolveDataManagementPortalContainer,
} from '../modules/DataManagementList';

describe('DataManagementList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.history.pushState({}, '', '/');
  });

  it('renders and loads data on mount', async () => {
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => {
      expect(apiMocks.getSchema).toHaveBeenCalled();
      expect(apiMocks.advancedSearch).toHaveBeenCalled();
    });
    expect(screen.getByTestId('table')).toBeTruthy();
  });

  it('uses provided schema without requesting schema endpoint', async () => {
    render(
      <DataManagementList
        appType="test-app"
        formUuid="form-1"
        schema={{
          formMeta: { appType: 'test-app', formUuid: 'form-1', title: '测试表单' },
          template: { type: 'standard', formType: 'form' },
          fields: FIELDS,
          layout: FIELDS.map((field) => ({
            id: `layout_${field.fieldId}`,
            type: 'field' as const,
            fieldId: field.fieldId,
          })),
        }}
      />,
    );

    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
    expect(apiMocks.getSchema).not.toHaveBeenCalled();
    expect(screen.getByTestId('header-name')).toHaveTextContent('姓名');
  });

  it('renders the configured header title without selection summary', async () => {
    render(<DataManagementList appType="test-app" formUuid="form-1" title="自定义标题" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
    expect(screen.getByText('自定义标题')).toBeTruthy();
    expect(screen.queryByText(/已选择 \d+ 条/)).toBeNull();
  });

  it('shows submit button when submitRenderer is provided and not readonly', async () => {
    const submitRenderer = vi.fn(() => React.createElement('div', null, 'submit-form'));
    render(
      <DataManagementList appType="test-app" formUuid="form-1" submitRenderer={submitRenderer} />,
    );
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
    expect(screen.getByText('新增')).toBeTruthy();
  });

  it('opens submit drawer through a portal container', async () => {
    const submitRenderer = vi.fn(() => React.createElement('div', null, 'submit-form'));
    render(
      <DataManagementList appType="test-app" formUuid="form-1" submitRenderer={submitRenderer} />,
    );
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());

    await act(async () => {
      fireEvent.click(screen.getByText('新增'));
    });

    const drawer = screen.getByRole('complementary', { name: '新增数据' });
    expect(drawer.getAttribute('data-get-container')).toBe('function');
    expect(submitRenderer).toHaveBeenCalled();
  });

  it('does not show submit button when readonly', async () => {
    const submitRenderer = vi.fn(() => React.createElement('div', null, 'submit'));
    render(
      <DataManagementList
        appType="test-app"
        formUuid="form-1"
        readonly
        submitRenderer={submitRenderer}
      />,
    );
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
    expect(screen.queryByText('新增')).toBeNull();
  });

  it('opens filter modal on filter button click', async () => {
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
    fireEvent.click(screen.getByText('筛选'));
    expect(screen.getByText('高级筛选')).toBeTruthy();
  });

  it('opens column setting modal', async () => {
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
    fireEvent.click(screen.getByText('列设置'));
    expect(screen.getByText('显示列')).toBeTruthy();
    expect(screen.getByText('冻结列')).toBeTruthy();
    expect(screen.getByText('表格密度')).toBeTruthy();
    expect(screen.getByText('详情打开方式')).toBeTruthy();
  });

  it('triggers search on search input', async () => {
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
    const searchBtn = screen.getByTestId('search-btn');
    await act(async () => {
      fireEvent.click(searchBtn);
    });
    expect(apiMocks.advancedSearch).toHaveBeenCalledTimes(2);
  });

  it('refreshes data on reload button click', async () => {
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
    apiMocks.advancedSearch.mockClear();
    const reloadBtns = screen.getAllByRole('button');
    const reloadBtn = reloadBtns.find((b) => b.querySelector('[data-icon="reload"]'));
    if (reloadBtn) {
      await act(async () => {
        fireEvent.click(reloadBtn);
      });
    }
    expect(apiMocks.advancedSearch).toHaveBeenCalled();
  });

  it('handles export all flow', async () => {
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
    const exportAllBtn = screen.getByTestId('menu-all');
    await act(async () => {
      fireEvent.click(exportAllBtn);
    });
    expect(screen.getByText('导出全部数据')).toBeTruthy();
  });

  it('handles export records view', async () => {
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
    const recordsBtns = screen.getAllByTestId('menu-records');
    await act(async () => {
      fireEvent.click(recordsBtns[0]);
    });
    await waitFor(() => expect(apiMocks.getTransferRecords).toHaveBeenCalled());
  });

  it('opens import modal when not readonly', async () => {
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
    const importBtns = screen.getAllByTestId('menu-import');
    await act(async () => {
      fireEvent.click(importBtns[0]);
    });
    expect(screen.getByRole('dialog', { name: '导入数据' })).toBeTruthy();
  });

  it('handles detail drawer via click', async () => {
    const detailRenderer = vi.fn(({ record }) =>
      React.createElement('div', null, 'detail-', record.name),
    );
    render(
      <DataManagementList appType="test-app" formUuid="form-1" detailRenderer={detailRenderer} />,
    );
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
    const detailBtns = screen.getAllByText('详情');
    if (detailBtns.length > 0) {
      await act(async () => {
        fireEvent.click(detailBtns[0]);
      });
      await waitFor(() => expect(detailRenderer).toHaveBeenCalled());
      expect(
        screen.getByRole('complementary', { name: '详情' }).getAttribute('data-get-container'),
      ).toBe('function');
    }
  });

  it('passes a custom component registry into the built-in detail drawer', async () => {
    const CustomJsonField = () => React.createElement('div', null, 'structured-json');
    const components = { JSONField: CustomJsonField };
    render(
      <DataManagementList
        appType="test-app"
        formUuid="form-1"
        components={components}
      />,
    );
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());

    await act(async () => {
      fireEvent.click(screen.getAllByText('详情')[0]);
    });

    await waitFor(() => expect(standardFormPageMock).toHaveBeenCalled());
    expect(standardFormPageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'detail',
        components,
      }),
    );
  });

  it('renders with fullHeight=false', async () => {
    render(<DataManagementList appType="test-app" formUuid="form-1" fullHeight={false} />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
  });

  it('handles schema load failure', async () => {
    apiMocks.getSchema.mockRejectedValue(new Error('network'));
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(messageMocks.error).toHaveBeenCalledWith('network'));
  });

  it('handles data load failure', async () => {
    apiMocks.advancedSearch.mockRejectedValue(new Error('load fail'));
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(messageMocks.error).toHaveBeenCalled());
  });

  it('does not load when appType or formUuid empty', async () => {
    render(<DataManagementList appType="" formUuid="" />);
    await new Promise((r) => setTimeout(r, 50));
    expect(apiMocks.getSchema).not.toHaveBeenCalled();
  });

  it('handles process form type correctly', async () => {
    setupDefaultMocks({ formType: 'process' });
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
  });

  it('handles requestOverride as function', async () => {
    const customRequest = vi.fn();
    render(
      <DataManagementList appType="test-app" formUuid="form-1" requestOverride={customRequest} />,
    );
    await waitFor(() => expect(apiMocks.getSchema).toHaveBeenCalled());
  });

  it('handles requestOverride as config object', async () => {
    render(
      <DataManagementList
        appType="test-app"
        formUuid="form-1"
        requestOverride={{ baseUrl: '/api' }}
      />,
    );
    await waitFor(() => expect(apiMocks.getSchema).toHaveBeenCalled());
  });

  it('opens and handles import with preview', async () => {
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
    const importBtns2 = screen.getAllByTestId('menu-import');
    await act(async () => {
      fireEvent.click(importBtns2[0]);
    });
    const uploadTrigger = screen.getByTestId('upload-trigger');
    await act(async () => {
      fireEvent.click(uploadTrigger);
    });
    await waitFor(() => expect(apiMocks.importPreview).toHaveBeenCalled());
  });

  it('handles download template', async () => {
    const createObjectURL = vi.fn(() => 'blob:template');
    const revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('URL', { ...window.URL, createObjectURL, revokeObjectURL });
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
    const importBtn = screen.getAllByTestId('menu-import')[0];
    await act(async () => {
      fireEvent.click(importBtn);
    });
    const downloadBtn = screen.getByText('下载导入模板');
    await act(async () => {
      fireEvent.click(downloadBtn);
    });
    await waitFor(() => expect(apiMocks.downloadTemplate).toHaveBeenCalled());
    await waitFor(() => expect(messageMocks.success).toHaveBeenCalledWith('模板下载已开始'));
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:template');
  });

  it('handles JSON blob download errors and header filename parsing', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('URL', {
      ...window.URL,
      createObjectURL: vi.fn(() => 'blob:download'),
      revokeObjectURL: vi.fn(),
    });
    const jsonBlob = new Blob([JSON.stringify({ message: '模板生成失败' })], {
      type: 'application/json',
    });
    Object.defineProperty(jsonBlob, 'text', {
      value: () => Promise.resolve(JSON.stringify({ message: '模板生成失败' })),
    });
    apiMocks.downloadTemplate.mockResolvedValueOnce({
      data: jsonBlob,
      headers: {
        get: (key: string) => (key.toLowerCase() === 'content-type' ? 'application/json' : ''),
      },
    });

    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('menu-import')[0]);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('下载导入模板'));
    });
    await waitFor(() => expect(messageMocks.error).toHaveBeenCalledWith('模板生成失败'));

    apiMocks.downloadTemplate.mockResolvedValueOnce({
      data: new ArrayBuffer(4),
      headers: {
        'content-type': 'application/vnd.ms-excel',
        'content-disposition': "attachment; filename*=UTF-8''%E6%A8%A1%E6%9D%BF.xlsx",
      },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('下载导入模板'));
    });
    await waitFor(() => expect(messageMocks.success).toHaveBeenCalledWith('模板下载已开始'));
  });

  it('handles download template failure', async () => {
    apiMocks.downloadTemplate.mockRejectedValue(new Error('下载失败'));
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
    const importBtn = screen.getAllByTestId('menu-import')[0];
    await act(async () => {
      fireEvent.click(importBtn);
    });
    const downloadBtn = screen.getByText('下载导入模板');
    await act(async () => {
      fireEvent.click(downloadBtn);
    });
    await waitFor(() => expect(messageMocks.error).toHaveBeenCalledWith('下载失败'));
  });

  it('filter group editor: apply filter', async () => {
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
    fireEvent.click(screen.getByText('筛选'));
    const addBtn = screen.getByText('添加条件');
    fireEvent.click(addBtn);
    const okBtn = screen.getByTestId('modal-ok');
    apiMocks.advancedSearch.mockClear();
    await act(async () => {
      fireEvent.click(okBtn);
    });
    expect(apiMocks.advancedSearch).toHaveBeenCalled();
  });

  it('edits nested filters and removes rules through filter group editor', async () => {
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
    fireEvent.click(screen.getByText('筛选'));
    fireEvent.click(screen.getByText('满足任一'));
    fireEvent.click(screen.getByText('添加条件'));

    const selects = screen.getAllByTestId('select');
    fireEvent.change(selects[0], { target: { value: 'age' } });
    fireEvent.change(selects[1], { target: { value: 'gt' } });
    fireEvent.change(screen.getByPlaceholderText('输入筛选值'), { target: { value: '18' } });

    fireEvent.click(screen.getByText('添加分组'));
    fireEvent.click(screen.getAllByText('添加条件').at(-1)!);
    const nestedInputs = screen.getAllByPlaceholderText('输入筛选值');
    fireEvent.change(nestedInputs.at(-1)!, { target: { value: 'active' } });

    const deleteButtons = screen
      .getAllByRole('button')
      .filter((button) => button.querySelector('[data-icon="delete"]'));
    fireEvent.click(deleteButtons[0]);

    apiMocks.advancedSearch.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-ok'));
    });
    expect(apiMocks.advancedSearch).toHaveBeenCalled();
  });

  it('column setting: commit changes', async () => {
    render(<DataManagementList appType="test-app" formUuid="form-1" configScope="global" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
    fireEvent.click(screen.getByText('列设置'));
    // add sort
    const addSortBtn = screen.getByText('添加排序');
    fireEvent.click(addSortBtn);
    // click OK
    const okBtn = screen.getByTestId('modal-ok');
    apiMocks.advancedSearch.mockClear();
    await act(async () => {
      fireEvent.click(okBtn);
    });
    expect(apiMocks.saveConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ scope: 'personal' }),
    );
  });

  it('changes and removes sort rules and resizes a table column', async () => {
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());

    const resizeHandle = screen.getAllByTitle('拖拽调整列宽')[0];
    await act(async () => {
      fireEvent.mouseDown(resizeHandle, { clientX: 100 });
      fireEvent.mouseMove(document, { clientX: 260 });
      fireEvent.mouseUp(document);
    });
    await waitFor(() =>
      expect(apiMocks.saveConfig).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          config: expect.objectContaining({ widths: expect.objectContaining({ name: 320 }) }),
        }),
      ),
    );

    fireEvent.click(screen.getByText('列设置'));
    fireEvent.click(screen.getByText('添加排序'));
    fireEvent.change(screen.getAllByTestId('select').at(-1)!, { target: { value: 'age' } });
    fireEvent.click(screen.getByText('降序'));
    const deleteButtons = screen
      .getAllByRole('button')
      .filter((button) => button.querySelector('[data-icon="delete"]'));
    fireEvent.click(deleteButtons.at(-1)!);
    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-ok'));
    });
    expect(apiMocks.saveConfig).toHaveBeenCalled();
  });

  it('covers search, pagination, drawer close and settings cancellation handlers', async () => {
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());

    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'keyword' } });
    expect(screen.getByTestId('search-input')).toHaveValue('keyword');

    apiMocks.advancedSearch.mockClear();
    fireEvent.click(screen.getByTestId('next-page'));
    await waitFor(() =>
      expect(apiMocks.advancedSearch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ currentPage: 2 }),
      ),
    );
    expect(screen.getByTestId('pagination-total')).toHaveTextContent('共 3 条');

    const resizeHandle = screen.getAllByTitle('拖拽调整列宽')[0];
    fireEvent.click(resizeHandle);
    fireEvent.doubleClick(resizeHandle);

    fireEvent.click(screen.getByText('筛选'));
    let dialog = screen.getByRole('dialog', { name: '高级筛选' });
    fireEvent.click(within(dialog).getByTestId('modal-cancel'));
    expect(screen.queryByRole('dialog', { name: '高级筛选' })).toBeNull();

    fireEvent.click(screen.getByText('列设置'));
    dialog = screen.getByRole('dialog', { name: '列设置' });
    fireEvent.click(within(dialog).getAllByRole('checkbox')[0]);
    fireEvent.change(within(dialog).getAllByTestId('select')[0], { target: { value: 'age' } });
    fireEvent.click(within(dialog).getByText('添加排序'));
    fireEvent.change(within(dialog).getAllByTestId('select').at(-1)!, {
      target: { value: 'age' },
    });
    fireEvent.click(within(dialog).getByText('紧凑'));
    fireEvent.click(within(dialog).getByText('新页'));
    fireEvent.change(within(dialog).getAllByTestId('select').at(-1)!, {
      target: { value: '20' },
    });
    fireEvent.click(within(dialog).getByTestId('modal-cancel'));
    expect(screen.queryByRole('dialog', { name: '列设置' })).toBeNull();

    fireEvent.click(screen.getByTestId('menu-all'));
    dialog = screen.getByRole('dialog', { name: '导出全部数据' });
    fireEvent.click(within(dialog).getAllByRole('checkbox')[0]);
    fireEvent.click(within(dialog).getByText('取消'));
    expect(screen.queryByRole('dialog', { name: '导出全部数据' })).toBeNull();

    fireEvent.click(screen.getAllByTestId('menu-import')[0]);
    dialog = screen.getByRole('dialog', { name: '导入数据' });
    fireEvent.click(within(dialog).getByTestId('modal-cancel'));
    expect(screen.queryByRole('dialog', { name: '导入数据' })).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getAllByTestId('menu-records')[1]);
    });
    await waitFor(() => expect(apiMocks.getTransferRecords).toHaveBeenCalled());
    const drawer = screen.getByRole('complementary', { name: '导入记录' });
    fireEvent.click(within(drawer).getByText('导出记录'));
    await waitFor(() =>
      expect(apiMocks.getTransferRecords).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: 'export' }),
      ),
    );
    fireEvent.click(within(drawer).getByTestId('drawer-close'));
    expect(screen.queryByRole('complementary', { name: '导入记录' })).toBeNull();
  });

  it('handles import confirm flow', async () => {
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
    const importMenuBtn2 = screen.getAllByTestId('menu-import')[0];
    await act(async () => {
      fireEvent.click(importMenuBtn2);
    });
    // trigger upload
    const uploadTrigger = screen.getByTestId('upload-trigger');
    await act(async () => {
      fireEvent.click(uploadTrigger);
    });
    await waitFor(() => expect(apiMocks.importPreview).toHaveBeenCalled());
    // confirm import
    const okBtn = screen.getByTestId('modal-ok');
    await act(async () => {
      fireEvent.click(okBtn);
    });
    await waitFor(() => expect(apiMocks.importRows).toHaveBeenCalled());
  });

  it('handles upload remove', async () => {
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
    const importMenuBtn3 = screen.getAllByTestId('menu-import')[0];
    await act(async () => {
      fireEvent.click(importMenuBtn3);
    });
    const removeBtn = screen.getByTestId('upload-remove');
    fireEvent.click(removeBtn);
  });

  it('handles submit drawer open and close', async () => {
    const submitRenderer = vi.fn(({ onSubmitted }) =>
      React.createElement(
        'div',
        null,
        React.createElement(
          'button',
          { type: 'button', onClick: onSubmitted, 'data-testid': 'submit-action' },
          'Submit',
        ),
      ),
    );
    render(
      <DataManagementList appType="test-app" formUuid="form-1" submitRenderer={submitRenderer} />,
    );
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
    fireEvent.click(screen.getByText('新增'));
    await waitFor(() => expect(submitRenderer).toHaveBeenCalled());
    // submit triggers reload
    apiMocks.advancedSearch.mockClear();
    const submitAction = screen.getByTestId('submit-action');
    await act(async () => {
      fireEvent.click(submitAction);
    });
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
  });

  it('handles selected export, batch delete and cancel selection', async () => {
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('select-0'));
    expect(screen.getByText('已选 1 条')).toBeTruthy();

    fireEvent.click(screen.getByText('导出选中'));
    await act(async () => {
      fireEvent.click(screen.getByText('导出选中 (1)'));
    });
    await waitFor(() =>
      expect(apiMocks.exportRows).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          filters: expect.objectContaining({
            logic: 'OR',
            rules: [
              expect.objectContaining({
                key: 'form_instance_id',
                operator: 'EQ',
                value: 'inst-1',
              }),
            ],
          }),
          exportAll: 'n',
        }),
      ),
    );

    fireEvent.click(screen.getByText('批量删除'));
    await waitFor(() =>
      expect(apiMocks.deleteRows).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ formInstanceIds: ['inst-1'] }),
      ),
    );

    fireEvent.click(screen.getByTestId('select-1'));
    fireEvent.click(screen.getByText('取消选择'));
    expect(screen.queryByText('已选 1 条')).toBeNull();
  });

  it('handles process batch approval success and failure', async () => {
    setupDefaultMocks({ formType: 'process' });
    const { unmount } = render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('select-0'));
    fireEvent.click(screen.getByText('批量审批'));
    expect(screen.getByRole('dialog', { name: '批量审批' })).toBeTruthy();
    fireEvent.click(screen.getByText('拒绝'));
    fireEvent.change(screen.getByTestId('textarea'), { target: { value: '资料不完整' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-ok'));
    });
    await waitFor(() =>
      expect(apiMocks.batchApprove).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          formInstanceIds: ['inst-1'],
          action: 'rejected',
          comments: '资料不完整',
        }),
      ),
    );
    expect(messageMocks.success).toHaveBeenCalledWith('批量拒绝已提交');

    unmount();
    vi.clearAllMocks();
    setupDefaultMocks({ formType: 'process' });
    apiMocks.batchApprove.mockRejectedValue(new Error('approve fail'));
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('select-0'));
    fireEvent.click(screen.getByText('批量审批'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-ok'));
    });
    await waitFor(() => expect(messageMocks.error).toHaveBeenCalledWith('批量审批失败'));
  });

  it('handles row delete, workflow action and records without instance ids', async () => {
    const rowAction = { key: 'custom', label: '自定义操作', onClick: vi.fn() };
    setupDefaultMocks({ formType: 'process' });
    apiMocks.advancedSearch.mockResolvedValue({
      records: [{ name: '无实例' }, { formInstId: 'legacy-1', name: '旧实例' }],
      total: 2,
    });
    render(
      <DataManagementList
        appType="test-app"
        formUuid="form-1"
        rowActions={[rowAction]}
        maxVisibleRowActions={1}
      />,
    );
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());

    fireEvent.click(screen.getAllByText('详情')[0]);
    expect(messageMocks.warning).toHaveBeenCalledWith('当前记录缺少实例 ID，无法打开详情');

    fireEvent.click(screen.getAllByTestId('menu-delete')[1]);
    await waitFor(() =>
      expect(apiMocks.deleteRows).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ formInstanceIds: ['legacy-1'] }),
      ),
    );
    fireEvent.click(screen.getAllByTestId('menu-workflow')[1]);
    expect(messageMocks.info).toHaveBeenCalledWith(
      '请通过 detailRenderer 接入流程日志或流程图入口',
    );
    fireEvent.click(screen.getAllByTestId('menu-custom')[1]);
    expect(rowAction.onClick).toHaveBeenCalledWith(
      expect.objectContaining({ formInstId: 'legacy-1' }),
    );
  });

  it('handles saved config with search keyword and filter group', async () => {
    setupDefaultMocks({
      config: {
        showFields: ['name'],
        filter: {
          searchKeyWord: 'test',
          group: {
            id: 'g1',
            logic: 'AND',
            rules: [{ id: 'r1', key: 'name', operator: 'contains', value: 'foo' }],
            conditions: [],
          },
        },
      },
    });
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
  });

  it('applies forced filters to loading and export requests', async () => {
    const forcedGroup = {
      id: 'forced',
      logic: 'AND' as const,
      rules: [{ id: 'forced-status', key: 'status', operator: 'EQ', value: 'active' }],
      conditions: [],
    };
    render(
      <DataManagementList
        appType="test-app"
        formUuid="form-1"
        forcedConfig={{
          filter: { searchKeyWord: '强制关键字', group: forcedGroup },
          sort: [{ id: 'age', isAsc: 'n' }],
        }}
      />,
    );
    await waitFor(() =>
      expect(apiMocks.advancedSearch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          searchKeyWord: '强制关键字',
          filters: expect.objectContaining({
            rules: [expect.objectContaining({ key: 'status', value: 'active' })],
          }),
          order: [{ id: 'age', isAsc: 'n' }],
        }),
      ),
    );

    fireEvent.click(screen.getByTestId('menu-all'));
    await act(async () => {
      fireEvent.click(screen.getAllByText('导出全部').at(-1)!);
    });
    await waitFor(() =>
      expect(apiMocks.exportRows).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          searchKeyWord: '强制关键字',
          filters: expect.objectContaining({
            rules: [expect.objectContaining({ key: 'status', value: 'active' })],
          }),
          order: [{ id: 'age', isAsc: 'n' }],
          exportAll: 'y',
        }),
      ),
    );
  });

  it('opens batch approval for process forms', async () => {
    setupDefaultMocks({ formType: 'process' });
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
  });

  it('handles getConfig failure gracefully', async () => {
    apiMocks.getConfig.mockRejectedValue(new Error('config fail'));
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
  });

  it('handles export failure', async () => {
    apiMocks.exportRows.mockRejectedValue(new Error('export fail'));
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
    const exportAllBtn = screen.getByTestId('menu-all');
    await act(async () => {
      fireEvent.click(exportAllBtn);
    });
    // click export in the modal
    const exportBtns = screen.getAllByText('导出全部');
    const exportConfirm = exportBtns.find((b) => b.closest('[data-btn-type="primary"]'));
    if (exportConfirm) {
      await act(async () => {
        fireEvent.click(exportConfirm);
      });
      await waitFor(() => expect(messageMocks.error).toHaveBeenCalledWith('导出失败'));
    }
  });

  it('opens detail in new page mode', async () => {
    setupDefaultMocks({ config: { detailOpenMode: 'newPage' } });
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    window.history.pushState({}, '', '/console/test-app/list');
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
    const detailBtns = screen.getAllByText('详情');
    if (detailBtns.length > 0) {
      await act(async () => {
        fireEvent.click(detailBtns[0]);
      });
    }
    expect(windowOpenSpy).toHaveBeenCalledWith(
      '/console/test-app/formDetail/form-1?formInstId=inst-1',
      '_blank',
    );
    windowOpenSpy.mockRestore();
  });

  it('opens detail with custom detailPageUrlBuilder', async () => {
    setupDefaultMocks({ config: { detailOpenMode: 'newPage' } });
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const urlBuilder = vi.fn(() => '/custom/detail');
    render(
      <DataManagementList appType="test-app" formUuid="form-1" detailPageUrlBuilder={urlBuilder} />,
    );
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
    const detailBtns = screen.getAllByText('详情');
    if (detailBtns.length > 0) {
      await act(async () => {
        fireEvent.click(detailBtns[0]);
      });
    }
    windowOpenSpy.mockRestore();
  });

  it('renders with rowActions', async () => {
    const rowAction = { key: 'custom', label: '自定义操作', onClick: vi.fn() };
    render(<DataManagementList appType="test-app" formUuid="form-1" rowActions={[rowAction]} />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
  });

  it('shows up to four row action buttons by default and moves the rest into more', async () => {
    const rowActions = [
      { key: 'custom-1', label: '自定义一', onClick: vi.fn() },
      { key: 'custom-2', label: '自定义二', onClick: vi.fn() },
      { key: 'custom-3', label: '自定义三', onClick: vi.fn() },
      { key: 'custom-4', label: '自定义四', onClick: vi.fn() },
    ];
    render(<DataManagementList appType="test-app" formUuid="form-1" rowActions={rowActions} />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());

    expect(readVisibleRowActionLabels(screen.getByTestId('row-0'))).toEqual([
      '详情',
      '自定义一',
      '自定义二',
      '自定义三',
    ]);
    expect(screen.getAllByTestId('menu-custom-4')[0]).toHaveTextContent('自定义四');
    expect(screen.getAllByTestId('menu-delete')[0]).toHaveTextContent('删除');
  });

  it('handles saveConfig failure gracefully', async () => {
    apiMocks.saveConfig.mockRejectedValue(new Error('save fail'));
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
    // trigger search to persist config
    const searchBtn = screen.getByTestId('search-btn');
    await act(async () => {
      fireEvent.click(searchBtn);
    });
    await waitFor(() => expect(messageMocks.warning).toHaveBeenCalled());
  });
});

describe('isProcessFormType', () => {
  it('returns true for process form types', () => {
    expect(isProcessFormType('process')).toBe(true);
    expect(isProcessFormType('workflow')).toBe(true);
    expect(isProcessFormType('flow')).toBe(true);
    expect(isProcessFormType('flowForm')).toBe(true);
    expect(isProcessFormType('processForm')).toBe(true);
    expect(isProcessFormType('workflowForm')).toBe(true);
    expect(isProcessFormType('PROCESS')).toBe(true);
    expect(isProcessFormType(' process ')).toBe(true);
    expect(isProcessFormType('process_form')).toBe(true);
    expect(isProcessFormType('process-form')).toBe(true);
  });

  it('returns false for non-process types', () => {
    expect(isProcessFormType('form')).toBe(false);
    expect(isProcessFormType('receipt')).toBe(false);
    expect(isProcessFormType(undefined)).toBe(false);
    expect(isProcessFormType('')).toBe(false);
  });
});

describe('resolveDataManagementPopupContainer', () => {
  it('returns a shadow-root portal when mounted inside a shadow root', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const runtimeRoot = document.createElement('div');
    const trigger = document.createElement('button');
    const triggerParent = document.createElement('div');
    shadowRoot.appendChild(runtimeRoot);
    triggerParent.appendChild(trigger);
    shadowRoot.appendChild(triggerParent);

    const portal = resolveDataManagementPopupContainer(runtimeRoot, trigger);
    expect(portal).toBe(resolveDataManagementPortalContainer(runtimeRoot));
    expect(portal).toHaveAttribute('data-sy-data-management-portal');
    expect(portal).toHaveClass('sy-app-workspace');
    expect(portal?.parentNode).toBe(shadowRoot);
    host.remove();
  });

  it('adds the namespace class when reusing an existing shadow-root portal', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const runtimeRoot = document.createElement('div');
    const existingPortal = document.createElement('div');
    existingPortal.setAttribute('data-sy-data-management-portal', '');
    shadowRoot.append(runtimeRoot, existingPortal);

    expect(resolveDataManagementPortalContainer(runtimeRoot)).toBe(existingPortal);
    expect(existingPortal).toHaveClass('sy-app-workspace');
    host.remove();
  });

  it('uses a namespaced body portal for non-shadow DOM rendering', () => {
    const runtimeRoot = document.createElement('div');
    const triggerParent = document.createElement('div');
    const trigger = document.createElement('button');
    document.body.appendChild(runtimeRoot);
    triggerParent.appendChild(trigger);
    document.body.appendChild(triggerParent);

    const portal = resolveDataManagementPopupContainer(runtimeRoot, trigger);
    expect(portal).toBe(resolveDataManagementPortalContainer(runtimeRoot));
    expect(portal).toHaveAttribute('data-sy-data-management-portal');
    expect(portal).toHaveClass('sy-app-workspace');
    expect(portal?.parentNode).toBe(document.body);
    runtimeRoot.remove();
    triggerParent.remove();
    portal?.remove();
  });
});

describe('DataManagementList - renderCellValue coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('renders date field values', async () => {
    const dateFields = [{ id: 'date', fieldId: 'date', label: '日期', componentName: 'DateField' }];
    apiMocks.getSchema.mockResolvedValue({
      fields: dateFields,
      formType: 'form',
      schema: buildTestSchema(dateFields),
    });
    apiMocks.advancedSearch.mockResolvedValue({
      records: [{ formInstanceId: 'i1', date: '2024-01-15T10:30:00Z' }],
      total: 1,
    });
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
  });

  it('renders array values (images, attachments, tags)', async () => {
    const imgFields = [
      { id: 'imgs', fieldId: 'imgs', label: '图片', componentName: 'ImageField' },
      { id: 'files', fieldId: 'files', label: '附件', componentName: 'AttachmentField' },
      { id: 'tags', fieldId: 'tags', label: '标签', componentName: 'MultiSelectField' },
    ];
    apiMocks.getSchema.mockResolvedValue({
      fields: imgFields,
      formType: 'form',
      schema: buildTestSchema(imgFields),
    });
    apiMocks.advancedSearch.mockResolvedValue({
      records: [
        {
          formInstanceId: 'i1',
          imgs: [{ url: '/img.png', name: 'test' }, { url: '/img2.png' }, { url: '/img3.png' }],
          files: [{ uid: 'f1', name: 'doc.pdf' }, { uid: 'f2' }, { uid: 'f3' }, { uid: 'f4' }],
          tags: ['a', 'b', 'c', 'd', 'e'],
        },
      ],
      total: 1,
    });
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
  });

  it('renders object values (user, department, range)', async () => {
    const objFields = [
      { id: 'user', fieldId: 'user', label: '用户', componentName: 'UserSelectField' },
      { id: 'dept', fieldId: 'dept', label: '部门', componentName: 'DepartmentSelectField' },
      { id: 'range', fieldId: 'range', label: '范围', componentName: 'TextField' },
      {
        id: 'opt',
        fieldId: 'opt',
        label: '选项',
        componentName: 'SelectField',
        options: [{ label: 'A', value: 'a' }],
      },
      { id: 'obj', fieldId: 'obj', label: '对象', componentName: 'TextField' },
    ];
    apiMocks.getSchema.mockResolvedValue({
      fields: objFields,
      formType: 'form',
      schema: buildTestSchema(objFields),
    });
    apiMocks.advancedSearch.mockResolvedValue({
      records: [
        {
          formInstanceId: 'i1',
          user: { name: '张三', id: '1' },
          dept: { name: '技术部' },
          range: { start: '2024-01', end: '2024-12' },
          opt: { label: 'A', value: 'a' },
          obj: { nested: true },
        },
      ],
      total: 1,
    });
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
  });

  it('renders status tags for process forms', async () => {
    const processFields = [
      {
        id: 'processInstanceStatus',
        fieldId: 'processInstanceStatus',
        label: '流程状态',
        componentName: 'TextField',
        system: true,
      },
      {
        id: 'approvalResult',
        fieldId: 'approvalResult',
        label: '审批结果',
        componentName: 'TextField',
        system: true,
      },
    ];
    apiMocks.getSchema.mockResolvedValue({
      fields: processFields,
      formType: 'process',
      schema: buildTestSchema(processFields, 'process'),
    });
    apiMocks.advancedSearch.mockResolvedValue({
      records: [
        { formInstanceId: 'i1', processInstanceStatus: 'running', approvalResult: 'approved' },
        { formInstanceId: 'i2', processInstanceStatus: 'completed', approvalResult: 'rejected' },
        { formInstanceId: 'i3', processInstanceStatus: 'terminated', approvalResult: '' },
      ],
      total: 3,
    });
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
  });

  it('renders empty array and null/undefined values', async () => {
    apiMocks.advancedSearch.mockResolvedValue({
      records: [
        { formInstanceId: 'i1', name: null, age: undefined, status: '' },
        { formInstanceId: 'i2', name: [], age: 0, status: 'active' },
      ],
      total: 2,
    });
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
  });

  it('renders select/radio fields with option lookup', async () => {
    const selFields = [
      {
        id: 'radio',
        fieldId: 'radio',
        label: '单选',
        componentName: 'RadioField',
        options: [{ label: 'X', value: 'x' }],
      },
      {
        id: 'check',
        fieldId: 'check',
        label: '多选',
        componentName: 'CheckboxField',
        options: [{ label: 'Y', value: 'y' }],
      },
    ];
    apiMocks.getSchema.mockResolvedValue({
      fields: selFields,
      formType: 'form',
      schema: buildTestSchema(selFields),
    });
    apiMocks.advancedSearch.mockResolvedValue({
      records: [{ formInstanceId: 'i1', radio: 'x', check: 'y' }],
      total: 1,
    });
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
  });
});

describe('DataManagementList utility functions', () => {
  it('handles filter group with nested conditions', async () => {
    vi.clearAllMocks();
    setupDefaultMocks({
      config: {
        filter: {
          group: {
            id: 'g1',
            logic: 'OR',
            rules: [{ id: 'r1', key: 'name', operator: 'eq', value: 'test' }],
            conditions: [
              {
                id: 'g2',
                logic: 'AND',
                rules: [{ key: 'age', operator: 'gt', value: '10' }],
                conditions: [],
              },
            ],
          },
        },
      },
    });
    render(<DataManagementList appType="test-app" formUuid="form-1" />);
    await waitFor(() => expect(apiMocks.advancedSearch).toHaveBeenCalled());
  });
});
