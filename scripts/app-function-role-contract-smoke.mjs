import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const contractPath = path.join(
  repoRoot,
  "packages/sdk/src/runtime/core/.app-function-role-contract-smoke.ts",
)

const contractSource = `
import type {
  AppFunctionContextV2,
  AppFunctionRoleBatchAddResult,
  PageOffsetListResult,
  PageRoleRecord,
  PageUserRecord,
} from "./types"

declare const ctx: AppFunctionContextV2

async function verifyContract() {
  const roles: PageOffsetListResult<PageRoleRecord> =
    await ctx.platform.roles.list({ code: "manager", pageSize: 20 })
  const role = await ctx.platform.roles.findByCode("manager")
  if (!role) return roles
  const detail: PageRoleRecord | null = await ctx.platform.roles.get(role.id)
  const users: PageOffsetListResult<PageUserRecord> =
    await ctx.platform.roles.listUsers(role.id, { keyword: "alice" })
  const added: AppFunctionRoleBatchAddResult =
    await ctx.platform.roles.addUsers(role.id, ["user-1", "user-2"])
  const removed: boolean =
    await ctx.platform.roles.removeUser(role.id, "user-3")

  // @ts-expect-error appType is fixed to ctx.app.appType by the runtime
  await ctx.platform.roles.list({ appType: "APP_OTHER" })

  return { roles, detail, users, added, removed }
}

void verifyContract()
`

try {
  fs.writeFileSync(contractPath, contractSource, "utf8")
  const program = ts.createProgram([contractPath], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  })
  const diagnostics = ts.getPreEmitDiagnostics(program)
  assert.equal(
    diagnostics.length,
    0,
    diagnostics
      .map(item => ts.flattenDiagnosticMessageText(item.messageText, "\n"))
      .join("\n"),
  )
  console.log("App Function role SDK contract smoke passed")
} finally {
  fs.rmSync(contractPath, { force: true })
}
