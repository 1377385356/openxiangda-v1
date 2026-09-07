import React, { useMemo } from 'react';
import type { FieldBehavior, SubFormColumn } from '../../types';
import { useComponent } from '../../core/ComponentRegistry';
import { FormContext, useFormContext } from '../../core/FormContext';

interface SubFormCellProps {
  parentFieldId: string;
  rowIndex: number;
  column: SubFormColumn;
  row: Record<string, any>;
  behavior?: FieldBehavior;
  fallbackTestId: string;
  onCellChange: (rowIndex: number, colId: string, value: any) => void;
}

const stringifyFallbackValue = (value: any) => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number') return value;
  return JSON.stringify(value);
};

export function SubFormCell({
  parentFieldId,
  rowIndex,
  column,
  row,
  behavior,
  fallbackTestId,
  onCellChange,
}: SubFormCellProps) {
  const Component = useComponent(column.componentName);
  const parentContext = useFormContext();
  const scopedFieldId = `${parentFieldId}.${rowIndex}.${column.fieldId}`;
  const cellValue = row[column.fieldId];
  const resolvedBehavior =
    behavior === 'DISABLED' || behavior === 'READONLY'
      ? behavior
      : (column.behavior ?? behavior ?? 'NORMAL');

  const childContext = useMemo(
    () => ({
      ...parentContext,
      formData: {
        ...parentContext.formData,
        [scopedFieldId]: cellValue,
      },
      fieldBehaviors: {
        ...parentContext.fieldBehaviors,
        [scopedFieldId]: resolvedBehavior,
      },
      setFieldValue: (fieldId: string, value: any) => {
        if (fieldId === scopedFieldId) {
          onCellChange(rowIndex, column.fieldId, value);
          return;
        }
        parentContext.setFieldValue(fieldId, value);
      },
      getFieldValue: (fieldId: string) =>
        fieldId === scopedFieldId ? cellValue : parentContext.getFieldValue(fieldId),
      getFormData: () => ({
        ...parentContext.getFormData(),
        [scopedFieldId]: cellValue,
      }),
      validateField: (fieldId: string) => parentContext.validateField(fieldId),
      registerField: (fieldId: string) => {
        if (fieldId !== scopedFieldId) parentContext.registerField(fieldId);
      },
      unregisterField: (fieldId: string) => {
        if (fieldId !== scopedFieldId) parentContext.unregisterField(fieldId);
      },
    }),
    [
      cellValue,
      column.fieldId,
      onCellChange,
      parentContext,
      resolvedBehavior,
      rowIndex,
      scopedFieldId,
    ],
  );

  if (!Component) {
    if (resolvedBehavior === 'READONLY') {
      return <span data-testid={fallbackTestId}>{stringifyFallbackValue(cellValue) || '--'}</span>;
    }
    return (
      <input
        value={stringifyFallbackValue(cellValue)}
        disabled={resolvedBehavior === 'DISABLED'}
        onChange={(event) => onCellChange(rowIndex, column.fieldId, event.target.value)}
        data-testid={fallbackTestId}
      />
    );
  }

  const columnProps: Record<string, any> = { ...column };
  delete columnProps.fieldId;
  delete columnProps.componentName;
  delete columnProps.label;
  delete columnProps.required;
  delete columnProps.tips;

  return (
    <FormContext.Provider value={childContext}>
      <Component
        {...columnProps}
        fieldId={scopedFieldId}
        label=""
        behavior={resolvedBehavior}
        required={false}
        tips={undefined}
      />
    </FormContext.Provider>
  );
}
