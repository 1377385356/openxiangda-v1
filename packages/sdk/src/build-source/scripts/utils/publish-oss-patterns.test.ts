import { describe, expect, it } from "vitest";

import { buildUploadPatterns, getPageUploadPatterns } from "./publish-oss-patterns.mjs";

describe("publish oss upload patterns", () => {
  it("uploads both page dir name and page config code assets", () => {
    expect(
      getPageUploadPatterns("runtime-workbench", [
        {
          dirName: "runtime-workbench",
          config: { code: "runtime_workbench" },
        },
      ]),
    ).toEqual([
      "page-runtime/**/*",
      "pages/runtime-workbench/**/*",
      "pages/runtime_workbench/**/*",
    ]);
  });

  it("resolves page config code when target page is already code", async () => {
    await expect(
      buildUploadPatterns({
        targetForm: "",
        targetPage: "runtime_workbench",
        discoverPages: async () => [
          {
            dirName: "runtime-workbench",
            config: { code: "runtime_workbench" },
          },
        ],
      }),
    ).resolves.toEqual([
      "page-runtime/**/*",
      "pages/runtime_workbench/**/*",
      "pages/runtime-workbench/**/*",
    ]);
  });
});
