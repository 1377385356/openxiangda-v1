import { usePageSdkStore } from "../store"

import type { PageSdk } from "../../core/types"

export const usePageSdk = (): PageSdk => {
  return usePageSdkStore().sdk
}
