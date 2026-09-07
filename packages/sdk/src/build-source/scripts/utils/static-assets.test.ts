import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { extractLargeDataUrlAssets } from "./static-assets.mjs";

let tempDirs: string[] = [];

function createTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "static-assets-"));
  tempDirs.push(dir);
  return dir;
}

function dataUrl(content: string, mime = "image/png") {
  return `data:${mime};base64,${Buffer.from(content).toString("base64")}`;
}

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe("static asset extraction", () => {
  it("keeps small data URLs inline and extracts large CSS/JS data URLs", () => {
    const outDir = createTempDir();
    const cssPath = path.join(outDir, "style.css");
    const jsPath = path.join(outDir, "index.js");
    const small = dataUrl("tiny");
    const large = dataUrl("large-static-asset-content");

    fs.writeFileSync(
      cssPath,
      `.hero{background:url("${large}")}.icon{background:url(${small})}`,
      "utf-8",
    );
    fs.writeFileSync(
      jsPath,
      `const hero = "${large}"; const icon = "${small}"; export { hero, icon };`,
      "utf-8",
    );

    const result = extractLargeDataUrlAssets({
      outDir,
      files: [cssPath, jsPath],
      inlineLimit: 8,
    });

    expect(result.extracted).toHaveLength(1);
    const [asset] = result.extracted;
    expect(asset.fileName).toMatch(/^asset-[a-f0-9]{16}\.png$/);
    expect(fs.existsSync(path.join(outDir, "assets", asset.fileName))).toBe(true);

    const css = fs.readFileSync(cssPath, "utf-8");
    const js = fs.readFileSync(jsPath, "utf-8");
    expect(css).toContain(`url("assets/${asset.fileName}")`);
    expect(css).toContain(small);
    expect(js).toContain(`new URL("assets/${asset.fileName}", import.meta.url).href`);
    expect(js).toContain(small);
  });
});
