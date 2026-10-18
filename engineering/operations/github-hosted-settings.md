# GitHub hosted settings

These settings live on GitHub, not in files, and a repository created from the template does not inherit them. `pnpm setup:github` creates them and can be rerun at any time to repair them; it writes only differences. It needs the GitHub CLI signed in with administrator rights on the repository and the Project scope (`gh auth refresh -s project`).

## What the script sets

| Setting                    | Value                                                                                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Labels                     | Exact definitions in [.github/labels.json](../../.github/labels.json); meanings in [triage labels](../agents/triage-labels.md)                                                                                                 |
| Merge methods              | Squash only; the branch is deleted after merge                                                                                                                                                                                 |
| Project                    | One Project named after the repository, linked to it                                                                                                                                                                           |
| Project field **Status**   | Backlog, Ready, In progress, In review, Blocked, Done                                                                                                                                                                          |
| Project field **Priority** | P0, P1, P2                                                                                                                                                                                                                     |
| Project views              | Ready, Current work, Decisions, Blocked, Epics, Backlog (tables) and Board                                                                                                                                                     |
| Dependabot                 | Alerts and security updates enabled                                                                                                                                                                                            |
| Actions                    | The workflow token is read-only by default; workflows cannot approve pull requests                                                                                                                                             |
| GitHub Pages               | Deploys from workflows; the `github-pages` environment accepts `main` only; see [deployment](deployment.md)                                                                                                                    |
| Previews                   | Not set by this script: `pnpm setup:previews` creates the previews repository, its deploy key, the `previews` environment with the key as its secret, and two variables; see [deployment](deployment.md#pull-request-previews) |
| Secret scanning            | Enabled with push protection where GitHub offers it; otherwise reported as not available                                                                                                                                       |
| Ruleset **Main integrity** | From `.github/rulesets/main-integrity.json`                                                                                                                                                                                    |
| Ruleset **Main review**    | From `.github/rulesets/main-review.json`                                                                                                                                                                                       |
| Ruleset **Release tags**   | From `.github/rulesets/release-tags.json`: `v*` tags cannot be updated or deleted                                                                                                                                              |
| Immutable releases         | On: a published release cannot change; see [releases](releases.md)                                                                                                                                                             |

## The rulesets

**Main integrity** applies to everyone, with no bypass: `main` cannot be deleted or force-pushed, and a merge requires the `PR build` status on a branch that is current with `main`.

**Main review** requires a pull request, squash merge and a code-owner review, with zero further approvals. Repository administrators may bypass it for a pull request. This is how the owner's merge authorization works in practice. A pull request the owner's account authored needs no review from that same account, so the owner, or a session acting on the owner's recorded authorization with the owner's credentials, merges it without further flags. A pull request authored by anyone else, such as Dependabot, needs the owner's approving review or the bypass (`--admin`). Nobody merges without the owner's account or the owner's approval.

**Release tags** applies to everyone, with no bypass: a `v*` tag cannot be updated, force-pushed or deleted. See [releases](releases.md).

The script adds and updates existing settings. When it creates a new Project, it removes GitHub's initial "View 1" after creating the named views; it preserves views on existing Projects. Status options a repository added itself are kept after the standard six. GitHub's default labels that are not in the list (such as `duplicate` or `good first issue`) and labels whose configured names you changed stay until you remove them by hand.

A ruleset is created only when none of that name exists; the script does not overwrite one. It compares an existing ruleset with its file and reports every difference as not applied, so a relaxed ruleset does not go unnoticed. To change a ruleset, edit the JSON file through a pull request, then delete the hosted ruleset and rerun the script, or apply the same change in the GitHub UI.

## When a ruleset is not applied

The script reports rulesets it could not read or create and exits with an error; everything else is still applied. The usual cause is a plan that does not offer rulesets for private repositories: on GitHub Free they exist for public repositories only. Without them the rules above are not enforced by GitHub; then either change the plan or the visibility, or treat the merge rule as review-only and say so in the `AGENTS.md` guardrail table.

## Set in the GitHub UI

The script does not cover these; do them once by hand:

- **Project workflows.** In the Project's Workflows, switch off "Item closed", "Pull request merged" and "Pull request linked" where they are on. Status is set by the commands: closing or merging does not establish that the acceptance criteria are met, and `pnpm task merge` sets Done itself.
- **View sorting.** Sort the Ready view by Priority.

## Emergency recovery

If the `PR build` status cannot be produced, for example because the workflow is broken on `main` or its job was renamed, no pull request can merge, including the one that repairs it. Only the owner resolves this:

1. Open an issue with priority P0 that states the cause.
2. Record in it the acting account, the time in UTC and the complete current ruleset (`gh api repos/<owner>/<repository>/rulesets/<id>`).
3. Disable **Main integrity**, or remove the required status from it. Leave **Main review** as it is.
4. Land the repair through a pull request.
5. Restore the ruleset, run `pnpm setup:github` until it reports no difference, and record the restored state in the issue.

Every change of a hosted setting is recorded in the issue or pull request that caused it: the setting, the acting account, the time and the state before and after. Never record a secret's value.

## Verifying

Run `pnpm setup:github` again: "No changes." without a "Not applied" list confirms that labels, merge settings, Project fields, views, Dependabot settings, Actions permissions and rulesets match. A "Not available here" list names what the repository's plan does not offer; it is not an error. Record the date and account of the last verification in the pull request or issue that changed a setting.
