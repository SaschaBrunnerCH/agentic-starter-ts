import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import {
  findOnPath,
  freeDisplayNumber,
  gpuDisplayMode,
  gpuLaunchArgs,
  gpuSetting,
  systemBrowser,
  virtualDisplayEnvironment,
} from "./scripts/browser-gpu.ts";

// These settings choose where and how the tests run; see engineering/agents/browser-testing.md.
//
// BROWSER_TEST_BASE_URL       The application to test. Unset: the production build
//                             in dist/ is served locally for the run.
// REMOTE_BROWSER_WS_ENDPOINT  A remote browser to drive, as offered by testing farms.
//                             Unset: a local Chromium is launched.
// BROWSER_TEST_PORT           The port of the local server. Unset: a port derived
//                             from this directory, so sibling worktrees do not collide.
// BROWSER_GPU                 "required" (the default): the chromium project runs the
//                             system's browser on the GPU, headless, one page at a time,
//                             under a machine-wide lock, and stops on a software
//                             renderer. "off": the bundled browser, in software. CI and
//                             remote browsers always run with "off".
// BROWSER_GPU_EXECUTABLE      The browser for GPU runs. Unset: the first Chromium or
//                             Chrome on PATH, else the installed Chrome.
// A trailing slash, so that pages resolve below a sub-path instead of beside it.
const baseURL = process.env.BROWSER_TEST_BASE_URL?.replace(/\/?$/u, "/");
const remoteEndpoint = process.env.REMOTE_BROWSER_WS_ENDPOINT;
const gpu = gpuSetting(process.env) === "required";
const gpuExecutable = gpu ? systemBrowser(process.env, existsSync) : undefined;
// On Linux the GPU browser draws on a private virtual display; the number is chosen once
// and passed to the workers through the environment. browser-gpu-setup.ts starts it.
const hasXvfb = findOnPath(["Xvfb"], process.env, existsSync) !== undefined;
if (gpu && gpuDisplayMode(process.platform, hasXvfb) === "virtual-display") {
  process.env.BROWSER_GPU_DISPLAY ??= `:${freeDisplayNumber(x11Sockets())}`;
}
const gpuDisplay = gpu ? process.env.BROWSER_GPU_DISPLAY : undefined;
const gpuLaunchOptions = {
  args: gpuLaunchArgs(process.platform),
  ...(gpuExecutable === undefined ? { channel: "chrome" } : { executablePath: gpuExecutable }),
  ...(gpuDisplay === undefined
    ? {}
    : { headless: false, env: virtualDisplayEnvironment(process.env, gpuDisplay) }),
};

// The chromium project: on the GPU unless BROWSER_GPU is off.
const chromiumUse = {
  ...devices["Desktop Chrome"],
  ...(gpu ? { launchOptions: gpuLaunchOptions } : {}),
};

function list(directory: string): string[] {
  try {
    return readdirSync(directory);
  } catch {
    return [];
  }
}

function x11Sockets(): string[] {
  return [...list("/tmp/.X11-unix"), ...list("/tmp").filter((name) => name.startsWith(".X"))];
}
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
  // On the GPU one page at a time, so the run shares the machine with what else runs.
  ...(gpu ? { workers: 1, globalSetup: "./scripts/browser-gpu-setup.ts" } : {}),
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
    { name: "chromium", use: chromiumUse },
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
