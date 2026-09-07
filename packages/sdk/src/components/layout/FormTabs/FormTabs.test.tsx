import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { FormTabs } from './index';

const defaultItems = [
  { key: 'tab1', label: '标签一', children: <div>内容一</div> },
  { key: 'tab2', label: '标签二', children: <div>内容二</div> },
  { key: 'tab3', label: '标签三', children: <div>内容三</div> },
];

describe('FormTabs', () => {
  it('渲染所有标签', () => {
    render(<FormTabs items={defaultItems} />);
    expect(screen.getByTestId('form-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('form-tab-tab1')).toHaveTextContent('标签一');
    expect(screen.getByTestId('form-tab-tab2')).toHaveTextContent('标签二');
    expect(screen.getByTestId('form-tab-tab3')).toHaveTextContent('标签三');
  });

  it('默认选中第一个标签', () => {
    render(<FormTabs items={defaultItems} />);
    expect(screen.getByTestId('form-tab-tab1')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('form-tab-tab2')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('内容一')).toBeInTheDocument();
    expect(screen.queryByText('内容二')).not.toBeInTheDocument();
  });

  it('defaultActiveKey 指定初始选中', () => {
    render(<FormTabs items={defaultItems} defaultActiveKey="tab2" />);
    expect(screen.getByTestId('form-tab-tab2')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('内容二')).toBeInTheDocument();
    expect(screen.queryByText('内容一')).not.toBeInTheDocument();
  });

  it('点击切换标签', () => {
    render(<FormTabs items={defaultItems} />);
    fireEvent.click(screen.getByTestId('form-tab-tab2'));
    expect(screen.getByTestId('form-tab-tab2')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('form-tab-tab1')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('内容二')).toBeInTheDocument();
    expect(screen.queryByText('内容一')).not.toBeInTheDocument();
  });

  it('自定义 className', () => {
    render(<FormTabs items={defaultItems} className="custom-tabs" />);
    expect(screen.getByTestId('form-tabs')).toHaveClass('custom-tabs');
  });

  it('自定义 tabClassName', () => {
    render(<FormTabs items={defaultItems} tabClassName="custom-tab-nav" />);
    expect(screen.getByTestId('form-tabs-nav')).toHaveClass('custom-tab-nav');
  });

  it('tablist role 存在', () => {
    render(<FormTabs items={defaultItems} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  it('tabpanel role 存在', () => {
    render(<FormTabs items={defaultItems} />);
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
  });

  it('空 items 不崩溃', () => {
    render(<FormTabs items={[]} />);
    expect(screen.getByTestId('form-tabs')).toBeInTheDocument();
  });

  it('选中标签有高亮样式', () => {
    render(<FormTabs items={defaultItems} />);
    expect(screen.getByTestId('form-tab-tab1')).toHaveClass('text-blue-600', 'border-b-2');
    expect(screen.getByTestId('form-tab-tab2')).toHaveClass('text-gray-500');
  });
});
