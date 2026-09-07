import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const distRoot = path.join(repoRoot, "packages", "sdk", "dist")

const entries = [
  {
    label: "components",
    file: "components/index.mjs",
    maxBytes: 900 * 1024,
    requiredImports: ["antd-mobile", "dayjs"],
  },
  {
    label: "runtime-react",
    file: "runtime/react.mjs",
    // SheetJS is intentionally bundled so published workspaces never inherit
    // its non-registry URL dependency. Keep a tight ceiling around the current
    // minified production bundle instead of the obsolete pre-export budget.
    maxBytes: 700 * 1024,
    requiredImports: ["dayjs"],
  },
  {
    label: "runtime",
    file: "runtime/index.mjs",
    maxBytes: 1024 * 1024,
    requiredImports: ["antd-mobile", "dayjs"],
  },
]

const forbiddenMarkers = [
  "node_modules/antd-mobile/",
  "node_modules/antd-mobile-icons/",
  "node_modules/dayjs/",
  "node_modules/ahooks/",
  "node_modules/rc-util/",
]

for (const entry of entries) {
  const filePath = path.join(distRoot, entry.file)
  if (!fs.existsSync(filePath)) {
    throw new Error(`${entry.label}: missing ${entry.file}; run npm run build:sdk first`)
  }

  const code = fs.readFileSync(filePath, "utf8")
  const size = Buffer.byteLength(code)
  if (size > entry.maxBytes) {
    throw new Error(`${entry.label}: ${entry.file} is ${size} bytes, expected <= ${entry.maxBytes}`)
  }

  for (const marker of forbiddenMarkers) {
    if (code.includes(marker)) {
      throw new Error(`${entry.label}: ${entry.file} inlines ${marker}`)
    }
  }

  for (const moduleName of entry.requiredImports) {
    const externalImport = new RegExp(`from\\s*["']${moduleName}["']`)
    if (!externalImport.test(code)) {
      throw new Error(`${entry.label}: ${entry.file} should keep ${moduleName} external`)
    }
  }
}

console.log("SDK browser bundle smoke passed")
