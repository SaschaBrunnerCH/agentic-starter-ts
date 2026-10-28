# Engineering scripts

The implementation of the repository's engineering commands. Start with the `pnpm` commands in [package.json](../package.json); their names stay stable as files move. Application code belongs in `src/`.

For the capabilities these folders provide, their connections and selective-reuse limits, see the illustrated [building blocks](../engineering/building-blocks.md). This page maps their implementation owners.

## Find the owner

| Folder                 | Owns                                                                                                              | Entry points                                                                                                                           | When it is used                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [setup/](setup/)       | GitHub settings, read-only setup plans, personalization preflight, previews, ruleset drift and token-scope checks | `pnpm setup:github`, `pnpm setup:previews`, `pnpm check:personalization`                                                               | Initially and later to repair or reconcile hosted settings                |
| [workflow/](workflow/) | Issues, task lifecycle/setup recovery, workload ownership, standup, regression proof and local artifacts          | `pnpm issue`, `pnpm task`, `pnpm workload`, `pnpm local:init`                                                                          | Throughout development                                                    |
| [checks/](checks/)     | The local gate, dependency review, agent instructions, links, secrets, workflows, unused code and bundle budgets  | `pnpm check:push` and the individual `check:*` commands in package.json, except browser-cache and Git-hook checks below                | Before push and in PR builds; individually during work                    |
| [browser/](browser/)   | Browser CLI, shared cache, GPU discovery and ownership, profiles, devices and browser evidence                    | `pnpm test:browser`, `pnpm test:browser:install`, `pnpm test:devices`, `pnpm browser:doctor`, `pnpm browser:cli`, `pnpm browser:check` | Browser setup and verification; CI/release runs under the existing policy |
| [release/](release/)   | Release validation and the complete smoke-run reporter                                                            | `pnpm release`; reporter loaded by the release workflow                                                                                | When preparing and verifying releases                                     |
| [git/](git/)           | Hook installation, commit attribution checks and push validation                                                  | `pnpm prepare`, `pnpm check:hooks`; tracked hooks in [.githooks/](../.githooks/)                                                       | Installation, commits and pushes                                          |
| [shared/](shared/)     | GitHub invocation, checked JSON, command-argument parsing and development-platform policy                         | Imported by the groups above                                                                                                           | As their callers need them                                                |

Keep tests beside their modules: `workflow/task-rules.test.ts` tests `workflow/task-rules.ts`. Existing filename prefixes distinguish related modules within a group. A new script goes with the responsibility it serves; promote a helper to `shared/` only when separate groups need it.

Most of this code remains useful for the life of a project. Setup is infrequent, but its repair commands are retained. These folders are part of the repository's single package; they add no published packages or application runtime dependency.

Responsibility folders keep the commands, supporting rules and tests changed together near each other. A flat list becomes harder to navigate as tooling grows; separate command/library/test layers scatter related work. Folder ownership and review provide structure without introducing workspace packages or a new dependency-boundary mechanism.

Projects can read and edit these tools independently, but must adopt relevant starter fixes themselves. Extracting packages alone would not provide shared upgrades. Revisit a generator or versioned engineering CLI when repeated fixes across projects create measurable maintenance cost and the reusable API, project-owned configuration, release process and compatibility policy are understood. A generator would own initial scaffolding; a shared CLI would own ongoing tools.

## How the groups connect

The groups own their commands and rule modules. `shared/` supplies infrastructure without importing a command group. `workflow/` reads browser evidence from `browser/` and checks attribution through `git/`; the browser runner does not import task orchestration. Other command groups use `shared/` where needed. Test fixtures and configuration are allowed to exercise entry points across groups.

The root package scripts and configuration connect these groups to tools:

- [.githooks/](../.githooks/) invokes `git/`; pre-push runs the `checks/` gate.
- [playwright.config.ts](../playwright.config.ts) loads browser setup and evidence reporting. Browser package commands preload `browser/playwright-browsers-env.ts` before Playwright loads, including the forked test CLI.
- [release.yml](../.github/workflows/release.yml) loads the reporter in `release/`.
- [vite.config.ts](../vite.config.ts), [knip.json](../knip.json) and [tsconfig.node.json](../tsconfig.node.json) discover tooling and colocated tests. Coverage exclusions name command wrappers; their rule modules remain measured.

When relocating a module, update its imports, subprocess/reporter/preload callers and location-relative repository paths together. Repository-rooted commands locate their checkout from the module, including in linked worktrees; commands that intentionally use the caller's working directory retain that behavior. There are no wrappers at the former flat paths.

## Procedures and decisions

The guides own procedures; this page owns the implementation map:

- [Start a project](../engineering/setup.md#start-a-new-repository), then use the [task lifecycle](../engineering/agents/task-lifecycle.md).
- [Run and extend checks](../engineering/agents/local-verification.md).
- [Test browsers and devices](../engineering/agents/browser-testing.md) and [discover GPU access](../engineering/agents/browser-gpu-discovery.md).
- [Manage hosted settings](../engineering/operations/github-hosted-settings.md), [previews and deployment](../engineering/operations/deployment.md), and [releases](../engineering/operations/releases.md).

Folders improve navigation; they do not automatically enforce import boundaries. Add an enforced boundary only when a demonstrated problem warrants it, following [dependency-direction guidance](../engineering/agents/dependency-rules.md). A generator or shared CLI remains a separate design decision.
