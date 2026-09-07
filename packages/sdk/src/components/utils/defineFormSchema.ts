import type { FormSchema } from '../types';

/**
 * 类型安全的表单 Schema 定义辅助函数
 * 提供 TypeScript 类型推导和编辑器智能提示
 */
export function defineFormSchema(schema: FormSchema): FormSchema {
  return schema;
}
