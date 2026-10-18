import type { FullResult, Reporter, TestResult } from "@playwright/test/reporter";

type ReleaseTest = { results: readonly Pick<TestResult, "status">[] };

/** A release needs every discovered test to execute and pass once, without skips or retries. */
export default class ReleaseBrowserReporter implements Reporter {
  private tests: readonly ReleaseTest[] = [];

  onBegin(_config: unknown, suite: { allTests(): ReleaseTest[] }): void {
    this.tests = suite.allTests();
  }

  onEnd(result: Pick<FullResult, "status">): Promise<{ status: "failed" } | undefined> {
    if (
      result.status === "passed" &&
      this.tests.length > 0 &&
      this.tests.every((test) => test.results.length === 1 && test.results[0]?.status === "passed")
    ) {
      return Promise.resolve(undefined);
    }
    console.error("Release verification requires a nonempty suite with every test passing once.");
    return Promise.resolve({ status: "failed" });
  }
}
