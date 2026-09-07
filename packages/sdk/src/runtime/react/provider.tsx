import React, { useMemo } from "react"

import { ReactPageContext } from "./store"
import { createPageSdk } from "../core/client"

import type { PageSdkStore } from "./store"
import type { PageContext } from "../core/types"

export interface PageProviderProps {
  context: PageContext
  children: React.ReactNode
}

export const PageProvider: React.FC<PageProviderProps> = ({
  context,
  children,
}) => {
  const value = useMemo<PageSdkStore>(
    () => ({
      context,
      sdk: createPageSdk(context),
    }),
    [context],
  )

  return (
    <ReactPageContext.Provider value={value}>
      {children}
    </ReactPageContext.Provider>
  )
}
