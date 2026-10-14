# Dependency automation

## Dependabot

Dependabot opens grouped pull requests on Mondays for packages (Dependabot's `npm` ecosystem, which covers pnpm) and GitHub Actions; see `.github/dependabot.yml`. Minor and patch updates are grouped, and the Vitest family moves together.

The next working session handles open Dependabot pull requests, within one week of their creation:

1. Bring the pull request up to date with `main` and wait for `PR build`.
2. Green: ask the owner for merge authorization as for any pull request, then merge with `pnpm task merge <pr> --authorized-by-owner --head <sha> --admin`. The flag `--admin` is needed because the owner's account did not author the pull request. Merge them one after another; each merge makes the others stale.
3. Red: fix it on the branch when the cause is small, otherwise close the pull request with the reason and file an issue for the update.

An update must not sit unhandled for more than a week. A Dependabot pull request needs no issue; its title is its specification.

Dependabot proposes a version once it is a week old (`cooldown` in `.github/dependabot.yml`), and it does not raise the major version of `@types/node`: that follows the Node.js version in `.node-version` and `engines`, and all three are raised together by hand.

## Weekly audit

`.github/workflows/dependency-audit.yml` runs every Monday and on demand. It prints the audit of all dependencies as advisory output and fails on a high or critical advisory in the production graph (`pnpm check:audit`). Lower severities stay visible in that output and in Dependabot alerts; they do not turn `main` red.

A failed audit is handled like a bug: file an issue with the advisory, labelled `bug` and `area:engineering`, and resolve it by updating, replacing or removing the dependency. Do not silence an advisory without the owner's decision recorded in that issue.

## Licences

The PR build lists every package version a pull request adds, with its licence (`pnpm check:dependencies`). Every runtime dependency, not only a new one, must carry a licence from `.github/allowed-licenses.json`, which holds permissive licences only, or be named in `.github/allowed-packages.json` with the reason it may ship, such as a commercial SDK the owner holds a licence for. Adding a licence to that list is the owner's decision, recorded in the pull request; a copyleft licence such as GPL or MPL changes what the application's users may do and needs legal review first.

## pnpm and the lockfile

The pnpm version is pinned in `packageManager` in `package.json`; CI installs exactly that version. `pnpm-lock.yaml` is the lockfile; `pnpm install --frozen-lockfile` installs it unchanged and fails when `package.json` and the lockfile disagree.

`pnpm-workspace.yaml` holds two supply-chain settings:

- **`minimumReleaseAge`** (seven days, in minutes): pnpm installs no package version younger than that, whether Dependabot proposed it or someone added it by hand. A version may be listed in `minimumReleaseAgeExclude` only with the owner's decision recorded in the pull request, and the entry is removed once the version is old enough.
- **Install scripts:** pnpm runs no `preinstall`, `install` or `postinstall` script of a dependency unless it is allowed by name under `allowBuilds`. Allow one only when the package does not work without it, and name it in the pull request.

## TypeScript

The starter uses TypeScript 7, the native compiler. It typechecks, and Vite, Vitest, Oxlint and Knip do not need the older JavaScript compiler API. Tools that do, such as typescript-eslint or some documentation generators, may not work with it yet; check before adding one, and decide with the owner whether to wait or to pin TypeScript 5.
