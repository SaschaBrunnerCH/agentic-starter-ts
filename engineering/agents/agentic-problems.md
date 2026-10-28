# Problems in agentic work

Working with coding agents fails in ways that working alone does not. This page lists the problems met in several months of daily work with Claude Code and Codex on real projects, what each looks like, what this repository does about it, and what is left to people. Most mechanisms in the starter exist because of one of them: read the reason here before removing one.

## Several agents at once

### Two agents change the same checkout

**Looks like:** edits land in the shared checkout instead of the task's; one session's half-finished change shows up in another's diff or test run; a branch is switched under a running session.

**Handled by:** `pnpm task start` creates a task worktree under the sibling `<repo-name>.worktrees/` directory and a branch per issue, and every rule keeps the primary checkout untouched. A claim assigns the issue, so two sessions cannot start the same one; a claim that races another steps back. `pnpm task cleanup` removes only the task's own clean worktree and refuses anything uncertain. See the [task lifecycle](task-lifecycle.md).

**Left to people:** a session that edits files by absolute path can still reach the primary checkout. Look at `git worktree list` and `git status` there when something seems wrong.

### Agents compete for the machine

**Looks like:** two test suites, builds or browser runs side by side push the load up and fail on timeouts that have nothing to do with the change; a test talks to another worktree's server on the same port; a shared cache reloads another session's page.

**Handled by:** supported tests, builds, gates and browser commands reserve one per-user slot across participating repositories and worktrees; nested commands reuse verified ownership. [Local workload coordination](workload-coordination.md) describes cancellation, crash recovery and adoption. Browser tests also derive their port from the worktree's directory and fail on a busy port instead of testing whatever answers there. Build output stays in each worktree; the repository's browser cache is shared through the Git common directory. Browser acceptance runs separately from the push gate.

**Left to people:** inspect host load from nonparticipating commands, other users, Windows activity and containers; they do not automatically share the reservation. Keep coordinator protocols and state compatible across participating repositories, and leave other sessions' processes alone. See "Sharing the machine" in [working style](working-style.md).

### Work moves underneath

**Looks like:** `main` moves while a pull request waits; another session merges something the work depended on; evidence gathered on one base no longer describes the pull request.

**Handled by:** `pnpm task start` branches from the fetched `main`. `pnpm task ready` and the rulesets require a branch current with `main` and a green `PR build` on the head commit; a new commit needs a new authorization.

### Too much in progress

**Looks like:** the owner loses the overview; issues sit In progress for days; nobody knows which session owns what.

**Handled by:** at most four issues In progress, refused by `pnpm issue claim`; `pnpm issue wip` and the Project's "Current work" view show them with their assignee, and `pnpm task handoff <number>` prints where each one's handoff is.

## Authority

### A merge or release nobody approved

**Looks like:** an agent merges because it was told "merge when green" for another pull request, or yesterday; an agent tries a merge command to see what happens; a release is tagged on its own initiative.

**Handled by:** the rulesets require a green build and the owner's account; `pnpm task merge` merges only the head commit passed as approved and records the authorization on the pull request; `pnpm release` tags only with `--authorized-by-owner`. A yes is for one pull request at one commit.

**Left to people:** a session on the owner's account passes the rulesets, so the yes rests on a truthful record. Give authorizations per pull request, and say when a broader one ends. A separate agent account without bypass rights removes this risk; see the [threat model](../security/threat-model.md).

### Writing to someone else's repository

**Looks like:** an agent files an upstream issue, comments on a public pull request or pushes to a fork while "finishing the task".

**Handled by:** "External repository approval" in `AGENTS.md`: every such write needs the owner's approval of the exact text, each time.

### Instructions hidden in what an agent reads

**Looks like:** an issue, a comment, a web page or a dependency's README tells the agent to run a command, skip a check or reveal a credential.

**Handled by:** "Untrusted content" in `AGENTS.md`: only the owner and that file give instructions. `.claude/settings.json` denies Claude Code `.env` files and shell fetches. See the [threat model](../security/threat-model.md).

### Credentials in the wrong place

**Looks like:** a key pasted into a chat stays in the tool's local history; a token lands in a commit, a log or a pull request.

**Handled by:** Secretlint at commit and `pnpm check:secrets`; farm and preview keys are environment secrets that only `main` may use; [data handling](data-handling.md) says what may appear where.

**Left to people:** never paste a credential into a chat. Store it with `gh secret set … < file` or in an ignored file, and rotate one that was pasted.

## Evidence

### "It works" without proof

**Looks like:** a run reported as finished that is still going; a timing misread; a feature called done because the code compiles; a test result from another commit.

**Handled by:** the pull-request template asks for the commands, the commit and the results; `pnpm task ready` checks the build of the head commit; `pnpm test:devices --report` refuses to report for another commit or a dirty tree. A [second agent's review](review.md) adds an independent reading.

**Left to people:** ask for the evidence, not the conclusion: the command, the commit, the output.

### Green locally, red in CI

**Looks like:** a stale build output hides a type error; a check runs on part of the projects; a local package manager writes a lockfile CI rejects; a missing local tool makes a check pass that fails in CI.

**Handled by:** the push hook and the PR build run one list (`scripts/checks/run-local-checks.ts`); the hook refuses a dirty tree or another commit and checks again after the checks; pnpm's version is pinned and recorded in the lockfile; actionlint and zizmor are downloaded at pinned versions with checksums.

**Left to people:** install what [local verification](local-verification.md) names, such as `shellcheck`, so local runs find what CI finds.

### Checks bent to pass

**Looks like:** a proposal to patch out a platform guard, raise a tolerance, add a retry or skip a hook "just this once".

**Handled by:** `AGENTS.md` forbids skipping a hook or weakening a check, except a hook that is itself broken; retries are off; `pnpm check:agents` ties every guardrail to a mechanism that exists and keeps `.claude/settings.json` deny-only. A test believed wrong is escalated with measurements.

**Left to people:** when an environment is missing, provide it, for example Playwright's container, instead of changing the check.

### More verification than the change needs

**Looks like:** hours of full browser suites for a one-line fix; a full rerun after a small correction; product work stalled behind evidence.

**Handled by:** the push gate and PR build run the code/build checks without browser journeys. Routine browser acceptance runs locally in Chrome on a verified GPU and is reported on the PR. Broader engines, systems and devices run only when the owner explicitly requests them; `pnpm test:devices` reports that coverage. [CI minutes](../operations/ci-minutes.md) lists the cost of each run.

**Left to people:** decide per change what evidence it needs, say so in the pull request, and do not rerun what already passed on the same commit.

## Scope and context

### Building more than was asked

**Looks like:** a plan of two dozen issues where a third would do; a feature kept because an old version had it, though nobody wanted it; tests for a format that is being removed.

**Handled by:** tracked changes start from an issue with observable "Done when" criteria; [working style](working-style.md) asks for the smallest complete change; issues an agent proposes go to Backlog for the owner to decide.

**Left to people:** challenge the scope before a large build, and ask where an inherited requirement came from before keeping it.

### Decisions lost in status reports

**Looks like:** a question buried in the middle of a long update, so work waits on an answer nobody saw.

**Handled by:** the `decision-needed` label and the Project's "Decisions" view; the [decision workflow](decision-workflow.md) says how to ask for an authorization.

**Left to people:** agents ask a real decision as a question of its own, with a recommendation, and keep working on what does not depend on it.

### Lost context

**Looks like:** a session compacted many times forgets an earlier decision; a new session starts from a chat summary; knowledge lives in a private notes file instead of the repository.

**Handled by:** the issue is the specification; the handoff file records the state of unfinished work; decisions go into ADRs and terms into `CONTEXT.md`, where every later session finds them.

**Left to people:** when an agent asks something it should know, put the answer in the repository, not only in the chat.

### Leftovers

**Looks like:** old worktrees and branches pile up; stale remote refs confuse the next session.

**Handled by:** `pnpm task cleanup` after every merge, which fetches, removes only what matches the merged head and reports the rest.

## Cost

### CI minutes run out

**Looks like:** the monthly Actions budget is used up mid-month and every pull request waits.

**Handled by:** the push hook fails a push before CI does; jobs are few and on Linux; explicitly requested extra browser and device runs are reported on the pull request. See [CI minutes](../operations/ci-minutes.md).

## The tools themselves

### The agent acts on the desktop

**Looks like:** an agent opens several GPU-heavy browser windows on the owner's session and freezes the machine; a headed browser fails because the screen locked; inherited display variables make test browsers slow.

**Handled by:** browser tests run headless.

**Left to people:** agents do not open graphical applications on the owner's session; they hand over a URL. See "Sharing the machine" in [working style](working-style.md).

### The environment changes mid-session

**Looks like:** a sandbox loses network or write access halfway; the command-line tool and a connected app use different GitHub accounts; a token lacks a scope.

**Handled by:** "When you cannot do a step" in `AGENTS.md`: report what is missing and stop at what can be done, instead of working around it.

**Left to people:** check the account with `gh auth status` before a session that writes to GitHub, and grant a tool the access the task needs at its start.
