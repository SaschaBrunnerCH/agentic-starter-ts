---
last-reviewed: 2026-10-14
---

# Threat model

What could go wrong in a repository made from this template, and what stops it. Review it every three months, after an [AI incident](../operations/ai-incidents.md), and when the repository starts handling data or credentials it did not before; update `last-reviewed` above.

## What is worth protecting

| Asset                          | Why                                                    |
| ------------------------------ | ------------------------------------------------------ |
| `main` and the release tags    | What is deployed and released                          |
| The deployed site and previews | Public under the repository's name                     |
| The owner's GitHub credentials | Agents act with them: merges, Project writes, settings |
| `PREVIEWS_DEPLOY_KEY`          | Writes to the previews repository                      |
| Local `.env` files             | Credentials of the application, if it has any          |

## Threats and their controls

| Threat                                                                                | Controls                                                                                                                                                               |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instructions hidden in issues, comments, web pages or dependency files steer an agent | "Untrusted content" in `AGENTS.md`; a merge needs the owner's authorization for the exact commit                                                                       |
| An agent merges, publishes or deletes something nobody approved                       | Rulesets, `pnpm task merge` with the recorded head, external repository approval, [AI incident](../operations/ai-incidents.md) loop                                    |
| A credential is committed or pasted into text                                         | Secretlint at commit, `check:secrets`, [data handling](../agents/data-handling.md), Claude Code denied `.env` files                                                    |
| A malicious or compromised dependency                                                 | Lockfile with `pnpm install --frozen-lockfile`, a week of cooldown, weekly audit, a new dependency named in the pull request                                           |
| A workflow change or pull request leaks a secret                                      | Read-only workflow token, `persist-credentials: false`, previews published by a job that runs no repository code, actions pinned to commits, zizmor                    |
| A broken or tampered build reaches users                                              | Deploys only from `main`, test after deploy, rollback; releases built in CI with checksums and an SBOM, immutable release tags                                         |
| A preview reads what the site stored in the browser                                   | Previews on a separate path but the same origin on `github.io`: no credentials in browser storage, or a separate domain; see [deployment](../operations/deployment.md) |

## Accepted risks

- A session working with the owner's account cannot be told apart from the owner by GitHub. That the owner said yes rests on the session's truthful record; see [the decision workflow](../agents/decision-workflow.md). A separate agent account without bypass rights removes this risk.
- Build provenance is recorded only in public repositories; a private one relies on CI builds and checksums.
- The site and previews are public, whatever the repository's visibility.
