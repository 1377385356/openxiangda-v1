import React, { useEffect } from 'react';
import type { MultiSelectFieldProps } from '../../types';
import { useFormContext } from '../../core/FormContext';
import { FieldWrapper } from '../../core/FieldWrapper';
import { useDeviceDetect } from '../../hooks/useDeviceDetect';
import { MultiSelectFieldPC } from './MultiSelectFieldPC';
import { MultiSelectFieldMobile } from './MultiSelectFieldMobile';
import { MultiSelectFieldReadonly } from './MultiSelectFieldReadonly';

export function MultiSelectField(props: MultiSelectFieldProps) {
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

  const childProps: MultiSelectFieldProps = { ...props, behavior };

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
        <MultiSelectFieldReadonly {...childProps} />
      ) : isMobile ? (
        <MultiSelectFieldMobile {...childProps} />
      ) : (
        <MultiSelectFieldPC {...childProps} />
      )}
    </FieldWrapper>
  );
}
