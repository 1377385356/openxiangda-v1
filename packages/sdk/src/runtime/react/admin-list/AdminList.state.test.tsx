import { act, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { AdminList } from "./AdminList"
import { createFormAdminListSource } from "./dataSources"
import type { AdminListResult } from "./types"

type Row = { id: string; name: string }

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

const columns = [
  {
    dataIndex: "name",
    defaultVisible: true,
    key: "name",
    title: "名称",
  },
]

const deferred = <Value,>() => {
  let resolve!: (value: Value) => void
  const promise = new Promise<Value>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

describe("AdminList list identity state", () => {
  it("refreshes when only createFormAdminListSource listKey changes", async () => {
    const refreshed = deferred<any>()
    const advancedSearch = vi
      .fn()
      .mockResolvedValueOnce({
        result: {
          code: 200,
          result: {
            currentPage: 1,
            data: [
              { id: "1", name: "活动管理" },
              { id: "2", name: "关怀服务" },
              { id: "3", name: "内容管理" },
            ],
            totalCount: 3,
          },
          success: true,
        },
      })
      .mockReturnValueOnce(refreshed.promise)
    const sdk = {
      context: { app: { appType: "APP_TEST" } },
      form: { advancedSearch },
      request: vi.fn().mockResolvedValue({ result: null }),
    } as any
    const renderList = (refreshKey: number) => (
      <AdminList<Row>
        columns={columns}
        dataSource={createFormAdminListSource<Row>({
          appType: "APP_TEST",
          formUuid: "FORM_OWNERS",
          listKey: `organization-module-owners:${refreshKey}`,
          sdk,
        })}
        exportable={false}
        listKey="organization-module-owners"
        rowKey="id"
        selectable={false}
      />
    )

    const view = render(renderList(0))
    await screen.findByText("活动管理")
    expect(screen.getByText("共 3 条")).toBeTruthy()

    view.rerender(renderList(1))
    await waitFor(() => expect(advancedSearch).toHaveBeenCalledTimes(2))

    await act(async () => {
      refreshed.resolve({
        result: {
          code: 200,
          result: {
            currentPage: 1,
            data: [
              { id: "1", name: "活动管理" },
              { id: "2", name: "关怀服务" },
              { id: "3", name: "内容管理" },
              { id: "4", name: "场地管理" },
            ],
            totalCount: 4,
          },
          success: true,
        },
      })
    })

    await screen.findByText("场地管理")
    expect(screen.getByText("共 4 条")).toBeTruthy()
    expect(screen.queryByText("共 3 条")).toBeNull()
  })

  it("never keeps a stale footer total below the refreshed current-page rows", async () => {
    const refreshed = deferred<any>()
    const advancedSearch = vi
      .fn()
      .mockResolvedValueOnce({
        result: {
          data: Array.from({ length: 5 }, (_, index) => ({
            id: String(index + 1),
            name: `负责人 ${index + 1}`,
          })),
          currentPage: 1,
          pageSize: 20,
          totalCount: 5,
        },
      })
      .mockReturnValueOnce(refreshed.promise)
    const sdk = {
      context: { app: { appType: "APP_TEST" } },
      form: { advancedSearch },
      request: vi.fn().mockResolvedValue({ result: null }),
    } as any
    const renderList = (refreshKey: number) => (
      <AdminList<Row>
        columns={columns}
        dataSource={createFormAdminListSource<Row>({
          appType: "APP_TEST",
          formUuid: "FORM_OWNERS",
          listKey: `organization-module-owners:${refreshKey}`,
          sdk,
        })}
        exportable={false}
        listKey="organization-module-owners"
        rowKey="id"
        selectable={false}
      />
    )

    const view = render(renderList(0))
    await screen.findByText("负责人 5")
    expect(screen.getByText("共 5 条")).toBeTruthy()

    view.rerender(renderList(1))
    await waitFor(() => expect(advancedSearch).toHaveBeenCalledTimes(2))
    await act(async () => {
      refreshed.resolve({
        result: {
          data: [
            { id: "6", name: "提案履职" },
            ...Array.from({ length: 5 }, (_, index) => ({
              id: String(index + 1),
              name: `负责人 ${index + 1}`,
            })),
          ],
          currentPage: 1,
          pageSize: 20,
          // The platform can briefly count before the just-created row is
          // visible to its row query. The rendered result is still a valid
          // lower bound for the total shown to the user.
          totalCount: 5,
        },
      })
    })

    await screen.findByText("提案履职")
    expect(screen.getByText("共 6 条")).toBeTruthy()
    expect(screen.queryByText("共 5 条")).toBeNull()
  })

  it("clears stale rows and total while a changed listKey refreshes", async () => {
    const refreshed = deferred<AdminListResult<Row>>()
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "old", name: "旧记录" }], total: 1 })
      .mockReturnValueOnce(refreshed.promise)
    const dataSource = { key: "form:owners", query }
    const renderList = (listKey: string) => (
      <AdminList<Row>
        columns={columns}
        dataSource={dataSource}
        exportable={false}
        listKey={listKey}
        rowKey="id"
        selectable={false}
      />
    )

    const view = render(renderList("owners:1"))
    await screen.findByText("旧记录")
    expect(screen.getByText("共 1 条")).toBeTruthy()

    view.rerender(renderList("owners:2"))
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2))
    expect(screen.queryByText("旧记录")).toBeNull()
    expect(screen.queryByText("共 1 条")).toBeNull()

    await act(async () => {
      refreshed.resolve({
        rows: [
          { id: "old", name: "旧记录" },
          { id: "new", name: "新记录" },
        ],
        total: 2,
      })
    })
    await screen.findByText("新记录")
    expect(screen.getByText("共 2 条")).toBeTruthy()
  })

  it("ignores an older request that resolves after the new listKey", async () => {
    const oldRequest = deferred<AdminListResult<Row>>()
    const currentRequest = deferred<AdminListResult<Row>>()
    const query = vi
      .fn()
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(currentRequest.promise)
    const dataSource = { key: "form:owners", query }
    const renderList = (listKey: string) => (
      <AdminList<Row>
        columns={columns}
        dataSource={dataSource}
        exportable={false}
        listKey={listKey}
        rowKey="id"
        selectable={false}
      />
    )

    const view = render(renderList("owners:before-save"))
    await waitFor(() => expect(query).toHaveBeenCalledTimes(1))
    view.rerender(renderList("owners:after-save"))
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2))

    await act(async () => {
      currentRequest.resolve({
        rows: [
          { id: "1", name: "负责人一" },
          { id: "2", name: "负责人二" },
        ],
        total: 2,
      })
    })
    await screen.findByText("共 2 条")

    await act(async () => {
      oldRequest.resolve({ rows: [{ id: "1", name: "负责人一" }], total: 1 })
    })
    await waitFor(() => {
      expect(screen.getByText("共 2 条")).toBeTruthy()
      expect(screen.queryByText("共 1 条")).toBeNull()
    })
  })
})
