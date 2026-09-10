# Workspace State

OpenXiangda durable project bindings live in `.openxiangda/state.json`. Volatile release execution, candidate, deployment, and recovery progress lives under the private `.openxiangda/releases/` journal and must not be copied into the durable ID map.

Tokens are private workspace files and must never be committed. User tokens live in `.openxiangda/profiles.json`. Shared workspace env values such as `APP_OSS_*` live in `~/.openxiangda/.env` by default, while project `.env` is only a local override.

## Shape

```json
{
  "version": 1,
  "profiles": {
    "dev": {
      "baseUrl": "https://dev-lowcode.example.com/service",
      "appType": "APP_DEV",
      "resources": {
        "forms": {
          "customer": {
            "formUuid": "FORM_XXX"
          }
        },
        "pages": {
          "dashboard": {
            "pageId": "PAGE_XXX",
            "routeKey": "dashboard",
            "legacyFormUuid": "FORM_LEGACY_PAGE"
          }
        },
        "workflows": {},
        "automations": {},
        "menus": {},
        "roles": {},
        "connectors": {},
        "dataViews": {
          "ticket_with_customer": {
            "dataViewId": "DV_XXX",
            "materializedViewName": "mv_dv_abc123",
            "status": "active"
          }
        },
        "notifications": {
          "templates": {},
          "typeConfigs": {}
        },
        "pagePermissionGroups": {},
        "formPermissionGroups": {},
        "formSettings": {}
      }
    }
  }
}
```

Environment-managed workspaces add a logical application and target-specific bindings. The legacy `profiles` map may remain for compatibility, but managed commands resolve only the selected target:

```json
{
  "version": 1,
  "logicalApp": {
    "id": "ENVSET_UUID",
    "code": "instrument-sharing",
    "name": "大型仪器共享"
  },
  "currentTarget": "preproduction",
  "targets": {
    "preproduction": {
      "profile": "instrument-example",
      "environmentId": "PRE_ENV_UUID",
      "kind": "preproduction",
      "appType": "APP_PRE",
      "revision": 4,
      "sideEffectPolicy": {
        "notifications": "tester_allowlist",
        "notificationAllowlist": [],
        "organizationWrites": "deny",
        "scheduledAutomations": "disabled",
        "externalWrites": "allowlist",
        "payments": "deny",
        "publicIndexing": "deny",
        "environmentBanner": true
      },
      "resources": {}
    },
    "production": {
      "profile": "instrument-example",
      "environmentId": "PROD_ENV_UUID",
      "kind": "production",
      "appType": "APP_PROD",
      "resources": {}
    }
  }
}
```

## Rules

- Profile is the deployment boundary.
- For an environment-managed logical application, the selected target is the deployment boundary inside the profile. `preproduction` and `production` own independent appType, resource IDs, Release Heads, data, and side-effect policy. Their volatile deployment progress is isolated in `.openxiangda/releases/targets/`.
- `baseUrl` is the backend API base. On standard private deployments it is `<origin>/service`; management pages use `/platform`, and app runtime pages use `/view`.
- Local state is authoritative for app binding. If a workspace has no `appType` for the target profile, create a new app/workspace with `openxiangda workspace init <dir> --profile <name> --app-name "应用名称"`.
- Do not search platform apps or reuse similar names unless the user explicitly asks to reuse an existing app or provides an `appType`.
- Local resource keys are logical codes.
- Live IDs and lightweight runtime aliases are nested under the profile that produced them.
- `resources.dataViews` is keyed by data view `code` and stores only profile-local platform metadata such as `dataViewId`, `materializedViewName`, and last known `status`.
- The stored DataView `status` is observational: managed staging legitimately moves it between `draft` and `active`. Candidate binding validation ignores only that field, including for older sealed candidates, while keeping `dataViewId`, `materializedViewName`, `storageMode`, and all non-DataView status fields strict.
- Data view definitions, refresh config, permissions, and source `formCode` references belong in `src/resources/data-views/*.json`, not in state.
- Do not store business configuration or secrets in `.openxiangda/state.json`; store those in `src/resources/`.
- CLI writes use a lock, a three-way merge at profile/resource-key granularity, and fsync + atomic rename. Concurrent writes to different profiles or logical resource keys are preserved; competing writes to the same field fail with `OPENXIANGDA_STATE_CONFLICT` and must be retried from a freshly loaded state.
- This protects the ID map from truncation/lost updates. Concurrent development still uses separate Git worktrees/branches; `.openxiangda/worktree-owner.json` binds one worktree to one active `CODEX_THREAD_ID` and blocks a second task at SDD context/publish time.
- A prod publish must not read dev IDs.
- Never copy target resource bindings. Use `openxiangda environment use <target>` or pass `--environment <target>` and let the CLI populate that target from its own deployment.
- Managed targets cannot use direct `release publish`; use `release ship`. The normal first invocation prepares preproduction and stops, while a later `--confirm-production` promotes the same sealed candidate. Explicitly authorized emergencies may place `--confirm-production` on the first invocation to run both ordered phases in one command. The candidate freezes stable environment/resource bindings and target-specific Runtime artifacts, and both server deployments must finish as `succeeded`. A frozen baseline-adoption intent is reused from `ship.json`; a different repeated intent fails before a request. Human acceptance is recommended and may be recorded with optional `--acceptance-note`.
- In a managed workspace with multiple targets, `function invoke` must include `--environment <target>` and reports the resolved target on stderr before sending the request.
- Change a single target's side-effect policy with `openxiangda environment policy update <kind|id> --side-effect-policy-json <JSON|file> --reason "..." --dry-run`, inspect the exact diff, then repeat without `--dry-run`. The write uses the server revision as CAS and updates local `revision`; it does not swap roles or alter Release Heads. Omitted fields are preserved unless `--full-replace` is explicit, and production additionally requires `--confirm-production`.
- Before publishing to another platform, run `openxiangda workspace bind --profile <name> --app-type <APP_XXX>`.
