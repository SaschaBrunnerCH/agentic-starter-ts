# Decision workflow

A tracked repository change moves from a goal to a merged pull request through ten steps. Explicitly requested read-only research and ignored local reports can stop outside this issue/PR workflow; see [local-only work](working-style.md#working-without-publishing). Each step names the page that owns its details; this page orders the steps and defines shared knowledge ownership. Small changes skip steps 2 to 4.

1. **Goal.** The owner states the goal and its constraints. It is recorded as an epic, using the [Epic template](../../.github/ISSUE_TEMPLATE/epic.md): problem, users, goals, non-goals and success measures. See [the issue tracker](issue-tracker.md).
2. **Research and design.** Retain useful investigation findings in a [research record](../research/README.md), even when no solution is selected. When proposing a solution, write a [design note](../designs/README.md) with options, a recommendation and open questions. Research may finish here; completing it does not authorize implementation.
3. **Decision.** The owner answers each open question. The answers are added to the design note. An issue that waits for such an answer carries `decision-needed`.
4. **ADR.** Consequential decisions the project makes that constrain later work become an Architecture Decision Record in [`engineering/adr/`](../adr/README.md). Inherited tooling rationale lives beside the tooling, as described under [knowledge ownership](#knowledge-ownership).
5. **Issues.** Each decision maps to an issue with a problem, an expected outcome and "Done when" criteria. Where an issue and a later ADR disagree, the ADR wins, and the pull request says so.
6. **Implementation.** Each issue gets its own worktree and branch; see [the task lifecycle](task-lifecycle.md). Documentation changes in the same pull request as the behaviour it describes when practical. Independently useful research and requested policy changes may use documentation-only pull requests; each investigation does not need a separate documentation pull request.
7. **Verification.** The author checks the diff against the issue's "Done when" criteria and the applicable ADRs, performs the [portability review](#portability-review) for lasting findings or decisions, then passes the pre-push gate; see [local verification](local-verification.md). A failing check is fixed, never bypassed.
8. **Pull request.** The body names its issue and states what changed, the evidence, and any deviation from the issue or an ADR. CI runs the same checks remotely. Set the issue's Project Status to **In review** once the pull request is ready.
9. **Merge.** A pull request needs a green `PR build` on a current base and the owner's explicit authorization for that pull request at its head commit; no separate review step is required. A [review by a second agent](review.md) is optional evidence for that decision. See "Requesting merge authorization" below. A new commit needs a new authorization. A changed test tolerance or guardrail needs its own decision, recorded in the pull request; the guardrail table in `AGENTS.md` changes in the same pull request.
10. **Cleanup and follow-up.** After the merge, remove the worktree and branch and close the handoff, following "Post-merge cleanup" in `AGENTS.md`. File findings outside the scope as new issues.

## Knowledge ownership

Essential engineering knowledge belongs in version-controlled documentation so a checkout remains useful after a fork, transfer or loss of access to the original issue tracker. Issue discussions and Git history can preserve provenance, but essential explanations must be available in the current files. Curating them costs maintenance; keeping one canonical home reduces duplication and stale accounts.

| Information                                                                                    | Canonical home                                                                                                                         |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Investigation methods, findings, evidence and uncertainty                                      | [Research record](../research/README.md)                                                                                               |
| Evolving requirements, proposed behavior, interfaces, constraints, options and validation plan | [Design note](../designs/README.md)                                                                                                    |
| Current tooling rationale, operational tradeoffs and limitations                               | Relevant engineering guide; code comments for surprising local implementation choices                                                  |
| Accepted consequential project decision and its rationale                                      | [ADR](../adr/README.md)                                                                                                                |
| Safe materials needed to reproduce important results                                           | Tracked scripts, fixtures or examples with usage instructions, linked from the record                                                  |
| Scope, acceptance criteria, ownership, status and review discussion                            | Issue and pull request, linking the durable records                                                                                    |
| Scratch work, drafts, raw logs and sensitive inputs                                            | [Ignored local artifacts](working-style.md#local-artifacts) or an approved restricted location under [data handling](data-handling.md) |

Keep each substantive explanation in one canonical home. Related records and indexes link to it with the context their readers need. Curate lasting conclusions from discussions and scratch work; preserve useful findings without copying administrative history or entire conversations. Issue and PR links provide supplementary provenance.

The starter ships no ADR or research records. Its guides explain the reasons, significant alternatives, limitations and revisit conditions needed to maintain the inherited tooling; code comments explain local choices where needed. Keep those explanations current with the behavior. New projects retain their own investigations and acceptance evidence, and create ADRs for consequential decisions when needed, starting at `0001`; no initial ADR or inherited-history archive is required.

Documentation must be sufficient for its purpose. Use the space needed for material evidence, significant alternatives and limitations; there is no fixed word or page target. Remove repetition rather than substance. Put source citations next to the claims they support and explain the relevant result in the documentation itself. Respect licensing, privacy and publication rules when retaining evidence. Private or large inputs may remain unavailable: explain the method and resulting reproduction limits without copying restricted inputs into Git. Automated formatting and link checks cannot establish semantic completeness.

Adopt this incrementally as work touches a topic. Existing dated records remain historical evidence; follow the research and ADR guides when later findings or decisions change them. Revisit the process if repeated work leaves essential findings outside the checkout or duplicated, stale records become a recurring maintenance burden.

## Portability review

For a change that produces lasting findings or decisions, the author reads the relevant tracked records while ignoring issue and PR links. Check that a contributor with only a checkout can:

1. Understand the problem and context and find the canonical explanation.
2. For research, recover the methods, environment or revision, findings, evidence, uncertainty, significant alternatives, limitations and open questions. For an accepted decision, understand the choice, reasons, significant alternatives and consequences.
3. Follow reproduction instructions where applicable, or understand which inputs are unavailable and how that limits the conclusions.
4. Tell what remains undecided, what would justify revisiting the findings and whether further work is authorized.

Follow links between tracked records as needed; each record serves its own purpose without repeating all supporting detail. Report the records, tested revision, result and gaps in the pull request using the manual-check format in [local verification](local-verification.md#rules). Formatting and link checks do not prove semantic completeness.

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
