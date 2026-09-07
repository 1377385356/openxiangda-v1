import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("form runtime entry template", () => {
  it("injects AntD styles outside CSS layers with high priority", () => {
    const source = fs.readFileSync(
      path.resolve("packages/sdk/src/build-source/scripts/build-forms.mjs"),
      "utf-8",
    );

    expect(source).toContain(
      '<StyleProvider hashPriority="high" container={getStyleContainer(el)}>',
    );
    expect(source).not.toContain("<StyleProvider layer");
  });
});
