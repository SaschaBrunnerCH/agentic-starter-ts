# Working style

How to write and how much to change. These rules keep pull requests small enough to authorize and text short enough to read.

## Changing code

- Read the affected flow before editing it: the callers, the tests and the page that describes it.
- Make the smallest complete change that fixes the cause. A fix does not carry a refactor, and a feature does not carry clean-up of code it does not touch; propose those as their own issues.
- Prefer what is already there: existing code, the standard library, installed dependencies. Add an abstraction when a second use exists, not for one that might come.
- Keep validation, accessibility and security behaviour that the change does not mean to alter.
- Do not build what the issue does not ask for. An idea that came up on the way goes into a Backlog issue.

## Before proposing something new

Search before proposing an optimisation, a new tool or a second attempt at something: the ADRs in `engineering/adr/`, the records in `engineering/research/`, and closed issues. If it was decided or tried before, say what has changed since; another run of the same experiment does not overturn a recorded result.

## Writing

- Lead with the result, then the reasons. Use the shortest text that is complete.
- Keep technical names, numbers, negations and uncertainty exactly. Say "not verified" where that is the case.
- An issue states the problem, the expected outcome and acceptance criteria that can be observed.
- A pull request states the change and its reason, the verification, and what is not covered.
- Use the terms of `CONTEXT.md`.

## Sharing the machine

Several sessions, and other projects, often share one machine.

- Run heavy work one at a time: test suites, builds, browser runs. Check the load first, other projects' containers included, and wait for a quiet machine instead of starting beside a running suite. A timeout under load is not evidence against a change; run it again alone before concluding anything.
- Leave other sessions' worktrees, processes, containers and ports alone, even when they slow you down. Ask the owner instead.
- Do not open graphical applications or browser windows on the owner's desktop session: GPU-heavy pages can freeze it. Run browsers headless, and hand the owner a URL to open.

## Working without publishing

The owner can ask for local-only work: "draft it, do not create it" or "do not push". Then leave changes uncommitted or unpushed as asked, write drafts of issues and pull-request text to files, and make no remote write. Preparing something locally never implies permission to publish it.

## Local artifacts

Keep scratch artifacts in the **primary checkout's `.local/`**, so task-worktree cleanup leaves them intact. This includes logs, screenshots, reports and standalone Markdown drafts or notes when the user gives no destination. An explicit destination or maintained repository documentation takes precedence.

Run `pnpm local:init` once from any checkout to create its ignored `.local/README.md`; repeating it preserves existing content. The complete directory is ignored, including the README. Downstream projects that prefer an untracked exclusion can use `pnpm local:init --exclude`: it uses Git's shared `info/exclude`, including from linked worktrees, without editing `.gitignore`. Initialization refuses tracked `.local` files; review those explicitly rather than silently untracking them.

Use UTC timestamps (`YYYYMMDD-HHMM`), lowercase hyphen-separated slugs and GitHub numbers padded to five digits before the type (`gh-<five-digit-id>-issue-<title>/` or `gh-<five-digit-id>-pr-<title>/`). Never truncate larger IDs. Issues and PRs share GitHub’s number sequence; these folders sort in creation order through 99,999. `<title>` means the actual GitHub issue or PR title converted to a portable lowercase hyphen-separated slug:

| Folder under `.local/`         | Use                                                           |
| ------------------------------ | ------------------------------------------------------------- |
| `gh-00055-issue-<title>/`      | Task artifacts; dated activity subfolders when useful         |
| `gh-00057-pr-<title>/`         | PR-specific review evidence                                   |
| `20261018-1430_browser-check/` | One-off work directly under `.local/`, without an issue or PR |
| `topics/browser-testing/`      | Optional continuing topic, with dated activities when useful  |

Keep each artifact in one canonical location; link related issue/PR folders from their READMEs rather than copying reports. Dates belong inside stable issue/PR folders, not in their names. Record completed or merged status in a README or optional index; keep paths stable. Existing folders remain valid: do not migrate or rename them automatically.

Tool-owned build/test output keeps its existing paths. Copy wanted evidence here before worktree cleanup. Git-common-directory handoffs keep the location documented in [task lifecycle](task-lifecycle.md#handoff-with-unfinished-work). Do not put credentials or personal data in artifacts; see [data handling](data-handling.md).
