import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, afterEach } from 'vitest';
import { FormProvider } from './FormProvider';
import { FormShell } from './FormShell';
import { FieldWrapper } from './FieldWrapper';
import { useFormContext } from './FormContext';
import type { FormEngineConfig, FormSchema } from '../types';

const schema: FormSchema = {
  formMeta: { formUuid: 'form-shell', appType: 'test', title: 'Form Shell' },
  fields: [{ fieldId: 'name', componentName: 'TextField', label: '姓名' }],
};

const config: FormEngineConfig = {
  mode: 'submit',
  formUuid: 'form-shell',
  appType: 'test',
  initialValues: { name: '初始值' },
};

function installMatchMedia() {
  const previous = window.matchMedia;
  window.matchMedia = (() => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  return () => {
    window.matchMedia = previous;
  };
}

afterEach(() => {
  delete (window as any).matchMedia;
});

describe('FormShell', () => {
  it('renders AntD Form shell and syncs field changes back to FormProvider', async () => {
    const restore = installMatchMedia();
    const captured: { data?: Record<string, any> } = {};
    const Capture = () => {
      captured.data = useFormContext().formData;
      return null;
    };

    render(
      <FormProvider schema={schema} config={config} initialValues={config.initialValues}>
        <FormShell
          className="custom-form-shell"
          appearance={{
            layout: 'horizontal',
            size: 'large',
            variant: 'filled',
            maxWidth: 'md',
            requiredMark: true,
            colon: false,
            labelCol: { span: 6 },
            wrapperCol: { span: 18 },
            scrollToFirstError: false,
          }}
        >
          <FieldWrapper fieldId="name" label="姓名">
            <input data-testid="name-input" />
          </FieldWrapper>
        </FormShell>
        <Capture />
      </FormProvider>,
    );

    expect(document.querySelector('.custom-form-shell')).toHaveStyle({
      maxWidth: '768px',
      width: '100%',
    });
    fireEvent.change(screen.getByTestId('name-input'), {
      target: { value: '新值' },
    });

    await waitFor(() => {
      expect(captured.data?.name).toBe('新值');
    });
    restore();
  });

  it('falls back to a plain wrapper when AntD Form cannot run in the environment', () => {
    render(
      <FormProvider schema={schema} config={config}>
        <FormShell className="fallback-form-shell" appearance={{ maxWidth: 720 }}>
          <div data-testid="fallback-child">content</div>
        </FormShell>
      </FormProvider>,
    );

    expect(screen.getByTestId('fallback-child')).toBeInTheDocument();
    expect(document.querySelector('.fallback-form-shell')).toHaveStyle({
      maxWidth: '720px',
      width: '100%',
    });
  });
});
