import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { MultiSelectField } from './index';
import { FormProvider } from '../../core/FormProvider';
import { useFormContext } from '../../core/FormContext';
import type { FormSchema, FormEngineConfig } from '../../types';

// ---- mock defaultRegistry to prevent transitive field imports ----
vi.mock('../../core/defaultRegistry', () => ({
  defaultComponentRegistry: {},
}));

// ---- mock antd ----
vi.mock('antd', () => ({
  Tag: (props: any) => React.createElement('span', { 'data-color': props.color }, props.children),
  Select: (props: any) => {
    const { onChange, value, disabled, className, options, mode, maxCount, ...rest } = props;
    return React.createElement(
      'div',
      {
        'data-testid': rest['data-testid'],
        'data-disabled': disabled ? 'true' : undefined,
        'data-mode': mode,
        'data-maxcount': maxCount,
        className,
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
  },
}));

// ---- mock antd-mobile ----
vi.mock('antd-mobile', () => ({
  Popup: (props: any) =>
    props.visible
      ? React.createElement('div', { 'data-testid': 'mobile-popup' }, props.children)
      : null,
}));

// ---- mock useDeviceDetect ----
const mockIsMobile = vi.fn(() => false);
vi.mock('../../hooks/useDeviceDetect', () => ({
  useDeviceDetect: () => ({ isMobile: mockIsMobile() }),
}));

const options = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
  { value: 'c', label: 'Option C' },
];

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

function renderMultiSelectField(
  props: Partial<React.ComponentProps<typeof MultiSelectField>> & {
    fieldId: string;
    label: string;
  },
  opts?: { schema?: FormSchema; config?: FormEngineConfig; initialValues?: Record<string, any> },
) {
  const schema =
    opts?.schema ??
    createSchema({
      fields: [{ fieldId: props.fieldId, componentName: 'MultiSelectField', label: props.label }],
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
      React.createElement(MultiSelectField, { options, ...props } as any),
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

describe('MultiSelectField - NORMAL 态', () => {
  it('正常渲染 PC 端 Select multiple', () => {
    renderMultiSelectField({ fieldId: 'tags', label: '标签' });
    expect(screen.getByText('标签')).toBeInTheDocument();
    expect(screen.getByTestId('multiselectfield-input-tags')).toBeInTheDocument();
  });

  it('onChange 触发值变更', () => {
    const onChange = vi.fn();
    const { ctxRef } = renderMultiSelectField({ fieldId: 'tags', label: '标签', onChange });
    fireEvent.click(screen.getByTestId('option-a'));
    expect(onChange).toHaveBeenCalledWith([{ value: 'a', label: 'Option A' }]);
    expect(ctxRef.current!.formData.tags).toEqual([{ value: 'a', label: 'Option A' }]);
  });

  it('多选', () => {
    const { ctxRef } = renderMultiSelectField(
      { fieldId: 'tags', label: '标签' },
      { initialValues: { tags: [{ value: 'a', label: 'Option A' }] } },
    );
    fireEvent.click(screen.getByTestId('option-b'));
    expect(ctxRef.current!.formData.tags).toEqual([
      { value: 'a', label: 'Option A' },
      { value: 'b', label: 'Option B' },
    ]);
  });
});

describe('MultiSelectField - READONLY 态', () => {
  it('显示标签列表', () => {
    renderMultiSelectField(
      { fieldId: 'tags', label: '标签', behavior: 'READONLY' },
      {
        initialValues: {
          tags: [
            { value: 'a', label: 'Option A' },
            { value: 'b', label: 'Option B' },
          ],
        },
      },
    );
    expect(screen.getByTestId('multiselectfield-readonly-tags')).toHaveTextContent('Option A');
    expect(screen.getByTestId('multiselectfield-readonly-tags')).toHaveTextContent('Option B');
  });

  it('空值显示 "--"', () => {
    renderMultiSelectField({ fieldId: 'tags', label: '标签', behavior: 'READONLY' });
    expect(screen.getByTestId('multiselectfield-readonly-tags')).toHaveTextContent('--');
  });
});

describe('MultiSelectField - HIDDEN 态', () => {
  it('不渲染任何 DOM', () => {
    renderMultiSelectField({ fieldId: 'tags', label: '标签', behavior: 'HIDDEN' });
    expect(document.querySelector('[data-field-id="tags"]')).not.toBeInTheDocument();
  });
});

describe('MultiSelectField - DISABLED 态', () => {
  it('disabled 时不可交互', () => {
    const onChange = vi.fn();
    renderMultiSelectField({ fieldId: 'tags', label: '标签', behavior: 'DISABLED', onChange });
    fireEvent.click(screen.getByTestId('option-a'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('MultiSelectField - 数据绑定', () => {
  it('从 FormProvider 接收初始值', () => {
    renderMultiSelectField(
      { fieldId: 'tags', label: '标签' },
      { initialValues: { tags: [{ value: 'a', label: 'Option A' }] } },
    );
    expect(screen.getByTestId('option-a')).toHaveAttribute('data-selected', 'true');
  });

  it('外部 setFieldValue 更新', () => {
    const { ctxRef } = renderMultiSelectField({ fieldId: 'tags', label: '标签' });
    act(() => {
      ctxRef.current!.setFieldValue('tags', [{ value: 'b', label: 'Option B' }]);
    });
    expect(screen.getByTestId('option-b')).toHaveAttribute('data-selected', 'true');
  });

  it('defaultValue 在 mount 时设置', () => {
    const { ctxRef } = renderMultiSelectField({
      fieldId: 'tags',
      label: '标签',
      defaultValue: [{ value: 'a', label: 'Option A' }],
    });
    expect(ctxRef.current!.formData.tags).toEqual([{ value: 'a', label: 'Option A' }]);
  });

  it('defaultValue 不覆盖 initialValues', () => {
    const { ctxRef } = renderMultiSelectField(
      { fieldId: 'tags', label: '标签', defaultValue: [{ value: 'a', label: 'Option A' }] },
      { initialValues: { tags: [{ value: 'b', label: 'Option B' }] } },
    );
    expect(ctxRef.current!.formData.tags).toEqual([{ value: 'b', label: 'Option B' }]);
  });
});

describe('MultiSelectField - 校验', () => {
  it('required 空值报错', async () => {
    const schema = createSchema({
      fields: [
        { fieldId: 'tags', componentName: 'MultiSelectField', label: '标签', required: true },
      ],
    });
    const { ctxRef } = renderMultiSelectField(
      { fieldId: 'tags', label: '标签', required: true },
      { schema },
    );
    await act(async () => {
      await ctxRef.current!.validateField('tags');
    });
    expect(screen.getByTestId('error-tags')).toHaveTextContent('标签为必填项');
  });

  it('required 有值通过', async () => {
    const schema = createSchema({
      fields: [
        { fieldId: 'tags', componentName: 'MultiSelectField', label: '标签', required: true },
      ],
    });
    const { ctxRef } = renderMultiSelectField(
      { fieldId: 'tags', label: '标签', required: true },
      { schema, initialValues: { tags: [{ value: 'a', label: 'Option A' }] } },
    );
    await act(async () => {
      const result = await ctxRef.current!.validateField('tags');
      expect(result).toBe(true);
    });
  });
});

describe('MultiSelectField - 移动端', () => {
  it('isMobile 时渲染移动端触发器', () => {
    mockIsMobile.mockReturnValue(true);
    renderMultiSelectField({ fieldId: 'tags', label: '标签' });
    expect(screen.getByTestId('multiselectfield-trigger-tags')).toBeInTheDocument();
  });

  it('移动端选择', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderMultiSelectField({ fieldId: 'tags', label: '标签', onChange });
    fireEvent.click(screen.getByTestId('multiselectfield-trigger-tags'));
    expect(screen.getByTestId('multiselectfield-popup-tags')).toHaveClass(
      'sy-mobile-bottom-sheet-content',
    );
    expect(screen.queryByText(/当前已选中/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('multiselectfield-option-a'));
    expect(screen.queryByText(/当前已选中/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('确定'));
    expect(onChange).toHaveBeenCalledWith([{ value: 'a', label: 'Option A' }]);
    expect(ctxRef.current!.formData.tags).toEqual([{ value: 'a', label: 'Option A' }]);
  });

  it('移动端选择后取消不提交临时值', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderMultiSelectField({ fieldId: 'tags', label: '标签', onChange });
    fireEvent.click(screen.getByTestId('multiselectfield-trigger-tags'));
    fireEvent.click(screen.getByTestId('multiselectfield-option-a'));
    fireEvent.click(screen.getByText('取消'));

    expect(onChange).not.toHaveBeenCalled();
    expect(ctxRef.current!.formData.tags).toBeUndefined();
    expect(screen.queryByTestId('mobile-popup')).not.toBeInTheDocument();
  });

  it('移动端搜索过滤选项', () => {
    mockIsMobile.mockReturnValue(true);
    renderMultiSelectField({ fieldId: 'tags', label: '标签' });
    fireEvent.click(screen.getByTestId('multiselectfield-trigger-tags'));
    fireEvent.change(screen.getByTestId('sy-mobile-search-input'), { target: { value: 'C' } });

    expect(screen.queryByTestId('multiselectfield-option-a')).not.toBeInTheDocument();
    expect(screen.getByTestId('multiselectfield-option-c')).toBeInTheDocument();
  });

  it('移动端 maxCount 达上限后禁用未选选项', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderMultiSelectField({
      fieldId: 'tags',
      label: '标签',
      maxCount: 1,
      onChange,
    });
    fireEvent.click(screen.getByTestId('multiselectfield-trigger-tags'));
    fireEvent.click(screen.getByTestId('multiselectfield-option-a'));

    expect(screen.getByTestId('multiselectfield-option-b')).toBeDisabled();
    fireEvent.click(screen.getByTestId('multiselectfield-option-b'));
    fireEvent.click(screen.getByText('确定'));

    expect(onChange).toHaveBeenCalledWith([{ value: 'a', label: 'Option A' }]);
    expect(ctxRef.current!.formData.tags).toEqual([{ value: 'a', label: 'Option A' }]);
  });

  it('移动端清空已选值', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderMultiSelectField(
      { fieldId: 'tags', label: '标签', allowClear: true, onChange },
      { initialValues: { tags: [{ value: 'a', label: 'Option A' }] } },
    );
    fireEvent.click(screen.getByTestId('multiselectfield-trigger-tags-clear'));

    expect(onChange).toHaveBeenCalledWith([]);
    expect(ctxRef.current!.formData.tags).toEqual([]);
  });

  it('移动端 disabled', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    renderMultiSelectField({ fieldId: 'tags', label: '标签', behavior: 'DISABLED', onChange });
    fireEvent.click(screen.getByTestId('multiselectfield-trigger-tags'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByTestId('mobile-popup')).not.toBeInTheDocument();
  });
});

describe('MultiSelectField - behavior 优先级', () => {
  it('props.behavior 优先于 context', () => {
    const schema = createSchema({
      fields: [
        { fieldId: 'tags', componentName: 'MultiSelectField', label: '标签', behavior: 'DISABLED' },
      ],
    });
    renderMultiSelectField(
      { fieldId: 'tags', label: '标签', behavior: 'READONLY' },
      { schema, initialValues: { tags: [{ value: 'a', label: 'Option A' }] } },
    );
    expect(screen.getByTestId('multiselectfield-readonly-tags')).toBeInTheDocument();
  });

  it('字段不在 schema 中时默认 NORMAL', () => {
    const schema = createSchema({ fields: [] });
    renderMultiSelectField({ fieldId: 'unknown', label: '未知' }, { schema });
    expect(screen.getByTestId('multiselectfield-input-unknown')).toBeInTheDocument();
  });
});
