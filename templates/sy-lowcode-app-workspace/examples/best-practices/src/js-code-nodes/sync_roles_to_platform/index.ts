export default async function syncRolesToPlatform(ctx: any) {
  const appType = ctx.app.appType;
  const roles = await ctx.methods.queryManyData(appType, "FORM_APP_ROLE", {
    currentPage: 1,
    pageSize: 100,
    filters: {
      logic: "AND",
      rules: [
        {
          key: "enabled",
          componentName: "RadioField",
          operator: "EQ",
          value: "enabled",
        },
      ],
    },
  });

  const rows = roles?.data || roles?.list || [];
  const synced: string[] = [];
  for (const row of rows) {
    const roleCode = String(row.roleCode || "").trim().toLowerCase();
    if (!roleCode) continue;
    await ctx.platform.api.post(`apps/${appType}/roles`, {
      code: roleCode,
      name: row.roleName || roleCode,
      description: "由业务角色维护表同步",
    });
    synced.push(roleCode);
  }

  return { synced };
}
