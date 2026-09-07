# Backend authentication and token lifecycle

## API selection

- Use `/openxiangda-api/v1` for OpenXiangda CLI and low-code app development with a normal platform-user token.
- Use `/dingtalk-api/v1.0` for an external backend or third-party system that owns an AK/SK credential.
- Resolve a copied root, `/platform`, or `/view` URL to `<origin>/service` before appending either API namespace.

## Create or retrieve AK/SK

The API application management endpoints are platform-admin APIs authenticated by the current OpenXiangda profile's normal Bearer token. They are not part of `/dingtalk-api/v1.0`:

| Operation | Request | Secret behavior |
| --- | --- | --- |
| `GET /api/dingtalk-apps` | no body | lists IDs and AKs; never returns SK |
| `POST /api/dingtalk-apps` | `{ name, description?, permissions? }` | creates and can return AK/SK |
| `GET /api/dingtalk-apps/:id` | no body | detail can return the existing AK/SK |
| `POST /api/dingtalk-apps/:id` | `{ name?, description?, permissions? }` | updates metadata; no SK |
| `POST /api/dingtalk-apps/:id/regenerate-secret` | `{}` | invalidates the old SK and returns the new one |

Prefer the `openxiangda open-api credential ...` wrappers. They redact `appSecret` unless `--show-secret` is explicit and never store it locally. Creation requires `--yes`; rotation requires both `--yes` and `--show-secret`.

The authenticated user must be a platform administrator. If the platform reports a permission failure, stop and ask an administrator to perform or authorize the operation. Never bypass the permission check.

## Exchange AK/SK for an access token

Send JSON to the service base:

```http
POST /dingtalk-api/v1.0/oauth2/accessToken
Content-Type: application/json

{"appKey":"ak_...","appSecret":"sk_..."}
```

Success:

```json
{"expireIn":7200,"accessToken":"..."}
```

Invalid credentials and internal errors use a different business shape such as `{ "code": 40014, "message": "..." }`, potentially with an HTTP 2xx status. Accept the exchange only when a non-empty `accessToken` and positive `expireIn` are present.

## Backend token provider

Implement the following behavior in the target backend's native stack:

1. Read AK/SK from its environment/secret manager at process startup; never accept them from an end-user request.
2. Return a cached token while it remains outside a five-minute refresh window.
3. Use a single-flight promise or lock so concurrent requests share one exchange.
4. For multiple backend instances, place token state in the existing shared cache when available; otherwise allow each instance to maintain its own token.
5. Record `expiresAt = acquiredAt + expireIn`; do not assume a fixed lifetime even though the current server commonly returns 7200 seconds.
6. Send protected calls with `x-acs-dingtalk-access-token: <token>` and `Content-Type: application/json`.
7. On HTTP 401, invalidate the cached token, exchange once, and retry the original request once. Do not loop.
8. Reject a protected response when its documented business code indicates failure even if HTTP status is successful.

Never log the AK, SK, access token, Authorization header, token exchange body, or unredacted credential-management response.

## Current security boundary

The current authentication middleware validates the access token, token expiry, API-app active state, and tenant. If a request body contains `userId`, it also resolves that platform user as the operation context.

Do not rely on the API-app `permissions` array or `ipWhitelist` column as active route authorization or network enforcement. Apply least privilege through platform user/application permissions, backend business authorization, deployment-network policy, and secret rotation.
