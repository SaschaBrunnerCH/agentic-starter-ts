import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  browserStepProblems,
  jobProblems,
  requiredStatusProblems,
  workflowJobs,
} from "./workflow-contract.ts";

const directory = resolve(import.meta.dirname, "../../.github/workflows");
const read = (name: string) => readFileSync(resolve(directory, name), "utf8");

// The required statuses of the main ruleset.
const ruleset: unknown = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../.github/rulesets/main-integrity.json"), "utf8"),
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

  it("verify the tagged release build completely before packaging or publishing it", () => {
    const release = workflowJobs(read("release.yml")).find((job) => job.id === "release");
    expect(release).toBeDefined();
    const source = release?.lines.join("\n") ?? "";
    const steps = source.split(/^ {6}- name: /mu).slice(1);
    const requiredSteps = [
      "Install dependencies",
      "Run all checks and build the release",
      "Install the browser",
      "Verify the release at the root",
      "Verify the release under a sub-path",
      "Package the build, its SBOM and checksums",
      "Publish the release",
    ];
    const positions = requiredSteps.map((name) =>
      steps.findIndex((step) => step.startsWith(`${name}\n`)),
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual(positions.toSorted((a, b) => a - b));
    // No intervening step may replace the tested output before it is archived.
    expect(positions[5]).toBe((positions[4] ?? -1) + 1);
    // Default step success semantics stop publication after any failed verification.
    for (const position of positions) {
      expect(steps[position]).not.toMatch(/^ {8}(?:if|continue-on-error):/mu);
    }
    expect(steps[positions[0] ?? -1]).toContain("pnpm install --frozen-lockfile");
    expect(steps[positions[1] ?? -1]).toContain("run: pnpm check:push");
    expect(steps[positions[2] ?? -1]).toContain("run: pnpm test:browser:install");
    for (const position of positions.slice(3, 5)) {
      expect(steps[position]).toContain(
        "pnpm test:browser --forbid-only --reporter=list,./scripts/release/release-browser-reporter.ts",
      );
    }
    expect(steps[positions[4] ?? -1]).toContain("BROWSER_TEST_BASE_URL=http://127.0.0.1:4180/app/");
    expect(steps[positions[5] ?? -1]).toContain("--directory dist .");
    expect(source).not.toMatch(/pnpm (?:run )?build|pnpm exec vite build|actions\/cache@/u);
    expect(source).not.toContain("BROWSER_TESTS_IN_CI");
  });

  it("keep browser acceptance out of the PR build", () => {
    const build = workflowJobs(read("pr-build.yml")).find((job) => job.id === "pr-build");
    expect(build).toBeDefined();
    expect(build === undefined ? [] : browserStepProblems(build)).toEqual([]);
    expect(read("pr-build.yml")).not.toMatch(/BROWSER_TESTS_IN_CI|browser-tests:/u);
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

  it.each([
    "pnpm test:browser",
    "pnpm test:browser:install",
    "pnpm browser:cli install chromium",
    "pnpm exec playwright test",
  ])("reject %s even behind the former CI switch", (command) => {
    const jobs = workflowJobs(
      [
        "jobs:",
        "  build:",
        "    steps:",
        "      - name: Test in a browser",
        "        if: vars.BROWSER_TESTS_IN_CI == 'true' || inputs.browser-tests == true",
        `        run: ${command}`,
        "      - name: Unit tests",
        "        run: pnpm test",
      ].join("\n"),
    );
    expect(jobs.flatMap(browserStepProblems)).toEqual([
      'step "Test in a browser" of job build runs browser acceptance in CI; run it locally on the GPU and report it on the PR',
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
