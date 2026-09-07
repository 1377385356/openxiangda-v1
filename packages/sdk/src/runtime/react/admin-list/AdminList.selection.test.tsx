import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { Key } from "react"
import { describe, expect, it, vi } from "vitest"

import { AdminList } from "./AdminList"

type Row = { id: string; name: string; selectable: boolean }

const rows: Row[] = [
  { id: "blocked", name: "不可选择记录", selectable: false },
  { id: "ready", name: "可选择记录", selectable: true },
]

vi.stubGlobal(
  "ResizeObserver",
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

describe("AdminList row selection", () => {
  it("keeps blocked rows disabled and supports controlled cross-page keys", async () => {
    const onSelectionChange = vi.fn()
    const dataSource = {
      query: vi.fn(async () => ({
        currentPage: 1,
        rows,
        total: rows.length,
      })),
    }
    const renderList = (selectedRowKeys: Key[]) => (
      <AdminList<Row>
        columns={[
          {
            dataIndex: "name",
            defaultVisible: true,
            key: "name",
            title: "名称",
          },
        ]}
        dataSource={dataSource}
        exportable={false}
        listKey="admin-list-selection-test"
        rowKey={(row) => row.id}
        rowSelectable={(row) => row.selectable}
        rowSelectionReason={(row) =>
          row.selectable ? "可以选择" : "业务校验未通过"
        }
        selectedRowKeys={selectedRowKeys}
        onQueryChange={() => undefined}
        onSelectionChange={(selection) => onSelectionChange(selection)}
      />
    )

    const view = render(renderList([]))
    await screen.findByText("不可选择记录")

    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[]
    expect(checkboxes).toHaveLength(3)
    expect(checkboxes[1].disabled).toBe(true)
    expect(checkboxes[2].disabled).toBe(false)

    fireEvent.click(checkboxes[2])
    await waitFor(() =>
      expect(onSelectionChange).toHaveBeenLastCalledWith({
        rowKeys: ["ready"],
        rows: [rows[1]],
      }),
    )

    view.rerender(renderList(["ready"]))
    await waitFor(() => {
      const next = screen.getAllByRole("checkbox") as HTMLInputElement[]
      expect(next[2].checked).toBe(true)
    })
    expect(dataSource.query).toHaveBeenCalledTimes(1)
  })

  it("exports the selected stable row keys without issuing another query", async () => {
    const createExportTask = vi.fn(async () => ({
      id: "export-1",
      status: "completed" as const,
      downloadUrl: "/file/download-by-ticket?ticket=export-1",
    }))
    const downloadExportTask = vi.fn(async () => undefined)
    const openWindow = vi.spyOn(window, "open").mockImplementation(() => null)
    const dataSource = {
      createExportTask,
      downloadExportTask,
      query: vi.fn(async () => ({
        currentPage: 1,
        rows,
        total: rows.length,
      })),
    }

    render(
      <AdminList<Row>
        columns={[
          {
            dataIndex: "name",
            defaultVisible: true,
            key: "name",
            title: "名称",
          },
        ]}
        dataSource={dataSource}
        listKey="admin-list-selected-export-test"
        rowKey="id"
      />,
    )

    await screen.findByText("可选择记录")
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[]
    fireEvent.click(checkboxes[2])
    fireEvent.click(screen.getByRole("button", { name: /导出/ }))
    fireEvent.click(await screen.findByText("导出选中（1 条）"))

    await waitFor(() =>
      expect(createExportTask).toHaveBeenCalledWith(
        expect.objectContaining({
          rowIds: ["ready"],
          scope: "selected",
          columns: [
            expect.objectContaining({
              key: "name",
              title: "名称",
              valuePath: "name",
            }),
          ],
        }),
      ),
    )
    expect(dataSource.query).toHaveBeenCalledTimes(1)

    fireEvent.click(
      await screen.findByRole("button", { name: "下载文件" }),
    )
    await waitFor(() =>
      expect(downloadExportTask).toHaveBeenCalledWith(
        expect.objectContaining({
          downloadUrl: "/file/download-by-ticket?ticket=export-1",
          id: "export-1",
        }),
        { fileName: undefined },
      ),
    )
    expect(openWindow).not.toHaveBeenCalled()
    openWindow.mockRestore()
  })

  it("keeps the selection when pagination carries the current multi-sort state", async () => {
    const pageRows = [
      { id: "page-1", name: "第一页记录", selectable: true },
      { id: "page-2", name: "第二页记录", selectable: true },
    ]
    const onSelectionChange = vi.fn()
    const dataSource = {
      query: vi.fn(async (query: { currentPage: number }) => ({
        currentPage: query.currentPage,
        rows: [pageRows[query.currentPage - 1]],
        total: pageRows.length,
      })),
    }
    const { container } = render(
      <AdminList<Row>
        columns={[
          {
            dataIndex: "name",
            defaultVisible: true,
            key: "name",
            sortable: true,
            title: "名称",
          },
        ]}
        dataSource={dataSource}
        defaultPageSize={1}
        defaultSorts={[
          { direction: "ascend", field: "id" },
          { direction: "ascend", field: "name" },
        ]}
        exportable={false}
        listKey="admin-list-cross-page-selection-test"
        pageSizeOptions={[1]}
        rowKey="id"
        onSelectionChange={onSelectionChange}
      />,
    )

    await screen.findByText("第一页记录")
    const firstPageCheckboxes = screen.getAllByRole("checkbox")
    fireEvent.click(firstPageCheckboxes[1])
    await screen.findByText(/已选择 1 条/)

    const nextButton = container.querySelector<HTMLButtonElement>(
      ".ant-pagination-next button",
    )
    expect(nextButton).toBeTruthy()
    fireEvent.click(nextButton!)

    await screen.findByText("第二页记录")
    expect(screen.getByText(/已选择 1 条/)).toBeTruthy()
    expect(onSelectionChange).not.toHaveBeenLastCalledWith({
      rowKeys: [],
      rows: [],
    })
    expect(dataSource.query).toHaveBeenCalledTimes(2)
  })
})
