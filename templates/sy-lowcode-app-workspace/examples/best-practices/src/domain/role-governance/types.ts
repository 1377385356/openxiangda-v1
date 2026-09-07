export interface AppRoleRecord {
  formInstanceId: string;
  roleCode: string;
  roleName: string;
  members?: Array<{ label: string; value: string }>;
  collegeScope?: { label: string; value: string };
  classScope?: { label: string; value: string };
  collegeScopeKey?: string;
  classScopeKey?: string;
  enabled?: { label: string; value: "enabled" | "disabled" };
  lastSyncedAt?: string;
}

export interface DataOwnershipFields {
  collegeScopeKey?: string;
  classScopeKey?: string;
  ownerDeptScopeKey?: string;
  ownerUserScopeKey?: string;
}
