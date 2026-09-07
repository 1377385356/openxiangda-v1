import React, { useEffect, useMemo, useState } from 'react';
import { Button, Dropdown, Tooltip } from 'antd';
import { MoreOutlined } from '@ant-design/icons';
import type { ActionConfig } from './FormActionBar';
import { confirmAction } from '../utils/confirmAction';

export interface StickyActionBarProps {
  actions: ActionConfig[];
  className?: string;
  maxMobileButtons?: number;
  layoutMode?: 'default' | 'approval';
  align?: 'left' | 'center' | 'right';
  inDrawer?: boolean;
  maxWidth?: number | string;
  position?: 'sticky' | 'fixed' | 'inline';
  surface?: 'default' | 'transparent';
}

const getActionPriority = (action: ActionConfig) => {
  const maybePriority = (action as ActionConfig & { priority?: number }).priority;
  if (typeof maybePriority === 'number') return maybePriority;
  if (action.type === 'primary') return 10;
  if (action.type === 'danger') return 90;
  return 50;
};

export const StickyActionBar: React.FC<StickyActionBarProps> = ({
  actions,
  className = '',
  maxMobileButtons = 2,
  layoutMode = 'default',
  align = 'right',
  maxWidth = 1120,
  position = 'sticky',
  surface = 'default',
}) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const update = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth <= 768);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const visibleActions = useMemo(
    () =>
      actions
        .filter((action) => action.visible !== false)
        .sort((left, right) => getActionPriority(left) - getActionPriority(right)),
    [actions],
  );

  if (visibleActions.length === 0) return null;

  const maxWidthStyle = typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth;
  const primaryMobile = visibleActions.slice(0, maxMobileButtons);
  const moreMobile = visibleActions.slice(maxMobileButtons);
  const desktopAlign = layoutMode === 'approval' ? 'center' : align;
  const desktopJustifyClass =
    desktopAlign === 'left'
      ? 'justify-start'
      : desktopAlign === 'center'
        ? 'justify-center'
        : 'justify-end';
  const positionClass =
    position === 'fixed'
      ? 'fixed bottom-0 left-0 right-0'
      : position === 'inline'
        ? 'relative'
        : 'sticky bottom-0';
  const surfaceClass =
    surface === 'transparent'
      ? 'border-t-0 bg-transparent shadow-none backdrop-blur-0'
      : 'border-t border-ant-border-secondary bg-ant-bg-container/95 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur';
  const spacingClass =
    surface === 'transparent'
      ? 'px-0 py-0'
      : 'px-4 py-3 supports-[padding:max(0px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))]';

  const runAction = (action: ActionConfig) => {
    if (action.confirm) {
      const confirmed = confirmAction(action.confirm.title, action.confirm.content);
      if (!confirmed) return;
    }
    action.onClick();
  };

  const renderButton = (action: ActionConfig, mobile = false) => {
    const button = (
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
        loading={action.loading}
        disabled={action.disabled}
        icon={action.icon}
        onClick={() => runAction(action)}
        className={`${mobile ? 'min-w-0 flex-1' : 'min-w-[88px]'} rounded-md`}
      >
        {action.label}
      </Button>
    );
    if (!action.disabled || !action.disabledReason) return button;
    return (
      <Tooltip key={action.key} title={action.disabledReason}>
        <span className={mobile ? 'flex min-w-0 flex-1' : 'inline-flex'}>{button}</span>
      </Tooltip>
    );
  };

  return (
    <div className={`${positionClass} z-20 ${spacingClass} ${surfaceClass} ${className}`}>
      <div
        className={`mx-auto flex w-full items-center gap-3 ${
          !isMobile ? desktopJustifyClass : 'justify-end'
        }`}
        style={{ maxWidth: maxWidthStyle }}
      >
        {isMobile ? (
          <>
            <div className="flex flex-1 gap-2">
              {primaryMobile.map((action) => renderButton(action, true))}
            </div>
            {moreMobile.length > 0 && (
              <Dropdown
                trigger={['click']}
                placement="topRight"
                menu={{
                  items: moreMobile.map((action) => ({
                    key: action.key,
                    label: action.label,
                    danger: action.type === 'danger',
                    disabled: action.disabled,
                    icon: action.icon,
                    onClick: () => runAction(action),
                  })),
                }}
              >
                <Button icon={<MoreOutlined />} className="rounded-md">
                  更多
                </Button>
              </Dropdown>
            )}
          </>
        ) : layoutMode === 'approval' ? (
          <div className="flex flex-wrap items-center justify-center gap-3">
            {visibleActions.map((action) => renderButton(action))}
          </div>
        ) : (
          <div className={`flex flex-wrap items-center ${desktopJustifyClass} gap-3`}>
            {visibleActions.map((action) => renderButton(action))}
          </div>
        )}
      </div>
    </div>
  );
};
