import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { usePageSdk } from "./hooks/usePageSdk"

describe("PageSdk store", () => {
  it("throws when hooks are used outside PageProvider", () => {
    expect(() => renderHook(() => usePageSdk())).toThrowError(
      "usePageSdkStore 必须在 PageProvider 内使用",
    )
  })
})
