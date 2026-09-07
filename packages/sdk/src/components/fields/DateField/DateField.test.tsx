import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { DateField } from './index';
import { FormProvider } from '../../core/FormProvider';
import { useFormContext } from '../../core/FormContext';
import type { FormSchema, FormEngineConfig } from '../../types';

// ---- mock defaultRegistry to prevent transitive field imports ----
vi.mock('../../core/defaultRegistry', () => ({
  defaultComponentRegistry: {},
}));

// ---- mock antd ----
const formatPickerValue = (value: any) =>
  value && typeof value.format === 'function' ? value.format('YYYY-MM-DD') : (value ?? '');

vi.mock('antd', () => ({
  DatePicker: (props: any) => {
    const { onChange, value, placeholder, disabled, className, format, showTime, locale, ...rest } =
      props;
    return React.createElement(
      'div',
      null,
      React.createElement('input', {
        type: 'text',
        value: formatPickerValue(value),
        placeholder,
        disabled,
        className,
        'data-format': format,
        'data-showtime': showTime ? 'true' : undefined,
        'data-locale': locale?.lang?.locale || locale?.locale,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          // Simulate array dateString for coverage
          onChange?.(null, [e.target.value]);
        },
        'data-testid': rest['data-testid'],
      }),
      React.createElement(
        'button',
        {
          'data-testid': `${rest['data-testid']}-string-trigger`,
          onClick: () => onChange?.(null, '2024-08-20'),
        },
        'string-date',
      ),
    );
  },
}));

// ---- mock antd-mobile ----
vi.mock('antd-mobile', () => ({
  ConfigProvider: (props: any) =>
    React.createElement(
      'div',
      {
        'data-testid': 'antd-mobile-config-provider',
        'data-locale': props.locale?.locale,
      },
      props.children,
    ),
  Popup: (props: any) =>
    props.visible
      ? React.createElement('div', { 'data-testid': 'mobile-popup' }, props.children)
      : null,
  Calendar: (props: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'antd-mobile-calendar' },
      React.createElement(
        'button',
        {
          'data-testid': 'calendar-select',
          onClick: () => props.onChange?.(new Date('2024-06-15T00:00:00')),
        },
        'select-date',
      ),
    ),
  PickerView: (props: any) =>
    React.createElement(
      'div',
      {
        'data-testid': 'antd-mobile-picker-view',
        'data-column-count': String(props.columns?.length ?? 0),
      },
      React.createElement(
        'button',
        {
          'data-testid': 'time-select',
          onClick: () =>
            props.onChange?.(
              (props.columns || []).length === 2 ? ['16', '20'] : ['16', '20', '30'],
              {},
            ),
        },
        'select-time',
      ),
    ),
}));

// ---- mock useDeviceDetect ----
const mockIsMobile = vi.fn(() => false);
vi.mock('../../hooks/useDeviceDetect', () => ({
  useDeviceDetect: () => ({ isMobile: mockIsMobile() }),
}));

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

function renderDateField(
  props: Partial<React.ComponentProps<typeof DateField>> & { fieldId: string; label: string },
  opts?: { schema?: FormSchema; config?: FormEngineConfig; initialValues?: Record<string, any> },
) {
  const schema =
    opts?.schema ??
    createSchema({
      fields: [{ fieldId: props.fieldId, componentName: 'DateField', label: props.label }],
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
      React.createElement(DateField, props as any),
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

describe('DateField - NORMAL 态', () => {
  it('正常渲染 PC 端 DatePicker', () => {
    renderDateField({ fieldId: 'birthday', label: '生日' });
    expect(screen.getByText('生日')).toBeInTheDocument();
    expect(screen.getByTestId('datefield-input-birthday')).toBeInTheDocument();
    expect(screen.getByTestId('datefield-input-birthday')).toHaveAttribute(
      'data-locale',
      'zh_CN',
    );
  });

  it('onChange 触发值变更', () => {
    const onChange = vi.fn();
    const { ctxRef } = renderDateField({ fieldId: 'birthday', label: '生日', onChange });
    fireEvent.change(screen.getByTestId('datefield-input-birthday'), {
      target: { value: '2024-01-15' },
    });
    expect(onChange).toHaveBeenCalledWith('2024-01-15');
    expect(ctxRef.current!.formData.birthday).toBe('2024-01-15');
  });

  it('dateFormat 属性传递', () => {
    renderDateField({ fieldId: 'birthday', label: '生日', dateFormat: 'YYYY/MM/DD' });
    expect(screen.getByTestId('datefield-input-birthday')).toHaveAttribute(
      'data-format',
      'YYYY/MM/DD',
    );
  });

  it('showTime 属性传递', () => {
    renderDateField({ fieldId: 'birthday', label: '生日', showTime: true });
    expect(screen.getByTestId('datefield-input-birthday')).toHaveAttribute('data-showtime', 'true');
  });
});

describe('DateField - READONLY 态', () => {
  it('显示日期文本', () => {
    renderDateField(
      { fieldId: 'birthday', label: '生日', behavior: 'READONLY' },
      { initialValues: { birthday: '2024-01-15' } },
    );
    expect(screen.getByTestId('datefield-readonly-birthday')).toHaveTextContent('2024-01-15');
  });

  it('空值显示 "--"', () => {
    renderDateField({ fieldId: 'birthday', label: '生日', behavior: 'READONLY' });
    expect(screen.getByTestId('datefield-readonly-birthday')).toHaveTextContent('--');
  });
});

describe('DateField - HIDDEN 态', () => {
  it('不渲染任何 DOM', () => {
    renderDateField({ fieldId: 'birthday', label: '生日', behavior: 'HIDDEN' });
    expect(document.querySelector('[data-field-id="birthday"]')).not.toBeInTheDocument();
  });
});

describe('DateField - DISABLED 态', () => {
  it('DatePicker 禁用', () => {
    renderDateField({ fieldId: 'birthday', label: '生日', behavior: 'DISABLED' });
    expect(screen.getByTestId('datefield-input-birthday')).toBeDisabled();
  });
});

describe('DateField - 数据绑定', () => {
  it('从 FormProvider 接收初始值', () => {
    renderDateField(
      { fieldId: 'birthday', label: '生日' },
      { initialValues: { birthday: '2024-03-01' } },
    );
    expect(screen.getByTestId('datefield-input-birthday')).toHaveValue('2024-03-01');
  });

  it('外部 setFieldValue 更新', () => {
    const { ctxRef } = renderDateField({ fieldId: 'birthday', label: '生日' });
    act(() => {
      ctxRef.current!.setFieldValue('birthday', '2024-12-25');
    });
    expect(screen.getByTestId('datefield-input-birthday')).toHaveValue('2024-12-25');
  });

  it('defaultValue 在 mount 时设置', () => {
    const { ctxRef } = renderDateField({
      fieldId: 'birthday',
      label: '生日',
      defaultValue: '2024-01-01',
    });
    expect(ctxRef.current!.formData.birthday).toBe('2024-01-01');
  });

  it('defaultValue 不覆盖 initialValues', () => {
    const { ctxRef } = renderDateField(
      { fieldId: 'birthday', label: '生日', defaultValue: '2024-01-01' },
      { initialValues: { birthday: '2024-06-01' } },
    );
    expect(ctxRef.current!.formData.birthday).toBe('2024-06-01');
  });
});

describe('DateField - 校验', () => {
  it('required 空值报错', async () => {
    const schema = createSchema({
      fields: [{ fieldId: 'birthday', componentName: 'DateField', label: '生日', required: true }],
    });
    const { ctxRef } = renderDateField(
      { fieldId: 'birthday', label: '生日', required: true },
      { schema },
    );
    await act(async () => {
      await ctxRef.current!.validateField('birthday');
    });
    expect(screen.getByTestId('error-birthday')).toHaveTextContent('生日为必填项');
  });

  it('required 有值通过', async () => {
    const schema = createSchema({
      fields: [{ fieldId: 'birthday', componentName: 'DateField', label: '生日', required: true }],
    });
    const { ctxRef } = renderDateField(
      { fieldId: 'birthday', label: '生日', required: true },
      { schema, initialValues: { birthday: '2024-01-01' } },
    );
    await act(async () => {
      const result = await ctxRef.current!.validateField('birthday');
      expect(result).toBe(true);
    });
  });
});

describe('DateField - 移动端', () => {
  it('isMobile 时渲染移动端组件', () => {
    mockIsMobile.mockReturnValue(true);
    renderDateField({ fieldId: 'birthday', label: '生日' });
    expect(screen.getByTestId('datefield-trigger-birthday')).toBeInTheDocument();
  });

  it('移动端点击选择日期', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderDateField({ fieldId: 'birthday', label: '生日', onChange });
    fireEvent.click(screen.getByTestId('datefield-trigger-birthday'));
    expect(screen.getByTestId('antd-mobile-config-provider')).toHaveAttribute(
      'data-locale',
      'zh-CH',
    );
    fireEvent.click(screen.getByTestId('calendar-select'));
    fireEvent.click(screen.getByTestId('datefield-confirm-birthday'));
    expect(onChange).toHaveBeenCalledWith('2024-06-15');
    expect(ctxRef.current!.formData.birthday).toBe('2024-06-15');
  });

  it('移动端取消选择不提交临时日期', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderDateField({ fieldId: 'birthday', label: '生日', onChange });
    fireEvent.click(screen.getByTestId('datefield-trigger-birthday'));
    fireEvent.click(screen.getByTestId('calendar-select'));
    fireEvent.click(screen.getByText('取消'));

    expect(onChange).not.toHaveBeenCalled();
    expect(ctxRef.current!.formData.birthday).toBeUndefined();
    expect(screen.queryByTestId('mobile-popup')).not.toBeInTheDocument();
  });

  it('移动端 disabled 不可点击', () => {
    mockIsMobile.mockReturnValue(true);
    renderDateField({ fieldId: 'birthday', label: '生日', behavior: 'DISABLED' });
    fireEvent.click(screen.getByTestId('datefield-trigger-birthday'));
    expect(screen.queryByTestId('mobile-popup')).not.toBeInTheDocument();
  });

  it('移动端日期时间点击选择时间后确认', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderDateField({
      fieldId: 'birthday',
      label: '生日',
      showTime: true,
      onChange,
    });
    fireEvent.click(screen.getByTestId('datefield-trigger-birthday'));
    fireEvent.click(screen.getByTestId('calendar-select'));
    fireEvent.click(screen.getByTestId('datefield-time-trigger-birthday'));
    expect(screen.getByTestId('antd-mobile-picker-view')).toHaveAttribute(
      'data-column-count',
      '3',
    );
    fireEvent.click(screen.getByTestId('time-select'));
    fireEvent.click(screen.getByTestId('datefield-confirm-birthday'));
    expect(onChange).toHaveBeenCalledWith('2024-06-15 16:20:30');
    expect(ctxRef.current!.formData.birthday).toBe('2024-06-15 16:20:30');
  });

  it('移动端日期时间遵循 dateFormat 输出', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderDateField({
      fieldId: 'birthday',
      label: '生日',
      dateFormat: 'YYYY/MM/DD HH:mm:ss',
      onChange,
    });
    fireEvent.click(screen.getByTestId('datefield-trigger-birthday'));
    fireEvent.click(screen.getByTestId('calendar-select'));
    fireEvent.click(screen.getByTestId('datefield-time-trigger-birthday'));
    fireEvent.click(screen.getByTestId('time-select'));
    fireEvent.click(screen.getByTestId('datefield-confirm-birthday'));

    expect(onChange).toHaveBeenCalledWith('2024/06/15 16:20:30');
    expect(ctxRef.current!.formData.birthday).toBe('2024/06/15 16:20:30');
  });

  it('移动端 YYYY-MM-DD HH:mm 不渲染秒列', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderDateField({
      fieldId: 'birthday',
      label: '生日',
      dateFormat: 'YYYY-MM-DD HH:mm',
      onChange,
    });
    fireEvent.click(screen.getByTestId('datefield-trigger-birthday'));
    fireEvent.click(screen.getByTestId('calendar-select'));
    fireEvent.click(screen.getByTestId('datefield-time-trigger-birthday'));
    expect(screen.getByTestId('antd-mobile-picker-view')).toHaveAttribute(
      'data-column-count',
      '2',
    );
    fireEvent.click(screen.getByTestId('time-select'));
    fireEvent.click(screen.getByTestId('datefield-confirm-birthday'));

    expect(onChange).toHaveBeenCalledWith('2024-06-15 16:20');
    expect(ctxRef.current!.formData.birthday).toBe('2024-06-15 16:20');
  });

  it('移动端清空日期', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderDateField(
      { fieldId: 'birthday', label: '生日', onChange },
      { initialValues: { birthday: '2024-06-15' } },
    );
    fireEvent.click(screen.getByTestId('datefield-trigger-birthday-clear'));

    expect(onChange).toHaveBeenCalledWith('');
    expect(ctxRef.current!.formData.birthday).toBe('');
  });
});

describe('DateField - behavior 优先级', () => {
  it('props.behavior 优先于 context', () => {
    const schema = createSchema({
      fields: [
        { fieldId: 'birthday', componentName: 'DateField', label: '生日', behavior: 'DISABLED' },
      ],
    });
    renderDateField(
      { fieldId: 'birthday', label: '生日', behavior: 'READONLY' },
      { schema, initialValues: { birthday: '2024-01-01' } },
    );
    expect(screen.getByTestId('datefield-readonly-birthday')).toBeInTheDocument();
  });

  it('字段不在 schema 中时默认 NORMAL', () => {
    const schema = createSchema({ fields: [] });
    renderDateField({ fieldId: 'unknown', label: '未知' }, { schema });
    expect(screen.getByTestId('datefield-input-unknown')).toBeInTheDocument();
  });
});

describe('DateField - PC 端边界', () => {
  it('清空日期', () => {
    const onChange = vi.fn();
    const { ctxRef } = renderDateField(
      { fieldId: 'birthday', label: '生日', onChange },
      { initialValues: { birthday: '2024-01-01' } },
    );
    fireEvent.change(screen.getByTestId('datefield-input-birthday'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith('');
    expect(ctxRef.current!.formData.birthday).toBe('');
  });

  it('dateString 为非数组字符串时正常处理', () => {
    const onChange = vi.fn();
    const { ctxRef } = renderDateField({ fieldId: 'birthday', label: '生日', onChange });
    fireEvent.click(screen.getByTestId('datefield-input-birthday-string-trigger'));
    expect(onChange).toHaveBeenCalledWith('2024-08-20');
    expect(ctxRef.current!.formData.birthday).toBe('2024-08-20');
  });
});
