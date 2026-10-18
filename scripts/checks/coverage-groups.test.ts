import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { coverageThresholds } from "./coverage-thresholds.ts";

const root = resolve(import.meta.dirname, "../..");

// Run only one tiny fixture test, never this repository's suite. Each negative
// control first passes with global-only floors using identical source and tests.
it.each(["src", "scripts"])(
  "rejects masked undercoverage in %s",
  { timeout: 30_000 },
  (lowGroup) => {
    const fixture = mkdtempSync(join(tmpdir(), "coverage-groups-"));
    try {
      symlinkSync(join(root, "node_modules"), join(fixture, "node_modules"), "dir");
      for (const group of ["src", "scripts"]) {
        mkdirSync(join(fixture, group));
        const names =
          group === lowGroup
            ? ["used", "missed"]
            : Array.from({ length: 40 }, (_, index) => `f${index}`);
        writeFileSync(
          join(fixture, group, "sample.ts"),
          names
            .map((name) => `export function ${name}(value: number) {\n  return value ? 1 : 0;\n}`)
            .join("\n"),
        );
      }
      const test = (coverAll: boolean) => {
        writeFileSync(
          join(fixture, "fixture.test.ts"),
          `import { test, expect } from "vitest";\nimport * as app from "./src/sample.ts";\nimport * as tools from "./scripts/sample.ts";\ntest("exercise the selected functions", () => {\nfor (const group of [app, tools]) for (const [name, fn] of Object.entries(group)) {\nif (${coverAll ? "false" : 'name === "missed"'}) continue;\nexpect(fn(0)).toBe(0); expect(fn(1)).toBe(1);\n}\n});\n`,
        );
      };
      const run = (thresholds: object) => {
        const config = join(fixture, "vitest.config.mjs");
        writeFileSync(
          config,
          `export default ${JSON.stringify({ test: { include: ["fixture.test.ts"], maxWorkers: 1, coverage: { enabled: true, provider: "v8", include: ["src/**/*.ts", "scripts/**/*.ts"], reporter: ["text-summary"], thresholds } } })};\n`,
        );
        return spawnSync(
          process.execPath,
          [join(root, "node_modules/vitest/vitest.mjs"), "run", "--config", config],
          { cwd: fixture, encoding: "utf8", timeout: 15_000 },
        );
      };
      test(false);
      const { statements, branches, functions, lines } = coverageThresholds;
      const aggregate = run({ statements, branches, functions, lines });
      expect(aggregate.status, aggregate.stdout + aggregate.stderr).toBe(0);
      const grouped = run(coverageThresholds);
      expect(grouped.status, grouped.stdout + grouped.stderr).toBe(1);
      expect(grouped.stderr).toContain(`${lowGroup}/**`);
      expect(grouped.stderr).not.toContain(`"global"`);
      test(true);
      const covered = run(coverageThresholds);
      expect(covered.status, covered.stdout + covered.stderr).toBe(0);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  },
);
