const FORM_INSTANCE_METADATA_KEYS = new Set([
  'appType',
  'code',
  'createTime',
  'created_at',
  'createdAt',
  'createdBy',
  'created_by',
  'created_by_department_id',
  'created_by_department_name',
  'created_by_name',
  'createdByDepartmentId',
  'createdByDepartmentName',
  'createdByName',
  'creator',
  'data',
  'error',
  'formInstId',
  'formInstanceId',
  'formUuid',
  'instanceTitle',
  'message',
  'modifiedTime',
  'modifyTime',
  'originator',
  'originatorCorp',
  'originatorCorpName',
  'originatorDepartmentName',
  'originatorName',
  'processInstanceTitle',
  'result',
  'success',
  'title',
  'updated_at',
  'updatedAt',
]);

const isPlainRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseJsonRecord = (value: unknown): Record<string, any> | null => {
  if (typeof value !== 'string' || value.trim() === '') return null;
  try {
    const parsed = JSON.parse(value);
    return isPlainRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const pickKnownFields = (
  source: Record<string, any>,
  fieldIds?: readonly string[],
): Record<string, any> => {
  if (fieldIds?.length) {
    const values: Record<string, any> = {};
    for (const fieldId of fieldIds) {
      if (Object.prototype.hasOwnProperty.call(source, fieldId)) {
        values[fieldId] = source[fieldId];
      }
    }
    return values;
  }

  return Object.fromEntries(
    Object.entries(source).filter(([key]) => !FORM_INSTANCE_METADATA_KEYS.has(key)),
  );
};

export const extractFormValues = (
  formInstance: unknown,
  fieldIds?: readonly string[],
): Record<string, any> | null => {
  if (!isPlainRecord(formInstance)) return null;

  const nestedCandidates = [
    formInstance.data,
    parseJsonRecord(formInstance.data),
    formInstance.formData,
    parseJsonRecord(formInstance.formData),
    formInstance.values,
    formInstance.fieldValues,
    parseJsonRecord(formInstance.formDataJson),
    parseJsonRecord(formInstance.dataJson),
  ];

  for (const candidate of nestedCandidates) {
    if (isPlainRecord(candidate)) {
      return pickKnownFields(candidate, fieldIds);
    }
  }

  const flatValues = pickKnownFields(formInstance, fieldIds);
  return Object.keys(flatValues).length > 0 ? flatValues : null;
};

const firstValue = (source: Record<string, any>, keys: string[]) => {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
};

export const normalizeFormInstanceInfo = (
  formInstance: unknown,
  fallback?: { formUuid?: string; appType?: string; formInstanceId?: string },
) => {
  if (!isPlainRecord(formInstance)) return null;

  const creator = isPlainRecord(formInstance.creator) ? formInstance.creator : {};
  const formInstanceId = firstValue(formInstance, [
    'formInstanceId',
    'formInstId',
    'form_instance_id',
    'id',
  ]);
  const createdByName = firstValue(formInstance, [
    'createdByName',
    'created_by_name',
    'originatorName',
    'creatorName',
  ]);
  const createdByDepartmentName = firstValue(formInstance, [
    'createdByDepartmentName',
    'created_by_department_name',
    'originatorDepartmentName',
    'originatorCorpName',
  ]);

  return {
    ...formInstance,
    formInstanceId: formInstanceId || fallback?.formInstanceId || '',
    formUuid: formInstance.formUuid || fallback?.formUuid || '',
    appType: formInstance.appType || fallback?.appType || '',
    data: isPlainRecord(formInstance.data) ? formInstance.data : {},
    title:
      firstValue(formInstance, [
        'title',
        'instanceTitle',
        'instance_title',
        'processInstanceTitle',
      ]) || undefined,
    instanceTitle:
      firstValue(formInstance, [
        'instanceTitle',
        'instance_title',
        'processInstanceTitle',
        'title',
      ]) || undefined,
    creator: {
      userId:
        creator.userId || creator.id || formInstance.createdBy || formInstance.originator || '',
      name: creator.name || createdByName || '',
      avatar: creator.avatar,
      department: creator.department || createdByDepartmentName || '',
    },
    createdBy: firstValue(formInstance, ['createdBy', 'created_by', 'originator']),
    createdByName,
    createdByDepartmentId: firstValue(formInstance, [
      'createdByDepartmentId',
      'created_by_department_id',
      'originatorCorp',
    ]),
    createdByDepartmentName,
    createdAt:
      firstValue(formInstance, ['createdAt', 'created_at', 'createTime', 'gmtCreate']) || '',
    updatedAt: firstValue(formInstance, [
      'updatedAt',
      'updated_at',
      'modifiedTime',
      'modifyTime',
      'gmtModified',
    ]),
  };
};
