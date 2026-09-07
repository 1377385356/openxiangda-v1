# 在 OpenXiangda 1.x 应用中使用家校关系

平台组织中心会把钉钉家校通讯录中的教育班级、家长/学生/教师/班主任身份、老师班级成员和明确监护关系同步为租户级能力。家校组织树直接把学生、家长、老师放在班级部门下，以成员身份字段区分，不再创建“学生/家长/老师”子部门；平台管理员也可以人工创建班级、账号和班级身份。当前 1.x 应用使用 `sdk.organization.schoolContact` 或 `ctx.organization.schoolContact`，不直连钉钉、不查询平台数据库。

## 授权

已登录非游客用户默认可以查询当前租户的全部家校关系，不需要为每个应用角色额外绑定权限。跨租户、游客和匿名访问仍然拒绝。

应用若要显式保留全量范围，可声明：

```json
{
  "apiPermissionCodes": ["app:organization:school-contact:read"]
}
```

只有业务明确需要收紧时，才给应用角色声明 `app:organization:school-contact:self:read` 或 `app:organization:school-contact:class:read`，分别限制为本人或任教班级。同一角色拥有多项能力时按 `all > class > self` 取最宽范围。

## 页面调用

```ts
const response = await sdk.organization.schoolContact.relations.list({
  dingtalkUserId,
  mobile,
  name,
  classId,
  page: 1,
  pageSize: 20,
});

for (const item of response.result?.items || []) {
  console.log(
    item.guardian.userId,
    item.guardian.dingtalkUserId,
    item.guardian.mobile,
    item.guardian.name,
    item.student.userId,
    item.student.dingtalkUserId,
    item.student.mobile,
    item.student.name,
  );
}
```

也可以直接查询指定平台用户的孩子、监护人或当前用户家庭：

```ts
await sdk.organization.schoolContact.children.list(guardianUserId);
await sdk.organization.schoolContact.guardians.list(studentUserId);
await sdk.organization.schoolContact.myFamily.get();
```

班主任是老师在具体班级上的关系，不要只凭全局身份推断班级。查询某个班的班主任：

```ts
const response = await sdk.organization.schoolContact.teachers.list({
  classId,
  isHeadTeacher: true,
  page: 1,
  pageSize: 20,
});

for (const item of response.result?.items || []) {
  console.log(
    item.teacher.userId,
    item.teacher.dingtalkUserId,
    item.teacher.mobile,
    item.teacher.name,
    item.class.id,
    item.class.name,
    item.isHeadTeacher,
    item.source,
    item.teacher.managedClasses,
    item.class.headTeachers,
  );
}
```

平台身份 `SCHOOL_HEAD_TEACHER` 表示此人至少在一个当前班级担任班主任；班主任同时保留 `SCHOOL_TEACHER`。需要知道具体班级时，始终查询 `teachers.list`。返回的 `teacher.managedClasses` 是该老师当前管理的全部班级，`class.headTeachers` 是该班当前全部班主任；因此既可从老师查班级，也可从班级查班主任，无需应用自行反查或复制关系。

## App Function 调用

```ts
export default async function (ctx, input) {
  return await ctx.organization.schoolContact.teachers.list({
    userId: input.teacherUserId,
    isHeadTeacher: true,
    page: 1,
    pageSize: 20,
  });
}
```

返回中的 `guardian`、`student` 和 `teacher` 都包含平台 `userId`、可空 `dingtalkUserId`、`name` 和可空 `mobile`。老师成员另外包含 `class`、布尔值 `isHeadTeacher`、`source`、`teacher.managedClasses` 和 `class.headTeachers`。`source` 为 `dingtalk_school_contact` 或 `manual`。列表响应还带 `sync.enabled`、`sync.state` 和 `sync.lastSuccessfulSyncAt`；同步关闭时数据保留，但应用可据此提示数据可能过期。

人工添加的家长、学生和老师会获得对应的平台身份，并加入指定班级。人工添加班主任会同时获得老师与班主任身份，并立即出现在 `teachers.list` 的双向班主任字段中。人工身份本身不会虚构家长与学生之间的监护关系；只有平台中存在明确监护关系时，`relations`、`children`、`guardians` 和 `myFamily` 才会返回家庭关系。

完整字段、过滤条件和持久化边界见随 CLI 安装的 `openxiangda-skills/references/school-contact-relations.md`。
