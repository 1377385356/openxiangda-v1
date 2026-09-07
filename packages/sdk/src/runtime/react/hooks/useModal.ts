import { usePageContext } from "./usePageContext"

import type { PageModalApi } from "../../core/types"

export const useModal = (): PageModalApi => {
  return usePageContext().ui.modal
}
