import type {
  CSSProperties,
  HTMLAttributes,
  Key,
  ReactNode,
} from "react"

import type {
  PageSdk,
  StructuredExportColumnDefinition,
  StructuredExportWorkbookDefinition,
} from "../../core"

export type AdminListSortDirection = "ascend" | "descend"

export interface AdminListSort {
  field: string
  direction: AdminListSortDirection
}

export interface AdminListQuery {
  currentPage: number
  pageSize: number
  filters: Record<string, unknown>
  sorts: AdminListSort[]
  fixedFilters?: Record<string, unknown>
}

export interface AdminListResult<Row> {
  rows: Row[]
  total: number
  currentPage?: number
  pageSize?: number
  allowedColumnKeys?: string[]
  hiddenFieldsCount?: number
}

export interface AdminListOption {
  label: ReactNode
  value: string | number | boolean
  disabled?: boolean
}

export type AdminListSearchFieldType =
  | "text"
  | "select"
  | "multiSelect"
  | "number"
  | "date"
  | "dateRange"

export interface AdminListSearchRenderProps {
  disabled?: boolean
  onChange: (value: unknown) => void
  value: unknown
}

export interface AdminListSearchField {
  key: string
  label: ReactNode
  type?: AdminListSearchFieldType
  placeholder?: string
  options?: AdminListOption[]
  defaultVisible?: boolean
  locked?: boolean
  disabled?: boolean
  operator?: string
  render?: (props: AdminListSearchRenderProps) => ReactNode
}

export interface AdminListColumn<Row> {
  key: string
  title: ReactNode
  dataIndex?: string | string[]
  align?: "left" | "center" | "right"
  width?: number
  minWidth?: number
  fixed?: "left" | "right"
  ellipsis?: boolean
  sortable?: boolean
  sortField?: string
  locked?: boolean
  hidden?: boolean
  defaultVisible?: boolean
  exportable?: boolean
  export?:
    | false
    | Omit<StructuredExportColumnDefinition, "key" | "title">
  permissionKey?: string
  render?: (value: unknown, row: Row, index: number) => ReactNode
}

export interface AdminListRowAction<Row> {
  key: string
  label: ReactNode
  danger?: boolean
  disabled?: boolean | ((row: Row) => boolean)
  hidden?: boolean | ((row: Row) => boolean)
  onClick: (row: Row) => void | Promise<void>
}

export interface AdminListBatchAction<Row> {
  key: string
  label: ReactNode
  danger?: boolean
  disabled?: boolean
  onClick: (rows: Row[], rowKeys: Key[]) => void | Promise<void>
}

export type AdminListDensity = "small" | "middle" | "large"

export interface AdminListColumnPreference {
  key: string
  visible?: boolean
  width?: number
  fixed?: "left" | "right" | null
}

export interface AdminListSearchPreference {
  key: string
  visible?: boolean
}

export interface AdminListPreference {
  version: number
  columns?: AdminListColumnPreference[]
  searches?: AdminListSearchPreference[]
  sorts?: AdminListSort[]
  density?: AdminListDensity
  pageSize?: number
  defaultVisibleSearchCount?: number
  showBorders?: boolean
  striped?: boolean
  hoverActions?: boolean
  updatedAt?: string
}

export interface AdminListLockedPreference {
  visibleColumnKeys?: string[]
  hiddenColumnKeys?: string[]
  lockedColumnKeys?: string[]
  visibleSearchKeys?: string[]
  hiddenSearchKeys?: string[]
  lockedSearchKeys?: string[]
  sorts?: AdminListSort[]
  density?: AdminListDensity
  pageSize?: number
}

export interface AdminListPreferenceStore {
  get: (listKey: string) => Promise<AdminListPreference | null>
  put: (
    listKey: string,
    preference: AdminListPreference,
  ) => Promise<AdminListPreference>
  remove: (listKey: string) => Promise<void>
}

export type AdminListExportScope = "selected" | "all"

export interface AdminListExportInput {
  scope: AdminListExportScope
  query: AdminListQuery
  rowIds?: Key[]
  fieldKeys: string[]
  columns?: StructuredExportColumnDefinition[]
  fileName?: string
  workbook?: StructuredExportWorkbookDefinition
}

export type AdminListExportTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"

export interface AdminListExportTask {
  id: string
  status: AdminListExportTaskStatus
  progress?: number
  total?: number
  processed?: number
  message?: string
  downloadUrl?: string
  expiresAt?: string
}

export interface AdminListExportDownloadOptions {
  fileName?: string
}

export interface AdminListDataSource<Row> {
  key?: string
  query: (query: AdminListQuery) => Promise<AdminListResult<Row>>
  preferences?: AdminListPreferenceStore
  createExportTask?: (
    input: AdminListExportInput,
  ) => Promise<AdminListExportTask>
  getExportTask?: (taskId: string) => Promise<AdminListExportTask>
  downloadExportTask?: (
    task: AdminListExportTask,
    options?: AdminListExportDownloadOptions,
  ) => Promise<void>
}

export interface AdminListDataSourceOptions {
  sdk: PageSdk
  appType?: string
  listKey: string
  exportDefinitionCode?: string
  exportDefinitionInput?: Record<string, unknown>
}

export interface AdminListFormSourceOptions
  extends AdminListDataSourceOptions {
  formUuid: string
  filterOperators?: Record<string, string>
  fixedFilters?: Record<string, unknown>
  idField?: string
}

export interface AdminListDataViewSourceOptions
  extends AdminListDataSourceOptions {
  dataViewCode: string
  fields?: string[]
  filterOperators?: Record<string, string>
  fixedFilters?: Record<string, unknown>
  idField?: string
}

export interface AdminListFunctionSourceOptions
  extends AdminListDataSourceOptions {
  functionCode: string
  fixedFilters?: Record<string, unknown>
}

export interface AdminListSelectionChange<Row> {
  rowKeys: Key[]
  rows: Row[]
}

export interface AdminListProps<Row> {
  listKey: string
  rowKey: string | ((row: Row) => Key)
  columns: AdminListColumn<Row>[]
  searchFields?: AdminListSearchField[]
  dataSource: AdminListDataSource<Row>
  configVersion?: number
  defaultSorts?: AdminListSort[]
  defaultPageSize?: number
  pageSizeOptions?: number[]
  defaultVisibleSearchCount?: number
  fixedFilters?: Record<string, unknown>
  lockedPreference?: AdminListLockedPreference
  selectable?: boolean
  selectedRowKeys?: Key[]
  rowSelectable?: (row: Row) => boolean
  rowSelectionReason?: (row: Row) => string | undefined
  preserveSelectionAcrossPages?: boolean
  exportable?: boolean
  fileName?: string
  rowActions?: AdminListRowAction<Row>[]
  batchActions?: AdminListBatchAction<Row>[]
  toolbar?: ReactNode | ((context: { reload: () => void }) => ReactNode)
  emptyText?: ReactNode
  className?: string
  style?: CSSProperties
  onSelectionChange?: (selection: AdminListSelectionChange<Row>) => void
  onQueryChange?: (query: AdminListQuery) => void
  onRow?: (row: Row) => HTMLAttributes<HTMLTableRowElement>
}
