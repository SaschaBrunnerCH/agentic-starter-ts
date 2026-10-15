// Playwright's global setup. For local runs with BROWSER_GPU=required (the default) it
// takes the lock of GPU runs, starts the configured browser once, prints the renderer
// that draws its WebGL and stops the run when that is a software one. Otherwise nothing.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium, type FullConfig } from "@playwright/test";
import * as json from "./json-shape.ts";
import {
  classifyRenderer,
  describeOwner,
  gpuSetting,
  lockDecision,
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

// The private virtual display the GPU browser draws on (Linux). playwright.config.ts chose
// its number; when a server elsewhere holds it, the next numbers are tried, and the
// workers, started after this setup, inherit the one that started.
async function startVirtualDisplay(first: string): Promise<ChildProcess> {
  const firstNumber = Number(first.slice(1));
  for (let number = firstNumber; number < firstNumber + 10; number += 1) {
    const server = await tryVirtualDisplay(`:${number}`);
    if (server !== undefined) {
      process.env.BROWSER_GPU_DISPLAY = `:${number}`;
      return server;
    }
  }
  throw new Error(`No virtual display from ${first} on could be started (Xvfb).`);
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

export default async function globalSetup(config: FullConfig): Promise<() => void> {
  if (gpuSetting(process.env) === "off") return () => {};
  acquireLock();
  let display: ChildProcess | undefined;
  const stop = (): void => {
    display?.kill();
    releaseLock();
  };
  process.once("exit", stop);
  try {
    const chosen = process.env.BROWSER_GPU_DISPLAY;
    if (chosen !== undefined) display = await startVirtualDisplay(chosen);
    const displayName = process.env.BROWSER_GPU_DISPLAY;
    const launchOptions = config.projects.find((project) => project.name === "chromium")?.use
      .launchOptions;
    // The configured options, pointed at the display that started.
    const browser = await chromium.launch({
      ...launchOptions,
      ...(displayName === undefined || launchOptions?.env === undefined
        ? {}
        : { env: { ...launchOptions.env, DISPLAY: displayName } }),
    });
    try {
      const page = await browser.newPage();
      // A string, because this file is compiled without the DOM library.
      const renderer = await page.evaluate<string | null>(RENDERER_SCRIPT);
      const kind = classifyRenderer(renderer);
      const where = displayName === undefined ? "headless" : `virtual display ${displayName}`;
      console.log(
        `Browser ${browser.version()}, ${where}, renderer: ${renderer ?? "no WebGL"} (${kind})`,
      );
      if (kind !== "hardware") {
        throw new Error(
          `BROWSER_GPU=required, but the browser draws with ${renderer ?? "no WebGL"}. ` +
            "See the GPU section of engineering/agents/browser-testing.md, or run with BROWSER_GPU=off.",
        );
      }
    } finally {
      await browser.close();
    }
  } catch (error) {
    stop();
    throw error;
  }
  return stop;
}
