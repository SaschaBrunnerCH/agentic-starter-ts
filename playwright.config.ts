import { createHash } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";
import { gpuSetting } from "./scripts/browser-gpu.ts";

// These settings choose where and how the tests run; see engineering/agents/browser-testing.md.
//
// BROWSER_TEST_BASE_URL       The application to test. Unset: the production build
//                             in dist/ is served locally for the run.
// REMOTE_BROWSER_WS_ENDPOINT  A remote browser to drive, as offered by testing farms.
//                             Unset: a local Chromium is launched.
// BROWSER_TEST_PORT           The port of the local server. Unset: a port derived
//                             from this directory, so sibling worktrees do not collide.
// BROWSER_GPU=required requests verified hardware. Defaults: local required; CI/remote off.
// BROWSER_GPU_EXECUTABLE selects an installed Chromium browser exclusively.
// BROWSER_GPU_APIS lists required webgl, webgl2 and/or webgpu APIs.
// BROWSER_WEBGPU=required also requires WebGPU (legacy setting).
// Run via pnpm test:browser so discovery finishes before this config is loaded.
// A trailing slash, so that pages resolve below a sub-path instead of beside it.
const baseURL = process.env.BROWSER_TEST_BASE_URL?.replace(/\/?$/u, "/");
const remoteEndpoint = process.env.REMOTE_BROWSER_WS_ENDPOINT;
const gpu = gpuSetting(process.env) === "required";
const profile = process.env.BROWSER_GPU_PROFILE;
const onGpu =
  gpu && profile !== undefined && process.env.BROWSER_GPU_WS_ENDPOINT !== undefined
    ? { connectOptions: { wsEndpoint: process.env.BROWSER_GPU_WS_ENDPOINT } }
    : {};
const chromiumUse = { ...devices["Desktop Chrome"], ...onGpu };
const mobileChromeUse = { ...devices["Pixel 7"], ...onGpu };
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
  // Discovery and its lease belong to browser-test.ts; setup guards direct invocation.
  globalSetup: "./scripts/browser-gpu-setup.ts",
  // On the GPU one page at a time, so the run shares the machine with what else runs.
  ...(gpu ? { workers: 1 } : {}),
  // Each local run is also recorded for the pull request; see browser-evidence-reporter.ts.
  reporter: [
    ...(process.env.CI === "true" ? [["github"] as const] : []),
    ["list"],
    ["./scripts/browser-evidence-reporter.ts"],
  ],
  use: {
    baseURL: baseURL ?? `http://localhost:${localPort}/`,
    // Evidence of a failure: a trace with DOM snapshots, network and console.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...connectOptions,
  },
  // pnpm test:browser runs chromium; the others run with --project after
  // pnpm test:browser:install firefox webkit, or on a farm.
  projects: [
    { name: "chromium", use: chromiumUse },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chrome", use: mobileChromeUse },
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
