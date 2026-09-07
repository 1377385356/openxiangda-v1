import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { CascadeDateField } from './index';
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
  DatePicker: Object.assign(() => null, {
    RangePicker: (props: any) => {
      const { onChange, value, placeholder, disabled, className, format, showTime, locale, ...rest } =
        props;
      return React.createElement(
        'div',
        {
          'data-testid': rest['data-testid'],
          'data-disabled': disabled ? 'true' : undefined,
          'data-format': format,
          'data-showtime': showTime ? 'true' : undefined,
          'data-locale': locale?.lang?.locale || locale?.locale,
          className,
        },
        React.createElement('input', {
          'data-testid': `${rest['data-testid']}-start`,
          value: formatPickerValue(value?.[0]),
          disabled,
          placeholder: placeholder?.[0] ?? '',
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
            const start = e.target.value;
            const end = formatPickerValue(value?.[1]);
            onChange?.(null, [start, end]);
          },
        }),
        React.createElement('input', {
          'data-testid': `${rest['data-testid']}-end`,
          value: formatPickerValue(value?.[1]),
          disabled,
          placeholder: placeholder?.[1] ?? '',
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
            const start = formatPickerValue(value?.[0]);
            const end = e.target.value;
            onChange?.(null, [start, end]);
          },
        }),
      );
    },
  }),
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
          'data-testid': 'calendar-range-select',
          onClick: () =>
            props.onChange?.([new Date('2024-06-15T00:00:00'), new Date('2024-06-20T00:00:00')]),
        },
        'select-range',
      ),
    ),
  PickerView: (props: any) =>
    React.createElement(
      'div',
      {
        'data-testid': 'antd-mobile-picker-view',
        className: props.className,
        'data-column-count': String(props.columns?.length ?? 0),
      },
      React.createElement(
        'button',
        {
          'data-testid': 'datetime-select',
          onClick: () =>
            props.onChange?.(
              (props.columns || []).length === 3
                ? ['2024-06-15', '16', '20']
                : ['2024-06-15', '16', '20', '30'],
              {},
            ),
        },
        'select-date-time',
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

function renderCascadeDateField(
  props: Partial<React.ComponentProps<typeof CascadeDateField>> & {
    fieldId: string;
    label: string;
  },
  opts?: { schema?: FormSchema; config?: FormEngineConfig; initialValues?: Record<string, any> },
) {
  const schema =
    opts?.schema ??
    createSchema({
      fields: [{ fieldId: props.fieldId, componentName: 'CascadeDateField', label: props.label }],
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
      React.createElement(CascadeDateField, props as any),
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

describe('CascadeDateField - NORMAL 态', () => {
  it('正常渲染 PC 端 RangePicker', () => {
    renderCascadeDateField({ fieldId: 'dateRange', label: '日期范围' });
    expect(screen.getByText('日期范围')).toBeInTheDocument();
    expect(screen.getByTestId('cascadedatefield-input-dateRange')).toBeInTheDocument();
    expect(screen.getByTestId('cascadedatefield-input-dateRange')).toHaveAttribute(
      'data-locale',
      'zh_CN',
    );
  });

  it('dateFormat 和 showTime 属性传递到 RangePicker', () => {
    renderCascadeDateField({
      fieldId: 'dateRange',
      label: '日期范围',
      dateFormat: 'YYYY-MM-DD HH:mm:ss',
      showTime: true,
    });

    const el = screen.getByTestId('cascadedatefield-input-dateRange');
    expect(el).toHaveAttribute('data-format', 'YYYY-MM-DD HH:mm:ss');
    expect(el).toHaveAttribute('data-showtime', 'true');
  });

  it('onChange 触发值变更 - 设置开始日期', () => {
    const onChange = vi.fn();
    renderCascadeDateField({ fieldId: 'dateRange', label: '日期范围', onChange });
    fireEvent.change(screen.getByTestId('cascadedatefield-input-dateRange-start'), {
      target: { value: '2024-01-01' },
    });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('onChange 触发值变更 - 完整范围', () => {
    const onChange = vi.fn();
    const { ctxRef } = renderCascadeDateField(
      { fieldId: 'dateRange', label: '日期范围', onChange },
      { initialValues: { dateRange: { start: '2024-01-01', end: '' } } },
    );
    fireEvent.change(screen.getByTestId('cascadedatefield-input-dateRange-end'), {
      target: { value: '2024-12-31' },
    });
    expect(onChange).toHaveBeenCalledWith({ start: '2024-01-01', end: '2024-12-31' });
    expect(ctxRef.current!.formData.dateRange).toEqual({ start: '2024-01-01', end: '2024-12-31' });
  });
});

describe('CascadeDateField - READONLY 态', () => {
  it('显示日期范围', () => {
    renderCascadeDateField(
      { fieldId: 'dateRange', label: '日期范围', behavior: 'READONLY' },
      { initialValues: { dateRange: { start: '2024-01-01', end: '2024-12-31' } } },
    );
    expect(screen.getByTestId('cascadedatefield-readonly-dateRange')).toHaveTextContent(
      '2024-01-01 ~ 2024-12-31',
    );
  });

  it('兼容后端返回的数组日期范围', () => {
    renderCascadeDateField(
      { fieldId: 'dateRange', label: '日期范围', behavior: 'READONLY' },
      { initialValues: { dateRange: ['2024-01-01', '2024-12-31'] } },
    );
    expect(screen.getByTestId('cascadedatefield-readonly-dateRange')).toHaveTextContent(
      '2024-01-01 ~ 2024-12-31',
    );
  });

  it('空值显示 "--"', () => {
    renderCascadeDateField({ fieldId: 'dateRange', label: '日期范围', behavior: 'READONLY' });
    expect(screen.getByTestId('cascadedatefield-readonly-dateRange')).toHaveTextContent('--');
  });

  it('部分空值显示 "--"', () => {
    renderCascadeDateField(
      { fieldId: 'dateRange', label: '日期范围', behavior: 'READONLY' },
      { initialValues: { dateRange: { start: '2024-01-01', end: '' } } },
    );
    expect(screen.getByTestId('cascadedatefield-readonly-dateRange')).toHaveTextContent('--');
  });
});

describe('CascadeDateField - HIDDEN 态', () => {
  it('不渲染任何 DOM', () => {
    renderCascadeDateField({ fieldId: 'dateRange', label: '日期范围', behavior: 'HIDDEN' });
    expect(document.querySelector('[data-field-id="dateRange"]')).not.toBeInTheDocument();
  });
});

describe('CascadeDateField - DISABLED 态', () => {
  it('RangePicker 禁用', () => {
    renderCascadeDateField({ fieldId: 'dateRange', label: '日期范围', behavior: 'DISABLED' });
    expect(screen.getByTestId('cascadedatefield-input-dateRange')).toHaveAttribute(
      'data-disabled',
      'true',
    );
  });
});

describe('CascadeDateField - 数据绑定', () => {
  it('从 FormProvider 接收初始值', () => {
    renderCascadeDateField(
      { fieldId: 'dateRange', label: '日期范围' },
      { initialValues: { dateRange: { start: '2024-01-01', end: '2024-06-30' } } },
    );
    expect(screen.getByTestId('cascadedatefield-input-dateRange-start')).toHaveValue('2024-01-01');
    expect(screen.getByTestId('cascadedatefield-input-dateRange-end')).toHaveValue('2024-06-30');
  });

  it('从 FormProvider 接收数组初始值', () => {
    renderCascadeDateField(
      { fieldId: 'dateRange', label: '日期范围' },
      { initialValues: { dateRange: ['2024-01-01', '2024-06-30'] } },
    );
    expect(screen.getByTestId('cascadedatefield-input-dateRange-start')).toHaveValue('2024-01-01');
    expect(screen.getByTestId('cascadedatefield-input-dateRange-end')).toHaveValue('2024-06-30');
  });

  it('外部 setFieldValue 更新', () => {
    const { ctxRef } = renderCascadeDateField({ fieldId: 'dateRange', label: '日期范围' });
    act(() => {
      ctxRef.current!.setFieldValue('dateRange', { start: '2024-03-01', end: '2024-09-30' });
    });
    expect(screen.getByTestId('cascadedatefield-input-dateRange-start')).toHaveValue('2024-03-01');
    expect(screen.getByTestId('cascadedatefield-input-dateRange-end')).toHaveValue('2024-09-30');
  });

  it('defaultValue 在 mount 时设置', () => {
    const { ctxRef } = renderCascadeDateField({
      fieldId: 'dateRange',
      label: '日期范围',
      defaultValue: { start: '2024-01-01', end: '2024-12-31' },
    });
    expect(ctxRef.current!.formData.dateRange).toEqual({ start: '2024-01-01', end: '2024-12-31' });
  });

  it('defaultValue 不覆盖 initialValues', () => {
    const { ctxRef } = renderCascadeDateField(
      {
        fieldId: 'dateRange',
        label: '日期范围',
        defaultValue: { start: '2024-01-01', end: '2024-12-31' },
      },
      { initialValues: { dateRange: { start: '2024-06-01', end: '2024-06-30' } } },
    );
    expect(ctxRef.current!.formData.dateRange).toEqual({ start: '2024-06-01', end: '2024-06-30' });
  });
});

describe('CascadeDateField - 校验', () => {
  it('required 空值报错', async () => {
    const schema = createSchema({
      fields: [
        {
          fieldId: 'dateRange',
          componentName: 'CascadeDateField',
          label: '日期范围',
          required: true,
        },
      ],
    });
    const { ctxRef } = renderCascadeDateField(
      { fieldId: 'dateRange', label: '日期范围', required: true },
      { schema },
    );
    await act(async () => {
      await ctxRef.current!.validateField('dateRange');
    });
    expect(screen.getByTestId('error-dateRange')).toHaveTextContent('日期范围为必填项');
  });

  it('required 有值通过', async () => {
    const schema = createSchema({
      fields: [
        {
          fieldId: 'dateRange',
          componentName: 'CascadeDateField',
          label: '日期范围',
          required: true,
        },
      ],
    });
    const { ctxRef } = renderCascadeDateField(
      { fieldId: 'dateRange', label: '日期范围', required: true },
      { schema, initialValues: { dateRange: { start: '2024-01-01', end: '2024-12-31' } } },
    );
    await act(async () => {
      const result = await ctxRef.current!.validateField('dateRange');
      expect(result).toBe(true);
    });
  });
});

describe('CascadeDateField - 移动端', () => {
  it('isMobile 时渲染移动端组件', () => {
    mockIsMobile.mockReturnValue(true);
    renderCascadeDateField({ fieldId: 'dateRange', label: '日期范围' });
    expect(screen.getByTestId('cascadedatefield-trigger-dateRange')).toBeInTheDocument();
  });

  it('移动端日期区间日历确认', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderCascadeDateField({
      fieldId: 'dateRange',
      label: '日期范围',
      onChange,
    });
    fireEvent.click(screen.getByTestId('cascadedatefield-trigger-dateRange'));
    expect(screen.getByTestId('antd-mobile-config-provider')).toHaveAttribute(
      'data-locale',
      'zh-CH',
    );
    fireEvent.click(screen.getByTestId('calendar-range-select'));
    fireEvent.click(screen.getByTestId('cascadedatefield-confirm-dateRange'));
    expect(onChange).toHaveBeenCalledWith({ start: '2024-06-15', end: '2024-06-20' });
    expect(ctxRef.current!.formData.dateRange).toEqual({
      start: '2024-06-15',
      end: '2024-06-20',
    });
  });

  it('移动端取消日期区间选择不提交临时值', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderCascadeDateField({
      fieldId: 'dateRange',
      label: '日期范围',
      onChange,
    });
    fireEvent.click(screen.getByTestId('cascadedatefield-trigger-dateRange'));
    fireEvent.click(screen.getByTestId('calendar-range-select'));
    fireEvent.click(screen.getByText('取消'));

    expect(onChange).not.toHaveBeenCalled();
    expect(ctxRef.current!.formData.dateRange).toBeUndefined();
    expect(screen.queryByTestId('mobile-popup')).not.toBeInTheDocument();
  });

  it('移动端日期区间未选择时确认清空', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderCascadeDateField({
      fieldId: 'dateRange',
      label: '日期范围',
      onChange,
    });
    fireEvent.click(screen.getByTestId('cascadedatefield-trigger-dateRange'));
    fireEvent.click(screen.getByTestId('cascadedatefield-confirm-dateRange'));
    expect(onChange).toHaveBeenCalledWith(null);
    expect(ctxRef.current!.formData.dateRange).toBe(null);
  });

  it('移动端日期时间区间两步选择', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderCascadeDateField({
      fieldId: 'dateRange',
      label: '日期范围',
      showTime: true,
      onChange,
    });
    fireEvent.click(screen.getByTestId('cascadedatefield-trigger-dateRange'));
    expect(screen.getByText('选择开始时间')).toBeInTheDocument();
    expect(screen.getByTestId('antd-mobile-picker-view')).toHaveClass('sy-mobile-date-time-picker');
    expect(
      screen
        .getByTestId('cascadedatefield-trigger-dateRange')
        .querySelector('.sy-mobile-field-trigger-text'),
    ).toHaveClass('sy-mobile-date-range-value');
    fireEvent.click(screen.getByTestId('datetime-select'));
    fireEvent.click(screen.getByTestId('cascadedatefield-confirm-dateRange'));
    expect(screen.getByText('选择结束时间')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('datetime-select'));
    fireEvent.click(screen.getByTestId('cascadedatefield-confirm-dateRange'));
    expect(onChange).toHaveBeenCalledWith({
      start: '2024-06-15 16:20:30',
      end: '2024-06-15 16:20:30',
    });
    expect(ctxRef.current!.formData.dateRange).toEqual({
      start: '2024-06-15 16:20:30',
      end: '2024-06-15 16:20:30',
    });
  });

  it('移动端日期时间区间遵循 dateFormat 输出', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderCascadeDateField({
      fieldId: 'dateRange',
      label: '日期范围',
      dateFormat: 'YYYY/MM/DD HH:mm:ss',
      onChange,
    });
    fireEvent.click(screen.getByTestId('cascadedatefield-trigger-dateRange'));
    expect(screen.getByTestId('antd-mobile-picker-view')).toHaveAttribute(
      'data-column-count',
      '4',
    );
    fireEvent.click(screen.getByTestId('datetime-select'));
    fireEvent.click(screen.getByTestId('cascadedatefield-confirm-dateRange'));
    fireEvent.click(screen.getByTestId('datetime-select'));
    fireEvent.click(screen.getByTestId('cascadedatefield-confirm-dateRange'));

    expect(onChange).toHaveBeenCalledWith({
      start: '2024/06/15 16:20:30',
      end: '2024/06/15 16:20:30',
    });
    expect(ctxRef.current!.formData.dateRange).toEqual({
      start: '2024/06/15 16:20:30',
      end: '2024/06/15 16:20:30',
    });
  });

  it('移动端 YYYY-MM-DD HH:mm 日期时间区间不渲染秒列', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderCascadeDateField({
      fieldId: 'dateRange',
      label: '日期范围',
      dateFormat: 'YYYY-MM-DD HH:mm',
      onChange,
    });
    fireEvent.click(screen.getByTestId('cascadedatefield-trigger-dateRange'));
    expect(screen.getByTestId('antd-mobile-picker-view')).toHaveAttribute(
      'data-column-count',
      '3',
    );
    fireEvent.click(screen.getByTestId('datetime-select'));
    fireEvent.click(screen.getByTestId('cascadedatefield-confirm-dateRange'));
    fireEvent.click(screen.getByTestId('datetime-select'));
    fireEvent.click(screen.getByTestId('cascadedatefield-confirm-dateRange'));

    expect(onChange).toHaveBeenCalledWith({
      start: '2024-06-15 16:20',
      end: '2024-06-15 16:20',
    });
    expect(ctxRef.current!.formData.dateRange).toEqual({
      start: '2024-06-15 16:20',
      end: '2024-06-15 16:20',
    });
  });

  it('移动端清空日期区间', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderCascadeDateField(
      { fieldId: 'dateRange', label: '日期范围', onChange },
      { initialValues: { dateRange: { start: '2024-06-15', end: '2024-06-20' } } },
    );
    fireEvent.click(screen.getByTestId('cascadedatefield-trigger-dateRange-clear'));

    expect(onChange).toHaveBeenCalledWith(null);
    expect(ctxRef.current!.formData.dateRange).toBe(null);
  });

  it('移动端 disabled 不可点击', () => {
    mockIsMobile.mockReturnValue(true);
    renderCascadeDateField({ fieldId: 'dateRange', label: '日期范围', behavior: 'DISABLED' });
    fireEvent.click(screen.getByTestId('cascadedatefield-trigger-dateRange'));
    expect(screen.queryByTestId('mobile-popup')).not.toBeInTheDocument();
  });
});

describe('CascadeDateField - behavior 优先级', () => {
  it('props.behavior 优先于 context', () => {
    const schema = createSchema({
      fields: [
        {
          fieldId: 'dateRange',
          componentName: 'CascadeDateField',
          label: '日期范围',
          behavior: 'DISABLED',
        },
      ],
    });
    renderCascadeDateField(
      { fieldId: 'dateRange', label: '日期范围', behavior: 'READONLY' },
      { schema, initialValues: { dateRange: { start: '2024-01-01', end: '2024-12-31' } } },
    );
    expect(screen.getByTestId('cascadedatefield-readonly-dateRange')).toBeInTheDocument();
  });

  it('字段不在 schema 中时默认 NORMAL', () => {
    const schema = createSchema({ fields: [] });
    renderCascadeDateField({ fieldId: 'unknown', label: '未知' }, { schema });
    expect(screen.getByTestId('cascadedatefield-input-unknown')).toBeInTheDocument();
  });
});

describe('CascadeDateField - PC 端边界', () => {
  it('清空日期范围', () => {
    const onChange = vi.fn();
    const { ctxRef } = renderCascadeDateField(
      { fieldId: 'dateRange', label: '日期范围', onChange },
      { initialValues: { dateRange: { start: '2024-01-01', end: '2024-12-31' } } },
    );
    fireEvent.change(screen.getByTestId('cascadedatefield-input-dateRange-start'), {
      target: { value: '' },
    });
    expect(onChange).toHaveBeenCalledWith(null);
    expect(ctxRef.current!.formData.dateRange).toBe(null);
  });

  it('placeholder 传递', () => {
    renderCascadeDateField({ fieldId: 'dateRange', label: '日期范围', placeholder: '请选择' });
    expect(screen.getByTestId('cascadedatefield-input-dateRange-start')).toHaveAttribute(
      'placeholder',
      '请选择',
    );
  });
});
