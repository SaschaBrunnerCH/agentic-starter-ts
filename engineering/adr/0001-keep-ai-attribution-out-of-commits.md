---
status: accepted
---

# 0001 Keep AI attribution out of commits and pull requests

## Context

Agents write nearly every change in repositories made from this template, under the owner's authorization. Agent tools add attribution by default: co-author trailers, "Generated with" lines and links. The AI Contributor Spec v0.2 asks that AI-authored commits be traceable (`AIC-ai-authorship-traceability`) and that the model be recorded (`AIC-ai-model-provenance`).

Two facts weigh against that here. A trace that is on every commit says nothing, because every commit is agent work. And the details are hard to record correctly: a session often cannot name the model that wrote a given part, models change within a task, subagents run other models, and a squash merge combines the work of several sessions in one commit. A model name written there would often be a guess.

## Decision

Commits and pull-request text carry no AI attribution: no co-author trailers, no "Generated with" or "Assisted by" lines, no tool links. `scripts/attribution.ts` rejects them in commit messages and in `pnpm task ready`.

The trace that matters is the authorization: each merge records the owner's yes for the exact head commit on the pull request.

This deviates from `AIC-ai-authorship-traceability` and `AIC-ai-model-provenance` of the AI Contributor Spec v0.2.

## Consequences

- Commit history stays free of tool advertising and of unreliable model claims.
- Nobody can tell from a commit alone whether an agent wrote it; in these repositories, assume one did.
- Revisit this decision when a repository becomes public or accepts contributions from people other than the owner. Then the cheapest way to meet the spec is one neutral trailer, such as `AI-Assisted: yes`, without tool or model names, which the attribution check would allow and `task merge` would add.

## Alternatives

- **One neutral trailer on agent commits.** Meets the traceability clause cheaply, but carries no information while every commit has it.
- **The spec's full form, tool and model per commit.** Most traceable on paper, but often wrong for the reasons above, and it reintroduces the vendor lines the ban removes.
