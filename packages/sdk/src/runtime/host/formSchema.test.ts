import { describe, expect, it } from "vitest";
import {
  extractFieldsFromComponentsTree,
  normalizeRuntimeFormSchema,
} from "./formSchema";

describe("runtime form schema normalization", () => {
  it("extracts platform form fields from componentsTree and slot props", () => {
    const fields = extractFieldsFromComponentsTree({
      componentName: "Page",
      props: {
        footer: {
          type: "JSSlot",
          value: [
            {
              componentName: "NumberField",
              id: "slot_number",
              props: {
                isFormComponent: true,
                fieldId: "estimateHours",
                label: "预估工时",
              },
            },
          ],
        },
      },
      children: [
        {
          componentName: "TextField",
          id: "title_node",
          title: "需求标题",
          props: {
            isFormComponent: true,
            fieldId: "requestTitle",
            label: "需求标题",
            required: true,
          },
        },
        {
          componentName: "SubFormField",
          id: "items_node",
          title: "明细",
          props: {
            isFormComponent: true,
            fieldId: "items",
            label: "明细",
          },
          children: [
            {
              componentName: "TextField",
              id: "nested_item_name",
              props: {
                isFormComponent: true,
                fieldId: "itemName",
                label: "明细名称",
              },
            },
          ],
        },
      ],
    });

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: "requestTitle",
          componentName: "TextField",
          label: "需求标题",
          required: true,
        }),
        expect.objectContaining({
          fieldId: "estimateHours",
          componentName: "NumberField",
          label: "预估工时",
        }),
        expect.objectContaining({
          fieldId: "items",
          componentName: "SubFormField",
          label: "明细",
        }),
      ]),
    );
    expect(fields.map(field => field.fieldId)).not.toContain("itemName");
  });

  it("converts platform schema payloads into SDK FormSchema shape", () => {
    const schema = normalizeRuntimeFormSchema(
      {
        code: 200,
        data: {
          name: "流程申请",
          formType: "process",
          schema: {
            version: "2.0",
            componentsTree: [
              {
                componentName: "Page",
                children: [
                  {
                    componentName: "TextAreaField",
                    id: "reason_node",
                    title: "申请说明",
                    props: {
                      isFormComponent: true,
                      fieldId: "reason",
                      label: "申请说明",
                    },
                  },
                ],
              },
            ],
          },
        },
      },
      { appType: "APP_DEMO", formUuid: "FORM_DEMO" },
    );

    expect(schema).toEqual(
      expect.objectContaining({
        fields: [
          expect.objectContaining({
            fieldId: "reason",
            componentName: "TextAreaField",
          }),
        ],
        layout: [expect.objectContaining({ type: "field", fieldId: "reason" })],
        formMeta: expect.objectContaining({
          appType: "APP_DEMO",
          formUuid: "FORM_DEMO",
          title: "流程申请",
        }),
        template: expect.objectContaining({
          type: "standard",
          formType: "process",
        }),
      }),
    );
  });
});
