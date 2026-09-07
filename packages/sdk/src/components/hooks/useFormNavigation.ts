import { useState, useCallback, useRef, useEffect } from 'react';

export interface UseFormNavigationOptions {
  appType: string;
  formUuid: string;
  formType?: 'form' | 'process';
  mode?: 'redirect' | 'stay' | 'callback';
  redirectDelay?: number;
  basePath?: string;
  onStay?: (formInstId: string) => void;
}

export interface UseFormNavigationReturn {
  navigateToDetail: (formInstId: string) => void;
  navigateToProcessDetail: (formInstId: string) => void;
  handlePostSubmit: (formInstId: string) => void;
  isRedirecting: boolean;
  countdown: number;
  cancelRedirect: () => void;
}

/**
 * 页面导航 hook
 */
const normalizeBasePath = (basePath?: string) => {
  const normalized = String(basePath || '').replace(/^\/+|\/+$/g, '');
  return normalized ? `/${normalized}` : '';
};

const inferBasePath = (appType: string) => {
  if (typeof window === 'undefined') return '';
  const pathname = window.location?.pathname || '';
  const submitMarker = `/submit/${appType}/`;
  const submitMarkerIndex = pathname.indexOf(submitMarker);
  if (submitMarkerIndex > 0) {
    return pathname.slice(0, submitMarkerIndex);
  }
  const marker = `/${appType}/`;
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex <= 0) return '';
  return pathname.slice(0, markerIndex);
};

const buildDetailUrl = (
  appType: string,
  formUuid: string,
  formInstId: string,
  detailType: 'formDetail' | 'processDetail',
  basePath?: string,
) => {
  const prefix = normalizeBasePath(basePath ?? inferBasePath(appType));
  return `${prefix}/${appType}/${detailType}/${formUuid}?formInstId=${encodeURIComponent(formInstId)}`;
};

export function useFormNavigation(options: UseFormNavigationOptions): UseFormNavigationReturn {
  const {
    appType,
    formUuid,
    formType = 'form',
    mode = 'redirect',
    redirectDelay = 3000,
    basePath,
    onStay,
  } = options;

  const [isRedirecting, setIsRedirecting] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const redirectTargetRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const navigateToDetail = useCallback(
    (formInstId: string) => {
      window.location.href = buildDetailUrl(appType, formUuid, formInstId, 'formDetail', basePath);
    },
    [appType, basePath, formUuid],
  );

  const navigateToProcessDetail = useCallback(
    (formInstId: string) => {
      window.location.href = buildDetailUrl(
        appType,
        formUuid,
        formInstId,
        'processDetail',
        basePath,
      );
    },
    [appType, basePath, formUuid],
  );

  const startRedirectCountdown = useCallback(
    (targetUrl: string) => {
      const totalSeconds = Math.ceil(redirectDelay / 1000);
      setIsRedirecting(true);
      setCountdown(totalSeconds);
      redirectTargetRef.current = targetUrl;

      timerRef.current = setInterval(() => {
        if (!mountedRef.current) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          return;
        }

        setCountdown((prev) => {
          const next = prev - 1;
          if (next <= 0) {
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            setIsRedirecting(false);
            if (redirectTargetRef.current) {
              window.location.href = redirectTargetRef.current;
            }
            return 0;
          }
          return next;
        });
      }, 1000);
    },
    [redirectDelay],
  );

  const cancelRedirect = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRedirecting(false);
    setCountdown(0);
    redirectTargetRef.current = null;
  }, []);

  const handlePostSubmit = useCallback(
    (formInstId: string) => {
      if (mode === 'stay') {
        onStay?.(formInstId);
        return;
      }

      if (mode === 'callback') {
        onStay?.(formInstId);
        return;
      }

      // redirect 模式
      const targetUrl = buildDetailUrl(
        appType,
        formUuid,
        formInstId,
        formType === 'process' ? 'processDetail' : 'formDetail',
        basePath,
      );

      startRedirectCountdown(targetUrl);
    },
    [mode, formType, appType, formUuid, basePath, onStay, startRedirectCountdown],
  );

  return {
    navigateToDetail,
    navigateToProcessDetail,
    handlePostSubmit,
    isRedirecting,
    countdown,
    cancelRedirect,
  };
}
