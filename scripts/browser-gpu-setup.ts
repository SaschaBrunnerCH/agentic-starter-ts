// Playwright's global setup. For local runs with BROWSER_GPU=required (the default) it
// takes the lock of GPU runs and starts the configured browser headless to read the
// renderer that draws its WebGL. When that is not a GPU, on Linux with Xvfb installed, it
// tries again on a private virtual display and, when that works, keeps it for the run.
// It stops the run when neither reaches the GPU. With BROWSER_GPU off it does nothing.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium, type FullConfig, type LaunchOptions } from "@playwright/test";
import * as json from "./json-shape.ts";
import {
  classifyRenderer,
  describeOwner,
  findOnPath,
  freeDisplayNumber,
  gpuSetting,
  lockDecision,
  rendererNote,
  tryVirtualDisplayNext,
  virtualDisplayEnvironment,
  type LockOwner,
} from "./browser-gpu.ts";

// In the user's own directory, not the shared temporary one, where another user could
// create or redirect a file of a known name first. Sessions of one user share it.
const lockDirectory = join(homedir(), ".cache", "browser-gpu-tests");
const lockFile = join(lockDirectory, "lock");
const ownerShape = json.object({
  pid: json.number,
  directory: json.string,
  startedAt: json.string,
});

function errorCode(error: unknown): unknown {
  return error instanceof Error && "code" in error ? error.code : undefined;
}

// The renderer that draws WebGL, unmasked where the browser allows it.
const RENDERER_SCRIPT = `(() => {
  const gl = document.createElement("canvas").getContext("webgl");
  if (gl === null) return null;
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  return String(gl.getParameter(info === null ? gl.RENDERER : info.UNMASKED_RENDERER_WEBGL));
})()`;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return errorCode(error) === "EPERM";
  }
}

function readOwner(): LockOwner | undefined {
  try {
    return json.parseJson(readFileSync(lockFile, "utf8"), ownerShape, lockFile);
  } catch {
    return undefined;
  }
}

function acquireLock(): void {
  mkdirSync(lockDirectory, { recursive: true, mode: 0o700 });
  const owner: LockOwner = {
    pid: process.pid,
    directory: process.cwd(),
    startedAt: new Date().toISOString(),
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      writeFileSync(lockFile, JSON.stringify(owner), { flag: "wx", mode: 0o600 });
      return;
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
    }
    const existing = readOwner();
    const decision = lockDecision(existing, isAlive);
    if (decision === "blocked" && existing !== undefined) {
      throw new Error(
        `Another GPU browser run holds ${lockFile}: ${describeOwner(existing)}. Wait for it, or run with BROWSER_GPU=off.`,
      );
    }
    // An interrupted run left the lock behind; its process is gone.
    rmSync(lockFile, { force: true });
  }
  throw new Error(`Could not take ${lockFile}.`);
}

function releaseLock(): void {
  if (readOwner()?.pid === process.pid) rmSync(lockFile, { force: true });
}

// A private virtual display (Xvfb) for the fallback on Linux, on the first number no
// server announces; a server in another namespace may announce none, so on failure the
// next numbers are tried.
async function startVirtualDisplay(): Promise<{ server: ChildProcess; display: string }> {
  const first = freeDisplayNumber(x11Names());
  for (let number = first; number < first + 10; number += 1) {
    const server = await tryVirtualDisplay(`:${number}`);
    if (server !== undefined) return { server, display: `:${number}` };
  }
  throw new Error(`No virtual display from :${first} on could be started (Xvfb).`);
}

async function tryVirtualDisplay(display: string): Promise<ChildProcess | undefined> {
  const server = spawn("Xvfb", [display, "-screen", "0", "1280x800x24", "-nolisten", "tcp"], {
    stdio: "ignore",
  });
  const socket = `/tmp/.X11-unix/X${display.slice(1)}`;
  for (let waited = 0; waited < 10_000; waited += 100) {
    if (existsSync(socket)) return server;
    if (server.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  server.kill();
  return undefined;
}

function list(directory: string): string[] {
  try {
    return readdirSync(directory);
  } catch {
    return [];
  }
}

function x11Names(): string[] {
  return [...list("/tmp/.X11-unix"), ...list("/tmp").filter((name) => name.startsWith(".X"))];
}

async function rendererOf(options: LaunchOptions | undefined): Promise<string | null> {
  const browser = await chromium.launch(options);
  try {
    const page = await browser.newPage();
    // A string, because this file is compiled without the DOM library.
    return await page.evaluate<string | null>(RENDERER_SCRIPT);
  } finally {
    await browser.close();
  }
}

export default async function globalSetup(config: FullConfig): Promise<() => void> {
  // What the run used, for the record of browser-evidence-reporter.ts.
  process.env.BROWSER_GPU_SETTING = gpuSetting(process.env);
  delete process.env.BROWSER_GPU_RENDERER;
  delete process.env.BROWSER_GPU_KIND;
  delete process.env.BROWSER_GPU_REACHED;
  if (gpuSetting(process.env) === "off") return () => {};
  acquireLock();
  let display: ChildProcess | undefined;
  const stop = (): void => {
    display?.kill();
    releaseLock();
  };
  process.once("exit", stop);
  try {
    const options = config.projects.find((project) => project.name === "chromium")?.use
      .launchOptions;
    let renderer = await rendererOf(options);
    let kind = classifyRenderer(renderer);
    console.log(`GPU check, headless: ${renderer ?? "no WebGL"} (${kind})`);
    let reached = "headless";
    const hasXvfb = findOnPath(["Xvfb"], process.env, existsSync) !== undefined;
    if (tryVirtualDisplayNext(process.platform, kind, hasXvfb)) {
      const started = await startVirtualDisplay();
      display = started.server;
      renderer = await rendererOf({
        ...options,
        headless: false,
        env: virtualDisplayEnvironment(process.env, started.display),
      });
      kind = classifyRenderer(renderer);
      reached = `virtual display ${started.display}`;
      console.log(
        `GPU check, virtual display ${started.display}: ${renderer ?? "no WebGL"} (${kind})`,
      );
      // The workers start after this setup and read it in playwright.config.ts.
      if (kind === "hardware") process.env.BROWSER_GPU_DISPLAY = started.display;
    }
    if (renderer !== null) process.env.BROWSER_GPU_RENDERER = renderer;
    process.env.BROWSER_GPU_KIND = kind;
    process.env.BROWSER_GPU_REACHED = reached;
    const note = rendererNote(process.env, renderer);
    if (note !== undefined) console.log(`Note: ${note}.`);
    if (kind !== "hardware") {
      throw new Error(
        `BROWSER_GPU=required, but the browser draws with ${renderer ?? "no WebGL"}. ` +
          "See the GPU section of engineering/agents/browser-testing.md, or run with BROWSER_GPU=off.",
      );
    }
  } catch (error) {
    stop();
    throw error;
  }
  return stop;
}
