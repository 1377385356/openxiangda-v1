import { renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { PageProvider } from "../provider"
import { useFormViewPermissions } from "./useFormViewPermissions"
import { createPageContextFixture } from "../../../test/fixtures/pageContext"

import type { ReactNode } from "react"

describe("useFormViewPermissions", () => {
  it("loads view permission summary and exposes operation helpers", async () => {
    const bridgeInvoke = vi.fn<
      (method: string, payload?: unknown) => Promise<unknown>
    >(async () => ({
      code: 200,
      success: true,
      result: {
        fieldPermissions: {
          owner: "FORM_FILED_VIEW",
        },
        operations: ["view"],
      },
    }))
    const context = createPageContextFixture({ bridgeInvoke })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <PageProvider context={context}>{children}</PageProvider>
    )

    const { result } = renderHook(
      () => useFormViewPermissions("FORM_CUSTOMER"),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.can("view")).toBe(true)
    })

    expect(result.current.can("edit")).toBe(false)
    expect(result.current.getFieldPermission("owner")).toBe("FORM_FILED_VIEW")
    expect(bridgeInvoke).toHaveBeenCalledWith(
      "transport.request",
      expect.objectContaining({
        method: "get",
        path: "/permission/form-group/view-permissions",
      }),
    )
  })
})
