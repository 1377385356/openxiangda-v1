import { describe, expect, it, vi } from "vitest"

import { createPageSdk } from "./core/client"
import { createBrowserPageBridge } from "./host/browserHost"
import type { PageContext, PageTransportRequestPayload } from "./core/types"

const createContext = (invoke: PageContext["bridge"]["invoke"]) =>
  ({
    app: { appType: "APP_TEST", tenantId: "tenant-1" },
    bridge: { invoke },
    capabilities: ["transport.request"],
    env: {},
    navigation: {},
    page: { code: "owners", id: "page-1", name: "负责人", type: "custom" },
    permissions: { canView: true, hasFullAccess: true },
    protocolVersion: "1.0",
    route: { fullPath: "/owners", hash: "", params: {}, pathname: "/owners", query: {} },
    ui: { message: {}, modal: {} },
    user: { id: "user-1", username: "chair" },
  }) as PageContext

describe("runtime dynamic read cache policy", () => {
  it("makes repeated advancedSearch reads unique and no-store", async () => {
    const payloads: PageTransportRequestPayload[] = []
    const invoke = vi.fn(async (_method: string, payload?: unknown) => {
      payloads.push(payload as PageTransportRequestPayload)
      return {
        code: 200,
        result: {
          currentPage: 1,
          data: [],
          totalCount: payloads.length === 1 ? 4 : 5,
        },
        success: true,
      }
    }) as PageContext["bridge"]["invoke"]
    const sdk = createPageSdk(createContext(invoke))

    await sdk.form.advancedSearch({ formUuid: "FORM_OWNERS" })
    const refreshed = await sdk.form.advancedSearch({ formUuid: "FORM_OWNERS" })

    expect(refreshed.result?.totalCount).toBe(5)
    expect(payloads).toHaveLength(2)
    expect(payloads.every((payload) => payload.cache === "no-store")).toBe(true)
    const firstQuery = new URLSearchParams(payloads[0].query || "")
    const secondQuery = new URLSearchParams(payloads[1].query || "")
    expect(firstQuery.get("_oxCacheBust")).toBeTruthy()
    expect(secondQuery.get("_oxCacheBust")).toBeTruthy()
    expect(secondQuery.get("_oxCacheBust")).not.toBe(
      firstQuery.get("_oxCacheBust"),
    )
  })

  it("forwards no-store to the browser fetch implementation", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ code: 200, result: { totalCount: 5 } }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    ) as unknown as typeof fetch
    const bridge = createBrowserPageBridge({ fetchImpl, servicePrefix: "/service" })

    await bridge.invoke("transport.request", {
      cache: "no-store",
      method: "get",
      path: "/APP_TEST/v1/form/advancedSearch.json",
      query: "formUuid=FORM_OWNERS&_oxCacheBust=refresh-1",
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      "/service/APP_TEST/v1/form/advancedSearch.json?formUuid=FORM_OWNERS&_oxCacheBust=refresh-1",
      expect.objectContaining({ cache: "no-store", method: "GET" }),
    )
  })
})
