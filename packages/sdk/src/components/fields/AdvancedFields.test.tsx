import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { FormProvider } from '../core/FormProvider';
import { useFormContext } from '../core/FormContext';
import type { FormEngineConfig, FormRuntimeApiConfig, FormSchema } from '../types';
import { AssociationFormField } from './AssociationFormField';
import { AddressField } from './AddressField';
import { LocationField } from './LocationField';
import { DigitalSignatureField } from './DigitalSignatureField';
import { EditorField } from './EditorField';

vi.mock('../core/defaultRegistry', () => ({
  defaultComponentRegistry: {},
}));

const mockDevice = vi.hoisted(() => ({ isMobile: false }));
const mockEditorState = vi.hoisted(() => ({
  text: '',
  html: '',
  isEmpty: true,
  attributes: {} as Record<string, any>,
  active: vi.fn(() => false),
  setContent: vi.fn(),
  undoCommand: vi.fn(),
  setEditable: vi.fn(),
}));
vi.mock('../hooks/useDeviceDetect', () => ({
  useDeviceDetect: () => ({ isMobile: mockDevice.isMobile }),
}));

vi.mock('@tiptap/react', () => ({
  EditorContent: ({ editor }: any) => (
    <div
      data-testid={editor?.options?.editorProps?.attributes?.['data-testid'] || 'editor'}
      onClick={() =>
        editor?.options?.onUpdate?.({
          editor: {
            isEmpty: mockEditorState.isEmpty,
            getHTML: () => mockEditorState.html,
            getText: () => mockEditorState.text,
            commands: { undo: mockEditorState.undoCommand },
          },
        })
      }
    />
  ),
  useEditor: (options: any) => {
    const run = vi.fn();
    const focusChain = {
      run,
      undo: () => ({ run }),
      redo: () => ({ run }),
      setParagraph: () => ({ run }),
      toggleHeading: () => ({ run }),
      toggleBold: () => ({ run }),
      toggleItalic: () => ({ run }),
      toggleUnderline: () => ({ run }),
      toggleStrike: () => ({ run }),
      toggleSuperscript: () => ({ run }),
      toggleSubscript: () => ({ run }),
      setFontFamily: () => ({ run }),
      unsetFontFamily: () => ({ run }),
      setMark: () => ({ run }),
      setColor: () => ({ run }),
      toggleHighlight: () => ({ run }),
      toggleBulletList: () => ({ run }),
      toggleOrderedList: () => ({ run }),
      toggleTaskList: () => ({ run }),
      toggleBlockquote: () => ({ run }),
      toggleCodeBlock: () => ({ run }),
      setTextAlign: () => ({ run }),
      extendMarkRange: () => ({
        unsetLink: () => ({ run }),
        setLink: () => ({ run }),
      }),
      setImage: () => ({ run }),
      insertTable: () => ({ run }),
      addColumnBefore: () => ({ run }),
      addColumnAfter: () => ({ run }),
      deleteColumn: () => ({ run }),
      addRowBefore: () => ({ run }),
      addRowAfter: () => ({ run }),
      deleteRow: () => ({ run }),
      toggleHeaderRow: () => ({ run }),
      deleteTable: () => ({ run }),
      unsetAllMarks: () => ({
        clearNodes: () => ({ run }),
      }),
    };
    return {
      options,
      isEmpty: mockEditorState.isEmpty,
      getHTML: () => mockEditorState.html,
      getText: () => mockEditorState.text,
      setEditable: mockEditorState.setEditable,
      commands: { setContent: mockEditorState.setContent, undo: mockEditorState.undoCommand },
      can: () => ({ undo: () => true, redo: () => true }),
      chain: () => ({
        focus: () => focusChain,
      }),
      isActive: mockEditorState.active,
      getAttributes: () => mockEditorState.attributes,
    };
  },
}));

vi.mock('@tiptap/starter-kit', () => ({ default: { configure: () => ({}) } }));
vi.mock('@tiptap/extension-image', () => ({ default: { configure: () => ({}) } }));
vi.mock('@tiptap/extension-link', () => ({ default: { configure: () => ({}) } }));
vi.mock('@tiptap/extension-color', () => ({ default: {} }));
vi.mock('@tiptap/extension-text-align', () => ({ default: { configure: () => ({}) } }));
vi.mock('@tiptap/extension-placeholder', () => ({ default: { configure: () => ({}) } }));
vi.mock('@tiptap/extension-underline', () => ({ default: {} }));
vi.mock('@tiptap/extension-text-style', () => ({ TextStyle: {} }));
vi.mock('@tiptap/extension-highlight', () => ({ default: { configure: () => ({}) } }));
vi.mock('@tiptap/extension-table', () => ({ Table: { configure: () => ({}) } }));
vi.mock('@tiptap/extension-table-row', () => ({ default: {} }));
vi.mock('@tiptap/extension-table-cell', () => ({ default: {} }));
vi.mock('@tiptap/extension-table-header', () => ({ default: {} }));

vi.mock('antd-mobile', () => ({
  Popup: ({ visible, children, onMaskClick }: any) =>
    visible ? (
      <div data-testid="mobile-popup">
        <button type="button" onClick={onMaskClick}>
          mask
        </button>
        {children}
      </div>
    ) : null,
}));

vi.mock('antd', () => {
  const Button = ({ children, onClick, disabled, type, loading, danger, ...rest }: any) => (
    <button
      type="button"
      data-button-type={type}
      data-loading={loading ? 'true' : undefined}
      data-danger={danger ? 'true' : undefined}
      disabled={disabled}
      onClick={onClick}
      {...rest}
    >
      {children}
    </button>
  );
  const Select = ({ options = [], value, onChange, mode, 'data-testid': testId }: any) => (
    <select
      data-testid={testId}
      value={Array.isArray(value) ? value[0] || '' : value || ''}
      onChange={(event) =>
        onChange?.(mode === 'multiple' ? [event.target.value] : event.target.value)
      }
    >
      <option value="" />
      {options.map((item: any) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  );
  const Input = ({ value, onChange, placeholder }: any) => (
    <input value={value || ''} placeholder={placeholder} onChange={onChange} />
  );
  Input.Search = ({ value, onChange, onSearch, placeholder }: any) => (
    <span>
      <input
        aria-label={placeholder || 'search'}
        value={value || ''}
        onChange={(event) => onChange?.(event)}
      />
      <button type="button" onClick={() => onSearch?.(value || '')}>
        搜索
      </button>
    </span>
  );
  const Modal = ({ open, title, children, onOk, onCancel, onClose, footer }: any) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
        {footer}
        <button type="button" onClick={onCancel}>
          取消
        </button>
        <button type="button" onClick={onClose}>
          关闭
        </button>
        <button type="button" data-testid="modal-ok" onClick={onOk}>
          确定
        </button>
      </div>
    ) : null;
  const InputNumber = ({ value, onChange, min, max }: any) => (
    <input
      type="number"
      min={min}
      max={max}
      value={value || ''}
      onChange={(event) => onChange?.(Number(event.target.value))}
    />
  );
  const Tooltip = ({ children }: any) => <>{children}</>;
  const Drawer = Modal;
  const Table = ({
    dataSource = [],
    columns = [],
    rowKey,
    onRow,
    rowSelection,
    onChange,
    pagination,
  }: any) => (
    <div>
      <button
        type="button"
        onClick={() => pagination?.onChange?.((pagination.current || 1) + 1, pagination.pageSize)}
      >
        下一页
      </button>
      <button
        type="button"
        onClick={() => onChange?.({ current: 3, pageSize: (pagination?.pageSize || 10) + 5 })}
      >
        表格分页
      </button>
      <table>
        <tbody>
          {dataSource.map((record: any) => {
            const key = record[rowKey];
            const rowHandlers = onRow?.(record) || {};
            return (
              <tr
                key={key}
                data-testid={`table-row-${key}`}
                onClick={rowHandlers.onClick}
                onDoubleClick={rowHandlers.onDoubleClick}
              >
                <td>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      rowSelection?.onChange?.([key], [record]);
                    }}
                  >
                    选择行-{key}
                  </button>
                </td>
                {columns.map((column: any) => (
                  <td key={column.key || column.dataIndex}>
                    {column.render
                      ? column.render(record[column.dataIndex], record)
                      : record[column.dataIndex]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
  const resolveCascaderPath = (options: any[] = [], valuePath: string[] = []) => {
    const labels: string[] = [];
    const selectedOptions: any[] = [];
    let currentOptions = options;
    valuePath.forEach((value) => {
      const matched = currentOptions.find((option) => String(option.value) === String(value));
      if (matched) {
        labels.push(matched.label);
        selectedOptions.push(matched);
        currentOptions = matched.children || [];
        return;
      }
      labels.push(String(value));
      selectedOptions.push({ label: String(value), value: String(value) });
      currentOptions = [];
    });
    return { labels, selectedOptions };
  };
  const Cascader = ({
    'data-testid': testId,
    onChange,
    options,
    loadData,
    disabled,
    value = [],
    displayRender,
  }: any) => {
    const { labels, selectedOptions } = resolveCascaderPath(options, value);
    const displayValue = displayRender
      ? displayRender(labels, selectedOptions)
      : labels.filter(Boolean).join(' / ');
    return (
      <span>
        <span data-testid={`${testId || 'cascader'}-display`}>{displayValue}</span>
        <button
          type="button"
          disabled={disabled}
          data-testid={testId || 'cascader'}
          onClick={() =>
            onChange?.(['110000'], [options?.[0] || { label: '北京', value: '110000' }])
          }
        >
          选择地址
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => loadData?.([options?.[0] || { label: '北京', value: '110000' }])}
        >
          加载下级
        </button>
        <button type="button" disabled={disabled} onClick={() => onChange?.([], [])}>
          清空地址
        </button>
      </span>
    );
  };
  const Space = ({ children }: any) => <span>{children}</span>;
  Space.Compact = ({ children }: any) => <span>{children}</span>;
  const Tag = ({ children, closable, onClose }: any) => (
    <span>
      {children}
      {closable && (
        <button
          type="button"
          aria-label={`remove-${children}`}
          onClick={(event) => onClose?.(event)}
        >
          x
        </button>
      )}
    </span>
  );
  const Empty = () => <div>暂无选择</div>;
  Empty.PRESENTED_IMAGE_SIMPLE = 'simple';
  return {
    Button,
    Cascader,
    Drawer,
    Empty,
    Input,
    InputNumber,
    Modal,
    Select,
    Space,
    Spin: ({ children }: any) => <>{children}</>,
    Table,
    Tag,
    Tooltip,
  };
});

function createSchema(fieldId: string, componentName: string, label: string): FormSchema {
  return {
    formMeta: { formUuid: 'test-form', appType: 'test-app', title: 'Test' },
    fields: [{ fieldId, componentName, label }],
  };
}

function createConfig(api?: FormRuntimeApiConfig): FormEngineConfig {
  return {
    mode: 'submit',
    formUuid: 'test-form',
    appType: 'test-app',
    api,
  };
}

function renderWithProvider(
  node: React.ReactElement,
  schema: FormSchema,
  initialValues?: Record<string, any>,
  api?: FormRuntimeApiConfig,
) {
  const ctxRef: { current: ReturnType<typeof useFormContext> | null } = { current: null };
  const Capture = () => {
    ctxRef.current = useFormContext();
    return null;
  };
  const result = render(
    <FormProvider schema={schema} config={createConfig(api)} initialValues={initialValues}>
      {node}
      <Capture />
    </FormProvider>,
  );
  return { ...result, ctxRef };
}

const flushAsyncUpdates = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  mockDevice.isMobile = false;
  mockEditorState.text = '';
  mockEditorState.html = '';
  mockEditorState.isEmpty = true;
  mockEditorState.attributes = {};
  mockEditorState.active.mockReturnValue(false);
  mockEditorState.setContent.mockClear();
  mockEditorState.undoCommand.mockClear();
  mockEditorState.setEditable.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Advanced field interactions', () => {
  it('AssociationFormField selects a 2.0 value and fills target fields', async () => {
    const advancedSearch = vi.fn().mockResolvedValue({
      list: [{ id: 'r1', title: 'Alpha', amount: 100 }],
      total: 1,
    });
    let rendered: ReturnType<typeof renderWithProvider> | undefined;
    await act(async () => {
      rendered = renderWithProvider(
        <AssociationFormField
          fieldId="assoc"
          label="关联"
          associationForm={{
            appType: 'crm',
            formUuid: 'customer',
            mainFieldId: 'title',
            dataFillingEnabled: true,
            dataFillingRules: { mainRules: [{ source: 'amount', target: 'amount' }] },
          }}
        />,
        createSchema('assoc', 'AssociationFormField', '关联'),
        undefined,
        { advancedSearch },
      );
      await Promise.resolve();
    });
    const { ctxRef } = rendered!;

    await screen.findByText('Alpha');
    await act(async () => {
      fireEvent.change(screen.getByTestId('associationformfield-input-assoc'), {
        target: { value: 'r1' },
      });
    });

    expect(ctxRef.current!.formData.assoc).toEqual([
      expect.objectContaining({ label: 'Alpha', value: 'r1' }),
    ]);
    expect(ctxRef.current!.formData.amount).toBe(100);
  });

  it('AssociationFormField does not reload when unrelated fields change', async () => {
    const advancedSearch = vi.fn().mockResolvedValue({
      list: [{ id: 'r1', title: 'Alpha' }],
      total: 1,
    });
    const schema: FormSchema = {
      formMeta: { formUuid: 'test-form', appType: 'test-app', title: 'Test' },
      fields: [
        { fieldId: 'assoc', componentName: 'AssociationFormField', label: '关联' },
        { fieldId: 'richText', componentName: 'EditorField', label: '富文本' },
      ],
    };
    const { ctxRef } = renderWithProvider(
      <AssociationFormField
        fieldId="assoc"
        label="关联"
        associationForm={{ appType: 'crm', formUuid: 'customer', mainFieldId: 'title' }}
      />,
      schema,
      { richText: '' },
      { advancedSearch },
    );

    await waitFor(() => expect(advancedSearch).toHaveBeenCalledTimes(1));
    await act(async () => {
      ctxRef.current!.setFieldValue('richText', 'a');
      await Promise.resolve();
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(advancedSearch).toHaveBeenCalledTimes(1);
  });

  it('AssociationFormField supports selector modal, filters, pagination and clearing', async () => {
    const advancedSearch = vi.fn().mockResolvedValue({
      data: {
        records: [
          {
            formInstID: 'r1',
            title: 'Alpha',
            amount: { name: '100' },
            owner: { name: 'Alice' },
          },
          { bizObjectId: 'r2', title: null, amount: 200, owner: { name: 'Bob' } },
        ],
        totalCount: 2,
      },
    });
    const onChange = vi.fn();
    const { ctxRef } = renderWithProvider(
      <AssociationFormField
        fieldId="assoc"
        label="关联"
        multiple
        onChange={onChange}
        associationForm={{
          appType: 'crm',
          formUuid: 'customer',
          mainFieldId: 'title',
          selectorColumns: ['title', { dataIndex: 'amount', title: '金额' }],
          dataFilterConditionType: 'OR',
          dataFilterRules: [
            {
              key: 'owner',
              operator: 'EQ',
              valueType: 'currentField',
              currentFieldKey: 'owner',
              componentName: 'UserSelectField',
            },
            { key: 'status', operator: 'EQ', value: '' },
            { key: '', value: 'ignored' },
          ],
        }}
      />,
      createSchema('assoc', 'AssociationFormField', '关联'),
      {
        owner: { label: 'Alice', value: 'u1' },
        assoc: [{ label: 'Old', value: 'old', record: { id: 'old', title: 'Old' } }],
      },
      { advancedSearch },
    );

    await screen.findByText('Old');
    fireEvent.click(screen.getByTestId('associationformfield-picker-trigger-assoc'));
    await screen.findByRole('dialog', { name: 'customer' });
    await waitFor(() => expect(screen.getAllByText('Alpha').length).toBeGreaterThan(0));
    expect(advancedSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        appType: 'crm',
        formUuid: 'customer',
        filters: JSON.stringify([
          {
            key: 'owner',
            operator: 'EQ',
            componentName: 'UserSelectField',
            value: 'u1',
          },
        ]),
        conditionType: 'OR',
      }),
    );

    fireEvent.change(screen.getByLabelText('搜索关联数据'), { target: { value: 'Alpha' } });
    fireEvent.click(screen.getByText('搜索'));
    fireEvent.click(screen.getByText('下一页'));
    fireEvent.click(screen.getByText('表格分页'));
    await waitFor(() =>
      expect(advancedSearch).toHaveBeenCalledWith(
        expect.objectContaining({ currentPage: 3, pageSize: 15 }),
      ),
    );

    fireEvent.click(screen.getByTestId('table-row-r1'));
    expect(screen.getByLabelText('remove-Alpha')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('remove-Alpha'));
    fireEvent.click(screen.getByText('选择行-r2'));
    fireEvent.click(screen.getByTestId('modal-ok'));

    expect(ctxRef.current!.formData.assoc).toEqual([
      expect.objectContaining({ value: 'r2', label: '--' }),
    ]);
    expect(onChange).toHaveBeenLastCalledWith(ctxRef.current!.formData.assoc);

    fireEvent.click(screen.getByText('清空'));
    expect(ctxRef.current!.formData.assoc).toEqual([]);
  });

  it('AssociationFormField supports mobile drawer, double click, readonly, disabled and hidden states', async () => {
    const advancedSearch = vi.fn().mockResolvedValue({
      items: [{ dataId: 'r3', title: 'Mobile Row', amount: { name: '300' } }],
      count: 1,
    });
    mockDevice.isMobile = true;
    let rendered: ReturnType<typeof renderWithProvider> | undefined;
    await act(async () => {
      rendered = renderWithProvider(
        <AssociationFormField
          fieldId="assoc"
          label="关联"
          associationForm={{
            appType: 'crm',
            formUuid: 'mobile-customer',
            mainFieldId: 'title',
          }}
        />,
        createSchema('assoc', 'AssociationFormField', '关联'),
        undefined,
        { advancedSearch },
      );
      await flushAsyncUpdates();
    });
    const { ctxRef, unmount } = rendered!;

    await screen.findByText('Mobile Row');
    await act(async () => {
      fireEvent.click(screen.getByTestId('associationformfield-picker-trigger-assoc'));
      await flushAsyncUpdates();
    });
    await screen.findByRole('dialog', { name: 'mobile-customer' });
    await act(async () => {
      fireEvent.doubleClick(screen.getByTestId('table-row-r3'));
      await flushAsyncUpdates();
    });
    await waitFor(() =>
      expect(ctxRef.current!.formData.assoc).toEqual([
        expect.objectContaining({ value: 'r3', label: 'Mobile Row' }),
      ]),
    );
    unmount();

    await act(async () => {
      renderWithProvider(
        <AssociationFormField fieldId="assoc" label="关联" behavior="READONLY" />,
        createSchema('assoc', 'AssociationFormField', '关联'),
        { assoc: [{ label: '只读关联', value: 'readonly' }] },
        { advancedSearch },
      );
      await flushAsyncUpdates();
    });
    expect(screen.getByTestId('associationformfield-readonly-assoc')).toHaveTextContent('只读关联');

    let hidden: ReturnType<typeof renderWithProvider> | undefined;
    await act(async () => {
      hidden = renderWithProvider(
        <AssociationFormField fieldId="hiddenAssoc" label="隐藏关联" behavior="HIDDEN" />,
        createSchema('hiddenAssoc', 'AssociationFormField', '隐藏关联'),
        undefined,
        { advancedSearch },
      );
      await flushAsyncUpdates();
    });
    expect(hidden.queryByTestId('associationformfield-picker-trigger-hiddenAssoc')).toBeNull();
    hidden.unmount();

    await act(async () => {
      renderWithProvider(
        <AssociationFormField
          fieldId="disabledAssoc"
          label="禁用关联"
          behavior="DISABLED"
          associationForm={{ appType: 'crm', formUuid: 'customer', mainFieldId: 'title' }}
        />,
        createSchema('disabledAssoc', 'AssociationFormField', '禁用关联'),
        undefined,
        { advancedSearch },
      );
      await flushAsyncUpdates();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('associationformfield-picker-trigger-disabledAssoc'));
      await flushAsyncUpdates();
    });
    expect(screen.queryByRole('dialog', { name: 'customer' })).toBeNull();
  });

  it('AddressField keeps AddressValue shape and fullAddress', async () => {
    const getChinaDivisions = vi
      .fn()
      .mockResolvedValue([{ name: '北京', adcode: '110000', isLeaf: true }]);
    const { ctxRef } = renderWithProvider(
      <AddressField fieldId="address" label="地址" mode="province-city" />,
      createSchema('address', 'AddressField', '地址'),
      undefined,
      { getChinaDivisions },
    );

    await waitFor(() => expect(getChinaDivisions).toHaveBeenCalled());
    fireEvent.click(screen.getByText('选择地址'));

    expect(ctxRef.current!.formData.address).toEqual({
      province: { label: '北京', value: '110000' },
      fullAddress: '北京',
    });
  });

  it('AddressField displays saved labels before lazy options are loaded', async () => {
    const getChinaDivisions = vi.fn(async (parent?: string) =>
      parent ? [] : [{ name: '浙江省', adcode: '330000', isLeaf: false }],
    );
    const { ctxRef } = renderWithProvider(
      <AddressField fieldId="address" label="地址" mode="province-city-district-street-detail" />,
      createSchema('address', 'AddressField', '地址'),
      {
        address: {
          province: { label: '浙江省', value: '330000' },
          city: { label: '杭州市', value: '330100' },
          district: { label: '萧山区', value: '330109' },
          street: { label: '宁围街道', value: '330109SOPR8' },
          detail: '耕文路1108号-实训楼1号楼-106',
          fullAddress: '浙江省杭州市萧山区宁围街道耕文路1108号-实训楼1号楼-106',
        },
      },
      { getChinaDivisions },
    );

    expect(screen.getByTestId('cascader-display')).toHaveTextContent(
      '浙江省 / 杭州市 / 萧山区 / 宁围街道',
    );
    expect(screen.getByTestId('cascader-display')).not.toHaveTextContent('330100');
    expect(ctxRef.current!.formData.address.city).toEqual({ label: '杭州市', value: '330100' });

    await act(async () => {
      ctxRef.current!.setFieldValue('address', {
        province: { label: '江苏省', value: '320000' },
        city: { label: '南京市', value: '320100' },
        district: { label: '玄武区', value: '320102' },
        street: { label: '梅园新村街道', value: '320102001' },
        detail: '北京东路',
        fullAddress: '江苏省南京市玄武区梅园新村街道北京东路',
      });
      await flushAsyncUpdates();
    });

    expect(screen.getByTestId('cascader-display')).toHaveTextContent(
      '江苏省 / 南京市 / 玄武区 / 梅园新村街道',
    );
    expect(screen.getByTestId('cascader-display')).not.toHaveTextContent('320100');
  });

  it('AddressField hydrates code-only address values with division labels', async () => {
    const getChinaDivisions = vi.fn(async (parent?: string) => {
      if (!parent) return [{ name: '浙江省', adcode: '330000', isLeaf: false }];
      if (parent === '330000') return [{ name: '杭州市', adcode: '330100', isLeaf: false }];
      if (parent === '330100') return [{ name: '萧山区', adcode: '330109', isLeaf: false }];
      if (parent === '330109') return [{ name: '宁围街道', adcode: '330109SOPR8', isLeaf: true }];
      return [];
    });
    const { ctxRef } = renderWithProvider(
      <AddressField fieldId="address" label="地址" mode="province-city-district-street-detail" />,
      createSchema('address', 'AddressField', '地址'),
      {
        address: {
          province: { value: '330000' },
          city: { value: '330100' },
          district: { value: '330109' },
          street: { value: '330109SOPR8' },
          detail: '耕文路1108号-实训楼1号楼-106',
        },
      },
      { getChinaDivisions },
    );

    expect(screen.getByTestId('cascader-display')).not.toHaveTextContent('330100');
    await waitFor(() =>
      expect(screen.getByTestId('cascader-display')).toHaveTextContent(
        '浙江省 / 杭州市 / 萧山区 / 宁围街道',
      ),
    );
    expect(ctxRef.current!.formData.address).toMatchObject({
      province: { label: '浙江省', value: '330000' },
      city: { label: '杭州市', value: '330100' },
      district: { label: '萧山区', value: '330109' },
      street: { label: '宁围街道', value: '330109SOPR8' },
      detail: '耕文路1108号-实训楼1号楼-106',
      fullAddress: '浙江省杭州市萧山区宁围街道耕文路1108号-实训楼1号楼-106',
    });
  });

  it('AddressField supports PC lazy loading, details, clearing and readonly states', async () => {
    const getChinaDivisions = vi.fn(async (parent?: string) =>
      parent
        ? [{ name: '朝阳区', adcode: '110105', isLeaf: true }]
        : [{ name: '北京', adcode: '110000', isLeaf: false }],
    );
    const onChange = vi.fn();
    let rendered: ReturnType<typeof renderWithProvider> | undefined;
    await act(async () => {
      rendered = renderWithProvider(
        <AddressField
          fieldId="address"
          label="地址"
          mode="province-city-district-street-detail"
          onChange={onChange}
        />,
        createSchema('address', 'AddressField', '地址'),
        undefined,
        { getChinaDivisions },
      );
      await flushAsyncUpdates();
    });
    const { ctxRef, unmount } = rendered!;

    await waitFor(() => expect(getChinaDivisions).toHaveBeenCalledWith(undefined));
    await act(async () => {
      fireEvent.click(screen.getByText('加载下级'));
      await flushAsyncUpdates();
    });
    await waitFor(() => expect(getChinaDivisions).toHaveBeenCalledWith('110000'));

    await act(async () => {
      fireEvent.click(screen.getByText('选择地址'));
      await flushAsyncUpdates();
    });
    await waitFor(() =>
      expect(ctxRef.current!.formData.address).toMatchObject({
        province: { label: '北京', value: '110000' },
      }),
    );
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('请输入详细地址'), {
        target: { value: '望京 SOHO' },
      });
      await flushAsyncUpdates();
    });
    expect(ctxRef.current!.formData.address).toMatchObject({
      province: { label: '北京', value: '110000' },
      detail: '望京 SOHO',
      fullAddress: '北京望京 SOHO',
    });
    expect(onChange).toHaveBeenLastCalledWith(ctxRef.current!.formData.address);

    await act(async () => {
      fireEvent.click(screen.getByText('清空地址'));
      await flushAsyncUpdates();
    });
    expect(ctxRef.current!.formData.address).toBeUndefined();
    unmount();

    await act(async () => {
      renderWithProvider(
        <AddressField fieldId="address" label="地址" behavior="READONLY" />,
        createSchema('address', 'AddressField', '地址'),
        {
          address: {
            province: { label: '浙江省', value: '330000' },
            city: { label: '杭州市', value: '330100' },
            district: { label: '西湖区', value: '330106' },
            fullAddress: '浙江省杭州市西湖区',
          },
        },
        { getChinaDivisions },
      );
      await flushAsyncUpdates();
    });
    expect(screen.getByTestId('addressfield-readonly-address')).toHaveTextContent(
      '浙江省杭州市西湖区',
    );
  });

  it('AddressField supports mobile layered selection and disabled/hidden states', async () => {
    mockDevice.isMobile = true;
    const getChinaDivisions = vi.fn(async (parent?: string) => {
      if (!parent) return [{ name: '北京', adcode: '110000', isLeaf: false }];
      if (parent === '110000') return [{ name: '北京市', adcode: '110100', isLeaf: false }];
      if (parent === '110100') return [{ name: '朝阳区', adcode: '110105', isLeaf: false }];
      return [{ name: '三里屯', adcode: '110105001', isLeaf: true }];
    });
    let rendered: ReturnType<typeof renderWithProvider> | undefined;
    await act(async () => {
      rendered = renderWithProvider(
        <AddressField fieldId="address" label="地址" mode="province-city-district-street-detail" />,
        createSchema('address', 'AddressField', '地址'),
        undefined,
        { getChinaDivisions },
      );
      await flushAsyncUpdates();
    });
    const { ctxRef, unmount } = rendered!;

    await waitFor(() => expect(getChinaDivisions).toHaveBeenCalledWith(undefined));
    await act(async () => {
      fireEvent.click(screen.getByText('请选择地址'));
      await flushAsyncUpdates();
    });
    await screen.findByTestId('mobile-popup');
    await screen.findByText('北京');
    await act(async () => {
      fireEvent.click(screen.getByText('北京'));
      await flushAsyncUpdates();
    });
    await screen.findByText('北京市');
    await act(async () => {
      fireEvent.click(screen.getByText('北京市'));
      await flushAsyncUpdates();
    });
    await screen.findByText('朝阳区');
    await act(async () => {
      fireEvent.click(screen.getByText('朝阳区'));
      await flushAsyncUpdates();
    });
    await screen.findByText('三里屯');
    await act(async () => {
      fireEvent.click(screen.getByText('三里屯'));
      await flushAsyncUpdates();
    });
    await waitFor(() => expect(screen.getAllByText('三里屯').length).toBeGreaterThan(1));
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('请输入详细地址'), {
        target: { value: '太古里' },
      });
      await flushAsyncUpdates();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('返回'));
      fireEvent.click(screen.getByText('确定'));
      await flushAsyncUpdates();
    });

    expect(ctxRef.current!.formData.address).toMatchObject({
      province: { label: '北京', value: '110000' },
      city: { label: '北京市', value: '110100' },
      district: { label: '朝阳区', value: '110105' },
      street: { label: '三里屯', value: '110105001' },
      detail: '太古里',
      fullAddress: '北京北京市朝阳区三里屯太古里',
    });
    await act(async () => {
      fireEvent.click(screen.getByText('清空'));
      await flushAsyncUpdates();
    });
    expect(ctxRef.current!.formData.address).toBeUndefined();
    unmount();

    let hidden: ReturnType<typeof renderWithProvider> | undefined;
    await act(async () => {
      hidden = renderWithProvider(
        <AddressField fieldId="hiddenAddress" label="隐藏地址" behavior="HIDDEN" />,
        createSchema('hiddenAddress', 'AddressField', '隐藏地址'),
        undefined,
        { getChinaDivisions },
      );
      await flushAsyncUpdates();
    });
    expect(hidden.queryByTestId('addressfield-input-hiddenAddress')).toBeNull();
    hidden.unmount();

    await act(async () => {
      renderWithProvider(
        <AddressField fieldId="disabledAddress" label="禁用地址" behavior="DISABLED" />,
        createSchema('disabledAddress', 'AddressField', '禁用地址'),
        undefined,
        { getChinaDivisions },
      );
      await flushAsyncUpdates();
    });
    expect(screen.getByText('请选择地址')).toBeDisabled();
  });

  it('LocationField falls back to browser geolocation', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success) =>
          success({ coords: { latitude: 31.2304, longitude: 121.4737, accuracy: 12 } }),
        ),
      },
    });
    const { ctxRef } = renderWithProvider(
      <LocationField fieldId="location" label="定位" />,
      createSchema('location', 'LocationField', '定位'),
    );

    fireEvent.click(screen.getByText('获取定位'));
    await waitFor(() => expect(ctxRef.current!.formData.location?.source).toBe('browser'));
    expect(ctxRef.current!.formData.location).toMatchObject({
      latitude: 31.2304,
      longitude: 121.4737,
      accuracy: 12,
    });
  });

  it('LocationField supports DingTalk location, clear, readonly, disabled and hidden states', async () => {
    const originalUserAgent = navigator.userAgent;
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'DingTalk/7.0',
    });
    (window as any).dd = {
      config: vi.fn(),
      ready: vi.fn((callback) => callback()),
      error: vi.fn(),
      getLocation: vi.fn(({ success }) =>
        success({
          latitude: '30.25',
          longitude: '120.15',
          address: '钉钉大厦',
          city: '杭州',
          adName: '西湖区',
          province: '浙江省',
          poiName: '园区',
          accuracy: '8',
        }),
      ),
    };
    const getDingTalkSignature = vi.fn().mockResolvedValue({
      agentId: 'agent',
      corpId: 'corp',
      timestamp: 'ts',
      nonceStr: 'nonce',
      signature: 'sign',
    });
    const onChange = vi.fn();
    const { ctxRef, unmount } = renderWithProvider(
      <LocationField fieldId="location" label="定位" onChange={onChange} />,
      createSchema('location', 'LocationField', '定位'),
      undefined,
      { getDingTalkSignature },
    );

    fireEvent.click(screen.getByText('获取定位'));
    await waitFor(() => expect(ctxRef.current!.formData.location?.source).toBe('dingTalk'));
    expect((window as any).dd.config).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'agent', jsApiList: expect.any(Array) }),
    );
    expect(ctxRef.current!.formData.location).toMatchObject({
      latitude: 30.25,
      longitude: 120.15,
      address: '钉钉大厦',
      city: '杭州',
      district: '西湖区',
      province: '浙江省',
      name: '园区',
      accuracy: 8,
    });
    expect(screen.getByText('精度约 8 米')).toBeInTheDocument();

    fireEvent.click(screen.getByText('清空'));
    expect(ctxRef.current!.formData.location).toBeUndefined();
    expect(onChange).toHaveBeenLastCalledWith(undefined);
    unmount();
    delete (window as any).dd;
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: originalUserAgent });

    renderWithProvider(
      <LocationField fieldId="location" label="定位" behavior="READONLY" />,
      createSchema('location', 'LocationField', '定位'),
      { location: { latitude: 1, longitude: 2, name: '只读地点' } },
    );
    expect(screen.getByText('只读地点')).toBeInTheDocument();
    expect(screen.queryByText('获取定位')).toBeNull();

    const hidden = renderWithProvider(
      <LocationField fieldId="hiddenLocation" label="隐藏定位" behavior="HIDDEN" />,
      createSchema('hiddenLocation', 'LocationField', '隐藏定位'),
    );
    expect(hidden.queryByTestId('locationfield-hiddenLocation')).toBeNull();
    hidden.unmount();

    renderWithProvider(
      <LocationField fieldId="disabledLocation" label="禁用定位" behavior="DISABLED" />,
      createSchema('disabledLocation', 'LocationField', '禁用定位'),
    );
    expect(screen.getByText('获取定位')).toBeDisabled();
  });

  it('LocationField falls back from DingTalk failures and reports browser errors', async () => {
    (window as any).dd = {
      device: {
        geolocation: {
          get: vi.fn(({ fail }) => fail(new Error('dd failed'))),
        },
      },
    };
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success) =>
          success({ coords: { latitude: 10, longitude: 20, accuracy: 5 } }),
        ),
      },
    });
    const { ctxRef, unmount } = renderWithProvider(
      <LocationField fieldId="location" label="定位" />,
      createSchema('location', 'LocationField', '定位'),
    );

    fireEvent.click(screen.getByText('获取定位'));
    await waitFor(() => expect(ctxRef.current!.formData.location?.source).toBe('browser'));
    unmount();
    delete (window as any).dd;

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((_success, failure) => failure(new Error('geo failed'))),
      },
    });
    const browserError = renderWithProvider(
      <LocationField fieldId="location2" label="定位2" />,
      createSchema('location2', 'LocationField', '定位2'),
    );
    fireEvent.click(screen.getByText('获取定位'));
    await screen.findByText('geo failed');
    browserError.unmount();

    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
    const unsupported = renderWithProvider(
      <LocationField fieldId="location3" label="定位3" />,
      createSchema('location3', 'LocationField', '定位3'),
    );
    fireEvent.click(screen.getByText('获取定位'));
    await screen.findByText('当前浏览器不支持定位');
    unsupported.unmount();
  });

  it('DigitalSignatureField uploads the canvas and stores a hash', async () => {
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn(async () => new Uint8Array([0xab, 0xcd]).buffer),
      },
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    } as any);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(callback) {
      callback(new Blob(['signature'], { type: 'image/png' }));
    } as any);
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 640,
      height: 260,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 640,
      bottom: 260,
      toJSON: () => ({}),
    });
    const uploadFile = vi.fn().mockResolvedValue({
      url: '/signature.png',
      bucketName: 'signatures',
      objectName: 'signature.png',
    });
    const { ctxRef } = renderWithProvider(
      <DigitalSignatureField fieldId="signature" label="签名" />,
      createSchema('signature', 'DigitalSignatureField', '签名'),
      undefined,
      { uploadFile },
    );

    fireEvent.click(screen.getByText('开始签名'));
    const canvas = screen.getByTestId('digitalsignaturefield-canvas-signature');
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 30, clientY: 30, pointerId: 1 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    fireEvent.pointerLeave(canvas);
    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-ok'));
    });

    await waitFor(() => expect(uploadFile).toHaveBeenCalled());
    await waitFor(() => expect(ctxRef.current!.formData.signature).toBeTruthy());
    expect(ctxRef.current!.formData.signature).toMatchObject({
      url: '/signature.png',
      bucketName: 'signatures',
      objectName: 'signature.png',
    });
    expect(ctxRef.current!.formData.signature.hash).toBe('abcd');
  });

  it('DigitalSignatureField handles empty canvas, upload failures and clear action', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    } as any);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(callback) {
      callback(new Blob(['signature'], { type: 'image/png' }));
    } as any);
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 320,
      height: 260,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 320,
      bottom: 260,
      toJSON: () => ({}),
    });
    const uploadFile = vi.fn().mockRejectedValue(new Error('upload failed'));
    const { ctxRef } = renderWithProvider(
      <DigitalSignatureField fieldId="signature" label="签名" />,
      createSchema('signature', 'DigitalSignatureField', '签名'),
      {
        signature: {
          url: '/old.png',
          previewUrl: '/old-preview.png',
          bucketName: 'signatures',
          objectName: 'old.png',
          hash: '123456789012345678901234567890',
        },
      },
      { uploadFile },
    );

    expect(screen.getByText('SHA-512: 123456789012345678901234...')).toBeInTheDocument();
    fireEvent.click(screen.getByText('清空'));
    expect(ctxRef.current!.formData.signature).toBeUndefined();

    fireEvent.click(screen.getByText('开始签名'));
    fireEvent.click(screen.getByText('清空画布'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-ok'));
    });
    expect(await screen.findByText('请先完成签名')).toBeInTheDocument();

    const canvas = screen.getByTestId('digitalsignaturefield-canvas-signature');
    fireEvent.pointerDown(canvas, { clientX: 8, clientY: 9, pointerId: 1 });
    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-ok'));
    });
    expect(await screen.findByText('upload failed')).toBeInTheDocument();
  });

  it('EditorField readonly renders persisted HTML only', () => {
    renderWithProvider(
      <EditorField fieldId="richText" label="富文本" behavior="READONLY" />,
      createSchema('richText', 'EditorField', '富文本'),
      { richText: '<p>Hello</p>' },
    );

    expect(screen.getByTestId('editorfield-readonly-richText')).toHaveTextContent('Hello');
  });

  it('EditorField decodes escaped rich text HTML before previewing or editing', async () => {
    const escapedHtml =
      '&lt;p&gt;123213ddd&lt;span style=&quot;color: rgb(239, 68, 68);&quot;&gt;2133&lt;/span&gt;&lt;/p&gt;';
    const expectedHtml = '<p>123213ddd<span style="color: rgb(239, 68, 68);">2133</span></p>';

    const { unmount } = renderWithProvider(
      <EditorField fieldId="richText" label="富文本" behavior="READONLY" />,
      createSchema('richText', 'EditorField', '富文本'),
      { richText: escapedHtml },
    );

    const readonly = screen.getByTestId('editorfield-readonly-richText');
    expect(readonly).toHaveTextContent('123213ddd2133');
    expect(readonly).not.toHaveTextContent('<p>');
    unmount();

    renderWithProvider(
      <EditorField fieldId="richText" label="富文本" />,
      createSchema('richText', 'EditorField', '富文本'),
      { richText: escapedHtml },
    );

    await waitFor(() =>
      expect(mockEditorState.setContent).toHaveBeenCalledWith(expectedHtml, { emitUpdate: false }),
    );
  });

  it('EditorField handles toolbar actions, content updates and image insertion', async () => {
    const uploadFile = vi
      .fn()
      .mockResolvedValueOnce({ url: '/inline.png' })
      .mockResolvedValueOnce({
        bucketName: 'images',
        objectName: 'protected.png',
        name: 'protected.png',
      })
      .mockRejectedValueOnce(new Error('upload failed'));
    const createFileAccessTicket = vi.fn().mockResolvedValue({ previewUrl: '/ticketed.png' });
    const onChange = vi.fn();

    const { container, ctxRef } = renderWithProvider(
      <EditorField
        fieldId="richText"
        label="富文本"
        maxLength={20}
        toolbarConfig="full"
        height={240}
        allowedImageTypes={['.png']}
        maxImageSize={1}
        onChange={onChange}
      />,
      createSchema('richText', 'EditorField', '富文本'),
      { richText: '<p>Old</p>' },
      { uploadFile, createFileAccessTicket },
    );

    expect(mockEditorState.setEditable).toHaveBeenCalledWith(true);
    expect(mockEditorState.setContent).toHaveBeenCalledWith('<p>Old</p>', { emitUpdate: false });

    mockEditorState.text = 'New text';
    mockEditorState.html = '<p>New text</p>';
    mockEditorState.isEmpty = false;
    fireEvent.click(screen.getByTestId('editorfield-input-richText'));
    expect(ctxRef.current!.formData.richText).toBe('<p>New text</p>');
    expect(onChange).toHaveBeenCalledWith('<p>New text</p>');

    mockEditorState.text = 'x'.repeat(21);
    fireEvent.click(screen.getByTestId('editorfield-input-richText'));
    expect(mockEditorState.undoCommand).toHaveBeenCalled();

    const styleSelect = container.querySelector('select') as HTMLSelectElement;
    for (const value of ['h1', 'h2', 'h3', 'p']) {
      fireEvent.change(styleSelect, { target: { value } });
    }
    const toolbarSelects = container.querySelectorAll('select');
    fireEvent.change(toolbarSelects[1], { target: { value: 'Arial, sans-serif' } });
    fireEvent.change(toolbarSelects[1], { target: { value: '' } });
    fireEvent.change(toolbarSelects[2], { target: { value: '18px' } });
    for (const label of [
      '撤销',
      '重做',
      '加粗',
      '斜体',
      '下划线',
      '删除线',
      '上标',
      '下标',
      '高亮',
      '无序列表',
      '有序列表',
      '任务列表',
      '引用',
      '代码块',
      '左对齐',
      '居中',
      '右对齐',
      '插入表格',
      '清除格式',
    ]) {
      fireEvent.click(screen.getByRole('button', { name: label }));
    }
    fireEvent.click(screen.getByTestId('modal-ok'));
    fireEvent.change(screen.getByTitle('文字颜色'), { target: { value: '#ff0000' } });
    fireEvent.click(container.querySelector('.sy-editor-swatch') as HTMLElement);

    mockEditorState.attributes = { href: 'https://old.example.com' };
    fireEvent.click(screen.getByRole('button', { name: '插入链接' }));
    expect(screen.getByRole('dialog', { name: '编辑链接' })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('https://example.com'), {
      target: { value: 'bad-link' },
    });
    fireEvent.click(screen.getAllByText('确定')[0]);
    expect(screen.getByText('请输入 http(s)、mailto、tel、/ 或 # 开头的链接')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('https://example.com'), {
      target: { value: 'https://example.com' },
    });
    fireEvent.click(screen.getAllByText('确定')[0]);

    mockEditorState.active.mockImplementation((name: any) => name === 'link');
    mockEditorState.attributes = { href: 'https://old.example.com' };
    fireEvent.click(screen.getByRole('button', { name: /插入链接|编辑链接/ }));
    fireEvent.change(screen.getByPlaceholderText('https://example.com'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getAllByText('确定')[0]);
    fireEvent.click(screen.getByRole('button', { name: /插入链接|编辑链接/ }));
    fireEvent.click(screen.getByText('移除链接'));
    mockEditorState.active.mockReturnValue(false);

    fireEvent.click(screen.getByRole('button', { name: '插入图片 URL' }));
    fireEvent.change(screen.getByPlaceholderText('https://example.com/image.png'), {
      target: { value: 'not-an-image-url' },
    });
    fireEvent.click(screen.getByTestId('modal-ok'));
    expect(screen.getByText('请输入有效图片地址')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('https://example.com/image.png'), {
      target: { value: 'data:image/png;base64,abc' },
    });
    fireEvent.change(screen.getByPlaceholderText('Alt 文本'), { target: { value: 'Alt text' } });
    fireEvent.change(screen.getByPlaceholderText('Title'), { target: { value: 'Image title' } });
    fireEvent.click(screen.getByTestId('modal-ok'));

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toHaveClass('sy-editor-file-input');
    expect(fileInput).toHaveAttribute('hidden');
    expect(fileInput).toHaveAttribute('aria-hidden', 'true');
    expect(fileInput).toHaveStyle({ display: 'none' });
    const invalidFile = new File(['x'], 'doc.txt', { type: 'text/plain' });
    fireEvent.change(fileInput, { target: { files: [invalidFile] } });
    await screen.findByText('图片仅支持 .png，且不能超过 1MB');

    const png = new File(['x'], 'inline.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [png] } });
    await waitFor(() => expect(uploadFile).toHaveBeenCalledWith(png, 'images'));

    const protectedPng = new File(['x'], 'protected.png', { type: 'image/png' });
    const body = container.querySelector('.sy-editor-body') as HTMLElement;
    fireEvent.paste(body, { clipboardData: { files: [protectedPng] } });
    await waitFor(() =>
      expect(createFileAccessTicket).toHaveBeenCalledWith(
        'images',
        'protected.png',
        'protected.png',
        'preview',
      ),
    );

    const failingPng = new File(['x'], 'fail.png', { type: 'image/png' });
    fireEvent.drop(body, { dataTransfer: { files: [failingPng] } });
    await screen.findByText('upload failed');
    fireEvent.mouseDown(body);
  });

  it('EditorField resolves default value and active heading states', () => {
    const expected: Array<[any, string]> = [
      [(name: any, attrs: any) => name === 'heading' && attrs?.level === 1, 'h1'],
      [(name: any, attrs: any) => name === 'heading' && attrs?.level === 2, 'h2'],
      [(name: any, attrs: any) => name === 'heading' && attrs?.level === 3, 'h3'],
      [(name: any) => name === 'codeBlock', 'codeBlock'],
    ];

    for (const [isActive, value] of expected) {
      mockEditorState.active.mockImplementation(isActive);
      const { container, unmount } = renderWithProvider(
        <EditorField fieldId={`editor-${value}`} label="富文本" toolbarConfig={['heading']} />,
        createSchema(`editor-${value}`, 'EditorField', '富文本'),
      );
      expect((container.querySelector('select') as HTMLSelectElement).value).toBe(value);
      unmount();
    }

    mockEditorState.active.mockReturnValue(false);
    const { ctxRef } = renderWithProvider(
      <EditorField fieldId="defaultEditor" label="默认富文本" defaultValue="<p>默认</p>" />,
      createSchema('defaultEditor', 'EditorField', '默认富文本'),
    );
    expect(ctxRef.current!.formData.defaultEditor).toBe('<p>默认</p>');
  });

  it('EditorField covers table controls, toolbar mouse handlers and modal cancellations', () => {
    mockEditorState.active.mockImplementation((name: any) => name === 'table');
    const { container } = renderWithProvider(
      <EditorField fieldId="richText" label="富文本" toolbarConfig="full" />,
      createSchema('richText', 'EditorField', '富文本'),
    );

    fireEvent.mouseDown(screen.getByRole('button', { name: '加粗' }));
    fireEvent.click(screen.getByRole('button', { name: '上传图片' }));
    fireEvent.mouseDown(container.querySelector('.sy-editor-swatch') as HTMLElement);

    for (const label of [
      '左侧加列',
      '右侧加列',
      '删除列',
      '上方加行',
      '下方加行',
      '删除行',
      '切换表头',
      '删除表格',
    ]) {
      fireEvent.click(screen.getByRole('button', { name: label }));
    }

    fireEvent.click(screen.getByRole('button', { name: '插入链接' }));
    fireEvent.click(screen.getAllByText('取消')[0]);
    fireEvent.click(screen.getByRole('button', { name: '插入链接' }));
    fireEvent.click(screen.getAllByText('取消').at(-1)!);

    fireEvent.click(screen.getByRole('button', { name: '插入图片 URL' }));
    fireEvent.click(screen.getByText('取消'));

    fireEvent.click(screen.getByRole('button', { name: '插入表格' }));
    const numberInputs = container.querySelectorAll('input[type="number"]');
    fireEvent.change(numberInputs[0], { target: { value: '4' } });
    fireEvent.change(numberInputs[1], { target: { value: '5' } });
    fireEvent.click(screen.getByText('取消'));
  });

  it('EditorField supports hidden, disabled and compact toolbar states', () => {
    const hidden = renderWithProvider(
      <EditorField fieldId="hiddenEditor" label="隐藏" behavior="HIDDEN" />,
      createSchema('hiddenEditor', 'EditorField', '隐藏'),
    );
    expect(hidden.queryByTestId('editorfield-shell-hiddenEditor')).toBeNull();
    hidden.unmount();

    renderWithProvider(
      <EditorField
        fieldId="disabledEditor"
        label="禁用"
        behavior="DISABLED"
        toolbarConfig={['bold']}
        height="12rem"
      />,
      createSchema('disabledEditor', 'EditorField', '禁用'),
    );

    expect(screen.getByTestId('editorfield-shell-disabledEditor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '加粗' })).toBeDisabled();
  });

  it('EditorField hides the toolbar and footer chrome on mobile', () => {
    mockDevice.isMobile = true;

    const { container } = renderWithProvider(
      <EditorField fieldId="mobileEditor" label="移动富文本" toolbarConfig="full" />,
      createSchema('mobileEditor', 'EditorField', '移动富文本'),
    );

    expect(screen.getByTestId('editorfield-shell-mobileEditor')).toBeInTheDocument();
    expect(container.querySelector('.sy-editor')).toHaveClass('is-mobile');
    expect(screen.queryByRole('toolbar', { name: '编辑器工具栏' })).toBeNull();
    expect(container.querySelector('.sy-editor-footer')).toBeNull();
  });
});
