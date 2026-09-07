import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it, vi } from "vitest";

let tempDirs: string[] = [];

function createWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-incremental-"));
  tempDirs.push(dir);
  fs.mkdirSync(path.join(dir, "src", "pages", "dashboard"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "test-workspace", dependencies: { openxiangda: "1.0.5" } }),
    "utf-8",
  );
  fs.writeFileSync(path.join(dir, "pnpm-lock.yaml"), "lockfileVersion: 9.0\n", "utf-8");
  fs.writeFileSync(
    path.join(dir, "src", "pages", "dashboard", "page.config.ts"),
    "export default { code: 'dashboard', name: 'Dashboard' };\n",
    "utf-8",
  );
  fs.writeFileSync(
    path.join(dir, "src", "pages", "dashboard", "index.tsx"),
    "export default function Dashboard() { return null; }\n",
    "utf-8",
  );
  return dir;
}

function runGit(workspaceRoot: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd: workspaceRoot,
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
}

function commitWorkspace(workspaceRoot: string) {
  runGit(workspaceRoot, ["init"]);
  runGit(workspaceRoot, ["config", "user.email", "test@example.com"]);
  runGit(workspaceRoot, ["config", "user.name", "Test User"]);
  runGit(workspaceRoot, ["add", "."]);
  runGit(workspaceRoot, ["commit", "-m", "initial"]);
}

async function loadIncremental(rootDir: string) {
  const previousRoot = process.env.LOWCODE_WORKSPACE_ROOT;
  process.env.LOWCODE_WORKSPACE_ROOT = rootDir;
  vi.resetModules();
  const module = await import("./incremental.mjs");
  if (previousRoot === undefined) {
    delete process.env.LOWCODE_WORKSPACE_ROOT;
  } else {
    process.env.LOWCODE_WORKSPACE_ROOT = previousRoot;
  }
  return module;
}

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
  vi.resetModules();
});

describe("incremental publish cache", () => {
  it("does not treat a local build cache entry as an already published module", async () => {
    const workspaceRoot = createWorkspace();
    const incremental = await loadIncremental(workspaceRoot);
    const modules = incremental.discoverWorkspaceModules();

    const buildPlan = incremental.planIncrementalBuild(modules);
    expect(buildPlan.changed.map((item: any) => item.key)).toEqual([
      "pages/dashboard",
    ]);

    incremental.commitIncrementalBuild(buildPlan, buildPlan.changed);

    expect(incremental.planIncrementalBuild(modules).changed).toHaveLength(0);
    expect(incremental.planIncrementalPublish(modules).changed.map((item: any) => item.key)).toEqual([
      "pages/dashboard",
    ]);

    const publishPlan = incremental.planIncrementalPublish(modules);
    incremental.commitIncrementalPublish(publishPlan, publishPlan.changed);

    expect(incremental.planIncrementalPublish(modules).changed).toHaveLength(0);
  });

  it("resolves git changed files to workspace publish targets", async () => {
    const workspaceRoot = createWorkspace();
    commitWorkspace(workspaceRoot);

    fs.writeFileSync(
      path.join(workspaceRoot, "src", "pages", "dashboard", "index.tsx"),
      "export default function Dashboard() { return 'changed'; }\n",
      "utf-8",
    );
    fs.mkdirSync(path.join(workspaceRoot, "src", "forms", "customer"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(workspaceRoot, "src", "forms", "customer", "schema.ts"),
      "export default { code: 'customer' };\n",
      "utf-8",
    );
    fs.mkdirSync(path.join(workspaceRoot, "src", "resources"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(workspaceRoot, "src", "resources", "menus.json"),
      "[]\n",
      "utf-8",
    );
    fs.mkdirSync(path.join(workspaceRoot, "src", "shared"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(workspaceRoot, "src", "shared", "format.ts"),
      "export const format = String;\n",
      "utf-8",
    );
    fs.mkdirSync(path.join(workspaceRoot, "src", "styles"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(workspaceRoot, "src", "styles", "index.css"),
      "@tailwind utilities;\n",
      "utf-8",
    );

    const incremental = await loadIncremental(workspaceRoot);
    const changed = incremental.resolveGitChangedWorkspaceTargets();

    expect(changed.available).toBe(true);
    expect(changed.only).toEqual(["forms/customer", "pages/dashboard"]);
    expect(changed.resourceFiles).toEqual(["src/resources/menus.json"]);
    expect(changed.globalFiles).toEqual([
      "src/shared/format.ts",
      "src/styles/index.css",
    ]);
  });
});
