# AI incidents

An AI incident is an agent action that crossed a rule, whether or not harm followed:

- a merge, push, release or deploy nobody authorized;
- a post or change in a repository or service the owner did not approve;
- a credential or Confidential data in a prompt, commit, pull request, issue, log or other text (see [data handling](../agents/data-handling.md));
- a deleted or overwritten file, branch, worktree or setting that was not the agent's to remove;
- a guardrail weakened, a hook skipped or a check edited to make it pass.

## What to do

1. **Stop.** End the session or stop the run. Revoke an exposed credential before anything else.
2. **Repair.** Revert the change through a pull request, restore the previous deploy with the rollback in [deployment](deployment.md), restore settings with `pnpm setup:github`.
3. **Record.** Open a `bug` issue titled "Incident: …" with what happened, when, the evidence (commits, run links, redacted logs) and the repair. Keep Confidential data out of it.
4. **Close the gap.** Within a week, decide which check or rule would have stopped it and add it in its own pull request, with the guardrail table updated. "Agents should be more careful" is not a fix; a mechanism is.

The owner triages incidents. A mistake that happens twice without an incident record was an incident the first time.
