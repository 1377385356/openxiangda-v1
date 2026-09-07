import { describe, it, expect } from 'vitest';
import { defineFormSchema } from './defineFormSchema';
import type { FormSchema } from '../types';

describe('defineFormSchema', () => {
  it('返回与输入一致的 schema 对象', () => {
    const schema: FormSchema = {
      formMeta: {
        formUuid: 'form-001',
        appType: 'OA',
        title: '请假申请',
      },
      fields: [
        {
          fieldId: 'reason',
          componentName: 'TextField',
          label: '请假原因',
          required: true,
        },
        {
          fieldId: 'days',
          componentName: 'NumberField',
          label: '请假天数',
          required: true,
          min: 1,
          max: 30,
        },
      ],
    };

    const result = defineFormSchema(schema);

    expect(result).toBe(schema);
    expect(result).toEqual(schema);
  });

  it('处理空 fields 的 schema', () => {
    const schema: FormSchema = {
      formMeta: {
        formUuid: 'empty',
        appType: 'test',
        title: '空表单',
      },
      fields: [],
    };

    const result = defineFormSchema(schema);
    expect(result).toBe(schema);
    expect(result.fields).toHaveLength(0);
  });

  it('保留字段的所有扩展属性', () => {
    const schema = defineFormSchema({
      formMeta: {
        formUuid: 'ext',
        appType: 'test',
        title: '扩展测试',
      },
      fields: [
        {
          fieldId: 'select1',
          componentName: 'SelectField',
          label: '选择',
          options: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ],
          placeholder: '请选择',
          behavior: 'NORMAL',
          rules: [{ required: true, message: '必填' }],
        },
      ],
    });

    expect(schema.fields[0].options).toEqual([
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ]);
    expect(schema.fields[0].placeholder).toBe('请选择');
    expect(schema.fields[0].behavior).toBe('NORMAL');
    expect(schema.fields[0].rules).toHaveLength(1);
  });
});
