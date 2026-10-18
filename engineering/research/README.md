# Research records

The result of an investigation: a measurement, comparison, experiment or source review, usually scoped by an `investigation` issue. Keep independently useful findings even when no design is selected; completing research does not authorize implementation. One file per investigation, named `YYYY-MM-DD-short-title.md`.

Each record states:

- the question, context and related issue as supplementary provenance;
- the date, tested revision or source versions, and the relevant environment;
- the methods, findings and evidence, including hypotheses that turned out wrong;
- significant alternatives and tradeoffs, limitations, remaining questions and what would make the question worth asking again.

Distinguish measured results, source-derived findings, hypotheses and unverified claims. Cite sources next to supported claims and explain the relevant evidence in the record; a link or retained log alone is insufficient. Use enough space for the useful substance, with no fixed length target.

Where reproduction matters, link safe, shareable scripts, fixtures or examples committed in an appropriate location, with usage instructions. Describe methods and reproduction limits when raw inputs are private, too large or otherwise unavailable. State how those limits affect the conclusions. Keep sensitive inputs and scratch output under [data handling](../agents/data-handling.md) and [local-artifact guidance](../agents/working-style.md#local-artifacts); curate their lasting findings into the record.

A record is not rewritten when a later investigation disagrees; the later record names the earlier one. Proposed solutions go in a [design note](../designs/README.md); accepted decisions that constrain later work become an [ADR](../adr/README.md). Link these records instead of duplicating their explanations. Apply the [portability review](../agents/decision-workflow.md#portability-review) before delivering findings.

[Knowledge-retention audit](2026-10-18-knowledge-retention-audit.md) is a source-review example with reproducible commands and explicit limits.
