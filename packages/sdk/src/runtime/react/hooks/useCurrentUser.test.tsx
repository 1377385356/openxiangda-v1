import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { PageProvider } from "../provider"
import { useCurrentUser } from "./useCurrentUser"
import { createPageContextFixture } from "../../../test/fixtures/pageContext"

import type { ReactNode } from "react"

describe("useCurrentUser", () => {
  it("normalizes guest and internal user identity from PageContext", () => {
    const guestContext = createPageContextFixture({
      userType: "guest",
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <PageProvider context={guestContext}>{children}</PageProvider>
    )

    const { result } = renderHook(() => useCurrentUser(), { wrapper })

    expect(result.current.isGuest).toBe(true)
    expect(result.current.isInternalUser).toBe(false)
    expect(result.current.user.userType).toBe("guest")
    expect(result.current.user.jobNumber).toBe("guest-1")
    expect(result.current.user.phone).toBeNull()
    expect(result.current.displayName).toBe("游客_000001")
  })
})
