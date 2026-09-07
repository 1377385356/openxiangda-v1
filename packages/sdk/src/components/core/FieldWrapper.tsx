import React from 'react';
import * as Antd from 'antd';
import { useFormContext } from './FormContext';
import { normalizeRichTextHtml } from '../utils/richText';

/** Simple className merge utility */
function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

function getAntFormItem(): React.ComponentType<any> | undefined {
  try {
    const item = (Antd as any).Form?.Item as React.ComponentType<any> | undefined;
    const hasMatchMedia = typeof window === 'undefined' || typeof window.matchMedia === 'function';
    return hasMatchMedia ? item : undefined;
  } catch {
    return undefined;
  }
}

export interface FieldWrapperProps {
  fieldId: string;
  label: string;
  required?: boolean;
  tips?: string;
  className?: string;
  labelClassName?: string;
  tipsClassName?: string;
  children: React.ReactNode;
}

export function FieldWrapper({
  fieldId,
  label,
  required,
  tips,
  className,
  labelClassName,
  tipsClassName,
  children,
}: FieldWrapperProps) {
  const { fieldErrors } = useFormContext();
  const error = fieldErrors[fieldId];
  const AntFormItem = getAntFormItem();
  const tipsHtml = normalizeRichTextHtml(tips);
  const extra =
    tipsHtml && !error ? (
      <span
        className={cn('sy-field-tips', tipsClassName)}
        data-testid={`tips-${fieldId}`}
        dangerouslySetInnerHTML={{ __html: tipsHtml }}
      />
    ) : undefined;
  const errorNode = error ? (
    <span className="sy-field-error" role="alert" data-testid={`error-${fieldId}`}>
      {error}
    </span>
  ) : undefined;
  const requiredMark = required ? (
    <span className="sy-field-required" aria-hidden="true">
      *
    </span>
  ) : null;

  if (!AntFormItem) {
    return (
      <div className={cn('sy-field-wrapper', className)} data-field-id={fieldId}>
        <label className={cn('sy-field-label', labelClassName)}>
          {requiredMark}
          {label}
        </label>
        <div className="sy-field-control">{children}</div>
        {errorNode}
        {extra}
      </div>
    );
  }

  return (
    <div className={cn('sy-field-wrapper', className)} data-field-id={fieldId}>
      <AntFormItem
        name={fieldId}
        label={
          <span className={cn('sy-field-label', labelClassName)}>
            {requiredMark}
            {label}
          </span>
        }
        required={false}
        validateStatus={error ? 'error' : undefined}
        help={errorNode}
        extra={extra}
        className="sy-field-item"
      >
        {children}
      </AntFormItem>
    </div>
  );
}
