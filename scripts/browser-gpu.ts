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
 * backend on Linux, presenting frames without a window surface (`--disable-vulkan-surface`):
 * without one, headless Chromium on Linux often finds no WebGL, because Vulkan's window
 * surface needs a display. Metal and Direct3D are Chromium's defaults on macOS and Windows.
 */
export function gpuLaunchArgs(platform: NodeJS.Platform): string[] {
  const common = ["--ignore-gpu-blocklist", "--enable-gpu"];
  if (platform === "linux") {
    return [
      ...common,
      "--use-angle=vulkan",
      "--enable-features=Vulkan,VulkanFromANGLE",
      "--disable-vulkan-surface",
    ];
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
 * Whether to try a private virtual display (Xvfb) after headless did not reach the GPU.
 * Headless comes first everywhere. On some Linux drivers headless Chromium finds the GPU
 * but cannot create a WebGL context on it, while the same browser draws on the GPU on a
 * virtual display; nothing of it appears on the user's desktop.
 */
export function tryVirtualDisplayNext(
  platform: NodeJS.Platform,
  headlessKind: RendererKind,
  hasXvfb: boolean,
): boolean {
  return headlessKind !== "hardware" && platform === "linux" && hasXvfb;
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

/**
 * A note on what a hardware result means here. Inside WSL, Linux browsers draw through
 * Mesa's D3D12 driver, which translates to the Windows GPU; in a virtual machine, a
 * paravirtual GPU passes the work to the host's. Either way the GPU works, but timings
 * are not those of a browser on the device itself.
 */
export function rendererNote(
  environment: Readonly<Record<string, string | undefined>>,
  renderer: string | null,
): string | undefined {
  if (classifyRenderer(renderer) !== "hardware") return undefined;
  if (environment.WSL_DISTRO_NAME !== undefined || /\bD3D12\b/u.test(renderer ?? "")) {
    return "inside WSL, through the D3D12 translation to the Windows GPU: functions are tested, timings are not those of a native browser; measure on the Windows side";
  }
  if (/paravirtual|virtio|vmware|virtualbox|parallels/iu.test(renderer ?? "")) {
    return "a virtual machine's GPU: functions are tested, timings are not those of a device";
  }
  return undefined;
}

/** Why the run stops when the GPU check fails, and where the browser's own GPU report is. */
export function rendererFailure(renderer: string | null, reportFiles: readonly string[]): string {
  const report =
    reportFiles.length > 0
      ? ` The browser's GPU report is in ${reportFiles.join(" and ")}; read it first.`
      : "";
  return (
    `BROWSER_GPU=required, but the browser draws with ${renderer ?? "no WebGL"}.${report} ` +
    "See the GPU section of engineering/agents/browser-testing.md, or run with BROWSER_GPU=off."
  );
}
