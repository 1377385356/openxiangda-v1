export function normalizeComponentName(componentName) {
  if (componentName === "TextAreaField") return "TextareaField";
  return componentName;
}

export function getObjectSize(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  return Object.keys(value).length;
}

export function isValidTableName(value) {
  const normalized = String(value || "").trim();
  return Boolean(normalized) && normalized.toLowerCase() !== "null";
}

export function validateFormSchema(schema, formName = "unknown") {
  if (!schema || typeof schema !== "object") {
    throw new Error(`${formName}: schema 必须是对象`);
  }
  if (!schema.formMeta || typeof schema.formMeta !== "object") {
    throw new Error(`${formName}: schema.formMeta 缺失`);
  }
  if (!Array.isArray(schema.fields) || schema.fields.length === 0) {
    throw new Error(`${formName}: schema.fields 不能为空`);
  }

  const seenFieldIds = new Set();
  schema.fields.forEach((field, index) => {
    const fieldLabel = `${formName}: fields[${index}]`;
    if (!field || typeof field !== "object") {
      throw new Error(`${fieldLabel} 必须是对象`);
    }
    const fieldId = String(field.fieldId || "").trim();
    if (!fieldId) {
      throw new Error(`${fieldLabel}.fieldId 不能为空`);
    }
    if (seenFieldIds.has(fieldId)) {
      throw new Error(`${formName}: fieldId 重复: ${fieldId}`);
    }
    seenFieldIds.add(fieldId);
    if (!String(field.componentName || "").trim()) {
      throw new Error(`${fieldLabel}.componentName 不能为空`);
    }
  });
}

export function createFormComponentNode(field, index) {
  const componentName = normalizeComponentName(field.componentName);

  return {
    componentName,
    id: field.id || `${field.fieldId || componentName}_${index + 1}`,
    title: field.label || field.fieldId || componentName,
    hidden: false,
    isLocked: false,
    condition: true,
    conditionGroup: "",
    props: {
      ...field,
      componentName,
      isFormComponent: true,
      fieldId: field.fieldId,
      label: field.label || field.fieldId,
      tips: field.tips || "",
      value: field.value || "",
      placeholder: field.placeholder || "",
    },
  };
}

export function transformToApiFormat(schema, formName = "unknown") {
  validateFormSchema(schema, formName);

  const { formMeta, fields } = schema;
  const formType = normalizeFormType(
    formMeta.formType || schema.template?.formType,
  );
  const componentNodes = fields.map(createFormComponentNode);
  const pageSchema = {
    version: "2.0",
    componentsTree: [
      {
        componentName: "Page",
        id: `${formMeta.formUuid || "form"}_page`,
        props: {},
        children: componentNodes,
      },
    ],
  };

  return {
    formUuid: formMeta.formUuid,
    appType: formMeta.appType,
    formType,
    fieldCount: componentNodes.length,
    schema: JSON.stringify(pageSchema),
    packages: JSON.stringify({}),
  };
}

export function normalizeFormType(formType) {
  const normalized = String(formType || "").trim().toLowerCase();
  if (["process", "workflow", "flow", "flowform", "processform"].includes(normalized)) {
    return "process";
  }
  return "receipt";
}

export function assertSchemaSyncResult(body, expectedFieldCount) {
  if (body?.code !== 200) {
    throw new Error(
      `API 业务失败: ${body?.code || "unknown"} ${body?.message || ""}`,
    );
  }

  if (!isValidTableName(body?.data?.tableName)) {
    throw new Error("API 同步后未返回有效 tableName，表结构可能未创建");
  }

  const actualFieldCount = getObjectSize(body?.data?.formFields);
  if (actualFieldCount !== expectedFieldCount) {
    throw new Error(
      `API 同步后 formFields 数量不匹配，期望 ${expectedFieldCount}，实际 ${actualFieldCount}`,
    );
  }
}

export function assertFormReadyForBundle(formMeta, formName = "unknown") {
  if (!formMeta) {
    throw new Error(`${formName}: 平台未找到表单定义`);
  }
  if (!isValidTableName(formMeta.tableName)) {
    throw new Error(
      `${formName}: 平台表单缺少 tableName，请先运行 pnpm sync-schema --form ${formName}`,
    );
  }
  if (getObjectSize(formMeta.formFields) === 0) {
    throw new Error(
      `${formName}: 平台表单缺少 formFields，请先运行 pnpm sync-schema --form ${formName}`,
    );
  }
}
