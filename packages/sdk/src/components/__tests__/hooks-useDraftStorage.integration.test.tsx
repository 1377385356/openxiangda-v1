import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDraftStorage } from '../hooks/useDraftStorage';

describe('useDraftStorage', () => {
  const defaultOptions = {
    appType: 'testApp',
    formUuid: 'form-abc',
  };
  const storageKey = 'testApp__form-abc__draft';

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('初始状态', () => {
    it('should return default state when no draft exists', () => {
      const { result } = renderHook(() => useDraftStorage(defaultOptions));
      expect(result.current.hasDraft).toBe(false);
      expect(result.current.draftData).toBeNull();
      expect(result.current.draftTimestamp).toBeNull();
    });

    it('should detect existing draft on mount', () => {
      const payload = { data: { name: 'test' }, ts: 1700000000000 };
      localStorage.setItem(storageKey, JSON.stringify(payload));

      const { result } = renderHook(() => useDraftStorage(defaultOptions));
      expect(result.current.hasDraft).toBe(true);
      expect(result.current.draftTimestamp).toBe(1700000000000);
      // draftData is null without autoRestore
      expect(result.current.draftData).toBeNull();
    });

    it('should auto-restore draft data when autoRestore is true', () => {
      const payload = { data: { name: 'restored' }, ts: 1700000000000 };
      localStorage.setItem(storageKey, JSON.stringify(payload));

      const { result } = renderHook(() =>
        useDraftStorage({ ...defaultOptions, autoRestore: true }),
      );
      expect(result.current.hasDraft).toBe(true);
      expect(result.current.draftData).toEqual({ name: 'restored' });
    });
  });

  describe('saveDraft', () => {
    it('should save draft to localStorage', () => {
      const { result } = renderHook(() => useDraftStorage(defaultOptions));

      act(() => {
        result.current.saveDraft({ field1: 'value1' });
      });

      expect(result.current.hasDraft).toBe(true);
      expect(result.current.draftData).toEqual({ field1: 'value1' });
      expect(result.current.draftTimestamp).toBeGreaterThan(0);

      const stored = JSON.parse(localStorage.getItem(storageKey)!);
      expect(stored.data).toEqual({ field1: 'value1' });
      expect(typeof stored.ts).toBe('number');
    });

    it('should handle localStorage error gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceeded');
      });

      const { result } = renderHook(() => useDraftStorage(defaultOptions));

      act(() => {
        result.current.saveDraft({ field1: 'value1' });
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('restoreDraft', () => {
    it('should restore draft from localStorage', () => {
      const payload = { data: { name: 'saved' }, ts: 1700000000000 };
      localStorage.setItem(storageKey, JSON.stringify(payload));

      const { result } = renderHook(() => useDraftStorage(defaultOptions));

      let restored: any;
      act(() => {
        restored = result.current.restoreDraft();
      });

      expect(restored).toEqual({ name: 'saved' });
      expect(result.current.draftData).toEqual({ name: 'saved' });
    });

    it('should return null when no draft exists', () => {
      const { result } = renderHook(() => useDraftStorage(defaultOptions));

      let restored: any;
      act(() => {
        restored = result.current.restoreDraft();
      });

      expect(restored).toBeNull();
    });
  });

  describe('clearDraft', () => {
    it('should clear draft from localStorage and state', () => {
      const payload = { data: { name: 'to-clear' }, ts: 1700000000000 };
      localStorage.setItem(storageKey, JSON.stringify(payload));

      const { result } = renderHook(() =>
        useDraftStorage({ ...defaultOptions, autoRestore: true }),
      );
      expect(result.current.hasDraft).toBe(true);

      act(() => {
        result.current.clearDraft();
      });

      expect(result.current.hasDraft).toBe(false);
      expect(result.current.draftData).toBeNull();
      expect(result.current.draftTimestamp).toBeNull();
      expect(localStorage.getItem(storageKey)).toBeNull();
    });

    it('should handle localStorage removeItem error gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const { result } = renderHook(() => useDraftStorage(defaultOptions));

      act(() => {
        result.current.clearDraft();
      });

      expect(consoleSpy).toHaveBeenCalled();
      // State should still be cleared
      expect(result.current.hasDraft).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe('边界情况', () => {
    it('should handle corrupted localStorage data', () => {
      localStorage.setItem(storageKey, 'invalid-json');

      const { result } = renderHook(() => useDraftStorage(defaultOptions));
      expect(result.current.hasDraft).toBe(false);
      expect(result.current.draftData).toBeNull();
    });

    it('should handle malformed draft payload (missing ts)', () => {
      localStorage.setItem(storageKey, JSON.stringify({ data: { a: 1 } }));

      const { result } = renderHook(() => useDraftStorage(defaultOptions));
      expect(result.current.hasDraft).toBe(false);
    });

    it('should handle malformed draft payload (data not object)', () => {
      localStorage.setItem(storageKey, JSON.stringify({ data: 'string', ts: 123 }));

      const { result } = renderHook(() => useDraftStorage(defaultOptions));
      expect(result.current.hasDraft).toBe(false);
    });

    it('should use correct key based on appType and formUuid', () => {
      const { result } = renderHook(() => useDraftStorage({ appType: 'app2', formUuid: 'uuid-2' }));

      act(() => {
        result.current.saveDraft({ x: 1 });
      });

      expect(localStorage.getItem('app2__uuid-2__draft')).not.toBeNull();
      expect(localStorage.getItem(storageKey)).toBeNull();
    });
  });
});
