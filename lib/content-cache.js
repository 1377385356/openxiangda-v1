const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CACHE_SCHEMA_VERSION = 'openxiangda_content_cache_v1';
const MAX_CACHE_BYTES = 2 * 1024 * 1024;

function resolveCacheRoot(cwd) {
  const root = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const common = spawnSync('git', ['rev-parse', '--git-common-dir'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (root.status !== 0 || common.status !== 0) return null;
  const workspaceRoot = String(root.stdout || '').trim();
  const commonPath = String(common.stdout || '').trim();
  if (!workspaceRoot || !commonPath) return null;
  const commonDir = path.isAbsolute(commonPath)
    ? commonPath
    : path.resolve(workspaceRoot, commonPath);
  return path.join(commonDir, 'openxiangda', 'cache', 'v1');
}

function normalizeSegment(value, label) {
  const segment = String(value || '').trim();
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(segment)) {
    throw new Error(`invalid content cache ${label}`);
  }
  return segment;
}

function cacheFile(cwd, namespace, key) {
  const root = resolveCacheRoot(cwd);
  if (!root) return null;
  return path.join(
    root,
    normalizeSegment(namespace, 'namespace'),
    `${normalizeSegment(key, 'key')}.json`
  );
}

function readContentCache(options = {}) {
  const file = cacheFile(
    path.resolve(options.cwd || process.cwd()),
    options.namespace,
    options.key
  );
  if (!file || !fs.existsSync(file)) return null;
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_CACHE_BYTES) {
      return null;
    }
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (
      record?.schemaVersion !== CACHE_SCHEMA_VERSION ||
      record?.namespace !== options.namespace ||
      record?.key !== options.key
    ) {
      return null;
    }
    return record.value;
  } catch {
    return null;
  }
}

function writeContentCache(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const file = cacheFile(cwd, options.namespace, options.key);
  if (!file) return null;
  const record = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    namespace: options.namespace,
    key: options.key,
    value: options.value,
    createdAt: new Date().toISOString(),
  };
  const content = `${JSON.stringify(record)}\n`;
  if (Buffer.byteLength(content, 'utf8') > MAX_CACHE_BYTES) return null;
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, content, { mode: 0o600 });
  fs.renameSync(temporary, file);
  return file;
}

module.exports = {
  CACHE_SCHEMA_VERSION,
  readContentCache,
  writeContentCache,
};
