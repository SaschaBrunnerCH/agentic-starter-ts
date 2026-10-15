# CI minutes

GitHub-hosted runners cost minutes on a private repository, and a plan includes a monthly amount; the billing page of the account shows what is used. A starter repository uses few. A real project uses many more as its build, its tests and the number of pull requests grow, so plan for it from the start: find problems on the machine before CI does, and spend CI time only where it is the evidence.

## What a run costs

GitHub rounds every job up to a whole minute. Measured on this starter, with Linux runners:

| Workflow       | When                               | Jobs, with their time                                                                                 | Billed     |
| -------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------- |
| `PR build`     | Every push to a pull request       | One job: the checks, about 30 s; with `BROWSER_TESTS_IN_CI`, the browser tests too, about 65 s in all | 1–2 min    |
| `Deploy`       | Every merge                        | Build about 14 s, deploy about 11 s, the test of the deployed site about 45 s                         | 3 min      |
| `PR preview`   | After a green `PR build`           | One job of about 12 s                                                                                 | 1 min      |
| Cleanup, audit | When a pull request closes; weekly | One short job each                                                                                    | 1 min each |

A merged pull request with one push costs about seven minutes. Every further push adds another `PR build`. In a real project the checks and browser tests grow with the code; the rest stays nearly the same. Browser tests of an application that draws in 3D can grow a `PR build` past ten minutes, since the runner draws in software: one more reason they run on the machine by default.

To see what a run cost:

```sh
gh run list --workflow "PR build" --limit 5
gh api repos/<owner>/<repository>/actions/runs/<run id>/jobs --jq '.jobs[] | "\(.name) \(.started_at) \(.completed_at)"'
```

## What keeps it low

Most of this is already in place; the rest are options for when a project grows. In order of effect:

1. **Fail on the machine, not in CI.** The pre-push hook runs the same checks as the PR build and refuses a push that fails them, so a push that reaches CI has already passed them once. Never skip it to save time: a failing PR build costs the minutes and the push after it again. Run the browser tests before asking for review of a change to what users see (`pnpm test:browser`, on the machine's GPU), since neither the hook nor, by default, the `PR build` does, and report the run in the pull request.
2. **Push less often.** Every push to a pull request is a full `PR build`. Commit as often as you like and push when the work is ready for review. A newer push cancels the run of the older one. Editing a pull request's title or body starts nothing.
3. **Test extra browsers and devices on the machine.** `pnpm test:devices --report <pr>` runs Firefox, WebKit, phone emulation and testing-farm devices locally and posts the results on the pull request. That coverage costs no CI minutes. CI runs browser tests only when the repository variable `BROWSER_TESTS_IN_CI` is `true`, or once in a `PR build` started by hand with "Run the browser tests". See [browser testing](../agents/browser-testing.md).
4. **Keep jobs few.** Every job costs at least a minute and repeats checkout, Node.js and the install. The PR build is therefore one job: the checks, followed by the browser tests when they are switched on. Add a step to an existing job before adding a job, unless the job must hold other permissions or must run in parallel to stay fast; a new PR build job must also become a required status of the main ruleset, which `scripts/workflow-contract.test.ts` checks.
5. **Linux only.** Windows runners count double and macOS runners ten times. Test other systems on a machine or a farm, as in point 3.
6. **Caches.** The PR build caches the pnpm store; deploy and release builds install fresh on purpose. When the browser install becomes a large share of the PR build, cache `~/.cache/ms-playwright` keyed on the Playwright version, in the PR build only.
7. **Timeouts.** Every job has one, checked by `scripts/workflow-contract.test.ts`, so a hung job stops early instead of running for six hours.

## Options for a growing project

| Option                                                                               | Saves                                                             | Costs or risks                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skip the browser tests for documentation-only changes, with `BROWSER_TESTS_IN_CI` on | The browser test steps on pull requests that change only Markdown | A rule that decides from the changed files, inside the one job; a wrong rule skips tests that were needed. Decide in an issue and test the rule.                                               |
| Run only the tests a change can affect                                               | Most of a large test suite on small changes                       | Vitest's `--changed` and Playwright's `--only-changed` compare with `main`; a shared module touches everything anyway, so run the full suite on `main` or weekly.                              |
| Split the browser tests across jobs (sharding)                                       | Waiting time, not minutes: more jobs cost more                    | Use it for speed when a suite takes many minutes, not for cost.                                                                                                                                |
| Merge the deploy jobs                                                                | One or two billed minutes per merge                               | The publishing job would then run repository code; the separation in [deployment](deployment.md) is worth the minutes.                                                                         |
| A self-hosted runner                                                                 | All GitHub minutes of the jobs it takes                           | The machine runs pull-request code: only for private repositories without outside contributors, isolated from other work and kept up to date. Set it up in an issue with the owner's decision. |
| A public repository                                                                  | Standard runners are free there                                   | Only if the code may be public; CodeQL and private vulnerability reporting then work too.                                                                                                      |
| Fewer scheduled runs                                                                 | The weekly audit and preview sweep                                | Little to save; they are cheap.                                                                                                                                                                |

## Rules

- Report local results in the pull request with their commit, as the pull-request template asks. With `BROWSER_TESTS_IN_CI` off, the local browser run is the browser evidence; the required `PR build` still has to pass.
- Do not rerun a failed job to see whether it passes again. Find the cause; a flaky test gets a `bug` issue.
- A change that adds a job, a matrix or a scheduled run says in its pull request what it costs per run and per month.
