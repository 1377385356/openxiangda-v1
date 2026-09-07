import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { useChangeRecords } from '../hooks/useChangeRecords';
import { FormContext } from '../core/FormContext';
import type { FormContextValue } from '../core/FormContext';

vi.mock('../core/processApi', () => ({
  getChangeRecords: vi.fn(),
}));

import { getChangeRecords } from '../core/processApi';
const mockGetChangeRecords = vi.mocked(getChangeRecords);

function createWrapper(requestFn?: any) {
  const mockRequest = requestFn || vi.fn();
  const contextValue = {
    mode: 'readonly',
    schema: { pages: [], fields: {} },
    formData: {},
    fieldErrors: {},
    fieldBehaviors: {},
    api: { request: mockRequest, uploadFile: vi.fn(), getFileUrl: vi.fn() },
    config: { mode: 'readonly', formUuid: 'uuid', appType: 'app', formInstanceId: 'inst' },
    setFieldValue: vi.fn(),
    getFieldValue: vi.fn(),
    getFormData: vi.fn(),
    validateField: vi.fn(),
    validateAll: vi.fn(),
    resetForm: vi.fn(),
    registerField: vi.fn(),
    unregisterField: vi.fn(),
  } as unknown as FormContextValue;

  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(FormContext.Provider, { value: contextValue }, children);
}

describe('useChangeRecords', () => {
  const defaultOptions = {
    formUuid: 'form-123',
    appType: 'myApp',
    formInstanceId: 'inst-456',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('初始状态', () => {
    it('should return default state', () => {
      mockGetChangeRecords.mockResolvedValue({ records: [], total: 0, page: 1, pageSize: 20 });

      const { result } = renderHook(
        () => useChangeRecords({ ...defaultOptions, autoLoad: false }),
        { wrapper: createWrapper() },
      );

      expect(result.current.records).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.total).toBe(0);
      expect(result.current.page).toBe(1);
      expect(result.current.hasMore).toBe(false);
    });
  });

  describe('自动加载', () => {
    it('should auto-load records on mount when autoLoad is true', async () => {
      const mockRecords = [
        {
          id: '1',
          fieldId: 'f1',
          fieldLabel: 'Field 1',
          oldValue: 'a',
          newValue: 'b',
          operator: 'user1',
          operateTime: '2024-01-01',
        },
        {
          id: '2',
          fieldId: 'f2',
          fieldLabel: 'Field 2',
          oldValue: 'c',
          newValue: 'd',
          operator: 'user2',
          operateTime: '2024-01-02',
        },
      ];
      mockGetChangeRecords.mockResolvedValue({
        records: mockRecords,
        total: 5,
        page: 1,
        pageSize: 20,
      });

      const { result } = renderHook(() => useChangeRecords({ ...defaultOptions, autoLoad: true }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.records).toEqual(mockRecords);
      expect(result.current.total).toBe(5);
      expect(result.current.hasMore).toBe(true);
    });

    it('normalizes platform response with data array and totalCount', async () => {
      const platformRecords = [
        {
          id: 'change-1',
          operationId: 'op-1',
          changeType: 'update',
          operatorName: '平台管理员',
          changedCount: 1,
          changes: [
            {
              fieldKey: 'customer_email',
              fieldLabel: '邮箱',
              beforeValue: '测试',
              afterValue: '测试ces',
            },
          ],
          createdAt: '2026-05-14T04:39:10.969Z',
        },
      ];
      mockGetChangeRecords.mockResolvedValue({
        data: platformRecords,
        totalCount: 3,
        currentPage: 1,
      } as any);

      const { result } = renderHook(() => useChangeRecords({ ...defaultOptions, autoLoad: true }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.records.length).toBe(1);
      });

      expect(result.current.records).toEqual(platformRecords);
      expect(result.current.total).toBe(3);
      expect(result.current.page).toBe(1);
      expect(result.current.hasMore).toBe(true);
    });

    it('should not auto-load when autoLoad is false', () => {
      const { result } = renderHook(
        () => useChangeRecords({ ...defaultOptions, autoLoad: false }),
        { wrapper: createWrapper() },
      );

      expect(mockGetChangeRecords).not.toHaveBeenCalled();
      expect(result.current.records).toEqual([]);
    });
  });

  describe('loadMore', () => {
    it('should append records on loadMore', async () => {
      const page1Records = [
        {
          id: '1',
          fieldId: 'f1',
          fieldLabel: 'F1',
          oldValue: 'a',
          newValue: 'b',
          operator: 'u1',
          operateTime: '2024-01-01',
        },
      ];
      const page2Records = [
        {
          id: '2',
          fieldId: 'f2',
          fieldLabel: 'F2',
          oldValue: 'c',
          newValue: 'd',
          operator: 'u2',
          operateTime: '2024-01-02',
        },
      ];

      mockGetChangeRecords
        .mockResolvedValueOnce({ records: page1Records, total: 2, page: 1, pageSize: 1 })
        .mockResolvedValueOnce({ records: page2Records, total: 2, page: 2, pageSize: 1 });

      const { result } = renderHook(
        () => useChangeRecords({ ...defaultOptions, pageSize: 1, autoLoad: true }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.records.length).toBe(1);
      });

      expect(result.current.hasMore).toBe(true);

      await act(async () => {
        await result.current.loadMore();
      });

      expect(result.current.records.length).toBe(2);
      expect(result.current.records[1]).toEqual(page2Records[0]);
    });

    it('should not load more when hasMore is false', async () => {
      mockGetChangeRecords.mockResolvedValue({
        records: [
          {
            id: '1',
            fieldId: 'f1',
            fieldLabel: 'F1',
            oldValue: '',
            newValue: '',
            operator: '',
            operateTime: '',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      });

      const { result } = renderHook(() => useChangeRecords({ ...defaultOptions, autoLoad: true }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.records.length).toBe(1);
      });

      expect(result.current.hasMore).toBe(false);
      mockGetChangeRecords.mockClear();

      await act(async () => {
        await result.current.loadMore();
      });

      expect(mockGetChangeRecords).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('should reset and reload from page 1', async () => {
      const initialRecords = [
        {
          id: '1',
          fieldId: 'f1',
          fieldLabel: 'F1',
          oldValue: 'a',
          newValue: 'b',
          operator: 'u1',
          operateTime: '2024-01-01',
        },
      ];
      const refreshedRecords = [
        {
          id: '3',
          fieldId: 'f3',
          fieldLabel: 'F3',
          oldValue: 'e',
          newValue: 'f',
          operator: 'u3',
          operateTime: '2024-01-03',
        },
      ];

      mockGetChangeRecords
        .mockResolvedValueOnce({ records: initialRecords, total: 1, page: 1, pageSize: 20 })
        .mockResolvedValueOnce({ records: refreshedRecords, total: 1, page: 1, pageSize: 20 });

      const { result } = renderHook(() => useChangeRecords({ ...defaultOptions, autoLoad: true }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.records.length).toBe(1);
      });

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.records).toEqual(refreshedRecords);
      expect(result.current.page).toBe(1);
    });
  });

  describe('错误处理', () => {
    it('should handle API error gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockGetChangeRecords.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useChangeRecords({ ...defaultOptions, autoLoad: true }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.records).toEqual([]);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('边界情况', () => {
    it('should throw error when used outside FormProvider', () => {
      expect(() => {
        renderHook(() => useChangeRecords({ ...defaultOptions, autoLoad: false }));
      }).toThrow('useFormContext must be used within a FormProvider');
    });
  });
});
