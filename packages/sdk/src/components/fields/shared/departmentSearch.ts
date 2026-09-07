import type { DepartmentSearchResult, DepartmentTreeNode, FormRuntimeApi } from '../../types';
import { getDepartmentName, normalizeDepartmentNode } from './fieldFormat';

export interface DepartmentSearchNode extends DepartmentTreeNode {
  path?: Array<{ id: string; name: string }>;
  fullPath?: string;
}

export function canSearchAllDepartments(api: FormRuntimeApi, configuredTreeData?: DepartmentTreeNode[]) {
  return !configuredTreeData?.length && typeof api.searchDepartments === 'function';
}

export function normalizeDepartmentSearchItems(
  result: DepartmentSearchResult | DepartmentTreeNode[] | any,
): DepartmentSearchNode[] {
  const data = result?.data || result?.result || result;
  const source = Array.isArray(data) ? data : data?.items || data?.list || [];
  return source
    .map((item: any) => normalizeDepartmentNode(item))
    .filter((item: DepartmentTreeNode) => item.id) as DepartmentSearchNode[];
}

export function getDepartmentPathText(
  department: Partial<DepartmentSearchNode> | any,
  separator = '/',
) {
  const path = Array.isArray(department?.path) ? department.path : [];
  const pathText = path
    .map((item: any) => item?.name)
    .filter(Boolean)
    .join(separator);
  return pathText || String(department?.fullPath || getDepartmentName(department) || '');
}

