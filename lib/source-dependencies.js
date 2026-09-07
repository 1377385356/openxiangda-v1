const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]);

const LOCAL_MODULE_EXTENSIONS = [
  '',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
];

const RESOURCE_BUCKETS = [
  'forms',
  'dataViews',
  'connectors',
  'notifications',
  'functions',
  'storageConfigs',
];

const RESOURCE_BUCKET_ALIASES = new Map([
  ['forms', 'forms'],
  ['form', 'forms'],
  ['dataviews', 'dataViews'],
  ['data-views', 'dataViews'],
  ['dataview', 'dataViews'],
  ['connectors', 'connectors'],
  ['connector', 'connectors'],
  ['notifications', 'notifications'],
  ['notification', 'notifications'],
  ['notificationtypes', 'notifications'],
  ['notification-types', 'notifications'],
  ['functions', 'functions'],
  ['function', 'functions'],
  ['storageconfigs', 'storageConfigs'],
  ['storage-configs', 'storageConfigs'],
  ['storage', 'storageConfigs'],
]);

const TARGET_MANIFEST_KEYS = [
  ['functions', 'functions'],
  ['automations', 'automations'],
  ['workflows', 'workflows'],
  ['jsCodeNodes', 'jsCodeNodes'],
];

function normalizeWorkspacePath(value) {
  return String(value || '')
    .split(path.sep)
    .join('/')
    .replace(/^\.\//, '');
}

function isPathInside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function workspaceRelativePath(workspaceRoot, filePath) {
  return normalizeWorkspacePath(path.relative(workspaceRoot, filePath));
}

function getScriptKind(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.tsx':
      return ts.ScriptKind.TSX;
    case '.jsx':
      return ts.ScriptKind.JSX;
    case '.js':
    case '.mjs':
    case '.cjs':
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

function loadCompilerOptions(workspaceRoot) {
  const configPath = ts.findConfigFile(workspaceRoot, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) {
    return {
      allowJs: true,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      resolveJsonModule: true,
    };
  }
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) return { allowJs: true, resolveJsonModule: true };
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
  return {
    ...parsed.options,
    allowJs: true,
    resolveJsonModule: true,
  };
}

function resolveFileCandidate(basePath) {
  for (const extension of LOCAL_MODULE_EXTENSIONS) {
    const candidate = `${basePath}${extension}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return path.resolve(candidate);
  }
  for (const extension of LOCAL_MODULE_EXTENSIONS.slice(1)) {
    const candidate = path.join(basePath, `index${extension}`);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return path.resolve(candidate);
  }
  return null;
}

function resolveLocalModule(workspaceRoot, containingFile, specifier, compilerOptions) {
  const value = String(specifier || '').trim();
  if (!value) return null;
  const localLooking = value.startsWith('.') || value.startsWith('@/') || value.startsWith('~/');
  const resolved = ts.resolveModuleName(value, containingFile, compilerOptions, ts.sys).resolvedModule;
  if (resolved?.resolvedFileName) {
    const filePath = path.resolve(resolved.resolvedFileName);
    if (isPathInside(workspaceRoot, filePath) && !filePath.includes(`${path.sep}node_modules${path.sep}`)) {
      return filePath;
    }
  }
  if (!localLooking) return null;
  const fallbackBase = value.startsWith('@/') || value.startsWith('~/')
    ? path.join(workspaceRoot, 'src', value.slice(2))
    : path.resolve(path.dirname(containingFile), value);
  return resolveFileCandidate(fallbackBase);
}

function unwrapExpression(expression) {
  let current = expression;
  while (
    current &&
    (ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isSatisfiesExpression?.(current))
  ) {
    current = current.expression;
  }
  return current;
}

function propertyNameText(name) {
  if (!name) return '';
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
  if (ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return String(name.text);
  return '';
}

function collectConstInitializers(sourceFile) {
  const bindings = new Map();
  const visit = node => {
    if (
      ts.isVariableStatement(node) &&
      (node.declarationList.flags & ts.NodeFlags.Const) !== 0
    ) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          bindings.set(declaration.name.text, declaration.initializer);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return bindings;
}

function readStaticString(expression, bindings, seen = new Set()) {
  const value = unwrapExpression(expression);
  if (!value) return null;
  if (ts.isStringLiteralLike(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
    return value.text;
  }
  if (ts.isIdentifier(value)) {
    if (seen.has(value.text)) return null;
    const initializer = bindings.get(value.text);
    if (!initializer) return null;
    const nextSeen = new Set(seen);
    nextSeen.add(value.text);
    return readStaticString(initializer, bindings, nextSeen);
  }
  if (ts.isPropertyAccessExpression(value) || ts.isElementAccessExpression(value)) {
    const owner = unwrapExpression(value.expression);
    const property = ts.isPropertyAccessExpression(value)
      ? value.name.text
      : readStaticString(value.argumentExpression, bindings, seen);
    if (!property) return null;
    const ownerValue = ts.isIdentifier(owner) && bindings.has(owner.text)
      ? unwrapExpression(bindings.get(owner.text))
      : owner;
    if (!ownerValue || !ts.isObjectLiteralExpression(ownerValue)) return null;
    const entry = ownerValue.properties.find(item =>
      (ts.isPropertyAssignment(item) || ts.isShorthandPropertyAssignment(item)) &&
      propertyNameText(item.name) === property
    );
    if (!entry) return null;
    if (ts.isPropertyAssignment(entry)) return readStaticString(entry.initializer, bindings, seen);
    return readStaticString(bindings.get(entry.name.text), bindings, seen);
  }
  return null;
}

function getPropertyPath(expression, bindings) {
  const value = unwrapExpression(expression);
  if (!value) return null;
  if (ts.isIdentifier(value)) return [value.text];
  if (ts.isPropertyAccessExpression(value)) {
    const parent = getPropertyPath(value.expression, bindings);
    return parent ? [...parent, value.name.text] : null;
  }
  if (ts.isElementAccessExpression(value)) {
    const parent = getPropertyPath(value.expression, bindings);
    const key = readStaticString(value.argumentExpression, bindings);
    return parent && key ? [...parent, key] : null;
  }
  return null;
}

function readStaticObjectProperty(expression, propertyNames, bindings) {
  const value = unwrapExpression(expression);
  if (!value || !ts.isObjectLiteralExpression(value)) return null;
  for (const property of value.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    if (!propertyNames.includes(propertyNameText(property.name))) continue;
    const result = readStaticString(property.initializer, bindings);
    if (result) return result;
  }
  return null;
}

function resolveStaticExpression(expression, bindings, seen = new Set()) {
  const value = unwrapExpression(expression);
  if (!value || !ts.isIdentifier(value)) return value;
  if (seen.has(value.text)) return value;
  const initializer = bindings.get(value.text);
  if (!initializer) return value;
  const nextSeen = new Set(seen);
  nextSeen.add(value.text);
  return resolveStaticExpression(initializer, bindings, nextSeen);
}

function readStaticObjectPropertyExpression(
  expression,
  propertyNames,
  bindings
) {
  const value = resolveStaticExpression(expression, bindings);
  if (!value || !ts.isObjectLiteralExpression(value)) return null;
  for (const property of value.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    if (!propertyNames.includes(propertyNameText(property.name))) continue;
    return property.initializer;
  }
  return null;
}

function collectStaticQueryFieldNodes(
  expression,
  bindings,
  result,
  fieldPropertyNames,
  seen = new Set()
) {
  const value = resolveStaticExpression(expression, bindings, seen);
  if (!value || seen.has(value)) return;
  seen.add(value);
  if (ts.isArrayLiteralExpression(value)) {
    for (const element of value.elements) {
      collectStaticQueryFieldNodes(
        element,
        bindings,
        result,
        fieldPropertyNames,
        seen
      );
    }
    return;
  }
  if (!ts.isObjectLiteralExpression(value)) return;
  for (const property of value.properties) {
    if (ts.isSpreadAssignment(property)) {
      collectStaticQueryFieldNodes(
        property.expression,
        bindings,
        result,
        fieldPropertyNames,
        seen
      );
      continue;
    }
    if (!ts.isPropertyAssignment(property)) continue;
    const name = propertyNameText(property.name);
    if (fieldPropertyNames.has(name)) {
      const field = readStaticString(property.initializer, bindings);
      if (field) result.push({ field, node: property.initializer });
    }
    collectStaticQueryFieldNodes(
      property.initializer,
      bindings,
      result,
      fieldPropertyNames,
      seen
    );
  }
}

function addFormFieldReferences(
  formFieldReferences,
  sourceFile,
  workspaceRoot,
  bindings,
  formCode,
  inputExpression,
  api
) {
  if (!formCode || !inputExpression) return;
  const fields = [];
  for (const propertyName of ['filters', 'order']) {
    const expression = readStaticObjectPropertyExpression(
      inputExpression,
      [propertyName],
      bindings
    );
    if (expression) {
      collectStaticQueryFieldNodes(
        expression,
        bindings,
        fields,
        new Set(
          propertyName === 'order'
            ? ['id', 'key', 'field', 'fieldId']
            : ['key', 'field', 'fieldId']
        )
      );
    }
  }
  for (const item of fields) {
    formFieldReferences.push({
      formCode,
      field: item.field,
      api,
      ...sourceLocation(sourceFile, item.node, workspaceRoot),
    });
  }
}

function sourceLocation(sourceFile, node, workspaceRoot) {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    file: workspaceRelativePath(workspaceRoot, sourceFile.fileName),
    line: start.line + 1,
    column: start.character + 1,
  };
}

function addReference(references, sourceFile, node, workspaceRoot, bucket, code, api) {
  const normalizedCode = String(code || '').trim();
  if (!normalizedCode) return;
  references.push({
    bucket,
    code: normalizedCode,
    api,
    ...sourceLocation(sourceFile, node, workspaceRoot),
  });
}

function addDynamicReferenceWarning(warnings, sourceFile, node, workspaceRoot, api, expected) {
  warnings.push({
    code: 'dynamic-resource-reference',
    api,
    message: `${api} 使用动态资源 code，无法静态核对 manifest；请确认 resources.${expected} 已完整声明`,
    ...sourceLocation(sourceFile, node, workspaceRoot),
  });
}

function inspectResourceCall(
  node,
  sourceFile,
  workspaceRoot,
  bindings,
  references,
  formFieldReferences,
  warnings
) {
  if (!ts.isCallExpression(node)) return;
  const callee = getPropertyPath(node.expression, bindings);
  if (!callee) return;
  if (
    callee.length === 1 &&
    callee[0] === 'queryAdvancedFormPage'
  ) {
    const formCode = readStaticString(node.arguments[1], bindings);
    if (formCode) {
      addReference(
        references,
        sourceFile,
        node,
        workspaceRoot,
        'forms',
        formCode,
        'queryAdvancedFormPage'
      );
      addFormFieldReferences(
        formFieldReferences,
        sourceFile,
        workspaceRoot,
        bindings,
        formCode,
        node.arguments[2],
        'queryAdvancedFormPage'
      );
    }
    return;
  }
  if (callee[0] !== 'ctx' || callee.length < 3) return;
  const namespace = callee[1];
  const method = callee[2];
  const api = callee.join('.');
  const firstArgument = node.arguments[0];

  if (namespace === 'resources' && method.startsWith('resolve')) {
    const bucket = {
      resolveForm: 'forms',
      resolveDataView: 'dataViews',
      resolveConnector: 'connectors',
      resolveNotification: 'notifications',
      resolveNotificationType: 'notifications',
      resolveTemplate: 'notifications',
      resolveFunction: 'functions',
      resolveStorage: 'storageConfigs',
    }[method];
    if (!bucket) return;
    const code = readStaticString(firstArgument, bindings);
    if (code) addReference(references, sourceFile, node, workspaceRoot, bucket, code, api);
    else addDynamicReferenceWarning(warnings, sourceFile, node, workspaceRoot, api, bucket);
    return;
  }

  if (namespace === 'form') {
    const code = readStaticObjectProperty(firstArgument, ['formCode', 'code'], bindings) ||
      readStaticString(firstArgument, bindings);
    if (code) {
      addReference(references, sourceFile, node, workspaceRoot, 'forms', code, api);
      addFormFieldReferences(
        formFieldReferences,
        sourceFile,
        workspaceRoot,
        bindings,
        code,
        ts.isObjectLiteralExpression(
          resolveStaticExpression(firstArgument, bindings)
        )
          ? firstArgument
          : node.arguments[1],
        api
      );
    }
    else if (firstArgument) addDynamicReferenceWarning(warnings, sourceFile, node, workspaceRoot, api, 'forms');
    return;
  }

  if (namespace === 'dataView' && ['query', 'stats'].includes(method)) {
    const code = readStaticString(firstArgument, bindings) ||
      readStaticObjectProperty(firstArgument, ['dataViewCode', 'code'], bindings);
    if (code) addReference(references, sourceFile, node, workspaceRoot, 'dataViews', code, api);
    else if (firstArgument) addDynamicReferenceWarning(warnings, sourceFile, node, workspaceRoot, api, 'dataViews');
    return;
  }

  if (namespace === 'connector' && ['invoke', 'call'].includes(method)) {
    let code = readStaticObjectProperty(firstArgument, ['connector', 'connectorCode', 'code'], bindings);
    if (!code && method === 'call') {
      const callName = readStaticString(firstArgument, bindings);
      code = callName ? callName.split('.')[0] : null;
    }
    if (code) addReference(references, sourceFile, node, workspaceRoot, 'connectors', code, api);
    else if (firstArgument) addDynamicReferenceWarning(warnings, sourceFile, node, workspaceRoot, api, 'connectors');
    return;
  }

  if (
    namespace === 'notification' &&
    [
      'sendByType',
      'batchSendByType',
      'findConfig',
      'previewTemplate',
      'previewDingTalk',
      'sendDingTalk',
      'updateDingTalkCard',
    ].includes(method)
  ) {
    const code = readStaticString(firstArgument, bindings) ||
      readStaticObjectProperty(firstArgument, ['notificationType', 'templateCode', 'code'], bindings);
    if (code) addReference(references, sourceFile, node, workspaceRoot, 'notifications', code, api);
    else if (firstArgument) addDynamicReferenceWarning(warnings, sourceFile, node, workspaceRoot, api, 'notifications');
  }
}

function collectModuleSpecifiers(sourceFile) {
  const result = [];
  const visit = node => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      result.push({ value: node.moduleSpecifier.text, node: node.moduleSpecifier });
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      result.push({ value: node.moduleReference.expression.text, node: node.moduleReference.expression });
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length > 0 &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      result.push({ value: node.arguments[0].text, node: node.arguments[0] });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return result;
}

function dedupeDetails(values, keys) {
  const seen = new Set();
  return values.filter(value => {
    const key = keys.map(name => value[name] || '').join('\0');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function analyzeTypeScriptEntry(options = {}) {
  const workspaceRoot = path.resolve(options.workspaceRoot || process.cwd());
  const entryFile = path.resolve(workspaceRoot, options.entryFile || '');
  const compilerOptions = options.compilerOptions || loadCompilerOptions(workspaceRoot);
  const queue = [entryFile];
  const visited = new Set();
  const sourceDependencies = new Set();
  const references = [];
  const formFieldReferences = [];
  const warnings = [];

  while (queue.length > 0) {
    const current = path.resolve(queue.shift());
    if (visited.has(current)) continue;
    visited.add(current);
    if (!fs.existsSync(current) || !fs.statSync(current).isFile()) {
      warnings.push({
        code: 'missing-source-file',
        file: workspaceRelativePath(workspaceRoot, current),
        line: 1,
        column: 1,
        message: `本地 sourceFile 不存在: ${workspaceRelativePath(workspaceRoot, current)}`,
      });
      continue;
    }
    if (!isPathInside(workspaceRoot, current)) continue;
    sourceDependencies.add(workspaceRelativePath(workspaceRoot, current));
    if (!SOURCE_EXTENSIONS.has(path.extname(current).toLowerCase())) continue;

    const content = fs.readFileSync(current, 'utf8');
    const sourceFile = ts.createSourceFile(
      current,
      content,
      ts.ScriptTarget.Latest,
      true,
      getScriptKind(current)
    );
    for (const diagnostic of sourceFile.parseDiagnostics || []) {
      const position = diagnostic.start === undefined
        ? { line: 0, character: 0 }
        : sourceFile.getLineAndCharacterOfPosition(diagnostic.start);
      warnings.push({
        code: 'source-parse-diagnostic',
        file: workspaceRelativePath(workspaceRoot, current),
        line: position.line + 1,
        column: position.character + 1,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      });
    }

    const bindings = collectConstInitializers(sourceFile);
    const inspect = node => {
      inspectResourceCall(
        node,
        sourceFile,
        workspaceRoot,
        bindings,
        references,
        formFieldReferences,
        warnings
      );
      ts.forEachChild(node, inspect);
    };
    inspect(sourceFile);

    for (const imported of collectModuleSpecifiers(sourceFile)) {
      const localLooking = imported.value.startsWith('.') || imported.value.startsWith('@/') || imported.value.startsWith('~/');
      const resolved = resolveLocalModule(workspaceRoot, current, imported.value, compilerOptions);
      if (resolved) {
        queue.push(resolved);
      } else if (localLooking) {
        warnings.push({
          code: 'unresolved-local-import',
          specifier: imported.value,
          message: `无法解析本地 import: ${imported.value}`,
          ...sourceLocation(sourceFile, imported.node, workspaceRoot),
        });
      }
    }
  }

  const resourceReferenceDetails = dedupeDetails(
    references,
    ['bucket', 'code', 'file', 'line', 'column', 'api']
  ).sort((left, right) =>
    `${left.bucket}\0${left.code}\0${left.file}\0${left.line}`.localeCompare(
      `${right.bucket}\0${right.code}\0${right.file}\0${right.line}`
    )
  );
  const resourceReferences = Object.fromEntries(
    RESOURCE_BUCKETS.map(bucket => [
      bucket,
      Array.from(
        new Set(
          resourceReferenceDetails
            .filter(reference => reference.bucket === bucket)
            .map(reference => reference.code)
        )
      ).sort(),
    ])
  );

  return {
    entryFile: workspaceRelativePath(workspaceRoot, entryFile),
    sourceDependencies: Array.from(sourceDependencies).sort(),
    resourceReferences,
    resourceReferenceDetails,
    formFieldReferences: dedupeDetails(
      formFieldReferences,
      ['formCode', 'field', 'file', 'line', 'column', 'api']
    ),
    warnings: dedupeDetails(warnings, ['code', 'file', 'line', 'column', 'api', 'message']),
  };
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function resolveManifestLocalPath(workspaceRoot, baseDir, localPath) {
  const fromBase = path.resolve(baseDir || workspaceRoot, localPath);
  if (fs.existsSync(fromBase)) return fromBase;
  return path.resolve(workspaceRoot, localPath);
}

function collectManifestStructures(workspaceRoot, item) {
  const sourceEntries = new Set();
  const resourceContainers = [];
  const visited = new Set();
  const externalFiles = new Set();

  const visit = (value, baseDir) => {
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      for (const child of value) visit(child, baseDir);
      return;
    }
    if (value.sourceFile?.localPath) {
      sourceEntries.add(
        resolveManifestLocalPath(workspaceRoot, baseDir, String(value.sourceFile.localPath))
      );
    }
    if (value.resources && typeof value.resources === 'object') {
      resourceContainers.push(value.resources);
    }
    if (value.resourceBindings && typeof value.resourceBindings === 'object') {
      resourceContainers.push(value.resourceBindings);
    }
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith('__')) continue;
      if (key === 'definitionFile' && typeof child === 'string' && child.trim()) {
        const definitionPath = path.resolve(baseDir || workspaceRoot, child);
        if (!externalFiles.has(definitionPath) && fs.existsSync(definitionPath)) {
          externalFiles.add(definitionPath);
          const external = readJsonFile(definitionPath);
          if (external) visit(external, path.dirname(definitionPath));
        }
        continue;
      }
      if (child && typeof child === 'object') visit(child, baseDir);
    }
  };

  visit(item, item.__dir || workspaceRoot);
  return {
    sourceEntries: Array.from(sourceEntries).sort(),
    resourceContainers,
  };
}

function normalizeDeclaredCodes(value) {
  if (value === undefined || value === null || value === false) return [];
  if (Array.isArray(value)) {
    return value.flatMap(normalizeDeclaredCodes);
  }
  if (typeof value === 'object') {
    return Object.keys(value).map(key => String(key).trim()).filter(Boolean);
  }
  return String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function collectDeclaredResources(item, resourceContainers) {
  const result = Object.fromEntries(RESOURCE_BUCKETS.map(bucket => [bucket, new Set()]));
  for (const container of resourceContainers) {
    for (const [rawBucket, value] of Object.entries(container || {})) {
      const normalizedBucket = RESOURCE_BUCKET_ALIASES.get(
        String(rawBucket).replace(/[_\s]+/g, '-').toLowerCase()
      );
      if (!normalizedBucket) continue;
      for (const code of normalizeDeclaredCodes(value)) result[normalizedBucket].add(code);
    }
  }
  if (item.formCode) result.forms.add(String(item.formCode));
  return Object.fromEntries(
    RESOURCE_BUCKETS.map(bucket => [bucket, Array.from(result[bucket]).sort()])
  );
}

function getManifestItemCode(item) {
  return String(
    item?.code || item?.resourceCode || item?.functionCode || item?.scriptCode || item?.methodName || ''
  ).trim();
}

function mergeAnalyses(workspaceRoot, entries) {
  const analyses = entries.map(entryFile =>
    analyzeTypeScriptEntry({ workspaceRoot, entryFile })
  );
  const sourceDependencies = Array.from(
    new Set(analyses.flatMap(analysis => analysis.sourceDependencies))
  ).sort();
  const resourceReferenceDetails = dedupeDetails(
    analyses.flatMap(analysis => analysis.resourceReferenceDetails),
    ['bucket', 'code', 'file', 'line', 'column', 'api']
  );
  const resourceReferences = Object.fromEntries(
    RESOURCE_BUCKETS.map(bucket => [
      bucket,
      Array.from(
        new Set(
          resourceReferenceDetails
            .filter(reference => reference.bucket === bucket)
            .map(reference => reference.code)
        )
      ).sort(),
    ])
  );
  const formFieldReferences = dedupeDetails(
    analyses.flatMap(analysis => analysis.formFieldReferences || []),
    ['formCode', 'field', 'file', 'line', 'column', 'api']
  );
  return {
    entryFiles: entries.map(entry => workspaceRelativePath(workspaceRoot, entry)).sort(),
    sourceDependencies,
    resourceReferences,
    resourceReferenceDetails,
    formFieldReferences,
    warnings: dedupeDetails(
      analyses.flatMap(analysis => analysis.warnings),
      ['code', 'file', 'line', 'column', 'api', 'message']
    ),
  };
}

function analyzeManifestSourceDependencies(options = {}) {
  const workspaceRoot = path.resolve(options.workspaceRoot || process.cwd());
  const manifest = options.manifest || {};
  const targets = [];
  const byDependency = new Map();

  for (const [manifestKey, targetKey] of TARGET_MANIFEST_KEYS) {
    for (const item of manifest[manifestKey] || []) {
      const code = getManifestItemCode(item);
      if (!code) continue;
      const structures = collectManifestStructures(workspaceRoot, item);
      if (structures.sourceEntries.length === 0) continue;
      const analysis = {
        targetKey,
        code,
        declaredResources: collectDeclaredResources(item, structures.resourceContainers),
        ...mergeAnalyses(workspaceRoot, structures.sourceEntries),
      };
      Object.defineProperty(item, '__sourceAnalysis', {
        value: analysis,
        configurable: true,
        enumerable: false,
        writable: true,
      });
      targets.push(analysis);
      for (const dependency of analysis.sourceDependencies) {
        if (!byDependency.has(dependency)) byDependency.set(dependency, []);
        byDependency.get(dependency).push({ targetKey, code });
      }
    }
  }

  return { workspaceRoot, targets, byDependency };
}

function validateManifestSourceBindings(options = {}) {
  const index = analyzeManifestSourceDependencies(options);
  const errors = [];
  const warnings = [];

  for (const target of index.targets) {
    const label = `${target.targetKey.replace(/s$/, '')} ${target.code}`;
    const undeclared = [];
    for (const reference of target.resourceReferenceDetails) {
      const declared = target.declaredResources[reference.bucket] || [];
      if (declared.includes(reference.code)) continue;
      if (reference.bucket === 'forms' && /^FORM[_-]/i.test(reference.code)) continue;
      undeclared.push(reference);
    }
    if (undeclared.length > 0) {
      const codes = Array.from(
        new Set(undeclared.map(reference => `${reference.bucket}.${reference.code}`))
      ).sort();
      const visible = codes.slice(0, 12);
      warnings.push(
        `${label}: 源码引用了未在逐资源清单声明的应用内资源: ${visible.join(', ')}` +
          `${codes.length > visible.length ? ` 等 ${codes.length} 项` : ''}。` +
          '平台运行时将按当前租户和应用自动解析；resources 仅用于显式映射、审计和影响分析'
      );
    }
    for (const warning of target.warnings) {
      if (
        warning.code === 'dynamic-resource-reference' &&
        !target.entryFiles.includes(warning.file)
      ) {
        continue;
      }
      warnings.push(
        `${label}: ${warning.file}:${warning.line} ${warning.message}`
      );
    }
  }

  return {
    index,
    errors: Array.from(new Set(errors)),
    warnings: Array.from(new Set(warnings)),
    sourceDependencies: index.targets.map(target => ({
      kind: target.targetKey,
      code: target.code,
      entryFiles: target.entryFiles,
      sourceDependencies: target.sourceDependencies,
      resourceReferences: target.resourceReferences,
      formFieldReferences: target.formFieldReferences,
    })),
  };
}

function getImpactedResourceTargets(index, changedFiles = []) {
  const result = {
    functions: new Set(),
    automations: new Set(),
    workflows: new Set(),
    jsCodeNodes: new Set(),
  };
  for (const rawFile of changedFiles) {
    const file = normalizeWorkspacePath(rawFile);
    for (const target of index?.byDependency?.get(file) || []) {
      if (result[target.targetKey]) result[target.targetKey].add(target.code);
    }
  }
  return Object.fromEntries(
    Object.entries(result).map(([key, values]) => [key, Array.from(values).sort()])
  );
}

module.exports = {
  analyzeManifestSourceDependencies,
  analyzeTypeScriptEntry,
  getImpactedResourceTargets,
  validateManifestSourceBindings,
};
