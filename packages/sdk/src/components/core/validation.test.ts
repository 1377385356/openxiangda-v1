import { describe, it, expect, vi } from 'vitest';
import { validateField, validateAllFields } from './validation';

describe('validateField', () => {
  it('returns null for empty rules', async () => {
    expect(await validateField('hello', [])).toBeNull();
  });

  it('returns null when value is valid', async () => {
    const rules = [{ required: true }];
    expect(await validateField('hello', rules)).toBeNull();
  });

  // Required checks
  describe('required', () => {
    const rules = [{ required: true }];

    it('fails for null', async () => {
      expect(await validateField(null, rules)).toBe('此字段为必填项');
    });

    it('fails for undefined', async () => {
      expect(await validateField(undefined, rules)).toBe('此字段为必填项');
    });

    it('fails for empty string', async () => {
      expect(await validateField('', rules)).toBe('此字段为必填项');
    });

    it('fails for empty array', async () => {
      expect(await validateField([], rules)).toBe('此字段为必填项');
    });

    it('uses custom message', async () => {
      const r = [{ required: true, message: '请填写' }];
      expect(await validateField('', r)).toBe('请填写');
    });

    it('passes for non-empty array', async () => {
      expect(await validateField([1], rules)).toBeNull();
    });

    it('passes for number 0', async () => {
      expect(await validateField(0, rules)).toBeNull();
    });

    it('passes for false', async () => {
      expect(await validateField(false, rules)).toBeNull();
    });
  });

  // Skip further checks when value is empty and not required
  describe('skip checks for empty non-required value', () => {
    it('skips min check for null', async () => {
      const rules = [{ min: 3 }];
      expect(await validateField(null, rules)).toBeNull();
    });

    it('skips min check for undefined', async () => {
      const rules = [{ min: 3 }];
      expect(await validateField(undefined, rules)).toBeNull();
    });

    it('skips min check for empty string', async () => {
      const rules = [{ min: 3 }];
      expect(await validateField('', rules)).toBeNull();
    });
  });

  // Min checks
  describe('min', () => {
    it('fails for string shorter than min', async () => {
      const rules = [{ min: 3 }];
      expect(await validateField('ab', rules)).toBe('最少输入 3 个字符');
    });

    it('passes for string at min length', async () => {
      const rules = [{ min: 3 }];
      expect(await validateField('abc', rules)).toBeNull();
    });

    it('fails for number less than min', async () => {
      const rules = [{ min: 5 }];
      expect(await validateField(3, rules)).toBe('不能小于 5');
    });

    it('passes for number at min', async () => {
      const rules = [{ min: 5 }];
      expect(await validateField(5, rules)).toBeNull();
    });

    it('uses custom message for string min', async () => {
      const rules = [{ min: 3, message: '太短了' }];
      expect(await validateField('ab', rules)).toBe('太短了');
    });

    it('uses custom message for number min', async () => {
      const rules = [{ min: 5, message: '太小了' }];
      expect(await validateField(3, rules)).toBe('太小了');
    });
  });

  // Max checks
  describe('max', () => {
    it('fails for string longer than max', async () => {
      const rules = [{ max: 3 }];
      expect(await validateField('abcd', rules)).toBe('最多输入 3 个字符');
    });

    it('passes for string at max length', async () => {
      const rules = [{ max: 3 }];
      expect(await validateField('abc', rules)).toBeNull();
    });

    it('fails for number greater than max', async () => {
      const rules = [{ max: 10 }];
      expect(await validateField(11, rules)).toBe('不能大于 10');
    });

    it('passes for number at max', async () => {
      const rules = [{ max: 10 }];
      expect(await validateField(10, rules)).toBeNull();
    });

    it('uses custom message for string max', async () => {
      const rules = [{ max: 3, message: '太长了' }];
      expect(await validateField('abcd', rules)).toBe('太长了');
    });

    it('uses custom message for number max', async () => {
      const rules = [{ max: 10, message: '太大了' }];
      expect(await validateField(11, rules)).toBe('太大了');
    });
  });

  // Pattern checks
  describe('pattern', () => {
    it('fails for string not matching regex pattern', async () => {
      const rules = [{ pattern: /^\d+$/ }];
      expect(await validateField('abc', rules)).toBe('格式不正确');
    });

    it('passes for string matching regex pattern', async () => {
      const rules = [{ pattern: /^\d+$/ }];
      expect(await validateField('123', rules)).toBeNull();
    });

    it('supports string pattern', async () => {
      const rules = [{ pattern: '^\\d+$' }];
      expect(await validateField('abc', rules)).toBe('格式不正确');
    });

    it('passes string pattern when matched', async () => {
      const rules = [{ pattern: '^\\d+$' }];
      expect(await validateField('123', rules)).toBeNull();
    });

    it('uses custom message', async () => {
      const rules = [{ pattern: /^\d+$/, message: '只能输入数字' }];
      expect(await validateField('abc', rules)).toBe('只能输入数字');
    });
  });

  // Custom validator
  describe('validator', () => {
    it('passes when validator does not throw', async () => {
      const rules = [{ validator: vi.fn().mockResolvedValue(undefined) }];
      expect(await validateField('val', rules)).toBeNull();
    });

    it('fails with error message when validator throws', async () => {
      const rules = [
        {
          validator: vi.fn().mockRejectedValue(new Error('自定义错误')),
        },
      ];
      expect(await validateField('val', rules)).toBe('自定义错误');
    });

    it('uses rule message when error has no message', async () => {
      const rules = [
        {
          validator: vi.fn().mockRejectedValue({}),
          message: '回退消息',
        },
      ];
      expect(await validateField('val', rules)).toBe('回退消息');
    });

    it('uses default message when neither error nor rule has message', async () => {
      const rules = [
        {
          validator: vi.fn().mockRejectedValue({}),
        },
      ];
      expect(await validateField('val', rules)).toBe('校验失败');
    });

    it('handles sync validator that throws', async () => {
      const rules = [
        {
          validator: () => {
            throw new Error('同步错误');
          },
        },
      ];
      expect(await validateField('val', rules)).toBe('同步错误');
    });
  });

  // Multiple rules
  describe('multiple rules', () => {
    it('returns first error when multiple rules fail', async () => {
      const rules = [{ required: true }, { min: 5 }];
      expect(await validateField('', rules)).toBe('此字段为必填项');
    });

    it('checks subsequent rules if first passes', async () => {
      const rules = [{ required: true }, { min: 5 }];
      expect(await validateField('ab', rules)).toBe('最少输入 5 个字符');
    });
  });
});

describe('validateAllFields', () => {
  it('returns empty object when all valid', async () => {
    const formData = { name: 'John', age: 25 };
    const fieldRules = {
      name: [{ required: true }],
      age: [{ min: 0 }],
    };
    expect(await validateAllFields(formData, fieldRules)).toEqual({});
  });

  it('returns errors for invalid fields', async () => {
    const formData = { name: '', age: -1 };
    const fieldRules = {
      name: [{ required: true }],
      age: [{ min: 0 }],
    };
    const errors = await validateAllFields(formData, fieldRules);
    expect(errors).toEqual({
      name: '此字段为必填项',
      age: '不能小于 0',
    });
  });

  it('only includes fields with errors', async () => {
    const formData = { name: 'ok', age: -1 };
    const fieldRules = {
      name: [{ required: true }],
      age: [{ min: 0 }],
    };
    const errors = await validateAllFields(formData, fieldRules);
    expect(errors).toEqual({ age: '不能小于 0' });
    expect(errors.name).toBeUndefined();
  });

  it('handles empty fieldRules', async () => {
    expect(await validateAllFields({}, {})).toEqual({});
  });
});
