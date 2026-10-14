import { describe, expect, it } from "vitest";
import { guardrailRows, mechanismReferences, rowProblems } from "./agent-entry-points.ts";

const table = [
  "# Title",
  "",
  "## Guardrails",
  "",
  "| Rule | Mechanism | Status |",
  "| --- | --- | --- |",
  "| Keep source lint-clean. | `pnpm lint` runs before push. | Enforced |",
  "| Use domain terms. | Author and reviewer inspect names. | Review-only |",
  "",
  "## Next",
  "",
  "| Not | A | Guardrail |",
].join("\n");

const known = {
  scripts: new Set(["lint"]),
  pathExists: (path: string) => path === ".husky/commit-msg",
};

describe("guardrailRows", () => {
  it("reads only the rows under the Guardrails heading", () => {
    expect(guardrailRows(table).map((row) => row.status)).toEqual(["Enforced", "Review-only"]);
  });
});

describe("mechanismReferences", () => {
  it("separates scripts from paths and ignores other code", () => {
    expect(mechanismReferences("`pnpm lint`, `pnpm test`, `.husky/commit-msg` and `main`")).toEqual(
      { scripts: ["lint", "test"], paths: [".husky/commit-msg"] },
    );
  });

  it("reads the script of a command with arguments and skips pnpm's own commands", () => {
    expect(mechanismReferences("`pnpm task merge` after `pnpm install --frozen-lockfile`")).toEqual(
      {
        scripts: ["task"],
        paths: [],
      },
    );
  });
});

describe("rowProblems", () => {
  it("accepts a row whose mechanism exists", () => {
    expect(rowProblems(guardrailRows(table)[0]!, known)).toEqual([]);
  });

  it("rejects a missing script, a missing path and an unknown status", () => {
    const row = { rule: "r", mechanism: "`pnpm gone` and `scripts/gone.ts`", status: "Done" };
    expect(rowProblems(row, known)).toEqual([
      'unknown status "Done"',
      'names missing script "gone"',
      'names missing path "scripts/gone.ts"',
    ]);
  });

  it("rejects an enforced row that names nothing to run", () => {
    const row = { rule: "r", mechanism: "Everyone is careful.", status: "Enforced" };
    expect(rowProblems(row, known)).toEqual([
      "is Enforced but names no script, hook, workflow or ruleset",
    ]);
  });

  it("rejects an enforced row that names only a document", () => {
    const documents = { scripts: new Set<string>(), pathExists: () => true };
    const row = {
      rule: "r",
      mechanism: "See `README.md` and `engineering/x.md`.",
      status: "Mixed",
    };
    expect(rowProblems(row, documents)).toEqual([
      "is Mixed but names no script, hook, workflow or ruleset",
    ]);
  });
});
