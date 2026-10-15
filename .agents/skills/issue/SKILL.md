---
name: issue
description: Turn a rough goal from the owner, or an existing epic, into complete epic or task issues, ordered with blockers when there are several, shown as drafts first and created with pnpm issue create.
disable-model-invocation: true
argument-hint: "<goal in your own words, or an epic number>"
---

Turn this into issues: $ARGUMENTS

Read [the decision workflow](../../../engineering/agents/decision-workflow.md),
[the issue tracker](../../../engineering/agents/issue-tracker.md),
[triage labels](../../../engineering/agents/triage-labels.md) and `CONTEXT.md` first; they own
the rules, and this skill only orders the steps.

1. **Look for what exists.** Search open and closed issues with
   `gh issue list --state all --search "<words>"`, and `engineering/adr/`. Reuse or extend an
   existing issue instead of duplicating it, and name any decision that already constrains the goal.
   Given an epic number, read it with `gh issue view <epic> --comments`, its design note or ADR,
   and its children, open and closed; extend a child that already covers part of it instead of
   planning that part again. `pnpm issue show` does not list children; this does, 100 at a time
   (with more, page on with `after:` and `pageInfo { endCursor }`):

   ```sh
   gh api graphql -F owner=<owner> -F name=<repository> -F number=<epic> -f query='
     query($owner: String!, $name: String!, $number: Int!) {
       repository(owner: $owner, name: $name) { issue(number: $number) {
         subIssues(first: 100) { totalCount nodes { number title state } } } } }'
   ```

2. **Decide the shape.** One task when one pull request can deliver it. An epic with tasks when
   it is one outcome in several steps. A goal with an open design question gets
   `decision-needed` on the task that waits for the answer, or a design note first; in an epic,
   that decision is the first task.
3. **Cut and order the tasks** of an epic. One task per pull request, each something a reviewer
   can check on its own, end to end where possible rather than one layer at a time; prefer
   more, smaller tasks. For each, the tasks it needs first, which become native blockers, and
   the files or folders it will change, as glob patterns for its "Touches" section. Tasks that
   may run at the same time must not touch the same files: make one wait for the other, or cut
   them differently.
4. **Draft every issue** with the sections of `.github/ISSUE_TEMPLATE/task.md` or `epic.md`:
   the problem, the expected outcome with its exclusions, "Touches", and "Done when" criteria a
   reviewer can check, each with how it is verified. Use the terms of `CONTEXT.md`. Pick a
   work-type label, an `area:*` label, the parent epic, `ready-for-agent` or `ready-for-human`,
   and propose a Priority, with Status Ready only for an issue without an open blocker or
   decision.
5. **Show the drafts and wait.** For several tasks, first a table: order, title, blocked by,
   touches, Status, Priority, agent or human, and which can run in parallel. Then titles,
   labels, parent and bodies. Ask the owner what to change. Create nothing before the owner
   says yes.
6. **Create** each issue with `pnpm issue create`, epic first, then the tasks in order with
   `--parent <epic>`, passing each body with `--body-file` from a file under `.local/`. Add each
   blocker with `pnpm issue blocked-by <task> <blocker>`. Run `pnpm issue show <number>` for
   each and fix what it reports.
7. **Report** the numbers and links, the order and what can start now (`pnpm issue ready`). Do
   not start the work: that is `pnpm task start`.
