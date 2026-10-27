# Adoption and verification patterns

Use these patterns when a project's requirements justify adapting the starter. They are optional design guidance, not installed capabilities or permission to change a gate. The starter's existing checks, coverage floors, approval requirements and deployment behavior remain in force. Adopt an applicable pattern through the project's normal issue, decision, implementation and verification workflow.

Examples below are illustrative records and procedures, not executed results. Replace placeholders with actual values and verify an implementation before claiming it works. They introduce no dependency, framework, service or recurring audit. Use synthetic data and keep credentials and private inputs out of examples and evidence.

| Pattern                                                       | Useful when                                                         | Usually unnecessary when                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------- |
| [Adoption record](#adoption-record)                           | A derived project imports selected tooling or deliberately diverges | There is no adopted baseline or meaningful difference to track |
| [Offline routine tests](#offline-routine-tests)               | Tests consume external APIs, tiles, fonts or other services         | The tested behavior already uses only local inputs             |
| [Mixed-language adoption](#mixed-language-adoption)           | Another language, native tool or Git subprocess joins the workflow  | The project uses only the starter's existing toolchain         |
| [Expensive verification](#expensive-verification)             | Measurements show repeated acceptance work is costly                | The existing full gate is affordable and reproducible          |
| [Public-build data validation](#public-build-data-validation) | Only an approved subset of available data may be published          | All build inputs are already public and publication-approved   |

## Adoption record

An adoption record explains what was adopted, why the project differs and what was actually verified. It helps a later update avoid replacing deliberate decisions with template defaults. It is not a badge or evidence that every inherited feature is operational.

Start with a known template revision, the project's current revision and an inventory of existing behavior. Keep the record in maintained engineering documentation; a Markdown table is sufficient. A structured record is useful only if something consumes it. For example:

```yaml
template_revision: <full-commit>
project_profile: existing-application-with-data-pipeline
decisions:
  - capability: task-worktrees
    disposition: adopted
    reason: isolate concurrent changes
  - capability: publication
    disposition: adapted
    reason: owner-triggered publication is required
  - capability: pull-request-previews
    disposition: excluded
    reason: not configured
verification:
  tested_revision: <full-project-commit>
  commands: <actual-commands-and-results>
  evidence: <reviewable-result-location>
  limits: <untested-platforms-and-capabilities>
```

For a later selective update:

1. Compare the candidate changes with the last recorded baseline and current project behavior. Histories created from templates may be unrelated; do not assume a merge base exists.
2. Record which changes are adopted, adapted, excluded or deferred and why. Name relevant project decisions, local overrides and any known debt. Do not silently refresh an original adoption pin as though every intervening change was imported.
3. Verify the affected project workflows at the resulting revision. Record failures and unrun checks as such. Update a per-component baseline when only part of the tooling was refreshed.
4. Keep reusable reasons in the maintained guides and accepted consequential decisions in the project's own records under [knowledge ownership](decision-workflow.md#knowledge-ownership). Do not copy another project's acceptance history as this project's evidence.

The cost is maintaining a small record when adoption changes, rather than a second implementation specification. Remove duplicated procedure descriptions; retain enough context to distinguish an intentional difference from a missed update. An excluded preview, platform or release path must not be reported as verified merely because its files exist.

## Offline routine tests

Separate deterministic functional checks from integration with a live provider. Prerequisites are a controlled server or fixture source, representative synthetic responses, and a test inventory that distinguishes routine and live checks. Keep actual rendering and interaction assertions: replacing the network does not justify weakening them.

A browser example procedure:

1. Serve the production build locally. Fulfill the example endpoint `/api/catalog` with a synthetic response such as `{"items":[{"id":"sample","label":"Example"}]}`. Validate the response with the application's normal boundary validation.
2. Create the browser context with service workers blocked where the test runner supports it. Install a shared request guard before navigation: allow the configured site's exact origin, fulfill declared fixtures, and abort and record every other HTTP(S) request. Assert no unexpected requests occurred, including during teardown.
3. Ensure every routine test uses that context fixture. Requests from manually created contexts need the same guard. Page-level route handlers must not silently bypass it; use a contract check, response inspection or another tested mechanism appropriate to the runner.
4. Run an approved local-server control and a fixture-response control; both must pass. As a negative control, request `https://unexpected.example.invalid/` without a fixture. The guard must reject it before networking, and the routine isolation assertion must fail. Catching the application's fetch error must not hide the guard's recorded violation.
5. Check the test inventory without executing provider requests: the routine command must exclude live cases, while a separate explicitly requested live command selects them. Keep the two result types distinct; synthetic success does not establish live-provider compatibility.

For unit tests, substitute an external client with a local fake, or use an applicable runner-level network guard. Prove a permitted local call passes and an unexpected call is refused. Check whether Node HTTP/fetch, DNS, UDP, child processes and native libraries are actually covered before claiming isolation; intercepting one API does not cover the rest. Do not send the negative control to a real provider.

Browser request interception does not control test-process HTTP clients, new unguarded contexts, every service-worker path or native subprocess networking. A page handler can take precedence over a context handler; response inspection sees only completed responses. These are test conventions with measured scope, not a security sandbox or general network firewall. Stronger isolation is a separate design decision.

Fixtures add maintenance and can drift from the provider. Keep a separate, bounded live compatibility check when needed, run it only with the task's required authorization and never infer that authorization from these instructions. Retain the [browser applicability](browser-testing.md#applicability), GPU and [data-handling](data-handling.md) requirements.

## Mixed-language adoption

A mixed toolchain needs explicit prerequisites and filesystem boundaries. Record required runtimes, native libraries and commands in project setup; prefer existing lockfiles and reproducible environment files. Check executable provenance and environment activation in a fresh shell. A passing TypeScript check does not verify Python imports, a native library or a second platform.

Before adding a pipeline, use this concrete checklist:

1. Inventory generated directories and the other language's import/module lookup. A root directory such as `coverage/` or `json/` can collide with a module name. Choose a non-conflicting report location such as an ignored `.artifacts/reports/<tool>/` and update its real producer and consumers together.
2. In a fresh environment, import the required modules and inspect their resolved locations. Exercise the pipeline against a small synthetic input and compare the result with its known outcome. Record runtime/native-library versions and any unavailable acceptance environment.
3. Give Git subprocess fixtures their own temporary repository, explicit working directory and sanitized environment. Hooks export repository-local Git variables; changing `cwd` alone is insufficient. For an independent fixture, excluding inherited `GIT_*` overrides is a simple approach; supply any fixture-specific configuration explicitly rather than copying credentials or caller repository settings.
4. Prove the isolation with two disposable repositories: deliberately point a child at the first using `GIT_DIR`/`GIT_WORK_TREE` and show the unsafe invocation resolves there despite `cwd` naming the second. Then run the sanitized invocation and assert its top-level/index belong to the second and the first is unchanged. Never use the real checkout as the poisoned control. Include inherited config injection variables in the review.
5. Exercise the actual supported OS/toolchain combination before reporting acceptance. Simulated platform guards and environment fixtures check decisions, not native-library installation, hardware availability or physical-device behavior.

Do not indiscriminately strip environment variables from production commands; a pipeline may legitimately require configuration. Keep fixture isolation scoped and document intentional overrides. Additional environments cost setup time and can drift, so add them for real requirements and retain the existing [platform and workload boundaries](workload-coordination.md#platforms-and-prerequisites).

## Expensive verification

First measure executed work: representative command durations, inventories, resource use and the repeated hosted work being considered. Do not infer savings from discovery counts or estimated worker prices. If the current gate is affordable, keep it.

Separating inexpensive hosted checks from expensive local acceptance changes a project's enforcement contract. Before implementing it, obtain the owner's explicit decision, identify every check and failure surface, define who may publish evidence, and decide how readiness and merge will reject missing, stale, failed or untrusted records. Documentation alone does not enable this profile. This starter continues to run its full default gate.

An illustrative evidence record has these fields; a real implementation must validate values, command exit results and trust, not merely accept matching keys:

```yaml
head: <full-tested-head>
base: <full-tested-base>
environment: <runtime-native-tool-browser-and-platform-versions>
inputs: <lockfile-config-fixture-and-generated-input-identities>
commands: <commands-exit-results-test-counts-and-material-gaps>
artifacts: <identities-of-the-built-and-tested-outputs>
logs: <retained-locations-and-sha256-digests>
publisher: <approved-publisher-identity>
finished_at: <actual-UTC-time>
```

The verification command should check a clean checkout and intended head/base before execution, run the declared inventory, then recheck the revisions, working tree and relevant inputs after completion. Failed or interrupted runs are failures, not reusable acceptance. Retain sanitized logs and artifacts where reviewers can access them; an ignored local path alone does not provide remote access. Publish no raw credentials or private inputs.

Default to invalidating evidence when head, base, dependencies, configuration, fixtures, generated inputs, environment or required test inventory changes. If narrow reuse is approved, define it before using it. For example, a workflow-only change may reuse only the expensive application result if all non-workflow input identities and the relevant environment are identical and retained logs still match their digests. All workflow/security/source checks affected by that change run fresh. Bind the new record to its current head/base and identify the originating run; never relabel old evidence as a new execution. Unknown inputs invalidate reuse.

Before relying on the profile, demonstrate a valid record is accepted and controls with a changed base, altered log, failed command, missing test lane, untrusted publisher or mismatched environment are refused. Show direct merge paths and administrator bypasses as explicit limits; a local readiness command is not an enforced hosted status merely because it exists. Changes to required statuses must preserve protection until the approved replacement is operational.

Owner-published local evidence is not independent CI attestation. Hashes identify retained bytes; they do not prove who executed a command or that the stated environment was used. This profile trades repeated hosted work for evidence-tool maintenance and reliance on the publisher and review. The [guardrail record](../../AGENTS.md#guardrails) must describe the real enforcement if a project implements it. None of these examples changes [merge authorization](decision-workflow.md#requesting-merge-authorization), [release verification](../operations/releases.md) or publication approval.

## Public-build data validation

Use this when only a defined subset of available data may enter a public artifact. Prerequisites are a data/publication decision, an inventory of actual build inputs and outputs, and synthetic prohibited examples. Technical reachability, a private source repository and a clean secret scan do not establish redistribution permission; apply [data classification and redaction](data-handling.md) first.

For example, a project permits `public/catalog.json` containing only `id` and `label`, while internal working records also contain `internal_note`. A concrete validation procedure is:

1. Record the permitted output paths and field/value rules, including whether source maps, archives, images and embedded metadata are allowed. Validate the export at the boundary and enumerate the complete deployable output. Reject unlisted data files and unexpected export fields rather than relying on a filename alone.
2. Inspect bundles as well as standalone assets. A forbidden JSON import may become a string or object inside minified JavaScript. Use a format-aware check or known synthetic markers appropriate to the application, with explicit encoding and file-type coverage. Keep this scoped; a generic coordinate or keyword match is not a universal privacy validator.
3. Run a permitted-export control that passes. Then add `internal_note` to the allowed export and require rejection. Also place an unlisted data file in the output and require rejection.
4. For an embedded-data negative control, import a synthetic record with a recognizable marker such as `synthetic-private-record/v1` in a disposable fixture build. Make it observable so tree-shaking cannot remove it. Run the production bundler/minifier and require the artifact check to reject it; repeat with the permitted synthetic export and require success. A source-text test alone does not demonstrate detection after bundling.
5. Validate the exact artifact prepared for publication and retain its identity with the result. A later rebuild or data substitution invalidates that result. Report publication separately from validation and use the existing authorized publication path.

Content scanning may miss binary/WASM data, encrypted or transformed values, metadata, alternate encodings, lazy assets or runtime downloads. Declare which of these are covered, prohibited or unverified. Output inspection does not prove runtime responses are safe, nor does a schema check establish legal permission. Require separate controls where the product needs them rather than reporting complete protection from a partial scan.

Allowlist/schema maintenance costs effort when exports change, and heuristics can produce false positives. Keep export decisions and tests together, justify exceptions through the normal owner decision, and preserve the existing secret scan. This example installs no build scanner and grants no permission to publish data.
