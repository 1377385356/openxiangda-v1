# 家校通讯录关系

家校关系由平台组织中心统一同步和维护。同步成员和人工成员都直接位于班级部门下，通过 `guardian`、`student`、`teacher` 和班主任标记区分，不再依赖“家长/学生/老师”子部门。应用不得直连钉钉，也不得根据班级成员自行推断家长和学生关系。

## 权限与默认范围

已登录非游客用户无需给应用角色绑定家校权限，默认查询当前租户的全部关系，范围为 `all`。跨租户、游客和匿名访问仍然拒绝。

应用若要显式保留全量范围，可以在 `src/resources/roles/<code>.json` 中声明：

```json
{
  "apiPermissionCodes": ["app:organization:school-contact:read"]
}
```

`app:organization:school-contact:read` 与未声明权限时的默认范围相同。只有产品明确要求收紧时，才改用以下权限之一：

- `app:organization:school-contact:self:read`：只返回当前操作者作为家长或学生直接参与的关系。
- `app:organization:school-contact:class:read`：只返回当前操作者以 `teacher` 身份加入的班级关系。

同一应用角色拥有多项家校能力时按 `all > class > self` 取最宽范围。平台身份角色只表达用户身份，不参与通用应用权限计算；默认 `all` 由家校关系服务统一执行。

默认全量可见不等于公开访问：跨租户、游客和匿名页面仍然拒绝。不要通过公开访问策略给游客授予家庭关系能力。

## 页面 SDK

### 平台内置身份角色

每次成功的钉钉家校通讯录全量同步都会对账并维护四种平台层系统身份角色：

| 展示名 | 稳定角色编码          | 含义                                          |
| ------ | --------------------- | --------------------------------------------- |
| 家长   | `SCHOOL_GUARDIAN`     | 在家校成员关系中作为 guardian                 |
| 学生   | `SCHOOL_STUDENT`      | 在家校成员关系中作为 student                  |
| 老师   | `SCHOOL_TEACHER`      | 在家校成员关系中作为 teacher                  |
| 班主任 | `SCHOOL_HEAD_TEACHER` | 至少一个 teacher 班级成员带 `is_adviser=true` |

身份角色可组合，一个平台用户可以同时是老师和家长；角色由同步维护，不能在平台角色管理中手工分配、修改、删除，也不会被当前平台角色切换隐藏。应用权限组把这些编码填入 `platformRoleCodes`，与应用角色 `roles` 是并列的 OR 条件；两个数组都为空仍表示不限制。

运行时页面权限会在 `permissions.platformRoleCodes` 返回当前用户的身份编码，它与 `permissions.roleCodes` 分开：

```ts
const isGuardian =
  sdk.context.permissions?.platformRoleCodes?.includes("SCHOOL_GUARDIAN");

const isHeadTeacher = sdk.context.permissions?.platformRoleCodes?.includes(
  "SCHOOL_HEAD_TEACHER",
);
```

`SCHOOL_HEAD_TEACHER` 只说明当前用户至少担任一个班的班主任。班主任是班级维度的关系；要判断具体班级，必须使用下方 `teachers.list` 返回的 `isHeadTeacher`，不能用全局角色推断。

App Function 的调用受众可以声明平台身份角色，服务端按真实操作者的同步结果校验：

```json
{
  "runtimeInvoke": {
    "audience": {
      "type": "platform_roles",
      "platformRoleCodes": ["SCHOOL_GUARDIAN", "SCHOOL_TEACHER"]
    }
  }
}
```

函数可信上下文同时提供 `ctx.operator.platformRoleCodes` 和 `ctx.permissions.platformRoleCodes`。不要信任页面输入中的角色编码；需要家庭双方或班级关系时，继续使用下方的 `schoolContact` 关系 SDK。

在 React SPA 或代码页中通过 Page SDK 查询，不要硬编码接口地址：

```ts
const response = await sdk.organization.schoolContact.relations.list({
  name: keyword,
  classId,
  page: 1,
  pageSize: 20,
});

const relations = response.result?.items || [];
```

常用方法：

```ts
await sdk.organization.schoolContact.children.list(guardianUserId, {
  page: 1,
  pageSize: 20,
});

await sdk.organization.schoolContact.guardians.list(studentUserId, {
  page: 1,
  pageSize: 20,
});

await sdk.organization.schoolContact.myFamily.get({ pageSize: 50 });

await sdk.organization.schoolContact.teachers.list({
  classId,
  isHeadTeacher: true,
  page: 1,
  pageSize: 20,
});
```

`teachers.list` 的每个结果同时提供两个方向的班主任信息：

- `teacher.managedClasses`：该老师当前作为班主任管理的全部班级。
- `class.headTeachers`：该班级当前的全部班主任。
- `source`：班级身份来源，值为 `dingtalk_school_contact` 或 `manual`。

这两个字段可直接用于“我管理的班级”和“班级班主任”场景，不要在应用中自行维护第二份映射。

关系列表支持以下服务端过滤条件：

- `userId`、`guardianUserId`、`studentUserId`：平台用户 ID。
- `dingtalkUserId`：钉钉 userid。
- `mobile`：精确手机号。
- `name`：家长或学生姓名。
- `classId`：平台家校班级 ID 或钉钉教育 `class_id`。
- `role`：`guardian` 或 `student`，用于限定通用人员过滤作用在哪一端。
- `relationCode`、`page`、`pageSize`；`pageSize` 最大为 100。

老师班级成员列表 `teachers.list` 支持：

- `userId`：老师的平台用户 ID。
- `dingtalkUserId`：老师的钉钉 userid。
- `mobile`：精确手机号。
- `name`：老师姓名。
- `classId`：平台家校班级 ID 或钉钉教育 `class_id`。
- `isHeadTeacher`：布尔值；`true` 只返回班主任，`false` 只返回普通任课老师。
- `page`、`pageSize`；`pageSize` 最大为 100。

## App Function

App Function、Automation 或 Workflow 中需要复用关系时，调用对应的受控后端桥接：

```ts
export default async function (ctx, input) {
  const result = await ctx.organization.schoolContact.relations.list({
    guardianUserId: input.guardianUserId,
    page: 1,
    pageSize: 20,
  });

  return result.items;
}
```

查询某位老师担任班主任的班级：

```ts
export default async function (ctx, input) {
  return await ctx.organization.schoolContact.teachers.list({
    userId: input.teacherUserId,
    isHeadTeacher: true,
    page: 1,
    pageSize: 100,
  });
}
```

对应方法为：

```ts
ctx.organization.schoolContact.relations.list(params);
ctx.organization.schoolContact.teachers.list(params);
ctx.organization.schoolContact.children.list(userId, params);
ctx.organization.schoolContact.guardians.list(userId, params);
ctx.organization.schoolContact.myFamily.get(params);
```

运行时使用平台提供的真实操作者做权限校验。不要信任页面 input 中伪造的租户、角色或当前用户 ID。

## 返回结构

```ts
interface SchoolContactRelation {
  relationId: string;
  relationCode: string | null;
  relationName: string | null;
  guardian: {
    userId: string;
    dingtalkUserId: string | null;
    name: string;
    mobile: string | null;
  };
  student: {
    userId: string;
    dingtalkUserId: string | null;
    name: string;
    mobile: string | null;
  };
  class: {
    id: string;
    dingtalkClassId: string;
    name: string;
    campusName: string | null;
    periodName: string | null;
    gradeName: string | null;
  };
  syncedAt: string;
  syncState: "current" | "not_synced" | "disabled";
}
```

老师班级成员的返回项为：

```ts
interface SchoolContactTeacherMembership {
  membershipId: string;
  teacher: {
    userId: string;
    dingtalkUserId: string | null;
    name: string;
    mobile: string | null;
    managedClasses: SchoolContactRelation["class"][];
  };
  class: SchoolContactRelation["class"] & {
    headTeachers: Array<{
      userId: string;
      dingtalkUserId: string | null;
      name: string;
      mobile: string | null;
    }>;
  };
  isHeadTeacher: boolean;
  source: "dingtalk_school_contact" | "manual";
  syncedAt: string;
  syncState: "current" | "not_synced" | "disabled";
}
```

手机号可能为空。`sync.state=disabled` 表示管理员关闭了后续同步，现有数据仍保留但可能过期；业务页面在对时效敏感时应展示 `lastSuccessfulSyncAt`。

平台管理员人工添加的班级身份也会由 `teachers.list` 返回，并标记 `source=manual`。人工家长/学生身份会维护对应平台身份和班级归属，但不会自动生成监护关系；只有明确存在的家庭关系才会出现在 `relations`、`children`、`guardians` 和 `myFamily`。

## 持久化边界

- 平台关系是当前事实，不要复制全量关系到应用表单或 Data View。
- 业务单据确实需要历史证据时，只保存 `relationId`、双方平台用户 ID 和当时的最小显示快照。
- 不保存或依赖 `unionid`、同步原文、行业部门 ID，也不要假设行业 `dept_id` 等于教育 `class_id`。
- 所有列表保持分页；不要拉取全部关系后在浏览器过滤。
