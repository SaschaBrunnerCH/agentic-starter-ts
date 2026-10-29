# Working style

How to write and how much to change. These rules keep pull requests small enough to authorize and text short enough to read.

## Changing code

- Read the affected flow before editing it: the callers, the tests and the page that describes it.
- Make the smallest complete change that fixes the cause. A fix does not carry a refactor, and a feature does not carry clean-up of code it does not touch; propose those as their own issues.
- Prefer what is already there: existing code, the standard library, installed dependencies. Add an abstraction when a second use exists, not for one that might come.
- Keep validation, accessibility and security behaviour that the change does not mean to alter.
- Do not build what the issue does not ask for. An idea that came up on the way goes into a Backlog issue.

## Before proposing something new

Search before proposing an optimisation, a new tool or a second attempt at something: the relevant engineering guides and code comments, any project ADRs in `engineering/adr/`, the records in `engineering/research/`, the notes in `engineering/designs/`, and closed issues. If it was decided or tried before, say what has changed since; another run of the same experiment does not overturn a recorded result.

## Writing

- Lead with the result, then the reasons. Use the shortest text that is complete; preserve material evidence, alternatives and limitations without a fixed word or page target.
- Keep technical names, numbers, negations and uncertainty exactly. Say "not verified" where that is the case.
- An issue states the problem, the expected outcome and acceptance criteria that can be observed.
- A pull request states the change and its reason, the verification, and what is not covered.
- Use the terms of `CONTEXT.md`.

Use the [visual documentation guide](../diagrams/README.md) when a table, diagram, chart or real screenshot makes an explanation easier to understand. Choose the format for the reader, keep its editable source and text equivalent, and label measured evidence with its provenance.

For lasting findings and rationale, follow [knowledge ownership](decision-workflow.md#knowledge-ownership) and its portability review. Keep current tooling explanations in maintained guides or code comments; research, proposals and consequential project decisions have their own tracked homes. Issues and pull requests coordinate the work.

## Development environment

Run coding-agent sessions and the development toolchain on WSL2, macOS or Linux. On Windows, follow [WSL2 setup](../setup.md#windows-development-with-wsl2) before starting a task: use Linux executables and a Linux-filesystem checkout with its own dependencies. The Windows editor may connect through WSL integration. Full workflow guards check the Node.js OS; setup must verify WSL2 because Node also reports WSL1 as Linux.

The complete gate depends on workflow-checking tools with macOS and Linux builds. WSL2 gives Windows development the same supported gate and shell environment; checking task start, the gate and adoption rejects unsupported platforms before claims or expensive work. Full native Windows support would require a Windows path for every gate dependency and process-management behavior. Standalone installation and diagnostic commands remain available, but do not establish full native Windows support. Commands never silently relaunch themselves in WSL or move a checkout. If WSL2 is unavailable, use another supported development environment.

Use a separate Windows checkout/toolchain for explicit native Windows [browser/GPU acceptance](browser-device-coverage.md#install-and-launch-on-windows-and-wsl-separately), with independently installed dependencies and browser caches. This preserves evidence of native Chrome/Edge and driver behavior at the cost of maintaining another test environment. Record the development-tool OS and tested browser OS separately: WSL rendering cannot establish native Windows behavior or performance.

The Node.js platform guard cannot verify the WSL generation, executable provenance, hardware rendering or host-wide resource exclusion. Setup inspection, browser evidence and cooperative workload coordination address those separately. Revisit the support boundary if every gate dependency and process-management path can be verified on native Windows; adding a standalone command does not change it.

## Sharing the machine

Several sessions, and other projects, often share one machine.

- Run resource-intensive workloads one at a time through the [shared workload slot](workload-coordination.md): test suites, builds and browser runs. Supported commands reserve automatically; lightweight reading, planning and editing can continue while waiting. Check other host load first, including nonparticipating commands, Windows activity and other projects' containers. A timeout under load is not evidence against a change; run it again alone before concluding anything.
- Leave other sessions' worktrees, processes, containers and ports alone, even when they slow you down. Ask the owner instead.
- Do not open graphical applications or browser windows on the owner's desktop session: GPU-heavy pages can freeze it. Run browsers headless, and hand the owner a URL to open.

## Working without publishing

Explicitly requested read-only research and reports or drafts confined to the primary checkout's ignored `.local/` need no GitHub issue. This avoids publishing a task merely to answer a bounded local request. The exception authorizes neither tracked changes nor remote writes: implementing tracked repository changes still needs an issue and its task worktree. Lasting findings useful to future contributors still belong in maintained records through that workflow; a local report does not authorize implementation or publication.

The owner can also restrict an implementation task to local work: "do not push". Use its issue and task worktree, leave changes uncommitted or unpushed as asked, and make no remote write. Preparing something locally never implies permission to publish it.

## Local artifacts

Keep scratch artifacts in the **primary checkout's `.local/`**, so task-worktree cleanup leaves them intact. This includes logs, screenshots, reports and standalone Markdown drafts or notes when the user gives no destination. An explicit destination or maintained repository documentation takes precedence.

When scratch work produces findings or rationale useful to future contributors, curate them into the appropriate tracked record under [knowledge ownership](decision-workflow.md#knowledge-ownership). Keep private inputs and transient output local or restricted, and state reproduction limits in the record. Local retention alone does not preserve essential engineering knowledge for a checkout.

Run `pnpm local:init` once from any checkout to create its ignored `.local/README.md`; repeating it preserves existing content. The complete directory is ignored, including the README. Downstream projects that prefer an untracked exclusion can use `pnpm local:init --exclude`: it uses Git's shared `info/exclude`, including from linked worktrees, without editing `.gitignore`. Initialization refuses tracked `.local` files; review those explicitly rather than silently untracking them.

`pnpm task start` also initializes this README and creates the issue's stable folder with its link, branch and an in-progress status. Automatic task initialization uses shared `info/exclude` if needed, leaving tracked files in the primary checkout untouched. The worktree's Git metadata remembers the folder, so later title changes do not move evidence. An existing issue folder is reused; ambiguous duplicates require inspection. Generated title slugs use the existing portable task-slug conversion, capped at 200 characters to keep the path segment portable; IDs are never truncated. Existing local READMEs and notes are preserved. Successful `pnpm task cleanup` appends a merged PR/head status event without replacing earlier notes.

Browser run records and default GPU reports use this task folder. Commands without a task reference use the primary checkout's `.local/`; standalone GPU diagnostics outside Git use the current directory's `.local/`. Existing browser records remain readable in their original locations. Explicit GPU profile paths and tool-owned build/test output keep their existing behavior.

Use UTC timestamps (`YYYYMMDD-HHMM`), lowercase hyphen-separated slugs and GitHub numbers padded to five digits before the type (`gh-<five-digit-id>-issue-<title>/` or `gh-<five-digit-id>-pr-<title>/`). Never truncate larger IDs. Issues and PRs share GitHub’s number sequence; these folders sort in creation order through 99,999. `<title>` means the actual GitHub issue or PR title converted to a portable lowercase hyphen-separated slug:

| Folder under `.local/`         | Use                                                           |
| ------------------------------ | ------------------------------------------------------------- |
| `gh-00055-issue-<title>/`      | Task artifacts; dated activity subfolders when useful         |
| `gh-00057-pr-<title>/`         | PR-specific review evidence                                   |
| `20261018-1430_browser-check/` | One-off work directly under `.local/`, without an issue or PR |
| `topics/browser-testing/`      | Optional continuing topic, with dated activities when useful  |

Keep each artifact in one canonical location; link related issue/PR folders from their READMEs rather than copying reports. Dates belong inside stable issue/PR folders, not in their names. Record completed or merged status in a README or optional index; keep paths stable. Existing folders remain valid: do not migrate or rename them automatically.

Tool-owned build/test output keeps its existing paths. Copy wanted evidence here before worktree cleanup. Git-common-directory handoffs keep the location documented in [task lifecycle](task-lifecycle.md#handoff-with-unfinished-work). Do not put credentials or personal data in artifacts; see [data handling](data-handling.md).
