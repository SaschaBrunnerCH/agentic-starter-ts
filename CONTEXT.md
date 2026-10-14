# Context

The shared vocabulary of this repository. Code, issues, pull requests and documentation use these terms with these meanings. Add a term here before introducing it in a name.

## Workflow terms

| Term           | Meaning                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| Owner          | The person who sets priorities, makes product decisions and authorizes each merge. In `.github/CODEOWNERS`.         |
| Session        | One run of an agent or one sitting of a contributor on a task. Several sessions may work in the repository at once. |
| Epic           | An issue that holds the requirements for one larger outcome and is delivered through sub-issues.                    |
| Design note    | Options, evidence and a recommendation for one question, written before the owner decides.                          |
| Done when      | The checklist in an issue that says how completion is verified.                                                     |
| Guardrail      | A rule in the `AGENTS.md` table, with the mechanism that enforces it.                                               |
| Gate           | The list of checks in `scripts/run-local-checks.ts`, run before push and by the PR build.                           |
| Current base   | A branch is on a current base when it contains the latest commit of `main`.                                         |
| Native parent  | GitHub's sub-issue relation between two issues, as opposed to a "Part of #..." line in the text.                    |
| Native blocker | GitHub's "blocked by" relation between two issues, as opposed to a mention in the text.                             |
| Readback       | Fetching what was just written (labels, parent, Project fields) and comparing it with what was intended.            |
| Slice          | A part of an issue that is delivered by its own pull request. Each slice gets its own sub-issue.                    |
| Handoff        | The record a session leaves so that another session can resume its unfinished work.                                 |
| Tolerance      | The allowed deviation in a test's assertion, for example a pixel or timing threshold.                               |

## Terms you may know

Common terms and what this repository calls the same thing. Use the name in the right-hand column in issues, pull requests and documentation.

| You may say                             | Here it is                                                                                                                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD, product requirements document      | The body of an **epic**, written with the [Epic template](.github/ISSUE_TEMPLATE/epic.md): Problem, Users, Goals, Non-goals, Success measures                                      |
| SDD, spec-driven development            | The [decision workflow](engineering/agents/decision-workflow.md): goal, design note, decision, issues, implementation. Nothing is built without an issue that says when it is done |
| Spec, ticket, story                     | An **issue** with Problem, Expected outcome and Done when                                                                                                                          |
| User story                              | The "who is affected" part of an issue's Problem, or the Users section of an epic                                                                                                  |
| Acceptance criteria, definition of done | **Done when**                                                                                                                                                                      |
| Definition of ready                     | The **Ready** rule: specified, unblocked, carries a readiness label                                                                                                                |
| Non-goals, out of scope                 | Non-goals in an epic; exclusions under Expected outcome in an issue                                                                                                                |
| RFC, design doc, tech spec              | **Design note** in `engineering/designs/`                                                                                                                                          |
| ADR                                     | **ADR** in `engineering/adr/`                                                                                                                                                      |
| Plan, implementation plan               | The agent's approach to one issue. It is stated in the issue or pull request when the owner asks for it; it is not a separate document                                             |
| Vertical slice, tracer bullet           | **Slice**: a part of an issue that works end to end and ships as its own pull request                                                                                              |
| HITL, human in the loop                 | `ready-for-human`, `decision-needed`, and the owner's merge authorization                                                                                                          |
| AFK, autonomous or unattended agent     | `ready-for-agent`                                                                                                                                                                  |
| WIP limit                               | At most four issues **In progress**                                                                                                                                                |
| Kanban board, backlog                   | The **Project** with its Status field                                                                                                                                              |
| Quality gate, CI gate                   | **Gate**                                                                                                                                                                           |
| Policy, rule, constraint for agents     | **Guardrail**                                                                                                                                                                      |
| Context, memory, rules file             | `AGENTS.md` for rules, `CONTEXT.md` for vocabulary, ADRs for decisions                                                                                                             |
| Evals                                   | Not included. Add them as a check when the product has agent-facing output to measure                                                                                              |
| Runbook                                 | An operations page under `engineering/operations/`                                                                                                                                 |

## Product terms

Replace this line with the product's own terms as they appear.
