export interface TransientFetchRetryOptions {
  enabled?: boolean;
  retries?: number;
  baseDelayMs?: number;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isTransientFetchError = (error: unknown) => {
  const anyError = error as any;
  const message = String(anyError?.message || error || "").toLowerCase();
  const causeCode = String(anyError?.cause?.code || "").toLowerCase();
  return (
    causeCode === "und_err_connect_timeout" ||
    message.includes("und_err_connect_timeout") ||
    message.includes("connect_timeout") ||
    message.includes("econnreset") ||
    message.includes("socket hang up") ||
    message.includes("network socket disconnected") ||
    message.includes("fetch failed")
  );
};

export const fetchWithTransientRetry = async (
  fetchImpl: typeof fetch,
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
  options: TransientFetchRetryOptions = {},
): Promise<Response> => {
  if (!options.enabled) {
    return fetchImpl(input, init);
  }

  const retries = Number.isFinite(Number(options.retries))
    ? Number(options.retries)
    : 2;
  const baseDelayMs = Number.isFinite(Number(options.baseDelayMs))
    ? Number(options.baseDelayMs)
    : 250;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchImpl(input, init);
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !isTransientFetchError(error)) {
        throw error;
      }
      await sleep(Math.min(baseDelayMs * Math.pow(2, attempt), 2000));
    }
  }

  throw lastError;
};

export const createBoundFetch = (fetchImpl?: typeof fetch): typeof fetch => {
  const baseFetch = fetchImpl || globalThis.fetch;
  return ((input, init) => baseFetch.call(globalThis, input, init)) as typeof fetch;
};
