import React from 'react';
import type { SubFormFieldProps } from '../../types';
import { useFormContext } from '../../core/FormContext';
import { SubFormColumnLabel } from './SubFormColumnLabel';

export function SubFormFieldReadonly({
  fieldId,
  columns = [],
  readonlyClassName,
}: SubFormFieldProps) {
  const { formData } = useFormContext();
  const rows = (formData[fieldId] as Record<string, any>[] | undefined) ?? [];
  const visibleColumns = columns.filter((col) => col.behavior !== 'HIDDEN');

  if (rows.length === 0) {
    return (
      <div
        className={readonlyClassName || 'sy-field-readonly-value'}
        data-testid={`subformfield-readonly-${fieldId}`}
      >
        --
      </div>
    );
  }

  return (
    <table
      className={readonlyClassName || 'sy-field-readonly-value'}
      data-testid={`subformfield-readonly-${fieldId}`}
    >
      <thead>
        <tr>
          {visibleColumns.map((col) => (
            <th key={col.fieldId}>
              <SubFormColumnLabel label={col.label} required={col.required} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex} data-testid={`subformfield-readonly-row-${fieldId}-${rowIndex}`}>
            {visibleColumns.map((col) => (
              <td key={col.fieldId}>{row[col.fieldId] ?? '--'}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
