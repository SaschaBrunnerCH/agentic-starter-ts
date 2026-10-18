# Deployment

Every merge to `main` deploys the application to GitHub Pages and then tests the deployed site. The workflow is `.github/workflows/deploy.yml`; `pnpm setup:github` enables Pages and limits the `github-pages` environment to `main`.

## What a deploy does

1. **Build.** The workflow checks out the commit, refuses it unless it is a commit of `main`, installs with `pnpm install --frozen-lockfile` and runs `pnpm build`. A squash merge needs a green `PR build` on a branch that is current with `main`, so the merged tree is the tree the PR build tested.
2. **Deploy.** A separate job with only the Pages permissions publishes the build through the `github-pages` environment. It runs no repository code. The environment accepts deploys from `main` only, so a workflow run on any other branch cannot publish.
3. **Test the deployed site.** The browser tests of `e2e/` run against the Pages URL. A failure leaves the new version online and marks the run red, with traces kept for seven days; roll back as below if the site is broken.

Deploys run one at a time and a running deploy is never cancelled. When several merges wait, only the newest waits on: GitHub replaces a waiting deploy with the next one, which deploys a `main` that contains it.

The site is public, even when the repository is private: GitHub Pages has no access control outside GitHub Enterprise. Do not deploy anything that must not be public.

## Pull-request previews

Each pull request from this repository gets a preview at `<previews URL>/pr-<number>/`, linked in a comment on the pull request. The previews live in a separate repository, `<repository>-previews`, whose GitHub Pages site serves its `gh-pages` branch. `pnpm setup:previews` creates that repository, its branch and Pages site, a deploy key with write access to it alone, the environment `previews` that only `main` may use, the key as that environment's secret `PREVIEWS_DEPLOY_KEY`, and the variables `PREVIEWS_REPOSITORY` and `PREVIEWS_URL`. Without them the preview workflow skips without starting a job, so it costs no CI minutes; pull requests that get no preview comment mean `pnpm setup:previews` has not run.

How a preview is published, and why pull-request code never sees the key:

1. The PR build builds the pull request without secrets and keeps `dist/` as the artifact `site` for three days. The gate has passed. Browser checks at the root and under a sub-path run only when `BROWSER_TESTS_IN_CI` is `true` (false by default), or the PR build is started manually with browser tests enabled. A preview can therefore be published without those browser checks; see [browser testing](../agents/browser-testing.md).
2. `.github/workflows/pr-preview.yml` runs on `workflow_run` after a successful PR build. GitHub takes its definition from `main`, never from the pull request. It skips pull requests from forks and builds of a commit the pull request has moved past.
3. Its one job downloads the artifact and copies it into the previews repository with the deploy key. It checks out no code of this repository and runs nothing from the artifact; the files are only copied.
4. The key is a secret of the environment `previews`, not of the repository. A pull request can change workflows, and its workflow runs get the repository's secrets; an environment secret reaches only a job that names the environment and runs from `main`. `setup:previews` removes a repository secret of the same name left by an earlier setup.

Each pull request publishes one preview at a time, and a newer build replaces a waiting one. Previews of different pull requests publish in parallel: each writes only its own directory, so a push that loses the race rebases and tries again.

`.github/workflows/pr-preview-cleanup.yml` removes a preview when its pull request closes, and every week removes the previews of any pull request that is no longer open. When it cannot look up a pull request, it fails instead of removing the preview.

Previews are public like the site itself. On `<owner>.github.io`, the site and the previews share one origin, so a preview can read what the site stores in the browser, such as local storage. Keep credentials out of browser storage, or serve the site from its own domain. The `gh-pages` branch keeps the history of every preview; delete and recreate the previews repository with `setup:previews` when it grows too large.

To rotate the deploy key, delete it in the previews repository's settings and run `pnpm setup:previews` again.

## Rollback

Run the **Deploy** workflow by hand on `main` with the commit or tag to restore as `ref`, short or full:

```sh
gh workflow run deploy.yml --ref main -f ref=<commit-or-tag>
```

The workflow builds that commit again, deploys it and tests it. It refuses a commit that is not on `main`. The build is reproducible from the lockfile, so the old commit builds the old site. A rollback is temporary: the next merge deploys `main` again, so fix or revert the cause through a pull request as described in `engineering/agents/task-lifecycle.md`.

## The application under a sub-path

Pages serves a project site below `/<repository>/`. The build uses relative asset paths (`base: "./"` in `vite.config.ts`), so the same build works there and at the root of a domain. When its browser checks are enabled, the PR build tests the build under `/app/` as well as at the root. [Release verification](releases.md) always runs both checks against the tagged build. An application with client-side routing needs its router's base set from `import.meta.env.BASE_URL` or the deployed path.

## Choosing another target

Pages fits a static application. For another target, keep the structure and replace the deploy job:

- Build once in a job without write permissions; publish in a job that has the target's credentials and runs no repository code.
- Bind the publishing job to an environment that only `main` may use, and keep its credentials in that environment, not in repository secrets.
- Prefer short-lived credentials through OpenID Connect (`id-token: write`) over stored keys, where the target supports it.
- Keep the test after the deploy and the rollback by commit.

Remove the Pages section from `scripts/setup-github.ts` and the deploy workflow when the repository does not deploy at all.

## When Pages is not available

A private repository needs a paid GitHub plan for Pages. `pnpm setup:github` then reports Pages under "Not available here". Disable the workflow until it is available, so `main` does not show a failed deploy after each merge:

```sh
gh workflow disable deploy.yml
```
