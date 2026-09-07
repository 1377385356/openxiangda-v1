import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { NumberField } from './index';
import { FormProvider } from '../../core/FormProvider';
import { useFormContext } from '../../core/FormContext';
import type { FormSchema, FormEngineConfig } from '../../types';

// ---- mock defaultRegistry to prevent transitive field imports ----
vi.mock('../../core/defaultRegistry', () => ({
  defaultComponentRegistry: {},
}));

// ---- mock antd ----
vi.mock('antd', () => ({
  InputNumber: (props: any) => {
    const {
      onChange,
      onBlur,
      value,
      placeholder,
      disabled,
      className,
      min,
      max,
      step,
      precision,
      prefix,
      suffix,
      formatter,
      parser,
      ...rest
    } = props;
    return React.createElement(
      'span',
      { 'data-testid': rest['data-testid'] },
      prefix ? React.createElement('span', { 'data-testid': 'input-prefix' }, prefix) : null,
      React.createElement('input', {
        type: 'number',
        value: value ?? '',
        placeholder,
        disabled,
        className,
        'data-min': min,
        'data-max': max,
        'data-step': step,
        'data-precision': precision,
        'data-has-formatter': formatter ? 'true' : undefined,
        'data-has-parser': parser ? 'true' : undefined,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          const v = e.target.value === '' ? null : Number(e.target.value);
          onChange?.(v);
        },
        onBlur: () => onBlur?.(),
        'data-testid': `${rest['data-testid']}-inner`,
      }),
      suffix ? React.createElement('span', { 'data-testid': 'input-suffix' }, suffix) : null,
    );
  },
}));

// ---- mock antd-mobile ----
vi.mock('antd-mobile', () => ({
  Input: (props: any) => {
    const { onChange, onBlur, value, placeholder, disabled } = props;
    return React.createElement('input', {
      value: value ?? '',
      placeholder,
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

function renderNumberField(
  props: Partial<React.ComponentProps<typeof NumberField>> & { fieldId: string; label: string },
  opts?: { schema?: FormSchema; config?: FormEngineConfig; initialValues?: Record<string, any> },
) {
  const schema =
    opts?.schema ??
    createSchema({
      fields: [{ fieldId: props.fieldId, componentName: 'NumberField', label: props.label }],
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
      React.createElement(NumberField, props as any),
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

describe('NumberField - NORMAL 态', () => {
  it('正常渲染 PC 端 InputNumber', () => {
    renderNumberField({ fieldId: 'age', label: '年龄' });
    expect(screen.getByText('年龄')).toBeInTheDocument();
    expect(screen.getByTestId('numberfield-input-age')).toBeInTheDocument();
  });

  it('onChange 触发值变更', () => {
    const onChange = vi.fn();
    const { ctxRef } = renderNumberField({ fieldId: 'age', label: '年龄', onChange });
    fireEvent.change(screen.getByTestId('numberfield-input-age-inner'), {
      target: { value: '25' },
    });
    expect(onChange).toHaveBeenCalledWith(25);
    expect(ctxRef.current!.formData.age).toBe(25);
  });

  it('空值变更为 null', () => {
    const onChange = vi.fn();
    const { ctxRef } = renderNumberField(
      { fieldId: 'age', label: '年龄', onChange },
      { initialValues: { age: 10 } },
    );
    fireEvent.change(screen.getByTestId('numberfield-input-age-inner'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(null);
    expect(ctxRef.current!.formData.age).toBe(null);
  });

  it('min/max/step/precision 属性传递', () => {
    renderNumberField({ fieldId: 'age', label: '年龄', min: 0, max: 100, step: 1, precision: 0 });
    const el = screen.getByTestId('numberfield-input-age-inner');
    expect(el).toHaveAttribute('data-min', '0');
    expect(el).toHaveAttribute('data-max', '100');
    expect(el).toHaveAttribute('data-step', '1');
    expect(el).toHaveAttribute('data-precision', '0');
  });

  it('placeholder 属性传递', () => {
    renderNumberField({ fieldId: 'age', label: '年龄', placeholder: '请输入' });
    expect(screen.getByTestId('numberfield-input-age-inner')).toHaveAttribute(
      'placeholder',
      '请输入',
    );
  });

  it('onBlur 回调触发', () => {
    const onBlur = vi.fn();
    renderNumberField({ fieldId: 'age', label: '年龄', onBlur }, { initialValues: { age: 5 } });
    fireEvent.blur(screen.getByTestId('numberfield-input-age-inner'));
    expect(onBlur).toHaveBeenCalledWith(5);
  });
});

describe('NumberField - READONLY 态', () => {
  it('显示数字值', () => {
    renderNumberField(
      { fieldId: 'age', label: '年龄', behavior: 'READONLY' },
      { initialValues: { age: 30 } },
    );
    expect(screen.getByTestId('numberfield-readonly-age')).toHaveTextContent('30');
  });

  it('null 值显示 "--"', () => {
    renderNumberField({ fieldId: 'age', label: '年龄', behavior: 'READONLY' });
    expect(screen.getByTestId('numberfield-readonly-age')).toHaveTextContent('--');
  });

  it('不渲染 input', () => {
    renderNumberField(
      { fieldId: 'age', label: '年龄', behavior: 'READONLY' },
      { initialValues: { age: 10 } },
    );
    expect(screen.queryByTestId('numberfield-input-age')).not.toBeInTheDocument();
  });
});

describe('NumberField - HIDDEN 态', () => {
  it('不渲染任何 DOM', () => {
    renderNumberField({ fieldId: 'age', label: '年龄', behavior: 'HIDDEN' });
    expect(document.querySelector('[data-field-id="age"]')).not.toBeInTheDocument();
  });
});

describe('NumberField - DISABLED 态', () => {
  it('Input 禁用', () => {
    renderNumberField({ fieldId: 'age', label: '年龄', behavior: 'DISABLED' });
    expect(screen.getByTestId('numberfield-input-age-inner')).toBeDisabled();
  });
});

describe('NumberField - 数据绑定', () => {
  it('从 FormProvider 接收初始值', () => {
    renderNumberField({ fieldId: 'age', label: '年龄' }, { initialValues: { age: 18 } });
    expect(screen.getByTestId('numberfield-input-age-inner')).toHaveValue(18);
  });

  it('外部 setFieldValue 更新显示', () => {
    const { ctxRef } = renderNumberField({ fieldId: 'age', label: '年龄' });
    act(() => {
      ctxRef.current!.setFieldValue('age', 99);
    });
    expect(screen.getByTestId('numberfield-input-age-inner')).toHaveValue(99);
  });

  it('defaultValue 在 mount 时设置', () => {
    const { ctxRef } = renderNumberField({ fieldId: 'age', label: '年龄', defaultValue: 10 });
    expect(ctxRef.current!.formData.age).toBe(10);
  });

  it('defaultValue 不覆盖 initialValues', () => {
    const { ctxRef } = renderNumberField(
      { fieldId: 'age', label: '年龄', defaultValue: 10 },
      { initialValues: { age: 20 } },
    );
    expect(ctxRef.current!.formData.age).toBe(20);
  });
});

describe('NumberField - 校验', () => {
  it('required 空值报错', async () => {
    const schema = createSchema({
      fields: [{ fieldId: 'age', componentName: 'NumberField', label: '年龄', required: true }],
    });
    const { ctxRef } = renderNumberField(
      { fieldId: 'age', label: '年龄', required: true },
      { schema },
    );
    await act(async () => {
      await ctxRef.current!.validateField('age');
    });
    expect(screen.getByTestId('error-age')).toHaveTextContent('年龄为必填项');
  });

  it('required 有值通过', async () => {
    const schema = createSchema({
      fields: [{ fieldId: 'age', componentName: 'NumberField', label: '年龄', required: true }],
    });
    const { ctxRef } = renderNumberField(
      { fieldId: 'age', label: '年龄', required: true },
      { schema, initialValues: { age: 5 } },
    );
    await act(async () => {
      const result = await ctxRef.current!.validateField('age');
      expect(result).toBe(true);
    });
  });
});

describe('NumberField - 移动端', () => {
  it('isMobile 时渲染移动端组件', () => {
    mockIsMobile.mockReturnValue(true);
    renderNumberField({ fieldId: 'age', label: '年龄' });
    expect(screen.getByTestId('antd-mobile-input')).toBeInTheDocument();
    expect(screen.getByTestId('numberfield-input-age')).toHaveClass('sy-mobile-line-input');
    expect(screen.getByTestId('numberfield-input-age')).toHaveClass('sy-mobile-number-input');
  });

  it('移动端 onChange', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderNumberField({ fieldId: 'age', label: '年龄', onChange });
    fireEvent.change(screen.getByTestId('antd-mobile-input'), { target: { value: '42' } });
    expect(onChange).toHaveBeenCalledWith(42);
    expect(ctxRef.current!.formData.age).toBe(42);
  });

  it('移动端 disabled', () => {
    mockIsMobile.mockReturnValue(true);
    renderNumberField({ fieldId: 'age', label: '年龄', behavior: 'DISABLED' });
    expect(screen.getByTestId('antd-mobile-input')).toBeDisabled();
  });

  it('移动端 onBlur', () => {
    mockIsMobile.mockReturnValue(true);
    const onBlur = vi.fn();
    renderNumberField({ fieldId: 'age', label: '年龄', onBlur }, { initialValues: { age: 7 } });
    fireEvent.blur(screen.getByTestId('antd-mobile-input'));
    expect(onBlur).toHaveBeenCalledWith(7);
  });
});

describe('NumberField - behavior 优先级', () => {
  it('props.behavior 优先于 context', () => {
    const schema = createSchema({
      fields: [
        { fieldId: 'age', componentName: 'NumberField', label: '年龄', behavior: 'DISABLED' },
      ],
    });
    renderNumberField(
      { fieldId: 'age', label: '年龄', behavior: 'READONLY' },
      { schema, initialValues: { age: 10 } },
    );
    expect(screen.getByTestId('numberfield-readonly-age')).toBeInTheDocument();
  });

  it('无 prop behavior 时使用 context', () => {
    const schema = createSchema({
      fields: [
        { fieldId: 'age', componentName: 'NumberField', label: '年龄', behavior: 'DISABLED' },
      ],
    });
    renderNumberField({ fieldId: 'age', label: '年龄' }, { schema });
    expect(screen.getByTestId('numberfield-input-age-inner')).toBeDisabled();
  });

  it('字段不在 schema 中时默认 NORMAL', () => {
    const schema = createSchema({ fields: [] });
    renderNumberField({ fieldId: 'unknown', label: '未知' }, { schema });
    expect(screen.getByTestId('numberfield-input-unknown')).toBeInTheDocument();
  });
});

describe('NumberField - 移动端边界', () => {
  it('移动端输入非数字变为 null', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderNumberField({ fieldId: 'age', label: '年龄', onChange });
    fireEvent.change(screen.getByTestId('antd-mobile-input'), { target: { value: 'abc' } });
    expect(onChange).toHaveBeenCalledWith(null);
    expect(ctxRef.current!.formData.age).toBe(null);
  });

  it('移动端输入空字符串变为 null', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderNumberField(
      { fieldId: 'age', label: '年龄', onChange },
      { initialValues: { age: 5 } },
    );
    fireEvent.change(screen.getByTestId('antd-mobile-input'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(null);
    expect(ctxRef.current!.formData.age).toBe(null);
  });

  it('PC 端 onBlur 无初始值时回调 null', () => {
    const onBlur = vi.fn();
    renderNumberField({ fieldId: 'age', label: '年龄', onBlur });
    fireEvent.blur(screen.getByTestId('numberfield-input-age-inner'));
    expect(onBlur).toHaveBeenCalledWith(null);
  });

  it('移动端 onBlur 无初始值时回调 null', () => {
    mockIsMobile.mockReturnValue(true);
    const onBlur = vi.fn();
    renderNumberField({ fieldId: 'age', label: '年龄', onBlur });
    fireEvent.blur(screen.getByTestId('antd-mobile-input'));
    expect(onBlur).toHaveBeenCalledWith(null);
  });
});

// ================ 新增功能测试 ================

describe('NumberField - 单位显示 (unit + unitPosition)', () => {
  it('PC 端默认 suffix 模式显示单位', () => {
    renderNumberField({ fieldId: 'price', label: '价格', unit: '元' });
    expect(screen.getByTestId('input-suffix')).toHaveTextContent('元');
    expect(screen.queryByTestId('input-prefix')).not.toBeInTheDocument();
  });

  it('PC 端 prefix 模式显示单位', () => {
    renderNumberField({ fieldId: 'price', label: '价格', unit: '¥', unitPosition: 'prefix' });
    expect(screen.getByTestId('input-prefix')).toHaveTextContent('¥');
    expect(screen.queryByTestId('input-suffix')).not.toBeInTheDocument();
  });

  it('PC 端 suffix 模式显示单位', () => {
    renderNumberField({ fieldId: 'price', label: '价格', unit: '元', unitPosition: 'suffix' });
    expect(screen.getByTestId('input-suffix')).toHaveTextContent('元');
    expect(screen.queryByTestId('input-prefix')).not.toBeInTheDocument();
  });

  it('PC 端无 unit 时不显示前后缀', () => {
    renderNumberField({ fieldId: 'price', label: '价格' });
    expect(screen.queryByTestId('input-prefix')).not.toBeInTheDocument();
    expect(screen.queryByTestId('input-suffix')).not.toBeInTheDocument();
  });

  it('移动端 suffix 模式显示单位', () => {
    mockIsMobile.mockReturnValue(true);
    renderNumberField({ fieldId: 'price', label: '价格', unit: '元' });
    expect(screen.getByText('元')).toBeInTheDocument();
    expect(screen.getByText('元').className).toContain('suffix');
  });

  it('移动端 prefix 模式显示单位', () => {
    mockIsMobile.mockReturnValue(true);
    renderNumberField({ fieldId: 'price', label: '价格', unit: '¥', unitPosition: 'prefix' });
    expect(screen.getByText('¥')).toBeInTheDocument();
    expect(screen.getByText('¥').className).toContain('prefix');
  });

  it('只读模式 suffix 显示单位', () => {
    renderNumberField(
      { fieldId: 'price', label: '价格', behavior: 'READONLY', unit: '元' },
      { initialValues: { price: 100 } },
    );
    expect(screen.getByTestId('numberfield-readonly-price')).toHaveTextContent('100元');
  });

  it('只读模式 prefix 显示单位', () => {
    renderNumberField(
      { fieldId: 'price', label: '价格', behavior: 'READONLY', unit: '¥', unitPosition: 'prefix' },
      { initialValues: { price: 100 } },
    );
    expect(screen.getByTestId('numberfield-readonly-price')).toHaveTextContent('¥100');
  });

  it('只读模式 null 值不显示单位', () => {
    renderNumberField({ fieldId: 'price', label: '价格', behavior: 'READONLY', unit: '元' });
    expect(screen.getByTestId('numberfield-readonly-price')).toHaveTextContent('--');
  });
});

describe('NumberField - 千位分隔符 (thousandSeparator)', () => {
  it('PC 端启用千位分隔符时传递 formatter/parser', () => {
    renderNumberField({ fieldId: 'amount', label: '金额', thousandSeparator: true });
    const el = screen.getByTestId('numberfield-input-amount-inner');
    expect(el).toHaveAttribute('data-has-formatter', 'true');
    expect(el).toHaveAttribute('data-has-parser', 'true');
  });

  it('PC 端未启用千位分隔符时不传 formatter/parser', () => {
    renderNumberField({ fieldId: 'amount', label: '金额' });
    const el = screen.getByTestId('numberfield-input-amount-inner');
    expect(el).not.toHaveAttribute('data-has-formatter');
    expect(el).not.toHaveAttribute('data-has-parser');
  });

  it('只读模式千位分隔符格式化', () => {
    renderNumberField(
      { fieldId: 'amount', label: '金额', behavior: 'READONLY', thousandSeparator: true },
      { initialValues: { amount: 1234567 } },
    );
    expect(screen.getByTestId('numberfield-readonly-amount')).toHaveTextContent('1,234,567');
  });

  it('只读模式千位分隔符 + 小数', () => {
    renderNumberField(
      {
        fieldId: 'amount',
        label: '金额',
        behavior: 'READONLY',
        thousandSeparator: true,
        precision: 2,
      },
      { initialValues: { amount: 1234567.89 } },
    );
    expect(screen.getByTestId('numberfield-readonly-amount')).toHaveTextContent('1,234,567.89');
  });

  it('只读模式千位分隔符 + 单位', () => {
    renderNumberField(
      {
        fieldId: 'amount',
        label: '金额',
        behavior: 'READONLY',
        thousandSeparator: true,
        unit: '元',
      },
      { initialValues: { amount: 1234567 } },
    );
    expect(screen.getByTestId('numberfield-readonly-amount')).toHaveTextContent('1,234,567元');
  });
});

describe('NumberField - 小数位数 (precision) 只读模式', () => {
  it('只读模式显示指定小数位数', () => {
    renderNumberField(
      { fieldId: 'rate', label: '费率', behavior: 'READONLY', precision: 2 },
      { initialValues: { rate: 3.1 } },
    );
    expect(screen.getByTestId('numberfield-readonly-rate')).toHaveTextContent('3.10');
  });

  it('只读模式 precision=0 显示整数', () => {
    renderNumberField(
      { fieldId: 'count', label: '数量', behavior: 'READONLY', precision: 0 },
      { initialValues: { count: 42.7 } },
    );
    expect(screen.getByTestId('numberfield-readonly-count')).toHaveTextContent('43');
  });
});

describe('NumberField - 所有新 props 组合', () => {
  it('只读模式 prefix + 千位分隔符 + precision', () => {
    renderNumberField(
      {
        fieldId: 'salary',
        label: '薪资',
        behavior: 'READONLY',
        unit: '¥',
        unitPosition: 'prefix',
        thousandSeparator: true,
        precision: 2,
      },
      { initialValues: { salary: 50000 } },
    );
    expect(screen.getByTestId('numberfield-readonly-salary')).toHaveTextContent('¥50,000.00');
  });

  it('只读模式 suffix + 千位分隔符 + precision', () => {
    renderNumberField(
      {
        fieldId: 'salary',
        label: '薪资',
        behavior: 'READONLY',
        unit: '元',
        unitPosition: 'suffix',
        thousandSeparator: true,
        precision: 2,
      },
      { initialValues: { salary: 1234567.8 } },
    );
    expect(screen.getByTestId('numberfield-readonly-salary')).toHaveTextContent('1,234,567.80元');
  });

  it('无新 props 时行为不变', () => {
    renderNumberField(
      { fieldId: 'age', label: '年龄', behavior: 'READONLY' },
      { initialValues: { age: 25 } },
    );
    expect(screen.getByTestId('numberfield-readonly-age')).toHaveTextContent('25');
  });
});
