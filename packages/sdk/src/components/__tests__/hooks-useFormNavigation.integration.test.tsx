import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFormNavigation } from '../hooks/useFormNavigation';

describe('useFormNavigation', () => {
  const defaultOptions = {
    appType: 'myApp',
    formUuid: 'form-123',
  };

  beforeEach(() => {
    vi.useFakeTimers();
    // mock window.location
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('初始状态', () => {
    it('should return initial state', () => {
      const { result } = renderHook(() => useFormNavigation(defaultOptions));
      expect(result.current.isRedirecting).toBe(false);
      expect(result.current.countdown).toBe(0);
      expect(typeof result.current.navigateToDetail).toBe('function');
      expect(typeof result.current.navigateToProcessDetail).toBe('function');
      expect(typeof result.current.handlePostSubmit).toBe('function');
      expect(typeof result.current.cancelRedirect).toBe('function');
    });
  });

  describe('navigateToDetail', () => {
    it('should navigate to form detail URL', () => {
      const { result } = renderHook(() => useFormNavigation(defaultOptions));
      act(() => {
        result.current.navigateToDetail('inst-456');
      });
      expect(window.location.href).toBe('/myApp/formDetail/form-123?formInstId=inst-456');
    });

    it('should preserve platform base path from current URL', () => {
      Object.defineProperty(window, 'location', {
        value: { href: '', pathname: '/view/myApp/form/form-123' },
        writable: true,
      });

      const { result } = renderHook(() => useFormNavigation(defaultOptions));
      act(() => {
        result.current.navigateToDetail('inst-456');
      });
      expect(window.location.href).toBe('/view/myApp/formDetail/form-123?formInstId=inst-456');
    });

    it('should normalize /view/submit entry routes to the /view detail base path', () => {
      Object.defineProperty(window, 'location', {
        value: { href: '', pathname: '/view/submit/myApp/form-123' },
        writable: true,
      });

      const { result } = renderHook(() => useFormNavigation(defaultOptions));
      act(() => {
        result.current.navigateToDetail('inst-456');
      });
      expect(window.location.href).toBe('/view/myApp/formDetail/form-123?formInstId=inst-456');
    });

    it('should use explicit base path when provided', () => {
      const { result } = renderHook(() =>
        useFormNavigation({ ...defaultOptions, basePath: '/view/' }),
      );
      act(() => {
        result.current.navigateToDetail('inst-456');
      });
      expect(window.location.href).toBe('/view/myApp/formDetail/form-123?formInstId=inst-456');
    });
  });

  describe('navigateToProcessDetail', () => {
    it('should navigate to process detail URL', () => {
      const { result } = renderHook(() => useFormNavigation(defaultOptions));
      act(() => {
        result.current.navigateToProcessDetail('inst-789');
      });
      expect(window.location.href).toBe('/myApp/processDetail/form-123?formInstId=inst-789');
    });
  });

  describe('handlePostSubmit - redirect mode', () => {
    it('should start countdown for form type redirect', () => {
      const { result } = renderHook(() =>
        useFormNavigation({
          ...defaultOptions,
          formType: 'form',
          mode: 'redirect',
          redirectDelay: 3000,
        }),
      );

      act(() => {
        result.current.handlePostSubmit('inst-1');
      });

      expect(result.current.isRedirecting).toBe(true);
      expect(result.current.countdown).toBe(3);
    });

    it('should count down and navigate after delay', () => {
      const { result } = renderHook(() =>
        useFormNavigation({
          ...defaultOptions,
          formType: 'form',
          mode: 'redirect',
          redirectDelay: 3000,
        }),
      );

      act(() => {
        result.current.handlePostSubmit('inst-1');
      });

      // tick 1 second
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(result.current.countdown).toBe(2);

      // tick another second
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(result.current.countdown).toBe(1);

      // tick last second
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(result.current.countdown).toBe(0);
      expect(result.current.isRedirecting).toBe(false);
      expect(window.location.href).toBe('/myApp/formDetail/form-123?formInstId=inst-1');
    });

    it('should navigate to process detail for process form type', () => {
      const { result } = renderHook(() =>
        useFormNavigation({
          ...defaultOptions,
          formType: 'process',
          mode: 'redirect',
          redirectDelay: 2000,
        }),
      );

      act(() => {
        result.current.handlePostSubmit('inst-2');
      });

      // countdown = Math.ceil(2000/1000) = 2
      expect(result.current.countdown).toBe(2);

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(window.location.href).toBe('/myApp/processDetail/form-123?formInstId=inst-2');
    });
  });

  describe('handlePostSubmit - stay mode', () => {
    it('should call onStay callback and not redirect', () => {
      const onStay = vi.fn();
      const { result } = renderHook(() =>
        useFormNavigation({ ...defaultOptions, mode: 'stay', onStay }),
      );

      act(() => {
        result.current.handlePostSubmit('inst-3');
      });

      expect(onStay).toHaveBeenCalledWith('inst-3');
      expect(result.current.isRedirecting).toBe(false);
    });
  });

  describe('handlePostSubmit - callback mode', () => {
    it('should call onStay callback in callback mode', () => {
      const onStay = vi.fn();
      const { result } = renderHook(() =>
        useFormNavigation({ ...defaultOptions, mode: 'callback', onStay }),
      );

      act(() => {
        result.current.handlePostSubmit('inst-4');
      });

      expect(onStay).toHaveBeenCalledWith('inst-4');
      expect(result.current.isRedirecting).toBe(false);
    });
  });

  describe('cancelRedirect', () => {
    it('should cancel the redirect countdown', () => {
      const { result } = renderHook(() =>
        useFormNavigation({ ...defaultOptions, mode: 'redirect', redirectDelay: 5000 }),
      );

      act(() => {
        result.current.handlePostSubmit('inst-5');
      });
      expect(result.current.isRedirecting).toBe(true);
      expect(result.current.countdown).toBe(5);

      act(() => {
        result.current.cancelRedirect();
      });
      expect(result.current.isRedirecting).toBe(false);
      expect(result.current.countdown).toBe(0);

      // Ensure timer is cleared (advance time and check no navigation)
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(window.location.href).toBe('');
    });
  });

  describe('unmount cleanup', () => {
    it('should clear interval on unmount', () => {
      const { result, unmount } = renderHook(() =>
        useFormNavigation({ ...defaultOptions, mode: 'redirect', redirectDelay: 3000 }),
      );

      act(() => {
        result.current.handlePostSubmit('inst-6');
      });

      unmount();

      // Advance time - should not throw or change href
      act(() => {
        vi.advanceTimersByTime(5000);
      });
    });
  });
});
