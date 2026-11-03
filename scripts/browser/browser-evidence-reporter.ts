import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { FullConfig, FullProject } from "@playwright/test";
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import {
  count,
  browserEvidenceFile,
  readBrowserRuns,
  withRun,
  type Counts,
} from "./browser-evidence.ts";
import { guardBrowserSource } from "./browser-source.ts";

const root = resolve(import.meta.dirname, "../..");
type CompletionConfig = Pick<
  FullConfig,
  "configFile" | "forbidOnly" | "grep" | "grepInvert" | "shard"
> & {
  filteredProjects: readonly Pick<
    FullProject,
    "name" | "repeatEach" | "retries" | "grep" | "grepInvert"
  >[];
};
const unfiltered = (grep: RegExp | RegExp[]) =>
  grep instanceof RegExp && grep.source === ".*" && grep.flags === "";

/**
 * Records each local browser run in the primary checkout’s task artifact folder: the commit, the renderer
 * the GPU check found (browser-test.ts leaves it in the environment) and the counts per
 * project. `pnpm task ready` puts the run for the head commit into the pull request.
 */
export default class BrowserEvidenceReporter implements Reporter {
  private readonly source =
    process.env.CI === "true" || process.env.CI === "1" || process.argv.includes("--list")
      ? undefined
      : guardBrowserSource(root);
  private counts: Record<string, Counts> = {};
  private expected = 0;
  private fullSuite = false;

  onBegin(config: CompletionConfig, suite: { allTests(): readonly unknown[] }): void {
    this.expected = suite.allTests().length;
    const project = config.filteredProjects[0];
    this.fullSuite =
      process.env.BROWSER_TEST_FULL_SUITE === "true" &&
      config.configFile === resolve(root, "playwright.config.ts") &&
      config.forbidOnly &&
      config.shard === null &&
      unfiltered(config.grep) &&
      config.grepInvert === null &&
      config.filteredProjects.length === 1 &&
      project?.name === "chromium" &&
      project.repeatEach === 1 &&
      project.retries === 0 &&
      unfiltered(project.grep) &&
      project.grepInvert === null;
  }

  onTestEnd(
    test: Pick<TestCase, "outcome" | "expectedStatus"> & {
      parent: { project(): { name: string } | undefined };
    },
    result: Pick<TestResult, "status">,
  ): void {
    const project = test.parent.project()?.name ?? "default";
    const outcome = test.outcome();
    this.counts = count(
      this.counts,
      project,
      outcome === "expected" && (result.status !== "passed" || test.expectedStatus !== "passed")
        ? "unexpected"
        : outcome,
    );
  }

  async onEnd(result: FullResult): Promise<void | { status: FullResult["status"] }> {
    // CI keeps its own results; discovery executes no tests and creates no acceptance record.
    if (this.source === undefined) return;
    let stable = true;
    try {
      this.source.assertStable();
    } catch {
      stable = false;
    } finally {
      this.source.close();
    }
    const file = browserEvidenceFile(root);
    const environment = process.env;
    const complete =
      this.fullSuite &&
      this.expected > 0 &&
      Object.values(this.counts).reduce((total, counts) => total + counts.passed, 0) ===
        this.expected &&
      Object.values(this.counts).every(
        (counts) => counts.failed === 0 && counts.skipped === 0 && counts.flaky === 0,
      );
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      withRun(readBrowserRuns(root), {
        ...(environment.BROWSER_TEST_RUN_ID === undefined
          ? {}
          : { id: environment.BROWSER_TEST_RUN_ID }),
        commit: this.source.commit,
        dirty: this.source.dirty || !stable,
        sourceStable: stable,
        ...(environment.BROWSER_TEST_BUILD_COMMIT === undefined
          ? {}
          : { buildCommit: environment.BROWSER_TEST_BUILD_COMMIT }),
        complete,
        finishedAt: new Date().toISOString(),
        status: stable ? result.status : "failed",
        gpu: environment.BROWSER_GPU_SETTING ?? "off",
        renderer: environment.BROWSER_GPU_RENDERER ?? null,
        rendererKind: environment.BROWSER_GPU_KIND ?? null,
        display: environment.BROWSER_GPU_REACHED ?? null,
        ...(environment.BROWSER_WEBGPU_ADAPTER === undefined
          ? {}
          : { webgpuAdapter: environment.BROWSER_WEBGPU_ADAPTER }),
        remote: environment.REMOTE_BROWSER_WS_ENDPOINT !== undefined,
        ...(environment.BROWSER_TEST_BASE_URL === undefined
          ? {}
          : { target: environment.BROWSER_TEST_BASE_URL }),
        ...(environment.BROWSER_GPU_PROFILE === undefined
          ? {}
          : { gpuProfile: environment.BROWSER_GPU_PROFILE }),
        ...(environment.BROWSER_GPU_REPORT === undefined
          ? {}
          : { gpuReport: environment.BROWSER_GPU_REPORT }),
        ...(environment.BROWSER_GPU_VERSION === undefined
          ? {}
          : { browserVersion: environment.BROWSER_GPU_VERSION }),
        platform: `${process.platform} ${process.arch}`,
        projects: this.counts,
      }),
    );
    if (!stable || (this.fullSuite && !complete)) return { status: "failed" };
  }
}
