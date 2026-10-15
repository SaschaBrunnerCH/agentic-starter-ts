import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  browserStepProblems,
  jobProblems,
  requiredStatusProblems,
  workflowJobs,
} from "./workflow-contract.ts";

const directory = resolve(import.meta.dirname, "../.github/workflows");
const read = (name: string) => readFileSync(resolve(directory, name), "utf8");

// The required statuses of the main ruleset.
const ruleset: unknown = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../.github/rulesets/main-integrity.json"), "utf8"),
);
const required = [...JSON.stringify(ruleset).matchAll(/"context":"([^"]+)"/gu)].map(
  (match) => match[1] ?? "",
);

describe("the workflows of this repository", () => {
  it("give every job a timeout, a checkout without credentials and a retention time", () => {
    for (const name of readdirSync(directory)) {
      const jobs = workflowJobs(read(name));
      expect(jobs.length, name).toBeGreaterThan(0);
      expect(jobs.flatMap(jobProblems), name).toEqual([]);
    }
  });

  it("make every job of the PR build a required status", () => {
    expect(required).toEqual(["PR build"]);
    expect(requiredStatusProblems(workflowJobs(read("pr-build.yml")), required)).toEqual([]);
  });

  it("run the same check list in the PR build as the pre-push hook", () => {
    const build = workflowJobs(read("pr-build.yml")).find((job) => job.id === "pr-build");
    expect(build?.lines).toContain("        run: pnpm check:push");
  });

  it("run the browser tests in the PR build only when the CI switch asks for them", () => {
    const build = workflowJobs(read("pr-build.yml")).find((job) => job.id === "pr-build");
    expect(build).toBeDefined();
    expect(build === undefined ? [] : browserStepProblems(build)).toEqual([]);
    // The steps exist: install, root and sub-path.
    expect(read("pr-build.yml").match(/pnpm test:browser/gu)).toHaveLength(3);
  });
});

// Negative controls: each rule rejects the violation it exists for.
describe("the rules", () => {
  it("notice a PR build job that is not a required status", () => {
    const added = `${read("pr-build.yml")}\n  extra:\n    name: Extra\n    timeout-minutes: 5\n`;
    expect(requiredStatusProblems(workflowJobs(added), required)).toEqual([
      "job extra is not a required status of the ruleset",
    ]);
  });

  it("notice a browser test step without the CI switch", () => {
    const jobs = workflowJobs(
      [
        "jobs:",
        "  build:",
        "    steps:",
        "      - name: Test in a browser",
        "        run: pnpm test:browser",
        "      - name: Unit tests",
        "        run: pnpm test",
      ].join("\n"),
    );
    expect(jobs.flatMap(browserStepProblems)).toEqual([
      'step "Test in a browser" of job build runs browser tests without the CI switch',
    ]);
  });

  it("notice a missing timeout, kept credentials and an unbounded artifact", () => {
    const jobs = workflowJobs(
      [
        "jobs:",
        "  build:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - name: Checkout",
        "        uses: actions/checkout@0000000000000000000000000000000000000000",
        "      - name: Keep",
        "        uses: actions/upload-artifact@0000000000000000000000000000000000000000",
        "        with:",
        "          path: dist",
      ].join("\n"),
    );
    expect(jobs.flatMap(jobProblems)).toEqual([
      "job build has no timeout-minutes",
      "job build checks out without persist-credentials: false",
      "job build uploads an artifact without retention-days",
    ]);
  });
});
