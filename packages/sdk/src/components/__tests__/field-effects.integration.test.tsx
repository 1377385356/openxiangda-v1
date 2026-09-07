import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { FormProvider } from '../core/FormProvider';
import { FormRenderer } from '../core/FormRenderer';
import { FormActions } from '../core/FormActions';
import { useFormContext } from '../core/FormContext';
import type { FormSchema, FormEngineConfig, FormEffect } from '../types';

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
  formMeta: { formUuid: 'effects-test', appType: 'test', title: '联动测试' },
  fields,
});

const createConfig = (
  effects: FormEffect[],
  overrides?: Partial<FormEngineConfig>,
): FormEngineConfig => ({
  mode: 'submit',
  formUuid: 'effects-test',
  appType: 'test',
  effects,
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

function ValidateBridge({ onReady }: { onReady: (validateAll: () => Promise<boolean>) => void }) {
  const { validateAll } = useFormContext();
  React.useEffect(() => {
    onReady(validateAll);
  }, [onReady, validateAll]);
  return null;
}

afterEach(() => {
  vi.clearAllMocks();
});

// ================================================================
// 字段联动集成测试
// ================================================================
describe('集成测试 - 字段联动', () => {
  it('当 fieldA = "x" 时 show fieldB（初始隐藏）', () => {
    const schema = createSchema([
      {
        fieldId: 'fieldA',
        componentName: 'TextField',
        label: '字段A',
      },
      {
        fieldId: 'fieldB',
        componentName: 'TextField',
        label: '字段B',
        // 不在 schema 上设置 behavior，通过 effects 控制
      },
    ]);
    // 用 ne 条件实现“初始隐藏，等于特定值时显示”
    const effects: FormEffect[] = [
      {
        when: { field: 'fieldA', operator: 'ne', value: 'x' },
        then: [{ field: 'fieldB', action: 'hide' }],
      },
    ];
    const config = createConfig(effects);

    renderForm({ schema, config });

    // Initially fieldA is undefined (!= 'x') → effect fires → fieldB hidden
    expect(document.querySelector('[data-field-id="fieldB"]')).not.toBeInTheDocument();
    expect(screen.getByTestId('textfield-input-fieldA')).toBeInTheDocument();

    // Set fieldA = 'x' → ne condition is false → fieldB reverts to NORMAL
    fireEvent.change(screen.getByTestId('textfield-input-fieldA'), {
      target: { value: 'x' },
    });

    // Now fieldB should appear
    expect(document.querySelector('[data-field-id="fieldB"]')).toBeInTheDocument();
    expect(screen.getByTestId('textfield-input-fieldB')).toBeInTheDocument();
  });

  it('当 fieldA != "x" 时 fieldB 恢复隐藏', () => {
    const schema = createSchema([
      {
        fieldId: 'fieldA',
        componentName: 'TextField',
        label: '字段A',
      },
      {
        fieldId: 'fieldB',
        componentName: 'TextField',
        label: '字段B',
      },
    ]);
    const effects: FormEffect[] = [
      {
        when: { field: 'fieldA', operator: 'ne', value: 'x' },
        then: [{ field: 'fieldB', action: 'hide' }],
      },
    ];
    const config = createConfig(effects);

    // Start with fieldA = 'x' → ne condition false → fieldB visible
    renderForm({ schema, config, initialValues: { fieldA: 'x' } });

    expect(screen.getByTestId('textfield-input-fieldB')).toBeInTheDocument();

    // Change fieldA to something else → ne condition true → fieldB hidden
    fireEvent.change(screen.getByTestId('textfield-input-fieldA'), {
      target: { value: 'y' },
    });

    expect(document.querySelector('[data-field-id="fieldB"]')).not.toBeInTheDocument();
  });

  it('disable/enable 联动', () => {
    const schema = createSchema([
      {
        fieldId: 'toggle',
        componentName: 'TextField',
        label: '开关',
      },
      {
        fieldId: 'target',
        componentName: 'TextField',
        label: '目标',
      },
    ]);
    const effects: FormEffect[] = [
      {
        when: { field: 'toggle', operator: 'eq', value: 'off' },
        then: [{ field: 'target', action: 'disable' }],
      },
    ];
    const config = createConfig(effects);

    renderForm({ schema, config });

    // Initially target is NORMAL (not disabled)
    expect(screen.getByTestId('textfield-input-target')).not.toBeDisabled();

    // Set toggle = 'off'
    fireEvent.change(screen.getByTestId('textfield-input-toggle'), {
      target: { value: 'off' },
    });

    // Target should be disabled
    expect(screen.getByTestId('textfield-input-target')).toBeDisabled();

    // Set toggle back to something else
    fireEvent.change(screen.getByTestId('textfield-input-toggle'), {
      target: { value: 'on' },
    });

    // Target should be enabled again (reverts to base behavior NORMAL)
    expect(screen.getByTestId('textfield-input-target')).not.toBeDisabled();
  });

  it('多条件链式联动：A 控制 B 的显示，A 控制 C 的 disable', () => {
    const schema = createSchema([
      {
        fieldId: 'control',
        componentName: 'TextField',
        label: '控制字段',
      },
      {
        fieldId: 'showTarget',
        componentName: 'TextField',
        label: '显示目标',
      },
      {
        fieldId: 'disableTarget',
        componentName: 'TextField',
        label: '禁用目标',
      },
    ]);
    const effects: FormEffect[] = [
      {
        when: { field: 'control', operator: 'ne', value: 'activate' },
        then: [{ field: 'showTarget', action: 'hide' }],
      },
      {
        when: { field: 'control', operator: 'eq', value: 'activate' },
        then: [{ field: 'disableTarget', action: 'disable' }],
      },
    ];
    const config = createConfig(effects);

    renderForm({ schema, config });

    // Initial state: showTarget hidden (ne 'activate' is true), disableTarget normal
    expect(document.querySelector('[data-field-id="showTarget"]')).not.toBeInTheDocument();
    expect(screen.getByTestId('textfield-input-disableTarget')).not.toBeDisabled();

    // Activate
    fireEvent.change(screen.getByTestId('textfield-input-control'), {
      target: { value: 'activate' },
    });

    // showTarget visible, disableTarget disabled
    expect(screen.getByTestId('textfield-input-showTarget')).toBeInTheDocument();
    expect(screen.getByTestId('textfield-input-disableTarget')).toBeDisabled();
  });

  it('多个独立效果同时生效', () => {
    const schema = createSchema([
      { fieldId: 'a', componentName: 'TextField', label: 'A' },
      { fieldId: 'b', componentName: 'TextField', label: 'B' },
      { fieldId: 'c', componentName: 'TextField', label: 'C' },
    ]);
    const effects: FormEffect[] = [
      {
        when: { field: 'a', operator: 'ne', value: '1' },
        then: [{ field: 'b', action: 'hide' }],
      },
      {
        when: { field: 'a', operator: 'ne', value: '1' },
        then: [{ field: 'c', action: 'hide' }],
      },
    ];
    const config = createConfig(effects);

    renderForm({ schema, config });

    // Initially a is undefined (!= '1') → both b and c hidden
    expect(document.querySelector('[data-field-id="b"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-field-id="c"]')).not.toBeInTheDocument();

    // Set a = '1' → ne condition false → b and c revert to NORMAL
    fireEvent.change(screen.getByTestId('textfield-input-a'), {
      target: { value: '1' },
    });

    expect(screen.getByTestId('textfield-input-b')).toBeInTheDocument();
    expect(screen.getByTestId('textfield-input-c')).toBeInTheDocument();
  });

  it('显式布局中的隐藏字段不保留默认布局占位', () => {
    const schema = {
      ...createSchema([
        { fieldId: 'a', componentName: 'TextField', label: 'A' },
        { fieldId: 'b', componentName: 'TextField', label: 'B' },
      ]),
      layout: [
        { id: 'layout-a', type: 'field', fieldId: 'a' },
        { id: 'layout-b', type: 'field', fieldId: 'b' },
      ],
    } as FormSchema;
    const effects: FormEffect[] = [
      {
        when: { field: 'a', operator: 'ne', value: 'show' },
        then: [{ field: 'b', action: 'hide' }],
      },
    ];

    const { container } = renderForm({ schema, config: createConfig(effects) });

    expect(document.querySelector('[data-field-id="b"]')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.sy-layout-field')).toHaveLength(1);
  });

  it('ne 操作符联动', () => {
    const schema = createSchema([
      { fieldId: 'a', componentName: 'TextField', label: 'A' },
      { fieldId: 'b', componentName: 'TextField', label: 'B' },
    ]);
    const effects: FormEffect[] = [
      {
        when: { field: 'a', operator: 'ne', value: 'keep' },
        then: [{ field: 'b', action: 'hide' }],
      },
    ];
    const config = createConfig(effects);

    // Initially a is undefined, ne 'keep' is true → b hidden
    renderForm({ schema, config });
    expect(document.querySelector('[data-field-id="b"]')).not.toBeInTheDocument();

    // Set a = 'keep' → ne condition becomes false → b reverts to NORMAL
    fireEvent.change(screen.getByTestId('textfield-input-a'), {
      target: { value: 'keep' },
    });
    expect(screen.getByTestId('textfield-input-b')).toBeInTheDocument();
  });

  it('隐藏的必填字段不参与整表校验', async () => {
    const schema = createSchema([
      { fieldId: 'a', componentName: 'TextField', label: 'A' },
      { fieldId: 'b', componentName: 'TextField', label: 'B', required: true },
    ]);
    const effects: FormEffect[] = [
      {
        when: { field: 'a', operator: 'changed' },
        then: [{ field: 'b', action: 'hide' }],
      },
    ];
    const config = createConfig(effects);
    let validateAll: (() => Promise<boolean>) | null = null;

    render(
      <FormProvider schema={schema} config={config}>
        <ValidateBridge onReady={(fn) => (validateAll = fn)} />
        <FormRenderer />
      </FormProvider>,
    );

    expect(document.querySelector('[data-field-id="b"]')).not.toBeInTheDocument();
    expect(validateAll).toBeTypeOf('function');
    let valid = false;
    await act(async () => {
      valid = await validateAll!();
    });
    expect(valid).toBe(true);
    expect(screen.queryByTestId('error-b')).not.toBeInTheDocument();
  });
});
