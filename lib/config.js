const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const { parse: parseDotenv } = require('dotenv');

const CONFIG_DIR = path.join(os.homedir(), '.openxiangda');
const CONFIG_FILE = path.join(CONFIG_DIR, 'profiles.json');
const GLOBAL_ENV_FILE = path.join(CONFIG_DIR, '.env');
const PROJECT_DIR = '.openxiangda';
const PROJECT_STATE_FILE = path.join(PROJECT_DIR, 'state.json');
const LEGACY_PROJECT_CONFIG_FILE = path.join(PROJECT_DIR, 'profiles.json');
const PROJECT_STATE_LOCK_TIMEOUT_MS = 15_000;
const PROJECT_STATE_STALE_LOCK_MS = 30_000;
const projectStateBaselines = new WeakMap();

function emptyConfig() {
  return {
    version: 1,
    currentProfile: null,
    profiles: {},
  };
}

function ensureUserConfigDir() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(CONFIG_DIR, 0o700);
  } catch {
    // chmod is best-effort on non-POSIX filesystems.
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function normalizeConfig(config) {
  return {
    ...emptyConfig(),
    ...(config || {}),
    profiles: config?.profiles || {},
  };
}

function mergeConfigs(...configs) {
  const merged = emptyConfig();
  for (const config of configs) {
    if (!config) continue;
    const normalized = normalizeConfig(config);
    merged.version = normalized.version || merged.version;
    if (normalized.currentProfile) {
      merged.currentProfile = normalized.currentProfile;
    }
    for (const [name, profile] of Object.entries(normalized.profiles)) {
      merged.profiles[name] = mergeProfile(merged.profiles[name], profile);
    }
  }
  return normalizeConfig(merged);
}

function mergeProfile(previous = {}, next = {}) {
  const merged = {
    ...previous,
    ...next,
  };
  const baseUrlChanged =
    previous.baseUrl && next.baseUrl && previous.baseUrl !== next.baseUrl;
  for (const key of ['token', 'user', 'tenant']) {
    if (
      !baseUrlChanged &&
      !Object.prototype.hasOwnProperty.call(next, key) &&
      previous[key] != null
    ) {
      merged[key] = previous[key];
    }
  }
  return merged;
}

function isConfigEqual(left, right) {
  return JSON.stringify(normalizeConfig(left)) === JSON.stringify(normalizeConfig(right));
}

function loadConfig(cwd = process.cwd()) {
  ensureUserConfigDir();
  const globalConfig = readJson(CONFIG_FILE, null);
  const legacyConfig = readJson(path.join(cwd, LEGACY_PROJECT_CONFIG_FILE), null);

  if (legacyConfig?.profiles && Object.keys(legacyConfig.profiles).length > 0) {
    const migrated = mergeConfigs(legacyConfig, globalConfig);
    if (!globalConfig || !isConfigEqual(globalConfig, migrated)) {
      saveConfig(migrated);
    }
    return migrated;
  }

  return normalizeConfig(globalConfig);
}

function saveConfig(config) {
  ensureUserConfigDir();
  const normalized = normalizeConfig(config);
  const tempFile = `${CONFIG_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tempFile, `${JSON.stringify(normalized, null, 2)}\n`, {
    mode: 0o600,
  });
  fs.renameSync(tempFile, CONFIG_FILE);
  try {
    fs.chmodSync(CONFIG_FILE, 0o600);
  } catch {
    // chmod is best-effort on non-POSIX filesystems.
  }
}

function normalizeBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('平台地址不能为空');
  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error('平台地址必须使用 http 或 https');
  }
  const cleanPath = url.pathname.replace(/\/+$/, '');
  if (
    !cleanPath ||
    cleanPath === '/platform' ||
    cleanPath.startsWith('/platform/') ||
    cleanPath === '/view' ||
    cleanPath.startsWith('/view/')
  ) {
    return `${url.origin}/service`;
  }
  return `${url.origin}${cleanPath}`.replace(/\/+$/, '');
}

function getProfile(config, name) {
  const profileName = name || config.currentProfile;
  if (!profileName) {
    throw new Error('未选择平台 profile，请先执行 openxiangda platform add <name> <url>');
  }
  const profile = config.profiles[profileName];
  if (!profile) {
    throw new Error(`平台 profile 不存在: ${profileName}`);
  }
  return { profileName, profile };
}

function emptyProjectState() {
  return {
    version: 1,
    profiles: {},
  };
}

function normalizeProjectState(state) {
  return {
    version: 1,
    ...(state || {}),
    profiles: state?.profiles || {},
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadProjectState(cwd = process.cwd()) {
  const state = normalizeProjectState(
    readJson(path.join(cwd, PROJECT_STATE_FILE), emptyProjectState())
  );
  projectStateBaselines.set(state, cloneJson(state));
  return state;
}

function saveProjectState(state, cwd = process.cwd()) {
  const dir = path.join(cwd, PROJECT_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const stateFile = path.join(cwd, PROJECT_STATE_FILE);
  const lockFile = `${stateFile}.lock`;
  const desired = normalizeProjectState(state);
  const baseline = projectStateBaselines.get(state) || emptyProjectState();
  const operations = collectProjectStateOperations(baseline, desired);
  const lockFd = acquireProjectStateLock(lockFile);
  try {
    const current = readProjectStateForUpdate(stateFile);
    const merged = applyProjectStateOperations(current, operations);
    atomicWriteJson(stateFile, normalizeProjectState(merged));
    // Keep the caller's own snapshot as its next three-way-merge baseline. Do
    // not replace it with `merged`: the caller may still hold nested object
    // references, and unrelated concurrent additions must not look like local
    // deletions on its next save.
    projectStateBaselines.set(state, cloneJson(desired));
    return merged;
  } finally {
    releaseProjectStateLock(lockFile, lockFd);
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function jsonEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => jsonEqual(value, right[index]))
    );
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key, index) => key === rightKeys[index] && jsonEqual(left[key], right[key])
      )
    );
  }
  return false;
}

function collectProjectStateOperations(base, desired, pathParts = [], result = []) {
  if (jsonEqual(base, desired)) return result;

  if (isPlainObject(desired) && (base === undefined || isPlainObject(base))) {
    const baseObject = isPlainObject(base) ? base : {};
    const desiredKeys = Object.keys(desired);
    if (base === undefined && desiredKeys.length === 0) {
      result.push({ type: 'set', path: pathParts, base, value: {} });
      return result;
    }
    for (const key of new Set([...Object.keys(baseObject), ...desiredKeys])) {
      const baseHasKey = Object.prototype.hasOwnProperty.call(baseObject, key);
      const desiredHasKey = Object.prototype.hasOwnProperty.call(desired, key);
      if (!desiredHasKey) {
        result.push({
          type: 'delete',
          path: [...pathParts, key],
          base: baseObject[key],
        });
      } else {
        collectProjectStateOperations(
          baseHasKey ? baseObject[key] : undefined,
          desired[key],
          [...pathParts, key],
          result
        );
      }
    }
    return result;
  }

  result.push({ type: 'set', path: pathParts, base, value: cloneJsonValue(desired) });
  return result;
}

function cloneJsonValue(value) {
  return value === undefined ? undefined : cloneJson(value);
}

function readPathValue(root, pathParts) {
  let current = root;
  for (const part of pathParts) {
    if (!isPlainObject(current) || !Object.prototype.hasOwnProperty.call(current, part)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function setPathValue(root, pathParts, value) {
  if (pathParts.length === 0) return cloneJsonValue(value);
  let current = root;
  for (const part of pathParts.slice(0, -1)) {
    if (!isPlainObject(current[part])) current[part] = {};
    current = current[part];
  }
  current[pathParts[pathParts.length - 1]] = cloneJsonValue(value);
  return root;
}

function deletePathValue(root, pathParts) {
  if (pathParts.length === 0) return emptyProjectState();
  let current = root;
  for (const part of pathParts.slice(0, -1)) {
    if (!isPlainObject(current?.[part])) return root;
    current = current[part];
  }
  delete current[pathParts[pathParts.length - 1]];
  return root;
}

function isTimestampPath(pathParts) {
  return pathParts[pathParts.length - 1] === 'updatedAt';
}

function applyProjectStateOperations(currentState, operations) {
  let merged = cloneJson(normalizeProjectState(currentState));
  for (const operation of operations) {
    const currentValue = readPathValue(merged, operation.path);
    const desiredValue = operation.type === 'delete' ? undefined : operation.value;
    const unchangedSinceLoad = jsonEqual(currentValue, operation.base);
    const alreadyApplied = jsonEqual(currentValue, desiredValue);
    if (!unchangedSinceLoad && !alreadyApplied && !isTimestampPath(operation.path)) {
      const error = new Error(
        `项目状态并发冲突: ${formatProjectStatePath(operation.path)} 已被其他进程修改，请重新执行当前命令`
      );
      error.code = 'OPENXIANGDA_STATE_CONFLICT';
      error.path = operation.path.join('.');
      throw error;
    }
    merged =
      operation.type === 'delete'
        ? deletePathValue(merged, operation.path)
        : setPathValue(merged, operation.path, operation.value);
  }
  return merged;
}

function formatProjectStatePath(pathParts) {
  return pathParts.length > 0 ? pathParts.join('.') : '<root>';
}

function readProjectStateForUpdate(stateFile) {
  if (!fs.existsSync(stateFile)) return emptyProjectState();
  try {
    return normalizeProjectState(JSON.parse(fs.readFileSync(stateFile, 'utf8')));
  } catch (error) {
    const wrapped = new Error(`项目状态文件不是有效 JSON，已停止覆盖: ${stateFile}`);
    wrapped.code = 'OPENXIANGDA_STATE_INVALID';
    wrapped.cause = error;
    throw wrapped;
  }
}

function acquireProjectStateLock(lockFile) {
  const startedAt = Date.now();
  while (true) {
    try {
      const fd = fs.openSync(lockFile, 'wx', 0o600);
      fs.writeFileSync(fd, `${process.pid} ${new Date().toISOString()}\n`);
      fs.fsyncSync(fd);
      return fd;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      removeStaleProjectStateLock(lockFile);
      if (Date.now() - startedAt >= PROJECT_STATE_LOCK_TIMEOUT_MS) {
        const timeout = new Error(`等待项目状态锁超时: ${lockFile}`);
        timeout.code = 'OPENXIANGDA_STATE_LOCK_TIMEOUT';
        throw timeout;
      }
      sleepSync(10 + Math.floor(Math.random() * 20));
    }
  }
}

function removeStaleProjectStateLock(lockFile) {
  try {
    const stat = fs.statSync(lockFile);
    if (Date.now() - stat.mtimeMs <= PROJECT_STATE_STALE_LOCK_MS) return;
    fs.unlinkSync(lockFile);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function releaseProjectStateLock(lockFile, fd) {
  try {
    fs.closeSync(fd);
  } finally {
    try {
      fs.unlinkSync(lockFile);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function sleepSync(milliseconds) {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, milliseconds);
}

function atomicWriteJson(file, value) {
  const dir = path.dirname(file);
  const tempFile = `${file}.${process.pid}.${Date.now()}.${crypto
    .randomBytes(6)
    .toString('hex')}.tmp`;
  let fd;
  try {
    fd = fs.openSync(tempFile, 'wx', 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tempFile, file);
    fsyncDirectory(dir);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try {
      fs.unlinkSync(tempFile);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function fsyncDirectory(dir) {
  let fd;
  try {
    fd = fs.openSync(dir, 'r');
    fs.fsyncSync(fd);
  } catch {
    // Directory fsync is not supported on every platform/filesystem.
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function loadGlobalEnv() {
  ensureUserConfigDir();
  try {
    return parseDotenv(fs.readFileSync(GLOBAL_ENV_FILE));
  } catch {
    return {};
  }
}

module.exports = {
  CONFIG_DIR,
  CONFIG_FILE,
  GLOBAL_ENV_FILE,
  PROJECT_STATE_FILE,
  getProfile,
  loadGlobalEnv,
  loadConfig,
  loadProjectState,
  normalizeBaseUrl,
  saveConfig,
  saveProjectState,
};
