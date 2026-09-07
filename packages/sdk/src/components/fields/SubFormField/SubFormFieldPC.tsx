import React from 'react';
import type { SubFormFieldProps } from '../../types';
import { useFormContext } from '../../core/FormContext';
import { SubFormCell } from './SubFormCell';
import { SubFormColumnLabel } from './SubFormColumnLabel';

export function SubFormFieldPC({
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
    <div className="sy-subform sy-subform-pc" data-testid={`subformfield-pc-${fieldId}`}>
      <div className="sy-subform-toolbar">
        <span className="sy-subform-row-count">共 {rows.length} 行</span>
        {!readonly && (
          <button
            type="button"
            disabled={addDisabled}
            className="sy-subform-add-button"
            onClick={handleAddRow}
            data-testid={`subformfield-add-${fieldId}`}
          >
            + 新增明细
          </button>
        )}
      </div>
      <div className="sy-subform-table-wrap">
        <table className="sy-subform-table" data-testid={`subformfield-table-${fieldId}`}>
          <thead>
            <tr>
              {visibleColumns.map((col) => (
                <th key={col.fieldId}>
                  <SubFormColumnLabel label={col.label} required={col.required} />
                </th>
              ))}
              {!readonly && <th>操作</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} data-testid={`subformfield-row-${fieldId}-${rowIndex}`}>
                {visibleColumns.map((col) => (
                  <td key={col.fieldId}>
                    <SubFormCell
                      parentFieldId={fieldId}
                      rowIndex={rowIndex}
                      column={col}
                      row={row}
                      behavior={behavior}
                      fallbackTestId={`subformfield-cell-${fieldId}-${rowIndex}-${col.fieldId}`}
                      onCellChange={handleCellChange}
                    />
                  </td>
                ))}
                {!readonly && (
                  <td>
                    <button
                      type="button"
                      disabled={disabled || Boolean(minRows && rows.length <= minRows)}
                      className="sy-subform-link-button sy-subform-danger-button"
                      onClick={() => handleRemoveRow(rowIndex)}
                      data-testid={`subformfield-remove-${fieldId}-${rowIndex}`}
                    >
                      删除
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <div className="sy-subform-empty">暂无数据</div>}
    </div>
  );
}
