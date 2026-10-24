# agentic-starter-ts

A repository template for agent-driven TypeScript development, including graphics applications. The replaceable example draws a blueprint world with native WebGL2 and WebGPU. A repository created from it is independent of the template and starts with defined workflows and working gates, whichever agent does the work: GitHub Copilot, Codex, Claude Code, Gemini CLI, Pi, Hermes Agent or another that reads `AGENTS.md`.

## Six highlights

- **Start with a small app.** React, TypeScript and Vite, with an editable greeting, native WebGL2/WebGPU globe and flat-map examples, and unit/browser tests; [adapt it to your project](#start-a-new-repository).
- **Keep agents on track.** One [instruction source](AGENTS.md), checkable issues, isolated worktrees and resumable handoffs.
- **Catch mistakes early.** The same [verification gate](engineering/agents/local-verification.md) runs locally before pushing and in the PR build.
- **Test real hardware.** [Playwright browser tests](engineering/agents/browser-testing.md), GPU discovery and optional desktop, phone, tablet and farm coverage, with evidence that distinguishes actual hardware from emulation.
- **Stay in control.** A current branch, green PR build and your authorization for the exact commit before [merging](engineering/agents/task-lifecycle.md#validate-and-complete).
- **Ship repeatably.** [PR previews and deployment](engineering/operations/deployment.md), tested releases, immutable tags and rollback by commit.

New to working with agents? Complete setup below, then follow [your first session](engineering/getting-started.md). The [engineering index](engineering/README.md) gives the reading order and specialist guides.

<picture>
  <source media="(max-width: 600px)" srcset="engineering/diagrams/template-highlights-narrow.svg">
  <img src="engineering/diagrams/template-highlights.svg" alt="Six starter highlights: small app, agent workflow, early verification, real hardware, owner control and repeatable delivery. The bullets above provide the text equivalent.">
</picture>

## How the agent workflow fits together

You define the outcome and authorize the merge. The agent takes one checkable issue through implementation, verification and a pull request, using the same workflow whichever coding agent you choose.

Robot icons mark work an agent can carry out or receive by delegation. Person icons mark owner decisions or hands-on review. You can delegate issue drafting and Project updates while deciding the scope, Priority and authorization to merge.

<picture>
  <source media="(max-width: 600px)" srcset="engineering/diagrams/agent-workflow-narrow.svg">
  <img src="engineering/diagrams/agent-workflow.svg" alt="Context feeds an isolated coding agent, with optional review. Robot icons mark agent work; person icons mark owner decisions or hands-on review. Checks send failures back for fixes. A PR preview lets reviewers try the app when configured. Human gates authorize the exact commit before merge and cleanup. The bullets below provide the text equivalent.">
</picture>

- **Context in.** The [issue](engineering/agents/issue-tracker.md) supplies the goal, priority and “Done when” criteria. [AGENTS.md](AGENTS.md) supplies the rules; [CONTEXT.md](CONTEXT.md) supplies shared terms. The agent reads guides, designs, research and ADRs as the task needs them, and preserves lasting findings and rationale in tracked records. The repository's [review and issue skills](engineering/agents/ai-tools.md#skills) start only when a person names them. A [handoff](engineering/agents/task-lifecycle.md#handoff-with-unfinished-work) records state, evidence and the next action for unfinished work.
- **Agent work.** `pnpm task start <issue>` claims the issue and creates an isolated branch and worktree. The agent plans, implements, tests and updates documentation. An optional, owner-requested [independent review](engineering/agents/review.md) reads the rules, issue and diff in a fresh context, reports findings and leaves fixes to the author.
- **Guardrails out.** Commit hooks check formatting, staged lint and secrets. `pnpm check:push` checks types, lint, unit tests and coverage, links, licences, secrets, workflows, the production build and its size budget; the PR build repeats the code/build gate. When [PR previews are configured](engineering/operations/deployment.md#pull-request-previews), a successful build publishes an app preview linked from the PR: open it and try the change. Local Chrome/GPU acceptance with axe is reported on the PR separately. Failed checks return to the agent for fixes; `pnpm task ready <pr>` checks the head, base and PR build. See [the full gate and its evidence](engineering/agents/local-verification.md).
- **Human gates.** You resolve product decisions and review the ready pull request. With a current base and green PR build, you authorize the exact commit. A new commit needs a new yes. An independent review adds evidence for your decision. The agent then merges the approved commit and cleans up its worktree and branch through the [task lifecycle](engineering/agents/task-lifecycle.md#validate-and-complete).

## Prerequisites

- **Node.js 24**, **Git** and **pnpm 12**. The pnpm version is pinned in `packageManager` in `package.json`; install it with `npm install --global pnpm@12.10.1`. Node.js 24 still ships Corepack, so `corepack enable` works too.
- **WSL2, macOS or Linux for development.** Run coding agents, Git, Node.js, pnpm and full verification in that environment. On Windows follow [WSL2 setup](#windows-development-with-wsl2). Native Windows browser/GPU acceptance remains supported as a separate testing workflow.
- **The GitHub CLI**, signed in as an account with administrator rights on the new repository and with the Project scope: `gh auth login`, then `gh auth refresh -s project`.
- **A GitHub plan with rulesets for the repository.** Public repositories have them on every plan; private ones need a paid plan. Without rulesets nothing on GitHub protects `main`, and the merge rule is kept by discipline only.
- **Network access** on the first gate run, which downloads two pinned tools, actionlint and zizmor.

### Supported environments

| Activity                                                                          | Environment                                                                                                                                                            |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coding-agent sessions, development toolchain, builds, tests and full verification | WSL2, macOS or Linux                                                                                                                                                   |
| Native Windows Chrome/Edge and GPU acceptance                                     | Separate Windows checkout and Windows toolchain; see [device coverage](engineering/agents/browser-device-coverage.md#install-and-launch-on-windows-and-wsl-separately) |

`pnpm task start`, `pnpm check:push` and `pnpm check:adoption` reject unsupported Node.js platforms before claiming work or launching checks. Installation and standalone commands remain available for browser testing and diagnostics; their availability does not establish a supported native Windows development workflow. WSL1 is outside the support policy: both WSL generations report `linux` to Node, so the guard does not verify the WSL generation. Confirm WSL2 during setup.

### Windows development with WSL2

1. In PowerShell, inspect `wsl --list --verbose` and use a distribution whose VERSION is `2`. If WSL is missing, follow [Microsoft's installation guide](https://learn.microsoft.com/en-us/windows/wsl/install); installation or conversion is an explicit machine-setup action for the owner.
2. Open that distribution with `wsl --distribution <name>`. Install Linux Git, Node.js 24, the pinned pnpm and the GitHub CLI inside it. Windows executables inherited through PATH are not the Linux toolchain: check `command -v git node pnpm gh`, `git --version`, `node --version`, `pnpm --version` and `node -p "process.platform"` (expected `linux`).
3. Clone into the Linux filesystem, for example `~/projects/<repository>`, then run the setup below from there. Keep sibling task worktrees there too. For Linux tools, Microsoft recommends the [Linux filesystem rather than a mounted Windows drive](https://learn.microsoft.com/en-us/windows/wsl/filesystems); avoid `/mnt/c/...` checkouts for this workflow.
4. Install dependencies in the WSL checkout with `pnpm install --frozen-lockfile`. A separate native Windows browser checkout needs its own Windows installation; each environment owns its `node_modules` and platform-specific browser cache. Re-clone and reinstall when migrating rather than copying dependencies across operating systems.
5. Open the Linux checkout with a Windows editor's WSL integration, such as VS Code's WSL extension and `code .` from the WSL shell. Run terminals and coding-agent processes inside WSL. The editor's visible Windows interface does not determine the toolchain OS.
6. Run `pnpm check:push` in WSL. For Windows-specific Chrome/Edge behavior or performance, follow the explicit native Windows browser-testing path and record the browser OS separately. A WSL browser run establishes WSL rendering evidence.

The platform check never installs WSL, invokes it automatically, moves a checkout or changes host settings. The [platform decision](engineering/adr/0004-use-wsl2-for-windows-development.md) records the support boundary and tradeoffs.

## Start a new repository

The [scripts map](scripts/README.md) explains which tooling supports setup and which remains useful throughout a project.

The order matters: step 6 protects `main`, so everything before it is pushed directly, and everything after it goes through a pull request.

1. **Create the repository.** On GitHub choose **Use this template** and then clone the new repository, or do both with `gh repo create <owner>/<name> --template SaschaBrunnerCH/agentic-starter-ts --private --clone`. Do not copy the files instead: the dependency check compares with `origin/main`, which a repository created from the template has from its first commit.
2. **Install:** `pnpm install --frozen-lockfile`. This also activates the Git hooks.
3. **Run the gate once:** `pnpm check:push`. It passes without edits.
4. **Make it yours.** Set the owner in `.github/CODEOWNERS`: a user account, or for an organisation a team such as `@org/team`, since an organisation name alone is not valid there. Set the name in `package.json`; `pnpm-lock.yaml` does not record it. Set the title and description in `index.html`. For an application without React, remove React first; see [Without React](#without-react). Customize product areas in [.github/labels.json](.github/labels.json); keep the required workflow labels and `area:engineering`. [Triage labels](engineering/agents/triage-labels.md) explains their meaning. Add the product's terms to [CONTEXT.md](CONTEXT.md). Keep this README until you have finished step 9, then replace it with the product's own.
5. **Stage, review, commit and push to `main`:** run `git status --short`, then `git add <intended-paths>` to include the setup changes and any new files, including `src/main.ts` on the non-React route. Inspect `git diff --cached` before `git commit -m "Start <name> from agentic-starter-ts"` and `git push`. This is the only direct push to `main` the repository will see. Automatic deployment waits until hosted setup initializes `PAGES_DEPLOYMENT_ENABLED=true`; the first push does not produce an expected failed Pages deploy.
6. **Set up GitHub:** `pnpm setup:github`. It creates the labels, the Project with its fields and views, squash-only merging, the three rulesets, immutable releases and GitHub Pages, and reports what it changed. A second run reports "No changes." If it reports something as not applied, follow [the hosted settings](engineering/operations/github-hosted-settings.md). After setup succeeds, start the first deployment with `gh workflow run deploy.yml --ref main` and inspect its result with `gh run list --workflow deploy.yml`. Later merges deploy automatically. For a preview of every pull request, also run `pnpm setup:previews`; it creates a second repository for them, see [deployment](engineering/operations/deployment.md#pull-request-previews).
7. **Finish in the GitHub UI.** Two settings are not covered by the script: switching off the Project's automatic Status workflows and sorting the Ready view by Priority. The hosted-settings page says where.
8. **Create the first epic and task.** Every issue needs a parent that leads to an epic, so start with one. Write the epic's requirements with the sections of the [Epic template](.github/ISSUE_TEMPLATE/epic.md), on GitHub's "New issue" page or in a file passed with `--body-file`:

   ```sh
   pnpm issue create --title "Epic: <first outcome>" --label epic --label area:app --body "<goal and constraints>"
   pnpm issue create --title "<first task>" --label enhancement --label area:app --label ready-for-agent \
     --body-file <file> --parent <epic> --status Ready --priority P1
   ```

   GitHub lists a new Project's items only after about half an hour: until then, `pnpm issue ready` and `pnpm issue wip` show nothing, and the limit of four issues In progress is not checked, while `pnpm issue show` already reports each issue's Status. Start the first task by its number.

9. **Start working.** Give an agent the task, for example "work on issue #2", or follow "How to work here" in [AGENTS.md](AGENTS.md) yourself.

### Replace the example

The one-page example keeps the greeting above two matching blueprint canvases. Globe and Flat map control both panels; globe rotation is optional and starts paused for reduced motion. Each panel explains unavailable APIs and links to [WebGL2 Report](https://webglreport.com/?v=2) or [WebGPU Report](https://webgpureport.org). It uses original schematic outlines, no map service, textures, graphics library or added runtime dependency. It is not a cartographic product or performance benchmark.

![The starter greeting and two blueprint globe panels, drawn through WebGL2 and WebGPU.](engineering/diagrams/starter-example.png)

The [capture metadata and procedure](engineering/diagrams/README.md#actual-ui-capture) identify what was actually rendered. The [example design](engineering/designs/blueprint-graphics-example.md) explains its code and evidence limits.

The native APIs are separate: [WebGL2 setup and drawing](src/graphics/webgl-renderer.ts) and [WebGPU setup and drawing](src/graphics/webgpu-renderer.ts). Their shaders live in [GLSL vertex](src/graphics/shaders/world.vert.glsl), [GLSL fragment](src/graphics/shaders/world.frag.glsl) and [WGSL](src/graphics/shaders/world.wgsl) files; the small [renderer contract](src/graphics/renderer.ts) is shared.

Replace `src/App.tsx` and `src/app.css` with your first screen; remove `src/graphics/`, `e2e/graphics.spec.ts` and `e2e/graphics-evidence.ts`, and remove the graphics coverage exclusion in `vite.config.ts`. Update the `src/App*.test.tsx` tests and greeting files and `e2e/smoke.spec.ts` for the product. Replace or remove this example screenshot, its metadata and `engineering/diagrams/capture-starter.mjs` together, including this README's example image and the visual guide's "Actual UI capture" section and its index link. Remove `engineering/designs/blueprint-graphics-example.md` and its index entry, and replace the example product terms in `CONTEXT.md`. Keep the general browser/GPU tooling only where your product needs it. Run the gate and relevant browser tests after replacement.

### Without React

The application uses React. A framework-free application removes it before the first commit using the steps below. The adoption check verifies this application path; adapting the starter to a library with no HTML entry point is a separate change.

1. `pnpm remove react react-dom @vitejs/plugin-react @types/react @types/react-dom`
2. Remove the graphics example as above. Delete `src/App.tsx` and both `src/App*.test.tsx` files, rename `src/main.tsx` to `src/main.ts` and write it without JSX; point `index.html`, `vite.config.ts` (the coverage exclusion) at the new name.
3. Remove `react()` and its import from `vite.config.ts`, `"jsx"` from `tsconfig.app.json`, and `react`, `jsx-a11y` and the `react/*` rules from `.oxlintrc.json`.
4. Rewrite `e2e/smoke.spec.ts` for the new page; it checks the React heading and name field, and runs locally in Chrome on a verified GPU with `pnpm test:browser`; report the results on the PR. The PR build runs the code/build gate without browser journeys.
5. Stage all intended changes, including the new `src/main.ts` and deleted `src/main.tsx`, as in step 5 above. Run `pnpm check:push` and `pnpm test:browser`; `check:unused` names anything left over.

## Working with an agent

The agent reads `AGENTS.md` on its own. [Getting started with agentic work](engineering/getting-started.md) walks through a first session. What remains for you as the owner:

- **Decide.** Issues labelled `decision-needed` wait for your answer; the Decisions view of the Project lists them.
- **Prioritize.** Set Priority on Ready issues. Agents take the highest one.
- **Authorize merges.** The agent shows you a ready pull request with a green build and asks. Your "yes" is for that commit only; a new commit needs a new one. If the agent works with your GitHub account, GitHub cannot tell it from you: read what it shows you before you answer.
- **Handle what only you can.** Issues labelled `ready-for-human`, the GitHub UI settings in step 7, and merges when the agent has no access to your account.
- **Look at Dependabot weekly.** Its pull requests are handled like any other; see [dependency automation](engineering/agents/dependency-automation.md).

### Through GitHub Issues, Projects and pull requests

The [GitHub workflow](engineering/agents/issue-tracker.md) connects the issue, the Project and the pull request. One task moves through **Backlog → Ready → In progress → In review → Done**; **Blocked** records a dependency or decision that stops started work.

The Project's **Board** view groups open issues by Status. The cards below use muted lines as placeholders so the process stays in focus. Closed tasks disappear from this open-only view; the workflow below shows how a task reaches Done.

<picture>
  <source media="(max-width: 900px)" srcset="engineering/diagrams/project-board-narrow.svg">
  <img src="engineering/diagrams/project-board.svg" alt="Schematic Project board with Backlog, Ready, In progress, In review, Blocked and Done columns. Muted lines stand in for card contents. Robot icons identify agent work. Done is empty because this view shows open issues. The narrow layout reflows the columns into rows.">
</picture>

The workflow below shows the steps that move an issue through the board, including the PR preview you can try before authorizing a merge.

<picture>
  <source media="(max-width: 600px)" srcset="engineering/diagrams/github-workflow-narrow.svg">
  <img src="engineering/diagrams/github-workflow.svg" alt="One issue moves across GitHub Project statuses. Robot icons mark agent work, including delegated issue drafting and board updates; person icons mark owner decisions or hands-on review. A green PR build can publish a preview app to try when configured. Approval authorizes the exact merge head. Parallel pause and resume arrows connect implementation with Blocked. The bullets below provide the text equivalent.">
</picture>

- **Issues define the work.** An agent can draft an issue from your goal, including a parent chain to an epic, type and area labels, and checkable “Done when” criteria. You resolve product decisions. Ready work is specified and unblocked; `ready-for-agent` identifies work an agent can take.
- **Projects track execution.** An agent can propose ordering and apply your decisions to Project fields. You decide Priority: P0, then P1, then P2. `pnpm task start <issue>` claims the task, sets In progress and creates its worktree. At most four issues are In progress. A blocked task records what it needs and resumes when that is resolved.
- **Pull requests deliver the change.** The agent opens a PR linking its issue with `Closes #<issue>` and reports checks and browser evidence. Failed checks return to the agent for fixes. After a green PR build, configured previews publish the app and link it in a PR comment: you and the agent can open it and try the change before merge. Enable this once with `pnpm setup:previews`; see [PR preview setup](engineering/operations/deployment.md#pull-request-previews). `pnpm task ready <pr>` verifies readiness and sets In review. Your yes authorizes the exact head; the agent runs `pnpm task merge` to merge it, close the issue and set Done, then `pnpm task cleanup` removes the local worktree and branch. The commands update and read back Project fields; closing an issue alone does not guarantee its Status changes.

## Commands

To build and test on this machine, run `pnpm test:devices --project chromium`.
Use `pnpm test:devices --help` for other engines and phones/tablets, or
`pnpm browser:doctor --help` for local GPU setup. These browser commands use the same
entrypoints on Windows, WSL, Linux and macOS; see [browser testing](engineering/agents/browser-testing.md).

| Command               | Use                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`            | Serve the application locally                                                                                            |
| `pnpm build`          | Build for production into `dist/`                                                                                        |
| `pnpm test`           | Run unit tests with the coverage floor                                                                                   |
| `pnpm test:browser`   | Run browser tests against the production build, on the GPU; see [browser testing](engineering/agents/browser-testing.md) |
| `pnpm test:devices`   | Run them on other browsers and farm devices locally; `--report <pr>` posts the results on the pull request               |
| `pnpm check:push`     | Run the whole gate, as the pre-push hook and the PR build do                                                             |
| `pnpm format`         | Format all files                                                                                                         |
| `pnpm issue help`     | Create, show, claim and update issues in the Project                                                                     |
| `pnpm task help`      | Start a task, check a pull request, merge with recorded authorization, clean up                                          |
| `pnpm setup:github`   | Create or repair labels, Project, merge settings and rulesets                                                            |
| `pnpm release <v>`    | Check a release of the head of `main`; tag it with `--authorized-by-owner`                                               |
| `pnpm setup:previews` | Create the previews repository, its deploy key, environment and variables                                                |

Engineering documentation starts at [engineering/README.md](engineering/README.md).

The template is under the [MIT licence](LICENSE). A repository created from it starts with that file: keep it, or choose another licence for your own code before making the repository public, keeping the template's copyright notice with the parts you keep. AI-assisted contributions are contributed under the repository's licence, as `CONTRIBUTING.md` states.
