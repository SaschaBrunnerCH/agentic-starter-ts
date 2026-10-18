# Triage labels

`pnpm setup:github` creates or updates labels from [.github/labels.json](../../.github/labels.json), the single source for exact names, colors and descriptions. This page explains their workflow meaning. Customize product areas in that configuration without editing setup code; update this guide when their meaning changes.

Setup validates the entire file before contacting GitHub: records need names of 1–50 characters without surrounding whitespace, six hexadecimal color digits without `#`, and descriptions of at most 100 characters. Names must be unique ignoring case. Every workflow label below except `area:app` is required; retain `area:engineering`. Invalid or missing configuration stops setup before any remote write.

Reconciliation creates missing configured labels and updates changed colors/descriptions. Unconfigured hosted labels remain; changing a name in configuration does not rename or delete the old hosted label. Remove obsolete labels separately after checking their use. Keeping the data here in JSON avoids downstream edits to otherwise shared setup code. Color and description validation follows [GitHub’s label API](https://docs.github.com/en/rest/issues/labels#create-a-label).

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
