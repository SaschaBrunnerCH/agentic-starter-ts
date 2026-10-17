// Guard direct Playwright invocation. Discovery must finish before config loads;
// this setup never changes options that workers may already have resolved.
import type { FullConfig } from "@playwright/test";
import { gpuSetting } from "./browser-gpu.ts";
import { readProfile } from "./browser-gpu-profile.ts";

export default function globalSetup(config: FullConfig): void {
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
  const profile = readProfile(process.env.BROWSER_GPU_PROFILE);
  const chromium = config.projects.filter(
    (project) => project.name === "chromium" || project.name === "mobile-chrome",
  );
  if (chromium.length === 0) throw new Error("No Chromium project uses the verified GPU profile.");
  // Identities/version come from the parent invocation; full per-API results are
  // retained with the report. This setup never relabels another engine as probed.
  if (profile.apis.length === 0) throw new Error("No API was verified.");
}
