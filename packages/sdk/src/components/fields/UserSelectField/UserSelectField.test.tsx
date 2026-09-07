import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';
import { UserSelectField } from './index';
import { FormProvider } from '../../core/FormProvider';
import { useFormContext } from '../../core/FormContext';
import type { FormSchema, FormEngineConfig } from '../../types';

vi.mock('../../core/defaultRegistry', () => ({
  defaultComponentRegistry: {},
}));

const mobileMock = vi.hoisted(() => ({
  hasPopup: false,
}));

vi.mock('antd', () => ({
  Select: (props: any) => {
    const { value, options, disabled, onChange, onSearch, mode, placeholder, ...rest } = props;
    return React.createElement(
      'div',
      {},
      React.createElement(
        'select',
        {
          'data-testid': rest['data-testid'],
          multiple: mode === 'multiple',
          disabled,
          value: mode === 'multiple' ? (Array.isArray(value) ? value : []) : (value ?? ''),
          onChange: (e: any) => {
            if (mode === 'multiple') {
              onChange?.([e.target.value]);
            } else {
              onChange?.(e.target.value);
            }
          },
        },
        React.createElement('option', { value: '' }, placeholder || ''),
        ...(options || []).map((opt: any) =>
          React.createElement('option', { key: opt.value, value: opt.value }, opt.label),
        ),
      ),
      props.showSearch
        ? React.createElement(
            'button',
            {
              type: 'button',
              'data-testid': `${rest['data-testid']}-search`,
              onClick: () => onSearch?.('李'),
            },
            'search',
          )
        : null,
      props.notFoundContent
        ? React.createElement(
            'span',
            { 'data-testid': `${rest['data-testid']}-empty` },
            props.notFoundContent,
          )
        : null,
    );
  },
}));

vi.mock('antd-mobile', () => ({
  get Popup() {
    return mobileMock.hasPopup
      ? (props: any) =>
          props.visible || props.open
            ? React.createElement('div', { 'data-testid': 'mobile-popup' }, props.children)
            : null
      : undefined;
  },
}));

vi.mock('../shared/UserPicker', () => ({
  UserPicker: (props: any) =>
    props.open
      ? React.createElement(
          'div',
          {
            'data-testid': 'mock-user-picker',
            'data-mobile': String(Boolean(props.mobile)),
          },
          React.createElement(
            'button',
            {
              type: 'button',
              'data-testid': 'mock-user-picker-confirm',
              onClick: () =>
                props.onConfirm?.([
                  { id: 'u9', name: '赵六' },
                  { id: 'u10', name: '钱七' },
                ]),
            },
            'confirm',
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              'data-testid': 'mock-user-picker-cancel',
              onClick: () => props.onCancel?.(),
            },
            'cancel',
          ),
        )
      : null,
}));

const mockIsMobile = vi.fn(() => false);
vi.mock('../../hooks/useDeviceDetect', () => ({
  useDeviceDetect: () => ({ isMobile: mockIsMobile() }),
}));

const testUsers = [
  { id: 'u1', name: '张三', avatar: 'http://a.com/u1.png' },
  { id: 'u2', name: '李四', avatar: 'http://a.com/u2.png' },
  { id: 'u3', name: '王五' },
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

interface RenderOptions {
  schema?: FormSchema;
  config?: FormEngineConfig;
  initialValues?: Record<string, any>;
}

function renderField(
  props: Partial<React.ComponentProps<typeof UserSelectField>> & { fieldId: string; label: string },
  opts?: RenderOptions,
) {
  const schema =
    opts?.schema ??
    createSchema({
      fields: [{ fieldId: props.fieldId, componentName: 'UserSelectField', label: props.label }],
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
      React.createElement(UserSelectField, props as any),
      React.createElement(Capture),
    ),
  );
  return { ...result, ctxRef };
}

beforeEach(() => {
  mockIsMobile.mockReturnValue(false);
  mobileMock.hasPopup = false;
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('UserSelectField - NORMAL 态', () => {
  it('正常渲染 PC 端选择器', () => {
    renderField({ fieldId: 'users', label: '人员', dataSource: testUsers });
    expect(screen.getByText('人员')).toBeInTheDocument();
    expect(screen.getByTestId('userselectfield-input-users')).toBeInTheDocument();
  });

  it('选择用户触发值变更', () => {
    const onChange = vi.fn();
    const { ctxRef } = renderField({
      fieldId: 'users',
      label: '人员',
      dataSource: testUsers,
      onChange,
    });
    fireEvent.change(screen.getByTestId('userselectfield-input-users'), {
      target: { value: 'u1' },
    });
    expect(onChange).toHaveBeenCalled();
    expect(ctxRef.current!.formData.users).toBeDefined();
  });

  it('PC 端远程加载和搜索用户', async () => {
    const getUserList = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'u4', name: '初始成员' }])
      .mockResolvedValueOnce([{ id: 'u5', name: '李搜索' }]);
    const { ctxRef } = renderField(
      {
        fieldId: 'users',
        label: '人员',
      },
      { config: createConfig({ api: { getUserList } }) },
    );

    await waitFor(() => expect(getUserList).toHaveBeenCalledWith(undefined));
    await waitFor(() => expect(screen.getByText('初始成员')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('userselectfield-input-users-search'));

    await waitFor(() =>
      expect(getUserList).toHaveBeenLastCalledWith({ name: '李', username: '李' }),
    );
    await waitFor(() => expect(screen.getByText('李搜索')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('userselectfield-input-users'), {
      target: { value: 'u5' },
    });

    expect(ctxRef.current!.formData.users).toEqual([{ id: 'u5', name: '李搜索' }]);
  });

  it('PC 端弹窗确认选择并按单选截断', () => {
    const onChange = vi.fn();
    const { ctxRef } = renderField({
      fieldId: 'users',
      label: '人员',
      dataSource: testUsers,
      multiple: false,
      onChange,
    });

    fireEvent.click(screen.getByTestId('userselectfield-picker-trigger-users'));
    expect(screen.getByTestId('mock-user-picker')).toHaveAttribute('data-mobile', 'false');
    fireEvent.click(screen.getByTestId('mock-user-picker-confirm'));

    expect(ctxRef.current!.formData.users).toEqual([{ id: 'u9', name: '赵六' }]);
    expect(onChange).toHaveBeenCalledWith([{ id: 'u9', name: '赵六' }]);
  });

  it('单选模式', () => {
    const onChange = vi.fn();
    const { ctxRef } = renderField({
      fieldId: 'users',
      label: '人员',
      dataSource: testUsers,
      multiple: false,
      onChange,
    });
    fireEvent.change(screen.getByTestId('userselectfield-input-users'), {
      target: { value: 'u1' },
    });
    expect(ctxRef.current!.formData.users).toEqual([
      { id: 'u1', name: '张三', avatar: 'http://a.com/u1.png' },
    ]);
  });

  it('required 显示 * 标记', () => {
    renderField({ fieldId: 'users', label: '人员', dataSource: testUsers, required: true });
    expect(screen.getByText('*')).toBeInTheDocument();
  });
});

describe('UserSelectField - READONLY 态', () => {
  it('空值显示 "--"', () => {
    renderField({ fieldId: 'users', label: '人员', dataSource: testUsers, behavior: 'READONLY' });
    expect(screen.getByTestId('userselectfield-readonly-users')).toHaveTextContent('--');
  });

  it('显示用户名列表', () => {
    const users = [
      { id: 'u1', name: '张三' },
      { id: 'u2', name: '李四' },
    ];
    renderField(
      { fieldId: 'users', label: '人员', dataSource: testUsers, behavior: 'READONLY' },
      { initialValues: { users } },
    );
    expect(screen.getByTestId('userselectfield-readonly-users')).toHaveTextContent('张三, 李四');
  });
});

describe('UserSelectField - HIDDEN 态', () => {
  it('不渲染任何 DOM', () => {
    renderField({ fieldId: 'users', label: '人员', dataSource: testUsers, behavior: 'HIDDEN' });
    expect(document.querySelector('[data-field-id="users"]')).not.toBeInTheDocument();
  });
});

describe('UserSelectField - DISABLED 态', () => {
  it('选择器禁用', () => {
    renderField({ fieldId: 'users', label: '人员', dataSource: testUsers, behavior: 'DISABLED' });
    expect(screen.getByTestId('userselectfield-input-users')).toBeDisabled();
  });
});

describe('UserSelectField - 数据绑定', () => {
  it('从 FormProvider 接收初始值', () => {
    const users = [{ id: 'u1', name: '张三' }];
    const { ctxRef } = renderField(
      { fieldId: 'users', label: '人员', dataSource: testUsers },
      { initialValues: { users } },
    );
    expect(ctxRef.current!.formData.users).toEqual(users);
  });

  it('外部 setFieldValue 更新', () => {
    const { ctxRef } = renderField({ fieldId: 'users', label: '人员', dataSource: testUsers });
    act(() => {
      ctxRef.current!.setFieldValue('users', [{ id: 'u2', name: '李四' }]);
    });
    expect(ctxRef.current!.formData.users).toEqual([{ id: 'u2', name: '李四' }]);
  });

  it('defaultValue 在 mount 时设置', () => {
    const def = [{ id: 'u1', name: '张三' }];
    const { ctxRef } = renderField({
      fieldId: 'users',
      label: '人员',
      dataSource: testUsers,
      defaultValue: def,
    });
    expect(ctxRef.current!.formData.users).toEqual(def);
  });

  it('context behavior 覆盖', () => {
    const schema = createSchema({
      fields: [
        { fieldId: 'users', componentName: 'UserSelectField', label: '人员', behavior: 'DISABLED' },
      ],
    });
    renderField({ fieldId: 'users', label: '人员', dataSource: testUsers }, { schema });
    expect(screen.getByTestId('userselectfield-input-users')).toBeDisabled();
  });

  it('字段不在 schema 中时默认 NORMAL', () => {
    const schema = createSchema({ fields: [] });
    renderField({ fieldId: 'users', label: '人员', dataSource: testUsers }, { schema });
    expect(screen.getByTestId('userselectfield-input-users')).not.toBeDisabled();
  });
});

describe('UserSelectField - 移动端', () => {
  it('isMobile 时渲染移动端组件', () => {
    mockIsMobile.mockReturnValue(true);
    renderField({ fieldId: 'users', label: '人员', dataSource: testUsers });
    expect(screen.getByTestId('userselectfield-mobile-users')).toBeInTheDocument();
    expect(screen.getByTestId('userselectfield-mobile-trigger-users')).toHaveClass(
      'sy-mobile-field-trigger',
    );
    expect(screen.getByTestId('userselectfield-mobile-trigger-users')).toHaveTextContent('请选择');
  });

  it('移动端选择用户', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    renderField({ fieldId: 'users', label: '人员', dataSource: testUsers, onChange });
    fireEvent.click(screen.getByTestId('userselectfield-mobile-trigger-users'));
    fireEvent.click(screen.getByTestId('userselectfield-mobile-option-u1'));
    expect(onChange).toHaveBeenCalled();
  });

  it('移动端多选切换', () => {
    mockIsMobile.mockReturnValue(true);
    const { ctxRef } = renderField({
      fieldId: 'users',
      label: '人员',
      dataSource: testUsers,
      multiple: true,
    });
    fireEvent.click(screen.getByTestId('userselectfield-mobile-trigger-users'));
    fireEvent.click(screen.getByTestId('userselectfield-mobile-option-u1'));
    fireEvent.click(screen.getByTestId('userselectfield-mobile-option-u2'));
    expect(ctxRef.current!.formData.users).toHaveLength(2);
    // Deselect
    fireEvent.click(screen.getByTestId('userselectfield-mobile-option-u1'));
    expect(ctxRef.current!.formData.users).toHaveLength(1);
  });

  it('移动端单选模式', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderField({
      fieldId: 'users',
      label: '人员',
      dataSource: testUsers,
      multiple: false,
      onChange,
    });
    fireEvent.click(screen.getByTestId('userselectfield-mobile-trigger-users'));
    fireEvent.click(screen.getByTestId('userselectfield-mobile-option-u1'));
    expect(ctxRef.current!.formData.users).toEqual([
      { id: 'u1', name: '张三', avatar: 'http://a.com/u1.png' },
    ]);
    // In single-select mode, picker should close after selection
    expect(screen.queryByTestId('userselectfield-mobile-list-users')).not.toBeInTheDocument();
  });

  it('移动端无本地数据时远程加载后选择', async () => {
    mockIsMobile.mockReturnValue(true);
    const getUserList = vi.fn().mockResolvedValue(testUsers);
    const { ctxRef } = renderField(
      { fieldId: 'users', label: '人员' },
      { config: createConfig({ api: { getUserList } }) },
    );

    fireEvent.click(screen.getByTestId('userselectfield-mobile-trigger-users'));

    await waitFor(() => expect(getUserList).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('userselectfield-mobile-option-u1')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId('userselectfield-mobile-option-u1'));
    expect(ctxRef.current!.formData.users).toEqual([
      { id: 'u1', name: '张三', avatar: 'http://a.com/u1.png' },
    ]);
  });

  it('移动端存在 Popup 时使用通讯录选择器确认', () => {
    mockIsMobile.mockReturnValue(true);
    mobileMock.hasPopup = true;
    const onChange = vi.fn();
    const { ctxRef } = renderField({
      fieldId: 'users',
      label: '人员',
      dataSource: testUsers,
      maxCount: 1,
      onChange,
    });

    fireEvent.click(screen.getByTestId('userselectfield-mobile-trigger-users'));
    expect(screen.getByTestId('mock-user-picker')).toHaveAttribute('data-mobile', 'true');
    fireEvent.click(screen.getByTestId('mock-user-picker-confirm'));

    expect(ctxRef.current!.formData.users).toEqual([{ id: 'u9', name: '赵六' }]);
    expect(onChange).toHaveBeenCalledWith([{ id: 'u9', name: '赵六' }]);
    expect(screen.queryByTestId('mock-user-picker')).not.toBeInTheDocument();
  });

  it('移动端 disabled', () => {
    mockIsMobile.mockReturnValue(true);
    renderField({ fieldId: 'users', label: '人员', dataSource: testUsers, behavior: 'DISABLED' });
    expect(screen.getByTestId('userselectfield-mobile-trigger-users')).toBeDisabled();
  });

  it('移动端支持统一触发行清空已选成员', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const { ctxRef } = renderField(
      { fieldId: 'users', label: '人员', dataSource: testUsers, onChange },
      { initialValues: { users: [{ id: 'u1', name: '张三' }] } },
    );

    expect(screen.getByTestId('userselectfield-mobile-trigger-users')).toHaveClass(
      'sy-mobile-field-trigger',
    );
    fireEvent.click(screen.getByTestId('userselectfield-mobile-trigger-users-clear'));

    expect(ctxRef.current!.formData.users).toEqual([]);
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
