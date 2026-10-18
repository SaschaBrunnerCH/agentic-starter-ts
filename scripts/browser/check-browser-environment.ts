import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import {
  browserInstallLocations,
  missingBrowserMessage,
  playwrightBrowsersPath,
} from "./playwright-browsers-path.ts";
import { scriptArguments } from "../shared/script-arguments.ts";

const requested = scriptArguments();
const cache = playwrightBrowsersPath();
const plan = spawnSync(
  process.execPath,
  [
    createRequire(import.meta.url).resolve("@playwright/test/cli"),
    "install",
    "--dry-run",
    ...(requested.length === 0 ? ["chromium"] : requested),
  ],
  { encoding: "utf8", env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: cache } },
);
if (plan.error !== undefined || plan.status !== 0) {
  console.error(`Playwright browser cache checked: ${cache}`);
  console.error(plan.error?.message ?? plan.stderr);
  process.exitCode = 1;
} else {
  const locations = browserInstallLocations(plan.stdout);
  const missing = locations.filter((path) => !existsSync(path));
  if (missing.length > 0) {
    console.error(missingBrowserMessage(cache, missing));
    process.exitCode = 1;
  } else {
    console.log(`Playwright browser cache checked: ${cache}`);
    for (const path of locations) console.log(`Found browser build: ${path}`);
    console.log(
      "Build directories found; browser launch and system libraries are checked by browser tests.",
    );
  }
}
