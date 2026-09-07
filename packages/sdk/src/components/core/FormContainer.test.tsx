import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { FormContainer } from './FormContainer';

describe('FormContainer', () => {
  it('renders title, description, children, and max width class', () => {
    const { container } = render(
      <FormContainer title="申请单" description="填写基础信息" maxWidth="lg" className="custom">
        <span>表单内容</span>
      </FormContainer>,
    );

    expect(screen.getByText('申请单')).toBeInTheDocument();
    expect(screen.getByText('填写基础信息')).toBeInTheDocument();
    expect(screen.getByText('表单内容')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('sy-form-container-lg');
    expect(container.firstElementChild).toHaveClass('custom');
  });

  it('omits the header when title and description are empty', () => {
    const { container } = render(
      <FormContainer maxWidth="full">
        <span>内容</span>
      </FormContainer>,
    );

    expect(container.querySelector('.sy-form-header')).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('sy-form-container-full');
  });
});
