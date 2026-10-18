import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("keeps expensive adoption acceptance outside the fixture's ordinary gate and test inventory", () => {
  const root = resolve(import.meta.dirname, "../..");
  const gate = readFileSync(resolve(root, "scripts/checks/run-local-checks.ts"), "utf8");
  expect(gate).not.toContain('"check:adoption"');
  expect(readFileSync(resolve(root, "package.json"), "utf8")).toContain(
    '"check:adoption": "node scripts/checks/check-adoption.ts"',
  );
  expect("scripts/checks/check-adoption.ts").not.toMatch(/\.test\.tsx?$/u);
});

it("rejects a recursive adoption invocation before Git, installs or fixtures", () => {
  const result = spawnSync(process.execPath, [resolve(import.meta.dirname, "check-adoption.ts")], {
    env: { ...process.env, STARTER_ADOPTION_FIXTURE: "true" },
    encoding: "utf8",
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Adoption fixtures cannot launch another adoption check");
});
