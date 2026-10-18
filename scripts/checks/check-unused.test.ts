import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkUnused, knipEnvironments } from "./check-unused.ts";

describe("knipEnvironments", () => {
  it("runs once without CI and once with CI=true, keeping the rest", () => {
    const runs = knipEnvironments({ CI: "1", PATH: "/bin" });
    expect(runs).toEqual([
      { label: "without CI", environment: { PATH: "/bin" } },
      { label: "with CI=true", environment: { PATH: "/bin", CI: "true" } },
    ]);
  });
});

const made: string[] = [];
afterEach(() => {
  for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true });
});

// A project whose Playwright configuration registers a reporter only outside CI.
function fixture(reporter: string): string {
  const root = mkdtempSync(join(tmpdir(), "check-unused-"));
  made.push(root);
  mkdirSync(join(root, "e2e"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "fixture",
      private: true,
      type: "module",
      devDependencies: { "@playwright/test": "*", knip: "*" },
    }),
  );
  writeFileSync(
    join(root, "playwright.config.ts"),
    `import { defineConfig } from "@playwright/test";\nexport default defineConfig({ testDir: "e2e", reporter: ${reporter} });\n`,
  );
  writeFileSync(join(root, "local-reporter.ts"), "export default class LocalReporter {}\n");
  writeFileSync(
    join(root, "e2e/a.spec.ts"),
    'import { test } from "@playwright/test";\ntest("x", () => {});\n',
  );
  writeFileSync(join(root, "knip.json"), JSON.stringify({ project: ["**/*.ts"] }));
  symlinkSync(
    resolve(import.meta.dirname, "../../node_modules"),
    join(root, "node_modules"),
    "dir",
  );
  return root;
}

const knip = resolve(import.meta.dirname, "../../node_modules/.bin/knip");

describe("checkUnused", () => {
  it("finds a file that only a local run uses", { timeout: 60_000 }, () => {
    const root = fixture(
      'process.env.CI === "true" ? "list" : [["list"], ["./local-reporter.ts"]]',
    );
    expect(checkUnused(root, knip)).toEqual(["with CI=true"]);
  });

  it("passes when the file is used both ways", { timeout: 60_000 }, () => {
    const root = fixture('[["list"], ["./local-reporter.ts"]]');
    expect(checkUnused(root, knip)).toEqual([]);
  });
});
