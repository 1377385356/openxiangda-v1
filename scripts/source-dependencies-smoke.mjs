import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openxiangda-source-deps-"))
const workspace = path.join(tempRoot, "workspace")
const home = path.join(tempRoot, "home")
const profile = "dev"
const appType = "APP_SOURCE_DEP_SMOKE"

const write = (relative, content) => {
  const file = path.join(workspace, relative)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: workspace,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      CODEX_THREAD_ID: "source-dependencies-smoke",
      ...options.env,
    },
  })
  if (result.status !== 0 && options.allowFailure !== true) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status})\n${result.stdout}\n${result.stderr}`,
    )
  }
  return result
}

const runOpenXiangdaJson = args => {
  const result = run(process.execPath, [path.join(repoRoot, "bin", "openxiangda.js"), ...args])
  return JSON.parse(result.stdout)
}

const functionManifest = includeBinding => ({
  functions: [
    {
      code: "alpha",
      name: "Alpha",
      resources: { forms: includeBinding ? ["hgy_test_project"] : [] },
      definitionJson: {
        runtimeMode: "trusted_node",
        sourceFile: { localPath: "src/functions/alpha/index.ts" },
      },
    },
    {
      code: "beta",
      name: "Beta",
      resources: { forms: [] },
      definitionJson: {
        runtimeMode: "trusted_node",
        sourceFile: { localPath: "src/functions/beta/index.ts" },
      },
    },
    {
      code: "unrelated",
      name: "Unrelated",
      resources: { forms: [] },
      definitionJson: {
        runtimeMode: "trusted_node",
        sourceFile: { localPath: "src/functions/unrelated/index.ts" },
      },
    },
  ],
})

try {
  write(
    "app-workspace.config.ts",
    `export default { runtimeMode: "react-spa", governance: { sdd: { enabled: false } } }\n`,
  )
  write("package.json", `${JSON.stringify({ private: true }, null, 2)}\n`)
  write(
    ".openxiangda/state.json",
    `${JSON.stringify({ version: 1, profiles: { [profile]: { appType, resources: {} } } }, null, 2)}\n`,
  )
  write(
    "src/functions/_shared/value.ts",
    `export const sharedValue = "shared"\n`,
  )
  write(
    "src/functions/alpha/index.ts",
    `import { sharedValue } from "../_shared/value"\n` +
      `declare function queryAdvancedFormPage(...args: any[]): Promise<any>\n` +
      `export default async function alpha(ctx: any) {\n` +
      `  const rows = await ctx.form.queryMany({ formCode: "hgy_test_project" })\n` +
      `  await queryAdvancedFormPage(ctx, "hgy_test_project", {\n` +
      `    currentPage: 1,\n` +
      `    filters: { logic: "AND", rules: [\n` +
      `      { key: "projectName", operator: "CONTAINS", value: "x" },\n` +
      `      { key: "testRunId", operator: "IS_NULL" },\n` +
      `    ] },\n` +
      `    order: [{ id: "modifiedTime", isAsc: "n" }],\n` +
      `    pageSize: 10,\n` +
      `  })\n` +
      `  return { rows, sharedValue }\n` +
      `}\n`,
  )
  write(
    "src/functions/beta/index.ts",
    `import { sharedValue } from "../_shared/value"\n` +
      `export default async function beta() { return sharedValue }\n`,
  )
  write(
    "src/functions/unrelated/index.ts",
    `export default async function unrelated() { return "unrelated" }\n`,
  )
  write(
    "src/automations/shared_automation/index.ts",
    `import { sharedValue } from "../../functions/_shared/value"\n` +
      `export default async function sharedAutomation() { return sharedValue }\n`,
  )
  write(
    "src/resources/automations/shared_automation.json",
    `${JSON.stringify(
      {
        code: "shared_automation",
        name: "Shared Automation",
        triggerConfig: { mode: "scheduled", enabled: false },
        resources: { forms: [] },
        definitionJson: {
          runtimeMode: "trusted_node",
          sourceFile: { localPath: "src/automations/shared_automation/index.ts" },
        },
      },
      null,
      2,
    )}\n`,
  )
  write(
    "src/resources/functions/functions.json",
    `${JSON.stringify(functionManifest(false), null, 2)}\n`,
  )

  fs.mkdirSync(path.join(home, ".openxiangda"), { recursive: true })
  fs.writeFileSync(
    path.join(home, ".openxiangda", "profiles.json"),
    `${JSON.stringify(
      {
        version: 1,
        currentProfile: profile,
        profiles: {
          [profile]: {
            name: profile,
            baseUrl: "http://127.0.0.1:1/service",
            token: { accessToken: "smoke-token" },
          },
        },
      },
      null,
      2,
    )}\n`,
  )

  const invalid = runOpenXiangdaJson([
    "resource",
    "validate",
    "function",
    "--profile",
    profile,
    "--json",
  ])
  assert.equal(invalid.valid, true, invalid.errors.join(" | "))
  assert.ok(
    invalid.warnings.some(
      message =>
        message.includes("function alpha") &&
        message.includes("forms.hgy_test_project") &&
        message.includes("hgy_test_project"),
    ),
    `undeclared application resource should remain observable: ${invalid.warnings.join(" | ")}`,
  )

  write(
    "src/resources/functions/functions.json",
    `${JSON.stringify(functionManifest(true), null, 2)}\n`,
  )
  const valid = runOpenXiangdaJson([
    "resource",
    "validate",
    "function",
    "--profile",
    profile,
    "--json",
  ])
  assert.equal(valid.valid, true, valid.errors.join(" | "))
  const alphaAnalysis = valid.sourceDependencies.find(item => item.code === "alpha")
  assert.ok(alphaAnalysis)
  assert.ok(alphaAnalysis.sourceDependencies.includes("src/functions/alpha/index.ts"))
  assert.ok(alphaAnalysis.sourceDependencies.includes("src/functions/_shared/value.ts"))
  assert.deepEqual(alphaAnalysis.resourceReferences.forms, ["hgy_test_project"])
  assert.deepEqual(
    alphaAnalysis.formFieldReferences.map(item => item.field).sort(),
    ["modifiedTime", "projectName", "testRunId"],
  )

  run("git", ["init", "-q"])
  run("git", ["config", "user.name", "OpenXiangda Smoke"])
  run("git", ["config", "user.email", "openxiangda-smoke@example.invalid"])
  run("git", ["add", "."])
  run("git", ["commit", "-qm", "baseline"])
  fs.appendFileSync(path.join(workspace, "src/functions/_shared/value.ts"), `export const changed = true\n`)

  const plan = runOpenXiangdaJson([
    "workspace",
    "plan",
    "--changed",
    "--profile",
    profile,
    "--json",
  ])
  assert.deepEqual(plan.targets.functions, ["alpha", "beta"])
  assert.deepEqual(plan.targets.automations, ["shared_automation"])
  assert.ok(!plan.targets.functions.includes("_shared"))
  assert.ok(!plan.targets.functions.includes("unrelated"))
  assert.ok(
    plan.commands.some(
      command =>
        command.includes("resource publish function,automation") &&
        command.includes(
          "--only function:alpha,function:beta,automation:shared_automation",
        ),
    ),
    `shared dependency closure should emit one targeted mixed Backend publish: ${plan.commands.join(" | ")}`,
  )

  run("git", ["add", "."])
  run("git", ["commit", "-qm", "shared dependency change"])
  const narrowedManifest = functionManifest(true)
  narrowedManifest.functions[0].name = "Alpha renamed"
  write(
    "src/resources/functions/functions.json",
    `${JSON.stringify(narrowedManifest, null, 2)}\n`,
  )
  const aggregatePlan = runOpenXiangdaJson([
    "workspace",
    "plan",
    "--changed",
    "--profile",
    profile,
    "--json",
  ])
  assert.deepEqual(
    aggregatePlan.targets.functions,
    ["alpha"],
    `aggregate manifest should classify changed logical items, not its filename: ${JSON.stringify(aggregatePlan.targets.functions)}`,
  )
  assert.ok(!aggregatePlan.targets.functions.includes("functions"))

  run("git", ["add", "."])
  run("git", ["commit", "-qm", "aggregate manifest change"])
  runOpenXiangdaJson(["sdd", "init", "--json"])
  const scopedChange = "shared-source-scopes"
  runOpenXiangdaJson([
    "sdd",
    "propose",
    scopedChange,
    "--title",
    "Change one function while declaring shared consumers",
    "--changed-resources-json",
    JSON.stringify({
      functions: ["alpha"],
      files: ["src/functions/_shared/value.ts"],
    }),
    "--runtime-dependencies-json",
    JSON.stringify({
      functions: ["beta"],
      automations: ["shared_automation"],
    }),
    "--deploy-targets-json",
    JSON.stringify({ functions: ["alpha"] }),
    "--json",
  ])
  runOpenXiangdaJson([
    "sdd",
    "approve",
    scopedChange,
    "--summary",
    "approved exact three-scope release",
    "--json",
  ])
  fs.appendFileSync(
    path.join(workspace, "src/functions/_shared/value.ts"),
    "export const scopedChange = true\n",
  )

  const scopedPlan = runOpenXiangdaJson([
    "workspace",
    "plan",
    "--change",
    scopedChange,
    "--profile",
    profile,
    "--json",
  ])
  assert.deepEqual(scopedPlan.targets.functions, ["alpha"])
  assert.deepEqual(scopedPlan.targets.automations, [])
  assert.deepEqual(scopedPlan.dependencyImpact.functions, ["beta"])
  assert.deepEqual(
    scopedPlan.dependencyImpact.automations,
    ["shared_automation"],
  )
  assert.equal(scopedPlan.errors.length, 0)

  const changeDir = path.join(
    workspace,
    "openspec",
    "changes",
    scopedChange,
  )
  for (const [name, field] of [
    ["change.json", "scopes"],
    ["coverage.json", "scopeModel"],
    ["release.json", "scopeModel"],
  ]) {
    const file = path.join(changeDir, name)
    const value = JSON.parse(fs.readFileSync(file, "utf8"))
    value[field].runtimeDependencies = {}
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
  }
  const undeclaredPlan = runOpenXiangdaJson([
    "workspace",
    "plan",
    "--change",
    scopedChange,
    "--profile",
    profile,
    "--json",
  ])
  assert.ok(
    undeclaredPlan.errors.some(
      error => error.name === "sdd-runtime-dependencies-undeclared",
    ),
    `undeclared shared consumers must fail preflight: ${JSON.stringify(undeclaredPlan.errors)}`,
  )
  const trackedSddBefore = [
    "change.json",
    "coverage.json",
    "release.json",
  ].map(name => fs.readFileSync(path.join(changeDir, name), "utf8"))
  const failedPublish = run(
    process.execPath,
    [
      path.join(repoRoot, "bin", "openxiangda.js"),
      "release",
      "publish",
      "--change",
      scopedChange,
      "--profile",
      profile,
      "--json",
    ],
    { allowFailure: true },
  )
  assert.notEqual(failedPublish.status, 0)
  assert.match(
    failedPublish.stderr,
    /RELEASE_PLAN_INVALID.*runtimeDependencies/,
  )
  assert.equal(
    fs.existsSync(
      path.join(
        workspace,
        ".openxiangda",
        "releases",
        scopedChange,
        "execution.json",
      ),
    ),
    false,
    "failed preflight must not create an execution journal",
  )
  assert.deepEqual(
    [
      "change.json",
      "coverage.json",
      "release.json",
    ].map(name => fs.readFileSync(path.join(changeDir, name), "utf8")),
    trackedSddBefore,
    "failed preflight must not mutate tracked SDD state",
  )

  console.log("source dependencies smoke passed")
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true })
}
