import { createFormSchema } from "@/shared/form-schema";

export default createFormSchema({
  formMeta: {
    formUuid: "",
    appType: process.env.OPENXIANGDA_APP_TYPE || "APP_XXXX",
    title: "工单操作日志",
  },
  fields: [
    {
      fieldId: "ticketId",
      componentName: "TextField",
      label: "工单实例 ID",
      required: true,
    },
    {
      fieldId: "action",
      componentName: "SelectField",
      label: "动作",
      required: true,
      options: [
        { label: "受理", value: "accept" },
        { label: "开始处理", value: "start" },
        { label: "挂起", value: "pause" },
        { label: "恢复", value: "resume" },
        { label: "解决", value: "resolve" },
        { label: "关闭", value: "close" },
        { label: "取消", value: "cancel" },
      ],
    },
    {
      fieldId: "fromStatus",
      componentName: "TextField",
      label: "原状态",
    },
    {
      fieldId: "toStatus",
      componentName: "TextField",
      label: "新状态",
      required: true,
    },
    {
      fieldId: "operatorId",
      componentName: "TextField",
      label: "操作者 ID",
      required: true,
    },
    {
      fieldId: "operatorName",
      componentName: "TextField",
      label: "操作者",
    },
    {
      fieldId: "comment",
      componentName: "TextAreaField",
      label: "说明",
    },
    {
      fieldId: "operatedAt",
      componentName: "DateField",
      label: "操作时间",
      required: true,
    },
  ],
});
