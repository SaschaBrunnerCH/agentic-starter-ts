import { expect, test, type Page } from "@playwright/test";
import { classifyRenderer, gpuSetting } from "../scripts/browser/browser-gpu.ts";
import { requiredApis } from "../scripts/browser/browser-gpu-profile.ts";
import { assertPainted } from "./graphics-evidence.ts";

async function settled(page: Page) {
  for (const canvas of await page.locator("canvas").all()) {
    await expect(canvas).toHaveAttribute("data-state", /^(ready|unavailable)$/u);
  }
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("both native canvases paint the globe and flat map, with honest capability status", async ({
  page,
}) => {
  await page.goto("./");
  await settled(page);
  const required = gpuSetting(process.env) === "required";
  const requireWebgpu = requiredApis(process.env).includes("webgpu");
  for (const api of ["WebGL2", "WebGPU"]) {
    const panel = page.getByRole("region", { name: api, exact: true });
    const canvas = panel.locator("canvas");
    if ((await canvas.getAttribute("data-state")) === "ready") {
      const evidence = await assertPainted(canvas);
      if (required && (api === "WebGL2" || requireWebgpu)) {
        expect(classifyRenderer(evidence.renderer)).toBe("hardware");
        expect(evidence.fallback).toBe("false");
      }
    } else {
      expect(
        required && (api === "WebGL2" || requireWebgpu),
        `${api} hardware acceptance requires a rendered application frame`,
      ).toBe(false);
      await expect(panel.getByRole("status")).toContainText(/unavailable|adapter|disabled/iu);
    }
  }
  await expect(page.getByRole("link", { name: "WebGL2 report" })).toHaveAttribute(
    "href",
    "https://webglreport.com/?v=2",
  );
  await expect(page.getByRole("link", { name: "WebGPU report" })).toHaveAttribute(
    "href",
    "https://webgpureport.org",
  );
  await page.getByRole("button", { name: "Flat map", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume rotation" })).toBeDisabled();
  for (const canvas of await page.locator('canvas[data-state="ready"]').all()) {
    await expect(canvas).toHaveAttribute("data-projection", "map");
    await assertPainted(canvas);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  for (const canvas of await page.locator('canvas[data-state="ready"]').all())
    await assertPainted(canvas);
});

test("reduced motion starts paused, explicit rotation advances, pause and map stop it", async ({
  page,
}) => {
  await page.goto("./");
  await settled(page);
  const canvas = page.locator('canvas[data-state="ready"]').first();
  const frames = () => canvas.getAttribute("data-frames");
  const paused = await frames();
  await page.waitForTimeout(150);
  expect(await frames()).toBe(paused);
  await page.getByRole("button", { name: "Resume rotation" }).click();
  await expect.poll(frames).not.toBe(paused);
  await page.getByRole("button", { name: "Pause rotation" }).click();
  // Allow the single control-change/readback frame to finish before measuring.
  await page.waitForTimeout(150);
  const stopped = await frames();
  await page.waitForTimeout(150);
  expect(await frames()).toBe(stopped);
  await page.getByRole("button", { name: "Resume rotation" }).click();
  await page.getByRole("button", { name: "Flat map", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-projection", "map");
  const flat = await frames();
  await page.waitForTimeout(150);
  expect(await frames()).toBe(flat);
});

test("missing WebGPU leaves a readable explanation and the greeting usable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true });
  });
  await page.goto("./");
  await expect(
    page.getByRole("region", { name: "WebGPU", exact: true }).getByRole("status"),
  ).toContainText("WebGPU is unavailable");
  await page.getByLabel("Name").fill("Ada");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hello, Ada.");
});

test("hidden pages freeze frames and reduced motion prevents automatic resume", async ({
  page,
}) => {
  await page.goto("./");
  await settled(page);
  const canvas = page.locator('canvas[data-state="ready"]').first();
  await page.getByRole("button", { name: "Resume rotation" }).click();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(150);
  const hidden = await canvas.getAttribute("data-frames");
  await page.waitForTimeout(150);
  expect(await canvas.getAttribute("data-frames")).toBe(hidden);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("button", { name: "Pause rotation" })).toBeVisible();
  await expect.poll(() => canvas.getAttribute("data-frames")).not.toBe(hidden);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
      "change",
      () => {
        document.documentElement.dataset.motionPreferenceObserved = "true";
      },
      { once: true },
    );
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Wait for the actual preference-change listener before restoring visibility.
  await expect(page.locator("html")).toHaveAttribute("data-motion-preference-observed", "true");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("button", { name: "Resume rotation" })).toBeVisible();
});

test("a denied WebGPU adapter is reported without a pretend graphic", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", {
      value: { requestAdapter: () => Promise.resolve(null) },
      configurable: true,
    });
  });
  await page.goto("./");
  const panel = page.getByRole("region", { name: "WebGPU", exact: true });
  await expect(panel.getByRole("status")).toContainText("No WebGPU adapter");
  await expect(panel.locator("canvas")).toHaveAttribute("data-state", "unavailable");
  await expect(panel.locator("canvas")).not.toHaveAttribute("data-grid");
});

test("device initialization failure is readable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", {
      value: {
        requestAdapter: () =>
          Promise.resolve({
            requestDevice: () => Promise.reject(new Error("Device permission denied.")),
          }),
      },
      configurable: true,
    });
  });
  await page.goto("./");
  await expect(
    page.getByRole("region", { name: "WebGPU", exact: true }).getByRole("status"),
  ).toHaveText("Device permission denied.");
});

test("blank-frame control fails the same output assertions for both APIs", async ({ page }) => {
  await page.addInitScript(() => {
    WebGL2RenderingContext.prototype.drawArrays = () => undefined;
    if (typeof GPURenderPassEncoder !== "undefined")
      GPURenderPassEncoder.prototype.draw = () => undefined;
  });
  await page.goto("./");
  await settled(page);
  const gl = page.getByRole("region", { name: "WebGL2", exact: true });
  await expect(gl.getByRole("status")).toContainText("empty or incomplete frame");
  for (const canvas of await page.locator("canvas").all()) {
    await expect(assertPainted(canvas)).rejects.toThrow();
    expect(Number(await canvas.getAttribute("data-coast"))).toBe(0);
    // Even forged readiness/readback evidence cannot hide an empty painted image.
    await canvas.evaluate((element) => {
      if (element instanceof HTMLCanvasElement) {
        element.dataset.state = "ready";
        element.dataset.grid = "1000";
        element.dataset.coast = "1000";
      }
    });
    await expect(assertPainted(canvas)).rejects.toThrow(
      "Painted canvas must contain graticule ink",
    );
  }
});

test("a lost WebGL context stops its panel and preserves the other controls", async ({ page }) => {
  await page.goto("./");
  await settled(page);
  const canvas = page.getByRole("region", { name: "WebGL2", exact: true }).locator("canvas");
  await canvas.evaluate((element) => {
    if (element instanceof HTMLCanvasElement)
      element.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
  });
  await expect(
    page.getByRole("region", { name: "WebGL2", exact: true }).getByRole("status"),
  ).toContainText("context lost");
  await page.getByRole("button", { name: "Flat map", exact: true }).click();
  await expect(page.getByRole("button", { name: "Flat map", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
