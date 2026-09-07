# App Function 角色 API

`AppFunctionContextV2.platform.roles` 是 `trusted_node_v2` 中正式的应用角色接口。它固定访问 `ctx.app.appType`，不能指定其他应用；平台使用真实运行时 operator 校验当前应用的 `app:role:manage` 权限，并把平台调用写入 Function 调用日志。角色和用户查询始终受当前 tenant 约束。

```ts
import type { AppFunctionContextV2 } from "openxiangda"

export default async function maintainMembers(ctx: AppFunctionContextV2) {
  const role = await ctx.platform.roles.findByCode("union_department_admin")
  if (!role) {
    throw new Error("角色 union_department_admin 不存在")
  }

  const added = await ctx.platform.roles.addUsers(role.id, [
    "user-001",
    "user-002",
  ])
  const removed = await ctx.platform.roles.removeUser(role.id, "user-003")

  return {
    roleId: role.id,
    added: added.results.success.map(item => item.userId),
    failed: added.results.failed,
    removed,
  }
}
```

## 调用契约

```ts
ctx.platform.roles.list(params?)
ctx.platform.roles.findByCode(roleCode, params?)
ctx.platform.roles.get(roleId)
ctx.platform.roles.listUsers(roleId, params?)
ctx.platform.roles.addUsers(roleId, userIds)
ctx.platform.roles.removeUser(roleId, userId)
```

- `list` 返回 `{ items, total, page, limit }`，支持 `name`、`code`、`page`、`limit` 和 `pageSize`。
- `findByCode` 返回角色或 `null`。
- `listUsers` 返回 `{ items, total, page, limit }`，支持 `keyword`、`page`、`limit` 和 `pageSize`。
- `addUsers` 返回角色摘要以及逐用户 `success` / `failed` 结果；重复添加会进入 `failed` 并给出原因。
- `removeUser` 成功时返回 `true`，重复移除保持幂等。

不要传入 `appType`。运行时只允许当前应用，跨应用请求会以 `APP_FUNCTION_ROLE_APP_SCOPE_FORBIDDEN`（HTTP 403）失败。不要手工传 Runtime token 或 audit actor，也不要用 `ctx.platform.api` 拼接角色管理接口。
