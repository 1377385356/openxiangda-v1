import React from 'react';
import { Popup } from 'antd-mobile';
import { CloseCircleFilled, RightOutlined, SearchOutlined } from '@ant-design/icons';

function joinClassNames(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(' ');
}

export interface MobileFieldTriggerProps {
  value?: React.ReactNode;
  placeholder?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  testId?: string;
  showArrow?: boolean;
  clearable?: boolean;
  onClick?: () => void;
  onClear?: () => void;
}

export function MobileFieldTrigger({
  value,
  placeholder = '请选择',
  disabled,
  className,
  contentClassName,
  testId,
  showArrow = true,
  clearable,
  onClick,
  onClear,
}: MobileFieldTriggerProps) {
  const hasValue = value !== undefined && value !== null && value !== '';

  return (
    <button
      type="button"
      className={joinClassNames('sy-mobile-field-trigger', disabled && 'is-disabled', className)}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
    >
      <span
        className={joinClassNames(
          'sy-mobile-field-trigger-text',
          !hasValue && 'is-placeholder',
          contentClassName,
        )}
      >
        {hasValue ? value : placeholder}
      </span>
      {clearable && hasValue && !disabled ? (
        <span
          role="button"
          tabIndex={0}
          data-testid={testId ? `${testId}-clear` : undefined}
          className="sy-mobile-field-clear"
          onClick={(event) => {
            event.stopPropagation();
            onClear?.();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              onClear?.();
            }
          }}
          aria-label="清空"
        >
          <CloseCircleFilled />
        </span>
      ) : showArrow ? (
        <RightOutlined className="sy-mobile-field-arrow" aria-hidden="true" />
      ) : null}
    </button>
  );
}

export interface MobileBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  height?: string | number;
  closeOnMaskClick?: boolean;
  testId?: string;
}

export function MobileBottomSheet({
  visible,
  onClose,
  children,
  className,
  bodyClassName,
  height,
  closeOnMaskClick = true,
  testId,
}: MobileBottomSheetProps) {
  return (
    <Popup
      visible={visible}
      position="bottom"
      closeOnMaskClick={closeOnMaskClick}
      onMaskClick={onClose}
      onClose={onClose}
      destroyOnClose
      showCloseButton={false}
      className={joinClassNames('sy-mobile-bottom-sheet-popup', className)}
      bodyClassName={joinClassNames('sy-mobile-bottom-sheet', bodyClassName)}
      bodyStyle={height ? { height } : undefined}
    >
      <div className="sy-mobile-bottom-sheet-content" data-testid={testId}>
        {children}
      </div>
    </Popup>
  );
}

export interface MobileSheetHeaderProps {
  title?: React.ReactNode;
  cancelText?: React.ReactNode;
  confirmText?: React.ReactNode;
  onCancel?: () => void;
  onConfirm?: () => void;
  confirmDisabled?: boolean;
  confirmTestId?: string;
}

export function MobileSheetHeader({
  title,
  cancelText = '取消',
  confirmText = '确定',
  onCancel,
  onConfirm,
  confirmDisabled,
  confirmTestId,
}: MobileSheetHeaderProps) {
  return (
    <div className="sy-mobile-sheet-header">
      <button type="button" className="sy-mobile-sheet-action" onClick={onCancel}>
        {cancelText}
      </button>
      <div className="sy-mobile-sheet-title">{title}</div>
      <button
        type="button"
        className="sy-mobile-sheet-action is-primary"
        disabled={confirmDisabled}
        onClick={onConfirm}
        data-testid={confirmTestId}
      >
        {confirmText}
      </button>
    </div>
  );
}

export interface MobileSheetFooterProps {
  selectedCount?: number;
  onCancel: () => void;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  confirmText?: string;
}

export function MobileSheetFooter({
  selectedCount,
  onCancel,
  onConfirm,
  confirmDisabled,
  confirmText = '确定',
}: MobileSheetFooterProps) {
  return (
    <div className="sy-mobile-sheet-footer">
      {selectedCount !== undefined ? (
        <div className="sy-mobile-sheet-count">
          当前已选中 <span>{selectedCount}</span> 项
        </div>
      ) : null}
      <div className="sy-mobile-sheet-footer-actions">
        <button type="button" className="sy-mobile-sheet-button" onClick={onCancel}>
          取消
        </button>
        <button
          type="button"
          className="sy-mobile-sheet-button is-primary"
          disabled={confirmDisabled}
          onClick={onConfirm}
        >
          {confirmText}
        </button>
      </div>
    </div>
  );
}

export interface MobileSearchBoxProps {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}

export function MobileSearchBox({ value, placeholder = '搜索', onChange }: MobileSearchBoxProps) {
  return (
    <div className="sy-mobile-search">
      <span className="sy-mobile-search-icon" aria-hidden="true">
        <SearchOutlined />
      </span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        data-testid="sy-mobile-search-input"
      />
    </div>
  );
}
