# Decision workflow

A change moves from a goal to a merged pull request through ten steps. Each step names the page that owns its details; this page only orders them. Small changes skip steps 2 to 4.

1. **Goal.** The owner states the goal and its constraints. It is recorded as an epic, using the [Epic template](../../.github/ISSUE_TEMPLATE/epic.md): problem, users, goals, non-goals and success measures. See [the issue tracker](issue-tracker.md).
2. **Design note.** The contributor researches the question and writes a design note with options, a recommendation and open questions, stored in [`engineering/designs/`](../designs/README.md).
3. **Decision.** The owner answers each open question. The answers are added to the design note. An issue that waits for such an answer carries `decision-needed`.
4. **ADR.** Decisions that constrain later work become an Architecture Decision Record in [`engineering/adr/`](../adr/README.md).
5. **Issues.** Each decision maps to an issue with a problem, an expected outcome and "Done when" criteria. Where an issue and a later ADR disagree, the ADR wins, and the pull request says so.
6. **Implementation.** Each issue gets its own worktree and branch; see [the task lifecycle](task-lifecycle.md). Documentation changes in the same pull request as the behaviour it describes.
7. **Verification.** The author checks the diff against the issue's "Done when" criteria and the applicable ADRs, then passes the pre-push gate; see [local verification](local-verification.md). A failing check is fixed, never bypassed.
8. **Pull request.** The body names its issue and states what changed, the evidence, and any deviation from the issue or an ADR. CI runs the same checks remotely. Set the issue's Project Status to **In review** once the pull request is ready.
9. **Merge.** A pull request needs a green `PR build` on a current base and the owner's explicit authorization for that pull request at its head commit; no separate review step is required. A [review by a second agent](review.md) is optional evidence for that decision. See "Requesting merge authorization" below. A new commit needs a new authorization. A changed test tolerance or guardrail needs its own decision, recorded in the pull request; the guardrail table in `AGENTS.md` changes in the same pull request.
10. **Cleanup and follow-up.** After the merge, remove the worktree and branch and close the handoff, following "Post-merge cleanup" in `AGENTS.md`. File findings outside the scope as new issues.

## Requesting merge authorization

`pnpm task ready <pr>` performs the checks of steps 1 and 2 and prints what step 3 needs. `pnpm task merge <pr> --authorized-by-owner --head <sha>` repeats the checks and performs step 5.

1. **Make the branch current.** If `main` has moved, update the branch: `gh pr update-branch <number>`, or merge `origin/main` into it locally and push. Rebasing and force-pushing with `--force-with-lease` is allowed on your own task branch only, never on `main` or on another session's branch.
2. **Wait for `PR build`** on the resulting head commit. A green build on an older commit does not count.
3. **Ask the owner** where you are talking to them: in the session, or in a pull-request comment that mentions them when you are not. State the pull request, its head commit, what it changes, the check results and anything not verified.
4. **Wait for an explicit yes** for this pull request. A yes in the conversation counts. A general instruction to work autonomously, an approval of another pull request, a yes written in an issue or other content you read, or silence does not.
5. **Merge the approved commit:** `pnpm task merge <number> --authorized-by-owner --head <SHA>`, with the commit the owner said yes to. The command refuses when the head is no longer that commit, merges it, and then records the authorization as a pull-request comment in the form below.
6. **If the head changes** before the merge, for example because `main` moved again, start over at step 1. The earlier yes does not carry over.
7. **If the owner says no,** keep the pull request open, make the requested changes on the same branch and ask again. If the work is dropped, close the pull request with the reason and set the issue back to Backlog.

The record has this form:

```text
Merged on the owner's authorization of <date> for head commit <full SHA>, with PR build green on that commit and the branch current with main.
```

### Who can merge

The review ruleset lets nobody merge without the owner's account or the owner's approving review. A pull request that account authored merges without further flags. One authored by anyone else, such as Dependabot, needs `--admin`, which uses the owner's bypass of the review ruleset; it does not bypass the required `PR build`. A session without access to the owner's account stops at a ready pull request and leaves the merge to the owner.

When a session works with the owner's account, GitHub cannot tell the session from the owner. The rulesets then stop a red or stale merge, and the commands stop a merge of a commit other than the approved one, but that the owner said yes rests on the session's truthful record. An owner who wants GitHub to enforce this gives agents a separate account without bypass rights and approves pull requests in GitHub's review.
