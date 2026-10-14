---
name: issue
description: Turn a rough goal from the owner into complete epic or task issues, shown as drafts first and created with pnpm issue create.
disable-model-invocation: true
argument-hint: "<goal in your own words>"
---

Turn this goal into issues: $ARGUMENTS

Read [the decision workflow](../../../engineering/agents/decision-workflow.md),
[the issue tracker](../../../engineering/agents/issue-tracker.md),
[triage labels](../../../engineering/agents/triage-labels.md) and `CONTEXT.md` first; they own
the rules, and this skill only orders the steps.

1. **Look for what exists.** Search open and closed issues with
   `gh issue list --state all --search "<words>"`, and `engineering/adr/`. Reuse or extend an
   existing issue instead of duplicating it, and name any decision that already constrains the goal.
2. **Decide the shape.** One task when one pull request can deliver it. An epic with tasks when
   it is one outcome in several steps; one task per pull request. A goal with an open design
   question gets `decision-needed` on the task that waits for the answer, or a design note first.
3. **Draft every issue** with the sections of `.github/ISSUE_TEMPLATE/task.md` or `epic.md`:
   the problem, the expected outcome with its exclusions, and "Done when" criteria a reviewer can
   check, each with how it is verified. Use the terms of `CONTEXT.md`. Pick a work-type label,
   an `area:*` label, the parent epic, `ready-for-agent` or `ready-for-human`, and propose a
   Status and Priority.
4. **Show the drafts and wait.** Present titles, labels, parent, Status, Priority and bodies, and
   ask the owner what to change. Create nothing before the owner says yes.
5. **Create** each issue with `pnpm issue create`, epic first, passing the body with
   `--body-file` from a file under `.local/`. Run `pnpm issue show <number>` for each and fix
   what it reports.
6. **Report** the numbers and links. Do not start the work: that is `pnpm task start`.
