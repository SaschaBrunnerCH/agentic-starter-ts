import { describe, expect, it } from "vitest";
import {
  count,
  evidenceFor,
  evidenceMarkdown,
  evidenceMarker,
  readRuns,
  withRun,
  type BrowserRun,
} from "./browser-evidence.ts";

const head = "a".repeat(40);
const other = "b".repeat(40);

function run(overrides: Partial<BrowserRun> = {}): BrowserRun {
  return {
    commit: head,
    dirty: false,
    finishedAt: "2026-10-15T12:00:00.000Z",
    status: "passed",
    gpu: "required",
    renderer: "ANGLE (Intel, Vulkan 1.4 (Intel(R) UHD Graphics 630))",
    rendererKind: "hardware",
    display: "headless",
    remote: false,
    platform: "linux x64",
    projects: { chromium: { passed: 3, failed: 0, skipped: 1, flaky: 0 } },
    ...overrides,
  };
}

describe("the evidence file", () => {
  it("reads back what it wrote, and nothing from a missing or empty file", () => {
    expect(readRuns(undefined)).toEqual([]);
    expect(readRuns("")).toEqual([]);
    expect(readRuns(withRun([], run()))).toEqual([run()]);
  });

  it("keeps the newest 20 runs", () => {
    let text = "";
    for (let index = 0; index < 25; index += 1) {
      text = withRun(readRuns(text), run({ finishedAt: String(index) }));
    }
    const runs = readRuns(text);
    expect(runs).toHaveLength(20);
    expect(runs.at(0)?.finishedAt).toBe("5");
    expect(runs.at(-1)?.finishedAt).toBe("24");
  });

  it("refuses a file of another shape, naming the field", () => {
    expect(() => readRuns('{"runs":[{"commit":1}]}')).toThrow(/commit/u);
  });
});

describe("count", () => {
  it("counts outcomes per project", () => {
    let counts = count({}, "chromium", "expected");
    counts = count(counts, "chromium", "unexpected");
    counts = count(counts, "chromium", "skipped");
    counts = count(counts, "mobile-chrome", "flaky");
    expect(counts).toEqual({
      chromium: { passed: 1, failed: 1, skipped: 1, flaky: 0 },
      "mobile-chrome": { passed: 0, failed: 0, skipped: 0, flaky: 1 },
    });
  });
});

describe("evidenceFor", () => {
  it("finds the newest clean run on the head commit", () => {
    const runs = [run({ finishedAt: "1" }), run({ finishedAt: "2" }), run({ commit: other })];
    expect(evidenceFor(runs, head)).toEqual({ kind: "found", run: run({ finishedAt: "2" }) });
  });

  it("does not count a run that started with uncommitted changes", () => {
    expect(evidenceFor([run({ dirty: true })], head).kind).toBe("dirty");
  });

  it("says when the latest run is for another commit, or when there is none", () => {
    expect(evidenceFor([run({ commit: other })], head).kind).toBe("other-commit");
    expect(evidenceFor([], head)).toEqual({ kind: "none" });
  });
});

describe("evidenceMarkdown", () => {
  it("names the commit, the renderer and the counts, with a marker per commit", () => {
    const text = evidenceMarkdown(run());
    expect(text.startsWith(evidenceMarker(head))).toBe(true);
    expect(text).toContain("on `aaaaaaa`, linux x64");
    expect(text).toContain("UHD Graphics 630)) (hardware, headless)");
    expect(text).toContain("| chromium | 3 | 0 | 1 | 0 |");
  });

  it("says when the renderer was not checked", () => {
    const text = evidenceMarkdown(
      run({ gpu: "off", renderer: null, rendererKind: null, display: null, remote: true }),
    );
    expect(text).toContain(
      "Renderer (Chromium's GPU check): not checked (BROWSER_GPU=off, remote browser).",
    );
  });

  it("names the application tested: the local build, or a deployment", () => {
    expect(evidenceMarkdown(run())).toContain(
      "Application: the commit's production build, served locally.",
    );
    expect(evidenceMarkdown(run({ target: "https://example.com/app/" }))).toContain(
      "Application: https://example.com/app/, a deployment that need not be this commit.",
    );
  });
});

describe("the WebGPU adapter in the evidence", () => {
  it("is shown when the run checked it, and left out otherwise", () => {
    const text = evidenceMarkdown(run({ webgpuAdapter: "intel gen-9 Intel(R) UHD Graphics 630" }));
    expect(text).toContain("WebGPU adapter: intel gen-9 Intel(R) UHD Graphics 630.");
    expect(evidenceMarkdown(run())).not.toContain("WebGPU");
    expect(readRuns(withRun([], run({ webgpuAdapter: "x" })))[0]?.webgpuAdapter).toBe("x");
  });
});
