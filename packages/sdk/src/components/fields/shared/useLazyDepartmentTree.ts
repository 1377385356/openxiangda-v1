import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DataNode } from 'antd/es/tree';
import type { DepartmentTreeNode, FormRuntimeApi } from '../../types';
import {
  flattenDepartments,
  getDepartmentId,
  getDepartmentName,
  normalizeDepartmentNode,
} from './fieldFormat';

export interface LazyDepartmentNode extends DataNode, DepartmentTreeNode {
  key: string;
  title: string;
  childrenLoaded?: boolean;
  children?: LazyDepartmentNode[];
}

export interface LazyDepartmentFlatNode {
  id: string;
  name: string;
  node: LazyDepartmentNode;
  path: Array<{ id: string; name: string }>;
}

const toLazyNode = (node: DepartmentTreeNode): LazyDepartmentNode => {
  const normalized = normalizeDepartmentNode(node);
  const id = getDepartmentId(normalized);
  const name = getDepartmentName(normalized);
  const children = normalized.children?.map(toLazyNode);
  const hasChildren = normalized.hasChildren ?? Boolean(children?.length);
  return {
    ...normalized,
    id,
    name,
    key: id,
    title: name,
    hasChildren,
    isLeaf: normalized.isLeaf ?? !hasChildren,
    childrenLoaded: Boolean(children?.length) || normalized.isLeaf === true || !hasChildren,
    children,
  };
};

const replaceChildren = (
  nodes: LazyDepartmentNode[],
  parentId: string,
  children: LazyDepartmentNode[],
): LazyDepartmentNode[] =>
  nodes.map((node) => {
    if (getDepartmentId(node) === parentId) {
      return {
        ...node,
        children,
        hasChildren: children.length > 0,
        isLeaf: children.length === 0,
        childrenLoaded: true,
      };
    }
    return node.children?.length
      ? { ...node, children: replaceChildren(node.children, parentId, children) }
      : node;
  });

function buildIndexes(nodes: LazyDepartmentNode[]) {
  const nodeMap = new Map<string, LazyDepartmentNode>();
  const parentMap = new Map<string, string | null>();
  const flatNodes: LazyDepartmentFlatNode[] = [];

  const walk = (
    list: LazyDepartmentNode[],
    parentId: string | null,
    path: Array<{ id: string; name: string }>,
  ) => {
    for (const node of list) {
      const id = getDepartmentId(node);
      const name = getDepartmentName(node);
      const nextPath = [...path, { id, name }];
      nodeMap.set(id, node);
      parentMap.set(id, parentId);
      flatNodes.push({ id, name, node, path: nextPath });
      if (node.children?.length) walk(node.children, id, nextPath);
    }
  };

  walk(nodes, null, []);
  return { nodeMap, parentMap, flatNodes };
}

export function useLazyDepartmentTree(
  api: FormRuntimeApi,
  configuredTreeData?: DepartmentTreeNode[],
) {
  const [treeData, setTreeDataState] = useState<LazyDepartmentNode[]>(() =>
    (configuredTreeData || []).map(toLazyNode),
  );
  const [treeLoading, setTreeLoading] = useState(false);
  const treeDataRef = useRef(treeData);
  const rootsLoadedRef = useRef(Boolean(configuredTreeData?.length));
  const rootPromiseRef = useRef<Promise<LazyDepartmentNode[]> | null>(null);
  const childPromiseRef = useRef<Record<string, Promise<LazyDepartmentNode[]> | undefined>>({});

  const setTreeData = useCallback(
    (next: LazyDepartmentNode[] | ((prev: LazyDepartmentNode[]) => LazyDepartmentNode[])) => {
      const resolved = typeof next === 'function' ? next(treeDataRef.current) : next;
      treeDataRef.current = resolved;
      setTreeDataState(resolved);
      return resolved;
    },
    [],
  );

  useEffect(() => {
    if (!configuredTreeData) return;
    const next = configuredTreeData.map(toLazyNode);
    rootsLoadedRef.current = next.length > 0;
    setTreeData(next);
  }, [configuredTreeData, setTreeData]);

  const loadRootDepartments = useCallback(async () => {
    if (rootsLoadedRef.current) return treeDataRef.current;
    if (rootPromiseRef.current) return rootPromiseRef.current;
    setTreeLoading(true);
    const promise = api
      .getDepartmentRoots()
      .then((nodes) => {
        const next = (nodes || []).map((node) => toLazyNode(node as DepartmentTreeNode));
        rootsLoadedRef.current = true;
        setTreeData(next);
        return next;
      })
      .finally(() => {
        rootPromiseRef.current = null;
        setTreeLoading(false);
      });
    rootPromiseRef.current = promise;
    return promise;
  }, [api, setTreeData]);

  const loadChildren = useCallback(
    async (parentId: string) => {
      const id = String(parentId || '');
      if (!id) return [];
      const current = flattenDepartments(treeDataRef.current).find((item) => item.id === id)
        ?.node as LazyDepartmentNode | undefined;
      if (!current || current.childrenLoaded || current.isLeaf || current.hasChildren === false) {
        return current?.children || [];
      }
      if (childPromiseRef.current[id]) return childPromiseRef.current[id];
      const promise = api
        .getDepartmentChildren(id)
        .then((nodes) => {
          const children = (nodes || []).map((node) => toLazyNode(node as DepartmentTreeNode));
          setTreeData((prev) => replaceChildren(prev, id, children));
          return children;
        })
        .finally(() => {
          delete childPromiseRef.current[id];
        });
      childPromiseRef.current[id] = promise;
      return promise;
    },
    [api, setTreeData],
  );

  const indexes = useMemo(() => buildIndexes(treeData), [treeData]);

  useEffect(() => {
    void loadRootDepartments();
  }, [loadRootDepartments]);

  return {
    treeData,
    treeLoading,
    ...indexes,
    loadRootDepartments,
    loadChildren,
  };
}
