import fs from "node:fs";
import path from "node:path";

import { getFormBundleUrl } from "./load-config.mjs";

export const runtimeCssMarker = "/* sy-lowcode shared form runtime styles */";
export const formCssMarker = "/* sy-lowcode form bundle styles */";

export function isNonEmptyFile(filePath) {
  return Boolean(
    filePath && fs.existsSync(filePath) && fs.statSync(filePath).size > 0,
  );
}

export function resolveRuntimeCssPath(runtimeDistDir, manifest) {
  const cssFile = manifest?.files?.css;
  if (!cssFile) return "";
  return path.resolve(runtimeDistDir, cssFile);
}

export function mergeSharedRuntimeCssIntoFormCss({
  runtimeCssPath,
  formCssPath,
}) {
  if (!isNonEmptyFile(runtimeCssPath)) {
    return { merged: false, reason: "missing-runtime-css" };
  }

  const runtimeCss = fs.readFileSync(runtimeCssPath, "utf-8").trimEnd();
  const formCss = fs.existsSync(formCssPath)
    ? fs.readFileSync(formCssPath, "utf-8")
    : "";

  if (formCss.includes(runtimeCssMarker)) {
    return { merged: false, reason: "already-merged" };
  }

  const nextCss = formCss.trim()
    ? `${runtimeCssMarker}\n${runtimeCss}\n\n${formCssMarker}\n${formCss.trimStart()}`
    : `${runtimeCssMarker}\n${runtimeCss}\n`;

  fs.mkdirSync(path.dirname(formCssPath), { recursive: true });
  fs.writeFileSync(formCssPath, nextCss, "utf-8");
  return { merged: true, reason: "merged" };
}

export function getRegisteredFormCssUrl(config, formName, options = {}) {
  const formCssUrl = getFormBundleUrl(config, formName, "style.css");
  if (
    options.runtime?.cssUrl &&
    options.formCssPath &&
    !isNonEmptyFile(options.formCssPath)
  ) {
    return options.runtime.cssUrl;
  }
  return formCssUrl;
}
