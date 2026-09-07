import React, { useEffect } from 'react';
import type { CascadeDateFieldProps } from '../../types';
import { useFormContext } from '../../core/FormContext';
import { FieldWrapper } from '../../core/FieldWrapper';
import { useDeviceDetect } from '../../hooks/useDeviceDetect';
import { CascadeDateFieldPC } from './CascadeDateFieldPC';
import { CascadeDateFieldMobile } from './CascadeDateFieldMobile';
import { CascadeDateFieldReadonly } from './CascadeDateFieldReadonly';

export function CascadeDateField(props: CascadeDateFieldProps) {
  const {
    fieldId,
    label,
    behavior: propBehavior,
    required,
    tips,
    defaultValue,
    className,
    labelClassName,
    tipsClassName,
  } = props;

  const { fieldBehaviors, setFieldValue, formData, registerField, unregisterField } =
    useFormContext();
  const { isMobile } = useDeviceDetect();

  const behavior = propBehavior ?? fieldBehaviors[fieldId] ?? 'NORMAL';

  useEffect(() => {
    registerField(fieldId);
    if (defaultValue !== undefined && formData[fieldId] === undefined) {
      setFieldValue(fieldId, defaultValue);
    }
    return () => unregisterField(fieldId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldId]);

  if (behavior === 'HIDDEN') return null;

  const childProps: CascadeDateFieldProps = { ...props, behavior };

  return (
    <FieldWrapper
      fieldId={fieldId}
      label={label}
      required={required}
      tips={tips}
      className={className}
      labelClassName={labelClassName}
      tipsClassName={tipsClassName}
    >
      {behavior === 'READONLY' ? (
        <CascadeDateFieldReadonly {...childProps} />
      ) : isMobile ? (
        <CascadeDateFieldMobile {...childProps} />
      ) : (
        <CascadeDateFieldPC {...childProps} />
      )}
    </FieldWrapper>
  );
}
