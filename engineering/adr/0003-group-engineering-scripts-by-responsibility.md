---
status: accepted
---

# 0003 Group engineering scripts by responsibility

## Context

At revision `d00724abc939eec408db38c448393de40862d52a`, `scripts/` held 91 TypeScript files in one flat directory: 55 command/support modules and 36 tests. Setup, task coordination, verification, browser/GPU support, Git hooks and releases were interleaved. Prefixes showed some relationships but made the larger ownership and lifecycle difficult to see when starting a project.

Most scripts are ongoing engineering tools. Even setup commands reconcile or repair hosted settings after initialization. The immediate problem is navigation and ownership. Repeated maintenance across generated projects may eventually justify shared distribution, but this structural change does not establish a stable external API or a package release process.

The existing tools also rely on their locations: repository-root calculations, direct hook and workflow paths, subprocesses, browser preloads and reporters. The browser-cache contract test previously scanned only the flat directory. A folder move must preserve that coverage and the existing verification scope.

## Decision

Group tooling under `scripts/setup/`, `workflow/`, `checks/`, `browser/`, `release/`, `git/` and `shared/`. Keep tests beside the modules they exercise and retain useful filename prefixes within each group. [The scripts map](../../scripts/README.md) owns the current responsibilities, entry points and cross-group relationships; engineering guides continue to own procedures.

Keep one repository package and the existing public `pnpm` command names. Move repository-owned direct entry points with their callers, without wrappers at old flat paths. Adjust module-relative root calculations for the nested layout and preserve commands' intentional working-directory behavior. Keep recursive type/test discovery and the same measured coverage scope and thresholds. Scan nested scripts in the browser-cache contract, with a negative control that proves an unsafe nested caller is detected.

Use folders and review to express ownership. This decision introduces no new dependency-boundary enforcement, package, generator or starter preset. Existing approval, skill invocation, browser/GPU ownership, cache and verification requirements continue to apply.

## Consequences

- Contributors can identify related commands, rules and tests by folder, and distinguish infrequent setup from ongoing tooling.
- Projects retain readable, independently editable tools in their own checkout. They also retain responsibility for adopting relevant fixes from the starter.
- Path changes touch configuration, hooks, workflows and active guidance together. Entry-point tests and browser CLI checks provide evidence that moving a file has not silently dropped a check.
- The folders do not provide independent dependency installation, distribution or versioning. Cross-group imports remain visible and require review.
- Revisit packaging when repeated fixes across generated projects create measurable maintenance cost and the reusable API, project-owned configuration and upgrade policy are understood. A generator would own genuinely initial scaffolding; a versioned development CLI would own reusable ongoing tools. Neither is implemented here.

## Alternatives

- **Keep a flat list with prefixes and an index.** Lowest migration cost, but leaves distinct responsibilities interleaved as tooling grows.
- **Separate commands, libraries and tests into technical layers.** Makes file roles apparent but scatters the files changed together for a task. Responsibility folders with colocated tests keep those relationships near each other.
- **Create private workspace packages now.** Adds manifests and dependency boundaries, but each generated project still maintains its own copies. It does not by itself provide shared upgrades.
- **Publish a shared engineering CLI or project generator now.** Could reduce duplicated maintenance or retain less initial scaffolding, but requires deliberate APIs, configuration ownership, release/versioning and compatibility commitments beyond this reorganization.
