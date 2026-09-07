import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { RadioField } from './index';
import { FormProvider } from '../../core/FormProvider';
import { useFormContext } from '../../core/FormContext';
import type { FormSchema, FormEngineConfig } from '../../types';

// ---- mock defaultRegistry to prevent transitive field imports ----
vi.mock('../../core/defaultRegistry', () => ({
  defaultComponentRegistry: {},
}));

// ---- mock antd ----
vi.mock('antd', () => ({
  Radio: Object.assign(
    (props: any) => {
      const { children, ...rest } = props;
      return React.createElement(
        'label',
        { 'data-value': rest.value },
        React.createElement('input', { type: 'radio', ...rest }),
        children,
      );
    },
    {
      Group: (props: any) => {
        const { onChange, disabled, className, children, style, ...rest } = props;
        return React.createElement(
          'div',
          {
            className,
            'data-testid': rest['data-testid'],
            'data-disabled': disabled ? 'true' : undefined,
            style,
            onChange: (e: any) => {
              if (disabled) return;
              onChange?.({ target: { value: e.target.value } });
            },
          },
          children,
          React.createElement('button', {
            'data-testid': 'radio-invalid',
            onClick: () => {
              if (disabled) return;
              onChange?.({ target: { value: 'nonexistent' } });
            },
          }),
        );
      },
    },
  ),
}));

// ---- mock antd-mobile ----
vi.mock('antd-mobile', () => ({
  Radio: Object.assign(
    (props: any) => {
      const { children } = props;
      return React.createElement('label', { 'data-value': props.value }, children);
    },
    {
      Group: (props: any) => {
        const { onChange, disabled, children } = props;
        return React.createElement(
          'div',
          {
            'data-testid': 'antd-mobile-radio-group',
            'data-disabled': disabled ? 'true' : undefined,
            onClick: (e: any) => {
              if (disabled) return;
              const val = e.target.getAttribute('data-radio-value');
              if (val) onChange?.(val);
            },
          },
          children,
        );
      },
    },
  ),
  Space: (props: any) =>
    React.createElement('div', { 'data-direction': props.direction }, props.children),
}));

// ---- mock useDeviceDetect ----
const mockIsMobile = vi.fn(() => false);
vi.mock('../../hooks/useDeviceDetect', () => ({
  useDeviceDetect: () => ({ isMobile: mockIsMobile() }),
}));

const options = [
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
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

function renderRadioField(
  props: Partial<React.ComponentProps<typeof RadioField>> & { fieldId: string; label: string },
  opts?: { schema?: FormSchema; config?: FormEngineConfig; initialValues?: Record<string, any> },
) {
  const schema =
    opts?.schema ??
    createSchema({
      fields: [{ fieldId: props.fieldId, componentName: 'RadioField', label: props.label }],
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
      React.createElement(RadioField, { options, ...props } as any),
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

describe('RadioField - NORMAL 态', () => {
  it('正常渲染 PC 端 Radio.Group', () => {
    renderRadioField({ fieldId: 'gender', label: '性别' });
    expect(screen.getByText('性别')).toBeInTheDocument();
    expect(screen.getByTestId('radiofield-input-gender')).toBeInTheDocument();
    expect(screen.getByText('男')).toBeInTheDocument();
    expect(screen.getByText('女')).toBeInTheDocument();
  });

  it('onChange 触发值变更', () => {
    const onChange = vi.fn();
    const { ctxRef } = renderRadioField({ fieldId: 'gender', label: '性别', onChange });
    const radioInput = screen
      .getByTestId('radiofield-input-gender')
      .querySelector('input[value="male"]');
    fireEvent.click(radioInput!);
    expect(onChange).toHaveBeenCalledWith({ value: 'male', label: '男' });
    expect(ctxRef.current!.formData.gender).toEqual({ value: 'male', label: '男' });
  });
});

describe('RadioField - READONLY 态', () => {
  it('显示选中 label', () => {
    renderRadioField(
      { fieldId: 'gender', label: '性别', behavior: 'READONLY' },
      { initialValues: { gender: { value: 'male', label: '男' } } },
    );
    expect(screen.getByTestId('radiofield-readonly-gender')).toHaveTextContent('男');
  });

  it('空值显示 "--"', () => {
    renderRadioField({ fieldId: 'gender', label: '性别', behavior: 'READONLY' });
    expect(screen.getByTestId('radiofield-readonly-gender')).toHaveTextContent('--');
  });
});

describe('RadioField - HIDDEN 态', () => {
  it('不渲染任何 DOM', () => {
    renderRadioField({ fieldId: 'gender', label: '性别', behavior: 'HIDDEN' });
    expect(document.querySelector('[data-field-id="gender"]')).not.toBeInTheDocument();
  });
});

describe('RadioField - DISABLED 态', () => {
  it('Radio.Group 禁用', () => {
    renderRadioField({ fieldId: 'gender', label: '性别', behavior: 'DISABLED' });
    expect(screen.getByTestId('radiofield-input-gender')).toHaveAttribute('data-disabled', 'true');
  });
});

describe('RadioField - 数据绑定', () => {
  it('外部 setFieldValue 更新', () => {
    const { ctxRef } = renderRadioField({ fieldId: 'gender', label: '性别' });
    act(() => {
      ctxRef.current!.setFieldValue('gender', { value: 'female', label: '女' });
    });
    expect(ctxRef.current!.formData.gender).toEqual({ value: 'female', label: '女' });
  });

  it('defaultValue 在 mount 时设置', () => {
    const { ctxRef } = renderRadioField({
      fieldId: 'gender',
      label: '性别',
      defaultValue: { value: 'male', label: '男' },
    });
    expect(ctxRef.current!.formData.gender).toEqual({ value: 'male', label: '男' });
  });

  it('defaultValue 不覆盖 initialValues', () => {
    const { ctxRef } = renderRadioField(
      { fieldId: 'gender', label: '性别', defaultValue: { value: 'male', label: '男' } },
      { initialValues: { gender: { value: 'female', label: '女' } } },
    );
    expect(ctxRef.current!.formData.gender).toEqual({ value: 'female', label: '女' });
  });
});

describe('RadioField - 校验', () => {
  it('required 空值报错', async () => {
    const schema = createSchema({
      fields: [{ fieldId: 'gender', componentName: 'RadioField', label: '性别', required: true }],
    });
    const { ctxRef } = renderRadioField(
      { fieldId: 'gender', label: '性别', required: true },
      { schema },
    );
    await act(async () => {
      await ctxRef.current!.validateField('gender');
    });
    expect(screen.getByTestId('error-gender')).toHaveTextContent('性别为必填项');
  });

  it('required 有值通过', async () => {
    const schema = createSchema({
      fields: [{ fieldId: 'gender', componentName: 'RadioField', label: '性别', required: true }],
    });
    const { ctxRef } = renderRadioField(
      { fieldId: 'gender', label: '性别', required: true },
      { schema, initialValues: { gender: { value: 'male', label: '男' } } },
    );
    await act(async () => {
      const result = await ctxRef.current!.validateField('gender');
      expect(result).toBe(true);
    });
  });
});

describe('RadioField - 移动端', () => {
  it('isMobile 时渲染移动端组件', () => {
    mockIsMobile.mockReturnValue(true);
    renderRadioField({ fieldId: 'gender', label: '性别' });
    expect(screen.getByTestId('antd-mobile-radio-group')).toBeInTheDocument();
    expect(screen.getByTestId('antd-mobile-radio-group')).toHaveClass('is-horizontal');
  });

  it('移动端选择', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderRadioField({ fieldId: 'gender', label: '性别', onChange });
    const el = screen.getByTestId('antd-mobile-radio-group');
    // Simulate click with data-radio-value
    const btn = document.createElement('div');
    btn.setAttribute('data-radio-value', 'male');
    el.appendChild(btn);
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledWith({ value: 'male', label: '男' });
    expect(ctxRef.current!.formData.gender).toEqual({ value: 'male', label: '男' });
  });

  it('移动端点击实际选项后更新选中样式', () => {
    mockIsMobile.mockReturnValue(true);
    const { ctxRef } = renderRadioField({ fieldId: 'gender', label: '性别' });
    const maleButton = screen.getByText('男').closest('button');

    fireEvent.click(maleButton!);

    expect(ctxRef.current!.formData.gender).toEqual({ value: 'male', label: '男' });
    expect(maleButton).toHaveClass('is-active');
  });

  it('移动端禁用选项不可选择', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderRadioField({
      fieldId: 'gender',
      label: '性别',
      options: [
        { value: 'male', label: '男', disabled: true },
        { value: 'female', label: '女' },
      ],
      onChange,
    });
    const maleButton = screen.getByText('男').closest('button');

    expect(maleButton).toBeDisabled();
    fireEvent.click(maleButton!);
    expect(onChange).not.toHaveBeenCalled();
    expect(ctxRef.current!.formData.gender).toBeUndefined();
  });

  it('移动端 disabled', () => {
    mockIsMobile.mockReturnValue(true);
    renderRadioField({ fieldId: 'gender', label: '性别', behavior: 'DISABLED' });
    expect(screen.getByTestId('antd-mobile-radio-group')).toHaveAttribute('data-disabled', 'true');
  });
});

describe('RadioField - behavior 优先级', () => {
  it('props.behavior 优先于 context', () => {
    const schema = createSchema({
      fields: [
        { fieldId: 'gender', componentName: 'RadioField', label: '性别', behavior: 'DISABLED' },
      ],
    });
    renderRadioField(
      { fieldId: 'gender', label: '性别', behavior: 'READONLY' },
      { schema, initialValues: { gender: { value: 'male', label: '男' } } },
    );
    expect(screen.getByTestId('radiofield-readonly-gender')).toBeInTheDocument();
  });

  it('字段不在 schema 中时默认 NORMAL', () => {
    const schema = createSchema({ fields: [] });
    renderRadioField({ fieldId: 'unknown', label: '未知' }, { schema });
    expect(screen.getByTestId('radiofield-input-unknown')).toBeInTheDocument();
  });
});

describe('RadioField - direction', () => {
  it('PC vertical 方向', () => {
    renderRadioField({ fieldId: 'gender', label: '性别', direction: 'vertical' });
    expect(screen.getByTestId('radiofield-input-gender')).toBeInTheDocument();
  });

  it('移动端默认横向排列', () => {
    mockIsMobile.mockReturnValue(true);
    renderRadioField({ fieldId: 'gender', label: '性别' });
    expect(screen.getByTestId('antd-mobile-radio-group')).toHaveClass('is-horizontal');
  });

  it('移动端显式 vertical 方向保留竖排', () => {
    mockIsMobile.mockReturnValue(true);
    renderRadioField({ fieldId: 'gender', label: '性别', direction: 'vertical' });
    expect(screen.getByTestId('antd-mobile-radio-group')).toHaveClass('is-vertical');
  });

  it('PC 选择不存在的选项返回 null', () => {
    const onChange = vi.fn();
    const { ctxRef } = renderRadioField({ fieldId: 'gender', label: '性别', onChange });
    fireEvent.click(screen.getByTestId('radio-invalid'));
    expect(onChange).toHaveBeenCalledWith(null);
    expect(ctxRef.current!.formData.gender).toBe(null);
  });

  it('移动端选择不存在的选项返回 null', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderRadioField({ fieldId: 'gender', label: '性别', onChange });
    const el = screen.getByTestId('antd-mobile-radio-group');
    const btn = document.createElement('div');
    btn.setAttribute('data-radio-value', 'nonexistent');
    el.appendChild(btn);
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledWith(null);
    expect(ctxRef.current!.formData.gender).toBe(null);
  });
});
