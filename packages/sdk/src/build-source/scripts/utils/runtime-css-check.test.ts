import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  getMissingRuntimeCssSelectors,
  validateRuntimeCssFile,
} from "./runtime-css-check.mjs";

let tempDirs: string[] = [];

function createTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-css-check-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe("runtime CSS checks", () => {
  it("accepts runtime CSS with required lowcode layout selectors", () => {
    const dir = createTempDir();
    const cssPath = path.join(dir, "style.css");
    fs.writeFileSync(
      cssPath,
      ".flex{display:flex}.grid{display:grid}.rounded-lg{border-radius:.5rem}.bg-ant-bg-layout{background:var(--ant-color-bg-layout)}.sy-form-layout{display:flex}.sy-layout-field{width:100%}.sy-field-wrapper{display:flex}.sy-field-control .ant-input{width:100%}.sy-subform{display:flex}",
      "utf-8",
    );

    expect(() => validateRuntimeCssFile(cssPath)).not.toThrow();
    expect(
      getMissingRuntimeCssSelectors(fs.readFileSync(cssPath, "utf-8")),
    ).toEqual([]);
  });

  it("fails when Tailwind runtime utility selectors are missing", () => {
    const dir = createTempDir();
    const cssPath = path.join(dir, "style.css");
    fs.writeFileSync(cssPath, ".ant-btn{display:inline-flex}", "utf-8");

    expect(() =>
      validateRuntimeCssFile(cssPath, { label: "代码页共享 runtime" }),
    ).toThrow(
      /代码页共享 runtime style\.css is missing required runtime utility selectors/,
    );
  });
});
