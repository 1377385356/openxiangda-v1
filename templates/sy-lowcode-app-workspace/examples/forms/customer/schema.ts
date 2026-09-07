import { createFormSchema } from "../../../src/shared/form-schema";

export default createFormSchema({
  formMeta: {
    formUuid: "",
    appType: process.env.OPENXIANGDA_APP_TYPE || "APP_XXXX",
    title: "客户信息",
  },
  fields: [
    {
      fieldId: "customer_name",
      componentName: "TextField",
      label: "客户名称",
      required: true,
      rules: [{ required: true, message: "请填写客户名称" }],
      placeholder: "请输入客户名称",
    },
    {
      fieldId: "customer_phone",
      componentName: "TextField",
      label: "联系电话",
      rules: [{ preset: "phone", message: "请输入有效手机号" }],
      placeholder: "请输入联系电话",
    },
    {
      fieldId: "customer_type",
      componentName: "SelectField",
      label: "客户类型",
      placeholder: "请选择客户类型",
      options: [
        { value: "enterprise", label: "企业客户" },
        { value: "individual", label: "个人客户" },
      ],
    },
  ],
});
