import { usePageContext } from "./usePageContext"

import type { PageMessageApi } from "../../core/types"

export const useMessage = (): PageMessageApi => {
  return usePageContext().ui.message
}
