import { usePageSdkStore } from "../store"

import type { PageContext } from "../../core/types"

export const usePageContext = (): PageContext => {
  return usePageSdkStore().context
}
