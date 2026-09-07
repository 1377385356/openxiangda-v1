import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFormSubmit } from './useFormSubmit';

describe('useFormSubmit', () => {
  it('initializes with default state', () => {
    const { result } = renderHook(() => useFormSubmit());
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.submitError).toBeNull();
  });

  it('works without config', () => {
    const { result } = renderHook(() => useFormSubmit());
    expect(result.current.submit).toBeDefined();
  });

  describe('submit', () => {
    it('sets error when validation fails', async () => {
      const { result } = renderHook(() => useFormSubmit());

      await act(async () => {
        await result.current.submit({}, async () => false);
      });

      expect(result.current.submitError).toBe('表单校验失败');
      expect(result.current.isSubmitting).toBe(false);
    });

    it('calls beforeSubmit when validation passes', async () => {
      const beforeSubmit = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useFormSubmit({ beforeSubmit }));

      await act(async () => {
        await result.current.submit({ name: 'test' }, async () => true);
      });

      expect(beforeSubmit).toHaveBeenCalledWith({ name: 'test' });
      expect(result.current.isSubmitting).toBe(false);
    });

    it('stops submission when beforeSubmit returns false', async () => {
      const beforeSubmit = vi.fn().mockResolvedValue(false);
      const afterSubmit = vi.fn();
      const { result } = renderHook(() => useFormSubmit({ beforeSubmit, afterSubmit }));

      await act(async () => {
        await result.current.submit({ name: 'test' }, async () => true);
      });

      expect(afterSubmit).not.toHaveBeenCalled();
      expect(result.current.isSubmitting).toBe(false);
    });

    it('calls afterSubmit on success', async () => {
      const afterSubmit = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useFormSubmit({ afterSubmit }));

      await act(async () => {
        await result.current.submit({ data: 'x' }, async () => true);
      });

      expect(afterSubmit).toHaveBeenCalledWith({ data: 'x' });
      expect(result.current.isSubmitting).toBe(false);
      expect(result.current.submitError).toBeNull();
    });

    it('handles error in beforeSubmit', async () => {
      const beforeSubmit = vi.fn().mockRejectedValue(new Error('网络错误'));
      const { result } = renderHook(() => useFormSubmit({ beforeSubmit }));

      await act(async () => {
        await result.current.submit({}, async () => true);
      });

      expect(result.current.submitError).toBe('网络错误');
      expect(result.current.isSubmitting).toBe(false);
    });

    it('handles error in afterSubmit', async () => {
      const afterSubmit = vi.fn().mockRejectedValue(new Error('保存失败'));
      const { result } = renderHook(() => useFormSubmit({ afterSubmit }));

      await act(async () => {
        await result.current.submit({}, async () => true);
      });

      expect(result.current.submitError).toBe('保存失败');
      expect(result.current.isSubmitting).toBe(false);
    });

    it('uses default error message when error has no message', async () => {
      const beforeSubmit = vi.fn().mockRejectedValue({});
      const { result } = renderHook(() => useFormSubmit({ beforeSubmit }));

      await act(async () => {
        await result.current.submit({}, async () => true);
      });

      expect(result.current.submitError).toBe('提交失败');
    });

    it('clears previous error on new submit', async () => {
      const beforeSubmit = vi
        .fn()
        .mockRejectedValueOnce(new Error('第一次错误'))
        .mockResolvedValueOnce(undefined);
      const { result } = renderHook(() => useFormSubmit({ beforeSubmit }));

      await act(async () => {
        await result.current.submit({}, async () => true);
      });
      expect(result.current.submitError).toBe('第一次错误');

      await act(async () => {
        await result.current.submit({}, async () => true);
      });
      expect(result.current.submitError).toBeNull();
    });
  });
});
