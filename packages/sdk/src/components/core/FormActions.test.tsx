import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import React from 'react';
import { FormActions } from './FormActions';
import { FormProvider } from './FormProvider';
import type { FormSchema, FormEngineConfig } from '../types';

const mockComponents: Record<string, React.ComponentType<any>> = {};

const baseSchema: FormSchema = {
  formMeta: { formUuid: 'test-form', appType: 'test', title: 'Test Form' },
  fields: [{ fieldId: 'name', componentName: 'TextField', label: '姓名', required: true }],
};

const baseConfig: FormEngineConfig = {
  mode: 'submit',
  formUuid: 'test-form',
  appType: 'test',
};

function renderWithProvider(
  ui: React.ReactElement,
  config: FormEngineConfig = baseConfig,
  initialValues?: Record<string, any>,
) {
  return render(
    React.createElement(
      FormProvider,
      { schema: baseSchema, config, initialValues, components: mockComponents },
      ui,
    ),
  );
}

describe('FormActions', () => {
  it('renders submit and reset buttons by default', () => {
    renderWithProvider(React.createElement(FormActions));

    expect(screen.getByTestId('form-submit-btn')).toBeInTheDocument();
    expect(screen.getByTestId('form-reset-btn')).toBeInTheDocument();
  });

  it('uses custom button text', () => {
    renderWithProvider(
      React.createElement(FormActions, { submitText: 'Save', resetText: 'Cancel' }),
    );

    expect(screen.getByTestId('form-submit-btn').textContent).toBe('Save');
    expect(screen.getByTestId('form-reset-btn').textContent).toBe('Cancel');
  });

  it('hides reset button when showReset=false', () => {
    renderWithProvider(React.createElement(FormActions, { showReset: false }));

    expect(screen.getByTestId('form-submit-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('form-reset-btn')).not.toBeInTheDocument();
  });

  it('does not render in readonly mode', () => {
    const readonlyConfig: FormEngineConfig = { ...baseConfig, mode: 'readonly' };
    renderWithProvider(React.createElement(FormActions), readonlyConfig);

    expect(screen.queryByTestId('form-actions')).not.toBeInTheDocument();
  });

  it('calls onSubmit with form data when validation passes', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    renderWithProvider(React.createElement(FormActions, { onSubmit }), baseConfig, {
      name: 'John',
    });

    await act(async () => {
      screen.getByTestId('form-submit-btn').click();
    });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'John' }));
    });
  });

  it('honors beforeSubmit=false and skips submission', async () => {
    const beforeSubmit = vi.fn().mockResolvedValue(false);
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    renderWithProvider(
      React.createElement(FormActions, { onSubmit }),
      { ...baseConfig, submit: { beforeSubmit } },
      { name: 'John' },
    );

    await act(async () => {
      screen.getByTestId('form-submit-btn').click();
    });

    expect(beforeSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'John' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits through runtime api in submit mode and runs afterSubmit redirect', async () => {
    const submitFormData = vi.fn().mockResolvedValue({ id: 'created' });
    const afterSubmit = vi.fn().mockResolvedValue(undefined);

    renderWithProvider(
      React.createElement(FormActions),
      {
        ...baseConfig,
        api: { submitFormData },
        submit: { afterSubmit, submitSuccessMode: 'redirect', redirectUrl: '#submitted' },
      },
      { name: 'John' },
    );

    await act(async () => {
      screen.getByTestId('form-submit-btn').click();
    });

    await waitFor(() => {
      expect(submitFormData).toHaveBeenCalledWith({
        appType: 'test',
        formUuid: 'test-form',
        data: expect.objectContaining({ name: 'John' }),
      });
    });
    expect(afterSubmit).toHaveBeenCalledWith({ id: 'created' });
    expect(window.location.href).toContain('#submitted');
  });

  it('updates existing form data in edit mode', async () => {
    const updateFormData = vi.fn().mockResolvedValue({ id: 'updated' });

    renderWithProvider(
      React.createElement(FormActions),
      {
        ...baseConfig,
        mode: 'edit',
        formInstanceId: 'inst-1',
        api: { updateFormData },
      },
      { name: 'John' },
    );

    await act(async () => {
      screen.getByTestId('form-submit-btn').click();
    });

    await waitFor(() => {
      expect(updateFormData).toHaveBeenCalledWith({
        appType: 'test',
        formUuid: 'test-form',
        formInstId: 'inst-1',
        updateFormDataJson: JSON.stringify({ name: 'John' }),
      });
    });
  });

  it('shows submit errors from failed submission', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('提交异常'));

    renderWithProvider(React.createElement(FormActions, { onSubmit }), baseConfig, {
      name: 'John',
    });

    await act(async () => {
      screen.getByTestId('form-submit-btn').click();
    });

    expect(await screen.findByTestId('form-submit-error')).toHaveTextContent('提交异常');
  });

  it('does not call onSubmit when validation fails', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    // name is required but no initial value
    renderWithProvider(React.createElement(FormActions, { onSubmit }));

    await act(async () => {
      screen.getByTestId('form-submit-btn').click();
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows loading state during submission', async () => {
    let resolveSubmit: () => void;
    const submitPromise = new Promise<void>((resolve) => {
      resolveSubmit = resolve;
    });
    const onSubmit = vi.fn().mockReturnValue(submitPromise);

    renderWithProvider(React.createElement(FormActions, { onSubmit }), baseConfig, {
      name: 'John',
    });

    await act(async () => {
      screen.getByTestId('form-submit-btn').click();
    });

    // Button should show loading state (antd adds ant-btn-loading class)
    const submitBtn = screen.getByTestId('form-submit-btn');
    expect(submitBtn.classList.contains('ant-btn-loading')).toBe(true);

    await act(async () => {
      resolveSubmit!();
    });

    // loading gone after completion
    expect(submitBtn.classList.contains('ant-btn-loading')).toBe(false);
  });

  it('resets form when reset button is clicked', async () => {
    const { container } = renderWithProvider(React.createElement(FormActions), baseConfig, {
      name: 'John',
    });

    // Click reset - should not throw
    await act(async () => {
      screen.getByTestId('form-reset-btn').click();
    });

    // FormActions itself should remain
    expect(screen.getByTestId('form-actions')).toBeInTheDocument();
    expect(container).toBeTruthy();
  });

  it('applies custom className', () => {
    renderWithProvider(React.createElement(FormActions, { className: 'custom-actions' }));

    const container = screen.getByTestId('form-actions');
    expect(container.className).toBe('custom-actions');
  });
});
