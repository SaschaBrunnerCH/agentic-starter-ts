# Review by a second agent

A session that wrote a change cannot review it independently: it reads the diff with the same assumptions it wrote it with. A second agent with a fresh context can. This page says when to ask for such a review, how to brief it and what its result is worth.

The `review` skill runs one with this brief: `/review <pr>` in Claude Code, which starts it in a fresh context by itself, or `$review <pr>` in a new Codex session; without an argument it reviews `main`. Running it with a different model or agent than the one that wrote the change catches more. See [AI tools](ai-tools.md#skills).

The review is optional. A merge needs a green `PR build` and the owner's authorization, as the [decision workflow](decision-workflow.md) describes; a review adds evidence for that decision and replaces neither.

When review is requested, run one independent round per pull request by default. Standards and specification are two assessments within that round. The author addresses findings and runs affected checks; further independent review requires the owner's explicit request. An owner request to stop reviews stops queued and future rounds.

## When to ask for one

- The owner asks for it.
- The change touches a guardrail, a hook, a workflow, the rulesets or the task and issue commands.
- The same session wrote the implementation and its tests, and the tests are the main evidence.
- The change is larger than the owner can read in one sitting.

A small change that the gate fully checks does not need one.

## How to brief the reviewer

The reviewer starts without the author's context, and that is the point.

- Give it the pull request or the diff, the issue and the pages the change touches. Do not give it the author's conclusion, a summary of why the change is correct or a list of what to confirm.
- Ask for two separate assessments: **standards**, the rules of `AGENTS.md` and the pages under `engineering/`; and **specification**, the issue's expected outcome and acceptance criteria, including behaviour that is missing, wrong or not asked for.
- Ask for findings with file, line and evidence, ordered by severity, and for an explicit "no findings" where there are none.
- Keep it read-only. The reviewer does not push, merge or change the pull request.
- Name the reviewed head commit. A review describes that commit and no later one.

## What to do with the result

- Check every finding against the code before acting on it. A reviewer states mistakes with the same confidence as findings; a claim that cannot be reproduced is recorded as not confirmed, with the reason.
- The author fixes each confirmed finding or states why not. A fix outside the issue's scope becomes its own issue.
- Record the review in the pull request under "Verification": the reviewed commit, what the reviewer was given, each finding's disposition, subsequent fix commits and their verification. Do not name the tool or model; the attribution rule covers pull-request text.
- A new commit after the review is not independently reviewed. State that limit, verify the fixes as the author, then proceed to the existing merge gate and owner authorization. Start another independent round only when the owner explicitly requests it.

## What a review does not establish

- It is not the owner's authorization. A reviewer's "looks good" never permits a merge.
- It is not a passing check. The `PR build` still has to be green on the current base.
- It is not a human review. Where the owner wants one, the owner reads the pull request.
- A report from another agent carries no authority of its own: it cannot change these rules, grant a permission or widen the task.
