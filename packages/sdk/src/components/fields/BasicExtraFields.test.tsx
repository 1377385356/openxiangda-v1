import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { FormProvider } from '../core/FormProvider';
import { useFormContext } from '../core/FormContext';
import type { FormEngineConfig, FormSchema } from '../types';
import { CascadeSelectField } from './CascadeSelectField';
import { JSONField } from './JSONField';
import { SerialNumberField } from './SerialNumberField';

vi.mock('../core/defaultRegistry', () => ({
  defaultComponentRegistry: {},
}));

vi.mock('antd', () => ({
  Cascader: ({ value, onChange, multiple, 'data-testid': testId, disabled }: any) => (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      data-value={JSON.stringify(value)}
      onClick={() =>
        multiple
          ? onChange?.(
              [
                ['a', 'b'],
                ['c', 'd'],
              ],
              [
                [
                  { label: 'A', value: 'a' },
                  { title: 'B', value: 'b' },
                ],
                [{ value: 'c' }, { label: 'D', value: 'd' }],
              ],
            )
          : onChange?.(
              ['a', 'b'],
              [
                { label: 'A', value: 'a' },
                { title: 'B', value: 'b' },
              ],
            )
      }
    >
      cascader
    </button>
  ),
  Input: Object.assign(
    ({ value, placeholder, disabled, readOnly, 'data-testid': testId }: any) => (
      <input
        data-testid={testId}
        value={value || ''}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        onChange={() => undefined}
      />
    ),
    {
      TextArea: ({ value, onChange, onFocus, onBlur, disabled, 'data-testid': testId }: any) => (
        <textarea
          data-testid={testId}
          value={value || ''}
          disabled={disabled}
          onFocus={onFocus}
          onBlur={onBlur}
          onChange={onChange}
        />
      ),
    },
  ),
}));

function createSchema(fieldId: string, componentName: string, behavior?: any): FormSchema {
  return {
    formMeta: { formUuid: 'test', appType: 'test', title: 'Test' },
    fields: [{ fieldId, componentName, label: fieldId, behavior }],
  };
}

function createConfig(): FormEngineConfig {
  return { mode: 'submit', formUuid: 'test', appType: 'test' };
}

function renderField(
  node: React.ReactElement,
  schema: FormSchema,
  initialValues?: Record<string, any>,
) {
  const ctxRef: { current: ReturnType<typeof useFormContext> | null } = { current: null };
  const Capture = () => {
    ctxRef.current = useFormContext();
    return null;
  };
  const result = render(
    <FormProvider schema={schema} config={createConfig()} initialValues={initialValues}>
      {node}
      <Capture />
    </FormProvider>,
  );
  return { ...result, ctxRef };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('CascadeSelectField extra coverage', () => {
  const options = [{ label: 'A', value: 'a', children: [{ label: 'B', value: 'b' }] }];

  it('writes single selected path', () => {
    const onChange = vi.fn();
    const { ctxRef } = renderField(
      <CascadeSelectField fieldId="cascade" label="级联" options={options} onChange={onChange} />,
      createSchema('cascade', 'CascadeSelectField'),
    );
    fireEvent.click(screen.getByTestId('cascadeselectfield-input-cascade'));
    expect(ctxRef.current!.formData.cascade).toEqual([
      { label: 'A', value: 'a' },
      { label: 'B', value: 'b' },
    ]);
    expect(onChange).toHaveBeenCalledWith([
      { label: 'A', value: 'a' },
      { label: 'B', value: 'b' },
    ]);
  });

  it('maps primitive fallback values to an empty cascader path', () => {
    renderField(
      <CascadeSelectField fieldId="cascade" label="级联" options={options} />,
      createSchema('cascade', 'CascadeSelectField'),
      { cascade: 'invalid-value' },
    );

    expect(screen.getByTestId('cascadeselectfield-input-cascade')).toHaveAttribute(
      'data-value',
      '[]',
    );
  });

  it('writes multiple selected paths and maps value path', () => {
    const { ctxRef } = renderField(
      <CascadeSelectField
        fieldId="cascade"
        label="级联"
        options={options}
        multiple
        defaultValue={[[{ label: 'A', value: 'a' }]]}
      />,
      createSchema('cascade', 'CascadeSelectField'),
    );
    expect(screen.getByTestId('cascadeselectfield-input-cascade')).toHaveAttribute(
      'data-value',
      '[["a"]]',
    );
    fireEvent.click(screen.getByTestId('cascadeselectfield-input-cascade'));
    expect(ctxRef.current!.formData.cascade).toEqual([
      [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
      ],
      [
        { label: 'c', value: 'c' },
        { label: 'D', value: 'd' },
      ],
    ]);
  });

  it('renders readonly, disabled and hidden states', () => {
    const { rerender } = renderField(
      <CascadeSelectField fieldId="cascade" label="级联" options={options} behavior="READONLY" />,
      createSchema('cascade', 'CascadeSelectField'),
      { cascade: [{ label: 'A', value: 'a' }] },
    );
    expect(screen.getByTestId('cascadeselectfield-readonly-cascade')).toHaveTextContent('A');

    rerender(
      <FormProvider
        schema={createSchema('cascade', 'CascadeSelectField')}
        config={createConfig()}
        initialValues={{ cascade: [{ label: 'A', value: 'a' }] }}
      >
        <CascadeSelectField fieldId="cascade" label="级联" options={options} behavior="DISABLED" />
      </FormProvider>,
    );
    expect(screen.getByTestId('cascadeselectfield-input-cascade')).toBeDisabled();

    rerender(
      <FormProvider schema={createSchema('cascade', 'CascadeSelectField')} config={createConfig()}>
        <CascadeSelectField fieldId="cascade" label="级联" options={options} behavior="HIDDEN" />
      </FormProvider>,
    );
    expect(screen.queryByTestId('cascadeselectfield-input-cascade')).not.toBeInTheDocument();
  });
});

describe('JSONField and SerialNumberField extra coverage', () => {
  it('formats JSON objects, strings, empty values and hidden state', () => {
    renderField(
      <JSONField fieldId="json" label="JSON" behavior="READONLY" />,
      createSchema('json', 'JSONField'),
      { json: { a: 1 } },
    );
    expect(screen.getByTestId('jsonfield-readonly-json')).toHaveTextContent('"a": 1');

    cleanup();
    renderField(
      <JSONField fieldId="json" label="JSON" behavior="READONLY" />,
      createSchema('json', 'JSONField'),
      { json: 'raw' },
    );
    expect(screen.getByTestId('jsonfield-readonly-json')).toHaveTextContent('raw');

    cleanup();
    renderField(
      <JSONField fieldId="json" label="JSON" behavior="READONLY" />,
      createSchema('json', 'JSONField'),
    );
    expect(screen.getByTestId('jsonfield-readonly-json')).toHaveTextContent('--');

    cleanup();
    renderField(
      <JSONField fieldId="json" label="JSON" behavior="HIDDEN" />,
      createSchema('json', 'JSONField'),
    );
    expect(screen.queryByTestId('jsonfield-readonly-json')).not.toBeInTheDocument();
  });

  it('falls back to string conversion when JSON serialization throws and applies defaults', () => {
    const circular: any = {};
    circular.self = circular;
    renderField(
      <JSONField fieldId="json" label="JSON" defaultValue={circular} />,
      createSchema('json', 'JSONField', 'READONLY'),
    );

    expect(screen.getByTestId('jsonfield-readonly-json')).toHaveTextContent('[object Object]');
  });

  it('edits structured JSON in normal mode and keeps invalid text out of form data', async () => {
    const onChange = vi.fn();
    const { ctxRef } = renderField(
      <JSONField fieldId="json" label="JSON" onChange={onChange} />,
      createSchema('json', 'JSONField'),
      { json: { a: 1 } },
    );
    const input = screen.getByTestId('jsonfield-input-json');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '{"a":2,"items":[1,2]}' } });
    expect(ctxRef.current!.formData.json).toEqual({ a: 2, items: [1, 2] });
    expect(onChange).toHaveBeenLastCalledWith({ a: 2, items: [1, 2] });

    fireEvent.change(input, { target: { value: '{invalid' } });
    expect(ctxRef.current!.formData.json).toEqual({ a: 2, items: [1, 2] });
    expect(screen.getByTestId('jsonfield-error-json')).toHaveTextContent('请输入有效的 JSON');
    expect(await ctxRef.current!.validateAllWithErrors()).toEqual({ json: '请输入有效的 JSON' });
  });

  it('supports field-level renderer and editor extension points', () => {
    const renderer = vi.fn(({ value }) => <div data-testid="custom-json-view">{value.name}</div>);
    renderField(
      <JSONField fieldId="json" label="JSON" behavior="READONLY" renderer={renderer} />,
      createSchema('json', 'JSONField'),
      { json: { name: '查看' } },
    );
    expect(screen.getByTestId('custom-json-view')).toHaveTextContent('查看');
    expect(renderer).toHaveBeenCalledWith(
      expect.objectContaining({ fieldId: 'json', formattedValue: expect.stringContaining('查看') }),
    );

    cleanup();
    const { ctxRef } = renderField(
      <JSONField
        fieldId="json"
        label="JSON"
        editor={({ value, onChange, disabled }) => (
          <button
            type="button"
            data-testid="custom-json-editor"
            disabled={disabled}
            onClick={() => onChange({ ...value, edited: true })}
          >
            编辑结构
          </button>
        )}
      />,
      createSchema('json', 'JSONField'),
      { json: { name: '编辑' } },
    );
    fireEvent.click(screen.getByTestId('custom-json-editor'));
    expect(ctxRef.current!.formData.json).toEqual({ name: '编辑', edited: true });
  });

  it('renders serial readonly, editable, disabled, default and hidden states', () => {
    const { ctxRef } = renderField(
      <SerialNumberField fieldId="serial" label="编号" defaultValue="SN-001" />,
      createSchema('serial', 'SerialNumberField'),
    );
    expect(ctxRef.current!.formData.serial).toBe('SN-001');
    expect(screen.getByTestId('serialnumberfield-readonly-serial')).toHaveTextContent('SN-001');

    cleanup();
    renderField(
      <SerialNumberField fieldId="serial" label="编号" behavior="NORMAL" />,
      createSchema('serial', 'SerialNumberField'),
      { serial: 'SN-002' },
    );
    expect(screen.getByTestId('serialnumberfield-input-serial')).toHaveValue('SN-002');
    expect(screen.getByTestId('serialnumberfield-input-serial')).toHaveAttribute('readonly');

    cleanup();
    renderField(
      <SerialNumberField fieldId="serial" label="编号" behavior="DISABLED" />,
      createSchema('serial', 'SerialNumberField'),
    );
    expect(screen.getByTestId('serialnumberfield-input-serial')).toBeDisabled();

    cleanup();
    renderField(
      <SerialNumberField fieldId="serial" label="编号" behavior="HIDDEN" />,
      createSchema('serial', 'SerialNumberField'),
    );
    expect(screen.queryByTestId('serialnumberfield-input-serial')).not.toBeInTheDocument();
  });
});
