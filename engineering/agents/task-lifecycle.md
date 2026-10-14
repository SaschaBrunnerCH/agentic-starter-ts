# Task lifecycle

## Start or resume

1. Read the issue, linked pull request, accepted decisions and any handoff. Confirm that the task is yours: the issue is assigned to you or was given to you by the owner, and its Status is In progress under your claim; see [picking and claiming work](issue-tracker.md#picking-and-claiming-work). Another session's unfinished work is not unclaimed work.
2. Verify `pwd`, `git worktree list`, branch, commit and working-tree status before editing. Fetch the intended target base. Create a new sibling worktree from that fetched revision unless a declared task dependency requires another branch; record that dependency. For resumed work, verify its recorded branch and changes before deciding whether it needs updating. Read `AGENTS.md` and the linked guidance from the task revision, and check the fetched base for newer guidance: the rules on `main` apply, not those of an old branch. An assignment you were given stays valid across sessions; do not ask for it again.
3. Keep the shared checkout unchanged. Treat other sessions' modifications as owned work: read-only inspection is allowed, but editing, formatting, staging, committing or taking over them requires an explicit assignment by the owner or a handoff from that session.
4. Record the issue or pull request, worktree, branch and base for the task. For migration or refactor work, list the affected existing workflows and required outcomes before implementation. Use the issue's accepted scope.

`pnpm task start <issue>` does steps 1 to 4 for a new task: it claims the issue, fetches `main`, creates the worktree and branch with the names below, installs dependencies and creates the handoff file. It refuses when the branch or directory already exists; resume that work instead. By hand, the same for issue 42 from the primary checkout:

```sh
git fetch origin main
git worktree add --no-track -b feat/42-short-title ../<repository>-42-short-title origin/main
cd ../<repository>-42-short-title
pnpm install --frozen-lockfile
```

`pnpm install --frozen-lockfile` is needed in every new worktree: the checks and the Git hooks run tools from its `node_modules`.

Naming:

- **Branch:** `<type>/<issue>-<short-title>`, with the type `feat`, `fix`, `docs` or `chore`.
- **Worktree:** a sibling directory `../<repository>-<issue>-<short-title>`.
- **Commit and pull-request title:** an imperative sentence stating the outcome, without a type prefix, such as "Show the route length in the summary". Dependabot's titles keep their `chore` prefix. The pull request is squashed, so its title becomes the commit on `main`.

The task is ready for edits when its ownership, starting revision and required outcomes are known. Follow [the issue tracker](issue-tracker.md) for Project updates.

## Validate and complete

1. Use the checks described in [local verification](local-verification.md).
2. Match every acceptance criterion and affected existing workflow to evidence. For a bug fix, the regression test fails on the previous revision or on a deliberate violation; say in the pull request which.
3. Keep incomplete requirements open. A follow-up issue does not waive them: completion requires satisfying them or recording the owner's explicit scope change. Check the parent's own outcomes as well as child-issue status before closing an epic.
4. Report local checks and GitHub CI separately, with the tested revision and unresolved failures. Verify each delivery claim: implemented, committed, pushed, merged and deployed are distinct states.
5. After a verified merge, perform the [post-merge cleanup](../../AGENTS.md#post-merge-cleanup) before the final response. If work remains, leave the handoff below and report the remaining criteria and next action.

## Handoff with unfinished work

Keep a local handoff under `agent-handoffs/issue-<number>.md` in Git's common directory, found with `git rev-parse --path-format=absolute --git-common-dir`. `pnpm task start` creates it with the headings below; `pnpm task handoff <issue>` creates it when missing and prints its path, and `pnpm task cleanup` removes it after the merge. It survives removal of a sibling worktree and is outside tracked files. Update it before transferring ownership or stopping with work still pending, including an open pull request awaiting merge. A session without persistent local files puts the same content in the pull-request description or an issue comment.

Include:

- Issue or pull request, owner, worktree, branch, base, current commit and any uncommitted work.
- Accepted decisions with links to their durable records; remaining acceptance criteria and blockers.
- Verification commands, tested revisions, outcomes and GitHub CI state.
- Running processes or shared resources the task owns.
- The next action, the applicable merge authorization or its conditions, and retained cleanup items.

Keep durable decisions in the issue or an ADR. Keep private transcripts, credentials and transient process details out of tracked documentation and pull-request text. On resume, verify the handoff against live state before acting; it is a record, not proof that an approval or check is still current.

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
- **The same mistake a second time.** Propose a check or a rule for it in a new issue; do not rely on remembering.
