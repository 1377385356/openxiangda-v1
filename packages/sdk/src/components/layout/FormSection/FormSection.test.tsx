import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { FormSection } from './index';

describe('FormSection', () => {
  it('渲染标题和子内容', () => {
    render(
      <FormSection title="基本信息">
        <div>内容</div>
      </FormSection>,
    );
    expect(screen.getByText('基本信息')).toBeInTheDocument();
    expect(screen.getByText('内容')).toBeInTheDocument();
    expect(screen.getByTestId('form-section')).toBeInTheDocument();
  });

  it('渲染描述', () => {
    render(
      <FormSection title="基本信息" description="请填写基本信息">
        <div>内容</div>
      </FormSection>,
    );
    expect(screen.getByTestId('form-section-description')).toHaveTextContent('请填写基本信息');
  });

  it('不渲染描述当未提供时', () => {
    render(
      <FormSection title="基本信息">
        <div>内容</div>
      </FormSection>,
    );
    expect(screen.queryByTestId('form-section-description')).not.toBeInTheDocument();
  });

  it('自定义 className', () => {
    render(
      <FormSection title="标题" className="custom-class">
        <div>内容</div>
      </FormSection>,
    );
    expect(screen.getByTestId('form-section')).toHaveClass('custom-class');
  });

  it('自定义 titleClassName', () => {
    render(
      <FormSection title="标题" titleClassName="title-cls">
        <div>内容</div>
      </FormSection>,
    );
    expect(screen.getByTestId('form-section-header')).toHaveClass('title-cls');
  });

  it('自定义 contentClassName', () => {
    render(
      <FormSection title="标题" contentClassName="content-cls">
        <div>内容</div>
      </FormSection>,
    );
    expect(screen.getByTestId('form-section-content')).toHaveClass('content-cls');
  });

  it('默认渲染 plain 样式和标题竖条', () => {
    render(
      <FormSection title="标题">
        <div>内容</div>
      </FormSection>,
    );
    expect(screen.getByTestId('form-section')).toHaveClass(
      'sy-form-section',
      'sy-form-section-plain',
      'sy-form-section-accent-blue',
    );
    expect(screen.getByTestId('form-section-marker')).toBeInTheDocument();
    expect(screen.getByTestId('form-section-content')).toHaveClass('sy-form-section-content');
  });

  it('variant=card 时渲染卡片标题栏和图标容器', () => {
    render(
      <FormSection title="标题" variant="card" iconKey="device">
        <div>内容</div>
      </FormSection>,
    );
    expect(screen.getByTestId('form-section')).toHaveClass('sy-form-section-card');
    expect(screen.getByTestId('form-section-header')).toHaveClass('sy-form-section-header');
    expect(screen.getByTestId('form-section-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('form-section-marker')).not.toBeInTheDocument();
    expect(screen.getByTestId('form-section-content')).toHaveClass('sy-form-section-content');
  });

  it('accent=green 时应用绿色 accent class', () => {
    render(
      <FormSection title="标题" accent="green">
        <div>内容</div>
      </FormSection>,
    );
    expect(screen.getByTestId('form-section')).toHaveClass('sy-form-section-accent-green');
  });

  it('自定义 icon 优先于 iconKey', () => {
    render(
      <FormSection
        title="标题"
        variant="card"
        icon={<span data-testid="custom-section-icon">自定义</span>}
        iconKey="user"
      >
        <div>内容</div>
      </FormSection>,
    );
    expect(screen.getByTestId('form-section-icon')).toContainElement(
      screen.getByTestId('custom-section-icon'),
    );
  });

  it('不可折叠时无箭头', () => {
    render(
      <FormSection title="标题">
        <div>内容</div>
      </FormSection>,
    );
    expect(screen.queryByTestId('form-section-arrow')).not.toBeInTheDocument();
  });

  it('不可折叠时 header 无 role=button', () => {
    render(
      <FormSection title="标题">
        <div>内容</div>
      </FormSection>,
    );
    expect(screen.getByTestId('form-section-header')).not.toHaveAttribute('role');
  });

  it('可折叠时显示箭头', () => {
    render(
      <FormSection title="标题" collapsible>
        <div>内容</div>
      </FormSection>,
    );
    expect(screen.getByTestId('form-section-arrow')).toBeInTheDocument();
    expect(screen.getByTestId('form-section-header')).toHaveAttribute('role', 'button');
    expect(screen.getByTestId('form-section-header')).toHaveAttribute('aria-expanded', 'true');
  });

  it('点击标题折叠/展开内容', () => {
    render(
      <FormSection title="标题" collapsible>
        <div>内容</div>
      </FormSection>,
    );
    expect(screen.getByText('内容')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('form-section-header'));
    expect(screen.queryByText('内容')).not.toBeInTheDocument();
    expect(screen.getByTestId('form-section-header')).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByTestId('form-section-header'));
    expect(screen.getByText('内容')).toBeInTheDocument();
  });

  it('defaultCollapsed=true 时初始折叠', () => {
    render(
      <FormSection title="标题" collapsible defaultCollapsed>
        <div>隐藏的内容</div>
      </FormSection>,
    );
    expect(screen.queryByText('隐藏的内容')).not.toBeInTheDocument();
    expect(screen.getByTestId('form-section-arrow')).toHaveStyle({ transform: 'rotate(-90deg)' });
  });

  it('不可折叠时点击不触发折叠', () => {
    render(
      <FormSection title="标题">
        <div>内容</div>
      </FormSection>,
    );
    fireEvent.click(screen.getByTestId('form-section-header'));
    expect(screen.getByText('内容')).toBeInTheDocument();
  });

  it('可折叠时支持键盘折叠/展开内容', () => {
    render(
      <FormSection title="标题" collapsible>
        <div>内容</div>
      </FormSection>,
    );
    fireEvent.keyDown(screen.getByTestId('form-section-header'), { key: ' ' });
    expect(screen.queryByText('内容')).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId('form-section-header'), { key: 'Enter' });
    expect(screen.getByText('内容')).toBeInTheDocument();
  });
});
