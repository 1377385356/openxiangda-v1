import type { AttachmentItem, DepartmentTreeNode, UserDisplayFormat, UserItem } from '../../types';

export const EMPTY_TEXT = '--';

export function createUid(prefix = 'field') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getUserId(user: Partial<UserItem> | any): string {
  if (typeof user === 'string' || typeof user === 'number') return String(user).trim();
  return String(user?.id || user?.userId || user?.userid || user?.value || user?.key || '').trim();
}

export function getUserName(user: Partial<UserItem> | any): string {
  if (typeof user === 'string' || typeof user === 'number') return String(user).trim();
  return String(
    user?.name || user?.label || user?.title || user?.username || user?.nickname || getUserId(user),
  );
}

export function normalizeUser(user: any): UserItem {
  const id = getUserId(user);
  const source = typeof user === 'object' && user !== null ? user : {};
  return {
    ...source,
    id,
    name: getUserName({ ...source, id }),
  };
}

export function normalizeUserArray(value: any): UserItem[] {
  const source = Array.isArray(value)
    ? value
    : value === undefined || value === null || value === ''
      ? []
      : [value];
  return source.map(normalizeUser).filter((user) => getUserId(user));
}

export function getDepartmentId(node: Partial<DepartmentTreeNode> | any): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node).trim();
  return String(
    node?.id || node?.departmentId || node?.deptId || node?.value || node?.key || '',
  ).trim();
}

export function getDepartmentName(node: Partial<DepartmentTreeNode> | any): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node).trim();
  return String(
    node?.name ||
      node?.label ||
      node?.title ||
      node?.deptName ||
      node?.departmentName ||
      getDepartmentId(node),
  );
}

export function normalizeDepartmentNode(node: any): DepartmentTreeNode {
  const id = getDepartmentId(node);
  const source = typeof node === 'object' && node !== null ? node : {};
  const name = getDepartmentName({ ...source, id });
  const hasChildren =
    typeof node?.hasChildren === 'boolean'
      ? node.hasChildren
      : Array.isArray(node?.children) && node.children.length > 0;
  const children = Array.isArray(node?.children)
    ? node.children.map((child: any) => normalizeDepartmentNode(child))
    : undefined;
  return {
    ...source,
    id,
    name,
    key: String(node?.key || id),
    title: String(node?.title || name),
    hasChildren,
    isLeaf: typeof node?.isLeaf === 'boolean' ? node.isLeaf : !hasChildren,
    children,
  };
}

export function normalizeDepartmentArray(value: any): DepartmentTreeNode[] {
  const source = Array.isArray(value)
    ? value
    : value === undefined || value === null || value === ''
      ? []
      : [value];
  return source.map(normalizeDepartmentNode).filter((dept) => getDepartmentId(dept));
}

export function flattenDepartments(nodes: DepartmentTreeNode[]) {
  const result: Array<{ id: string; name: string; node: DepartmentTreeNode }> = [];
  const walk = (items: DepartmentTreeNode[]) => {
    for (const node of items) {
      const id = getDepartmentId(node);
      if (id) result.push({ id, name: getDepartmentName(node), node });
      if (node.children?.length) walk(node.children);
    }
  };
  walk(nodes);
  return result;
}

/**
 * 格式化用户显示名称
 */
export function formatUserDisplay(user: UserItem, format?: UserDisplayFormat): string {
  const normalized = normalizeUser(user);
  if (!format || format === 'name') return normalized.name;
  switch (format) {
    case 'nameWithJobNumber':
      return normalized.jobNumber
        ? `${normalized.name}（${normalized.jobNumber}）`
        : normalized.name;
    case 'nameWithDepartment':
      return normalized.departments?.[0]?.name
        ? `${normalized.name}（${normalized.departments[0].name}）`
        : normalized.name;
    default:
      return normalized.name;
  }
}

/**
 * 获取部门全路径（从根节点到目标节点）
 */
export function getDepartmentFullPath(deptId: string, treeData?: DepartmentTreeNode[]): string {
  if (!treeData) return '';
  const path: string[] = [];

  function findPath(nodes: DepartmentTreeNode[], target: string): boolean {
    for (const node of nodes) {
      path.push(getDepartmentName(node));
      if (getDepartmentId(node) === target) return true;
      if (node.children && findPath(node.children, target)) return true;
      path.pop();
    }
    return false;
  }

  findPath(treeData, deptId);
  return path.join('/');
}

/**
 * 过滤部门树，只保留指定部门及其子树
 */
export function filterTreeByScope(
  treeData: DepartmentTreeNode[],
  scopeType?: 'all' | 'specified',
  specifiedDepts?: string[],
): DepartmentTreeNode[] {
  if (!scopeType || scopeType === 'all' || !specifiedDepts?.length) {
    return treeData;
  }
  const specifiedSet = new Set(specifiedDepts);

  function filterNodes(nodes: DepartmentTreeNode[]): DepartmentTreeNode[] {
    const result: DepartmentTreeNode[] = [];
    for (const node of nodes) {
      const nodeId = getDepartmentId(node);
      if (specifiedSet.has(nodeId)) {
        // 保留此节点及其全部子树
        result.push(node);
      } else if (node.children?.length) {
        // 递归检查子节点
        const filteredChildren = filterNodes(node.children);
        if (filteredChildren.length > 0) {
          result.push({ ...node, children: filteredChildren });
        }
      }
    }
    return result;
  }

  return filterNodes(treeData);
}

export function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${Number(value.toFixed(value >= 10 || index === 0 ? 0 : 1))} ${units[index]}`;
}

export function getFileExtension(fileName?: string): string {
  return (
    String(fileName || '')
      .split('.')
      .pop()
      ?.toLowerCase() || ''
  );
}

export function isImageFile(fileName?: string, contentType?: string): boolean {
  return (
    String(contentType || '').startsWith('image/') ||
    [
      'jpg',
      'jpeg',
      'png',
      'gif',
      'bmp',
      'svg',
      'webp',
      'avif',
      'ico',
      'heic',
      'heif',
      'tif',
      'tiff',
    ].includes(getFileExtension(fileName))
  );
}

export function getFileCategory(fileName?: string, contentType?: string) {
  const ext = getFileExtension(fileName);
  if (isImageFile(fileName, contentType)) return 'image';
  if (['mp4', 'webm', 'ogg', 'mov', 'm4v'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'aac', 'flac', 'm4a', 'ogg'].includes(ext)) return 'audio';
  if (ext === 'pdf') return 'pdf';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'excel';
  if (['doc', 'docx'].includes(ext)) return 'word';
  if (['ppt', 'pptx'].includes(ext)) return 'ppt';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
  if (['txt', 'json', 'xml', 'log', 'md'].includes(ext)) return 'text';
  if (['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'scss', 'less', 'java', 'py'].includes(ext)) {
    return 'code';
  }
  return 'file';
}

export function normalizeAttachmentItem(
  item: any,
  fallback?: Partial<AttachmentItem>,
): AttachmentItem {
  const id = String(item?.id || item?.uid || item?.objectName || fallback?.id || createUid('file'));
  const name = String(item?.name || item?.originalName || fallback?.name || item?.fileName || id);
  return {
    ...fallback,
    ...item,
    id,
    uid: String(item?.uid || item?.id || fallback?.uid || id),
    name,
    originalName: item?.originalName || fallback?.originalName || name,
    url: String(item?.url || item?.downloadUrl || item?.previewUrl || fallback?.url || ''),
    thumbUrl: item?.thumbUrl || item?.variants?.thumb?.url || fallback?.thumbUrl,
    previewUrl: item?.previewUrl || item?.variants?.preview?.url || fallback?.previewUrl,
    downloadUrl: item?.downloadUrl || fallback?.downloadUrl,
    publicUrl: item?.publicUrl || fallback?.publicUrl,
    status: item?.status || fallback?.status || 'done',
    size: item?.size ?? fallback?.size,
    percent: item?.percent ?? fallback?.percent,
    contentType: item?.contentType || item?.mimeType || fallback?.contentType,
    mimeType: item?.mimeType || item?.contentType || fallback?.mimeType,
    extension: item?.extension || fallback?.extension || getFileExtension(name),
    width: item?.width ?? fallback?.width,
    height: item?.height ?? fallback?.height,
    variants: item?.variants || fallback?.variants,
  };
}

export function getAttachmentItemIdentity(item: Partial<AttachmentItem> | any): string {
  return String(item?.uid || item?.id || item?.objectName || item?.url || item?.name || '');
}

export function dedupeAttachmentItems(items: AttachmentItem[]): AttachmentItem[] {
  const result: AttachmentItem[] = [];
  const indexes = new Map<string, number>();

  for (const item of items) {
    const key = getAttachmentItemIdentity(item);
    if (!key) {
      result.push(item);
      continue;
    }

    const existingIndex = indexes.get(key);
    if (existingIndex === undefined) {
      indexes.set(key, result.length);
      result.push(item);
      continue;
    }

    result[existingIndex] = {
      ...result[existingIndex],
      ...item,
    };
  }

  return result;
}
