import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

  it("counts a test that fails only on importing what the fix adds as not loaded", () => {
    const report = JSON.stringify({
      testResults: [
        {
          name: "/x/src/sum.test.ts",
          status: "failed",
          assertionResults: [
            {
              fullName: "sum imports the helper",
              status: "failed",
              failureMessages: [
                "Error: Cannot find module './helper.ts' imported from sum.test.ts",
              ],
            },
            {
              fullName: "sum adds",
              status: "failed",
              failureMessages: ["AssertionError: expected 3 to be 4"],
            },
          ],
        },
      ],
    });
    expect(readBaseRun(report)).toEqual({
      failed: ["sum adds"],
      notLoaded: ["sum imports the helper"],
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
    expect(namesControl("- Regression control: reverted src/a.ts, the test failed")).toBe(true);
  });

  it("does not take a mention or an empty line for a control run", () => {
    expect(namesControl("No regression control was run.")).toBe(false);
    expect(namesControl("Regression control:\n\n## Next")).toBe(false);
    expect(namesControl("**Regression control:**")).toBe(false);
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

function fixture(
  test: string,
  before = "export const sum = (a: number, b: number) => a - b;\n",
  after = "export const sum = (a: number, b: number) => a + b;\n",
  testFilename = "sum.test.ts",
): { root: string; base: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), "regression-fixture-"));
  made.push(root);
  git(root, "init", "-q", "-b", "main");
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, ".gitignore"), "node_modules\n");
  writeFileSync(join(root, "src/sum.ts"), before);
  if (testFilename.endsWith(".tsx")) {
    writeFileSync(
      join(root, "vite.config.mjs"),
      'export default { oxc: { jsx: { runtime: "classic", pragma: "element" } } };\n',
    );
  }
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "Add sum");
  const base = git(root, "rev-parse", "HEAD");
  writeFileSync(join(root, "src/sum.ts"), after);
  writeFileSync(join(root, "src", testFilename), test);
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "Fix sum");
  // Fixtures exercise tooling, independently of the replaceable application framework.
  mkdirSync(join(root, "node_modules"));
  for (const dependency of [".bin", "vitest"]) {
    symlinkSync(
      resolve(import.meta.dirname, "../../node_modules", dependency),
      join(root, "node_modules", dependency),
      "dir",
    );
  }
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

  it.each([
    ["named", 'import { newHelper } from "./sum";', "newHelper()"],
    ["quoted", 'import { "new-helper" as call } from "./sum";', "call()"],
    ["aliased", 'import { newHelper as call } from "./sum";', "call()"],
    ["default", 'import call from "./sum";', "call()"],
    ["namespace", 'import * as subject from "./sum";', "subject.newHelper()"],
    [
      "dynamic namespace",
      'import * as subject from "./sum"; const key = "newHelper";',
      "subject[key]()",
    ],
    ["nested namespace", 'import * as subject from "./sum";', "subject[subject.key]()"],
    ["computed namespace", 'import * as subject from "./sum";', 'subject["newHelper"]()'],
  ])(
    "refuses an absent %s export with real Vitest output",
    { timeout: 60_000 },
    (_name, imported, call) => {
      const before = 'export const existing = () => 1; export const key = "newHelper";\n';
      const { root, base, head } = fixture(
        `import { expect, it } from "vitest";\n${imported}\nit("new API works", () => expect(${call}).toBe(1));\n`,
        before,
        `${before}export const newHelper = () => 1;\nexport { newHelper as "new-helper" };\nexport default newHelper;\n`,
      );
      const run = runOnBase(root, base, head, ["src/sum.test.ts"]);
      expect(run.failed).toEqual([]);
      expect(run.notLoaded).toHaveLength(1);
      expect(judge(["src/sum.test.ts"], [], run, false).kind).toBe("missing");
    },
  );

  it.each([
    'export const sum = () => { throw new TypeError("broken implementation"); };',
    "export const sum = undefined;",
  ])(
    "retains legitimate TypeErrors for an API present on the base",
    { timeout: 60_000 },
    (before) => {
      const { root, base, head } = fixture(
        'import { expect, it } from "vitest";\nimport { sum } from "./sum";\nit("adds", () => expect(sum(2, 3)).toBe(5));\n',
        before,
      );
      const run = runOnBase(root, base, head, ["src/sum.test.ts"]);
      expect(run.failed).toEqual(["adds"]);
      expect(run.notLoaded).toEqual([]);
      expect(judge(["src/sum.test.ts"], [], run, false).kind).toBe("proven");
    },
  );

  it("ignores type-only imports while checking existing behavior", { timeout: 60_000 }, () => {
    const { root, base, head } = fixture(
      'import { expect, it } from "vitest";\nimport type { Future } from "./not-on-base";\nimport { type OtherFuture, sum as add } from "./sum";\nit("adds", () => expect(add(2, 3)).toBe(5));\n',
    );
    const run = runOnBase(root, base, head, ["src/sum.test.ts"]);
    expect(run.failed).toEqual(["adds"]);
    expect(judge(["src/sum.test.ts"], [], run, false).kind).toBe("proven");
  });

  it(
    "checks combined default/namespace imports without colliding with test bindings",
    { timeout: 60_000 },
    () => {
      const { root, base, head } = fixture(
        'import { expect, it } from "vitest";\nimport call, * as subject from "./sum";\nconst __regressionImport = 1;\nit("adds", () => expect([call(2, 3), subject.sum(2, 3), __regressionImport]).toEqual([5, 5, 1]));\n',
        "export const sum = (a: number, b: number) => a - b; export default sum;",
        "export const sum = (a: number, b: number) => a + b; export default sum;",
      );
      const run = runOnBase(root, base, head, ["src/sum.test.ts"]);
      expect(run.failed).toEqual(["adds"]);
      expect(run.notLoaded).toEqual([]);
    },
  );

  it("preserves namespace identity and method receivers", { timeout: 60_000 }, () => {
    const source =
      'import * as self from "./sum"; export function same() { return this === self; }';
    const { root, base, head } = fixture(
      'import { expect, it } from "vitest"; import * as subject from "./sum"; it("same namespace", () => expect(subject.same()).toBe(true));',
      source,
      source,
    );
    expect(runOnBase(root, base, head, ["src/sum.test.ts"])).toEqual({ failed: [], notLoaded: [] });
  });

  it(
    "preserves computed-key coercion, nested access, optional access and local shadowing",
    { timeout: 60_000 },
    () => {
      const source = 'export const key = "sum"; export const sum = () => 1;';
      const { root, base, head } = fixture(
        `import { expect, it } from "vitest"; import * as subject from "./sum";
       it("namespace behavior", () => {
         let conversions = 0;
         const key = { [Symbol.toPrimitive]() { conversions++; return "sum"; } };
         expect(subject[key]()).toBe(1);
         expect(conversions).toBe(1);
         expect(subject[subject.key]()).toBe(1);
         expect(subject?.sum()).toBe(1);
         const shadowed = (subject) => subject.inherited;
         expect(shadowed(Object.create({ inherited: 2 }))).toBe(2);
       });`,
        source,
        source,
      );
      expect(runOnBase(root, base, head, ["src/sum.test.ts"])).toEqual({
        failed: [],
        notLoaded: [],
      });
    },
  );

  it("checks imports in TSX regression tests", { timeout: 60_000 }, () => {
    const { root, base, head } = fixture(
      `import { it, expect } from "vitest";
       import { sum } from "./sum";
       function element(_tag: string, _props: unknown, child: number) {
         return { props: { children: child } };
       }
       it("adds", () => expect((<span>{sum(2, 3)}</span>).props.children).toBe(5));`,
      undefined,
      undefined,
      "sum.test.tsx",
    );
    expect(existsSync(join(root, "node_modules/react"))).toBe(false);
    expect(runOnBase(root, base, head, ["src/sum.test.tsx"])).toEqual({
      failed: ["adds"],
      notLoaded: [],
    });
    expect(runOnBase(root, head, head, ["src/sum.test.tsx"])).toEqual({
      failed: [],
      notLoaded: [],
    });
  });

  it("leaves side-effect/framework imports alone", { timeout: 60_000 }, () => {
    const { root, base, head } = fixture(
      'import { expect, it } from "vitest";\nimport "./sum";\nit("always passes", () => expect(1).toBe(1));\n',
    );
    expect(runOnBase(root, base, head, ["src/sum.test.ts"])).toEqual({ failed: [], notLoaded: [] });
  });

  it(
    "fails closed on unparseable imports and still removes the temporary checkout",
    { timeout: 60_000 },
    () => {
      const { root, base, head } = fixture('import { it } from "vitest"; it("invalid", () => }');
      expect(() => runOnBase(root, base, head, ["src/sum.test.ts"])).toThrow(
        "Cannot inspect regression imports",
      );
      expect(git(root, "worktree", "list").split("\n")).toHaveLength(1);
    },
  );

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
