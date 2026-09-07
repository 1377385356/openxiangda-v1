import React, { useEffect, useMemo } from 'react';
import type { UserSelectFieldProps, UserItem } from '../../types';
import { useFormContext } from '../../core/FormContext';
import {
  formatUserDisplay,
  getUserId,
  normalizeUser,
  normalizeUserArray,
} from '../shared/fieldFormat';

export function UserSelectFieldReadonly({
  fieldId,
  readonlyClassName,
  displayFormat,
}: UserSelectFieldProps) {
  const { formData, setFieldValue, api } = useFormContext();
  const rawValue = formData[fieldId];
  const value = useMemo(() => normalizeUserArray(rawValue), [rawValue]);

  useEffect(() => {
    const missing = value.filter((item) => getUserNameLikeId(item));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(
      missing.map((item) =>
        api
          .getUserById(getUserId(item))
          .then(normalizeUser)
          .catch(() => item),
      ),
    ).then((resolved) => {
      if (cancelled) return;
      const resolvedMap = new Map(resolved.map((item) => [getUserId(item), item]));
      const next = value.map((item) => resolvedMap.get(getUserId(item)) || item);
      if (next.some((item, index) => item.name !== value[index]?.name)) {
        setFieldValue(fieldId, next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [api, fieldId, setFieldValue, value]);

  const display =
    value.length > 0 ? value.map((u) => formatUserDisplay(u, displayFormat)).join(', ') : '--';

  return (
    <div
      className={readonlyClassName || 'sy-field-readonly-value'}
      data-testid={`userselectfield-readonly-${fieldId}`}
    >
      {display}
    </div>
  );
}

function getUserNameLikeId(user: UserItem) {
  const id = getUserId(user);
  return Boolean(id && (!user.name || user.name === id));
}
