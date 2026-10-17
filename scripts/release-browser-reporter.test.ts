import type { FullResult, TestResult } from "@playwright/test/reporter";
import { afterEach, describe, expect, it, vi } from "vitest";
import ReleaseBrowserReporter from "./release-browser-reporter.ts";

afterEach(() => vi.restoreAllMocks());

function finish(
  statuses: readonly (readonly TestResult["status"][])[],
  status: FullResult["status"] = "passed",
) {
  const reporter = new ReleaseBrowserReporter();
  reporter.onBegin(undefined, {
    allTests: () =>
      statuses.map((results) => ({ results: results.map((value) => ({ status: value })) })),
  });
  return reporter.onEnd({ status });
}

describe("release browser verification", () => {
  it("accepts a complete passing suite", async () => {
    expect(await finish([["passed"], ["passed"]])).toBeUndefined();
  });

  it("rejects empty, skipped, unrun, failed and retried tests even if the runner says passed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const statuses of [
      [],
      [[]],
      [["skipped"]],
      [["failed"]],
      [["timedOut"]],
      [["interrupted"]],
      [["failed", "passed"]],
      [["passed"], ["skipped"]],
    ] satisfies TestResult["status"][][][]) {
      expect(await finish(statuses)).toEqual({ status: "failed" });
    }
  });

  it("does not promote a failed, timed out or interrupted run when its tests passed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const status of ["failed", "timedout", "interrupted"] satisfies FullResult["status"][]) {
      expect(await finish([["passed"]], status)).toEqual({ status: "failed" });
    }
  });
});
