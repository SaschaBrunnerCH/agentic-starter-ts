# Project setup

The maintained setup and adoption procedure. The root README can describe the product without carrying these instructions.

For an existing application or a selectively adapted starter, use the optional [adoption record and mixed-language patterns](agents/adoption-patterns.md). They describe how to retain project differences and verify the adopted scope; they do not replace the setup or enable excluded capabilities.

## Prerequisites

- **Node.js 24**, **Git** and **pnpm 12**. The pnpm version is pinned in `packageManager` in `package.json`; install it with `npm install --global pnpm@12.10.1`. Node.js 24 still ships Corepack, so `corepack enable` works too.
- **WSL2, macOS or Linux for development.** Run coding agents, Git, Node.js, pnpm and full verification in that environment. On Windows follow [WSL2 setup](#windows-development-with-wsl2). Native Windows browser/GPU acceptance remains supported as a separate testing workflow.
- **The GitHub CLI**, signed in as an account with administrator rights on the new repository and with the Project scope: `gh auth login`, then `gh auth refresh -s project`.
- **A GitHub plan with rulesets for the repository.** Public repositories have them on every plan; private ones need a paid plan. Without rulesets nothing on GitHub protects `main`, and the merge rule is kept by discipline only.
- **Network access** on the first gate run, which downloads two pinned tools, actionlint and zizmor.
- **Local coordination prerequisites** for the workload reservation; see [WSL2, macOS and Linux setup](agents/workload-coordination.md#platforms-and-prerequisites).

### Supported environments

| Activity                                                                          | Environment                                                                          |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Coding-agent sessions, development toolchain, builds, tests and full verification | WSL2, macOS or Linux                                                                 |
| Optional native Windows Chrome/Edge and GPU acceptance                            | Optional platform coverage; see [device coverage](agents/browser-device-coverage.md) |

`pnpm task start`, `pnpm check:push` and `pnpm check:adoption` reject unsupported Node.js platforms before claiming work or launching checks. Installation and standalone commands remain available for browser testing and diagnostics; their availability does not establish a supported native Windows development workflow. WSL1 is outside the support policy: both WSL generations report `linux` to Node, so the guard does not verify the WSL generation. Confirm WSL2 during setup.

### Why WSL2 on Windows?

- **Faster file operations:** Keep your project inside WSL’s Linux filesystem so dependency installs, Git operations and builds avoid slow access across the Windows/Linux filesystem boundary.
- **Seamless VS Code workflow:** Use your familiar Windows editor while terminals, extensions and debugging work directly inside WSL2.
- **Everything you need to contribute:** Run the starter’s complete build, test and verification workflow in one supported environment.
- **Fewer surprises in CI:** Develop with Linux tools locally, reducing platform differences when your changes reach CI.
- **Smoother agent workflows:** Give coding agents a consistent shell and toolchain, reducing the need for Windows-specific command adaptations.

### Windows development with WSL2

1. In PowerShell, inspect `wsl --list --verbose` and use a distribution whose VERSION is `2`. If WSL is missing, follow [Microsoft's installation guide](https://learn.microsoft.com/en-us/windows/wsl/install); installation or conversion is an explicit machine-setup action for the owner.
2. Open that distribution with `wsl --distribution <name>`. Install Linux Git, Node.js 24, the pinned pnpm and the GitHub CLI inside it. Windows executables inherited through PATH are not the Linux toolchain: check `command -v git node pnpm gh`, `git --version`, `node --version`, `pnpm --version` and `node -p "process.platform"` (expected `linux`).
3. Clone into WSL’s Linux filesystem using `~/dev/<host>/<owner>/<repo>` (`<host>` is any Git server hostname, such as `github.com`, `gitlab.com` or an internal host; `<owner>` is the account or repository namespace, including nested groups where needed). Then run the setup below from that checkout. For task work, follow the [task lifecycle](agents/task-lifecycle.md#start-or-resume) and use `pnpm task start <issue>` (creates a task checkout under the sibling `<repo-name>.worktrees/` directory on a dedicated branch). For Linux tools, Microsoft recommends the [Linux filesystem rather than a mounted Windows drive](https://learn.microsoft.com/en-us/windows/wsl/filesystems); avoid `/mnt/c/...` checkouts for this workflow.
4. Install dependencies in the WSL checkout with `pnpm install --frozen-lockfile`. Everyday development only needs this WSL2 checkout.
5. Open the Linux checkout with a Windows editor's WSL integration, such as VS Code's WSL extension and `code .` from the WSL shell. Run terminals and coding-agent processes inside WSL. The editor's visible Windows interface does not determine the toolchain OS.
6. Run `pnpm check:push` in WSL.

Routine development and browser tests run from WSL2. Broader [browser and device coverage](agents/browser-device-coverage.md) is optional and documented separately.

The platform check never installs WSL, invokes it automatically, moves a checkout or changes host settings. The [development environment guide](agents/working-style.md#development-environment) explains the support boundary and tradeoffs.

## Start a new repository

The [scripts map](../scripts/README.md) explains which tooling supports setup and which remains useful throughout a project.

The order matters: step 6 protects `main`, so everything before it is pushed directly, and everything after it goes through a pull request.

1. **Create the repository.** On GitHub choose **Use this template** and then clone the new repository, or do both with `gh repo create <owner>/<name> --template SaschaBrunnerCH/agentic-starter-ts --private --clone`. Do not copy the files instead: the dependency check compares with `origin/main`, which a repository created from the template has from its first commit.
2. **Install:** `pnpm install --frozen-lockfile`. This also activates the Git hooks. Run `pnpm workload status` to inspect the shared workload reservation before the first gate; follow [coordinator adoption](agents/workload-coordination.md#adopting-the-coordinator) if existing workstation state needs reconciling. Keep the per-user state path and any `WORKLOAD_STATE_DIR` override independent of the repository name.
3. **Run the gate once:** `pnpm check:push`. It passes without edits.
4. **Make it yours.** Set the owner in `.github/CODEOWNERS`: a user account, or for an organisation a team such as `@org/team`, since an organisation name alone is not valid there. Set the name in `package.json`; `pnpm-lock.yaml` does not record it. Set the title and description in `index.html`. For an application without React, remove React first; see [Without React](#without-react). Customize product areas in [.github/labels.json](../.github/labels.json); keep the required workflow labels and `area:engineering`. [Triage labels](agents/triage-labels.md) explains their meaning. Add the product's terms to [CONTEXT.md](../CONTEXT.md). After step 9, replace the root README with the product's own; this setup guide remains available independently.
   Run `pnpm check:personalization` after these edits. It reports remaining template identity and metadata before hosted setup writes.

5. **Stage, review, commit and push to `main`:** run `git status --short`, then `git add <intended-paths>` to include the setup changes and any new files, including `src/main.ts` on the non-React route. Inspect `git diff --cached` before `git commit -m "Start <name> from agentic-starter-ts"` and `git push`. This is the only direct push to `main` the repository will see. Automatic deployment waits until hosted setup initializes `PAGES_DEPLOYMENT_ENABLED=true`; the first push does not produce an expected failed Pages deploy.
6. **Set up GitHub:** inspect with `pnpm setup:github --dry-run`, then apply with `pnpm setup:github`. Use `--help` for local usage without contacting GitHub. It creates the labels, the Project with its fields and views, squash-only merging, the three rulesets, immutable releases and GitHub Pages, and reports what it changed. A second run reports "No changes." If it reports something as not applied, follow [the hosted settings](operations/github-hosted-settings.md). After setup succeeds, start the first deployment with `gh workflow run deploy.yml --ref main` and inspect its result with `gh run list --workflow deploy.yml`. Later merges deploy automatically. For a preview of every pull request, inspect `pnpm setup:previews --dry-run`, then run `pnpm setup:previews`; it creates a second repository for them, see [deployment](operations/deployment.md#pull-request-previews).
7. **Finish in the GitHub UI.** Two settings are not covered by the script: switching off the Project's automatic Status workflows and sorting the Ready view by Priority. The hosted-settings page says where.
8. **Create the first epic and task.** Every issue needs a parent that leads to an epic, so start with one. Write the epic's requirements with the sections of the [Epic template](../.github/ISSUE_TEMPLATE/epic.md), on GitHub's "New issue" page or in a file passed with `--body-file`:

   ```sh
   pnpm issue create --title "Epic: <first outcome>" --label epic --label <product-area> --body "<goal and constraints>"
   pnpm issue create --title "<first task>" --label enhancement --label <product-area> --label ready-for-agent \
     --body-file <file> --parent <epic> --status Ready --priority P1
   ```

   Use the product-area label configured in step 4 in place of `<product-area>`. GitHub lists a new Project's items only after about half an hour: until then, `pnpm issue ready` and `pnpm issue wip` show nothing, and the limit of four issues In progress is not checked, while `pnpm issue show` already reports each issue's Status. Start the first task by its number.

9. **Start working.** Give an agent the task, for example "work on issue #2", or follow "How to work here" in [AGENTS.md](../AGENTS.md) yourself.

### Replace the example

Replace `src/App.tsx` and `src/app.css` with your first screen. Remove `src/graphics/`, `e2e/graphics.spec.ts` and `e2e/graphics-evidence.ts`, and the graphics coverage exclusion in `vite.config.ts`. Update the application unit tests, greeting files and browser smoke journey for the product.

Remove the example's `engineering/designs/blueprint-graphics-example.md` and its design-index entry. Remove or replace `engineering/diagrams/starter-example.png`, its JSON metadata and `engineering/diagrams/capture-starter.mjs` together, including the visual guide's "Actual UI capture" section and table link. Replace example product terms in `CONTEXT.md`. The [visual guide](diagrams/README.md) explains how to maintain the product's own screenshots. Keep browser/GPU tooling where the product needs it, and run the gate and relevant browser tests after replacement.

### Without React

The application uses React. A framework-free application removes it before the first commit using the steps below. The adoption check verifies this application path; adapting the starter to a library with no HTML entry point is a separate change.

1. `pnpm remove react react-dom @vitejs/plugin-react @types/react @types/react-dom`
2. Remove the graphics example as above. Delete `src/App.tsx` and both `src/App*.test.tsx` files, rename `src/main.tsx` to `src/main.ts` and write it without JSX; point `index.html`, `vite.config.ts` (the coverage exclusion) at the new name.
3. Remove `react()` and its import from `vite.config.ts`, `"jsx"` from `tsconfig.app.json`, and `react`, `jsx-a11y` and the `react/*` rules from `.oxlintrc.json`.
4. Rewrite `e2e/smoke.spec.ts` for the new page; it checks the React heading and name field, and runs locally in Chrome on a verified GPU with `pnpm test:browser`; report the results on the PR. The PR build runs the code/build gate without browser journeys.
5. Stage all intended changes, including the new `src/main.ts` and deleted `src/main.tsx`, as in step 5 above. Run `pnpm check:push` and `pnpm test:browser`; `check:unused` names anything left over.
