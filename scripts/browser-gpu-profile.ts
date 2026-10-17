// Candidate selection and the exact launch contract shared by discovery and workers.
import { posix, win32 } from "node:path";
import type { LaunchOptions } from "@playwright/test";
import * as json from "./json-shape.ts";
import { gpuLaunchArgs, virtualDisplayEnvironment, webgpuSetting } from "./browser-gpu.ts";

export type GraphicsApi = "webgl" | "webgl2" | "webgpu";
export type BrowserTarget = { executablePath: string } | { channel: string };
type Backend = "default" | "gl" | "vulkan" | "wsl-d3d12";
export interface GpuProfile {
  browser: BrowserTarget;
  backend: Backend;
  apis: GraphicsApi[];
  display?: string;
}

export function requiredApis(env: Readonly<NodeJS.ProcessEnv>): GraphicsApi[] {
  const values = env.BROWSER_GPU_APIS?.split(",").map((api) => api.trim());
  if (values === undefined)
    return webgpuSetting(env) === "required" ? ["webgl", "webgpu"] : ["webgl"];
  const apis: GraphicsApi[] = [];
  for (const value of values) {
    if (value !== "webgl" && value !== "webgl2" && value !== "webgpu") {
      throw new Error("BROWSER_GPU_APIS must list webgl, webgl2 or webgpu, separated by commas.");
    }
    if (!apis.includes(value)) apis.push(value);
  }
  if (webgpuSetting(env) === "required" && !apis.includes("webgpu")) apis.push("webgpu");
  return apis;
}

export function browserCandidates(
  platform: NodeJS.Platform,
  env: Readonly<NodeJS.ProcessEnv>,
  exists: (path: string) => boolean,
): BrowserTarget[] {
  if (env.BROWSER_GPU_EXECUTABLE) return [{ executablePath: env.BROWSER_GPU_EXECUTABLE }];
  const value = (name: string) =>
    platform === "win32"
      ? Object.entries(env).find(([key]) => key.toUpperCase() === name.toUpperCase())?.[1]
      : env[name];
  const paths = platform === "win32" ? win32 : posix;
  const names =
    platform === "win32"
      ? ["chrome.exe", "msedge.exe", "chromium.exe"]
      : ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];
  const found = new Set<string>();
  for (const directory of (value("PATH") ?? "")
    .split(platform === "win32" ? ";" : ":")
    .filter(Boolean)) {
    for (const name of names) {
      const candidate = paths.join(directory, name);
      if (exists(candidate)) found.add(candidate);
    }
  }
  // Standard installation directories also cover installations absent from PATH.
  const installed =
    platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        ]
      : platform === "win32"
        ? [value("PROGRAMFILES"), value("PROGRAMFILES(X86)"), value("LOCALAPPDATA")]
            .filter((directory): directory is string => Boolean(directory))
            .flatMap((directory) => [
              paths.join(directory, "Google", "Chrome", "Application", "chrome.exe"),
              paths.join(directory, "Microsoft", "Edge", "Application", "msedge.exe"),
            ])
        : [];
  for (const candidate of installed) if (exists(candidate)) found.add(candidate);
  if (found.size > 0) return [...found].map((executablePath) => ({ executablePath }));
  // Playwright resolves standard branded installation locations (and diagnoses absence).
  return [{ channel: "chrome" }, { channel: "msedge" }];
}

export function candidateProfiles(
  platform: NodeJS.Platform,
  env: Readonly<NodeJS.ProcessEnv>,
  browsers: readonly BrowserTarget[],
): GpuProfile[] {
  if (!["linux", "win32", "darwin"].includes(platform))
    throw new Error(`GPU discovery is not supported on ${platform}.`);
  const backends: Backend[] =
    platform !== "linux"
      ? ["default"]
      : env.WSL_DISTRO_NAME !== undefined || env.WSL_INTEROP !== undefined
        ? ["default", "wsl-d3d12", "vulkan", "gl"]
        : ["default", "gl", "vulkan"];
  const apis = requiredApis(env);
  const profiles: GpuProfile[] = [];
  for (const browser of browsers) {
    for (const backend of backends) profiles.push({ browser, backend, apis });
  }
  return profiles;
}

export function profileLaunchOptions(
  profile: GpuProfile,
  env: Readonly<NodeJS.ProcessEnv>,
): LaunchOptions {
  const platform = profile.backend === "vulkan" ? "linux" : "win32";
  const args = gpuLaunchArgs(platform, profile.apis.includes("webgpu"));
  if (profile.backend === "gl" || profile.backend === "wsl-d3d12") {
    args.push(
      "--use-gl=angle",
      "--use-angle=gl",
      "--ozone-platform=x11",
      "--disable-software-rasterizer",
    );
  }
  const browserEnv = virtualDisplayEnvironment(env, profile.display ?? env.DISPLAY ?? "");
  if (profile.backend === "wsl-d3d12") browserEnv.MESA_LOADER_DRIVER_OVERRIDE = "d3d12";
  return {
    ...profile.browser,
    args,
    env: browserEnv,
    headless: profile.display === undefined,
    timeout: 12_000,
  };
}

export function readProfile(text: string): GpuProfile {
  const parsed = json.parseJson(
    text,
    json.object({
      executablePath: json.optional(json.string),
      channel: json.optional(json.string),
      backend: json.string,
      apis: json.array(json.string),
      display: json.optional(json.string),
    }),
    "BROWSER_GPU_PROFILE",
  );
  const backend = parsed.backend;
  if (backend !== "default" && backend !== "gl" && backend !== "vulkan" && backend !== "wsl-d3d12")
    throw new Error("Unknown GPU profile backend.");
  const apis: GraphicsApi[] = parsed.apis.map((api) => {
    if (api !== "webgl" && api !== "webgl2" && api !== "webgpu")
      throw new Error("Unknown GPU profile API.");
    return api;
  });
  if (apis.length === 0) throw new Error("GPU profile has no required API.");
  if ((parsed.executablePath === undefined) === (parsed.channel === undefined))
    throw new Error("GPU profile needs exactly one browser.");
  const browser =
    parsed.executablePath === undefined
      ? { channel: parsed.channel ?? "" }
      : { executablePath: parsed.executablePath };
  return {
    browser,
    backend,
    apis,
    ...(parsed.display === undefined ? {} : { display: parsed.display }),
  };
}

export function writeProfile(profile: GpuProfile): string {
  return JSON.stringify({
    ...profile.browser,
    backend: profile.backend,
    apis: profile.apis,
    ...(profile.display === undefined ? {} : { display: profile.display }),
  });
}

/** A default non-Chromium run is functional; an explicit hardware requirement cannot be waived. */
export function selectedProjects(args: readonly string[]): string[] {
  const projects: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    if (arg === "--project") {
      while (args[i + 1] !== undefined && !args[i + 1]?.startsWith("-"))
        projects.push(args[++i] ?? "");
    } else if (arg.startsWith("--project=")) projects.push(arg.slice("--project=".length));
  }
  return projects;
}

export function chromiumSelection(args: readonly string[]): boolean {
  const projects = selectedProjects(args);
  return (
    projects.length === 0 ||
    projects.some(
      (project) => project === "chromium" || project === "mobile-chrome" || project.includes("*"),
    )
  );
}
