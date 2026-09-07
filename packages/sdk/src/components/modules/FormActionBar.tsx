import React, { useState } from 'react';
import { Button } from 'antd';
import { confirmAction } from '../utils/confirmAction';

export interface ActionConfig {
  key: string;
  label: string;
  type?: 'primary' | 'default' | 'danger' | 'text';
  onClick: () => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  visible?: boolean;
  confirm?: { title: string; content: string; okText?: string; cancelText?: string };
  icon?: React.ReactNode;
  priority?: number;
  placement?: 'left' | 'right';
}

export interface FormActionBarProps {
  actions: ActionConfig[];
  position?: 'bottom-fixed' | 'inline';
  className?: string;
}

export const FormActionBar: React.FC<FormActionBarProps> = ({
  actions,
  position = 'bottom-fixed',
  className = '',
}) => {
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());

  const visibleActions = actions.filter((a) => a.visible !== false);

  // Sort: danger first, primary last
  const sortedActions = [...visibleActions].sort((a, b) => {
    if (a.type === 'danger' && b.type !== 'danger') return -1;
    if (a.type !== 'danger' && b.type === 'danger') return 1;
    if (a.type === 'primary' && b.type !== 'primary') return 1;
    if (a.type !== 'primary' && b.type === 'primary') return -1;
    return 0;
  });

  const handleClick = async (action: ActionConfig) => {
    if (action.confirm) {
      const confirmed = confirmAction(action.confirm.title, action.confirm.content);
      if (!confirmed) return;
      await executeAction(action);
    } else {
      await executeAction(action);
    }
  };

  const executeAction = async (action: ActionConfig) => {
    setLoadingKeys((prev) => new Set(prev).add(action.key));
    try {
      await action.onClick();
    } finally {
      setLoadingKeys((prev) => {
        const next = new Set(prev);
        next.delete(action.key);
        return next;
      });
    }
  };

  const isFixed = position === 'bottom-fixed';

  const bar = (
    <div
      className={`${
        isFixed
          ? 'fixed bottom-0 left-0 right-0 z-50 backdrop-blur-lg bg-white/80 border-t border-gray-200 shadow-[0_-1px_3px_rgba(0,0,0,0.05)] px-6 py-3'
          : ''
      } ${className}`}
    >
      <div className="flex items-center justify-end gap-3 flex-wrap md:flex-nowrap">
        {sortedActions.map((action) => {
          const isLoading = action.loading || loadingKeys.has(action.key);
          return (
            <Button
              key={action.key}
              type={
                action.type === 'danger'
                  ? 'primary'
                  : action.type === 'text'
                    ? 'text'
                    : action.type || 'default'
              }
              danger={action.type === 'danger'}
              loading={isLoading}
              disabled={action.disabled}
              icon={action.icon}
              onClick={() => handleClick(action)}
              className="md:w-auto w-full"
            >
              {action.label}
            </Button>
          );
        })}
      </div>
    </div>
  );

  if (isFixed) {
    return (
      <>
        {bar}
        {/* Spacer to prevent content from being hidden behind fixed bar */}
        <div className="h-16" />
      </>
    );
  }

  return bar;
};
