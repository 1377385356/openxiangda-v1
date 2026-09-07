const FORM_QUERY_SYSTEM_FIELDS = new Set([
  'approvalResult',
  'createTime',
  'currentApprovalNodeName',
  'modifiedTime',
  'originator',
  'originatorCorp',
  'originatorName',
  'processInstanceId',
  'processInstanceStatus',
  'processInstanceTitle',
]);

function collectFormSnapshotFieldIds(snapshot) {
  const fields = new Set();
  const formFields = snapshot?.form?.formFields || {};
  for (const [key, value] of Object.entries(formFields)) {
    if (key) fields.add(String(key));
    for (const candidate of [value?.fieldId, value?.field_id]) {
      if (candidate) fields.add(String(candidate));
    }
  }
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const fieldId = value.fieldId || value.props?.fieldId;
    if (fieldId) fields.add(String(fieldId));
    Object.values(value).forEach(visit);
  };
  visit(snapshot?.form?.schema);
  return fields;
}

function validateFormFieldContracts(targets, snapshots) {
  const references = Array.isArray(targets) ? targets : [];
  const snapshotFields =
    snapshots instanceof Map ? snapshots : new Map(Object.entries(snapshots || {}));
  const errors = [];
  for (const item of references) {
    const { code: resourceCode, ...detail } = item;
    if (!item.formUuid) {
      errors.push({
        code: 'FORM_FIELD_CONTRACT_BINDING_MISSING',
        resourceCode,
        ...detail,
        message: `${item.kind}:${resourceCode} ${item.file}:${item.line} 查询 ${item.formCode}.${item.field}，但无法解析该表单的 profile 绑定`,
      });
      continue;
    }
    if (
      FORM_QUERY_SYSTEM_FIELDS.has(item.field) ||
      snapshotFields.get(item.formUuid)?.has(item.field)
    ) {
      continue;
    }
    errors.push({
      code: 'FORM_FIELD_CONTRACT_FIELD_MISSING',
      resourceCode,
      ...detail,
      message: `${item.kind}:${resourceCode} ${item.file}:${item.line} 通过 ${item.api} 查询 ${item.formCode}.${item.field}，但线上 Form ${item.formUuid} 不存在该字段`,
    });
  }
  return {
    contractVersion: 'form_field_contract_v1',
    valid: errors.length === 0,
    checkedForms: new Set(references.map(item => item.formUuid).filter(Boolean)).size,
    checkedReferences: references.length,
    errors,
  };
}

module.exports = {
  FORM_QUERY_SYSTEM_FIELDS,
  collectFormSnapshotFieldIds,
  validateFormFieldContracts,
};
