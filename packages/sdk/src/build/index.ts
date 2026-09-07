export type CssIsolation = 'namespace' | 'shadow' | 'none';
export type WorkspaceRuntimeMode = 'legacy' | 'react-spa';

export interface AppWorkspaceConfig {
  deliveryVersion?: 2;
  appType?: string;
  appName?: string;
  runtimeMode?: WorkspaceRuntimeMode;
  platformUrl?: string;
  servicePrefix?: string;
  appKey?: string;
  appSecret?: string;
  userId?: string;
  version?: string;
  buildId?: string;
  oss?: {
    region?: string;
    bucket?: string;
    accessKeyId?: string;
    accessKeySecret?: string;
    pathPrefix?: string;
    corsOrigins?: string[];
    skipCors?: boolean;
  };
  defaults?: {
    protocolVersion?: string;
    frameworkVersion?: string;
    cssIsolation?: CssIsolation;
    formMenuParentId?: string;
    formMenuIcon?: string;
    pageMenuParentId?: string;
    pageMenuIcon?: string;
    formBuilderVersion?: string;
  };
  forms?: { dir?: string; publishLegacyBundle?: boolean };
  pages?: { dir?: string };
  governance?: {
    sdd?: {
      enabled?: boolean;
      strictHighRisk?: boolean;
      strictDocumentation?: boolean;
      path?: string;
    };
  };
}

export function defineAppWorkspaceConfig<T extends AppWorkspaceConfig>(config: T): T {
  return config;
}

const DEFAULT_NAMESPACE_PREFIX = '.sy-app-workspace';

function splitCssSelectors(selector: string) {
  const selectors: string[] = [];
  let depth = 0;
  let quote = '';
  let current = '';
  for (const char of selector) {
    if (quote) {
      current += char;
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === '(' || char === '[') depth += 1;
    if (char === ')' || char === ']') depth -= 1;
    if (char === ',' && depth === 0) {
      selectors.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) selectors.push(current.trim());
  return selectors;
}

function shouldSkipNamespace(selector: string, prefix: string) {
  if (!selector || selector.includes(prefix)) return true;
  if (/^(html|body|:root)(\b|:|\[|$)/.test(selector)) return true;
  if (/^(@|from\b|to\b|\d+%)/.test(selector)) return true;
  if (/^\.(ant|sy-ant|anticon|adm)-/.test(selector)) return true;
  return false;
}

function createAntdSelectorAlias(selector: string) {
  const aliased = selector
    .replace(/(^|[^A-Za-z0-9_-])\.ant-/g, '$1.sy-ant-')
    .replace(/(^|[^A-Za-z0-9_-])\.anticon-/g, '$1.sy-anticon-')
    .replace(/(^|[^A-Za-z0-9_-])\.anticon(?=$|[^A-Za-z0-9_-])/g, '$1.sy-anticon');
  return aliased === selector ? null : aliased;
}

export function createOpenXiangdaNamespaceCssPlugin(
  prefix = DEFAULT_NAMESPACE_PREFIX,
) {
  return {
    postcssPlugin: 'openxiangda-namespace-css',
    Rule(rule: { selector?: string; parent?: any }) {
      if (!rule.selector) return;
      let parent = rule.parent;
      while (parent) {
        if (parent.type === 'atrule' && /keyframes$/i.test(parent.name)) {
          return;
        }
        parent = parent.parent;
      }
      rule.selector = Array.from(
        new Set(
          splitCssSelectors(rule.selector).flatMap((selector) => {
            const scopedSelector = shouldSkipNamespace(selector, prefix)
              ? selector
              : `${prefix} ${selector}`;
            const antdAlias = createAntdSelectorAlias(scopedSelector);
            return antdAlias ? [scopedSelector, antdAlias] : [scopedSelector];
          }),
        ),
      ).join(', ');
    },
  };
}

(createOpenXiangdaNamespaceCssPlugin as any).postcss = true;

export const createNamespaceCssPlugin = createOpenXiangdaNamespaceCssPlugin;
