import { useCallback, useEffect, useRef, useState } from "react"

import { usePageSdk } from "./usePageSdk"

import type { PageApiResponse } from "../../core/types"
import type { Dispatch, SetStateAction } from "react"

const createParamsSignature = (value: unknown): string => {
  try {
    return JSON.stringify(value || {})
  } catch {
    return ""
  }
}

export interface UseDataSourceOptions<
  TResult = unknown,
  TData = TResult,
  TParams extends Record<string, unknown> = Record<string, unknown>,
> {
  params?: TParams
  immediate?: boolean
  transform?: (result: TResult, response: PageApiResponse<TResult>) => TData
}

export interface UseDataSourceResult<
  TResult = unknown,
  TData = TResult,
  TParams extends Record<string, unknown> = Record<string, unknown>,
> {
  response: PageApiResponse<TResult> | null
  result: TResult | null
  data: TData | null
  loading: boolean
  error: Error | null
  refresh: (params?: TParams) => Promise<PageApiResponse<TResult> | null>
  run: (params?: TParams) => Promise<PageApiResponse<TResult> | null>
  setResponse: Dispatch<SetStateAction<PageApiResponse<TResult> | null>>
  setResult: Dispatch<SetStateAction<TResult | null>>
  setData: Dispatch<SetStateAction<TData | null>>
}

export const useDataSource = <
  TResult = unknown,
  TData = TResult,
  TParams extends Record<string, unknown> = Record<string, unknown>,
>(
  name: string,
  options: UseDataSourceOptions<TResult, TData, TParams> = {},
): UseDataSourceResult<TResult, TData, TParams> => {
  const sdk = usePageSdk()
  const { params, immediate = true, transform } = options
  const paramsRef = useRef(params)
  const transformRef = useRef(transform)
  const paramsSignature = createParamsSignature(params)
  const [response, setResponse] = useState<PageApiResponse<TResult> | null>(
    null,
  )
  const [result, setResult] = useState<TResult | null>(null)
  const [data, setData] = useState<TData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  paramsRef.current = params
  transformRef.current = transform

  const run = useCallback(
    async (overrideParams?: TParams) => {
      setLoading(true)
      setError(null)
      try {
        const response = await sdk.dataSource.run<TResult>(
          name,
          overrideParams || paramsRef.current || {},
        )
        setResponse(response)
        setResult(response.result as TResult | null)
        const activeTransform = transformRef.current
        const nextData = activeTransform
          ? activeTransform(response.result as TResult, response)
          : ((response.result ?? null) as unknown as TData | null)
        setData(nextData)
        return response
      } catch (runtimeError) {
        const nextError =
          runtimeError instanceof Error
            ? runtimeError
            : new Error(String(runtimeError))
        setError(nextError)
        setResponse(null)
        setResult(null)
        return null
      } finally {
        setLoading(false)
      }
    },
    [name, sdk.dataSource],
  )

  useEffect(() => {
    if (!immediate) {
      return
    }
    void run()
  }, [immediate, paramsSignature, run])

  return {
    response,
    result,
    data,
    loading,
    error,
    refresh: run,
    run,
    setResponse,
    setResult,
    setData,
  }
}
