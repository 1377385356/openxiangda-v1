import type {
  AdminListColumn,
  AdminListLockedPreference,
  AdminListPreference,
  AdminListPreferenceStore,
  AdminListSearchField,
  AdminListSort,
} from "./types"
import type { PageSdk } from "../../core"

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)))

const validSorts = (
  sorts: AdminListSort[] | undefined,
  sortableKeys: Set<string>,
) =>
  (sorts || []).filter(
    (sort) =>
      sortableKeys.has(sort.field) &&
      (sort.direction === "ascend" || sort.direction === "descend"),
  )

export function mergeAdminListPreference<Row>(input: {
  version: number
  columns: AdminListColumn<Row>[]
  searchFields: AdminListSearchField[]
  defaultSorts?: AdminListSort[]
  defaults?: Partial<AdminListPreference>
  user?: AdminListPreference | null
  locked?: AdminListLockedPreference
  allowedColumnKeys?: string[]
}): AdminListPreference {
  const {
    allowedColumnKeys,
    columns,
    defaultSorts,
    defaults,
    locked,
    searchFields,
    user,
    version,
  } = input
  const columnMap = new Map(columns.map((column) => [column.key, column]))
  const searchMap = new Map(searchFields.map((field) => [field.key, field]))
  const allowed = allowedColumnKeys?.length
    ? new Set(allowedColumnKeys)
    : new Set(columns.map((column) => column.key))
  const forcedVisible = new Set(locked?.visibleColumnKeys || [])
  const forcedHidden = new Set(locked?.hiddenColumnKeys || [])
  const forcedSearchVisible = new Set(locked?.visibleSearchKeys || [])
  const forcedSearchHidden = new Set(locked?.hiddenSearchKeys || [])
  const userColumns = new Map(
    (user?.columns || [])
      .filter((column) => columnMap.has(column.key))
      .map((column) => [column.key, column]),
  )
  const orderedColumnKeys = unique([
    ...(user?.columns || []).map((column) => column.key),
    ...columns.map((column) => column.key),
  ]).filter((key) => columnMap.has(key) && allowed.has(key))
  const normalizedColumns = orderedColumnKeys.map((key) => {
    const definition = columnMap.get(key)!
    const preference = userColumns.get(key)
    const visible = forcedHidden.has(key)
      ? false
      : forcedVisible.has(key) || definition.locked
        ? true
        : preference?.visible ??
          definition.defaultVisible ??
          !definition.hidden
    return {
      key,
      visible,
      width:
        typeof preference?.width === "number" && preference.width >= 60
          ? Math.round(preference.width)
          : definition.width,
      fixed:
        definition.fixed ??
        (preference?.fixed === "left" || preference?.fixed === "right"
          ? preference.fixed
          : null),
    }
  })
  const userSearches = new Map(
    (user?.searches || [])
      .filter((field) => searchMap.has(field.key))
      .map((field) => [field.key, field]),
  )
  const orderedSearchKeys = unique([
    ...(user?.searches || []).map((field) => field.key),
    ...searchFields.map((field) => field.key),
  ]).filter((key) => searchMap.has(key))
  const normalizedSearches = orderedSearchKeys.map((key) => {
    const definition = searchMap.get(key)!
    return {
      key,
      visible: forcedSearchHidden.has(key)
        ? false
        : forcedSearchVisible.has(key) || definition.locked
          ? true
          : userSearches.get(key)?.visible ??
            definition.defaultVisible ??
            true,
    }
  })
  const sortableKeys = new Set(
    columns
      .filter((column) => column.sortable && allowed.has(column.key))
      .map((column) => column.sortField || column.key),
  )
  return {
    version,
    columns: normalizedColumns,
    searches: normalizedSearches,
    sorts: locked?.sorts?.length
      ? validSorts(locked.sorts, sortableKeys)
      : validSorts(user?.sorts, sortableKeys).length
        ? validSorts(user?.sorts, sortableKeys)
        : validSorts(defaultSorts, sortableKeys),
    density: locked?.density || user?.density || defaults?.density || "middle",
    pageSize:
      locked?.pageSize ||
      (Number.isSafeInteger(user?.pageSize) && Number(user?.pageSize) > 0
        ? Number(user?.pageSize)
        : defaults?.pageSize || 20),
    defaultVisibleSearchCount:
      Number.isSafeInteger(user?.defaultVisibleSearchCount) &&
      Number(user?.defaultVisibleSearchCount) > 0
        ? Number(user?.defaultVisibleSearchCount)
        : defaults?.defaultVisibleSearchCount || 4,
    showBorders: user?.showBorders ?? defaults?.showBorders ?? false,
    striped: user?.striped ?? defaults?.striped ?? false,
    hoverActions: user?.hoverActions ?? defaults?.hoverActions ?? true,
    updatedAt: user?.updatedAt,
  }
}

export function createAdminListPreferenceStore(
  sdk: PageSdk,
  appType: string,
): AdminListPreferenceStore {
  const basePath = `/openxiangda-api/v1/apps/${encodeURIComponent(
    appType,
  )}/admin-list/preferences`
  return {
    async get(listKey) {
      const response = await sdk.request<AdminListPreference | null>({
        path: `${basePath}/${encodeURIComponent(listKey)}`,
        method: "get",
      })
      return response.result || null
    },
    async put(listKey, preference) {
      const response = await sdk.request<AdminListPreference>({
        path: `${basePath}/${encodeURIComponent(listKey)}`,
        method: "put",
        body: preference,
      })
      if (!response.result) {
        throw new Error("列表设置保存失败：服务端未返回配置")
      }
      return response.result
    },
    async remove(listKey) {
      await sdk.request({
        path: `${basePath}/${encodeURIComponent(listKey)}`,
        method: "delete",
      })
    },
  }
}
