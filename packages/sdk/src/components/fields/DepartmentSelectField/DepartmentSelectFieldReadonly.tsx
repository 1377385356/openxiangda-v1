import React, { useMemo } from 'react';
import type { DepartmentSelectFieldProps } from '../../types';
import { useFormContext } from '../../core/FormContext';
import {
  getDepartmentFullPath,
  getDepartmentId,
  getDepartmentName,
  normalizeDepartmentArray,
} from '../shared/fieldFormat';

export function DepartmentSelectFieldReadonly({
  fieldId,
  readonlyClassName,
  showFullPath,
  treeData,
}: DepartmentSelectFieldProps) {
  const { formData } = useFormContext();
  const rawValue = formData[fieldId];
  const value = useMemo(() => normalizeDepartmentArray(rawValue), [rawValue]);

  const display =
    value.length > 0
      ? value
          .map((d) =>
            showFullPath
              ? getDepartmentFullPath(getDepartmentId(d), treeData) || getDepartmentName(d)
              : getDepartmentName(d),
          )
          .join(', ')
      : '--';

  return (
    <div
      className={readonlyClassName || 'sy-field-readonly-value'}
      data-testid={`deptselectfield-readonly-${fieldId}`}
    >
      {display}
    </div>
  );
}
