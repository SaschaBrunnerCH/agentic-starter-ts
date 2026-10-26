# Knowledge-retention guidance audit

Date: 2026-10-18. Related coordination: issue #63. This is a source review of the template, not a measurement of contributor behavior.

## Question and context

Does the starter's existing guidance ensure that useful research and decision rationale remain understandable from a checkout without issue or PR access? The question matters because generated repositories carry the documentation but may not retain access to the template's collaboration history.

## Method and evidence

Reviewed revision `aeed3beefb6d479899ed0d0cdde946edd1b1f5b2`, the task's starting `main`. The environment was a local Git checkout on Linux; no browser, private inputs or remote discussion contents were needed. Reproduce the source review from a checkout retaining that revision:

```sh
git show aeed3beefb6d479899ed0d0cdde946edd1b1f5b2:engineering/agents/decision-workflow.md
git show aeed3beefb6d479899ed0d0cdde946edd1b1f5b2:engineering/research/README.md
git show aeed3beefb6d479899ed0d0cdde946edd1b1f5b2:engineering/designs/README.md
git show aeed3beefb6d479899ed0d0cdde946edd1b1f5b2:engineering/adr/README.md
git show aeed3beefb6d479899ed0d0cdde946edd1b1f5b2:engineering/agents/working-style.md
git show aeed3beefb6d479899ed0d0cdde946edd1b1f5b2:engineering/agents/task-lifecycle.md
```

Read the named files and compare their information ownership and completion requirements. The revision-qualified commands are the source citations for the findings below; current versions of the guides will change.

- **Decision workflow:** step 2 combines research with a design note containing a recommendation. There is no explicit branch for retaining research without a selected solution, nor a portability review.
- **Research guide:** already requires the question, tested revision, relevant environment, methods, outcome, failed hypotheses and revisit conditions. It does not explicitly require significant alternatives, limitations, open questions or distinguishing source-derived findings from measurements.
- **Design and ADR guides:** already put proposals and lasting decisions in Git. ADRs require context, decision, consequences and alternatives, and preserve accepted history. A new storage framework is unnecessary.
- **Working style:** requires searching existing ADRs and research, and complete concise writing. Its local-artifact section places reports and standalone notes without a destination in ignored storage, but gives no explicit trigger for curating lasting findings into tracked records.
- **Task lifecycle:** the handoff section says to keep durable decisions “in the issue or an ADR.” That permits issue-only rationale despite the existing tracked ADR structure.

These are source-derived findings. The inference is that an explicit ownership boundary and portability review would resolve ambiguities without replacing the existing structure. Actual loss of downstream knowledge and changes in agent behavior were not measured.

## Alternatives and tradeoffs

Leaving guidance unchanged costs no maintenance but leaves issue-only decisions permissible. A new documentation framework or bulk migration adds overhead without addressing a missing storage capability. Strengthening the existing guides keeps familiar paths, at the cost of manual curation and review. Requiring a recommendation for every investigation can force a choice before the evidence supports one.

## Limitations and remaining questions

This review establishes what the instructions say, not how consistently contributors follow them. No private evidence is needed to reproduce it. A shallow clone may need the tested revision fetched first; if that history is unavailable, the source summaries above remain readable but the original comparison cannot be repeated exactly.

Whether future records are sufficient remains a semantic judgment. Review representative research and decision records without issue/PR links, and report gaps. Revisit the policy if repeated work still leaves essential findings outside the checkout or if duplicated, stale records become a recurring maintenance burden.

No product solution is selected by this investigation. The resulting documentation policy and its reasons are maintained separately under [knowledge ownership](../agents/decision-workflow.md#knowledge-ownership).
