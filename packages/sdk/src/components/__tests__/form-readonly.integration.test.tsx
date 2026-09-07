import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { FormProvider } from '../core/FormProvider';
import { FormRenderer } from '../core/FormRenderer';
import { FormActions } from '../core/FormActions';
import type { FormSchema, FormEngineConfig } from '../types';

// ---- mock antd ----
vi.mock('antd', () => ({
  Input: Object.assign(
    (props: any) =>
      React.createElement('input', {
        value: props.value ?? '',
        disabled: props.disabled,
        'data-testid': props['data-testid'],
      }),
    {
      TextArea: (props: any) =>
        React.createElement('textarea', {
          value: props.value ?? '',
          disabled: props.disabled,
          'data-testid': props['data-testid'],
        }),
    },
  ),
  InputNumber: (props: any) =>
    React.createElement('input', {
      type: 'number',
      value: props.value ?? '',
      disabled: props.disabled,
      'data-testid': props['data-testid'],
    }),
  Select: (props: any) =>
    React.createElement('select', {
      value: props.value ?? '',
      disabled: props.disabled,
      'data-testid': props['data-testid'],
    }),
  DatePicker: Object.assign(
    (props: any) =>
      React.createElement('input', {
        value: props.value ?? '',
        disabled: props.disabled,
        'data-testid': props['data-testid'],
      }),
    {
      RangePicker: (props: any) =>
        React.createElement('div', {
          'data-testid': props['data-testid'],
        }),
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
    React.createElement('button', { 'data-testid': props['data-testid'] }, props.children),
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
  formMeta: { formUuid: 'readonly-test', appType: 'test', title: '只读测试' },
  fields,
});

const createConfig = (overrides?: Partial<FormEngineConfig>): FormEngineConfig => ({
  mode: 'readonly',
  formUuid: 'readonly-test',
  appType: 'test',
  ...overrides,
});

function renderForm(opts: {
  schema: FormSchema;
  config: FormEngineConfig;
  initialValues?: Record<string, any>;
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
      React.createElement(FormActions),
    ),
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

// ================================================================
// 只读模式集成测试
// ================================================================
describe('集成测试 - 只读模式', () => {
  it('readonly 模式下 TextField 渲染为只读态', () => {
    const schema = createSchema([{ fieldId: 'name', componentName: 'TextField', label: '姓名' }]);

    renderForm({
      schema,
      config: createConfig(),
      initialValues: { name: '张三' },
    });

    expect(screen.getByTestId('textfield-readonly-name')).toHaveTextContent('张三');
    expect(screen.queryByTestId('textfield-input-name')).not.toBeInTheDocument();
  });

  it('readonly 模式覆盖 schema 自带 NORMAL behavior', () => {
    const schema = createSchema([
      { fieldId: 'name', componentName: 'TextField', label: '姓名', behavior: 'NORMAL' },
    ]);

    renderForm({
      schema,
      config: createConfig(),
      initialValues: { name: '张三' },
    });

    expect(screen.getByTestId('textfield-readonly-name')).toHaveTextContent('张三');
    expect(screen.queryByTestId('textfield-input-name')).not.toBeInTheDocument();
  });

  it('readonly 模式下 NumberField 渲染为只读态', () => {
    const schema = createSchema([{ fieldId: 'age', componentName: 'NumberField', label: '年龄' }]);

    renderForm({
      schema,
      config: createConfig(),
      initialValues: { age: 25 },
    });

    expect(screen.getByTestId('numberfield-readonly-age')).toHaveTextContent('25');
    expect(screen.queryByTestId('numberfield-input-age')).not.toBeInTheDocument();
  });

  it('readonly 模式下 SelectField 渲染为只读态', () => {
    const schema = createSchema([
      {
        fieldId: 'city',
        componentName: 'SelectField',
        label: '城市',
        options: [{ value: 'bj', label: '北京' }],
      },
    ]);

    renderForm({
      schema,
      config: createConfig(),
      initialValues: { city: { value: 'bj', label: '北京' } },
    });

    expect(screen.getByTestId('selectfield-readonly-city')).toHaveTextContent('北京');
    expect(screen.queryByTestId('selectfield-input-city')).not.toBeInTheDocument();
  });

  it('readonly 模式下 FormActions 不渲染', () => {
    const schema = createSchema([{ fieldId: 'name', componentName: 'TextField', label: '姓名' }]);

    renderForm({
      schema,
      config: createConfig(),
      initialValues: { name: 'test' },
    });

    expect(screen.queryByTestId('form-actions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('form-submit-btn')).not.toBeInTheDocument();
  });

  it('readonly 模式下多个字段均为只读态', () => {
    const schema = createSchema([
      { fieldId: 'name', componentName: 'TextField', label: '姓名' },
      { fieldId: 'age', componentName: 'NumberField', label: '年龄' },
      { fieldId: 'birthday', componentName: 'DateField', label: '生日' },
    ]);

    renderForm({
      schema,
      config: createConfig(),
      initialValues: { name: '测试', age: 18, birthday: '2024-01-01' },
    });

    expect(screen.getByTestId('textfield-readonly-name')).toHaveTextContent('测试');
    expect(screen.getByTestId('numberfield-readonly-age')).toHaveTextContent('18');
    expect(screen.getByTestId('datefield-readonly-birthday')).toHaveTextContent('2024-01-01');
  });

  it('readonly 模式下空值显示 "--"', () => {
    const schema = createSchema([{ fieldId: 'name', componentName: 'TextField', label: '姓名' }]);

    renderForm({
      schema,
      config: createConfig(),
    });

    expect(screen.getByTestId('textfield-readonly-name')).toHaveTextContent('--');
  });
});
