import { renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { PageProvider } from "../provider"
import { useDataSource } from "./useDataSource"
import {
  createPageContextFixture,
  type CustomerRecord,
  customerListResponse,
} from "../../../test/fixtures/pageContext"

import type { PageListResult } from "../../core/types"
import type { ReactNode } from "react"

describe("useDataSource", () => {
  it("runs data sources through sdk.dataSource.run and exposes normalized state", async () => {
    const bridgeInvoke = vi.fn<
      (method: string, payload?: unknown) => Promise<unknown>
    >(async () => customerListResponse)
    const context = createPageContextFixture({
      bridgeInvoke,
    })

    const wrapper = ({ children }: { children: ReactNode }) => (
      <PageProvider context={context}>{children}</PageProvider>
    )

    const { result } = renderHook(
      () =>
        useDataSource<PageListResult<CustomerRecord>>("customerList", {
          immediate: true,
        }),
      {
        wrapper,
      },
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.data?.data).toHaveLength(3)
    })

    const payload = (
      bridgeInvoke.mock.calls as Array<[string, { query?: string } | undefined]>
    )[0]?.[1]

    expect(result.current.response?.code).toBe(200)
    expect(result.current.result?.totalCount).toBe(3)
    expect(bridgeInvoke).toHaveBeenCalledWith(
      "transport.request",
      expect.objectContaining({
        method: "get",
        path: `/${context.app.appType}/v1/form/advancedSearch.json`,
      }),
    )
    expect(
      new URLSearchParams(String(payload?.query || "")).get("formUuid"),
    ).toBe("FORM_BF7A097684894AACB63721A46B694C78")
  })

  it("applies transform and surfaces sdk request errors", async () => {
    const bridgeInvoke = vi
      .fn<(method: string, payload?: unknown) => Promise<unknown>>()
      .mockResolvedValueOnce(customerListResponse)
      .mockRejectedValueOnce({
        code: 403,
        message: "no permission",
      })
    const context = createPageContextFixture({
      bridgeInvoke,
    })

    const wrapper = ({ children }: { children: ReactNode }) => (
      <PageProvider context={context}>{children}</PageProvider>
    )

    const { result } = renderHook(
      () =>
        useDataSource<PageListResult<CustomerRecord>, string[]>(
          "customerList",
          {
            immediate: false,
            transform: (payload) =>
              payload.data.map((item) => item.customerName),
          },
        ),
      {
        wrapper,
      },
    )

    await result.current.run()

    await waitFor(() => {
      expect(result.current.data).toEqual([
        "杭州星云科技",
        "苏州明川智能",
        "深圳云启制造",
      ])
    })

    await result.current.run()

    await waitFor(() => {
      expect(result.current.error?.message).toBe("no permission")
      expect(result.current.response).toBeNull()
      expect(result.current.result).toBeNull()
    })
  })

  it("does not rerun only because inline transform identity changes", async () => {
    const bridgeInvoke = vi.fn<
      (method: string, payload?: unknown) => Promise<unknown>
    >(async () => customerListResponse)
    const context = createPageContextFixture({
      bridgeInvoke,
    })

    const wrapper = ({ children }: { children: ReactNode }) => (
      <PageProvider context={context}>{children}</PageProvider>
    )

    const { result, rerender } = renderHook(
      () =>
        useDataSource<PageListResult<CustomerRecord>, string[]>(
          "customerList",
          {
            transform: (payload) =>
              payload.data.map((item) => item.customerName),
          },
        ),
      {
        wrapper,
      },
    )

    await waitFor(() => {
      expect(result.current.data).toEqual([
        "杭州星云科技",
        "苏州明川智能",
        "深圳云启制造",
      ])
    })

    expect(bridgeInvoke).toHaveBeenCalledTimes(1)

    rerender()

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(bridgeInvoke).toHaveBeenCalledTimes(1)
  })
})
