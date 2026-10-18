/// <reference types="node" />
// Optional example: build and start a preview first. Uses the existing GPU lease.
import "../../scripts/browser/playwright-browsers-env.ts";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { relative } from "node:path";
import { discoverGpu } from "../../scripts/browser/browser-gpu-discovery.ts";
import { assertPainted } from "../../e2e/graphics-evidence.ts";

const { chromium } = await import("@playwright/test");
const root = fileURLToPath(new URL("../../", import.meta.url));
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const dirty =
  execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim() !== "";
const viewport = { width: 1280, height: 1100 };
const controller = new AbortController();
const interrupt = () => controller.abort(new Error("Capture interrupted"));
process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);
let gpu;
let browser;
let context;
try {
  gpu = await discoverGpu(
    { ...process.env, BROWSER_GPU: "required", BROWSER_GPU_APIS: "webgl2,webgpu" },
    controller.signal,
  );
  browser = await chromium.connect(gpu.wsEndpoint);
  context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(process.argv[2] ?? "http://127.0.0.1:4173/");
  await page.getByRole("heading", { name: "Hello, agentic starter.", exact: true }).waitFor();
  const evidence = [];
  for (const api of ["WebGL2", "WebGPU"]) {
    const canvas = page.getByRole("region", { name: api, exact: true }).locator("canvas");
    await page.waitForFunction(
      (name) =>
        document.querySelector(`canvas[aria-label^="${name}"]`)?.getAttribute("data-state") ===
        "ready",
      api,
    );
    evidence.push({
      api,
      state: await canvas.getAttribute("data-state"),
      projection: await canvas.getAttribute("data-projection"),
      ...(await assertPainted(canvas)),
    });
  }
  await page.screenshot({
    path: fileURLToPath(new URL("starter-example.png", import.meta.url)),
    fullPage: true,
  });
  await writeFile(
    new URL("starter-example.json", import.meta.url),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        commit,
        workingTreeDirty: dirty,
        command: "node engineering/diagrams/capture-starter.mjs <preview-url>",
        target: "Production build served by a local Vite preview",
        browser: `Chromium ${browser.version()}`,
        driver: `${process.platform} ${process.arch}`,
        viewport,
        deviceScaleFactor: 1,
        state: "Initial greeting; both blueprint globes paused for reduced motion",
        graphics: evidence,
        discoveryReport: relative(root, gpu.report).replaceAll("\\", "/"),
        limits:
          "Application readback and compositor pixels checked. Driver OS recorded; WSL browser results are translated, not native Windows. No performance or cross-browser claim.",
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  try {
    await context?.close();
  } finally {
    try {
      await browser?.close();
    } finally {
      await gpu?.close();
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", interrupt);
    }
  }
}
