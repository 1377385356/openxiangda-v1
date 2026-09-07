import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { SelectField } from './index';
import { FormProvider } from '../../core/FormProvider';
import { useFormContext } from '../../core/FormContext';
import type { FormSchema, FormEngineConfig } from '../../types';

// ---- mock defaultRegistry to prevent transitive field imports ----
vi.mock('../../core/defaultRegistry', () => ({
  defaultComponentRegistry: {},
}));

// ---- mock antd ----
vi.mock('antd', () => ({
  Select: (props: any) => {
    const { onChange, value, placeholder, disabled, className, options, allowClear, ...rest } =
      props;
    return React.createElement(
      'select',
      {
        value: value ?? '',
        disabled,
        className,
        'data-placeholder': placeholder,
        'data-allowclear': allowClear ? 'true' : undefined,
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
          const v = e.target.value;
          onChange?.(v === '' ? undefined : v);
        },
        'data-testid': rest['data-testid'],
      },
      React.createElement('option', { value: '' }, placeholder || '请选择'),
      React.createElement('option', { value: 'nonexistent' }, 'Invalid'),
      ...(options || []).map((o: any) =>
        React.createElement('option', { key: o.value, value: o.value }, o.label),
      ),
    );
  },
}));

// ---- mock antd-mobile ----
vi.mock('antd-mobile', () => ({
  Popup: (props: any) =>
    props.visible
      ? React.createElement('div', { 'data-testid': 'mobile-popup' }, props.children)
      : null,
}));

// ---- mock useDeviceDetect ----
const mockIsMobile = vi.fn(() => false);
vi.mock('../../hooks/useDeviceDetect', () => ({
  useDeviceDetect: () => ({ isMobile: mockIsMobile() }),
}));

const options = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
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

function renderSelectField(
  props: Partial<React.ComponentProps<typeof SelectField>> & { fieldId: string; label: string },
  opts?: { schema?: FormSchema; config?: FormEngineConfig; initialValues?: Record<string, any> },
) {
  const schema =
    opts?.schema ??
    createSchema({
      fields: [{ fieldId: props.fieldId, componentName: 'SelectField', label: props.label }],
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
      React.createElement(SelectField, { options, ...props } as any),
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

describe('SelectField - NORMAL 态', () => {
  it('正常渲染 PC 端 Select', () => {
    renderSelectField({ fieldId: 'city', label: '城市' });
    expect(screen.getByText('城市')).toBeInTheDocument();
    expect(screen.getByTestId('selectfield-input-city')).toBeInTheDocument();
  });

  it('onChange 触发值变更', () => {
    const onChange = vi.fn();
    const { ctxRef } = renderSelectField({ fieldId: 'city', label: '城市', onChange });
    fireEvent.change(screen.getByTestId('selectfield-input-city'), { target: { value: 'a' } });
    expect(onChange).toHaveBeenCalledWith({ value: 'a', label: 'Option A' });
    expect(ctxRef.current!.formData.city).toEqual({ value: 'a', label: 'Option A' });
  });

  it('同步选项值到隐藏字段', () => {
    const { ctxRef } = renderSelectField({
      fieldId: 'city',
      label: '城市',
      valueSync: [{ targetFieldId: 'cityKey', valuePath: 'value' }],
    });
    fireEvent.change(screen.getByTestId('selectfield-input-city'), { target: { value: 'a' } });
    expect(ctxRef.current!.formData.cityKey).toBe('a');
  });

  it('清空选择', () => {
    const onChange = vi.fn();
    const { ctxRef } = renderSelectField(
      { fieldId: 'city', label: '城市', onChange },
      { initialValues: { city: { value: 'a', label: 'Option A' } } },
    );
    fireEvent.change(screen.getByTestId('selectfield-input-city'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(null);
    expect(ctxRef.current!.formData.city).toBe(null);
  });

  it('选择不存在的选项返回 null', () => {
    const onChange = vi.fn();
    const { ctxRef } = renderSelectField({ fieldId: 'city', label: '城市', onChange });
    fireEvent.change(screen.getByTestId('selectfield-input-city'), {
      target: { value: 'nonexistent' },
    });
    expect(onChange).toHaveBeenCalledWith(null);
    expect(ctxRef.current!.formData.city).toBe(null);
  });
});

describe('SelectField - READONLY 态', () => {
  it('显示 label 文本', () => {
    renderSelectField(
      { fieldId: 'city', label: '城市', behavior: 'READONLY' },
      { initialValues: { city: { value: 'a', label: 'Option A' } } },
    );
    expect(screen.getByTestId('selectfield-readonly-city')).toHaveTextContent('Option A');
  });

  it('空值显示 "--"', () => {
    renderSelectField({ fieldId: 'city', label: '城市', behavior: 'READONLY' });
    expect(screen.getByTestId('selectfield-readonly-city')).toHaveTextContent('--');
  });
});

describe('SelectField - HIDDEN 态', () => {
  it('不渲染任何 DOM', () => {
    renderSelectField({ fieldId: 'city', label: '城市', behavior: 'HIDDEN' });
    expect(document.querySelector('[data-field-id="city"]')).not.toBeInTheDocument();
  });
});

describe('SelectField - DISABLED 态', () => {
  it('Select 禁用', () => {
    renderSelectField({ fieldId: 'city', label: '城市', behavior: 'DISABLED' });
    expect(screen.getByTestId('selectfield-input-city')).toBeDisabled();
  });
});

describe('SelectField - 数据绑定', () => {
  it('从 FormProvider 接收初始值', () => {
    renderSelectField(
      { fieldId: 'city', label: '城市' },
      { initialValues: { city: { value: 'b', label: 'Option B' } } },
    );
    expect(screen.getByTestId('selectfield-input-city')).toHaveValue('b');
  });

  it('外部 setFieldValue 更新', () => {
    const { ctxRef } = renderSelectField({ fieldId: 'city', label: '城市' });
    act(() => {
      ctxRef.current!.setFieldValue('city', { value: 'a', label: 'Option A' });
    });
    expect(screen.getByTestId('selectfield-input-city')).toHaveValue('a');
  });

  it('defaultValue 在 mount 时设置', () => {
    const { ctxRef } = renderSelectField({
      fieldId: 'city',
      label: '城市',
      defaultValue: { value: 'a', label: 'Option A' },
    });
    expect(ctxRef.current!.formData.city).toEqual({ value: 'a', label: 'Option A' });
  });

  it('defaultValue 不覆盖 initialValues', () => {
    const { ctxRef } = renderSelectField(
      { fieldId: 'city', label: '城市', defaultValue: { value: 'a', label: 'Option A' } },
      { initialValues: { city: { value: 'b', label: 'Option B' } } },
    );
    expect(ctxRef.current!.formData.city).toEqual({ value: 'b', label: 'Option B' });
  });
});

describe('SelectField - 校验', () => {
  it('required 空值报错', async () => {
    const schema = createSchema({
      fields: [{ fieldId: 'city', componentName: 'SelectField', label: '城市', required: true }],
    });
    const { ctxRef } = renderSelectField(
      { fieldId: 'city', label: '城市', required: true },
      { schema },
    );
    await act(async () => {
      await ctxRef.current!.validateField('city');
    });
    expect(screen.getByTestId('error-city')).toHaveTextContent('城市为必填项');
  });

  it('required 有值通过', async () => {
    const schema = createSchema({
      fields: [{ fieldId: 'city', componentName: 'SelectField', label: '城市', required: true }],
    });
    const { ctxRef } = renderSelectField(
      { fieldId: 'city', label: '城市', required: true },
      { schema, initialValues: { city: { value: 'a', label: 'Option A' } } },
    );
    await act(async () => {
      const result = await ctxRef.current!.validateField('city');
      expect(result).toBe(true);
    });
  });
});

describe('SelectField - 移动端', () => {
  it('isMobile 时渲染移动端组件', () => {
    mockIsMobile.mockReturnValue(true);
    renderSelectField({ fieldId: 'city', label: '城市' });
    expect(screen.getByTestId('selectfield-trigger-city')).toBeInTheDocument();
  });

  it('移动端点击打开 Picker 并选择', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderSelectField({ fieldId: 'city', label: '城市', onChange });
    fireEvent.click(screen.getByTestId('selectfield-trigger-city'));
    expect(screen.getByTestId('selectfield-popup-city')).toHaveClass(
      'sy-mobile-bottom-sheet-content',
    );
    expect(screen.queryByText(/当前已选中/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('selectfield-option-a'));
    expect(screen.queryByText(/当前已选中/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('确定'));
    expect(onChange).toHaveBeenCalledWith({ value: 'a', label: 'Option A' });
    expect(ctxRef.current!.formData.city).toEqual({ value: 'a', label: 'Option A' });
  });

  it('移动端选择后取消不提交临时值', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderSelectField({ fieldId: 'city', label: '城市', onChange });
    fireEvent.click(screen.getByTestId('selectfield-trigger-city'));
    fireEvent.click(screen.getByTestId('selectfield-option-a'));
    fireEvent.click(screen.getByText('取消'));

    expect(onChange).not.toHaveBeenCalled();
    expect(ctxRef.current!.formData.city).toBeUndefined();
    expect(screen.queryByTestId('mobile-popup')).not.toBeInTheDocument();
  });

  it('移动端 disabled 不可点击', () => {
    mockIsMobile.mockReturnValue(true);
    renderSelectField({ fieldId: 'city', label: '城市', behavior: 'DISABLED' });
    fireEvent.click(screen.getByTestId('selectfield-trigger-city'));
    expect(screen.queryByTestId('mobile-popup')).not.toBeInTheDocument();
  });

  it('移动端显示已选值', () => {
    mockIsMobile.mockReturnValue(true);
    renderSelectField(
      { fieldId: 'city', label: '城市' },
      { initialValues: { city: { value: 'b', label: 'Option B' } } },
    );
    expect(screen.getByTestId('selectfield-trigger-city')).toHaveTextContent('Option B');
  });
});

describe('SelectField - behavior 优先级', () => {
  it('props.behavior 优先于 context', () => {
    const schema = createSchema({
      fields: [
        { fieldId: 'city', componentName: 'SelectField', label: '城市', behavior: 'DISABLED' },
      ],
    });
    renderSelectField(
      { fieldId: 'city', label: '城市', behavior: 'READONLY' },
      { schema, initialValues: { city: { value: 'a', label: 'Option A' } } },
    );
    expect(screen.getByTestId('selectfield-readonly-city')).toBeInTheDocument();
  });

  it('字段不在 schema 中时默认 NORMAL', () => {
    const schema = createSchema({ fields: [] });
    renderSelectField({ fieldId: 'unknown', label: '未知' }, { schema });
    expect(screen.getByTestId('selectfield-input-unknown')).toBeInTheDocument();
  });
});

describe('SelectField - 移动端 null 选择', () => {
  it('移动端清空已选值', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderSelectField(
      { fieldId: 'city', label: '城市', onChange, allowClear: true },
      { initialValues: { city: { value: 'a', label: 'Option A' } } },
    );
    fireEvent.click(screen.getByTestId('selectfield-trigger-city-clear'));
    expect(onChange).toHaveBeenCalledWith(null);
    expect(ctxRef.current!.formData.city).toBe(null);
  });

  it('移动端搜索过滤选项', () => {
    mockIsMobile.mockReturnValue(true);
    renderSelectField({ fieldId: 'city', label: '城市' });
    fireEvent.click(screen.getByTestId('selectfield-trigger-city'));
    fireEvent.change(screen.getByTestId('sy-mobile-search-input'), { target: { value: 'B' } });
    expect(screen.queryByTestId('selectfield-option-a')).not.toBeInTheDocument();
    expect(screen.getByTestId('selectfield-option-b')).toBeInTheDocument();
  });
});
