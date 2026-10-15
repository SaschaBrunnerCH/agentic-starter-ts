---
name: plan
description: Break an existing epic into child issues of one pull request each, with dependencies as blockers and the files each touches, shown as a plan first and created with pnpm issue create.
disable-model-invocation: true
argument-hint: "<epic number>"
---

Plan epic #$ARGUMENTS into child issues.

Read [the decision workflow](../../../engineering/agents/decision-workflow.md),
[the issue tracker](../../../engineering/agents/issue-tracker.md) and `CONTEXT.md` first. The
[issue skill](../issue/SKILL.md) owns how one issue is drafted and created; this skill adds how an
epic is cut into issues and in which order they can run.

1. **Read the epic and what constrains it.** `gh issue view <epic> --comments`, its design note
   or ADR, and its existing children (`pnpm issue show <epic>`, then each child). Do not plan
   what a child already covers; extend that child instead. When the epic leaves a design
   question open, the first child is that decision (`decision-needed`), not code.
2. **Cut it into slices.** One child per pull request: each delivers something a reviewer can
   check on its own, end to end where possible, rather than one layer at a time. Prefer more,
   smaller children over one that would need several pull requests. Name what stays out.
3. **Order them.** For each child, the children it needs first; these become native blockers.
   For each, the files or folders it will change, as glob patterns for its "Touches" section.
   Children that may run at the same time must not touch the same files: when they would, make
   one wait for the other, or cut them differently.
4. **Draft each child** as the issue skill says: problem, expected outcome with exclusions,
   "Touches", "Done when" criteria with how each is verified, a work-type and an `area:*`
   label, `ready-for-agent` or `ready-for-human`, a Priority. Status Ready only when it has no
   open blocker and no open decision; otherwise Backlog.
5. **Show the plan and wait.** First a table: order, title, blocked by, touches, Status,
   Priority, who (agent or human). Then the bodies. Say which children can run in parallel.
   Ask the owner what to change. Create nothing before the owner says yes.
6. **Create** each child with `pnpm issue create --parent <epic>`, in order, bodies from files
   under `.local/`. Then add each blocker with `pnpm issue blocked-by <child> <blocker>`, and run
   `pnpm issue show <number>` for each and fix what it reports.
7. **Report** the numbers, the order and what can start now (`pnpm issue ready`). Do not start
   the work: that is `pnpm task start`.
