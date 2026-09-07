import fs from "node:fs";

export const requiredRuntimeCssSelectors = [
  ".flex",
  ".grid",
  ".rounded-lg",
  ".bg-ant-bg-layout",
  ".sy-form-layout",
  ".sy-layout-field",
  ".sy-field-wrapper",
  ".sy-field-control",
  ".sy-subform",
];

function selectorPattern(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9_-])${escaped}([^A-Za-z0-9_-]|$)`);
}

export function getMissingRuntimeCssSelectors(
  css,
  selectors = requiredRuntimeCssSelectors,
) {
  return selectors.filter((selector) => !selectorPattern(selector).test(css));
}

export function validateRuntimeCssFile(
  cssPath,
  { label = "runtime", selectors = requiredRuntimeCssSelectors } = {},
) {
  if (!cssPath || !fs.existsSync(cssPath) || fs.statSync(cssPath).size === 0) {
    throw new Error(
      `${label} style.css is empty or missing; run lowcode-workspace update to refresh Tailwind config and ensure src/index.css keeps Tailwind base in its own layer`,
    );
  }

  const css = fs.readFileSync(cssPath, "utf-8");
  const missing = getMissingRuntimeCssSelectors(css, selectors);
  if (missing.length) {
    throw new Error(
      `${label} style.css is missing required runtime utility selectors: ${missing.join(", ")}; run lowcode-workspace update to refresh Tailwind preset/content scanning, then rebuild without stale runtime cache`,
    );
  }
}
