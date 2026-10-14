# Architecture Decision Records

One file per decision that constrains later work, named `NNNN-short-title.md` with a four-digit number in order of acceptance.

Each record starts with its state, so that accepted and replaced decisions can be told apart without reading them:

```md
---
status: accepted
---
```

A replaced record says `status: superseded by NNNN`.

Each record has four sections: **Context** (the situation and forces), **Decision** (what was decided, including any rule every later change must satisfy), **Consequences** (what becomes easier and harder) and **Alternatives** (what was considered and why it was not chosen).

A record is not edited after acceptance, except to change its status line when another record replaces it. A record that changes an earlier one names it.
