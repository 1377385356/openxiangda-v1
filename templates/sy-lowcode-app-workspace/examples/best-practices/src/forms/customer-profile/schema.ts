import { createFormSchema } from "@/shared/form-schema";

export default createFormSchema({
  formMeta: {
    formUuid: "",
    appType: process.env.OPENXIANGDA_APP_TYPE || "APP_XXXX",
    title: "客户档案",
  },
  fields: [
    {
      fieldId: "customerName",
      componentName: "TextField",
      label: "客户名称",
      required: true,
      placeholder: "请输入客户或组织名称",
    },
    {
      fieldId: "customerLevel",
      componentName: "SelectField",
      label: "客户等级",
      required: true,
      placeholder: "请选择客户等级",
      options: [
        { label: "重点客户", value: "key" },
        { label: "普通客户", value: "normal" },
        { label: "潜在客户", value: "prospect" },
      ],
    },
    {
      fieldId: "ownerUser",
      componentName: "UserSelectField",
      label: "负责人",
      required: true,
      placeholder: "请选择负责人",
    },
    {
      fieldId: "ownerDept",
      componentName: "DepartmentSelectField",
      label: "负责部门",
      required: true,
      placeholder: "请选择负责部门",
    },
    {
      fieldId: "contactPhone",
      componentName: "TextField",
      label: "联系电话",
      placeholder: "请输入联系电话",
      rules: [{ preset: "phone", message: "请输入有效手机号" }],
    },
    {
      fieldId: "attachments",
      componentName: "AttachmentField",
      label: "附件",
      placeholder: "请上传客户相关附件",
      maxCount: 5,
    },
    {
      fieldId: "contacts",
      componentName: "SubFormField",
      label: "联系人",
      placeholder: "请添加联系人",
      columns: [
        {
          fieldId: "contactName",
          componentName: "TextField",
          label: "姓名",
          required: true,
          placeholder: "请输入联系人姓名",
        },
        {
          fieldId: "contactRole",
          componentName: "TextField",
          label: "角色",
          placeholder: "请输入联系人角色",
        },
        {
          fieldId: "contactMobile",
          componentName: "TextField",
          label: "手机",
          placeholder: "请输入联系人手机",
          rules: [{ preset: "phone", message: "请输入有效手机号" }],
        },
      ],
    },
    {
      fieldId: "remark",
      componentName: "TextAreaField",
      label: "备注",
      placeholder: "记录客户背景、跟进偏好或风险点",
    },
  ],
});
