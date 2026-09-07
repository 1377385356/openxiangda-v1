const { spawn } = require('child_process');
const os = require('os');

const sensitiveTextValues = new Set();

function buildSensitiveTextVariants(value) {
  const normalized = String(value);
  const bytes = Buffer.from(normalized, 'utf8');
  const base64 = bytes.toString('base64');
  const variants = [
    normalized,
    JSON.stringify(normalized).slice(1, -1),
    encodeURIComponent(normalized),
    base64,
    base64.replace(/=+$/g, ''),
    bytes.toString('base64url'),
    bytes.toString('hex'),
  ].filter(Boolean);
  return Array.from(
    new Set([
      ...variants,
      ...variants.map(variant => JSON.stringify(variant).slice(1, -1)),
    ])
  );
}

function registerSensitiveText(value) {
  if (value === undefined || value === null) return;
  const normalized = String(value);
  if (!normalized) return;
  for (const variant of buildSensitiveTextVariants(normalized)) {
    sensitiveTextValues.add(variant);
  }
}

function clearSensitiveText() {
  sensitiveTextValues.clear();
}

function maskText(value) {
  let masked = String(value || '')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '***token***')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, match => {
      const [name, domain] = match.split('@');
      return `${name.slice(0, 2)}***@${domain}`;
    })
    .replace(/\b1[3-9]\d{9}\b/g, match => `${match.slice(0, 3)}****${match.slice(-4)}`);
  for (const sensitive of Array.from(sensitiveTextValues).sort(
    (left, right) => right.length - left.length
  )) {
    masked = masked.split(sensitive).join('***secret***');
  }
  return masked;
}

function maskSensitiveTextOnly(value) {
  let masked = String(value || '');
  for (const sensitive of Array.from(sensitiveTextValues).sort(
    (left, right) => right.length - left.length
  )) {
    masked = masked.split(sensitive).join('***secret***');
  }
  return masked;
}

function maskSensitiveJsonValue(value, seen = new WeakSet()) {
  if (typeof value === 'string') return maskSensitiveTextOnly(value);
  if (!value || typeof value !== 'object') return value;
  if (typeof value.toJSON === 'function') {
    return maskSensitiveJsonValue(value.toJSON(), seen);
  }
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  const masked = Array.isArray(value)
    ? value.map(item => maskSensitiveJsonValue(item, seen))
    : Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          maskSensitiveTextOnly(key),
          maskSensitiveJsonValue(child, seen),
        ])
      );
  seen.delete(value);
  return masked;
}

function formatFetchError(error, context) {
  const message = error && error.message ? String(error.message) : String(error || 'fetch failed');
  const cause = error && error.cause;
  const causeParts = [];
  if (cause?.code) causeParts.push(String(cause.code));
  if (cause?.name) causeParts.push(String(cause.name));
  if (cause?.message) causeParts.push(String(cause.message));
  const suffix = causeParts.length ? `; cause=${causeParts.join(': ')}` : '';
  const contextSuffix = context ? `; request=${context}` : '';
  return maskText(`${message}${suffix}${contextSuffix}`);
}

function print(value) {
  console.log(maskText(value));
}

function warn(value) {
  console.warn(maskText(value));
}

function fail(value) {
  throw new Error(maskText(value));
}

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '-h') {
      flags.h = true;
      continue;
    }
    if (!item.startsWith('--')) {
      positional.push(item);
      continue;
    }

    const eqIndex = item.indexOf('=');
    if (eqIndex > 0) {
      flags[item.slice(2, eqIndex)] = item.slice(eqIndex + 1);
      continue;
    }

    const key = item.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return { flags, positional };
}

function openBrowser(url) {
  const platform = os.platform();
  const command =
    platform === 'darwin'
      ? 'open'
      : platform === 'win32'
        ? 'cmd'
        : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function writeJson(value) {
  console.log(JSON.stringify(maskSensitiveJsonValue(value), null, 2));
}

module.exports = {
  fail,
  clearSensitiveText,
  formatFetchError,
  maskText,
  openBrowser,
  parseArgs,
  print,
  registerSensitiveText,
  sleep,
  warn,
  writeJson,
};
