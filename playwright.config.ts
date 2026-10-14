import { createHash } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

// Three settings choose where the tests run; see engineering/agents/browser-testing.md.
//
// BROWSER_TEST_BASE_URL       The application to test. Unset: the production build
//                             in dist/ is served locally for the run.
// REMOTE_BROWSER_WS_ENDPOINT  A remote browser to drive, as offered by testing farms.
//                             Unset: a local Chromium is launched.
// BROWSER_TEST_PORT           The port of the local server. Unset: a port derived
//                             from this directory, so sibling worktrees do not collide.
// A trailing slash, so that pages resolve below a sub-path instead of beside it.
const baseURL = process.env.BROWSER_TEST_BASE_URL?.replace(/\/?$/u, "/");
const remoteEndpoint = process.env.REMOTE_BROWSER_WS_ENDPOINT;
const localPort =
  process.env.BROWSER_TEST_PORT === undefined
    ? 41000 +
      (createHash("sha256")
        .update(import.meta.dirname)
        .digest()
        .readUInt16BE(0) %
        1000)
    : Number(process.env.BROWSER_TEST_PORT);

// A remote browser that tests the local build reaches it through the Playwright
// connection; without this it would open its own machine's localhost.
const connectOptions =
  remoteEndpoint === undefined
    ? {}
    : {
        connectOptions: {
          wsEndpoint: remoteEndpoint,
          ...(baseURL === undefined ? { exposeNetwork: "<loopback>" } : {}),
        },
      };

export default defineConfig({
  testDir: "e2e",
  // A test left with .only must not shrink a CI run to one test.
  forbidOnly: process.env.CI === "true",
  // No retries: a test that passes on the second attempt is a bug to report, not a pass.
  retries: 0,
  reporter: process.env.CI === "true" ? [["github"], ["list"]] : "list",
  use: {
    baseURL: baseURL ?? `http://localhost:${localPort}/`,
    // Evidence of a failure: a trace with DOM snapshots, network and console.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...connectOptions,
  },
  // pnpm test:browser runs chromium; the others run with --project after
  // pnpm exec playwright install firefox webkit, or on a farm.
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 15"] } },
  ],
  ...(baseURL === undefined
    ? {
        webServer: {
          command: `pnpm preview --port ${localPort} --strictPort`,
          url: `http://localhost:${localPort}`,
          reuseExistingServer: false,
        },
      }
    : {}),
});
