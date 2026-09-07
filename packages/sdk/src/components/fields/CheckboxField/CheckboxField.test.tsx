import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { CheckboxField } from './index';
import { FormProvider } from '../../core/FormProvider';
import { useFormContext } from '../../core/FormContext';
import type { FormSchema, FormEngineConfig } from '../../types';

// ---- mock defaultRegistry to prevent transitive field imports ----
vi.mock('../../core/defaultRegistry', () => ({
  defaultComponentRegistry: {},
}));

// ---- mock antd ----
vi.mock('antd', () => ({
  Tag: (props: any) => React.createElement('span', { 'data-color': props.color }, props.children),
  Checkbox: Object.assign(
    (props: any) => {
      const { children, value } = props;
      return React.createElement('label', { 'data-value': value }, children);
    },
    {
      Group: (props: any) => {
        const { disabled, className, children, style, ...rest } = props;
        return React.createElement(
          'div',
          {
            className,
            'data-testid': rest['data-testid'],
            'data-disabled': disabled ? 'true' : undefined,
            style,
          },
          children,
          React.createElement('button', {
            'data-testid': `checkbox-trigger-${rest['data-testid']}`,
            onClick: () => {
              if (disabled) return;
              // Simulate toggling 'read'
              const current = props.value || [];
              const newVal = current.includes('read')
                ? current.filter((v: string) => v !== 'read')
                : [...current, 'read'];
              props.onChange?.(newVal);
            },
          }),
        );
      },
    },
  ),
}));

// ---- mock antd-mobile ----
vi.mock('antd-mobile', () => ({
  Checkbox: Object.assign(
    (props: any) => {
      const { children, value } = props;
      return React.createElement('label', { 'data-value': value }, children);
    },
    {
      Group: (props: any) => {
        const { onChange, value, disabled, children } = props;
        return React.createElement(
          'div',
          {
            'data-testid': 'antd-mobile-checkbox-group',
            'data-disabled': disabled ? 'true' : undefined,
            onClick: (e: any) => {
              if (disabled) return;
              const val = e.target.getAttribute('data-checkbox-value');
              if (val) {
                const current = value || [];
                const newVal = current.includes(val)
                  ? current.filter((v: string) => v !== val)
                  : [...current, val];
                onChange?.(newVal);
              }
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
  { value: 'read', label: '阅读' },
  { value: 'sport', label: '运动' },
  { value: 'music', label: '音乐' },
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

function renderCheckboxField(
  props: Partial<React.ComponentProps<typeof CheckboxField>> & { fieldId: string; label: string },
  opts?: { schema?: FormSchema; config?: FormEngineConfig; initialValues?: Record<string, any> },
) {
  const schema =
    opts?.schema ??
    createSchema({
      fields: [{ fieldId: props.fieldId, componentName: 'CheckboxField', label: props.label }],
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
      React.createElement(CheckboxField, { options, ...props } as any),
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

describe('CheckboxField - NORMAL 态', () => {
  it('正常渲染 PC 端 Checkbox.Group', () => {
    renderCheckboxField({ fieldId: 'hobbies', label: '爱好' });
    expect(screen.getByText('爱好')).toBeInTheDocument();
    expect(screen.getByTestId('checkboxfield-input-hobbies')).toBeInTheDocument();
    expect(screen.getByText('阅读')).toBeInTheDocument();
    expect(screen.getByText('运动')).toBeInTheDocument();
  });

  it('onChange 触发值变更', () => {
    const onChange = vi.fn();
    const { ctxRef } = renderCheckboxField({ fieldId: 'hobbies', label: '爱好', onChange });
    fireEvent.click(screen.getByTestId('checkbox-trigger-checkboxfield-input-hobbies'));
    expect(onChange).toHaveBeenCalledWith([{ value: 'read', label: '阅读' }]);
    expect(ctxRef.current!.formData.hobbies).toEqual([{ value: 'read', label: '阅读' }]);
  });
});

describe('CheckboxField - READONLY 态', () => {
  it('显示选中项列表', () => {
    renderCheckboxField(
      { fieldId: 'hobbies', label: '爱好', behavior: 'READONLY' },
      {
        initialValues: {
          hobbies: [
            { value: 'read', label: '阅读' },
            { value: 'music', label: '音乐' },
          ],
        },
      },
    );
    expect(screen.getByTestId('checkboxfield-readonly-hobbies')).toHaveTextContent('阅读');
    expect(screen.getByTestId('checkboxfield-readonly-hobbies')).toHaveTextContent('音乐');
  });

  it('空值显示 "--"', () => {
    renderCheckboxField({ fieldId: 'hobbies', label: '爱好', behavior: 'READONLY' });
    expect(screen.getByTestId('checkboxfield-readonly-hobbies')).toHaveTextContent('--');
  });
});

describe('CheckboxField - HIDDEN 态', () => {
  it('不渲染任何 DOM', () => {
    renderCheckboxField({ fieldId: 'hobbies', label: '爱好', behavior: 'HIDDEN' });
    expect(document.querySelector('[data-field-id="hobbies"]')).not.toBeInTheDocument();
  });
});

describe('CheckboxField - DISABLED 态', () => {
  it('Checkbox.Group 禁用', () => {
    renderCheckboxField({ fieldId: 'hobbies', label: '爱好', behavior: 'DISABLED' });
    expect(screen.getByTestId('checkboxfield-input-hobbies')).toHaveAttribute(
      'data-disabled',
      'true',
    );
  });
});

describe('CheckboxField - 数据绑定', () => {
  it('外部 setFieldValue 更新', () => {
    const { ctxRef } = renderCheckboxField({ fieldId: 'hobbies', label: '爱好' });
    act(() => {
      ctxRef.current!.setFieldValue('hobbies', [{ value: 'sport', label: '运动' }]);
    });
    expect(ctxRef.current!.formData.hobbies).toEqual([{ value: 'sport', label: '运动' }]);
  });

  it('defaultValue 在 mount 时设置', () => {
    const { ctxRef } = renderCheckboxField({
      fieldId: 'hobbies',
      label: '爱好',
      defaultValue: [{ value: 'read', label: '阅读' }],
    });
    expect(ctxRef.current!.formData.hobbies).toEqual([{ value: 'read', label: '阅读' }]);
  });

  it('defaultValue 不覆盖 initialValues', () => {
    const { ctxRef } = renderCheckboxField(
      { fieldId: 'hobbies', label: '爱好', defaultValue: [{ value: 'read', label: '阅读' }] },
      { initialValues: { hobbies: [{ value: 'sport', label: '运动' }] } },
    );
    expect(ctxRef.current!.formData.hobbies).toEqual([{ value: 'sport', label: '运动' }]);
  });
});

describe('CheckboxField - 校验', () => {
  it('required 空值报错', async () => {
    const schema = createSchema({
      fields: [
        { fieldId: 'hobbies', componentName: 'CheckboxField', label: '爱好', required: true },
      ],
    });
    const { ctxRef } = renderCheckboxField(
      { fieldId: 'hobbies', label: '爱好', required: true },
      { schema },
    );
    await act(async () => {
      await ctxRef.current!.validateField('hobbies');
    });
    expect(screen.getByTestId('error-hobbies')).toHaveTextContent('爱好为必填项');
  });

  it('required 有值通过', async () => {
    const schema = createSchema({
      fields: [
        { fieldId: 'hobbies', componentName: 'CheckboxField', label: '爱好', required: true },
      ],
    });
    const { ctxRef } = renderCheckboxField(
      { fieldId: 'hobbies', label: '爱好', required: true },
      { schema, initialValues: { hobbies: [{ value: 'read', label: '阅读' }] } },
    );
    await act(async () => {
      const result = await ctxRef.current!.validateField('hobbies');
      expect(result).toBe(true);
    });
  });
});

describe('CheckboxField - 移动端', () => {
  it('isMobile 时渲染移动端组件', () => {
    mockIsMobile.mockReturnValue(true);
    renderCheckboxField({ fieldId: 'hobbies', label: '爱好' });
    expect(screen.getByTestId('antd-mobile-checkbox-group')).toBeInTheDocument();
    expect(screen.getByTestId('antd-mobile-checkbox-group')).toHaveClass('is-horizontal');
  });

  it('移动端选择', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderCheckboxField({ fieldId: 'hobbies', label: '爱好', onChange });
    const el = screen.getByTestId('antd-mobile-checkbox-group');
    const btn = document.createElement('div');
    btn.setAttribute('data-checkbox-value', 'read');
    el.appendChild(btn);
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledWith([{ value: 'read', label: '阅读' }]);
    expect(ctxRef.current!.formData.hobbies).toEqual([{ value: 'read', label: '阅读' }]);
  });

  it('移动端点击实际选项可切换选中样式', () => {
    mockIsMobile.mockReturnValue(true);
    const { ctxRef } = renderCheckboxField({ fieldId: 'hobbies', label: '爱好' });
    const readButton = screen.getByText('阅读').closest('button');

    fireEvent.click(readButton!);
    expect(ctxRef.current!.formData.hobbies).toEqual([{ value: 'read', label: '阅读' }]);
    expect(readButton).toHaveClass('is-active');

    fireEvent.click(readButton!);
    expect(ctxRef.current!.formData.hobbies).toEqual([]);
    expect(readButton).not.toHaveClass('is-active');
  });

  it('移动端 maxCount 达上限后禁用未选选项', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderCheckboxField({
      fieldId: 'hobbies',
      label: '爱好',
      maxCount: 1,
      onChange,
    });
    fireEvent.click(screen.getByText('阅读').closest('button')!);

    const sportButton = screen.getByText('运动').closest('button');
    expect(sportButton).toBeDisabled();
    fireEvent.click(sportButton!);

    expect(onChange).toHaveBeenLastCalledWith([{ value: 'read', label: '阅读' }]);
    expect(ctxRef.current!.formData.hobbies).toEqual([{ value: 'read', label: '阅读' }]);
  });

  it('移动端禁用选项不可选择', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderCheckboxField({
      fieldId: 'hobbies',
      label: '爱好',
      options: [
        { value: 'read', label: '阅读', disabled: true },
        { value: 'sport', label: '运动' },
      ],
      onChange,
    });
    const readButton = screen.getByText('阅读').closest('button');

    expect(readButton).toBeDisabled();
    fireEvent.click(readButton!);
    expect(onChange).not.toHaveBeenCalled();
    expect(ctxRef.current!.formData.hobbies).toBeUndefined();
  });

  it('移动端 disabled', () => {
    mockIsMobile.mockReturnValue(true);
    renderCheckboxField({ fieldId: 'hobbies', label: '爱好', behavior: 'DISABLED' });
    expect(screen.getByTestId('antd-mobile-checkbox-group')).toHaveAttribute(
      'data-disabled',
      'true',
    );
  });
});

describe('CheckboxField - behavior 优先级', () => {
  it('props.behavior 优先于 context', () => {
    const schema = createSchema({
      fields: [
        { fieldId: 'hobbies', componentName: 'CheckboxField', label: '爱好', behavior: 'DISABLED' },
      ],
    });
    renderCheckboxField(
      { fieldId: 'hobbies', label: '爱好', behavior: 'READONLY' },
      { schema, initialValues: { hobbies: [{ value: 'read', label: '阅读' }] } },
    );
    expect(screen.getByTestId('checkboxfield-readonly-hobbies')).toBeInTheDocument();
  });

  it('字段不在 schema 中时默认 NORMAL', () => {
    const schema = createSchema({ fields: [] });
    renderCheckboxField({ fieldId: 'unknown', label: '未知' }, { schema });
    expect(screen.getByTestId('checkboxfield-input-unknown')).toBeInTheDocument();
  });
});

describe('CheckboxField - direction', () => {
  it('PC vertical 方向', () => {
    renderCheckboxField({ fieldId: 'hobbies', label: '爱好', direction: 'vertical' });
    expect(screen.getByTestId('checkboxfield-input-hobbies')).toBeInTheDocument();
  });

  it('移动端默认横向排列', () => {
    mockIsMobile.mockReturnValue(true);
    renderCheckboxField({ fieldId: 'hobbies', label: '爱好' });
    expect(screen.getByTestId('antd-mobile-checkbox-group')).toHaveClass('is-horizontal');
  });

  it('移动端显式 vertical 方向保留竖排', () => {
    mockIsMobile.mockReturnValue(true);
    renderCheckboxField({ fieldId: 'hobbies', label: '爱好', direction: 'vertical' });
    expect(screen.getByTestId('antd-mobile-checkbox-group')).toHaveClass('is-vertical');
  });
});
