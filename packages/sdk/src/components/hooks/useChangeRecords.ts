import { useState, useEffect, useCallback, useRef } from 'react';
import type { ChangeRecord, ChangeRecordListResponse } from '../types';
import { getChangeRecords } from '../core/processApi';
import { useFormContext } from '../core/FormContext';

export interface UseChangeRecordsOptions {
  formUuid: string;
  appType: string;
  formInstanceId: string;
  pageSize?: number;
  autoLoad?: boolean;
}

export interface UseChangeRecordsReturn {
  records: ChangeRecord[];
  loading: boolean;
  total: number;
  page: number;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  hasMore: boolean;
}

const normalizeChangeRecordList = (value: any): ChangeRecordListResponse => {
  const body =
    value && typeof value === 'object' && !Array.isArray(value)
      ? Array.isArray(value.data) ||
        Array.isArray(value.records) ||
        Array.isArray(value.list) ||
        Array.isArray(value.items)
        ? value
        : (value.data ?? value.result ?? value)
      : value;
  const records = Array.isArray(body)
    ? body
    : (body?.records ?? body?.data ?? body?.list ?? body?.items ?? []);
  return {
    records: Array.isArray(records) ? records : [],
    total: Number(body?.total ?? body?.totalCount ?? body?.count ?? records.length) || 0,
    page: Number(body?.page ?? body?.currentPage ?? 1) || 1,
    pageSize: Number(body?.pageSize ?? body?.limit ?? 20) || 20,
  };
};

/**
 * 变更记录加载 hook
 */
export function useChangeRecords(options: UseChangeRecordsOptions): UseChangeRecordsReturn {
  const { formUuid, appType, formInstanceId, pageSize = 20, autoLoad = true } = options;
  const { api } = useFormContext();
  const request = api.request;

  const [records, setRecords] = useState<ChangeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchRecords = useCallback(
    async (pageNum: number, append: boolean) => {
      if (!mountedRef.current) return;
      setLoading(true);
      try {
        const result = await getChangeRecords(request, {
          formUuid,
          appType,
          formInstanceId,
          page: pageNum,
          pageSize,
        });
        if (!mountedRef.current) return;

        const normalized = normalizeChangeRecordList(result);
        if (append) {
          setRecords((prev) => [...prev, ...normalized.records]);
        } else {
          setRecords(normalized.records);
        }
        setTotal(normalized.total);
        setPage(normalized.page || pageNum);
      } catch (error) {
        console.error('[useChangeRecords] Failed to load change records:', error);
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [request, formUuid, appType, formInstanceId, pageSize],
  );

  useEffect(() => {
    if (autoLoad) {
      fetchRecords(1, false);
    }
  }, [autoLoad, fetchRecords]);

  const safeRecords = Array.isArray(records) ? records : [];
  const hasMore = safeRecords.length < total;

  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return;
    await fetchRecords(page + 1, true);
  }, [hasMore, loading, page, fetchRecords]);

  const refresh = useCallback(async () => {
    setRecords([]);
    setPage(1);
    setTotal(0);
    await fetchRecords(1, false);
  }, [fetchRecords]);

  return {
    records: safeRecords,
    loading,
    total,
    page,
    loadMore,
    refresh,
    hasMore,
  };
}
