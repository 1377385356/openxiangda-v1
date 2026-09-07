import { useSyncExternalStore } from 'react';

const MOBILE_BREAKPOINT = 768;

function subscribe(callback: () => void): () => void {
  let prev = window.innerWidth < MOBILE_BREAKPOINT;
  const handler = () => {
    const next = window.innerWidth < MOBILE_BREAKPOINT;
    if (next !== prev) {
      prev = next;
      callback();
    }
  };
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler);
}

function getSnapshot(): boolean {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

export interface DeviceDetectResult {
  isMobile: boolean;
}

export function useDeviceDetect(): DeviceDetectResult {
  const isMobile = useSyncExternalStore(
    subscribe,
    getSnapshot,
    /* v8 ignore next */
    () => false,
  );
  return { isMobile };
}
