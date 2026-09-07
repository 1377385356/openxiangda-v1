import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDeviceDetect } from './useDeviceDetect';

describe('useDeviceDetect', () => {
  let originalInnerWidth: number;

  beforeEach(() => {
    originalInnerWidth = window.innerWidth;
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
  });

  it('PC 宽度下返回 isMobile=false', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
    const { result } = renderHook(() => useDeviceDetect());
    expect(result.current.isMobile).toBe(false);
  });

  it('移动端宽度下返回 isMobile=true', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
    const { result } = renderHook(() => useDeviceDetect());
    expect(result.current.isMobile).toBe(true);
  });

  it('窗口大小变化时更新', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
    const { result } = renderHook(() => useDeviceDetect());
    expect(result.current.isMobile).toBe(false);

    act(() => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 600,
      });
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current.isMobile).toBe(true);

    act(() => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 900,
      });
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current.isMobile).toBe(false);
  });

  it('相同宽度区间 resize 不触发重新渲染', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
    const renderCount = vi.fn();
    const { result } = renderHook(() => {
      renderCount();
      return useDeviceDetect();
    });

    const initialCount = renderCount.mock.calls.length;

    // Resize within PC range
    act(() => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1200,
      });
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current.isMobile).toBe(false);
    // No additional re-render expected since snapshot didn't change
    expect(renderCount.mock.calls.length).toBe(initialCount);
  });

  it('卸载后移除事件监听', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
    const { unmount } = renderHook(() => useDeviceDetect());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    removeSpy.mockRestore();
  });
});
