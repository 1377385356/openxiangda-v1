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
      const { onChange, value, disabled, ...rest } = props;
      return React.createElement('input', {
        value: value ?? '',
        disabled,
        onChange,
        'data-testid': rest['data-testid'],
      });
    },
    {
      TextArea: (props: any) =>
        React.createElement('textarea', {
          value: props.value ?? '',
          disabled: props.disabled,
          'data-testid': props['data-testid'],
        }),
    },
  ),
  InputNumber: (props: any) => {
    const { onChange, value, disabled, ...rest } = props;
    return React.createElement('input', {
      type: 'number',
      value: value ?? '',
      disabled,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value === '' ? null : Number(e.target.value);
        onChange?.(v);
      },
      'data-testid': rest['data-testid'],
    });
  },
  Select: (props: any) => {
    const { onChange, value, disabled, options, mode, ...rest } = props;
    if (mode === 'multiple') {
      return React.createElement('div', {
        'data-testid': rest['data-testid'],
        'data-disabled': disabled ? 'true' : undefined,
      });
    }
    return React.createElement(
      'select',
      {
        value: value ?? '',
        disabled,
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
          const v = e.target.value;
          onChange?.(v === '' ? undefined : v);
        },
        'data-testid': rest['data-testid'],
      },
      React.createElement('option', { value: '' }, '请选择'),
      ...(options || []).map((o: any) =>
        React.createElement('option', { key: o.value, value: o.value }, o.label),
      ),
    );
  },
  DatePicker: Object.assign(
    (props: any) =>
      React.createElement('input', {
        value: props.value ?? '',
        disabled: props.disabled,
        'data-testid': props['data-testid'],
      }),
    {
      RangePicker: (props: any) =>
        React.createElement('div', { 'data-testid': props['data-testid'] }),
    },
  ),
  Radio: Object.assign((props: any) => React.createElement('span', null, props.children), {
    Group: (props: any) =>
      React.createElement('div', { 'data-testid': props['data-testid'] }, props.children),
  }),
  Checkbox: Object.assign((props: any) => React.createElement('span', null, props.children), {
    Group: (props: any) =>
      React.createElement('div', { 'data-testid': props['data-testid'] }, props.children),
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
  Input: () => null,
  TextArea: () => null,
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
  formMeta: { formUuid: 'perm-test', appType: 'test', title: '权限测试' },
  fields,
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
// 权限注入集成测试
// ================================================================
describe('集成测试 - 权限注入', () => {
  it('fieldPermissions 将字段设为 READONLY', () => {
    const schema = createSchema([
      { fieldId: 'name', componentName: 'TextField', label: '姓名' },
      { fieldId: 'age', componentName: 'NumberField', label: '年龄' },
    ]);
    const config: FormEngineConfig = {
      mode: 'submit',
      formUuid: 'perm-test',
      appType: 'test',
      permissions: {
        fieldPermissions: {
          name: 'READONLY',
        },
        operations: [],
      },
    };

    renderForm({
      schema,
      config,
      initialValues: { name: '不可编辑', age: 20 },
    });

    // name should be readonly
    expect(screen.getByTestId('textfield-readonly-name')).toHaveTextContent('不可编辑');
    expect(screen.queryByTestId('textfield-input-name')).not.toBeInTheDocument();

    // age should still be editable
    expect(screen.getByTestId('numberfield-input-age')).toBeInTheDocument();
  });

  it('fieldPermissions 将字段设为 HIDDEN', () => {
    const schema = createSchema([
      { fieldId: 'name', componentName: 'TextField', label: '姓名' },
      { fieldId: 'secret', componentName: 'TextField', label: '密钥' },
    ]);
    const config: FormEngineConfig = {
      mode: 'submit',
      formUuid: 'perm-test',
      appType: 'test',
      permissions: {
        fieldPermissions: {
          secret: 'HIDDEN',
        },
        operations: [],
      },
    };

    renderForm({ schema, config, initialValues: { name: '可见', secret: '不可见' } });

    expect(screen.getByTestId('textfield-input-name')).toBeInTheDocument();
    expect(screen.queryByText('密钥')).not.toBeInTheDocument();
    expect(document.querySelector('[data-field-id="secret"]')).not.toBeInTheDocument();
  });

  it('HIDDEN 字段有初始值时不影响校验和提交', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const schema = createSchema([
      { fieldId: 'name', componentName: 'TextField', label: '姓名', required: true },
      { fieldId: 'hidden_field', componentName: 'TextField', label: '隐藏字段', required: true },
    ]);
    const config: FormEngineConfig = {
      mode: 'submit',
      formUuid: 'perm-test',
      appType: 'test',
      permissions: {
        fieldPermissions: {
          hidden_field: 'HIDDEN',
        },
        operations: [],
      },
    };

    renderForm({
      schema,
      config,
      initialValues: { name: '有值', hidden_field: '隐藏但有值' },
      onSubmit,
    });

    // hidden_field is not rendered
    expect(document.querySelector('[data-field-id="hidden_field"]')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('form-submit-btn'));
    });

    // Both required fields have values, submission succeeds
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].hidden_field).toBe('隐藏但有值');
  });

  it('HIDDEN 字段有值时不影响提交', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const schema = createSchema([
      { fieldId: 'name', componentName: 'TextField', label: '姓名', required: true },
      { fieldId: 'hidden_field', componentName: 'TextField', label: '隐藏字段', required: true },
    ]);
    const config: FormEngineConfig = {
      mode: 'submit',
      formUuid: 'perm-test',
      appType: 'test',
      permissions: {
        fieldPermissions: {
          hidden_field: 'HIDDEN',
        },
        operations: [],
      },
    };

    renderForm({
      schema,
      config,
      initialValues: { name: '可见', hidden_field: '有值但隐藏' },
      onSubmit,
    });

    // hidden_field is not rendered
    expect(document.querySelector('[data-field-id="hidden_field"]')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('form-submit-btn'));
    });

    // Submission succeeds because both required fields have values
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const data = onSubmit.mock.calls[0][0];
    expect(data.name).toBe('可见');
    expect(data.hidden_field).toBe('有值但隐藏');
  });

  it('READONLY 字段显示值但不可编辑', () => {
    const schema = createSchema([
      {
        fieldId: 'city',
        componentName: 'SelectField',
        label: '城市',
        options: [{ value: 'bj', label: '北京' }],
      },
    ]);
    const config: FormEngineConfig = {
      mode: 'submit',
      formUuid: 'perm-test',
      appType: 'test',
      permissions: {
        fieldPermissions: {
          city: 'READONLY',
        },
        operations: [],
      },
    };

    renderForm({
      schema,
      config,
      initialValues: { city: { value: 'bj', label: '北京' } },
    });

    expect(screen.getByTestId('selectfield-readonly-city')).toHaveTextContent('北京');
    expect(screen.queryByTestId('selectfield-input-city')).not.toBeInTheDocument();
  });

  it('多个字段混合权限', () => {
    const schema = createSchema([
      { fieldId: 'f1', componentName: 'TextField', label: '字段1' },
      { fieldId: 'f2', componentName: 'TextField', label: '字段2' },
      { fieldId: 'f3', componentName: 'TextField', label: '字段3' },
    ]);
    const config: FormEngineConfig = {
      mode: 'submit',
      formUuid: 'perm-test',
      appType: 'test',
      permissions: {
        fieldPermissions: {
          f1: 'NORMAL',
          f2: 'READONLY',
          f3: 'HIDDEN',
        },
        operations: [],
      },
    };

    renderForm({
      schema,
      config,
      initialValues: { f1: 'A', f2: 'B', f3: 'C' },
    });

    // f1: normal → editable
    expect(screen.getByTestId('textfield-input-f1')).toBeInTheDocument();
    // f2: readonly → shows text
    expect(screen.getByTestId('textfield-readonly-f2')).toHaveTextContent('B');
    // f3: hidden → not rendered
    expect(document.querySelector('[data-field-id="f3"]')).not.toBeInTheDocument();
  });
});
