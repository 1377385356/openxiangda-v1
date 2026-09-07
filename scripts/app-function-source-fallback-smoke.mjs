import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openxiangda-function-fallback-"))
const tempHome = path.join(tempRoot, "home")
const workspace = path.join(tempRoot, "workspace")
const profileName = "dev"
const appType = "APP_FUNCTION_FALLBACK"

let uploadedBytes = 0
let publishedFunctionBody = null
let server
let cleaned = false

const cleanup = () => {
  if (cleaned) return
  cleaned = true
  if (server) server.close()
  fs.rmSync(tempRoot, { recursive: true, force: true })
}
process.on("exit", cleanup)

fs.mkdirSync(path.join(tempHome, ".openxiangda"), { recursive: true })
fs.mkdirSync(path.join(workspace, ".openxiangda"), { recursive: true })
fs.mkdirSync(path.join(workspace, "scripts"), { recursive: true })
fs.mkdirSync(path.join(workspace, "src", "functions", "summarize_customer"), {
  recursive: true,
})
fs.mkdirSync(path.join(workspace, "src", "resources", "functions"), {
  recursive: true,
})

fs.writeFileSync(
  path.join(workspace, "package.json"),
  `${JSON.stringify(
    {
      name: "old-app-function-workspace",
      private: true,
      type: "module",
      scripts: {
        "build-js-code": "node scripts/build-js-code.mjs",
      },
    },
    null,
    2,
  )}\n`,
)

fs.writeFileSync(
  path.join(workspace, "scripts", "build-js-code.mjs"),
  `#!/usr/bin/env node
const args = process.argv.slice(2)
const readArg = name => {
  const index = args.indexOf(\`--\${name}\`)
  if (index >= 0) return args[index + 1]
  const prefix = \`--\${name}=\`
  return args.find(arg => arg.startsWith(prefix))?.slice(prefix.length)
}
const source = readArg("source")
if (source === "functions") {
  console.error("unsupported source: functions. Expected js-code-nodes or automations")
  process.exit(1)
}
console.error("old script should not be used for this smoke")
process.exit(1)
`,
)

fs.writeFileSync(
  path.join(workspace, "src", "functions", "summarize_customer", "index.ts"),
  `export default async function summarizeCustomer(ctx: { input?: unknown }) {
  return { ok: true, input: ctx.input || null }
}
`,
)

fs.writeFileSync(
  path.join(workspace, "src", "resources", "functions", "summarize_customer.json"),
  `${JSON.stringify(
    {
      code: "summarize_customer",
      name: "Summarize Customer",
      status: "active",
      definitionJson: {
        kind: "app_function",
        version: "function_v1",
        functionCode: "summarize_customer",
        runtimeMode: "trusted_node",
        sourceType: "file_snapshot",
        sourceFile: {
          localPath: "src/functions/summarize_customer/index.ts",
        },
      },
    },
    null,
    2,
  )}\n`,
)

fs.writeFileSync(
  path.join(workspace, ".openxiangda", "state.json"),
  `${JSON.stringify(
    {
      version: 1,
      profiles: {
        [profileName]: {
          appType,
          resources: {
            functions: {},
          },
        },
      },
    },
    null,
    2,
  )}\n`,
)

server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1")
  response.setHeader("content-type", "application/json")

  if (url.pathname === "/service/file/js-code-snapshot/upload") {
    request.on("data", chunk => {
      uploadedBytes += chunk.length
    })
    request.on("end", () => {
      response.end(
        JSON.stringify({
          code: 200,
          data: {
            bucketName: "bucket",
            objectName: "snapshots/index.cjs",
            sha256: "sha-fallback",
            size: uploadedBytes,
            originalName: "index.cjs",
            contentType: "application/javascript",
          },
        }),
      )
    })
    return
  }

  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/functions`
  ) {
    if (request.method === "POST") {
      readRequestJson(request, body => {
        publishedFunctionBody = body
        response.end(
          JSON.stringify({
            code: 200,
            data: {
              id: "FUNC_FALLBACK",
              code: body.code,
              name: body.name,
              definitionJson: body.definitionJson,
              status: "active",
            },
          }),
        )
      })
      return
    }
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          items: [],
          totalCount: 0,
        },
      }),
    )
    return
  }

  response.statusCode = 404
  response.end(JSON.stringify({ code: 404, message: "not found" }))
})

function readRequestJson(request, callback) {
  let raw = ""
  request.on("data", chunk => {
    raw += chunk
  })
  request.on("end", () => {
    try {
      callback(raw ? JSON.parse(raw) : {})
    } catch {
      callback({})
    }
  })
}

const listen = () =>
  new Promise(resolve => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port))
  })

const runOpenXiangda = args => {
  const child = spawn(
    process.execPath,
    [path.join(repoRoot, "bin", "openxiangda.js"), ...args],
    {
      cwd: workspace,
      env: {
        ...process.env,
        HOME: tempHome,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  )

  let stdout = ""
  let stderr = ""
  child.stdout.on("data", chunk => {
    stdout += chunk
  })
  child.stderr.on("data", chunk => {
    stderr += chunk
  })

  return new Promise((resolve, reject) => {
    child.on("error", reject)
    child.on("close", code => {
      if (code !== 0) {
        reject(new Error(stderr || stdout || "openxiangda failed"))
        return
      }
      resolve({ stdout, stderr })
    })
  })
}

const port = await listen()
fs.writeFileSync(
  path.join(tempHome, ".openxiangda", "profiles.json"),
  `${JSON.stringify(
    {
      version: 1,
      currentProfile: profileName,
      profiles: {
        [profileName]: {
          name: profileName,
          baseUrl: `http://127.0.0.1:${port}/service`,
          token: {
            accessToken: "test-token",
          },
        },
      },
    },
    null,
    2,
  )}\n`,
)

const result = await runOpenXiangda([
  "resource",
  "publish",
  "function",
  "--only",
  "summarize_customer",
  "--profile",
  profileName,
])

const bundlePath = path.join(
  workspace,
  "dist",
  "functions",
  "summarize_customer",
  "index.cjs",
)

if (!result.stderr.includes("不支持 App Function source=functions")) {
  throw new Error("expected fallback warning for old build-js-code script")
}
if (!result.stdout.includes("built functions/summarize_customer")) {
  throw new Error("expected fallback builder output")
}
if (!fs.existsSync(bundlePath)) {
  throw new Error("fallback builder did not create dist/functions bundle")
}
if (uploadedBytes <= 0) {
  throw new Error("snapshot upload did not receive bundle bytes")
}
if (
  publishedFunctionBody?.definitionJson?.sourceFile?.sha256 !== "sha-fallback" ||
  publishedFunctionBody?.definitionJson?.sourceType !== "file_snapshot"
) {
  throw new Error("published function did not use uploaded source snapshot")
}

console.log("app function source fallback smoke passed")
cleanup()
