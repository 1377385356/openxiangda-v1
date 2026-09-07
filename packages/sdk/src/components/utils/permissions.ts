import type { FieldBehavior, ViewPermissionSummary } from '../types';

const OPERATION_ALIASES: Record<string, string> = {
  VIEW: 'view',
  EDIT: 'edit',
  DELETE: 'delete',
  VIEW_CHANGE_RECORDS: 'change_records',
  CHANGE_RECORDS: 'change_records',
  VIEW_PROCESS: 'workflow',
  WORKFLOW: 'workflow',
};

export function normalizeOperation(operation?: string): string {
  const raw = String(operation || '').trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();
  return OPERATION_ALIASES[upper] || raw.toLowerCase();
}

export function hasViewOperation(operations: string[] | undefined, expected: string): boolean {
  const normalized = new Set((operations || []).map(normalizeOperation));
  return normalized.has(normalizeOperation(expected));
}

export function normalizeFieldBehaviors(
  permissions: ViewPermissionSummary | null | undefined,
  mode: 'readonly' | 'edit',
): Record<string, FieldBehavior> {
  const behaviors: Record<string, FieldBehavior> = {};
  Object.entries(permissions?.fieldPermissions || {}).forEach(([fieldId, value]) => {
    if (value === 'FORM_FILED_HIDDEN') {
      behaviors[fieldId] = 'HIDDEN';
    } else if (value === 'FORM_FILED_EDIT') {
      behaviors[fieldId] = mode === 'edit' ? 'NORMAL' : 'READONLY';
    } else {
      behaviors[fieldId] = 'READONLY';
    }
  });
  return behaviors;
}

export function hasViewPermission(permissions: ViewPermissionSummary | null | undefined): boolean {
  const operations = permissions?.operations || [];
  return operations.length === 0 ? false : hasViewOperation(operations, 'view');
}
