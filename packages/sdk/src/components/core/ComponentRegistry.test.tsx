import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import React from 'react';
import {
  ComponentRegistryProvider,
  useComponent,
  ComponentRegistryContext,
} from './ComponentRegistry';

const MockInput = (props: any) =>
  React.createElement('input', { 'data-testid': 'mock-input', ...props });
const MockSelect = (props: any) =>
  React.createElement('select', { 'data-testid': 'mock-select', ...props });

describe('ComponentRegistry', () => {
  describe('ComponentRegistryProvider', () => {
    it('provides registry with initial components', () => {
      const components = { Input: MockInput, Select: MockSelect };

      const TestChild = () => {
        const ctx = React.useContext(ComponentRegistryContext);
        return React.createElement(
          'span',
          { 'data-testid': 'count' },
          String(Object.keys(ctx!.registry).length),
        );
      };

      render(
        React.createElement(
          ComponentRegistryProvider,
          { components },
          React.createElement(TestChild),
        ),
      );

      expect(screen.getByTestId('count').textContent).toBe('2');
    });

    it('register function adds new component', () => {
      const components = { Input: MockInput };

      const TestChild = () => {
        const ctx = React.useContext(ComponentRegistryContext);
        return React.createElement(
          'div',
          null,
          React.createElement(
            'span',
            { 'data-testid': 'count' },
            String(Object.keys(ctx!.registry).length),
          ),
          React.createElement(
            'button',
            {
              'data-testid': 'register-btn',
              onClick: () => ctx!.register('Select', MockSelect),
            },
            'Register',
          ),
        );
      };

      render(
        React.createElement(
          ComponentRegistryProvider,
          { components },
          React.createElement(TestChild),
        ),
      );

      expect(screen.getByTestId('count').textContent).toBe('1');

      act(() => {
        screen.getByTestId('register-btn').click();
      });

      expect(screen.getByTestId('count').textContent).toBe('2');
    });

    it('tracks component prop updates without dropping runtime registrations', () => {
      const TestChild = () => {
        const ctx = React.useContext(ComponentRegistryContext);
        return React.createElement(
          'div',
          null,
          React.createElement(
            'span',
            { 'data-testid': 'names' },
            Object.keys(ctx!.registry).sort().join(','),
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              onClick: () => ctx!.register('Runtime', MockSelect),
            },
            'register',
          ),
        );
      };
      const { rerender } = render(
        React.createElement(
          ComponentRegistryProvider,
          { components: { Input: MockInput } },
          React.createElement(TestChild),
        ),
      );
      act(() => screen.getByText('register').click());
      rerender(
        React.createElement(
          ComponentRegistryProvider,
          { components: { Select: MockSelect } },
          React.createElement(TestChild),
        ),
      );

      expect(screen.getByTestId('names')).toHaveTextContent('Runtime,Select');
    });
  });

  describe('useComponent', () => {
    it('returns component when registered', () => {
      const components = { Input: MockInput };

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(ComponentRegistryProvider, { components }, children);

      const { result } = renderHook(() => useComponent('Input'), { wrapper });
      expect(result.current).toBe(MockInput);
    });

    it('returns null for unregistered component', () => {
      const components = { Input: MockInput };

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(ComponentRegistryProvider, { components }, children);

      const { result } = renderHook(() => useComponent('Unknown'), { wrapper });
      expect(result.current).toBeNull();
    });

    it('returns null when used outside provider', () => {
      const { result } = renderHook(() => useComponent('Input'));
      expect(result.current).toBeNull();
    });
  });
});
