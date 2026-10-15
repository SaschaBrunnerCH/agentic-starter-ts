import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import * as json from "./json-shape.ts";

// The proof a bug fix owes, from engineering/agents/task-lifecycle.md: its regression test
// fails on the revision before the fix. `pnpm task ready` runs the new or changed unit tests
// against the base revision and needs at least one failing assertion there.

/** Unit tests among the changed files: test files outside e2e/, which holds browser tests. */
export function unitTestFiles(changed: readonly string[]): string[] {
  return changed.filter((file) => /\.test\.tsx?$/u.test(file) && !file.startsWith("e2e/"));
}

/** Browser tests among the changed files. */
export function browserTestFiles(changed: readonly string[]): string[] {
  return changed.filter((file) => file.startsWith("e2e/") && /\.(spec|test)\.tsx?$/u.test(file));
}

const reportShape = json.object({
  testResults: json.array(
    json.object({
      name: json.string,
      status: json.string,
      message: json.optional(json.string),
      assertionResults: json.array(json.object({ fullName: json.string, status: json.string })),
    }),
  ),
});

export type BaseRun = { failed: string[]; notLoaded: string[] };

/** What Vitest's JSON report of the run on the base revision says. */
export function readBaseRun(text: string): BaseRun {
  const report = json.parseJson(text, reportShape, "the Vitest report");
  return {
    failed: report.testResults.flatMap((file) =>
      file.assertionResults.filter((test) => test.status === "failed").map((test) => test.fullName),
    ),
    // A file that fails without running a test usually imports what only the fix adds.
    notLoaded: report.testResults
      .filter((file) => file.status === "failed" && file.assertionResults.length === 0)
      .map((file) => file.name),
  };
}

export type ProofVerdict =
  | { kind: "proven"; failing: string[] }
  | { kind: "browser-control"; files: string[] }
  | { kind: "missing"; reason: string };

/**
 * Whether the fix is proven. A unit test that fails on the base revision proves it; one that
 * only fails to load there does not, because it would fail whatever the code did. Changed
 * browser tests are too slow to run twice here: the pull request names their control run.
 */
export function judge(
  units: readonly string[],
  browsers: readonly string[],
  base: BaseRun | undefined,
  bodyNamesControl: boolean,
): ProofVerdict {
  if (base !== undefined && base.failed.length > 0) return { kind: "proven", failing: base.failed };
  if (browsers.length > 0 && bodyNamesControl)
    return { kind: "browser-control", files: [...browsers] };
  if (units.length === 0) {
    return {
      kind: "missing",
      reason:
        browsers.length > 0
          ? 'a bug fix changes browser tests only; add a "Regression control" line to the pull request with the run that failed without the fix'
          : "a bug fix needs a new or changed unit test that fails without the fix",
    };
  }
  if (base !== undefined && base.notLoaded.length > 0) {
    return {
      kind: "missing",
      reason: `the changed tests only fail to load without the fix (${base.notLoaded.join(", ")}); add a test of the fixed behaviour that runs on the old code and fails there`,
    };
  }
  return {
    kind: "missing",
    reason: `the new or changed unit tests (${units.join(", ")}) pass without the fix, so they do not show the bug`,
  };
}

/** Whether the pull request text names a control run, as engineering/agents/task-lifecycle.md asks. */
export function namesControl(body: string): boolean {
  return /regression control/iu.test(body);
}

// Git sets GIT_DIR and related variables inside hooks; passed on, they would point the
// commands below at another repository than the one given.
function environment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
  );
}

function run(command: string, args: readonly string[], cwd: string) {
  return spawnSync(command, args, { cwd, encoding: "utf8", env: environment() });
}

/**
 * Runs the given unit tests, as they are at `head`, against the code of `base`: in a temporary
 * worktree of `root` at `base`, with the test files of `head` and the dependencies of `root`.
 */
export function runOnBase(
  root: string,
  base: string,
  head: string,
  tests: readonly string[],
): BaseRun {
  const scratch = mkdtempSync(join(tmpdir(), "regression-proof-"));
  const tree = join(scratch, "base");
  const added = run("git", ["worktree", "add", "--detach", "--quiet", tree, base], root);
  if (added.status !== 0) {
    rmSync(scratch, { recursive: true, force: true });
    throw new Error(`Could not check out ${base}: ${added.stderr}`);
  }
  try {
    symlinkSync(join(root, "node_modules"), join(tree, "node_modules"), "dir");
    for (const test of tests) {
      const content = run("git", ["show", `${head}:${test}`], root);
      if (content.status !== 0) throw new Error(`Could not read ${test} at ${head}.`);
      mkdirSync(dirname(join(tree, test)), { recursive: true });
      writeFileSync(join(tree, test), content.stdout);
    }
    const report = join(scratch, "report.json");
    run(
      join(tree, "node_modules", ".bin", "vitest"),
      ["run", "--coverage.enabled=false", "--reporter=json", `--outputFile=${report}`, ...tests],
      tree,
    );
    return readBaseRun(readFileSync(report, "utf8"));
  } finally {
    run("git", ["worktree", "remove", "--force", tree], root);
    rmSync(scratch, { recursive: true, force: true });
  }
}
