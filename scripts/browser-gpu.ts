// GPU discovery rules; scripts/browser-gpu-discovery.ts applies them.
// See engineering/agents/browser-gpu-discovery.md.

import { delimiter, join } from "node:path";

/** Whether local browser tests must run on the GPU. */
export type GpuSetting = "required" | "off";

/**
 * Explicit requirements survive CI and remote transport. Only the default there is off.
 */
export function gpuSetting(environment: Readonly<Record<string, string | undefined>>): GpuSetting {
  const value = environment.BROWSER_GPU ?? "";
  if (value === "required") return "required";
  if (value === "") {
    return environment.CI === "true" || environment.REMOTE_BROWSER_WS_ENDPOINT !== undefined
      ? "off"
      : "required";
  }
  if (value === "off") return "off";
  throw new Error('BROWSER_GPU must be "required" or "off".');
}

/**
 * BROWSER_WEBGPU=required also requires a WebGPU adapter, for applications that draw with
 * WebGPU; unset or "off" (the default) checks WebGL only. It applies only where the GPU is
 * required.
 */
export function webgpuSetting(
  environment: Readonly<Record<string, string | undefined>>,
): GpuSetting {
  const value = environment.BROWSER_WEBGPU ?? "";
  if (value === "" || value === "off") return "off";
  if (value === "required") return gpuSetting(environment);
  throw new Error('BROWSER_WEBGPU must be "required" or "off".');
}

/** What drew the browser's WebGL: a GPU, a software rasterizer, or nobody can tell. */
export type RendererKind = "hardware" | "software" | "unknown";

// Renderers that draw on the CPU: Chromium's SwiftShader, Mesa's llvmpipe, softpipe and
// lavapipe, and Windows' Basic Render Driver.
const SOFTWARE_RENDERER =
  /swiftshader|subzero|llvmpipe|softpipe|swrast|lavapipe|basic render|software|\bcpu\b|\bwarp\b/iu;
const HARDWARE_RENDERER =
  /nvidia|intel|amd|radeon|apple|adreno|qualcomm|mali|powervr|virtio|virgl|vmware|parallels/iu;

export function classifyRenderer(renderer: string | null | undefined): RendererKind {
  const text = renderer?.trim() ?? "";
  if (text === "") return "unknown";
  if (SOFTWARE_RENDERER.test(text)) return "software";
  return HARDWARE_RENDERER.test(text) ? "hardware" : "unknown";
}

/** Hardware-enabled headless flags; Vulkan is an explicit candidate, never an OS verdict. */
export function gpuLaunchArgs(backend: "default" | "vulkan", webgpu = false): string[] {
  // WebGPU is behind this flag in Chromium on Linux, and it lifts the adapter blocklist.
  const common = [
    "--ignore-gpu-blocklist",
    "--enable-gpu",
    ...(webgpu ? ["--enable-unsafe-webgpu"] : []),
  ];
  if (backend === "vulkan") {
    return [
      ...common,
      "--use-angle=vulkan",
      "--enable-features=Vulkan,VulkanFromANGLE",
      "--disable-vulkan-surface",
    ];
  }
  return common;
}

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

/** Who holds the lock of GPU browser runs, shared by one user's sessions. */
export interface LockOwner {
  pid: number;
  directory: string;
  startedAt: string;
}

export function describeOwner(owner: LockOwner): string {
  return `process ${owner.pid} in ${owner.directory}, since ${owner.startedAt}`;
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
