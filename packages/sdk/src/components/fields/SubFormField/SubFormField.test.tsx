import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { SubFormField } from './index';
import { FormProvider } from '../../core/FormProvider';
import { useFormContext } from '../../core/FormContext';
import type { FormSchema, FormEngineConfig } from '../../types';

vi.mock('../../core/defaultRegistry', () => ({
  defaultComponentRegistry: {},
}));

vi.mock('antd', () => ({}));
vi.mock('antd-mobile', () => ({}));

const mockIsMobile = vi.fn(() => false);
vi.mock('../../hooks/useDeviceDetect', () => ({
  useDeviceDetect: () => ({ isMobile: mockIsMobile() }),
}));

const defaultColumns = [
  { fieldId: 'name', label: '姓名', componentName: 'TextField' },
  { fieldId: 'age', label: '年龄', componentName: 'NumberField' },
];

function CustomCellField({ fieldId }: { fieldId: string }) {
  const { formData, setFieldValue } = useFormContext();
  return React.createElement(
    'button',
    {
      type: 'button',
      'data-testid': `custom-cell-${fieldId}`,
      onClick: () => setFieldValue(fieldId, 'custom-value'),
    },
    String(formData[fieldId] ?? ''),
  );
}

function BehaviorCellField({ fieldId, behavior }: { fieldId: string; behavior?: string }) {
  const { formData } = useFormContext();
  return React.createElement(
    'button',
    {
      type: 'button',
      'data-testid': `behavior-cell-${fieldId}`,
      'data-behavior': behavior,
      disabled: behavior === 'READONLY' || behavior === 'DISABLED',
    },
    String(formData[fieldId] ?? ''),
  );
}

function ProbeCellField({ fieldId }: { fieldId: string }) {
  const context = useFormContext();
  return React.createElement(
    'button',
    {
      type: 'button',
      'data-testid': `probe-cell-${fieldId}`,
      onClick: async () => {
        context.getFieldValue(fieldId);
        context.getFieldValue('outside');
        context.getFormData();
        context.registerField(fieldId);
        context.registerField('outside');
        context.unregisterField(fieldId);
        context.unregisterField('outside');
        await context.validateField(fieldId);
        await context.validateField('outside');
        context.setFieldValue('outside', 'parent-value');
      },
    },
    'probe',
  );
}

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
  components?: Record<string, React.ComponentType<any>>;
}

function renderField(
  props: Partial<React.ComponentProps<typeof SubFormField>> & {
    fieldId: string;
    label: string;
    columns: any[];
  },
  opts?: RenderOptions,
) {
  const schema =
    opts?.schema ??
    createSchema({
      fields: [{ fieldId: props.fieldId, componentName: 'SubFormField', label: props.label }],
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
      {
        schema,
        config,
        initialValues: opts?.initialValues,
        components: opts?.components,
        children: null,
      },
      React.createElement(SubFormField, props as any),
      React.createElement(Capture),
    ),
  );
  return { ...result, ctxRef };
}

beforeEach(() => {
  mockIsMobile.mockReturnValue(false);
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('SubFormField - NORMAL 态', () => {
  it('正常渲染 PC 端表格', () => {
    renderField({ fieldId: 'detail', label: '明细', columns: defaultColumns });
    expect(screen.getByText('明细')).toBeInTheDocument();
    expect(screen.getByTestId('subformfield-table-detail')).toBeInTheDocument();
  });

  it('PC 表头显示列级必填标记', () => {
    const columns = [
      { fieldId: 'name', label: '姓名', componentName: 'TextField', required: true },
      { fieldId: 'age', label: '年龄', componentName: 'NumberField' },
    ];
    const { container } = renderField({ fieldId: 'detail', label: '明细', columns });
    expect(container.querySelector('.sy-subform-table .sy-field-required')).toHaveTextContent('*');
  });

  it('PC 端渲染明细工具栏和行数', () => {
    const { container } = renderField(
      { fieldId: 'detail', label: '明细', columns: defaultColumns },
      { initialValues: { detail: [{ name: 'Alice', age: '20' }] } },
    );
    expect(container.querySelector('.sy-subform-toolbar')).toHaveTextContent('共 1 行');
    expect(screen.getByTestId('subformfield-add-detail')).toHaveTextContent('新增明细');
  });

  it('添加行', () => {
    const onChange = vi.fn();
    const { ctxRef } = renderField({
      fieldId: 'detail',
      label: '明细',
      columns: defaultColumns,
      onChange,
    });
    fireEvent.click(screen.getByTestId('subformfield-add-detail'));
    expect(ctxRef.current!.formData.detail).toHaveLength(1);
    expect(onChange).toHaveBeenCalled();
  });

  it('删除行', () => {
    const onChange = vi.fn();
    const rows = [{ name: 'Alice', age: '20' }];
    const { ctxRef } = renderField(
      { fieldId: 'detail', label: '明细', columns: defaultColumns, onChange },
      { initialValues: { detail: rows } },
    );
    fireEvent.click(screen.getByTestId('subformfield-remove-detail-0'));
    expect(ctxRef.current!.formData.detail).toHaveLength(0);
    expect(onChange).toHaveBeenCalled();
  });

  it('编辑单元格', () => {
    const onChange = vi.fn();
    const rows = [{ name: '', age: '' }];
    const { ctxRef } = renderField(
      { fieldId: 'detail', label: '明细', columns: defaultColumns, onChange },
      { initialValues: { detail: rows } },
    );
    fireEvent.change(screen.getByTestId('subformfield-cell-detail-0-name'), {
      target: { value: 'Bob' },
    });
    expect((ctxRef.current!.formData.detail as any[])[0].name).toBe('Bob');
    expect(onChange).toHaveBeenCalled();
  });

  it('maxRows 限制', () => {
    const rows = [
      { name: 'A', age: '1' },
      { name: 'B', age: '2' },
    ];
    const { ctxRef } = renderField(
      { fieldId: 'detail', label: '明细', columns: defaultColumns, maxRows: 2 },
      { initialValues: { detail: rows } },
    );
    fireEvent.click(screen.getByTestId('subformfield-add-detail'));
    expect(ctxRef.current!.formData.detail).toHaveLength(2);
  });

  it('minRows 限制', () => {
    const rows = [{ name: 'A', age: '1' }];
    const { ctxRef } = renderField(
      { fieldId: 'detail', label: '明细', columns: defaultColumns, minRows: 1 },
      { initialValues: { detail: rows } },
    );
    fireEvent.click(screen.getByTestId('subformfield-remove-detail-0'));
    expect(ctxRef.current!.formData.detail).toHaveLength(1);
  });

  it('添加行无 onChange 不报错', () => {
    const { ctxRef } = renderField({ fieldId: 'detail', label: '明细', columns: defaultColumns });
    fireEvent.click(screen.getByTestId('subformfield-add-detail'));
    expect(ctxRef.current!.formData.detail).toHaveLength(1);
  });

  it('删除行无 onChange 不报错', () => {
    const rows = [{ name: 'A', age: '1' }];
    const { ctxRef } = renderField(
      { fieldId: 'detail', label: '明细', columns: defaultColumns },
      { initialValues: { detail: rows } },
    );
    fireEvent.click(screen.getByTestId('subformfield-remove-detail-0'));
    expect(ctxRef.current!.formData.detail).toHaveLength(0);
  });

  it('编辑单元格无 onChange 不报错', () => {
    const rows = [{ name: 'A', age: '1' }];
    const { ctxRef } = renderField(
      { fieldId: 'detail', label: '明细', columns: defaultColumns },
      { initialValues: { detail: rows } },
    );
    fireEvent.change(screen.getByTestId('subformfield-cell-detail-0-name'), {
      target: { value: 'X' },
    });
    expect((ctxRef.current!.formData.detail as any[])[0].name).toBe('X');
  });

  it('行中列值为 undefined 渲染为空', () => {
    const rows = [{ name: 'Alice' }];
    renderField(
      { fieldId: 'detail', label: '明细', columns: defaultColumns },
      { initialValues: { detail: rows } },
    );
    expect(screen.getByTestId('subformfield-cell-detail-0-age')).toHaveValue('');
  });

  it('fallback 单元格格式化数字和对象值', () => {
    const rows = [{ name: 42, age: { nested: true } }];
    renderField(
      { fieldId: 'detail', label: '明细', columns: defaultColumns },
      { initialValues: { detail: rows } },
    );
    expect(screen.getByTestId('subformfield-cell-detail-0-name')).toHaveValue('42');
    expect(screen.getByTestId('subformfield-cell-detail-0-age')).toHaveValue(
      JSON.stringify({ nested: true }),
    );
  });

  it('编辑多行中某行', () => {
    const rows = [
      { name: 'A', age: '1' },
      { name: 'B', age: '2' },
    ];
    const { ctxRef } = renderField(
      { fieldId: 'detail', label: '明细', columns: defaultColumns },
      { initialValues: { detail: rows } },
    );
    fireEvent.change(screen.getByTestId('subformfield-cell-detail-1-name'), {
      target: { value: 'C' },
    });
    expect((ctxRef.current!.formData.detail as any[])[0].name).toBe('A');
    expect((ctxRef.current!.formData.detail as any[])[1].name).toBe('C');
  });

  it('按 registry 渲染列组件并回写行数据', () => {
    const columns = [{ fieldId: 'name', label: '姓名', componentName: 'CustomCellField' }];
    const { ctxRef } = renderField(
      { fieldId: 'detail', label: '明细', columns },
      {
        initialValues: { detail: [{ name: 'Alice' }] },
        components: { CustomCellField },
      },
    );
    const button = screen.getByTestId('custom-cell-detail.0.name');
    expect(button).toHaveTextContent('Alice');
    fireEvent.click(button);
    expect((ctxRef.current!.formData.detail as any[])[0].name).toBe('custom-value');
  });

  it('registry 单元格代理 scoped context 之外的父级操作', async () => {
    const columns = [{ fieldId: 'name', label: '姓名', componentName: 'ProbeCellField' }];
    const { ctxRef } = renderField(
      { fieldId: 'detail', label: '明细', columns },
      {
        initialValues: { detail: [{ name: 'Alice' }] },
        components: { ProbeCellField },
      },
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('probe-cell-detail.0.name'));
    });

    expect(ctxRef.current!.formData.outside).toBe('parent-value');
  });
});

describe('SubFormField - READONLY 态', () => {
  it('空值显示编辑态结构和空状态', () => {
    renderField({
      fieldId: 'detail',
      label: '明细',
      columns: defaultColumns,
      behavior: 'READONLY',
    });
    expect(screen.getByTestId('subformfield-pc-detail')).toBeInTheDocument();
    expect(screen.getByTestId('subformfield-table-detail')).toBeInTheDocument();
    expect(screen.getByText('暂无数据')).toBeInTheDocument();
    expect(screen.queryByTestId('subformfield-add-detail')).not.toBeInTheDocument();
  });

  it('显示只读表格布局并隐藏操作列', () => {
    const rows = [{ name: 'Alice', age: '20' }];
    renderField(
      { fieldId: 'detail', label: '明细', columns: defaultColumns, behavior: 'READONLY' },
      { initialValues: { detail: rows } },
    );
    expect(screen.getByTestId('subformfield-table-detail')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.queryByText('操作')).not.toBeInTheDocument();
    expect(screen.queryByTestId('subformfield-remove-detail-0')).not.toBeInTheDocument();
  });

  it('父级只读会覆盖内部组件的 NORMAL 行为', () => {
    const columns = [
      { fieldId: 'name', label: '姓名', componentName: 'BehaviorCellField', behavior: 'NORMAL' },
    ];
    renderField(
      { fieldId: 'detail', label: '明细', columns, behavior: 'READONLY' },
      {
        initialValues: { detail: [{ name: 'Alice' }] },
        components: { BehaviorCellField },
      },
    );

    expect(screen.getByTestId('behavior-cell-detail.0.name')).toHaveAttribute(
      'data-behavior',
      'READONLY',
    );
    expect(screen.getByTestId('behavior-cell-detail.0.name')).toBeDisabled();
  });

  it('列值为 undefined 显示 "--"', () => {
    const rows = [{ name: 'Alice' }];
    renderField(
      { fieldId: 'detail', label: '明细', columns: defaultColumns, behavior: 'READONLY' },
      { initialValues: { detail: rows } },
    );
    expect(screen.getByTestId('subformfield-row-detail-0')).toHaveTextContent('Alice');
    expect(screen.getByTestId('subformfield-row-detail-0')).toHaveTextContent('--');
  });
});

describe('SubFormField - HIDDEN 态', () => {
  it('不渲染任何 DOM', () => {
    renderField({ fieldId: 'detail', label: '明细', columns: defaultColumns, behavior: 'HIDDEN' });
    expect(document.querySelector('[data-field-id="detail"]')).not.toBeInTheDocument();
  });
});

describe('SubFormField - DISABLED 态', () => {
  it('添加按钮禁用', () => {
    renderField({
      fieldId: 'detail',
      label: '明细',
      columns: defaultColumns,
      behavior: 'DISABLED',
    });
    expect(screen.getByTestId('subformfield-add-detail')).toBeDisabled();
  });

  it('输入框禁用', () => {
    const rows = [{ name: 'A', age: '1' }];
    renderField(
      { fieldId: 'detail', label: '明细', columns: defaultColumns, behavior: 'DISABLED' },
      { initialValues: { detail: rows } },
    );
    expect(screen.getByTestId('subformfield-cell-detail-0-name')).toBeDisabled();
  });
});

describe('SubFormField - 数据绑定', () => {
  it('从 FormProvider 接收初始值', () => {
    const rows = [{ name: 'Alice', age: '20' }];
    renderField(
      { fieldId: 'detail', label: '明细', columns: defaultColumns },
      { initialValues: { detail: rows } },
    );
    expect(screen.getByTestId('subformfield-cell-detail-0-name')).toHaveValue('Alice');
  });

  it('外部 setFieldValue 更新', () => {
    const { ctxRef } = renderField({ fieldId: 'detail', label: '明细', columns: defaultColumns });
    act(() => {
      ctxRef.current!.setFieldValue('detail', [{ name: 'Ext', age: '30' }]);
    });
    expect(screen.getByTestId('subformfield-cell-detail-0-name')).toHaveValue('Ext');
  });

  it('defaultValue 在 mount 时设置', () => {
    const def = [{ name: 'Def', age: '10' }];
    const { ctxRef } = renderField({
      fieldId: 'detail',
      label: '明细',
      columns: defaultColumns,
      defaultValue: def,
    });
    expect(ctxRef.current!.formData.detail).toEqual(def);
  });

  it('context behavior 覆盖', () => {
    const schema = createSchema({
      fields: [
        { fieldId: 'detail', componentName: 'SubFormField', label: '明细', behavior: 'DISABLED' },
      ],
    });
    renderField({ fieldId: 'detail', label: '明细', columns: defaultColumns }, { schema });
    expect(screen.getByTestId('subformfield-add-detail')).toBeDisabled();
  });

  it('字段不在 schema 中时默认 NORMAL', () => {
    const schema = createSchema({ fields: [] });
    renderField({ fieldId: 'detail', label: '明细', columns: defaultColumns }, { schema });
    expect(screen.getByTestId('subformfield-add-detail')).not.toBeDisabled();
  });
});

describe('SubFormField - 列级校验', () => {
  const requiredColumns = [
    { fieldId: 'name', label: '姓名', componentName: 'TextField', required: true },
    { fieldId: 'age', label: '年龄', componentName: 'NumberField' },
  ];

  const schemaWithColumns = createSchema({
    fields: [
      {
        fieldId: 'detail',
        componentName: 'SubFormField',
        label: '明细',
        columns: requiredColumns,
      },
    ],
  });

  it('validateAll 校验已有行的必填列并写入 scoped error', async () => {
    const { ctxRef } = renderField(
      { fieldId: 'detail', label: '明细', columns: requiredColumns },
      { schema: schemaWithColumns, initialValues: { detail: [{ name: '', age: '' }] } },
    );

    let valid = true;
    await act(async () => {
      valid = await ctxRef.current!.validateAll();
    });

    expect(valid).toBe(false);
    expect(ctxRef.current!.fieldErrors['detail.0.name']).toBe('姓名为必填项');
  });

  it('填写必填单元格后 validateAll 通过', async () => {
    const { ctxRef } = renderField(
      { fieldId: 'detail', label: '明细', columns: requiredColumns },
      { schema: schemaWithColumns, initialValues: { detail: [{ name: '', age: '' }] } },
    );

    await act(async () => {
      ctxRef.current!.setFieldValue('detail', [{ name: 'Alice', age: '' }]);
    });

    let valid = false;
    await act(async () => {
      valid = await ctxRef.current!.validateAll();
    });

    expect(valid).toBe(true);
    expect(ctxRef.current!.fieldErrors['detail.0.name']).toBeUndefined();
  });

  it('validateField 子表单父字段时触发列级校验', async () => {
    const { ctxRef } = renderField(
      { fieldId: 'detail', label: '明细', columns: requiredColumns },
      { schema: schemaWithColumns, initialValues: { detail: [{ name: '', age: '' }] } },
    );

    let valid = true;
    await act(async () => {
      valid = await ctxRef.current!.validateField('detail');
    });

    expect(valid).toBe(false);
    expect(ctxRef.current!.fieldErrors['detail.0.name']).toBe('姓名为必填项');
  });

  it('validateField scoped 单元格时校验当前列', async () => {
    const { ctxRef } = renderField(
      { fieldId: 'detail', label: '明细', columns: requiredColumns },
      { schema: schemaWithColumns, initialValues: { detail: [{ name: '', age: '' }] } },
    );

    let valid = true;
    await act(async () => {
      valid = await ctxRef.current!.validateField('detail.0.name');
    });

    expect(valid).toBe(false);
    expect(ctxRef.current!.fieldErrors['detail.0.name']).toBe('姓名为必填项');
  });

  it('父字段禁用时跳过子表单列级校验', async () => {
    const disabledSchema = createSchema({
      fields: [
        {
          fieldId: 'detail',
          componentName: 'SubFormField',
          label: '明细',
          behavior: 'DISABLED',
          columns: requiredColumns,
        },
      ],
    });
    const { ctxRef } = renderField(
      { fieldId: 'detail', label: '明细', columns: requiredColumns },
      { schema: disabledSchema, initialValues: { detail: [{ name: '', age: '' }] } },
    );

    let valid = false;
    await act(async () => {
      valid = await ctxRef.current!.validateAll();
    });

    expect(valid).toBe(true);
    expect(ctxRef.current!.fieldErrors['detail.0.name']).toBeUndefined();
  });

  it('隐藏或禁用列不做列级校验', async () => {
    const inactiveColumns = [
      {
        fieldId: 'hiddenName',
        label: '隐藏姓名',
        componentName: 'TextField',
        required: true,
        behavior: 'HIDDEN',
      },
      {
        fieldId: 'disabledName',
        label: '禁用姓名',
        componentName: 'TextField',
        required: true,
        behavior: 'DISABLED',
      },
    ];
    const inactiveSchema = createSchema({
      fields: [
        {
          fieldId: 'detail',
          componentName: 'SubFormField',
          label: '明细',
          columns: inactiveColumns,
        },
      ],
    });
    const { ctxRef } = renderField(
      { fieldId: 'detail', label: '明细', columns: inactiveColumns },
      {
        schema: inactiveSchema,
        initialValues: { detail: [{ hiddenName: '', disabledName: '' }] },
      },
    );

    let valid = false;
    await act(async () => {
      valid = await ctxRef.current!.validateAll();
    });

    expect(valid).toBe(true);
    expect(ctxRef.current!.fieldErrors['detail.0.hiddenName']).toBeUndefined();
    expect(ctxRef.current!.fieldErrors['detail.0.disabledName']).toBeUndefined();
  });
});

describe('SubFormField - 移动端', () => {
  it('isMobile 时渲染移动端组件', () => {
    mockIsMobile.mockReturnValue(true);
    renderField({ fieldId: 'detail', label: '明细', columns: defaultColumns });
    expect(screen.getByTestId('subformfield-mobile-detail')).toBeInTheDocument();
  });

  it('移动端 label 显示列级必填标记', () => {
    mockIsMobile.mockReturnValue(true);
    const columns = [
      { fieldId: 'name', label: '姓名', componentName: 'TextField', required: true },
    ];
    const { container } = renderField(
      { fieldId: 'detail', label: '明细', columns },
      { initialValues: { detail: [{ name: '' }] } },
    );
    expect(container.querySelector('.sy-subform-mobile-cell .sy-field-required')).toHaveTextContent(
      '*',
    );
  });

  it('移动端渲染明细工具栏和卡片行头', () => {
    mockIsMobile.mockReturnValue(true);
    const { container } = renderField(
      { fieldId: 'detail', label: '明细', columns: defaultColumns },
      { initialValues: { detail: [{ name: 'Alice', age: '20' }] } },
    );
    expect(container.querySelector('.sy-subform-toolbar')).toHaveTextContent('共 1 行');
    expect(screen.getByText('第 1 行')).toBeInTheDocument();
    expect(screen.getByTestId('subformfield-mobile-add-detail')).toHaveTextContent('新增明细');
  });

  it('移动端添加行', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderField({
      fieldId: 'detail',
      label: '明细',
      columns: defaultColumns,
      onChange,
    });
    fireEvent.click(screen.getByTestId('subformfield-mobile-add-detail'));
    expect(ctxRef.current!.formData.detail).toHaveLength(1);
    expect(onChange).toHaveBeenCalled();
  });

  it('移动端删除行', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const rows = [{ name: 'A', age: '1' }];
    const { ctxRef } = renderField(
      { fieldId: 'detail', label: '明细', columns: defaultColumns, onChange },
      { initialValues: { detail: rows } },
    );
    fireEvent.click(screen.getByTestId('subformfield-mobile-remove-detail-0'));
    expect(ctxRef.current!.formData.detail).toHaveLength(0);
    expect(onChange).toHaveBeenCalled();
  });

  it('移动端编辑单元格', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const rows = [{ name: '', age: '' }];
    const { ctxRef } = renderField(
      { fieldId: 'detail', label: '明细', columns: defaultColumns, onChange },
      { initialValues: { detail: rows } },
    );
    fireEvent.change(screen.getByTestId('subformfield-mobile-cell-detail-0-name'), {
      target: { value: 'Mobile' },
    });
    expect((ctxRef.current!.formData.detail as any[])[0].name).toBe('Mobile');
    expect(onChange).toHaveBeenCalled();
  });

  it('移动端行中列值为 undefined 渲染为空', () => {
    mockIsMobile.mockReturnValue(true);
    const rows = [{ name: 'Alice' }];
    renderField(
      { fieldId: 'detail', label: '明细', columns: defaultColumns },
      { initialValues: { detail: rows } },
    );
    expect(screen.getByTestId('subformfield-mobile-cell-detail-0-age')).toHaveValue('');
  });

  it('移动端 disabled', () => {
    mockIsMobile.mockReturnValue(true);
    renderField({
      fieldId: 'detail',
      label: '明细',
      columns: defaultColumns,
      behavior: 'DISABLED',
    });
    expect(screen.getByTestId('subformfield-mobile-add-detail')).toBeDisabled();
  });

  it('移动端 maxRows 限制', () => {
    mockIsMobile.mockReturnValue(true);
    const rows = [{ name: 'A', age: '1' }];
    const { ctxRef } = renderField(
      { fieldId: 'detail', label: '明细', columns: defaultColumns, maxRows: 1 },
      { initialValues: { detail: rows } },
    );
    fireEvent.click(screen.getByTestId('subformfield-mobile-add-detail'));
    expect(ctxRef.current!.formData.detail).toHaveLength(1);
  });

  it('移动端 minRows 限制', () => {
    mockIsMobile.mockReturnValue(true);
    const rows = [{ name: 'A', age: '1' }];
    const { ctxRef } = renderField(
      { fieldId: 'detail', label: '明细', columns: defaultColumns, minRows: 1 },
      { initialValues: { detail: rows } },
    );
    fireEvent.click(screen.getByTestId('subformfield-mobile-remove-detail-0'));
    expect(ctxRef.current!.formData.detail).toHaveLength(1);
  });

  it('移动端编辑多行中某行', () => {
    mockIsMobile.mockReturnValue(true);
    const rows = [
      { name: 'A', age: '1' },
      { name: 'B', age: '2' },
    ];
    const { ctxRef } = renderField(
      { fieldId: 'detail', label: '明细', columns: defaultColumns },
      { initialValues: { detail: rows } },
    );
    fireEvent.change(screen.getByTestId('subformfield-mobile-cell-detail-1-name'), {
      target: { value: 'C' },
    });
    expect((ctxRef.current!.formData.detail as any[])[0].name).toBe('A');
    expect((ctxRef.current!.formData.detail as any[])[1].name).toBe('C');
  });
});
