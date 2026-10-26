# CI minutes

GitHub-hosted runners cost minutes on a private repository, and a plan includes a monthly amount; the billing page of the account shows what is used. A starter repository uses few. A real project uses many more as its build, its tests and the number of pull requests grow, so plan for it from the start: find problems on the machine before CI does, and spend CI time only where it is the evidence.

## What a run costs

Measure the project's actual runs, job count and frequency rather than inheriting starter timings. Include PR builds, CodeQL, deployment, previews, cleanup, audit and explicit release runs where enabled. Consult the account's current billing terms for runner rates and allowances; elapsed job time alone is not the billed cost.

To see what a run cost:

```sh
gh run list --workflow "PR build" --limit 5
gh api repos/<owner>/<repository>/actions/runs/<run id>/jobs --jq '.jobs[] | "\(.name) \(.started_at) \(.completed_at)"'
```

## What keeps it low

Most of this is already in place; the rest are options for when a project grows. In order of effect:

1. **Fail on the machine, not in CI.** The pre-push hook runs the same checks as the PR build and refuses a push that fails them, so a push that reaches CI has already passed them once. Never skip it to save time: a failing PR build costs the minutes and the push after it again. Run the browser tests before asking for review of a change to what users see (`pnpm test:browser`, on the machine's GPU), since neither the hook nor the `PR build` does, and report the run in the pull request.
2. **Push less often.** Every push to a pull request is a full `PR build`. Commit as often as you like and push when the work is ready for review. A newer push cancels the run of the older one. Editing a pull request's title or body starts nothing.
3. **Run broader coverage only when requested.** Routine acceptance uses local Chrome on a verified GPU. When the owner explicitly requests extra engines, systems or devices, `pnpm test:devices --report <pr>` runs the selected coverage and reports it on the pull request. Local runs cost no CI minutes; testing farms can charge separately. PR builds never install or run browser journeys. See [browser testing](../agents/browser-testing.md).
4. **Keep jobs few.** Every job costs at least a minute and repeats checkout, Node.js and the install. The PR build is therefore one job running the code/build gate. Add a step to an existing job before adding a job, unless the job must hold other permissions or must run in parallel to stay fast; a new PR build job must also become a required status of the main ruleset, which `scripts/checks/workflow-contract.test.ts` checks.
5. **Choose runners deliberately.** Use Linux for the ordinary gate and check current account rates before adding other hosted runners. Test other systems on a machine or a farm, as in point 3.
6. **Caches.** The PR build caches the pnpm store; deploy and release builds install fresh on purpose. Browser acceptance uses the [shared local browser cache](../agents/browser-testing.md#on-your-machine), outside the PR build.
7. **Timeouts.** Every job has one, checked by `scripts/checks/workflow-contract.test.ts`, so a hung job stops early instead of running for six hours.

Deployment smoke checks, explicit release verification and owner-requested farm runs remain separate from PR acceptance; see [browser testing](../agents/browser-testing.md).

## Options for a growing project

| Option                                         | Saves                                          | Costs or risks                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run only the tests a change can affect         | Most of a large suite on small changes         | Vitest's `--changed` helps local feedback; keep the full unit-test gate and coverage floor. For browsers, follow the [browser selection guidance](../agents/browser-testing.md#as-the-suite-grows): review the complete pull-request diff and affected behavior, and enforce complete verification at the release boundary before reducing pull-request acceptance. |
| Split the browser tests across jobs (sharding) | Waiting time, not minutes: more jobs cost more | Consider only for separately required release verification or explicitly requested wider testing; PR builds contain no browser jobs. It saves waiting time when a suite takes many minutes, not cost.                                                                                                                                                               |
| Merge the deploy jobs                          | One or two billed minutes per merge            | The publishing job would then run repository code; the separation in [deployment](deployment.md) is worth the minutes.                                                                                                                                                                                                                                              |
| A self-hosted runner                           | All GitHub minutes of the jobs it takes        | The machine runs pull-request code: only for private repositories without outside contributors, isolated from other work and kept up to date. Set it up in an issue with the owner's decision.                                                                                                                                                                      |
| A public repository                            | Standard runners are free there                | Only if the code may be public; CodeQL and private vulnerability reporting then work too.                                                                                                                                                                                                                                                                           |
| Fewer scheduled runs                           | The weekly audit and preview sweep             | Little to save; they are cheap.                                                                                                                                                                                                                                                                                                                                     |

## Rules

- Report local results in the pull request with their commit, as the pull-request template asks. The local GPU browser run is the browser evidence; the required `PR build` still has to pass.
- Do not rerun a failed job to see whether it passes again. Find the cause; a flaky test gets a `bug` issue.
- A change that adds a job, a matrix or a scheduled run says in its pull request what it costs per run and per month.
