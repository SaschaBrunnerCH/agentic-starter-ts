// Resolve discovery before Playwright imports its configuration. Keep its lock and
// any private display until the owned test process exits, including on interruption.
import { fork, spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, ftruncateSync, openSync, readFileSync, writeSync } from "node:fs";
import { resolve } from "node:path";
import { guardBrowserSource } from "./browser-source.ts";
import { EVIDENCE_FILE, invalidateRun } from "./browser-evidence.ts";
import { gpuSetting } from "./browser-gpu.ts";
import {
  chromiumSelection,
  requiredApis,
  selectedProjects,
  writeProfile,
} from "./browser-gpu-profile.ts";
import { discoverGpu, type DiscoveredGpu } from "./browser-gpu-discovery.ts";
import { scriptArguments } from "../shared/script-arguments.ts";

const requested: string[] = [];
const apis: string[] = [];
let featureLevel: string | undefined;
const input = scriptArguments();
for (let index = 0; index < input.length; index++) {
  const arg = input[index] ?? "";
  if (arg === "--api") apis.push(input[++index] ?? "");
  else if (arg.startsWith("--api=")) apis.push(arg.slice("--api=".length));
  else if (arg === "--webgpu-feature-level") featureLevel = input[++index] ?? "";
  else if (arg.startsWith("--webgpu-feature-level="))
    featureLevel = arg.slice("--webgpu-feature-level=".length);
  else requested.push(arg);
}
const help = requested.includes("--help") || requested.includes("-h");
if (help) {
  console.log(`Test on this machine (Windows, WSL, Linux or macOS).
  pnpm test:browser                         build, then Chromium on verified local GPU
  pnpm test:browser --api webgl2             require this API; repeat --api to combine
  pnpm test:browser --api webgpu --webgpu-feature-level compatibility
                                           explicit WebGPU compatibility requirement
  pnpm browser:doctor --help                diagnose this machine without app tests
  pnpm test:devices --help                  engines, phone emulation and remote targets

Missing setup: pnpm test:browser:install; hardware discovery also needs installed
Chrome, Chromium or Edge. No drivers or optional tools are installed automatically.
Real phones/tablets: engineering/agents/browser-testing.md#real-phones-and-tablets
Platform paths and GPU failures: engineering/agents/browser-gpu-discovery.md
Additional Playwright options follow.
`);
}
const args = requested.some((arg) => arg === "--project" || arg.startsWith("--project="))
  ? requested
  : ["--project", "chromium", ...requested];
const env = { ...process.env };
delete env.BROWSER_TEST_BUILD_COMMIT;
const runId = randomUUID();
env.BROWSER_TEST_RUN_ID = runId;
if (apis.length > 0) env.BROWSER_GPU_APIS = apis.join(",");
if (featureLevel !== undefined) env.BROWSER_WEBGPU_FEATURE_LEVEL = featureLevel;
delete env.BROWSER_GPU_PROFILE;
delete env.BROWSER_GPU_REPORT;
delete env.BROWSER_GPU_WS_ENDPOINT;
for (const name of [
  "BROWSER_GPU_RENDERER",
  "BROWSER_GPU_KIND",
  "BROWSER_GPU_REACHED",
  "BROWSER_WEBGPU_ADAPTER",
  "BROWSER_GPU_VERSION",
])
  delete env[name];
const chromium = chromiumSelection(args);
gpuSetting(env); // Validate before selecting a functional-only project.
if (!chromium && !env.BROWSER_GPU) env.BROWSER_GPU = "off";
const controller = new AbortController();
let child: ChildProcess | undefined;
let gpu: DiscoveredGpu | undefined;
let source: ReturnType<typeof guardBrowserSource> | undefined;
const root = resolve(import.meta.dirname, "../..");
const interrupt = () => {
  if (controller.signal.aborted) return;
  controller.abort(new Error("Browser tests interrupted"));
  process.exitCode = 1;
  if (child?.connected) child.send("interrupt", () => {});
};
process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);
process.on("SIGHUP", interrupt);
try {
  requiredApis(env); // Reject missing/unknown --api values before any browser starts.
  if (!help && !args.includes("--list")) {
    source = guardBrowserSource(root);
    // CI's release workflow tests and packages the same producer build. Local
    // application tests build fresh; deployed URLs keep their distinct identity.
    if (!env.BROWSER_TEST_BASE_URL && env.CI !== "true" && env.CI !== "1") {
      const build = spawnSync(
        process.execPath,
        [resolve(root, "node_modules/vite/bin/vite.js"), "build"],
        { cwd: root, stdio: "inherit" },
      );
      if (build.error !== undefined || build.status !== 0)
        throw new Error("Browser build failed; no tests were started.");
      source.assertStable();
      if (!source.dirty) env.BROWSER_TEST_BUILD_COMMIT = source.commit;
    }
  }
  if (gpuSetting(env) === "required" && !args.includes("--list") && !help) {
    if (
      !chromium ||
      (env.BROWSER_GPU === "required" &&
        selectedProjects(args).some(
          (project) => project !== "chromium" && project !== "mobile-chrome",
        ))
    )
      throw new Error(
        "Hardware verification for this engine is not implemented. Run its own hardware acceptance; BROWSER_GPU=required cannot be satisfied by a Chromium probe.",
      );
    gpu = await discoverGpu(env, controller.signal);
    env.BROWSER_GPU_PROFILE = writeProfile(gpu.profile);
    env.BROWSER_GPU_REPORT = gpu.report;
    env.BROWSER_GPU_WS_ENDPOINT = gpu.wsEndpoint;
    env.BROWSER_GPU_RENDERER =
      gpu.results.find((result) => result.api !== "webgpu")?.identity ??
      gpu.results[0]?.identity ??
      "unknown";
    env.BROWSER_GPU_KIND = "hardware";
    env.BROWSER_GPU_REACHED =
      gpu.profile.display === undefined ? "headless" : `virtual display ${gpu.profile.display}`;
    env.BROWSER_GPU_VERSION = gpu.version;
    const adapter = gpu.results.find((result) => result.api === "webgpu")?.identity;
    if (adapter !== null && adapter !== undefined) env.BROWSER_WEBGPU_ADAPTER = adapter;
  }
  controller.signal.throwIfAborted();
  child = fork(new URL("./browser-test-cli.ts", import.meta.url), ["test", ...args], {
    env,
    execArgv: [],
    stdio: ["inherit", "inherit", "inherit", "ipc"],
  });
  process.exitCode = await new Promise<number>((accept, reject) => {
    child?.once("error", reject);
    child?.once("exit", (code) => accept(controller.signal.aborted ? 1 : (code ?? 1)));
  });
  source?.assertStable();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
  const evidence = resolve(root, EVIDENCE_FILE);
  try {
    // Open directly and retain the descriptor across read/write: a pathname
    // replacement must not redirect invalidation to a different file.
    const descriptor = openSync(evidence, "r+");
    try {
      const record = invalidateRun(readFileSync(descriptor, "utf8"), runId);
      writeSync(descriptor, record, 0, "utf8");
      ftruncateSync(descriptor, Buffer.byteLength(record));
    } finally {
      closeSync(descriptor);
    }
  } catch (recordError) {
    if (!(recordError instanceof Error && "code" in recordError && recordError.code === "ENOENT"))
      console.error(`Could not invalidate browser evidence: ${String(recordError)}`);
  }
} finally {
  source?.close();
  try {
    await gpu?.close();
  } catch (error) {
    console.error(String(error));
    process.exitCode = 1;
  }
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", interrupt);
  process.off("SIGHUP", interrupt);
}
