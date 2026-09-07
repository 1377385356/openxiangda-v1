import { useMemo } from "react"

import { usePageContext } from "./usePageContext"

import type { PageUserInfo, PageUserType } from "../../core/types"

export interface CurrentUserState {
  user: PageUserInfo & { userType: PageUserType; isGuest: boolean }
  isGuest: boolean
  isInternalUser: boolean
  displayName: string
  primaryDepartment: NonNullable<PageUserInfo["departments"]>[number] | null
  affiliatedDepartment: PageUserInfo["affiliatedDepartment"] | null
}

export const useCurrentUser = (): CurrentUserState => {
  const { user } = usePageContext()

  return useMemo(() => {
    const userType: PageUserType =
      user.userType === "guest" || user.isGuest ? "guest" : "normal"
    const isGuest = userType === "guest"

    return {
      user: {
        ...user,
        isGuest,
        userType,
      },
      isGuest,
      isInternalUser: !isGuest,
      displayName: user.name || user.username || user.id,
      primaryDepartment: user.departments?.[0] || null,
      affiliatedDepartment: user.affiliatedDepartment || null,
    }
  }, [user])
}
