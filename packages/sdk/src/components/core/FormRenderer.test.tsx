import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { FormRenderer } from './FormRenderer';
import { FormProvider } from './FormProvider';
import type { FormSchema, FormEngineConfig } from '../types';

const MockTextField = (props: any) =>
  React.createElement('input', {
    'data-testid': `field-${props.fieldId}`,
    'data-required': props.required ? 'true' : undefined,
    'data-options': props.options?.length,
    'data-behavior': props.behavior,
    className: props.className,
    type: 'text',
  });
const MockNumberField = (props: any) =>
  React.createElement('input', {
    'data-testid': `field-${props.fieldId}`,
    'data-behavior': props.behavior,
    className: props.className,
    type: 'number',
  });
const MockBlockField = (props: any) =>
  React.createElement('div', {
    'data-testid': `field-${props.fieldId}`,
    'data-component': props.componentName,
    className: props.className,
  });

const baseSchema: FormSchema = {
  formMeta: { formUuid: 'test-form', appType: 'test', title: 'Test Form' },
  fields: [
    { fieldId: 'name', componentName: 'TextField', label: '姓名', required: true },
    { fieldId: 'age', componentName: 'NumberField', label: '年龄' },
  ],
};

const baseConfig: FormEngineConfig = {
  mode: 'submit',
  formUuid: 'test-form',
  appType: 'test',
};

const mockComponents: Record<string, React.ComponentType<any>> = {
  TextField: MockTextField,
  NumberField: MockNumberField,
  SubFormField: MockBlockField,
  EditorField: MockBlockField,
};

function renderWithProvider(
  ui: React.ReactElement,
  schema: FormSchema = baseSchema,
  config: FormEngineConfig = baseConfig,
  components?: Record<string, React.ComponentType<any>>,
) {
  return render(
    React.createElement(
      FormProvider,
      { schema, config, components: components ?? mockComponents },
      ui,
    ),
  );
}

describe('FormRenderer', () => {
  it('renders all fields defined in schema', () => {
    renderWithProvider(React.createElement(FormRenderer));

    expect(screen.getByTestId('field-name')).toBeInTheDocument();
    expect(screen.getByTestId('field-age')).toBeInTheDocument();
  });

  it('skips unregistered components and shows console warning in dev', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const schema: FormSchema = {
      formMeta: { formUuid: 'test', appType: 'test', title: 'Test' },
      fields: [
        { fieldId: 'x', componentName: 'UnknownField', label: 'Unknown' },
        { fieldId: 'name', componentName: 'TextField', label: '姓名' },
      ],
    };

    renderWithProvider(React.createElement(FormRenderer), schema);

    expect(screen.getByTestId('field-name')).toBeInTheDocument();
    expect(screen.queryByTestId('field-x')).not.toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('UnknownField'));

    warnSpy.mockRestore();
  });

  it('applies columns layout class', () => {
    renderWithProvider(React.createElement(FormRenderer, { columns: 3 }));

    const container = screen.getByTestId('form-renderer');
    expect(container.className).toContain('sy-form-renderer');
    expect(container.className).toContain('sy-grid-cols-1');
    expect(container.className).toContain('lg:sy-grid-cols-3');
  });

  it('appends custom className to default layout', () => {
    renderWithProvider(React.createElement(FormRenderer, { className: 'custom-layout' }));

    const container = screen.getByTestId('form-renderer');
    expect(container.className).toContain('sy-grid');
    expect(container.className).toContain('sy-grid-cols-1');
    expect(container.className).toContain('custom-layout');
  });

  it('applies fieldClassName to each rendered field', () => {
    const FieldWithClass = (props: any) =>
      React.createElement('div', {
        'data-testid': `field-${props.fieldId}`,
        className: props.className,
      });

    const components = { TextField: FieldWithClass, NumberField: FieldWithClass };

    renderWithProvider(
      React.createElement(FormRenderer, { fieldClassName: 'my-field' }),
      baseSchema,
      baseConfig,
      components,
    );

    expect(screen.getByTestId('field-name').className).toBe('my-field');
    expect(screen.getByTestId('field-age').className).toBe('my-field');
  });

  it('renders empty container when schema has no fields', () => {
    const emptySchema: FormSchema = {
      formMeta: { formUuid: 'empty', appType: 'test', title: 'Empty' },
      fields: [],
    };

    renderWithProvider(React.createElement(FormRenderer), emptySchema);

    const container = screen.getByTestId('form-renderer');
    expect(container.children).toHaveLength(0);
  });

  it('uses default columns=1 grid class', () => {
    renderWithProvider(React.createElement(FormRenderer));

    const container = screen.getByTestId('form-renderer');
    expect(container.className).toContain('sy-grid-cols-1');
  });

  it('keeps ordinary fields constrained in the default single-column layout', () => {
    renderWithProvider(React.createElement(FormRenderer));

    expect(screen.getByTestId('field-name').parentElement).toHaveClass('sy-layout-field');
  });

  it('renders subform and rich text fields full width in the default layout', () => {
    const schema: FormSchema = {
      ...baseSchema,
      fields: [
        { fieldId: 'name', componentName: 'TextField', label: '姓名' },
        { fieldId: 'detail', componentName: 'SubFormField', label: '明细', columns: [] },
        { fieldId: 'content', componentName: 'EditorField', label: '富文本' },
      ],
    };

    renderWithProvider(React.createElement(FormRenderer), schema);

    expect(screen.getByTestId('field-name').parentElement).toHaveClass('sy-layout-field');
    expect(screen.getByTestId('field-detail').parentElement).toHaveClass('sy-layout-field-full');
    expect(screen.getByTestId('field-content').parentElement).toHaveClass('sy-layout-field-full');
  });

  it('supports columns=2 layout', () => {
    renderWithProvider(React.createElement(FormRenderer, { columns: 2 }));

    const container = screen.getByTestId('form-renderer');
    expect(container.className).toContain('md:sy-grid-cols-2');
  });

  it('renders flat field-only layout through the default grid columns', () => {
    const schema: FormSchema = {
      ...baseSchema,
      layout: [
        { id: 'layout-name', type: 'field', fieldId: 'name' },
        { id: 'layout-age', type: 'field', fieldId: 'age' },
      ],
    };

    renderWithProvider(React.createElement(FormRenderer, { columns: 2 }), schema);

    const container = screen.getByTestId('form-renderer');
    expect(container.className).toContain('sy-grid');
    expect(container.className).toContain('md:sy-grid-cols-2');
    expect(container.className).not.toContain('sy-form-layout');
    expect(screen.getByTestId('field-name').parentElement).toBe(container);
  });

  it('keeps subform and rich text full width in implicit grid layout', () => {
    const schema: FormSchema = {
      ...baseSchema,
      fields: [
        { fieldId: 'name', componentName: 'TextField', label: '姓名' },
        { fieldId: 'detail', componentName: 'SubFormField', label: '明细', columns: [] },
        { fieldId: 'content', componentName: 'EditorField', label: '富文本' },
      ],
      layout: [
        { id: 'layout-name', type: 'field', fieldId: 'name' },
        { id: 'layout-detail', type: 'field', fieldId: 'detail' },
        { id: 'layout-content', type: 'field', fieldId: 'content' },
      ],
    };

    renderWithProvider(React.createElement(FormRenderer, { columns: 2 }), schema);

    const detailWrapper = screen.getByTestId('field-detail').parentElement;
    const contentWrapper = screen.getByTestId('field-content').parentElement;
    expect(detailWrapper).toHaveClass('sy-layout-field-full');
    expect(detailWrapper).toHaveStyle({ gridColumn: '1 / -1' });
    expect(contentWrapper).toHaveClass('sy-layout-field-full');
    expect(contentWrapper).toHaveStyle({ gridColumn: '1 / -1' });
  });

  it('supports columns=4 layout', () => {
    renderWithProvider(React.createElement(FormRenderer, { columns: 4 }));

    const container = screen.getByTestId('form-renderer');
    expect(container.className).toContain('lg:sy-grid-cols-4');
  });

  it('preserves explicit grid cells from layout schema', () => {
    const schema: FormSchema = {
      ...baseSchema,
      layout: [
        {
          id: 'grid-1',
          type: 'grid',
          columns: 2,
          columnGap: 24,
          rowGap: 32,
          columnRatios: [1, 1],
          cells: [
            { key: 'cell0', children: [] },
            { key: 'cell1', children: [{ id: 'layout-name', type: 'field', fieldId: 'name' }] },
            { key: 'cell2', children: [{ id: 'layout-age', type: 'field', fieldId: 'age' }] },
          ],
          children: [
            { id: 'layout-name', type: 'field', fieldId: 'name' },
            { id: 'layout-age', type: 'field', fieldId: 'age' },
          ],
        },
      ],
    };

    renderWithProvider(React.createElement(FormRenderer), schema);

    const grid = screen.getByTestId('form-grid');
    expect(grid.children).toHaveLength(3);
    expect(grid.children[0]).toHaveAttribute('aria-hidden', 'true');
    expect(grid.children[1]).toContainElement(screen.getByTestId('field-name'));
    expect(grid.children[2]).toContainElement(screen.getByTestId('field-age'));
  });

  it('does not force subform full width inside explicit grid layout', () => {
    const schema: FormSchema = {
      ...baseSchema,
      fields: [{ fieldId: 'detail', componentName: 'SubFormField', label: '明细', columns: [] }],
      layout: [
        {
          id: 'grid-1',
          type: 'grid',
          columns: 2,
          columnGap: 24,
          rowGap: 24,
          columnRatios: [1, 1],
          cells: [
            { key: 'cell0', children: [{ id: 'layout-detail', type: 'field', fieldId: 'detail' }] },
            { key: 'cell1', children: [] },
          ],
          children: [{ id: 'layout-detail', type: 'field', fieldId: 'detail' }],
        },
      ],
    };

    renderWithProvider(React.createElement(FormRenderer), schema);

    const field = screen.getByTestId('field-detail');
    expect(field.closest('.sy-layout-field-full')).toBeNull();
    expect(field.closest('.sy-layout-field')).toBeNull();
    expect(field.parentElement).toHaveClass('sy-grid-cell');
  });

  it('renders section, grid children, tabs and steps from layout schema', () => {
    const schema: FormSchema = {
      ...baseSchema,
      fields: [
        ...baseSchema.fields,
        {
          fieldId: 'status',
          componentName: 'TextField',
          label: '状态',
          options: [],
        },
      ],
      rules: [
        {
          when: { field: 'name', operator: 'empty' },
          then: [
            { field: 'name', action: 'setRequired', value: true },
            { field: 'status', action: 'setOptions', value: [{ label: '启用', value: 'active' }] },
          ],
        },
      ],
      layout: [
        {
          id: 'basic-section',
          type: 'section',
          title: '基础信息',
          description: '基础描述',
          variant: 'card',
          accent: 'green',
          iconKey: 'user',
          collapsible: true,
          defaultCollapsed: false,
          visibleWhen: { field: 'name', operator: 'empty' },
          children: [
            {
              id: 'layout-name',
              type: 'field',
              fieldId: 'name',
              span: 2,
              className: 'layout-field',
            },
            {
              id: 'grid-with-children',
              type: 'grid',
              columns: 2,
              gap: '12',
              children: [{ id: 'layout-status', type: 'field', fieldId: 'status' }],
            },
            {
              id: 'tabs-1',
              type: 'tabs',
              defaultActiveKey: 'base',
              items: [
                {
                  key: 'base',
                  label: '基础',
                  children: [{ id: 'tab-age', type: 'field', fieldId: 'age' }],
                },
                {
                  key: 'extra',
                  label: '扩展',
                  children: [{ id: 'tab-status', type: 'field', fieldId: 'status' }],
                },
              ],
            },
            {
              id: 'steps-1',
              type: 'steps',
              items: [
                {
                  key: 'one',
                  title: '第一步',
                  description: '第一步说明',
                  children: [{ id: 'step-name', type: 'field', fieldId: 'name' }],
                },
                {
                  key: 'two',
                  title: '第二步',
                  children: [{ id: 'step-status', type: 'field', fieldId: 'status' }],
                },
              ],
            },
          ],
        },
      ],
    };

    renderWithProvider(
      React.createElement(FormRenderer, { fieldClassName: 'fallback-field' }),
      schema,
    );

    expect(screen.getByTestId('form-section')).toHaveTextContent('基础信息');
    expect(screen.getByTestId('form-section')).toHaveClass(
      'sy-form-section-card',
      'sy-form-section-accent-green',
    );
    expect(screen.getByTestId('form-section-icon')).toBeInTheDocument();
    expect(screen.getByTestId('form-section-description')).toHaveTextContent('基础描述');
    const nameFields = screen.getAllByTestId('field-name');
    expect(nameFields[0]).toHaveClass('layout-field');
    expect(nameFields[0].parentElement).toHaveStyle({
      gridColumn: 'span 2 / span 2',
    });
    expect(screen.getAllByTestId('field-status')[0]).toHaveAttribute('data-options', '1');
    expect(screen.getByTestId('form-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('field-age')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('form-tab-extra'));
    expect(screen.getByTestId('form-tabs-content')).toContainElement(
      screen.getAllByTestId('field-status').at(-1) as HTMLElement,
    );
    expect(screen.getByTestId('form-steps')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('form-steps-next'));
    expect(screen.getByTestId('form-steps-content')).toContainElement(
      screen.getAllByTestId('field-status').at(-1) as HTMLElement,
    );
  });

  it('passes computed readonly behavior over schema NORMAL behavior', () => {
    const schema: FormSchema = {
      ...baseSchema,
      fields: [{ fieldId: 'name', componentName: 'TextField', label: '姓名', behavior: 'NORMAL' }],
    };

    renderWithProvider(React.createElement(FormRenderer), schema, {
      ...baseConfig,
      mode: 'readonly',
    });

    expect(screen.getByTestId('field-name')).toHaveAttribute('data-behavior', 'READONLY');
  });

  it('passes field effect behavior to normal fields outside layout containers', () => {
    const schema: FormSchema = {
      ...baseSchema,
      fields: [
        { fieldId: 'toggle', componentName: 'TextField', label: '开关', defaultValue: 'hide' },
        { fieldId: 'name', componentName: 'TextField', label: '姓名', behavior: 'NORMAL' },
      ],
      rules: [
        {
          when: { field: 'toggle', operator: 'eq', value: 'hide' },
          then: [{ field: 'name', action: 'hide' }],
        },
      ],
    };

    const { container } = renderWithProvider(React.createElement(FormRenderer), schema);

    expect(screen.queryByTestId('field-name')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.sy-layout-field')).toHaveLength(1);
  });

  it('skips hidden, behavior-hidden, invisible and missing layout nodes', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const schema: FormSchema = {
      ...baseSchema,
      fields: [
        { fieldId: 'toggle', componentName: 'TextField', label: '开关', defaultValue: 'hide' },
        ...baseSchema.fields,
      ],
      rules: [
        {
          when: { field: 'toggle', operator: 'eq', value: 'hide' },
          then: [{ target: 'hidden-by-effect', targetType: 'layout', action: 'hide' }],
        },
      ],
      layout: [
        {
          id: 'hidden-directly',
          type: 'field',
          fieldId: 'name',
          hidden: true,
        },
        {
          id: 'hidden-by-effect',
          type: 'field',
          fieldId: 'age',
        },
        {
          id: 'invisible-condition',
          type: 'field',
          fieldId: 'toggle',
          visibleWhen: [
            { field: 'toggle', operator: 'eq', value: 'show' },
            { field: 'name', operator: 'notEmpty' },
          ],
        },
        {
          id: 'missing-field',
          type: 'field',
          fieldId: 'missing',
        },
      ],
    };

    renderWithProvider(React.createElement(FormRenderer), schema);

    expect(screen.queryByTestId('field-name')).not.toBeInTheDocument();
    expect(screen.queryByTestId('field-age')).not.toBeInTheDocument();
    expect(screen.queryByTestId('field-toggle')).not.toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('missing field "missing"'));
    warnSpy.mockRestore();
  });

  it('uses size classes for compact and large grid rendering', () => {
    const { rerender } = renderWithProvider(React.createElement(FormRenderer, { size: 'compact' }));
    expect(screen.getByTestId('form-renderer').className).toContain('sy-gap-y-4');

    rerender(
      React.createElement(
        FormProvider,
        { schema: baseSchema, config: baseConfig, components: mockComponents },
        React.createElement(FormRenderer, { size: 'large' }),
      ),
    );
    expect(screen.getByTestId('form-renderer').className).toContain('sy-gap-y-8');
  });
});
