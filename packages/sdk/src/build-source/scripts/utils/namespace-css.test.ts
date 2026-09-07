import postcss from "postcss";
import { describe, expect, it } from "vitest";

import { createNamespaceCssPlugin } from "./namespace-css.mjs";

function transform(css: string) {
  return postcss([createNamespaceCssPlugin()]).process(css, {
    from: undefined,
  }).css;
}

describe("createNamespaceCssPlugin", () => {
  it("adds sy-ant aliases for developer CSS that targets default antd classes", () => {
    const css = transform(
      ".portal-search .ant-input-affix-wrapper,.ant-select-dropdown .ant-select-item,.anticon-close{background:#fff}",
    );

    expect(css).toContain(
      ".sy-app-workspace .portal-search .ant-input-affix-wrapper",
    );
    expect(css).toContain(
      ".sy-app-workspace .portal-search .sy-ant-input-affix-wrapper",
    );
    expect(css).toContain(".ant-select-dropdown .ant-select-item");
    expect(css).toContain(".sy-ant-select-dropdown .sy-ant-select-item");
    expect(css).toContain(".anticon-close");
    expect(css).toContain(".sy-anticon-close");
  });
});
