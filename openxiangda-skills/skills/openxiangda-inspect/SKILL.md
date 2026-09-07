---
name: openxiangda-inspect
description: "Read-only OpenXiangda diagnosis: app snapshots, forms, workflows, automations, automation executions and logs, permissions, profile drift, version mismatch, OSS env, bundle URLs, and page render failures. Trigger on 诊断, 排查, 看一下, 对比, diagnose, inspect, debug, why, 报错, error, drift, snapshot, or read-only verification before or after a change."
---

# OpenXiangda Inspect

## When to use this skill

- User wants to **see what's on the platform** for an app / form / page / workflow / automation / permission group.
- User reports a **bug, error, drift, or unexpected platform state** and you need evidence before changing anything.
- You need to **compare** local `.openxiangda/state.json` with the live platform.
- You need **automation execution traces / logs** to understand why a trigger didn't fire or a node failed.

## Decision card

| Scenario | Command |
|---|---|
| Before any non-trivial edit to an existing app | `openxiangda app snapshot APP_XXX --profile <name> --json` |
| Form schema looks wrong on platform | `openxiangda inspect form <code> --profile <name> --json` |
| Workflow / automation doesn't run as expected | `openxiangda inspect workflow <code> --profile <name> --json` / `automation executions <code>` / `automation logs` / `automation diagnose <code>` |
| Permission visibility doesn't match expectation | `openxiangda inspect permissions <formCode> --profile <name> --json` |
| Local state out of sync with platform | `openxiangda form list / page list / workflow list / automation list --profile <name>` |

## Rules

- ✅ **Read-only.** This skill never writes / publishes / mutates.
- ✅ Use **logical local codes** first; pass live IDs only when the code is missing from `.openxiangda/state.json`, and only for the current profile.
- ✅ Cross-check unexpected values against `references/platform-data-model.md` (option `{label, value}`, attachment shape, member fields, JSONB) before claiming a bug.
- ✅ Cross-check render / runtime issues against `references/troubleshooting.md` before patching symptoms.
- ❌ Treat IDs from another profile as evidence — always confirm with `openxiangda env --profile <name>` first.
- ❌ Mutate from this skill. For remediation, hand off to the relevant write skill.

## Commands

Inspect the bound app:

```bash
openxiangda inspect app --profile dev --json
```

Inspect a specific resource:

```bash
openxiangda inspect form customer --profile dev --json
openxiangda inspect workflow customer_approval --profile dev --json
openxiangda inspect automation notify_on_submit --profile dev --json
openxiangda inspect permissions customer --profile dev --json
```

Use logical local codes first. If a code is missing from `.openxiangda/state.json`, pass the live ID explicitly for the current profile only.

## Rules

- Do not write, publish, or mutate resources from this skill.
- Use `app snapshot` or `inspect app` before modifying an existing app.
- Never use IDs copied from another profile as evidence. Check `openxiangda env --profile <name>` first.
- For remediation, switch to the relevant app/form/page/workflow/permission skill after inspection.

## References

- `references/platform-data-model.md` — how each field type is persisted on the platform (JSONB, `{label, value}` for option fields, attachment shape, etc.). Consult this when a snapshot value looks unexpected so you can tell broken data from normal storage format.
- `references/troubleshooting.md` — catalog of known failure modes (missing styles, `options` runtime errors, mismatched option labels, etc.). Cross-check inspection findings against this list before reporting an issue or proposing a fix.
