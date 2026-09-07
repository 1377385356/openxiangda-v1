const fs = require('fs');
const path = require('path');
const { builtinModules, createRequire } = require('module');
const esbuild = require('esbuild');

function resolveWorkspaceAlias(workspaceRoot, importPath) {
  const raw = path.join(
    workspaceRoot,
    'src',
    String(importPath || '').replace(/^@\//, '')
  );
  const candidates = [
    raw,
    `${raw}.ts`,
    `${raw}.tsx`,
    `${raw}.js`,
    `${raw}.mjs`,
    `${raw}.cjs`,
    path.join(raw, 'index.ts'),
    path.join(raw, 'index.tsx'),
    path.join(raw, 'index.js'),
  ];
  return candidates.find(candidate => fs.existsSync(candidate)) || raw;
}

async function loadLocalFormSchema(workspaceRoot, formCode) {
  const schemaPath = path.join(
    workspaceRoot,
    'src',
    'forms',
    formCode,
    'schema.ts'
  );
  if (!fs.existsSync(schemaPath)) return null;
  const external = Array.from(
    new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`)])
  );
  const built = await esbuild.build({
    entryPoints: [schemaPath],
    bundle: true,
    packages: 'external',
    format: 'cjs',
    platform: 'node',
    target: ['node20'],
    write: false,
    logLevel: 'silent',
    external,
    plugins: [
      {
        name: 'openxiangda-form-schema-workspace-alias',
        setup(build) {
          build.onResolve({ filter: /^openxiangda$/ }, () => ({
            path: 'form-schema-runtime',
            namespace: 'openxiangda-form-schema-runtime',
          }));
          build.onLoad(
            {
              filter: /^form-schema-runtime$/,
              namespace: 'openxiangda-form-schema-runtime',
            },
            () => ({
              contents: 'export const defineFormSchema = schema => schema;',
              loader: 'js',
            })
          );
          build.onResolve({ filter: /^@\// }, args => ({
            path: resolveWorkspaceAlias(workspaceRoot, args.path),
          }));
        },
      },
    ],
  });
  const code = built.outputFiles?.[0]?.text;
  if (!code) {
    throw new Error(`FORM_SCHEMA_BUILD_FAILED: ${formCode} 未生成 schema bundle`);
  }
  const schemaModule = { exports: {} };
  const localRequire = createRequire(schemaPath);
  const evaluate = new Function(
    'module',
    'exports',
    'require',
    '__filename',
    '__dirname',
    code
  );
  evaluate(
    schemaModule,
    schemaModule.exports,
    localRequire,
    schemaPath,
    path.dirname(schemaPath)
  );
  const exported = schemaModule.exports?.default || schemaModule.exports;
  return normalizeLocalFormSchema(exported, formCode);
}

function normalizeLocalFormSchema(schema, formCode) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new Error(`FORM_SCHEMA_INVALID: ${formCode} 默认导出必须是对象`);
  }
  if (!schema.formMeta || typeof schema.formMeta !== 'object') {
    throw new Error(`FORM_SCHEMA_INVALID: ${formCode}.formMeta 缺失`);
  }
  if (!Array.isArray(schema.fields) || schema.fields.length === 0) {
    throw new Error(`FORM_SCHEMA_INVALID: ${formCode}.fields 不能为空`);
  }
  const seen = new Set();
  const components = schema.fields.map((field, index) => {
    const fieldId = String(field?.fieldId || '').trim();
    const componentName = normalizeComponentName(field?.componentName);
    if (!fieldId || !componentName) {
      throw new Error(
        `FORM_SCHEMA_INVALID: ${formCode}.fields[${index}] 缺少 fieldId/componentName`
      );
    }
    if (seen.has(fieldId)) {
      throw new Error(`FORM_SCHEMA_INVALID: ${formCode} fieldId 重复: ${fieldId}`);
    }
    seen.add(fieldId);
    return {
      componentName,
      id: field.id || `${fieldId}_${index + 1}`,
      title: field.label || fieldId,
      hidden: false,
      isLocked: false,
      condition: true,
      conditionGroup: '',
      props: {
        ...field,
        componentName,
        isFormComponent: true,
        fieldId,
        label: field.label || fieldId,
        tips: field.tips || '',
        value: field.value || '',
        placeholder: field.placeholder || '',
      },
    };
  });
  const pageSchema = {
    version: '2.0',
    componentsTree: [
      {
        componentName: 'Page',
        id: `${schema.formMeta.formUuid || formCode}_page`,
        props: {},
        children: components,
      },
    ],
  };
  return {
    name: schema.formMeta.title || formCode,
    schema: JSON.stringify(pageSchema),
    packages: JSON.stringify({}),
    formType: normalizeFormType(
      schema.formMeta.formType || schema.template?.formType
    ),
    fieldCount: components.length,
    sourcePath: `src/forms/${formCode}/schema.ts`,
  };
}

function normalizeComponentName(value) {
  const name = String(value || '').trim();
  return name === 'TextAreaField' ? 'TextareaField' : name;
}

function normalizeFormType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['process', 'workflow', 'flow', 'flowform', 'processform'].includes(
    normalized
  )
    ? 'process'
    : 'receipt';
}

module.exports = {
  loadLocalFormSchema,
  normalizeLocalFormSchema,
};
