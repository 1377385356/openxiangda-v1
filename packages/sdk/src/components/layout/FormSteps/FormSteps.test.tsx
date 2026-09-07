import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { FormSteps } from './index';

const defaultItems = [
  { key: 'step1', title: '步骤一', description: '描述一', children: <div>内容一</div> },
  { key: 'step2', title: '步骤二', children: <div>内容二</div> },
  { key: 'step3', title: '步骤三', description: '描述三', children: <div>内容三</div> },
];

describe('FormSteps', () => {
  it('渲染步骤指示器', () => {
    render(<FormSteps items={defaultItems} />);
    expect(screen.getByTestId('form-steps')).toBeInTheDocument();
    expect(screen.getByTestId('form-steps-indicator')).toBeInTheDocument();
    expect(screen.getByTestId('form-step-circle-0')).toHaveTextContent('1');
    expect(screen.getByTestId('form-step-circle-1')).toHaveTextContent('2');
    expect(screen.getByTestId('form-step-circle-2')).toHaveTextContent('3');
  });

  it('默认显示第一步内容', () => {
    render(<FormSteps items={defaultItems} />);
    expect(screen.getByText('内容一')).toBeInTheDocument();
    expect(screen.queryByText('内容二')).not.toBeInTheDocument();
  });

  it('当前步骤高亮', () => {
    render(<FormSteps items={defaultItems} />);
    expect(screen.getByTestId('form-step-circle-0')).toHaveClass('bg-blue-600');
    expect(screen.getByTestId('form-step-circle-1')).toHaveClass('bg-gray-200');
  });

  it('显示步骤标题和描述', () => {
    render(<FormSteps items={defaultItems} />);
    expect(screen.getByText('步骤一')).toBeInTheDocument();
    expect(screen.getByText('描述一')).toBeInTheDocument();
  });

  it('无描述时不渲染描述文字', () => {
    render(<FormSteps items={[{ key: 's1', title: '仅标题', children: <div>C</div> }]} />);
    expect(screen.getByText('仅标题')).toBeInTheDocument();
  });

  it('点击下一步切换', () => {
    render(<FormSteps items={defaultItems} />);
    fireEvent.click(screen.getByTestId('form-steps-next'));
    expect(screen.getByText('内容二')).toBeInTheDocument();
    expect(screen.queryByText('内容一')).not.toBeInTheDocument();
    expect(screen.getByTestId('form-step-circle-1')).toHaveClass('bg-blue-600');
    expect(screen.getByTestId('form-step-circle-0')).toHaveClass('bg-green-500');
  });

  it('点击上一步切换', () => {
    render(<FormSteps items={defaultItems} />);
    fireEvent.click(screen.getByTestId('form-steps-next'));
    fireEvent.click(screen.getByTestId('form-steps-prev'));
    expect(screen.getByText('内容一')).toBeInTheDocument();
  });

  it('第一步上一步按钮禁用', () => {
    render(<FormSteps items={defaultItems} />);
    expect(screen.getByTestId('form-steps-prev')).toBeDisabled();
  });

  it('最后一步下一步按钮禁用', () => {
    render(<FormSteps items={defaultItems} />);
    fireEvent.click(screen.getByTestId('form-steps-next'));
    fireEvent.click(screen.getByTestId('form-steps-next'));
    expect(screen.getByTestId('form-steps-next')).toBeDisabled();
    expect(screen.getByText('内容三')).toBeInTheDocument();
  });

  it('onStepChange 回调', () => {
    const onStepChange = vi.fn();
    render(<FormSteps items={defaultItems} onStepChange={onStepChange} />);
    fireEvent.click(screen.getByTestId('form-steps-next'));
    expect(onStepChange).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByTestId('form-steps-next'));
    expect(onStepChange).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByTestId('form-steps-prev'));
    expect(onStepChange).toHaveBeenCalledWith(1);
  });

  it('自定义 className', () => {
    render(<FormSteps items={defaultItems} className="my-steps" />);
    expect(screen.getByTestId('form-steps')).toHaveClass('my-steps');
  });

  it('连接线在已完成步骤为绿色', () => {
    render(<FormSteps items={defaultItems} />);
    fireEvent.click(screen.getByTestId('form-steps-next'));
    expect(screen.getByTestId('form-step-connector-0')).toHaveClass('bg-green-500');
    expect(screen.getByTestId('form-step-connector-1')).toHaveClass('bg-gray-200');
  });

  it('禁用的上一步按钮不触发切换', () => {
    render(<FormSteps items={defaultItems} />);
    fireEvent.click(screen.getByTestId('form-steps-prev'));
    expect(screen.getByText('内容一')).toBeInTheDocument();
  });

  it('禁用的下一步按钮不触发切换', () => {
    render(<FormSteps items={defaultItems} />);
    fireEvent.click(screen.getByTestId('form-steps-next'));
    fireEvent.click(screen.getByTestId('form-steps-next'));
    fireEvent.click(screen.getByTestId('form-steps-next'));
    expect(screen.getByText('内容三')).toBeInTheDocument();
  });
});
