const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { builtinModules } = require('module');

const PACKAGE_SCHEMA_VERSION = 'openxiangda-app-package-v2';
const COMPILER_VERSION = 'delivery-v2.1';
const MAX_RUNTIME_BYTES = 25 * 1024 * 1024;

const ROOT_SOURCE_FILES = new Set([
  'app-workspace.config.ts',
  'index.html',
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'yarn.lock',
  'postcss.config.cjs',
  'postcss.config.js',
  'tailwind.config.cjs',
  'tailwind.config.js',
  'tsconfig.app.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.ts',
]);

const IGNORED_SEGMENTS = new Set([
  '.git',
  '.openxiangda',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
  'openspec',
]);

const LAYER_ORDER = [
  'source',
  'form',
  'configuration',
  'backend',
  'workflow',
  'runtime',
];

const CONFIG_RESOURCE_TYPES = Object.freeze({
  'src/resources/roles/': 'role',
  'src/resources/connectors/': 'connector',
  'src/resources/notifications/': 'notification',
  'src/resources/menus/': 'menu',
  'src/resources/data-views/': 'data-view',
  'src/resources/storage/': 'storage',
  'src/resources/auth/': 'auth-config',
  'src/resources/routes/': 'route',
  'src/resources/public-access/': 'public-access',
  'src/resources/permissions/page-groups/': 'page-permission-group',
  'src/resources/permissions/form-groups/': 'form-permission-group',
  'src/resources/permissions/scope-dimensions/': 'scope-dimension',
  'src/resources/permissions/scope-grant-sources/': 'scope-grant-source',
  'src/resources/permissions/data-scope-policies/': 'data-scope-policy',
});

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        if (value[key] !== undefined) result[key] = canonicalize(value[key]);
        return result;
      }, {});
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return String(value);
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sha256Canonical(value) {
  return sha256(Buffer.from(canonicalJson(value)));
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function isSecretFile(relativePath) {
  const normalized = normalizePath(relativePath);
  const base = path.posix.basename(normalized);
  if (base === '.env.example') return false;
  return (
    base === '.env' ||
    base.startsWith('.env.') ||
    /\.(pem|p12|pfx|key)$/i.test(base)
  );
}

function shouldIncludeSourceFile(relativePath) {
  const normalized = normalizePath(relativePath);
  if (!normalized || isSecretFile(normalized)) return false;
  const segments = normalized.split('/');
  if (segments.some(segment => IGNORED_SEGMENTS.has(segment))) return false;
  if (ROOT_SOURCE_FILES.has(normalized)) return true;
  if (/^tsconfig(?:\.[^/]+)?\.json$/.test(normalized)) return true;
  return (
    normalized.startsWith('src/') ||
    normalized.startsWith('public/') ||
    normalized.startsWith('scripts/')
  );
}

function walkFiles(rootDir, currentDir = rootDir, result = []) {
  const entries = fs
    .readdirSync(currentDir, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const absolute = path.join(currentDir, entry.name);
    const relative = normalizePath(path.relative(rootDir, absolute));
    if (entry.isDirectory()) {
      if (IGNORED_SEGMENTS.has(entry.name)) continue;
      walkFiles(rootDir, absolute, result);
      continue;
    }
    if (!entry.isFile() || !shouldIncludeSourceFile(relative)) continue;
    result.push(relative);
  }
  return result;
}

function layerForSourceFile(relativePath) {
  const file = normalizePath(relativePath);
  if (
    file.startsWith('src/forms/') ||
    file.startsWith('src/resources/forms/')
  ) {
    return 'form';
  }
  if (
    file.startsWith('src/functions/') ||
    file.startsWith('src/automations/') ||
    file.startsWith('src/js-code-nodes/') ||
    file.startsWith('src/resources/functions/') ||
    file.startsWith('src/resources/automations/')
  ) {
    return 'backend';
  }
  if (
    file.startsWith('src/workflows/') ||
    file.startsWith('src/resources/workflows/')
  ) {
    return 'workflow';
  }
  if (file.startsWith('src/resources/')) return 'configuration';
  return 'runtime';
}

function artifactFromBuffer(kind, buffer, metadata = {}) {
  return {
    digest: sha256(buffer),
    kind,
    contentType: metadata.contentType || 'application/octet-stream',
    size: buffer.length,
    buffer,
    metadata: {
      ...metadata,
      contentType: undefined,
    },
  };
}

function fileDescriptor(artifact, relativePath) {
  return {
    path: normalizePath(relativePath),
    digest: artifact.digest,
    size: artifact.size,
    contentType: artifact.contentType,
  };
}

function sourceArtifacts(workspaceRoot) {
  return walkFiles(workspaceRoot).map(relativePath => {
    const buffer = fs.readFileSync(path.join(workspaceRoot, relativePath));
    const artifact = artifactFromBuffer('source', buffer, {
      path: relativePath,
      contentType: inferContentType(relativePath),
    });
    return {
      relativePath,
      category: layerForSourceFile(relativePath),
      artifact,
      descriptor: fileDescriptor(artifact, relativePath),
    };
  });
}

function sourceHashForCategory(files, category) {
  return sha256Canonical(
    files
      .filter(file => category === 'source' || file.category === category)
      .map(file => ({
        path: file.relativePath,
        digest: file.artifact.digest,
        size: file.artifact.size,
      }))
  );
}

function collectUnsealedBuildDependencies(files) {
  const builtins = new Set([
    ...builtinModules,
    ...builtinModules.map(name => `node:${name}`),
  ]);
  const filesByPath = new Map(
    files.map(file => [normalizePath(file.relativePath), file])
  );
  const pending = files
    .filter(file =>
      ['form', 'backend', 'workflow'].includes(file.category)
    )
    .filter(file => /\.(?:[cm]?js|tsx?)$/.test(file.relativePath));
  const visited = new Set();
  const dependencies = new Set();
  const missingLocalDependencies = new Set();
  const importPattern =
    /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\(|\bimport\s+)\s*['"]([^'"]+)['"]/g;
  while (pending.length > 0) {
    const file = pending.shift();
    if (visited.has(file.relativePath)) continue;
    visited.add(file.relativePath);
    const source = file.artifact.buffer.toString('utf8');
    let match;
    while ((match = importPattern.exec(source))) {
      const specifier = String(match[1] || '').trim();
      const localDependency = resolveLocalSourceDependency(
        file.relativePath,
        specifier,
        filesByPath
      );
      if (localDependency) {
        pending.push(localDependency);
        continue;
      }
      if (specifier.startsWith('.') || specifier.startsWith('@/')) {
        missingLocalDependencies.add(
          `${file.relativePath} -> ${specifier}`
        );
        continue;
      }
      if (
        !specifier ||
        specifier.startsWith('.') ||
        specifier.startsWith('/') ||
        specifier.startsWith('@/') ||
        specifier === 'openxiangda' ||
        specifier.startsWith('openxiangda/') ||
        builtins.has(specifier) ||
        builtins.has(specifier.split('/')[0])
      ) {
        continue;
      }
      dependencies.add(
        specifier.startsWith('@')
          ? specifier.split('/').slice(0, 2).join('/')
          : specifier.split('/')[0]
      );
    }
  }
  return {
    externalPackages: [...dependencies].sort(),
    missingLocalDependencies: [...missingLocalDependencies].sort(),
  };
}

function resolveLocalSourceDependency(fromPath, specifier, filesByPath) {
  if (!specifier) return null;
  let base;
  if (specifier.startsWith('@/')) {
    base = path.posix.join('src', specifier.slice(2));
  } else if (specifier.startsWith('.')) {
    base = path.posix.normalize(
      path.posix.join(path.posix.dirname(fromPath), specifier)
    );
  } else {
    return null;
  }
  for (const candidate of [
    base,
    ...['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'].map(
      extension => `${base}${extension}`
    ),
    ...['.ts', '.tsx', '.js', '.mjs', '.cjs'].map(extension =>
      path.posix.join(base, `index${extension}`)
    ),
  ]) {
    if (filesByPath.has(candidate)) return filesByPath.get(candidate);
  }
  return null;
}

function discoverResourceInventory(workspaceRoot, files) {
  const sourcePaths = new Set(files.map(file => file.relativePath));
  const filesByPath = new Map(
    files.map(file => [normalizePath(file.relativePath), file])
  );
  const inventory = {
    forms: new Set(),
    functions: new Set(),
    automations: new Set(),
    workflows: new Set(),
    configuration: new Map(),
  };
  const fingerprints = {
    forms: new Map(),
    functions: new Map(),
    automations: new Map(),
    workflows: new Map(),
    configuration: new Map(),
  };
  const assignedFingerprintPaths = new Map();
  const dependencyForms = {
    configuration: new Map(),
    backend: new Map(),
    workflow: new Map(),
  };
  const formPermissionGroupForms = new Map();
  const automationSourceFilesByCode = new Map();
  const addFingerprint = (bucket, code, file) => {
    if (!code || !file) return;
    if (!bucket.has(code)) bucket.set(code, new Map());
    bucket.get(code).set(file.relativePath, file.artifact.digest);
    if (!assignedFingerprintPaths.has(file.category)) {
      assignedFingerprintPaths.set(file.category, new Set());
    }
    assignedFingerprintPaths.get(file.category).add(file.relativePath);
  };
  const addManifestLocalSources = (bucket, code, value, manifestPath) => {
    for (const localPath of collectLocalSourcePaths(value)) {
      const sourceFile = resolvePackagedSourceFile(
        localPath,
        manifestPath,
        filesByPath
      );
      if (sourceFile) addFingerprint(bucket, code, sourceFile);
    }
  };
  const configurationFingerprintBucket = type => {
    if (!fingerprints.configuration.has(type)) {
      fingerprints.configuration.set(type, new Map());
    }
    return fingerprints.configuration.get(type);
  };
  const addDependencyForms = (category, owner, forms) => {
    if (!dependencyForms[category] || !owner) return;
    if (!dependencyForms[category].has(owner)) {
      dependencyForms[category].set(owner, new Set());
    }
    const target = dependencyForms[category].get(owner);
    for (const formCode of forms || []) target.add(formCode);
  };
  const addConfiguration = (type, code) => {
    if (!type || !code) return;
    if (!inventory.configuration.has(type)) {
      inventory.configuration.set(type, new Set());
    }
    inventory.configuration.get(type).add(code);
  };
  for (const file of files) {
    const relative = file.relativePath;
    for (const [prefix, bucket, fingerprintBucket] of [
      ['src/forms/', inventory.forms, fingerprints.forms],
      ['src/functions/', inventory.functions, fingerprints.functions],
      ['src/automations/', inventory.automations, fingerprints.automations],
      ['src/workflows/', inventory.workflows, fingerprints.workflows],
    ]) {
      if (relative.startsWith(prefix)) {
        const segments = relative.slice(prefix.length).split('/');
        const code = segments[0];
        // Resource source lives under src/<kind>/<code>/... . Files directly
        // under src/forms (for example member-common.ts) are shared helpers,
        // not deployable resources.
        if (!code || code.startsWith('.') || segments.length < 2) continue;
        if (
          prefix === 'src/forms/' &&
          !sourcePaths.has(`src/forms/${code}/schema.ts`)
        ) {
          continue;
        }
        if (prefix === 'src/automations/') {
          if (!automationSourceFilesByCode.has(code)) {
            automationSourceFilesByCode.set(code, []);
          }
          automationSourceFilesByCode.get(code).push(file);
          continue;
        }
        bucket.add(code);
        addFingerprint(fingerprintBucket, code, file);
      }
    }
    if (!relative.endsWith('.json')) continue;
    const absolute = path.join(workspaceRoot, relative);
    let value;
    try {
      value = JSON.parse(fs.readFileSync(absolute, 'utf8'));
    } catch {
      continue;
    }
    const codes = collectManifestCodes(value);
    const referencedForms = collectReferencedFormCodes(value);
    for (const [prefix, category, kind] of [
      ['src/functions/', 'backend', 'function'],
      ['src/automations/', 'backend', 'automation'],
      ['src/workflows/', 'workflow', 'workflow'],
    ]) {
      if (!relative.startsWith(prefix)) continue;
      const owner = relative.slice(prefix.length).split('/')[0];
      if (owner && !owner.startsWith('.')) {
        addDependencyForms(category, `${kind}:${owner}`, referencedForms);
      }
    }
    if (relative.startsWith('src/resources/forms/')) {
      for (const code of codes) {
        inventory.forms.add(code);
        addFingerprint(fingerprints.forms, code, file);
        addManifestLocalSources(fingerprints.forms, code, value, relative);
      }
      continue;
    }
    if (relative.startsWith('src/resources/functions/')) {
      for (const code of codes) {
        inventory.functions.add(code);
        addFingerprint(fingerprints.functions, code, file);
        addManifestLocalSources(
          fingerprints.functions,
          code,
          value,
          relative
        );
        addDependencyForms('backend', `function:${code}`, referencedForms);
      }
      continue;
    }
    if (relative.startsWith('src/resources/automations/')) {
      for (const code of codes) {
        inventory.automations.add(code);
        addFingerprint(fingerprints.automations, code, file);
        addManifestLocalSources(
          fingerprints.automations,
          code,
          value,
          relative
        );
        addDependencyForms('backend', `automation:${code}`, referencedForms);
      }
      continue;
    }
    if (relative.startsWith('src/resources/workflows/')) {
      for (const code of codes) {
        inventory.workflows.add(code);
        addFingerprint(fingerprints.workflows, code, file);
        addManifestLocalSources(
          fingerprints.workflows,
          code,
          value,
          relative
        );
        addDependencyForms('workflow', `workflow:${code}`, referencedForms);
      }
      continue;
    }
    const matched = Object.entries(CONFIG_RESOURCE_TYPES).find(([prefix]) =>
      relative.startsWith(prefix)
    );
    if (matched) {
      const type = matched[1];
      for (const code of collectConfigurationManifestCodes(type, value)) {
        addConfiguration(type, code);
        addFingerprint(configurationFingerprintBucket(type), code, file);
        addDependencyForms(
          'configuration',
          `${type}:${code}`,
          referencedForms
        );
      }
      if (type === 'form-permission-group') {
        for (const dependency of collectFormPermissionGroupDependencies(value)) {
          if (!formPermissionGroupForms.has(dependency.code)) {
            formPermissionGroupForms.set(dependency.code, new Set());
          }
          formPermissionGroupForms
            .get(dependency.code)
            .add(dependency.formCode);
        }
      }
    }
  }
  // Automation source directories may contain shared TypeScript helpers such
  // as src/automations/_shared. Only a resource manifest declares a deployable
  // automation; source files belonging to a declared code still participate in
  // that automation's fingerprint and transitive dependency expansion.
  for (const code of inventory.automations) {
    for (const file of automationSourceFilesByCode.get(code) || []) {
      addFingerprint(fingerprints.automations, code, file);
    }
  }
  for (const bucket of [
    fingerprints.forms,
    fingerprints.functions,
    fingerprints.automations,
    fingerprints.workflows,
  ]) {
    expandFingerprintDependencies(bucket, filesByPath, addFingerprint);
  }
  const serializeFingerprints = bucket =>
    Object.fromEntries(
      [...bucket.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([code, entries]) => [
          code,
          sha256Canonical(
            [...entries.entries()]
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([file, digest]) => ({ file, digest }))
          ),
        ])
    );
  const serializeDependencyMap = bucket =>
    Object.fromEntries(
      [...bucket.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([owner, forms]) => [owner, [...forms].sort()])
    );
  const allDependencyForms = new Set(
    Object.values(dependencyForms).flatMap(bucket =>
      [...bucket.values()].flatMap(forms => [...forms])
    )
  );
  const sharedFingerprints = Object.fromEntries(
    ['form', 'configuration', 'backend', 'workflow'].map(category => {
      const assigned = assignedFingerprintPaths.get(category) || new Set();
      const shared = files
        .filter(file => file.category === category)
        .filter(file => !assigned.has(file.relativePath))
        .map(file => ({
          file: file.relativePath,
          digest: file.artifact.digest,
        }));
      return [category, sha256Canonical(shared)];
    })
  );
  return {
    forms: [...inventory.forms].sort(),
    functions: [...inventory.functions].sort(),
    automations: [...inventory.automations].sort(),
    workflows: [...inventory.workflows].sort(),
    configuration: Object.fromEntries(
      [...inventory.configuration.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([type, codes]) => [type, [...codes].sort()])
    ),
    formDependencies: [...allDependencyForms].sort(),
    formDependenciesByResource: {
      configuration: serializeDependencyMap(dependencyForms.configuration),
      backend: serializeDependencyMap(dependencyForms.backend),
      workflow: serializeDependencyMap(dependencyForms.workflow),
    },
    formPermissionGroupForms: Object.fromEntries(
      [...formPermissionGroupForms.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([code, forms]) => [code, [...forms].sort()])
    ),
    resourceFingerprints: {
      forms: serializeFingerprints(fingerprints.forms),
      functions: serializeFingerprints(fingerprints.functions),
      automations: serializeFingerprints(fingerprints.automations),
      workflows: serializeFingerprints(fingerprints.workflows),
      configuration: Object.fromEntries(
        [...fingerprints.configuration.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([type, bucket]) => [type, serializeFingerprints(bucket)])
      ),
      shared: sharedFingerprints,
    },
  };
}

function expandFingerprintDependencies(bucket, filesByPath, addFingerprint) {
  for (const [code, entries] of bucket.entries()) {
    const pending = [...entries.keys()];
    const visited = new Set();
    while (pending.length > 0) {
      const relativePath = pending.shift();
      if (visited.has(relativePath)) continue;
      visited.add(relativePath);
      const file = filesByPath.get(relativePath);
      if (!file || !/\.(?:[cm]?js|tsx?)$/.test(relativePath)) continue;
      for (const specifier of collectModuleSpecifiers(
        file.artifact.buffer.toString('utf8')
      )) {
        const dependency = resolveLocalSourceDependency(
          relativePath,
          specifier,
          filesByPath
        );
        if (!dependency) continue;
        addFingerprint(bucket, code, dependency);
        pending.push(dependency.relativePath);
      }
    }
  }
}

function collectLocalSourcePaths(value, result = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectLocalSourcePaths(item, result);
    return [...result];
  }
  if (!value || typeof value !== 'object') return [...result];
  for (const [key, child] of Object.entries(value)) {
    if (
      ['localPath', 'sourcePath', 'definitionFile'].includes(key) &&
      typeof child === 'string' &&
      child.trim()
    ) {
      result.add(child.trim());
    } else if (child && typeof child === 'object') {
      collectLocalSourcePaths(child, result);
    }
  }
  return [...result];
}

function resolvePackagedSourceFile(localPath, manifestPath, filesByPath) {
  const normalized = normalizePath(localPath);
  const candidates = [
    normalized,
    path.posix.normalize(
      path.posix.join(path.posix.dirname(manifestPath), normalized)
    ),
  ];
  for (const candidate of candidates) {
    if (filesByPath.has(candidate)) return filesByPath.get(candidate);
  }
  return null;
}

function collectModuleSpecifiers(source) {
  const result = [];
  const importPattern =
    /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\(|\bimport\s+)\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = importPattern.exec(source))) {
    const specifier = String(match[1] || '').trim();
    if (specifier) result.push(specifier);
  }
  return result;
}

function collectReferencedFormCodes(value, result = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectReferencedFormCodes(item, result);
    return [...result];
  }
  if (!value || typeof value !== 'object') return [...result];
  for (const key of ['formCode', 'sourceFormCode']) {
    const code = normalizeResourceCode(value[key]);
    if (code) result.add(code);
  }
  if (typeof value.form === 'string') {
    const code = normalizeResourceCode(value.form);
    if (code) result.add(code);
  }
  if (String(value.kind || '').trim() === 'form') {
    const code = normalizeResourceCode(value.code || value.resourceCode);
    if (code) result.add(code);
  }
  const declaredForms = value.resources?.forms;
  if (Array.isArray(declaredForms)) {
    for (const item of declaredForms) {
      const code = normalizeResourceCode(item);
      if (code) result.add(code);
    }
  } else if (declaredForms && typeof declaredForms === 'object') {
    for (const key of Object.keys(declaredForms)) {
      const code = normalizeResourceCode(key);
      if (code) result.add(code);
    }
  } else {
    const code = normalizeResourceCode(declaredForms);
    if (code) result.add(code);
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') {
      collectReferencedFormCodes(child, result);
    }
  }
  return [...result];
}

function collectFormPermissionGroupDependencies(value, result = []) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectFormPermissionGroupDependencies(item, result);
    }
    return result;
  }
  if (!value || typeof value !== 'object') return result;
  const code = normalizeResourceCode(value.code || value.resourceCode);
  const formCode = normalizeResourceCode(value.formCode || value.form);
  if (code && formCode) result.push({ code, formCode });
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') {
      collectFormPermissionGroupDependencies(child, result);
    }
  }
  return result;
}

function normalizeResourceCode(value) {
  const code = typeof value === 'string' ? value.trim() : '';
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(code) ? code : '';
}

function collectConfigurationManifestCodes(type, value) {
  if (type !== 'data-view') return collectManifestCodes(value);

  const result = new Set();
  const addItem = item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    const code = String(item.code || item.resourceCode || '').trim();
    if (code) result.add(code);
  };
  if (Array.isArray(value)) {
    value.forEach(addItem);
    return [...result];
  }
  if (!value || typeof value !== 'object') return [];
  const rootCode = String(value.code || value.resourceCode || '').trim();
  if (rootCode) {
    result.add(rootCode);
    return [...result];
  }
  for (const key of ['dataViews', 'data-views']) {
    const items = value[key];
    if (Array.isArray(items)) items.forEach(addItem);
    else addItem(items);
  }
  return [...result];
}

function collectManifestCodes(value, result = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectManifestCodes(item, result);
    return [...result];
  }
  if (!value || typeof value !== 'object') return [...result];
  const code = String(
    value.code ||
      value.resourceCode ||
      value.formCode ||
      value.notificationType ||
      ''
  ).trim();
  if (code) result.add(code);
  for (const [key, child] of Object.entries(value)) {
    if (
      [
        'definitionJson',
        'schema',
        'components',
        'configJson',
        'settings',
        'grants',
      ].includes(key)
    ) {
      continue;
    }
    if (Array.isArray(child)) collectManifestCodes(child, result);
  }
  return [...result];
}

function buildAuthoredLayer(kind, files, previousLayer) {
  const selected =
    kind === 'source'
      ? files
      : files.filter(file => file.category === kind);
  if (selected.length === 0 && kind !== 'source') return null;
  const sourceHash = sourceHashForCategory(files, kind);
  if (
    previousLayer &&
    previousLayer.sourceHash === sourceHash &&
    previousLayer.digest
  ) {
    return {
      descriptor: previousLayer,
      artifacts: [],
      reused: true,
    };
  }
  const manifest = {
    schemaVersion: 'openxiangda-app-layer-v2',
    kind,
    sourceHash,
    files: selected.map(file => file.descriptor),
  };
  const manifestBuffer = Buffer.from(canonicalJson(manifest));
  const layerArtifact = artifactFromBuffer(kind, manifestBuffer, {
    layer: kind,
    contentType: 'application/json',
  });
  return {
    descriptor: {
      kind,
      digest: layerArtifact.digest,
      sourceHash,
      fileCount: selected.length,
      size: selected.reduce((sum, file) => sum + file.artifact.size, 0),
      files: manifest.files,
    },
    artifacts: [
      ...selected.map(file => file.artifact),
      layerArtifact,
    ],
    reused: false,
  };
}

async function buildRuntimeLayer(options, files, previousLayer) {
  const sourceHash = sourceHashForCategory(files, 'runtime');
  if (
    previousLayer &&
    previousLayer.sourceHash === sourceHash &&
    previousLayer.digest
  ) {
    return {
      descriptor: previousLayer,
      artifacts: [],
      reused: true,
      built: false,
    };
  }
  if (!options.skipBuild) {
    await runBuild({
      workspaceRoot: options.workspaceRoot,
      command: options.buildCommand || 'npm run build',
      env: {
        OPENXIANGDA_APP_TYPE: '__OPENXIANGDA_APP_TYPE__',
        APP_TYPE: '__OPENXIANGDA_APP_TYPE__',
        OPENXIANGDA_BUILD_ID: `pkg-${sourceHash.slice(0, 20)}`,
        OPENXIANGDA_RUNTIME_ASSET_BASE: './',
      },
      onOutput: options.onBuildOutput,
    });
  }
  const distDir = path.resolve(
    options.workspaceRoot,
    options.distDir || 'dist'
  );
  const runtimeFiles = collectRuntimeFiles(distDir);
  const runtimeArtifacts = runtimeFiles.map(file =>
    artifactFromBuffer('runtime', file.buffer, {
      path: file.path,
      contentType: file.contentType,
    })
  );
  const descriptors = runtimeArtifacts.map((artifact, index) =>
    fileDescriptor(artifact, runtimeFiles[index].path)
  );
  const manifest = {
    schemaVersion: 'openxiangda-app-layer-v2',
    kind: 'runtime',
    sourceHash,
    assetBaseMode: 'relative',
    files: descriptors,
  };
  const layerArtifact = artifactFromBuffer(
    'runtime',
    Buffer.from(canonicalJson(manifest)),
    {
      layer: 'runtime',
      contentType: 'application/json',
    }
  );
  return {
    descriptor: {
      kind: 'runtime',
      digest: layerArtifact.digest,
      sourceHash,
      assetBaseMode: 'relative',
      fileCount: descriptors.length,
      size: runtimeArtifacts.reduce((sum, artifact) => sum + artifact.size, 0),
      files: descriptors,
    },
    artifacts: [...runtimeArtifacts, layerArtifact],
    reused: false,
    built: !options.skipBuild,
  };
}

async function compileAppPackage(options = {}) {
  const workspaceRoot = path.resolve(options.workspaceRoot || process.cwd());
  const configFile = path.join(workspaceRoot, 'app-workspace.config.ts');
  if (!fs.existsSync(configFile)) {
    throw createCompilerError(
      'DELIVERY_WORKSPACE_CONFIG_MISSING',
      `未发现 ${configFile}`
    );
  }
  const configText = fs.readFileSync(configFile, 'utf8');
  if (!/deliveryVersion\s*:\s*2\b/.test(configText)) {
    throw createCompilerError(
      'DELIVERY_V2_NOT_ENABLED',
      'app-workspace.config.ts 必须显式声明 deliveryVersion: 2'
    );
  }
  const runtimeEnabled =
    /runtimeMode\s*:\s*['"]react-spa['"]/.test(configText);
  const files = sourceArtifacts(workspaceRoot);
  const previousManifest = options.previousManifest || null;
  const previousLayers = new Map(
    (previousManifest?.layers || []).map(layer => [layer.kind, layer])
  );
  const artifacts = [];
  const layerResults = [];
  const resources = discoverResourceInventory(workspaceRoot, files);
  const buildClosure = collectUnsealedBuildDependencies(files);
  if (buildClosure.missingLocalDependencies.length > 0) {
    throw createCompilerError(
      'DELIVERY_BUILD_LOCAL_DEPENDENCY_MISSING',
      `Form/Backend/Workflow 源码引用了未进入 App Package 的本地文件: ${buildClosure.missingLocalDependencies.join(', ')}`
    );
  }
  if (buildClosure.externalPackages.length > 0) {
    throw createCompilerError(
      'DELIVERY_BUILD_DEPENDENCY_NOT_SEALED',
      `Form/Backend/Workflow 源码引用了未进入密封工具链的包: ${buildClosure.externalPackages.join(', ')}。请改为 OpenXiangda 公共 SDK、本地源码依赖，或先扩展 Delivery V2 dependency layer。`
    );
  }

  for (const kind of ['source', 'form', 'configuration', 'backend', 'workflow']) {
    const result = buildAuthoredLayer(
      kind,
      files,
      previousLayers.get(kind)
    );
    if (!result) continue;
    artifacts.push(...result.artifacts);
    layerResults.push(result);
  }
  if (runtimeEnabled) {
    const runtimeResult = await buildRuntimeLayer(
      { ...options, workspaceRoot },
      files,
      previousLayers.get('runtime')
    );
    artifacts.push(...runtimeResult.artifacts);
    layerResults.push(runtimeResult);
  }

  const layers = LAYER_ORDER.map(kind =>
    layerResults.find(result => result.descriptor.kind === kind)
  )
    .filter(Boolean)
    .map(result => result.descriptor);
  const packageManifest = {
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    compilerVersion: COMPILER_VERSION,
    mode: 'trusted-developer',
    runtimeMode: runtimeEnabled ? 'react-spa' : 'legacy',
    buildRequirements: {
      contractVersion: 'delivery_v2_build_closure_v1',
      sealed: true,
      runtime: runtimeEnabled ? 'prebuilt-runtime-layer' : 'not-required',
      authoredResources: 'openxiangda-bundled-toolchain',
      workspaceNodeModules: 'forbidden',
      externalPackages: [],
    },
    resources,
    layers,
  };
  const packageBuffer = Buffer.from(canonicalJson(packageManifest));
  const packageArtifact = artifactFromBuffer(
    'package-manifest',
    packageBuffer,
    {
      contentType: 'application/json',
      schemaVersion: PACKAGE_SCHEMA_VERSION,
    }
  );
  artifacts.push(packageArtifact);

  return {
    workspaceRoot,
    packageDigest: packageArtifact.digest,
    packageManifest,
    artifacts: deduplicateArtifacts(artifacts),
    summary: {
      sourceFileCount: files.length,
      artifactUploadCount: deduplicateArtifacts(artifacts).length,
      layers: layerResults.map(result => ({
        kind: result.descriptor.kind,
        digest: result.descriptor.digest,
        sourceHash: result.descriptor.sourceHash,
        reused: result.reused,
        built: Boolean(result.built),
        fileCount: result.descriptor.fileCount,
        size: result.descriptor.size,
      })),
    },
  };
}

function deduplicateArtifacts(artifacts) {
  const byDigest = new Map();
  for (const artifact of artifacts) {
    if (!byDigest.has(artifact.digest)) byDigest.set(artifact.digest, artifact);
  }
  return [...byDigest.values()];
}

function collectRuntimeFiles(distDir) {
  if (!fs.existsSync(distDir) || !fs.statSync(distDir).isDirectory()) {
    throw createCompilerError(
      'DELIVERY_RUNTIME_DIST_MISSING',
      `Runtime dist 目录不存在: ${distDir}`
    );
  }
  const files = [];
  const visit = currentDir => {
    const entries = fs
      .readdirSync(currentDir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
        continue;
      }
      if (!entry.isFile() || entry.name.endsWith('.map')) continue;
      const relative = normalizePath(path.relative(distDir, absolute));
      const buffer = fs.readFileSync(absolute);
      files.push({
        path: relative,
        buffer,
        contentType: inferContentType(relative),
      });
    }
  };
  visit(distDir);
  if (!files.some(file => file.path === 'index.html')) {
    throw createCompilerError(
      'DELIVERY_RUNTIME_INDEX_MISSING',
      `Runtime dist 缺少 index.html: ${distDir}`
    );
  }
  const totalBytes = files.reduce((sum, file) => sum + file.buffer.length, 0);
  if (totalBytes > MAX_RUNTIME_BYTES) {
    throw createCompilerError(
      'DELIVERY_RUNTIME_TOO_LARGE',
      `Runtime dist 超过 ${MAX_RUNTIME_BYTES} bytes`
    );
  }
  return files;
}

async function runBuild(options) {
  await new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(options.command, [], {
        cwd: options.workspaceRoot,
        shell: true,
        stdio: options.onOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
        env: {
          ...process.env,
          ...options.env,
        },
      });
    } catch (error) {
      reject(
        createCompilerError(
          'DELIVERY_RUNTIME_BUILD_START_FAILED',
          error?.message || String(error)
        )
      );
      return;
    }
    if (options.onOutput) {
      child.stdout?.on('data', chunk =>
        options.onOutput('stdout', String(chunk))
      );
      child.stderr?.on('data', chunk =>
        options.onOutput('stderr', String(chunk))
      );
    }
    child.once('error', error => {
      reject(
        createCompilerError(
          'DELIVERY_RUNTIME_BUILD_START_FAILED',
          error.message
        )
      );
    });
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        createCompilerError(
          'DELIVERY_RUNTIME_BUILD_FAILED',
          Number.isInteger(code)
            ? `exit ${code}`
            : `signal ${signal || 'unknown'}`
        )
      );
    });
  });
}

function inferContentType(file) {
  const extension = path.extname(file).toLowerCase();
  return (
    {
      '.css': 'text/css; charset=utf-8',
      '.html': 'text/html; charset=utf-8',
      '.ico': 'image/x-icon',
      '.jpeg': 'image/jpeg',
      '.jpg': 'image/jpeg',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json',
      '.mjs': 'text/javascript; charset=utf-8',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.ts': 'text/plain; charset=utf-8',
      '.tsx': 'text/plain; charset=utf-8',
      '.txt': 'text/plain; charset=utf-8',
      '.webp': 'image/webp',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
    }[extension] || 'application/octet-stream'
  );
}

function createCompilerError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.retryable = false;
  return error;
}

module.exports = {
  COMPILER_VERSION,
  PACKAGE_SCHEMA_VERSION,
  canonicalJson,
  collectConfigurationManifestCodes,
  collectManifestCodes,
  compileAppPackage,
  discoverResourceInventory,
  layerForSourceFile,
  sha256,
  sha256Canonical,
  shouldIncludeSourceFile,
};
