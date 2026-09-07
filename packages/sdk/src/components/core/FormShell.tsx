import React, { useEffect, useMemo } from 'react';
import * as Antd from 'antd';
import type { FormAppearanceConfig } from '../types';
import { useFormContext } from './FormContext';

export interface FormShellProps {
  children: React.ReactNode;
  appearance?: FormAppearanceConfig;
  className?: string;
}

function normalizeMaxWidth(maxWidth?: FormAppearanceConfig['maxWidth']) {
  if (maxWidth === undefined || maxWidth === null) return undefined;
  if (typeof maxWidth === 'number') return maxWidth;
  const presetMap: Record<string, string> = {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    full: '100%',
  };
  return presetMap[maxWidth] || maxWidth;
}

function getAntForm(): any {
  try {
    const form = (Antd as any).Form;
    const hasMatchMedia = typeof window === 'undefined' || typeof window.matchMedia === 'function';
    return hasMatchMedia ? form : undefined;
  } catch {
    return undefined;
  }
}

export function FormShell({ children, appearance, className }: FormShellProps) {
  const AntForm = getAntForm();
  const useAntForm = AntForm?.useForm || (() => [null]);
  const [form] = useAntForm();
  const { formData, setFieldValue } = useFormContext();
  const maxWidth = normalizeMaxWidth(appearance?.maxWidth);

  useEffect(() => {
    form?.setFieldsValue?.(formData);
  }, [form, formData]);

  const style = useMemo<React.CSSProperties | undefined>(() => {
    if (!maxWidth) return undefined;
    return {
      maxWidth,
      width: '100%',
    };
  }, [maxWidth]);

  if (!AntForm) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <AntForm
      form={form}
      initialValues={formData}
      layout={appearance?.layout || 'vertical'}
      variant={appearance?.variant}
      size={appearance?.size}
      requiredMark={appearance?.requiredMark}
      colon={appearance?.colon}
      labelCol={appearance?.labelCol}
      wrapperCol={appearance?.wrapperCol}
      scrollToFirstError={appearance?.scrollToFirstError ?? true}
      className={className}
      style={style}
      onValuesChange={(changedValues: Record<string, any>) => {
        Object.entries(changedValues || {}).forEach(([fieldId, value]) => {
          setFieldValue(fieldId, value);
        });
      }}
    >
      {children}
    </AntForm>
  );
}
