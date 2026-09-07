import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';
import { DepartmentSelectField } from './index';
import { FormProvider } from '../../core/FormProvider';
import { useFormContext } from '../../core/FormContext';
import type { FormSchema, FormEngineConfig } from '../../types';

vi.mock('../../core/defaultRegistry', () => ({
  defaultComponentRegistry: {},
}));

const mobileMock = vi.hoisted(() => ({
  hasPopup: false,
}));

vi.mock('antd', () => ({
  TreeSelect: (props: any) => {
    const { value, treeData, disabled, onChange, multiple, placeholder, ...rest } = props;
    const flatOptions: { value: string; title: string }[] = [];
    const flatten = (nodes: any[]) => {
      for (const node of nodes) {
        flatOptions.push({ value: node.value, title: node.title });
        if (node.children) flatten(node.children);
      }
    };
    if (treeData) flatten(treeData);

    return React.createElement(
      'div',
      {},
      React.createElement(
        'select',
        {
          'data-testid': rest['data-testid'],
          multiple,
          disabled,
          value: multiple ? (Array.isArray(value) ? value : []) : (value ?? ''),
          onChange: (e: any) => {
            if (multiple) {
              onChange?.([e.target.value]);
            } else {
              onChange?.(e.target.value);
            }
          },
        },
        React.createElement('option', { value: '' }, placeholder || ''),
        ...flatOptions.map((opt) =>
          React.createElement('option', { key: opt.value, value: opt.value }, opt.title),
        ),
      ),
      props.showSearch
        ? React.createElement('input', {
            'data-testid': `${rest['data-testid']}-search`,
            value: props.searchValue || '',
            onChange: (e: any) => props.onSearch?.(e.target.value),
          })
        : null,
      props.loadData && flatOptions[0]
        ? React.createElement(
            'button',
            {
              type: 'button',
              'data-testid': `${rest['data-testid']}-load-${flatOptions[0].value}`,
              onClick: () => props.loadData({ value: flatOptions[0].value }),
            },
            'load',
          )
        : null,
    );
  },
}));

vi.mock('antd-mobile', () => ({
  get Popup() {
    return mobileMock.hasPopup
      ? (props: any) =>
          props.visible || props.open
            ? React.createElement('div', { 'data-testid': 'mobile-popup' }, props.children)
            : null
      : undefined;
  },
}));

vi.mock('../shared/DepartmentPicker', () => ({
  DepartmentPicker: (props: any) =>
    props.open
      ? React.createElement(
          'div',
          {
            'data-testid': 'mock-department-picker',
            'data-mobile': String(Boolean(props.mobile)),
          },
          React.createElement(
            'button',
            {
              type: 'button',
              'data-testid': 'mock-department-picker-confirm',
              onClick: () =>
                props.onConfirm?.([
                  { id: 'd9', name: '行政部' },
                  { id: 'd10', name: '财务部' },
                ]),
            },
            'confirm',
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              'data-testid': 'mock-department-picker-cancel',
              onClick: () => props.onCancel?.(),
            },
            'cancel',
          ),
        )
      : null,
}));

const mockIsMobile = vi.fn(() => false);
vi.mock('../../hooks/useDeviceDetect', () => ({
  useDeviceDetect: () => ({ isMobile: mockIsMobile() }),
}));

const testTreeData = [
  {
    id: 'd1',
    name: '技术部',
    children: [
      { id: 'd1-1', name: '前端组' },
      { id: 'd1-2', name: '后端组' },
    ],
  },
  { id: 'd2', name: '产品部' },
];

const createSchema = (overrides?: Partial<FormSchema>): FormSchema => ({
  formMeta: { formUuid: 'test', appType: 'test', title: 'Test' },
  fields: [],
  ...overrides,
});

const createConfig = (overrides?: Partial<FormEngineConfig>): FormEngineConfig => ({
  mode: 'submit',
  formUuid: 'test',
  appType: 'test',
  ...overrides,
});

interface RenderOptions {
  schema?: FormSchema;
  config?: FormEngineConfig;
  initialValues?: Record<string, any>;
}

function renderField(
  props: Partial<React.ComponentProps<typeof DepartmentSelectField>> & {
    fieldId: string;
    label: string;
  },
  opts?: RenderOptions,
) {
  const schema =
    opts?.schema ??
    createSchema({
      fields: [
        { fieldId: props.fieldId, componentName: 'DepartmentSelectField', label: props.label },
      ],
    });
  const config = opts?.config ?? createConfig();
  const ctxRef: { current: ReturnType<typeof useFormContext> | null } = { current: null };

  const Capture = () => {
    ctxRef.current = useFormContext();
    return null;
  };

  const result = render(
    React.createElement(
      FormProvider,
      { schema, config, initialValues: opts?.initialValues, children: null },
      React.createElement(DepartmentSelectField, props as any),
      React.createElement(Capture),
    ),
  );
  return { ...result, ctxRef };
}

beforeEach(() => {
  mockIsMobile.mockReturnValue(false);
  mobileMock.hasPopup = false;
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('DepartmentSelectField - NORMAL 态', () => {
  it('正常渲染 PC 端 TreeSelect', () => {
    renderField({ fieldId: 'dept', label: '部门', treeData: testTreeData });
    expect(screen.getByText('部门')).toBeInTheDocument();
    expect(screen.getByTestId('deptselectfield-input-dept')).toBeInTheDocument();
  });

  it('选择部门触发值变更', () => {
    const onChange = vi.fn();
    const { ctxRef } = renderField({
      fieldId: 'dept',
      label: '部门',
      treeData: testTreeData,
      onChange,
    });
    fireEvent.change(screen.getByTestId('deptselectfield-input-dept'), { target: { value: 'd1' } });
    expect(onChange).toHaveBeenCalled();
    expect(ctxRef.current!.formData.dept).toEqual([{ id: 'd1', name: '技术部' }]);
  });

  it('多选模式', () => {
    const onChange = vi.fn();
    const { ctxRef } = renderField({
      fieldId: 'dept',
      label: '部门',
      treeData: testTreeData,
      multiple: true,
      onChange,
    });
    fireEvent.change(screen.getByTestId('deptselectfield-input-dept'), { target: { value: 'd1' } });
    expect(ctxRef.current!.formData.dept).toEqual([{ id: 'd1', name: '技术部' }]);
  });

  it('选择子部门', () => {
    const { ctxRef } = renderField({ fieldId: 'dept', label: '部门', treeData: testTreeData });
    fireEvent.change(screen.getByTestId('deptselectfield-input-dept'), {
      target: { value: 'd1-1' },
    });
    expect(ctxRef.current!.formData.dept).toEqual([{ id: 'd1-1', name: '前端组' }]);
  });

  it('PC 端远程加载根部门并懒加载子部门', async () => {
    const getDepartmentRoots = vi.fn().mockResolvedValue([{ id: 'd1', name: '技术部' }]);
    const getDepartmentChildren = vi.fn().mockResolvedValue([{ id: 'd1-3', name: '测试组' }]);
    const { ctxRef } = renderField(
      { fieldId: 'dept', label: '部门' },
      { config: createConfig({ api: { getDepartmentRoots, getDepartmentChildren } }) },
    );

    await waitFor(() => expect(getDepartmentRoots).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('技术部')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('deptselectfield-input-dept-load-d1'));

    await waitFor(() => expect(getDepartmentChildren).toHaveBeenCalledWith('d1'));
    await waitFor(() => expect(screen.getByText('测试组')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('deptselectfield-input-dept'), {
      target: { value: 'd1-3' },
    });

    expect(ctxRef.current!.formData.dept).toEqual([{ id: 'd1-3', name: '测试组' }]);
  });

  it('PC 端支持全部部门远程搜索深层部门', async () => {
    const getDepartmentRoots = vi.fn().mockResolvedValue([{ id: 'root', name: '总部' }]);
    const searchDepartments = vi.fn().mockResolvedValue({
      items: [
        {
          id: 'deep-dept',
          name: '合同承办组',
          path: [
            { id: 'root', name: '总部' },
            { id: 'legal', name: '法务部' },
            { id: 'deep-dept', name: '合同承办组' },
          ],
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    const { ctxRef } = renderField(
      {
        fieldId: 'dept',
        label: '部门',
        searchScope: 'all',
        showFullPath: true,
        searchDebounceMs: 1,
      },
      { config: createConfig({ api: { getDepartmentRoots, searchDepartments } }) },
    );

    fireEvent.change(screen.getByTestId('deptselectfield-input-dept-search'), {
      target: { value: '合同' },
    });

    await waitFor(() =>
      expect(searchDepartments).toHaveBeenCalledWith({
        keyword: '合同',
        page: 1,
        pageSize: 50,
        includePath: true,
      }),
    );
    await waitFor(() => expect(screen.getByText('总部/法务部/合同承办组')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('deptselectfield-input-dept'), {
      target: { value: 'deep-dept' },
    });

    expect(ctxRef.current!.formData.dept).toEqual([{ id: 'deep-dept', name: '合同承办组' }]);
  });

  it('PC 端弹窗确认选择并按 maxCount 截断', () => {
    const onChange = vi.fn();
    const { ctxRef } = renderField({
      fieldId: 'dept',
      label: '部门',
      treeData: testTreeData,
      multiple: true,
      maxCount: 1,
      onChange,
    });

    fireEvent.click(screen.getByTestId('deptselectfield-picker-trigger-dept'));
    expect(screen.getByTestId('mock-department-picker')).toHaveAttribute('data-mobile', 'false');
    fireEvent.click(screen.getByTestId('mock-department-picker-confirm'));

    expect(ctxRef.current!.formData.dept).toEqual([{ id: 'd9', name: '行政部' }]);
    expect(onChange).toHaveBeenCalledWith([{ id: 'd9', name: '行政部' }]);
  });

  it('required 显示 * 标记', () => {
    renderField({ fieldId: 'dept', label: '部门', treeData: testTreeData, required: true });
    expect(screen.getByText('*')).toBeInTheDocument();
  });
});

describe('DepartmentSelectField - READONLY 态', () => {
  it('空值显示 "--"', () => {
    renderField({ fieldId: 'dept', label: '部门', treeData: testTreeData, behavior: 'READONLY' });
    expect(screen.getByTestId('deptselectfield-readonly-dept')).toHaveTextContent('--');
  });

  it('显示部门名称', () => {
    const dept = [
      { id: 'd1', name: '技术部' },
      { id: 'd2', name: '产品部' },
    ];
    renderField(
      { fieldId: 'dept', label: '部门', treeData: testTreeData, behavior: 'READONLY' },
      { initialValues: { dept } },
    );
    expect(screen.getByTestId('deptselectfield-readonly-dept')).toHaveTextContent('技术部, 产品部');
  });
});

describe('DepartmentSelectField - HIDDEN 态', () => {
  it('不渲染任何 DOM', () => {
    renderField({ fieldId: 'dept', label: '部门', treeData: testTreeData, behavior: 'HIDDEN' });
    expect(document.querySelector('[data-field-id="dept"]')).not.toBeInTheDocument();
  });
});

describe('DepartmentSelectField - DISABLED 态', () => {
  it('选择器禁用', () => {
    renderField({ fieldId: 'dept', label: '部门', treeData: testTreeData, behavior: 'DISABLED' });
    expect(screen.getByTestId('deptselectfield-input-dept')).toBeDisabled();
  });
});

describe('DepartmentSelectField - 数据绑定', () => {
  it('从 FormProvider 接收初始值', () => {
    const dept = [{ id: 'd1', name: '技术部' }];
    const { ctxRef } = renderField(
      { fieldId: 'dept', label: '部门', treeData: testTreeData },
      { initialValues: { dept } },
    );
    expect(ctxRef.current!.formData.dept).toEqual(dept);
  });

  it('外部 setFieldValue 更新', () => {
    const { ctxRef } = renderField({ fieldId: 'dept', label: '部门', treeData: testTreeData });
    act(() => {
      ctxRef.current!.setFieldValue('dept', [{ id: 'd2', name: '产品部' }]);
    });
    expect(ctxRef.current!.formData.dept).toEqual([{ id: 'd2', name: '产品部' }]);
  });

  it('defaultValue 在 mount 时设置', () => {
    const def = [{ id: 'd1', name: '技术部' }];
    const { ctxRef } = renderField({
      fieldId: 'dept',
      label: '部门',
      treeData: testTreeData,
      defaultValue: def,
    });
    expect(ctxRef.current!.formData.dept).toEqual(def);
  });

  it('context behavior 覆盖', () => {
    const schema = createSchema({
      fields: [
        {
          fieldId: 'dept',
          componentName: 'DepartmentSelectField',
          label: '部门',
          behavior: 'DISABLED',
        },
      ],
    });
    renderField({ fieldId: 'dept', label: '部门', treeData: testTreeData }, { schema });
    expect(screen.getByTestId('deptselectfield-input-dept')).toBeDisabled();
  });

  it('字段不在 schema 中时默认 NORMAL', () => {
    const schema = createSchema({ fields: [] });
    renderField({ fieldId: 'dept', label: '部门', treeData: testTreeData }, { schema });
    expect(screen.getByTestId('deptselectfield-input-dept')).not.toBeDisabled();
  });
});

describe('DepartmentSelectField - 移动端', () => {
  it('isMobile 时渲染移动端组件', () => {
    mockIsMobile.mockReturnValue(true);
    renderField({ fieldId: 'dept', label: '部门', treeData: testTreeData });
    expect(screen.getByTestId('deptselectfield-mobile-dept')).toBeInTheDocument();
    expect(screen.getByTestId('deptselectfield-mobile-trigger-dept')).toHaveClass(
      'sy-mobile-field-trigger',
    );
    expect(screen.getByTestId('deptselectfield-mobile-trigger-dept')).toHaveTextContent('请选择');
  });

  it('移动端选择部门', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    renderField({ fieldId: 'dept', label: '部门', treeData: testTreeData, onChange });
    fireEvent.click(screen.getByTestId('deptselectfield-mobile-trigger-dept'));
    fireEvent.click(screen.getByTestId('deptselectfield-mobile-option-d1'));
    expect(onChange).toHaveBeenCalled();
  });

  it('移动端多选', () => {
    mockIsMobile.mockReturnValue(true);
    const { ctxRef } = renderField({
      fieldId: 'dept',
      label: '部门',
      treeData: testTreeData,
      multiple: true,
    });
    fireEvent.click(screen.getByTestId('deptselectfield-mobile-trigger-dept'));
    fireEvent.click(screen.getByTestId('deptselectfield-mobile-option-d1'));
    fireEvent.click(screen.getByTestId('deptselectfield-mobile-option-d2'));
    expect(ctxRef.current!.formData.dept).toHaveLength(2);
    // Deselect
    fireEvent.click(screen.getByTestId('deptselectfield-mobile-option-d1'));
    expect(ctxRef.current!.formData.dept).toHaveLength(1);
  });

  it('移动端单选模式', () => {
    mockIsMobile.mockReturnValue(true);
    const { ctxRef } = renderField({
      fieldId: 'dept',
      label: '部门',
      treeData: testTreeData,
      multiple: false,
    });
    fireEvent.click(screen.getByTestId('deptselectfield-mobile-trigger-dept'));
    fireEvent.click(screen.getByTestId('deptselectfield-mobile-option-d1'));
    expect(ctxRef.current!.formData.dept).toEqual([{ id: 'd1', name: '技术部' }]);
    expect(screen.queryByTestId('deptselectfield-mobile-list-dept')).not.toBeInTheDocument();
  });

  it('移动端无本地树时远程加载根部门后选择', async () => {
    mockIsMobile.mockReturnValue(true);
    const getDepartmentRoots = vi.fn().mockResolvedValue(testTreeData);
    const { ctxRef } = renderField(
      { fieldId: 'dept', label: '部门' },
      { config: createConfig({ api: { getDepartmentRoots } }) },
    );

    fireEvent.click(screen.getByTestId('deptselectfield-mobile-trigger-dept'));

    await waitFor(() => expect(getDepartmentRoots).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('deptselectfield-mobile-option-d1')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId('deptselectfield-mobile-option-d1'));
    expect(ctxRef.current!.formData.dept).toEqual([{ id: 'd1', name: '技术部' }]);
  });

  it('移动端存在 Popup 时使用部门选择器确认', () => {
    mockIsMobile.mockReturnValue(true);
    mobileMock.hasPopup = true;
    const onChange = vi.fn();
    const { ctxRef } = renderField({
      fieldId: 'dept',
      label: '部门',
      treeData: testTreeData,
      multiple: false,
      onChange,
    });

    fireEvent.click(screen.getByTestId('deptselectfield-mobile-trigger-dept'));
    expect(screen.getByTestId('mock-department-picker')).toHaveAttribute('data-mobile', 'true');
    fireEvent.click(screen.getByTestId('mock-department-picker-confirm'));

    expect(ctxRef.current!.formData.dept).toEqual([{ id: 'd9', name: '行政部' }]);
    expect(onChange).toHaveBeenCalledWith([{ id: 'd9', name: '行政部' }]);
    expect(screen.queryByTestId('mock-department-picker')).not.toBeInTheDocument();
  });

  it('移动端 disabled', () => {
    mockIsMobile.mockReturnValue(true);
    renderField({ fieldId: 'dept', label: '部门', treeData: testTreeData, behavior: 'DISABLED' });
    expect(screen.getByTestId('deptselectfield-mobile-trigger-dept')).toBeDisabled();
  });

  it('移动端支持统一触发行清空已选部门', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderField(
      { fieldId: 'dept', label: '部门', treeData: testTreeData, onChange },
      { initialValues: { dept: [{ id: 'd1', name: '技术部' }] } },
    );

    expect(screen.getByTestId('deptselectfield-mobile-trigger-dept')).toHaveClass(
      'sy-mobile-field-trigger',
    );
    fireEvent.click(screen.getByTestId('deptselectfield-mobile-trigger-dept-clear'));

    expect(ctxRef.current!.formData.dept).toEqual([]);
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
