# App Shell Code Page Entries

Use this pattern for formal user-facing entries such as admin consoles, PC
portals, and mobile portals.

## Required Page Config

`page.config.ts` must declare app-shell entry metadata:

```ts
export default {
  code: "instrument_admin",
  name: "Instrument Admin",
  route: { pathKey: "instrument_admin" },
  entry: {
    mode: "app-shell",
    hidePlatformNav: true,
    defaultRoute: "dashboard",
  },
};
```

Rules:

- `entry.mode` is `"app-shell"` for formal product entries.
- `entry.hidePlatformNav` is `true` unless the page is explicitly a debugging or maintenance page.
- `entry.defaultRoute` is required and must point at the shell home route.
- Plain one-off custom pages may omit `entry` or use `mode: "plain-page"`.

## Expected File Shape

Prefer this layout for app-shell pages:

```text
src/pages/<pageCode>/
  page.config.ts
  index.tsx
  <Feature>Shell.tsx
  routes.ts
  modules/
  __tests__/
```

`routes.ts` should export the route registry, default route, route parser, and
route builder. Page components should navigate through that helper or
`openxiangda/runtime` navigation.

## Navigation Rules

- Use the standard query key `route` for shell routes.
- Use `navigation.pushRoute(route, query?)` and
  `navigation.replaceRoute(route, query?)` for same-page shell navigation.
- Do not scatter hardcoded `/view/...&isRenderNav=false` URLs through page code.
- Menu links should bind the formal app-shell code page only. Native forms,
  workflows, and view pages can stay as development resources or permission
  targets, but should not become the product navigation shell.

## Tests

Add focused contract tests for:

- `page.config.ts` includes `entry.mode: "app-shell"`.
- default route fallback.
- unknown route fallback.
- preserving and deleting business query values.
- preserving hidden platform nav when the route helper updates the URL.
