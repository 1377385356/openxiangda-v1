import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getApiBaseUrl, rootDir } from "./load-config.mjs";

const PROJECT_STATE_FILE = ".openxiangda/state.json";

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

function getWorkspaceRoot(config) {
  return config.workspaceRoot || rootDir;
}

function getProjectStatePath(config) {
  return path.join(getWorkspaceRoot(config), PROJECT_STATE_FILE);
}

function loadProjectState(config) {
  return readJson(getProjectStatePath(config), {
    version: 1,
    profiles: {},
  });
}

function saveProjectState(config, state) {
  const statePath = getProjectStatePath(config);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const normalized = {
    version: 1,
    ...state,
    profiles: state.profiles || {},
  };
  const tempPath = `${statePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
  fs.renameSync(tempPath, statePath);
}

function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function ensureResourceBuckets(bound) {
  bound.resources = bound.resources || {};
  bound.resources.forms = bound.resources.forms || {};
  bound.resources.pages = bound.resources.pages || {};
  bound.resources.workflows = bound.resources.workflows || {};
  bound.resources.automations = bound.resources.automations || {};
  bound.resources.menus = bound.resources.menus || {};
  bound.resources.roles = bound.resources.roles || {};
  bound.resources.dataViews = bound.resources.dataViews || {};
  bound.resources.storageConfigs = bound.resources.storageConfigs || {};
  bound.resources.pagePermissionGroups = bound.resources.pagePermissionGroups || {};
  bound.resources.formPermissionGroups = bound.resources.formPermissionGroups || {};
}

function resolveProjectProfileName(config, state) {
  if (config.openXiangdaProfile) return config.openXiangdaProfile;

  const profiles = Object.entries(state.profiles || {});
  const platformUrl = normalizeBaseUrl(config.platformUrl);
  const matched = profiles.find(([, bound]) => {
    if (bound?.appType !== config.appType) return false;
    const boundBaseUrl = normalizeBaseUrl(bound?.baseUrl);
    return !platformUrl || !boundBaseUrl || platformUrl === boundBaseUrl;
  });
  return matched?.[0] || "";
}

function resolveProjectStateBinding(config, state) {
  const targetName = String(config.openXiangdaTarget || "").trim();
  if (targetName) {
    const bound = state.targets?.[targetName];
    if (!bound) {
      throw new Error(
        `OPENXIANGDA_TARGET_NOT_BOUND: 托管环境 target 不存在: ${targetName}`,
      );
    }
    if (String(bound.appType || "") !== String(config.appType || "")) {
      throw new Error(
        `OPENXIANGDA_TARGET_APP_MISMATCH: target ${targetName} 绑定 ${bound.appType || "<empty>"}，发布目标为 ${config.appType || "<empty>"}`,
      );
    }
    return {
      scope: "target",
      key: targetName,
      bound,
    };
  }

  const profileName = resolveProjectProfileName(config, state);
  if (!profileName) return null;
  return {
    scope: "profile",
    key: profileName,
    bound: state.profiles?.[profileName],
  };
}

function readWorkspaceFormBinding(config, formName) {
  if (!isOpenXiangdaMode(config)) return null;
  const state = loadProjectState(config);
  const binding = resolveProjectStateBinding(config, state);
  if (!binding) return null;
  const bound = binding.bound;
  const form = bound?.resources?.forms?.[formName];
  if (!form?.formUuid) return null;
  return {
    profileName:
      binding.scope === "profile"
        ? binding.key
        : String(bound?.profile || config.openXiangdaProfile || ""),
    targetName: binding.scope === "target" ? binding.key : "",
    bound,
    form,
  };
}

function saveWorkspaceFormBinding(config, formName, formUuid, extra = {}) {
  if (!isOpenXiangdaMode(config) || !formUuid) return false;

  const state = loadProjectState(config);
  const targetName = String(config.openXiangdaTarget || "").trim();
  let bound;
  if (targetName) {
    const binding = resolveProjectStateBinding(config, state);
    bound = binding.bound;
  } else {
    const profileName =
      resolveProjectProfileName(config, state) ||
      config.openXiangdaProfile ||
      config.appType ||
      "default";
    state.profiles = state.profiles || {};
    state.profiles[profileName] = {
      ...(state.profiles[profileName] || {}),
      baseUrl: config.platformUrl,
      appType: config.appType,
      updatedAt: new Date().toISOString(),
    };
    bound = state.profiles[profileName];
  }
  ensureResourceBuckets(bound);
  bound.resources.forms[formName] = {
    ...(bound.resources.forms[formName] || {}),
    ...extra,
    formUuid,
    updatedAt: new Date().toISOString(),
  };

  saveProjectState(config, state);
  return true;
}

export function markWorkspaceFormSchemaSynced(config, formName, formUuid, extra = {}) {
  return saveWorkspaceFormBinding(config, formName, formUuid, {
    ...extra,
    schemaSyncedAt: new Date().toISOString(),
  });
}

export function markWorkspaceFormBundlePublished(
  config,
  formName,
  formUuid,
  extra = {},
) {
  return saveWorkspaceFormBinding(config, formName, formUuid, {
    ...extra,
    bundlePublishedAt: new Date().toISOString(),
  });
}

export function normalizeFormReleaseExpectation(value) {
  const revision = Number(value?.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) return null;
  const head = value?.activeFormReleaseHead || value?.expectedParent || {};
  return {
    revision,
    etag: String(value?.etag || "").trim() || undefined,
    activeFormReleaseHead: {
      releaseId: head?.releaseId || null,
      releaseHash: head?.releaseHash || null,
      revision: Number(head?.revision ?? revision),
    },
  };
}

function formReleaseStateFields(value) {
  const expectation = normalizeFormReleaseExpectation(value);
  return expectation
    ? {
        revision: expectation.revision,
        ...(expectation.etag ? { etag: expectation.etag } : {}),
        activeFormReleaseHead: expectation.activeFormReleaseHead,
      }
    : {};
}

function readExportedStringConstant(filePath, exportName) {
  if (!filePath || !fs.existsSync(filePath)) return "";
  const content = fs.readFileSync(filePath, "utf-8");
  const escaped = exportName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(
    new RegExp(`export\\s+const\\s+${escaped}\\s*=\\s*(['"])(.*?)\\1`),
  );
  return match?.[2]?.trim() || "";
}

function resolveRelativeImportPath(schemaPath, source) {
  if (!source.startsWith(".")) return "";
  const basePath = path.resolve(path.dirname(schemaPath), source);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.mjs`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
    path.join(basePath, "index.js"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function findImportedStringConstantSource(content, schemaPath, identifier) {
  if (!schemaPath || !identifier) return "";
  const importRegex = /import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g;
  let match;
  while ((match = importRegex.exec(content))) {
    const specifiers = match[1]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const sourcePath = resolveRelativeImportPath(schemaPath, match[2]);
    if (!sourcePath) continue;

    for (const specifier of specifiers) {
      const aliasMatch = specifier.match(
        /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/,
      );
      if (!aliasMatch) continue;
      const exportedName = aliasMatch[1];
      const localName = aliasMatch[2] || exportedName;
      if (localName !== identifier) continue;
      return { sourcePath, exportedName };
    }
  }
  return null;
}

function readImportedStringConstant(content, schemaPath, identifier) {
  const imported = findImportedStringConstantSource(
    content,
    schemaPath,
    identifier,
  );
  if (!imported) return "";
  return readExportedStringConstant(imported.sourcePath, imported.exportedName);
}

function readPropIdentifier(content, propName) {
  const escaped = propName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const identifierMatch = content.match(
    new RegExp(`${escaped}\\s*:\\s*([A-Za-z_$][\\w$]*)`),
  );
  return identifierMatch?.[1] || "";
}

function writeStringConstant(filePath, identifier, value) {
  const content = fs.readFileSync(filePath, "utf-8");
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nextContent = content.replace(
    new RegExp(`((?:export\\s+)?const\\s+${escaped}\\s*=\\s*)([^;]+);`),
    (_match, prefix, initializer) => {
      const quote = initializer.trim().startsWith("'") ? "'" : '"';
      return `${prefix}${quote}${value}${quote};`;
    },
  );
  if (nextContent === content) return false;
  fs.writeFileSync(filePath, nextContent, "utf-8");
  return true;
}

export function writeSchemaStringProp(schemaPath, propName, value) {
  const content = fs.readFileSync(schemaPath, "utf-8");
  const escaped = propName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const literalRegex = new RegExp(
    `(${escaped}\\s*:\\s*)(['"])([^'"]*)\\2`,
  );
  const literalNextContent = content.replace(
    literalRegex,
    (_match, prefix, quote) => `${prefix}${quote}${value}${quote}`,
  );
  if (literalNextContent !== content) {
    fs.writeFileSync(schemaPath, literalNextContent, "utf-8");
    return;
  }

  const identifier = readPropIdentifier(content, propName);
  if (!identifier) {
    throw new Error(`schema.ts 中未找到 ${propName} 字段，无法回写`);
  }

  if (writeStringConstant(schemaPath, identifier, value)) {
    return;
  }

  const imported = findImportedStringConstantSource(
    content,
    schemaPath,
    identifier,
  );
  if (
    imported &&
    writeStringConstant(imported.sourcePath, imported.exportedName, value)
  ) {
    return;
  }

  throw new Error(`schema.ts 中未找到可回写的 ${propName} 字段，无法回写`);
}

export function writeSchemaFormUuid(schemaPath, formUuid) {
  writeSchemaStringProp(schemaPath, "formUuid", formUuid);
}

export function writeSchemaAppType(schemaPath, appType) {
  writeSchemaStringProp(schemaPath, "appType", appType);
}

function resolveTargetAppType(config, meta) {
  if (isOpenXiangdaMode(config)) {
    return config.appType;
  }
  return meta.appType || config.appType;
}

function isStaleOpenXiangdaBinding(config, meta, targetAppType) {
  return Boolean(
    isOpenXiangdaMode(config) &&
      meta.formUuid &&
      meta.appType &&
      meta.appType !== targetAppType,
  );
}

function syncSchemaAppTypeIfNeeded(schemaPath, meta, targetAppType) {
  if (!targetAppType || meta.appType === targetAppType) return;
  if (!meta.appType && !meta.content.includes("appType")) return;
  writeSchemaAppType(schemaPath, targetAppType);
}

function syncCreatedFormMeta(schemaPath, meta, targetAppType, formUuid) {
  writeSchemaFormUuid(schemaPath, formUuid);
  syncSchemaAppTypeIfNeeded(schemaPath, meta, targetAppType);
}

function readStringProp(content, propName, schemaPath) {
  const escaped = propName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const literalMatch = content.match(
    new RegExp(`${escaped}\\s*:\\s*(['"])(.*?)\\1`),
  );
  if (literalMatch) return literalMatch[2]?.trim() || "";

  const identifier = readPropIdentifier(content, propName);
  if (!identifier) return "";

  const localConstMatch = content.match(
    new RegExp(`(?:export\\s+)?const\\s+${identifier}\\s*=\\s*(['"])(.*?)\\1`),
  );
  if (localConstMatch) return localConstMatch[2]?.trim() || "";

  return readImportedStringConstant(content, schemaPath, identifier);
}

function hasObjectProp(content, propName) {
  const escaped = propName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}\\s*:`).test(content);
}

export function readSchemaMeta(schemaPath) {
  const content = fs.readFileSync(schemaPath, "utf-8");

  return {
    content,
    hasFormUuidProp: hasObjectProp(content, "formUuid"),
    formUuid: readStringProp(content, "formUuid", schemaPath),
    appType: readStringProp(content, "appType", schemaPath),
    title: readStringProp(content, "title", schemaPath),
    formType: readStringProp(content, "formType", schemaPath) || "receipt",
    relateUuid: readStringProp(content, "relateUuid", schemaPath),
  };
}

export function assertRequiredOpenApiConfig(config) {
  const missing = [];
  if (!config.appType) missing.push("APP_TYPE");
  if (!config.platformUrl) missing.push("APP_PLATFORM_URL");

  if (isOpenXiangdaMode(config)) {
    if (!config.openXiangdaAccessToken) {
      missing.push("OPENXIANGDA_ACCESS_TOKEN");
    }
  } else {
    if (!config.appKey) missing.push("APP_KEY");
    if (!config.appSecret) missing.push("APP_SECRET");
    if (!config.userId) missing.push("APP_USER_ID");
  }

  if (missing.length > 0) {
    throw new Error(`缺少必要配置: ${missing.join(", ")}`);
  }
}

export function isOpenXiangdaMode(config) {
  return Boolean(config.openXiangdaAccessToken);
}

export function getOpenXiangdaPublishContextHeaders(env = process.env) {
  const values = [
    ["x-openxiangda-publish-lease-id", env.OPENXIANGDA_PUBLISH_LEASE_ID],
    ["x-openxiangda-change-baseline-id", env.OPENXIANGDA_CHANGE_BASELINE_ID],
    ["x-openxiangda-change-id", env.OPENXIANGDA_CHANGE_ID],
    ["x-openxiangda-client-session-id", env.OPENXIANGDA_CLIENT_SESSION_ID],
  ];
  return Object.fromEntries(
    values
      .map(([name, value]) => [name, String(value || "").trim()])
      .filter(([, value]) => Boolean(value)),
  );
}

function getAuthHeaders(config, accessToken) {
  if (isOpenXiangdaMode(config)) {
    return {
      Authorization: `Bearer ${accessToken || config.openXiangdaAccessToken}`,
      ...getOpenXiangdaPublishContextHeaders(),
    };
  }
  return {
    "x-acs-dingtalk-access-token": accessToken,
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function canonicalJsonSha256(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function normalizeFrozenFormSnapshot(value, label = "Form snapshot") {
  const expectation = normalizeFormReleaseExpectation(value);
  if (!expectation?.etag) {
    const error = new Error(
      `FORM_REVISION_CONFLICT: ${label} 未返回有效 revision/etag，拒绝配置写入`,
    );
    error.code = "FORM_REVISION_CONFLICT";
    throw error;
  }
  if (expectation.activeFormReleaseHead.revision !== expectation.revision) {
    const error = new Error(
      `FORM_REVISION_CONFLICT: ${label} 的 head revision 与 Form revision 不一致`,
    );
    error.code = "FORM_REVISION_CONFLICT";
    throw error;
  }
  return {
    ...value,
    ...expectation,
    expectedParent: expectation.activeFormReleaseHead,
  };
}

function assertExpectedFormSnapshot(frozen, expected) {
  const normalizedExpected = normalizeFormReleaseExpectation(expected);
  if (!normalizedExpected) return;
  const headMatches =
    canonicalJsonSha256(normalizedExpected.activeFormReleaseHead) ===
    canonicalJsonSha256(frozen.expectedParent);
  const etagMatches =
    !normalizedExpected.etag || normalizedExpected.etag === frozen.etag;
  if (
    normalizedExpected.revision !== frozen.revision ||
    !headMatches ||
    !etagMatches
  ) {
    const error = new Error(
      `FORM_REVISION_CONFLICT: 工作区冻结 revision=r${normalizedExpected.revision}，平台当前 revision=r${frozen.revision}；未执行写入，请先合并并重新规划`,
    );
    error.code = "FORM_REVISION_CONFLICT";
    throw error;
  }
}

async function readJsonResponse(response) {
  return await response.json().catch(() => null);
}

export async function getOpenXiangdaFormSnapshot(
  config,
  accessToken,
  { appType, formUuid },
) {
  if (!isOpenXiangdaMode(config)) return null;
  const targetAppType = appType || config.appType;
  const apiBase = getApiBaseUrl(config);
  const response = await fetch(
    `${apiBase}/openxiangda-api/v1/apps/${encodeURIComponent(targetAppType)}/forms/${encodeURIComponent(formUuid)}/snapshot`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(config, accessToken),
      },
    },
  );
  const body = await readJsonResponse(response);
  if (!response.ok || body?.code !== 200) {
    const message = body?.message || response.statusText || "unknown error";
    const error = new Error(
      `查询 Form snapshot 失败: HTTP ${response.status} ${message}`,
    );
    error.code = body?.errorCode || "FORM_REVISION_CONFLICT";
    throw error;
  }
  return normalizeFrozenFormSnapshot(body.data);
}

export async function mutateOpenXiangdaFormConfig(
  config,
  accessToken,
  {
    appType,
    formUuid,
    endpoint,
    operation,
    payload,
    expected,
    artifactId,
  },
) {
  if (!isOpenXiangdaMode(config)) {
    throw new Error("mutateOpenXiangdaFormConfig 仅用于 OpenXiangda 模式");
  }
  const targetAppType = appType || config.appType;
  const frozen = await getOpenXiangdaFormSnapshot(config, accessToken, {
    appType: targetAppType,
    formUuid,
  });
  assertExpectedFormSnapshot(frozen, expected);
  const expectedParent = frozen.expectedParent;
  const mutationPayload = payload || {};
  const stableArtifactId =
    artifactId ||
    `form:${String(operation || endpoint || "config")
      .replace(/[^A-Za-z0-9_.-]+/g, "-")
      .slice(0, 48)}:${canonicalJsonSha256({
      appType: targetAppType,
      formUuid,
      operation: operation || endpoint,
      expectedParent,
      payload: mutationPayload,
    }).slice(0, 32)}`;
  const apiBase = getApiBaseUrl(config);
  const url = `${apiBase}/openxiangda-api/v1/apps/${encodeURIComponent(targetAppType)}/forms/${encodeURIComponent(formUuid)}/${String(endpoint || "").replace(/^\/+/, "")}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(config, accessToken),
      "If-Match": frozen.etag,
    },
    body: JSON.stringify({
      ...mutationPayload,
      artifactId: stableArtifactId,
      expectedRevision: frozen.revision,
      expectedParent,
    }),
  });
  const body = await readJsonResponse(response);
  if (!response.ok || body?.code !== 200) {
    const message = body?.message || response.statusText || "unknown error";
    const error = new Error(
      `${body?.errorCode || "FORM_CONFIG_WRITE_FAILED"}: HTTP ${response.status} ${message}`,
    );
    error.code = body?.errorCode || "FORM_CONFIG_WRITE_FAILED";
    error.status = response.status;
    error.data = body?.data;
    throw error;
  }
  const resultExpectation = normalizeFormReleaseExpectation(body.data);
  if (!resultExpectation) {
    const error = new Error(
      "FORM_REVISION_CONFLICT: Form 配置写响应未返回 revision/head",
    );
    error.code = "FORM_REVISION_CONFLICT";
    throw error;
  }
  return { response: body, data: body.data, frozen, url };
}

export async function getOpenApiAccessToken(config) {
  assertRequiredOpenApiConfig(config);
  if (isOpenXiangdaMode(config)) {
    return config.openXiangdaAccessToken;
  }

  const apiBase = getApiBaseUrl(config);
  const res = await fetch(`${apiBase}/dingtalk-api/v1.0/oauth2/accessToken`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      appKey: config.appKey,
      appSecret: config.appSecret,
    }),
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok || !body?.accessToken) {
    const message = body?.message || res.statusText || "unknown error";
    throw new Error(`获取 accessToken 失败: HTTP ${res.status} ${message}`);
  }

  return body.accessToken;
}

export async function createOpenApiForm(config, accessToken, formOptions) {
  assertRequiredOpenApiConfig(config);

  const apiBase = getApiBaseUrl(config);
  const targetAppType = formOptions.appType || config.appType;
  const payload = {
    name: formOptions.name,
    formType: formOptions.formType || "receipt",
    relateUuid: formOptions.relateUuid || "",
  };
  const builderVersion =
    formOptions.builderVersion || config.defaults?.formBuilderVersion || "2.0";
  if (
    builderVersion === "2.0" &&
    ["receipt", "process"].includes(String(payload.formType || ""))
  ) {
    payload.builderVersion = "2.0";
  }
  if (formOptions.formUuid) {
    payload.formUuid = formOptions.formUuid;
  }

  if (isOpenXiangdaMode(config)) {
    payload.createMenu = formOptions.createMenu !== false;
    payload.menuParentId = config.menu?.parentId || "";
    payload.menuIcon = config.menu?.icon || "";
    payload.expectedRevision = 0;
  } else {
    payload.userId = config.userId;
    payload.appType = targetAppType;
  }

  const url = isOpenXiangdaMode(config)
    ? `${apiBase}/openxiangda-api/v1/apps/${encodeURIComponent(targetAppType)}/forms`
    : `${apiBase}/dingtalk-api/v1.0/forms/createForm`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(config, accessToken),
      ...(isOpenXiangdaMode(config) ? { "If-Match": "0" } : {}),
    },
    body: JSON.stringify(payload),
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok || body?.code !== 200) {
    const message = body?.message || res.statusText || "unknown error";
    throw new Error(`创建表单失败: HTTP ${res.status} ${message}`);
  }

  const responseData = body?.data || body;
  const data = responseData?.form || responseData;
  const formUuid = data?.formUuid;
  if (!formUuid) {
    throw new Error("创建表单成功但响应中没有 formUuid");
  }

  return {
    ...data,
    formUuid,
    revision: data?.revision ?? responseData?.revision,
    etag: data?.etag ?? responseData?.etag,
    activeFormReleaseHead:
      responseData?.activeFormReleaseHead || data?.activeFormReleaseHead,
  };
}

export async function listOpenApiForms(config, accessToken, appType) {
  assertRequiredOpenApiConfig(config);

  const apiBase = getApiBaseUrl(config);
  const targetAppType = appType || config.appType;
  const url = isOpenXiangdaMode(config)
    ? `${apiBase}/openxiangda-api/v1/apps/${encodeURIComponent(targetAppType)}/forms`
    : `${apiBase}/dingtalk-api/v1.0/forms/getFormList`;
  const res = await fetch(url, {
    method: isOpenXiangdaMode(config) ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(config, accessToken),
    },
    body: isOpenXiangdaMode(config)
      ? undefined
      : JSON.stringify({
          userId: config.userId,
          appType: targetAppType,
        }),
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok || body?.code !== 200) {
    const message = body?.message || res.statusText || "unknown error";
    throw new Error(`查询表单失败: HTTP ${res.status} ${message}`);
  }

  return Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
}

export async function getOpenApiForm(
  config,
  accessToken,
  { appType, formUuid },
) {
  if (!formUuid) return null;
  const forms = await listOpenApiForms(
    config,
    accessToken,
    appType || config.appType,
  );
  return (
    forms.find(
      (item) =>
        item?.formUuid === formUuid &&
        (!appType || !item?.appType || item.appType === appType),
    ) || null
  );
}

export async function listOpenApiMenus(config, accessToken, appType) {
  assertRequiredOpenApiConfig(config);

  const apiBase = getApiBaseUrl(config);
  const targetAppType = appType || config.appType;
  const url = isOpenXiangdaMode(config)
    ? `${apiBase}/openxiangda-api/v1/apps/${encodeURIComponent(targetAppType)}/menus`
    : `${apiBase}/dingtalk-api/v1.0/forms/getMenusByAppType`;
  const res = await fetch(url, {
    method: isOpenXiangdaMode(config) ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(config, accessToken),
    },
    body: isOpenXiangdaMode(config)
      ? undefined
      : JSON.stringify({
          userId: config.userId,
          appType: targetAppType,
        }),
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok || body?.code !== 200) {
    const message = body?.message || res.statusText || "unknown error";
    throw new Error(`查询菜单失败: HTTP ${res.status} ${message}`);
  }

  return Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
}

function flattenMenus(menus) {
  const result = [];
  const visit = (menu) => {
    result.push(menu);
    if (Array.isArray(menu.children)) {
      for (const child of menu.children) {
        visit(child);
      }
    }
  };

  for (const menu of menus) {
    visit(menu);
  }

  return result;
}

export async function ensureOpenApiMenuForForm(
  config,
  accessToken,
  { appType, formUuid, name, formType = "receipt", parentId = "", icon = "" },
) {
  assertRequiredOpenApiConfig(config);

  const targetAppType = appType || config.appType;
  const menus = flattenMenus(
    await listOpenApiMenus(config, accessToken, targetAppType),
  );
  const existing = menus.find((menu) => menu.formUuid === formUuid);
  if (existing) {
    return {
      created: false,
      menu: existing,
    };
  }

  if (isOpenXiangdaMode(config)) {
    return {
      created: false,
      menu: null,
    };
  }

  const apiBase = getApiBaseUrl(config);
  const payload = {
    userId: config.userId,
    appType: targetAppType,
    name,
    type: formType || "receipt",
    formUuid,
    parentId: parentId || null,
    icon: icon || null,
  };

  const res = await fetch(`${apiBase}/dingtalk-api/v1.0/forms/menu/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-acs-dingtalk-access-token": accessToken,
    },
    body: JSON.stringify(payload),
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok || body?.code !== 200) {
    const message = body?.message || res.statusText || "unknown error";
    throw new Error(`创建菜单失败: HTTP ${res.status} ${message}`);
  }

  return {
    created: true,
    menu: body.data,
  };
}

export async function ensureSchemaFormUuid({
  config,
  schemaPath,
  formName,
  accessToken,
  dryRun = false,
  ensureMenu = false,
}) {
  const meta = readSchemaMeta(schemaPath);
  const targetAppType = resolveTargetAppType(config, meta);
  const workspaceBinding = readWorkspaceFormBinding(config, formName);
  const workspaceReleaseExpectation = normalizeFormReleaseExpectation(
    workspaceBinding?.form,
  );
  const effectiveMeta = workspaceBinding?.form?.formUuid
    ? {
        ...meta,
        formUuid: workspaceBinding.form.formUuid,
        appType: targetAppType,
      }
    : meta;
  const staleOpenXiangdaBinding = isStaleOpenXiangdaBinding(
    config,
    effectiveMeta,
    targetAppType,
  );

  if (effectiveMeta.formUuid && !staleOpenXiangdaBinding) {
    let created = false;
    let createdForm = null;
    if (!dryRun) {
      const token = accessToken || (await getOpenApiAccessToken(config));
      const existingForm = await getOpenApiForm(config, token, {
        appType: targetAppType,
        formUuid: effectiveMeta.formUuid,
      });

      if (!existingForm) {
        createdForm = await createOpenApiForm(config, token, {
          name: effectiveMeta.title || formName,
          appType: targetAppType,
          formType: effectiveMeta.formType || "receipt",
          relateUuid: effectiveMeta.relateUuid,
          formUuid: effectiveMeta.formUuid,
          builderVersion: config.defaults?.formBuilderVersion || "2.0",
        });
        created = true;
        console.log(
          `  ✓ ${formName}: 已按已有 formUuid 创建表单 ${effectiveMeta.formUuid}`,
        );
      }

      if ((created || ensureMenu) && !isOpenXiangdaMode(config)) {
        const menuResult = await ensureOpenApiMenuForForm(config, token, {
          appType: targetAppType,
          formUuid: effectiveMeta.formUuid,
          name: effectiveMeta.title || formName,
          formType: effectiveMeta.formType || "receipt",
          parentId: config.menu?.parentId,
          icon: config.menu?.icon,
        });

        if (menuResult.created) {
          console.log(
            `  ✓ ${formName}: 已创建菜单 ${menuResult.menu?.id || ""}`,
          );
        }
      }

      saveWorkspaceFormBinding(config, formName, effectiveMeta.formUuid, {
        title: effectiveMeta.title || formName,
        ...formReleaseStateFields(createdForm),
      });
    }

    return {
      ...effectiveMeta,
      appType: targetAppType,
      created,
      dryRunCreated: false,
      releaseExpectation:
        normalizeFormReleaseExpectation(createdForm) ||
        workspaceReleaseExpectation,
    };
  }

  if (!meta.hasFormUuidProp && !isOpenXiangdaMode(config)) {
    throw new Error(
      `${formName}: schema.ts 中未找到 formUuid 字段，无法自动创建并回写`,
    );
  }

  const createOptions = {
    name: meta.title || formName,
    appType: targetAppType,
    formType: meta.formType || "receipt",
    relateUuid: meta.relateUuid,
    formUuid: staleOpenXiangdaBinding ? undefined : meta.formUuid || undefined,
    builderVersion: config.defaults?.formBuilderVersion || "2.0",
  };

  if (dryRun) {
    console.log(
      `  [dry-run] ${formName}: ${
        staleOpenXiangdaBinding ? "检测到旧 appType 绑定" : "formUuid 为空"
      }，将创建表单和菜单 "${createOptions.name}"`,
    );
    return {
      ...meta,
      ...createOptions,
      formUuid: "<auto-created-formUuid>",
      created: false,
      dryRunCreated: true,
    };
  }

  const token = accessToken || (await getOpenApiAccessToken(config));
  const createdForm = await createOpenApiForm(config, token, createOptions);
  if (isOpenXiangdaMode(config)) {
    saveWorkspaceFormBinding(config, formName, createdForm.formUuid, {
      title: createOptions.name,
      ...formReleaseStateFields(createdForm),
    });
  } else {
    syncCreatedFormMeta(schemaPath, meta, targetAppType, createdForm.formUuid);
  }
  console.log(`  ✓ ${formName}: 已创建表单 ${createdForm.formUuid}`);

  let menuResult = { created: false, menu: null };
  if (!isOpenXiangdaMode(config)) {
    menuResult = await ensureOpenApiMenuForForm(config, token, {
      appType: createOptions.appType,
      formUuid: createdForm.formUuid,
      name: createOptions.name,
      formType: createOptions.formType,
      parentId: config.menu?.parentId,
      icon: config.menu?.icon,
    });
    if (menuResult.created) {
      console.log(`  ✓ ${formName}: 已创建菜单 ${menuResult.menu?.id || ""}`);
    } else {
      console.log(`  ✓ ${formName}: 菜单已存在 ${menuResult.menu?.id || ""}`);
    }
  }

  return {
    ...meta,
    ...createOptions,
    formUuid: createdForm.formUuid,
    created: true,
    menuCreated: menuResult.created,
    dryRunCreated: false,
    releaseExpectation: normalizeFormReleaseExpectation(createdForm),
  };
}
