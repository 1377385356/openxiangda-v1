import fs from "node:fs";
import path from "node:path";

const managedHeader = `const openxiangdaPath = require("node:path");
const openxiangdaPresetModule = require("openxiangda/tailwind-preset");
const openxiangdaPreset =
  openxiangdaPresetModule.default ?? openxiangdaPresetModule;

function resolveOpenXiangdaContent() {
  try {
    const packagePath = require.resolve("openxiangda");
    const distDir = openxiangdaPath.dirname(packagePath);
    return [openxiangdaPath.join(distDir, "..", "**/*.{js,mjs,cjs}")];
  } catch {
    return [];
  }
}

const openxiangdaContent = resolveOpenXiangdaContent();
`;
const tailwindDirectives = ["base", "components", "utilities"];
const requiredBlocklistEntries = ['"[-:T]"', '"[-:TZ.]"'];
const layeredTailwindCss = `@layer tailwind-base {
  @tailwind base;
}

@tailwind components;
@tailwind utilities;
`;
const canonicalPostcssConfig = `const tailwindcss = require("tailwindcss");
const autoprefixer = require("autoprefixer");

module.exports = {
  plugins: [
    tailwindcss(),
    autoprefixer(),
  ],
};
`;

export const canonicalTailwindConfig = `${managedHeader}
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    ...openxiangdaContent,
  ],
  blocklist: ["[-:T]", "[-:TZ.]"],
  presets: [openxiangdaPreset],
  theme: {
    extend: {},
  },
  plugins: [],
};
`;

export function isWorkspaceTailwindConfigCurrent(content) {
  return Boolean(
    content.includes("openxiangda/tailwind-preset") &&
    content.includes("resolveOpenXiangdaContent") &&
    content.includes("openxiangdaContent") &&
    content.includes("openxiangdaPreset") &&
    content.includes("...openxiangdaContent") &&
    hasBlocklistEntry(content, "[-:T]") &&
    hasBlocklistEntry(content, "[-:TZ.]"),
  );
}

export function isWorkspaceTailwindCssCurrent(content) {
  return (
    /@layer\s+tailwind-base\s*\{\s*@tailwind\s+base\s*;\s*\}/s.test(content) &&
    !/@layer\s+tailwind-base\s*,\s*antd\s*;/.test(content) &&
    tailwindDirectives
      .filter((directive) => directive !== "base")
      .every((directive) =>
        new RegExp(`@tailwind\\s+${directive}\\s*;`).test(content),
      )
  );
}

export function isWorkspacePostcssConfigCurrent(content) {
  return Boolean(
    !content.includes("createOpenXiangdaNamespaceCssPlugin") &&
      /plugins\s*:\s*\[[\s\S]*tailwindcss\(\)[\s\S]*autoprefixer\(/s.test(
        content,
      ),
  );
}

function hasBlocklistEntry(content, entry) {
  const singleQuoted = `'${entry.slice(1, -1)}'`;
  return content.includes(entry) || content.includes(singleQuoted);
}

function insertAfterModuleExportsOpen(content, propertyLine) {
  return content.replace(
    /module\.exports\s*=\s*\{\s*/,
    (match) => `${match}\n  ${propertyLine}\n`,
  );
}

function ensureManagedHeader(content) {
  if (content.includes("resolveOpenXiangdaContent")) return content;
  return `${managedHeader}\n${content}`;
}

function ensureContentScan(content) {
  if (content.includes("...openxiangdaContent")) {
    return content;
  }
  if (/content\s*:\s*\[/.test(content)) {
    return content.replace(
      /content\s*:\s*\[/,
      "content: [\n    ...openxiangdaContent,",
    );
  }
  return insertAfterModuleExportsOpen(
    content,
    'content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}", ...openxiangdaContent],',
  );
}

function ensurePreset(content) {
  if (/presets\s*:\s*\[[^\]]*openxiangdaPreset/s.test(content)) {
    return content;
  }
  if (/presets\s*:\s*\[/.test(content)) {
    return content.replace(
      /presets\s*:\s*\[/,
      "presets: [openxiangdaPreset, ",
    );
  }
  return insertAfterModuleExportsOpen(
    content,
    "presets: [openxiangdaPreset],",
  );
}

function normalizeLegacyManagedNames(content) {
  return content
    .replace(
      /const syLowcodePath = require\("node:path"\);[\s\S]*?const syLowcodeFormComponentsContent = resolveSyLowcodeFormComponentsContent\(\);\n*/g,
      "",
    )
    .replace(/syLowcodeFormComponentsPreset/g, "openxiangdaPreset")
    .replace(/syLowcodeFormComponentsContent/g, "openxiangdaContent")
    .replace(/formComponentsPreset/g, "openxiangdaPreset")
    .replace(/formComponentsContent/g, "openxiangdaContent");
}

function ensureBlocklist(content) {
  if (!/blocklist\s*:\s*\[/.test(content)) {
    return insertAfterModuleExportsOpen(
      content,
      'blocklist: ["[-:T]", "[-:TZ.]"],',
    );
  }

  let nextContent = content;
  for (const entry of [...requiredBlocklistEntries].reverse()) {
    if (hasBlocklistEntry(nextContent, entry)) continue;
    nextContent = nextContent.replace(
      /blocklist\s*:\s*\[/,
      `blocklist: [${entry}, `,
    );
  }
  return nextContent;
}

export function patchWorkspaceTailwindConfig(content) {
  if (!content.trim()) return canonicalTailwindConfig;
  content = normalizeLegacyManagedNames(content);
  if (isWorkspaceTailwindConfigCurrent(content)) return content;

  let nextContent = ensureManagedHeader(content);
  nextContent = ensureContentScan(nextContent);
  nextContent = ensurePreset(nextContent);
  nextContent = ensureBlocklist(nextContent);
  return nextContent;
}

export function patchWorkspaceTailwindCss(content) {
  if (isWorkspaceTailwindCssCurrent(content)) return content;

  const hasExistingTokenImport =
    /@import\s+["']openxiangda\/styles\/tokens\.css["'];/.test(content);
  const optionalTokenImport = hasExistingTokenImport
    ? '@import "openxiangda/styles/tokens.css";\n\n'
    : "";
  const customCss = content
    .replace(/@import\s+["']openxiangda\/styles\/tokens\.css["'];\s*/g, "")
    .replace(/@layer\s+tailwind-base\s*,\s*antd\s*;\s*/g, "")
    .replace(/@layer\s+tailwind-base\s*\{\s*@tailwind\s+base\s*;\s*\}\s*/gs, "")
    .replace(/@tailwind\s+(?:base|components|utilities)\s*;\s*/g, "")
    .trimStart();

  const baseCss = `${optionalTokenImport}${layeredTailwindCss}`;
  return customCss ? `${baseCss}\n${customCss}` : baseCss;
}

function isStandardPostcssConfig(content) {
  return (
    /plugins\s*:\s*\{[\s\S]*tailwindcss\s*:\s*\{[\s\S]*autoprefixer\s*:\s*\{[\s\S]*\}/s.test(
      content,
    ) || /plugins\s*:\s*\[[\s\S]*tailwindcss\([\s\S]*autoprefixer\(/s.test(content)
  );
}

export function patchWorkspacePostcssConfig(content) {
  if (isWorkspacePostcssConfigCurrent(content)) return content;
  if (
    !content.trim() ||
    isStandardPostcssConfig(content) ||
    content.includes("createOpenXiangdaNamespaceCssPlugin")
  ) {
    return canonicalPostcssConfig;
  }
  return content;
}

export function ensureWorkspaceTailwindConfig(workspaceRoot) {
  const configPath = path.join(workspaceRoot, "tailwind.config.cjs");
  const current = fs.existsSync(configPath)
    ? fs.readFileSync(configPath, "utf-8")
    : "";
  const nextContent = patchWorkspaceTailwindConfig(current);
  if (current !== nextContent) {
    fs.writeFileSync(configPath, nextContent, "utf-8");
  }

  const cssPath = path.join(workspaceRoot, "src", "index.css");
  const currentCss = fs.existsSync(cssPath)
    ? fs.readFileSync(cssPath, "utf-8")
    : "";
  const nextCss = patchWorkspaceTailwindCss(currentCss);
  if (currentCss !== nextCss) {
    fs.mkdirSync(path.dirname(cssPath), { recursive: true });
    fs.writeFileSync(cssPath, nextCss, "utf-8");
  }

  const postcssPath = path.join(workspaceRoot, "postcss.config.cjs");
  const currentPostcss = fs.existsSync(postcssPath)
    ? fs.readFileSync(postcssPath, "utf-8")
    : "";
  const nextPostcss = patchWorkspacePostcssConfig(currentPostcss);
  if (currentPostcss !== nextPostcss) {
    fs.writeFileSync(postcssPath, nextPostcss, "utf-8");
  }

  return {
    changed:
      current !== nextContent ||
      currentCss !== nextCss ||
      currentPostcss !== nextPostcss,
    path: configPath,
    cssPath,
    postcssPath,
  };
}

export function validateWorkspaceTailwindConfig(workspaceRoot) {
  const configPath = path.join(workspaceRoot, "tailwind.config.cjs");
  if (!fs.existsSync(configPath)) {
    return ["tailwind.config.cjs is missing"];
  }
  const content = fs.readFileSync(configPath, "utf-8");
  if (!isWorkspaceTailwindConfigCurrent(content)) {
    return [
      "tailwind.config.cjs must include openxiangda/tailwind-preset and scan openxiangda package output",
    ];
  }
  const cssPath = path.join(workspaceRoot, "src", "index.css");
  const cssContent = fs.existsSync(cssPath)
    ? fs.readFileSync(cssPath, "utf-8")
    : "";
  if (!isWorkspaceTailwindCssCurrent(cssContent)) {
    return [
      "src/index.css must keep Tailwind base in @layer tailwind-base, include components/utilities, and avoid declaring antd layer",
    ];
  }
  return [];
}
