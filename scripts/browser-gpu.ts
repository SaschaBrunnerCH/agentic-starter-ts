// The rules of local browser runs on the machine's GPU; see the GPU section of
// engineering/agents/browser-testing.md. scripts/browser-gpu-setup.ts applies them.

import { delimiter, join } from "node:path";

/** Whether local browser tests must run on the GPU. */
export type GpuSetting = "required" | "off";

/**
 * BROWSER_GPU chooses; unset means "required". CI runners have no GPU, and a remote
 * browser brings its own, so both run with "off" whatever the variable says.
 */
export function gpuSetting(environment: Readonly<Record<string, string | undefined>>): GpuSetting {
  if (environment.CI === "true" || environment.REMOTE_BROWSER_WS_ENDPOINT !== undefined) {
    return "off";
  }
  const value = environment.BROWSER_GPU ?? "";
  if (value === "" || value === "required") return "required";
  if (value === "off") return "off";
  throw new Error(`BROWSER_GPU must be "required" or "off", not "${value}".`);
}

/** What drew the browser's WebGL: a GPU, a software rasterizer, or nobody can tell. */
export type RendererKind = "hardware" | "software" | "unknown";

// Renderers that draw on the CPU: Chromium's SwiftShader, Mesa's llvmpipe, softpipe and
// lavapipe, and Windows' Basic Render Driver.
const SOFTWARE_RENDERER =
  /swiftshader|subzero|llvmpipe|softpipe|lavapipe|basic render driver|software/iu;

export function classifyRenderer(renderer: string | null | undefined): RendererKind {
  const text = renderer?.trim() ?? "";
  if (text === "") return "unknown";
  return SOFTWARE_RENDERER.test(text) ? "software" : "hardware";
}

/**
 * Chromium flags that keep hardware acceleration in headless mode. ANGLE's Vulkan
 * backend on Linux; Metal and Direct3D are Chromium's defaults on macOS and Windows.
 */
export function gpuLaunchArgs(platform: NodeJS.Platform): string[] {
  const common = ["--ignore-gpu-blocklist", "--enable-gpu"];
  if (platform === "linux") {
    return [...common, "--use-angle=vulkan", "--enable-features=Vulkan,VulkanFromANGLE"];
  }
  return common;
}

// The system's browser, not Playwright's bundled one: its GPU stack is the machine's.
const SYSTEM_BROWSERS = ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"];

/** The first of the names found on PATH, as a full path. */
export function findOnPath(
  names: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
  exists: (path: string) => boolean,
): string | undefined {
  for (const directory of (environment.PATH ?? "").split(delimiter).filter(Boolean)) {
    for (const name of names) {
      const candidate = join(directory, name);
      if (exists(candidate)) return candidate;
    }
  }
  return undefined;
}

/**
 * The executable to launch: BROWSER_GPU_EXECUTABLE when set, else the first system
 * Chromium or Chrome on PATH. Undefined lets Playwright use the installed Chrome.
 */
export function systemBrowser(
  environment: Readonly<Record<string, string | undefined>>,
  exists: (path: string) => boolean,
): string | undefined {
  const chosen = environment.BROWSER_GPU_EXECUTABLE;
  if (chosen !== undefined && chosen !== "") return chosen;
  return findOnPath(SYSTEM_BROWSERS, environment, exists);
}

/** Who holds the lock of GPU browser runs, shared by one user's sessions. */
export interface LockOwner {
  pid: number;
  directory: string;
  startedAt: string;
}

/**
 * A lock whose owner process is gone was left by an interrupted run and may be taken;
 * a living owner blocks, so two runs never share the GPU.
 */
export function lockDecision(
  existing: LockOwner | undefined,
  isAlive: (pid: number) => boolean,
): "take" | "take-stale" | "blocked" {
  if (existing === undefined) return "take";
  return isAlive(existing.pid) ? "blocked" : "take-stale";
}

export function describeOwner(owner: LockOwner): string {
  return `process ${owner.pid} in ${owner.directory}, since ${owner.startedAt}`;
}

/**
 * Where the GPU browser draws. Headless Chromium on Linux finds the GPU but cannot
 * create a WebGL context on it, so Linux uses a private virtual display (Xvfb) that
 * the run starts and stops; nothing appears on the user's desktop. Elsewhere headless.
 */
export function gpuDisplayMode(
  platform: NodeJS.Platform,
  hasVirtualDisplay: boolean,
): "virtual-display" | "headless" {
  return platform === "linux" && hasVirtualDisplay ? "virtual-display" : "headless";
}

/**
 * The first X display number from 90 on that no server announces, by its socket in
 * /tmp/.X11-unix (`X<n>`) or its lock file in /tmp (`.X<n>-lock`). A server in another
 * namespace may announce neither; the setup then moves on to the next number.
 */
export function freeDisplayNumber(names: readonly string[], first = 90): number {
  const used = new Set(
    names
      .map((name) => /^(?:X|\.X)(\d+)(?:-lock)?$/u.exec(name)?.[1])
      .filter(Boolean)
      .map(Number),
  );
  let number = first;
  while (used.has(number)) number += 1;
  return number;
}

// A desktop session's variables make Chromium choose Wayland instead of the virtual display.
const DESKTOP_SESSION_VARIABLES = ["WAYLAND_DISPLAY", "XDG_SESSION_TYPE"];

/** The browser's environment on the virtual display: the run's, pointed at that display. */
export function virtualDisplayEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
  display: string,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(environment)) {
    if (value !== undefined && !DESKTOP_SESSION_VARIABLES.includes(name)) result[name] = value;
  }
  result.DISPLAY = display;
  return result;
}
