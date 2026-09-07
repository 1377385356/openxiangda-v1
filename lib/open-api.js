const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const OPEN_API_SPEC_FILE = path.join(
  __dirname,
  '..',
  'openxiangda-skills',
  'skills',
  'openxiangda-open-api',
  'references',
  'dingtalk-api.openapi.json'
);
const HTTP_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch']);

function loadOpenApiDocument(file = OPEN_API_SPEC_FILE) {
  const document = JSON.parse(fs.readFileSync(file, 'utf8'));
  validateOpenApiDocument(document);
  return document;
}

function validateOpenApiDocument(document) {
  if (!document || typeof document !== 'object') {
    throw new Error('DingTalk OpenAPI document must be a JSON object');
  }
  if (document.openapi !== '3.0.1') {
    throw new Error(`Unsupported DingTalk OpenAPI version: ${document.openapi || 'missing'}`);
  }
  const operations = collectOperations(document);
  if (operations.length === 0) {
    throw new Error('DingTalk OpenAPI document contains no operations');
  }
  const securitySchemes = document.components?.securitySchemes || {};
  for (const item of operations) {
    const operation = item.operation;
    for (const field of ['operationId', 'summary', 'description']) {
      if (!String(operation[field] || '').trim()) {
        throw new Error(`${item.method.toUpperCase()} ${item.path} is missing ${field}`);
      }
    }
    if (!Array.isArray(operation.tags) || operation.tags.length === 0) {
      throw new Error(`${item.method.toUpperCase()} ${item.path} is missing tags`);
    }
    if (!operation.responses || Object.keys(operation.responses).length === 0) {
      throw new Error(`${item.method.toUpperCase()} ${item.path} is missing responses`);
    }
    for (const requirement of operation.security || []) {
      for (const name of Object.keys(requirement)) {
        if (!securitySchemes[name]) {
          throw new Error(
            `${item.method.toUpperCase()} ${item.path} references unknown security scheme ${name}`
          );
        }
      }
    }
  }
  return document;
}

function collectOperations(document) {
  const operations = [];
  for (const [routePath, pathItem] of Object.entries(document.paths || {})) {
    for (const [method, operation] of Object.entries(pathItem || {})) {
      if (!HTTP_METHODS.has(method)) continue;
      operations.push({
        method,
        path: routePath,
        operation,
      });
    }
  }
  return operations.sort((left, right) =>
    `${left.path} ${left.method}`.localeCompare(`${right.path} ${right.method}`)
  );
}

function listOpenApiTags(document) {
  const declared = new Map(
    (document.tags || []).map(item => [item.name, item.description || ''])
  );
  for (const { operation } of collectOperations(document)) {
    for (const tag of operation.tags || []) {
      if (!declared.has(tag)) declared.set(tag, '');
    }
  }
  return [...declared.entries()]
    .map(([name, description]) => ({ name, description }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function listOpenApiOperations(document, options = {}) {
  const tag = String(options.tag || '').trim().toLowerCase();
  const search = String(options.search || '').trim().toLowerCase();
  return collectOperations(document)
    .filter(({ operation }) => {
      if (!tag) return true;
      return (operation.tags || []).some(item => String(item).toLowerCase() === tag);
    })
    .filter(item => {
      if (!search) return true;
      return [
        item.method,
        item.path,
        item.operation.operationId,
        item.operation.summary,
        item.operation.description,
        ...(item.operation.tags || []),
      ]
        .join('\n')
        .toLowerCase()
        .includes(search);
    })
    .map(item => ({
      method: item.method.toUpperCase(),
      path: item.path,
      operationId: item.operation.operationId,
      summary: item.operation.summary,
      tags: item.operation.tags || [],
      authenticated: (item.operation.security || []).length > 0,
    }));
}

function describeOpenApiOperation(document, selector, method) {
  const normalizedSelector = String(selector || '').trim();
  if (!normalizedSelector) {
    throw new Error('Missing operationId or path');
  }
  const normalizedMethod = String(method || '').trim().toLowerCase();
  let matches = collectOperations(document).filter(item =>
    item.operation.operationId === normalizedSelector || item.path === normalizedSelector
  );
  if (normalizedMethod) {
    matches = matches.filter(item => item.method === normalizedMethod);
  }
  if (matches.length === 0) {
    throw new Error(`Open API operation not found: ${normalizedSelector}`);
  }
  if (matches.length > 1) {
    const methods = matches.map(item => item.method.toUpperCase()).join(', ');
    throw new Error(
      `Path ${normalizedSelector} has multiple methods (${methods}); pass --method`
    );
  }

  const { path: routePath, method: operationMethod, operation } = matches[0];
  const security = operation.security || [];
  const securitySchemeNames = [
    ...new Set(security.flatMap(requirement => Object.keys(requirement))),
  ];
  const securitySchemes = Object.fromEntries(
    securitySchemeNames.map(name => [
      name,
      resolveNode(document.components?.securitySchemes?.[name], document),
    ])
  );
  return {
    method: operationMethod.toUpperCase(),
    path: routePath,
    operationId: operation.operationId,
    summary: operation.summary,
    description: operation.description,
    tags: operation.tags || [],
    authenticated: security.length > 0,
    security,
    securitySchemes,
    parameters: resolveNode(operation.parameters || [], document),
    requestBody: resolveNode(operation.requestBody || null, document),
    responses: resolveNode(operation.responses || {}, document),
    source: operation['x-code-source'] || null,
  };
}

function resolveNode(value, document, seen = new Set()) {
  if (Array.isArray(value)) {
    return value.map(item => resolveNode(item, document, seen));
  }
  if (!value || typeof value !== 'object') return value;

  if (value.$ref) {
    const reference = value.$ref;
    if (seen.has(reference)) return { $ref: reference };
    const target = resolveJsonPointer(document, reference);
    if (!target) return { ...value };
    const nextSeen = new Set(seen);
    nextSeen.add(reference);
    return resolveNode(target, document, nextSeen);
  }

  const resolved = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'allOf') continue;
    resolved[key] = resolveNode(item, document, seen);
  }
  if (!Array.isArray(value.allOf)) return resolved;

  const merged = {};
  for (const item of value.allOf) {
    mergeSchema(merged, resolveNode(item, document, seen));
  }
  mergeSchema(merged, resolved);
  return merged;
}

function resolveJsonPointer(document, reference) {
  if (!String(reference).startsWith('#/')) return null;
  return reference
    .slice(2)
    .split('/')
    .map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((current, part) => current?.[part], document);
}

function mergeSchema(target, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return target;
  for (const [key, value] of Object.entries(source)) {
    if (key === 'properties' && value && typeof value === 'object') {
      target.properties = { ...(target.properties || {}), ...value };
    } else if (key === 'required' && Array.isArray(value)) {
      target.required = [...new Set([...(target.required || []), ...value])];
    } else {
      target[key] = value;
    }
  }
  return target;
}

function redactOpenApiSecret(value, showSecret = false) {
  if (showSecret || value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map(item => redactOpenApiSecret(item, false));
  }
  if (typeof value !== 'object') return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = /^(appSecret|secret)$/i.test(key)
      ? '***redacted***'
      : redactOpenApiSecret(item, false);
  }
  return result;
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

module.exports = {
  OPEN_API_SPEC_FILE,
  collectOperations,
  describeOpenApiOperation,
  listOpenApiOperations,
  listOpenApiTags,
  loadOpenApiDocument,
  redactOpenApiSecret,
  sha256File,
  validateOpenApiDocument,
};
