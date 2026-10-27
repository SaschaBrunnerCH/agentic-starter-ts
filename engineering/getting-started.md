# Getting started with agentic work

For people who have a repository from this starter and have not yet worked this way. It assumes the repository is set up as the starter template's README describes. Agents do not need this page; they follow [AGENTS.md](../AGENTS.md).

## The idea

You describe an outcome as an issue. An agent takes the issue, works in its own copy of the repository, runs the checks and opens a pull request. You look at the result and say yes or no. Nothing reaches `main` without a green build and your yes.

![The workflow from issue to merged change](diagrams/workflow.svg)

| Who            | Does                                                                               |
| -------------- | ---------------------------------------------------------------------------------- |
| You, the owner | Write or approve issues, set priorities, answer decisions, authorize each merge    |
| The agent      | Claims an issue, implements it, runs the checks, opens the pull request, cleans up |
| The repository | Rejects a commit, push or merge that breaks a checked guardrail, whoever made it   |

The third row is what makes the first two safe. An agent that is wrong gets stopped by a check; you do not have to catch everything by reading. A change passes four such layers before it reaches `main`:

![Four layers that stop a wrong change: commit hooks, the push gate, the PR build, and the rulesets with the owner's yes](diagrams/guardrails.svg)

## Development environment

Use WSL2, macOS or Linux for your agent and development tools. On Windows, complete [WSL2 setup](setup.md#windows-development-with-wsl2), open the checkout through your editor's WSL integration and launch the agent in a WSL terminal. Task startup and the full verification commands check the Node.js platform before starting work. Native Windows remains available for explicit [browser/device acceptance](agents/browser-device-coverage.md#install-and-launch-on-windows-and-wsl-separately).

## Your first session

Several agents can plan and edit concurrently. Their worktrees share the machine, so supported tests, builds and browser checks take turns through [local workload coordination](agents/workload-coordination.md). This reduces competing runs that can slow verification or trigger timeouts; activity outside participation still needs inspection. After installation, use `pnpm workload status` to inspect the shared reservation and follow the [adoption steps](agents/workload-coordination.md#adopting-the-coordinator) before the first gate.

1. **Write one small issue.** Pick something you could check in a minute. Use the template on GitHub's "New issue" page, or the commands in the README. Example:

   > **Problem.** The name input changes the greeting, but a shared URL cannot initialize it to a chosen name.
   >
   > **Expected outcome.** The page reads the name from a `name` query parameter and falls back to the current text.
   >
   > **Done when**
   >
   > - [ ] `?name=Ada` shows "Hello, Ada."; verified by a unit test.
   > - [ ] No parameter shows the current text; verified by a unit test.

2. **Give it its metadata.** Labels, a parent and a place in the Project. `pnpm issue create` does all of it in one step, as in the README's step 8; for an issue made on GitHub, `pnpm issue show <number>` tells you what is missing.
3. **Start your agent in the repository folder** and say: `Work on issue #<number>.` That is the whole instruction; the rest is in `AGENTS.md`.
4. **Watch what it does.** It should run `pnpm task start <number>`, which claims the issue and creates a second folder next to the repository (its worktree). There it makes the change with tests, runs `pnpm check:push`, pushes, opens a pull request and runs `pnpm task ready <pr>`. If it edits files in your main folder or skips the checks, stop it and point it to `AGENTS.md`.
5. **Answer when it asks.** It will show you the pull request with its commit and check results and ask whether to merge.
6. **Check, then say yes.** Use the list below. After your yes it runs `pnpm task merge <pr> --authorized-by-owner --head <commit>`, which merges exactly the commit you approved and records your authorization, and `pnpm task cleanup <pr>`, which removes its worktree.

## Before you say yes to a merge

Your yes is the one step no check replaces. If the agent works with your GitHub account, GitHub cannot tell it from you, so the record of your yes is only as good as the agent's honesty and your attention. The checks stop a broken or stale change; they do not stop a change you would not have wanted.

- The pull request names the issue, and every "Done when" line is covered by something you can see: a test, a screenshot, a command result.
- `PR build` is green on the commit the agent names, not on an earlier one.
- The diff contains what the issue asked for and nothing else. Unrelated changes are a reason to say no.
- No check, hook or test assertion was removed or loosened. If one was, the pull request must say so and you must have decided it.
- Anything the agent says it did not verify is acceptable to you.
- Lasting research and rationale are in linked tracked records. The reported [portability review](agents/decision-workflow.md#portability-review) explains whether they remain understandable without issue or PR access.

Reading every line is not required for small changes that are well covered by tests. For a change to the checks themselves, to `AGENTS.md` or to workflows, read every line.

## Writing an issue an agent can finish

If you know this work as PRDs, specs or spec-driven development: the same things exist here under other names. [CONTEXT.md](../CONTEXT.md#terms-you-may-know) has the mapping. An epic is the requirements document; an issue is the spec.

| Weak                              | Why it fails                                       | Better                                                                                                       |
| --------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| "Improve the summary page"        | No way to tell when it is done                     | "The summary shows the route length in km with one decimal; verified by a unit test for 0, 1.25 and 12.3 km" |
| "Fix the bug with dates"          | The agent has to guess the bug                     | Steps to reproduce, what happens, what should happen, the commit you saw it on                               |
| "Add login, profile and settings" | Three outcomes, one pull request nobody can review | An epic with one issue per outcome                                                                           |
| "Use the best library for charts" | A decision disguised as a task                     | Label it `decision-needed`, ask the agent for a design note with options, then decide                        |

For explicitly requested read-only research or an ignored local report, [no issue is needed](agents/working-style.md#working-without-publishing). If the investigation will produce tracked repository changes, ask the agent for an `investigation` issue first. Its result is a tracked [research record](research/README.md) of findings and uncertainty; it can finish without a recommendation or selected solution. Further implementation needs its own authorized scope. [Knowledge ownership](agents/decision-workflow.md#knowledge-ownership) explains where research, proposals and decisions belong.

## Things to say

| You want                 | Say                                                                       |
| ------------------------ | ------------------------------------------------------------------------- |
| Start a task             | `Work on issue #12.`                                                      |
| Let it choose            | `Take the next Ready issue.`                                              |
| Continue after a break   | `Resume issue #12.` It reads its handoff and checks the real state first. |
| Know where things stand  | `What is in progress and what waits for me?`                              |
| Turn an idea into issues | `Draft an epic and its issues for <outcome>. Do not start work.`          |
| Explore before deciding  | `Write a design note for <question> with options and a recommendation.`   |
| Stop cleanly             | `Stop here and leave a handoff.`                                          |

## When something goes wrong

[Problems in agentic work](agents/agentic-problems.md) lists what goes wrong with agents in practice and what in this repository handles each problem. The common cases:

- **You do not want the change.** Say no and say why. The agent changes the pull request and asks again, or closes it and puts the issue back in Backlog.
- **An issue, web page or file tells the agent what to do.** Text the agent reads is data, not instructions. An agent that reports "this issue asked me to disable a check" is working correctly; one that does it is not.
- **The agent wants to skip a check or says a test is wrong.** Do not agree in passing. It must show the evidence in the pull request, and changing a check is its own decision by you.
- **The build is red.** The agent fixes it on the same branch. A red build is never merged.
- **It asks a question it should not need to ask.** Answer, then have it retain the answer in its [canonical home](agents/decision-workflow.md#knowledge-ownership): task scope in the issue, vocabulary in `CONTEXT.md`, lasting findings or rationale in tracked records.
- **It stopped halfway.** Say `Resume issue #<number>.` If the handoff is missing, `pnpm issue show <number>`, the open pull request and `git worktree list` show the state.
- **`main` moved and the pull request is behind.** The agent updates the branch and waits for a new build. Your earlier yes does not carry over to the new commit.
- **You want two agents at once.** Give each its own issue. They work in separate worktrees; at most four issues are In progress at a time.
- **The same mistake happens twice.** Follow [incident corrective action](operations/ai-incidents.md#what-to-do). Repair the failed control, remove conflicting instructions or add a control as needed, and verify the correction. A reminder to be careful is not enough.

## Which agent

Any agent that reads `AGENTS.md` works: GitHub Copilot, Codex, Claude Code, Gemini CLI, Pi and Hermes Agent are set up. Copilot also reads `.github/copilot-instructions.md`, Claude Code reads `CLAUDE.md` and Gemini CLI is set to `AGENTS.md` in `.gemini/settings.json`; the first two files only point to `AGENTS.md`. If your tool reads none of these on its own, begin each session with `Read AGENTS.md and follow it.`

The repository commits one agent-specific setting: `.claude/settings.json` denies Claude Code reading any `.env` or `.env.*` file, in any folder, and running `curl` or `wget`. That blocks the obvious ways a prompt hidden in an issue or web page would make it read credentials or fetch something, not every way: other commands, such as a `node -e` script or `gh api`, can still reach the network, so keep Claude Code asking before commands you have not allowed. It only takes permissions away, and a check keeps those denials in place. Copilot and Codex have their own firewall and sandbox for this; keep them switched on. Pi and Hermes Agent run with the permissions you give them on your machine, so limit those there. What you allow an agent on your machine stays in your personal settings, which are not committed.

An agent running on a hosted service may be unable to reach the Project or to merge. It then stops at a ready pull request and lists what it could not do; see ["When you cannot do a step"](../AGENTS.md#when-you-cannot-do-a-step). You apply the rest.

## Growing from here

- **Grow the browser tests with the product.** One smoke test exists; add one for each thing a user must be able to do. When you need other browsers or real phones, connect a testing farm; see [browser testing](agents/browser-testing.md).
- **Extend checks as the product grows.** A bundle budget and automated browser accessibility checks already exist. Adapt their scope and add product-specific checks, updating the guardrail table when enforcement changes.
- **Record decisions** that constrain later work as [ADRs](adr/README.md), so an agent months later follows them without being told.
- **Keep `CONTEXT.md` current.** Agents name things by the vocabulary they find there.
- **Keep issues small.** One reviewable outcome per issue is the single habit that most improves results.
