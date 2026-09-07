import type { FieldValueSyncConfig, OptionItem } from '../../types';

export function syncSelectValueToFields(
  valueSync: FieldValueSyncConfig[] | undefined,
  option: OptionItem | null,
  setFieldValue: (fieldId: string, value: any) => void,
) {
  if (!valueSync?.length) return;
  for (const rule of valueSync) {
    if (!rule.targetFieldId) continue;
    const valuePath = rule.valuePath || 'value';
    const nextValue = option ? option[valuePath] : (rule.emptyValue ?? '');
    setFieldValue(rule.targetFieldId, nextValue ?? '');
  }
}
