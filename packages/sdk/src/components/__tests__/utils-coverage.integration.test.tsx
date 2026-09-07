import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ================================================================
// confirmAction tests (63.63% → targeting 100%)
// ================================================================
describe('confirmAction', () => {
  let originalConfirm: typeof window.confirm;

  beforeEach(() => {
    originalConfirm = window.confirm;
  });

  afterEach(() => {
    window.confirm = originalConfirm;
  });

  it('returns true when window.confirm returns true', async () => {
    window.confirm = vi.fn(() => true);
    const { confirmAction } = await import('../utils/confirmAction');
    expect(confirmAction('Title', 'Content')).toBe(true);
    expect(window.confirm).toHaveBeenCalledWith('Title\nContent');
  });

  it('returns false when window.confirm returns false', async () => {
    window.confirm = vi.fn(() => false);
    const { confirmAction } = await import('../utils/confirmAction');
    expect(confirmAction('Title', 'Content')).toBe(false);
  });

  it('uses default message when no title/content', async () => {
    window.confirm = vi.fn(() => true);
    const { confirmAction } = await import('../utils/confirmAction');
    expect(confirmAction()).toBe(true);
    expect(window.confirm).toHaveBeenCalledWith('确认继续吗？');
  });

  it('handles only title', async () => {
    window.confirm = vi.fn(() => true);
    const { confirmAction } = await import('../utils/confirmAction');
    confirmAction('Just title');
    expect(window.confirm).toHaveBeenCalledWith('Just title');
  });

  it('returns true when confirm throws', async () => {
    window.confirm = vi.fn(() => {
      throw new Error('blocked');
    });
    const { confirmAction } = await import('../utils/confirmAction');
    expect(confirmAction('Test')).toBe(true);
  });
});

// ================================================================
// fieldFormat tests (75.12% → targeting higher)
// ================================================================
import {
  createUid,
  getUserId,
  getUserName,
  normalizeUser,
  getDepartmentId,
  getDepartmentName,
  normalizeDepartmentNode,
  flattenDepartments,
  formatUserDisplay,
  getDepartmentFullPath,
  filterTreeByScope,
  formatFileSize,
  getFileExtension,
  isImageFile,
  getFileCategory,
  normalizeAttachmentItem,
  getAttachmentItemIdentity,
  dedupeAttachmentItems,
} from '../fields/shared/fieldFormat';

describe('fieldFormat utilities', () => {
  describe('createUid', () => {
    it('creates unique ids with default prefix', () => {
      const a = createUid();
      const b = createUid();
      expect(a).toContain('field-');
      expect(a).not.toBe(b);
    });

    it('creates unique ids with custom prefix', () => {
      expect(createUid('custom')).toContain('custom-');
    });
  });

  describe('getUserId / getUserName / normalizeUser', () => {
    it('extracts id from various shapes', () => {
      expect(getUserId({ id: '1' })).toBe('1');
      expect(getUserId({ value: '2' })).toBe('2');
      expect(getUserId({ key: '3' })).toBe('3');
      expect(getUserId(null)).toBe('');
    });

    it('extracts name from various shapes', () => {
      expect(getUserName({ name: 'Alice' })).toBe('Alice');
      expect(getUserName({ label: 'Bob' })).toBe('Bob');
      expect(getUserName({ title: 'Charlie' })).toBe('Charlie');
      expect(getUserName({ username: 'dave' })).toBe('dave');
      expect(getUserName({ id: '5' })).toBe('5');
    });

    it('normalizes user object', () => {
      const result = normalizeUser({ id: '1', name: 'Test' });
      expect(result.id).toBe('1');
      expect(result.name).toBe('Test');
    });
  });

  describe('getDepartmentId / getDepartmentName / normalizeDepartmentNode', () => {
    it('extracts dept id and name', () => {
      expect(getDepartmentId({ id: 'd1' })).toBe('d1');
      expect(getDepartmentId({ value: 'd2' })).toBe('d2');
      expect(getDepartmentName({ name: '技术部' })).toBe('技术部');
      expect(getDepartmentName({ label: '产品部' })).toBe('产品部');
    });

    it('normalizes department node', () => {
      const node = normalizeDepartmentNode({
        id: 'd1',
        name: '根',
        children: [{ id: 'd2', name: '子部门' }],
      });
      expect(node.id).toBe('d1');
      expect(node.hasChildren).toBe(true);
      expect(node.isLeaf).toBe(false);
      expect(node.children?.length).toBe(1);
    });

    it('normalizes leaf node', () => {
      const node = normalizeDepartmentNode({ id: 'd1', name: '叶子' });
      expect(node.hasChildren).toBe(false);
      expect(node.isLeaf).toBe(true);
    });

    it('handles hasChildren boolean', () => {
      const node = normalizeDepartmentNode({ id: 'd1', hasChildren: true, isLeaf: false });
      expect(node.hasChildren).toBe(true);
      expect(node.isLeaf).toBe(false);
    });
  });

  describe('flattenDepartments', () => {
    it('flattens nested tree', () => {
      const nodes = [
        {
          id: 'd1',
          name: '根',
          key: 'd1',
          title: '根',
          hasChildren: true,
          isLeaf: false,
          children: [
            { id: 'd2', name: '子', key: 'd2', title: '子', hasChildren: false, isLeaf: true },
          ],
        },
      ];
      const result = flattenDepartments(nodes);
      expect(result.length).toBe(2);
      expect(result[0].id).toBe('d1');
      expect(result[1].id).toBe('d2');
    });

    it('handles empty array', () => {
      expect(flattenDepartments([])).toEqual([]);
    });
  });

  describe('formatUserDisplay', () => {
    const user = {
      id: '1',
      name: '张三',
      jobNumber: 'J001',
      departments: [{ id: 'd1', name: '技术部' }],
    };

    it('formats name only (default)', () => {
      expect(formatUserDisplay(user)).toBe('张三');
      expect(formatUserDisplay(user, 'name')).toBe('张三');
    });

    it('formats nameWithJobNumber', () => {
      expect(formatUserDisplay(user, 'nameWithJobNumber')).toBe('张三（J001）');
    });

    it('formats nameWithJobNumber without job number', () => {
      expect(formatUserDisplay({ ...user, jobNumber: undefined }, 'nameWithJobNumber')).toBe(
        '张三',
      );
    });

    it('formats nameWithDepartment', () => {
      expect(formatUserDisplay(user, 'nameWithDepartment')).toBe('张三（技术部）');
    });

    it('formats nameWithDepartment without department', () => {
      expect(formatUserDisplay({ ...user, departments: [] }, 'nameWithDepartment')).toBe('张三');
    });

    it('handles unknown format', () => {
      expect(formatUserDisplay(user, 'unknown' as any)).toBe('张三');
    });
  });

  describe('getDepartmentFullPath', () => {
    const tree = [
      {
        id: 'd1',
        name: '公司',
        key: 'd1',
        title: '公司',
        hasChildren: true,
        isLeaf: false,
        children: [
          {
            id: 'd2',
            name: '技术部',
            key: 'd2',
            title: '技术部',
            hasChildren: true,
            isLeaf: false,
            children: [
              {
                id: 'd3',
                name: '前端组',
                key: 'd3',
                title: '前端组',
                hasChildren: false,
                isLeaf: true,
              },
            ],
          },
        ],
      },
    ];

    it('returns full path', () => {
      expect(getDepartmentFullPath('d3', tree)).toBe('公司/技术部/前端组');
    });

    it('returns empty for not found', () => {
      expect(getDepartmentFullPath('nonexistent', tree)).toBe('');
    });

    it('returns empty when no tree', () => {
      expect(getDepartmentFullPath('d1')).toBe('');
    });
  });

  describe('filterTreeByScope', () => {
    const tree = [
      {
        id: 'd1',
        name: '公司',
        key: 'd1',
        title: '公司',
        hasChildren: true,
        isLeaf: false,
        children: [
          {
            id: 'd2',
            name: '技术部',
            key: 'd2',
            title: '技术部',
            hasChildren: false,
            isLeaf: true,
          },
          {
            id: 'd3',
            name: '产品部',
            key: 'd3',
            title: '产品部',
            hasChildren: false,
            isLeaf: true,
          },
        ],
      },
    ];

    it('returns all when scopeType is all', () => {
      expect(filterTreeByScope(tree, 'all')).toBe(tree);
    });

    it('returns all when no scope', () => {
      expect(filterTreeByScope(tree)).toBe(tree);
    });

    it('filters specified departments', () => {
      const result = filterTreeByScope(tree, 'specified', ['d2']);
      expect(result.length).toBe(1);
      expect(result[0].children?.length).toBe(1);
    });

    it('returns empty when no matches', () => {
      const result = filterTreeByScope(tree, 'specified', ['nonexistent']);
      expect(result.length).toBe(0);
    });
  });

  describe('formatFileSize', () => {
    it('formats bytes', () => {
      expect(formatFileSize(500)).toBe('500 B');
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(1048576)).toBe('1 MB');
      expect(formatFileSize(1073741824)).toBe('1 GB');
    });

    it('returns empty for 0 or undefined', () => {
      expect(formatFileSize(0)).toBe('');
      expect(formatFileSize(undefined)).toBe('');
    });
  });

  describe('getFileExtension', () => {
    it('extracts extension', () => {
      expect(getFileExtension('test.pdf')).toBe('pdf');
      expect(getFileExtension('archive.tar.gz')).toBe('gz');
      expect(getFileExtension('noext')).toBe('noext');
    });

    it('returns empty for undefined', () => {
      expect(getFileExtension()).toBe('');
    });
  });

  describe('isImageFile', () => {
    it('detects by content type', () => {
      expect(isImageFile('file', 'image/png')).toBe(true);
      expect(isImageFile('file', 'application/pdf')).toBe(false);
    });

    it('detects by extension', () => {
      expect(isImageFile('photo.jpg')).toBe(true);
      expect(isImageFile('doc.pdf')).toBe(false);
    });
  });

  describe('getFileCategory', () => {
    it('categorizes files', () => {
      expect(getFileCategory('test.jpg')).toBe('image');
      expect(getFileCategory('test.mp4')).toBe('video');
      expect(getFileCategory('test.mp3')).toBe('audio');
      expect(getFileCategory('test.pdf')).toBe('pdf');
      expect(getFileCategory('test.xlsx')).toBe('excel');
      expect(getFileCategory('test.docx')).toBe('word');
      expect(getFileCategory('test.pptx')).toBe('ppt');
      expect(getFileCategory('test.zip')).toBe('archive');
      expect(getFileCategory('test.txt')).toBe('text');
      expect(getFileCategory('test.ts')).toBe('code');
      expect(getFileCategory('test.bin')).toBe('file');
    });
  });

  describe('normalizeAttachmentItem', () => {
    it('normalizes basic item', () => {
      const item = normalizeAttachmentItem({ id: 'a1', name: 'doc.pdf', url: '/files/doc.pdf' });
      expect(item.id).toBe('a1');
      expect(item.name).toBe('doc.pdf');
      expect(item.url).toBe('/files/doc.pdf');
      expect(item.status).toBe('done');
    });

    it('uses fallback values', () => {
      const item = normalizeAttachmentItem({}, { id: 'fb', name: 'fallback.txt', url: '/fb' });
      expect(item.id).toBe('fb');
      expect(item.name).toBe('fallback.txt');
    });

    it('handles objectName as id', () => {
      const item = normalizeAttachmentItem({ objectName: 'obj1' });
      expect(item.id).toBe('obj1');
    });

    it('handles downloadUrl and previewUrl', () => {
      const item = normalizeAttachmentItem({ downloadUrl: '/dl' });
      expect(item.url).toBe('/dl');
      const item2 = normalizeAttachmentItem({ previewUrl: '/prev' });
      expect(item2.url).toBe('/prev');
    });
  });

  describe('getAttachmentItemIdentity', () => {
    it('returns uid first', () => {
      expect(getAttachmentItemIdentity({ uid: 'u1', id: 'i1' })).toBe('u1');
    });

    it('falls back through fields', () => {
      expect(getAttachmentItemIdentity({ id: 'i1' })).toBe('i1');
      expect(getAttachmentItemIdentity({ objectName: 'o1' })).toBe('o1');
      expect(getAttachmentItemIdentity({ url: '/u' })).toBe('/u');
      expect(getAttachmentItemIdentity({ name: 'n' })).toBe('n');
      expect(getAttachmentItemIdentity({})).toBe('');
    });
  });

  describe('dedupeAttachmentItems', () => {
    it('removes duplicates by identity', () => {
      const items = [
        { id: 'a1', uid: 'a1', name: 'f1', url: '', status: 'done' as const, originalName: 'f1' },
        {
          id: 'a1',
          uid: 'a1',
          name: 'f1-updated',
          url: '',
          status: 'done' as const,
          originalName: 'f1',
        },
      ];
      const result = dedupeAttachmentItems(items as any);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('f1-updated');
    });

    it('keeps items without key', () => {
      const items = [
        { id: '', uid: '', name: '', url: '', status: 'done' as const, originalName: '' },
        { id: '', uid: '', name: '', url: '', status: 'done' as const, originalName: '' },
      ];
      const result = dedupeAttachmentItems(items as any);
      expect(result.length).toBe(2);
    });
  });
});
