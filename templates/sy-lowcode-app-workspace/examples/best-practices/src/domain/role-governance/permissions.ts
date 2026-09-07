import type { AppRoleRecord, DataOwnershipFields } from "./types";

export function buildRoleCode(role: Pick<AppRoleRecord, "roleCode">) {
  return role.roleCode.trim().replace(/\s+/g, "_").toLowerCase();
}

function scopeKey(value: { value?: string | number } | undefined) {
  return value?.value === undefined || value.value === null ? "" : String(value.value);
}

export function deriveRoleScopeKeys(
  role: Pick<AppRoleRecord, "collegeScope" | "classScope">,
) {
  return {
    collegeScopeKey: scopeKey(role.collegeScope),
    classScopeKey: scopeKey(role.classScope),
  };
}

export function buildConditionDataPermission(scope: DataOwnershipFields) {
  const rules = Object.entries(scope)
    .filter(([, value]) => Boolean(value))
    .map(([field, value]) => ({
      field,
      componentType: "Text",
      op: "=",
      value,
    }));

  return {
    type: "condition" as const,
    condition: {
      logic: "AND" as const,
      rules,
    },
  };
}
