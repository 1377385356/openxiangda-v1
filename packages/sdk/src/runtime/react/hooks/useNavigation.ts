import { usePageContext } from "./usePageContext"

import type { PageNavigationApi } from "../../core/types"

export const useNavigation = (): PageNavigationApi => {
  return usePageContext().navigation
}
