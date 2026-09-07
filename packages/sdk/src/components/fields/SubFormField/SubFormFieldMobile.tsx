import React from 'react';
import type { SubFormFieldProps } from '../../types';
import { useFormContext } from '../../core/FormContext';
import { SubFormCell } from './SubFormCell';
import { SubFormColumnLabel } from './SubFormColumnLabel';

export function SubFormFieldMobile({
  fieldId,
  behavior,
  columns = [],
  maxRows,
  minRows,
  onChange,
}: SubFormFieldProps) {
  const { formData, setFieldValue } = useFormContext();
  const rows = (formData[fieldId] as Record<string, any>[] | undefined) ?? [];
  const visibleColumns = columns.filter((col) => col.behavior !== 'HIDDEN');
  const readonly = behavior === 'READONLY';
  const disabled = behavior === 'DISABLED' || readonly;

  const handleAddRow = () => {
    if (maxRows && rows.length >= maxRows) return;
    const emptyRow: Record<string, any> = {};
    visibleColumns.forEach((col) => {
      emptyRow[col.fieldId] = col.defaultValue ?? '';
    });
    const newRows = [...rows, emptyRow];
    setFieldValue(fieldId, newRows);
    onChange?.(newRows);
  };

  const handleRemoveRow = (index: number) => {
    if (minRows && rows.length <= minRows) return;
    const newRows = rows.filter((_, i) => i !== index);
    setFieldValue(fieldId, newRows);
    onChange?.(newRows);
  };

  const handleCellChange = (rowIndex: number, colId: string, value: any) => {
    const newRows = rows.map((row, i) => (i === rowIndex ? { ...row, [colId]: value } : row));
    setFieldValue(fieldId, newRows);
    onChange?.(newRows);
  };

  const addDisabled = disabled || Boolean(maxRows && rows.length >= maxRows);

  return (
    <div className="sy-subform sy-subform-mobile" data-testid={`subformfield-mobile-${fieldId}`}>
      <div className="sy-subform-toolbar">
        <span className="sy-subform-row-count">共 {rows.length} 行</span>
        {!readonly && (
          <button
            type="button"
            disabled={addDisabled}
            className="sy-subform-add-button"
            onClick={handleAddRow}
            data-testid={`subformfield-mobile-add-${fieldId}`}
          >
            + 新增明细
          </button>
        )}
      </div>
      {rows.map((row, rowIndex) => (
        <div
          className="sy-subform-card"
          key={rowIndex}
          data-testid={`subformfield-card-${fieldId}-${rowIndex}`}
        >
          <div className="sy-subform-card-head">
            <strong>第 {rowIndex + 1} 行</strong>
            {!readonly && (
              <button
                type="button"
                disabled={disabled || Boolean(minRows && rows.length <= minRows)}
                className="sy-subform-link-button sy-subform-danger-button"
                onClick={() => handleRemoveRow(rowIndex)}
                data-testid={`subformfield-mobile-remove-${fieldId}-${rowIndex}`}
              >
                删除
              </button>
            )}
          </div>
          {visibleColumns.map((col) => (
            <div className="sy-subform-mobile-cell" key={col.fieldId}>
              <label>
                <SubFormColumnLabel label={col.label} required={col.required} />
              </label>
              <SubFormCell
                parentFieldId={fieldId}
                rowIndex={rowIndex}
                column={col}
                row={row}
                behavior={behavior}
                fallbackTestId={`subformfield-mobile-cell-${fieldId}-${rowIndex}-${col.fieldId}`}
                onCellChange={handleCellChange}
              />
            </div>
          ))}
        </div>
      ))}
      {rows.length === 0 && <div className="sy-subform-empty">暂无数据</div>}
    </div>
  );
}
