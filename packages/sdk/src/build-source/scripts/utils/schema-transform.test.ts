// @ts-nocheck
import { describe, expect, it } from "vitest";

import {
  assertFormReadyForBundle,
  assertSchemaSyncResult,
  transformToApiFormat,
} from "./schema-transform.mjs";

describe("schema-transform", () => {
  it("builds form component nodes with stable field metadata", () => {
    const payload = transformToApiFormat(
      {
        formMeta: {
          formUuid: "FORM_1",
          appType: "APP_1",
          title: "客户信息登记",
        },
        fields: [
          {
            fieldId: "customer_name",
            componentName: "TextField",
            label: "客户名称",
          },
          {
            fieldId: "remark",
            componentName: "TextAreaField",
            label: "备注",
          },
        ],
      },
      "customer-info",
    );

    const schema = JSON.parse(payload.schema);
    const nodes = schema.componentsTree[0].children;

    expect(payload.formType).toBe("receipt");
    expect(payload.fieldCount).toBe(2);
    expect(nodes[0].props).toMatchObject({
      fieldId: "customer_name",
      componentName: "TextField",
      isFormComponent: true,
    });
    expect(nodes[1].props).toMatchObject({
      fieldId: "remark",
      componentName: "TextareaField",
      isFormComponent: true,
    });
  });

  it("normalizes process form type from form meta or template", () => {
    const fromMeta = transformToApiFormat(
      {
        formMeta: {
          formUuid: "FORM_PROCESS_META",
          appType: "APP_1",
          title: "审批表单",
          formType: "process",
        },
        fields: [{ fieldId: "title", componentName: "TextField", label: "标题" }],
      },
      "process-meta",
    );
    const fromTemplate = transformToApiFormat(
      {
        formMeta: {
          formUuid: "FORM_PROCESS_TEMPLATE",
          appType: "APP_1",
          title: "审批表单",
        },
        template: { formType: "workflow" },
        fields: [{ fieldId: "title", componentName: "TextField", label: "标题" }],
      },
      "process-template",
    );

    expect(fromMeta.formType).toBe("process");
    expect(fromTemplate.formType).toBe("process");
  });

  it("rejects duplicate field ids and empty fields", () => {
    expect(() =>
      transformToApiFormat(
        {
          formMeta: { formUuid: "FORM_1", appType: "APP_1", title: "表单" },
          fields: [],
        },
        "empty-form",
      ),
    ).toThrow("schema.fields 不能为空");

    expect(() =>
      transformToApiFormat(
        {
          formMeta: { formUuid: "FORM_1", appType: "APP_1", title: "表单" },
          fields: [
            { fieldId: "name", componentName: "TextField", label: "姓名" },
            { fieldId: "name", componentName: "TextField", label: "姓名2" },
          ],
        },
        "duplicate-form",
      ),
    ).toThrow("fieldId 重复: name");
  });

  it("validates schema sync response before treating publish as ready", () => {
    expect(() =>
      assertSchemaSyncResult(
        {
          code: 200,
          data: {
            tableName: "form_app_1",
            formFields: {
              customer_name: {},
              remark: {},
            },
          },
        },
        2,
      ),
    ).not.toThrow();

    expect(() =>
      assertSchemaSyncResult(
        {
          code: 200,
          data: {
            tableName: "null",
            formFields: { customer_name: {} },
          },
        },
        1,
      ),
    ).toThrow("有效 tableName");

    expect(() =>
      assertSchemaSyncResult(
        {
          code: 200,
          data: {
            tableName: "form_app_1",
            formFields: { customer_name: {} },
          },
        },
        2,
      ),
    ).toThrow("formFields 数量不匹配");
  });

  it("rejects bundle registration before backend schema is initialized", () => {
    expect(() =>
      assertFormReadyForBundle(
        {
          tableName: "",
          formFields: { customer_name: {} },
        },
        "customer-info",
      ),
    ).toThrow("缺少 tableName");

    expect(() =>
      assertFormReadyForBundle(
        {
          tableName: "form_app_1",
          formFields: {},
        },
        "customer-info",
      ),
    ).toThrow("缺少 formFields");
  });
});
