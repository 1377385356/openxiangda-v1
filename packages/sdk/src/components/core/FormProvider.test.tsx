import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { FormProvider } from './FormProvider';
import type { FormProviderProps } from './FormProvider';
import { useFormContext } from './FormContext';
import { useComponent } from './ComponentRegistry';
import type { FormSchema, FormEngineConfig } from '../types';

// ---- helpers ----

const createSchema = (overrides?: Partial<FormSchema>): FormSchema => ({
  formMeta: { formUuid: 'test-form', appType: 'test', title: 'Test Form' },
  fields: [],
  ...overrides,
});

const createConfig = (overrides?: Partial<FormEngineConfig>): FormEngineConfig => ({
  mode: 'submit',
  formUuid: 'test-form',
  appType: 'test',
  ...overrides,
});

/**
 * Helper: renders a FormProvider and exposes its context value via ref
 */
function renderWithProvider(
  props: Partial<FormProviderProps> & { schema?: FormSchema; config?: FormEngineConfig } = {},
) {
  const schema = props.schema ?? createSchema();
  const config = props.config ?? createConfig();
  const ctxRef: { current: ReturnType<typeof useFormContext> | null } = { current: null };

  const Consumer = () => {
    ctxRef.current = useFormContext();
    return React.createElement('div', { 'data-testid': 'consumer' }, 'ok');
  };

  const result = render(
    React.createElement(
      FormProvider,
      {
        schema,
        config,
        initialValues: props.initialValues,
        runtime: props.runtime,
        children: null,
      },
      React.createElement(Consumer),
    ),
  );

  return { ctxRef, ...result };
}

// ---- tests ----

describe('FormProvider', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // ============ 1. 初始化 ============
  describe('初始化', () => {
    it('空 schema 初始化 formData 为空对象', () => {
      const { ctxRef } = renderWithProvider();
      expect(ctxRef.current!.formData).toEqual({});
    });

    it('带默认值的 schema 初始化', () => {
      const schema = createSchema({
        fields: [
          { fieldId: 'name', componentName: 'Input', label: '姓名', defaultValue: '张三' },
          { fieldId: 'age', componentName: 'NumberInput', label: '年龄', defaultValue: 18 },
        ],
      });
      const { ctxRef } = renderWithProvider({ schema });
      expect(ctxRef.current!.formData).toEqual({ name: '张三', age: 18 });
    });

    it('合并显式 initialValues 和 schema 默认值，initialValues 优先', () => {
      const schema = createSchema({
        fields: [
          { fieldId: 'name', componentName: 'Input', label: '姓名', defaultValue: '默认' },
          { fieldId: 'city', componentName: 'Input', label: '城市', defaultValue: '北京' },
        ],
      });
      const { ctxRef } = renderWithProvider({
        schema,
        initialValues: { name: '覆盖值', extra: 'ext' },
      });
      expect(ctxRef.current!.formData).toEqual({ name: '覆盖值', city: '北京', extra: 'ext' });
    });

    it.each(['submit', 'edit', 'readonly'] as const)('mode=%s 正确传递', (mode) => {
      const { ctxRef } = renderWithProvider({ config: createConfig({ mode }) });
      expect(ctxRef.current!.mode).toBe(mode);
    });

    it('加载关联表单选项源并写入 dynamicOptions', async () => {
      const fetchFormData = vi.fn().mockResolvedValue({
        data: [{ city: '上海' }, { city: '北京' }],
      });
      const schema = createSchema({
        fields: [
          {
            fieldId: 'city',
            componentName: 'SelectField',
            label: '城市',
            options: [],
            optionSource: {
              type: 'linkedForm',
              linkedForm: {
                formUuid: 'city-form',
                fieldId: 'city',
                sortField: 'city',
                sortOrder: 'asc',
                deduplicate: true,
              },
            },
          },
        ],
      });

      const { ctxRef } = renderWithProvider({
        schema,
        runtime: { appType: 'test', fetchFormData },
      });

      await waitFor(() => {
        expect(ctxRef.current!.dynamicOptions.city).toEqual([
          { value: '上海', label: '上海' },
          { value: '北京', label: '北京' },
        ]);
      });
      expect(fetchFormData).toHaveBeenCalledWith(
        expect.objectContaining({
          formUuid: 'city-form',
          fieldId: 'city',
          deduplicate: true,
          sort: { field: 'city', order: 'asc' },
        }),
      );
    });

    it('未注入 fetchFormData 时使用运行时 advancedSearch 加载关联表单选项', async () => {
      const request = vi.fn().mockResolvedValue({
        success: true,
        result: { data: [{ city: '上海' }, { city: '北京' }], totalCount: 2 },
      });
      const schema = createSchema({
        fields: [
          {
            fieldId: 'city',
            componentName: 'SelectField',
            label: '城市',
            options: [],
            optionSource: {
              type: 'linkedForm',
              linkedForm: {
                formUuid: 'city-form',
                fieldId: 'city',
                filters: [{ fieldId: 'enabled', operator: 'eq', value: true }],
                sortField: 'city',
                sortOrder: 'desc',
              },
            },
          },
        ],
      });

      const { ctxRef } = renderWithProvider({
        schema,
        config: createConfig({ api: { request } }),
      });

      await waitFor(() => {
        expect(ctxRef.current!.dynamicOptions.city).toEqual([
          { value: '上海', label: '上海' },
          { value: '北京', label: '北京' },
        ]);
      });
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/test/v1/form/advancedSearch.json',
          method: 'get',
          params: expect.objectContaining({
            formUuid: 'city-form',
            filters: JSON.stringify([{ key: 'enabled', value: true, operator: 'EQ' }]),
            order: JSON.stringify([{ id: 'city', isAsc: 'n' }]),
          }),
        }),
      );
    });

    it('按默认值数据联动回填单选字段为 OptionItem', async () => {
      const fetchFormData = vi.fn().mockResolvedValue({
        data: [{ stage: 'won' }],
      });
      const schema = createSchema({
        fields: [
          { fieldId: 'customer', componentName: 'TextField', label: '客户', defaultValue: 'Acme' },
          {
            fieldId: 'stage',
            componentName: 'SelectField',
            label: '阶段',
            options: [
              { value: 'new', label: '新线索' },
              { value: 'won', label: '成交' },
            ],
            defaultValueLinkage: {
              formUuid: 'crm-form',
              targetFieldId: 'stage',
              conditions: [
                {
                  localFieldId: 'customer',
                  operator: 'eq',
                  remoteFieldId: 'customerName',
                },
              ],
            },
          },
        ],
      });

      const { ctxRef } = renderWithProvider({
        schema,
        runtime: { appType: 'test', fetchFormData },
      });

      await waitFor(() => {
        expect(ctxRef.current!.formData.stage).toEqual({ value: 'won', label: '成交' });
      });
      expect(fetchFormData).toHaveBeenCalledWith(
        expect.objectContaining({
          formUuid: 'crm-form',
          fieldId: 'stage',
          filters: [{ fieldId: 'customerName', operator: 'eq', value: 'Acme' }],
        }),
      );
    });

    it('解析 fixed、日期、文本和人员默认快捷值', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-16T10:20:30+08:00'));
      vi.stubGlobal('crypto', { randomUUID: () => 'uuid-1' });

      const schema = createSchema({
        fields: [
          {
            fieldId: 'fixed',
            componentName: 'TextField',
            label: '固定',
            defaultShortcut: { type: 'fixed', values: '固定值' } as any,
          },
          {
            fieldId: 'today',
            componentName: 'DateField',
            label: '今天',
            defaultShortcut: { type: 'today' } as any,
          },
          {
            fieldId: 'yesterday',
            componentName: 'DateField',
            label: '昨天',
            defaultShortcut: { type: 'yesterday' } as any,
          },
          {
            fieldId: 'tomorrow',
            componentName: 'DateField',
            label: '明天',
            defaultShortcut: { type: 'tomorrow', includeTime: true } as any,
          },
          {
            fieldId: 'pastDays',
            componentName: 'DateField',
            label: '过去',
            defaultShortcut: { type: 'pastDays', amount: 3, format: 'YYYY/MM/DD' } as any,
          },
          {
            fieldId: 'futureDays',
            componentName: 'DateField',
            label: '未来',
            defaultShortcut: { type: 'futureDays', amount: 2 } as any,
          },
          {
            fieldId: 'userName',
            componentName: 'TextField',
            label: '用户',
            defaultShortcut: { type: 'currentUserName' } as any,
          },
          {
            fieldId: 'jobNumber',
            componentName: 'TextField',
            label: '工号',
            defaultShortcut: { type: 'currentUserJobNumber' } as any,
          },
          {
            fieldId: 'deptName',
            componentName: 'TextField',
            label: '部门名',
            defaultShortcut: { type: 'currentDeptName' } as any,
          },
          {
            fieldId: 'uuid',
            componentName: 'TextField',
            label: 'UUID',
            defaultShortcut: { type: 'uuid' } as any,
          },
          {
            fieldId: 'user',
            componentName: 'UserSelectField',
            label: '当前用户',
            defaultShortcut: { type: 'currentUser' } as any,
          },
          {
            fieldId: 'dept',
            componentName: 'DepartmentSelectField',
            label: '当前部门',
            defaultShortcut: { type: 'currentDepartment' } as any,
          },
          {
            fieldId: 'manager1',
            componentName: 'UserSelectField',
            label: '上级',
            defaultShortcut: { type: 'currentUserManager' } as any,
          },
          {
            fieldId: 'manager2',
            componentName: 'UserSelectField',
            label: '二级上级',
            defaultShortcut: { type: 'currentUserManager2' } as any,
          },
          {
            fieldId: 'unknown',
            componentName: 'TextField',
            label: '未知',
            defaultShortcut: { type: 'unknown' } as any,
          },
        ],
      });

      const currentUser = { id: 'u1', name: 'Alice', jobNumber: 'E001' };
      const currentDepartment = { id: 'd1', name: '研发部' };
      const currentUserManagers = [
        { id: 'm1', name: 'Manager 1' },
        { id: 'm2', name: 'Manager 2' },
      ];
      const { ctxRef } = renderWithProvider({
        schema,
        runtime: { currentUser, currentDepartment, currentUserManagers },
      });

      expect(ctxRef.current!.formData).toEqual(
        expect.objectContaining({
          fixed: '固定值',
          today: '2026-05-16',
          yesterday: '2026-05-15',
          tomorrow: '2026-05-17 10:20:30',
          pastDays: '2026/05/13',
          futureDays: '2026-05-18',
          userName: 'Alice',
          jobNumber: 'E001',
          deptName: '研发部',
          uuid: 'uuid-1',
          user: [currentUser],
          dept: [currentDepartment],
          manager1: [currentUserManagers[0]],
          manager2: [currentUserManagers[1]],
        }),
      );
      expect(ctxRef.current!.formData.unknown).toBeUndefined();
    });

    it('解析缺失运行时数据的人员快捷值为空值', () => {
      const schema = createSchema({
        fields: [
          {
            fieldId: 'user',
            componentName: 'UserSelectField',
            label: '当前用户',
            defaultShortcut: { type: 'currentUser' } as any,
          },
          {
            fieldId: 'dept',
            componentName: 'DepartmentSelectField',
            label: '当前部门',
            defaultShortcut: { type: 'currentDepartment' } as any,
          },
          {
            fieldId: 'manager',
            componentName: 'UserSelectField',
            label: '上级',
            defaultShortcut: { type: 'currentUserManager' } as any,
          },
          {
            fieldId: 'manager2',
            componentName: 'UserSelectField',
            label: '二级上级',
            defaultShortcut: { type: 'currentUserManager2' } as any,
          },
        ],
      });

      const { ctxRef } = renderWithProvider({ schema });
      expect(ctxRef.current!.formData).toEqual({
        user: [],
        dept: [],
        manager: [],
        manager2: [],
      });
    });
  });

  // ============ 2. 字段值管理 ============
  describe('字段值管理', () => {
    it('setFieldValue 更新字段值', () => {
      const schema = createSchema({
        fields: [{ fieldId: 'name', componentName: 'Input', label: '姓名' }],
      });
      const { ctxRef } = renderWithProvider({ schema });

      act(() => {
        ctxRef.current!.setFieldValue('name', 'Alice');
      });

      expect(ctxRef.current!.formData.name).toBe('Alice');
    });

    it('getFieldValue 获取字段值', () => {
      const schema = createSchema({
        fields: [{ fieldId: 'x', componentName: 'Input', label: 'X', defaultValue: 'val' }],
      });
      const { ctxRef } = renderWithProvider({ schema });
      expect(ctxRef.current!.getFieldValue('x')).toBe('val');
    });

    it('getFieldValue 对不存在字段返回 undefined', () => {
      const { ctxRef } = renderWithProvider();
      expect(ctxRef.current!.getFieldValue('nonexistent')).toBeUndefined();
    });

    it('getFormData 返回所有表单数据的副本', () => {
      const schema = createSchema({
        fields: [{ fieldId: 'a', componentName: 'Input', label: 'A', defaultValue: 1 }],
      });
      const { ctxRef } = renderWithProvider({ schema });
      const data = ctxRef.current!.getFormData();
      expect(data).toEqual({ a: 1 });
      // 应该是副本
      expect(data).not.toBe(ctxRef.current!.formData);
    });

    it('设置值后自动清除该字段的校验错误', async () => {
      const schema = createSchema({
        fields: [{ fieldId: 'name', componentName: 'Input', label: '姓名', required: true }],
      });
      const { ctxRef } = renderWithProvider({ schema });

      // 先触发校验生成错误
      await act(async () => {
        await ctxRef.current!.validateField('name');
      });
      expect(ctxRef.current!.fieldErrors.name).toBeDefined();

      // 设值后错误应被清除
      act(() => {
        ctxRef.current!.setFieldValue('name', '有值了');
      });
      expect(ctxRef.current!.fieldErrors.name).toBeUndefined();
    });

    it('setFieldValue 对无错误的字段不修改 errors', () => {
      const schema = createSchema({
        fields: [{ fieldId: 'a', componentName: 'Input', label: 'A' }],
      });
      const { ctxRef } = renderWithProvider({ schema });

      act(() => {
        ctxRef.current!.setFieldValue('a', 'hello');
      });
      expect(ctxRef.current!.fieldErrors).toEqual({});
    });
  });

  // ============ 3. 校验功能 ============
  describe('校验功能', () => {
    it('validateField 单字段校验通过', async () => {
      const schema = createSchema({
        fields: [{ fieldId: 'name', componentName: 'Input', label: '姓名', required: true }],
      });
      const { ctxRef } = renderWithProvider({ schema, initialValues: { name: '有值' } });

      let isValid = false;
      await act(async () => {
        isValid = await ctxRef.current!.validateField('name');
      });
      expect(isValid).toBe(true);
      expect(ctxRef.current!.fieldErrors.name).toBeUndefined();
    });

    it('validateField 单字段校验失败', async () => {
      const schema = createSchema({
        fields: [{ fieldId: 'name', componentName: 'Input', label: '姓名', required: true }],
      });
      const { ctxRef } = renderWithProvider({ schema });

      let isValid = true;
      await act(async () => {
        isValid = await ctxRef.current!.validateField('name');
      });
      expect(isValid).toBe(false);
      expect(ctxRef.current!.fieldErrors.name).toBe('姓名为必填项');
    });

    it('validateField 对不存在的字段返回 true', async () => {
      const { ctxRef } = renderWithProvider();

      let isValid = false;
      await act(async () => {
        isValid = await ctxRef.current!.validateField('nonexistent');
      });
      expect(isValid).toBe(true);
    });

    it('validateField 无 rules 的字段返回 true', async () => {
      const schema = createSchema({
        fields: [{ fieldId: 'x', componentName: 'Input', label: 'X' }],
      });
      const { ctxRef } = renderWithProvider({ schema });

      let isValid = false;
      await act(async () => {
        isValid = await ctxRef.current!.validateField('x');
      });
      expect(isValid).toBe(true);
    });

    it('validateField 使用自定义 rules 校验', async () => {
      const schema = createSchema({
        fields: [
          {
            fieldId: 'age',
            componentName: 'NumberInput',
            label: '年龄',
            rules: [{ min: 0, message: '年龄不能为负数' }],
          },
        ],
      });
      const { ctxRef } = renderWithProvider({ schema, initialValues: { age: -1 } });

      let isValid = true;
      await act(async () => {
        isValid = await ctxRef.current!.validateField('age');
      });
      expect(isValid).toBe(false);
      expect(ctxRef.current!.fieldErrors.age).toBe('年龄不能为负数');
    });

    it('validateField 通过后清除已有错误', async () => {
      const schema = createSchema({
        fields: [{ fieldId: 'name', componentName: 'Input', label: '姓名', required: true }],
      });
      const { ctxRef } = renderWithProvider({ schema });

      // 先失败
      await act(async () => {
        await ctxRef.current!.validateField('name');
      });
      expect(ctxRef.current!.fieldErrors.name).toBeDefined();

      // 设值后重新校验通过
      act(() => {
        ctxRef.current!.setFieldValue('name', '有值');
      });
      await act(async () => {
        await ctxRef.current!.validateField('name');
      });
      expect(ctxRef.current!.fieldErrors.name).toBeUndefined();
    });

    it('隐藏或禁用字段校验时会清除已有错误', async () => {
      const schema = createSchema({
        fields: [
          { fieldId: 'toggle', componentName: 'Input', label: '开关' },
          { fieldId: 'name', componentName: 'Input', label: '姓名', required: true },
        ],
      });
      const config = createConfig({
        effects: [
          {
            when: { field: 'toggle', operator: 'eq', value: 'disabled' },
            then: [{ field: 'name', action: 'disable' }],
          },
        ],
      });
      const { ctxRef } = renderWithProvider({ schema, config });

      await act(async () => {
        await ctxRef.current!.validateField('name');
      });
      expect(ctxRef.current!.fieldErrors.name).toBe('姓名为必填项');

      act(() => {
        ctxRef.current!.setFieldValue('toggle', 'disabled');
      });
      await act(async () => {
        const valid = await ctxRef.current!.validateField('name');
        expect(valid).toBe(true);
      });
      expect(ctxRef.current!.fieldErrors.name).toBeUndefined();
    });

    it('validateAll 全表校验通过', async () => {
      const schema = createSchema({
        fields: [{ fieldId: 'name', componentName: 'Input', label: '姓名', required: true }],
      });
      const { ctxRef } = renderWithProvider({ schema, initialValues: { name: '有值' } });

      let isValid = false;
      await act(async () => {
        isValid = await ctxRef.current!.validateAll();
      });
      expect(isValid).toBe(true);
      expect(ctxRef.current!.fieldErrors).toEqual({});
    });

    it('validateAll 全表校验失败', async () => {
      const schema = createSchema({
        fields: [
          { fieldId: 'name', componentName: 'Input', label: '姓名', required: true },
          { fieldId: 'age', componentName: 'NumberInput', label: '年龄', rules: [{ min: 0 }] },
        ],
      });
      const { ctxRef } = renderWithProvider({ schema, initialValues: { age: -1 } });

      let isValid = true;
      await act(async () => {
        isValid = await ctxRef.current!.validateAll();
      });
      expect(isValid).toBe(false);
      expect(ctxRef.current!.fieldErrors.name).toBe('姓名为必填项');
      expect(ctxRef.current!.fieldErrors.age).toBe('不能小于 0');
    });

    it('校验错误信息通过 context 传递给子组件', async () => {
      const schema = createSchema({
        fields: [{ fieldId: 'name', componentName: 'Input', label: '姓名', required: true }],
      });

      const ErrorDisplay = () => {
        const ctx = useFormContext();
        return React.createElement('span', { 'data-testid': 'error' }, ctx.fieldErrors.name || '');
      };

      render(
        React.createElement(
          FormProvider,
          { schema, config: createConfig(), children: null },
          React.createElement(ErrorDisplay),
        ),
      );

      expect(screen.getByTestId('error').textContent).toBe('');

      // 需要通过 context 触发校验 – 用 renderWithProvider 来获取 ctx
      const { ctxRef } = renderWithProvider({ schema });
      await act(async () => {
        await ctxRef.current!.validateAll();
      });
      expect(ctxRef.current!.fieldErrors.name).toBe('姓名为必填项');
    });

    it('required 和 rules 同时存在时都被检查', async () => {
      const schema = createSchema({
        fields: [
          {
            fieldId: 'name',
            componentName: 'Input',
            label: '姓名',
            required: true,
            rules: [{ min: 2, message: '至少2个字符' }],
          },
        ],
      });

      // required 先触发
      const { ctxRef: ctxRef1 } = renderWithProvider({ schema });
      await act(async () => {
        await ctxRef1.current!.validateField('name');
      });
      expect(ctxRef1.current!.fieldErrors.name).toBe('姓名为必填项');

      // 值存在但太短 → min 触发
      const { ctxRef: ctxRef2 } = renderWithProvider({ schema, initialValues: { name: 'a' } });
      await act(async () => {
        await ctxRef2.current!.validateField('name');
      });
      expect(ctxRef2.current!.fieldErrors.name).toBe('至少2个字符');
    });
  });

  // ============ 4. 行为计算 ============
  describe('行为计算', () => {
    it('默认行为为 NORMAL', () => {
      const schema = createSchema({
        fields: [{ fieldId: 'name', componentName: 'Input', label: '姓名' }],
      });
      const { ctxRef } = renderWithProvider({ schema });
      expect(ctxRef.current!.fieldBehaviors.name).toBe('NORMAL');
    });

    it('使用 schema 中字段的 behavior 属性', () => {
      const schema = createSchema({
        fields: [
          { fieldId: 'secret', componentName: 'Input', label: 'Secret', behavior: 'HIDDEN' },
        ],
      });
      const { ctxRef } = renderWithProvider({ schema });
      expect(ctxRef.current!.fieldBehaviors.secret).toBe('HIDDEN');
    });

    it('effects 联动修改行为', () => {
      const schema = createSchema({
        fields: [
          { fieldId: 'type', componentName: 'Select', label: '类型', defaultValue: 'special' },
          { fieldId: 'detail', componentName: 'Input', label: '详情' },
        ],
      });
      const config = createConfig({
        effects: [
          {
            when: { field: 'type', operator: 'eq', value: 'special' },
            then: [{ field: 'detail', action: 'hide' }],
          },
        ],
      });
      const { ctxRef } = renderWithProvider({ schema, config });
      expect(ctxRef.current!.fieldBehaviors.detail).toBe('HIDDEN');
    });

    it('permissions 覆盖 effects', () => {
      const schema = createSchema({
        fields: [
          { fieldId: 'type', componentName: 'Select', label: '类型', defaultValue: 'special' },
          { fieldId: 'detail', componentName: 'Input', label: '详情' },
        ],
      });
      const config = createConfig({
        effects: [
          {
            when: { field: 'type', operator: 'eq', value: 'special' },
            then: [{ field: 'detail', action: 'hide' }],
          },
        ],
        permissions: {
          fieldPermissions: { detail: 'NORMAL' },
          operations: [],
        },
      });
      const { ctxRef } = renderWithProvider({ schema, config });
      expect(ctxRef.current!.fieldBehaviors.detail).toBe('NORMAL');
    });

    it('readonly 模式下所有非 HIDDEN 字段为 READONLY', () => {
      const schema = createSchema({
        fields: [
          { fieldId: 'name', componentName: 'Input', label: '姓名' },
          { fieldId: 'secret', componentName: 'Input', label: 'Secret', behavior: 'HIDDEN' },
        ],
      });
      const config = createConfig({ mode: 'readonly' });
      const { ctxRef } = renderWithProvider({ schema, config });
      expect(ctxRef.current!.fieldBehaviors.name).toBe('READONLY');
      expect(ctxRef.current!.fieldBehaviors.secret).toBe('HIDDEN');
    });

    it('无 effects 时直接使用 base behaviors', () => {
      const schema = createSchema({
        fields: [
          { fieldId: 'a', componentName: 'Input', label: 'A', behavior: 'DISABLED' },
          { fieldId: 'b', componentName: 'Input', label: 'B' },
        ],
      });
      const config = createConfig({ effects: undefined });
      const { ctxRef } = renderWithProvider({ schema, config });
      expect(ctxRef.current!.fieldBehaviors.a).toBe('DISABLED');
      expect(ctxRef.current!.fieldBehaviors.b).toBe('NORMAL');
    });

    it('空 effects 数组不影响行为', () => {
      const schema = createSchema({
        fields: [{ fieldId: 'a', componentName: 'Input', label: 'A' }],
      });
      const config = createConfig({ effects: [] });
      const { ctxRef } = renderWithProvider({ schema, config });
      expect(ctxRef.current!.fieldBehaviors.a).toBe('NORMAL');
    });
  });

  // ============ 5. 表单重置 ============
  describe('表单重置', () => {
    it('resetForm 恢复到初始值', () => {
      const schema = createSchema({
        fields: [{ fieldId: 'name', componentName: 'Input', label: '姓名', defaultValue: '初始' }],
      });
      const { ctxRef } = renderWithProvider({ schema });

      act(() => {
        ctxRef.current!.setFieldValue('name', '已修改');
      });
      expect(ctxRef.current!.formData.name).toBe('已修改');

      act(() => {
        ctxRef.current!.resetForm();
      });
      expect(ctxRef.current!.formData.name).toBe('初始');
    });

    it('重置后清除所有错误', async () => {
      const schema = createSchema({
        fields: [{ fieldId: 'name', componentName: 'Input', label: '姓名', required: true }],
      });
      const { ctxRef } = renderWithProvider({ schema });

      await act(async () => {
        await ctxRef.current!.validateAll();
      });
      expect(Object.keys(ctxRef.current!.fieldErrors).length).toBeGreaterThan(0);

      act(() => {
        ctxRef.current!.resetForm();
      });
      expect(ctxRef.current!.fieldErrors).toEqual({});
    });

    it('resetForm 恢复到合并后的初始值（含 initialValues）', () => {
      const schema = createSchema({
        fields: [
          { fieldId: 'a', componentName: 'Input', label: 'A', defaultValue: '默认' },
          { fieldId: 'b', componentName: 'Input', label: 'B' },
        ],
      });
      const { ctxRef } = renderWithProvider({ schema, initialValues: { b: '外部值' } });

      act(() => {
        ctxRef.current!.setFieldValue('a', 'changed-a');
        ctxRef.current!.setFieldValue('b', 'changed-b');
      });

      act(() => {
        ctxRef.current!.resetForm();
      });
      expect(ctxRef.current!.formData).toEqual({ a: '默认', b: '外部值' });
    });
  });

  // ============ 6. Context 传递 ============
  describe('Context 传递', () => {
    it('merges component overrides with the built-in registry', () => {
      const CustomJsonField = () => React.createElement('div');
      const RegistryProbe = () => {
        const TextField = useComponent('TextField');
        const JSONField = useComponent('JSONField');
        return React.createElement('span', {
          'data-testid': 'registry-probe',
          'data-has-text': Boolean(TextField),
          'data-custom-json': JSONField === CustomJsonField,
        });
      };

      render(
        React.createElement(
          FormProvider,
          {
            schema: createSchema(),
            config: createConfig(),
            components: { JSONField: CustomJsonField },
          },
          React.createElement(RegistryProbe),
        ),
      );

      expect(screen.getByTestId('registry-probe')).toHaveAttribute('data-has-text', 'true');
      expect(screen.getByTestId('registry-probe')).toHaveAttribute('data-custom-json', 'true');
    });

    it('子组件能通过 useFormContext 获取所有接口', () => {
      const schema = createSchema({
        fields: [{ fieldId: 'name', componentName: 'Input', label: '姓名' }],
      });
      const { ctxRef } = renderWithProvider({ schema });

      const ctx = ctxRef.current!;
      expect(ctx.mode).toBe('submit');
      expect(ctx.schema).toBe(schema);
      expect(ctx.formData).toBeDefined();
      expect(ctx.fieldErrors).toBeDefined();
      expect(ctx.fieldBehaviors).toBeDefined();
      expect(typeof ctx.setFieldValue).toBe('function');
      expect(typeof ctx.getFieldValue).toBe('function');
      expect(typeof ctx.getFormData).toBe('function');
      expect(typeof ctx.validateField).toBe('function');
      expect(typeof ctx.validateAll).toBe('function');
      expect(typeof ctx.resetForm).toBe('function');
      expect(typeof ctx.registerField).toBe('function');
      expect(typeof ctx.unregisterField).toBe('function');
    });

    it('Provider 外使用 useFormContext 抛错', () => {
      expect(() => {
        renderHook(() => useFormContext());
      }).toThrow('useFormContext must be used within a FormProvider');
    });

    it('schema 通过 context 正确传递', () => {
      const schema = createSchema({
        fields: [{ fieldId: 'x', componentName: 'Input', label: 'X' }],
      });
      const { ctxRef } = renderWithProvider({ schema });
      expect(ctxRef.current!.schema).toEqual(schema);
    });
  });

  // ============ 7. registerField / unregisterField ============
  describe('registerField / unregisterField', () => {
    it('registerField 和 unregisterField 可正常调用', () => {
      const schema = createSchema({
        fields: [{ fieldId: 'name', componentName: 'Input', label: '姓名' }],
      });
      const { ctxRef } = renderWithProvider({ schema });

      // 不应抛错
      act(() => {
        ctxRef.current!.registerField('name');
      });
      act(() => {
        ctxRef.current!.unregisterField('name');
      });
    });
  });

  // ============ 8. effects 联动随值变化 ============
  describe('effects 联动随值变化', () => {
    it('setFieldValue 改变触发字段后行为重新计算', () => {
      const schema = createSchema({
        fields: [
          { fieldId: 'type', componentName: 'Select', label: '类型' },
          { fieldId: 'detail', componentName: 'Input', label: '详情' },
        ],
      });
      const config = createConfig({
        effects: [
          {
            when: { field: 'type', operator: 'eq', value: 'show' },
            then: [{ field: 'detail', action: 'show' }],
          },
          {
            when: { field: 'type', operator: 'eq', value: 'hide' },
            then: [{ field: 'detail', action: 'hide' }],
          },
        ],
      });
      const { ctxRef } = renderWithProvider({ schema, config });
      expect(ctxRef.current!.fieldBehaviors.detail).toBe('NORMAL');

      act(() => {
        ctxRef.current!.setFieldValue('type', 'hide');
      });
      expect(ctxRef.current!.fieldBehaviors.detail).toBe('HIDDEN');

      act(() => {
        ctxRef.current!.setFieldValue('type', 'show');
      });
      expect(ctxRef.current!.fieldBehaviors.detail).toBe('NORMAL');
    });

    it('执行 setValue 和 clearValue 联动动作并清理字段错误', async () => {
      const schema = createSchema({
        fields: [
          { fieldId: 'trigger', componentName: 'Input', label: '触发器' },
          { fieldId: 'target', componentName: 'Input', label: '目标', required: true },
          { fieldId: 'note', componentName: 'Input', label: '备注' },
        ],
      });
      const config = createConfig({
        effects: [
          {
            when: { field: 'trigger', operator: 'eq', value: 'apply' },
            then: [
              { field: 'target', action: 'setValue', value: { nested: true } },
              { field: 'note', action: 'clearValue' },
            ],
          },
        ],
      });
      const { ctxRef } = renderWithProvider({
        schema,
        config,
        initialValues: { note: 'will-clear' },
      });

      await act(async () => {
        await ctxRef.current!.validateField('target');
      });
      expect(ctxRef.current!.fieldErrors.target).toBe('目标为必填项');

      act(() => {
        ctxRef.current!.setFieldValue('trigger', 'apply');
      });

      await waitFor(() => {
        expect(ctxRef.current!.formData.target).toEqual({ nested: true });
        expect(ctxRef.current!.formData.note).toBeUndefined();
        expect(ctxRef.current!.fieldErrors.target).toBeUndefined();
      });
    });

    it('加载数据联动选项并跳过空条件值', async () => {
      const fetchFormData = vi.fn().mockResolvedValue({
        data: [{ city: '杭州' }],
      });
      const schema = createSchema({
        fields: [
          { fieldId: 'province', componentName: 'TextField', label: '省份' },
          {
            fieldId: 'city',
            componentName: 'SelectField',
            label: '城市',
            options: [],
            optionSource: {
              type: 'dataLinkage',
              dataLinkage: {
                formUuid: 'city-form',
                targetFieldId: 'city',
                conditions: [
                  { localFieldId: 'province', remoteFieldId: 'province', operator: 'eq' },
                ],
              },
            },
          },
        ],
      });

      const { ctxRef } = renderWithProvider({
        schema,
        runtime: { appType: 'test', fetchFormData },
      });
      expect(fetchFormData).not.toHaveBeenCalled();

      act(() => {
        ctxRef.current!.setFieldValue('province', '浙江');
      });

      await waitFor(() => {
        expect(ctxRef.current!.dynamicOptions.city).toEqual([{ value: '杭州', label: '杭州' }]);
      });
      expect(fetchFormData).toHaveBeenCalledWith(
        expect.objectContaining({
          formUuid: 'city-form',
          filters: [{ fieldId: 'province', operator: 'eq', value: '浙江' }],
        }),
      );
    });

    it('防抖加载数据联动选项并只使用最后一次条件值', async () => {
      vi.useFakeTimers();
      const fetchFormData = vi.fn().mockResolvedValue({
        data: [{ city: '上海' }],
      });
      const schema = createSchema({
        fields: [
          { fieldId: 'province', componentName: 'TextField', label: '省份' },
          {
            fieldId: 'city',
            componentName: 'SelectField',
            label: '城市',
            options: [],
            optionSource: {
              type: 'dataLinkage',
              dataLinkage: {
                formUuid: 'city-form',
                targetFieldId: 'city',
                conditions: [
                  { localFieldId: 'province', remoteFieldId: 'province', operator: 'eq' },
                ],
              },
            },
          },
        ],
      });

      const { ctxRef } = renderWithProvider({
        schema,
        runtime: { appType: 'test', fetchFormData },
      });

      act(() => {
        ctxRef.current!.setFieldValue('province', '浙江');
        ctxRef.current!.setFieldValue('province', '江苏');
        ctxRef.current!.setFieldValue('province', '上海');
      });
      expect(fetchFormData).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(500);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(fetchFormData).toHaveBeenCalledTimes(1);
      expect(fetchFormData).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: [{ fieldId: 'province', operator: 'eq', value: '上海' }],
        }),
      );
      expect(ctxRef.current!.dynamicOptions.city).toEqual([{ value: '上海', label: '上海' }]);
    });

    it('默认值联动支持普通字段和未匹配选项值', async () => {
      const fetchFormData = vi.fn((params: any) =>
        Promise.resolve({
          data: [params.fieldId === 'stage' ? { stage: 'unknown' } : { owner: 'Alice' }],
        }),
      );
      const schema = createSchema({
        fields: [
          { fieldId: 'customer', componentName: 'TextField', label: '客户', defaultValue: 'Acme' },
          {
            fieldId: 'stage',
            componentName: 'RadioField',
            label: '阶段',
            options: [{ value: 'known', label: '已知' }],
            defaultValueLinkage: {
              formUuid: 'crm-form',
              targetFieldId: 'stage',
              conditions: [
                { localFieldId: 'customer', operator: 'eq', remoteFieldId: 'customerName' },
              ],
            },
          },
          {
            fieldId: 'owner',
            componentName: 'TextField',
            label: '负责人',
            defaultValueLinkage: {
              formUuid: 'crm-form',
              targetFieldId: 'owner',
              conditions: [
                { localFieldId: 'customer', operator: 'eq', remoteFieldId: 'customerName' },
              ],
            },
          },
        ],
      });

      const { ctxRef } = renderWithProvider({
        schema,
        runtime: { appType: 'test', fetchFormData },
      });

      await waitFor(() => {
        expect(ctxRef.current!.formData.stage).toEqual({ label: 'unknown', value: 'unknown' });
        expect(ctxRef.current!.formData.owner).toBe('Alice');
      });
    });
  });
});
