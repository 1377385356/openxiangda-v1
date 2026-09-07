import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { InitiatorApproverSelector } from './InitiatorApproverSelector';
import type { FormRuntimeApi } from '../types';
import { getInitiatorSelectCandidates } from '../core/processApi';

vi.mock('../core/processApi', () => ({
  getInitiatorSelectCandidates: vi.fn(),
}));

const userPickerPropsMock = vi.hoisted(() => vi.fn());

vi.mock('../fields/shared/UserPicker', () => ({
  UserPicker: (props: any) => {
    userPickerPropsMock(props);
    return props.open ? (
      <div data-testid="user-picker">
        <button
          type="button"
          onClick={() => {
            props.onConfirm([{ id: 'u1', name: '张三' }]);
            props.onOpenChange(false);
          }}
        >
          mock-confirm-user
        </button>
      </div>
    ) : null;
  },
}));

vi.mock('antd', () => {
  const Button = ({ children, onClick }: any) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  );
  const Empty = ({ description }: any) => <div>{description || 'empty'}</div>;
  Empty.PRESENTED_IMAGE_SIMPLE = 'simple';
  const Modal = ({ open, title, children, onOk, onCancel, okText, cancelText }: any) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
        <button type="button" onClick={onOk}>
          {okText}
        </button>
        <button type="button" onClick={onCancel}>
          {cancelText}
        </button>
      </div>
    ) : null;
  const Select = () => <select aria-label="select" />;
  const Space = ({ children }: any) => <div>{children}</div>;
  const Tag = ({ children }: any) => <span>{children}</span>;
  const Typography = {
    Text: ({ children }: any) => <span>{children}</span>,
  };
  return {
    Button,
    Empty,
    Modal,
    Select,
    Space,
    Tag,
    Typography,
    message: { error: vi.fn() },
  };
});

const api = {
  request: vi.fn(),
} as unknown as FormRuntimeApi;

describe('InitiatorApproverSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses organization picker for all-member scope without loading candidate API', () => {
    const onOk = vi.fn();

    render(
      <InitiatorApproverSelector
        open
        formUuid="form-1"
        appType="app-1"
        api={api}
        requirements={[
          {
            nodeId: 'approval-1',
            nodeName: '主管审批',
            scope: 'all',
          },
        ]}
        onOk={onOk}
        onCancel={vi.fn()}
      />,
    );

    expect(getInitiatorSelectCandidates).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('选择成员'));
    expect(userPickerPropsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        loadAllWhenNoDepartment: false,
      }),
    );

    fireEvent.click(screen.getByText('mock-confirm-user'));
    fireEvent.click(screen.getByText('确定'));
    expect(onOk).toHaveBeenCalledWith({
      'approval-1': [expect.objectContaining({ id: 'u1', name: '张三' })],
    });
  });
});
