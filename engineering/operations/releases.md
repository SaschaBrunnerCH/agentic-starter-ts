# Releases

A release is a version tag on a commit of `main`, with a GitHub release that holds the built application, its SBOM, checksums and notes. Deploys do not wait for releases: every merge deploys, and a release marks a version worth naming. A repository that publishes a package uses the same tags and adds its publish step to the release workflow.

## Making a release

From the primary checkout, on `main` and up to date:

```sh
pnpm release 0.2.0
```

The command fetches `origin` and checks that:

- the version is a semantic version above the latest `v*` tag;
- the working tree is clean;
- the checked-out commit is the head of `origin/main`;
- the pull request whose squash merge made that commit had a green `PR build`.

It then prints the version and commit to show the owner. Only after the owner's explicit yes to that version:

```sh
pnpm release 0.2.0 --authorized-by-owner
```

This creates the annotated tag `v0.2.0` and pushes it. A pushed release tag cannot be moved or deleted, so a mistaken release is followed by a new version, never a rewritten one.

## What the workflow builds

`.github/workflows/release.yml` runs on the tag, including a tag pushed directly. It refuses a tag that is not a version or not on `main`, installs its own dependencies and runs the gate at the tagged commit, then installs Chromium. The gate builds `dist/` once. The workflow tests that output and packages the same directory without rebuilding.

The complete required release inventory is the gate plus every test in the existing Chromium smoke suite, including axe accessibility checks, at both the root and `/app/`. Both browser runs must execute a nonempty suite with every test passing once. Empty, skipped, unrun, failed or retried tests prevent publication. The release reporter enforces this in the actual run; a green PR build or an earlier browser report cannot replace it. Release verification is separate from local PR browser acceptance.

The Linux runner draws in software: this verifies function, not physical GPU acceleration or native-device performance. Firefox, WebKit, phone emulation, physical GPUs and testing farms remain additional coverage unless a derived application explicitly adopts them as release requirements. Expand this declared inventory when the product supports more configurations.

Only successful verification permits packaging and publishing these assets:

| Asset                 | Content                                                                   |
| --------------------- | ------------------------------------------------------------------------- |
| `site-<tag>.tar.gz`   | The built application, as deployed                                        |
| `sbom-<tag>.cdx.json` | The production dependencies of the build, from the lockfile, in CycloneDX |
| `SHA256SUMS`          | SHA-256 checksums of both                                                 |
| Notes                 | Generated from the merged pull requests, in sections by label             |

A tag with a pre-release part, such as `v1.0.0-rc.1`, is published as a pre-release. In a public repository the workflow also records build provenance for the archive, which `gh attestation verify` checks. GitHub offers that for private repositories only with Enterprise Cloud, so the step is skipped there.

## When verification fails

Publication stops, and the workflow retains available browser failure traces for seven days. Keep the immutable tag. Diagnose the failure before rerunning: an environment failure can be rerun at the same tag after its cause is resolved; a source or workflow correction goes through a PR, then a newly authorized version. Never move or delete the failed tag. A failed or partial run is not a verified release, and normal merges still deploy without creating releases.

## Release notes

GitHub generates the notes from the pull requests merged since the previous release, sorted into sections by the labels in `.github/release.yml`: Changes (`enhancement`), Fixes (`bug`), Documentation (`documentation`), Dependencies (`dependencies`) and Other. `pnpm task ready` copies those labels from the issue a pull request closes; Dependabot labels its own. The releases page is the changelog; there is no `CHANGELOG.md` to keep in step.

## Protection

- The `Release tags` ruleset, `.github/rulesets/release-tags.json`, forbids updating, force-pushing and deleting `v*` tags, with no bypass.
- Immutable releases, switched on by `pnpm setup:github`, keep a published release's assets and tag unchanged.
- Only accounts with write access can push a tag; the command's checks and the owner's authorization are the rest of the control.
