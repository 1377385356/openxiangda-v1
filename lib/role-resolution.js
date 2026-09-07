const ROLE_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRoleUuid(value) {
  return ROLE_UUID_PATTERN.test(String(value || '').trim());
}

async function resolveRoleMembershipId(options = {}) {
  const roleKey = String(options.roleKey || '').trim();
  const explicitRoleId = String(options.explicitRoleId || '').trim();
  const localRoleId = String(options.localRoleId || '').trim();

  if (explicitRoleId) return explicitRoleId;
  if (isRoleUuid(roleKey)) return roleKey;
  if (localRoleId) return localRoleId;
  if (!roleKey) throw roleResolutionError('ROLE_KEY_REQUIRED', '角色代码或 UUID 不能为空');
  if (typeof options.listRoles !== 'function') {
    throw roleResolutionError('ROLE_LIST_UNAVAILABLE', '无法查询应用角色列表');
  }

  const roles = await options.listRoles(roleKey);
  const matches = (Array.isArray(roles) ? roles : []).filter(
    role => String(role?.code || role?.roleCode || '').trim() === roleKey
  );
  if (matches.length === 0) {
    throw roleResolutionError(
      'ROLE_CODE_NOT_FOUND',
      `应用角色代码 ${roleKey} 不存在；请先创建角色或使用 role-bind/角色 UUID`
    );
  }
  if (matches.length > 1) {
    throw roleResolutionError(
      'ROLE_CODE_AMBIGUOUS',
      `应用角色代码 ${roleKey} 匹配到 ${matches.length} 个角色，无法安全确定 role UUID`
    );
  }

  const roleId = String(matches[0]?.id || matches[0]?.roleId || '').trim();
  if (!roleId) {
    throw roleResolutionError(
      'ROLE_ID_MISSING',
      `应用角色代码 ${roleKey} 的查询结果缺少 role UUID`
    );
  }
  return roleId;
}

function roleResolutionError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

module.exports = {
  isRoleUuid,
  resolveRoleMembershipId,
};
