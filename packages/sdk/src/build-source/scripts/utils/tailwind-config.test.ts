import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ensureWorkspaceTailwindConfig,
  patchWorkspacePostcssConfig,
  patchWorkspaceTailwindCss,
  patchWorkspaceTailwindConfig,
  validateWorkspaceTailwindConfig,
} from "./tailwind-config.mjs";

let tempDirs: string[] = [];

function createTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-tailwind-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe("workspace Tailwind config helpers", () => {
  it("patches stale app workspace config with openxiangda preset scanning", () => {
    const workspaceRoot = createTempDir();
    const configPath = path.join(workspaceRoot, "tailwind.config.cjs");
    fs.writeFileSync(
      configPath,
      `module.exports = { content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"], theme: { extend: {} }, plugins: [] };\n`,
      "utf-8",
    );

    const result = ensureWorkspaceTailwindConfig(workspaceRoot);
    const nextContent = fs.readFileSync(configPath, "utf-8");
    const cssContent = fs.readFileSync(
      path.join(workspaceRoot, "src", "index.css"),
      "utf-8",
    );
    const postcssContent = fs.readFileSync(
      path.join(workspaceRoot, "postcss.config.cjs"),
      "utf-8",
    );

    expect(result.changed).toBe(true);
    expect(nextContent).toContain(
      'require("openxiangda/tailwind-preset")',
    );
    expect(nextContent).toContain("...openxiangdaContent");
    expect(cssContent).not.toContain("@layer tailwind-base, antd;");
    expect(cssContent).toContain("@layer tailwind-base");
    expect(cssContent).toContain("@tailwind base;");
    expect(cssContent).toContain("@tailwind components;");
    expect(cssContent).toContain("@tailwind utilities;");
    expect(postcssContent).toContain("tailwindcss()");
    expect(postcssContent).toContain("autoprefixer()");
    expect(postcssContent).not.toContain("createOpenXiangdaNamespaceCssPlugin");
    expect(postcssContent).not.toContain('require("openxiangda/build")');
    expect(cssContent).not.toContain('@import "openxiangda/styles/tokens.css";');
    expect(validateWorkspaceTailwindConfig(workspaceRoot)).toEqual([]);
  });

  it("preserves custom Tailwind config while adding runtime requirements", () => {
    const source = `const customPlugin = require("./custom-plugin");

module.exports = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}", "./features/**/*.{tsx,ts}"],
  safelist: ["custom-safe-class"],
  theme: {
    extend: {
      colors: {
        brand: "#123456",
      },
    },
  },
  plugins: [customPlugin],
};
`;

    const nextContent = patchWorkspaceTailwindConfig(source);

    expect(nextContent).toContain("customPlugin");
    expect(nextContent).toContain('"./features/**/*.{tsx,ts}"');
    expect(nextContent).toContain('safelist: ["custom-safe-class"]');
    expect(nextContent).toContain('brand: "#123456"');
    expect(nextContent).toContain("plugins: [customPlugin]");
    expect(nextContent).toContain(
      'require("openxiangda/tailwind-preset")',
    );
    expect(nextContent).toContain("...openxiangdaContent");
    expect(nextContent).toContain("presets: [openxiangdaPreset]");
    expect(nextContent).toContain('"[-:T]"');
    expect(nextContent).toContain('"[-:TZ.]"');
  });

  it("preserves existing index css while migrating to Tailwind base layer directives", () => {
    const nextContent = patchWorkspaceTailwindCss(`@tailwind base;
@tailwind components;
@tailwind utilities;

#root {
  min-height: 100vh;
}
`);

    expect(nextContent).not.toContain("@layer tailwind-base, antd;");
    expect(nextContent).toContain("@layer tailwind-base");
    expect(nextContent).toContain("@tailwind base;");
    expect(nextContent).toContain("@tailwind components;");
    expect(nextContent).toContain("@tailwind utilities;");
    expect(nextContent).toContain("#root");
    expect(nextContent.match(/@tailwind\s+base\s*;/g)).toHaveLength(1);
  });

  it("adds missing layered Tailwind directives without removing custom css", () => {
    const nextContent = patchWorkspaceTailwindCss(`#root {
  min-height: 100vh;
}
`);

    expect(nextContent).toContain("@layer tailwind-base {");
    expect(nextContent).toContain("@tailwind components;");
    expect(nextContent).toContain("#root");
  });

  it("keeps current Tailwind base layer index css unchanged", () => {
    const source = `@import "openxiangda/styles/tokens.css";

@layer tailwind-base {
  @tailwind base;
}

@tailwind components;
@tailwind utilities;

#root {
  min-height: 100vh;
}
`;

    expect(patchWorkspaceTailwindCss(source)).toBe(source);
  });

  it("keeps current Tailwind directives without requiring design token import", () => {
    const nextContent = patchWorkspaceTailwindCss(`@layer tailwind-base {
  @tailwind base;
}

@tailwind components;
@tailwind utilities;
`);

    expect(nextContent).not.toContain('@import "openxiangda/styles/tokens.css";');
    expect(nextContent).toContain("@layer tailwind-base");
  });

  it("preserves an existing optional OpenXiangda design token import during css patching", () => {
    const nextContent = patchWorkspaceTailwindCss(`@import "openxiangda/styles/tokens.css";

@tailwind base;
@tailwind components;
@tailwind utilities;

#root {
  min-height: 100vh;
}
`);

    expect(nextContent.match(/openxiangda\/styles\/tokens\.css/g)).toHaveLength(1);
    expect(nextContent).toContain("@layer tailwind-base");
    expect(nextContent).toContain("#root");
  });

  it("patches standard PostCSS config without the namespace css plugin", () => {
    const nextContent = patchWorkspacePostcssConfig(`module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`);

    expect(nextContent).toContain("tailwindcss()");
    expect(nextContent).toContain("autoprefixer()");
    expect(nextContent).not.toContain("createOpenXiangdaNamespaceCssPlugin");
  });

  it("preserves custom PostCSS config when it cannot be patched safely", () => {
    const source = `const custom = require("./postcss-custom");
module.exports = { plugins: [custom()] };
`;

    expect(patchWorkspacePostcssConfig(source)).toBe(source);
  });

  it("removes stale antd layer declaration from index css", () => {
    const nextContent = patchWorkspaceTailwindCss(`@layer tailwind-base, antd;

@layer tailwind-base {
  @tailwind base;
}

@tailwind components;
@tailwind utilities;
`);

    expect(nextContent).not.toContain("@layer tailwind-base, antd;");
    expect(nextContent).toContain("@layer tailwind-base {");
  });

  it("reports stale config during update check", () => {
    const workspaceRoot = createTempDir();
    fs.writeFileSync(
      path.join(workspaceRoot, "tailwind.config.cjs"),
      `module.exports = { content: ["./src/**/*.{ts,tsx}"] };\n`,
      "utf-8",
    );

    expect(validateWorkspaceTailwindConfig(workspaceRoot)).toEqual([
      "tailwind.config.cjs must include openxiangda/tailwind-preset and scan openxiangda package output",
    ]);
  });

  it("reports missing Tailwind directives during update check", () => {
    const workspaceRoot = createTempDir();
    fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(workspaceRoot, "tailwind.config.cjs"),
      patchWorkspaceTailwindConfig(
        `module.exports = { content: ["./src/**/*.{ts,tsx}"] };\n`,
      ),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(workspaceRoot, "src", "index.css"),
      "#root { min-height: 100vh; }\n",
      "utf-8",
    );

    expect(validateWorkspaceTailwindConfig(workspaceRoot)).toEqual([
      "src/index.css must keep Tailwind base in @layer tailwind-base, include components/utilities, and avoid declaring antd layer",
    ]);
  });
});
