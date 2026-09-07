import React, { useEffect } from 'react';
import type { DepartmentSelectFieldProps } from '../../types';
import { useFormContext } from '../../core/FormContext';
import { FieldWrapper } from '../../core/FieldWrapper';
import { useDeviceDetect } from '../../hooks/useDeviceDetect';
import { DepartmentSelectFieldPC } from './DepartmentSelectFieldPC';
import { DepartmentSelectFieldMobile } from './DepartmentSelectFieldMobile';
import { DepartmentSelectFieldReadonly } from './DepartmentSelectFieldReadonly';

export function DepartmentSelectField(props: DepartmentSelectFieldProps) {
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

  const childProps: DepartmentSelectFieldProps = { ...props, behavior };

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
        <DepartmentSelectFieldReadonly {...childProps} />
      ) : isMobile ? (
        <DepartmentSelectFieldMobile {...childProps} />
      ) : (
        <DepartmentSelectFieldPC {...childProps} />
      )}
    </FieldWrapper>
  );
}
