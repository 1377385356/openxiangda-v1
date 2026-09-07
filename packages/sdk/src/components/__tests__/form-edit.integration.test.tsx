import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { FormProvider } from '../core/FormProvider';
import { FormRenderer } from '../core/FormRenderer';
import { FormActions } from '../core/FormActions';
import type { FormSchema, FormEngineConfig } from '../types';

// ---- mock antd ----
vi.mock('antd', () => ({
  Input: Object.assign(
    (props: any) => {
      const { onChange, onBlur, value, placeholder, disabled, className, ...rest } = props;
      return React.createElement('input', {
        value: value ?? '',
        placeholder,
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
        value: value ?? '',
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
            value: value?.[0] ?? '',
            disabled,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
              onChange?.(null, [e.target.value, value?.[1] ?? '']);
            },
          }),
          React.createElement('input', {
            'data-testid': `${rest['data-testid']}-end`,
            value: value?.[1] ?? '',
            disabled,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
              onChange?.(null, [value?.[0] ?? '', e.target.value]);
            },
          }),
        );
      },
    },
  ),
  Radio: Object.assign((props: any) => React.createElement('span', null, props.children), {
    Group: (props: any) =>
      React.createElement(
        'div',
        {
          'data-testid': props['data-testid'],
        },
        props.children,
      ),
  }),
  Checkbox: Object.assign((props: any) => React.createElement('span', null, props.children), {
    Group: (props: any) =>
      React.createElement(
        'div',
        {
          'data-testid': props['data-testid'],
        },
        props.children,
      ),
  }),
  Upload: (props: any) =>
    React.createElement('div', { 'data-testid': props['data-testid'] }, props.children),
  Button: (props: any) =>
    React.createElement(
      'button',
      {
        disabled: props.disabled || props.loading,
        onClick: props.onClick,
        'data-testid': props['data-testid'],
      },
      props.children,
    ),
  TreeSelect: (props: any) => React.createElement('div', { 'data-testid': props['data-testid'] }),
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
  formMeta: { formUuid: 'edit-test', appType: 'test', title: '编辑测试' },
  fields,
});

const createConfig = (overrides?: Partial<FormEngineConfig>): FormEngineConfig => ({
  mode: 'edit',
  formUuid: 'edit-test',
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
// 编辑模式集成测试
// ================================================================
describe('集成测试 - 编辑模式', () => {
  it('edit 模式下字段正确回填初始值', () => {
    const schema = createSchema([
      { fieldId: 'name', componentName: 'TextField', label: '姓名' },
      { fieldId: 'age', componentName: 'NumberField', label: '年龄' },
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
    const config = createConfig();
    const initialValues = {
      name: '李四',
      age: 30,
      city: { value: 'sh', label: '上海' },
    };

    renderForm({ schema, config, initialValues });

    expect(screen.getByTestId('textfield-input-name')).toHaveValue('李四');
    expect(screen.getByTestId('numberfield-input-age')).toHaveValue(30);
    expect(screen.getByTestId('selectfield-input-city')).toHaveValue('sh');
  });

  it('edit 模式下修改部分字段后提交包含正确数据', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const schema = createSchema([
      { fieldId: 'name', componentName: 'TextField', label: '姓名', required: true },
      { fieldId: 'age', componentName: 'NumberField', label: '年龄' },
    ]);
    const config = createConfig();
    const initialValues = { name: '王五', age: 28 };

    renderForm({ schema, config, initialValues, onSubmit });

    // Modify only name
    fireEvent.change(screen.getByTestId('textfield-input-name'), {
      target: { value: '赵六' },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('form-submit-btn'));
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const data = onSubmit.mock.calls[0][0];
    expect(data.name).toBe('赵六'); // modified
    expect(data.age).toBe(28); // untouched
  });

  it('edit 模式下 FormActions 可见', () => {
    const schema = createSchema([{ fieldId: 'name', componentName: 'TextField', label: '姓名' }]);
    const config = createConfig();

    renderForm({ schema, config, initialValues: { name: 'test' } });

    expect(screen.getByTestId('form-actions')).toBeInTheDocument();
    expect(screen.getByTestId('form-submit-btn')).toBeInTheDocument();
    expect(screen.getByTestId('form-reset-btn')).toBeInTheDocument();
  });

  it('edit 模式重置恢复到初始值', () => {
    const schema = createSchema([{ fieldId: 'name', componentName: 'TextField', label: '姓名' }]);
    const config = createConfig();

    renderForm({ schema, config, initialValues: { name: '原始值' } });

    fireEvent.change(screen.getByTestId('textfield-input-name'), {
      target: { value: '修改后' },
    });
    expect(screen.getByTestId('textfield-input-name')).toHaveValue('修改后');

    fireEvent.click(screen.getByTestId('form-reset-btn'));
    expect(screen.getByTestId('textfield-input-name')).toHaveValue('原始值');
  });

  it('edit 模式下校验仍然生效', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const schema = createSchema([
      { fieldId: 'name', componentName: 'TextField', label: '姓名', required: true },
    ]);
    const config = createConfig();

    renderForm({ schema, config, initialValues: { name: '有值' }, onSubmit });

    // Clear the required field
    fireEvent.change(screen.getByTestId('textfield-input-name'), {
      target: { value: '' },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('form-submit-btn'));
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('error-name')).toHaveTextContent('姓名为必填项');
  });
});
