import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { FormSummary } from './index';
import { FormProvider } from '../../core/FormProvider';
import type { FormSchema, FormEngineConfig } from '../../types';

const createSchema = (fields: FormSchema['fields']): FormSchema => ({
  formMeta: { formUuid: 'test', appType: 'test', title: 'Test' },
  fields,
});

const createConfig = (): FormEngineConfig => ({
  mode: 'readonly',
  formUuid: 'test',
  appType: 'test',
});

function renderSummary(
  props: Partial<React.ComponentProps<typeof FormSummary>> = {},
  opts?: { schema?: FormSchema; initialValues?: Record<string, any> },
) {
  const schema =
    opts?.schema ??
    createSchema([
      { fieldId: 'name', componentName: 'TextField', label: '姓名' },
      { fieldId: 'age', componentName: 'NumberField', label: '年龄' },
      { fieldId: 'city', componentName: 'TextField', label: '城市' },
    ]);

  return render(
    <FormProvider schema={schema} config={createConfig()} initialValues={opts?.initialValues}>
      <FormSummary {...props} />
    </FormProvider>,
  );
}

describe('FormSummary', () => {
  it('渲染所有字段', () => {
    renderSummary({}, { initialValues: { name: '张三', age: 25, city: '北京' } });
    expect(screen.getByTestId('form-summary')).toBeInTheDocument();
    expect(screen.getByTestId('summary-field-name')).toBeInTheDocument();
    expect(screen.getByTestId('summary-field-age')).toBeInTheDocument();
    expect(screen.getByTestId('summary-field-city')).toBeInTheDocument();
  });

  it('显示字段 label 和 value', () => {
    renderSummary({}, { initialValues: { name: '张三', age: 25, city: '北京' } });
    expect(screen.getByText('姓名')).toBeInTheDocument();
    expect(screen.getByText('张三')).toBeInTheDocument();
    expect(screen.getByText('年龄')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
  });

  it('空值显示 "--"', () => {
    renderSummary({}, { initialValues: {} });
    const summaryFields = screen.getAllByText('--');
    expect(summaryFields).toHaveLength(3);
  });

  it('null 值显示 "--"', () => {
    renderSummary({}, { initialValues: { name: null } });
    expect(screen.getByTestId('summary-field-name')).toHaveTextContent('--');
  });

  it('空字符串显示 "--"', () => {
    renderSummary({}, { initialValues: { name: '' } });
    expect(screen.getByTestId('summary-field-name')).toHaveTextContent('--');
  });

  it('fields 过滤显示特定字段', () => {
    renderSummary(
      { fields: ['name', 'city'] },
      { initialValues: { name: '张三', age: 25, city: '北京' } },
    );
    expect(screen.getByTestId('summary-field-name')).toBeInTheDocument();
    expect(screen.getByTestId('summary-field-city')).toBeInTheDocument();
    expect(screen.queryByTestId('summary-field-age')).not.toBeInTheDocument();
  });

  it('数组值展示为逗号分隔', () => {
    renderSummary(
      {},
      {
        schema: createSchema([
          { fieldId: 'tags', componentName: 'MultiSelectField', label: '标签' },
        ]),
        initialValues: {
          tags: [
            { label: 'A', value: 'a' },
            { label: 'B', value: 'b' },
          ],
        },
      },
    );
    expect(screen.getByTestId('summary-field-tags')).toHaveTextContent('A, B');
  });

  it('空数组显示 "--"', () => {
    renderSummary(
      {},
      {
        schema: createSchema([
          { fieldId: 'tags', componentName: 'MultiSelectField', label: '标签' },
        ]),
        initialValues: { tags: [] },
      },
    );
    expect(screen.getByTestId('summary-field-tags')).toHaveTextContent('--');
  });

  it('对象 value 有 label 时显示 label', () => {
    renderSummary(
      {},
      {
        schema: createSchema([{ fieldId: 'dept', componentName: 'SelectField', label: '部门' }]),
        initialValues: { dept: { label: '技术部', value: 'tech' } },
      },
    );
    expect(screen.getByTestId('summary-field-dept')).toHaveTextContent('技术部');
  });

  it('按字段类型展示富文本、级联日期和 JSON', () => {
    renderSummary(
      {},
      {
        schema: createSchema([
          { fieldId: 'rich', componentName: 'EditorField', label: '富文本' },
          { fieldId: 'range', componentName: 'CascadeDateField', label: '日期范围' },
          { fieldId: 'json', componentName: 'JSONField', label: 'JSON' },
        ]),
        initialValues: {
          rich: '<p><strong>富文本内容</strong></p>',
          range: { start: '2026-05-01', end: '2026-05-15' },
          json: { status: 'ready' },
        },
      },
    );
    expect(screen.getByTestId('summary-field-rich')).toHaveTextContent('富文本内容');
    expect(screen.getByTestId('summary-field-rich')).not.toHaveTextContent('<strong>');
    expect(screen.getByTestId('summary-field-range')).toHaveTextContent('2026-05-01 ~ 2026-05-15');
    expect(screen.getByTestId('summary-field-json')).toHaveTextContent('"status": "ready"');
  });

  it('富文本汇总会解码被转义的 HTML 并保留颜色样式', () => {
    renderSummary(
      {},
      {
        schema: createSchema([{ fieldId: 'rich', componentName: 'EditorField', label: '富文本' }]),
        initialValues: {
          rich: '&lt;p&gt;123213ddd&lt;span style=&quot;color: rgb(239, 68, 68);&quot;&gt;2133&lt;/span&gt;&lt;/p&gt;',
        },
      },
    );

    const field = screen.getByTestId('summary-field-rich');
    expect(field).toHaveTextContent('123213ddd2133');
    expect(field).not.toHaveTextContent('<p>');
    expect(field.querySelector('.sy-summary-richtext span')?.getAttribute('style')).toContain(
      'color',
    );
  });

  it('普通数组（无 label 对象）字符串化', () => {
    renderSummary(
      {},
      {
        schema: createSchema([{ fieldId: 'items', componentName: 'TextField', label: '项目' }]),
        initialValues: { items: ['x', 'y'] },
      },
    );
    expect(screen.getByTestId('summary-field-items')).toHaveTextContent('x, y');
  });

  it('自定义 className', () => {
    renderSummary({ className: 'my-summary' }, { initialValues: {} });
    expect(screen.getByTestId('form-summary')).toHaveClass('my-summary');
  });

  it('自定义 labelClassName', () => {
    renderSummary({ labelClassName: 'label-cls' }, { initialValues: { name: '张三' } });
    expect(screen.getByText('姓名')).toHaveClass('label-cls');
  });

  it('自定义 valueClassName', () => {
    renderSummary({ valueClassName: 'value-cls' }, { initialValues: { name: '张三' } });
    expect(screen.getByText('张三')).toHaveClass('value-cls');
  });

  it('columns=1', () => {
    renderSummary({ columns: 1 }, { initialValues: {} });
    expect(screen.getByTestId('form-summary')).toHaveClass('grid-cols-1');
  });

  it('columns=3', () => {
    renderSummary({ columns: 3 }, { initialValues: {} });
    expect(screen.getByTestId('form-summary')).toHaveClass('md:grid-cols-3');
  });

  it('默认 columns=2', () => {
    renderSummary({}, { initialValues: {} });
    expect(screen.getByTestId('form-summary')).toHaveClass('md:grid-cols-2');
  });
});
