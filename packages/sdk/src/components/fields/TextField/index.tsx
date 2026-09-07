import React, { useEffect } from 'react';
import type { TextFieldProps } from '../../types';
import { useFormContext } from '../../core/FormContext';
import { FieldWrapper } from '../../core/FieldWrapper';
import { useDeviceDetect } from '../../hooks/useDeviceDetect';
import { TextFieldPC } from './TextFieldPC';
import { TextFieldMobile } from './TextFieldMobile';
import { TextFieldReadonly } from './TextFieldReadonly';

export function TextField(props: TextFieldProps) {
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

  // Compute effective behavior: prop > context > NORMAL
  const behavior = propBehavior ?? fieldBehaviors[fieldId] ?? 'NORMAL';

  // Register field and set default value on mount
  useEffect(() => {
    registerField(fieldId);
    if (defaultValue !== undefined && formData[fieldId] === undefined) {
      setFieldValue(fieldId, defaultValue);
    }
    return () => unregisterField(fieldId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldId]);

  if (behavior === 'HIDDEN') return null;

  const childProps: TextFieldProps = { ...props, behavior };

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
        <TextFieldReadonly {...childProps} />
      ) : isMobile ? (
        <TextFieldMobile {...childProps} />
      ) : (
        <TextFieldPC {...childProps} />
      )}
    </FieldWrapper>
  );
}
