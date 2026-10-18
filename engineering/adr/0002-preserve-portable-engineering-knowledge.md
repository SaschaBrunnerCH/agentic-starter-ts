---
status: accepted
---

# 0002 Preserve portable engineering knowledge

## Context

An issue tracker coordinates work and keeps review discussions, but its content is absent from a Git checkout. A fork or transfer may preserve files while access to the original collaboration space is lost. Links remain useful provenance, yet essential findings and reasons held only behind those links cannot be recovered from the checkout.

This template already separates research records, design notes, ADRs and ignored scratch artifacts. The [knowledge-retention audit](../research/2026-10-18-knowledge-retention-audit.md) found that this structure lacked an explicit portability requirement and left conflicting routes for durable decisions. Research also appeared to require progressing toward a design recommendation.

## Decision

Preserve essential engineering knowledge in version-controlled records sufficient for their purpose. Research records own methods, findings, evidence and uncertainty; design notes own evolving proposals; ADRs own accepted lasting decisions and their rationale. Safe reproduction materials belong in appropriate tracked scripts, fixtures or examples with usage instructions. Issues and PRs own coordination and review and link these records as supplementary provenance.

Keep useful research even when no solution is selected. Completing research does not authorize implementation. Keep one canonical home for each substantive explanation, cite sources beside supported claims and preserve material evidence, significant alternatives and limitations without a fixed word or page limit.

Private inputs and transient artifacts remain local or in an approved restricted location. Explain methods, unavailable inputs and the resulting reproduction limits in the shared record. Existing data-handling and publication approval rules apply.

The author performs the manual [portability review](../agents/decision-workflow.md#portability-review) for lasting findings and decisions: ignore issue/PR links and check whether the tracked records explain the relevant problem, evidence, alternatives, rationale, limitations and remaining questions. Record the result and gaps in the PR. Automated formatting and link checks cannot establish this completeness.

Adopt the policy incrementally through ordinary work. Preserve dated research and existing ADR history through their established follow-up and supersession processes. Documentation normally accompanies related behavior; independently useful research and requested policy work can be delivered separately.

## Consequences

- Contributors and agents can recover important engineering knowledge from a checkout and review changes to it in Git.
- Research can end with useful findings and uncertainty while product decisions remain open.
- Curating discussions into records adds maintenance work. Clear ownership and links reduce duplication; explicit dates, revisions, limitations and revisit conditions help readers assess stale findings.
- Private or large evidence may remain unavailable. A record can explain its limits but cannot promise complete reproduction.
- Semantic completeness remains a human or agent review responsibility. The policy adds no dependency or automated prose-length check and leaves invocation, gate and merge authorization requirements intact.

## Alternatives

- **Keep findings in issue and PR threads.** Convenient for discussion but makes a checkout depend on external access and obscures lasting conclusions among administrative updates.
- **Copy whole conversations or logs into Git.** Preserves volume while adding duplication, sensitive-data risk and maintenance cost. Curated findings retain the useful substance.
- **Require an ADR for every investigation.** Conflates evidence with an accepted choice and pressures research toward premature decisions.
- **Bulk-migrate history or enforce fixed-length summaries.** Adds unrelated work or removes material evidence. Incremental adoption and a purpose-specific review address the actual gap.
