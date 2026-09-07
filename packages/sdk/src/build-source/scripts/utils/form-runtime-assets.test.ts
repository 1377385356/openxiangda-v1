import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  formCssMarker,
  getRegisteredFormCssUrl,
  mergeSharedRuntimeCssIntoFormCss,
  resolveRuntimeCssPath,
  runtimeCssMarker,
} from "./form-runtime-assets.mjs";

const config = {
  version: "1.2.3",
  buildId: "BUILD_001",
  oss: {
    bucket: "bucket",
    region: "oss-cn-hangzhou",
    pathPrefix: "lowcode/app-workspace/dev",
  },
};

let tempDirs: string[] = [];

function createTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "form-runtime-assets-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe("form runtime asset helpers", () => {
  it("resolves the runtime css path from the manifest", () => {
    expect(
      resolveRuntimeCssPath("/workspace/dist/form-runtime", {
        files: { css: "style.css" },
      }),
    ).toBe("/workspace/dist/form-runtime/style.css");
  });

  it("copies shared runtime css into an empty form css file", () => {
    const dir = createTempDir();
    const runtimeCssPath = path.join(dir, "runtime.css");
    const formCssPath = path.join(dir, "forms", "style.css");
    fs.writeFileSync(
      runtimeCssPath,
      ".adm-button{display:inline-flex}",
      "utf-8",
    );

    const result = mergeSharedRuntimeCssIntoFormCss({
      runtimeCssPath,
      formCssPath,
    });

    expect(result).toEqual({ merged: true, reason: "merged" });
    expect(fs.readFileSync(formCssPath, "utf-8")).toContain(runtimeCssMarker);
    expect(fs.readFileSync(formCssPath, "utf-8")).toContain(".adm-button");
  });

  it("keeps form css after the shared runtime css", () => {
    const dir = createTempDir();
    const runtimeCssPath = path.join(dir, "runtime.css");
    const formCssPath = path.join(dir, "style.css");
    fs.writeFileSync(runtimeCssPath, ".runtime{color:red}", "utf-8");
    fs.writeFileSync(formCssPath, ".form{color:blue}", "utf-8");

    mergeSharedRuntimeCssIntoFormCss({ runtimeCssPath, formCssPath });

    const css = fs.readFileSync(formCssPath, "utf-8");
    expect(css.indexOf(runtimeCssMarker)).toBeLessThan(
      css.indexOf(formCssMarker),
    );
    expect(css).toContain(".runtime");
    expect(css).toContain(".form");
  });

  it("does not duplicate runtime css when the file is already merged", () => {
    const dir = createTempDir();
    const runtimeCssPath = path.join(dir, "runtime.css");
    const formCssPath = path.join(dir, "style.css");
    fs.writeFileSync(runtimeCssPath, ".runtime{color:red}", "utf-8");
    fs.writeFileSync(
      formCssPath,
      `${runtimeCssMarker}\n.runtime{color:red}\n`,
      "utf-8",
    );

    const result = mergeSharedRuntimeCssIntoFormCss({
      runtimeCssPath,
      formCssPath,
    });

    expect(result).toEqual({ merged: false, reason: "already-merged" });
    expect(
      fs.readFileSync(formCssPath, "utf-8").match(/runtime/g),
    ).toHaveLength(2);
  });

  it("falls back to runtime css for register when form css is empty", () => {
    const dir = createTempDir();
    const formCssPath = path.join(dir, "style.css");
    fs.writeFileSync(formCssPath, "", "utf-8");

    expect(
      getRegisteredFormCssUrl(config, "customer-info", {
        formCssPath,
        runtime: { cssUrl: "https://cdn.example.com/form-runtime/style.css" },
      }),
    ).toBe("https://cdn.example.com/form-runtime/style.css");
  });

  it("keeps the form css url for register when form css has content", () => {
    const dir = createTempDir();
    const formCssPath = path.join(dir, "style.css");
    fs.writeFileSync(formCssPath, ".form{color:blue}", "utf-8");

    expect(
      getRegisteredFormCssUrl(config, "customer-info", {
        formCssPath,
        runtime: { cssUrl: "https://cdn.example.com/form-runtime/style.css" },
      }),
    ).toBe(
      "https://bucket.oss-cn-hangzhou.aliyuncs.com/lowcode/app-workspace/dev/1.2.3/BUILD_001/forms/customer-info/style.css",
    );
  });
});
