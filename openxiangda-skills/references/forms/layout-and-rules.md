# Form Layout And Rules

## Layout

- Keep forms scan-friendly: sections, rows, and field order should follow the user's real workflow.
- Use groups for semantic sections, not for decoration.
- Required fields should be limited to data that is actually needed to submit.
- A process form should put approval-relevant fields near the top.

## Rules

Use declarative rules when possible:

- Required validation
- Numeric range validation
- Option visibility
- Field visibility
- Computed/default values

Avoid hidden custom script unless the behavior cannot be expressed declaratively.

## Data Management

Data management views are settings/resources around a form, not separate source forms. Store their live IDs under the current profile when they are created.
