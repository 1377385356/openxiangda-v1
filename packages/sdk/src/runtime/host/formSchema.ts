import {
  extractFieldsFromComponentsTree,
  normalizeDataManagementFields,
} from "../../components/core/dataManagementApi";
import type { FieldDefinition, FormSchema } from "../../components/types";

export { extractFieldsFromComponentsTree };

export interface NormalizeRuntimeFormSchemaOptions {
  appType: string;
  formUuid: string;
}

const createDefaultLayout = (fields: FieldDefinition[]) =>
  fields.map(field => ({
    id: `layout_${field.fieldId}`,
    type: "field" as const,
    fieldId: field.fieldId,
  }));

export const normalizeRuntimeFormSchema = (
  payload: any,
  options: NormalizeRuntimeFormSchemaOptions,
): FormSchema | undefined => {
  const normalized = normalizeDataManagementFields(payload);
  if (normalized.schema) return normalized.schema;

  const body = payload?.data ?? payload?.result ?? payload;
  const rawSchema = body?.schema || body?.formSchema || body?.publishedSchema || body;
  if (!rawSchema) return undefined;

  const fields = Array.isArray(rawSchema.fields)
    ? rawSchema.fields
    : extractFieldsFromComponentsTree(rawSchema.componentsTree);
  if (!Array.isArray(fields) || fields.length === 0) return undefined;

  return {
    ...rawSchema,
    fields,
    layout: rawSchema.layout || createDefaultLayout(fields),
    formMeta: {
      appType: options.appType,
      formUuid: options.formUuid,
      title: rawSchema.formMeta?.title || body?.title || body?.name || options.formUuid,
      ...(rawSchema.formMeta || {}),
    },
    template: {
      type: "standard",
      ...(rawSchema.template || {}),
      formType: rawSchema.template?.formType || body?.formType,
    },
  } as FormSchema;
};
