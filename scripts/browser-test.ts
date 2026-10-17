// Resolve discovery before Playwright imports its configuration. Keep its lock and
// any private display until the owned test process exits, including on interruption.
import { fork, type ChildProcess } from "node:child_process";
import { gpuSetting } from "./browser-gpu.ts";
import {
  chromiumSelection,
  requiredApis,
  selectedProjects,
  writeProfile,
} from "./browser-gpu-profile.ts";
import { discoverGpu, type DiscoveredGpu } from "./browser-gpu-discovery.ts";
import { scriptArguments } from "./script-arguments.ts";

const requested: string[] = [];
const apis: string[] = [];
const input = scriptArguments();
for (let index = 0; index < input.length; index++) {
  const arg = input[index] ?? "";
  if (arg === "--api") apis.push(input[++index] ?? "");
  else if (arg.startsWith("--api=")) apis.push(arg.slice("--api=".length));
  else requested.push(arg);
}
const help = requested.includes("--help") || requested.includes("-h");
if (help) {
  console.log(`Test on this machine (Windows, WSL, Linux or macOS).
  pnpm build
  pnpm test:browser                         Chromium, verified local GPU
  pnpm test:browser --api webgl2             require this API; repeat --api to combine
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
if (apis.length > 0) env.BROWSER_GPU_APIS = apis.join(",");
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
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
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
