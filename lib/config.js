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

const configPaths = new WeakMap();

function workspaceRoot(cwd = process.cwd()) {
  const start = path.resolve(cwd);
  if (!fs.existsSync(start)) return start;
  let directory = start;
  while (directory !== os.homedir()) {
    if (['app-workspace.config.ts', 'app-workspace.config.js', 'openxiangda.config.ts', '.openxiangda/profiles.json']
      .some(file => fs.existsSync(path.join(directory, file)))) return directory;
    if (fs.existsSync(path.join(directory, '.git'))) return start;
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return start;
}

function getConfigFile(config, cwd = process.cwd()) {
  return configPaths.get(config) || path.join(workspaceRoot(cwd), PROJECT_DIR, 'profiles.json');
}

function assertConfigFile(file) {
  if (file === CONFIG_FILE) throw new Error('请进入项目工作区后登录；不再使用用户主目录的全局登录态');
  for (const target of [path.dirname(file), file]) {
    try {
      const info = fs.lstatSync(target);
      if (info.isSymbolicLink() || (target === file && (!info.isFile() || info.size > 1024 * 1024))) {
        throw new Error(`工作区登录态必须是普通文件: ${file}`);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function loadConfig(cwd = process.cwd(), options = {}) {
  const file = options.exact
    ? path.join(path.resolve(cwd), PROJECT_DIR, 'profiles.json')
    : getConfigFile(null, cwd);
  assertConfigFile(file);
  let config;
  try {
    config = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!config || typeof config !== 'object' || Array.isArray(config) ||
        !config.profiles || typeof config.profiles !== 'object' || Array.isArray(config.profiles)) {
      throw new Error('invalid configuration');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`工作区登录态无法解析，请在当前工作区重新登录: ${file}`);
  }
  const result = normalizeConfig(config);
  configPaths.set(result, file);
  return result;
}

function saveConfig(config) {
  const file = getConfigFile(config);
  assertConfigFile(file);
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  const ignore = path.join(directory, '.gitignore');
  let current = '';
  try {
    if (!fs.lstatSync(ignore).isFile() || fs.lstatSync(ignore).isSymbolicLink()) throw new Error('登录态忽略文件必须是普通文件');
    current = fs.readFileSync(ignore, 'utf8');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const missing = ['/profiles.json', '/profiles.json.*'].filter(entry => !current.split(/\r?\n/).includes(entry));
  if (missing.length) fs.writeFileSync(ignore, `${current}${current && !current.endsWith('\n') ? '\n' : ''}${missing.join('\n')}\n`, { mode: 0o600 });
  atomicWriteJson(file, normalizeConfig(config));
  fs.chmodSync(file, 0o600);
  configPaths.set(config, file);
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
  getConfigFile,
  loadGlobalEnv,
  loadConfig,
  loadProjectState,
  normalizeBaseUrl,
  saveConfig,
  saveProjectState,
};
