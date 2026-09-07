const DEFAULT_PREFIX = ".sy-app-workspace";

function splitSelectors(selector) {
  const selectors = [];
  let depth = 0;
  let quote = "";
  let current = "";
  for (const char of selector) {
    if (quote) {
      current += char;
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(" || char === "[") depth += 1;
    if (char === ")" || char === "]") depth -= 1;
    if (char === "," && depth === 0) {
      selectors.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) selectors.push(current.trim());
  return selectors;
}

function shouldSkipSelector(selector, prefix) {
  if (!selector || selector.includes(prefix)) return true;
  if (/^(html|body|:root)(\b|:|\[|$)/.test(selector)) return true;
  if (/^(@|from\b|to\b|\d+%)/.test(selector)) return true;
  if (/^\.(ant|sy-ant|anticon|adm)-/.test(selector)) return true;
  return false;
}

function createAntdPrefixAlias(selector) {
  const aliased = selector
    .replace(/(^|[^A-Za-z0-9_-])\.ant-/g, "$1.sy-ant-")
    .replace(/(^|[^A-Za-z0-9_-])\.anticon-/g, "$1.sy-anticon-")
    .replace(/(^|[^A-Za-z0-9_-])\.anticon(?=$|[^A-Za-z0-9_-])/g, "$1.sy-anticon");
  return aliased === selector ? null : aliased;
}

function uniqueSelectors(selectors) {
  return Array.from(new Set(selectors));
}

export function createNamespaceCssPlugin(prefix = DEFAULT_PREFIX) {
  return {
    postcssPlugin: "openxiangda-namespace-css",
    Rule(rule) {
      if (!rule.selector) return;
      let parent = rule.parent;
      while (parent) {
        if (parent.type === "atrule" && /keyframes$/i.test(parent.name)) {
          return;
        }
        parent = parent.parent;
      }
      rule.selector = uniqueSelectors(
        splitSelectors(rule.selector).flatMap((selector) => {
          const scopedSelector = shouldSkipSelector(selector, prefix)
            ? selector
            : `${prefix} ${selector}`;
          const antdAlias = createAntdPrefixAlias(scopedSelector);
          return antdAlias ? [scopedSelector, antdAlias] : [scopedSelector];
        }),
      ).join(", ");
    },
  };
}

createNamespaceCssPlugin.postcss = true;
