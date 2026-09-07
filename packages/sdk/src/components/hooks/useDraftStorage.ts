import { useState, useCallback, useEffect } from 'react';

export interface UseDraftStorageOptions {
  appType: string;
  formUuid: string;
  autoRestore?: boolean;
}

export interface UseDraftStorageReturn {
  hasDraft: boolean;
  draftData: Record<string, any> | null;
  draftTimestamp: number | null;
  saveDraft: (data: Record<string, any>) => void;
  restoreDraft: () => Record<string, any> | null;
  clearDraft: () => void;
}

interface DraftPayload {
  data: Record<string, any>;
  ts: number;
}

function getDraftKey(appType: string, formUuid: string): string {
  return `${appType}__${formUuid}__draft`;
}

function readDraft(key: string): DraftPayload | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftPayload;
    if (parsed && typeof parsed.data === 'object' && typeof parsed.ts === 'number') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 草稿暂存 hook
 * 使用 localStorage 存储表单草稿数据
 */
export function useDraftStorage(options: UseDraftStorageOptions): UseDraftStorageReturn {
  const { appType, formUuid, autoRestore = false } = options;
  const key = getDraftKey(appType, formUuid);

  const [hasDraft, setHasDraft] = useState(false);
  const [draftData, setDraftData] = useState<Record<string, any> | null>(null);
  const [draftTimestamp, setDraftTimestamp] = useState<number | null>(null);

  // 初始化时检测是否有 draft
  useEffect(() => {
    const stored = readDraft(key);
    if (stored) {
      setHasDraft(true);
      setDraftTimestamp(stored.ts);
      if (autoRestore) {
        setDraftData(stored.data);
      }
    } else {
      setHasDraft(false);
      setDraftData(null);
      setDraftTimestamp(null);
    }
  }, [key, autoRestore]);

  const saveDraft = useCallback(
    (data: Record<string, any>) => {
      const payload: DraftPayload = { data, ts: Date.now() };
      try {
        localStorage.setItem(key, JSON.stringify(payload));
        setHasDraft(true);
        setDraftData(data);
        setDraftTimestamp(payload.ts);
      } catch (error) {
        console.error('[useDraftStorage] Failed to save draft:', error);
      }
    },
    [key],
  );

  const restoreDraft = useCallback((): Record<string, any> | null => {
    const stored = readDraft(key);
    if (stored) {
      setDraftData(stored.data);
      return stored.data;
    }
    return null;
  }, [key]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('[useDraftStorage] Failed to clear draft:', error);
    }
    setHasDraft(false);
    setDraftData(null);
    setDraftTimestamp(null);
  }, [key]);

  return {
    hasDraft,
    draftData,
    draftTimestamp,
    saveDraft,
    restoreDraft,
    clearDraft,
  };
}
