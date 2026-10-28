# Task lifecycle

## Start or resume

1. Read the issue, linked pull request, accepted decisions and any handoff. Confirm that the task is yours: the issue is assigned to you or was given to you by the owner, and its Status is In progress under your claim; see [picking and claiming work](issue-tracker.md#picking-and-claiming-work). Another session's unfinished work is not unclaimed work.
2. Verify `pwd`, `git worktree list`, branch, commit and working-tree status before editing. Fetch the intended target base. Create a new task worktree under `../<repo-name>.worktrees/` beside the primary checkout from that fetched revision unless a declared task dependency requires another branch; record that dependency. For resumed work, verify its recorded branch and changes before deciding whether it needs updating. Read `AGENTS.md` and the linked guidance from the task revision, and check the fetched base for newer guidance: the rules on `main` apply, not those of an old branch. An assignment you were given stays valid across sessions; do not ask for it again.
3. Keep the shared checkout unchanged. Treat other sessions' modifications as owned work: read-only inspection is allowed, but editing, formatting, staging, committing or taking over them requires an explicit assignment by the owner or a handoff from that session.
4. Record the issue or pull request, worktree, branch and base for the task. For migration or refactor work, list the affected existing workflows and required outcomes before implementation. Use the issue's accepted scope.

`pnpm task start <issue>` does steps 1 to 4 for a new task: it claims the issue, fetches `main`, creates the worktree and branch with the names below, installs dependencies and creates the handoff file. It refuses when the branch or directory already exists; resume that work instead. By hand, the same for issue 42 from the primary checkout:

```sh
git fetch origin main
git worktree add --no-track -b feat/42-short-title ../<repo-name>.worktrees/42-short-title origin/main
cd ../<repo-name>.worktrees/42-short-title
pnpm install --frozen-lockfile
```

The worktrees folder sits beside the primary repository, with a clearly named folder for each task:

```text
projects/
├── <repo-name>/
└── <repo-name>.worktrees/
    └── <issue>-<short-title>/
```

This is our chosen convention; Git does not mandate a layout. Grouping worktrees keeps the projects directory readable as tasks accumulate. Use `git worktree add`, `git worktree list`, `git worktree move` and `git worktree remove` to manage registered worktrees. From the primary checkout, an intentional relocation of an existing task uses:

```sh
mkdir -p ../<repo-name>.worktrees
git worktree move ../<repo-name>-42-short-title ../<repo-name>.worktrees/42-short-title
git worktree list
```

After a move, update the task's recorded worktree path in its handoff. A structured setup receipt also records the directory in its recovery commands; update those paths together after verifying Git's registration and branch. Existing worktrees remain usable at their registered locations; task start does not move them automatically, and cleanup finds them through Git's registry. After a verified merge, use `pnpm task cleanup <pr>` for the guarded `git worktree remove` and branch/handoff cleanup described below.

Retained drafts and evidence go in the primary checkout's ignored `.local/`, using the [local artifact conventions](working-style.md#local-artifacts). Run `pnpm local:init` from any checkout to initialize its local README; issue/PR folders stay stable, with UTC dates inside them. This does not change task worktree names or the Git-common-directory handoff below.

`pnpm install --frozen-lockfile` is needed in every new worktree: the checks and the Git hooks run tools from its `node_modules`.

Task start writes a structured setup receipt inside the existing handoff before claiming, installing or verifying hooks. It records completed steps and the original process failure (exit status, signal or spawn error); command output remains in the terminal. The same receipt block stores safely quoted remaining recovery instructions and replaces them as steps complete. A failed installation or hook check is incomplete setup, not implementation readiness. Keep authored handoff notes outside the receipt block.

`pnpm task inspect <issue>` reads that receipt and checks its branch/worktree identity without installing, claiming, publishing or updating metadata. It exits nonzero for incomplete or unavailable setup and prints the remaining commands. A legacy handoff without a receipt requires manual verification; inspection does not invent a successful state.

After resolving a refusal and verifying task ownership, explicitly run `pnpm task resume <issue>` to retry only the remaining local installation/hook steps. It requires the recorded account and issue assignment, the same worktree/branch and unchanged setup head. It preserves source changes and original failure information until the step succeeds, and never retries a claim or Project write. Changed identity, an uncertain claim or advanced source requires inspection rather than automatic recovery. A completed receipt describes setup only; normal implementation and merge checks still apply.

Worktrees share workstation resources. Supported verification commands acquire the [shared workload reservation](workload-coordination.md); a new worktree does not create another execution slot. Reading, planning and editing can continue while a workload waits.

Naming:

- **Branch:** `<type>/<issue>-<short-title>`, with the type `feat`, `fix`, `docs` or `chore`.
- **Worktree:** `../<repo-name>.worktrees/<issue>-<short-title>/`, relative to the primary checkout, including when starting from a linked worktree.
- **Commit and pull-request title:** an imperative sentence stating the outcome, without a type prefix, such as "Show the route length in the summary". Dependabot's titles keep their `chore` prefix. The pull request is squashed, so its title becomes the commit on `main`.

The task is ready for edits when its ownership, starting revision and required outcomes are known. Follow [the issue tracker](issue-tracker.md) for Project updates.

## Validate and complete

1. Use the checks described in [local verification](local-verification.md).
2. Match every acceptance criterion and affected existing workflow to evidence. A bug fix needs a regression test that fails behaviorally without the fix; a load failure or an import of newly added code does not count. `pnpm task ready` checks changed unit tests against the merge base for PRs closing a `bug` issue. Browser-only fixes name their failing control run on a line starting "Regression control" in the PR. Follow [regression proof](local-verification.md#regression-proof) for the procedure and its review limits.

   For a feature, write the test first where you can: it shows the test can fail, and the first failing run is the specification. This is recommended, not checked; no check can tell in which order a test and its code were written.

3. Keep incomplete requirements open. A follow-up issue does not waive them: completion requires satisfying them or recording the owner's explicit scope change. Check the parent's own outcomes as well as child-issue status before closing an epic.
4. Report local checks and GitHub CI separately, with the tested revision and unresolved failures. Verify each delivery claim: implemented, committed, pushed, merged and deployed are distinct states.
5. After a verified merge, [preserve wanted browser diagnostics](#preserve-browser-diagnostics), then perform the [post-merge cleanup](#post-merge-cleanup) before the final response. If work remains, leave the handoff below and report the remaining criteria and next action.

## Post-merge cleanup

After a merge, or on finding a pull request already merged, clean up before the final response. `pnpm task cleanup <pr>` fetches, compares the local branch with the merged head, removes a clean worktree and its branch, verifies both are gone, and refuses instead of forcing. Before removal, [preserve wanted browser diagnostics](#preserve-browser-diagnostics). It cannot see other sessions or running processes: stop the task's processes and make sure no other session uses the worktree before running it, from outside the worktree. Without the command, inspect ignored files as well as tracked and untracked changes, and apply the same evidence protection by hand: never delete a branch whose tip differs from the merged head, never force-remove a worktree, keep anything dirty, locked or uncertain and report why. Name what was removed or retained in the final response.

## Preserve browser diagnostics

Before cleanup, copy wanted browser traces, screenshots and reports from `test-results/` and `playwright-report/` to the primary checkout's ignored task folder, for example `.local/issue-42/browser/`. Compare the copied bytes or checksums before discarding originals, and record the location in the existing handoff when work continues. Ordinary cleanup lists and retains these diagnostics; after preserving what is needed, use the existing `--discard-ignored` option to discard ignored originals. Dirty, locked, uncertain or mismatched worktrees remain protected. A local path gives remote reviewers no access; sharing diagnostics is a separate action subject to the data-handling and publication rules.

## Handoff with unfinished work

Keep a local handoff under `agent-handoffs/issue-<number>.md` in Git's common directory, found with `git rev-parse --path-format=absolute --git-common-dir`. `pnpm task start` creates it with the headings below; `pnpm task handoff <issue>` creates it when missing and prints its path, and `pnpm task cleanup` removes it after the merge. It survives removal of a task worktree and is outside tracked files. Update it before transferring ownership or stopping with work still pending, including an open pull request awaiting merge. A session without persistent local files puts the same content in the pull-request description or an issue comment.

Include:

- Issue or pull request, owner, worktree, branch, base, current commit and any uncommitted work.
- Accepted decisions with links to their durable records; remaining acceptance criteria and blockers.
- Verification commands, tested revisions, outcomes and GitHub CI state.
- Running processes or shared resources the task owns.
- The next action, the applicable merge authorization or its conditions, and retained cleanup items.

Keep lasting findings and decisions in the tracked records named by [knowledge ownership](decision-workflow.md#knowledge-ownership); link them from the issue and handoff. Keep private transcripts, credentials and transient process details out of tracked documentation and pull-request text. On resume, verify the handoff against live state before acting; it is a record, not proof that an approval or check is still current.

## Other situations

- **The owner says no to a pull request.** Keep it open, change it on the same branch and ask again. If the work is dropped, close the pull request with the reason, set the issue back to Backlog and clean up the worktree and branch by hand.
- **`main` is red.** A failing check on `main` itself, such as the weekly audit or a tool that no longer downloads, blocks everything. File a `bug` issue with priority P0, fix it before other work, and do not merge other pull requests around it.
- **A merged change must be undone.** Open an issue, then a pull request that reverts the commit (`git revert <sha>` on a new task branch). It passes the gate and needs authorization like any change; `main` is never rewritten.
- **An urgent fix.** The same path with priority P0. No step is skipped: the gate takes minutes and the ruleset does not allow a merge without it.
- **Two issues depend on each other.** Record the order as a native blocker (`pnpm issue blocked-by`). `claim` refuses the blocked issue until the other is closed. When the second must start early, branch it from the first task's branch, say so in its handoff and pull request, and retarget the pull request to `main` once the first has merged.
- **Work that spans several issues.** Split it into slices with one sub-issue and one pull request each; keep the combined outcome in the parent. A pull request that closes several unrelated issues is too large to authorize.
- **A new dependency.** Add it only when the issue calls for it. Name it and the reason in the pull request, install it with `pnpm add` (or `pnpm add --save-dev`), and check that `pnpm install --frozen-lockfile` reproduces the lockfile. pnpm refuses a version younger than seven days.
- **Secrets.** Never commit a credential or a `.env` file; commit the placeholders as `env.example`, without the leading dot, since Claude Code is denied every `.env` and `.env.*` file. A credential that reached a commit is revoked first and removed second; say so to the owner at once.
- **Changing a guardrail, a hook, a workflow or `AGENTS.md`.** This needs its own issue and the owner's explicit decision in the pull request. The owner reads every line of such a change.
- **The required check cannot run.** When `PR build` itself is broken or renamed, no pull request can merge, including the repair. Only the owner can resolve that; see "Emergency recovery" in [GitHub hosted settings](../operations/github-hosted-settings.md).
- **The same mistake a second time.** Follow [incident corrective action](../operations/ai-incidents.md#what-to-do): verify a correction to the failed or missing control rather than relying on memory or necessarily adding another rule.
