import { readFileSync } from "node:fs";
import { readProfile } from "./browser-gpu-profile.ts";
import { parseArgs } from "node:util";
import { discoverGpu } from "./browser-gpu-discovery.ts";
import { scriptArguments } from "./script-arguments.ts";

const { values } = parseArgs({
  args: scriptArguments(),
  options: {
    api: { type: "string", multiple: true },
    help: { type: "boolean" },
    profile: { type: "string" },
  },
});
if (values.help) {
  console.log(
    `Usage: pnpm browser:doctor [--api webgl|webgl2|webgpu]... [--profile <file>]

Discover verified browser GPU access on this machine: Windows, WSL, Linux or macOS.
Default: WebGL. Repeat --api to require multiple APIs; --profile rechecks a saved choice.
Uses installed Chrome, Chromium or Edge. Reports attempted backends, readback,
failures and next steps under .local/browser-gpu/. Installs no drivers or tools.

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
      (values.api !== undefined || process.env.BROWSER_GPU_EXECUTABLE)
    )
      throw new Error("Use --profile alone; it already selects the browser and APIs.");
    const preferred =
      values.profile === undefined ? undefined : readProfile(readFileSync(values.profile, "utf8"));
    const gpu = await discoverGpu(
      {
        ...process.env,
        BROWSER_GPU: "required",
        ...(values.api === undefined ? {} : { BROWSER_GPU_APIS: values.api.join(",") }),
      },
      controller.signal,
      preferred,
    );
    try {
      console.log(`Verified ${gpu.version}: ${gpu.profile.apis.join(", ")}.`);
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
