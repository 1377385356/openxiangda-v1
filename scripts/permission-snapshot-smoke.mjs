import assert from "node:assert/strict"
import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openxiangda-permission-snapshot-"))
const tempHome = path.join(tempRoot, "home")
const workspace = path.join(tempRoot, "workspace")
const profileName = "dev"
const appType = "APP_PERMISSION_SNAPSHOT"
const calls = []

fs.mkdirSync(path.join(tempHome, ".openxiangda"), { recursive: true })
fs.mkdirSync(path.join(workspace, ".openxiangda"), { recursive: true })
fs.writeFileSync(
  path.join(workspace, ".openxiangda", "state.json"),
  `${JSON.stringify({
    version: 1,
    profiles: {
      [profileName]: {
        appType,
        resources: {
          forms: {
            customer: { formUuid: "FORM_CUSTOMER" },
            order: { formUuid: "FORM_ORDER" },
          },
        },
      },
    },
  }, null, 2)}\n`,
)

const readRequestJson = request =>
  new Promise(resolve => {
    let raw = ""
    request.on("data", chunk => {
      raw += chunk
    })
    request.on("end", () => {
      resolve(raw ? JSON.parse(raw) : {})
    })
  })

const respond = (response, data, code = 200) => {
  response.statusCode = code
  response.setHeader("content-type", "application/json")
  response.end(JSON.stringify(data))
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1")
  const body = request.method === "GET" ? undefined : await readRequestJson(request)
  calls.push({ method: request.method, path: url.pathname, body })
  const api = `/service/openxiangda-api/v1/apps/${appType}`
  if (request.method === "POST" && url.pathname === `${api}/permissions/snapshot`) {
    return respond(response, {
      code: 200,
      data: {
        appType,
        roles: [{ id: "ROLE_MANAGER", code: "manager" }],
        pagePermissionGroups: [{ id: "PAGE_GROUP", name: "Pages" }],
        formPermissionGroups: {
          items: [{ id: "FORM_GROUP", formUuid: "FORM_CUSTOMER", name: "Customer View" }],
          total: 1,
          byFormUuid: {
            FORM_CUSTOMER: [{ id: "FORM_GROUP", formUuid: "FORM_CUSTOMER", name: "Customer View" }],
          },
        },
      },
    })
  }
  respond(response, { code: 404, message: `not found ${request.method} ${url.pathname}` }, 404)
})

const listen = () =>
  new Promise(resolve => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port))
  })

const port = await listen()
fs.writeFileSync(
  path.join(workspace, ".openxiangda", "profiles.json"),
  `${JSON.stringify({
    version: 1,
    currentProfile: profileName,
    profiles: {
      [profileName]: {
        name: profileName,
        baseUrl: `http://127.0.0.1:${port}/service`,
        token: { accessToken: "test-token" },
      },
    },
  }, null, 2)}\n`,
)

const runOpenXiangda = args =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(repoRoot, "bin", "openxiangda.js"), ...args], {
      cwd: workspace,
      env: { ...process.env, HOME: tempHome },
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", chunk => { stdout += chunk })
    child.stderr.on("data", chunk => { stderr += chunk })
    child.on("error", reject)
    child.on("close", code => {
      if (code !== 0) return reject(new Error(stderr || stdout || `${args.join(" ")} failed`))
      resolve({ stdout, stderr })
    })
  })

const result = JSON.parse(
  (await runOpenXiangda([
    "permission",
    "snapshot",
    "--profile",
    profileName,
    "--form-codes",
    "customer,order,customer",
    "--form-uuids",
    "FORM_EXTRA",
    "--json",
  ])).stdout,
)

if (result.appType !== appType) throw new Error("snapshot appType mismatch")
const snapshotCall = calls.find(call => call.path.endsWith("/permissions/snapshot"))
if (!snapshotCall) throw new Error("permission snapshot endpoint was not called")
const expectedFormUuids = ["FORM_EXTRA", "FORM_CUSTOMER", "FORM_ORDER"]
if (JSON.stringify(snapshotCall.body.formUuids) !== JSON.stringify(expectedFormUuids)) {
  throw new Error(`unexpected formUuids ${JSON.stringify(snapshotCall.body.formUuids)}`)
}

const stateFile = path.join(workspace, ".openxiangda", "state.json")
const stateBeforeDryRun = fs.readFileSync(stateFile, "utf8")
const callsBeforeDryRun = calls.length
const dryRun = JSON.parse(
  (await runOpenXiangda([
    "permission",
    "role-create",
    "union_secretary",
    "--name",
    "校工会干事",
    "--description",
    "身份角色",
    "--dry-run",
    "--profile",
    profileName,
    "--json",
  ])).stdout,
)
assert.deepEqual(dryRun, {
  dryRun: true,
  method: "POST",
  path: `/openxiangda-api/v1/apps/${appType}/roles`,
  body: {
    code: "union_secretary",
    name: "校工会干事",
    description: "身份角色",
  },
})
assert.equal(calls.length, callsBeforeDryRun, "role-create --dry-run must not call the platform")
assert.equal(
  fs.readFileSync(stateFile, "utf8"),
  stateBeforeDryRun,
  "role-create --dry-run must not write project state",
)

server.close()
console.log("permission snapshot smoke passed")
