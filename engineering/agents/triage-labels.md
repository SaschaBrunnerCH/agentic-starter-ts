# Triage labels

`pnpm setup:github` creates these labels. Change the list in `scripts/setup/setup-github.ts` and this page together.

## Readiness and triage

| Label             | Meaning                                                      |
| ----------------- | ------------------------------------------------------------ |
| `needs-triage`    | The owner needs to evaluate this issue; a temporary fallback |
| `needs-info`      | Waiting on the reporter for more information                 |
| `ready-for-agent` | Fully specified; an agent can do it unattended               |
| `ready-for-human` | Needs a human to implement or decide in person               |
| `wontfix`         | Will not be actioned                                         |

## Work type and gates

Every issue carries at least one work-type label; see [issue metadata](issue-tracker.md#issue-metadata).

| Label             | Use                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `bug`             | Existing behaviour is wrong                                                               |
| `enhancement`     | New or changed behaviour, tooling or structure                                            |
| `documentation`   | The outcome is a document                                                                 |
| `investigation`   | Bounded research or measurement that ends with evidence, conclusions and unknowns         |
| `verification`    | Dedicated acceptance or verification work; feature issues keep their own checks           |
| `epic`            | A larger outcome delivered through sub-issues; use the `Epic:` title prefix               |
| `decision-needed` | The owner must decide before the work can finish; remove it once the decision is recorded |

## Areas

Every issue carries at least one `area:*` label. Two areas exist at the start, `area:app` and `area:engineering`; replace `area:app` or extend the list with the product's own areas. Keep `area:engineering`: the workflow pages and the audit instructions name it.
