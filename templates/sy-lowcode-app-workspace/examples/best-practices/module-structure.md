# Module Structure

Use this structure for substantial features:

```text
src/
  domain/<feature>/
    types.ts
    state-machine.ts
    permissions.ts
    query.ts
    index.ts
  shared/
    services/<feature>.ts
    hooks/use<Feature>.ts
    components/
      QueryState.tsx
      StatusTag.tsx
  pages/<feature>/
    page.config.ts
    index.tsx
    App.tsx
    styles.css
    components/
  forms/<feature>/
    schema.ts
    page.tsx
```

## Dependency Direction

```text
pages -> shared/hooks -> shared/services -> domain
forms -> shared -> domain
```

- `domain/` has no React, Ant Design, SDK, or page imports.
- `shared/` does not import from `pages/`.
- `pages/` compose modules and call hooks; they do not build complex query
  payloads inline.
- PC and mobile views can have different components and styles, but they reuse
  the same domain and service logic.

## File Size

Avoid large single-file pages. If a page grows beyond roughly 250 lines, split
table actions, drawers, timelines, query builders, hooks, and styles into
separate files.
