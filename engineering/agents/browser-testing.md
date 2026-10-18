# Browser testing

Unit tests check modules. Browser tests check that the built application works in a real browser. They are written with Playwright, live in `e2e/`, and the same tests run everywhere below.

Routine PR browser acceptance runs locally in Chrome on a verified GPU. Report the clean tested commit, command, browser version, actual application renderer and results on the PR using the existing evidence tooling. Broader engine, operating-system or device coverage runs only when the owner explicitly requests it. A software renderer cannot satisfy GPU acceptance.

The PR build runs the code/build gate without browser installation or journeys, including manual workflow runs. Hosted runners do not establish the application's local GPU acceptance; running the journeys there also duplicates that required local work. There is no PR CI browser override. Setup no longer creates `BROWSER_TESTS_IN_CI`; a legacy variable is ignored. Workflow contract controls reject browser commands added to the PR build, even behind that former switch.

`BROWSER_GPU` defaults to `required` locally; see [On the GPU](#on-the-gpu). Explicit [release verification](../operations/releases.md), deployment checks and owner-requested testing-farm runs have separate procedures. Their functional results do not replace local GPU evidence.

## As the suite grows

Run the whole existing smoke suite while it is small. Before introducing selection, measure executed test counts and elapsed time for representative changes, including shared code; discovery counts and discovery time are not execution evidence.

For a larger application, keep pull-request browser coverage focused on affected journeys plus a small relevant smoke layer. Select from the complete merge-base-to-head diff and affected behavior, including shared code, dependencies, fixtures and harness changes. Explain the selected commands and their coverage in the pull request. Unknown changes need an explicit selection; deleted or renamed specs need surviving or replacement coverage from the current inventory. A shared change may affect many journeys without requiring every browser, device and viewport combination.

A focused pull request needs no previous full-matrix baseline. The complete declared supported browser, device and scenario matrix belongs at the explicit [release boundary](../operations/releases.md), against the exact release candidate; a large application's sequence can take hours. Before reducing pull-request acceptance, enforce that complete release verification. The starter enforces the cheap gate on every pull request; PR browser acceptance is local and reported on the PR. Its release CLI checks the merged pull request's green build, which does not prove complete browser acceptance. Confirm that the tag-triggered workflow actually executes the complete inventory before publication: a workflow that only builds and publishes does not meet this contract. This guidance alone enables neither selection nor a release gate. Keep the cheap pull-request gate and affected accessibility checks at the root and under a sub-path.

Keep browser tests maintainable as coverage grows:

- Check layout at every required viewport: containment, non-overlap, focus and reachability. Run complete journeys at justified representative sizes, preserving any interactions that depend on layout. For example, assert that a button stays inside its panel instead of encoding an unexplained pixel offset.
- Keep pure state and conversion permutations in unit tests while retaining representative real-browser rendering and interaction checks. A diagnostic's readiness flag does not prove that the browser painted correctly.
- Introduce narrow, typed application-owned diagnostic hooks only when a test needs them. Exclude those hooks from publishable builds and verify that boundary when introducing them. Keep vendor-specific fault injection scoped; avoid source-text patching and coupling shared behavior tests to library internals.
- Reconcile coverage and selectors when splitting specs by behavior. Preserve assertions, tolerances and time limits; retries stay off, and report failures, skips and unrun checks separately from passes.

## On your machine

Install Chrome, Chromium or Edge for local GPU discovery. The command below downloads
Playwright's bundled Chromium for functional runs; that download alone does not
satisfy discovery's installed-browser prerequisite. Use `pnpm browser:doctor --help`
for setup and diagnostics.

```sh
pnpm test:browser:install   # once: downloads Chromium and its system libraries
pnpm build
pnpm test:browser           # Chromium on the GPU; see below
```

`pnpm install --frozen-lockfile` does not download browsers. The tests run against the production build, so build first; a stale `dist/` tests old code. A failure leaves a trace under `test-results/`; open it with `pnpm browser:cli show-trace <trace.zip>`. Ordinary task cleanup retains worktrees containing `test-results/` or `playwright-report/`. Follow the [evidence copy step](task-lifecycle.md#preserve-browser-diagnostics) before explicitly discarding them. A later browser run can overwrite these directories; cleanup protection does not preserve earlier attempts automatically.

Bundled browsers live in `<git-common-dir>/playwright-browsers/<platform>-<arch>`,
shared by this repository's checkouts and retained when a worktree is removed.
Other repositories and Windows/WSL architectures use separate caches. An explicit
`PLAYWRIGHT_BROWSERS_PATH` wins, including `0` for Playwright's hermetic mode;
CI/container paths remain supported. This setting does not move installed Chrome
or Edge. Normal Playwright garbage collection still applies within a chosen cache.

Use `pnpm test:browser:install` for the default Chromium setup, or
`pnpm browser:cli install firefox webkit` for just those engines. Both use the
same cache initializer; `pnpm browser:cli` also handles other CLI operations. These commands, tests,
device runs and the doctor initialize the cache before Playwright loads; avoid
raw `pnpm exec playwright install/test` commands. System-library installation
(`install-deps`, or the setup command's existing `--with-deps`) is separate from
cache isolation.

`pnpm browser:check` prints the cache and checks Chromium's build directories;
add `firefox webkit` to inspect those engines instead. It downloads/launches
nothing and does not verify system libraries, rendering or hardware. A missing
build can follow a Playwright update or cleanup of a shared cache; rerun setup.
The ordinary push gate still needs no downloaded browsers.

The local server uses a port derived from the worktree's directory, so two worktrees can test at the same time; set `BROWSER_TEST_PORT` to choose one. A busy port fails the run instead of testing whatever answers there.

### On the GPU

Run `pnpm browser:doctor` before concluding that hardware is unavailable. The [GPU discovery guide](browser-gpu-discovery.md) explains platform paths, API selection, evidence and failure recovery. `pnpm test:browser` uses the same discovery before loading Playwright's configuration, then runs Chromium with that verified profile. `mobile-chrome` shares it; other engines need their own hardware acceptance. A scratch probe proves API access, not the application's selected renderer or painted frame.

`BROWSER_GPU=required` is the local default. CI and remote connections default to `off`, but an explicit `required` is never silently disabled. Remote hardware verification is currently unavailable: run discovery on the rendering host and use that host's acceptance procedure. `BROWSER_GPU=off` runs functional checks without a hardware claim; it does not itself force a software adapter.

WebGPU defaults to core. Applications that explicitly support compatibility can use
`pnpm test:browser --api webgpu --webgpu-feature-level compatibility`. The same option
works with `browser:doctor`; its saved profile records the requirement. See
[feature-level discovery and limits](browser-gpu-discovery.md#webgpu-core-and-compatibility).
A compatibility pass never satisfies a core requirement or changes the application's
own adapter requests.

#### What an agent never does

- Never open visible browser windows on the user's desktop session. A virtual display or headless only, one page at a time. Several heavy 3D pages on a live desktop can freeze the machine.
- Never start a GPU run beside another heavy job: check the load and the lock first, and wait instead of competing for the GPU.
- Never turn the renderer check off, or switch to `BROWSER_GPU=off`, to get a run through without saying so in the pull request.
- Never report timings from a software renderer as a statement about devices.
- Stop only what the run started: its own browser and virtual display, never another session's.

The browser tests include an accessibility check: axe (`@axe-core/playwright`) runs the WCAG 2.2 A and AA rules on the page and fails on any violation. Add the same check to every new page or state a test opens. axe finds about half of all accessibility issues; keyboard use, focus order and whether text makes sense still need a person.

### Extra engines and systems on request

Use the [visual browser/device overview](browser-device-coverage.md) and its [text matrix](browser-device-coverage.md#declare-the-supported-matrix) to distinguish engine, distribution, browser OS, viewport, API and evidence. The same guide covers optional tablet orientation/touch checks and real-device access.

Browsers use three engines: Chromium (Chrome and Edge), Gecko (Firefox) and WebKit (Safari). Routine PR acceptance uses local Chrome. Run broader engine/platform/device coverage only when the owner explicitly requests it, and record the scope and results. WSL translated rendering and native Windows rendering are separate evidence. An explicit release follows its declared inventory before publication.

`playwright.config.ts` has five projects. `pnpm test:browser` defaults to `chromium`. `mobile-chrome` shares its verified launch profile. Other engines use Playwright's browsers and their renderer remains unverified; those runs check function:

```sh
pnpm browser:cli install --with-deps firefox webkit
pnpm test:browser --project firefox
pnpm test:browser --project webkit          # the engine of Safari
pnpm test:browser --project mobile-chrome   # a Pixel 7 screen, touch and user agent
pnpm test:browser --project mobile-safari   # an iPhone 15 screen on WebKit
```

The mobile projects emulate a phone's screen, touch and user agent in a desktop engine. They catch layout and touch problems, not a phone browser's own bugs.

| Machine         | What you can test                                                                                                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linux           | All five projects. Where the browsers' system libraries cannot be installed, as on NixOS, use the container below.                                                                                                            |
| Windows and WSL | In WSL, Linux projects may reach hardware through D3D12; verify each required API. This is translated rendering. Use a Windows checkout for native Chrome/Edge acceptance and performance; record Windows and WSL separately. |
| macOS           | All five projects, and Chrome or Edge with a `channel` project. Playwright cannot drive Safari itself: `webkit` is its engine and the closest automated check, and Safari is checked by hand.                                 |

Where the browsers' system libraries cannot be installed, run Playwright's image as a browser server and point the tests at it. The image has all three engines:

```sh
podman run -d --rm --name playwright --network host --init mcr.microsoft.com/playwright:v1.64.0-noble \
  /bin/sh -c "npx -y playwright@1.64.0 run-server --port 9326 --host 127.0.0.1"
REMOTE_BROWSER_WS_ENDPOINT=ws://127.0.0.1:9326/ pnpm test:browser --project webkit
podman stop playwright
```

Use the image whose version matches `@playwright/test` in `package.json`; Docker works the same way. This container recipe makes no GPU pass-through or hardware claim. Remote runs default to functional mode; an explicit hardware requirement fails with a rendering-host verification instruction. Do not change a test or the configuration to make it pass on one machine.

### Report the results on the pull request

Every local run records itself in `.local/browser-evidence.json` (ignored by Git): the commit, whether the working tree had uncommitted changes when it started, the application tested (the local build, or the deployment `BROWSER_TEST_BASE_URL` names, which need not be the commit), the renderer the GPU check printed and how it reached the GPU (headless or a virtual display; the check probes Chromium, so other browsers' renderers stay unknown), the test driver's OS/architecture, and the passed, failed, skipped and flaky tests per project. The existing JSON field `platform` means the **driver platform**. The pull-request comment labels it that way and leaves the rendering OS/device unverified for remote runs. Establish a remote device's OS/version separately from its capabilities or device metadata; a provider's generic OS field can describe its coordinator host instead. The newest 20 runs are kept. `pnpm task ready` posts the newest run on the pull request's head commit as a comment. Repeating the same recorded result adds nothing; a changed run on that commit gets a new comment that supersedes earlier evidence, including newer failures or changed engine coverage. Browser acceptance remains review-only. It warns, without stopping, when no run is recorded, when the newest run is for another commit, or when the run on the head started with uncommitted changes; then run again, or say in the pull request why no run is needed. The record replaces copying the renderer line and counts by hand; the command, the engines not run and any manual checks still go into the pull request text.

`pnpm test:devices` runs the tests on several projects and farm devices in turn and prints a summary; `--report <pr>` posts it on the pull request, replacing its previous report. This coverage costs no CI minutes. It builds the checked-out commit first, and it reports only when the pull request is open at that commit and the working tree is clean, both before the run and again before posting, so the report describes the pull request. A `BROWSER_TEST_BASE_URL` or `REMOTE_BROWSER_WS_ENDPOINT` set in your shell is used and named in the report.

```sh
pnpm test:devices --report 12                                       # all five projects
pnpm test:devices --project firefox --project webkit --report 12
pnpm test:devices --endpoints ~/farm-endpoints.txt --report 12      # farm devices; see below
```

With the Playwright container above, every project runs without installing browsers: write the container's endpoint once per project into an endpoints file, as for a farm.

### Real phones and tablets

Follow [laptop-to-device setup](browser-device-coverage.md#reach-a-real-device-from-a-laptop) for Android USB/Wi-Fi, iPhone/iPad cable/wireless and Windows/WSL networking boundaries. A reachable LAN build checks ordinary UI; secure APIs need trusted HTTPS or a verified secure loopback route. Desktop emulation never establishes physical-device GPU or native-input acceptance.

The guide separates connection, inspection, automation and application acceptance, including platform/tool prerequisites and owned cleanup. Record each real run using its [evidence format](browser-device-coverage.md#record-actual-evidence); keep unavailable devices explicitly unverified.

### Let an agent use the browser

[Playwright MCP](https://github.com/microsoft/playwright-mcp) gives an agent a browser it drives itself: it opens the running application, clicks and types, and reads the page's accessibility tree or a screenshot. That helps a project with real UI: the agent sees a broken layout or a dead button while it works, steps through a failing browser test live, and finds roles and labels before it writes a test. It replaces no test; the tests in `e2e/` stay the evidence.

It is optional and set up per machine, never committed: its tools take context in every session, and a project without much UI gains nothing. Use the exact version below, which [AI tools](ai-tools.md) approves; a newer one goes through the same approval. Each worktree is its own directory, so register it for your user rather than for one directory:

```sh
# Claude Code
claude mcp add --scope user playwright -- npx -y @playwright/mcp@0.0.83 \
  --headless --isolated --allowed-origins "http://localhost:*;http://127.0.0.1:*;https://<owner>.github.io"
```

```toml
# Codex, in ~/.codex/config.toml
[mcp_servers.playwright]
command = "npx"
args = ["-y", "@playwright/mcp@0.0.83", "--headless", "--isolated",
  "--allowed-origins", "http://localhost:*;http://127.0.0.1:*;https://<owner>.github.io"]
```

`--isolated` keeps the browser profile in memory, so agents in several worktrees do not share cookies or block each other's profile. `--allowed-origins` limits it to local servers and the Pages origin of the site and its previews; on first use it may ask to download its browser.

What it does not protect against: Playwright MCP is not a security boundary, and its own documentation says the origin list does not stop redirects. A page the agent opens is untrusted content that can carry instructions, and the browser can reach the network that the `curl` and `wget` denial keeps from the shell. Keep the agent asking before each browser action instead of allowing them all, open only pages of this project, and never sign the browser in to anything.

## Testing farm

A testing farm can supply browsers, operating systems and real devices you do not own. It is optional and started by hand, since sessions consume quota or money. No provider SDK is built in. The existing connector runs these tests only through a compatible Playwright protocol endpoint; a WebDriver/Appium, CDP or provider SDK connection needs separate integration.

### Providers

Use the [farm connection matrix](browser-device-coverage.md#testing-farms) and [dated provider comparison](browser-device-coverage.md#provider-comparison) before selecting a provider or device. Provider-specific iOS and Android automation exists, but the phone-emulation projects do not automatically connect to it. Check versions, catalog availability, actual capabilities, budgets, build identity and cleanup. A provider's feature list does not establish this template's integration or physical-GPU acceptance.

### Connect one

1. Run `pnpm setup:github`. It creates the environment `browser-farm`, which only `main` may use, so code from a pull request never receives the farm's credentials.
2. Write one line per device into a file outside the repository, such as `~/farm-endpoints.txt`: a name, the project that matches the device's browser, and the provider's Playwright endpoint with its credentials and capabilities.

   ```text
   windows-edge   chromium       wss://<provider endpoint with credentials and capabilities>
   macos-webkit   webkit         wss://...
   ```

   These examples name remote desktop browsers. Use a real-device endpoint only when the provider explicitly supports the same Playwright protocol and project semantics; an Appium URL cannot be placed in this file.

3. For the workflow, store it as the environment's secret:

   ```sh
   gh secret set BROWSER_FARM_ENDPOINTS --env browser-farm < farm-endpoints.txt
   ```

4. Run the devices from your machine with `pnpm test:devices --endpoints <file> --report <pr>`, which costs no CI minutes. To run them in CI instead, start the workflow "Browser tests on a testing farm" with the URL to test: production or a pull request's preview. It runs `main`'s tests on every device in turn, lists each result in the run's summary and keeps the traces of failures per device.

Locally, the same tests reach one farm device with `REMOTE_BROWSER_WS_ENDPOINT` and `BROWSER_TEST_BASE_URL` exported from a `.env` file that is not committed. With only the endpoint set, the local build is served and the connector requests loopback exposure through Playwright (`exposeNetwork`). This is not proof that a provider supports forwarding or that the rendering device can reach the build; prefer an identified reachable URL unless that path has been verified.

Most farms show video and logs on their side; the trace is the provider-independent evidence.

### What a farm's browsers draw with

Read the adapter and exercise each required API on the rendering host, then check the application's actual frame. Software/virtual GPU results, remote-device evidence and native-workstation acceptance remain distinct. The [farm guide](browser-device-coverage.md#testing-farms) explains these limits and session/tunnel cleanup. Real-device automation may use WebDriver/Appium or provider-specific Playwright paths; neither is implied by viewport emulation or a passing desktop suite.

## Rules

- **When a browser test is required.** A change to what the user sees or does needs a browser test, or an update to one, in the same pull request. Logic that can be tested without a browser stays in unit tests: they are faster and fail more precisely.
- **Evidence.** Report every local run in the pull request: the commit, the command, the browser and the renderer it printed, and the result. `pnpm task ready` posts the recorded run for the head commit; see "Report the results on the pull request". For a failure, attach or link its trace. A screenshot is an illustration; the trace is the evidence.
- **A failing browser test** is handled like any failing check: fix the cause. On a slower machine than the developer's, such as a CI runner, measure where the time goes before touching a bound; a bound that only holds on one machine is set for that machine and says so. Retries are off everywhere. Do not add retries, raise a timeout or mark a test as skipped to get a pull request through; a flaky test gets a `bug` issue.
- **Credentials.** Farm credentials live in the `browser-farm` environment's secret and in uncommitted `.env` files. An agent does not read, print or pass them on, and does not start a farm run unless the issue or the owner asks for it: it spends money.
- **Selectors.** Find elements by role and visible text, as a user would; avoid selectors tied to markup or styling.
