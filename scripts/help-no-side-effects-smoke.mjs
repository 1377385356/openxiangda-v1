import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const cli = path.join(repoRoot, "bin", "openxiangda.js")
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openxiangda-help-smoke-"))

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const makeEnv = () => {
  const home = fs.mkdtempSync(path.join(tempRoot, "home-"))
  const codexHome = fs.mkdtempSync(path.join(tempRoot, "codex-"))
  return {
    home,
    codexHome,
    env: {
      ...process.env,
      HOME: home,
      CODEX_HOME: codexHome,
    },
  }
}

const runHelp = (args, expectedText, options = {}) => {
  const context = options.context || makeEnv()
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: options.cwd || repoRoot,
    env: context.env,
    encoding: "utf8",
  })
  if (result.status !== 0) {
    throw new Error(`${args.join(" ")} failed:\n${result.stderr}\n${result.stdout}`)
  }
  assert(
    result.stdout.includes(expectedText),
    `${args.join(" ")} did not print expected help text: ${expectedText}\n${result.stdout}`,
  )
  return { context, result }
}

const runCli = (args, options = {}) => {
  const context = options.context || makeEnv()
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: options.cwd || repoRoot,
    env: context.env,
    encoding: "utf8",
  })
  if (result.status !== 0) {
    throw new Error(`${args.join(" ")} failed:\n${result.stderr}\n${result.stdout}`)
  }
  return { context, result }
}

try {
  {
    const { context } = runHelp(["skill", "install", "--help"], "openxiangda skill install|status")
    assert(!fs.existsSync(path.join(context.codexHome, "skills")), "skill install --help created skills")
  }

  {
    const { context } = makeEnv()
    const target = path.join(tempRoot, "workspace-help-target")
    const { result } = runHelp(["workspace", "init", target, "--help"], "--runtime legacy|react-spa", { context })
    assert(
      result.stdout.includes(
        "openxiangda workspace publish --change <change> --environment <target> --form <formCode>",
      ),
      "workspace init --help did not describe React SPA form schema publish",
    )
    assert(!fs.existsSync(target), "workspace init --help created the target workspace")
  }

  {
    const { context } = runHelp(["workflow", "--help"], "workflow list hides platform shell workflows")
    assert(!fs.existsSync(path.join(context.home, ".openxiangda")), "workflow --help created user config")
  }

  {
    const context = makeEnv()
    const project = fs.mkdtempSync(path.join(tempRoot, "workflow-resource-"))
    fs.mkdirSync(path.join(context.home, ".openxiangda"), { recursive: true })
    fs.writeFileSync(
      path.join(context.home, ".openxiangda", "profiles.json"),
      `${JSON.stringify({
        version: 1,
        currentProfile: "dev",
        profiles: {
          dev: {
            name: "dev",
            baseUrl: "https://example.test/service",
            token: { accessToken: "keep-token" },
          },
        },
      }, null, 2)}\n`,
    )
    fs.mkdirSync(path.join(project, ".openxiangda"), { recursive: true })
    fs.writeFileSync(
      path.join(project, ".openxiangda", "state.json"),
      `${JSON.stringify({
        version: 1,
        profiles: {
          dev: {
            appType: "APP_TEST",
            resources: {
              forms: {
                demo_request: {
                  formUuid: "FORM_TEST",
                  formType: "process",
                  schemaSyncedAt: "2026-06-22T00:00:00.000Z",
                },
              },
            },
          },
        },
      }, null, 2)}\n`,
    )
    const workflowDir = path.join(project, "src", "resources", "workflows", "demo_flow")
    fs.mkdirSync(workflowDir, { recursive: true })
    fs.writeFileSync(
      path.join(workflowDir, "workflow.json"),
      `${JSON.stringify({
        code: "demo_flow",
        formCode: "demo_request",
        kind: "workflow_v3",
        definitionFile: "definition.v3.json",
        previewFile: "preview.json",
      }, null, 2)}\n`,
    )
    fs.writeFileSync(
      path.join(workflowDir, "definition.v3.json"),
      `${JSON.stringify({ version: "v3", nodes: [], edges: [] }, null, 2)}\n`,
    )
    fs.writeFileSync(
      path.join(workflowDir, "preview.json"),
      `${JSON.stringify({ kind: "workflow_code_preview", steps: [] }, null, 2)}\n`,
    )
    const { result } = runCli(["resource", "validate", "workflows", "--profile", "dev", "--json"], {
      context,
      cwd: project,
    })
    const validation = JSON.parse(result.stdout)
    assert(validation.valid === true, `workflow resource validate failed: ${result.stdout}`)
    assert(validation.counts.workflows === 1, `generated workflow JSON files were scanned: ${result.stdout}`)
  }

  {
    const { context } = runHelp(["update", "install", "--help"], "openxiangda update check|install")
    assert(!fs.existsSync(path.join(context.home, ".openxiangda")), "update install --help created user config")
  }

  {
    const context = makeEnv()
    const configDir = path.join(context.home, ".openxiangda")
    const configFile = path.join(configDir, "profiles.json")
    fs.mkdirSync(configDir, { recursive: true })
    const before = {
      version: 1,
      currentProfile: "dev",
      profiles: {
        dev: {
          name: "dev",
          baseUrl: "https://example.test/service",
          token: { accessToken: "keep-token" },
        },
      },
    }
    fs.writeFileSync(configFile, `${JSON.stringify(before, null, 2)}\n`)
    runHelp(["auth", "logout", "--help"], "openxiangda auth status|refresh|logout", { context })
    const after = JSON.parse(fs.readFileSync(configFile, "utf8"))
    assert(after.profiles.dev.token.accessToken === "keep-token", "auth logout --help changed token state")
  }

  {
    const { context } = runHelp(["login", "--help"], "openxiangda login <platform-url>")
    assert(!fs.existsSync(path.join(context.home, ".openxiangda")), "login --help created user config")
  }

  {
    const { context } = runHelp(["doctor", "--help"], "openxiangda doctor")
    assert(!fs.existsSync(path.join(context.home, ".openxiangda")), "doctor --help created user config")
  }

  {
    const { context } = runHelp(
      ["platform", "add", "dev", "https://example.test", "--help"],
      "openxiangda platform add|list|use|remove",
    )
    assert(!fs.existsSync(path.join(context.home, ".openxiangda")), "platform add --help created user config")
  }

  for (const [args, expected] of [
    [["app", "create", "Demo", "--help"], "openxiangda app list|create|snapshot"],
    [["form", "create", "customer", "--help"], "openxiangda form list|create|ensure|bind|pull|export|publish"],
    [["page", "publish", "home", "--help"], "openxiangda page list|publish|bind|head|releases|detail|diff|activate|rollback"],
    [["menu", "delete", "main", "--help"], "openxiangda menu list|create|update|sort|bind|delete"],
    [["permission", "role-delete", "admin", "--help"], "openxiangda permission role-list|role-create"],
    [["settings", "public-access-delete", "FORM_1", "--help"], "openxiangda settings get|save|indexes"],
    [["open-api", "spec", "--help"], "openxiangda open-api spec tags"],
    [["open-api", "credential", "--help"], "openxiangda open-api credential list"],
    [["feedback", "submit", "--summary", "x", "--yes", "--help"], "openxiangda feedback preview|submit"],
  ]) {
    const { context } = runHelp(args, expected)
    assert(!fs.existsSync(path.join(context.home, ".openxiangda")), `${args.join(" ")} created user config`)
  }

  console.log("help no-side-effects smoke passed")
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true })
}
