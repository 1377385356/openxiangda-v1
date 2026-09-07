# App Workspace Structure

Form pages, workflow form pages, and custom code pages live in `sy-lowcode-app-workspace`.

Create a new workspace with:

```bash
openxiangda workspace init ./my-app-workspace --profile <name> --app-name "应用名称"
cd ./my-app-workspace
pnpm install
```

Local workspace state is authoritative. If the current folder has no app binding, create a new app; do not search the platform for similar app names.

Bind an existing app only when the user explicitly provides `appType` or asks to reuse that app:

```bash
openxiangda workspace init ./my-app-workspace --profile <name> --app-type APP_XXXX
openxiangda workspace bind --profile <name> --app-type APP_XXXX
```

Typical code page layout:

```text
src/pages/<pageCode>/
├── page.tsx
├── index.tsx
├── styles.css
└── assets/
```

Rules:

- `pageCode` is the stable local key.
- Form pages use `src/forms/<formCode>/schema.ts` plus `src/forms/<formCode>/page.tsx`.
- Workflow form pages use the same form page structure; workflow v3 definitions are separate platform resources.
- Keep page-specific assets under the page directory.
- Shared components can live under `src/components/` when reused.
- Build artifacts under `dist/` are generated and should not be hand edited.
- Publish through `openxiangda workspace publish --profile <name>`.
- Visible page copy must be written for end users. Do not show implementation notes, schema explanations, or developer-only guidance inside page sections, cards, alerts, tooltips, or empty states.
