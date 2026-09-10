import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(import.meta.url)
const sddLib = require("../lib/sdd")
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openxiangda-resource-cli-"))
const tempHome = path.join(tempRoot, "home")
const workspace = path.join(tempRoot, "workspace")
const origin = path.join(tempRoot, "origin.git")
const profileName = "dev"
const appType = "APP_RESOURCE_CLI"
const calls = []

fs.mkdirSync(path.join(tempHome, ".openxiangda"), { recursive: true })
fs.mkdirSync(path.join(workspace, ".openxiangda"), { recursive: true })
for (const dir of [
  "routes",
  "public-access",
  "auth",
  "functions",
  "connectors",
  "data-views",
  "menus",
  "roles",
  path.join("permissions", "page-groups"),
  path.join("permissions", "form-groups"),
  path.join("settings", "forms"),
]) {
  fs.mkdirSync(path.join(workspace, "src", "resources", dir), { recursive: true })
}

const writeJson = (relative, value) => {
  const filePath = path.join(workspace, relative)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
  return filePath
}

const runGit = args => {
  const result = spawnSync("git", args, { cwd: workspace, encoding: "utf8" })
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr || result.stdout || args.join(" "))
  }
  return String(result.stdout || "").trim()
}

const routeFile = writeJson("route.json", {
  code: "public.register",
  title: "Public Register",
  pathPattern: "/view/:appType/public/register",
  publicAccess: "guest",
  publicPolicyCode: "public_register",
})
const policyFile = writeJson("policy.json", {
  code: "public_register",
  name: "Public Register",
  mode: "guest",
  routeCode: "public.register",
  externalRoleCodes: ["external_visitor"],
  grants: {
    forms: [
      {
        code: "customer",
        actions: ["upload", "preview"],
        fields: ["applicationFiles"],
      },
    ],
    dataViews: ["customer_lookup"],
    functions: ["summarize_customer"],
    connectors: ["third_party"],
  },
})
const authFile = writeJson("auth.json", {
  code: "default",
  configJson: {
    methods: [{ type: "password", enabled: true }],
    registration: { mode: "reject" },
    binding: { mode: "auto" },
  },
})
const functionFile = writeJson("function.json", {
  code: "summarize_customer",
  name: "Summarize Customer",
  definitionJson: {
    kind: "app_function",
    version: "function_v1",
    runtimeMode: "trusted_node",
    sourceType: "inline",
    runtimeInvoke: {
      audience: {
        type: "authenticated",
      },
    },
    responseCache: {
      enabled: true,
      ttlSeconds: 3600,
      actions: ["home"],
      scope: "public_policy",
      invalidateOnForms: ["customer"],
    },
    invocationAudit: {
      successOutput: "summary",
      maxLogBytes: 16384,
    },
    code: "module.exports = async () => ({ ok: true })",
  },
  status: "active",
})
const connectorFile = writeJson("connector.json", {
  code: "third_party",
  name: "Third Party",
  protocol: "https",
  domain: "api.example.com",
  authType: "none",
  apis: [{ code: "ping", path: "/ping", method: "GET" }],
})
const dataViewFile = writeJson("data-view.json", {
  code: "customer_lookup",
  base: { formCode: "customer", alias: "customer" },
  select: [{ field: "customer.form_instance_id", as: "id" }],
})
const menuFile = writeJson("menu.json", {
  code: "customer_menu",
  name: "Customers",
  type: "receipt",
  formCode: "customer",
  parentCode: "root",
})
const roleFile = writeJson("role.json", {
  code: "manager",
  name: "Manager",
  description: "Full access",
})
const pageGroupFile = writeJson("page-group.json", {
  code: "sales_pages",
  name: "Sales Pages",
  roles: ["manager"],
  menuCodes: ["customer_menu"],
})
const formGroupFile = writeJson("form-group.json", {
  code: "customer_view",
  formCode: "customer",
  name: "Customer View",
  type: "view",
  roles: ["manager"],
  operations: ["view"],
})
const notificationFile = writeJson("notification.json", {
  templates: [{
    code: "reservation_reminder",
    name: "Reservation Reminder",
    content: "{{title}}",
    channelsConfig: { inapp: { enabled: true, content: "{{title}}" } },
  }],
  typeConfigs: [{
    notificationType: "reservation_reminder",
    templateCode: "reservation_reminder",
    enabled: true,
  }],
})

writeJson("src/resources/roles/manager.json", { code: "manager", name: "Manager" })
writeJson("src/resources/roles/auto_lease_role.json", {
  code: "auto_lease_role",
  name: "Auto Lease Role",
})
writeJson("src/resources/menus/10-root.json", {
  code: "root",
  name: "Root",
  type: "nav",
})
writeJson(
  "src/resources/menus/20-customer.json",
  JSON.parse(fs.readFileSync(menuFile, "utf8")),
)
writeJson("src/resources/menus/30-create-child.json", {
  code: "staged_child",
  name: "Staged Child",
  type: "display",
  parentCode: "staged_parent",
})
writeJson("src/resources/menus/40-create-parent.json", {
  code: "staged_parent",
  name: "Staged Parent",
  type: "nav",
})
writeJson("src/resources/permissions/page-groups/sales_pages.json", JSON.parse(fs.readFileSync(pageGroupFile, "utf8")))
writeJson("src/resources/permissions/form-groups/customer_view.json", JSON.parse(fs.readFileSync(formGroupFile, "utf8")))
writeJson("src/resources/public-access/public_register.json", JSON.parse(fs.readFileSync(policyFile, "utf8")))
writeJson("src/resources/functions/summarize_customer.json", JSON.parse(fs.readFileSync(functionFile, "utf8")))
writeJson("src/resources/settings/forms/customer.json", {
  code: "customer",
  runtimeWrite: {
    mode: "function_only",
  },
})

fs.writeFileSync(path.join(workspace, ".gitignore"), ".openxiangda/\n")
fs.writeFileSync(
  path.join(workspace, "package.json"),
  `${JSON.stringify({ name: "resource-cli-smoke", private: true }, null, 2)}\n`,
)
runGit(["init", "-q"])
runGit(["config", "user.name", "Resource CLI Smoke"])
runGit(["config", "user.email", "resource-cli-smoke@example.com"])
runGit(["branch", "-M", "main"])
runGit(["add", ".gitignore", "package.json"])
runGit(["commit", "-qm", "base mainline"])
runGit(["init", "--bare", "-q", origin])
runGit(["--git-dir", origin, "symbolic-ref", "HEAD", "refs/heads/main"])
runGit(["remote", "add", "origin", origin])
runGit(["push", "-qu", "origin", "main"])
sddLib.initSddWorkspace({ cwd: workspace })
sddLib.proposeSddChange({
  cwd: workspace,
  changeId: "resource-cli-smoke",
  summary: "Verify aborted Form Release automatic retry",
  affected: {
    resources: true,
    forms: ["customer"],
    files: ["src/resources/settings/forms/customer.json"],
  },
})
sddLib.approveSddChange({
  cwd: workspace,
  changeId: "resource-cli-smoke",
})
sddLib.proposeSddChange({
  cwd: workspace,
  changeId: "resource-auto-lease",
  summary: "Verify command-scoped publish lease cleanup",
  affected: {
    resources: true,
    files: [
      "src/resources/roles/auto_lease_role.json",
      "src/resources/menus/10-root.json",
      "src/resources/menus/20-customer.json",
      "src/resources/menus/30-create-child.json",
      "src/resources/menus/40-create-parent.json",
    ],
  },
})
sddLib.approveSddChange({
  cwd: workspace,
  changeId: "resource-auto-lease",
})
runGit(["add", "."])
runGit(["commit", "-qm", "resource cli release"])
runGit(["push", "-q", "origin", "main"])
const releaseCommit = runGit(["rev-parse", "HEAD"])
fs.mkdirSync(path.join(workspace, "node_modules"), { recursive: true })

fs.writeFileSync(
  path.join(workspace, ".openxiangda", "state.json"),
  `${JSON.stringify({
    version: 1,
    profiles: {
      [profileName]: {
        appType,
        resources: {
          forms: { customer: { formUuid: "FORM_CUSTOMER" } },
          menus: {
            root: { menuId: "MENU_ROOT" },
            customer_menu: { menuId: "MENU_CUSTOMER", formUuid: "FORM_CUSTOMER" },
          },
          roles: { manager: { roleId: "ROLE_MANAGER" } },
          pagePermissionGroups: { sales_pages: { groupId: "PAGE_GROUP" } },
          formPermissionGroups: { customer_view: { groupId: "FORM_GROUP", formUuid: "FORM_CUSTOMER" } },
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
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        resolve({})
      }
    })
  })

const respond = (response, data, code = 200) => {
  response.statusCode = code
  response.setHeader("content-type", "application/json")
  response.end(JSON.stringify(data))
}

const existingMenus = [
  {
    id: "MENU_ROOT",
    resourceCode: "root",
    name: "Root",
    type: "nav",
    parentId: null,
  },
  {
    id: "MENU_CUSTOMER",
    resourceCode: "customer_menu",
    name: "Customers",
    type: "receipt",
    formUuid: "FORM_CUSTOMER",
    parentId: "MENU_ROOT",
  },
]
const appApi = `/service/openxiangda-api/v1/apps/${appType}`

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1")
  const body = request.method === "GET" ? undefined : await readRequestJson(request)
  calls.push({ method: request.method, path: url.pathname, body })

  const api = appApi
  if (request.method === "GET" && url.pathname === `${api}/snapshot`) {
    return respond(response, {
      code: 200,
      data: {
        app: {
          appType,
          updatedAt: "2026-07-16T00:00:00.000Z",
          activeRuntimeReleaseId: "RUNTIME_BASE",
          activeRuntimeBuildId: "BUILD_BASE",
        },
      },
    })
  }
  if (request.method === "POST" && url.pathname === `${api}/change-baselines`) {
    if (!["resource-cli-smoke", "resource-auto-lease"].includes(body.changeId)) {
      throw new Error(`unexpected changeId ${body.changeId}`)
    }
    return respond(response, {
      code: 200,
      data: {
        baselineId: "BASELINE_RESOURCE_CLI",
        appType,
        changeId: body.changeId,
        clientSessionId: body.clientSessionId,
        sourceBase: body.sourceBase,
        headDigest: "a".repeat(64),
        resourceHeads: { Function: {}, Automation: {}, Runtime: {} },
        createdAt: "2026-07-16T00:00:00.000Z",
      },
    })
  }
  if (request.method === "POST" && url.pathname === `${api}/publish-lease/acquire`) {
    if (!["resource-cli-smoke", "resource-auto-lease"].includes(body.changeId)) {
      throw new Error(`unexpected lease changeId ${body.changeId}`)
    }
    return respond(response, {
      code: 200,
      data: {
        leaseId: "LEASE_RESOURCE_CLI",
        appType,
        changeId: body.changeId,
        clientSessionId: body.clientSessionId,
        baseRevision: body.baseRevision,
        expiresAt: "2099-07-15T08:00:00.000Z",
        holder: "self",
      },
    })
  }
  if (
    request.method === "POST" &&
    url.pathname === `${api}/publish-lease/LEASE_RESOURCE_CLI/release`
  ) {
    if (!["mainline-integrated", "direct-publish-completed", "prewrite-failed"].includes(body.completion)) {
      throw new Error(`unexpected lease completion ${body.completion}`)
    }
    assertField(body, "sourceCommit", releaseCommit)
    assertField(body, "mainBranch", "main")
    assertField(body, "mainTipCommit", releaseCommit)
    return respond(response, { code: 200, data: { active: false, appType } })
  }
  if (request.method === "GET" && url.pathname === `${api}/roles`) {
    return respond(response, {
      code: 200,
      data: {
        items: [
          {
            id: "ROLE_MANAGER",
            code: "manager",
            name: "Old Manager",
            description: "",
          },
        ],
        total: 1,
      },
    })
  }
  if (request.method === "GET" && [
    `${api}/routes/public.register`,
    `${api}/public-access/policies/public_register`,
    `${api}/auth/configs/default`,
    `${api}/functions/summarize_customer`,
    `${api}/connectors/third_party`,
  ].includes(url.pathname)) {
    return respond(response, { code: 404, message: "not found" }, 404)
  }
  if (request.method === "POST" && url.pathname === `${api}/routes`) {
    assertField(body, "pathPattern", "/view/:appType/public/register")
    return respond(response, { code: 200, data: { id: "ROUTE_1", code: body.code, pathPattern: body.pathPattern, publicAccess: body.publicAccess } })
  }
  if (request.method === "POST" && url.pathname === `${api}/public-access/policies`) {
    assertField(body.grants, "forms.0.code", "customer")
    assertField(body.grants, "forms.0.formUuid", "FORM_CUSTOMER")
    assertField(body.grants, "forms.0.actions.0", "upload")
    assertField(body.grants, "forms.0.fields.0", "applicationFiles")
    return respond(response, { code: 200, data: { id: "POLICY_1", code: body.code, mode: body.mode, routeCode: body.routeCode } })
  }
  if (request.method === "POST" && url.pathname === `${api}/public/session`) {
    return respond(response, { code: 200, data: { accessToken: "public-token", publicAccess: true } })
  }
  if (request.method === "POST" && url.pathname === `${api}/auth/configs`) {
    return respond(response, { code: 200, data: { id: "AUTH_1", code: body.code, status: body.status } })
  }
  if (request.method === "POST" && url.pathname === `${api}/functions`) {
    assertField(body, "definitionJson.runtimeInvoke.audience.type", "authenticated")
    return respond(response, { code: 200, data: { id: "FUNC_1", code: body.code, status: body.status } })
  }
  if (request.method === "POST" && url.pathname === `${api}/connectors/actions/sync`) {
    assertField(body.connectors?.[0], "apis.0.code", "ping")
    return respond(response, { code: 200, data: { data: [{ code: "third_party", connector: { id: "CONN_1" }, apis: [{ id: "API_1", code: "ping" }] }] } })
  }
  if (request.method === "POST" && url.pathname === `${api}/functions/summarize_customer/invoke`) {
    return respond(response, { code: 200, data: { ok: true } })
  }
  if (request.method === "POST" && url.pathname === `${api}/functions/legacy_summary/invoke`) {
    return respond(response, { code: 404, message: "not found" }, 404)
  }
  if (request.method === "POST" && url.pathname === `/service/${appType}/v1/functions/legacy_summary/invoke.json`) {
    return respond(response, { code: 200, data: { legacy: true } })
  }
  if (request.method === "POST" && url.pathname === `${api}/functions/denied/invoke`) {
    return respond(response, { code: "PUBLIC_GRANT_DENIED", message: "denied" })
  }
  if (request.method === "POST" && url.pathname === `/service/${appType}/v1/connectors/actions/invoke`) {
    assertField(body, "connector", "third_party")
    assertField(body, "api", "ping")
    return respond(response, { code: 200, data: { pong: true } })
  }
  if (request.method === "POST" && url.pathname === `${api}/notifications/templates/reservation_reminder`) {
    return respond(response, { code: 200, data: { id: "TPL_1", code: "reservation_reminder", level: "app" } })
  }
  if (request.method === "POST" && url.pathname === `${api}/notifications/type-configs/reservation_reminder`) {
    return respond(response, { code: 200, data: { id: "TYPE_1", notificationType: "reservation_reminder", level: "app" } })
  }
  if (request.method === "GET" && url.pathname === `${api}/notifications/type-configs`) {
    return respond(response, {
      code: 200,
      data: {
        items: [
          {
            id: "TYPE_1",
            notificationType: "reservation_reminder",
            level: "app",
            templateId: "TPL_1",
            template: { code: "reservation_reminder" },
          },
        ],
        total: 1,
      },
    })
  }
  if (request.method === "POST" && url.pathname === `${api}/notifications/templates/preview`) {
    assertField(body, "templateCode", "reservation_reminder")
    return respond(response, { code: 200, data: { rendered: "Hello" } })
  }
  if (request.method === "POST" && url.pathname === `${api}/notifications/preview`) {
    return respond(response, { code: 200, data: { rendered: "Hello" } })
  }
  if (request.method === "POST" && url.pathname === `${api}/data-views`) {
    assertField(body.definition, "base.formUuid", "FORM_CUSTOMER")
    return respond(response, { code: 200, data: { id: "DV_1", code: body.code, status: "active" } })
  }
  if (request.method === "GET" && url.pathname === `${api}/menus`) {
    return respond(response, { code: 200, data: existingMenus })
  }
  if (request.method === "POST" && url.pathname === `${api}/menus/MENU_CUSTOMER`) {
    assertField(body, "formUuid", "FORM_CUSTOMER")
    return respond(response, { code: 200, data: { id: "MENU_CUSTOMER", resourceCode: "customer_menu", formUuid: "FORM_CUSTOMER" } })
  }
  if (request.method === "POST" && url.pathname === `${api}/menus`) {
    const id =
      body.resourceCode === "staged_parent"
        ? "11111111-1111-4111-8111-111111111111"
        : body.resourceCode === "staged_child"
          ? "22222222-2222-4222-8222-222222222222"
          : null
    if (!id) throw new Error(`unexpected menu create ${body.resourceCode}`)
    if (
      body.resourceCode === "staged_child" &&
      body.parentId !== "11111111-1111-4111-8111-111111111111"
    ) {
      throw new Error(
        `child parentId must use created parent UUID, got ${body.parentId}`,
      )
    }
    const item = { id, ...body }
    existingMenus.push(item)
    return respond(response, { code: 200, data: item })
  }
  if (request.method === "POST" && url.pathname === `${api}/roles/ROLE_MANAGER`) {
    return respond(response, { code: 200, data: { id: "ROLE_MANAGER", code: body.code, name: body.name } })
  }
  if (request.method === "POST" && url.pathname === `${api}/roles`) {
    return respond(response, {
      code: 200,
      data: { id: "ROLE_AUTO_LEASE", code: body.code, name: body.name },
    })
  }
  if (request.method === "POST" && url.pathname === `${api}/page-permission-groups/PAGE_GROUP`) {
    assertField(body, "menuFormUuids.0", "FORM_CUSTOMER")
    return respond(response, { code: 200, data: { id: "PAGE_GROUP", resourceCode: "sales_pages", name: body.name } })
  }
  if (request.method === "POST" && url.pathname === `${api}/forms/FORM_CUSTOMER/permission-groups/FORM_GROUP`) {
    return respond(response, { code: 200, data: { id: "FORM_GROUP", resourceCode: "customer_view", formUuid: "FORM_CUSTOMER", name: body.name } })
  }
  if (request.method === "GET" && url.pathname === `${api}/forms/FORM_CUSTOMER/snapshot`) {
    return respond(response, {
      code: 200,
      data: {
        revision: 1,
        etag: '"form-FORM_CUSTOMER-r1"',
        activeFormReleaseHead: {
          releaseId: null,
          releaseHash: null,
          revision: 1,
        },
        snapshot: {
          form: { settingsJson: {} },
          resources: {
            fieldIndexes: [],
            dataManagement: null,
            publicAccess: null,
            bundle: null,
          },
        },
      },
    })
  }
  if (
    request.method === "GET" &&
    url.pathname === `${api}/forms/FORM_CUSTOMER/releases/RELEASE_ABORTED`
  ) {
    return respond(response, {
      code: 200,
      data: {
        id: "RELEASE_ABORTED",
        aborted: true,
        journal: [{ action: "abort" }],
      },
    })
  }
  if (request.method === "POST" && url.pathname === `${api}/forms/FORM_CUSTOMER/bundle`) {
    return respond(response, {
      code: 200,
      data: {
        staged: true,
        active: false,
        releaseStatus: "staged",
        release: {
          id: "RELEASE_RETRY",
          contentHash: "b".repeat(64),
          parentReleaseId: null,
          baseRevision: 1,
          logicalArtifactId: body.artifactId,
          attempt: 2,
        },
      },
    })
  }
  if (request.method === "POST" && url.pathname === `${api}/forms/FORM_CUSTOMER/settings`) {
    assertField(body, "settings.runtimeWrite.mode", "function_only")
    return respond(response, {
      code: 200,
      data: {
        revision: 2,
        etag: '"form-FORM_CUSTOMER-r2"',
        activeFormReleaseHead: {
          releaseId: "RELEASE_SETTINGS",
          releaseHash: "a".repeat(64),
          revision: 2,
        },
      },
    })
  }
  respond(response, { code: 404, message: `not found ${request.method} ${url.pathname}` }, 404)
})

function assertField(source, dottedPath, expected) {
  const actual = dottedPath.split(".").reduce((value, key) => value?.[key], source)
  if (actual !== expected) {
    throw new Error(`expected ${dottedPath}=${expected}, got ${actual}`)
  }
}

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

const runOpenXiangda = (args, expectSuccess = true) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(repoRoot, "bin", "openxiangda.js"), ...args], {
      cwd: workspace,
      env: {
        ...process.env,
        HOME: tempHome,
        CODEX_THREAD_ID: "resource-cli-smoke",
      },
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", chunk => { stdout += chunk })
    child.stderr.on("data", chunk => { stderr += chunk })
    child.on("error", reject)
    child.on("close", code => {
      if (expectSuccess && code !== 0) return reject(new Error(stderr || stdout || `${args.join(" ")} failed`))
      if (!expectSuccess && code === 0) return reject(new Error(`${args.join(" ")} unexpectedly succeeded`))
      resolve({ code, stdout, stderr })
    })
  })

const runJson = async args => JSON.parse((await runOpenXiangda([...args, "--json"])).stdout)

const begun = await runJson([
  "release",
  "begin",
  "--change",
  "resource-cli-smoke",
  "--profile",
  profileName,
])
if (begun.releaseSourceRevision?.baseCommit !== releaseCommit) {
  throw new Error("release begin must freeze the exact resource fixture commit")
}

const stagedResourcesFile = path.join(
  workspace,
  ".openxiangda",
  "releases",
  "resource-cli-smoke",
  "staged-resources.json",
)
writeJson(path.relative(workspace, stagedResourcesFile), [
  {
    kind: "FormRelease",
    identity: {
      releaseId: "RELEASE_ABORTED",
      formUuid: "FORM_CUSTOMER",
    },
    action: "update",
    hash: "a".repeat(64),
    metadata: { formCode: "customer", releaseStatus: "staged" },
  },
])
const recoveredFormRelease = await runJson([
  "resource",
  "publish",
  "form-settings",
  "--only",
  "customer",
  "--change",
  "resource-cli-smoke",
  "--profile",
  profileName,
  "--adopt-online-baseline",
  "--adoption-reason",
  "exercise aborted staged Form Release recovery",
  "--sdd-bypass",
  "--reason",
  "aborted Form Release automatic retry smoke",
])
if (
  recoveredFormRelease.recoveredStagedFormReleases?.[0]
    ?.discardedReleaseId !== "RELEASE_ABORTED"
) {
  throw new Error("resource publish must discard an aborted staged Form Release")
}
const recoveredIndex = JSON.parse(fs.readFileSync(stagedResourcesFile, "utf8"))
if (
  recoveredIndex.length !== 1 ||
  recoveredIndex[0]?.identity?.releaseId !== "RELEASE_RETRY"
) {
  throw new Error("resource publish must replace the aborted staged index with a new attempt")
}

await runJson(["route", "upsert", "--json-file", routeFile])
await runJson(["public-access", "upsert", "--json-file", policyFile])
const grantCheck = await runJson([
  "public-access",
  "grant-check",
  "public_register",
  "--json-file",
  policyFile,
  "--form-code",
  "customer",
  "--form-action",
  "upload",
  "--field-id",
  "applicationFiles",
])
if (!grantCheck.allowed) throw new Error("grant-check should allow declared form grant")
await runJson(["public-access", "session-test", "public_register", "--path", "/view/APP_RESOURCE_CLI/public/register"])
const authMethods = await runJson(["auth-config", "methods"])
for (const type of ["password", "dingtalk", "phone_code", "sso", "guest"]) {
  if (!authMethods.methods.some(method => method.type === type)) {
    throw new Error(`auth-config methods should include ${type}`)
  }
}
const dingtalkMethod = authMethods.methods.find(method => method.type === "dingtalk")
if (
  dingtalkMethod.defaultFlow !== "auto" ||
  !["auto", "jsapi", "oauth"].every(flow =>
    dingtalkMethod.supportedFlows.includes(flow),
  )
) {
  throw new Error("auth-config methods should describe DingTalk auto/jsapi/oauth flows")
}
await runJson(["auth-config", "upsert", "--json-file", authFile])
await runJson(["function", "upsert", "--json-file", functionFile])
const validFunctionResources = await runJson(["resource", "validate", "function"])
if (!validFunctionResources.valid) {
  throw new Error(`function resource validate failed: ${validFunctionResources.errors.join("; ")}`)
}
const invalidFunctionFile = writeJson("src/resources/functions/invalid_magic.json", {
  code: "invalid_magic",
  name: "Invalid Magic",
  definitionJson: {
    kind: "app_function",
    runtimeMode: "trusted_node",
    sourceType: "inline",
    runtimeInvoke: {
      roleCodes: ["*"],
    },
    code: "module.exports = async () => ({ ok: true })",
  },
})
const invalidFunctionResources = JSON.parse(
  (await runOpenXiangda(["resource", "validate", "function", "--json"])).stdout,
)
if (
  invalidFunctionResources.valid ||
  !invalidFunctionResources.errors.some(error => error.includes("不支持魔法值"))
) {
  throw new Error("function resource validate should reject magic roleCodes")
}
fs.rmSync(invalidFunctionFile)
const invalidPerformanceFile = writeJson("src/resources/functions/invalid_performance.json", {
  code: "invalid_performance",
  name: "Invalid Performance Policy",
  definitionJson: {
    runtimeMode: "trusted_node",
    sourceType: "inline",
    responseCache: {
      enabled: true,
      ttlSeconds: 0,
      actions: [],
      scope: "guest",
    },
    invocationAudit: {
      successOutput: "everything",
      maxLogBytes: 100,
    },
    code: "module.exports = async () => ({ ok: true })",
  },
})
const invalidPerformanceResources = JSON.parse(
  (await runOpenXiangda(["resource", "validate", "function", "--json"])).stdout,
)
if (
  invalidPerformanceResources.valid ||
  !invalidPerformanceResources.errors.some(error => error.includes("responseCache.ttlSeconds")) ||
  !invalidPerformanceResources.errors.some(error => error.includes("invocationAudit.successOutput"))
) {
  throw new Error("function resource validate should reject invalid performance policies")
}
fs.rmSync(invalidPerformanceFile)
const formSettingsValidation = await runJson(["resource", "validate", "form-settings"])
if (!formSettingsValidation.valid) {
  throw new Error(`form settings validate failed: ${formSettingsValidation.errors.join("; ")}`)
}
await runJson([
  "settings",
  "save",
  "customer",
  "--settings-json",
  path.join(workspace, "src", "resources", "settings", "forms", "customer.json"),
])
await runJson(["connector", "upsert", "--json-file", connectorFile])
await runJson(["function", "invoke", "summarize_customer", "--body-json", "{}"])
await runJson(["function", "invoke", "legacy_summary", "--body-json", "{}"])
const denied = await runOpenXiangda(["function", "invoke", "denied", "--body-json", "{}", "--json"], false)
if (!denied.stderr.includes("denied") && !denied.stdout.includes("denied")) {
  throw new Error("function invoke should fail on string envelope code")
}
await runJson(["connector", "invoke", "third_party.ping", "--body-json", "{\"query\":{\"ok\":true}}"])
await runJson(["notification", "template-upsert", "--json-file", notificationFile])
await runJson(["notification", "type-upsert", "--json-file", notificationFile])
await runJson(["notification", "preview", "reservation_reminder", "--body-json", "{\"variables\":{\"title\":\"Hello\"}}"])
await runJson(["data-view", "create", "--json-file", dataViewFile])
await runJson(["menu", "update", "customer_menu", "--json-file", menuFile])
await runJson(["permission", "role-update", "manager", "--json-file", roleFile])
await runJson(["permission", "page-group-update", "sales_pages", "--json-file", pageGroupFile])
await runJson(["permission", "form-group-update", "customer_view", "--json-file", formGroupFile])
const audit = await runJson(["permission", "audit"])
if (audit.errors.length > 0) throw new Error(`permission audit failed: ${audit.errors.join("; ")}`)

for (const expected of [
  ["POST", `/service/openxiangda-api/v1/apps/${appType}/routes`],
  ["POST", `/service/openxiangda-api/v1/apps/${appType}/public/session`],
  ["POST", `/service/openxiangda-api/v1/apps/${appType}/forms/FORM_CUSTOMER/settings`],
  ["POST", `/service/${appType}/v1/connectors/actions/invoke`],
  ["POST", `/service/openxiangda-api/v1/apps/${appType}/menus/MENU_CUSTOMER`],
]) {
  if (!calls.some(call => call.method === expected[0] && call.path === expected[1])) {
    throw new Error(`missing call ${expected.join(" ")}`)
  }
}

runGit(["push", "-q", "origin", `${releaseCommit}:refs/heads/main`])
if (runGit(["--git-dir", origin, "rev-parse", "refs/heads/main"]) !== releaseCommit) {
  throw new Error("release commit was not preserved exactly on origin/main")
}
const ended = await runJson(["release", "end", "--profile", profileName])
if (ended.integration?.sourceCommit !== releaseCommit) {
  throw new Error("release end must verify the exact frozen commit on origin/main")
}

const directRolePublish = await runJson([
  "resource",
  "publish",
  "role",
  "--only",
  "auto_lease_role",
  "--change",
  "resource-auto-lease",
  "--profile",
  profileName,
  "--sdd-bypass",
  "--reason",
  "command scoped lease lifecycle smoke",
])
if (directRolePublish.publishLeaseLifecycle?.released !== true) {
  throw new Error("standalone direct resource publish must release its auto-acquired lease")
}
const stateAfterDirectPublish = JSON.parse(
  fs.readFileSync(path.join(workspace, ".openxiangda", "state.json"), "utf8"),
)
if (stateAfterDirectPublish.profiles[profileName].promotion?.publishLease) {
  throw new Error("direct resource publish must clear the local publish lease")
}
if (stateAfterDirectPublish.profiles[profileName].promotion?.changeBaseline) {
  throw new Error("direct resource publish must clear the local change baseline")
}
if (fs.existsSync(path.join(workspace, ".openxiangda", "worktree-owner.json"))) {
  throw new Error("direct resource publish must release worktree ownership")
}

const cleanState = JSON.parse(
  fs.readFileSync(path.join(workspace, ".openxiangda", "state.json"), "utf8"),
)
cleanState.profiles[profileName].resources.menus = {}
fs.writeFileSync(
  path.join(workspace, ".openxiangda", "state.json"),
  `${JSON.stringify(cleanState, null, 2)}\n`,
)
const menuPostCountBeforeRecovery = calls.filter(
  call => call.method === "POST" && call.path.includes(`${appApi}/menus`),
).length
const recoveredNoopMenus = await runJson([
  "resource",
  "publish",
  "menu",
  "--only",
  "root,customer_menu",
  "--change",
  "resource-auto-lease",
  "--profile",
  profileName,
  "--sdd-bypass",
  "--reason",
  "recover clean menu bindings from online noops",
])
if (
  recoveredNoopMenus.published.some(
    item => item.kind === "menu" && item.action !== "noop",
  )
) {
  throw new Error("matching online menus must remain noop with clean local state")
}
const menuPostCountAfterRecovery = calls.filter(
  call => call.method === "POST" && call.path.includes(`${appApi}/menus`),
).length
if (menuPostCountAfterRecovery !== menuPostCountBeforeRecovery) {
  throw new Error("noop menu binding recovery must not issue remote menu writes")
}
const recoveredMenuState = JSON.parse(
  fs.readFileSync(path.join(workspace, ".openxiangda", "state.json"), "utf8"),
).profiles[profileName].resources.menus
if (
  recoveredMenuState.root?.menuId !== "MENU_ROOT" ||
  recoveredMenuState.customer_menu?.menuId !== "MENU_CUSTOMER"
) {
  throw new Error("noop menu recovery must hydrate online menu IDs into clean state")
}

const createCallsStart = calls.length
await runJson([
  "resource",
  "publish",
  "menu",
  "--only",
  "staged_child,staged_parent",
  "--change",
  "resource-auto-lease",
  "--profile",
  profileName,
  "--sdd-bypass",
  "--reason",
  "verify parent before child menu writes",
])
const createdMenuCodes = calls
  .slice(createCallsStart)
  .filter(call => call.method === "POST" && call.path === `${appApi}/menus`)
  .map(call => call.body.resourceCode)
if (createdMenuCodes.join(",") !== "staged_parent,staged_child") {
  throw new Error(
    `menu publish must topologically create parent before child: ${createdMenuCodes.join(",")}`,
  )
}

const menuWritesBeforeInvalidPlans = calls.filter(
  call => call.method === "POST" && call.path.includes(`${appApi}/menus`),
).length
writeJson("src/resources/menus/90-orphan.json", {
  code: "orphan_child",
  name: "Orphan Child",
  parentCode: "missing_parent",
})
const orphanPlan = await runOpenXiangda([
  "resource",
  "plan",
  "menu",
  "--only",
  "orphan_child",
  "--profile",
  profileName,
  "--json",
], false)
if (!`${orphanPlan.stdout}\n${orphanPlan.stderr}`.includes("MENU_PARENT_UNRESOLVED")) {
  throw new Error("missing menu parent must fail closed during read-only plan")
}
writeJson("src/resources/menus/91-cycle-a.json", {
  code: "cycle_a",
  name: "Cycle A",
  parentCode: "cycle_b",
})
writeJson("src/resources/menus/92-cycle-b.json", {
  code: "cycle_b",
  name: "Cycle B",
  parentCode: "cycle_a",
})
const cyclePlan = await runOpenXiangda([
  "resource",
  "plan",
  "menu",
  "--only",
  "cycle_a,cycle_b",
  "--profile",
  profileName,
  "--json",
], false)
if (!`${cyclePlan.stdout}\n${cyclePlan.stderr}`.includes("MENU_PARENT_CYCLE")) {
  throw new Error("cyclic menu parents must fail closed during read-only plan")
}
const menuWritesAfterInvalidPlans = calls.filter(
  call => call.method === "POST" && call.path.includes(`${appApi}/menus`),
).length
if (menuWritesAfterInvalidPlans !== menuWritesBeforeInvalidPlans) {
  throw new Error("invalid menu graph preflight must not issue remote menu writes")
}
const leaseReleases = calls.filter(
  call =>
    call.method === "POST" &&
    call.path ===
      `/service/openxiangda-api/v1/apps/${appType}/publish-lease/LEASE_RESOURCE_CLI/release`,
)
if (leaseReleases.length !== 4) {
  throw new Error(`expected explicit and command-scoped lease release, got ${leaseReleases.length}`)
}

server.close()
console.log("resource cli smoke passed")
