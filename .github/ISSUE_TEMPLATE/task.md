---
name: Task or bug
about: State the problem, the expected outcome and how completion is checked.
title: ""
labels: "needs-triage"
assignees: ""
---

<!-- Complete the issue metadata in engineering/agents/issue-tracker.md: replace needs-triage with a work-type and an area:* label, set a native parent whose ancestry reaches an epic, add the issue to the Project with a Status, and read all of it back. CLI and API creation bypass this template; supply labels explicitly. -->

## Problem

<!-- What is wrong or missing, and who is affected. For a bug: revision, environment, reproduction and actual behaviour. -->

## Expected outcome

<!-- The observable result. Name exclusions, dependencies and the ADR or design note that constrains it. -->

<!-- Link canonical tracked records for lasting findings and rationale; see engineering/agents/decision-workflow.md#knowledge-ownership. An investigation may finish with findings and open questions without selecting or authorizing an implementation. -->

## Touches

<!-- Optional: the files or folders this work will change, one glob pattern per line, for example `src/routes/**`. `pnpm issue claim` warns when an issue In progress or In review touches the same. -->

- <!-- src/example/** -->

## Done when

<!-- Required: `pnpm issue create` refuses a task without at least one item here. The pull request is checked against these items. -->

- [ ] <!-- Observable acceptance criterion, with its verification method. -->
