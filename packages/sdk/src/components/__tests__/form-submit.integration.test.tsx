import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { FormProvider } from '../core/FormProvider';
import { FormRenderer } from '../core/FormRenderer';
import { FormActions } from '../core/FormActions';
import type { FormSchema, FormEngineConfig } from '../types';

// ---- mock antd ----
const formatPickerValue = (value: any) =>
  value && typeof value.format === 'function' ? value.format('YYYY-MM-DD') : (value ?? '');

vi.mock('antd', () => ({
  Input: Object.assign(
    (props: any) => {
      const { onChange, onBlur, value, placeholder, maxLength, disabled, className, ...rest } =
        props;
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
    {
      TextArea: (props: any) => {
        const { onChange, onBlur, value, placeholder, disabled, className, ...rest } = props;
        return React.createElement('textarea', {
          value: value ?? '',
          placeholder,
          disabled,
          className,
          onChange,
          onBlur,
          'data-testid': rest['data-testid'],
        });
      },
    },
  ),
  InputNumber: (props: any) => {
    const { onChange, onBlur, value, placeholder, disabled, className, ...rest } = props;
    return React.createElement('input', {
      type: 'number',
      value: value ?? '',
      placeholder,
      disabled,
      className,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value === '' ? null : Number(e.target.value);
        onChange?.(v);
      },
      onBlur: () => onBlur?.(),
      'data-testid': rest['data-testid'],
    });
  },
  Select: (props: any) => {
    const { onChange, value, placeholder, disabled, className, options, mode, ...rest } = props;
    if (mode === 'multiple') {
      return React.createElement(
        'div',
        {
          'data-testid': rest['data-testid'],
          'data-disabled': disabled ? 'true' : undefined,
        },
        (options || []).map((o: any) =>
          React.createElement(
            'button',
            {
              key: o.value,
              'data-testid': `option-${o.value}`,
              'data-selected': (value || []).includes(o.value) ? 'true' : undefined,
              onClick: () => {
                if (disabled) return;
                const current = value || [];
                const newVal = current.includes(o.value)
                  ? current.filter((v: string) => v !== o.value)
                  : [...current, o.value];
                onChange?.(newVal);
              },
            },
            o.label,
          ),
        ),
      );
    }
    return React.createElement(
      'select',
      {
        value: value ?? '',
        disabled,
        className,
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
          const v = e.target.value;
          onChange?.(v === '' ? undefined : v);
        },
        'data-testid': rest['data-testid'],
      },
      React.createElement('option', { value: '' }, placeholder || '请选择'),
      ...(options || []).map((o: any) =>
        React.createElement('option', { key: o.value, value: o.value }, o.label),
      ),
    );
  },
  DatePicker: Object.assign(
    (props: any) => {
      const { onChange, value, placeholder, disabled, className, ...rest } = props;
      return React.createElement('input', {
        type: 'text',
        value: formatPickerValue(value),
        placeholder,
        disabled,
        className,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          onChange?.(null, e.target.value);
        },
        'data-testid': rest['data-testid'],
      });
    },
    {
      RangePicker: (props: any) => {
        const { onChange, value, disabled, className, ...rest } = props;
        return React.createElement(
          'div',
          {
            'data-testid': rest['data-testid'],
            className,
          },
          React.createElement('input', {
            'data-testid': `${rest['data-testid']}-start`,
            value: formatPickerValue(value?.[0]),
            disabled,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
              onChange?.(null, [e.target.value, formatPickerValue(value?.[1])]);
            },
          }),
          React.createElement('input', {
            'data-testid': `${rest['data-testid']}-end`,
            value: formatPickerValue(value?.[1]),
            disabled,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
              onChange?.(null, [formatPickerValue(value?.[0]), e.target.value]);
            },
          }),
        );
      },
    },
  ),
  Radio: Object.assign((props: any) => React.createElement('span', null, props.children), {
    Group: (props: any) => {
      const { children, ...rest } = props;
      return React.createElement(
        'div',
        {
          'data-testid': rest['data-testid'],
          'data-disabled': rest.disabled ? 'true' : undefined,
        },
        children,
      );
    },
  }),
  Checkbox: Object.assign((props: any) => React.createElement('span', null, props.children), {
    Group: (props: any) => {
      const { children, ...rest } = props;
      return React.createElement(
        'div',
        {
          'data-testid': rest['data-testid'],
          'data-disabled': rest.disabled ? 'true' : undefined,
        },
        children,
      );
    },
  }),
  Upload: (props: any) => {
    return React.createElement(
      'div',
      {
        'data-testid': props['data-testid'],
      },
      props.children,
    );
  },
  Button: (props: any) => {
    return React.createElement(
      'button',
      {
        disabled: props.disabled || props.loading,
        onClick: props.onClick,
        'data-testid': props['data-testid'],
      },
      props.children,
    );
  },
  TreeSelect: (props: any) => {
    return React.createElement('div', {
      'data-testid': props['data-testid'],
      'data-disabled': props.disabled ? 'true' : undefined,
    });
  },
}));

// ---- mock antd-mobile ----
vi.mock('antd-mobile', () => ({
  Input: () => React.createElement('input', { 'data-testid': 'antd-mobile-input' }),
  TextArea: () => React.createElement('textarea', { 'data-testid': 'antd-mobile-textarea' }),
  DatePicker: () => null,
  Picker: () => null,
  Selector: () => null,
  Radio: (props: any) => React.createElement('span', null, props.children),
  Space: (props: any) => React.createElement('div', null, props.children),
  Checkbox: (props: any) => React.createElement('span', null, props.children),
}));

// ---- mock useDeviceDetect ----
vi.mock('../hooks/useDeviceDetect', () => ({
  useDeviceDetect: () => ({ isMobile: false }),
}));

// ---- helpers ----
const createSchema = (fields: FormSchema['fields']): FormSchema => ({
  formMeta: { formUuid: 'integration-test', appType: 'test', title: '集成测试' },
  fields,
});

const createConfig = (overrides?: Partial<FormEngineConfig>): FormEngineConfig => ({
  mode: 'submit',
  formUuid: 'integration-test',
  appType: 'test',
  ...overrides,
});

function renderForm(opts: {
  schema: FormSchema;
  config: FormEngineConfig;
  initialValues?: Record<string, any>;
  onSubmit?: (values: Record<string, any>) => Promise<void>;
}) {
  return render(
    React.createElement(
      FormProvider,
      {
        schema: opts.schema,
        config: opts.config,
        initialValues: opts.initialValues,
        children: null,
      },
      React.createElement(FormRenderer),
      React.createElement(FormActions, { onSubmit: opts.onSubmit }),
    ),
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

// ================================================================
// 完整提交流程
// ================================================================
describe('集成测试 - 完整提交流程', () => {
  it('填写所有必填字段后提交成功，onSubmit 被调用且数据格式正确', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const schema = createSchema([
      { fieldId: 'name', componentName: 'TextField', label: '姓名', required: true },
      { fieldId: 'age', componentName: 'NumberField', label: '年龄', required: true },
    ]);
    const config = createConfig();

    renderForm({ schema, config, onSubmit });

    // Fill in required fields
    fireEvent.change(screen.getByTestId('textfield-input-name'), {
      target: { value: '张三' },
    });
    fireEvent.change(screen.getByTestId('numberfield-input-age'), {
      target: { value: '25' },
    });

    // Submit
    await act(async () => {
      fireEvent.click(screen.getByTestId('form-submit-btn'));
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submittedData = onSubmit.mock.calls[0][0];
    expect(submittedData.name).toBe('张三');
    expect(submittedData.age).toBe(25);
  });

  it('未填必填字段时阻止提交', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const schema = createSchema([
      { fieldId: 'name', componentName: 'TextField', label: '姓名', required: true },
    ]);
    const config = createConfig();

    renderForm({ schema, config, onSubmit });

    // Submit without filling required field
    await act(async () => {
      fireEvent.click(screen.getByTestId('form-submit-btn'));
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('error-name')).toHaveTextContent('姓名为必填项');
  });

  it('TextField 提交数据为 string', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const schema = createSchema([{ fieldId: 'name', componentName: 'TextField', label: '姓名' }]);

    renderForm({ schema, config: createConfig(), onSubmit });

    fireEvent.change(screen.getByTestId('textfield-input-name'), {
      target: { value: 'hello' },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('form-submit-btn'));
    });

    expect(typeof onSubmit.mock.calls[0][0].name).toBe('string');
    expect(onSubmit.mock.calls[0][0].name).toBe('hello');
  });

  it('NumberField 提交数据为 number', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const schema = createSchema([
      { fieldId: 'count', componentName: 'NumberField', label: '数量' },
    ]);

    renderForm({ schema, config: createConfig(), onSubmit });

    fireEvent.change(screen.getByTestId('numberfield-input-count'), {
      target: { value: '42' },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('form-submit-btn'));
    });

    expect(typeof onSubmit.mock.calls[0][0].count).toBe('number');
    expect(onSubmit.mock.calls[0][0].count).toBe(42);
  });

  it('SelectField 提交数据为 { value, label }', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const schema = createSchema([
      {
        fieldId: 'city',
        componentName: 'SelectField',
        label: '城市',
        options: [
          { value: 'bj', label: '北京' },
          { value: 'sh', label: '上海' },
        ],
      },
    ]);

    renderForm({ schema, config: createConfig(), onSubmit });

    fireEvent.change(screen.getByTestId('selectfield-input-city'), {
      target: { value: 'bj' },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('form-submit-btn'));
    });

    expect(onSubmit.mock.calls[0][0].city).toEqual({ value: 'bj', label: '北京' });
  });

  it('MultiSelectField 提交数据为 [{ value, label }]', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const schema = createSchema([
      {
        fieldId: 'tags',
        componentName: 'MultiSelectField',
        label: '标签',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      },
    ]);

    renderForm({ schema, config: createConfig(), onSubmit });

    // Select option a
    fireEvent.click(screen.getByTestId('option-a'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('form-submit-btn'));
    });

    expect(onSubmit.mock.calls[0][0].tags).toEqual([{ value: 'a', label: 'A' }]);
  });

  it('DateField 提交数据为 string (YYYY-MM-DD)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const schema = createSchema([
      { fieldId: 'birthday', componentName: 'DateField', label: '生日' },
    ]);

    renderForm({ schema, config: createConfig(), onSubmit });

    fireEvent.change(screen.getByTestId('datefield-input-birthday'), {
      target: { value: '2024-01-15' },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('form-submit-btn'));
    });

    expect(typeof onSubmit.mock.calls[0][0].birthday).toBe('string');
    expect(onSubmit.mock.calls[0][0].birthday).toBe('2024-01-15');
  });

  it('CascadeDateField 提交数据为 { start, end }', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const schema = createSchema([
      { fieldId: 'dateRange', componentName: 'CascadeDateField', label: '日期范围' },
    ]);

    // 先设初始 start，再修改 end（CascadeDateFieldPC 要求 start 和 end 同时非空才存储）
    renderForm({
      schema,
      config: createConfig(),
      onSubmit,
      initialValues: { dateRange: { start: '2024-01-01', end: '' } },
    });

    fireEvent.change(screen.getByTestId('cascadedatefield-input-dateRange-end'), {
      target: { value: '2024-12-31' },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('form-submit-btn'));
    });

    expect(onSubmit.mock.calls[0][0].dateRange).toEqual({
      start: '2024-01-01',
      end: '2024-12-31',
    });
  });

  it('表单重置恢复初始值', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const schema = createSchema([{ fieldId: 'name', componentName: 'TextField', label: '姓名' }]);

    renderForm({
      schema,
      config: createConfig(),
      onSubmit,
      initialValues: { name: '初始' },
    });

    // Modify
    fireEvent.change(screen.getByTestId('textfield-input-name'), {
      target: { value: '已修改' },
    });
    expect(screen.getByTestId('textfield-input-name')).toHaveValue('已修改');

    // Reset
    fireEvent.click(screen.getByTestId('form-reset-btn'));
    expect(screen.getByTestId('textfield-input-name')).toHaveValue('初始');
  });
});
