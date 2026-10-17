# Browser testing

Unit tests check modules. Browser tests check that the built application works in a real browser. They are written with Playwright, live in `e2e/`, and the same tests run everywhere below.

| Where                  | Runs                                                                       | Browsers and devices                                                         | Application under test                              |
| ---------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------- |
| Your machine           | `pnpm test:browser` before you ask for review, or `pnpm test:devices`      | Chromium on the machine's GPU; Firefox, WebKit and phone emulation on demand | The production build in `dist/`, served for the run |
| Pull request, optional | The browser test steps of `PR build`, when `BROWSER_TESTS_IN_CI` is `true` | Chromium on the CI machine, in software                                      | The production build, at the root and under a path  |
| Release, required      | The verification steps of `Release`, independent of the PR switch          | Chromium on the CI machine, in software                                      | The tagged build, at the root and under a path      |
| Testing farm, optional | `pnpm test:devices --endpoints`, or the farm workflow                      | Many browsers, operating systems and real phones, from one secret            | A deployed URL or a preview                         |

Browser tests run on the developer's machine by default, and the pull request reports the run: commit, command, browser, renderer and result. Neither the push gate nor, by default, the `PR build` runs them, so local evidence is reviewed. The optional PR browser steps and required [release verification](../operations/releases.md) enforce their own browser runs.

Two switches change that:

- **`BROWSER_TESTS_IN_CI`**, a repository variable (Settings, Secrets and variables, Actions, Variables), `false` by default; `pnpm setup:github` creates it. Set to `true`, every `PR build` runs the browser tests at the root and under a path, and keeps the traces of a failure for seven days as the artifact `browser-test-results-<commit>-…`. To run them once, start the `PR build` by hand with "Run the browser tests" checked: `gh workflow run "PR build" --ref <branch> -f browser-tests=true`. The ordinary hosted CI run makes no hardware claim: it checks function, never device speed, and costs CI minutes ([CI minutes](../operations/ci-minutes.md)).
- **`BROWSER_GPU`**, an environment variable for local runs, `required` by default. See [On the GPU](#on-the-gpu).

## As the suite grows

Run the whole existing smoke suite while it is small. Before introducing selection, measure executed test counts and elapsed time for representative changes, including shared code; discovery counts and discovery time are not execution evidence.

For a larger application, keep pull-request browser coverage focused on affected journeys plus a small relevant smoke layer. Select from the complete merge-base-to-head diff and affected behavior, including shared code, dependencies, fixtures and harness changes. Explain the selected commands and their coverage in the pull request. Unknown changes need an explicit selection; deleted or renamed specs need surviving or replacement coverage from the current inventory. A shared change may affect many journeys without requiring every browser, device and viewport combination.

A focused pull request needs no previous full-matrix baseline. The complete declared supported browser, device and scenario matrix belongs at the explicit [release boundary](../operations/releases.md), against the exact release candidate; a large application's sequence can take hours. Before reducing pull-request acceptance, enforce that complete release verification. The starter enforces the cheap gate on every pull request; browser CI is optional. Its release CLI checks the merged pull request's green build, which does not prove complete browser acceptance. Confirm that the tag-triggered workflow actually executes the complete inventory before publication: a workflow that only builds and publishes does not meet this contract. This guidance alone enables neither selection nor a release gate. Keep the cheap pull-request gate and affected accessibility checks at the root and under a sub-path.

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

`pnpm install --frozen-lockfile` does not download browsers. The tests run against the production build, so build first; a stale `dist/` tests old code. A failure leaves a trace under `test-results/`; open it with `pnpm exec playwright show-trace <trace.zip>`. Ordinary task cleanup retains worktrees containing `test-results/` or `playwright-report/`. Follow the [evidence copy step](task-lifecycle.md#preserve-browser-diagnostics) before explicitly discarding them. A later browser run can overwrite these directories; cleanup protection does not preserve earlier attempts automatically.

The local server uses a port derived from the worktree's directory, so two worktrees can test at the same time; set `BROWSER_TEST_PORT` to choose one. A busy port fails the run instead of testing whatever answers there.

### On the GPU

Run `pnpm browser:doctor` before concluding that hardware is unavailable. The [GPU discovery guide](browser-gpu-discovery.md) explains platform paths, API selection, evidence and failure recovery. `pnpm test:browser` uses the same discovery before loading Playwright's configuration, then runs Chromium with that verified profile. `mobile-chrome` shares it; other engines need their own hardware acceptance. A scratch probe proves API access, not the application's selected renderer or painted frame.

`BROWSER_GPU=required` is the local default. CI and remote connections default to `off`, but an explicit `required` is never silently disabled. Remote hardware verification is currently unavailable: run discovery on the rendering host and use that host's acceptance procedure. `BROWSER_GPU=off` runs functional checks without a hardware claim; it does not itself force a software adapter.

#### What an agent never does

- Never open visible browser windows on the user's desktop session. A virtual display or headless only, one page at a time. Several heavy 3D pages on a live desktop can freeze the machine.
- Never start a GPU run beside another heavy job: check the load and the lock first, and wait instead of competing for the GPU.
- Never turn the renderer check off, or switch to `BROWSER_GPU=off`, to get a run through without saying so in the pull request.
- Never report timings from a software renderer as a statement about devices.
- Stop only what the run started: its own browser and virtual display, never another session's.

The browser tests include an accessibility check: axe (`@axe-core/playwright`) runs the WCAG 2.2 A and AA rules on the page and fails on any violation. Add the same check to every new page or state a test opens. axe finds about half of all accessibility issues; keyboard use, focus order and whether text makes sense still need a person.

### All three engines, on every system you can reach

Browsers come from three engines: Chromium (Chrome and Edge), Gecko (Firefox) and WebKit (Safari). Each has its own bugs, and each draws through the operating system's graphics drivers. Until a project adopts focused pull-request testing behind enforced complete release verification, a change to what users see is tested on all three engines and every operating system the developer can reach: Linux, native Windows and macOS, with WSL recorded separately. After adoption, pull requests run affected journeys and relevant engine/system smoke checks; the full declared supported inventory runs before release instead. Engine-specific changes still need the affected engine. The pull request lists each run with its engine, system and result, the renderer of each GPU run, and names what was not reachable and why, for example "macOS: no machine". A testing farm closes gaps for systems and phones nobody has.

`playwright.config.ts` has five projects. `pnpm test:browser` defaults to `chromium`. `mobile-chrome` shares its verified launch profile. Other engines use Playwright's browsers and their renderer remains unverified; those runs check function:

```sh
pnpm exec playwright install --with-deps firefox webkit
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

Every local run records itself in `.local/browser-evidence.json` (ignored by Git): the commit, whether the working tree had uncommitted changes when it started, the application tested (the local build, or the deployment `BROWSER_TEST_BASE_URL` names, which need not be the commit), the renderer the GPU check printed and how it reached the GPU (headless or a virtual display; the check probes Chromium, so other browsers' renderers stay unknown), the platform, and the passed, failed, skipped and flaky tests per project. The newest 20 runs are kept. `pnpm task ready` posts the newest run on the pull request's head commit as a comment, once per commit. It warns, without stopping, when no run is recorded, when the newest run is for another commit, or when the run on the head started with uncommitted changes; then run again, or say in the pull request why no run is needed. The record replaces copying the renderer line and counts by hand; the command, the engines not run and any manual checks still go into the pull request text.

`pnpm test:devices` runs the tests on several projects and farm devices in turn and prints a summary; `--report <pr>` posts it on the pull request, replacing its previous report. This coverage costs no CI minutes. It builds the checked-out commit first, and it reports only when the pull request is open at that commit and the working tree is clean, both before the run and again before posting, so the report describes the pull request. A `BROWSER_TEST_BASE_URL` or `REMOTE_BROWSER_WS_ENDPOINT` set in your shell is used and named in the report.

```sh
pnpm test:devices --report 12                                       # all five projects
pnpm test:devices --project firefox --project webkit --report 12
pnpm test:devices --endpoints ~/farm-endpoints.txt --report 12      # farm devices; see below
```

With the Playwright container above, every project runs without installing browsers: write the container's endpoint once per project into an endpoints file, as for a farm.

### Real phones and tablets

The quickest check needs no setup: serve the build on your network and open it on the device.

```sh
pnpm build && pnpm preview --host   # prints a network address; open it on a phone in the same Wi-Fi
```

To see what the device does:

- **Android:** turn on USB debugging, connect the phone and open `chrome://inspect` in Chrome on the computer; the phone's tabs open in the developer tools. Playwright's experimental Android API can automate Chrome on a connected phone through `adb`; these tests do not use it.
- **iPhone and iPad:** turn on Web Inspector in the device's Safari settings, connect it to a Mac and use Safari's Develop menu. Nothing automates Safari on a real iPhone through Playwright.
- **From WSL:** a USB device reaches WSL only through `usbipd-win`; the network address above is simpler.

Record a check done by hand in the pull request: device, browser version, the commit or URL, what you did and what you saw.

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

A testing farm is the easy way to broad coverage: browsers, operating systems and real phones you do not own, tested with the same tests from one secret. It is optional and started by hand, since farm minutes cost money. No provider is built in.

### Providers

Each of these serves Playwright; how it connects decides the effort:

| Provider                                                                        | Desktop browsers                                                        | Real phones                                                              |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [BrowserStack](https://www.browserstack.com/docs/automate/playwright)           | Through an endpoint: Chrome, Edge, Firefox, WebKit on Windows and macOS | Android and iOS through its own SDK, not a plain endpoint                |
| [TestingBot](https://testingbot.com/support/web-automate/playwright)            | Through an endpoint                                                     | Android through Playwright's Android API, which these tests do not use   |
| [LambdaTest](https://www.lambdatest.com/support/docs/playwright-testing/)       | Through an endpoint                                                     | Android through the same endpoint, with the capability for a real device |
| [Sauce Labs](https://docs.saucelabs.com/web-apps/automated-testing/playwright/) | Through its own runner, `saucectl`, not an endpoint                     | Not for Playwright                                                       |
| Azure Playwright Workspaces                                                     | Linux and Windows browsers, through the `@azure/playwright` package     | None                                                                     |

Offers change: check the provider's documentation for the devices it serves through Playwright and the Playwright versions it supports. The farm's Playwright must match `@playwright/test` in `package.json`, or lie in the range the provider supports. A provider that needs its own SDK, runner or the Android API needs its own connection code; record that choice as an ADR.

### Connect one

1. Run `pnpm setup:github`. It creates the environment `browser-farm`, which only `main` may use, so code from a pull request never receives the farm's credentials.
2. Write one line per device into a file outside the repository, such as `~/farm-endpoints.txt`: a name, the project that matches the device's browser, and the provider's Playwright endpoint with its credentials and capabilities.

   ```text
   windows-edge   chromium       wss://<provider endpoint with credentials and capabilities>
   macos-webkit   webkit         wss://...
   android-pixel  mobile-chrome  wss://...
   ```

3. For the workflow, store it as the environment's secret:

   ```sh
   gh secret set BROWSER_FARM_ENDPOINTS --env browser-farm < farm-endpoints.txt
   ```

4. Run the devices from your machine with `pnpm test:devices --endpoints <file> --report <pr>`, which costs no CI minutes. To run them in CI instead, start the workflow "Browser tests on a testing farm" with the URL to test: production or a pull request's preview. It runs `main`'s tests on every device in turn, lists each result in the run's summary and keeps the traces of failures per device.

Locally, the same tests reach one farm device with `REMOTE_BROWSER_WS_ENDPOINT` and `BROWSER_TEST_BASE_URL` exported from a `.env` file that is not committed. With only the endpoint set, the local build is served and the remote browser reaches it through the Playwright connection (`exposeNetwork`). Not every provider supports that, so give a farm a URL it can reach unless its documentation says otherwise.

Most farms show video and logs on their side; the trace is the provider-independent evidence.

### What a farm's browsers draw with

What a farm's machines draw with depends on the provider, the plan and the machine, and changes as providers replace their machines: some desktop browsers run in virtual machines without a GPU and draw in software, others on a virtual or a real GPU, and real phones on their own. Do not assume it from the provider's description, from another provider or from an earlier run. Before reading any timing from a farm, read the renderer on each device in that run (the WebGL renderer string, as the local GPU check prints it) and record it with the result; a software or virtual renderer makes the run evidence for function only. Real phones are driven through WebDriver (Appium) on most providers, not through the Playwright tests in `e2e/`, so a check on them is a script of its own or a check by hand: record the device, its operating system, the browser and the renderer.

## Rules

- **When a browser test is required.** A change to what the user sees or does needs a browser test, or an update to one, in the same pull request. Logic that can be tested without a browser stays in unit tests: they are faster and fail more precisely.
- **Evidence.** Report every local run in the pull request: the commit, the command, the browser and the renderer it printed, and the result. `pnpm task ready` posts the recorded run for the head commit; see "Report the results on the pull request". For a failure, attach or link its trace. A screenshot is an illustration; the trace is the evidence.
- **A failing browser test** is handled like any failing check: fix the cause. On a slower machine than the developer's, such as a CI runner, measure where the time goes before touching a bound; a bound that only holds on one machine is set for that machine and says so. Retries are off everywhere. Do not add retries, raise a timeout or mark a test as skipped to get a pull request through; a flaky test gets a `bug` issue.
- **Credentials.** Farm credentials live in the `browser-farm` environment's secret and in uncommitted `.env` files. An agent does not read, print or pass them on, and does not start a farm run unless the issue or the owner asks for it: it spends money.
- **Selectors.** Find elements by role and visible text, as a user would; avoid selectors tied to markup or styling.
