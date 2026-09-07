import fs from "node:fs"
import http from "node:http"
import crypto from "node:crypto"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openxiangda-resource-plan-"))
const tempHome = path.join(tempRoot, "home")
const workspace = path.join(tempRoot, "workspace")
const profileName = "dev"
const appType = "APP_RESOURCE_PLAN"
const automationBundle = "module.exports = async () => ({ ok: true })\n"
const automationBundleHash = crypto.createHash("sha256").update(automationBundle).digest("hex")
const functionBundle =
  "module.exports = async (ctx) => ({ formUuid: ctx.resources.resolveForm('customer') })\n"
const functionBundleHash = crypto.createHash("sha256").update(functionBundle).digest("hex")
const automationBundlePath = path.join(
  workspace,
  "dist",
  "automations",
  "notify_customer",
  "index.cjs",
)
const functionBundlePath = path.join(
  workspace,
  "dist",
  "functions",
  "summarize_customer",
  "index.cjs",
)

fs.mkdirSync(path.join(tempHome, ".openxiangda"), { recursive: true })
fs.mkdirSync(path.join(workspace, ".openxiangda"), { recursive: true })
fs.mkdirSync(path.join(workspace, "src", "resources", "roles"), {
  recursive: true,
})
fs.mkdirSync(path.join(workspace, "src", "resources", "menus"), {
  recursive: true,
})
fs.mkdirSync(path.join(workspace, "src", "resources", "notifications"), {
  recursive: true,
})
fs.mkdirSync(path.join(workspace, "src", "resources", "data-views"), {
  recursive: true,
})
fs.mkdirSync(path.join(workspace, "src", "resources", "storage"), {
  recursive: true,
})
fs.mkdirSync(path.join(workspace, "src", "resources", "settings", "forms"), {
  recursive: true,
})
fs.mkdirSync(path.join(workspace, "src", "resources", "functions"), {
  recursive: true,
})
fs.mkdirSync(path.join(workspace, "src", "resources", "automations"), {
  recursive: true,
})
fs.mkdirSync(path.join(workspace, "src", "resources", "auth"), {
  recursive: true,
})
fs.mkdirSync(path.join(workspace, "src", "resources", "routes"), {
  recursive: true,
})
fs.mkdirSync(path.join(workspace, "src", "resources", "public-access"), {
  recursive: true,
})
fs.mkdirSync(path.join(workspace, "src", "resources", "permissions", "page-groups"), {
  recursive: true,
})
fs.mkdirSync(path.join(workspace, "src", "resources", "permissions", "form-groups"), {
  recursive: true,
})
fs.mkdirSync(path.join(workspace, "src", "automations", "notify_customer"), {
  recursive: true,
})
fs.mkdirSync(path.join(workspace, "src", "functions", "summarize_customer"), {
  recursive: true,
})
fs.mkdirSync(path.join(workspace, "dist", "automations", "notify_customer"), {
  recursive: true,
})
fs.mkdirSync(path.join(workspace, "dist", "functions", "summarize_customer"), {
  recursive: true,
})

fs.writeFileSync(
  path.join(workspace, "package.json"),
  `${JSON.stringify(
    {
      private: true,
      packageManager: "pnpm@10.8.1",
      scripts: {
        "build-js-code": "node build-js-code-smoke.mjs",
      },
    },
    null,
    2,
  )}\n`,
)

fs.writeFileSync(
  path.join(workspace, "build-js-code-smoke.mjs"),
  `import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(fileURLToPath(import.meta.url))
fs.appendFileSync(path.join(root, "build-js-code-invocations.log"), process.argv.slice(2).join(" ") + "\\n")
const outDir = path.join(root, "dist", "automations", "notify_customer")
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, "index.cjs"), ${JSON.stringify(automationBundle)})
`,
)

fs.writeFileSync(
  path.join(workspace, "src", "resources", "roles", "manager.json"),
  `${JSON.stringify(
    {
      code: "manager",
      name: "Manager",
      description: "full",
    },
    null,
    2,
  )}\n`,
)

fs.writeFileSync(
  path.join(workspace, "src", "resources", "menus", "customer_menu.json"),
  `${JSON.stringify(
    {
      code: "customer_menu",
      name: "Customers",
      type: "receipt",
      formCode: "customer",
      parentCode: "root",
      sortOrder: 5,
      icon: "user",
      isHidden: false,
    },
    null,
    2,
  )}\n`,
)

fs.writeFileSync(
  path.join(
    workspace,
    "src",
    "resources",
    "settings",
    "forms",
    "customer.json",
  ),
  `${JSON.stringify(
    {
      code: "customer",
      settings: {},
    },
    null,
    2,
  )}\n`,
)

fs.writeFileSync(
  path.join(workspace, "src", "resources", "notifications", "reservation_reminder.json"),
  `${JSON.stringify(
    {
      templates: [
        {
          code: "reservation_reminder",
          name: "Reservation Reminder",
          content: "{{title}}",
          channelsConfig: {
            inapp: {
              enabled: true,
              content: "{{title}}",
            },
          },
          variables: ["title"],
        },
      ],
      typeConfigs: [
        {
          notificationType: "reservation_reminder",
          templateCode: "reservation_reminder",
          enabled: true,
          priority: 0,
        },
      ],
    },
    null,
    2,
  )}\n`,
)

fs.writeFileSync(
  path.join(workspace, "src", "resources", "data-views", "customer_lookup.json"),
  `${JSON.stringify(
    {
      code: "customer_lookup",
      name: "Customer Lookup",
      description: "",
      base: {
        formCode: "customer",
        alias: "customer",
      },
      select: [
        {
          field: "customer.form_instance_id",
          as: "customerId",
        },
        {
          field: "customer.name",
          as: "customerName",
        },
      ],
      indexes: [
        {
          fields: ["customerId"],
          unique: true,
        },
      ],
      refresh: {
        mode: "manual",
      },
      permissionGroups: [
        {
          code: "customer_lookup_query",
          name: "Customer Lookup Query",
          roles: ["manager"],
          operations: ["query"],
        },
      ],
    },
    null,
    2,
  )}\n`,
)

fs.writeFileSync(
  path.join(workspace, "src", "resources", "data-views", "customer_stats.json"),
  `${JSON.stringify(
    {
      code: "customer_stats",
      name: "Customer Stats",
      description: "",
      viewType: "aggregate",
      base: {
        formCode: "customer",
        alias: "customer",
      },
      dimensions: [
        {
          field: "customer.created_at",
          as: "createdMonth",
          bucket: "month",
        },
      ],
      measures: [
        {
          type: "count",
          as: "customerCount",
        },
      ],
      having: {
        field: "customerCount",
        op: ">",
        value: 0,
      },
      indexes: [
        {
          fields: ["createdMonth"],
        },
      ],
      refresh: {
        mode: "manual",
      },
    },
    null,
    2,
  )}\n`,
)

fs.writeFileSync(
  path.join(workspace, "src", "resources", "functions", "summarize_customer.json"),
  `${JSON.stringify(
    {
      code: "summarize_customer",
      name: "Summarize Customer",
      description: "",
      resources: {
        forms: ["customer"],
        dataViews: ["customer_lookup"],
      },
      definitionJson: {
        kind: "app_function",
        version: "function_v1",
        runtimeMode: "trusted_node",
        sourceType: "file_snapshot",
        sourceFile: {
          localPath: "src/functions/summarize_customer/index.ts",
        },
      },
      status: "active",
    },
    null,
    2,
  )}\n`,
)

fs.writeFileSync(
  path.join(workspace, "src", "automations", "notify_customer", "index.ts"),
  "export default async function notifyCustomer() { return { ok: true } }\n",
)

fs.writeFileSync(
  path.join(workspace, "src", "functions", "summarize_customer", "index.ts"),
  "export default async function summarizeCustomer(ctx) { return { formUuid: ctx.resources.resolveForm('customer') } }\n",
)

fs.writeFileSync(
  path.join(workspace, "dist", "automations", "notify_customer", "index.cjs"),
  automationBundle,
)

fs.writeFileSync(
  functionBundlePath,
  functionBundle,
)

fs.writeFileSync(
  path.join(workspace, "src", "automations", "notify_customer", "definition.code.json"),
  `${JSON.stringify(
    {
      kind: "automation_code_ts",
      version: "code_v1",
      runtimeMode: "trusted_node",
      sourceType: "file_snapshot",
      scriptCode: "notify_customer",
      sourceFile: {
        localPath: "src/automations/notify_customer/index.ts",
      },
      resources: {
        forms: ["customer"],
      },
      timeoutMs: 30000,
    },
    null,
    2,
  )}\n`,
)

fs.writeFileSync(
  path.join(workspace, "src", "automations", "notify_customer", "preview.json"),
  `${JSON.stringify(
    {
      kind: "automation_code_preview",
      version: "preview_v1",
      steps: [{ id: "notify", type: "notification", label: "Notify" }],
      edges: [],
    },
    null,
    2,
  )}\n`,
)

fs.writeFileSync(
  path.join(workspace, "src", "resources", "automations", "notify_customer.json"),
  `${JSON.stringify(
    {
      code: "notify_customer",
      name: "Notify Customer",
      description: "Send customer notification",
      triggerConfig: {
        version: "trigger_v2",
        mode: "scheduled",
        enabled: true,
        schedule: {
          type: "fixed_time",
          fixedTime: {
            startTime: "2026-06-15T00:00:00+08:00",
            cronExpression: "0 */5 * * * *",
          },
        },
      },
      definitionFile: "../../automations/notify_customer/definition.code.json",
      resources: {
        forms: ["customer"],
      },
      previewFile: "../../automations/notify_customer/preview.json",
      publish: true,
      enable: true,
    },
    null,
    2,
  )}\n`,
)

fs.writeFileSync(
  path.join(workspace, "src", "resources", "auth", "default.json"),
  `${JSON.stringify(
    {
      code: "default",
      name: "Default App Login",
      description: "",
      status: "active",
      configJson: {
        methods: [
          { type: "password", enabled: true, label: "账号密码" },
          {
            type: "phone_code",
            enabled: true,
            label: "手机号验证码",
            ttlSeconds: 300,
            sendFrequencySeconds: 60,
            maxAttempts: 5,
            provider: { functionCode: "summarize_customer" },
          },
        ],
        registration: { mode: "reject" },
        binding: { mode: "auto" },
        matching: {
          keys: ["phone", "email", "externalId", "unionId", "jobNumber", "username"],
        },
      },
    },
    null,
    2,
  )}\n`,
)

fs.writeFileSync(
  path.join(workspace, "src", "resources", "storage", "evaluate_oss.json"),
  `${JSON.stringify(
    {
      code: "evaluate_oss",
      name: "Evaluate OSS",
      provider: "oss",
      status: "active",
      configJson: {
        region: "oss-cn-hangzhou",
        bucket: "evaluate-oss",
        publicBaseUrl: "https://evaluate-oss.oss-cn-hangzhou.aliyuncs.com",
        pathPrefix: "openxiangda/{{appType}}/{{yyyy}}/{{MM}}/{{dd}}",
        maxFileSizeMb: 20,
        allowedExtensions: ["txt", "pdf", "png"],
        cors: {
          managed: true,
          allowedOrigins: ["https://platform.example.com"],
          allowedMethods: ["PUT", "GET", "HEAD"],
          allowedHeaders: ["content-type", "x-oss-*"],
          exposeHeaders: ["ETag", "x-oss-request-id"],
          maxAgeSeconds: 600,
        },
      },
      credentials: {
        accessKeyId: "${APP_OSS_ACCESS_KEY_ID}",
        accessKeySecret: "${APP_OSS_ACCESS_KEY_SECRET}",
      },
    },
    null,
    2,
  )}\n`,
)

fs.writeFileSync(
  path.join(workspace, "src", "resources", "routes", "public_register.json"),
  `${JSON.stringify(
    {
      code: "public.register",
      title: "Public Register",
      kind: "page",
      pathPattern: "/view/:appType/public/register",
      publicAccess: "guest",
      publicPolicyCode: "public_register",
    },
    null,
    2,
  )}\n`,
)

fs.writeFileSync(
  path.join(workspace, "src", "resources", "public-access", "public_register.json"),
  `${JSON.stringify(
    {
      code: "public_register",
      name: "Public Register",
      mode: "guest",
      routeCode: "public.register",
      pathPattern: "/view/:appType/public/register",
      externalRoleCodes: ["external_visitor"],
      grants: {
        forms: ["customer"],
        dataViews: ["customer_lookup"],
        functions: ["summarize_customer"],
        connectors: [],
      },
    },
    null,
    2,
  )}\n`,
)

fs.writeFileSync(
  path.join(
    workspace,
    "src",
    "resources",
    "permissions",
    "page-groups",
    "sales_pages.json",
  ),
  `${JSON.stringify(
    {
      code: "sales_pages",
      name: "Sales Pages",
      roles: ["manager"],
      menuCodes: ["customer_menu"],
    },
    null,
    2,
  )}\n`,
)

fs.writeFileSync(
  path.join(
    workspace,
    "src",
    "resources",
    "permissions",
    "form-groups",
    "customer_view.json",
  ),
  `${JSON.stringify(
    {
      code: "customer_view",
      formCode: "customer",
      name: "Customer View",
      type: "view",
      roles: ["manager"],
      dataScope: [{ type: "self" }],
      operations: ["view"],
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
            forms: {
              customer: {
                formUuid: "FORM_CUSTOMER",
              },
            },
            menus: {
              root: {
                menuId: "MENU_ROOT",
              },
              customer_menu: {
                menuId: "MENU_CUSTOMER",
                formUuid: "FORM_CUSTOMER",
              },
            },
            automations: {
              notify_customer: {
                automationId: "AUTO_NOTIFY",
              },
            },
            routes: {
              "public.register": {
                routeId: "ROUTE_PUBLIC_REGISTER",
              },
            },
            publicAccessPolicies: {
              public_register: {
                policyId: "PUBLIC_POLICY_REGISTER",
              },
            },
            storageConfigs: {
              evaluate_oss: {
                storageConfigId: "STORAGE_OSS",
              },
            },
          },
        },
      },
    },
    null,
    2,
  )}\n`,
)

let existingRoles = []
let existingMenus = []
let existingNotificationTemplates = []
let existingNotificationTypeConfigs = []
let existingFunctions = []
let existingAutomations = []
let existingAuthConfigs = []
let existingRoutes = []
let existingPublicAccessPolicies = []
let existingDataViews = []
let existingStorageConfigs = []
let existingDataViewPermissionGroups = []
let existingPageGroups = []
let existingFormGroups = []
let existingRoleApiPermissions = []
let existingApiPermissions = [
  {
    id: "API_LOGIN_LOG_READ",
    code: "app:login-log:read",
    name: "Read login logs",
    scope: "app",
    appType,
  },
]
let publishCalls = []
let functionUpdateBodies = []
let functionSourcePatchBodies = []
let automationUpdateBodies = []
let automationSourcePatchBodies = []
let formBundleBodies = []
const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1")
  response.setHeader("content-type", "application/json")
  if (
    request.method === "POST" &&
    url.pathname ===
      `/service/openxiangda-api/v1/apps/${appType}/publish-lease/LEASE_RESOURCE_PLAN_SMOKE/renew`
  ) {
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          leaseId: "LEASE_RESOURCE_PLAN_SMOKE",
          appType,
          expiresAt: new Date(Date.now() + 1_800_000).toISOString(),
          holder: "self",
        },
      }),
    )
    return
  }
  if (
    request.method === "POST" &&
    url.pathname === "/service/file/js-code-snapshot/upload"
  ) {
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          bucketName: "files",
          objectName: "notify_customer.cjs",
          sha256: automationBundleHash,
          size: automationBundle.length,
          originalName: "index.cjs",
          contentType: "application/javascript",
        },
      }),
    )
    return
  }
  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/roles`
  ) {
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          items: existingRoles,
          totalCount: existingRoles.length,
        },
      }),
    )
    return
  }
  if (url.pathname === "/service/permission/api/role/role-1") {
    response.end(
      JSON.stringify({
        code: 200,
        data: existingRoleApiPermissions,
      }),
    )
    return
  }
  if (url.pathname === "/service/permission/api") {
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          items: existingApiPermissions,
          totalCount: existingApiPermissions.length,
        },
      }),
    )
    return
  }
  if (
    request.method === "POST" &&
    url.pathname === "/service/permission/api/assign"
  ) {
    readRequestJson(request, body => {
      publishCalls.push({
        kind: "roleApiPermission",
        roleId: body.roleId,
        permissionIds: body.permissionIds || [],
      })
      response.end(JSON.stringify({ code: 200, data: true }))
    })
    return
  }
  if (
    request.method === "POST" &&
    url.pathname ===
      `/service/openxiangda-api/v1/apps/${appType}/roles/role-1`
  ) {
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          id: "role-1",
          code: "manager",
          name: "Manager",
          description: "full",
        },
      }),
    )
    return
  }
  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/menus`
  ) {
    response.end(JSON.stringify({ code: 200, data: existingMenus }))
    return
  }
  if (
    request.method === "POST" &&
    url.pathname ===
      `/service/openxiangda-api/v1/apps/${appType}/menus/MENU_CUSTOMER`
  ) {
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          id: "MENU_CUSTOMER",
          resourceCode: "customer_menu",
          name: "Customers",
          type: "receipt",
          formUuid: "FORM_CUSTOMER",
          parentId: "MENU_ROOT",
          sortOrder: 5,
          icon: "user",
          isHidden: false,
        },
      }),
    )
    return
  }
  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/connectors`
  ) {
    response.end(JSON.stringify({ code: 200, data: [] }))
    return
  }
  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/notifications/templates`
  ) {
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          items: existingNotificationTemplates,
          total: existingNotificationTemplates.length,
        },
      }),
    )
    return
  }
  if (
    request.method === "POST" &&
    url.pathname ===
      `/service/openxiangda-api/v1/apps/${appType}/notifications/templates/reservation_reminder`
  ) {
    publishCalls.push("notificationTemplate")
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          id: "TPL_1",
          code: "reservation_reminder",
          name: "Reservation Reminder",
          content: "{{title}}",
          level: "app",
          created: false,
        },
      }),
    )
    return
  }
  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/notifications/type-configs`
  ) {
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          items: existingNotificationTypeConfigs,
          total: existingNotificationTypeConfigs.length,
        },
      }),
    )
    return
  }
  if (
    request.method === "POST" &&
    url.pathname ===
      `/service/openxiangda-api/v1/apps/${appType}/notifications/type-configs/reservation_reminder`
  ) {
    publishCalls.push("notificationTypeConfig")
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          id: "CFG_1",
          notificationType: "reservation_reminder",
          level: "app",
          templateId: "TPL_1",
          template: {
            code: "reservation_reminder",
          },
          created: false,
        },
      }),
    )
    return
  }
  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/automations/AUTO_NOTIFY/executions`
  ) {
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          data: [
            {
              id: "EXEC_1",
              status: "success",
              triggerEventType: "form_data_submitted",
              executionDuration: 12,
              startedAt: "2026-06-15T18:00:00.000Z",
            },
          ],
          totalCount: 1,
          page: 1,
          pageSize: 10,
        },
      }),
    )
    return
  }
  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/automations/AUTO_NOTIFY/executions/EXEC_1`
  ) {
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          id: "EXEC_1",
          status: "success",
          definitionName: "Notify Customer",
          triggerEventType: "form_data_submitted",
          executionDuration: 12,
          nodeExecutionLogs: [
            {
              nodeId: "notify",
              nodeLabel: "Notify",
              success: true,
              logs: [{ level: "INFO", message: "sent" }],
            },
          ],
        },
      }),
    )
    return
  }
  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/workflows`
  ) {
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
  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/automations`
  ) {
    if (request.method === "POST") {
      publishCalls.push("automation")
      readRequestJson(request, body => {
        automationUpdateBodies.push(body)
        response.end(
          JSON.stringify({
            code: 200,
            data: matchingAutomationResponse(body.resourceCode || "notify_customer"),
          }),
        )
      })
      return
    }
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          items: existingAutomations,
          totalCount: existingAutomations.length,
        },
      }),
    )
    return
  }
  if (
    url.pathname ===
      `/service/openxiangda-api/v1/apps/${appType}/automations/AUTO_NOTIFY/source` &&
    request.method === "PATCH"
  ) {
    publishCalls.push("automationSourcePatch")
    readRequestJson(request, body => {
      automationSourcePatchBodies.push(body)
      response.end(
        JSON.stringify({
          code: 200,
          data: matchingAutomationResponse("notify_customer"),
        }),
      )
    })
    return
  }
  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/automations/AUTO_NOTIFY`
  ) {
    if (request.method === "POST") {
      publishCalls.push("automation")
      readRequestJson(request, body => {
        automationUpdateBodies.push(body)
        response.end(
          JSON.stringify({
            code: 200,
            data: matchingAutomationResponse(body.resourceCode || "notify_customer"),
          }),
        )
      })
      return
    }
    const automation = existingAutomations.find(item => item.resourceCode === "notify_customer")
    if (automation) {
      response.end(JSON.stringify({ code: 200, data: automation }))
      return
    }
    response.statusCode = 404
    response.end(JSON.stringify({ code: 404, message: "not found" }))
    return
  }
  if (
    request.method === "POST" &&
    (
      url.pathname ===
        `/service/openxiangda-api/v1/apps/${appType}/automations/AUTO_NOTIFY/publish` ||
      url.pathname ===
        `/service/openxiangda-api/v1/apps/${appType}/automations/AUTO_NOTIFY/enable`
    )
  ) {
    response.end(JSON.stringify({ code: 200, data: { id: "AUTO_NOTIFY" } }))
    return
  }
  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/functions`
  ) {
    if (request.method === "POST") {
      publishCalls.push("function")
      readRequestJson(request, body => {
        response.end(
          JSON.stringify({
            code: 200,
            data: matchingFunctionResponse(body.code || "summarize_customer"),
          }),
        )
      })
      return
    }
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          items: existingFunctions,
          totalCount: existingFunctions.length,
        },
      }),
    )
    return
  }
  if (
    url.pathname ===
      `/service/openxiangda-api/v1/apps/${appType}/functions/summarize_customer/source` &&
    request.method === "PATCH"
  ) {
    publishCalls.push("functionSourcePatch")
    readRequestJson(request, body => {
      functionSourcePatchBodies.push(body)
      response.end(
        JSON.stringify({
          code: 200,
          data: matchingFunctionResponse("summarize_customer"),
        }),
      )
    })
    return
  }
  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/functions/summarize_customer`
  ) {
    if (request.method === "POST") {
      publishCalls.push("function")
      readRequestJson(request, body => {
        functionUpdateBodies.push(body)
        response.end(
          JSON.stringify({
            code: 200,
            data: matchingFunctionResponse("summarize_customer"),
          }),
        )
      })
      return
    }
    const fn = existingFunctions.find(item => item.code === "summarize_customer")
    if (fn) {
      response.end(JSON.stringify({ code: 200, data: fn }))
      return
    }
    response.statusCode = 404
    response.end(JSON.stringify({ code: 404, message: "not found" }))
    return
  }
  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/auth/configs`
  ) {
    if (request.method === "POST") {
      publishCalls.push("authConfig")
      readRequestJson(request, body => {
        response.end(
          JSON.stringify({
            code: 200,
            data: matchingAuthConfigResponse(body.code || "default"),
          }),
        )
      })
      return
    }
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          data: existingAuthConfigs,
          totalCount: existingAuthConfigs.length,
        },
      }),
    )
    return
  }
  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/auth/configs/default`
  ) {
    if (request.method === "POST") {
      publishCalls.push("authConfig")
      response.end(
        JSON.stringify({
          code: 200,
          data: matchingAuthConfigResponse("default"),
        }),
      )
      return
    }
    const authConfig = existingAuthConfigs.find(item => item.code === "default")
    if (authConfig) {
      response.end(JSON.stringify({ code: 200, data: authConfig }))
      return
    }
    response.statusCode = 404
    response.end(JSON.stringify({ code: 404, message: "not found" }))
    return
  }
  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/routes`
  ) {
    if (request.method === "POST") {
      publishCalls.push("route")
      readRequestJson(request, body => {
        response.end(
          JSON.stringify({
            code: 200,
            data: matchingRouteResponse(body.code || "public.register"),
          }),
        )
      })
      return
    }
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          items: existingRoutes,
          totalCount: existingRoutes.length,
        },
      }),
    )
    return
  }
  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/routes/public.register`
  ) {
    if (request.method === "POST") {
      publishCalls.push("route")
      response.end(
        JSON.stringify({
          code: 200,
          data: matchingRouteResponse("public.register"),
        }),
      )
      return
    }
    const route = existingRoutes.find(item => item.code === "public.register")
    if (route) {
      response.end(JSON.stringify({ code: 200, data: route }))
      return
    }
    response.statusCode = 404
    response.end(JSON.stringify({ code: 404, message: "not found" }))
    return
  }
  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/public-access/policies`
  ) {
    if (request.method === "POST") {
      publishCalls.push("publicAccessPolicy")
      readRequestJson(request, body => {
        response.end(
          JSON.stringify({
            code: 200,
            data: matchingPublicAccessPolicyResponse(body.code || "public_register"),
          }),
        )
      })
      return
    }
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          items: existingPublicAccessPolicies,
          totalCount: existingPublicAccessPolicies.length,
        },
      }),
    )
    return
  }
  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/public-access/policies/public_register`
  ) {
    if (request.method === "POST") {
      publishCalls.push("publicAccessPolicy")
      response.end(
        JSON.stringify({
          code: 200,
          data: matchingPublicAccessPolicyResponse("public_register"),
        }),
      )
      return
    }
    const policy = existingPublicAccessPolicies.find(item => item.code === "public_register")
    if (policy) {
      response.end(JSON.stringify({ code: 200, data: policy }))
      return
    }
    response.statusCode = 404
    response.end(JSON.stringify({ code: 404, message: "not found" }))
    return
  }
  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/data-views`
  ) {
    if (request.method === "POST") {
      publishCalls.push("dataView")
      readRequestJson(request, body => {
        const code = body.code || body.definition?.code || "customer_lookup"
        response.end(
          JSON.stringify({
            code: 200,
            data: matchingDataViewResponse(code),
          }),
        )
      })
      return
    }
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          items: existingDataViews,
          totalCount: existingDataViews.length,
        },
      }),
    )
    return
  }
  if (
    url.pathname ===
      `/service/openxiangda-api/v1/apps/${appType}/data-views/customer_lookup` ||
    url.pathname ===
      `/service/openxiangda-api/v1/apps/${appType}/data-views/customer_stats`
  ) {
    const code = url.pathname.endsWith("/customer_stats")
      ? "customer_stats"
      : "customer_lookup"
    if (request.method === "POST") {
      publishCalls.push("dataView")
      response.end(
        JSON.stringify({
          code: 200,
          data: matchingDataViewResponse(code),
        }),
      )
      return
    }
    const dataView = existingDataViews.find(item => item.code === code)
    if (dataView) {
      response.end(JSON.stringify({ code: 200, data: dataView }))
      return
    }
    response.statusCode = 404
    response.end(JSON.stringify({ code: 404, message: "not found" }))
    return
  }
  if (
    url.pathname ===
      `/service/openxiangda-api/v1/apps/${appType}/data-views/customer_lookup/permission-groups` ||
    url.pathname ===
      `/service/openxiangda-api/v1/apps/${appType}/data-views/customer_stats/permission-groups`
  ) {
    const code = url.pathname.includes("/customer_stats/")
      ? "customer_stats"
      : "customer_lookup"
    if (request.method === "POST") {
      publishCalls.push("dataViewPermissionGroup")
      readRequestJson(request, body => {
        const groups = Array.isArray(body.groups) ? body.groups : []
        existingDataViewPermissionGroups = [
          ...existingDataViewPermissionGroups.filter(
            item => item.dataViewCode !== code,
          ),
          ...groups.map((group, index) => ({
            id: group.id || `DVPG_${code}_${index + 1}`,
            dataViewCode: code,
            ...group,
            resourceCode: group.resourceCode || group.code,
          })),
        ]
        response.end(
          JSON.stringify({
            code: 200,
            data: {
              items: existingDataViewPermissionGroups.filter(
                item => item.dataViewCode === code,
              ),
              totalCount: groups.length,
            },
          }),
        )
      })
      return
    }
    const items = existingDataViewPermissionGroups.filter(
      item => item.dataViewCode === code,
    )
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          items,
          totalCount: items.length,
        },
      }),
    )
    return
  }
  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/storage-configs`
  ) {
    if (request.method === "POST") {
      publishCalls.push("storageConfig")
      readRequestJson(request, body => {
        if (
          body.credentials?.accessKeyId !== "SMOKE_ACCESS_KEY_ID" ||
          body.credentials?.accessKeySecret !== "SMOKE_ACCESS_KEY_SECRET" ||
          body.configJson?.cors?.managed !== true ||
          body.configJson?.cors?.allowedOrigins?.[0] !== "https://platform.example.com"
        ) {
          response.statusCode = 400
          response.end(JSON.stringify({ code: 400, message: "storage credentials not resolved" }))
          return
        }
        const saved = matchingStorageConfigResponse(body.code || "evaluate_oss")
        existingStorageConfigs = [saved]
        response.end(
          JSON.stringify({
            code: 200,
            data: saved,
          }),
        )
      })
      return
    }
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          items: existingStorageConfigs,
          totalCount: existingStorageConfigs.length,
        },
      }),
    )
    return
  }
  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/storage-configs/evaluate_oss`
  ) {
    if (request.method === "POST") {
      publishCalls.push("storageConfig")
      readRequestJson(request, body => {
        if (
          body.configJson?.bucket !== "evaluate-oss" ||
          body.configJson?.cors?.managed !== true ||
          body.configJson?.cors?.allowedMethods?.join(",") !== "PUT,GET,HEAD" ||
          body.credentials?.accessKeyId !== "SMOKE_ACCESS_KEY_ID" ||
          body.credentials?.accessKeySecret !== "SMOKE_ACCESS_KEY_SECRET"
        ) {
          response.statusCode = 400
          response.end(JSON.stringify({ code: 400, message: "invalid storage publish body" }))
          return
        }
        const saved = matchingStorageConfigResponse("evaluate_oss")
        existingStorageConfigs = [saved]
        response.end(
          JSON.stringify({
            code: 200,
            data: saved,
          }),
        )
      })
      return
    }
    const storageConfig = existingStorageConfigs.find(item => item.code === "evaluate_oss")
    if (storageConfig) {
      response.end(JSON.stringify({ code: 200, data: storageConfig }))
      return
    }
    response.statusCode = 404
    response.end(JSON.stringify({ code: 404, message: "not found" }))
    return
  }
  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/page-permission-groups`
  ) {
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          items: existingPageGroups,
          total: existingPageGroups.length,
        },
      }),
    )
    return
  }
  if (
    request.method === "POST" &&
    url.pathname ===
      `/service/openxiangda-api/v1/apps/${appType}/page-permission-groups/PAGE_GROUP_1`
  ) {
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          id: "PAGE_GROUP_1",
          resourceCode: "sales_pages",
          name: "Sales Pages",
          roles: ["manager"],
          menuFormUuids: ["FORM_CUSTOMER"],
          menuCodes: ["customer_menu"],
          routeCodes: [],
          pathPatterns: [],
        },
      }),
    )
    return
  }
  if (
    request.method === "GET" &&
    url.pathname ===
      `/service/openxiangda-api/v1/apps/${appType}/forms/FORM_CUSTOMER/snapshot`
  ) {
    response.setHeader("etag", '"form-form-1-r1"')
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          revision: 1,
          etag: '"form-form-1-r1"',
          activeFormReleaseHead: {
            releaseId: null,
            releaseHash: null,
            revision: 1,
          },
          snapshot: {
            schemaVersion: 1,
            form: {
              name: "Customer",
              schema: {},
              packages: [],
              formType: "receipt",
              relateUuid: null,
              formFields: {},
              settingsJson: {},
            },
            resources: {
              fieldIndexes: [],
              dataManagement: null,
              publicAccess: null,
              bundle: null,
              permissionGroups: existingFormGroups,
            },
          },
        },
      }),
    )
    return
  }
  if (
    request.method === "POST" &&
    url.pathname ===
      `/service/openxiangda-api/v1/apps/${appType}/forms/FORM_CUSTOMER/bundle`
  ) {
    readRequestJson(request, body => {
      formBundleBodies.push(body)
      response.end(
        JSON.stringify({
          code: 200,
          data: {
            revision: 1,
            etag: '"form-form-1-r1"',
            activeFormReleaseHead: {
              releaseId: null,
              releaseHash: null,
              revision: 1,
            },
            release: {
              id: "FORM_RELEASE_STAGED_1",
              contentHash: "f".repeat(64),
              parentReleaseId: null,
              baseRevision: 1,
            },
            noop: false,
            staged: true,
            active: false,
            releaseStatus: "staged",
          },
        }),
      )
    })
    return
  }
  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/forms/FORM_CUSTOMER/permission-groups`
  ) {
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          items: existingFormGroups,
          total: existingFormGroups.length,
        },
      }),
    )
    return
  }
  if (
    request.method === "POST" &&
    url.pathname ===
      `/service/openxiangda-api/v1/apps/${appType}/forms/FORM_CUSTOMER/permission-groups/FORM_GROUP_1`
  ) {
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          id: "FORM_GROUP_1",
          resourceCode: "customer_view",
          formUuid: "FORM_CUSTOMER",
          name: "Customer View",
          type: "view",
          roles: ["manager"],
          dataScope: [{ type: "self" }],
          operations: ["view"],
        },
      }),
    )
    return
  }
  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/forms`
  ) {
    response.end(
      JSON.stringify({
        code: 200,
        data: [{ formUuid: "FORM_CUSTOMER" }],
      }),
    )
    return
  }
  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/forms/FORM_CUSTOMER/settings`
  ) {
    response.end(JSON.stringify({ code: 200, data: { title: "Customers" } }))
    return
  }
  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/forms/FORM_CUSTOMER/field-indexes`
  ) {
    response.end(JSON.stringify({ code: 200, data: [] }))
    return
  }
  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/forms/FORM_CUSTOMER/data-management`
  ) {
    response.end(JSON.stringify({ code: 200, data: {} }))
    return
  }
  if (
    url.pathname ===
    `/service/openxiangda-api/v1/apps/${appType}/forms/FORM_CUSTOMER/public-access`
  ) {
    response.end(JSON.stringify({ code: 200, data: null }))
    return
  }
  response.statusCode = 404
  response.end(
    JSON.stringify({
      code: 404,
      message: `not found ${request.method} ${url.pathname}`,
    }),
  )
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

const runOpenXiangda = (args, options = {}) => {
  const child = spawn(
    process.execPath,
    [
      path.join(repoRoot, "bin", "openxiangda.js"),
      ...args,
    ],
    {
      cwd: workspace,
      env: {
        ...process.env,
        HOME: tempHome,
        APP_OSS_ACCESS_KEY_ID: "SMOKE_ACCESS_KEY_ID",
        APP_OSS_ACCESS_KEY_SECRET: "SMOKE_ACCESS_KEY_SECRET",
        ...(options.env || {}),
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
        reject(new Error(stderr || stdout || "resource plan failed"))
        return
      }
      try {
        resolve(stdout)
      } catch (error) {
        reject(error)
      }
    })
  })
}

const assertPlanTimings = plan => {
  if (plan.timings?.operation !== "resource plan") {
    throw new Error("resource plan JSON should include operation timings")
  }
  const phases = plan.timings.phases || []
  if (
    phases.length !== 1 ||
    phases[0]?.name !== "plan" ||
    phases[0]?.status !== "success" ||
    !Number.isFinite(phases[0]?.durationMs)
  ) {
    throw new Error(`unexpected resource plan timing phases: ${JSON.stringify(phases)}`)
  }
  return plan
}

const runPlan = async () =>
  assertPlanTimings(JSON.parse(
    await runOpenXiangda([
      "resource",
      "plan",
      "--profile",
      profileName,
      "--json",
    ]),
  ))

const runTypedPlan = async type =>
  assertPlanTimings(JSON.parse(
    await runOpenXiangda([
      "resource",
      "plan",
      type,
      "--profile",
      profileName,
      "--json",
    ]),
  ))

const assertAction = async (label, kind, code, expected) => {
  const plan = await runPlan()
  const action = plan.actions.find(
    item => item.kind === kind && item.code === code,
  )
  if (action?.action !== expected) {
    throw new Error(
      `${label}: expected ${kind}:${code} ${expected}, got ${action?.action || "missing"}`,
    )
  }
}

const resourceHelp = await runOpenXiangda(["resource", "pull", "--help"])
if (!resourceHelp.includes("openxiangda resource validate|plan|publish|pull|typegen|explain")) {
  throw new Error("resource pull --help should print usage instead of pulling resources")
}

const automationHelp = await runOpenXiangda([
  "automation",
  "--profile",
  profileName,
  "executions",
  "--help",
])
if (!automationHelp.includes("openxiangda automation list|create|bind|pull|executions")) {
  throw new Error("automation should accept leading --profile before the subcommand")
}

const executionList = JSON.parse(
  await runOpenXiangda([
    "automation",
    "executions",
    "notify_customer",
    "--profile",
    profileName,
    "--json",
  ]),
)
if (executionList.data?.[0]?.id !== "EXEC_1") {
  throw new Error("automation executions should route through automation command")
}

const leadingProfileExecutionList = JSON.parse(
  await runOpenXiangda([
    "automation",
    "--profile",
    profileName,
    "executions",
    "notify_customer",
    "--json",
  ]),
)
if (leadingProfileExecutionList.data?.[0]?.id !== "EXEC_1") {
  throw new Error("automation executions should accept leading --profile")
}

const routeOnlyPlan = await runTypedPlan("route")
if (
  routeOnlyPlan.resourceTypeFilters?.join(",") !== "routes" ||
  routeOnlyPlan.actions.length === 0 ||
  routeOnlyPlan.actions.some(item => item.kind !== "route")
) {
  throw new Error("resource plan route should only include route actions")
}

const routeAndPublicPlan = await runTypedPlan("route,public-access")
if (
  routeAndPublicPlan.resourceTypeFilters?.join(",") !== "publicAccessPolicies,routes" ||
  routeAndPublicPlan.actions.length === 0 ||
  routeAndPublicPlan.actions.some(
    item => !["route", "publicAccessPolicy"].includes(item.kind),
  )
) {
  throw new Error("resource plan should filter comma-separated resource types")
}

const automationOnlyPlan = await runTypedPlan("automation")
if (
  automationOnlyPlan.resourceTypeFilters?.join(",") !== "automations" ||
  automationOnlyPlan.actions.length !== 1 ||
  automationOnlyPlan.actions[0]?.kind !== "automation"
) {
  throw new Error("resource plan automation should only include automation actions")
}

const storageOnlyPlan = await runTypedPlan("storage")
if (
  storageOnlyPlan.resourceTypeFilters?.join(",") !== "storageConfigs" ||
  storageOnlyPlan.actions.length !== 1 ||
  storageOnlyPlan.actions[0]?.kind !== "storageConfig"
) {
  throw new Error("resource plan storage should only include storage config actions")
}

const unrelatedFunctionManifest = path.join(
  workspace,
  "src",
  "resources",
  "functions",
  "unrelated_slow.json",
)
const unrelatedAutomationManifest = path.join(
  workspace,
  "src",
  "resources",
  "automations",
  "unrelated_slow.json",
)
const unrelatedFunctionSource = path.join(
  workspace,
  "src",
  "functions",
  "unrelated_slow",
  "index.ts",
)
const unrelatedAutomationSource = path.join(
  workspace,
  "src",
  "automations",
  "unrelated_slow",
  "index.ts",
)
for (const sourceFile of [unrelatedFunctionSource, unrelatedAutomationSource]) {
  fs.mkdirSync(path.dirname(sourceFile), { recursive: true })
  fs.writeFileSync(
    sourceFile,
    'export default async function unrelatedSlow() { throw new Error("must not be read or built") }\n',
  )
}
fs.writeFileSync(
  unrelatedFunctionManifest,
  `${JSON.stringify({
    code: "unrelated_slow",
    name: "Unrelated Slow Function",
    definitionJson: {
      kind: "app_function",
      version: "function_v1",
      runtimeMode: "trusted_node",
      sourceType: "file_snapshot",
      sourceFile: { localPath: "src/functions/unrelated_slow/index.ts" },
    },
    status: "active",
  }, null, 2)}\n`,
)
fs.writeFileSync(
  unrelatedAutomationManifest,
  `${JSON.stringify({
    code: "unrelated_slow",
    name: "Unrelated Slow Automation",
    triggerConfig: { version: "trigger_v2", mode: "manual", enabled: false },
    definitionJson: {
      kind: "automation_code_ts",
      version: "code_v1",
      runtimeMode: "trusted_node",
      sourceType: "file_snapshot",
      sourceFile: { localPath: "src/automations/unrelated_slow/index.ts" },
    },
    publish: false,
    enable: false,
  }, null, 2)}\n`,
)

const resourceReadTrace = path.join(workspace, "scoped-resource-reads.log")
const resourceReadPreload = path.join(workspace, "scoped-resource-read-preload.cjs")
fs.writeFileSync(
  resourceReadPreload,
  `const fs = require("node:fs")
const path = require("node:path")
const originalReadFileSync = fs.readFileSync
const watched = new Set(JSON.parse(process.env.OPENXIANGDA_WATCH_READS || "[]").map(file => path.resolve(file)))
fs.readFileSync = function tracedReadFileSync(file, ...args) {
  const resolved = typeof file === "string" || Buffer.isBuffer(file) ? path.resolve(String(file)) : ""
  if (watched.has(resolved)) fs.appendFileSync(process.env.OPENXIANGDA_READ_TRACE, resolved + "\\n")
  return originalReadFileSync.call(this, file, ...args)
}
`,
)
const scopedReadEnv = {
  NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --require=${resourceReadPreload}`.trim(),
  OPENXIANGDA_READ_TRACE: resourceReadTrace,
  OPENXIANGDA_WATCH_READS: JSON.stringify([
    unrelatedFunctionManifest,
    unrelatedAutomationManifest,
    unrelatedFunctionSource,
    unrelatedAutomationSource,
  ]),
}

fs.rmSync(path.join(workspace, "build-js-code-invocations.log"), { force: true })
fs.rmSync(resourceReadTrace, { force: true })
const functionCodePlan = JSON.parse(
  await runOpenXiangda([
    "resource",
    "plan",
    "function",
    "--only",
    "summarize_customer",
    "--profile",
    profileName,
    "--json",
  ], { env: scopedReadEnv }),
)
const functionScopedReads = fs.existsSync(resourceReadTrace)
  ? fs.readFileSync(resourceReadTrace, "utf8").trim()
  : ""
if (functionScopedReads) {
  throw new Error(`scoped Function plan read unrelated manifest/source: ${functionScopedReads}`)
}
const functionBuildInvocations = fs
  .readFileSync(path.join(workspace, "build-js-code-invocations.log"), "utf8")
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
if (
  functionBuildInvocations.length !== 1 ||
  !functionBuildInvocations[0].includes("--scripts functions:summarize_customer")
) {
  throw new Error(
    `resource plan should invoke one content-validating batch build for selected Functions: ${functionBuildInvocations.join(" | ")}`,
  )
}
if (
  functionCodePlan.resourceCodeFilters?.join(",") !== "summarize_customer" ||
  functionCodePlan.actions.length !== 1 ||
  functionCodePlan.actions[0]?.kind !== "function" ||
  functionCodePlan.actions[0]?.code !== "summarize_customer"
) {
  throw new Error("resource plan --only should filter by logical function code")
}

fs.rmSync(path.join(workspace, "build-js-code-invocations.log"), { force: true })
fs.rmSync(resourceReadTrace, { force: true })
const qualifiedAutomationPlan = JSON.parse(
  await runOpenXiangda([
    "resource",
    "plan",
    "--only",
    "automation:notify_customer",
    "--profile",
    profileName,
    "--json",
  ], { env: scopedReadEnv }),
)
const automationScopedReads = fs.existsSync(resourceReadTrace)
  ? fs.readFileSync(resourceReadTrace, "utf8").trim()
  : ""
if (automationScopedReads) {
  throw new Error(`scoped Automation plan read unrelated manifest/source: ${automationScopedReads}`)
}
const automationBuildInvocations = fs
  .readFileSync(path.join(workspace, "build-js-code-invocations.log"), "utf8")
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
if (
  automationBuildInvocations.length !== 1 ||
  !automationBuildInvocations[0].includes("--scripts automations:notify_customer") ||
  automationBuildInvocations[0].includes("unrelated_slow")
) {
  throw new Error(
    `resource plan should only build the selected Automation: ${automationBuildInvocations.join(" | ")}`,
  )
}
if (
  qualifiedAutomationPlan.resourceCodeFilters?.join(",") !==
    "automations:notify_customer" ||
  qualifiedAutomationPlan.actions.length !== 1 ||
  qualifiedAutomationPlan.actions[0]?.kind !== "automation"
) {
  throw new Error("resource plan should support type-qualified --only selectors")
}

for (const file of [
  unrelatedFunctionManifest,
  unrelatedAutomationManifest,
  resourceReadTrace,
  resourceReadPreload,
]) {
  fs.rmSync(file, { force: true })
}
for (const dir of [
  path.dirname(unrelatedFunctionSource),
  path.dirname(unrelatedAutomationSource),
]) {
  fs.rmSync(dir, { recursive: true, force: true })
}

// Legacy workspaces may group multiple resources in an arbitrary filename.
// Exact <code>.json layouts stay fast, but an unresolved filename must fall
// back to a compatibility scan instead of incorrectly reporting no match.
const groupedFunctionManifest = path.join(
  workspace,
  "src",
  "resources",
  "functions",
  "legacy-function-bundle.json",
)
const shadowedFunctionManifest = path.join(
  workspace,
  "src",
  "resources",
  "functions",
  "shadowed_selected.json",
)
fs.writeFileSync(
  groupedFunctionManifest,
  `${JSON.stringify([
    {
      code: "grouped_selected",
      name: "Grouped Selected",
      resources: { forms: ["customer"] },
      definitionJson: {
        kind: "app_function",
        version: "function_v1",
        runtimeMode: "trusted_node",
        sourceType: "file_snapshot",
        sourceFile: { localPath: "src/functions/summarize_customer/index.ts" },
      },
      status: "active",
    },
    {
      code: "grouped_unrelated",
      name: "Grouped Unrelated",
      definitionJson: { kind: "app_function", version: "function_v1" },
      status: "active",
    },
    {
      code: "shadowed_selected",
      name: "Shadowed Selected",
      resources: { forms: ["customer"] },
      definitionJson: {
        kind: "app_function",
        version: "function_v1",
        runtimeMode: "trusted_node",
        sourceType: "file_snapshot",
        sourceFile: { localPath: "src/functions/summarize_customer/index.ts" },
      },
      status: "active",
    },
  ], null, 2)}\n`,
)
fs.writeFileSync(
  shadowedFunctionManifest,
  `${JSON.stringify({
    code: "different_explicit_code",
    name: "Direct path with a different explicit code",
    definitionJson: { kind: "app_function", version: "function_v1" },
    status: "active",
  }, null, 2)}\n`,
)
const groupedFunctionPlan = JSON.parse(
  await runOpenXiangda([
    "resource",
    "plan",
    "function",
    "--only",
    "grouped_selected",
    "--profile",
    profileName,
    "--json",
  ]),
)
if (
  groupedFunctionPlan.actions.length !== 1 ||
  groupedFunctionPlan.actions[0]?.kind !== "function" ||
  groupedFunctionPlan.actions[0]?.code !== "grouped_selected"
) {
  throw new Error("resource plan must preserve arbitrary grouped-manifest compatibility")
}
const shadowedFunctionPlan = JSON.parse(
  await runOpenXiangda([
    "resource",
    "plan",
    "function",
    "--only",
    "shadowed_selected",
    "--profile",
    profileName,
    "--json",
  ]),
)
if (
  shadowedFunctionPlan.actions.length !== 1 ||
  shadowedFunctionPlan.actions[0]?.code !== "shadowed_selected"
) {
  throw new Error("legacy grouped fallback must depend on a logical-code match, not path existence")
}
fs.rmSync(groupedFunctionManifest, { force: true })
fs.rmSync(shadowedFunctionManifest, { force: true })

const selectedValidation = JSON.parse(
  await runOpenXiangda([
    "resource",
    "validate",
    "function",
    "--code",
    "summarize_customer",
    "--profile",
    profileName,
    "--json",
  ]),
)
if (
  selectedValidation.valid !== true ||
  selectedValidation.counts.functions !== 1 ||
  Object.entries(selectedValidation.counts).some(
    ([key, count]) => key !== "functions" && count !== 0,
  )
) {
  throw new Error("resource validate --code should validate only the selected manifest item")
}

const selectedPublishDryRun = JSON.parse(
  await runOpenXiangda([
    "resource",
    "publish",
    "function",
    "--only",
    "summarize_customer",
    "--dry-run",
    "--profile",
    profileName,
    "--json",
  ]),
)
if (
  selectedPublishDryRun.dryRun !== true ||
  selectedPublishDryRun.actions.length !== 1 ||
  selectedPublishDryRun.actions[0]?.kind !== "function"
) {
  throw new Error("resource publish --dry-run should preserve code-level selection")
}

const executionDetail = JSON.parse(
  await runOpenXiangda([
    "automation",
    "logs",
    "EXEC_1",
    "--automation",
    "notify_customer",
    "--profile",
    profileName,
    "--json",
  ]),
)
if (executionDetail.id !== "EXEC_1" || executionDetail.nodeExecutionLogs?.[0]?.logs?.[0]?.message !== "sent") {
  throw new Error("automation logs should fetch execution detail")
}

const matchingDataViewDefinition = () => ({
  code: "customer_lookup",
  name: "Customer Lookup",
  description: "",
  base: {
    formUuid: "FORM_CUSTOMER",
    alias: "customer",
  },
  select: [
    {
      field: "customer.form_instance_id",
      as: "customerId",
    },
    {
      field: "customer.name",
      as: "customerName",
    },
  ],
  indexes: [
    {
      fields: ["customerId"],
      unique: true,
    },
  ],
  refresh: {
    mode: "manual",
  },
})

const matchingAggregateDataViewDefinition = () => ({
  code: "customer_stats",
  name: "Customer Stats",
  description: "",
  viewType: "aggregate",
  base: {
    formUuid: "FORM_CUSTOMER",
    alias: "customer",
  },
  dimensions: [
    {
      field: "customer.created_at",
      as: "createdMonth",
      bucket: "month",
    },
  ],
  measures: [
    {
      type: "count",
      as: "customerCount",
    },
  ],
  having: {
    field: "customerCount",
    op: ">",
    value: 0,
  },
  indexes: [
    {
      fields: ["createdMonth"],
    },
  ],
  refresh: {
    mode: "manual",
  },
})

const matchingFunctionDefinition = () => ({
  kind: "app_function",
  version: "function_v1",
  functionCode: "summarize_customer",
  runtimeMode: "trusted_node",
  sourceType: "file_snapshot",
  sourceFile: {
    bucketName: "files",
    objectName: "summarize_customer.cjs",
    sha256: functionBundleHash,
    size: functionBundle.length,
    originalName: "index.cjs",
    contentType: "application/javascript",
  },
  resourceBindings: {
    forms: {
      customer: "FORM_CUSTOMER",
    },
    dataViews: {
      customer_lookup: "customer_lookup",
    },
  },
})

const matchingFunctionResponse = code => ({
  id: "FUNC_1",
  code,
  name: "Summarize Customer",
  description: "",
  definitionJson: matchingFunctionDefinition(),
  resourceBindings: matchingFunctionDefinition().resourceBindings,
  status: "active",
  revision: 7,
  updatedAt: "2026-06-15T10:00:00.000Z",
})

const matchingAutomationDefinition = () => ({
  kind: "automation_code_ts",
  version: "code_v1",
  runtimeMode: "trusted_node",
  sourceType: "file_snapshot",
  scriptCode: "notify_customer",
  sourceFile: {
    bucketName: "files",
    objectName: "notify_customer.cjs",
    sha256: automationBundleHash,
    size: automationBundle.length,
    originalName: "index.cjs",
    contentType: "application/javascript",
  },
  resources: {
    forms: ["customer"],
  },
  timeoutMs: 30000,
  code: "",
  resourceBindings: {
    forms: {
      customer: "FORM_CUSTOMER",
    },
  },
})

const matchingAutomationPreview = () => ({
  kind: "automation_code_preview",
  version: "preview_v1",
  steps: [{ id: "notify", type: "notification", label: "Notify" }],
  edges: [],
})

const matchingAutomationResponse = code => ({
  id: "AUTO_NOTIFY",
  name: "Notify Customer",
  description: "Send customer notification",
  resourceCode: code,
  appType,
  formUuid: null,
  isPublished: true,
  isEnabled: true,
  version: 3,
  updatedAt: "2026-06-15T10:05:00.000Z",
  triggerConfig: {
    version: "trigger_v2",
    mode: "scheduled",
    enabled: true,
    schedule: {
      type: "fixed_time",
      fixedTime: {
        startTime: "2026-06-15T00:00:00+08:00",
        cronExpression: "0 */5 * * * *",
      },
    },
    appType,
  },
  definitionJson: matchingAutomationDefinition(),
  viewJson: matchingAutomationPreview(),
})

const matchingAuthConfigResponse = code => ({
  id: "AUTH_1",
  code,
  name: "Default App Login",
  description: "",
  status: "active",
  configJson: {
    methods: [
      { type: "password", enabled: true, label: "账号密码" },
      {
        type: "phone_code",
        enabled: true,
        label: "手机号验证码",
        ttlSeconds: 300,
        sendFrequencySeconds: 60,
        maxAttempts: 5,
        provider: { functionCode: "summarize_customer" },
      },
    ],
    registration: { mode: "reject" },
    binding: { mode: "auto" },
    matching: {
      keys: ["phone", "email", "externalId", "unionId", "jobNumber", "username"],
    },
  },
})

const matchingRouteResponse = code => ({
  id: "ROUTE_PUBLIC_REGISTER",
  code,
  title: "Public Register",
  kind: "page",
  pathPattern: "/view/:appType/public/register",
  publicAccess: "guest",
  publicPolicyCode: "public_register",
  metaJson: {},
})

const matchingPublicAccessPolicyResponse = code => ({
  id: "PUBLIC_POLICY_REGISTER",
  code,
  name: "Public Register",
  description: "",
  enabled: true,
  mode: "guest",
  routeCode: "public.register",
  pathPattern: "/view/:appType/public/register",
  externalRoleCodes: ["external_visitor"],
  grantsJson: {
    forms: ["FORM_CUSTOMER"],
    dataViews: ["customer_lookup"],
    functions: ["summarize_customer"],
    connectors: [],
  },
  ticketConfigJson: null,
  rateLimitJson: null,
  expiresAt: null,
})

const matchingDataViewResponse = code => {
  if (code === "customer_stats") {
    return {
      id: "DV_STATS",
      code: "customer_stats",
      name: "Customer Stats",
      description: "",
      definition: matchingAggregateDataViewDefinition(),
      refreshConfig: { mode: "manual" },
      materializedViewName: "mv_dv_customer_stats",
      status: "active",
      storageMode: "materialized",
    }
  }
  return {
    id: "DV_1",
    code: "customer_lookup",
    name: "Customer Lookup",
    description: "",
    definition: matchingDataViewDefinition(),
    refreshConfig: { mode: "manual" },
    materializedViewName: "mv_dv_customer_lookup",
    status: "active",
    storageMode: "materialized",
  }
}

const matchingStorageConfigResponse = code => ({
  id: "STORAGE_OSS",
  code,
  name: "Evaluate OSS",
  description: "",
  provider: "oss",
  status: "active",
  configJson: {
    region: "oss-cn-hangzhou",
    bucket: "evaluate-oss",
    publicBaseUrl: "https://evaluate-oss.oss-cn-hangzhou.aliyuncs.com",
    pathPrefix: "openxiangda/{{appType}}/{{yyyy}}/{{MM}}/{{dd}}",
    maxFileSizeMb: 20,
    allowedExtensions: ["txt", "pdf", "png"],
    cors: {
      managed: true,
      allowedOrigins: ["https://platform.example.com"],
      allowedMethods: ["PUT", "GET", "HEAD"],
      allowedHeaders: ["content-type", "x-oss-*"],
      exposeHeaders: ["ETag", "x-oss-request-id"],
      maxAgeSeconds: 600,
    },
  },
  credentials: {
    accessKeyIdSet: true,
    accessKeySecretSet: true,
  },
  corsStatus: {
    managed: true,
    applied: true,
    changed: true,
    ruleCount: 1,
  },
})

try {
  existingRoles = []
  existingMenus = []
  existingNotificationTemplates = []
  existingNotificationTypeConfigs = []
  existingFunctions = []
  existingAutomations = []
  existingAuthConfigs = []
  existingRoutes = []
  existingPublicAccessPolicies = []
  existingDataViews = []
  existingStorageConfigs = []
  existingDataViewPermissionGroups = []
  existingPageGroups = []
  existingFormGroups = []
  await assertAction("empty app role", "role", "manager", "create")
  await assertAction("empty app menu", "menu", "customer_menu", "create")
  const nestedMenuFile = path.join(workspace, "src", "resources", "menus", "menu_tree.json")
  fs.writeFileSync(
    nestedMenuFile,
    `${JSON.stringify(
      {
        menus: [
          {
            code: "nested_root",
            name: "Nested Root",
            type: "nav",
            children: [
              {
                code: "nested_child",
                name: "Nested Child",
                type: "display",
                path: "/view/:appType/nested",
                routeCode: "nested.home",
              },
            ],
          },
        ],
      },
      null,
      2,
    )}\n`,
  )
  await assertAction("nested menu child", "menu", "nested_child", "create")
  fs.rmSync(nestedMenuFile, { force: true })
  await assertAction("empty notification template", "notificationTemplate", "reservation_reminder", "create")
  await assertAction("empty notification type config", "notificationTypeConfig", "reservation_reminder", "create")
  await assertAction("empty function", "function", "summarize_customer", "create")
  await assertAction("empty automation", "automation", "notify_customer", "create")
  await assertAction("empty auth config", "authConfig", "default", "create")
  await assertAction("empty route", "route", "public.register", "create")
  await assertAction("empty public access policy", "publicAccessPolicy", "public_register", "create")
  await assertAction("empty data view", "dataView", "customer_lookup", "create")
  await assertAction("empty aggregate data view", "dataView", "customer_stats", "create")
  await assertAction("empty storage config", "storageConfig", "evaluate_oss", "create")

  existingRoles = [
    {
      id: "role-1",
      code: "manager",
      name: "Manager",
      description: "full",
    },
  ]
  existingMenus = [
    {
      id: "MENU_CUSTOMER",
      resourceCode: "customer_menu",
      name: "Customers",
      type: "receipt",
      formUuid: "FORM_CUSTOMER",
      parentId: "MENU_ROOT",
      sortOrder: 5,
      icon: "user",
      isHidden: false,
    },
  ]
  existingNotificationTemplates = [
    {
      id: "TPL_1",
      code: "reservation_reminder",
      name: "Reservation Reminder",
      content: "{{title}}",
      level: "app",
      channelsConfig: {
        inapp: {
          enabled: true,
          content: "{{title}}",
        },
      },
      variables: ["title"],
      enabled: true,
      priority: 0,
      description: "",
    },
  ]
  existingNotificationTypeConfigs = [
    {
      id: "CFG_1",
      notificationType: "reservation_reminder",
      level: "app",
      templateId: "TPL_1",
      template: {
        code: "reservation_reminder",
      },
      enabled: true,
      priority: 0,
      description: "",
    },
  ]
  existingFunctions = [matchingFunctionResponse("summarize_customer")]
  existingAutomations = [matchingAutomationResponse("notify_customer")]
  existingAuthConfigs = [matchingAuthConfigResponse("default")]
  existingRoutes = [matchingRouteResponse("public.register")]
  existingPublicAccessPolicies = [matchingPublicAccessPolicyResponse("public_register")]
  existingStorageConfigs = [matchingStorageConfigResponse("evaluate_oss")]
  existingDataViews = [
    {
      id: "DV_1",
      code: "customer_lookup",
      name: "Customer Lookup",
      description: "",
      definition: matchingDataViewDefinition(),
      refreshConfig: { mode: "manual" },
      materializedViewName: "mv_dv_customer_lookup",
      status: "active",
      storageMode: "materialized",
    },
    {
      id: "DV_STATS",
      code: "customer_stats",
      name: "Customer Stats",
      description: "",
      definition: matchingAggregateDataViewDefinition(),
      refreshConfig: { mode: "manual" },
      materializedViewName: "mv_dv_customer_stats",
      status: "active",
      storageMode: "materialized",
    },
  ]
  existingDataViewPermissionGroups = [
    {
      id: "DVPG_1",
      dataViewCode: "customer_lookup",
      resourceCode: "customer_lookup_query",
      name: "Customer Lookup Query",
      roles: ["manager"],
      operations: ["query"],
    },
  ]
  existingPageGroups = [
    {
      id: "PAGE_GROUP_1",
      resourceCode: "sales_pages",
      name: "Sales Pages",
      roles: ["manager"],
      menuFormUuids: ["FORM_CUSTOMER"],
      menuCodes: ["customer_menu"],
      routeCodes: [],
      pathPatterns: [],
    },
  ]
  existingFormGroups = [
    {
      id: "FORM_GROUP_1",
      resourceCode: "customer_view",
      formUuid: "FORM_CUSTOMER",
      name: "Customer View",
      type: "view",
      roles: ["manager"],
      dataScope: [{ type: "self" }],
      operations: ["view"],
    },
  ]
  await assertAction("matching role", "role", "manager", "noop")
  fs.writeFileSync(
    path.join(workspace, "src", "resources", "roles", "manager.json"),
    `${JSON.stringify(
      {
        code: "manager",
        name: "Manager",
        description: "full",
        apiPermissionCodes: ["app:login-log:read"],
      },
      null,
      2,
    )}\n`,
  )
  existingRoleApiPermissions = []
  await assertAction("missing role api permission", "role", "manager", "update")
  existingRoleApiPermissions = [
    {
      id: "API_LOGIN_LOG_READ",
      code: "app:login-log:read",
      name: "Read login logs",
      scope: "app",
      appType,
    },
  ]
  await assertAction("matching role api permission", "role", "manager", "noop")
  await assertAction("matching menu", "menu", "customer_menu", "noop")
  await assertAction("matching notification template", "notificationTemplate", "reservation_reminder", "noop")
  await assertAction("matching notification type config", "notificationTypeConfig", "reservation_reminder", "noop")
  await assertAction("matching function", "function", "summarize_customer", "noop")
  await assertAction("matching automation", "automation", "notify_customer", "noop")
  fs.rmSync(automationBundlePath, { force: true })
  await assertAction("matching automation after missing bundle rebuild", "automation", "notify_customer", "noop")
  if (!fs.existsSync(automationBundlePath)) {
    throw new Error("resource plan should rebuild missing local automation bundle")
  }
  await assertAction("matching auth config", "authConfig", "default", "noop")
  await assertAction("matching route", "route", "public.register", "noop")
  await assertAction("matching public access policy", "publicAccessPolicy", "public_register", "noop")
  await assertAction("matching data view", "dataView", "customer_lookup", "noop")
  await assertAction("matching aggregate data view", "dataView", "customer_stats", "noop")
  await assertAction("matching storage config", "storageConfig", "evaluate_oss", "noop")
  await assertAction("matching page group", "pagePermissionGroup", "sales_pages", "noop")
  await assertAction("matching form group", "formPermissionGroup", "customer_view", "noop")

  existingRoles = [
    {
      id: "role-1",
      code: "manager",
      name: "Old Manager",
      description: "full",
    },
  ]
  existingMenus = [
    {
      ...existingMenus[0],
      sortOrder: 9,
    },
  ]
  existingNotificationTemplates = [
    {
      ...existingNotificationTemplates[0],
      content: "{{oldTitle}}",
    },
  ]
  existingNotificationTypeConfigs = [
    {
      ...existingNotificationTypeConfigs[0],
      enabled: false,
    },
  ]
  existingDataViews = [
    {
      ...existingDataViews[0],
      name: "Old Customer Lookup",
    },
    existingDataViews[1],
  ]
  existingFunctions = [
    {
      ...existingFunctions[0],
      name: "Old Function",
    },
  ]
  existingAutomations = [
    {
      ...existingAutomations[0],
      name: "Old Automation",
    },
  ]
  existingAuthConfigs = [
    {
      ...existingAuthConfigs[0],
      name: "Old App Login",
    },
  ]
  existingRoutes = [
    {
      ...existingRoutes[0],
      title: "Old Public Register",
    },
  ]
  existingPublicAccessPolicies = [
    {
      ...existingPublicAccessPolicies[0],
      grantsJson: {
        ...existingPublicAccessPolicies[0].grantsJson,
        functions: [],
      },
    },
  ]
  existingStorageConfigs = [
    {
      ...existingStorageConfigs[0],
      configJson: {
        ...existingStorageConfigs[0].configJson,
        pathPrefix: "legacy/{{appType}}",
      },
    },
  ]
  existingPageGroups = [
    {
      ...existingPageGroups[0],
      roles: [],
    },
  ]
  existingFormGroups = [
    {
      ...existingFormGroups[0],
      operations: [],
    },
  ]
  await assertAction("changed role", "role", "manager", "update")
  await assertAction("changed menu", "menu", "customer_menu", "update")
  await assertAction("changed notification template", "notificationTemplate", "reservation_reminder", "update")
  await assertAction("changed notification type config", "notificationTypeConfig", "reservation_reminder", "update")
  await assertAction("changed function", "function", "summarize_customer", "update")
  await assertAction("changed automation", "automation", "notify_customer", "update")
  await assertAction("changed auth config", "authConfig", "default", "update")
  await assertAction("changed route", "route", "public.register", "update")
  await assertAction("changed public access policy", "publicAccessPolicy", "public_register", "update")
  await assertAction("changed data view", "dataView", "customer_lookup", "update")
  await assertAction("unchanged aggregate data view", "dataView", "customer_stats", "noop")
  await assertAction("changed storage config", "storageConfig", "evaluate_oss", "update")
  await assertAction("changed page group", "pagePermissionGroup", "sales_pages", "update")
  await assertAction("changed form group", "formPermissionGroup", "customer_view", "update")

  const concurrencyPlan = await runPlan()
  const functionConcurrencyAction = concurrencyPlan.actions.find(
    item => item.kind === "function" && item.code === "summarize_customer",
  )
  const automationConcurrencyAction = concurrencyPlan.actions.find(
    item => item.kind === "automation" && item.code === "notify_customer",
  )
  if (
    functionConcurrencyAction?.expectedRevision !== 7 ||
    functionConcurrencyAction?.expectedUpdatedAt !== "2026-06-15T10:00:00.000Z" ||
    automationConcurrencyAction?.expectedVersion !== 3 ||
    automationConcurrencyAction?.expectedUpdatedAt !== "2026-06-15T10:05:00.000Z"
  ) {
    throw new Error("resource plan should retain function/automation concurrency baselines")
  }

  functionUpdateBodies = []
  automationUpdateBodies = []
  await runOpenXiangda([
    "resource",
    "publish",
    "function,automation",
    "--only",
    "summarize_customer,notify_customer",
    "--profile",
    profileName,
    "--json",
  ])
  if (
    functionUpdateBodies.at(-1)?.expectedRevision !== 7 ||
    functionUpdateBodies.at(-1)?.expectedUpdatedAt !== "2026-06-15T10:00:00.000Z"
  ) {
    throw new Error("resource publish should send function update preconditions from its plan")
  }
  if (
    automationUpdateBodies.at(-1)?.expectedVersion !== 3 ||
    automationUpdateBodies.at(-1)?.expectedUpdatedAt !== "2026-06-15T10:05:00.000Z"
  ) {
    throw new Error("resource publish should send automation update preconditions from its plan")
  }

  const remoteFunction = matchingFunctionResponse("summarize_customer")
  const remoteFunctionBindings = {
    ...remoteFunction.resourceBindings,
    forms: {
      ...remoteFunction.resourceBindings.forms,
      mentor_proxy_relation: "FORM_REMOTE_PROXY",
    },
  }
  remoteFunction.resourceBindings = remoteFunctionBindings
  remoteFunction.definitionJson = {
    ...remoteFunction.definitionJson,
    resourceBindings: remoteFunctionBindings,
  }
  const remoteAutomation = matchingAutomationResponse("notify_customer")
  const remoteAutomationBindings = {
    ...remoteAutomation.definitionJson.resourceBindings,
    forms: {
      ...remoteAutomation.definitionJson.resourceBindings.forms,
      mentor_proxy_relation: "FORM_REMOTE_PROXY",
    },
  }
  remoteAutomation.definitionJson = {
    ...remoteAutomation.definitionJson,
    resourceBindings: remoteAutomationBindings,
  }
  existingFunctions = [remoteFunction]
  existingAutomations = [remoteAutomation]
  functionUpdateBodies = []
  automationUpdateBodies = []
  const sourcePatchResult = JSON.parse(
    await runOpenXiangda([
      "resource",
      "publish",
      "function,automation",
      "--only",
      "summarize_customer,notify_customer",
      "--profile",
      profileName,
      "--json",
    ]),
  )
  if (
    functionUpdateBodies.at(-1)?.resourceBindings?.forms?.mentor_proxy_relation !==
      "FORM_REMOTE_PROXY" ||
    functionUpdateBodies.at(-1)?.definitionJson?.resourceBindings?.forms
      ?.mentor_proxy_relation !== "FORM_REMOTE_PROXY"
  ) {
    throw new Error("source-only Function publish must preserve newer remote bindings")
  }
  if (
    automationUpdateBodies.at(-1)?.definitionJson?.resourceBindings?.forms
      ?.mentor_proxy_relation !== "FORM_REMOTE_PROXY"
  ) {
    throw new Error("source-only Automation publish must preserve newer remote bindings")
  }
  for (const [kind, code] of [
    ["function", "summarize_customer"],
    ["automation", "notify_customer"],
  ]) {
    const published = sourcePatchResult.published.find(
      item => item.kind === kind && item.code === code,
    )
    if (
      published?.writeMode !== "source-patch" ||
      published?.sourcePatchTransport !== "compat-merge"
    ) {
      throw new Error(`${kind}:${code} should report compat-merge source-patch mode`)
    }
  }

  functionSourcePatchBodies = []
  automationSourcePatchBodies = []
  const fieldPatchResult = JSON.parse(
    await runOpenXiangda([
      "resource",
      "publish",
      "function,automation",
      "--only",
      "summarize_customer,notify_customer",
      "--publish-lease-id",
      "LEASE_RESOURCE_PLAN_SMOKE",
      "--profile",
      profileName,
      "--json",
    ]),
  )
  const functionSourcePatch = functionSourcePatchBodies.at(-1)
  if (
    functionSourcePatch?.publishLeaseId !== "LEASE_RESOURCE_PLAN_SMOKE" ||
    functionSourcePatch?.baseSourceHash !== functionBundleHash ||
    !functionSourcePatch?.sourceFile?.sha256
  ) {
    throw new Error("Function source patch should carry lease, source baseline, and snapshot")
  }
  for (const forbidden of [
    "name",
    "description",
    "definitionJson",
    "resourceBindings",
    "inputSchema",
    "outputSchema",
    "status",
  ]) {
    if (Object.prototype.hasOwnProperty.call(functionSourcePatch, forbidden)) {
      throw new Error(`Function source PATCH must not send ${forbidden}`)
    }
  }
  const fieldPatchedFunction = fieldPatchResult.published.find(
    item => item.kind === "function" && item.code === "summarize_customer",
  )
  if (
    fieldPatchedFunction?.writeMode !== "source-patch" ||
    fieldPatchedFunction?.sourcePatchTransport !== "field-patch"
  ) {
    throw new Error("Function should report server field-patch transport")
  }
  const automationSourcePatch = automationSourcePatchBodies.at(-1)
  const automationSource = automationSourcePatch?.sources?.[0]
  if (
    automationSourcePatch?.publishLeaseId !== "LEASE_RESOURCE_PLAN_SMOKE" ||
    automationSourcePatch?.expectedVersion !== 3 ||
    automationSourcePatch?.expectedUpdatedAt !== "2026-06-15T10:05:00.000Z" ||
    automationSource?.baseSourceHash !== automationBundleHash ||
    !automationSource?.sourceFile?.sha256 ||
    Object.prototype.hasOwnProperty.call(automationSource || {}, "nodeId")
  ) {
    throw new Error(
      "Automation source patch should carry lease, concurrency baseline, and one top-level source snapshot",
    )
  }
  for (const forbidden of [
    "resourceCode",
    "name",
    "description",
    "formUuid",
    "triggerConfig",
    "definitionJson",
    "viewJson",
    "tags",
    "isEnabled",
    "resourceBindings",
  ]) {
    if (Object.prototype.hasOwnProperty.call(automationSourcePatch, forbidden)) {
      throw new Error(`Automation source PATCH must not send ${forbidden}`)
    }
  }
  const fieldPatchedAutomation = fieldPatchResult.published.find(
    item => item.kind === "automation" && item.code === "notify_customer",
  )
  if (
    fieldPatchedAutomation?.writeMode !== "source-patch" ||
    fieldPatchedAutomation?.sourcePatchTransport !== "field-patch"
  ) {
    throw new Error("Automation should report server field-patch transport")
  }

  functionUpdateBodies = []
  automationUpdateBodies = []
  const manifestReplaceResult = JSON.parse(
    await runOpenXiangda([
      "resource",
      "publish",
      "function,automation",
      "--only",
      "summarize_customer,notify_customer",
      "--replace-manifest",
      "--reason",
      "explicit manifest replacement smoke coverage",
      "--profile",
      profileName,
      "--json",
    ]),
  )
  if (
    functionUpdateBodies.at(-1)?.resourceBindings?.forms?.mentor_proxy_relation ||
    functionUpdateBodies.at(-1)?.definitionJson?.resourceBindings?.forms
      ?.mentor_proxy_relation ||
    automationUpdateBodies.at(-1)?.definitionJson?.resourceBindings?.forms
      ?.mentor_proxy_relation
  ) {
    throw new Error("explicit manifest replacement should use the local manifest definition")
  }
  for (const [kind, code] of [
    ["function", "summarize_customer"],
    ["automation", "notify_customer"],
  ]) {
    const published = manifestReplaceResult.published.find(
      item => item.kind === kind && item.code === code,
    )
    if (published?.writeMode !== "manifest-replace") {
      throw new Error(`${kind}:${code} should report manifest-replace write mode`)
    }
  }

  existingDataViews = [
    {
      ...existingDataViews[0],
      name: "Customer Lookup",
    },
    existingDataViews[1],
  ]
  existingFunctions = [matchingFunctionResponse("summarize_customer")]
  existingAutomations = [matchingAutomationResponse("notify_customer")]
  existingAuthConfigs = [matchingAuthConfigResponse("default")]
  existingRoutes = [matchingRouteResponse("public.register")]
  existingPublicAccessPolicies = [matchingPublicAccessPolicyResponse("public_register")]
  existingDataViewPermissionGroups = [
    {
      ...existingDataViewPermissionGroups[0],
      roles: [],
    },
  ]
  await assertAction("changed data view permission groups", "dataView", "customer_lookup", "update")

  publishCalls = []
  formBundleBodies = []
  const publishResult = JSON.parse(
    await runOpenXiangda([
      "resource",
      "publish",
      "--all",
      "--reason",
      "resource plan smoke covers the full manifest",
      "--profile",
      profileName,
      "--json",
    ]),
  )
  const publishedAction = (kind, code) =>
    (publishResult.published || []).find(item => item.kind === kind && item.code === code)?.action
  const assertNoopSkipped = (kind, code) => {
    if (publishedAction(kind, code) !== "noop") {
      throw new Error(`resource publish should report ${kind}:${code} as noop when skipping writes`)
    }
  }
  if (
    publishCalls[0] !== "notificationTemplate" ||
    publishCalls[1] !== "notificationTypeConfig"
  ) {
    throw new Error("resource publish should publish notification templates before type configs")
  }
  const functionPublishIndex = publishCalls.indexOf("function")
  const authConfigPublishIndex = publishCalls.indexOf("authConfig")
  const routePublishIndex = publishCalls.indexOf("route")
  const automationPublishIndex = publishCalls.indexOf("automation")
  const dataViewPublishIndex = publishCalls.indexOf("dataView")
  const dataViewPermissionGroupPublishIndex = publishCalls.indexOf("dataViewPermissionGroup")
  const storageConfigPublishIndex = publishCalls.indexOf("storageConfig")
  const publicAccessPolicyPublishIndex = publishCalls.indexOf("publicAccessPolicy")
  if (functionPublishIndex < 0) {
    assertNoopSkipped("function", "summarize_customer")
  } else if (dataViewPublishIndex < 0 || functionPublishIndex > dataViewPublishIndex) {
    throw new Error("resource publish should publish functions before data views")
  }
  if (authConfigPublishIndex < 0) {
    assertNoopSkipped("authConfig", "default")
  } else if (functionPublishIndex >= 0 && functionPublishIndex > authConfigPublishIndex) {
    throw new Error("resource publish should publish functions before auth configs")
  }
  if (routePublishIndex < 0) {
    assertNoopSkipped("route", "public.register")
  } else if (authConfigPublishIndex >= 0 && authConfigPublishIndex > routePublishIndex) {
    throw new Error("resource publish should publish routes after auth configs")
  }
  if (automationPublishIndex < 0) {
    assertNoopSkipped("automation", "notify_customer")
  } else if (
    (routePublishIndex >= 0 && routePublishIndex > automationPublishIndex) ||
    (dataViewPublishIndex >= 0 && automationPublishIndex > dataViewPublishIndex)
  ) {
    throw new Error("resource publish should publish automations after routes and before data views")
  }
  if (dataViewPermissionGroupPublishIndex < 0 || dataViewPublishIndex > dataViewPermissionGroupPublishIndex) {
    throw new Error("resource publish should replace data view permission groups after data views")
  }
  if (storageConfigPublishIndex < 0) {
    throw new Error("resource publish should publish changed storage configs")
  }
  if (
    dataViewPermissionGroupPublishIndex >= 0 &&
    dataViewPermissionGroupPublishIndex > storageConfigPublishIndex
  ) {
    throw new Error("resource publish should publish storage configs after data view groups")
  }
  if (publicAccessPolicyPublishIndex < 0) {
    assertNoopSkipped("publicAccessPolicy", "public_register")
  } else if (
    (dataViewPublishIndex >= 0 && dataViewPublishIndex > publicAccessPolicyPublishIndex) ||
    storageConfigPublishIndex > publicAccessPolicyPublishIndex
  ) {
    throw new Error("resource publish should publish public access policies after data views and storage configs")
  }
  const stagedFormGroup = (publishResult.published || []).find(
    item =>
      item.kind === "formPermissionGroup" &&
      item.code === "customer_view",
  )
  if (
    stagedFormGroup?.action !== "stage" ||
    stagedFormGroup?.stagedResource?.kind !== "FormRelease" ||
    formBundleBodies.length !== 1 ||
    formBundleBodies[0]?.settings?.openxiangdaResourceCode !== "customer" ||
    formBundleBodies[0]?.permissionGroups?.[0]?.resourceCode !==
      "customer_view"
  ) {
    throw new Error(
      "form permission groups must stage inside one immutable FormRelease",
    )
  }

  await runOpenXiangda(["resource", "pull", "--profile", profileName, "--json"])
  const pulledMenu = JSON.parse(
    fs.readFileSync(
      path.join(workspace, "src", "resources", "menus", "customer_menu.json"),
      "utf8",
    ),
  )
  if (
    pulledMenu.formCode !== "customer" ||
    pulledMenu.parentCode !== "root" ||
    pulledMenu.formUuid ||
    pulledMenu.parentId
  ) {
    throw new Error("resource pull should write code-first menu references")
  }
  const pulledFormSetting = JSON.parse(
    fs.readFileSync(
      path.join(workspace, "src", "resources", "settings", "forms", "customer.json"),
      "utf8",
    ),
  )
  if (pulledFormSetting.formCode !== "customer" || pulledFormSetting.formUuid) {
    throw new Error("resource pull should write code-first form settings")
  }
  const pulledNotificationTemplate = JSON.parse(
    fs.readFileSync(
      path.join(
        workspace,
        "src",
        "resources",
        "notifications",
        "templates",
        "reservation_reminder.json",
      ),
      "utf8",
    ),
  )
  if (
    pulledNotificationTemplate.templates?.[0]?.code !== "reservation_reminder" ||
    pulledNotificationTemplate.templates?.[0]?.appType
  ) {
    throw new Error("resource pull should write notification templates without appType")
  }
  const pulledDataView = JSON.parse(
    fs.readFileSync(
      path.join(workspace, "src", "resources", "data-views", "customer_lookup.json"),
      "utf8",
    ),
  )
  if (pulledDataView.storageMode !== "materialized") {
    throw new Error("resource pull should write data view storageMode")
  }
  const pulledFunction = JSON.parse(
    fs.readFileSync(
      path.join(workspace, "src", "resources", "functions", "summarize_customer.json"),
      "utf8",
    ),
  )
  if (
    pulledFunction.definitionJson?.resourceBindings?.forms?.customer !== "FORM_CUSTOMER" ||
    pulledFunction.status !== "active"
  ) {
    throw new Error("resource pull should write app functions with resource bindings")
  }
  const pulledAuthConfig = JSON.parse(
    fs.readFileSync(
      path.join(workspace, "src", "resources", "auth", "default.json"),
      "utf8",
    ),
  )
  if (
    pulledAuthConfig.id ||
    pulledAuthConfig.configJson?.methods?.[1]?.provider?.functionCode !== "summarize_customer" ||
    pulledAuthConfig.configJson?.registration?.mode !== "reject"
  ) {
    throw new Error("resource pull should write auth configs without platform ids")
  }
  const pulledRoute = JSON.parse(
    fs.readFileSync(
      path.join(workspace, "src", "resources", "routes", "public.register.json"),
      "utf8",
    ),
  )
  if (
    pulledRoute.pathPattern !== "/view/:appType/public/register" ||
    pulledRoute.publicPolicyCode !== "public_register"
  ) {
    throw new Error("resource pull should write public route resources")
  }
  const pulledPublicPolicy = JSON.parse(
    fs.readFileSync(
      path.join(workspace, "src", "resources", "public-access", "public_register.json"),
      "utf8",
    ),
  )
  if (
    pulledPublicPolicy.grants?.formCodes?.[0] !== "customer" ||
    pulledPublicPolicy.grants?.forms ||
    pulledPublicPolicy.externalRoleCodes?.[0] !== "external_visitor"
  ) {
    throw new Error("resource pull should write public access grants with code-first form references")
  }
  if (
    pulledDataView.definition?.base?.formCode !== "customer" ||
    pulledDataView.definition?.base?.formUuid ||
    pulledDataView.permissionGroups?.[0]?.dataViewCode
  ) {
    throw new Error("resource pull should write data views with code-first form references")
  }
  const pulledStorageConfig = JSON.parse(
    fs.readFileSync(
      path.join(workspace, "src", "resources", "storage", "evaluate_oss.json"),
      "utf8",
    ),
  )
  if (
    pulledStorageConfig.configJson?.bucket !== "evaluate-oss" ||
    pulledStorageConfig.configJson?.cors?.managed !== true ||
    pulledStorageConfig.configJson?.cors?.allowedOrigins?.[0] !== "https://platform.example.com" ||
    pulledStorageConfig.corsStatus ||
    pulledStorageConfig.credentials ||
    pulledStorageConfig.secretJson ||
    pulledStorageConfig.credentialStatus?.accessKeySecretSet !== true
  ) {
    throw new Error("resource pull should write storage configs without OSS secrets")
  }
  const pulledAggregateDataView = JSON.parse(
    fs.readFileSync(
      path.join(workspace, "src", "resources", "data-views", "customer_stats.json"),
      "utf8",
    ),
  )
  if (
    pulledAggregateDataView.definition?.viewType !== "aggregate" ||
    pulledAggregateDataView.definition?.base?.formCode !== "customer" ||
    pulledAggregateDataView.definition?.base?.formUuid
  ) {
    throw new Error("resource pull should write aggregate data views with code-first form references")
  }

  console.log("resource plan smoke passed")
} finally {
  server.close()
  fs.rmSync(tempRoot, { recursive: true, force: true })
}
