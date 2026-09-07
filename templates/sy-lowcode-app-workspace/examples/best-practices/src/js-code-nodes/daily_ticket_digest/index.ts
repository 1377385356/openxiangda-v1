export default async function dailyTicketDigest(ctx: any) {
  const appType = ctx.app.appType;
  const pageSize = 50;
  let currentPage = 1;
  let total = 0;
  let riskCount = 0;

  while (currentPage <= 20) {
    const result = await ctx.methods.queryManyData(appType, "FORM_SERVICE_TICKET", {
      currentPage,
      pageSize,
      filters: {
        logic: "AND",
        rules: [
          {
            key: "status",
            componentName: "SelectField",
            operator: "IN",
            value: ["new", "accepted", "processing", "paused"],
          },
        ],
      },
    });
    const rows = result?.data || result?.list || [];
    total += rows.length;
    riskCount += rows.filter((row: any) => row.priority?.value === "urgent").length;
    if (rows.length < pageSize) break;
    currentPage += 1;
  }

  if (total > 0 && ctx.operator?.userId) {
    await ctx.notification.sendByType({
      notificationType: "daily_ticket_digest",
      recipientId: ctx.operator.userId,
      payload: {
        title: "每日工单摘要",
        count: total,
        riskCount,
      },
    });
  }

  return { total, riskCount };
}
