import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const cli = path.join(repoRoot, "bin", "openxiangda.js")

const runJson = (args, options = {}) => {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: options.cwd || repoRoot,
    env: options.env || process.env,
    encoding: "utf8",
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${args.join(" ")} failed`)
  }
  return JSON.parse(result.stdout)
}

const runText = (args, options = {}) => {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: options.cwd || repoRoot,
    env: options.env || process.env,
    encoding: "utf8",
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${args.join(" ")} failed`)
  }
  return result.stdout
}

const version = runJson(["version", "--json"])
if (version.name !== "openxiangda" || !version.version) {
  throw new Error("version --json should expose the CLI version")
}
if (!runText(["--version"]).trim().match(/^\d+\.\d+\.\d+/)) {
  throw new Error("--version should print a semver")
}

const designHelp = runText(["design", "gates", "--help"])
if (!designHelp.includes("connector -> connector-notification") || !designHelp.includes("public-access")) {
  throw new Error("design help should list topic aliases")
}

const gates = runJson(["design", "gates", "--topic", "public-access", "--json"])
if (!gates.hardRule.includes("只规划、不实现")) {
  throw new Error("design gates should expose the plan-gate hard rule")
}
const publicAccess = gates.topics.find(item => item.code === "public-access")
if (!publicAccess) throw new Error("public-access gate is missing")
if (!publicAccess.mustAsk.some(item => item.includes("grant"))) {
  throw new Error("public-access gate should ask about grants")
}
if (!publicAccess.recommendedDefaults.some(item => item.includes("/view/:appType/public/*"))) {
  throw new Error("public-access gate should recommend the new public route mode")
}
if (!publicAccess.recommendedDefaults.some(item => item.includes("PublicAccessGate"))) {
  throw new Error("public-access gate should mention PublicAccessGate")
}
if (!publicAccess.antiPatterns.some(item => item.includes("?publicAccess=guest"))) {
  throw new Error("public-access gate should forbid the legacy public query link")
}

const publicAccessExplain = runJson(["resource", "explain", "public-access", "--json"])
const storageGrants = publicAccessExplain.minimalManifest?.grants?.storage || []
if (!Array.isArray(storageGrants) || storageGrants.length === 0) {
  throw new Error("public-access resource explain should include storage grants")
}
if (!storageGrants.some(item => item.bucketName === "images" && item.actions?.includes("upload"))) {
  throw new Error("public-access resource explain should show image upload storage grant")
}
if (!storageGrants.some(item => item.bucketName === "attachments" && item.actions?.includes("download"))) {
  throw new Error("public-access resource explain should show attachment storage grant")
}

const connectorAliases = runJson(["design", "gates", "--topic", "connector,notification,integration", "--json"])
if (
  connectorAliases.topics.length !== 1 ||
  connectorAliases.topics[0].code !== "connector-notification" ||
  connectorAliases.unknownTopics.length > 0
) {
  throw new Error("connector/notification/integration aliases should resolve to connector-notification")
}

const permissionGates = runJson(["design", "gates", "--topic", "permissions", "--json"])
const permissions = permissionGates.topics.find(item => item.code === "permissions")
if (!permissions) throw new Error("permissions gate is missing")
const permissionsText = [
  ...permissions.mustAsk,
  ...permissions.recommendedDefaults,
  ...permissions.antiPatterns,
  ...permissions.acceptance,
].join("\n")
for (const pattern of [
  "managed-platform-account",
  "existing-platform-user-assignment",
  "static-role-permission",
  "query-param-context",
  "app:role:manage",
  "apiPermissionCodes",
]) {
  if (!permissionsText.includes(pattern)) {
    throw new Error(`permissions gate should include pattern ${pattern}`)
  }
}
if (!permissionsText.includes("app:page-permission-group:manage")) {
  throw new Error("permissions gate should include page permission group management permission")
}
if (!permissionsText.includes("app:form-permission-group:manage")) {
  throw new Error("permissions gate should include form permission group management permission")
}
if (!permissions.antiPatterns.some(item => item.includes("查询参数不能作为敏感授权依据"))) {
  throw new Error("permissions gate should forbid query params as sensitive authorization")
}
if (!permissions.antiPatterns.some(item => item.includes("不能只做前端权限隐藏"))) {
  throw new Error("permissions gate should forbid frontend-only permission hiding")
}
const permissionAliases = runJson(["design", "gates", "--topic", "role-governance,account-permission,organization-account,rbac", "--json"])
if (
  permissionAliases.topics.length !== 1 ||
  permissionAliases.topics[0].code !== "permissions" ||
  permissionAliases.unknownTopics.length > 0
) {
  throw new Error("permission aliases should resolve to permissions")
}

const slashTopics = runJson(["design", "gates", "--topic", "new-app/public-access", "--json"])
if (!slashTopics.topics.some(item => item.code === "new-app") || !slashTopics.topics.some(item => item.code === "public-access")) {
  throw new Error("slash-separated design topics should resolve")
}

const template = runJson(["design", "template", "--topic", "auth,public-access", "--json"])
if (!template.content.includes("用户确认后再进入实现")) {
  throw new Error("design template should require explicit user confirmation")
}

const commandsManifest = runJson(["commands", "--json"])
const commands = commandsManifest.commands.join("\n")
for (const command of [
  "version [--json]",
  "doctor",
  "design gates|template|review",
  "sdd init|migrate|propose|quick|bundle|approve|status|context|verify|sync|archive",
  "route list|get|create|update|upsert|delete",
  "public-access list|get|create|update|upsert|delete|ticket-create|session-test|grant-check",
  "auth-config list|get|create|update|upsert|delete|methods",
  "function list|get|create|update|upsert|delete|invoke",
  "connector list|get|create|update|upsert|delete|invoke|download-test",
  "notification template-list|template-get|template-upsert|template-delete|type-list|type-get|type-upsert|type-delete|preview|send|batch-send",
  "runtime deploy|releases|activate",
]) {
  if (!commands.includes(command)) {
    throw new Error(`commands --json missing ${command}`)
  }
}
if (!commandsManifest.resourceNotes.some(item => item.includes("public-access is the new React SPA public policy resource") && item.includes("PublicAccessGate"))) {
  throw new Error("commands --json should distinguish new public-access resources")
}
if (!commandsManifest.resourceNotes.some(item => item.includes("settings public-access is legacy"))) {
  throw new Error("commands --json should explain legacy settings public-access")
}
if (
  !commandsManifest.resourceNotes.some(
    item => item.includes("only starts from a clean local main/master") && item.includes("without a post-release merge"),
  )
) {
  throw new Error("commands --json should describe publish-from-main without a post-release merge")
}
if (!commandsManifest.designTopics.aliases.notification || commandsManifest.designTopics.aliases.notification !== "connector-notification") {
  throw new Error("commands --json should expose design topic aliases")
}
if (commandsManifest.designTopics.aliases["role-governance"] !== "permissions") {
  throw new Error("commands --json should expose role-governance permissions alias")
}
if (commandsManifest.designTopics.aliases["account-permission"] !== "permissions") {
  throw new Error("commands --json should expose account-permission permissions alias")
}

const explain = runJson(["resource", "explain", "public-access", "--json"])
if (!explain.dir.includes("src/resources/public-access")) {
  throw new Error("resource explain should expose public-access manifest directory")
}
if (!explain.commands.some(item => item.includes("PublicAccessGate"))) {
  throw new Error("resource explain public-access should mention PublicAccessGate")
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openxiangda-design-smoke-"))
try {
  const tempHomeForMissing = path.join(tempRoot, "missing-home")
  fs.mkdirSync(tempHomeForMissing, { recursive: true })
  const missingResources = runJson(["resource", "validate", "--json"], {
    cwd: tempRoot,
    env: { ...process.env, HOME: tempHomeForMissing, CODEX_HOME: path.join(tempRoot, "missing-codex") },
  })
  if (!missingResources.valid || !missingResources.warnings.some(item => item.includes("未发现 src/resources"))) {
    throw new Error("resource validate should warn when src/resources is missing")
  }
  const missingReview = runJson(["design", "review", "--json"], { cwd: tempRoot })
  if (!missingReview.warnings.some(item => item.message.includes("未发现 src/resources"))) {
    throw new Error("design review should warn when src/resources is missing")
  }

  const tempHome = path.join(tempRoot, "home")
  const tempCodexHome = path.join(tempRoot, "codex")
  const workspace = path.join(tempRoot, "workspace")
  fs.mkdirSync(path.join(tempHome, ".openxiangda"), { recursive: true })
  fs.mkdirSync(path.join(workspace, ".openxiangda"), { recursive: true })
  fs.mkdirSync(path.join(workspace, "src", "resources", "routes"), { recursive: true })
  fs.mkdirSync(path.join(workspace, "src", "pages", "public-register"), { recursive: true })
  fs.writeFileSync(
    path.join(workspace, "src", "resources", "routes", "public.register.json"),
    `${JSON.stringify({
      code: "public.register",
      pathPattern: "/view/:appType/public/register",
      publicAccess: "guest",
      publicPolicyCode: "missing_policy",
    }, null, 2)}\n`,
  )
  fs.writeFileSync(
    path.join(workspace, "src", "pages", "public-register", "index.tsx"),
    "export const legacy = '?publicAccess=guest'\n",
  )
  const designReview = runJson(["design", "review", "--json"], { cwd: workspace })
  if (!designReview.errors.some(item => item.code === "public-route-missing-policy")) {
    throw new Error("design review should catch public routes without policies")
  }
  if (!designReview.errors.some(item => item.code === "legacy-public-runtime-pattern")) {
    throw new Error("design review should catch legacy public runtime patterns")
  }
  fs.writeFileSync(
    path.join(workspace, ".openxiangda", "profiles.json"),
    `${JSON.stringify({
      version: 1,
      currentProfile: "zju",
      profiles: {
        zju: { name: "zju", baseUrl: "https://zju.example.test/service", token: null },
        example: { name: "example", baseUrl: "https://example.example.test/service", token: null },
      },
    }, null, 2)}\n`,
  )
  fs.writeFileSync(
    path.join(workspace, ".openxiangda", "state.json"),
    `${JSON.stringify({
      version: 1,
      profiles: {
        example: { appType: "APP_WISEJOB", resources: {} },
      },
    }, null, 2)}\n`,
  )
  const doctor = runJson(["doctor", "--json"], {
    cwd: workspace,
    env: {
      ...process.env,
      HOME: tempHome,
      CODEX_HOME: tempCodexHome,
    },
  })
  if (doctor.profile.requested !== "example" || doctor.workspace.profile !== "example") {
    throw new Error("doctor should prefer the workspace-bound profile over a global currentProfile")
  }
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true })
}

console.log("design gates smoke passed")
