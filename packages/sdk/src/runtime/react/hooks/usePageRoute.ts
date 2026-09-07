import { usePageContext } from "./usePageContext"

import type { PageRouteInfo } from "../../core/types"

export const usePageRoute = (): PageRouteInfo => {
  return usePageContext().route
}
