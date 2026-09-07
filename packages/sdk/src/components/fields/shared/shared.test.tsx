import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import type { FormRuntimeApi } from '../../types';
import {
  createUid,
  flattenDepartments,
  formatFileSize,
  getDepartmentId,
  getDepartmentName,
  getFileCategory,
  getFileExtension,
  getUserId,
  getUserName,
  isImageFile,
  normalizeAttachmentItem,
  normalizeDepartmentNode,
  normalizeUser,
} from './fieldFormat';
import { useLazyDepartmentTree } from './useLazyDepartmentTree';
import { DepartmentPicker, DepartmentPickerPanel } from './DepartmentPicker';
import { UserPicker, UserPickerPanel } from './UserPicker';

vi.mock('@ant-design/icons', () => ({
  ApartmentOutlined: () => <span>dept-icon</span>,
  SearchOutlined: () => <span>search-icon</span>,
  TeamOutlined: () => <span>team-icon</span>,
  UserOutlined: () => <span>user-icon</span>,
}));

const mobileComponentMock = vi.hoisted(() => ({
  usePopup: true,
  useSearchBar: true,
}));

vi.mock('antd-mobile', () => ({
  get Popup() {
    if (!mobileComponentMock.usePopup) return undefined;
    return ({ visible, children, onMaskClick }: any) =>
      visible ? (
        <div data-testid="mobile-popup">
          <button type="button" onClick={onMaskClick}>
            mask
          </button>
          {children}
        </div>
      ) : null;
  },
  get SearchBar() {
    if (!mobileComponentMock.useSearchBar) return undefined;
    return ({ value, onChange, placeholder }: any) => (
      <input
        aria-label={placeholder}
        value={value || ''}
        onChange={(event) => onChange?.(event.target.value)}
      />
    );
  },
}));

vi.mock('antd', () => {
  const Button = ({ children, onClick, disabled, type }: any) => (
    <button type="button" data-button-type={type} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
  const Checkbox = ({ checked, onChange }: any) => (
    <input
      aria-label="checkbox"
      type="checkbox"
      checked={Boolean(checked)}
      onChange={(event) => onChange?.(event)}
    />
  );
  const Empty = ({ description }: any) => <div>{description || 'empty'}</div>;
  Empty.PRESENTED_IMAGE_SIMPLE = 'simple';
  const Input = ({ value, onChange, placeholder }: any) => (
    <input aria-label={placeholder} value={value || ''} onChange={(event) => onChange?.(event)} />
  );
  const List = ({ dataSource = [], renderItem, locale }: any) => (
    <div>
      {dataSource.length ? dataSource.map((item: any) => renderItem(item)) : locale?.emptyText}
    </div>
  );
  List.Item = ({ children, actions = [], onClick }: any) => (
    <div role="listitem" onClick={onClick}>
      {children}
      {actions.map((action: any, index: number) => (
        <span key={index}>{action}</span>
      ))}
    </div>
  );
  List.Item.Meta = ({ avatar, title }: any) => (
    <span>
      {avatar}
      {title}
    </span>
  );
  const Modal = ({ open, title, children, onCancel }: any) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <button type="button" onClick={onCancel}>
          modal-cancel
        </button>
        {children}
      </div>
    ) : null;
  const Pagination = ({ current, pageSize, total, onChange }: any) => (
    <div data-testid="pagination">
      <span>
        page-{current}-{pageSize}-{total}
      </span>
      <button type="button" onClick={() => onChange?.((current || 1) + 1, pageSize || 20)}>
        next-page
      </button>
    </div>
  );
  const Space = ({ children }: any) => <span>{children}</span>;
  const Spin = ({ children }: any) => <>{children}</>;
  const Tag = ({ children, closable, onClose }: any) => (
    <span>
      {children}
      {closable && (
        <button
          type="button"
          onClick={(event) => onClose?.(event)}
          aria-label={`remove-${children}`}
        >
          x
        </button>
      )}
    </span>
  );
  const Tree = ({ treeData = [], onSelect, onCheck, loadData, onExpand, checkable }: any) => {
    const nodes: any[] = [];
    const walk = (list: any[]) => {
      list.forEach((node) => {
        nodes.push(node);
        if (node.children) walk(node.children);
      });
    };
    walk(treeData);
    return (
      <div>
        <button type="button" onClick={() => onExpand?.(nodes.map((node) => node.key))}>
          expand-all
        </button>
        {nodes.map((node) => (
          <div key={node.key}>
            <button type="button" onClick={() => onSelect?.([node.key])}>
              select-{node.title}
            </button>
            {checkable && (
              <button type="button" onClick={() => onCheck?.([node.key])}>
                check-{node.title}
              </button>
            )}
            <button type="button" onClick={() => loadData?.(node)}>
              load-{node.title}
            </button>
          </div>
        ))}
      </div>
    );
  };
  const Avatar = ({ src, icon }: any) => <span>{src || icon || 'avatar'}</span>;
  return {
    Avatar,
    Button,
    Checkbox,
    Empty,
    Input,
    List,
    Modal,
    Pagination,
    Space,
    Spin,
    Tag,
    Tree,
  };
});

const roots = [
  { id: 'd1', name: '技术部', hasChildren: true, isLeaf: false },
  { id: 'd2', name: '产品部', hasChildren: false },
];
const children = [{ id: 'd1-1', name: '前端组', hasChildren: false }];
const users = [
  { id: 'u1', name: '张三', avatar: '/a.png' },
  { id: 'u2', name: '李四' },
] as any[];

function createApi(): FormRuntimeApi {
  return {
    request: vi.fn(),
    uploadFile: vi.fn(),
    deleteFile: vi.fn(),
    createDownloadTicket: vi.fn(),
    createFileAccessTicket: vi.fn(),
    getUserById: vi.fn(),
    getUserList: vi.fn().mockResolvedValue(users),
    getDepartmentRoots: vi.fn().mockResolvedValue(roots),
    getDepartmentChildren: vi.fn().mockResolvedValue(children),
    getDepartmentParentDepartments: vi.fn(),
    getDepartmentMembers: vi.fn().mockResolvedValue(users),
    getDepartmentMembersPage: vi.fn().mockResolvedValue({
      items: users,
      total: users.length,
      page: 1,
      pageSize: 10,
    }),
    getChinaDivisions: vi.fn(),
    advancedSearch: vi.fn(),
    getDingTalkSignature: vi.fn(),
    submitFormData: vi.fn(),
    updateFormData: vi.fn(),
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mobileComponentMock.usePopup = true;
  mobileComponentMock.useSearchBar = true;
});

describe('fieldFormat helpers', () => {
  it('normalizes user, department and attachment values', () => {
    expect(createUid('x')).toMatch(/^x-/);
    expect(getUserId({ id: 'u1' } as any)).toBe('u1');
    expect(getUserName({ name: 'Alice' } as any)).toBe('Alice');
    expect(normalizeUser({ id: 'u1', name: 'Alice' } as any)).toMatchObject({
      id: 'u1',
      name: 'Alice',
    });
    expect(getDepartmentId({ value: 'd1' } as any)).toBe('d1');
    expect(getDepartmentName({ title: '技术部' } as any)).toBe('技术部');
    expect(normalizeDepartmentNode({ value: 'd1', title: '技术部' } as any)).toMatchObject({
      id: 'd1',
      name: '技术部',
    });
    expect(
      flattenDepartments([{ id: 'd1', name: '技术部', children: children as any }]),
    ).toHaveLength(2);
    expect(formatFileSize()).toBe('');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toContain('KB');
    expect(formatFileSize(3 * 1024 * 1024)).toContain('MB');
    expect(getFileExtension('a.PDF')).toBe('pdf');
    expect(isImageFile(undefined, 'image/png')).toBe(true);
    expect(isImageFile('a.jpg')).toBe(true);
    expect(getFileCategory('a.xlsx')).toBe('excel');
    expect(normalizeAttachmentItem({ uid: '1', originalName: 'a.png' } as any)).toMatchObject({
      id: '1',
      name: 'a.png',
    });
  });
});

describe('useLazyDepartmentTree', () => {
  function Harness({ api, treeData }: { api: FormRuntimeApi; treeData?: any[] }) {
    const state = useLazyDepartmentTree(api, treeData);
    return (
      <div>
        <span data-testid="count">{state.flatNodes.length}</span>
        <span data-testid="map-size">{state.nodeMap.size}</span>
        <button type="button" onClick={() => state.loadRootDepartments()}>
          load-root
        </button>
        <button type="button" onClick={() => state.loadChildren('d1')}>
          load-child
        </button>
      </div>
    );
  }

  it('loads root and child departments lazily', async () => {
    const api = createApi();
    render(<Harness api={api} />);
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'));
    fireEvent.click(screen.getByText('load-child'));
    await waitFor(() => expect(api.getDepartmentChildren).toHaveBeenCalledWith('d1'));
  });

  it('uses configured treeData without remote roots', async () => {
    const api = createApi();
    render(<Harness api={api} treeData={[{ id: 'local', name: '本地部门' }]} />);
    expect(screen.getByTestId('count')).toHaveTextContent('1');
    fireEvent.click(screen.getByText('load-root'));
    expect(api.getDepartmentRoots).not.toHaveBeenCalled();
  });
});

describe('DepartmentPicker', () => {
  it('selects department in PC modal and mobile popup', async () => {
    const api = createApi();
    const onConfirm = vi.fn();
    render(
      <DepartmentPicker
        open
        onOpenChange={vi.fn()}
        api={api}
        value={[]}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    await screen.findByText('select-技术部');
    fireEvent.click(screen.getByText('select-技术部'));
    fireEvent.click(screen.getByText('确定'));
    expect(onConfirm).toHaveBeenCalledWith([{ id: 'd1', name: '技术部' }]);

    cleanup();
    const mobileConfirm = vi.fn();
    render(
      <DepartmentPicker
        open
        mobile
        multiple
        onOpenChange={vi.fn()}
        api={api}
        value={[]}
        onConfirm={mobileConfirm}
        onCancel={vi.fn()}
      />,
    );
    await screen.findByTestId('mobile-popup');
    fireEvent.change(screen.getByLabelText('搜索部门'), { target: { value: '技术' } });
    fireEvent.click(screen.getAllByLabelText('checkbox')[0]);
    fireEvent.click(screen.getByText('确定'));
    expect(mobileConfirm).toHaveBeenCalled();
  });

  it('panel supports checking, clearing and loading children', async () => {
    const api = createApi();
    const onConfirm = vi.fn();
    render(
      <DepartmentPickerPanel
        api={api}
        multiple
        value={[{ id: 'd2', name: '产品部' }]}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    await screen.findByText('check-技术部');
    fireEvent.click(screen.getByText('check-技术部'));
    fireEvent.click(screen.getByLabelText('remove-技术部'));
    fireEvent.click(screen.getByText('load-技术部'));
    await waitFor(() => expect(api.getDepartmentChildren).toHaveBeenCalledWith('d1'));
    fireEvent.click(screen.getByText('确定'));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('handles search, cancel, clear and mobile fallback navigation', async () => {
    const api = createApi();
    const onOpenChange = vi.fn();
    const onCancel = vi.fn();
    render(
      <DepartmentPicker
        open
        multiple
        onOpenChange={onOpenChange}
        api={api}
        value={[{ id: 'd1', name: '技术部' }]}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await screen.findByText('check-技术部');
    fireEvent.change(screen.getByLabelText('搜索部门'), { target: { value: '产品' } });
    expect(screen.queryByText('check-技术部')).toBeNull();
    fireEvent.click(screen.getByText('清空'));
    fireEvent.click(screen.getByText('modal-cancel'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCancel).toHaveBeenCalled();

    cleanup();
    mobileComponentMock.useSearchBar = false;
    render(
      <DepartmentPickerPanel
        api={api}
        mobile
        multiple
        value={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await screen.findByText('技术部');
    fireEvent.change(screen.getByDisplayValue(''), { target: { value: '技术' } });
    fireEvent.click(screen.getByText('下级'));
    await waitFor(() => expect(api.getDepartmentChildren).toHaveBeenCalledWith('d1'));
    fireEvent.click(screen.getByText('部门'));
  });

  it('searches all departments remotely and displays full path', async () => {
    const api = createApi();
    (api as any).searchDepartments = vi.fn().mockResolvedValue({
      items: [
        {
          id: 'deep-dept',
          name: '合同承办组',
          path: [
            { id: 'root', name: '总部' },
            { id: 'legal', name: '法务部' },
            { id: 'deep-dept', name: '合同承办组' },
          ],
          fullPath: '总部/法务部/合同承办组',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    const onConfirm = vi.fn();

    render(
      <DepartmentPickerPanel
        api={api}
        value={[]}
        searchScope="all"
        showFullPath
        searchDebounceMs={1}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索部门'), { target: { value: '合同' } });

    await waitFor(() =>
      expect((api as any).searchDepartments).toHaveBeenCalledWith({
        keyword: '合同',
        page: 1,
        pageSize: 50,
        includePath: true,
      }),
    );
    await screen.findByText('总部/法务部/合同承办组');
    fireEvent.click(screen.getByLabelText('checkbox'));
    fireEvent.click(screen.getByText('确定'));

    expect(onConfirm).toHaveBeenCalledWith([
      {
        id: 'deep-dept',
        name: '合同承办组',
        fullPath: '总部/法务部/合同承办组',
      },
    ]);
  });
});

describe('UserPicker', () => {
  it('loads members, selects users and confirms', async () => {
    const api = createApi();
    const onConfirm = vi.fn();
    render(
      <UserPicker
        open
        onOpenChange={vi.fn()}
        api={api}
        value={[]}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    await screen.findByText('张三');
    fireEvent.click(screen.getByText('select-产品部'));
    await waitFor(() =>
      expect(api.getDepartmentMembersPage).toHaveBeenCalledWith('d2', {
        page: 1,
        pageSize: 10,
      }),
    );
    fireEvent.click(screen.getAllByLabelText('checkbox')[0]);
    fireEvent.click(screen.getByText('确定'));
    expect(onConfirm).toHaveBeenCalledWith([expect.objectContaining({ id: 'u1', name: '张三' })]);
  });

  it('treats empty dataSource as remote users and loads department members', async () => {
    const api = createApi();
    render(
      <UserPicker
        open
        onOpenChange={vi.fn()}
        api={api}
        value={[]}
        dataSource={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(api.getDepartmentMembersPage).toHaveBeenCalledWith('d1', {
        page: 1,
        pageSize: 10,
      }),
    );
  });

  it('does not load all users when no department is selected and all-user loading is disabled', async () => {
    const api = createApi();
    render(
      <UserPicker
        open
        onOpenChange={vi.fn()}
        api={api}
        value={[]}
        loadAllWhenNoDepartment={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await screen.findByText('select-技术部');
    expect(api.getUserList).not.toHaveBeenCalled();
    expect(api.getDepartmentMembersPage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('select-技术部'));
    await waitFor(() =>
      expect(api.getDepartmentMembersPage).toHaveBeenCalledWith('d1', {
        page: 1,
        pageSize: 10,
      }),
    );

    fireEvent.change(screen.getByLabelText('搜索成员'), { target: { value: '张' } });
    await waitFor(() =>
      expect(api.getUserList).toHaveBeenCalledWith({
        keyword: '张',
        name: '张',
        username: '张',
        page: 1,
        pageSize: 10,
      }),
    );
  });

  it('filters dataSource, handles single selection and mobile navigation', async () => {
    const api = createApi();
    const onConfirm = vi.fn();
    render(
      <UserPickerPanel
        api={api}
        multiple={false}
        dataSource={users}
        value={[]}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('搜索成员'), { target: { value: '李' } });
    await waitFor(() => expect(screen.getByText('李四')).toBeInTheDocument());
    fireEvent.click(screen.getAllByLabelText('checkbox')[0]);
    fireEvent.click(screen.getByText('确定'));
    expect(onConfirm).toHaveBeenCalledWith([expect.objectContaining({ id: 'u2', name: '李四' })]);

    cleanup();
    const mobileConfirm = vi.fn();
    render(
      <UserPicker
        open
        mobile
        onOpenChange={vi.fn()}
        api={api}
        value={[]}
        onConfirm={mobileConfirm}
        onCancel={vi.fn()}
      />,
    );
    await screen.findByTestId('mobile-popup');
    fireEvent.change(screen.getByLabelText('搜索部门或成员'), { target: { value: '技术' } });
    fireEvent.click(screen.getByText('通讯录'));
    fireEvent.click(screen.getAllByLabelText('checkbox')[0]);
    fireEvent.click(screen.getByText('确定'));
    expect(mobileConfirm).toHaveBeenCalled();
  });

  it('uses the configured display format for member rows and selected tags', async () => {
    const api = createApi();
    render(
      <UserPickerPanel
        api={api}
        dataSource={[
          { id: 'u1', name: '张三', jobNumber: 'J001' },
          { id: 'u2', name: '李四', jobNumber: 'J002' },
        ]}
        displayFormat="nameWithJobNumber"
        value={[{ id: 'u1', name: '张三', jobNumber: 'J001' }]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getAllByText('张三（J001）').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('李四（J002）')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('搜索成员'), { target: { value: 'J002' } });
    await waitFor(() => expect(screen.getAllByText('张三（J001）')).toHaveLength(1));
    expect(screen.getByText('李四（J002）')).toBeInTheDocument();
  });

  it('keeps mobile picker at root until a department is selected and can navigate back', async () => {
    const api = createApi();
    render(
      <UserPicker
        open
        mobile
        onOpenChange={vi.fn()}
        api={api}
        value={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await screen.findByTestId('mobile-popup');
    await screen.findByText('技术部');
    expect(screen.getByText('产品部')).toBeInTheDocument();
    expect(screen.queryByText('/ 技术部')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('技术部'));
    await waitFor(() => expect(api.getDepartmentChildren).toHaveBeenCalledWith('d1'));
    await screen.findByText('前端组');
    expect(screen.getByText('/ 技术部')).toBeInTheDocument();

    fireEvent.click(screen.getByText('通讯录'));
    await screen.findByText('产品部');
    expect(screen.queryByText('/ 技术部')).not.toBeInTheDocument();
  });

  it('handles selected tag removal, pagination, department search and cancel', async () => {
    const api = createApi();
    const onOpenChange = vi.fn();
    const onCancel = vi.fn();
    render(
      <UserPicker
        open
        onOpenChange={onOpenChange}
        api={api}
        value={users}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await screen.findByText('张三');
    fireEvent.click(screen.getByLabelText('remove-张三'));
    fireEvent.click(screen.getByText('清空'));
    fireEvent.click(screen.getByText('next-page'));
    await waitFor(() =>
      expect(api.getDepartmentMembersPage).toHaveBeenCalledWith('d1', {
        page: 2,
        pageSize: 10,
      }),
    );
    fireEvent.change(screen.getByLabelText('搜索部门'), { target: { value: '产品' } });
    expect(screen.queryByText('select-技术部')).toBeNull();
    fireEvent.click(screen.getByText('load-产品部'));

    fireEvent.click(screen.getByText('modal-cancel'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCancel).toHaveBeenCalled();
  });

  it('uses mobile fallback input and breadcrumb handlers when mobile components are missing', async () => {
    const api = createApi();
    mobileComponentMock.useSearchBar = false;
    const onConfirm = vi.fn();
    render(
      <UserPickerPanel api={api} mobile value={[]} onConfirm={onConfirm} onCancel={vi.fn()} />,
    );

    await screen.findByText('技术部');
    fireEvent.change(screen.getByDisplayValue(''), { target: { value: '技术' } });
    fireEvent.click(screen.getByText('技术部'));
    await waitFor(() => expect(api.getDepartmentChildren).toHaveBeenCalledWith('d1'));
    await screen.findByText('/ 技术部');
    fireEvent.click(screen.getByText('/ 技术部'));
    fireEvent.click(screen.getByText('通讯录'));
    fireEvent.click(screen.getByText('确定'));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('renders mobile picker without Popup and still handles inline cancel', async () => {
    const api = createApi();
    mobileComponentMock.usePopup = false;
    const onCancel = vi.fn();
    render(
      <UserPicker
        open
        mobile
        onOpenChange={vi.fn()}
        api={api}
        value={[]}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await screen.findByText('选择成员');
    fireEvent.click(screen.getByText('取消'));
    expect(onCancel).toHaveBeenCalled();
  });
});
