/// <reference types="node" />
// Optional example; start the freshly built app's preview before running this file.
import "../../scripts/playwright-browsers-env.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const { chromium } = await import("@playwright/test");
const root = fileURLToPath(new URL("../../", import.meta.url));
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const dirty =
  execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim() !== "";
const viewport = { width: 640, height: 240 };
const browser = await chromium.launch({ headless: true, args: ["--disable-gpu"] });
try {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.goto(process.argv[2] ?? "http://127.0.0.1:4173/");
  await page.getByRole("heading", { name: "Hello, agentic starter.", exact: true }).waitFor();
  await page.getByLabel("Name").fill("Ada");
  await page.getByRole("heading", { name: "Hello, Ada.", exact: true }).waitFor();
  assert.equal(await page.getByLabel("Name").inputValue(), "Ada");
  await page.screenshot({ path: fileURLToPath(new URL("starter-example.png", import.meta.url)) });
  await writeFile(
    new URL("starter-example.json", import.meta.url),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        commit,
        workingTreeDirty: dirty,
        command: "node engineering/diagrams/capture-starter.mjs <preview-url>",
        target: "Production build served by a local Vite preview",
        browser: `Playwright Chromium ${browser.version()}`,
        driver: `${process.platform} ${process.arch}`,
        viewport,
        deviceScaleFactor: 1,
        state: "Name filled with Ada; greeting and input asserted",
        gpu: "Disabled; no GPU or physical-device claim",
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
}
