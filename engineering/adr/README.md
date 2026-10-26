# Architecture Decision Records

New projects start without ADR records. Rationale for inherited tooling belongs in its maintained engineering guide or, for a surprising local implementation choice, a code comment; see [knowledge ownership](../agents/decision-workflow.md#knowledge-ownership).

Create a record when the project makes a consequential decision that constrains later work. Use one file per decision, named `NNNN-short-title.md` with a four-digit number in order of acceptance, starting at `0001`. No initial adoption record is required.

Each record starts with its state, so that accepted and replaced decisions can be told apart without reading them:

```md
---
status: accepted
---
```

A replaced record says `status: superseded by NNNN`.

Each record has four sections: **Context** (the situation and forces), **Decision** (what was decided, including any rule every later change must satisfy), **Consequences** (what becomes easier and harder) and **Alternatives** (what was considered and why it was not chosen).

Include sufficient context, reasons and significant alternatives to understand the decision from a checkout. Link supporting [research](../research/README.md) or [design notes](../designs/README.md) for their canonical detail; issue and pull-request links are supplementary provenance. Apply the [portability review](../agents/decision-workflow.md#portability-review) when proposing the record. An accepted decision that changes policy takes effect through the normal authorized merge.

A record is not edited after acceptance, except to change its status line when another record replaces it. A record that changes an earlier one names it.
