import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const serverDir = resolveServerDir()

const requiredControllerFiles = [
  "openxiangda-app.controller.ts",
  "openxiangda-app-function.controller.ts",
  "openxiangda-runtime.controller.ts",
  "openxiangda-public-access.controller.ts",
  "openxiangda-data-view.controller.ts",
  "openxiangda-automation.controller.ts",
  "openxiangda-workflow.controller.ts",
]

for (const fileName of requiredControllerFiles) {
  const filePath = path.join(serverDir, "src", "controller", "openxiangda", fileName)
  if (!fs.existsSync(filePath)) {
    throw new Error(`missing OpenXiangda controller: ${filePath}`)
  }
}

const appFunctionController = readServerFile(
  "src/controller/openxiangda/openxiangda-app-function.controller.ts",
)
assertIncludes(
  appFunctionController,
  "@Controller('/openxiangda-api/v1/apps')",
  "app function controller must stay under /openxiangda-api/v1/apps",
)
assertIncludes(
  appFunctionController,
  "@Post('/:appType/functions/:code/invoke')",
  "app function controller must expose the OpenXiangda invoke alias",
)
assertIncludes(
  appFunctionController,
  "source: 'openxiangda-api'",
  "app function invoke alias must identify the OpenXiangda API source",
)

const functionInvokeSource = fs.readFileSync(
  path.join(repoRoot, "lib", "app-function-invoke.js"),
  "utf8",
)

const runtimeController = readServerFile(
  "src/controller/openxiangda/openxiangda-runtime.controller.ts",
)
assertIncludes(
  runtimeController,
  "@Get('/:appType/runtime/releases/by-build/:buildId')",
  "platform must expose an exact immutable Runtime build lookup for Delivery V2 recovery",
)
const cliSource = fs.readFileSync(path.join(repoRoot, "lib", "cli.js"), "utf8")
assertIncludes(
  cliSource,
  "runtime/releases/by-build/${encodeURIComponent(buildId)}",
  "CLI must query an existing deterministic Runtime build before uploading",
)
assertIncludes(
  functionInvokeSource,
  "/openxiangda-api/v1/apps/${encodeURIComponent(appType)}/functions/${encodeURIComponent(functionCode)}/invoke",
  "CLI function invoke must prefer the OpenXiangda API alias",
)
assertIncludes(
  functionInvokeSource,
  "/v1/functions/${encodeURIComponent(functionCode)}/invoke.json",
  "CLI function invoke must keep legacy runtime fallback",
)

console.log("openxiangda api contract smoke passed")

function resolveServerDir() {
  const candidates = [
    process.env.OPENXIANGDA_SERVER_DIR,
    path.resolve(repoRoot, "..", "..", "sy-lowcode-platform-server"),
    path.resolve(repoRoot, "..", "..", "lowcode", "sy-lowcode-platform-server"),
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "src", "controller", "openxiangda"))) {
      return candidate
    }
  }
  throw new Error(
    "cannot find sy-lowcode-platform-server; set OPENXIANGDA_SERVER_DIR",
  )
}

function readServerFile(relativePath) {
  return fs.readFileSync(path.join(serverDir, relativePath), "utf8")
}

function assertIncludes(source, needle, message) {
  if (!source.includes(needle)) {
    throw new Error(message)
  }
}
