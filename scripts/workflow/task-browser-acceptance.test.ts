import { describe, expect, it } from "vitest";
import type { BrowserRun } from "../browser/browser-evidence.ts";
import { browserAcceptance } from "./task-browser-acceptance.ts";

const head = "a".repeat(40);
const run = (changes: Partial<BrowserRun> = {}): BrowserRun => ({
  commit: head,
  dirty: false,
  sourceStable: true,
  buildCommit: head,
  complete: true,
  finishedAt: "2026-11-03T12:00:00.000Z",
  status: "passed",
  gpu: "required",
  renderer: "NVIDIA GPU",
  rendererKind: "hardware",
  display: "headless",
  remote: false,
  platform: "linux x64",
  projects: { chromium: { passed: 23, failed: 0, skipped: 0, flaky: 0 } },
  ...changes,
});

describe("browser applicability from the complete PR diff", () => {
  it.each([
    ["README.md", "engineering/agents/browser-testing.md"],
    ["engineering/diagrams/workflow.svg", "engineering/diagrams/workflow.excalidraw", "LICENSE"],
    ["scripts/workflow/issue.ts", "scripts/workflow/issue.test.ts", "README.md"],
    ["scripts/git/pre-push.ts", "scripts/git/git-hooks.test.ts"],
  ])("exempts documentation and unrelated issue/Git tooling: %j", (...files) => {
    expect(browserAcceptance(files, [], head)).toMatchObject({ ok: true, required: false });
    expect(browserAcceptance(files, [], head).message).toContain("exempt");
  });

  it.each([
    "src/App.tsx",
    "src/app.css",
    "src/help.md",
    "public/icon.svg",
    "index.html",
    "e2e/graphics.spec.ts",
    "scripts/browser/browser-test.ts",
    "scripts/shared/json-shape.ts",
    "scripts/workflow/task.ts",
    "playwright.config.ts",
    "vite.config.ts",
    "tsconfig.base.json",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    ".node-version",
    "unknown-tool.ts",
  ])("requires browser acceptance for %s, even alongside documentation", (file) => {
    expect(browserAcceptance(["README.md", file], [], head)).toMatchObject({
      ok: false,
      required: true,
    });
  });

  it("does not infer an exemption from an empty/unavailable diff", () => {
    expect(browserAcceptance([], [], head)).toMatchObject({ ok: false, required: true });
  });
});

describe("current-head browser eligibility", () => {
  it("accepts a complete passing local Chromium build with verified hardware", () => {
    expect(browserAcceptance(["src/App.tsx"], [run()], head)).toMatchObject({
      ok: true,
      required: true,
    });
  });

  it.each<[string, BrowserRun[]]>([
    ["missing", []],
    ["stale commit", [run({ commit: "b".repeat(40) })]],
    ["dirty", [run({ dirty: true })]],
    ["unverified source", [run({ sourceStable: undefined })]],
    ["changed source", [run({ sourceStable: false })]],
    ["unverified build", [run({ buildCommit: undefined })]],
    ["wrong build", [run({ buildCommit: "b".repeat(40) })]],
    ["failed", [run({ status: "failed" })]],
    ["interrupted", [run({ status: "interrupted" })]],
    ["filtered/incomplete", [run({ complete: false })]],
    ["legacy completeness", [run({ complete: undefined })]],
    ["deployment target", [run({ target: "https://example.test/app/" })]],
    ["remote", [run({ remote: true })]],
    ["hardware disabled", [run({ gpu: "off" })]],
    ["software renderer", [run({ rendererKind: "software" })]],
    ["missing renderer", [run({ renderer: null })]],
    ["misclassified software", [run({ renderer: "SwiftShader" })]],
    ["invalid time", [run({ finishedAt: "not-a-time" })]],
    [
      "invalid counts",
      [run({ projects: { chromium: { passed: 0.5, failed: 0, skipped: 0, flaky: 0 } } })],
    ],
    ["no Chromium", [run({ projects: {} })]],
    ...["passed", "failed", "skipped", "flaky"].map((key): [string, BrowserRun[]] => [
      `invalid ${key} count`,
      [
        run({
          projects: {
            chromium: {
              passed: 23,
              failed: 0,
              skipped: 0,
              flaky: 0,
              [key]: key === "passed" ? 0 : 1,
            },
          },
        }),
      ],
    ]),
  ])("rejects %s evidence", (_name, runs) => {
    expect(browserAcceptance(["src/App.tsx"], runs, head)).toMatchObject({
      ok: false,
      required: true,
    });
  });

  it.each([
    { status: "failed" },
    { dirty: true },
    { complete: false },
    { target: "https://example.test/" },
  ])("never falls back to an older pass after a newer unsuitable run: %j", (changes) => {
    expect(browserAcceptance(["src/App.tsx"], [run(), run(changes)], head).ok).toBe(false);
  });
});
