# Browser testing

Unit tests check modules. Browser tests check that the built application works in a real browser. They are written with Playwright, live in `e2e/`, and the same tests run everywhere below.

| Where                  | Runs                                                   | Browsers and devices                                               | Application under test                              |
| ---------------------- | ------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------- |
| Pull request           | The browser test steps of `PR build`, always           | Chromium on the CI machine                                         | The production build, at the root and under a path  |
| Your machine           | On demand: `pnpm test:browser`, or `pnpm test:devices` | Chromium, Firefox, WebKit and phone emulation; real phones by hand | The production build in `dist/`, served for the run |
| Testing farm, optional | `pnpm test:devices --endpoints`, or the farm workflow  | Many browsers, operating systems and real phones, from one secret  | A deployed URL or a preview                         |

The local push gate does not run browser tests; the pull request does, under the one required `PR build` status. Traces of a failure are kept for seven days as the artifact `browser-test-results-<commit>-…`.

## On your machine

```sh
pnpm test:browser:install   # once: downloads Chromium and its system libraries
pnpm build
pnpm test:browser           # Chromium, as in the pull request
```

`pnpm install --frozen-lockfile` does not download browsers. The tests run against the production build, so build first; a stale `dist/` tests old code. A failure leaves a trace under `test-results/`; open it with `pnpm exec playwright show-trace <trace.zip>`. Copy a trace you want to keep out of the worktree: cleanup after the merge removes `test-results/`.

The local server uses a port derived from the worktree's directory, so two worktrees can test at the same time; set `BROWSER_TEST_PORT` to choose one. A busy port fails the run instead of testing whatever answers there.

The browser tests include an accessibility check: axe (`@axe-core/playwright`) runs the WCAG 2.2 A and AA rules on the page and fails on any violation. Add the same check to every new page or state a test opens. axe finds about half of all accessibility issues; keyboard use, focus order and whether text makes sense still need a person.

### Other browsers

`playwright.config.ts` has five projects. `pnpm test:browser` runs `chromium`; the others run on demand:

```sh
pnpm exec playwright install --with-deps firefox webkit
pnpm exec playwright test --project firefox
pnpm exec playwright test --project webkit          # the engine of Safari
pnpm exec playwright test --project mobile-chrome   # a Pixel 7 screen, touch and user agent
pnpm exec playwright test --project mobile-safari   # an iPhone 15 screen on WebKit
```

The mobile projects emulate a phone's screen, touch and user agent in a desktop engine. They catch layout and touch problems, not a phone browser's own bugs.

| Machine         | What you can test                                                                                                                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linux           | All five projects. Where the browsers' system libraries cannot be installed, as on NixOS, use the container below.                                                                                              |
| Windows and WSL | In WSL, all five projects, as on Linux; WSLg shows them with `--headed`. Chrome and Edge for Windows run from a clone on the Windows side, with a project that sets `channel: "chrome"` or `channel: "msedge"`. |
| macOS           | All five projects, and Chrome or Edge with a `channel` project. Playwright cannot drive Safari itself: `webkit` is its engine and the closest automated check, and Safari is checked by hand.                   |

Where the browsers' system libraries cannot be installed, run Playwright's image as a browser server and point the tests at it. The image has all three engines:

```sh
podman run -d --rm --name playwright --network host --init mcr.microsoft.com/playwright:v1.64.0-noble \
  /bin/sh -c "npx -y playwright@1.64.0 run-server --port 9326 --host 127.0.0.1"
REMOTE_BROWSER_WS_ENDPOINT=ws://127.0.0.1:9326/ pnpm exec playwright test --project webkit
podman stop playwright
```

Use the image whose version matches `@playwright/test` in `package.json`; Docker works the same way. Do not change a test or the configuration to make it pass on one machine.

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
- **Evidence.** For a failure, link the run and its trace artifact in the pull request. A screenshot is an illustration; the trace is the evidence.
- **A failing browser test** is handled like any failing check: fix the cause. Retries are off everywhere. Do not add retries, raise a timeout or mark a test as skipped to get a pull request through; a flaky test gets a `bug` issue.
- **Credentials.** Farm credentials live in the `browser-farm` environment's secret and in uncommitted `.env` files. An agent does not read, print or pass them on, and does not start a farm run unless the issue or the owner asks for it: it spends money.
- **Selectors.** Find elements by role and visible text, as a user would; avoid selectors tied to markup or styling.
