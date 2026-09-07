import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { TextAreaField } from './index';
import { FormProvider } from '../../core/FormProvider';
import { useFormContext } from '../../core/FormContext';
import type { FormSchema, FormEngineConfig } from '../../types';

// ---- mock defaultRegistry to prevent transitive field imports ----
vi.mock('../../core/defaultRegistry', () => ({
  defaultComponentRegistry: {},
}));

// ---- mock antd ----
vi.mock('antd', () => ({
  Input: {
    TextArea: (props: any) => {
      const {
        onChange,
        onBlur,
        value,
        placeholder,
        disabled,
        className,
        rows,
        maxLength,
        showCount,
        ...rest
      } = props;
      return React.createElement('textarea', {
        value: value ?? '',
        placeholder,
        disabled,
        className,
        rows,
        maxLength,
        'data-showcount': showCount ? 'true' : undefined,
        onChange,
        onBlur,
        'data-testid': rest['data-testid'],
      });
    },
  },
}));

// ---- mock antd-mobile ----
vi.mock('antd-mobile', () => ({
  TextArea: (props: any) => {
    const { onChange, onBlur, value, placeholder, disabled, rows, maxLength, showCount } = props;
    return React.createElement('textarea', {
      value: value ?? '',
      placeholder,
      disabled,
      rows,
      maxLength,
      'data-showcount': showCount ? 'true' : undefined,
      onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => onChange?.(e.target.value),
      onBlur: () => onBlur?.(),
      'data-testid': 'antd-mobile-textarea',
    });
  },
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

function renderTextAreaField(
  props: Partial<React.ComponentProps<typeof TextAreaField>> & { fieldId: string; label: string },
  opts?: { schema?: FormSchema; config?: FormEngineConfig; initialValues?: Record<string, any> },
) {
  const schema =
    opts?.schema ??
    createSchema({
      fields: [{ fieldId: props.fieldId, componentName: 'TextAreaField', label: props.label }],
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
      React.createElement(TextAreaField, props as any),
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

describe('TextAreaField - NORMAL 态', () => {
  it('正常渲染 PC 端 TextArea', () => {
    renderTextAreaField({ fieldId: 'desc', label: '描述' });
    expect(screen.getByText('描述')).toBeInTheDocument();
    expect(screen.getByTestId('textareafield-input-desc')).toBeInTheDocument();
  });

  it('onChange 触发值变更', () => {
    const onChange = vi.fn();
    const { ctxRef } = renderTextAreaField({ fieldId: 'desc', label: '描述', onChange });
    fireEvent.change(screen.getByTestId('textareafield-input-desc'), {
      target: { value: 'hello' },
    });
    expect(onChange).toHaveBeenCalledWith('hello');
    expect(ctxRef.current!.formData.desc).toBe('hello');
  });

  it('onBlur 回调触发', () => {
    const onBlur = vi.fn();
    renderTextAreaField({ fieldId: 'desc', label: '描述', onBlur });
    fireEvent.change(screen.getByTestId('textareafield-input-desc'), { target: { value: 'text' } });
    fireEvent.blur(screen.getByTestId('textareafield-input-desc'));
    expect(onBlur).toHaveBeenCalledWith('text');
  });

  it('rows 属性传递', () => {
    renderTextAreaField({ fieldId: 'desc', label: '描述', rows: 5 });
    expect(screen.getByTestId('textareafield-input-desc')).toHaveAttribute('rows', '5');
  });

  it('maxLength 属性传递', () => {
    renderTextAreaField({ fieldId: 'desc', label: '描述', maxLength: 200 });
    expect(screen.getByTestId('textareafield-input-desc')).toHaveAttribute('maxLength', '200');
  });

  it('showCount 属性传递', () => {
    renderTextAreaField({ fieldId: 'desc', label: '描述', showCount: true });
    expect(screen.getByTestId('textareafield-input-desc')).toHaveAttribute(
      'data-showcount',
      'true',
    );
  });
});

describe('TextAreaField - READONLY 态', () => {
  it('显示文本值', () => {
    renderTextAreaField(
      { fieldId: 'desc', label: '描述', behavior: 'READONLY' },
      { initialValues: { desc: '内容' } },
    );
    expect(screen.getByTestId('textareafield-readonly-desc')).toHaveTextContent('内容');
  });

  it('空值显示 "--"', () => {
    renderTextAreaField({ fieldId: 'desc', label: '描述', behavior: 'READONLY' });
    expect(screen.getByTestId('textareafield-readonly-desc')).toHaveTextContent('--');
  });

  it('保留换行', () => {
    renderTextAreaField(
      { fieldId: 'desc', label: '描述', behavior: 'READONLY' },
      { initialValues: { desc: '行1\n行2' } },
    );
    const el = screen.getByTestId('textareafield-readonly-desc');
    expect(el.style.whiteSpace).toBe('pre-wrap');
  });
});

describe('TextAreaField - HIDDEN 态', () => {
  it('不渲染任何 DOM', () => {
    renderTextAreaField({ fieldId: 'desc', label: '描述', behavior: 'HIDDEN' });
    expect(document.querySelector('[data-field-id="desc"]')).not.toBeInTheDocument();
  });
});

describe('TextAreaField - DISABLED 态', () => {
  it('TextArea 禁用', () => {
    renderTextAreaField({ fieldId: 'desc', label: '描述', behavior: 'DISABLED' });
    expect(screen.getByTestId('textareafield-input-desc')).toBeDisabled();
  });
});

describe('TextAreaField - 数据绑定', () => {
  it('从 FormProvider 接收初始值', () => {
    renderTextAreaField({ fieldId: 'desc', label: '描述' }, { initialValues: { desc: 'init' } });
    expect(screen.getByTestId('textareafield-input-desc')).toHaveValue('init');
  });

  it('外部 setFieldValue 更新显示', () => {
    const { ctxRef } = renderTextAreaField({ fieldId: 'desc', label: '描述' });
    act(() => {
      ctxRef.current!.setFieldValue('desc', 'external');
    });
    expect(screen.getByTestId('textareafield-input-desc')).toHaveValue('external');
  });

  it('defaultValue 在 mount 时设置', () => {
    const { ctxRef } = renderTextAreaField({
      fieldId: 'desc',
      label: '描述',
      defaultValue: '默认',
    });
    expect(ctxRef.current!.formData.desc).toBe('默认');
  });

  it('defaultValue 不覆盖 initialValues', () => {
    const { ctxRef } = renderTextAreaField(
      { fieldId: 'desc', label: '描述', defaultValue: '默认' },
      { initialValues: { desc: '外部' } },
    );
    expect(ctxRef.current!.formData.desc).toBe('外部');
  });
});

describe('TextAreaField - 校验', () => {
  it('required 空值报错', async () => {
    const schema = createSchema({
      fields: [{ fieldId: 'desc', componentName: 'TextAreaField', label: '描述', required: true }],
    });
    const { ctxRef } = renderTextAreaField(
      { fieldId: 'desc', label: '描述', required: true },
      { schema },
    );
    await act(async () => {
      await ctxRef.current!.validateField('desc');
    });
    expect(screen.getByTestId('error-desc')).toHaveTextContent('描述为必填项');
  });

  it('required 有值通过', async () => {
    const schema = createSchema({
      fields: [{ fieldId: 'desc', componentName: 'TextAreaField', label: '描述', required: true }],
    });
    const { ctxRef } = renderTextAreaField(
      { fieldId: 'desc', label: '描述', required: true },
      { schema, initialValues: { desc: '有值' } },
    );
    await act(async () => {
      const result = await ctxRef.current!.validateField('desc');
      expect(result).toBe(true);
    });
  });
});

describe('TextAreaField - 移动端', () => {
  it('isMobile 时渲染移动端组件', () => {
    mockIsMobile.mockReturnValue(true);
    renderTextAreaField({ fieldId: 'desc', label: '描述' });
    expect(screen.getByTestId('antd-mobile-textarea')).toBeInTheDocument();
    expect(screen.getByTestId('textareafield-input-desc')).toHaveClass('sy-mobile-line-input');
    expect(screen.getByTestId('textareafield-input-desc')).toHaveClass('sy-mobile-textarea-input');
  });

  it('移动端 onChange', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderTextAreaField({ fieldId: 'desc', label: '描述', onChange });
    fireEvent.change(screen.getByTestId('antd-mobile-textarea'), { target: { value: 'mobile' } });
    expect(onChange).toHaveBeenCalledWith('mobile');
    expect(ctxRef.current!.formData.desc).toBe('mobile');
  });

  it('移动端 disabled', () => {
    mockIsMobile.mockReturnValue(true);
    renderTextAreaField({ fieldId: 'desc', label: '描述', behavior: 'DISABLED' });
    expect(screen.getByTestId('antd-mobile-textarea')).toBeDisabled();
  });

  it('移动端 onBlur', () => {
    mockIsMobile.mockReturnValue(true);
    const onBlur = vi.fn();
    renderTextAreaField({ fieldId: 'desc', label: '描述', onBlur });
    fireEvent.change(screen.getByTestId('antd-mobile-textarea'), { target: { value: 'text' } });
    fireEvent.blur(screen.getByTestId('antd-mobile-textarea'));
    expect(onBlur).toHaveBeenCalled();
  });
});

describe('TextAreaField - behavior 优先级', () => {
  it('props.behavior 优先于 context', () => {
    const schema = createSchema({
      fields: [
        { fieldId: 'desc', componentName: 'TextAreaField', label: '描述', behavior: 'DISABLED' },
      ],
    });
    renderTextAreaField(
      { fieldId: 'desc', label: '描述', behavior: 'READONLY' },
      { schema, initialValues: { desc: 'val' } },
    );
    expect(screen.getByTestId('textareafield-readonly-desc')).toBeInTheDocument();
  });

  it('无 prop behavior 时使用 context', () => {
    const schema = createSchema({
      fields: [
        { fieldId: 'desc', componentName: 'TextAreaField', label: '描述', behavior: 'DISABLED' },
      ],
    });
    renderTextAreaField({ fieldId: 'desc', label: '描述' }, { schema });
    expect(screen.getByTestId('textareafield-input-desc')).toBeDisabled();
  });

  it('字段不在 schema 中时默认 NORMAL', () => {
    const schema = createSchema({ fields: [] });
    renderTextAreaField({ fieldId: 'unknown', label: '未知' }, { schema });
    expect(screen.getByTestId('textareafield-input-unknown')).toBeInTheDocument();
  });
});
