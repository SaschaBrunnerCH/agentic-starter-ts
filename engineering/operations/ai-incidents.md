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
4. **Close the gap.** Within a week, identify the cause and failed or missing control, complete effective corrective action, and record verification evidence in the incident issue. Repair an existing control, remove conflicting instructions or add a new control as needed. Choose the action that addresses the cause rather than growing the rule set after every incident. "Agents should be more careful" is not evidence of a correction. Repository changes still follow the issue, pull-request and owner-approval workflow; update the guardrail table when its behavior changes. This deadline does not defer immediate containment or credential revocation.

The owner triages incidents. A mistake that happens twice without an incident record was an incident the first time.
