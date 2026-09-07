import type { ValidationPreset, ValidationRule } from '../types';

/**
 * 预设校验规则常量
 */
export const VALIDATION_PRESETS: Record<ValidationPreset, { pattern: RegExp; message: string }> = {
  phone: {
    pattern: /^1[3-9]\d{9}$/,
    message: '请输入正确的手机号码',
  },
  idCard: {
    pattern: /^[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/,
    message: '请输入正确的身份证号码',
  },
  email: {
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    message: '请输入正确的邮箱地址',
  },
  url: {
    pattern: /^https?:\/\/.+/,
    message: '请输入正确的URL地址',
  },
  bankCard: {
    pattern: /^\d{16,19}$/,
    message: '请输入正确的银行卡号',
  },
};

/**
 * Validate a single field value against its rules.
 * Returns the first error message encountered, or null if valid.
 */
export async function validateField(value: any, rules: ValidationRule[]): Promise<string | null> {
  for (const rule of rules) {
    // Required check
    if (rule.required) {
      const isEmpty =
        value === null ||
        value === undefined ||
        value === '' ||
        (Array.isArray(value) && value.length === 0);
      if (isEmpty) {
        return rule.message || '此字段为必填项';
      }
    }

    // Skip further checks if value is empty and not required
    if (value === null || value === undefined || value === '') {
      continue;
    }

    // Min check
    if (rule.min !== undefined) {
      if (typeof value === 'string' && value.length < rule.min) {
        return rule.message || `最少输入 ${rule.min} 个字符`;
      }
      if (typeof value === 'number' && value < rule.min) {
        return rule.message || `不能小于 ${rule.min}`;
      }
    }

    // Max check
    if (rule.max !== undefined) {
      if (typeof value === 'string' && value.length > rule.max) {
        return rule.message || `最多输入 ${rule.max} 个字符`;
      }
      if (typeof value === 'number' && value > rule.max) {
        return rule.message || `不能大于 ${rule.max}`;
      }
    }

    // Pattern check
    if (rule.pattern !== undefined) {
      const regex = typeof rule.pattern === 'string' ? new RegExp(rule.pattern) : rule.pattern;
      if (!regex.test(String(value))) {
        return rule.message || '格式不正确';
      }
    }

    // Preset check
    if (rule.preset !== undefined) {
      const preset = VALIDATION_PRESETS[rule.preset];
      if (preset && !preset.pattern.test(String(value))) {
        return rule.message || preset.message;
      }
    }

    // MinLength check
    if (rule.minLength !== undefined) {
      const lengthValue =
        typeof value === 'number'
          ? String(value).replace('-', '').replace('.', '').length
          : undefined;
      if (typeof value === 'string' && value.length < rule.minLength) {
        return rule.message || `最少输入 ${rule.minLength} 个字符`;
      }
      if (lengthValue !== undefined && lengthValue < rule.minLength) {
        return rule.message || `最少输入 ${rule.minLength} 位数字`;
      }
    }

    // MaxLength check
    if (rule.maxLength !== undefined) {
      const lengthValue =
        typeof value === 'number'
          ? String(value).replace('-', '').replace('.', '').length
          : undefined;
      if (typeof value === 'string' && value.length > rule.maxLength) {
        return rule.message || `最多输入 ${rule.maxLength} 个字符`;
      }
      if (lengthValue !== undefined && lengthValue > rule.maxLength) {
        return rule.message || `最多输入 ${rule.maxLength} 位数字`;
      }
    }

    // Custom validator
    if (rule.validator) {
      try {
        await rule.validator(value);
      } catch (e: any) {
        return e?.message || rule.message || '校验失败';
      }
    }
  }

  return null;
}

/**
 * Validate all fields in a form.
 * Returns a map of fieldId → error message for fields that have errors.
 */
export async function validateAllFields(
  formData: Record<string, any>,
  fieldRules: Record<string, ValidationRule[]>,
): Promise<Record<string, string>> {
  const errors: Record<string, string> = {};

  const entries = Object.entries(fieldRules);
  const results = await Promise.all(
    entries.map(([fieldId, rules]) => validateField(formData[fieldId], rules)),
  );

  entries.forEach(([fieldId], index) => {
    const error = results[index];
    if (error) {
      errors[fieldId] = error;
    }
  });

  return errors;
}
