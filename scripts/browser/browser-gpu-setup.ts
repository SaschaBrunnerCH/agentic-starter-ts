// Guard direct invocation; discovery must finish before worker configuration.
import { gpuSetting } from "./browser-gpu.ts";
import { readProfile } from "./browser-gpu-profile.ts";

export default function globalSetup(): void {
  process.env.BROWSER_GPU_SETTING = gpuSetting(process.env);
  if (gpuSetting(process.env) === "off") return;
  if (
    process.env.BROWSER_GPU_PROFILE === undefined ||
    process.env.BROWSER_GPU_REPORT === undefined ||
    process.env.BROWSER_GPU_WS_ENDPOINT === undefined
  ) {
    throw new Error(
      "Hardware tests require discovery before worker configuration. Use pnpm test:browser (or pnpm test:devices), not direct playwright test. See engineering/agents/browser-gpu-discovery.md.",
    );
  }
  readProfile(process.env.BROWSER_GPU_PROFILE);
}
