import { readFileSync } from "node:fs";
import { readProfile } from "./browser-gpu-profile.ts";
import { parseArgs } from "node:util";
import { discoverGpu } from "./browser-gpu-discovery.ts";
import { scriptArguments } from "../shared/script-arguments.ts";

const { values } = parseArgs({
  args: scriptArguments(),
  options: {
    api: { type: "string", multiple: true },
    help: { type: "boolean" },
    profile: { type: "string" },
    "webgpu-feature-level": { type: "string" },
  },
});
if (values.help) {
  console.log(
    `Usage: pnpm browser:doctor [--api webgl|webgl2|webgpu]... [--webgpu-feature-level core|compatibility] [--profile <file>]

Discover verified browser GPU access on this machine: Windows, WSL, Linux or macOS.
Default: WebGL. Repeat --api to require multiple APIs; --profile rechecks a saved choice.
WebGPU defaults to core. Compatibility is explicit and does not change application requests.
Uses installed Chrome, Chromium or Edge. Reports attempted backends, readback,
failures and next steps under the primary task artifact folder’s browser-gpu/
(primary .local/browser-gpu/ without a task). Installs no drivers or tools.

Run app tests: pnpm build, then pnpm test:browser [--api webgl2]
Other engines and device targets: pnpm test:devices --help
Phones/tablets: engineering/agents/browser-testing.md#real-phones-and-tablets
Setup and recovery: engineering/agents/browser-gpu-discovery.md`,
  );
} else {
  const controller = new AbortController();
  const interrupt = () => controller.abort(new Error("GPU discovery interrupted"));
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  process.on("SIGHUP", interrupt);
  try {
    if (
      values.profile !== undefined &&
      (values.api !== undefined ||
        values["webgpu-feature-level"] !== undefined ||
        process.env.BROWSER_GPU_EXECUTABLE ||
        process.env.BROWSER_WEBGPU_FEATURE_LEVEL !== undefined)
    )
      throw new Error(
        "Use --profile alone; it already selects the browser, APIs and feature level.",
      );
    const preferred =
      values.profile === undefined ? undefined : readProfile(readFileSync(values.profile, "utf8"));
    const gpu = await discoverGpu(
      {
        ...process.env,
        BROWSER_GPU: "required",
        ...(values.api === undefined ? {} : { BROWSER_GPU_APIS: values.api.join(",") }),
        ...(values["webgpu-feature-level"] === undefined
          ? {}
          : { BROWSER_WEBGPU_FEATURE_LEVEL: values["webgpu-feature-level"] }),
      },
      controller.signal,
      preferred,
    );
    try {
      console.log(
        `Verified ${gpu.version}: ${gpu.profile.apis.join(", ")}${gpu.profile.apis.includes("webgpu") ? ` (WebGPU ${gpu.profile.webgpuFeatureLevel ?? "core"})` : ""}.`,
      );
    } finally {
      await gpu.close();
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
    process.off("SIGHUP", interrupt);
  }
}
