import { usePageContext } from "./usePageContext"

export const usePageProps = <T extends object = Record<string, unknown>>() => {
  return usePageContext().page.props as T
}
