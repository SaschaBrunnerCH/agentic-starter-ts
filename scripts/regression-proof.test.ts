import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  browserTestFiles,
  judge,
  namesControl,
  readBaseRun,
  runOnBase,
  unitTestFiles,
} from "./regression-proof.ts";

describe("choosing the tests", () => {
  const changed = [
    "src/sum.ts",
    "src/sum.test.ts",
    "scripts/task.test.ts",
    "src/App.test.tsx",
    "e2e/smoke.spec.ts",
  ];

  it("takes unit tests outside e2e/ and browser tests in it", () => {
    expect(unitTestFiles(changed)).toEqual([
      "src/sum.test.ts",
      "scripts/task.test.ts",
      "src/App.test.tsx",
    ]);
    expect(browserTestFiles(changed)).toEqual(["e2e/smoke.spec.ts"]);
  });
});

describe("readBaseRun", () => {
  it("names failing tests and files that did not load", () => {
    const report = JSON.stringify({
      testResults: [
        {
          name: "/x/src/sum.test.ts",
          status: "failed",
          assertionResults: [
            { fullName: "sum adds", status: "failed" },
            { fullName: "sum of none", status: "passed" },
          ],
        },
        {
          name: "/x/src/new.test.ts",
          status: "failed",
          message: "Cannot find module",
          assertionResults: [],
        },
      ],
    });
    expect(readBaseRun(report)).toEqual({
      failed: ["sum adds"],
      notLoaded: ["/x/src/new.test.ts"],
    });
  });
});

describe("judge", () => {
  it("accepts a test that fails without the fix", () => {
    expect(judge(["a.test.ts"], [], { failed: ["adds"], notLoaded: [] }, false)).toEqual({
      kind: "proven",
      failing: ["adds"],
    });
  });

  it("refuses tests that pass without the fix", () => {
    const verdict = judge(["a.test.ts"], [], { failed: [], notLoaded: [] }, false);
    expect(verdict.kind).toBe("missing");
  });

  it("refuses a test that only fails to load without the fix", () => {
    const verdict = judge(["a.test.ts"], [], { failed: [], notLoaded: ["a.test.ts"] }, false);
    expect(verdict.kind).toBe("missing");
    expect(verdict.kind === "missing" ? verdict.reason : "").toMatch(/fail to load/u);
  });

  it("refuses a fix without any changed test", () => {
    expect(judge([], [], undefined, false)).toMatchObject({ kind: "missing" });
  });

  it("accepts browser tests when the pull request names their control run", () => {
    expect(judge([], ["e2e/a.spec.ts"], undefined, true)).toEqual({
      kind: "browser-control",
      files: ["e2e/a.spec.ts"],
    });
    expect(judge([], ["e2e/a.spec.ts"], undefined, false).kind).toBe("missing");
    expect(namesControl("**Regression control:** with the old code the test fails.")).toBe(true);
  });
});

// Two fixture repositories with a bug in sum(): one fixed with a test that shows the bug, one
// "fixed" with a test that passes either way.
const made: string[] = [];
afterEach(() => {
  for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true });
});

const scratchEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
);
const git = (cwd: string, ...args: string[]) => {
  const result = spawnSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args],
    { cwd, encoding: "utf8", env: scratchEnvironment },
  );
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
};

function fixture(test: string): { root: string; base: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), "regression-fixture-"));
  made.push(root);
  git(root, "init", "-q", "-b", "main");
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, ".gitignore"), "node_modules\n");
  writeFileSync(join(root, "src/sum.ts"), "export const sum = (a: number, b: number) => a - b;\n");
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "Add sum");
  const base = git(root, "rev-parse", "HEAD");
  writeFileSync(join(root, "src/sum.ts"), "export const sum = (a: number, b: number) => a + b;\n");
  writeFileSync(join(root, "src/sum.test.ts"), test);
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "Fix sum");
  symlinkSync(resolve(import.meta.dirname, "../node_modules"), join(root, "node_modules"), "dir");
  return { root, base, head: git(root, "rev-parse", "HEAD") };
}

describe("runOnBase", () => {
  it("proves a fix whose test fails on the code before it", { timeout: 60_000 }, () => {
    const { root, base, head } = fixture(
      'import { expect, it } from "vitest";\nimport { sum } from "./sum";\nit("adds", () => expect(sum(2, 3)).toBe(5));\n',
    );
    const run = runOnBase(root, base, head, ["src/sum.test.ts"]);
    expect(run.failed).toEqual(["adds"]);
    expect(judge(["src/sum.test.ts"], [], run, false).kind).toBe("proven");
  });

  it("refuses a fix whose test passes on the code before it", { timeout: 60_000 }, () => {
    const { root, base, head } = fixture(
      'import { expect, it } from "vitest";\nimport { sum } from "./sum";\nit("returns a number", () => expect(typeof sum(2, 3)).toBe("number"));\n',
    );
    const run = runOnBase(root, base, head, ["src/sum.test.ts"]);
    expect(run.failed).toEqual([]);
    expect(judge(["src/sum.test.ts"], [], run, false).kind).toBe("missing");
    // The temporary worktree is gone again.
    expect(git(root, "worktree", "list").split("\n")).toHaveLength(1);
  });
});
