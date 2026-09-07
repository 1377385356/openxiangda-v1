import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveLinkedFormOptions } from '../../core/optionSource';
import { useFormContext } from '../../core/FormContext';
import type { OptionItem, OptionSourceConfig } from '../../types';

const DEFAULT_REMOTE_SEARCH_DEBOUNCE_MS = 350;

function mergeOptionItems(...groups: Array<OptionItem[] | undefined>): OptionItem[] {
  const result: OptionItem[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    for (const option of group || []) {
      if (!option || option.value === undefined || option.value === null) continue;
      const key = String(option.value);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(option);
    }
  }

  return result;
}

export function useLinkedFormRemoteOptions(
  optionSource: OptionSourceConfig | undefined,
  baseOptions: OptionItem[],
  selectedOptions: OptionItem[],
) {
  const { runtime } = useFormContext();
  const linkedForm = optionSource?.type === 'linkedForm' ? optionSource.linkedForm : undefined;
  const enabled = Boolean(linkedForm?.remoteSearch);
  const minChars = linkedForm?.remoteSearchMinChars ?? 0;
  const [remoteOptions, setRemoteOptions] = useState<OptionItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef(0);

  const reset = useCallback(() => {
    requestRef.current += 1;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setRemoteOptions(null);
    setLoading(false);
  }, []);

  const search = useCallback(
    (keyword: string) => {
      if (!enabled || !linkedForm) return;
      const trimmedKeyword = keyword.trim();
      if (!trimmedKeyword) {
        reset();
        return;
      }
      if (trimmedKeyword.length < minChars) {
        requestRef.current += 1;
        setRemoteOptions([]);
        setLoading(false);
        return;
      }

      if (timerRef.current) clearTimeout(timerRef.current);
      setLoading(true);
      timerRef.current = setTimeout(() => {
        const requestId = requestRef.current + 1;
        requestRef.current = requestId;
        void resolveLinkedFormOptions(linkedForm, runtime, trimmedKeyword).then((options) => {
          if (requestRef.current !== requestId) return;
          setRemoteOptions(options);
          setLoading(false);
        });
      }, DEFAULT_REMOTE_SEARCH_DEBOUNCE_MS);
    },
    [enabled, linkedForm, minChars, reset, runtime],
  );

  useEffect(
    () => () => {
      requestRef.current += 1;
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const options = useMemo(
    () => mergeOptionItems(remoteOptions ?? baseOptions, selectedOptions),
    [baseOptions, remoteOptions, selectedOptions],
  );

  return {
    enabled,
    loading,
    options,
    reset,
    search,
  };
}
