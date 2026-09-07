import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { FormGrid } from './index';

describe('FormGrid', () => {
  it('渲染网格容器', () => {
    render(
      <FormGrid>
        <div>A</div>
        <div>B</div>
      </FormGrid>,
    );
    expect(screen.getByTestId('form-grid')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('默认 2 列 gap-4', () => {
    render(
      <FormGrid>
        <div>A</div>
      </FormGrid>,
    );
    const grid = screen.getByTestId('form-grid');
    expect(grid).toHaveClass('grid', 'md:grid-cols-2', 'gap-4');
  });

  it('columns=1', () => {
    render(
      <FormGrid columns={1}>
        <div>A</div>
      </FormGrid>,
    );
    expect(screen.getByTestId('form-grid')).toHaveClass('grid-cols-1');
  });

  it('columns=3', () => {
    render(
      <FormGrid columns={3}>
        <div>A</div>
      </FormGrid>,
    );
    expect(screen.getByTestId('form-grid')).toHaveClass('md:grid-cols-3');
  });

  it('columns=4', () => {
    render(
      <FormGrid columns={4}>
        <div>A</div>
      </FormGrid>,
    );
    expect(screen.getByTestId('form-grid')).toHaveClass('md:grid-cols-4');
  });

  it('自定义 gap', () => {
    render(
      <FormGrid gap={6}>
        <div>A</div>
      </FormGrid>,
    );
    expect(screen.getByTestId('form-grid')).toHaveClass('gap-6');
  });

  it('gap 值不在预设中时使用动态类名', () => {
    render(
      <FormGrid gap={10}>
        <div>A</div>
      </FormGrid>,
    );
    expect(screen.getByTestId('form-grid')).toHaveClass('gap-10');
  });

  it('自定义 className 覆盖默认', () => {
    render(
      <FormGrid className="my-grid">
        <div>A</div>
      </FormGrid>,
    );
    expect(screen.getByTestId('form-grid')).toHaveClass('my-grid');
    expect(screen.getByTestId('form-grid')).not.toHaveClass('grid');
  });

  it('子元素正确渲染', () => {
    render(
      <FormGrid columns={2}>
        <div className="col-span-2">跨列</div>
        <div>普通</div>
      </FormGrid>,
    );
    expect(screen.getByText('跨列')).toHaveClass('col-span-2');
    expect(screen.getByText('普通')).toBeInTheDocument();
  });

  it('supports independent row and column gaps with custom ratios', () => {
    render(
      <FormGrid columnGap={24} rowGap={32} columnRatios={[1, 2]}>
        <div>A</div>
        <div>B</div>
      </FormGrid>,
    );

    const grid = screen.getByTestId('form-grid');
    expect(grid).toHaveStyle({
      columnGap: '24px',
      rowGap: '32px',
      gridTemplateColumns: '1fr 2fr',
    });
  });
});
