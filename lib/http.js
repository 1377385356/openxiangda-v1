const { formatFetchError, maskText } = require('./utils');

const DEFAULT_REQUEST_TIMEOUT_MS = normalizeTimeoutMs(
  process.env.OPENXIANGDA_REQUEST_TIMEOUT_MS,
  120000
);
const DEFAULT_CONNECT_TIMEOUT_MS = normalizeTimeoutMs(
  process.env.OPENXIANGDA_CONNECT_TIMEOUT_MS,
  30000
);

configureFetchDispatcher(DEFAULT_CONNECT_TIMEOUT_MS);

async function requestJson(baseUrl, apiPath, options = {}) {
  if (typeof fetch !== 'function') {
    throw new Error('当前 Node.js 版本不支持 fetch，请使用 Node.js 18 或更高版本');
  }

  const url = `${baseUrl.replace(/\/+$/, '')}${apiPath}`;
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    accept: 'application/json',
    ...(options.headers || {}),
  };
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (options.accessToken) {
    headers.authorization = `Bearer ${options.accessToken}`;
  }

  let response;
  try {
    response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(maskText(`HTTP request timed out after ${timeoutMs}ms: ${apiPath}`));
    }
    throw new Error(formatFetchError(error, apiPath));
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    const message = payload?.message || response.statusText || 'request failed';
    const error = new Error(maskText(`HTTP ${response.status}: ${message}`));
    error.status = response.status;
    error.payload = payload;
    error.code = payload?.errorCode || payload?.code;
    error.data = payload?.data;
    throw error;
  }

  return payload;
}

function normalizeTimeoutMs(value, fallback) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return fallback;
}

function isAbortError(error) {
  return (
    error?.name === 'AbortError' ||
    String(error?.message || '').toLowerCase().includes('aborted')
  );
}

module.exports = {
  requestJson,
};

function configureFetchDispatcher(timeoutMs) {
  try {
    // Node fetch uses undici internally but does not honor proxy environment
    // variables by itself. Keep NO_PROXY-aware routing while extending the
    // connect timeout for private and high-latency deployments.
    const { Agent, ProxyAgent, setGlobalDispatcher } = require('undici');
    const connect = { timeout: timeoutMs };
    const directAgent = new Agent({ connect });
    const httpProxyUrl = readProxyUrl('HTTP_PROXY');
    const httpsProxyUrl = readProxyUrl('HTTPS_PROXY') || httpProxyUrl;
    const allProxyUrl = readProxyUrl('ALL_PROXY');
    const httpProxyAgent = createProxyAgent(
      ProxyAgent,
      httpProxyUrl || allProxyUrl,
      connect
    );
    const httpsProxyAgent = createProxyAgent(
      ProxyAgent,
      httpsProxyUrl || allProxyUrl,
      connect
    );

    setGlobalDispatcher({
      dispatch(options, handler) {
        const origin = new URL(String(options.origin));
        if (shouldBypassProxy(origin)) {
          return directAgent.dispatch(options, handler);
        }
        const proxyAgent =
          origin.protocol === 'https:' ? httpsProxyAgent : httpProxyAgent;
        return (proxyAgent || directAgent).dispatch(options, handler);
      },
      close() {
        return closeDispatchers([
          directAgent,
          httpProxyAgent,
          httpsProxyAgent,
        ]);
      },
      destroy(error) {
        return destroyDispatchers(
          [directAgent, httpProxyAgent, httpsProxyAgent],
          error
        );
      },
    });
  } catch {
    // Keep working on runtimes where undici is not directly importable.
  }
}

function readProxyUrl(name) {
  const value = process.env[name] || process.env[name.toLowerCase()];
  return String(value || '').trim();
}

function createProxyAgent(ProxyAgent, uri, connect) {
  if (!uri) return null;
  return new ProxyAgent({ uri, connect });
}

function shouldBypassProxy(origin) {
  const noProxy = readProxyUrl('NO_PROXY');
  if (!noProxy) return false;
  const hostname = origin.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const port = origin.port || (origin.protocol === 'https:' ? '443' : '80');

  return noProxy.split(',').some(rawEntry => {
    const entry = rawEntry.trim().toLowerCase();
    if (!entry) return false;
    if (entry === '*') return true;

    const normalized = entry.replace(/^https?:\/\//, '');
    const separator = normalized.lastIndexOf(':');
    const hasSinglePortSeparator =
      separator > -1 && normalized.indexOf(':') === separator;
    const entryHost = (hasSinglePortSeparator
      ? normalized.slice(0, separator)
      : normalized
    ).replace(/^\[|\]$/g, '');
    const entryPort = hasSinglePortSeparator
      ? normalized.slice(separator + 1)
      : '';
    if (entryPort && entryPort !== port) return false;

    const suffix = entryHost.replace(/^\*?\./, '');
    return hostname === suffix || hostname.endsWith(`.${suffix}`);
  });
}

async function closeDispatchers(dispatchers) {
  await Promise.all(
    uniqueDispatchers(dispatchers).map(dispatcher => dispatcher.close())
  );
}

async function destroyDispatchers(dispatchers, error) {
  await Promise.all(
    uniqueDispatchers(dispatchers).map(dispatcher => dispatcher.destroy(error))
  );
}

function uniqueDispatchers(dispatchers) {
  return [...new Set(dispatchers.filter(Boolean))];
}
