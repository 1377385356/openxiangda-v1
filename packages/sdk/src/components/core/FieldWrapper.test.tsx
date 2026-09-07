import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { FieldWrapper } from './FieldWrapper';
import { FormProvider } from './FormProvider';
import type { FormSchema, FormEngineConfig } from '../types';
import { useFormContext } from './FormContext';

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

function renderInProvider(
  ui: React.ReactElement,
  opts?: { schema?: FormSchema; config?: FormEngineConfig },
) {
  const schema = opts?.schema ?? createSchema();
  const config = opts?.config ?? createConfig();
  return render(React.createElement(FormProvider, { schema, config, children: null }, ui));
}

function installMatchMedia() {
  const previous = window.matchMedia;
  window.matchMedia = (() => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  return () => {
    window.matchMedia = previous;
  };
}

afterEach(() => {
  cleanup();
  delete (window as any).matchMedia;
});

describe('FieldWrapper', () => {
  it('渲染 label', () => {
    renderInProvider(
      React.createElement(FieldWrapper, {
        fieldId: 'f1',
        label: '姓名',
        children: React.createElement('input'),
      }),
    );
    expect(screen.getByText('姓名')).toBeInTheDocument();
  });

  it('required 时显示 * 标记', () => {
    renderInProvider(
      React.createElement(FieldWrapper, {
        fieldId: 'f1',
        label: '姓名',
        required: true,
        children: React.createElement('input'),
      }),
    );
    expect(screen.getByText('*')).toBeInTheDocument();
    expect(screen.getByText('*')).toHaveClass('sy-field-required');
  });

  it('AntD Form.Item 分支使用 OpenXiangda 必填标记', () => {
    const restore = installMatchMedia();

    renderInProvider(
      React.createElement(FieldWrapper, {
        fieldId: 'f1',
        label: '姓名',
        labelClassName: 'label-cls',
        required: true,
        children: React.createElement('input'),
      }),
    );

    const marker = screen.getByText('*');
    expect(marker).toHaveClass('sy-field-required');
    expect(marker).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('姓名')).toHaveClass('sy-field-label', 'label-cls');
    expect(document.querySelector('.ant-form-item-required')).toBeNull();
    expect(document.querySelector('.sy-ant-form-item-required')).toBeNull();
    restore();
  });

  it('非 required 不显示 * 标记', () => {
    renderInProvider(
      React.createElement(FieldWrapper, {
        fieldId: 'f1',
        label: '姓名',
        children: React.createElement('input'),
      }),
    );
    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });

  it('渲染 tips', () => {
    renderInProvider(
      React.createElement(FieldWrapper, {
        fieldId: 'f1',
        label: '姓名',
        tips: '请输入真实姓名',
        children: React.createElement('input'),
      }),
    );
    expect(screen.getByText('请输入真实姓名')).toBeInTheDocument();
  });

  it('tips 支持富文本 HTML 渲染并清理危险内容', () => {
    renderInProvider(
      React.createElement(FieldWrapper, {
        fieldId: 'f1',
        label: '说明',
        tips: '<p>普通说明<span style="color: rgb(239, 68, 68);" onclick="alert(1)">红色说明</span></p><script>alert(1)</script>',
        children: React.createElement('input'),
      }),
    );

    const tips = screen.getByTestId('tips-f1');
    const coloredText = tips.querySelector('span');
    expect(tips).toHaveTextContent('普通说明红色说明');
    expect(tips).not.toHaveTextContent('<p>');
    expect(coloredText?.getAttribute('style')).toContain('color');
    expect(coloredText?.getAttribute('onclick')).toBeNull();
    expect(tips.querySelector('script')).toBeNull();
  });

  it('tips 支持被转义的富文本 HTML', () => {
    renderInProvider(
      React.createElement(FieldWrapper, {
        fieldId: 'f1',
        label: '说明',
        tips: '&lt;p&gt;123&lt;span style=&quot;color: rgb(239, 68, 68);&quot;&gt;456&lt;/span&gt;&lt;/p&gt;',
        children: React.createElement('input'),
      }),
    );

    const tips = screen.getByTestId('tips-f1');
    expect(tips).toHaveTextContent('123456');
    expect(tips).not.toHaveTextContent('<p>');
    expect(tips.querySelector('span')?.getAttribute('style')).toContain('color');
  });

  it('自定义 tipsClassName', () => {
    renderInProvider(
      React.createElement(FieldWrapper, {
        fieldId: 'f1',
        label: '姓名',
        tips: '提示',
        tipsClassName: 'custom-tips',
        children: React.createElement('input'),
      }),
    );
    expect(screen.getByTestId('tips-f1').className).toBe('sy-field-tips custom-tips');
  });

  it('无 tips 不渲染 tips 元素', () => {
    renderInProvider(
      React.createElement(FieldWrapper, {
        fieldId: 'f1',
        label: '姓名',
        children: React.createElement('input'),
      }),
    );
    expect(screen.queryByTestId('tips-f1')).not.toBeInTheDocument();
  });

  it('有错误时显示错误信息，隐藏 tips', async () => {
    const schema = createSchema({
      fields: [{ fieldId: 'f1', componentName: 'Input', label: '姓名', required: true }],
    });

    const ctxRef: { current: ReturnType<typeof useFormContext> | null } = { current: null };
    const Capture = () => {
      ctxRef.current = useFormContext();
      return null;
    };

    render(
      React.createElement(
        FormProvider,
        { schema, config: createConfig(), children: null },
        React.createElement(FieldWrapper, {
          fieldId: 'f1',
          label: '姓名',
          tips: '提示',
          required: true,
          children: React.createElement('input'),
        }),
        React.createElement(Capture),
      ),
    );

    // tips visible before validation
    expect(screen.getByTestId('tips-f1')).toBeInTheDocument();

    // trigger validation
    await act(async () => {
      await ctxRef.current!.validateField('f1');
    });

    // error shows, tips hidden
    expect(screen.getByTestId('error-f1')).toHaveTextContent('姓名为必填项');
    expect(screen.queryByTestId('tips-f1')).not.toBeInTheDocument();
  });

  it('className 和 labelClassName 正确应用', () => {
    renderInProvider(
      React.createElement(FieldWrapper, {
        fieldId: 'f1',
        label: '姓名',
        className: 'wrapper-cls',
        labelClassName: 'label-cls',
        children: React.createElement('input'),
      }),
    );
    const wrapper = screen.getByText('姓名').closest('[data-field-id]');
    expect(wrapper).toHaveClass('wrapper-cls');
    expect(screen.getByText('姓名').closest('label')).toHaveClass('label-cls');
  });

  it('data-field-id 属性设置正确', () => {
    renderInProvider(
      React.createElement(FieldWrapper, {
        fieldId: 'myField',
        label: 'Field',
        children: React.createElement('input'),
      }),
    );
    expect(document.querySelector('[data-field-id="myField"]')).toBeInTheDocument();
  });
});
