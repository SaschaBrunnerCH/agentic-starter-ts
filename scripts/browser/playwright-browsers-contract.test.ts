import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import * as json from "../shared/json-shape.ts";

const root = resolve(import.meta.dirname, "../..");
const preload = "node --import ./scripts/browser/playwright-browsers-env.ts ";
const entries = [
  "test:browser",
  "test:browser:install",
  "test:devices",
  "browser:doctor",
  "browser:cli",
  "browser:check",
];
const scripts = json.parseJson(
  readFileSync(resolve(root, "package.json"), "utf8"),
  json.object({ scripts: json.record(json.string) }),
  "package.json",
).scripts;
const files = Object.fromEntries(
  ["scripts", ".github/workflows"].flatMap((directory) =>
    readdirSync(resolve(root, directory), { recursive: true, encoding: "utf8" })
      .map((name) => name.replaceAll("\\", "/"))
      .filter((name) => /\.(?:ts|yml)$/u.test(name) && !name.endsWith(".test.ts"))
      .map((name) => {
        const path = `${directory}/${name}`;
        return [path, readFileSync(resolve(root, path), "utf8")];
      }),
  ),
);

function problems(
  commands: Readonly<Record<string, string>>,
  sources: Readonly<Record<string, string>>,
): string[] {
  const found: string[] = [];
  for (const entry of entries) {
    const command = commands[entry];
    if (!command?.startsWith(preload)) found.push(`${entry}: missing cache preload`);
    if (
      command?.includes("scripts/workflow/heavy.ts") &&
      !command.split(" -- ")[1]?.startsWith(preload)
    )
      found.push(`${entry}: heavy child missing cache preload`);
  }
  for (const [name, command] of Object.entries(commands))
    if (
      /\bplaywright\s+(?:install(?!-deps)|test|show-trace|codegen|open|screenshot|pdf|run-server)\b/u.test(
        command,
      )
    )
      found.push(`${name}: direct Playwright CLI bypass`);
  for (const [path, source] of Object.entries(sources)) {
    if (path.startsWith(".github/")) {
      if (
        /\bplaywright\s+(?:install(?!-deps)|test|show-trace|codegen|open|screenshot|pdf|run-server)\b/u.test(
          source,
        )
      )
        found.push(`${path}: direct Playwright CLI bypass`);
      continue;
    }
    const runtime = source.replace(/^import type[^\n]*\n/gmu, "");
    if (!/["'](?:@playwright\/test|playwright(?:-core)?)(?:\/cli)?["']/u.test(runtime)) continue;
    // This library is reached by browser-test/doctor, both preloaded above. A new
    // standalone browser script must declare a preloaded package entrypoint.
    if (path === "scripts/browser/browser-gpu-discovery.ts") continue;
    const callers = Object.entries(commands).filter(([, command]) =>
      command.split(/\s+/u).includes(path),
    );
    if (callers.length === 0 || callers.some(([, command]) => !command.startsWith(preload)))
      found.push(`${path}: browser script without a preloaded entrypoint`);
  }
  return found;
}

it("preloads the shared cache for every supported browser command and workflow", () => {
  expect(problems(scripts, files)).toEqual([]);
});

it("finds an unpreloaded caller of the nested browser CLI on disk", () => {
  expect(
    problems({ ...scripts, unsafe: "node scripts/browser/browser-test-cli.ts" }, files),
  ).toContain("scripts/browser/browser-test-cli.ts: browser script without a preloaded entrypoint");
});

it("rejects a setup or test command that bypasses the helper", () => {
  expect(
    problems({ ...scripts, "test:browser:install": "playwright install chromium" }, files),
  ).toContain("test:browser:install: missing cache preload");
  expect(problems({ ...scripts, "test:browser": "playwright test" }, files)).toContain(
    "test:browser: direct Playwright CLI bypass",
  );
});

it("catches a new browser script without cache initialization", () => {
  const sources = {
    ...files,
    "scripts/browser/nested/new-browser.ts":
      'import { chromium } from "playwright"; await chromium.launch();',
  };
  expect(
    problems({ ...scripts, extra: "node scripts/browser/nested/new-browser.ts" }, sources),
  ).toContain(
    "scripts/browser/nested/new-browser.ts: browser script without a preloaded entrypoint",
  );
  expect(
    problems({ ...scripts, extra: `${preload}scripts/browser/nested/new-browser.ts` }, sources),
  ).toEqual([]);
});

it("rejects a new raw CLI workflow step", () => {
  expect(
    problems(scripts, { ...files, ".github/workflows/new.yml": "run: pnpm exec playwright test" }),
  ).toContain(".github/workflows/new.yml: direct Playwright CLI bypass");
});

it("checks the actual browser child behind the heavy runner", () => {
  const wrapped = preload + "scripts/workflow/heavy.ts run --label browser -- ";
  expect(
    problems(
      { ...scripts, "test:browser": wrapped + "node scripts/browser/browser-test.ts" },
      files,
    ),
  ).toContain("test:browser: heavy child missing cache preload");
  expect(
    problems(
      { ...scripts, "test:browser": wrapped + preload + "scripts/browser/browser-test.ts" },
      files,
    ),
  ).toEqual([]);
});
