import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/** Shared by this repository's checkouts, isolated from other projects and host platforms. */
export function playwrightBrowsersPath(
  env: Readonly<Record<string, string | undefined>> = process.env,
  cwd = process.cwd(),
  platform: string = process.platform,
  arch: string = process.arch,
): string {
  if (env.PLAYWRIGHT_BROWSERS_PATH) return env.PLAYWRIGHT_BROWSERS_PATH;
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd,
    env: Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith("GIT_"))),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  return resolve(common, "playwright-browsers", `${platform}-${arch}`);
}

/** Use the installed CLI's own plan rather than hard-coding browser revisions or OS paths. */
export function browserInstallLocations(plan: string): string[] {
  const locations = [...plan.matchAll(/^\s*Install location:\s*(.+)$/gmu)].map(
    (match) => match[1]?.trim() ?? "",
  );
  if (locations.length === 0 || locations.includes(""))
    throw new Error("Playwright did not report browser install locations.");
  return locations;
}

export function missingBrowserMessage(cache: string, missing: readonly string[]): string {
  return [
    `Playwright browser cache checked: ${cache}`,
    `Missing browser builds: ${missing.join(", ")}.`,
    "A Playwright update may require new builds, or another install may have removed them from a shared cache.",
    "Run pnpm test:browser:install (add firefox webkit to install those engines too).",
  ].join("\n");
}
