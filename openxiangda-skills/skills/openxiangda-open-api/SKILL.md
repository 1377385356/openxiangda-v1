---
name: openxiangda-open-api
description: "Build or maintain external backend and third-party system integrations against the private low-code platform DingTalk-compatible Open API. Use for /dingtalk-api/v1.0, AK/SK, appKey/appSecret, x-acs-dingtalk-access-token, backend token caching, OpenAPI contract lookup, organization sync, external form/workflow calls, or one-time Open API credential management."
---

# OpenXiangda Open API

Use this skill only for external backend services and third-party integrations. Keep normal OpenXiangda CLI, workspace, page, form, workflow, automation, and App Function development on `/openxiangda-api/v1` with the logged-in user's token.

## Required workflow

1. Inspect the target backend's language, HTTP client, configuration system, deployment model, and existing secret store.
2. Run `openxiangda open-api spec list --search <keyword> --json`, then `openxiangda open-api spec describe <operationId|path> --method <method> --json`. Implement the exact request and response schemas returned; do not guess DTO fields or unwrap shapes.
3. Read [references/backend-authentication.md](references/backend-authentication.md) before adding credentials or token code.
4. Reuse an existing API credential when the user identifies one. Otherwise list credentials first. Create, update, or rotate only after explicit user authorization and only with a platform-admin profile.
5. Hand AK/SK directly to the backend's approved secret store. Never persist them in OpenXiangda profile or workspace state.
6. Implement token acquisition and caching inside the backend application. OpenXiangda must not cache or renew the backend's Open API token.
7. Add contract tests for request serialization, business-envelope errors, token expiry, one retry after 401, and concurrent refresh behavior.

## Contract lookup

Prefer the CLI index so the 15,000-line specification is not loaded wholesale:

```bash
openxiangda open-api spec tags --json
openxiangda open-api spec list --tag "表单与菜单" --json
openxiangda open-api spec list --search submitFormData --json
openxiangda open-api spec describe /dingtalk-api/v1.0/forms/submitFormData --method post --json
```

The bundled source contract is [references/dingtalk-api.openapi.json](references/dingtalk-api.openapi.json). Read or query it directly only when the CLI view is insufficient.

## Credential management

Use the normal OpenXiangda login token only for the platform-admin management API:

```bash
openxiangda open-api credential list --profile dev --json
openxiangda open-api credential get <id> --profile dev --json
openxiangda open-api credential create --name "Backend Integration" --profile dev --yes --show-secret --json
openxiangda open-api credential update <id> --description "..." --profile dev --json
openxiangda open-api credential rotate-secret <id> --profile dev --yes --show-secret --json
```

- Treat create, update, and rotation as live platform writes. Obtain explicit authorization first.
- Keep secrets redacted unless performing an authorized handoff to the backend secret store.
- Stop on a platform-admin permission error. Do not bypass it and do not ask the user to paste AK/SK into chat.
- Do not treat the API application's `permissions` or `ipWhitelist` fields as enforced authorization. The current middleware authenticates the access token and tenant; use network controls and backend authorization independently.

## Backend rules

- Build the service base as `<platform-origin>/service`; call `/dingtalk-api/v1.0` beneath it.
- Keep AK/SK and access tokens server-side. Never put them in browser bundles, mobile apps, public runtime config, source control, logs, traces, or error payloads.
- Exchange AK/SK at `POST /dingtalk-api/v1.0/oauth2/accessToken`; send the returned token as `x-acs-dingtalk-access-token`.
- Cache until shortly before `expireIn`, single-flight concurrent refreshes, and retry one time after a 401 with a newly acquired token.
- Inspect both HTTP status and the endpoint's documented business response. Most endpoints use `{ code, message, data }`, the token endpoint does not on success, and workflow callback success may use `code: 0`.
- Supply `userId`, `systemToken`, `appType`, or other actor/application context only when the selected operation schema requires it.
