import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const collectFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    return statSync(path).isDirectory() ? collectFiles(path) : [path]
  })

describe("AdminList dependency boundary", () => {
  it("does not reference the legacy DataManagementList", () => {
    const source = collectFiles(__dirname)
      .filter((file) => /\.(ts|tsx)$/.test(file) && !file.endsWith(".test.ts"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n")

    expect(source).not.toContain("DataManagementList")
    expect(source).toContain("getCheckboxProps")
    expect(source).toContain("rowSelectable")
  })
})
