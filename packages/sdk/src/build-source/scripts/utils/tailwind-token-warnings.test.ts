import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getShadcnTailwindTokenWarnings,
  warnShadcnTailwindTokens,
} from "./tailwind-token-warnings.mjs";

let tempDirs: string[] = [];

function createTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-token-warn-"));
  tempDirs.push(dir);
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "tailwind.config.cjs"),
    "module.exports = { theme: { extend: {} } };\n",
    "utf-8",
  );
  fs.writeFileSync(
    path.join(dir, "src", "index.css"),
    "body { background: #f8fafc; }\n@tailwind utilities;\n",
    "utf-8",
  );
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
  vi.restoreAllMocks();
});

describe("shadcn Tailwind token warnings", () => {
  it("detects shadcn token classes when the workspace does not configure them", () => {
    const workspaceRoot = createTempDir();
    fs.writeFileSync(
      path.join(workspaceRoot, "src", "Page.tsx"),
      `export function Page() {
  return <div className="bg-card text-muted-foreground hover:text-foreground data-[state=open]:bg-accent" />;
}
`,
      "utf-8",
    );

    const warning = getShadcnTailwindTokenWarnings(workspaceRoot);

    expect(warning.configured).toBe(false);
    expect(warning.tokens).toEqual([
      "bg-accent",
      "bg-card",
      "text-foreground",
      "text-muted-foreground",
    ]);
    expect(warning.files[0]).toEqual({
      path: "src/Page.tsx",
      tokens: [
        "text-foreground",
        "bg-card",
        "text-muted-foreground",
        "bg-accent",
      ],
    });
  });

  it("does not warn for native Tailwind classes or OpenXiangda compatibility classes", () => {
    const workspaceRoot = createTempDir();
    fs.writeFileSync(
      path.join(workspaceRoot, "src", "Page.tsx"),
      `export function Page() {
  return <div className="bg-white border border-slate-200 text-slate-600 text-primary" />;
}
`,
      "utf-8",
    );

    const logger = { warn: vi.fn() };
    const warning = warnShadcnTailwindTokens(workspaceRoot, { logger });

    expect(warning.files).toEqual([]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("does not warn when shadcn tokens are explicitly configured", () => {
    const workspaceRoot = createTempDir();
    fs.writeFileSync(
      path.join(workspaceRoot, "tailwind.config.cjs"),
      `module.exports = {
  theme: {
    extend: {
      colors: {
        card: "hsl(var(--card))",
        "muted-foreground": "hsl(var(--muted-foreground))",
      },
    },
  },
};
`,
      "utf-8",
    );
    fs.writeFileSync(
      path.join(workspaceRoot, "src", "Page.tsx"),
      `export function Page() {
  return <div className="bg-card text-muted-foreground" />;
}
`,
      "utf-8",
    );

    const logger = { warn: vi.fn() };
    const warning = warnShadcnTailwindTokens(workspaceRoot, { logger });

    expect(warning.configured).toBe(true);
    expect(warning.files).toEqual([]);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
