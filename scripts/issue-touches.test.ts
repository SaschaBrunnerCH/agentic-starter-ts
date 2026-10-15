import { describe, expect, it } from "vitest";
import { overlaps, patternsOverlap, touchesOf } from "./issue-touches.ts";

describe("touchesOf", () => {
  it("reads the patterns of the section, with or without backticks and comments", () => {
    const body = [
      "## Problem",
      "",
      "- not/this.ts",
      "",
      "## Touches",
      "",
      "- `scripts/browser-gpu*.ts` — the GPU setup",
      "- ./engineering/agents/browser-testing.md",
      "",
      "## Done when",
      "",
      "- [ ] a test",
    ].join("\n");
    expect(touchesOf(body)).toEqual([
      "scripts/browser-gpu*.ts",
      "engineering/agents/browser-testing.md",
    ]);
  });

  it("skips the issue template's placeholder", () => {
    expect(touchesOf("## Touches\n\n- <!-- src/example/** -->\n\n## Done when\n")).toEqual([]);
  });

  it("finds none without the section", () => {
    expect(touchesOf("## Problem\n\n- src/a.ts\n")).toEqual([]);
  });
});

describe("patternsOverlap", () => {
  it.each([
    ["src/a.ts", "src/a.ts", true],
    ["src/a.ts", "src/b.ts", false],
    ["src", "src/a.ts", true],
    ["src/", "src/a.ts", true],
    ["src/**", "src/deep/a.ts", true],
    ["scripts/*.ts", "scripts/task.ts", true],
    ["scripts/*.ts", "src/main.ts", false],
    ["scripts/browser-gpu*.ts", "scripts/browser-gpu-setup.ts", true],
    ["scripts/browser-gpu*.ts", "scripts/browser-evidence.ts", false],
    ["scripts/browser-gpu*.ts", "scripts/task.ts", false],
    ["e2e/**", "src/**", false],
    ["**/*.md", "engineering/a.md", true],
    ["@(src|scripts)/**", "scripts/**", true],
    ["src/!(main).ts", "src/a.ts", true],
  ])("%s and %s: %s", (a, b, expected) => {
    expect(patternsOverlap(a, b)).toBe(expected);
    expect(patternsOverlap(b, a)).toBe(expected);
  });
});

describe("overlaps", () => {
  it("names each overlapping pair once", () => {
    expect(
      overlaps(
        ["scripts/browser-gpu*.ts", "README.md"],
        ["scripts/browser-gpu-setup.ts", "src/**"],
      ),
    ).toEqual(["scripts/browser-gpu*.ts ~ scripts/browser-gpu-setup.ts"]);
    expect(overlaps(["a.ts"], ["a.ts"])).toEqual(["a.ts"]);
    expect(overlaps([], ["a.ts"])).toEqual([]);
  });
});
