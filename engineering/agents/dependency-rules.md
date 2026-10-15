# Dependency-direction rules

Rules about which part of the code may import which: the domain does not import the UI, a feature does not reach into another feature's internals, a library entry does not pull in the application. The starter has none, because its application is one page. This page says when to add them and how to make them checks rather than advice.

## When they pay off

Add a rule when one of these shows up, not before:

- **A layer leaks.** Code that should be plain logic imports React, the DOM, a map engine or a network client, so it can no longer be unit-tested without them.
- **A change spreads.** A small change in one area keeps forcing edits in unrelated ones, because they import each other's internals.
- **An agent takes the short way.** Agents import whatever makes the code compile. A boundary written only in prose will be crossed; a review finds it late, if at all.
- **A part is published or shared.** A package, an SDK entry or a module another application uses must not pull in what it does not need, so its bundle and its API stay small.
- **A cycle appears.** Two modules import each other, and their load order starts to matter.

For one small application, a clear folder structure and review are enough.

## How to enforce them

Start with the linter the gate already runs. Oxlint's `no-restricted-imports`, set per folder with `overrides` in `.oxlintrc.json`, refuses an import across a boundary, with a message that tells an agent what to do instead:

```json
{
  "overrides": [
    {
      "files": ["src/domain/**"],
      "rules": {
        "no-restricted-imports": [
          "error",
          {
            "patterns": [
              {
                "group": ["**/ui/**", "react"],
                "message": "The domain layer does not depend on the UI."
              }
            ]
          }
        ]
      }
    }
  ]
}
```

With Oxlint 1.88, `import { Button } from "../ui/button"` in `src/domain/route.ts` then fails `pnpm lint` with "'../ui/button' import is restricted from being used by a pattern. help: The domain layer does not depend on the UI.", while `src/ui/view.ts` may still import the domain.

When rules span the whole graph, such as no cycles, nothing reachable from an entry point may reach a module, or type-only imports count too, a lint rule per file is not enough. Then use a dependency checker that reads the whole import graph (for example dependency-cruiser), or a small script in `scripts/` that walks the graph from each entry point, and run it from `scripts/run-local-checks.ts` so it is part of the gate and the `PR build`.

## Make it a guardrail

1. **Add a negative control.** A fixture or a unit test with a forbidden import that the check must refuse. Without it, a misspelled pattern passes everything and protects nothing.
2. **Add a row to the guardrail table** in `AGENTS.md`: the rule in one sentence, the mechanism (`pnpm lint`, or the checker and where the gate runs it), and its status, Enforced.
3. **Write down why.** A short ADR or design note names the layers and the direction, so a later change to the rule is a decision, not a quiet edit.
4. **Fix existing violations first**, or list them as the rule's known exceptions with an issue each. A rule that starts red gets switched off.
