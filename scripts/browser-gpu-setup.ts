// Playwright's global setup. For local runs with BROWSER_GPU=required (the default) it
// takes the lock of GPU runs and starts the configured browser headless to read the
// renderer that draws its WebGL. When that is not a GPU, on Linux with Xvfb installed, it
// tries again on a private virtual display and, when that works, keeps it for the run.
// It stops the run when neither reaches the GPU. With BROWSER_GPU off it does nothing.

import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type FullConfig, type LaunchOptions } from "@playwright/test";
import * as json from "./json-shape.ts";
import {
  classifyRenderer,
  describeOwner,
  findOnPath,
  freeDisplayNumber,
  gpuSetting,
  judgeAdapter,
  lockDecision,
  rendererFailure,
  rendererNote,
  webgpuFailure,
  webgpuSetting,
  tryVirtualDisplayNext,
  virtualDisplayEnvironment,
  type LockOwner,
  type RendererKind,
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

// The text of the browser's own GPU report. chrome://gpu renders it inside nested shadow
// roots, which innerText does not enter: the walk does, one line per row or heading.
const GPU_REPORT_SCRIPT = `(() => {
  const out = [];
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text !== "") out.push(text, " ");
      return;
    }
    if (node.shadowRoot) walk(node.shadowRoot);
    for (const child of node.childNodes) walk(child);
    if (node.nodeType === Node.ELEMENT_NODE && /^(tr|h[1-6]|li|p|div|info-view-table-row)$/i.test(node.tagName)) out.push("\\n");
  };
  walk(document.body);
  return out.join("").replace(/ *\\n[\\s]*/g, "\\n").trim();
})()`;

// Where a failed check leaves the browser's GPU report, next to the test results.
const reportDirectory = join(import.meta.dirname, "..", "test-results");
const reportBase = join(reportDirectory, "gpu-report");

function removeGpuReport(): void {
  for (const extension of ["txt", "pdf"]) rmSync(`${reportBase}.${extension}`, { force: true });
}

/**
 * Saves chrome://gpu of the browser that just failed the check, before it closes, so the
 * report keeps that browser's failure state: as text, and as a PDF where the browser can print
 * one (headless only). Returns the files written.
 */
async function saveGpuReport(browser: Browser, headless: boolean): Promise<string[]> {
  const files: string[] = [];
  try {
    // A report of an earlier attempt would describe another browser.
    removeGpuReport();
    mkdirSync(reportDirectory, { recursive: true });
    const page = await browser.newPage();
    await page.goto("chrome://gpu");
    await page.waitForTimeout(1000);
    writeFileSync(`${reportBase}.txt`, await page.evaluate<string>(GPU_REPORT_SCRIPT));
    files.push(`${reportBase}.txt`);
    if (headless) {
      await page.pdf({ path: `${reportBase}.pdf` });
      files.push(`${reportBase}.pdf`);
    }
  } catch (error) {
    console.log(
      `Could not save the GPU report: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return files;
}

type RendererCheck = { renderer: string | null; kind: RendererKind; report: string[] };

/** The renderer a browser started with these options finds; its GPU report when no GPU. */
async function checkRenderer(options: LaunchOptions | undefined): Promise<RendererCheck> {
  const browser = await chromium.launch(options);
  try {
    const page = await browser.newPage();
    // A string, because this file is compiled without the DOM library.
    const renderer = await page.evaluate<string | null>(RENDERER_SCRIPT);
    const kind = classifyRenderer(renderer);
    const report =
      kind === "hardware" ? [] : await saveGpuReport(browser, options?.headless !== false);
    return { renderer, kind, report };
  } finally {
    await browser.close();
  }
}

// The WebGPU adapter the page gets: its description, or why there is none.
const ADAPTER_SCRIPT = `(async () => {
  if (!("gpu" in navigator)) return { adapter: null, reason: "the browser offers no WebGPU (navigator.gpu is missing)" };
  const adapter = await navigator.gpu.requestAdapter().catch(() => null);
  if (adapter === null) return { adapter: null, reason: "the browser offers WebGPU but no adapter" };
  const info = adapter.info ?? {};
  const text = [info.vendor, info.architecture, info.description].filter(Boolean).join(" ");
  // Newer browsers say it in info, older ones on the adapter.
  return { text, fallback: info.isFallbackAdapter === true || adapter.isFallbackAdapter === true };
})()`;

type AdapterProbe = { adapter: null; reason: string } | { text: string; fallback: boolean };

/**
 * Asks for a WebGPU adapter on a local page: WebGPU exists only in a secure context, which
 * about:blank is not and http://localhost is.
 */
async function webgpuAdapterOf(
  options: LaunchOptions | undefined,
): Promise<{ adapter: string | null; reason: string | null }> {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end("<!doctype html><title>WebGPU check</title>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  // The server closes also when the browser does not start or does not close.
  try {
    const browser = await chromium.launch(options);
    try {
      const page = await browser.newPage();
      await page.goto(`http://localhost:${port}/`);
      const probe = await page.evaluate<AdapterProbe>(ADAPTER_SCRIPT);
      return "reason" in probe ? probe : judgeAdapter(probe.text, probe.fallback);
    } finally {
      await browser.close();
    }
  } finally {
    server.close();
  }
}

export default async function globalSetup(config: FullConfig): Promise<() => void> {
  // What the run used, for the record of browser-evidence-reporter.ts.
  process.env.BROWSER_GPU_SETTING = gpuSetting(process.env);
  delete process.env.BROWSER_GPU_RENDERER;
  delete process.env.BROWSER_GPU_KIND;
  delete process.env.BROWSER_GPU_REACHED;
  delete process.env.BROWSER_WEBGPU_ADAPTER;
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
    const needsWebgpu = webgpuSetting(process.env) === "required";
    // One attempt: the WebGL renderer, with the browser's GPU report when it is not a GPU, and,
    // when required and WebGL is on the GPU, the WebGPU adapter in the same setting.
    const attempt = async (launch: LaunchOptions | undefined, where: string) => {
      const check = await checkRenderer(launch);
      console.log(`GPU check, ${where}: ${check.renderer ?? "no WebGL"} (${check.kind})`);
      let webgpu: { adapter: string | null; reason: string | null } | undefined;
      if (needsWebgpu && check.kind === "hardware") {
        webgpu = await webgpuAdapterOf(launch);
        console.log(`WebGPU check, ${where}: ${webgpu.adapter ?? webgpu.reason ?? "no adapter"}`);
      }
      // Usable: WebGL on the GPU, and the adapter where one is required.
      const usable = check.kind === "hardware" && (!needsWebgpu || webgpu?.adapter != null);
      return { ...check, webgpu, usable };
    };
    let result = await attempt(options, "headless");
    let reached = "headless";
    const hasXvfb = findOnPath(["Xvfb"], process.env, existsSync) !== undefined;
    // Some Linux drivers give WebGL, or WebGPU, only with a display: then a virtual one.
    if (tryVirtualDisplayNext(process.platform, result.usable ? "hardware" : "unknown", hasXvfb)) {
      const started = await startVirtualDisplay();
      display = started.server;
      result = await attempt(
        {
          ...options,
          headless: false,
          env: virtualDisplayEnvironment(process.env, started.display),
        },
        `virtual display ${started.display}`,
      );
      reached = `virtual display ${started.display}`;
      // The workers start after this setup and read it in playwright.config.ts.
      if (result.usable) process.env.BROWSER_GPU_DISPLAY = started.display;
    }
    const { renderer, kind, report, webgpu } = result;
    if (renderer !== null) process.env.BROWSER_GPU_RENDERER = renderer;
    process.env.BROWSER_GPU_KIND = kind;
    process.env.BROWSER_GPU_REACHED = reached;
    const note = rendererNote(process.env, renderer);
    if (note !== undefined) console.log(`Note: ${note}.`);
    if (kind !== "hardware") throw new Error(rendererFailure(renderer, report));
    if (needsWebgpu) {
      if (webgpu?.adapter == null) {
        throw new Error(webgpuFailure(webgpu?.reason ?? "no adapter is available"));
      }
      process.env.BROWSER_WEBGPU_ADAPTER = webgpu.adapter;
    }
    // A report from an earlier failed run or attempt would describe another browser state.
    removeGpuReport();
  } catch (error) {
    stop();
    throw error;
  }
  return stop;
}
