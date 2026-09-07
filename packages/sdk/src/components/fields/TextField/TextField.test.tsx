import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { TextField } from './index';
import { FormProvider } from '../../core/FormProvider';
import { useFormContext } from '../../core/FormContext';
import type { FormSchema, FormEngineConfig } from '../../types';

// ---- mock defaultRegistry to prevent transitive field imports ----
vi.mock('../../core/defaultRegistry', () => ({
  defaultComponentRegistry: {},
}));

// ---- mock antd & antd-mobile ----
vi.mock('antd', () => ({
  Input: (props: any) => {
    const { onChange, onBlur, value, placeholder, maxLength, disabled, className, ...rest } = props;
    return React.createElement('input', {
      value: value ?? '',
      placeholder,
      maxLength,
      disabled,
      className,
      onChange,
      onBlur,
      'data-testid': rest['data-testid'],
    });
  },
}));

vi.mock('antd-mobile', () => ({
  Input: (props: any) => {
    const { onChange, onBlur, value, placeholder, maxLength, disabled } = props;
    return React.createElement('input', {
      value: value ?? '',
      placeholder,
      maxLength,
      disabled,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value),
      onBlur: () => onBlur?.(),
      'data-testid': 'antd-mobile-input',
    });
  },
}));

// ---- mock useDeviceDetect ----
const mockIsMobile = vi.fn(() => false);
vi.mock('../../hooks/useDeviceDetect', () => ({
  useDeviceDetect: () => ({ isMobile: mockIsMobile() }),
}));

// ---- helpers ----
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

function renderTextField(
  props: Partial<React.ComponentProps<typeof TextField>> & { fieldId: string; label: string },
  opts?: RenderOptions,
) {
  const schema =
    opts?.schema ??
    createSchema({
      fields: [{ fieldId: props.fieldId, componentName: 'TextField', label: props.label }],
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
      React.createElement(TextField, props as any),
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

// ================================================================
// NORMAL 态
// ================================================================
describe('TextField - NORMAL 态', () => {
  it('正常渲染 PC 端 Input', () => {
    renderTextField({ fieldId: 'name', label: '姓名' });
    expect(screen.getByText('姓名')).toBeInTheDocument();
    expect(screen.getByTestId('textfield-input-name')).toBeInTheDocument();
  });

  it('onChange 触发值变更', () => {
    const onChange = vi.fn();
    const { ctxRef } = renderTextField({
      fieldId: 'name',
      label: '姓名',
      onChange,
    });

    fireEvent.change(screen.getByTestId('textfield-input-name'), {
      target: { value: 'Alice' },
    });

    expect(onChange).toHaveBeenCalledWith('Alice');
    expect(ctxRef.current!.formData.name).toBe('Alice');
  });

  it('onBlur 回调触发', () => {
    const onBlur = vi.fn();
    renderTextField({ fieldId: 'name', label: '姓名', onBlur });

    fireEvent.change(screen.getByTestId('textfield-input-name'), {
      target: { value: 'Bob' },
    });
    fireEvent.blur(screen.getByTestId('textfield-input-name'));
    expect(onBlur).toHaveBeenCalledWith('Bob');
  });

  it('maxLength 属性传递', () => {
    renderTextField({ fieldId: 'name', label: '姓名', maxLength: 10 });
    expect(screen.getByTestId('textfield-input-name')).toHaveAttribute('maxLength', '10');
  });

  it('placeholder 属性传递', () => {
    renderTextField({ fieldId: 'name', label: '姓名', placeholder: '请输入' });
    expect(screen.getByTestId('textfield-input-name')).toHaveAttribute('placeholder', '请输入');
  });

  it('tips 显示', () => {
    renderTextField({ fieldId: 'name', label: '姓名', tips: '提示文字' });
    expect(screen.getByText('提示文字')).toBeInTheDocument();
  });

  it('className 应用到 wrapper', () => {
    renderTextField({ fieldId: 'name', label: '姓名', className: 'my-cls' });
    expect(document.querySelector('[data-field-id="name"]')).toHaveClass('my-cls');
  });

  it('inputClassName 应用到 input', () => {
    renderTextField({ fieldId: 'name', label: '姓名', inputClassName: 'input-cls' });
    expect(screen.getByTestId('textfield-input-name')).toHaveClass('input-cls');
  });

  it('required 显示 * 标记', () => {
    renderTextField({ fieldId: 'name', label: '姓名', required: true });
    expect(screen.getByText('*')).toBeInTheDocument();
  });
});

// ================================================================
// READONLY 态
// ================================================================
describe('TextField - READONLY 态', () => {
  it('显示文本值', () => {
    renderTextField(
      { fieldId: 'name', label: '姓名', behavior: 'READONLY' },
      { initialValues: { name: 'Alice' } },
    );
    expect(screen.getByTestId('textfield-readonly-name')).toHaveTextContent('Alice');
  });

  it('空值显示 "--"', () => {
    renderTextField({ fieldId: 'name', label: '姓名', behavior: 'READONLY' });
    expect(screen.getByTestId('textfield-readonly-name')).toHaveTextContent('--');
  });

  it('空字符串值显示 "--"', () => {
    renderTextField(
      { fieldId: 'name', label: '姓名', behavior: 'READONLY' },
      { initialValues: { name: '' } },
    );
    expect(screen.getByTestId('textfield-readonly-name')).toHaveTextContent('--');
  });

  it('readonlyClassName 应用', () => {
    renderTextField(
      { fieldId: 'name', label: '姓名', behavior: 'READONLY', readonlyClassName: 'ro-cls' },
      { initialValues: { name: 'val' } },
    );
    expect(screen.getByTestId('textfield-readonly-name')).toHaveClass('ro-cls');
  });

  it('不渲染 input', () => {
    renderTextField(
      { fieldId: 'name', label: '姓名', behavior: 'READONLY' },
      { initialValues: { name: 'val' } },
    );
    expect(screen.queryByTestId('textfield-input-name')).not.toBeInTheDocument();
  });
});

// ================================================================
// HIDDEN 态
// ================================================================
describe('TextField - HIDDEN 态', () => {
  it('不渲染任何 DOM', () => {
    renderTextField({ fieldId: 'name', label: '姓名', behavior: 'HIDDEN' });
    expect(document.querySelector('[data-field-id="name"]')).not.toBeInTheDocument();
    expect(screen.queryByText('姓名')).not.toBeInTheDocument();
  });
});

// ================================================================
// DISABLED 态
// ================================================================
describe('TextField - DISABLED 态', () => {
  it('Input 禁用', () => {
    renderTextField({ fieldId: 'name', label: '姓名', behavior: 'DISABLED' });
    expect(screen.getByTestId('textfield-input-name')).toBeDisabled();
  });

  it('禁用状态仍然渲染 label', () => {
    renderTextField({ fieldId: 'name', label: '姓名', behavior: 'DISABLED' });
    expect(screen.getByText('姓名')).toBeInTheDocument();
  });
});

// ================================================================
// 数据绑定
// ================================================================
describe('TextField - 数据绑定', () => {
  it('从 FormProvider 接收初始值', () => {
    renderTextField({ fieldId: 'name', label: '姓名' }, { initialValues: { name: 'init' } });
    expect(screen.getByTestId('textfield-input-name')).toHaveValue('init');
  });

  it('值变更同步到 FormContext', () => {
    const { ctxRef } = renderTextField({ fieldId: 'name', label: '姓名' });
    fireEvent.change(screen.getByTestId('textfield-input-name'), {
      target: { value: 'new' },
    });
    expect(ctxRef.current!.formData.name).toBe('new');
  });

  it('外部 setFieldValue 更新显示', () => {
    const { ctxRef } = renderTextField({ fieldId: 'name', label: '姓名' });
    act(() => {
      ctxRef.current!.setFieldValue('name', 'external');
    });
    expect(screen.getByTestId('textfield-input-name')).toHaveValue('external');
  });

  it('resetForm 恢复初始值', () => {
    const { ctxRef } = renderTextField(
      { fieldId: 'name', label: '姓名' },
      { initialValues: { name: '初始' } },
    );

    fireEvent.change(screen.getByTestId('textfield-input-name'), {
      target: { value: '改了' },
    });
    expect(screen.getByTestId('textfield-input-name')).toHaveValue('改了');

    act(() => {
      ctxRef.current!.resetForm();
    });
    expect(screen.getByTestId('textfield-input-name')).toHaveValue('初始');
  });

  it('defaultValue 在 mount 时设置到 context', () => {
    const { ctxRef } = renderTextField({
      fieldId: 'name',
      label: '姓名',
      defaultValue: '默认值',
    });
    expect(ctxRef.current!.formData.name).toBe('默认值');
  });

  it('defaultValue 不覆盖 initialValues', () => {
    const { ctxRef } = renderTextField(
      { fieldId: 'name', label: '姓名', defaultValue: '默认' },
      { initialValues: { name: '外部' } },
    );
    expect(ctxRef.current!.formData.name).toBe('外部');
  });
});

// ================================================================
// 校验
// ================================================================
describe('TextField - 校验', () => {
  it('required 空值报错', async () => {
    const schema = createSchema({
      fields: [{ fieldId: 'name', componentName: 'TextField', label: '姓名', required: true }],
    });
    const { ctxRef } = renderTextField(
      { fieldId: 'name', label: '姓名', required: true },
      { schema },
    );

    await act(async () => {
      await ctxRef.current!.validateField('name');
    });

    expect(screen.getByTestId('error-name')).toHaveTextContent('姓名为必填项');
  });

  it('required 有值通过', async () => {
    const schema = createSchema({
      fields: [{ fieldId: 'name', componentName: 'TextField', label: '姓名', required: true }],
    });
    const { ctxRef } = renderTextField(
      { fieldId: 'name', label: '姓名', required: true },
      { schema, initialValues: { name: '有值' } },
    );

    await act(async () => {
      const result = await ctxRef.current!.validateField('name');
      expect(result).toBe(true);
    });

    expect(screen.queryByTestId('error-name')).not.toBeInTheDocument();
  });

  it('自定义 rules 校验', async () => {
    const schema = createSchema({
      fields: [
        {
          fieldId: 'name',
          componentName: 'TextField',
          label: '姓名',
          rules: [{ min: 2, message: '至少2个字符' }],
        },
      ],
    });
    const { ctxRef } = renderTextField(
      { fieldId: 'name', label: '姓名' },
      { schema, initialValues: { name: 'a' } },
    );

    await act(async () => {
      await ctxRef.current!.validateField('name');
    });

    expect(screen.getByTestId('error-name')).toHaveTextContent('至少2个字符');
  });

  it('错误显示后输入值清除错误', async () => {
    const schema = createSchema({
      fields: [{ fieldId: 'name', componentName: 'TextField', label: '姓名', required: true }],
    });
    const { ctxRef } = renderTextField(
      { fieldId: 'name', label: '姓名', required: true },
      { schema },
    );

    await act(async () => {
      await ctxRef.current!.validateField('name');
    });
    expect(screen.getByTestId('error-name')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('textfield-input-name'), {
      target: { value: '有值了' },
    });
    expect(screen.queryByTestId('error-name')).not.toBeInTheDocument();
  });
});

// ================================================================
// 移动端渲染
// ================================================================
describe('TextField - 移动端', () => {
  it('isMobile 时渲染移动端组件', () => {
    mockIsMobile.mockReturnValue(true);
    renderTextField({ fieldId: 'name', label: '姓名' });
    expect(screen.getByTestId('antd-mobile-input')).toBeInTheDocument();
    expect(screen.getByTestId('textfield-input-name')).toHaveClass('sy-mobile-line-input');
    expect(screen.getByTestId('textfield-input-name')).toHaveClass('sy-mobile-text-input');
  });

  it('移动端 onChange', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderTextField({ fieldId: 'name', label: '姓名', onChange });

    fireEvent.change(screen.getByTestId('antd-mobile-input'), {
      target: { value: 'mobile-val' },
    });

    expect(onChange).toHaveBeenCalledWith('mobile-val');
    expect(ctxRef.current!.formData.name).toBe('mobile-val');
  });

  it('移动端 onBlur', () => {
    mockIsMobile.mockReturnValue(true);
    const onBlur = vi.fn();
    renderTextField({ fieldId: 'name', label: '姓名', onBlur });

    fireEvent.blur(screen.getByTestId('antd-mobile-input'));
    expect(onBlur).toHaveBeenCalled();
  });

  it('移动端 disabled', () => {
    mockIsMobile.mockReturnValue(true);
    renderTextField({ fieldId: 'name', label: '姓名', behavior: 'DISABLED' });
    expect(screen.getByTestId('antd-mobile-input')).toBeDisabled();
  });
});

// ================================================================
// Context 行为覆盖
// ================================================================
describe('TextField - behavior 优先级', () => {
  it('props.behavior 优先于 context', () => {
    const schema = createSchema({
      fields: [
        { fieldId: 'name', componentName: 'TextField', label: '姓名', behavior: 'DISABLED' },
      ],
    });
    // prop is READONLY, context is DISABLED → prop wins
    renderTextField(
      { fieldId: 'name', label: '姓名', behavior: 'READONLY' },
      { schema, initialValues: { name: 'test' } },
    );
    expect(screen.getByTestId('textfield-readonly-name')).toBeInTheDocument();
  });

  it('无 prop behavior 时使用 context', () => {
    const schema = createSchema({
      fields: [
        { fieldId: 'name', componentName: 'TextField', label: '姓名', behavior: 'DISABLED' },
      ],
    });
    renderTextField({ fieldId: 'name', label: '姓名' }, { schema });
    expect(screen.getByTestId('textfield-input-name')).toBeDisabled();
  });

  it('字段不在 schema 中时默认 NORMAL', () => {
    const schema = createSchema({ fields: [] });
    renderTextField({ fieldId: 'unknown', label: '未知' }, { schema });
    expect(screen.getByTestId('textfield-input-unknown')).toBeInTheDocument();
  });
});
