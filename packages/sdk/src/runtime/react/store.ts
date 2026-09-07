import { createContext, useContext } from "react"

import type { PageContext, PageSdk } from "../core/types"

export interface PageSdkStore {
  context: PageContext
  sdk: PageSdk
}

export const ReactPageContext = createContext<PageSdkStore | null>(null)

export const usePageSdkStore = () => {
  const store = useContext(ReactPageContext)
  if (!store) {
    throw new Error("usePageSdkStore 必须在 PageProvider 内使用")
  }
  return store
}
