import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import * as json from "../shared/json-shape.ts";

// Exercise the existing setup command on both sides of the fix. Dry-run neither
// downloads browsers nor changes system libraries or another project's cache.
it("installs browsers in the repository cache without requiring a shell override", () => {
  const root = resolve(import.meta.dirname, "../..");
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.startsWith("GIT_") && key !== "PLAYWRIGHT_BROWSERS_PATH",
    ),
  );
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: root,
    env,
    encoding: "utf8",
  }).trim();
  const cache = resolve(common, "playwright-browsers", `${process.platform}-${process.arch}`);
  const pkg = json.parseJson(
    readFileSync(resolve(root, "package.json"), "utf8"),
    json.object({ scripts: json.record(json.string) }),
    "package.json",
  );
  const command = pkg.scripts["test:browser:install"]?.split(/\s+/u);
  if (command === undefined) throw new Error("Missing browser setup command");
  const [program, ...args] = command;
  const entry =
    program === "playwright"
      ? [createRequire(import.meta.url).resolve("@playwright/test/cli"), ...args]
      : args;
  expect(["node", "playwright"]).toContain(program);
  // OS libraries are outside this cache regression; --with-deps dry-run can
  // fail on a machine with missing packages even though no download is needed.
  const result = spawnSync(
    process.execPath,
    [...entry.filter((arg) => arg !== "--with-deps"), "--dry-run"],
    {
      cwd: root,
      env,
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  const locations = [...result.stdout.matchAll(/^\s*Install location:\s*(.+)$/gmu)].map(
    (match) => match[1]?.trim() ?? "",
  );
  expect(locations.length).toBeGreaterThan(0);
  expect(locations.every((path) => path.startsWith(cache))).toBe(true);
});
