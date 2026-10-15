# Browser testing

Unit tests check modules. Browser tests check that the built application works in a real browser. They are written with Playwright, live in `e2e/`, and the same tests run everywhere below.

| Where                  | Runs                                                                       | Browsers and devices                                                         | Application under test                              |
| ---------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------- |
| Your machine           | `pnpm test:browser` before you ask for review, or `pnpm test:devices`      | Chromium on the machine's GPU; Firefox, WebKit and phone emulation on demand | The production build in `dist/`, served for the run |
| Pull request, optional | The browser test steps of `PR build`, when `BROWSER_TESTS_IN_CI` is `true` | Chromium on the CI machine, in software                                      | The production build, at the root and under a path  |
| Testing farm, optional | `pnpm test:devices --endpoints`, or the farm workflow                      | Many browsers, operating systems and real phones, from one secret            | A deployed URL or a preview                         |

Browser tests run on the developer's machine by default, and the pull request reports the run: commit, command, browser, renderer and result. Neither the push gate nor, by default, the `PR build` runs them, so that evidence is reviewed, not enforced.

Two switches change that:

- **`BROWSER_TESTS_IN_CI`**, a repository variable (Settings, Secrets and variables, Actions, Variables), `false` by default; `pnpm setup:github` creates it. Set to `true`, every `PR build` runs the browser tests at the root and under a path, and keeps the traces of a failure for seven days as the artifact `browser-test-results-<commit>-…`. To run them once, start the `PR build` by hand with "Run the browser tests" checked: `gh workflow run "PR build" --ref <branch> -f browser-tests=true`. CI runners have no GPU: a run there checks function, never speed, and costs CI minutes ([CI minutes](../operations/ci-minutes.md)).
- **`BROWSER_GPU`**, an environment variable for local runs, `required` by default. See [On the GPU](#on-the-gpu).

## On your machine

```sh
pnpm test:browser:install   # once: downloads Chromium and its system libraries
pnpm build
pnpm test:browser           # Chromium on the GPU; see below
```

`pnpm install --frozen-lockfile` does not download browsers. The tests run against the production build, so build first; a stale `dist/` tests old code. A failure leaves a trace under `test-results/`; open it with `pnpm exec playwright show-trace <trace.zip>`. Copy a trace you want to keep out of the worktree: cleanup after the merge removes `test-results/`.

The local server uses a port derived from the worktree's directory, so two worktrees can test at the same time; set `BROWSER_TEST_PORT` to choose one. A busy port fails the run instead of testing whatever answers there.

### On the GPU

Applications that draw with WebGL or WebGPU behave differently on a GPU than in software: a scene that settles in a second on a GPU can take a minute on a CPU, and timings from a software renderer say nothing about real devices. With `BROWSER_GPU=required`, the default, `pnpm test:browser` therefore:

- runs the `chromium` project in the system's Chromium or Chrome, not Playwright's bundled one, because the system browser uses the machine's graphics drivers (`BROWSER_GPU_EXECUTABLE` chooses another);
- draws headless where the platform allows it; on Linux, where headless Chromium finds the GPU but cannot create a WebGL context on it, on a private virtual display (`Xvfb`) that the run starts and stops, so nothing appears on the desktop;
- runs one page at a time, and takes a lock (`~/.cache/browser-gpu-tests/lock`), so two sessions of the same user never share the GPU; a second run fails at once and names the owner of the lock;
- prints the browser and the renderer that draws its WebGL, and stops before the first test when that is a software renderer (SwiftShader, llvmpipe and the like) or none.

`BROWSER_GPU=off` runs the bundled browser in software, as CI does, for a machine without a usable GPU. CI and a remote browser (`REMOTE_BROWSER_WS_ENDPOINT`) always run with `off`. The other projects (`firefox`, `webkit`, the phone emulations) always use Playwright's browsers.

#### When the renderer check fails

An agent works through these steps in order and records what it tried in the pull request or the issue. Each step either finds the cause or rules one out.

1. **Read the printed renderer.** "SwiftShader", "llvmpipe" or "no WebGL" is the symptom, not the cause.
2. **Remove the desktop session's variables.** In a terminal inside a Wayland session, `WAYLAND_DISPLAY` and `XDG_SESSION_TYPE` make Chromium use Wayland, where it falls back to software. Run with `env -u WAYLAND_DISPLAY -u XDG_SESSION_TYPE`; the virtual display already does this for the browser itself.
3. **Check the browser's own view.** Launch the same executable with the same flags, open `chrome://gpu` and read "WebGL" and "Vulkan" (the page's text is inside its `info-view` element's shadow root). "Hardware accelerated" there, but no context in a page, points to the display: on Linux install `Xvfb` instead of running headless.
4. **Linux drivers.** The Vulkan loader must find the GPU's driver. With several GPUs, or a distribution that installs drivers outside the standard paths, point `VK_ICD_FILENAMES` at the right file in the driver's `icd.d` directory, for example Mesa's `intel_icd.x86_64.json`. `vulkaninfo --summary` lists what the loader sees.
5. **Machines with two GPUs.** Laptops choose between an integrated and a discrete GPU. On Windows the per-application graphics preference (Settings, Display, Graphics) decides; elsewhere the driver's own switch does. The renderer string names the one that drew; record it.
6. **WSL.** A Linux browser inside WSL may name the Windows GPU but does not draw on it as a native browser does. Run the GPU tests from a clone on the Windows side, with Chrome or Edge (`channel: "chrome"` or `"msedge"`), or report `BROWSER_GPU=off` and say so.
7. **macOS and Windows.** Headless Chrome uses Metal or Direct3D by default; a software renderer there usually means a virtual machine, a remote desktop session or a blocklisted driver (`--ignore-gpu-blocklist` is already set).
8. **Firefox.** Headless Firefox may expose WebGPU without an adapter; treat that as no GPU, not as a pass. Firefox GPU checks run headed, by a person.

When no step helps, stop and report: the machine, the browser and version, the printed renderer and what each step showed. Then either run with `BROWSER_GPU=off`, say so in the pull request, and leave timing claims out, or ask the owner.

#### What an agent never does

- Never open visible browser windows on the user's desktop session. A virtual display or headless only, one page at a time. Several heavy 3D pages on a live desktop can freeze the machine.
- Never start a GPU run beside another heavy job: check the load and the lock first, and wait instead of competing for the GPU.
- Never turn the renderer check off, or switch to `BROWSER_GPU=off`, to get a run through without saying so in the pull request.
- Never report timings from a software renderer as a statement about devices.
- Stop only what the run started: its own browser and virtual display, never another session's.

The browser tests include an accessibility check: axe (`@axe-core/playwright`) runs the WCAG 2.2 A and AA rules on the page and fails on any violation. Add the same check to every new page or state a test opens. axe finds about half of all accessibility issues; keyboard use, focus order and whether text makes sense still need a person.

### All three engines, on every system you can reach

Browsers come from three engines: Chromium (Chrome, Edge, most Android browsers), Gecko (Firefox) and WebKit (Safari, and every browser on iPhone and iPad). Each has its own bugs, and each draws through the operating system's graphics drivers. A change to what users see is therefore tested on all three engines, and on every operating system the developer can reach: Linux, Windows (natively or through WSL) and macOS. The pull request lists each run with its engine, system and result, the renderer of each GPU run, and names what was not reachable and why, for example "macOS: no machine". A testing farm closes gaps for systems and phones nobody has.

`playwright.config.ts` has five projects. `pnpm test:browser` runs `chromium` on the GPU; the others use Playwright's own browsers, whose renderer is often a software one, so they show whether the application works there, not how fast:

```sh
pnpm exec playwright install --with-deps firefox webkit
pnpm exec playwright test --project firefox
pnpm exec playwright test --project webkit          # the engine of Safari
pnpm exec playwright test --project mobile-chrome   # a Pixel 7 screen, touch and user agent
pnpm exec playwright test --project mobile-safari   # an iPhone 15 screen on WebKit
```

The mobile projects emulate a phone's screen, touch and user agent in a desktop engine. They catch layout and touch problems, not a phone browser's own bugs.

| Machine         | What you can test                                                                                                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linux           | All five projects. Where the browsers' system libraries cannot be installed, as on NixOS, use the container below.                                                                                                                                                                          |
| Windows and WSL | In WSL, all five projects, as on Linux, but drawn in software: a Linux browser in WSL does not draw on the Windows GPU as a native one does. For the GPU, and for Chrome and Edge as users run them, use a clone on the Windows side, where `pnpm test:browser` finds the installed Chrome. |
| macOS           | All five projects, and Chrome or Edge with a `channel` project. Playwright cannot drive Safari itself: `webkit` is its engine and the closest automated check, and Safari is checked by hand.                                                                                               |

Where the browsers' system libraries cannot be installed, run Playwright's image as a browser server and point the tests at it. The image has all three engines:

```sh
podman run -d --rm --name playwright --network host --init mcr.microsoft.com/playwright:v1.64.0-noble \
  /bin/sh -c "npx -y playwright@1.64.0 run-server --port 9326 --host 127.0.0.1"
REMOTE_BROWSER_WS_ENDPOINT=ws://127.0.0.1:9326/ pnpm exec playwright test --project webkit
podman stop playwright
```

Use the image whose version matches `@playwright/test` in `package.json`; Docker works the same way. The container draws in software: with `REMOTE_BROWSER_WS_ENDPOINT` set, `BROWSER_GPU` does not apply, and its timings say nothing about devices. Do not change a test or the configuration to make it pass on one machine.

### Report the results on the pull request

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

## Rules

- **When a browser test is required.** A change to what the user sees or does needs a browser test, or an update to one, in the same pull request. Logic that can be tested without a browser stays in unit tests: they are faster and fail more precisely.
- **Evidence.** Report every local run in the pull request: the commit, the command, the browser and the renderer it printed, and the result. For a failure, attach or link its trace. A screenshot is an illustration; the trace is the evidence.
- **A failing browser test** is handled like any failing check: fix the cause. On a slower machine than the developer's, such as a CI runner, measure where the time goes before touching a bound; a bound that only holds on one machine is set for that machine and says so. Retries are off everywhere. Do not add retries, raise a timeout or mark a test as skipped to get a pull request through; a flaky test gets a `bug` issue.
- **Credentials.** Farm credentials live in the `browser-farm` environment's secret and in uncommitted `.env` files. An agent does not read, print or pass them on, and does not start a farm run unless the issue or the owner asks for it: it spends money.
- **Selectors.** Find elements by role and visible text, as a user would; avoid selectors tied to markup or styling.
