import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Result,
  Segmented,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  message,
  notification,
} from "antd"
import {
  DeleteOutlined,
  DownOutlined,
  DownloadOutlined,
  HolderOutlined,
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
  UpOutlined,
} from "@ant-design/icons"
import type {
  MenuProps,
  TablePaginationConfig,
  TableProps,
} from "antd"
import type { Key, ReactNode } from "react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { mergeAdminListPreference } from "./preferences"
import type {
  AdminListColumn,
  AdminListColumnPreference,
  AdminListExportInput,
  AdminListExportTask,
  AdminListPreference,
  AdminListProps,
  AdminListQuery,
  AdminListResult,
  AdminListSearchField,
  AdminListSort,
} from "./types"

const { RangePicker } = DatePicker

const isEmpty = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0)

const normalizeFilterValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(normalizeFilterValue)
  }
  if (
    value &&
    typeof value === "object" &&
    "format" in value &&
    typeof value.format === "function"
  ) {
    return value.format("YYYY-MM-DD")
  }
  return value
}

const normalizeFilters = (values: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => !isEmpty(value))
      .map(([key, value]) => [key, normalizeFilterValue(value)]),
  )

const sortFingerprint = (sorts: AdminListSort[]) =>
  sorts.map((sort) => `${sort.field}:${sort.direction}`).join("|")

const queryFingerprint = (query: AdminListQuery, sourceKey: string) =>
  JSON.stringify({
    sourceKey,
    filters: query.filters,
    fixedFilters: query.fixedFilters,
    sorts: query.sorts,
  })

const positiveInteger = (value: unknown, fallback: number) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue > 0
    ? Math.floor(numberValue)
    : fallback
}

const reconcileResultTotal = <Row,>(
  result: AdminListResult<Row>,
  query: AdminListQuery,
  rows: Row[],
) => {
  const reportedTotal = Number(result.total)
  const normalizedReportedTotal = Number.isFinite(reportedTotal)
    ? Math.max(0, reportedTotal)
    : 0
  if (!rows.length) return normalizedReportedTotal

  const currentPage = positiveInteger(result.currentPage, query.currentPage)
  const pageSize = positiveInteger(result.pageSize, query.pageSize)
  const visibleRowsLowerBound = (currentPage - 1) * pageSize + rows.length
  return Math.max(normalizedReportedTotal, visibleRowsLowerBound)
}

const getRowKey = <Row,>(
  rowKey: AdminListProps<Row>["rowKey"],
  row: Row,
): Key => {
  if (typeof rowKey === "function") return rowKey(row)
  return (row as Record<string, unknown>)[rowKey] as Key
}

const getDataValue = (row: unknown, dataIndex?: string | string[]) => {
  const path = Array.isArray(dataIndex)
    ? dataIndex
    : typeof dataIndex === "string"
      ? dataIndex.split(".")
      : []
  return path.reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object") return undefined
    return (value as Record<string, unknown>)[key]
  }, row)
}

const toColumnPreferences = <Row,>(
  columns: AdminListColumn<Row>[],
): AdminListColumnPreference[] =>
  columns.map((column) => ({
    key: column.key,
    visible: column.defaultVisible ?? !column.hidden,
    width: column.width,
    fixed: column.fixed || null,
  }))

function renderSearchControl(field: AdminListSearchField) {
  const placeholder =
    field.placeholder ||
    (field.type === "select" || field.type === "multiSelect"
      ? `请选择${String(field.label)}`
      : `请输入${String(field.label)}`)
  if (field.type === "select" || field.type === "multiSelect") {
    return (
      <Select
        allowClear
        disabled={field.disabled}
        mode={field.type === "multiSelect" ? "multiple" : undefined}
        options={field.options}
        placeholder={placeholder}
        showSearch={{ optionFilterProp: "label" }}
      />
    )
  }
  if (field.type === "number") {
    return (
      <InputNumber
        disabled={field.disabled}
        placeholder={placeholder}
        style={{ width: "100%" }}
      />
    )
  }
  if (field.type === "date") {
    return (
      <DatePicker
        disabled={field.disabled}
        placeholder={placeholder}
        style={{ width: "100%" }}
      />
    )
  }
  if (field.type === "dateRange") {
    return (
      <RangePicker
        disabled={field.disabled}
        style={{ width: "100%" }}
      />
    )
  }
  return (
    <Input
      allowClear
      disabled={field.disabled}
      placeholder={placeholder}
    />
  )
}

export function AdminList<Row>(props: AdminListProps<Row>) {
  const {
    batchActions = [],
    className,
    columns,
    configVersion = 1,
    dataSource,
    defaultPageSize = 20,
    defaultSorts = [],
    defaultVisibleSearchCount = 4,
    emptyText,
    exportable = true,
    fileName,
    fixedFilters,
    listKey,
    lockedPreference,
    onQueryChange,
    onRow,
    onSelectionChange,
    pageSizeOptions = [20, 50, 100],
    preserveSelectionAcrossPages = true,
    rowActions = [],
    rowKey,
    rowSelectable,
    rowSelectionReason,
    searchFields = [],
    selectable = true,
    selectedRowKeys: controlledSelectedKeys,
    style,
    toolbar,
  } = props
  const [form] = Form.useForm()
  const [messageApi, messageHolder] = message.useMessage()
  const [notificationApi, notificationHolder] =
    notification.useNotification()
  const [modalApi, modalHolder] = Modal.useModal()
  const sourceKey = dataSource.key || "anonymous"
  const listIdentity = JSON.stringify([listKey, sourceKey])
  const [rawPreference, setRawPreference] =
    useState<AdminListPreference | null>(null)
  const [preference, setPreference] = useState<AdminListPreference>(() =>
    mergeAdminListPreference({
      version: configVersion,
      columns,
      searchFields,
      defaultSorts,
      defaults: {
        pageSize: defaultPageSize,
        defaultVisibleSearchCount,
      },
      locked: lockedPreference,
    }),
  )
  const [settingsDraft, setSettingsDraft] = useState(preference)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState("search")
  const [columnSearch, setColumnSearch] = useState("")
  const [expanded, setExpanded] = useState(false)
  const [readyIdentity, setReadyIdentity] = useState<string | null>(null)
  const ready = readyIdentity === listIdentity
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [allowedColumnKeys, setAllowedColumnKeys] = useState<
    string[] | undefined
  >(undefined)
  const [hiddenFieldsCount, setHiddenFieldsCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [query, setQuery] = useState<AdminListQuery>({
    currentPage: 1,
    pageSize: defaultPageSize,
    filters: {},
    sorts: defaultSorts,
    fixedFilters,
  })
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([])
  const selectedRowsRef = useRef(new Map<Key, Row>())
  const previousFingerprintRef = useRef("")
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [draggedColumnKey, setDraggedColumnKey] = useState("")
  const [draggedSearchKey, setDraggedSearchKey] = useState("")
  const selectedKeysRef = useRef<Key[]>([])
  const dataSourceRef = useRef(dataSource)
  const listIdentityRef = useRef(listIdentity)
  const requestVersionRef = useRef(0)
  const onQueryChangeRef = useRef(onQueryChange)
  const onSelectionChangeRef = useRef(onSelectionChange)
  dataSourceRef.current = dataSource
  listIdentityRef.current = listIdentity
  onQueryChangeRef.current = onQueryChange
  onSelectionChangeRef.current = onSelectionChange
  const definitionFingerprint = JSON.stringify({
    columns: columns.map((column) => ({
      key: column.key,
      width: column.width,
      fixed: column.fixed,
      hidden: column.hidden,
      locked: column.locked,
      sortable: column.sortable,
      sortField: column.sortField,
    })),
    searches: searchFields.map((field) => ({
      key: field.key,
      type: field.type,
      locked: field.locked,
      defaultVisible: field.defaultVisible,
    })),
    defaultSorts,
    fixedFilters,
    lockedPreference,
  })

  const clearSelection = useCallback(
    (reason?: string) => {
      if (selectedKeysRef.current.length && reason) {
        void messageApi.info(reason)
      }
      selectedRowsRef.current.clear()
      selectedKeysRef.current = []
      setSelectedKeys([])
      onSelectionChangeRef.current?.({ rowKeys: [], rows: [] })
    },
    [messageApi],
  )

  useEffect(() => {
    if (!controlledSelectedKeys) return
    const nextKeys = [...controlledSelectedKeys]
    const nextKeySet = new Set(nextKeys)
    for (const key of selectedRowsRef.current.keys()) {
      if (!nextKeySet.has(key)) selectedRowsRef.current.delete(key)
    }
    for (const row of rows) {
      const key = getRowKey(rowKey, row)
      if (nextKeySet.has(key)) selectedRowsRef.current.set(key, row)
    }
    selectedKeysRef.current = nextKeys
    setSelectedKeys(nextKeys)
  }, [controlledSelectedKeys, rowKey, rows])

  useEffect(() => {
    if (!rowSelectable || !selectedKeysRef.current.length || !rows.length) {
      return
    }
    const disabledKeys = new Set(
      rows
        .filter((row) => !rowSelectable(row))
        .map((row) => getRowKey(rowKey, row)),
    )
    if (!disabledKeys.size) return
    const nextKeys = selectedKeysRef.current.filter(
      (key) => !disabledKeys.has(key),
    )
    if (nextKeys.length === selectedKeysRef.current.length) return
    for (const key of disabledKeys) selectedRowsRef.current.delete(key)
    selectedKeysRef.current = nextKeys
    setSelectedKeys(nextKeys)
    onSelectionChangeRef.current?.({
      rowKeys: nextKeys,
      rows: nextKeys
        .map((key) => selectedRowsRef.current.get(key))
        .filter(Boolean) as Row[],
    })
  }, [rowKey, rowSelectable, rows])

  useEffect(() => {
    let active = true
    const initializationVersion = ++requestVersionRef.current
    setReadyIdentity(null)
    setRows([])
    setTotal(0)
    setAllowedColumnKeys(undefined)
    setHiddenFieldsCount(0)
    setLoading(false)
    setError(null)
    const load = async () => {
      const saved = dataSourceRef.current.preferences
        ? await dataSourceRef.current.preferences
            .get(listKey)
            .catch(() => null)
        : null
      if (
        !active ||
        initializationVersion !== requestVersionRef.current ||
        listIdentityRef.current !== listIdentity
      ) {
        return
      }
      setRawPreference(saved)
      const merged = mergeAdminListPreference({
        version: configVersion,
        columns,
        searchFields,
        defaultSorts,
        defaults: {
          pageSize: defaultPageSize,
          defaultVisibleSearchCount,
        },
        user: saved,
        locked: lockedPreference,
      })
      setPreference(merged)
      setSettingsDraft(merged)
      setQuery({
        currentPage: 1,
        pageSize: merged.pageSize || defaultPageSize,
        filters: {},
        sorts: merged.sorts || defaultSorts,
        fixedFilters,
      })
      form.resetFields()
      selectedRowsRef.current.clear()
      selectedKeysRef.current = []
      setSelectedKeys([])
      previousFingerprintRef.current = ""
      setReadyIdentity(listIdentity)
    }
    void load()
    return () => {
      active = false
    }
  }, [
    configVersion,
    defaultPageSize,
    defaultVisibleSearchCount,
    definitionFingerprint,
    form,
    listIdentity,
  ])

  useEffect(() => {
    if (!allowedColumnKeys) return
    const merged = mergeAdminListPreference({
      version: configVersion,
      columns,
      searchFields,
      defaultSorts,
      defaults: {
        pageSize: defaultPageSize,
        defaultVisibleSearchCount,
      },
      user: rawPreference,
      locked: lockedPreference,
      allowedColumnKeys,
    })
    setPreference((current) => ({
      ...merged,
      pageSize: current.pageSize,
      sorts: current.sorts,
    }))
  }, [
    allowedColumnKeys,
    columns,
    configVersion,
    defaultPageSize,
    defaultSorts,
    defaultVisibleSearchCount,
    lockedPreference,
    rawPreference,
    searchFields,
  ])

  const loadData = useCallback(async () => {
    if (!ready) return
    const requestVersion = ++requestVersionRef.current
    const requestedIdentity = listIdentity
    const requestedDataSource = dataSourceRef.current
    const isCurrentRequest = () =>
      requestVersion === requestVersionRef.current &&
      requestedIdentity === listIdentityRef.current
    setLoading(true)
    setError(null)
    onQueryChangeRef.current?.(query)
    try {
      const result = await requestedDataSource.query(query)
      if (!isCurrentRequest()) return
      const resultRows = Array.isArray(result.rows) ? result.rows : []
      setRows(resultRows)
      setTotal(reconcileResultTotal(result, query, resultRows))
      setAllowedColumnKeys(result.allowedColumnKeys)
      setHiddenFieldsCount(Math.max(0, Number(result.hiddenFieldsCount || 0)))
    } catch (requestError) {
      if (!isCurrentRequest()) return
      setRows([])
      setTotal(0)
      setError(
        requestError instanceof Error
          ? requestError
          : new Error(String(requestError || "数据加载失败")),
      )
    } finally {
      if (isCurrentRequest()) setLoading(false)
    }
  }, [listIdentity, query, ready])

  useEffect(() => {
    if (!ready) return
    const fingerprint = queryFingerprint(query, listIdentity)
    if (
      previousFingerprintRef.current &&
      previousFingerprintRef.current !== fingerprint &&
      selectedKeysRef.current.length
    ) {
      clearSelection("查询条件或排序已变化，已清空跨页选择")
    }
    previousFingerprintRef.current = fingerprint
    void loadData()
  }, [
    clearSelection,
    loadData,
    query,
    ready,
    listIdentity,
  ])

  const visibleSearchFields = useMemo(() => {
    const searchMap = new Map(searchFields.map((field) => [field.key, field]))
    const ordered = (preference.searches || [])
      .filter((item) => item.visible !== false)
      .map((item) => searchMap.get(item.key))
      .filter(Boolean) as AdminListSearchField[]
    const fallback = ordered.length ? ordered : searchFields
    return expanded
      ? fallback
      : fallback.slice(
          0,
          preference.defaultVisibleSearchCount ||
            defaultVisibleSearchCount,
        )
  }, [
    defaultVisibleSearchCount,
    expanded,
    preference.defaultVisibleSearchCount,
    preference.searches,
    searchFields,
  ])

  const resolvedColumns = useMemo(() => {
    const definitions = new Map(columns.map((column) => [column.key, column]))
    const sortablePriority = new Map(
      (preference.sorts || []).map((sort, index) => [
        sort.field,
        index + 1,
      ]),
    )
    const preferenceColumns =
      preference.columns || toColumnPreferences(columns)
    const tableColumns = preferenceColumns
      .filter((item) => item.visible !== false)
      .map((item) => {
        const definition = definitions.get(item.key)
        if (!definition) return null
        const sortField = definition.sortField || definition.key
        const activeSort = (preference.sorts || []).find(
          (sort) => sort.field === sortField,
        )
        const title = definition.sortable ? (
          <Space size={4}>
            <span>{definition.title}</span>
            {sortablePriority.has(sortField) ? (
              <Tag color="blue" variant="filled">
                {sortablePriority.get(sortField)}
              </Tag>
            ) : null}
          </Space>
        ) : (
          definition.title
        )
        return {
          key: definition.key,
          title,
          dataIndex: definition.dataIndex,
          align: definition.align,
          width: item.width || definition.width,
          fixed: item.fixed || definition.fixed,
          ellipsis: definition.ellipsis,
          sorter: definition.sortable
            ? { multiple: sortablePriority.get(sortField) || 99 }
            : undefined,
          sortOrder: activeSort?.direction,
          render: (value: unknown, row: Row, index: number) =>
            definition.render
              ? definition.render(value, row, index)
              : (value as ReactNode),
        }
      })
      .filter(Boolean)
    if (rowActions.length) {
      tableColumns.push({
        key: "__actions",
        title: "操作",
        width: Math.max(96, Math.min(220, rowActions.length * 56)),
        fixed: "right",
        render: (_value: unknown, row: Row) => (
          <Space size={4} wrap>
            {rowActions.map((action) => {
              const hidden =
                typeof action.hidden === "function"
                  ? action.hidden(row)
                  : action.hidden
              if (hidden) return null
              const disabled =
                typeof action.disabled === "function"
                  ? action.disabled(row)
                  : action.disabled
              return (
                <Button
                  danger={action.danger}
                  disabled={disabled}
                  key={action.key}
                  size="small"
                  type="link"
                  onClick={() => void action.onClick(row)}
                >
                  {action.label}
                </Button>
              )
            })}
          </Space>
        ),
      } as never)
    }
    return tableColumns as TableProps<Row>["columns"]
  }, [columns, preference.columns, preference.sorts, rowActions])

  const applySearch = (values: Record<string, unknown>) => {
    setQuery((current) => ({
      ...current,
      currentPage: 1,
      filters: normalizeFilters(values),
    }))
  }

  const resetSearch = () => {
    form.resetFields()
    setQuery((current) => ({
      ...current,
      currentPage: 1,
      filters: {},
    }))
  }

  const handleTableChange: NonNullable<TableProps<Row>["onChange"]> = (
    pagination,
    _filters,
    sorter,
    extra,
  ) => {
    const paginationOnly = extra.action === "paginate"
    const nextSorts = paginationOnly
      ? query.sorts
      : (Array.isArray(sorter) ? sorter : [sorter])
          .filter(
            (item) =>
              item?.order === "ascend" || item?.order === "descend",
          )
          .map((item) => {
            const definition = columns.find(
              (column) => column.key === String(item.columnKey || item.field),
            )
            return {
              field:
                definition?.sortField ||
                definition?.key ||
                String(item.field || item.columnKey),
              direction: item.order as "ascend" | "descend",
            }
          })
    const sortsChanged =
      sortFingerprint(nextSorts) !== sortFingerprint(query.sorts)
    const nextPageSize = pagination.pageSize || query.pageSize
    setPreference((current) => ({
      ...current,
      sorts: nextSorts,
      pageSize: nextPageSize,
    }))
    setQuery((current) => ({
      ...current,
      currentPage: sortsChanged
        ? 1
        : pagination.current || current.currentPage,
      pageSize: nextPageSize,
      sorts: nextSorts,
    }))
  }

  const handleSelectionChange = (keys: Key[], selectedRows: Row[]) => {
    const nextKeys = preserveSelectionAcrossPages
      ? keys
      : keys.filter((key) =>
          rows.some((row) => getRowKey(rowKey, row) === key),
        )
    const nextKeySet = new Set(nextKeys)
    for (const key of selectedRowsRef.current.keys()) {
      if (!nextKeySet.has(key)) selectedRowsRef.current.delete(key)
    }
    for (const row of [...rows, ...selectedRows]) {
      const key = getRowKey(rowKey, row)
      if (nextKeySet.has(key)) selectedRowsRef.current.set(key, row)
    }
    setSelectedKeys(nextKeys)
    selectedKeysRef.current = nextKeys
    onSelectionChangeRef.current?.({
      rowKeys: nextKeys,
      rows: nextKeys
        .map((key) => selectedRowsRef.current.get(key))
        .filter(Boolean) as Row[],
    })
  }

  const pollExportTask = useCallback(
    async (initial: AdminListExportTask) => {
      if (!dataSource.getExportTask) return initial
      let task = initial
      for (let attempt = 0; attempt < 120; attempt += 1) {
        if (task.status === "completed" || task.status === "failed") break
        await new Promise((resolve) => setTimeout(resolve, 1500))
        task = await dataSource.getExportTask(task.id)
        if (task.status === "running") {
          notificationApi.info({
            key: `admin-list-export:${task.id}`,
            title: `正在生成 ${Math.max(
              0,
              Math.min(100, Number(task.progress || 0)),
            )}%`,
            description: task.total
              ? `共 ${task.total} 条`
              : "正在分批处理导出数据",
            duration: 0,
            showProgress: true,
          })
        }
      }
      return task
    },
    [dataSource, notificationApi],
  )

  const downloadExportTask = async (task: AdminListExportTask) => {
    try {
      if (dataSource.downloadExportTask) {
        await dataSource.downloadExportTask(task, { fileName })
        return
      }
      if (
        typeof window !== "undefined" &&
        task.downloadUrl &&
        (/^(https?:)?\/\//i.test(task.downloadUrl) ||
          /^(blob|data):/i.test(task.downloadUrl))
      ) {
        window.open(task.downloadUrl, "_blank", "noopener")
        return
      }
      throw new Error("当前数据源未配置导出文件下载能力")
    } catch (downloadError) {
      notificationApi.error({
        key: `admin-list-export-download:${task.id}`,
        title: "下载失败",
        description:
          downloadError instanceof Error
            ? downloadError.message
            : String(downloadError || "请稍后重试"),
        duration: 0,
      })
    }
  }

  const executeExport = async (scope: "selected" | "all") => {
    if (!dataSource.createExportTask) return
    setExporting(true)
    try {
      const exportColumns = (preference.columns || [])
        .filter((column) => column.visible !== false)
        .map((column) => columns.find((item) => item.key === column.key))
        .filter(
          (definition): definition is AdminListColumn<Row> =>
            Boolean(
              definition &&
                definition.exportable !== false &&
                definition.export !== false,
            ),
        )
        .map((definition) => {
          const configured = definition.export || {}
          const title =
            typeof definition.title === "string" ||
            typeof definition.title === "number"
              ? String(definition.title)
              : definition.key
          const dataPath = Array.isArray(definition.dataIndex)
            ? definition.dataIndex.join(".")
            : definition.dataIndex || definition.key
          return {
            key: definition.key,
            title,
            valuePath: dataPath,
            ...configured,
          }
        })
      const input: AdminListExportInput = {
        scope,
        query: { ...query },
        rowIds: scope === "selected" ? selectedKeys : undefined,
        fieldKeys: exportColumns.map((column) => column.key),
        columns: exportColumns,
        fileName,
      }
      const created = await dataSource.createExportTask(input)
      notificationApi.info({
        key: `admin-list-export:${created.id}`,
        title: "导出任务已创建",
        description: "可继续使用当前页面，完成后会通知",
        duration: 3,
      })
      const finished = await pollExportTask(created)
      if (finished.status === "completed") {
        notificationApi.success({
          key: `admin-list-export:${finished.id}`,
          title: "导出完成",
          description: finished.message || "文件已生成",
          duration: 0,
          actions: finished.downloadUrl ? (
            <Button
              size="small"
              type="primary"
              onClick={() => void downloadExportTask(finished)}
            >
              下载文件
            </Button>
          ) : undefined,
        })
      } else if (finished.status === "failed") {
        notificationApi.error({
          key: `admin-list-export:${finished.id}`,
          title: "导出失败",
          description: finished.message || "请稍后重试",
          duration: 0,
        })
      }
    } catch (exportError) {
      notificationApi.error({
        title: "导出失败",
        description:
          exportError instanceof Error
            ? exportError.message
            : String(exportError || "请稍后重试"),
      })
    } finally {
      setExporting(false)
      setExportConfirmOpen(false)
    }
  }

  const exportMenuItems: MenuProps["items"] = [
    {
      key: "selected",
      label: `导出选中（${selectedKeys.length} 条）`,
      disabled: selectedKeys.length === 0,
      onClick: () => void executeExport("selected"),
    },
    {
      key: "all",
      label: `导出全部（当前条件共 ${total} 条）`,
      onClick: () => setExportConfirmOpen(true),
    },
  ]

  const openSettings = () => {
    setSettingsDraft(preference)
    setSettingsOpen(true)
  }

  const saveSettings = async () => {
    const normalized = mergeAdminListPreference({
      version: configVersion,
      columns,
      searchFields,
      defaultSorts,
      defaults: {
        pageSize: defaultPageSize,
        defaultVisibleSearchCount,
      },
      user: settingsDraft,
      locked: lockedPreference,
      allowedColumnKeys,
    })
    try {
      const saved = dataSource.preferences
        ? await dataSource.preferences.put(listKey, normalized)
        : normalized
      const next = { ...normalized, ...saved }
      setRawPreference(next)
      setPreference(next)
      setSettingsDraft(next)
      setSettingsOpen(false)
      setQuery((current) => ({
        ...current,
        currentPage: 1,
        pageSize: next.pageSize || current.pageSize,
        sorts: next.sorts || current.sorts,
      }))
      void messageApi.success("列表设置已保存")
    } catch (saveError) {
      void messageApi.error(
        saveError instanceof Error
          ? saveError.message
          : "列表设置保存失败",
      )
    }
  }

  const resetSettings = async () => {
    try {
      await dataSource.preferences?.remove(listKey)
      const reset = mergeAdminListPreference({
        version: configVersion,
        columns,
        searchFields,
        defaultSorts,
        defaults: {
          pageSize: defaultPageSize,
          defaultVisibleSearchCount,
        },
        locked: lockedPreference,
        allowedColumnKeys,
      })
      setRawPreference(null)
      setPreference(reset)
      setSettingsDraft(reset)
      setQuery((current) => ({
        ...current,
        currentPage: 1,
        pageSize: reset.pageSize || current.pageSize,
        sorts: reset.sorts || current.sorts,
      }))
      void messageApi.success("已恢复系统默认设置")
    } catch (resetError) {
      void messageApi.error(
        resetError instanceof Error
          ? resetError.message
          : "恢复默认设置失败",
      )
    }
  }

  const reorderDraft = (
    kind: "columns" | "searches",
    draggedKey: string,
    targetKey: string,
  ) => {
    if (!draggedKey || draggedKey === targetKey) return
    setSettingsDraft((current) => {
      const items = [...(current[kind] || [])]
      const from = items.findIndex((item) => item.key === draggedKey)
      const to = items.findIndex((item) => item.key === targetKey)
      if (from < 0 || to < 0) return current
      const [moved] = items.splice(from, 1)
      items.splice(to, 0, moved)
      return { ...current, [kind]: items }
    })
  }

  const updateDraftColumn = (
    key: string,
    patch: Partial<AdminListColumnPreference>,
  ) => {
    setSettingsDraft((current) => ({
      ...current,
      columns: (current.columns || []).map((column) =>
        column.key === key ? { ...column, ...patch } : column,
      ),
    }))
  }

  const settingsContent = (
    <Tabs
      activeKey={settingsTab}
      items={[
        {
          key: "search",
          label: "搜索项",
          children: (
            <Space orientation="vertical" size={12} style={{ width: "100%" }}>
              <Space>
                <span>默认展示</span>
                <InputNumber
                  min={1}
                  max={Math.max(1, searchFields.length)}
                  value={
                    settingsDraft.defaultVisibleSearchCount ||
                    defaultVisibleSearchCount
                  }
                  onChange={(value) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      defaultVisibleSearchCount:
                        Number(value) || defaultVisibleSearchCount,
                    }))
                  }
                />
                <span>项</span>
              </Space>
              {(settingsDraft.searches || []).map((item, index) => {
                const definition = searchFields.find(
                  (field) => field.key === item.key,
                )
                if (!definition) return null
                const locked =
                  definition.locked ||
                  lockedPreference?.lockedSearchKeys?.includes(item.key)
                return (
                  <div
                    draggable={!locked}
                    key={item.key}
                    onDragStart={() => setDraggedSearchKey(item.key)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() =>
                      reorderDraft(
                        "searches",
                        draggedSearchKey,
                        item.key,
                      )
                    }
                    style={{
                      alignItems: "center",
                      borderBottom: "1px solid rgba(5, 5, 5, 0.06)",
                      display: "grid",
                      gap: 12,
                      gridTemplateColumns: "24px 1fr auto",
                      padding: "12px 4px",
                    }}
                  >
                    <span
                      aria-label={`拖动第 ${index + 1} 项`}
                      style={{ color: "#8c8c8c", cursor: "grab" }}
                    >
                      <HolderOutlined />
                    </span>
                    <span>{definition.label}</span>
                    <Checkbox
                      checked={item.visible !== false}
                      disabled={locked}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          searches: (current.searches || []).map(
                            (search) =>
                              search.key === item.key
                                ? {
                                    ...search,
                                    visible: event.target.checked,
                                  }
                                : search,
                          ),
                        }))
                      }
                    >
                      显示
                    </Checkbox>
                  </div>
                )
              })}
            </Space>
          ),
        },
        {
          key: "columns",
          label: "列设置",
          children: (
            <Space orientation="vertical" size={12} style={{ width: "100%" }}>
              <Input
                allowClear
                placeholder="搜索列名称"
                value={columnSearch}
                onChange={(event) => setColumnSearch(event.target.value)}
              />
              {(settingsDraft.columns || [])
                .filter((item) => {
                  const definition = columns.find(
                    (column) => column.key === item.key,
                  )
                  return (
                    definition &&
                    String(definition.title)
                      .toLowerCase()
                      .includes(columnSearch.trim().toLowerCase())
                  )
                })
                .map((item, index) => {
                  const definition = columns.find(
                    (column) => column.key === item.key,
                  )
                  if (!definition) return null
                  const locked =
                    definition.locked ||
                    lockedPreference?.lockedColumnKeys?.includes(item.key)
                  return (
                    <div
                      draggable={!locked}
                      key={item.key}
                      onDragStart={() => setDraggedColumnKey(item.key)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() =>
                        reorderDraft(
                          "columns",
                          draggedColumnKey,
                          item.key,
                        )
                      }
                      style={{
                        alignItems: "center",
                        borderBottom: "1px solid rgba(5, 5, 5, 0.06)",
                        display: "grid",
                        gap: 12,
                        gridTemplateColumns: "24px minmax(0, 1fr) 76px 116px",
                        padding: "12px 4px",
                      }}
                    >
                      <span
                        aria-label={`拖动第 ${index + 1} 列`}
                        style={{ color: "#8c8c8c", cursor: "grab" }}
                      >
                        <HolderOutlined />
                      </span>
                      <Checkbox
                        checked={item.visible !== false}
                        disabled={locked}
                        onChange={(event) =>
                          updateDraftColumn(item.key, {
                            visible: event.target.checked,
                          })
                        }
                      >
                        {definition.title}
                        {locked ? (
                          <Tag variant="filled" style={{ marginInlineStart: 4 }}>
                            锁定
                          </Tag>
                        ) : null}
                      </Checkbox>
                      <InputNumber
                        min={60}
                        max={800}
                        size="small"
                        value={item.width}
                        onChange={(value) =>
                          updateDraftColumn(item.key, {
                            width: value ? Number(value) : undefined,
                          })
                        }
                      />
                      <Select
                        size="small"
                        value={item.fixed || "none"}
                        options={[
                          { label: "固定在左侧", value: "left" },
                          { label: "不固定", value: "none" },
                          { label: "固定在右侧", value: "right" },
                        ]}
                        onChange={(value) =>
                          updateDraftColumn(item.key, {
                            fixed:
                              value === "left" || value === "right"
                                ? value
                                : null,
                          })
                        }
                      />
                    </div>
                  )
                })}
            </Space>
          ),
        },
        {
          key: "sort",
          label: "排序",
          children: (
            <Space orientation="vertical" size={12} style={{ width: "100%" }}>
              <Alert
                showIcon
                type="info"
                title="列头快捷排序会同步更新此处"
              />
              {(settingsDraft.sorts || []).map((sort, index) => (
                <div
                  key={`${sort.field}:${index}`}
                  style={{
                    alignItems: "center",
                    borderBottom: "1px solid rgba(5, 5, 5, 0.06)",
                    display: "grid",
                    gap: 12,
                    gridTemplateColumns: "28px 1fr 100px auto",
                    padding: "12px 4px",
                  }}
                >
                  <Tag color="blue" variant="filled">
                    {index + 1}
                  </Tag>
                  <Select
                    value={sort.field}
                    options={columns
                      .filter((column) => column.sortable)
                      .map((column) => ({
                        label: column.title,
                        value: column.sortField || column.key,
                      }))}
                    onChange={(field) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        sorts: (current.sorts || []).map((item, itemIndex) =>
                          itemIndex === index ? { ...item, field } : item,
                        ),
                      }))
                    }
                  />
                  <Select
                    value={sort.direction}
                    options={[
                      { label: "升序", value: "ascend" },
                      { label: "降序", value: "descend" },
                    ]}
                    onChange={(direction) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        sorts: (current.sorts || []).map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, direction }
                            : item,
                        ),
                      }))
                    }
                  />
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    size="small"
                    type="text"
                    onClick={() =>
                      setSettingsDraft((current) => ({
                        ...current,
                        sorts: (current.sorts || []).filter(
                          (_item, itemIndex) => itemIndex !== index,
                        ),
                      }))
                    }
                  >
                    删除
                  </Button>
                </div>
              ))}
              <Button
                block
                disabled={
                  (settingsDraft.sorts || []).length >=
                  columns.filter((column) => column.sortable).length
                }
                icon={<PlusOutlined />}
                type="text"
                onClick={() => {
                  const used = new Set(
                    (settingsDraft.sorts || []).map((sort) => sort.field),
                  )
                  const next = columns.find(
                    (column) =>
                      column.sortable &&
                      !used.has(column.sortField || column.key),
                  )
                  if (!next) return
                  setSettingsDraft((current) => ({
                    ...current,
                    sorts: [
                      ...(current.sorts || []),
                      {
                        field: next.sortField || next.key,
                        direction: "ascend",
                      },
                    ],
                  }))
                }}
              >
                添加排序字段
              </Button>
            </Space>
          ),
        },
        {
          key: "display",
          label: "显示",
          children: (
            <Space orientation="vertical" size={20} style={{ width: "100%" }}>
              <Space orientation="vertical">
                <span>表格密度</span>
                <Segmented
                  options={[
                    { label: "紧凑", value: "small" },
                    { label: "默认", value: "middle" },
                    { label: "宽松", value: "large" },
                  ]}
                  value={settingsDraft.density}
                  onChange={(density) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      density: density as AdminListPreference["density"],
                    }))
                  }
                />
              </Space>
              <Space orientation="vertical">
                <span>默认每页</span>
                <Segmented
                  options={pageSizeOptions.map((value) => ({
                    label: `${value}`,
                    value,
                  }))}
                  value={settingsDraft.pageSize}
                  onChange={(pageSize) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      pageSize: Number(pageSize),
                    }))
                  }
                />
              </Space>
              <Space style={{ justifyContent: "space-between", width: "100%" }}>
                <span>完整边框</span>
                <Switch
                  checked={settingsDraft.showBorders}
                  onChange={(showBorders) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      showBorders,
                    }))
                  }
                />
              </Space>
              <Space style={{ justifyContent: "space-between", width: "100%" }}>
                <span>斑马纹</span>
                <Switch
                  checked={settingsDraft.striped}
                  onChange={(striped) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      striped,
                    }))
                  }
                />
              </Space>
              <Space style={{ justifyContent: "space-between", width: "100%" }}>
                <span>行悬浮操作</span>
                <Switch
                  checked={settingsDraft.hoverActions}
                  onChange={(hoverActions) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      hoverActions,
                    }))
                  }
                />
              </Space>
            </Space>
          ),
        },
      ]}
      onChange={setSettingsTab}
    />
  )

  const unauthorized = Number((error as Error & { status?: number })?.status) === 403
  const localeEmpty = error ? (
    unauthorized ? (
      <Result
        status="403"
        title="暂无访问权限"
        subTitle="请联系应用管理员开通页面权限"
      />
    ) : (
      <Result
        status="error"
        title="数据加载失败"
        subTitle={error.message || "网络异常或服务暂不可用"}
        extra={
          <Button onClick={() => void loadData()} type="primary">
            重新加载
          </Button>
        }
      />
    )
  ) : (
    <Empty
      description={emptyText || "暂无符合条件的数据"}
      image={Empty.PRESENTED_IMAGE_SIMPLE}
    >
      {Object.keys(query.filters).length ? (
        <Button onClick={resetSearch}>清空筛选</Button>
      ) : null}
    </Empty>
  )

  const tablePagination: TablePaginationConfig = {
    current: query.currentPage,
    pageSize: query.pageSize,
    pageSizeOptions,
    showQuickJumper: true,
    showSizeChanger: true,
    showTotal: (count) => `共 ${count} 条`,
    total,
  }

  return (
    <div className={className} style={style}>
      {messageHolder}
      {notificationHolder}
      {modalHolder}
      <Space orientation="vertical" size={16} style={{ width: "100%" }}>
        {searchFields.length ? (
          <div
            style={{
              background: "#fff",
              border: "1px solid #e8edf3",
              borderRadius: 8,
              overflowX: "auto",
              padding: "18px 20px",
            }}
          >
            <Form
              form={form}
              layout="vertical"
              onFinish={applySearch}
            >
              <div
                style={{
                  alignItems: "end",
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns:
                    "repeat(4, minmax(180px, 1fr)) minmax(256px, auto)",
                  minWidth: 1040,
                }}
              >
                {visibleSearchFields.map((field) => (
                  <Form.Item
                    key={field.key}
                    label={field.label}
                    name={field.render ? undefined : field.key}
                    style={{ marginBottom: 0 }}
                  >
                    {field.render ? (
                      <Form.Item noStyle shouldUpdate>
                        {() =>
                          field.render?.({
                            disabled: field.disabled,
                            value: form.getFieldValue(field.key),
                            onChange: (value) =>
                              form.setFieldValue(field.key, value),
                          })
                        }
                      </Form.Item>
                    ) : (
                      renderSearchControl(field)
                    )}
                  </Form.Item>
                ))}
                <Form.Item
                  style={{
                    justifySelf: "end",
                    gridColumn: 5,
                    marginBottom: 0,
                    minWidth: 256,
                  }}
                >
                  <Space size={8}>
                    <Button htmlType="submit" type="primary">
                      查询
                    </Button>
                    <Button onClick={resetSearch}>重置</Button>
                    {searchFields.length >
                    (preference.defaultVisibleSearchCount ||
                      defaultVisibleSearchCount) ? (
                      <Button
                        icon={expanded ? <UpOutlined /> : <DownOutlined />}
                        iconPlacement="end"
                        type="link"
                        onClick={() => setExpanded((current) => !current)}
                      >
                        {expanded ? "收起" : "更多筛选"}
                      </Button>
                    ) : null}
                  </Space>
                </Form.Item>
              </div>
            </Form>
          </div>
        ) : null}

        <div
          style={{
            padding: "2px 0 0",
          }}
        >
          <Space
            align="center"
            style={{ justifyContent: "space-between", width: "100%" }}
            wrap
          >
            <Space wrap>
              {typeof toolbar === "function"
                ? toolbar({ reload: () => void loadData() })
                : toolbar}
              {batchActions.length ? (
                <Dropdown
                  menu={{
                    items: batchActions.map((action) => ({
                      key: action.key,
                      label: action.label,
                      danger: action.danger,
                      disabled:
                        action.disabled || selectedKeys.length === 0,
                      onClick: () =>
                        void action.onClick(
                          selectedKeys
                            .map((key) =>
                              selectedRowsRef.current.get(key),
                            )
                            .filter(Boolean) as Row[],
                          selectedKeys,
                        ),
                    })),
                  }}
                  trigger={["click"]}
                >
                  <Button disabled={selectedKeys.length === 0}>
                    批量操作
                  </Button>
                </Dropdown>
              ) : null}
              {exportable && dataSource.createExportTask ? (
                <Dropdown menu={{ items: exportMenuItems }} trigger={["click"]}>
                  <Button
                    icon={<DownloadOutlined />}
                    loading={exporting}
                  >
                    导出
                  </Button>
                </Dropdown>
              ) : null}
            </Space>
            <Space>
              <Button
                aria-label="刷新列表"
                icon={<ReloadOutlined />}
                title="刷新"
                onClick={() => void loadData()}
              />
              <Button
                icon={<SettingOutlined />}
                onClick={openSettings}
              >
                列表设置
              </Button>
            </Space>
          </Space>
        </div>

        {selectedKeys.length ? (
          <Alert
            action={
              <Button
                size="small"
                type="link"
                onClick={() => clearSelection()}
              >
                清空选择
              </Button>
            }
            showIcon
            title={`已选择 ${selectedKeys.length} 条${
              preserveSelectionAcrossPages ? "（支持跨页保留）" : ""
            }`}
            type="info"
          />
        ) : null}

        {hiddenFieldsCount ? (
          <Alert
            closable
            showIcon
            title={`部分字段因权限限制未展示（${hiddenFieldsCount} 个）`}
            type="info"
          />
        ) : null}

        <div
          style={{
            background: "#fff",
            border: "1px solid #edf0f4",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <Table<Row>
            bordered={preference.showBorders}
            columns={resolvedColumns}
            dataSource={rows}
            loading={loading}
            locale={{ emptyText: localeEmpty }}
            pagination={tablePagination}
            rowClassName={(_row, index) =>
              preference.striped && index % 2 === 1
                ? "admin-list-row-striped"
                : ""
            }
            rowKey={(row) => getRowKey(rowKey, row)}
            rowSelection={
              selectable
                ? {
                    preserveSelectedRowKeys:
                      preserveSelectionAcrossPages,
                    selectedRowKeys: selectedKeys,
                    getCheckboxProps: (row: Row) => ({
                      disabled: rowSelectable ? !rowSelectable(row) : false,
                      title: rowSelectionReason?.(row),
                    }),
                    onChange: handleSelectionChange,
                  }
                : undefined
            }
            scroll={{ x: "max-content" }}
            size={preference.density}
            onChange={handleTableChange}
            onRow={onRow}
          />
        </div>
      </Space>

      <Drawer
        destroyOnHidden
        footer={
          <Space
            style={{ justifyContent: "space-between", width: "100%" }}
          >
            <Button
              onClick={() =>
                modalApi.confirm({
                  title: "恢复系统默认设置？",
                  content: "当前账号保存的列表配置将被清除。",
                  okText: "恢复",
                  cancelText: "取消",
                  onOk: resetSettings,
                })
              }
            >
              恢复默认
            </Button>
            <Space>
              <Button onClick={() => setSettingsOpen(false)}>取消</Button>
              <Button type="primary" onClick={() => void saveSettings()}>
                应用设置
              </Button>
            </Space>
          </Space>
        }
        open={settingsOpen}
        title={
          <div>
            <div>列表设置</div>
            <div
              style={{
                color: "rgba(0, 0, 0, 0.45)",
                fontSize: 12,
                fontWeight: 400,
                marginTop: 2,
              }}
            >
              配置将保存到当前账号
            </div>
          </div>
        }
        size={420}
        onClose={() => {
          if (
            JSON.stringify(settingsDraft) !==
            JSON.stringify(preference)
          ) {
            modalApi.confirm({
              title: "放弃未保存的设置？",
              content: "当前调整尚未应用，关闭后将丢失。",
              okText: "放弃修改",
              cancelText: "继续编辑",
              onOk: () => setSettingsOpen(false),
            })
            return
          }
          setSettingsOpen(false)
        }}
      >
        {settingsContent}
      </Drawer>

      <Modal
        cancelText="取消"
        confirmLoading={exporting}
        okText="开始导出"
        open={exportConfirmOpen}
        title="导出全部数据"
        onCancel={() => setExportConfirmOpen(false)}
        onOk={() => void executeExport("all")}
      >
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          <div>数据范围：当前查询结果</div>
          <div>预计数量：{total} 条</div>
          <div>导出格式：Excel (.xlsx)</div>
          <Alert
            showIcon
            title="大数据量将在后台生成，完成后通知"
            type="info"
          />
        </Space>
      </Modal>
    </div>
  )
}
